const qrcode = require('qrcode-terminal');
const {
    default: makeWASocket,
    DisconnectReason,
    fetchLatestBaileysVersion,
    useMultiFileAuthState,
    jidNormalizedUser,
} = require('@whiskeysockets/baileys');

const AUTH_PATH = process.env.BAILEYS_AUTH_PATH || '.baileys_auth';

let sock = null;
let clientReady = false;
let initializing = false;
let readyResolvers = [];
let reconnectTimeout = null;

const waitForReady = (timeoutMs = 45000) => new Promise((resolve, reject) => {
    if (clientReady) {
        resolve();
        return;
    }

    const onReady = () => {
        clearTimeout(timeout);
        resolve();
    };

    const timeout = setTimeout(() => {
        readyResolvers = readyResolvers.filter((fn) => fn !== onReady);
        reject(new Error('Cliente Baileys não ficou pronto dentro do tempo limite.'));
    }, timeoutMs);

    readyResolvers.push(onReady);
});

const resolveReadyWaiters = () => {
    const resolvers = readyResolvers;
    readyResolvers = [];
    resolvers.forEach((fn) => fn());
};

const sanitizeNumber = (value = '') => `${value}`.replace(/\D/g, '');

const montarId = (number) => {
    if (typeof number !== 'string' && typeof number !== 'number') {
        throw new Error('Número de destino inválido.');
    }

    const raw = `${number}`.trim();
    if (!raw) {
        throw new Error('Número de destino vazio.');
    }

    if (raw.includes('@')) {
        return jidNormalizedUser(raw);
    }

    const normalized = sanitizeNumber(raw);
    if (!normalized) {
        throw new Error(`Número de destino inválido: "${number}"`);
    }

    return jidNormalizedUser(`${normalized}@s.whatsapp.net`);
};

const scheduleReconnect = () => {
    if (reconnectTimeout) {
        return;
    }
    reconnectTimeout = setTimeout(() => {
        reconnectTimeout = null;
        initializeClient().catch((error) => {
            console.error('Erro ao reconectar Baileys:', error);
            scheduleReconnect();
        });
    }, 5000);
};

const initializeClient = async () => {
    if (initializing) {
        return;
    }

    initializing = true;
    console.log(`Inicializando Baileys (auth em: ${AUTH_PATH})...`);
    try {
        const { state, saveCreds } = await useMultiFileAuthState(AUTH_PATH);
        const { version } = await fetchLatestBaileysVersion();

        sock = makeWASocket({
            auth: state,
            version,
            printQRInTerminal: false,
            syncFullHistory: false,
            markOnlineOnConnect: false,
            browser: ['whatsapp-bot', 'Chrome', '1.0.0'],
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                console.log('QR Code gerado (Baileys). Escaneie com o WhatsApp.');
                qrcode.generate(qr, { small: true });
            }

            if (connection === 'open') {
                console.log('Cliente Baileys está pronto.');
                clientReady = true;
                initializing = false;
                resolveReadyWaiters();
                return;
            }

            if (connection === 'close') {
                clientReady = false;
                initializing = false;

                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const isLoggedOut = statusCode === DisconnectReason.loggedOut;

                console.warn('Baileys desconectado:', statusCode || 'sem status');
                if (!isLoggedOut) {
                    scheduleReconnect();
                } else {
                    console.warn('Sessão Baileys deslogada. Gere novo QR para autenticar novamente.');
                }
            }
        });
    } catch (error) {
        clientReady = false;
        initializing = false;
        console.error('Erro ao inicializar Baileys:', error);
        scheduleReconnect();
        throw error;
    }
};

const ensureClientReady = async () => {
    if (!clientReady) {
        await initializeClient();
        await waitForReady();
    }
};

const sendMessageToNumber = async (number, message) => {
    await ensureClientReady();
    return sock.sendMessage(montarId(number), { text: message });
};

const sendImageToNumber = async (number, imageUrl, caption = '') => {
    await ensureClientReady();
    return sock.sendMessage(montarId(number), {
        image: { url: imageUrl },
        caption,
    });
};

module.exports = {
    initializeClient,
    sendMessageToNumber,
    sendImageToNumber,
    isClientReady: () => clientReady,
};
