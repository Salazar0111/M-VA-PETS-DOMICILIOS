require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

async function crearCita(datos) {
  const { data, error } = await supabase
    .from('citas')
    .insert({
      canal: datos.canal,
      contacto_id: datos.contactoId,
      nombre_mascota: datos.nombreMascota,
      especie: datos.especie,
      direccion: datos.direccion,
      tipo_consulta: datos.tipoConsulta,
      fecha_hora_solicitada: datos.fechaHora,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function actualizarEventoVeterinario(citaId, eventoVeterinarioId, fechaHoraConfirmada) {
  const { error } = await supabase
    .from('citas')
    .update({
      google_event_id_veterinario: eventoVeterinarioId,
      fecha_hora_confirmada: fechaHoraConfirmada,
      estado: 'confirmada',
    })
    .eq('id', citaId);

  if (error) throw error;
}

async function obtenerCitasDelDia(fechaISO) {
  const inicio = `${fechaISO}T00:00:00`;
  const fin = `${fechaISO}T23:59:59`;

  const { data, error } = await supabase
    .from('citas')
    .select('*')
    .eq('estado', 'confirmada')
    .gte('fecha_hora_confirmada', inicio)
    .lte('fecha_hora_confirmada', fin);

  if (error) throw error;
  return data;
}

async function guardarRutaDiaria(fechaISO, citasConMetricas, totalKm, totalMin) {
  for (const cita of citasConMetricas) {
    await supabase
      .from('citas')
      .update({
        orden_ruta: cita.orden_ruta,
        distancia_km: cita.distancia_km,
        duracion_min: cita.duracion_min,
      })
      .eq('id', cita.id);
  }

  const { error } = await supabase.from('rutas_diarias').upsert(
    {
      fecha: fechaISO,
      total_km: totalKm,
      total_duracion_min: totalMin,
      citas_ids: citasConMetricas.map((c) => c.id),
    },
    { onConflict: 'fecha' }
  );

  if (error) throw error;
}

// La jornada del veterinario incluye las visitas ya completadas: si solo
// trajéramos las confirmadas, cada check-out borraría la visita de su lista
// y el cierre de jornada no podría sumar tiempos ni kilómetros.
async function obtenerRutaOrdenada(fechaISO) {
  const { data, error } = await supabase
    .from('citas')
    .select('*')
    .in('estado', ['confirmada', 'completada'])
    .gte('fecha_hora_confirmada', `${fechaISO}T00:00:00`)
    .lte('fecha_hora_confirmada', `${fechaISO}T23:59:59`);

  if (error) throw error;
  return data.sort((a, b) => (a.orden_ruta ?? 999) - (b.orden_ruta ?? 999));
}

async function registrarCheckIn(citaId) {
  const { data, error } = await supabase
    .from('citas')
    .update({ check_in_at: new Date().toISOString() })
    .eq('id', citaId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

const METODOS_PAGO = ['efectivo', 'transferencia', 'link_pago'];

async function registrarCheckOut(citaId, { observaciones, metodoPago, valorServicio } = {}) {
  const texto = (observaciones || '').trim();
  if (!texto) throw new Error('Escribe una observación de la visita antes de cerrarla');
  if (!METODOS_PAGO.includes(metodoPago)) throw new Error('Selecciona un método de pago válido');

  const valor = Number(valorServicio);
  if (!Number.isFinite(valor) || valor <= 0) throw new Error('Ingresa el valor cobrado por la consulta');

  const { data: cita, error: errLectura } = await supabase
    .from('citas')
    .select('check_in_at')
    .eq('id', citaId)
    .single();

  if (errLectura) throw errLectura;
  if (!cita.check_in_at) throw new Error('No se puede hacer check-out sin check-in previo');

  const checkOutAt = new Date();
  const checkInAt = new Date(cita.check_in_at);
  // Nunca guardamos una duración negativa: un desfase de reloj o un dato
  // mal cargado envenenaría los promedios del panel sin dar señal.
  const duracionRealMin = Math.max(0, (checkOutAt - checkInAt) / 60000);

  const { data, error } = await supabase
    .from('citas')
    .update({
      check_out_at: checkOutAt.toISOString(),
      duracion_real_min: duracionRealMin,
      observaciones: texto,
      metodo_pago: metodoPago,
      valor_servicio: valor,
      estado: 'completada',
    })
    .eq('id', citaId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

module.exports = {
  METODOS_PAGO,
  crearCita,
  actualizarEventoVeterinario,
  obtenerCitasDelDia,
  guardarRutaDiaria,
  obtenerRutaOrdenada,
  registrarCheckIn,
  registrarCheckOut,
};
