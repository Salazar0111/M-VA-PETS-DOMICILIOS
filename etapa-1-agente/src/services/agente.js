require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const { SYSTEM_PROMPT, HERRAMIENTAS } = require('../prompts/agente');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Sonnet por defecto: la calidad del texto ES el producto aquí — con un
// modelo más pequeño la conversación vuelve a oler a formulario. Se puede
// cambiar sin tocar código con AGENTE_MODELO.
const MODELO = process.env.AGENTE_MODELO || 'claude-sonnet-5';
const MODELO_RESPALDO = 'claude-haiku-4-5-20251001';

const MAX_VUELTAS = 4;        // llamadas al modelo por mensaje (tool use incluido)
const MAX_MENSAJES = 40;      // turnos que se conservan por conversación
const TTL_MS = 12 * 60 * 60 * 1000; // una charla queda "fría" a las 12 horas

// La memoria vive en el proceso, igual que la sesión anterior: un redeploy
// de Railway la borra. Es aceptable porque la cita ya quedó en Supabase; lo
// único que se pierde es el hilo de una charla a medias.
const historias = new Map();

function obtenerHistoria(id) {
  const previa = historias.get(id);
  if (previa && Date.now() - previa.ultimoUso < TTL_MS) return previa;
  const nueva = { mensajes: [], ultimoUso: Date.now() };
  historias.set(id, nueva);
  return nueva;
}

function limpiarHistoriasViejas() {
  const limite = Date.now() - TTL_MS;
  for (const [id, h] of historias) if (h.ultimoUso < limite) historias.delete(id);
}
setInterval(limpiarHistoriasViejas, 60 * 60 * 1000).unref();

// Recortar por la mitad del hilo puede dejar arriba un tool_result huérfano
// (sin el tool_use que lo originó), y eso la API lo rechaza con un 400.
// Por eso se descarta desde el frente hasta encontrar un turno de usuario
// que sea texto normal.
function recortar(mensajes) {
  if (mensajes.length <= MAX_MENSAJES) return mensajes;
  let corte = mensajes.length - MAX_MENSAJES;
  while (corte < mensajes.length) {
    const m = mensajes[corte];
    const esResultadoHerramienta =
      Array.isArray(m.content) && m.content.some((b) => b.type === 'tool_result');
    if (m.role === 'user' && !esResultadoHerramienta) break;
    corte++;
  }
  return mensajes.slice(corte);
}

function textoDe(contenido) {
  return contenido
    .filter((b) => b.type === 'text')
    .map((b) => b.text.trim())
    .filter(Boolean)
    .join('\n\n');
}

async function llamarModelo(system, mensajes) {
  const peticion = {
    model: MODELO,
    max_tokens: 1024,
    system,
    tools: HERRAMIENTAS,
    messages: mensajes,
  };

  try {
    return await client.messages.create(peticion);
  } catch (err) {
    // Si el modelo configurado no existe en esta cuenta, es preferible
    // responderle al cliente con un modelo más chico que dejarlo hablando
    // solo. Queda ruidoso en logs para que se corrija AGENTE_MODELO.
    if (err?.status === 404 || err?.error?.error?.type === 'not_found_error') {
      console.error(
        `[Agente] El modelo "${MODELO}" no está disponible. Respondiendo con ${MODELO_RESPALDO}. Revisa AGENTE_MODELO.`
      );
      return client.messages.create({ ...peticion, model: MODELO_RESPALDO });
    }
    throw err;
  }
}

/**
 * Procesa un mensaje entrante y devuelve lo que hay que responder.
 *
 * @param {string} id              identificador estable de la conversación
 * @param {string} texto           lo que escribió el cliente
 * @param {string} contexto        bloque volátil (fecha de hoy, canal, cliente conocido, alertas de triaje)
 * @param {Function} ejecutarHerramienta  (nombre, argumentos) => objeto que se le devuelve al modelo
 */
async function responder({ id, texto, contexto, ejecutarHerramienta }) {
  const historia = obtenerHistoria(id);
  historia.ultimoUso = Date.now();
  historia.mensajes.push({ role: 'user', content: texto });
  historia.mensajes = recortar(historia.mensajes);

  // Orden del prefijo en la API: tools → system → messages. El breakpoint
  // va al final del bloque estable, así que la caché cubre las herramientas
  // y la personalidad completas; el bloque volátil queda después y no la
  // invalida nunca.
  const system = [
    { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: contexto },
  ];

  const salidas = [];
  let herramientaUsada = null;

  try {
    for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
      const respuesta = await llamarModelo(system, historia.mensajes);
      historia.mensajes.push({ role: 'assistant', content: respuesta.content });

      const salida = textoDe(respuesta.content);
      if (salida) salidas.push(salida);

      if (respuesta.stop_reason !== 'tool_use') break;

      const llamadas = respuesta.content.filter((b) => b.type === 'tool_use');
      const resultados = [];

      for (const llamada of llamadas) {
        let resultado;
        try {
          resultado = await ejecutarHerramienta(llamada.name, llamada.input);
          herramientaUsada = { nombre: llamada.name, entrada: llamada.input, resultado };
        } catch (err) {
          console.error(`[Agente] Falló la herramienta ${llamada.name}:`, err.message);
          resultado = {
            ok: false,
            error:
              'No se pudo registrar la cita por una falla técnica. Dile al cliente que hubo un problema al guardarla y que el equipo lo contacta en unos minutos para confirmarla. No inventes que quedó agendada.',
          };
        }
        resultados.push({
          type: 'tool_result',
          tool_use_id: llamada.id,
          content: JSON.stringify(resultado),
          ...(resultado?.ok === false ? { is_error: true } : {}),
        });
      }

      historia.mensajes.push({ role: 'user', content: resultados });
    }
  } catch (err) {
    // El turno quedó a medias: se saca el mensaje del cliente del hilo para
    // no dejar la conversación con un turno colgado, y se responde algo
    // humano en vez de un error técnico.
    console.error('[Agente] Error hablando con el modelo:', err.message);
    historia.mensajes = historia.mensajes.filter((m) => m.role !== 'user' || m.content !== texto);
    return {
      textos: ['Uy, se me cayó la señal un momento. ¿Me repites lo último, por favor?'],
      herramientaUsada: null,
      fallo: true,
    };
  }

  historia.mensajes = recortar(historia.mensajes);
  return { textos: salidas, herramientaUsada, fallo: false };
}

function olvidarConversacion(id) {
  historias.delete(id);
}

module.exports = { responder, olvidarConversacion };
