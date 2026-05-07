const express = require('express');
const { initializeClient, sendMessageToNumber, sendImageToNumber } = require('./whatsapp');
const basicAuth = require('./auth');
require('dotenv').config();
const app = express();

app.use(express.json());

initializeClient();

// Aplica o middleware de autenticação às rotas
app.post('/sendmessage', basicAuth, async (req, res) => {
    const { number, message } = req.body;
    try {
        await sendMessageToNumber(number, message)        
        res.status(200).send(`Mensagem enviada para ${number}: ${message}`);
    } catch (err) { 
        res.status(500).send(`Erro ao enviar mensagem para ${number}: ${err}`);
    }
});

app.post('/sendimage', basicAuth, async (req, res) => {
    const { number, imageUrl, caption } = req.body;

    try {
        await sendImageToNumber(number, imageUrl, caption);
        res.status(200).send(`Imagem enviada para ${number} com a legenda: "${caption || ''}"`);
    } catch (err) {
        res.status(500).send(`Erro ao enviar imagem para ${number}: ${err.message}`);
    }
});

app.listen(3000, () => {
    console.log('HTTP Server listening on port 3000');
});