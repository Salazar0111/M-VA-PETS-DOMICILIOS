const express = require('express');
const { iniciarSesion } = require('../services/auth');
const { requiereSesion } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/login — el navegador nunca ve las llaves de Supabase
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'Escribe tu correo y contraseña' });
  }

  try {
    const sesion = await iniciarSesion(email, password);
    res.json(sesion);
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

// GET /api/auth/me — para que la app sepa quién está conectado al abrir
router.get('/me', requiereSesion, (req, res) => res.json(req.usuario));

module.exports = router;
