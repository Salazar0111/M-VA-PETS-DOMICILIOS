// Arma el sitio estático de documentación del cliente:
//
//   node scripts/generar-tabla-triaje.js   (primero, si cambió el triaje)
//   node scripts/construir-sitio-docs.js
//   cd ../muva-pets-docs && vercel deploy --prod --yes
//
// Los tres documentos se escribieron como FRAGMENTOS para el visor de
// artefactos: empiezan en <title> y no traen <!doctype>, <head> ni reset
// de CSS. Este script los convierte en páginas completas y, sobre todo,
// les CAMBIA la piel: descarta el <style> propio de cada uno y les
// inyecta el sistema visual compartido de scripts/sitio/.
//
// Así el diseño vive en un solo lugar. El documento de triaje se genera
// por script y los otros dos son a mano; si cada uno cargara su propio
// CSS, al primer ajuste quedarían los tres distintos.

const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..', '..');
const fuente = path.join(__dirname, 'sitio');
// El nombre de la carpeta define el nombre del proyecto y la URL en Vercel.
const salida = path.join(raiz, 'muva-pets-docs');

const DOCS = [
  {
    archivo: 'PRESENTACION-ENTREGA-MUVA-PETS.html',
    destino: 'entrega.html',
    titulo: 'Entrega de la plataforma',
    resumen: 'Qué se construyó, cómo viaja una cita de principio a fin y el estado real de cada módulo del contrato.',
    para: 'RCS Capital Partners',
  },
  {
    archivo: 'MANUAL-DE-USO-MUVA-PETS.html',
    destino: 'manual.html',
    titulo: 'Manual de uso',
    resumen: 'Accesos, panel de operación, app del veterinario, asistente de WhatsApp, datos y alcance del soporte.',
    para: 'MÜVA y el equipo veterinario',
  },
  {
    archivo: 'TRIAJE-PARA-REVISION-DEL-VETERINARIO.html',
    destino: 'triaje.html',
    titulo: 'Reglas de triaje del chat',
    resumen: 'Los criterios clínicos con los que el asistente decide qué es urgente y qué material alistar. Pendiente de validación.',
    para: 'El veterinario',
  },
];

const CSS = fs.readFileSync(path.join(fuente, 'estilo.css'), 'utf8');
const JS = fs.readFileSync(path.join(fuente, 'interaccion.js'), 'utf8');

// Fraunces + Jost son las tipografías de la marca. Acá sí se pueden
// cargar de Google Fonts (en el visor de artefactos no, por su CSP), con
// stack de respaldo por si la red falla.
const FUENTES =
  '<link rel="preconnect" href="https://fonts.googleapis.com">\n' +
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?' +
  'family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&' +
  'family=Jost:wght@400;500;600;700&display=swap">';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// El fragmento trae <title> y <style> antes del contenido visible. Nos
// quedamos con el título y botamos el estilo: lo reemplaza el compartido.
function partir(fragmento) {
  const titulo = (fragmento.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || 'MÜVA PETS';
  const corte = fragmento.lastIndexOf('</style>');
  const cuerpo = corte === -1 ? fragmento : fragmento.slice(corte + '</style>'.length);
  return { titulo: titulo.trim(), cuerpo: cuerpo.trim() };
}

function pagina(fragmento, meta) {
  const { titulo, cuerpo } = partir(fragmento);
  const esPortada = Boolean(meta.portada);

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<meta name="theme-color" content="#f7f3ec" media="(prefers-color-scheme:light)">
<meta name="theme-color" content="#12160f" media="(prefers-color-scheme:dark)">
<meta name="description" content="${esc(meta.resumen || 'Documentación del proyecto MÜVA PETS.')}">
<title>${esc(titulo)}</title>
${FUENTES}
<style>
${CSS}</style>
</head>
<body>

<div class="ambiente" aria-hidden="true"><i></i><i></i><i></i></div>
<div class="progreso" aria-hidden="true"></div>
${
  esPortada
    ? ''
    : `<header class="barra">
  <span class="b-doc"><span>müva</span> · ${esc(meta.titulo)}</span>
  <a href="/">← Documentos</a>
</header>`
}

${cuerpo}

<button class="arriba" type="button" aria-label="Volver arriba">↑</button>

<script>
${JS}</script>
</body>
</html>`;
}

/* ------------------------------- portada ------------------------------- */

const PORTADA = `<title>MÜVA PETS · Documentación del proyecto</title>
<style></style>

<div class="hoja">
  <header>
    <div class="marca">müva</div>
    <p class="eyebrow">Documentación del proyecto</p>
    <h1>Plataforma de agendamiento y operación veterinaria</h1>
    <p class="bajada">Los documentos de la entrega, reunidos en un solo lugar. Se leen desde el celular y se imprimen a PDF desde el navegador.</p>
  </header>

  <div class="docs">
    ${DOCS.map(
      (d) => `<a class="doc" href="/${d.destino}">
      <span class="para">Para ${esc(d.para)}</span>
      <h2>${esc(d.titulo)}</h2>
      <p>${esc(d.resumen)}</p>
      <span class="ir">Abrir →</span>
    </a>`
    ).join('\n    ')}
  </div>

  <p class="pie">MARKETEADOS · Brayan Salazar Beltrán. Elaborado para RCS CAPITAL PARTNERS S.A.S. en el marco del contrato MKT-CONT-2026-001. Documentos de circulación interna.</p>
</div>`;

/* -------------------------------- salida ------------------------------- */

fs.rmSync(salida, { recursive: true, force: true });
fs.mkdirSync(salida, { recursive: true });

for (const doc of DOCS) {
  const origen = path.join(raiz, doc.archivo);
  if (!fs.existsSync(origen)) {
    console.error(`FALTA: ${doc.archivo} — corre antes generar-tabla-triaje.js si es el de triaje`);
    process.exit(1);
  }
  fs.writeFileSync(path.join(salida, doc.destino), pagina(fs.readFileSync(origen, 'utf8'), doc), 'utf8');
  console.log(`  ${doc.destino.padEnd(13)} ←  ${doc.archivo}`);
}

fs.writeFileSync(path.join(salida, 'index.html'), pagina(PORTADA, { portada: true }), 'utf8');
console.log('  index.html    ←  portada');

// El Word editable que descarga el veterinario desde la página de triaje.
const word = path.join(raiz, 'TRIAJE-PARA-REVISION-DEL-VETERINARIO.docx');
if (fs.existsSync(word)) {
  fs.copyFileSync(word, path.join(salida, 'triaje.docx'));
  console.log('  triaje.docx   ←  TRIAJE-PARA-REVISION-DEL-VETERINARIO.docx');
} else {
  console.error('\n⚠  FALTA el Word editable. Corre antes: node scripts/generar-triaje-word.js');
  console.error('   El botón de descarga de la página de triaje quedaría roto.\n');
  process.exit(1);
}

// Documentos de cliente: no tienen por qué aparecer en buscadores.
fs.writeFileSync(path.join(salida, 'robots.txt'), 'User-agent: *\nDisallow: /\n', 'utf8');

console.log(`\nSitio listo en: ${salida}`);
