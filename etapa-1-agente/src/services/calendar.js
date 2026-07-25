require('dotenv').config();
const { google } = require('googleapis');
const { interpretarFechaHora } = require('./interpretarFecha');

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET
);
oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

async function crearEventoVeterinario(datosCita) {
  const { inicio, fin, interpretado } = interpretarFechaHora(datosCita.fechaHora, datosCita.tipoConsulta);
  if (!interpretado) {
    console.warn(
      `[Calendar] No se pudo interpretar completo "${datosCita.fechaHora}" (tipo: ${datosCita.tipoConsulta}). ` +
        `Usando ${inicio.toISOString()} como mejor estimado.`
    );
  }

  const evento = {
    summary: `Consulta veterinaria — ${datosCita.nombreMascota} (${datosCita.especie})`,
    description:
      `Tipo: ${datosCita.tipoConsulta}\n` +
      `Dirección: ${datosCita.direccion}\n` +
      `Solicitado: ${datosCita.fechaHora}`,
    location: datosCita.direccion,
    start: { dateTime: inicio.toISOString(), timeZone: 'America/Bogota' },
    end: { dateTime: fin.toISOString(), timeZone: 'America/Bogota' },
  };

  const { data } = await calendar.events.insert({
    calendarId: process.env.GOOGLE_CALENDAR_ID_VETERINARIO || 'primary',
    requestBody: evento,
  });

  return { eventoId: data.id, fechaHoraConfirmada: inicio };
}

module.exports = { crearEventoVeterinario };
