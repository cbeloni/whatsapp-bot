const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { MessageMedia } = require('whatsapp-web.js');
const axios = require('axios');

const client = new Client({
    authStrategy: new LocalAuth()
});

// Evento disparado quando o QR Code é gerado
client.on('qr', (qr) => {
    console.log('QR Code gerado. Escaneie com o WhatsApp.');
    qrcode.generate(qr, { small: true });
});

// Evento disparado quando o cliente está pronto
client.on('ready', () => {
    console.log('Cliente está pronto!');
});

// Evento disparado quando uma mensagem é recebida
client.on('message', message => {
    console.log(`Mensagem recebida: ${message.body}`);

    if (message.body.toLowerCase() === 'oi') {
        message.reply('Olá!');
        sendMessageToNumber('5511941503226', 'Olá! Esta é uma mensagem automática.');
    }
});

// Método para enviar uma mensagem para um número específico
const sendMessageToNumber = async (number, message) => {
    const chatId = `${number}@s.whatsapp.net`;
    return client.sendMessage(chatId, message)
}

// Método para enviar uma imagem para um número específico
const sendImageToNumber = async (number, imageUrl, caption = '') => {
    const chatId = `${number}@s.whatsapp.net`;

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
    sendImageToNumber
};