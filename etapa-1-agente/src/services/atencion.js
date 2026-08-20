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

// ---------------------------------------------------------------------------
// Contexto volátil: todo lo que cambia entre un mensaje y otro. Va aparte
// del prompt estable para no romper la caché de la API.
// ---------------------------------------------------------------------------

function armarContexto({ canal, cliente, alerta }) {
  const partes = [`Ahora mismo en Bogotá es ${ahoraBogota()}.`, `Canal: ${canal}.`];

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
  const { inicio } = interpretarFechaHora(datos.fechaHora, datos.tipoConsulta);
  const hora = Number(
    inicio.toLocaleString('en-US', { timeZone: 'America/Bogota', hour: '2-digit', hour12: false })
  );

  // El contrato fija la ventana de atención de 8 a.m. a 4 p.m.
  if (hora < HORA_APERTURA || hora >= HORA_CIERRE) {
    return {
      ok: false,
      error: `La hora acordada ("${entrada.fecha_hora_texto}") queda fuera de la franja de atención, que es de 8:00 a.m. a 4:00 p.m. No se agendó nada. Propónle otra hora dentro de ese horario y vuelve a intentarlo.`,
    };
  }
  if (inicio < new Date()) {
    return {
      ok: false,
      error: `La fecha y hora acordadas ("${entrada.fecha_hora_texto}") ya pasaron. No se agendó nada. Confirma con el cliente qué día quiere realmente.`,
    };
  }

  const { eventoId, fechaHoraConfirmada, interpretado } = await crearEventoVeterinario(datos);
  const cita = await crearCita(datos);
  await actualizarEventoVeterinario(cita.id, eventoId, fechaHoraConfirmada);

  console.log(
    `[Atención] Cita ${cita.id} agendada (${canal}) — urgencia ${evaluacion.nivel} — ${horaLegible(fechaHoraConfirmada)}`
  );

  reordenarRutaSiHaceFalta(fechaHoraConfirmada);

  return {
    ok: true,
    quedo_agendada_para: horaLegible(fechaHoraConfirmada),
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

module.exports = { recibirMensaje, debeReordenar };
