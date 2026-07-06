require('dotenv').config();
const axios = require('axios');

const GOOGLE_MAPS_KEY = process.env.GOOGLE_MAPS_API_KEY;

async function geocodificarDireccion(direccion) {
  const { data } = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
    params: { address: direccion, key: GOOGLE_MAPS_KEY, region: 'co' },
  });

  if (data.status !== 'OK' || !data.results.length) {
    throw new Error(`No se pudo geocodificar la dirección: "${direccion}" (${data.status})`);
  }

  const { lat, lng } = data.results[0].geometry.location;
  return { lat, lng };
}

// Calcula la ruta óptima desde el punto de partida del veterinario
// visitando todas las citas del día, minimizando distancia/tiempo total.
async function calcularRutaOptima(citas) {
  const origen = process.env.VETERINARIO_DIRECCION_BASE;
  if (!origen) {
    throw new Error('VETERINARIO_DIRECCION_BASE no está configurada — ruta no calculable aún');
  }

  const waypoints = citas.map((c) => c.direccion);

  const { data } = await axios.get('https://maps.googleapis.com/maps/api/directions/json', {
    params: {
      origin: origen,
      destination: waypoints[waypoints.length - 1],
      waypoints: `optimize:true|${waypoints.slice(0, -1).join('|')}`,
      key: GOOGLE_MAPS_KEY,
      region: 'co',
    },
  });

  if (data.status !== 'OK') {
    throw new Error(`Error calculando ruta: ${data.status}`);
  }

  const ruta = data.routes[0];
  const ordenOptimo = ruta.waypoint_order; // índices reordenados de las paradas intermedias

  // Reconstruir el orden final: paradas intermedias optimizadas + última cita al final
  const citasIntermedias = citas.slice(0, -1);
  const citasOrdenadas = ordenOptimo.map((i) => citasIntermedias[i]);
  citasOrdenadas.push(citas[citas.length - 1]);

  const totalKm = ruta.legs.reduce((sum, leg) => sum + leg.distance.value, 0) / 1000;
  const totalMin = ruta.legs.reduce((sum, leg) => sum + leg.duration.value, 0) / 60;

  const citasConMetricas = citasOrdenadas.map((cita, i) => ({
    ...cita,
    orden_ruta: i + 1,
    distancia_km: ruta.legs[i] ? ruta.legs[i].distance.value / 1000 : null,
    duracion_min: ruta.legs[i] ? ruta.legs[i].duration.value / 60 : null,
  }));

  return { citasConMetricas, totalKm, totalMin };
}

module.exports = { geocodificarDireccion, calcularRutaOptima };
