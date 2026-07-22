// Máquina de estado para el flujo de agendamiento.
// Estado en memoria por ahora — Etapa 2 lo migra a Supabase.

const sesiones = new Map();

const PASOS = {
  INICIO: 'INICIO',
  PEDIR_NOMBRE_DUENO: 'PEDIR_NOMBRE_DUENO',
  PEDIR_NOMBRE_MASCOTA: 'PEDIR_NOMBRE_MASCOTA',
  PEDIR_ESPECIE: 'PEDIR_ESPECIE',
  PEDIR_DIRECCION: 'PEDIR_DIRECCION',
  PEDIR_TIPO_CONSULTA: 'PEDIR_TIPO_CONSULTA',
  PEDIR_FECHA_HORA: 'PEDIR_FECHA_HORA',
  CONFIRMAR: 'CONFIRMAR',
  COMPLETADO: 'COMPLETADO',
};

const MENSAJES = {
  BIENVENIDA:
    '¡Hola! Soy el asistente de *MÜVA PETS* 🐾\nVoy a ayudarte a agendar tu cita veterinaria a domicilio.\n\n¿Cuál es tu nombre completo?',
  PEDIR_NOMBRE_MASCOTA: '¿Cuál es el nombre de tu mascota?',
  PEDIR_ESPECIE:
    '¿Qué tipo de animal es? (Ej: perro, gato, conejo...)',
  PEDIR_DIRECCION:
    '¿En qué dirección o barrio te encuentras en Bogotá?',
  PEDIR_TIPO_CONSULTA:
    '¿Es una consulta de *urgencia* (hoy mismo) o una consulta *programada* (un día específico)?',
  PEDIR_FECHA_HORA:
    '¿Qué fecha y hora prefieres? Nuestras citas se atienden de *8:00 a.m. a 4:00 p.m.*',
  FAQ_PRECIOS:
    'Nuestras consultas a domicilio tienen un valor base que varía según el tipo de servicio. Escríbenos para darte una cotización exacta o para agendar tu cita 🐾',
  NO_ENTENDIDO:
    'Disculpa, no entendí bien tu respuesta. ¿Puedes intentarlo de nuevo?',
};

function obtenerSesion(id) {
  if (!sesiones.has(id)) {
    sesiones.set(id, { paso: PASOS.INICIO, datos: {} });
  }
  return sesiones.get(id);
}

function avanzarConversacion(id, mensajeUsuario) {
  const sesion = obtenerSesion(id);
  const { paso, datos } = sesion;
  let respuesta = null;

  switch (paso) {
    case PASOS.INICIO:
    case PASOS.PEDIR_NOMBRE_DUENO:
      datos.nombreDueno = mensajeUsuario.trim();
      sesion.paso = PASOS.PEDIR_NOMBRE_MASCOTA;
      respuesta = MENSAJES.PEDIR_NOMBRE_MASCOTA;
      break;

    case PASOS.PEDIR_NOMBRE_MASCOTA:
      datos.nombreMascota = mensajeUsuario.trim();
      sesion.paso = PASOS.PEDIR_ESPECIE;
      respuesta = MENSAJES.PEDIR_ESPECIE;
      break;

    case PASOS.PEDIR_ESPECIE:
      datos.especie = mensajeUsuario.trim();
      sesion.paso = PASOS.PEDIR_DIRECCION;
      respuesta = MENSAJES.PEDIR_DIRECCION;
      break;

    case PASOS.PEDIR_DIRECCION:
      datos.direccion = mensajeUsuario.trim();
      sesion.paso = PASOS.PEDIR_TIPO_CONSULTA;
      respuesta = MENSAJES.PEDIR_TIPO_CONSULTA;
      break;

    case PASOS.PEDIR_TIPO_CONSULTA:
      datos.tipoConsulta = mensajeUsuario.trim();
      sesion.paso = PASOS.PEDIR_FECHA_HORA;
      respuesta = MENSAJES.PEDIR_FECHA_HORA;
      break;

    case PASOS.PEDIR_FECHA_HORA:
      datos.fechaHora = mensajeUsuario.trim();
      sesion.paso = PASOS.CONFIRMAR;
      respuesta =
        `Perfecto, déjame confirmar tu cita:\n\n` +
        `👤 *A nombre de:* ${datos.nombreDueno}\n` +
        `🐾 *Mascota:* ${datos.nombreMascota} (${datos.especie})\n` +
        `📍 *Dirección:* ${datos.direccion}\n` +
        `🏥 *Tipo:* ${datos.tipoConsulta}\n` +
        `📅 *Fecha/hora:* ${datos.fechaHora}\n\n` +
        `¿Confirmas? Responde *SÍ* para finalizar o *NO* para corregir.`;
      break;

    case PASOS.CONFIRMAR: {
      const respuestaLower = mensajeUsuario.toLowerCase().trim();
      if (respuestaLower.startsWith('s') || respuestaLower === 'si' || respuestaLower === 'sí') {
        sesion.paso = PASOS.COMPLETADO;
        respuesta =
          '✅ ¡Tu cita ha sido agendada! Un veterinario de MÜVA PETS se pondrá en contacto contigo para confirmarte la hora exacta. ¡Hasta pronto! 🐾';
      } else {
        sesion.paso = PASOS.PEDIR_NOMBRE_DUENO;
        sesion.datos = {};
        respuesta = '¡Sin problema! Empecemos de nuevo.\n\n' + MENSAJES.BIENVENIDA;
      }
      break;
    }

    default:
      respuesta = MENSAJES.NO_ENTENDIDO;
  }

  return { respuesta, datos: sesion.datos, completado: sesion.paso === PASOS.COMPLETADO };
}

function iniciarAgendamiento(id) {
  sesiones.set(id, { paso: PASOS.PEDIR_NOMBRE_DUENO, datos: {} });
  return MENSAJES.BIENVENIDA;
}

function responderFAQ() {
  return MENSAJES.FAQ_PRECIOS;
}

module.exports = { avanzarConversacion, iniciarAgendamiento, responderFAQ, PASOS, obtenerSesion };
