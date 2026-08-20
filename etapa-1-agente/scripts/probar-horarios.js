// Bordes de la franja de atención (8:00 a.m. – 4:00 p.m.):
//
//   node scripts/probar-horarios.js
//
// Nace de una prueba en vivo: el cliente pidió las 4:00 p.m., el agente le
// dijo que sí (es el último espacio del día) y el sistema se lo rechazó,
// porque comparaba `hora >= 16` y las 4:00 p.m. dan exactamente 16.

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://pruebas.supabase.co';
process.env.SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || 'pruebas';

// Cargar atencion.js de verdad arrastra googleapis, que tarda más de un
// minuto. Como solo se prueba la validación de horario, se sustituye.
const path = require('path');
for (const [modulo, exports] of [
  ['../src/services/calendar.js', { crearEventoVeterinario: async () => ({}) }],
  ['../src/services/agente.js', { responder: () => {}, olvidarConversacion: () => {} }],
  ['../src/jobs/calcularRutaDelDia.js', { calcularRutaDelDia: () => {}, fechaISODeMañana: () => '' }],
  ['../src/services/supabase.js', {
    crearCita: async () => ({ id: 'x' }),
    actualizarEventoVeterinario: async () => {},
    obtenerContextoCliente: async () => null,
  }],
]) {
  const id = require.resolve(path.join(__dirname, modulo));
  require.cache[id] = { id, filename: id, loaded: true, exports };
}

const { minutosDelDiaBogota } = require('../src/services/atencion');
const { interpretarFechaHora } = require('../src/services/interpretarFecha');

const APERTURA = 8 * 60;
const CIERRE = 16 * 60;

// Misma comparación que hace agendarCita.
const dentroDeFranja = (texto) => {
  const { inicio } = interpretarFechaHora(texto, 'consulta');
  const m = minutosDelDiaBogota(inicio);
  return m >= APERTURA && m <= CIERRE;
};

const CASOS = [
  ['mañana a las 8am', true, 'primer espacio del día'],
  ['mañana a las 8:30am', true, 'dentro'],
  ['mañana a las 12m', true, 'mediodía'],
  ['mañana a las 3pm', true, 'dentro'],
  ['mañana a las 3:30pm', true, 'dentro'],
  ['mañana a las 4pm', true, 'ÚLTIMO espacio del día — este es el que fallaba'],
  ['mañana a las 4:30pm', false, 'ya se pasó del cierre'],
  ['mañana a las 5pm', false, 'fuera'],
  ['mañana a las 7pm', false, 'fuera'],
  ['mañana a las 7am', false, 'antes de abrir'],
  ['mañana a las 6am', false, 'antes de abrir'],
];

let fallos = 0;
for (const [texto, esperado, nota] of CASOS) {
  const r = dentroDeFranja(texto);
  const ok = r === esperado;
  if (!ok) fallos++;
  console.log(`${ok ? '✓' : '✗'} ${texto.padEnd(24)} ${r ? 'se agenda' : 'se rechaza'}  · ${nota}`);
  if (!ok) console.log(`    ESPERABA ${esperado ? 'que se agendara' : 'que se rechazara'}`);
}

console.log(`\n${CASOS.length - fallos}/${CASOS.length} casos correctos`);
process.exit(fallos ? 1 : 0);
