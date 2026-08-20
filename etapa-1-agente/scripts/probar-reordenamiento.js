// ¿Cuándo hay que reordenar la ruta al entrar una cita nueva?
//
//   node scripts/probar-reordenamiento.js
//
// El job nocturno corre a las 8:00 p.m. y solo arma la ruta de mañana.
// Estas son las cuatro situaciones posibles y lo que debe pasar en cada
// una. Se prueba sin depender del reloj: si dependiera, la mitad de los
// casos solo se podrían verificar de noche.

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://pruebas.supabase.co';
process.env.SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || 'pruebas';

// Cargar atencion.js de verdad arrastra googleapis (vía calendar.js), que
// tarda más de un minuto en cargarse. Como acá solo se prueba una función
// pura, se sustituyen las dependencias pesadas por cascarones: la prueba
// corre en milisegundos y no necesita ninguna credencial.
const path = require('path');
for (const [modulo, exports] of [
  ['../src/services/calendar.js', { crearEventoVeterinario: () => {} }],
  ['../src/services/agente.js', { responder: () => {}, olvidarConversacion: () => {} }],
  ['../src/jobs/calcularRutaDelDia.js', { calcularRutaDelDia: () => {}, fechaISODeMañana: () => '' }],
]) {
  const id = require.resolve(path.join(__dirname, modulo));
  require.cache[id] = { id, filename: id, loaded: true, exports };
}

const { debeReordenar } = require('../src/services/atencion');

const HOY = '2026-07-25';
const MANANA = '2026-07-26';

const CASOS = [
  ['cita para HOY, en plena jornada', { fechaCita: HOY, horaActual: 10 }, true,
   'la ruta del día ya estaba calculada: hay que meterla en el orden'],
  ['cita para HOY, de noche', { fechaCita: HOY, horaActual: 21 }, true,
   'aunque sea tarde, es la ruta de hoy'],
  ['cita para MAÑANA, antes de las 8pm', { fechaCita: MANANA, horaActual: 15 }, false,
   'la arma el job nocturno; recalcular ahora gasta cuota de Google de más'],
  ['cita para MAÑANA, después de las 8pm', { fechaCita: MANANA, horaActual: 21 }, true,
   'el job de esta noche ya pasó: si no se recalcula, entra sin orden'],
  ['cita para MAÑANA, justo a las 8pm', { fechaCita: MANANA, horaActual: 20 }, true,
   'el borde: a las 20:00 el job ya corrió'],
  ['cita para pasado mañana', { fechaCita: '2026-07-27', horaActual: 21 }, false,
   'la armará el job de esa noche'],
  ['cita de la semana entrante', { fechaCita: '2026-07-31', horaActual: 10 }, false,
   'falta demasiado, no se toca'],
];

let fallos = 0;

for (const [nombre, entrada, esperado, porque] of CASOS) {
  const r = debeReordenar({ ...entrada, hoy: HOY, manana: MANANA });
  const ok = r === esperado;
  if (!ok) fallos++;
  console.log(`${ok ? '✓' : '✗'} ${nombre}`);
  console.log(`    ${esperado ? 'reordena' : 'no reordena'} — ${porque}`);
  if (!ok) console.log(`    ESPERABA ${esperado}, DIO ${r}`);
}

console.log(`\n${CASOS.length - fallos}/${CASOS.length} casos correctos`);
process.exit(fallos ? 1 : 0);
