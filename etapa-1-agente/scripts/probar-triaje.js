// Banco de casos del triaje. Corre sin llaves ni red:
//   node scripts/probar-triaje.js
//
// Si el veterinario cambia un criterio, este archivo es el sitio donde se
// deja escrito qué se espera, para que nadie lo rompa sin darse cuenta.

const { evaluarSintomas } = require('../src/services/triage');

const CASOS = [
  // --- Emergencias: NO se resuelven a domicilio ---
  ['mi perro no puede respirar bien y tiene la lengua morada', { nivel: 'critica' }],
  ['se está convulsionando', { nivel: 'critica' }],
  ['lo atropelló una moto hace 10 minutos', { nivel: 'critica' }],
  ['creo que se comió veneno para ratas', { nivel: 'critica' }],
  ['mi gato lleva todo el día intentando orinar y no puede', { nivel: 'critica' }],
  ['tiene la barriga hinchada y dura, hace arcadas sin vomitar', { nivel: 'critica' }],
  ['está vomitando sangre', { nivel: 'critica' }],
  ['se desmayó y no responde', { nivel: 'critica' }],

  // --- Enfermedad que sí se atiende a domicilio ---
  ['mi perrita lleva dos días vomitando y no quiere comer', { nivel: 'alta', cuadro: 'digestivo' }],
  ['tiene diarrea desde ayer', { nivel: 'alta', cuadro: 'digestivo' }],
  ['orina con sangre', { nivel: 'alta', cuadro: 'urinario' }],
  ['no le baja la fiebre y está muy decaído', { nivel: 'alta', cuadro: 'sistemico' }],
  ['está cojeando de la pata de atrás', { nivel: 'alta', cuadro: 'locomotor' }],
  ['tiene el ojo rojo y no lo abre', { nivel: 'alta', cuadro: 'ojos' }],
  ['lleva una semana con tos', { nivel: 'alta', cuadro: 'respiratorio' }],

  // --- Cosas que pueden esperar ---
  ['se rasca mucho y se le está cayendo el pelo', { nivel: 'media', cuadro: 'piel' }],
  ['sacude mucho la cabeza y le huele feo la oreja', { nivel: 'media', cuadro: 'oido' }],

  // --- Visitas de rutina ---
  ['quiero vacunar a mi cachorro', { nivel: 'baja', cuadro: 'vacunacion' }],
  ['necesito desparasitar a mi gata', { nivel: 'baja', cuadro: 'desparasitacion' }],

  // --- La urgencia que declara el cliente sube el nivel, nunca lo baja ---
  ['necesito una cita urgente, se rasca mucho', { nivel: 'alta' }],
  ['quiero vacunarlo, es urgente', { nivel: 'alta' }],
];

let fallos = 0;

for (const [texto, esperado] of CASOS) {
  const r = evaluarSintomas(texto);
  const errores = [];

  if (r.nivel !== esperado.nivel) errores.push(`nivel: esperaba ${esperado.nivel}, dio ${r.nivel}`);
  if (esperado.cuadro && !r.cuadros.includes(esperado.cuadro)) {
    errores.push(`cuadro: esperaba "${esperado.cuadro}", detectó [${r.cuadros.join(', ') || 'ninguno'}]`);
  }
  // Todo cuadro que no sea emergencia pura debe decirle al veterinario qué alistar.
  if (r.nivel !== 'critica' && r.cuadros.length && !r.muestras.length) {
    errores.push('no sugirió ninguna muestra pese a detectar un cuadro');
  }

  if (errores.length) {
    fallos++;
    console.log(`✗ "${texto}"`);
    errores.forEach((e) => console.log(`    ${e}`));
  } else {
    const detalle = r.critica ? r.razonesCriticas[0] : r.cuadros.join(', ') || 'sin cuadro';
    console.log(`✓ ${r.nivel.padEnd(8)} "${texto}"  →  ${detalle}`);
  }
}

console.log(`\n${CASOS.length - fallos}/${CASOS.length} casos correctos`);
process.exit(fallos ? 1 : 0);
