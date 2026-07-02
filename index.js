const { Boom } = require("@hapi/boom");
const qrcode = require("qrcode-terminal");
const http = require("http");
const fs = require("fs/promises");

let sockInstance = null;
let isWhatsappReady = false;
let makeWASocket;
let useMultiFileAuthState;
let DisconnectReason;
let fetchLatestBaileysVersion;
let reconnectTimeout = null;
let reconnectAttempts = 0;
let isConnecting = false;

async function loadBaileys() {
    const baileys = await import("@whiskeysockets/baileys");
    makeWASocket = baileys.default;
    useMultiFileAuthState = baileys.useMultiFileAuthState;
    DisconnectReason = baileys.DisconnectReason;
    fetchLatestBaileysVersion = baileys.fetchLatestBaileysVersion;
}

function sendJson(res, statusCode, payload) {
    res.writeHead(statusCode, { "Content-Type": "application/json" });
    res.end(JSON.stringify(payload));
}

function readJsonBody(req) {
    return new Promise((resolve, reject) => {
        let body = "";

        req.on("data", (chunk) => {
            body += chunk;
        });

        req.on("end", () => {
            try {
                resolve(JSON.parse(body || "{}"));
            } catch (error) {
                reject(new Error("JSON inválido no corpo da requisição"));
            }
        });

        req.on("error", reject);
    });
}

function normalizeNumberToJid(number) {
    const value = String(number || "").trim();
    if (!value) {
        return null;
    }

    // Se já veio um JID válido (grupo/contato/lid), mantém como está.
    if (value.includes("@")) {
        return value.toLowerCase();
    }

    // Caso contrário, trata como número de telefone.
    const digits = value.replace(/\D/g, "");
    if (!digits) {
        return null;
    }
    return `${digits}@s.whatsapp.net`;
}

function startHttpServer(port = 3000) {
    const server = http.createServer((req, res) => {
        const requestUrl = new URL(req.url, "http://localhost");

        if (req.method !== "POST") {
            return sendJson(res, 404, { error: "Endpoint não encontrado" });
        }

        if (requestUrl.pathname !== "/sendmessage" && requestUrl.pathname !== "/sendimage") {
            return sendJson(res, 404, { error: "Endpoint não encontrado" });
        }

        readJsonBody(req)
            .then(async (parsed) => {
                try {
                    const { number } = parsed;
                    const jid = normalizeNumberToJid(number);

                    if (!jid) {
                        return sendJson(res, 400, {
                            error: "Campo 'number' é obrigatório",
                        });
                    }

                    if (!sockInstance || !isWhatsappReady) {
                        return sendJson(res, 503, {
                            error: "WhatsApp não está conectado",
                        });
                    }

                    if (requestUrl.pathname === "/sendmessage") {
                        const { message } = parsed;

                        if (!message || typeof message !== "string") {
                            return sendJson(res, 400, {
                                error: "Campo 'message' é obrigatório e deve ser texto",
                            });
                        }

                        const result = await sockInstance.sendMessage(jid, {
                            text: message,
                        });

                        return sendJson(res, 200, {
                            success: true,
                            to: jid,
                            messageId: result?.key?.id || null,
                        });
                    }

                    const { imageUrl, caption = "" } = parsed;

                    if (!imageUrl || typeof imageUrl !== "string") {
                        return sendJson(res, 400, {
                            error: "Campo 'imageUrl' é obrigatório e deve ser uma URL",
                        });
                    }

                    const result = await sockInstance.sendMessage(jid, {
                        image: { url: imageUrl },
                        caption,
                    });

                    return sendJson(res, 200, {
                        success: true,
                        to: jid,
                        messageId: result?.key?.id || null,
                        caption: caption || "",
                    });
                } catch (error) {
                    if (error.message === "JSON inválido no corpo da requisição") {
                        return sendJson(res, 400, {
                            error: error.message,
                        });
                    }

                    return sendJson(res, 500, {
                        error:
                            requestUrl.pathname === "/sendimage"
                                ? "Falha ao enviar imagem"
                                : "Falha ao enviar mensagem",
                        details: error.message,
                    });
                }
            })
            .catch((error) => {
                return sendJson(res, 400, {
                    error: error.message,
                });
            });
    });

    server.listen(port, () => {
        console.log(`API online em http://localhost:${port}`);
        console.log("Endpoint: POST /sendmessage");
        console.log("Endpoint: POST /sendimage");
    });
}

function scheduleReconnect(reasonCode) {
    if (reconnectTimeout) {
        return;
    }

    reconnectAttempts += 1;
    const baseDelayMs = reasonCode === 515 ? 8000 : 5000;
    const delayMs = Math.min(baseDelayMs * reconnectAttempts, 60000);

    console.log(
        `Agendando reconexão em ${delayMs}ms (tentativa ${reconnectAttempts})`,
    );

    reconnectTimeout = setTimeout(() => {
        reconnectTimeout = null;
        connectToWhatsApp().catch((error) => {
            console.error("Erro ao reconectar:", error);
            scheduleReconnect();
        });
    }, delayMs);
}

async function clearAuthState() {
    try {
        await fs.rm("auth_info", { recursive: true, force: true });
        console.log("Sessão antiga removida em auth_info.");
    } catch (error) {
        console.error("Falha ao limpar auth_info:", error.message);
    }
}

async function connectToWhatsApp() {
    if (isConnecting) {
        return;
    }
    isConnecting = true;

    // 1. Gerencia o estado da autenticação (salva a sessão na pasta 'auth_info')
    try {
        const { state, saveCreds } = await useMultiFileAuthState("auth_info");

        // 2. Inicializa o Socket
        const { version, isLatest } = await fetchLatestBaileysVersion();
        console.log("Versão WA Web usada:", version, "| última:", isLatest);

        const sock = makeWASocket({
            auth: state,
            version,
            syncFullHistory: false,
        });
        sockInstance = sock;

        // 3. Monitora a conexão
        sock.ev.on("connection.update", (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                console.log("Escaneie o QR Code abaixo:");
                qrcode.generate(qr, { small: true });
            }

            if (connection === "close") {
                isWhatsappReady = false;
                const statusCode = new Boom(lastDisconnect?.error)?.output
                    ?.statusCode;
                const shouldReconnect =
                    statusCode !== DisconnectReason.loggedOut &&
                    statusCode !== 405;

                console.log(
                    "Conexão fechada devido a:",
                    lastDisconnect?.error,
                    "| status:",
                    statusCode,
                    ", tentando reconectar:",
                    shouldReconnect,
                );

                if (statusCode === 405) {
                    console.log(
                        "Sessão rejeitada (405). Apague a pasta auth_info e rode novamente para parear com novo QR.",
                    );
                    return;
                }

                if (statusCode === 401) {
                    console.log(
                        "Sessão inválida (401). É necessário novo pareamento por QR Code.",
                    );
                    if (process.env.AUTO_CLEAR_AUTH_ON_401 === "true") {
                        clearAuthState()
                            .then(() => scheduleReconnect(statusCode))
                            .catch(() => scheduleReconnect(statusCode));
                    }
                    return;
                }

                if (shouldReconnect) {
                    scheduleReconnect(statusCode);
                }
            } else if (connection === "open") {
                isWhatsappReady = true;
                reconnectAttempts = 0;
                console.log("Bot conectado com sucesso!");
            }
        });

        // 4. Salva as credenciais sempre que atualizadas
        sock.ev.on("creds.update", saveCreds);

        // 5. Escuta mensagens recebidas
        sock.ev.on("messages.upsert", async (m) => {
            const msg = m?.messages?.[0];
            if (!msg?.key || msg.key.fromMe || m.type !== "notify") {
                return;
            }

            const sender = msg.key.remoteJid;
            const text =
                msg.message?.conversation ||
                msg.message?.extendedTextMessage?.text;

            console.log(`Mensagem de ${sender}: ${text}`);

            // Resposta automática simples
            if (text?.toLowerCase() === "oi") {
                await sock.sendMessage(sender, {
                    text: "Olá! Sou um bot feito com Baileys. 🤖",
                });
            }
        });
    } finally {
        isConnecting = false;
    }
}

async function bootstrap() {
    try {
        await loadBaileys();
        startHttpServer(3000);
        await connectToWhatsApp();
    } catch (error) {
        console.error("Falha ao iniciar o bot:", error);
        process.exit(1);
    }
}

bootstrap();
