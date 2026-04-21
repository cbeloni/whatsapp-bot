const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { MessageMedia } = require('whatsapp-web.js');
const axios = require('axios');

const AUTH_PATH = process.env.WWEBJS_AUTH_PATH || '.wwebjs_auth';

const client = new Client({
    puppeteer: {
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    },
    authStrategy: new LocalAuth({
        clientId: process.env.WWEBJS_CLIENT_ID || 'main',
        dataPath: AUTH_PATH
    })
});

let clientReady = false;
let initializing = false;
let readyResolvers = [];

const waitForReady = (timeoutMs = 45000) => new Promise((resolve, reject) => {
    if (clientReady) {
        resolve();
        return;
    }

    const timeout = setTimeout(() => {
        readyResolvers = readyResolvers.filter((fn) => fn !== onReady);
        reject(new Error('Cliente WhatsApp ainda não ficou pronto dentro do tempo limite.'));
    }, timeoutMs);

    const onReady = () => {
        clearTimeout(timeout);
        resolve();
    };

    readyResolvers.push(onReady);
});

const resolveReadyWaiters = () => {
    const resolvers = readyResolvers;
    readyResolvers = [];
    resolvers.forEach((fn) => fn());
};

const ensureClientReady = async () => {
    if (!clientReady) {
        initializeClient();
        await waitForReady();
    }
};

// Evento disparado quando o QR Code é gerado
client.on('qr', (qr) => {
    console.log('QR Code gerado. Escaneie com o WhatsApp.');
    qrcode.generate(qr, { small: true });
});

client.on('authenticated', () => {
    console.log('WhatsApp autenticado com sucesso.');
});

client.on('auth_failure', (message) => {
    console.error('Falha na autenticação do WhatsApp:', message);
    clientReady = false;
});

// Evento disparado quando o cliente está pronto
client.on('ready', () => {
    console.log('Cliente está pronto!');
    clientReady = true;
    initializing = false;
    resolveReadyWaiters();
});

client.on('disconnected', (reason) => {
    console.warn('WhatsApp desconectado:', reason);
    clientReady = false;
    initializing = false;
    setTimeout(() => initializeClient(), 5000);
});

// Evento disparado quando uma mensagem é recebida
// client.on('message', message => {
//     console.log(`Mensagem recebida: ${message.body}`);

//     if (message.body.toLowerCase() === 'oi') {
//         message.reply('Olá!');
//         sendMessageToNumber('5511941503226', 'Olá! Esta é uma mensagem automática.');
//     }
// });

const montarId = (number) => {

    
    if (/^\d+$/.test(number)) {
        return `${number}@s.whatsapp.net`
    }
    return `${number}`;
}

const sendMessageToNumber = async (number, message) => {
    await ensureClientReady();
    const chatId = montarId(number);
    return client.sendMessage(chatId, message);
}

const sendImageToNumber = async (number, imageUrl, caption = '') => {
    await ensureClientReady();
    const chatId = montarId(number);

    try {
        const media = await MessageMedia.fromUrl(imageUrl);
        return client.sendMessage(chatId, media, { caption });
    } catch (error) {
        console.error('Erro ao baixar ou enviar a imagem:', error);
        throw new Error('Erro ao enviar a imagem:', error);
    }
};

// Inicializa o cliente
const initializeClient = () => {
    if (initializing) {
        return;
    }
    initializing = true;
    console.log(`Inicializando cliente WhatsApp (auth em: ${AUTH_PATH})...`);
    client.initialize();
}

module.exports = {
    initializeClient,
    sendMessageToNumber,
    sendImageToNumber,
    isClientReady: () => clientReady
};
