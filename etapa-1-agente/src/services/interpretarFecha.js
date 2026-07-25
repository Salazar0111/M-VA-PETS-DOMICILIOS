// Interpreta el texto libre de fecha/hora que el cliente escribe en el
// chat ("hoy 4pm", "mañana a las 9", "el viernes en la tarde"...) y lo
// convierte en una fecha/hora real, ANCLADA a Bogotá.
//
// Es deliberadamente simple (reglas, no un LLM): cubre "hoy", "mañana",
// días de la semana y horas en formato 12h/24h. Si no logra interpretar
// algo, no inventa: usa un valor por defecto sensato y lo señala en
// `interpretado: false` para que quede trazable, no oculto.

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miercoles', 'miércoles', 'jueves', 'viernes', 'sabado', 'sábado'];
const INDICE_DIA = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, miércoles: 3, jueves: 4, viernes: 5, sabado: 6, sábado: 6 };

const HORA_POR_DEFECTO = 9; // usada solo si no se logró interpretar ninguna hora

function quitarTildes(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function interpretarDia(textoNorm, esUrgencia, hoyBogota) {
  const hoy = new Date(`${hoyBogota}T12:00:00-05:00`);

  if (/\bhoy\b/.test(textoNorm)) return { fecha: hoyBogota, interpretado: true };

  if (/\bmanana\b/.test(textoNorm)) {
    const m = new Date(hoy);
    m.setDate(m.getDate() + 1);
    return { fecha: m.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }), interpretado: true };
  }

  for (const dia of DIAS_SEMANA) {
    if (textoNorm.includes(quitarTildes(dia))) {
      const objetivo = INDICE_DIA[dia];
      const d = new Date(hoy);
      let delta = (objetivo - d.getDay() + 7) % 7;
      if (delta === 0) delta = 7; // "el lunes" un lunes siempre se refiere al próximo, no a hoy
      d.setDate(d.getDate() + delta);
      return { fecha: d.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }), interpretado: true };
    }
  }

  // Sin día explícito: una urgencia se asume para hoy; una consulta
  // programada, para mañana (mismo criterio que tenía el placeholder original).
  if (esUrgencia) return { fecha: hoyBogota, interpretado: false };
  const m = new Date(hoy);
  m.setDate(m.getDate() + 1);
  return { fecha: m.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }), interpretado: false };
}

function interpretarHora(textoNorm) {
  // 1) "4pm", "4 pm", "4:30pm", "4:30 p.m."
  let m = textoNorm.match(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/);
  if (m) {
    let h = parseInt(m[1], 10);
    const min = m[2] ? parseInt(m[2], 10) : 0;
    const esPM = m[3].startsWith('p');
    if (h === 12) h = 0;
    if (esPM) h += 12;
    return { hora: h, minuto: min, interpretado: true };
  }

  // 2) "16:00", "9:30" (24h o sin sufijo)
  m = textoNorm.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (m) return { hora: parseInt(m[1], 10), minuto: parseInt(m[2], 10), interpretado: true };

  // 3) Solo un número junto a una palabra horaria: "a las 4", "9 de la mañana"
  m = textoNorm.match(/\b(\d{1,2})\s*(?:de la manana|de la tarde|hrs?|horas)?\b/);
  if (m) {
    let h = parseInt(m[1], 10);
    if (h >= 1 && h <= 12) {
      // Ambiguo sin am/pm: si el texto menciona "tarde" se asume PM.
      if (/tarde/.test(textoNorm) && h < 8) h += 12;
      return { hora: h, minuto: 0, interpretado: true };
    }
  }

  return { hora: HORA_POR_DEFECTO, minuto: 0, interpretado: false };
}

function interpretarFechaHora(fechaHoraTexto, tipoConsultaTexto) {
  const textoNorm = quitarTildes((fechaHoraTexto || '').toLowerCase());
  const esUrgencia = /urgenc/.test(quitarTildes((tipoConsultaTexto || '').toLowerCase()));
  const hoyBogota = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });

  const { fecha, interpretado: diaInterpretado } = interpretarDia(textoNorm, esUrgencia, hoyBogota);
  const { hora, minuto, interpretado: horaInterpretada } = interpretarHora(textoNorm);

  const inicio = new Date(
    `${fecha}T${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}:00-05:00`
  );
  const fin = new Date(inicio.getTime() + 30 * 60 * 1000);

  return { inicio, fin, interpretado: diaInterpretado && horaInterpretada };
}

module.exports = { interpretarFechaHora };
