require('dotenv').config();
const { google } = require('googleapis');
const { interpretarFechaHora } = require('./interpretarFecha');

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET
);
oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

// El nombre quedó heredado del diseño original. Hoy este evento va al
// calendario de MÜVA (`resultadosmuva@gmail.com`), no al del veterinario:
// él ve su jornada en la PWA /app/, con el briefing clínico completo.
// Decisión del 2026-08-19 — por eso GOOGLE_CALENDAR_ID_VETERINARIO se deja
// sin setear y cae en 'primary'.
async function crearEventoVeterinario(datosCita) {
  const { inicio, fin, interpretado } = interpretarFechaHora(datosCita.fechaHora, datosCita.tipoConsulta);
  if (!interpretado) {
    console.warn(
      `[Calendar] No se pudo interpretar completo "${datosCita.fechaHora}" (tipo: ${datosCita.tipoConsulta}). ` +
        `Usando ${inicio.toISOString()} como mejor estimado.`
    );
  }

  // El veterinario ve esto en su celular antes de salir: además del dato
  // logístico, va el triaje (qué tan urgente y qué material alistar) para
  // que no tenga que abrir la app para saber qué meter en el maletín.
  const urgencia = datosCita.nivelUrgencia ? `[${datosCita.nivelUrgencia.toUpperCase()}] ` : '';
  const lineas = [
    `Tipo: ${datosCita.tipoServicio || datosCita.tipoConsulta}`,
    datosCita.motivoConsulta ? `Motivo: ${datosCita.motivoConsulta}` : null,
    datosCita.sintomas ? `Síntomas: ${datosCita.sintomas}` : null,
    datosCita.edadAproximada ? `Edad: ${datosCita.edadAproximada}` : null,
    `Dueño: ${datosCita.nombreDueno || '—'}`,
    `Dirección: ${datosCita.direccion}`,
    datosCita.muestrasSugeridas?.length
      ? `\nAlistar:\n- ${datosCita.muestrasSugeridas.join('\n- ')}`
      : null,
    `\nSolicitado como: "${datosCita.fechaHora}"`,
  ].filter(Boolean);

  const evento = {
    summary: `${urgencia}${datosCita.nombreMascota} (${datosCita.especie}) — ${datosCita.tipoServicio || datosCita.tipoConsulta}`,
    description: lineas.join('\n'),
    location: datosCita.direccion,
    start: { dateTime: inicio.toISOString(), timeZone: 'America/Bogota' },
    end: { dateTime: fin.toISOString(), timeZone: 'America/Bogota' },
  };

  const { data } = await calendar.events.insert({
    calendarId: process.env.GOOGLE_CALENDAR_ID_VETERINARIO || 'primary',
    requestBody: evento,
  });

  return { eventoId: data.id, fechaHoraConfirmada: inicio, interpretado };
}

module.exports = { crearEventoVeterinario };
