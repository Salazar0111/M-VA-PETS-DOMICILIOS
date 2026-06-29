const express = require('express');
const { clasificarMensaje } = require('../services/classifier');
const { enviarInstagram } = require('../services/messenger');
const { avanzarConversacion, iniciarAgendamiento, responderFAQ, PASOS, obtenerSesion } = require('../services/conversation');

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

// Mensajes entrantes de Instagram DM
router.post('/', async (req, res) => {
  res.sendStatus(200);

  try {
    const entry = req.body?.entry?.[0];
    const messaging = entry?.messaging?.[0];

    if (!messaging || !messaging.message?.text) return;
    // Ignorar mensajes enviados por la página misma (eco)
    if (messaging.message.is_echo) return;

    const senderId = messaging.sender.id;
    const texto = messaging.message.text;

    console.log(`[IG] Mensaje de ${senderId}: "${texto}"`);

    const sesion = obtenerSesion(`ig_${senderId}`);
    const idSesion = `ig_${senderId}`;

    if (sesion.paso !== PASOS.INICIO) {
      const { respuesta, completado } = avanzarConversacion(idSesion, texto);
      await enviarInstagram(senderId, respuesta);
      if (completado) {
        console.log(`[IG] Agendamiento completado para ${senderId}`);
        // TODO Etapa 2: guardar en Supabase + crear evento en Google Calendar
      }
      return;
    }

    const clasificacion = await clasificarMensaje(texto);
    console.log(`[IG] Clasificación: ${JSON.stringify(clasificacion)}`);

    if (clasificacion.categoria === 'AGENDAR') {
      const bienvenida = iniciarAgendamiento(idSesion);
      await enviarInstagram(senderId, bienvenida);
    } else if (clasificacion.categoria === 'FAQ') {
      await enviarInstagram(senderId, responderFAQ());
    }

  } catch (err) {
    console.error('[IG] Error procesando mensaje:', err.message);
  }
});

module.exports = router;
