// Genera el documento que revisa el veterinario, a partir de las reglas
// REALES de src/services/triage.js:
//
//   node scripts/generar-tabla-triaje.js
//
// Salen dos archivos, ambos derivados del mismo código:
//   TRIAJE-PARA-REVISION-DEL-VETERINARIO.md    (registro en el repo)
//   TRIAJE-PARA-REVISION-DEL-VETERINARIO.html  (para compartir por enlace)
//
// Se regenera después de cada corrección del veterinario, para que el
// documento y el código nunca digan cosas distintas.

const fs = require('fs');
const path = require('path');
const { BANDERAS_ROJAS, CUADROS } = require('../src/services/triage');

// Convierte el patrón en algo que un veterinario pueda leer. No es exacto
// (es una expresión regular, no una lista), pero sí fiel: cada alternativa
// del patrón aparece como una frase.
function frasesDe(regex) {
  const fuente = regex.source;
  const partes = [];
  let actual = '';
  let profundidad = 0;

  for (const c of fuente) {
    if (c === '(') profundidad++;
    if (c === ')') profundidad--;
    if (c === '|' && profundidad === 0) {
      partes.push(actual);
      actual = '';
      continue;
    }
    actual += c;
  }
  partes.push(actual);

  return partes
    .map((p) =>
      p
        .replace(/\\b/g, '')
        .replace(/\\w\*/g, '…')
        .replace(/\\s/g, ' ')
        .replace(/\(([^)]*)\)\?/g, '($1)')
        .replace(/\(([^)]*)\)/g, (_, dentro) => dentro.split('|').join('/'))
        .replace(/\[([^\]]*)\]/g, (_, dentro) => dentro.split('').join('/'))
        .replace(/\?|\+/g, '')
        .trim()
    )
    .filter(Boolean);
}

const NIVEL_TEXTO = {
  baja: 'Rutina — se agenda con calma',
  media: 'Sin afán — en los próximos días',
  alta: 'Prioritaria — hoy o mañana temprano',
};

const titular = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const hoy = new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });

const INTRO =
  'Cuando una persona escribe por WhatsApp o Instagram contando qué le pasa a su mascota, el sistema lee ese texto y hace dos cosas: decide qué tan rápido hay que atender y arma la lista de qué debe alistar el veterinario antes de salir. También le dice al dueño qué puede preparar mientras tanto.';
const DESCARGO = 'Esto no es un diagnóstico y no reemplaza la valoración. Es preparación logística.';
const PEDIDO =
  'Lo que necesitamos de ti: que marques lo que esté mal. Sobra algo, falta algo, un nivel de urgencia que no corresponde, una muestra que no se toma a domicilio, una recomendación al dueño que sea incorrecta. Cualquier corrección se aplica directo al sistema.';
const COMO_LEER =
  'El sistema no busca la frase exacta, busca el fragmento. Un fragmento cortado como “ahogand” cubre “ahogando”, “ahogándose”, “se está ahogando”; “colaps” cubre “colapsó” y “colapsado”. Las barras son alternativas: “lengua morada/azul” significa que sirve cualquiera de las dos. No distingue mayúsculas ni tildes.';
const P1_INTRO =
  'Si el mensaje contiene alguna de estas señales, el asistente no agenda una visita normal: le dice a la persona que lleve la mascota de inmediato a una clínica 24 horas, le explica por qué no da espera, y solo después ofrece coordinar el seguimiento a domicilio.';
const P1_AVISO =
  'Esta es la parte más delicada del sistema. Un caso que falte aquí es un caso que se va a quedar esperando una visita.';
const P2_INTRO = 'Para cada uno: qué tan rápido, qué alista el veterinario y qué prepara el dueño.';

const GENERALES = [
  'Si la persona dice que es <b>urgente</b> (“urgente”, “emergencia”, “se está muriendo”, “grave”), la urgencia <b>sube</b> a prioritaria. Nunca baja por eso.',
  'Si el mensaje toca varios cuadros a la vez (por ejemplo vómito y decaimiento), se aplica <b>la urgencia más alta</b> y se suman las muestras de ambos.',
  'Una señal de la Parte 1 manda a urgencias <b>sin importar</b> lo demás que diga el mensaje.',
  'Las visitas se agendan solo entre <b>8:00 a.m. y 4:00 p.m.</b> Fuera de esa franja el sistema no deja agendar y propone otra hora.',
  'El asistente <b>no diagnostica, no receta y no sugiere dosis ni remedios caseros</b>, ni siquiera si se lo piden. Si preguntan por medicamentos, responde que no le den nada hasta que lo vea el veterinario.',
];

const sinEtiquetas = (s) => s.replace(/<\/?b>/g, '');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ------------------------------ Markdown ------------------------------ */

function generarMarkdown() {
  const l = [];
  const w = (t = '') => l.push(t);

  w('# MÜVA PETS — Reglas de triaje del chat');
  w();
  w(`_Documento para revisión clínica · generado el ${hoy}_`);
  w();
  w(INTRO);
  w();
  w(`**${DESCARGO}**`);
  w();
  w(`> **${PEDIDO}**`);
  w();
  w(`**Cómo leer las frases de ejemplo.** ${COMO_LEER}`);
  w();
  w('---');
  w();
  w('## Parte 1 — Casos que se mandan a urgencias, no a domicilio');
  w();
  w(P1_INTRO);
  w();
  w(P1_AVISO);
  w();

  for (const b of BANDERAS_ROJAS) {
    w(`### ${titular(b.razon)}`);
    w();
    w('Se activa cuando la persona escribe algo como:');
    w();
    w(frasesDe(b.patron).map((f) => `- "${f}"`).join('\n'));
    w();
  }

  w('---');
  w();
  w('## Parte 2 — Casos que sí se atienden a domicilio');
  w();
  w(P2_INTRO);
  w();

  for (const c of CUADROS) {
    w(`### ${titular(c.clave.replace(/_/g, ' '))}`);
    w();
    w(`**Urgencia asignada:** ${NIVEL_TEXTO[c.nivel] || c.nivel}`);
    w();
    w('**Se activa cuando la persona escribe algo como:**');
    w();
    w(frasesDe(c.patron).map((f) => `- "${f}"`).join('\n'));
    w();
    if (c.muestras.length) {
      w('**Qué alista el veterinario:**');
      w();
      w(c.muestras.map((m) => `- ${m}`).join('\n'));
      w();
    }
    if (c.preparacion.length) {
      w('**Qué se le pide al dueño antes de la visita:**');
      w();
      w(c.preparacion.map((p) => `- ${p}`).join('\n'));
      w();
    }
  }

  w('---');
  w();
  w('## Parte 3 — Reglas generales');
  w();
  GENERALES.forEach((g) => w(`- ${sinEtiquetas(g).replace(/“|”/g, '"')}`));
  w();

  return l.join('\n');
}

/* -------------------------------- HTML -------------------------------- */

const CHIPS = (patron) =>
  frasesDe(patron)
    .map((f) => `<li>${esc(f)}</li>`)
    .join('');

const LISTA = (items) => items.map((i) => `<li>${esc(i)}</li>`).join('');

function generarHTML() {
  const urgencias = BANDERAS_ROJAS.map(
    (b) => `
      <article class="caso critico">
        <h3>${esc(titular(b.razon))}</h3>
        <p class="disparador">Se activa cuando escriben algo como</p>
        <ul class="frases">${CHIPS(b.patron)}</ul>
      </article>`
  ).join('');

  const cuadros = CUADROS.map(
    (c) => `
      <article class="caso">
        <div class="caso-cab">
          <h3>${esc(titular(c.clave.replace(/_/g, ' ')))}</h3>
          <span class="pill ${c.nivel}">${esc((NIVEL_TEXTO[c.nivel] || c.nivel).split(' — ')[0])}</span>
        </div>
        <p class="nivel-nota">${esc(NIVEL_TEXTO[c.nivel] || c.nivel)}</p>
        <p class="disparador">Se activa cuando escriben algo como</p>
        <ul class="frases">${CHIPS(c.patron)}</ul>
        ${
          c.muestras.length
            ? `<div class="sub"><h4>Qué alista el veterinario</h4><ul class="puntos">${LISTA(c.muestras)}</ul></div>`
            : ''
        }
        ${
          c.preparacion.length
            ? `<div class="sub"><h4>Qué se le pide al dueño</h4><ul class="puntos">${LISTA(c.preparacion)}</ul></div>`
            : ''
        }
      </article>`
  ).join('');

  return `<title>MÜVA PETS · Reglas de triaje para revisión clínica</title>
<style>
  /* Paleta y tipografía de la marca MÜVA (manual de marca del proyecto).
     Sin fuentes externas: la CSP de la página las bloquearía y caeríamos
     en un fallback silencioso. */
  :root{
    --paper:#faf7f2; --card:#ffffff; --ink:#2b3022; --forest:#303926;
    --sage:#76836a; --terra:#be7c60; --camel:#bb9a7f; --cream:#e7dfd3;
    --muted:#857f70; --line:rgba(48,57,38,.13); --line-soft:rgba(48,57,38,.07);
    --critico:#9a3b22; --critico-tinte:rgba(154,59,34,.09);
    --alta:#9a5a3e; --alta-tinte:rgba(190,124,96,.16);
    --media:#7d6349; --media-tinte:rgba(187,154,127,.22);
    --baja:#566b47; --baja-tinte:rgba(118,131,106,.15);
    --display:Georgia,'Times New Roman',serif;
    --ui:ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;
  }
  @media (prefers-color-scheme:dark){
    :root{
      --paper:#171b13; --card:#1f2419; --ink:#e6e1d5; --forest:#dfe6d3;
      --sage:#9aa78d; --muted:#9b9585; --line:rgba(231,223,211,.16); --line-soft:rgba(231,223,211,.09);
      --critico:#e8846a; --critico-tinte:rgba(232,132,106,.14);
      --alta:#dda184; --alta-tinte:rgba(221,161,132,.14);
      --media:#cdb193; --media-tinte:rgba(205,177,147,.14);
      --baja:#a3bb8e; --baja-tinte:rgba(163,187,142,.14);
    }
  }
  :root[data-theme="dark"]{
    --paper:#171b13; --card:#1f2419; --ink:#e6e1d5; --forest:#dfe6d3;
    --sage:#9aa78d; --muted:#9b9585; --line:rgba(231,223,211,.16); --line-soft:rgba(231,223,211,.09);
    --critico:#e8846a; --critico-tinte:rgba(232,132,106,.14);
    --alta:#dda184; --alta-tinte:rgba(221,161,132,.14);
    --media:#cdb193; --media-tinte:rgba(205,177,147,.14);
    --baja:#a3bb8e; --baja-tinte:rgba(163,187,142,.14);
  }
  :root[data-theme="light"]{
    --paper:#faf7f2; --card:#ffffff; --ink:#2b3022; --forest:#303926;
    --sage:#76836a; --muted:#857f70; --line:rgba(48,57,38,.13); --line-soft:rgba(48,57,38,.07);
    --critico:#9a3b22; --critico-tinte:rgba(154,59,34,.09);
    --alta:#9a5a3e; --alta-tinte:rgba(190,124,96,.16);
    --media:#7d6349; --media-tinte:rgba(187,154,127,.22);
    --baja:#566b47; --baja-tinte:rgba(118,131,106,.15);
  }

  body{background:var(--paper);color:var(--ink);font-family:var(--ui);line-height:1.6;
       -webkit-font-smoothing:antialiased}
  .hoja{max-width:44rem;margin:0 auto;padding:clamp(1.75rem,5vw,3.5rem) clamp(1.1rem,4vw,2rem) 5rem;
        display:flex;flex-direction:column;gap:2.5rem}

  .marca{font-family:var(--display);font-size:1.6rem;color:var(--forest);letter-spacing:-.01em;line-height:1}
  .eyebrow{font-size:.7rem;letter-spacing:.2em;text-transform:uppercase;color:var(--sage);font-weight:600}
  h1{font-family:var(--display);font-weight:400;font-size:clamp(1.9rem,5.5vw,2.7rem);color:var(--forest);
     line-height:1.12;letter-spacing:-.015em;text-wrap:balance;margin:.6rem 0 .5rem}
  .fecha{font-size:.85rem;color:var(--muted)}
  .intro{font-size:1.02rem}
  .descargo{font-weight:600;color:var(--forest)}

  .pedido{background:var(--card);border:1px solid var(--line);border-left:3px solid var(--terra);
          border-radius:.55rem;padding:1.1rem 1.25rem;font-size:.97rem}
  .nota{font-size:.9rem;color:var(--muted);border-top:1px solid var(--line-soft);padding-top:1.1rem}
  .nota b{color:var(--ink)}

  section{display:flex;flex-direction:column;gap:1.1rem}
  .parte{border-top:2px solid var(--forest);padding-top:1.1rem}
  h2{font-family:var(--display);font-weight:400;font-size:clamp(1.35rem,4vw,1.75rem);color:var(--forest);
     line-height:1.2;text-wrap:balance}
  section > p{font-size:.97rem;margin:0}
  .aviso{color:var(--critico);font-weight:600}

  .caso{background:var(--card);border:1px solid var(--line);border-radius:.7rem;
        padding:1.15rem 1.25rem;display:flex;flex-direction:column;gap:.7rem}
  .caso.critico{border-left:4px solid var(--critico);background:var(--critico-tinte)}
  .caso-cab{display:flex;align-items:baseline;justify-content:space-between;gap:.75rem;flex-wrap:wrap}
  h3{font-family:var(--display);font-weight:400;font-size:1.18rem;color:var(--forest);line-height:1.25;
     text-wrap:balance}
  h4{font-size:.7rem;letter-spacing:.13em;text-transform:uppercase;color:var(--muted);font-weight:700;
     margin-bottom:.45rem}

  .pill{font-size:.66rem;letter-spacing:.1em;text-transform:uppercase;font-weight:700;
        padding:.28rem .6rem;border-radius:99px;white-space:nowrap}
  .pill.alta{background:var(--alta-tinte);color:var(--alta)}
  .pill.media{background:var(--media-tinte);color:var(--media)}
  .pill.baja{background:var(--baja-tinte);color:var(--baja)}
  .nivel-nota{font-size:.85rem;color:var(--muted);margin:-.4rem 0 0}

  .disparador{font-size:.7rem;letter-spacing:.13em;text-transform:uppercase;color:var(--muted);
              font-weight:700;margin:0}
  .frases{list-style:none;display:flex;flex-wrap:wrap;gap:.4rem;padding:0}
  .frases li{font-size:.87rem;background:var(--paper);border:1px solid var(--line-soft);
             border-radius:.35rem;padding:.24rem .55rem;color:var(--ink)}
  .caso.critico .frases li{background:var(--card)}

  .sub{border-top:1px solid var(--line-soft);padding-top:.85rem}
  .puntos{padding-left:1.05rem;display:flex;flex-direction:column;gap:.4rem}
  .puntos li{font-size:.92rem}
  .puntos li::marker{color:var(--camel)}

  .generales{display:flex;flex-direction:column;gap:.75rem;padding-left:1.05rem}
  .generales li{font-size:.95rem}
  .generales li::marker{color:var(--camel)}
  .generales b{color:var(--forest)}

  .pie{font-size:.82rem;color:var(--muted);border-top:1px solid var(--line-soft);padding-top:1.2rem}

  @media print{
    body{background:#fff}
    .caso{break-inside:avoid;border:1px solid #ccc}
    .hoja{padding:0;gap:1.5rem}
  }
</style>

<div class="hoja">
  <header>
    <div class="marca">müva</div>
    <p class="eyebrow" style="margin-top:.9rem">Revisión clínica</p>
    <h1>Reglas de triaje del chat de agendamiento</h1>
    <p class="fecha">Generado el ${hoy} · MARKETEADOS para MÜVA PETS</p>
  </header>

  <section>
    <p class="intro">${esc(INTRO)}</p>
    <p class="descargo">${esc(DESCARGO)}</p>
    <p class="pedido">${esc(PEDIDO)}</p>
    <p class="nota"><b>Cómo leer las frases de ejemplo.</b> ${esc(COMO_LEER)}</p>
  </section>

  <section class="parte">
    <h2>Parte 1 · Casos que se mandan a urgencias, no a domicilio</h2>
    <p>${esc(P1_INTRO)}</p>
    <p class="aviso">${esc(P1_AVISO)}</p>
    ${urgencias}
  </section>

  <section class="parte">
    <h2>Parte 2 · Casos que sí se atienden a domicilio</h2>
    <p>${esc(P2_INTRO)}</p>
    ${cuadros}
  </section>

  <section class="parte">
    <h2>Parte 3 · Reglas generales</h2>
    <ul class="generales">${GENERALES.map((g) => `<li>${g}</li>`).join('')}</ul>
  </section>

  <p class="pie">
    ${BANDERAS_ROJAS.length} casos de urgencia · ${CUADROS.length} cuadros de domicilio.
    Este documento se genera automáticamente desde las reglas del sistema, así que siempre refleja
    lo que el chat está haciendo hoy.
  </p>
</div>`;
}

/* ------------------------------- Salida ------------------------------- */

const raiz = path.join(__dirname, '..', '..');
const md = path.join(raiz, 'TRIAJE-PARA-REVISION-DEL-VETERINARIO.md');
const html = path.join(raiz, 'TRIAJE-PARA-REVISION-DEL-VETERINARIO.html');

fs.writeFileSync(md, generarMarkdown(), 'utf8');
fs.writeFileSync(html, generarHTML(), 'utf8');

console.log(`Markdown: ${md}`);
console.log(`Web:      ${html}`);
console.log(`${BANDERAS_ROJAS.length} casos de urgencia · ${CUADROS.length} cuadros de domicilio`);
