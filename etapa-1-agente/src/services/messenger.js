require('dotenv').config();
const axios = require('axios');

const WA_BASE = 'https://graph.facebook.com/v19.0';

async function enviarWhatsApp(to, texto) {
  await axios.post(
    `${WA_BASE}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body: texto },
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
    }
  );
}

async function enviarInstagram(recipientId, texto) {
  await axios.post(
    `${WA_BASE}/me/messages`,
    {
      recipient: { id: recipientId },
      message: { text: texto },
    },
    {
      params: { access_token: process.env.INSTAGRAM_PAGE_ACCESS_TOKEN },
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

module.exports = { enviarWhatsApp, enviarInstagram };
