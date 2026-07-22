const express = require('express');
const { obtenerRutaOrdenada, registrarCheckIn, registrarCheckOut } = require('../services/supabase');
const { notificarDisponibilidad } = require('../services/operacion');

const router = express.Router();

const fechaBogota = (iso) =>
  new Date(iso || Date.now()).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });

// GET /api/veterinario/ruta/:fecha (YYYY-MM-DD) — ruta ordenada del día
router.get('/ruta/:fecha', async (req, res) => {
  try {
    const ruta = await obtenerRutaOrdenada(req.params.fecha);
    res.json({ fecha: req.params.fecha, citas: ruta });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/veterinario/checkin/:citaId
router.post('/checkin/:citaId', async (req, res) => {
  try {
    const cita = await registrarCheckIn(req.params.citaId);
    res.json(cita);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/veterinario/checkout/:citaId
router.post('/checkout/:citaId', async (req, res) => {
  try {
    const cita = await registrarCheckOut(req.params.citaId, req.body?.observaciones);
    res.json(cita);

    // Al cerrar una visita puede quedar agenda libre: MÜVA debe enterarse.
    // Va después de responder para no demorar al veterinario en campo.
    notificarDisponibilidad(fechaBogota(cita.fecha_hora_confirmada)).catch((err) =>
      console.error('[Disponibilidad] No se pudo notificar a MÜVA:', err.message)
    );
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
