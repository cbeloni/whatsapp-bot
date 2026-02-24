const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { MessageMedia } = require('whatsapp-web.js');
const axios = require('axios');

const client = new Client({
    puppeteer: {
        headless: true,
        args: ["--no-sandbox"],
    },
    authStrategy: new LocalAuth()
});

let clientReady = false;

// Evento disparado quando o QR Code é gerado
client.on('qr', (qr) => {
    console.log('QR Code gerado. Escaneie com o WhatsApp.');
    qrcode.generate(qr, { small: true });
});

// Evento disparado quando o cliente está pronto
client.on('ready', () => {
    console.log('Cliente está pronto!');
    clientReady = true;
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
    if (!clientReady) {
        throw new Error('Cliente WhatsApp ainda não está pronto. Aguarde e tente novamente.');
    }
    const chatId = montarId(number);
    return client.sendMessage(chatId, message);
}

const sendImageToNumber = async (number, imageUrl, caption = '') => {
    if (!clientReady) {
        throw new Error('Cliente WhatsApp ainda não está pronto. Aguarde e tente novamente.');
    }
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
    client.initialize();
}

module.exports = {
    initializeClient,
    sendMessageToNumber,
    sendImageToNumber,
    isClientReady: () => clientReady
};