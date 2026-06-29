const express = require('express');
const { clasificarMensaje } = require('../services/classifier');
const { enviarWhatsApp } = require('../services/messenger');
const { avanzarConversacion, iniciarAgendamiento, responderFAQ, PASOS, obtenerSesion } = require('../services/conversation');

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

// Mensajes entrantes de WhatsApp
router.post('/', async (req, res) => {
  res.sendStatus(200); // Responder rápido a Meta para evitar reintentos

  try {
    const entry = req.body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const message = value?.messages?.[0];

    if (!message || message.type !== 'text') return;

    const from = message.from;
    const texto = message.text.body;

    console.log(`[WA] Mensaje de ${from}: "${texto}"`);

    const sesion = obtenerSesion(from);

    // Si hay una sesión de agendamiento activa, continuar el flujo
    if (sesion.paso !== PASOS.INICIO) {
      const { respuesta, completado } = avanzarConversacion(from, texto);
      await enviarWhatsApp(from, respuesta);
      if (completado) {
        console.log(`[WA] Agendamiento completado para ${from}`);
        // TODO Etapa 2: guardar en Supabase + crear evento en Google Calendar
      }
      return;
    }

    // Primera vez: clasificar la intención
    const clasificacion = await clasificarMensaje(texto);
    console.log(`[WA] Clasificación: ${JSON.stringify(clasificacion)}`);

    if (clasificacion.categoria === 'AGENDAR') {
      const bienvenida = iniciarAgendamiento(from);
      await enviarWhatsApp(from, bienvenida);
    } else if (clasificacion.categoria === 'FAQ') {
      await enviarWhatsApp(from, responderFAQ());
    }
    // SPAM → sin respuesta

  } catch (err) {
    console.error('[WA] Error procesando mensaje:', err.message);
  }
});

module.exports = router;
