require('dotenv').config();
const express = require('express');
const whatsappRouter = require('./webhooks/whatsapp');
const instagramRouter = require('./webhooks/instagram');

const app = express();
app.use(express.json());

app.get('/health', (_, res) => res.json({ status: 'ok', servicio: 'MÜVA PETS — Agente Captación' }));

app.use('/webhook/whatsapp', whatsappRouter);
app.use('/webhook/instagram', instagramRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🐾 MÜVA PETS Agente corriendo en puerto ${PORT}`);
});
