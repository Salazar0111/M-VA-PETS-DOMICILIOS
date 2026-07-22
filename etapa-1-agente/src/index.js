require('dotenv').config();
const path = require('path');
const express = require('express');
const cron = require('node-cron');
const whatsappRouter = require('./webhooks/whatsapp');
const instagramRouter = require('./webhooks/instagram');
const veterinarioRouter = require('./routes/veterinario');
const authRouter = require('./routes/auth');
const { requiereSesion, requiereRol } = require('./middleware/auth');
const { calcularRutaDelDia, fechaISODeMañana } = require('./jobs/calcularRutaDelDia');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (_, res) => res.json({ status: 'ok', servicio: 'MÜVA PETS — Agente Captación' }));

// Maqueta de la app del veterinario (URL limpia para compartir con el cliente)
app.get('/maqueta', (_, res) => res.sendFile(path.join(__dirname, 'public', 'maqueta.html')));

// Maqueta del panel de operación de MÜVA
app.get('/dashboard', (_, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));

// Recalcular la ruta de una fecha (YYYY-MM-DD). Solo admin: consume cuota de Google Maps.
app.get('/rutas/calcular/:fecha', requiereSesion, requiereRol('admin'), async (req, res) => {
  try {
    const resultado = await calcularRutaDelDia(req.params.fecha);
    res.json(resultado || { mensaje: 'Sin citas confirmadas para esa fecha' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Webhooks de Meta: los autentica Meta, no nuestra sesión.
app.use('/webhook/whatsapp', whatsappRouter);
app.use('/webhook/instagram', instagramRouter);

app.use('/api/auth', authRouter);
app.use('/api/veterinario', requiereSesion, requiereRol('veterinario', 'admin'), veterinarioRouter);

// Job nocturno: cada día a las 8:00 p.m. (hora Bogotá) calcula la ruta óptima de mañana
cron.schedule(
  '0 20 * * *',
  async () => {
    try {
      await calcularRutaDelDia(fechaISODeMañana());
    } catch (err) {
      console.error('[Rutas] Error en cálculo nocturno:', err.message);
    }
  },
  { timezone: 'America/Bogota' }
);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🐾 MÜVA PETS Agente corriendo en puerto ${PORT}`);
});
