// Versión editable en Word del documento de triaje:
//
//   node scripts/generar-triaje-word.js
//
// Sale de las MISMAS reglas de src/services/triage.js que la versión web,
// así que las dos siempre dicen lo mismo. Está pensado para que el
// veterinario lo intervenga: tachar lo que sobra, agregar viñetas donde
// falta y escribir bajo "Observaciones" de cada caso.

const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  BorderStyle, ShadingType, Header, Footer, PageNumber,
} = require('docx');
const { BANDERAS_ROJAS, CUADROS } = require('../src/services/triage');

/* Mismo criterio de lectura que la versión web: cada alternativa del
   patrón se muestra como una frase. */
function frasesDe(regex) {
  const partes = [];
  let actual = '';
  let profundidad = 0;
  for (const c of regex.source) {
    if (c === '(') profundidad++;
    if (c === ')') profundidad--;
    if (c === '|' && profundidad === 0) { partes.push(actual); actual = ''; continue; }
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
        .replace(/\(([^)]*)\)/g, (_, d) => d.split('|').join('/'))
        .replace(/\[([^\]]*)\]/g, (_, d) => d.split('').join('/'))
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

const BOSQUE = '303926';
const TERRA = 'BE7C60';
const ALARMA = '9A3B22';
const GRIS = '6B6659';

const titular = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const hoy = new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });

/* ------------------------------ piezas ------------------------------ */

const p = (texto, opciones = {}) =>
  new Paragraph({
    spacing: { after: opciones.after != null ? opciones.after : 120 },
    alignment: opciones.alignment,
    children: [
      new TextRun({
        text: texto,
        bold: opciones.bold,
        italics: opciones.italics,
        size: opciones.size || 21, // medias-puntos: 21 = 10.5pt
        color: opciones.color || '000000',
        font: 'Calibri',
      }),
    ],
  });

const titulo = (texto, nivel, color) =>
  new Paragraph({
    heading: nivel,
    spacing: { before: 260, after: 120 },
    children: [new TextRun({ text: texto, bold: true, color: color || BOSQUE, font: 'Calibri' })],
  });

const etiqueta = (texto) =>
  new Paragraph({
    spacing: { before: 120, after: 60 },
    children: [
      new TextRun({ text: texto.toUpperCase(), bold: true, size: 17, color: GRIS, font: 'Calibri' }),
    ],
  });

const vineta = (texto) =>
  new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 40 },
    children: [new TextRun({ text: texto, size: 21, font: 'Calibri' })],
  });

// Espacio real para escribir: un párrafo con borde inferior, para que en
// Word se vea la línea sobre la que anotar.
const lineaObservaciones = () => [
  new Paragraph({
    spacing: { before: 140, after: 30 },
    children: [
      new TextRun({ text: 'OBSERVACIONES DEL VETERINARIO', bold: true, size: 16, color: TERRA, font: 'Calibri' }),
    ],
  }),
  new Paragraph({
    spacing: { after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, space: 6, color: 'CCCCCC' } },
    children: [new TextRun({ text: '', size: 21, font: 'Calibri' })],
  }),
];

const recuadro = (lineas, color) =>
  lineas.map((linea, i) =>
    new Paragraph({
      spacing: { before: i === 0 ? 120 : 0, after: i === lineas.length - 1 ? 160 : 60 },
      shading: { type: ShadingType.CLEAR, fill: color || 'F4F1EA' },
      border: {
        left: { style: BorderStyle.SINGLE, size: 18, space: 10, color: color === 'F7E7E2' ? ALARMA : TERRA },
      },
      children: [new TextRun({ text: linea, size: 21, font: 'Calibri' })],
    })
  );

/* ----------------------------- documento ----------------------------- */

const hijos = [];

hijos.push(
  new Paragraph({
    spacing: { after: 60 },
    children: [new TextRun({ text: 'MÜVA PETS', bold: true, size: 26, color: BOSQUE, font: 'Calibri' })],
  }),
  new Paragraph({
    spacing: { after: 40 },
    children: [new TextRun({ text: 'Reglas de triaje del chat', bold: true, size: 40, color: BOSQUE, font: 'Calibri' })],
  }),
  p(`Documento para revisión clínica · ${hoy}`, { color: GRIS, size: 19, after: 240 })
);

hijos.push(
  p(
    'Cuando una persona escribe por WhatsApp contando qué le pasa a su mascota, el sistema lee ese texto y hace dos cosas: decide qué tan rápido hay que atender y arma la lista de qué debe alistar el veterinario antes de salir. También le dice al dueño qué puede preparar mientras tanto.'
  ),
  p('Esto no es un diagnóstico y no reemplaza la valoración. Es preparación logística.', { bold: true })
);

hijos.push(
  ...recuadro([
    'CÓMO USAR ESTE DOCUMENTO',
    'Este archivo es editable: tache lo que sobre, agregue viñetas donde falte y escriba en la línea de "Observaciones" de cada caso. Puede cambiar el nivel de urgencia asignado, quitar un examen que no se tome a domicilio o corregir una indicación al dueño.',
    'Devuélvalo con sus cambios y se aplican al sistema tal cual.',
  ])
);

hijos.push(
  p('Cómo leer las frases de ejemplo.', { bold: true, after: 40 }),
  p(
    'El sistema no busca la frase exacta, busca el fragmento. Un fragmento cortado como “ahogand” cubre “ahogando”, “ahogándose”, “se está ahogando”; “colaps” cubre “colapsó” y “colapsado”. Las barras son alternativas: “lengua morada/azul” significa que sirve cualquiera de las dos. No distingue mayúsculas ni tildes.',
    { after: 260 }
  )
);

/* Parte 1 */
hijos.push(titulo('Parte 1 · Casos que se mandan a urgencias, no a domicilio', HeadingLevel.HEADING_1));
hijos.push(
  p(
    'Si el mensaje contiene alguna de estas señales, el asistente no agenda una visita normal: indica llevar la mascota de inmediato a una clínica 24 horas, explica por qué no da espera, y solo después ofrece coordinar el seguimiento a domicilio.'
  )
);
hijos.push(
  ...recuadro(
    ['Esta es la parte más delicada del sistema. Un caso que falte aquí es un caso que se va a quedar esperando una visita a domicilio.'],
    'F7E7E2'
  )
);

for (const b of BANDERAS_ROJAS) {
  hijos.push(titulo(titular(b.razon), HeadingLevel.HEADING_2, ALARMA));
  hijos.push(etiqueta('Se activa cuando escriben algo como'));
  frasesDe(b.patron).forEach((f) => hijos.push(vineta(`“${f}”`)));
  hijos.push(...lineaObservaciones());
}

/* Parte 2 */
hijos.push(titulo('Parte 2 · Casos que sí se atienden a domicilio', HeadingLevel.HEADING_1));
hijos.push(p('Para cada uno: qué tan rápido, qué alista el veterinario y qué prepara el dueño.', { after: 160 }));

for (const c of CUADROS) {
  hijos.push(titulo(titular(c.clave.replace(/_/g, ' ')), HeadingLevel.HEADING_2));
  hijos.push(
    new Paragraph({
      spacing: { after: 100 },
      children: [
        new TextRun({ text: 'Urgencia asignada: ', bold: true, size: 21, font: 'Calibri' }),
        new TextRun({ text: NIVEL_TEXTO[c.nivel] || c.nivel, size: 21, font: 'Calibri' }),
      ],
    })
  );

  hijos.push(etiqueta('Se activa cuando escriben algo como'));
  frasesDe(c.patron).forEach((f) => hijos.push(vineta(`“${f}”`)));

  if (c.muestras.length) {
    hijos.push(etiqueta('Qué alista el veterinario'));
    c.muestras.forEach((m) => hijos.push(vineta(m)));
  }
  if (c.preparacion.length) {
    hijos.push(etiqueta('Qué se le pide al dueño'));
    c.preparacion.forEach((x) => hijos.push(vineta(x)));
  }

  hijos.push(...lineaObservaciones());
}

/* Parte 3 */
hijos.push(titulo('Parte 3 · Reglas generales', HeadingLevel.HEADING_1));
[
  'Si la persona dice que es urgente (“urgente”, “emergencia”, “se está muriendo”, “grave”), la urgencia sube a prioritaria. Nunca baja por eso.',
  'Si el mensaje toca varios cuadros a la vez (por ejemplo vómito y decaimiento), se aplica la urgencia más alta y se suman las muestras de ambos.',
  'Una señal de la Parte 1 manda a urgencias sin importar lo demás que diga el mensaje.',
  'Las visitas se agendan solo entre 8:00 a.m. y 4:00 p.m. Fuera de esa franja el sistema no deja agendar y propone otra hora.',
  'El asistente no diagnostica, no receta y no sugiere dosis ni remedios caseros, ni siquiera si se lo piden. Si preguntan por medicamentos, responde que no le den nada hasta que lo vea el veterinario.',
].forEach((g) => hijos.push(vineta(g)));

hijos.push(...lineaObservaciones());

const doc = new Document({
  creator: 'MARKETEADOS',
  title: 'MÜVA PETS · Reglas de triaje del chat',
  description: 'Documento para revisión clínica del asistente de agendamiento de MÜVA PETS.',
  styles: {
    default: {
      document: { run: { font: 'Calibri', size: 21 }, paragraph: { spacing: { line: 288 } } },
    },
  },
  sections: [
    {
      properties: {
        page: {
          // Carta, no A4: es el tamaño estándar en Colombia.
          size: { width: 12240, height: 15840 },
          margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 },
        },
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [
                new TextRun({ text: 'MÜVA PETS · Reglas de triaje', size: 16, color: GRIS, font: 'Calibri' }),
              ],
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: 'Página ', size: 16, color: GRIS, font: 'Calibri' }),
                new TextRun({ children: [PageNumber.CURRENT], size: 16, color: GRIS, font: 'Calibri' }),
                new TextRun({ text: ' de ', size: 16, color: GRIS, font: 'Calibri' }),
                new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: GRIS, font: 'Calibri' }),
              ],
            }),
          ],
        }),
      },
      children: hijos,
    },
  ],
});

const destino = path.join(__dirname, '..', '..', 'TRIAJE-PARA-REVISION-DEL-VETERINARIO.docx');

Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync(destino, buffer);
  console.log(`Word generado: ${destino}`);
  console.log(`${BANDERAS_ROJAS.length} casos de urgencia · ${CUADROS.length} cuadros de domicilio`);
});
