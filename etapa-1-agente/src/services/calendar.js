require('dotenv').config();
const { google } = require('googleapis');

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET
);
oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

// Placeholder mientras la Etapa 3 (motor de rutas) reemplaza esto con
// slots reales a partir de lo que el cliente escribió en fechaHoraTexto.
// Por ahora todo cae en "mañana 9am", pero HORA BOGOTÁ, no la del
// servidor: con setHours() en horario del servidor (UTC en Railway),
// "9am" terminaba guardándose como las 4am reales en Bogotá — fuera de
// la ventana de 8am-4pm y por eso no aparecía en la app del veterinario.
function calcularRangoHorario(fechaHoraTexto) {
  const hoyBogota = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
  const mañanaBogota = new Date(`${hoyBogota}T12:00:00-05:00`);
  mañanaBogota.setDate(mañanaBogota.getDate() + 1);
  const fechaISO = mañanaBogota.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });

  const inicio = new Date(`${fechaISO}T09:00:00-05:00`);
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

  return { eventoId: data.id, fechaHoraConfirmada: inicio };
}

module.exports = { crearEventoVeterinario };
