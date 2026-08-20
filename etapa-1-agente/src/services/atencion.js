// Punto único de entrada de todo mensaje que llega por chat.
//
// Antes esta lógica estaba duplicada en los dos webhooks (WhatsApp e
// Instagram) y cada arreglo había que hacerlo dos veces. Ahora los webhooks
// solo traducen el formato de Meta y llaman aquí.
//
// Aquí vive lo que hace que la conversación se sienta de persona y no de
// sistema: agrupar los mensajes que el cliente manda seguidos, escribir en
// varios globos cortos con pausas, y darle al modelo el contexto de hoy y
// del cliente que ya conocemos.

const { responder } = require('./agente');
const { evaluarSintomas, resumirPreparacion } = require('./triage');
const { crearCita, actualizarEventoVeterinario, obtenerContextoCliente } = require('./supabase');
const { crearEventoVeterinario } = require('./calendar');
const { interpretarFechaHora } = require('./interpretarFecha');
const { calcularRutaDelDia, fechaISODeMañana } = require('../jobs/calcularRutaDelDia');

const ESPERA_AGRUPACION_MS = 2500;   // cuánto se espera por si sigue escribiendo
const PAUSA_ENTRE_GLOBOS_MS = 1400;  // ritmo entre mensajes seguidos
const HORA_APERTURA = 8;
const HORA_CIERRE = 16;
const HORA_JOB_NOCTURNO = 20; // el cron de rutas de index.js corre a las 8:00 p.m.

// Mensajes que llegaron y aún no se procesan, por contacto.
const pendientes = new Map();

const ahoraBogota = () =>
  new Date().toLocaleString('es-CO', {
    timeZone: 'America/Bogota',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

const horaLegible = (fecha) =>
  new Date(fecha).toLocaleString('es-CO', {
    timeZone: 'America/Bogota',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// Minutos transcurridos del día en Bogotá. Comparar horas enteras deja
// fuera los bordes (las 4:00 p.m. exactas) y los minutos (4:30 p.m.).
function minutosDelDiaBogota(fecha) {
  const [h, m] = new Date(fecha)
    .toLocaleTimeString('en-GB', { timeZone: 'America/Bogota', hour12: false, hour: '2-digit', minute: '2-digit' })
    .split(':')
    .map(Number);
  return h * 60 + m;
}

// ¿Todavía se puede agendar algo para hoy? El agente no debe deducirlo por
// su cuenta: en la prueba en vivo ofreció "hoy a las 3pm" siendo las 7:40
// de la noche, y luego se disculpó tres veces seguidas.
const quedaEspacioHoy = () => minutosDelDiaBogota(new Date()) < HORA_CIERRE * 60;

// ---------------------------------------------------------------------------
// Contexto volátil: todo lo que cambia entre un mensaje y otro. Va aparte
// del prompt estable para no romper la caché de la API.
// ---------------------------------------------------------------------------

function armarContexto({ canal, cliente, alerta }) {
  const partes = [`Ahora mismo en Bogotá es ${ahoraBogota()}.`, `Canal: ${canal}.`];

  // Calculado acá, no deducido por el modelo. En la prueba en vivo ofreció
  // "hoy a las 4pm" y después "hoy a las 3pm" siendo las 7:40 p.m., y
  // terminó disculpándose tres veces seguidas con el cliente.
  const ahora = minutosDelDiaBogota(new Date());
  if (ahora < HORA_APERTURA * 60) {
    partes.push(`HOY todavía no abre: la jornada va de 8:00 a.m. a 4:00 p.m. El primer espacio de hoy son las 8:00 a.m.`);
  } else if (ahora <= HORA_CIERRE * 60) {
    const proxima = Math.min(Math.ceil((ahora + 30) / 30) * 30, HORA_CIERRE * 60);
    const hh = Math.floor(proxima / 60);
    const mm = String(proxima % 60).padStart(2, '0');
    const h12 = hh > 12 ? hh - 12 : hh;
    partes.push(
      `HOY todavía se puede agendar. El primer espacio realista de hoy es a las ${h12}:${mm} ${hh >= 12 ? 'p.m.' : 'a.m.'}, ` +
        `y el último son las 4:00 p.m. NO ofrezcas horas de hoy anteriores a esa: ya pasaron.`
    );
  } else {
    partes.push(
      `HOY YA CERRÓ (la jornada termina a las 4:00 p.m.). No ofrezcas ninguna hora de hoy, ni siquiera "más tarde". ` +
        `Lo más pronto es MAÑANA entre 8:00 a.m. y 4:00 p.m. Si es una emergencia, aplica el protocolo de urgencias.`
    );
  }

  if (cliente) {
    partes.push(
      `Esta persona ya es cliente de MÜVA: se llama ${cliente.nombre}. ` +
        (cliente.mascotas.length
          ? `Mascotas registradas: ${cliente.mascotas
              .map((m) => `${m.nombre}${m.especie ? ` (${m.especie})` : ''}`)
              .join(', ')}. ` +
            `Salúdala como a alguien conocido y no le vuelvas a pedir el nombre. ` +
            `Si vuelve por la misma mascota, confirma cuál es en vez de preguntarlo desde cero.`
          : 'Salúdala como a alguien conocido y no le vuelvas a pedir el nombre.')
    );
  } else {
    partes.push('Es la primera vez que esta persona escribe.');
  }

  if (alerta) partes.push(alerta);

  return partes.join('\n');
}

function alertaDeTriaje(texto) {
  const evaluacion = evaluarSintomas(texto);
  if (!evaluacion.critica) return null;
  return (
    `ALERTA DE TRIAJE: en este mensaje hay señales de emergencia real (${evaluacion.razonesCriticas.join('; ')}). ` +
    `Antes de cualquier otra cosa, dile que lleve la mascota YA a una clínica veterinaria de urgencias 24 horas, ` +
    `explícale en una línea por qué no da espera, y solo después ofrece coordinar el seguimiento a domicilio. ` +
    `No le pidas dirección ni horarios como si fuera una cita normal.`
  );
}

// ---------------------------------------------------------------------------
// La única herramienta que el modelo puede ejecutar.
// ---------------------------------------------------------------------------

async function agendarCita(canal, contactoId, entrada) {
  const evaluacion = evaluarSintomas(`${entrada.motivo_consulta || ''} ${entrada.sintomas || ''}`);

  const datos = {
    canal,
    contactoId,
    nombreDueno: entrada.nombre_dueno,
    nombreMascota: entrada.nombre_mascota,
    especie: entrada.especie,
    direccion: entrada.direccion,
    // tipo_consulta es la columna que ya leen el panel y la app del
    // veterinario; se sigue alimentando para no romper nada existente.
    tipoConsulta: entrada.tipo_servicio,
    tipoServicio: entrada.tipo_servicio,
    motivoConsulta: entrada.motivo_consulta,
    sintomas: entrada.sintomas || null,
    edadAproximada: entrada.edad_aproximada || null,
    nivelUrgencia: evaluacion.nivel,
    muestrasSugeridas: evaluacion.muestras,
    preparacionCliente: evaluacion.preparacion,
    fechaHora: entrada.fecha_hora_texto,
  };

  // Se valida ANTES de tocar Google Calendar y Supabase: si el horario no
  // sirve, no puede quedar un evento fantasma en la agenda del veterinario.
  const { inicio, interpretado } = interpretarFechaHora(datos.fechaHora, datos.tipoConsulta);

  // Las 4:00 p.m. SÍ son agendables: son el último espacio del día, no el
  // primero que sobra. Comparar solo la hora entera (`hora >= 16`) rechazaba
  // exactamente las 4pm, que es la hora que más pide la gente al final de la
  // tarde — y el agente ya le había dicho al cliente que sí se podía.
  const minutos = minutosDelDiaBogota(inicio);
  if (minutos < HORA_APERTURA * 60 || minutos > HORA_CIERRE * 60) {
    return {
      ok: false,
      error: `La hora acordada ("${entrada.fecha_hora_texto}") queda fuera de la franja de atención: se atiende de 8:00 a.m. a 4:00 p.m., y las 4:00 p.m. son el último espacio. No se agendó nada. Propónle otra hora dentro de ese horario.`,
    };
  }
  if (inicio < new Date()) {
    return {
      ok: false,
      error:
        `Esa fecha y hora ("${entrada.fecha_hora_texto}") ya pasaron. No se agendó nada. ` +
        `${quedaEspacioHoy() ? 'Hoy todavía se puede: ofrécele un horario de aquí en adelante.' : 'Hoy ya se cerró la jornada: ofrécele mañana entre 8:00 a.m. y 4:00 p.m.'}`,
    };
  }

  // ORDEN IMPORTANTE: primero Supabase, después Google Calendar.
  //
  // Antes era al revés, y por eso un refresh token vencido de Google tumbó
  // una cita entera en la primera prueba con un cliente: Calendar reventaba
  // y la cita no llegaba a guardarse nunca. El sistema de registro es
  // Supabase — de ahí leen la app del veterinario, el panel y las rutas.
  // Calendar es una COPIA para que MÜVA la vea en su agenda. Que falle la
  // copia no puede costar el original.
  let cita;
  try {
    cita = await crearCita(datos);
  } catch (err) {
    // Esto sí es fatal: sin registro no hay cita. Queda el volcado en los
    // logs para poder recuperarla a mano y llamar al cliente.
    console.error(`[Atención] FALLÓ al guardar la cita en Supabase: ${err.message}`);
    console.error('[Atención] Cita NO guardada. Datos para recuperarla:', JSON.stringify(datos));
    if (err.stack) console.error(err.stack);
    err.pasoQueFallo = 'guardar la cita en Supabase';
    throw err;
  }

  let eventoId = null;
  try {
    ({ eventoId } = await crearEventoVeterinario(datos));
  } catch (err) {
    // La cita YA está guardada y va a salir en la ruta del veterinario.
    // Solo falta el reflejo en la agenda de MÜVA.
    console.error(
      `[Atención] ⚠ Cita ${cita.id} guardada SIN evento en Google Calendar: ${err.message}`
    );
    console.error(
      '[Atención] ⚠ Revisar GOOGLE_REFRESH_TOKEN. La cita está en Supabase y el veterinario la verá; ' +
        'lo que falta es el evento en el calendario de MÜVA.'
    );
  }

  // Se confirma con la fecha que calculamos nosotros, no con la que
  // devolvía Calendar: así la cita queda confirmada aunque Google falle.
  await actualizarEventoVeterinario(cita.id, eventoId, inicio);

  console.log(
    `[Atención] Cita ${cita.id} agendada (${canal}) — urgencia ${evaluacion.nivel} — ` +
      `${horaLegible(inicio)}${eventoId ? '' : ' — SIN evento en Calendar'}`
  );

  reordenarRutaSiHaceFalta(inicio);

  return {
    ok: true,
    quedo_agendada_para: horaLegible(inicio),
    // Cuando el parser no logró leer día y hora con certeza, el modelo debe
    // confirmarlo en voz alta en vez de darlo por hecho.
    confirmar_con_el_cliente: !interpretado,
    preparacion_para_el_cliente: resumirPreparacion(evaluacion),
    nivel_urgencia: evaluacion.nivel,
    nota: 'Cuéntaselo con tus palabras, en corto. No repitas esta información como lista.',
  };
}

// Una urgencia que entra a media mañana no sirve de nada si el veterinario
// la ve al final de la lista: hay que reordenar la ruta que ya está en
// curso. El job nocturno corre a las 8:00 p.m. y solo arma la de mañana,
// así que estos dos casos quedaban fuera:
//
//   · la cita es para HOY (la ruta del día ya estaba calculada);
//   · la cita es para MAÑANA pero entró después de las 8:00 p.m., o sea
//     cuando el job de esta noche ya pasó.
//
// Se dispara sin await a propósito: el cliente no puede quedarse esperando
// en el chat a que Google Directions conteste, y si el recálculo falla, la
// cita ya quedó guardada igual — solo se pierde el orden óptimo.
// La decisión va aparte y sin depender del reloj para poder probar las
// cuatro ramas; si dependiera de la hora real, la mitad de los casos solo
// se podrían verificar de noche.
function debeReordenar({ fechaCita, hoy, manana, horaActual }) {
  if (fechaCita === hoy) return true;
  if (fechaCita === manana && horaActual >= HORA_JOB_NOCTURNO) return true;
  return false;
}

function reordenarRutaSiHaceFalta(fechaHoraConfirmada) {
  const fechaCita = new Date(fechaHoraConfirmada).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
  const horaActual = Number(
    new Date().toLocaleString('en-US', { timeZone: 'America/Bogota', hour: '2-digit', hour12: false })
  );

  if (!debeReordenar({ fechaCita, hoy, manana: fechaISODeMañana(), horaActual })) return;

  calcularRutaDelDia(fechaCita)
    .then((r) => {
      if (r) console.log(`[Atención] Ruta de ${fechaCita} reordenada tras agendar (${r.totalKm.toFixed(1)} km)`);
    })
    .catch((err) => console.error(`[Atención] No se pudo reordenar la ruta de ${fechaCita}:`, err.message));
}

// ---------------------------------------------------------------------------
// Entrada pública
// ---------------------------------------------------------------------------

/**
 * Recibe un mensaje de chat. No responde de inmediato: espera unos segundos
 * por si el cliente sigue escribiendo (la gente manda "hola" / "tengo una
 * urgencia" / "mi perro está vomitando" en tres mensajes separados) y luego
 * los procesa como uno solo.
 */
function recibirMensaje({ canal, contactoId, texto, enviar }) {
  const id = `${canal}:${contactoId}`;
  const pendiente = pendientes.get(id);

  if (pendiente) {
    pendiente.textos.push(texto);
    clearTimeout(pendiente.temporizador);
    pendiente.temporizador = setTimeout(() => procesar(id), ESPERA_AGRUPACION_MS);
    return;
  }

  pendientes.set(id, {
    canal,
    contactoId,
    enviar,
    textos: [texto],
    temporizador: setTimeout(() => procesar(id), ESPERA_AGRUPACION_MS),
  });
}

async function procesar(id) {
  const pendiente = pendientes.get(id);
  if (!pendiente) return;
  pendientes.delete(id);

  const { canal, contactoId, enviar, textos } = pendiente;
  const texto = textos.join('\n');

  try {
    let cliente = null;
    try {
      cliente = await obtenerContextoCliente(canal, contactoId);
    } catch (err) {
      // Que no sepamos su historial no puede impedir atenderlo.
      console.error('[Atención] No se pudo cargar el contexto del cliente:', err.message);
    }

    const contexto = armarContexto({ canal, cliente, alerta: alertaDeTriaje(texto) });

    const { textos: respuestas } = await responder({
      id,
      texto,
      contexto,
      ejecutarHerramienta: (nombre, entrada) => {
        if (nombre !== 'agendar_cita') throw new Error(`Herramienta desconocida: ${nombre}`);
        return agendarCita(canal, contactoId, entrada);
      },
    });

    for (const [i, respuesta] of respuestas.entries()) {
      // Un párrafo largo delata al bot. Si el modelo separó ideas con línea
      // en blanco, se mandan como globos distintos, con una pausa corta.
      for (const [j, globo] of respuesta.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean).entries()) {
        if (i + j > 0) await esperar(PAUSA_ENTRE_GLOBOS_MS);
        await enviar(globo);
      }
    }
  } catch (err) {
    console.error('[Atención] Error procesando mensaje:', err.message);
    try {
      await enviar('Qué pena, se me trabó el chat un momento. ¿Me escribes de nuevo?');
    } catch (_) {
      /* si tampoco se puede enviar, ya quedó en logs */
    }
  }
}

module.exports = { recibirMensaje, debeReordenar, minutosDelDiaBogota };
