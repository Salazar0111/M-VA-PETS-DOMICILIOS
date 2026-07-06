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

module.exports = {
  crearCita,
  actualizarEventoVeterinario,
  obtenerCitasDelDia,
  guardarRutaDiaria,
};
