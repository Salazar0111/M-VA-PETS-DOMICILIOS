const express = require('express');
const { obtenerRutaOrdenada, registrarCheckIn, registrarCheckOut } = require('../services/supabase');

const router = express.Router();

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
    const cita = await registrarCheckOut(req.params.citaId);
    res.json(cita);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
