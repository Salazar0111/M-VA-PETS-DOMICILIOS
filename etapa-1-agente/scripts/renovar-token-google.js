// Renueva el GOOGLE_REFRESH_TOKEN cuando Google responde "invalid_grant":
//
//   node scripts/renovar-token-google.js
//
// Levanta un servidor local, imprime el enlace de autorización, y al
// autorizar guarda el token nuevo directamente en .env. NUNCA lo imprime en
// pantalla: hay que copiarlo del archivo a Railway.
//
// ANTES de correrlo, en Google Cloud Console → Credenciales → el ID de
// cliente OAuth de este proyecto, agregar esta URI de redireccionamiento
// autorizada:
//
//     http://localhost:5599/callback
//
// No usa googleapis a propósito: esa librería tarda minutos en cargar
// cuando el proyecto vive en una carpeta sincronizada con la nube.

require('dotenv').config();
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PUERTO = 5599;
const REDIRECT = `http://localhost:${PUERTO}/callback`;
const SCOPE = 'https://www.googleapis.com/auth/calendar';

const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = process.env;
if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  console.error('Faltan GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET en .env');
  process.exit(1);
}

const url =
  'https://accounts.google.com/o/oauth2/v2/auth?' +
  new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: REDIRECT,
    response_type: 'code',
    scope: SCOPE,
    // offline + consent es lo que obliga a Google a entregar un refresh
    // token nuevo; sin prompt=consent devuelve solo un access token.
    access_type: 'offline',
    prompt: 'consent',
  }).toString();

function canjear(code) {
  return new Promise((resolve, reject) => {
    const cuerpo = new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: REDIRECT,
      grant_type: 'authorization_code',
    }).toString();

    const req = https.request(
      {
        hostname: 'oauth2.googleapis.com',
        path: '/token',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(cuerpo),
        },
        timeout: 20000,
      },
      (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => {
          try {
            const j = JSON.parse(d);
            j.refresh_token ? resolve(j) : reject(new Error(j.error_description || j.error || d));
          } catch (e) {
            reject(new Error(d.slice(0, 300)));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(cuerpo);
    req.end();
  });
}

function guardarEnEnv(token) {
  const archivo = path.join(__dirname, '..', '.env');
  const texto = fs.readFileSync(archivo, 'utf8');
  const lineas = texto.split('\n');
  const i = lineas.findIndex((l) => l.startsWith('GOOGLE_REFRESH_TOKEN='));
  if (i >= 0) lineas[i] = `GOOGLE_REFRESH_TOKEN=${token}`;
  else lineas.push(`GOOGLE_REFRESH_TOKEN=${token}`);
  fs.writeFileSync(archivo, lineas.join('\n'), 'utf8');
}

const servidor = http.createServer(async (req, res) => {
  if (!req.url.startsWith('/callback')) {
    res.writeHead(404).end();
    return;
  }
  const code = new URL(req.url, `http://localhost:${PUERTO}`).searchParams.get('code');
  if (!code) {
    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h2>No llegó el código de autorización.</h2>');
    return;
  }

  try {
    const tokens = await canjear(code);
    guardarEnEnv(tokens.refresh_token);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(
      '<body style="font-family:system-ui;padding:3rem;max-width:34rem;margin:auto">' +
        '<h2>Token renovado</h2><p>Ya quedó guardado en el archivo <code>.env</code>. ' +
        'Puedes cerrar esta pestaña y volver a la terminal.</p></body>'
    );
    console.log('\n✓ Token nuevo guardado en .env (no se imprime por seguridad)');
    console.log(`  Empieza por "${tokens.refresh_token.slice(0, 6)}…" y tiene ${tokens.refresh_token.length} caracteres.`);
    console.log('\nAhora falta lo importante:');
    console.log('  1. Copiar ese valor de .env a Railway → Variables → GOOGLE_REFRESH_TOKEN');
    console.log('  2. Verificar con: node scripts/probar-token-google.js');
    setTimeout(() => process.exit(0), 500);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<h2>Falló el canje</h2><pre>${err.message}</pre>`);
    console.error('\n✗ Falló el canje del código:', err.message);
    setTimeout(() => process.exit(1), 500);
  }
});

servidor.listen(PUERTO, () => {
  console.log('\nAbre este enlace en el navegador, con la cuenta resultadosmuva@gmail.com:\n');
  console.log(url);
  console.log('\nEsperando la autorización…');
});
