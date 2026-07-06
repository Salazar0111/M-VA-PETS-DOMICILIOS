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
  const mañana = new Date();
  mañana.setDate(mañana.getDate() + 1);
  return mañana.toISOString().split('T')[0];
}

module.exports = { calcularRutaDelDia, fechaISODeMañana };
