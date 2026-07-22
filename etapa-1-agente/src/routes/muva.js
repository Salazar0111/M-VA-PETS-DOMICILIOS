const express = require('express');
const { resumenDelDia, visitasDeLaSemana, informesPeriodo, ultimaNotificacion } = require('../services/operacion');

const router = express.Router();

// GET /api/muva/resumen/:fecha — todo lo que pinta el panel de un día
router.get('/resumen/:fecha', async (req, res) => {
  try {
    const [resumen, aviso] = await Promise.all([
      resumenDelDia(req.params.fecha),
      ultimaNotificacion(req.params.fecha),
    ]);
    res.json({ ...resumen, avisoDisponibilidad: aviso });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/muva/semana/:fecha — visitas por día de la semana en curso
router.get('/semana/:fecha', async (req, res) => {
  try {
    res.json({ dias: await visitasDeLaSemana(req.params.fecha) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/muva/informes/:tipo/:fecha — tipo: dia | semana | mes
router.get('/informes/:tipo/:fecha', async (req, res) => {
  if (!['dia', 'semana', 'mes'].includes(req.params.tipo)) {
    return res.status(400).json({ error: 'tipo debe ser dia, semana o mes' });
  }
  try {
    res.json(await informesPeriodo(req.params.tipo, req.params.fecha));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
