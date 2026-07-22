const { obtenerCitasDelDia, guardarRutaDiaria } = require('../services/supabase');
const { calcularRutaOptima } = require('../services/routes');

// Calcula la ruta óptima para una fecha específica (YYYY-MM-DD).
// Se usa tanto para el job nocturno (mañana) como para recálculo de urgencias (hoy).
async function calcularRutaDelDia(fechaISO) {
  const citas = await obtenerCitasDelDia(fechaISO);

  if (citas.length === 0) {
    console.log(`[Rutas] Sin citas confirmadas para ${fechaISO}`);
    return null;
  }

  const { citasConMetricas, totalKm, totalMin } = await calcularRutaOptima(citas);
  await guardarRutaDiaria(fechaISO, citasConMetricas, totalKm, totalMin);

  console.log(
    `[Rutas] Ruta calculada para ${fechaISO}: ${citas.length} citas, ${totalKm.toFixed(1)} km, ${totalMin.toFixed(0)} min`
  );

  return { citasConMetricas, totalKm, totalMin };
}

function fechaISODeMañana() {
  // El servidor corre en UTC. Entre las 7pm y medianoche hora Bogotá,
  // new Date() ya cae en el día siguiente en UTC, así que sumarle un día
  // con setDate()/toISOString() se adelanta DOS días en vez de uno.
  // Hay que calcular "mañana" sobre el calendario de Bogotá, no el del servidor.
  const hoyBogota = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
  const mañana = new Date(`${hoyBogota}T12:00:00-05:00`);
  mañana.setDate(mañana.getDate() + 1);
  return mañana.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
}

module.exports = { calcularRutaDelDia, fechaISODeMañana };
