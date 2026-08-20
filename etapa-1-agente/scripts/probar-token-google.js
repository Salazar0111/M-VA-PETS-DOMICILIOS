// ¿El refresh token de Google sigue vivo?
//
//   node scripts/probar-token-google.js
//
// Pregunta directo al servidor de tokens de Google. No imprime ninguna
// credencial. Vale la pena correrlo cada tanto: si la pantalla de
// consentimiento OAuth está en modo "Testing", Google caduca el refresh
// token a los 7 días y las citas dejan de llegar al calendario de MÜVA
// sin que nadie se entere.

require('dotenv').config();
const https = require('https');

const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
  console.error('Faltan credenciales de Google en .env');
  process.exit(1);
}

const cuerpo = new URLSearchParams({
  client_id: GOOGLE_CLIENT_ID,
  client_secret: GOOGLE_CLIENT_SECRET,
  refresh_token: GOOGLE_REFRESH_TOKEN,
  grant_type: 'refresh_token',
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
      let j = {};
      try {
        j = JSON.parse(d);
      } catch (e) {
        console.log('Respuesta inesperada de Google:', d.slice(0, 300));
        process.exit(1);
      }

      if (j.access_token) {
        console.log('✓ El refresh token de Google SIRVE.');
        console.log(`  Permisos: ${j.scope}`);
        console.log('  Las citas se están creando en el calendario de MÜVA.');
        process.exit(0);
      }

      console.log('✗ Google RECHAZA el refresh token.');
      console.log(`  error: ${j.error}`);
      if (j.error_description) console.log(`  descripción: ${j.error_description}`);
      if (j.error === 'invalid_grant') {
        console.log('\n  Causa más común: la pantalla de consentimiento OAuth está en modo');
        console.log('  "Testing", y ahí Google caduca los refresh tokens a los 7 días.');
        console.log('\n  Arreglo:');
        console.log('   1. Google Cloud Console → APIs y servicios → Pantalla de consentimiento OAuth');
        console.log('      → publicar la app ("In production"). Así los tokens dejan de caducar.');
        console.log('   2. node scripts/renovar-token-google.js');
        console.log('   3. Copiar el token nuevo de .env a Railway.');
      }
      process.exit(1);
    });
  }
);

req.on('timeout', () => {
  console.log('✗ Timeout hablando con Google.');
  req.destroy();
  process.exit(1);
});
req.on('error', (e) => {
  console.log('✗ Error de red:', e.message);
  process.exit(1);
});
req.write(cuerpo);
req.end();
