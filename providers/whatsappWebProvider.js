const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const AUTH_PATH = process.env.WWEBJS_AUTH_PATH || '.wwebjs_auth';
const READY_TIMEOUT_MS = Number(process.env.WWEBJS_READY_TIMEOUT_MS || 180000);

const client = new Client({
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    },
    authStrategy: new LocalAuth({
        clientId: process.env.WWEBJS_CLIENT_ID || 'main',
        dataPath: AUTH_PATH,
    }),
});

let clientReady = false;
let initializing = false;
let authenticatedLogged = false;
let readyWaiters = [];
let reconnectTimeout = null;
let lastInitError = null;

const waitForReady = (timeoutMs = READY_TIMEOUT_MS) => new Promise((resolve, reject) => {
    if (clientReady) {
        resolve();
        return;
    }

    const timeout = setTimeout(() => {
        readyWaiters = readyWaiters.filter((waiter) => waiter.resolve !== resolve);
        const reason = lastInitError ? ` Último erro: ${lastInitError.message}` : '';
        reject(new Error(`Cliente WhatsApp Web não ficou pronto dentro do tempo limite (${timeoutMs}ms).${reason} Verifique autenticação/QR e conectividade.`));
    }, timeoutMs);

    readyWaiters.push({
        resolve: () => {
            clearTimeout(timeout);
            resolve();
        },
        reject: (error) => {
            clearTimeout(timeout);
            reject(error);
        },
    });
});

const resolveReadyWaiters = () => {
    const waiters = readyWaiters;
    readyWaiters = [];
    waiters.forEach((waiter) => waiter.resolve());
};

const rejectReadyWaiters = (error) => {
    const waiters = readyWaiters;
    readyWaiters = [];
    waiters.forEach((waiter) => waiter.reject(error));
    lastInitError = error;
};

const sanitizeNumber = (value = '') => `${value}`.replace(/\D/g, '');

// whatsapp-web.js usa @c.us, não @s.whatsapp.net
const montarId = (number) => {
    if (typeof number !== 'string' && typeof number !== 'number') {
        throw new Error('Número de destino inválido.');
    }

    const raw = `${number}`.trim();
    if (!raw) {
        throw new Error('Número de destino vazio.');
    }

    if (raw.includes('@')) {
        return raw;
    }

    const normalized = sanitizeNumber(raw);
    if (!normalized) {
        throw new Error(`Número de destino inválido: "${number}"`);
    }

    return `${normalized}@c.us`;
};

const scheduleReconnect = (delayMs = 5000) => {
    if (reconnectTimeout) {
        return;
    }

    reconnectTimeout = setTimeout(() => {
        reconnectTimeout = null;
        initializeClient();
    }, delayMs);
};

const ensureClientReady = async () => {
    if (!clientReady) {
        initializeClient();
        await waitForReady();
    }
};

client.on('qr', (qr) => {
    console.log('QR Code gerado (whatsapp-web.js). Escaneie com o WhatsApp.');
    qrcode.generate(qr, { small: true });
});

// Guard para evitar log duplicado do evento 'authenticated'
client.on('authenticated', () => {
    if (!authenticatedLogged) {
        console.log('WhatsApp Web autenticado com sucesso.');
        authenticatedLogged = true;
    }
    lastInitError = null;
});

client.on('auth_failure', (message) => {
    const error = new Error(`Falha na autenticação do WhatsApp Web: ${message}`);
    console.error(error.message);
    clientReady = false;
    initializing = false;
    authenticatedLogged = false;
    lastInitError = error;
    rejectReadyWaiters(error);
    // Destrói o cliente para limpar sessão corrompida e reinicializa
    client.destroy().catch(() => { }).then(() => {
        scheduleReconnect(3000);
    });
});

client.on('ready', () => {
    console.log('Cliente WhatsApp Web está pronto.');
    clientReady = true;
    initializing = false;
    lastInitError = null;
    resolveReadyWaiters();
});

client.on('disconnected', (reason) => {
    console.warn('WhatsApp Web desconectado:', reason);
    clientReady = false;
    initializing = false;
    authenticatedLogged = false;
    lastInitError = new Error(`WhatsApp Web desconectado: ${reason}`);
    scheduleReconnect(5000);
});

const initializeClient = () => {
    if (initializing) {
        return;
    }
    initializing = true;
    console.log(`Inicializando WhatsApp Web (auth em: ${AUTH_PATH})...`);
    client.initialize().catch((error) => {
        console.error('Erro ao inicializar WhatsApp Web:', error);
        initializing = false;
        clientReady = false;
        lastInitError = error;
        scheduleReconnect(5000);
    });
};

const sendMessageToNumber = async (number, message) => {
    await ensureClientReady();
    return client.sendMessage(montarId(number), message);
};

const sendImageToNumber = async (number, imageUrl, caption = '') => {
    await ensureClientReady();
    const media = await MessageMedia.fromUrl(imageUrl);
    return client.sendMessage(montarId(number), media, { caption });
};

module.exports = {
    initializeClient,
    sendMessageToNumber,
    sendImageToNumber,
    isClientReady: () => clientReady,
};
