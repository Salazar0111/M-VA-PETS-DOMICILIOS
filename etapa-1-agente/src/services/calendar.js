require('dotenv').config();
const { google } = require('googleapis');

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET
);
oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

// Convierte texto libre de fecha/hora en un rango ISO de 30 minutos.
// Etapa 3 (motor de rutas) reemplaza esto con slots reales.
function calcularRangoHorario(fechaHoraTexto) {
  const inicio = new Date();
  inicio.setDate(inicio.getDate() + 1);
  inicio.setHours(9, 0, 0, 0);
  const fin = new Date(inicio.getTime() + 30 * 60 * 1000);
  return { inicio, fin };
}

async function crearEventoVeterinario(datosCita) {
  const { inicio, fin } = calcularRangoHorario(datosCita.fechaHora);

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

  return data.id;
}

module.exports = { crearEventoVeterinario };
