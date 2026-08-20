// Prueba de integración del manejador de mensajes:
//
//   node scripts/probar-atencion.js
//
// Sustituye todo lo externo (Claude, Supabase, Google, Meta) por
// cascarones, así que corre sin credenciales y sin red. Cubre lo que ya se
// rompió alguna vez: la agrupación de mensajes seguidos, el reparto en
// globos, los guardarraíles de horario y que el triaje quede guardado.

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://pruebas.supabase.co';
process.env.SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || 'pruebas';

const path = require('path');
const ruta = (p) => require.resolve(path.join(__dirname, '..', p));

const llamadas = { modelo: [], citas: [], eventos: [], rutas: [] };
let guion = null;      // qué debe pedir el "modelo" en el próximo turno
let fallaGuardado = false;
let fallaCalendar = false;

function stub(p, exports) {
  const id = ruta(p);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}

const { interpretarFechaHora } = require(ruta('src/services/interpretarFecha.js'));
const { fechaISODeMañana } = require(ruta('src/jobs/calcularRutaDelDia.js'));

stub('src/services/agente.js', {
  responder: async ({ id, texto, contexto, ejecutarHerramienta }) => {
    llamadas.modelo.push({ id, texto, contexto });
    if (!guion) return { textos: ['primer globo\n\nsegundo globo'], fallo: false };
    const entrada = guion;
    guion = null;
    let r;
    try {
      r = await ejecutarHerramienta('agendar_cita', entrada);
    } catch (err) {
      r = { ok: false, error: 'excepción: ' + err.message, paso: err.pasoQueFallo };
    }
    return { textos: [JSON.stringify(r)], fallo: false };
  },
  olvidarConversacion: () => {},
});

stub('src/services/supabase.js', {
  obtenerContextoCliente: async () => ({ nombre: 'Laura', mascotas: [{ nombre: 'Kleo', especie: 'perro' }] }),
  crearCita: async (d) => {
    if (fallaGuardado) throw new Error('column "tipo_servicio" does not exist');
    llamadas.citas.push(d);
    return { id: 'cita-1' };
  },
  actualizarEventoVeterinario: async () => {},
});

stub('src/services/calendar.js', {
  crearEventoVeterinario: async (d) => {
    if (fallaCalendar) throw new Error('invalid_grant: token has been expired or revoked');
    llamadas.eventos.push(d);
    const { inicio, interpretado } = interpretarFechaHora(d.fechaHora, d.tipoConsulta);
    return { eventoId: 'evt-1', fechaHoraConfirmada: inicio, interpretado };
  },
});

stub('src/jobs/calcularRutaDelDia.js', {
  fechaISODeMañana,
  calcularRutaDelDia: async (f) => { llamadas.rutas.push(f); return { totalKm: 10, totalMin: 30 }; },
});

const { recibirMensaje } = require(ruta('src/services/atencion.js'));

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
let fallos = 0;
const revisar = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) fallos++; };

const CITA = (fechaTexto) => ({
  nombre_dueno: 'Laura', nombre_mascota: 'Isis', especie: 'perro',
  direccion: 'Cra 7f #148-45, Cedritos', tipo_servicio: 'vacunacion',
  motivo_consulta: 'vacunación anual', sintomas: '',
  fecha_hora_texto: fechaTexto,
});

async function conversar(id, texto) {
  const dichos = [];
  recibirMensaje({ canal: 'whatsapp', contactoId: id, texto, enviar: async (t) => dichos.push(t) });
  await esperar(3800);
  return dichos.join(' ');
}

(async () => {
  // ── 1. Mensajes seguidos se agrupan en un solo turno ──
  const dichos = [];
  const enviar = async (t) => dichos.push(t);
  recibirMensaje({ canal: 'whatsapp', contactoId: '5731', texto: 'hola', enviar });
  await esperar(300);
  recibirMensaje({ canal: 'whatsapp', contactoId: '5731', texto: 'buenas tardes', enviar });
  await esperar(300);
  recibirMensaje({ canal: 'whatsapp', contactoId: '5731', texto: 'mi perro está mal', enviar });
  await esperar(4200);

  revisar(llamadas.modelo.length === 1, `3 mensajes seguidos → 1 turno (fueron ${llamadas.modelo.length})`);
  revisar(dichos.length === 2, `respuesta con línea en blanco → 2 globos (fueron ${dichos.length})`);
  revisar(/ya es cliente de MÜVA/.test(llamadas.modelo[0].contexto), 'el contexto trae al cliente conocido');
  revisar(/HOY (YA CERRÓ|todavía)/.test(llamadas.modelo[0].contexto), 'el contexto dice si hoy todavía se puede agendar');

  // ── 2. Emergencia real dispara la alerta de triaje ──
  llamadas.modelo.length = 0;
  await conversar('5732', 'mi gato no puede orinar');
  revisar(/ALERTA DE TRIAJE/.test(llamadas.modelo[0].contexto), 'una emergencia real dispara la alerta');

  // ── 3. Las 4:00 p.m. SÍ se agendan (el fallo de la prueba en vivo) ──
  llamadas.citas.length = 0; llamadas.eventos.length = 0;
  guion = CITA('mañana a las 4pm');
  let r = await conversar('5733', 'confirmado');
  revisar(llamadas.citas.length === 1, 'una cita a las 4:00 p.m. SÍ se agenda');
  revisar(!/fuera de la franja/.test(r), 'no la rechaza por horario');

  // ── 4. Fuera de la franja no se guarda NADA ──
  llamadas.citas.length = 0; llamadas.eventos.length = 0;
  guion = CITA('mañana a las 7 de la noche');
  r = await conversar('5734', 'confirmado');
  revisar(llamadas.citas.length === 0, 'las 7 p.m. no se guardan');
  revisar(llamadas.eventos.length === 0, 'ni queda evento fantasma en Calendar');
  revisar(/fuera de la franja/.test(r), 'y se le explica el motivo al modelo');

  // ── 5. El triaje queda guardado con la cita ──
  llamadas.citas.length = 0;
  guion = { ...CITA('mañana a las 10am'), tipo_servicio: 'consulta',
            motivo_consulta: 'vomita desde ayer', sintomas: 'vómito y diarrea desde ayer' };
  r = await conversar('5735', 'confirmado');
  const cita = llamadas.citas[0];
  revisar(cita && cita.nivelUrgencia === 'alta', `urgencia calculada y guardada (${cita && cita.nivelUrgencia})`);
  revisar(cita && cita.muestrasSugeridas.some((m) => /Coprológico/.test(m)), 'muestras a alistar guardadas');
  revisar(/popó fresca/.test(r), 'al cliente se le dice qué preparar');

  // ── 6. Si Google Calendar falla, la cita SE GUARDA IGUAL ──
  //    Esto es lo que tumbó la primera prueba en vivo: el refresh token de
  //    Google estaba vencido y se perdía la cita entera.
  fallaCalendar = true;
  llamadas.citas.length = 0;
  guion = CITA('mañana a las 2pm');
  r = await conversar('5737', 'confirmado');
  fallaCalendar = false;
  revisar(llamadas.citas.length === 1, 'con Calendar caído, la cita SÍ se guarda en Supabase');
  revisar(/"ok":true/.test(r), 'y al cliente se le confirma normalmente');

  // ── 7. Si el guardado falla, NO se le puede decir que quedó guardado ──
  fallaGuardado = true;
  llamadas.citas.length = 0;
  guion = CITA('mañana a las 11am');
  r = await conversar('5736', 'confirmado');
  fallaGuardado = false;
  revisar(/excepción/.test(r), 'un fallo al guardar se propaga como excepción, no como éxito silencioso');
  revisar(/guardar la cita en Supabase/.test(r), `el error dice EN QUÉ PASO falló (${(r.match(/"paso":"[^"]*"/) || [''])[0]})`);

  console.log(fallos ? `\n${fallos} fallos` : '\nTodo correcto');
  process.exit(fallos ? 1 : 0);
})();
