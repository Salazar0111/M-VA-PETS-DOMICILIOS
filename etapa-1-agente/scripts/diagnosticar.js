// Reproduce el fallo de "no se pudo guardar la cita" contra los servicios
// REALES, paso por paso, para saber cuál de los tres revienta:
//
//   node scripts/diagnosticar.js
//
// Lee las credenciales de etapa-1-agente/.env (el mismo archivo que usa el
// servidor). No imprime ninguna llave. Limpia todo lo que crea: la cita de
// prueba se borra y el evento de Calendar también, así que no ensucia la
// base ni la agenda del veterinario.
//
// Tarda un poco en arrancar: cargar googleapis se demora.

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const COLUMNAS_ETAPA_8 = [
  'tipo_servicio',
  'motivo_consulta',
  'sintomas',
  'edad_aproximada',
  'nivel_urgencia',
  'muestras_sugeridas',
  'preparacion_cliente',
];

const MARCA = `TEST-DIAG-${Date.now()}`;
const ok = (t) => console.log(`  ✓ ${t}`);
const mal = (t) => console.log(`  ✗ ${t}`);

function revisarEntorno() {
  console.log('\n1 · Variables de entorno');
  const necesarias = [
    'SUPABASE_URL', 'SUPABASE_SECRET_KEY',
    'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN',
  ];
  let faltan = [];
  for (const v of necesarias) {
    // Nunca se imprime el valor, solo si está y cuántos caracteres tiene.
    if (process.env[v] && process.env[v].length > 10) ok(`${v} presente (${process.env[v].length} caracteres)`);
    else { mal(`${v} FALTA o parece un placeholder`); faltan.push(v); }
  }
  if (process.env.VETERINARIO_DIRECCION_BASE) ok('VETERINARIO_DIRECCION_BASE presente');
  else console.log('  · VETERINARIO_DIRECCION_BASE ausente (solo afecta al motor de rutas)');
  return faltan;
}

async function revisarColumnas(supabase) {
  console.log('\n2 · Columnas de la migración de la Etapa 8 en la tabla citas');
  const faltantes = [];
  for (const col of COLUMNAS_ETAPA_8) {
    const { error } = await supabase.from('citas').select(col).limit(1);
    if (error) { mal(`${col} — ${error.message}`); faltantes.push(col); }
    else ok(col);
  }
  if (faltantes.length) {
    console.log(`\n  ⚠ FALTAN ${faltantes.length} columnas: ${faltantes.join(', ')}`);
    console.log('    Esto es exactamente lo que hace fallar el guardado.');
    console.log('    Solución: correr etapa-8-agente-conversacional/supabase/schema.sql en el SQL Editor.');
  }
  return faltantes;
}

async function probarGuardado() {
  console.log('\n3 · Guardar una cita de prueba (se borra al final)');
  const { crearCita } = require('../src/services/supabase');
  try {
    const cita = await crearCita({
      canal: 'whatsapp',
      contactoId: MARCA,
      nombreDueno: 'Diagnóstico',
      nombreMascota: `Prueba-${Date.now()}`,
      especie: 'perro',
      direccion: 'Cra 7f #148-45, Cedritos, Bogotá',
      tipoConsulta: 'vacunacion',
      tipoServicio: 'vacunacion',
      motivoConsulta: 'prueba de diagnóstico',
      sintomas: null,
      edadAproximada: null,
      nivelUrgencia: 'baja',
      muestrasSugeridas: ['Muestra de prueba'],
      preparacionCliente: ['Preparación de prueba'],
      fechaHora: 'mañana a las 9am',
    });
    ok(`la cita se guardó (id ${cita.id})`);
    return { ok: true, citaId: cita.id };
  } catch (err) {
    mal(`FALLÓ AL GUARDAR: ${err.message}`);
    if (err.details) console.log(`     detalles: ${err.details}`);
    if (err.hint) console.log(`     pista: ${err.hint}`);
    if (err.code) console.log(`     código: ${err.code}`);
    return { ok: false };
  }
}

async function probarCalendar() {
  console.log('\n4 · Crear un evento en Google Calendar (se borra al final)');
  const { crearEventoVeterinario } = require('../src/services/calendar');
  try {
    const r = await crearEventoVeterinario({
      nombreMascota: 'Prueba-Diagnóstico',
      especie: 'perro',
      tipoConsulta: 'vacunacion',
      tipoServicio: 'vacunacion',
      motivoConsulta: 'prueba de diagnóstico',
      direccion: 'Cra 7f #148-45, Cedritos, Bogotá',
      nombreDueno: 'Diagnóstico',
      nivelUrgencia: 'baja',
      muestrasSugeridas: ['Muestra de prueba'],
      fechaHora: 'mañana a las 9am',
    });
    ok(`el evento se creó (${r.eventoId})`);
    return { ok: true, eventoId: r.eventoId };
  } catch (err) {
    mal(`FALLÓ EN CALENDAR: ${err.message}`);
    const detalle = err?.response?.data?.error;
    if (detalle) console.log(`     Google dice: ${JSON.stringify(detalle)}`);
    return { ok: false };
  }
}

async function limpiar(supabase, citaId, eventoId) {
  console.log('\n5 · Limpieza');
  if (citaId) {
    const { error } = await supabase.from('citas').delete().eq('id', citaId);
    error ? mal(`no se pudo borrar la cita de prueba: ${error.message}`) : ok('cita de prueba borrada');
  }
  // El cliente y la mascota de prueba también, para no dejar basura.
  const { data: cliente } = await supabase.from('clientes').select('id').eq('identificador', MARCA).maybeSingle();
  if (cliente) {
    await supabase.from('mascotas').delete().eq('cliente_id', cliente.id);
    await supabase.from('clientes').delete().eq('id', cliente.id);
    ok('cliente y mascota de prueba borrados');
  }
  if (eventoId) {
    try {
      const { google } = require('googleapis');
      const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
      auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
      await google.calendar({ version: 'v3', auth }).events.delete({
        calendarId: process.env.GOOGLE_CALENDAR_ID_VETERINARIO || 'primary',
        eventId: eventoId,
      });
      ok('evento de prueba borrado del calendario');
    } catch (err) {
      mal(`no se pudo borrar el evento ${eventoId}: ${err.message} — bórralo a mano`);
    }
  }
}

(async () => {
  console.log('MÜVA · diagnóstico del guardado de citas');
  console.log('════════════════════════════════════════');

  const faltan = revisarEntorno();
  if (faltan.includes('SUPABASE_URL') || faltan.includes('SUPABASE_SECRET_KEY')) {
    console.log('\nSin credenciales de Supabase no se puede diagnosticar nada. Complétalas en .env');
    process.exit(1);
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

  const faltantes = await revisarColumnas(supabase);
  const guardado = await probarGuardado();
  const calendario = faltan.includes('GOOGLE_REFRESH_TOKEN')
    ? { ok: false, saltado: true }
    : await probarCalendar();

  await limpiar(supabase, guardado.citaId, calendario.eventoId);

  console.log('\n════════════════════════════════════════');
  console.log('VEREDICTO');
  if (faltantes.length) {
    console.log(`  La migración de la Etapa 8 NO está aplicada (faltan ${faltantes.length} columnas).`);
    console.log('  → Correr etapa-8-agente-conversacional/supabase/schema.sql en Supabase.');
  } else if (!guardado.ok) {
    console.log('  Las columnas están, pero el guardado falla igual. El error exacto está arriba.');
  } else if (calendario.saltado) {
    console.log('  Supabase guarda bien. Falta probar Calendar (no hay credenciales de Google en .env).');
  } else if (!calendario.ok) {
    console.log('  Supabase guarda bien; el que falla es Google Calendar. El error exacto está arriba.');
  } else {
    console.log('  Los dos servicios funcionan. El fallo de la prueba en vivo fue otra cosa:');
    console.log('  hay que mirar el log de Railway de esa hora.');
  }
  process.exit(0);
})();
