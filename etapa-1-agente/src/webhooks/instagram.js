const express = require('express');
const { clasificarMensaje } = require('../services/classifier');
const { enviarInstagram } = require('../services/messenger');
const { avanzarConversacion, iniciarAgendamiento, responderFAQ, PASOS, obtenerSesion } = require('../services/conversation');
const { crearCita, actualizarEventoVeterinario } = require('../services/supabase');
const { crearEventoVeterinario } = require('../services/calendar');

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

    const idSesion = `ig_${senderId}`;
    const sesion = obtenerSesion(idSesion);

    // Ver comentario equivalente en webhooks/whatsapp.js: evita que el
    // cliente tenga que escribir dos veces para iniciar un nuevo agendamiento.
    if (sesion.paso === PASOS.COMPLETADO) {
      sesion.paso = PASOS.INICIO;
      sesion.datos = {};
    }

    if (sesion.paso !== PASOS.INICIO) {
      const { respuesta, datos, completado } = avanzarConversacion(idSesion, texto);
      await enviarInstagram(senderId, respuesta);
      if (completado) {
        try {
          const cita = await crearCita({ canal: 'instagram', contactoId: senderId, ...datos });
          console.log(`[IG] Cita guardada en Supabase: ${cita.id}`);

          const { eventoId, fechaHoraConfirmada } = await crearEventoVeterinario(datos);
          await actualizarEventoVeterinario(cita.id, eventoId, fechaHoraConfirmada);
          console.log(`[IG] Evento creado en Google Calendar del veterinario: ${eventoId}`);
        } catch (err) {
          console.error('[IG] Error guardando cita:', err.message);
        }
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
