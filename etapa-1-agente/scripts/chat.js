// Conversa con el agente desde la terminal, sin WhatsApp, sin Supabase y
// sin tocar el calendario del veterinario:
//
//   ANTHROPIC_API_KEY=sk-... node scripts/chat.js
//   ANTHROPIC_API_KEY=sk-... node scripts/chat.js --conocido
//
// La herramienta agendar_cita se simula: se imprime lo que HABRÍA quedado
// guardado, con el triaje real calculado. Sirve para afinar el tono y ver
// si el agente pide lo que debe antes de cerrar una cita.

require('dotenv').config();
const readline = require('readline');
const { responder } = require('../src/services/agente');
const { evaluarSintomas, resumirPreparacion } = require('../src/services/triage');

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Falta ANTHROPIC_API_KEY. Ejecuta: ANTHROPIC_API_KEY=sk-... node scripts/chat.js');
  process.exit(1);
}

// Simula a alguien que ya escribió antes, para probar el saludo de cliente
// conocido: node scripts/chat.js --conocido
const CLIENTE = process.argv.includes('--conocido')
  ? { nombre: 'Laura Restrepo', mascotas: [{ nombre: 'Kleo', especie: 'perro' }] }
  : null;

const ID = 'terminal:pruebas';

const ahoraBogota = () =>
  new Date().toLocaleString('es-CO', {
    timeZone: 'America/Bogota',
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });

function contextoPara(texto) {
  const partes = [`Ahora mismo en Bogotá es ${ahoraBogota()}.`, 'Canal: whatsapp.'];

  partes.push(
    CLIENTE
      ? `Esta persona ya es cliente de MÜVA: se llama ${CLIENTE.nombre}. Mascotas registradas: ${CLIENTE.mascotas
          .map((m) => `${m.nombre} (${m.especie})`)
          .join(', ')}. Salúdala como a alguien conocido y no le vuelvas a pedir el nombre.`
      : 'Es la primera vez que esta persona escribe.'
  );

  const ev = evaluarSintomas(texto);
  if (ev.critica) {
    partes.push(
      `ALERTA DE TRIAJE: en este mensaje hay señales de emergencia real (${ev.razonesCriticas.join('; ')}). ` +
        `Antes de cualquier otra cosa, dile que lleve la mascota YA a una clínica veterinaria de urgencias 24 horas, ` +
        `explícale en una línea por qué no da espera, y solo después ofrece coordinar el seguimiento a domicilio. ` +
        `No le pidas dirección ni horarios como si fuera una cita normal.`
    );
    console.log(`\n  ⚑ triaje: EMERGENCIA — ${ev.razonesCriticas.join('; ')}`);
  }
  return partes.join('\n');
}

function agendarSimulado(entrada) {
  const ev = evaluarSintomas(`${entrada.motivo_consulta || ''} ${entrada.sintomas || ''}`);

  console.log('\n  ┌─ agendar_cita (simulado, no se guardó nada)');
  for (const [k, v] of Object.entries(entrada)) console.log(`  │  ${k}: ${v}`);
  console.log(`  │  → urgencia calculada: ${ev.nivel}`);
  if (ev.muestras.length) console.log(`  │  → alistar: ${ev.muestras.join(' | ')}`);
  console.log('  └─\n');

  return {
    ok: true,
    quedo_agendada_para: `(simulado) ${entrada.fecha_hora_texto}`,
    confirmar_con_el_cliente: false,
    preparacion_para_el_cliente: resumirPreparacion(ev),
    nivel_urgencia: ev.nivel,
    nota: 'Cuéntaselo con tus palabras, en corto. No repitas esta información como lista.',
  };
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

console.log(
  `\nChat de prueba con el agente de MÜVA${CLIENTE ? ' (como cliente conocido)' : ''}.` +
    `\nEscribe como escribiría un cliente. Ctrl+C para salir.\n`
);

const preguntar = () =>
  rl.question('tú › ', async (texto) => {
    if (!texto.trim()) return preguntar();

    const { textos, fallo } = await responder({
      id: ID,
      texto,
      contexto: contextoPara(texto),
      ejecutarHerramienta: (nombre, entrada) => {
        if (nombre !== 'agendar_cita') throw new Error(`Herramienta desconocida: ${nombre}`);
        return agendarSimulado(entrada);
      },
    });

    for (const t of textos) {
      // Cada línea en blanco es un globo distinto en WhatsApp; acá se ve igual.
      for (const globo of t.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean)) {
        console.log(`müva › ${globo}`);
      }
    }
    if (fallo) console.log('  (hubo un error hablando con la API)');
    console.log('');
    preguntar();
  });

preguntar();
