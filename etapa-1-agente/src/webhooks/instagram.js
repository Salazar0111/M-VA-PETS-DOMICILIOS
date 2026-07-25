const express = require('express');
const { enviarInstagram } = require('../services/messenger');
const { recibirMensaje } = require('../services/atencion');

const router = express.Router();

// Meta verifica el webhook con un GET al configurarlo
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.INSTAGRAM_VERIFY_TOKEN) {
    console.log('[IG] Webhook verificado');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// Mensajes entrantes de Instagram DM. Igual que en WhatsApp: este archivo
// solo traduce el formato de Meta.
router.post('/', (req, res) => {
  res.sendStatus(200);

  try {
    const messaging = req.body?.entry?.[0]?.messaging?.[0];
    if (!messaging?.message) return;
    // Ignorar mensajes enviados por la página misma (eco)
    if (messaging.message.is_echo) return;

    const senderId = messaging.sender.id;

    if (!messaging.message.text) {
      console.log(`[IG] Mensaje no textual de ${senderId}`);
      enviarInstagram(
        senderId,
        'Por acá no alcanzo a ver eso. ¿Me lo cuentas escrito y seguimos?'
      ).catch((err) => console.error('[IG] Error respondiendo a mensaje no textual:', err.message));
      return;
    }

    const texto = messaging.message.text;
    console.log(`[IG] Mensaje de ${senderId}: "${texto}"`);

    recibirMensaje({
      canal: 'instagram',
      contactoId: senderId,
      texto,
      enviar: (respuesta) => enviarInstagram(senderId, respuesta),
    });
  } catch (err) {
    console.error('[IG] Error procesando mensaje:', err.message);
  }
});

module.exports = router;
