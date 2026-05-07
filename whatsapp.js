require('dotenv').config();

const providerName = (process.env.WHATSAPP_PROVIDER || 'baileys').toLowerCase();

const providers = {
    'whatsapp-web': './providers/whatsappWebProvider',
    'baileys': './providers/baileysProvider',
};

if (!providers[providerName]) {
    throw new Error(
        `WHATSAPP_PROVIDER inválido: "${providerName}". Use "whatsapp-web" ou "baileys".`
    );
}

console.log(`Provider selecionado: ${providerName}`);
module.exports = require(providers[providerName]);
