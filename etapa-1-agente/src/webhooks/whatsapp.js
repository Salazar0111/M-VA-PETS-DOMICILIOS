const express = require('express');
const { enviarWhatsApp } = require('../services/messenger');
const { recibirMensaje } = require('../services/atencion');

const router = express.Router();

// Meta verifica el webhook con un GET al configurarlo
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log('[WA] Webhook verificado');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// Mensajes entrantes de WhatsApp. Este archivo solo traduce el formato de
// Meta; toda la conversación vive en services/atencion.js.
router.post('/', (req, res) => {
  res.sendStatus(200); // Responder rápido a Meta para evitar reintentos

  try {
    const message = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!message) return;

    const from = message.from;

    // Notas de voz, fotos y stickers: no se pueden leer, pero ignorarlos en
    // silencio deja al cliente hablando solo.
    if (message.type !== 'text') {
      console.log(`[WA] Mensaje no textual de ${from} (${message.type})`);
      enviarWhatsApp(
        from,
        'Por acá no alcanzo a ver eso. ¿Me lo cuentas escrito y seguimos?'
      ).catch((err) => console.error('[WA] Error respondiendo a mensaje no textual:', err.message));
      return;
    }

    const texto = message.text.body;
    console.log(`[WA] Mensaje de ${from}: "${texto}"`);

    recibirMensaje({
      canal: 'whatsapp',
      contactoId: from,
      texto,
      enviar: (respuesta) => enviarWhatsApp(from, respuesta),
    });
  } catch (err) {
    console.error('[WA] Error procesando mensaje:', err.message);
  }
});

module.exports = router;
