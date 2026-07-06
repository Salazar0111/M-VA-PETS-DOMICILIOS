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

async function actualizarEventoVeterinario(citaId, eventoVeterinarioId) {
  const { error } = await supabase
    .from('citas')
    .update({
      google_event_id_veterinario: eventoVeterinarioId,
      estado: 'confirmada',
    })
    .eq('id', citaId);

  if (error) throw error;
}

module.exports = { crearCita, actualizarEventoVeterinario };
