require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

// Ventana de agendamiento pactada en el contrato: 8:00 a.m. – 4:00 p.m.
const JORNADA_INICIO = 8;
const JORNADA_FIN = 16;
// Bogotá no tiene horario de verano, así que el desfase es fijo.
const OFFSET = '-05:00';
// Cuando la visita aún no se ha atendido no sabemos cuánto durará.
const DURACION_ESTIMADA_MIN = 30;

const enBogota = (fechaISO, hora) =>
  new Date(`${fechaISO}T${String(hora).padStart(2, '0')}:00:00${OFFSET}`);

const minutos = (a, b) => Math.round((b - a) / 60000);

async function citasDelDia(fechaISO) {
  const { data, error } = await supabase
    .from('citas')
    .select('*')
    .in('estado', ['confirmada', 'completada'])
    .gte('fecha_hora_confirmada', `${fechaISO}T00:00:00${OFFSET}`)
    .lte('fecha_hora_confirmada', `${fechaISO}T23:59:59${OFFSET}`);

  if (error) throw error;
  return (data || []).sort((a, b) => (a.orden_ruta ?? 999) - (b.orden_ruta ?? 999));
}

/* ---------- disponibilidad ---------- */

// Convierte las citas en bloques ocupados y deduce los huecos libres
// dentro de la jornada. Los bloques que se solapan se fusionan.
function calcularDisponibilidad(citas, fechaISO) {
  const abre = enBogota(fechaISO, JORNADA_INICIO);
  const cierra = enBogota(fechaISO, JORNADA_FIN);

  const ocupados = citas
    .filter((c) => c.fecha_hora_confirmada)
    .map((c) => {
      const inicio = new Date(c.fecha_hora_confirmada);
      const dur = Number(c.duracion_real_min) || DURACION_ESTIMADA_MIN;
      return { inicio, fin: new Date(inicio.getTime() + dur * 60000), mascotas: [c.nombre_mascota].filter(Boolean) };
    })
    .filter((b) => b.fin > abre && b.inicio < cierra)
    .sort((a, b) => a.inicio - b.inicio);

  const fusionados = [];
  for (const bloque of ocupados) {
    const ultimo = fusionados[fusionados.length - 1];
    if (ultimo && bloque.inicio <= ultimo.fin) {
      ultimo.fin = new Date(Math.max(ultimo.fin, bloque.fin));
      ultimo.mascotas.push(...bloque.mascotas);
    } else {
      fusionados.push({ ...bloque, mascotas: [...bloque.mascotas] });
    }
  }

  const bloques = [];
  let cursor = abre;
  for (const b of fusionados) {
    if (b.inicio > cursor) bloques.push({ tipo: 'libre', inicio: cursor, fin: b.inicio });
    bloques.push({
      tipo: 'ocupado',
      inicio: b.inicio < abre ? abre : b.inicio,
      fin: b.fin > cierra ? cierra : b.fin,
      mascotas: b.mascotas,
    });
    cursor = b.fin > cursor ? b.fin : cursor;
  }
  if (cursor < cierra) bloques.push({ tipo: 'libre', inicio: cursor, fin: cierra });

  // "Próximo" solo tiene sentido contra el reloj si la fecha es hoy.
  // Para otros días mostramos el primer hueco de esa jornada; si no,
  // consultar el panel después de las 4 p.m. no mostraría nada.
  const hoyBogota = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
  const esHoy = fechaISO === hoyBogota;
  const ahora = new Date();

  const libres = bloques.filter((b) => b.tipo === 'libre');
  const proximoLibre = (esHoy ? libres.find((b) => b.fin > ahora) : libres[0]) || null;

  const totalLibreMin = libres.reduce((s, b) => s + minutos(b.inicio, b.fin), 0);

  // El frontend necesita distinguir POR QUÉ no hay "próximo libre": no es
  // lo mismo que la jornada ya haya terminado a que esté toda ocupada.
  // Mostrar "sin espacio" en ambos casos es lo que generaba la confusión.
  let motivoSinLibre = null;
  if (!proximoLibre) {
    if (esHoy && ahora >= cierra) motivoSinLibre = 'jornada_finalizada';
    else if (esHoy && ahora < abre) motivoSinLibre = null; // hay libre desde "abre", proximoLibre ya lo cubre
    else motivoSinLibre = 'agenda_completa';
  }

  return {
    jornada: { abre: abre.toISOString(), cierra: cierra.toISOString() },
    bloques: bloques.map((b) => ({
      tipo: b.tipo,
      inicio: b.inicio.toISOString(),
      fin: b.fin.toISOString(),
      minutos: minutos(b.inicio, b.fin),
      mascotas: b.mascotas || [],
    })),
    proximoLibre: proximoLibre
      ? { inicio: proximoLibre.inicio.toISOString(), fin: proximoLibre.fin.toISOString(), minutos: minutos(proximoLibre.inicio, proximoLibre.fin) }
      : null,
    motivoSinLibre,
    totalLibreMin,
  };
}

/* ---------- resumen del día ---------- */

async function resumenDelDia(fechaISO) {
  const citas = await citasDelDia(fechaISO);

  const completadas = citas.filter((c) => c.check_out_at);
  const enConsulta = citas.find((c) => c.check_in_at && !c.check_out_at) || null;

  const km = citas.reduce((s, c) => s + (Number(c.distancia_km) || 0), 0);
  const desplazamientoMin = citas.reduce((s, c) => s + (Number(c.duracion_min) || 0), 0);
  const consultaMin = completadas.reduce((s, c) => s + (Number(c.duracion_real_min) || 0), 0);
  const facturadoHoy = completadas.reduce((s, c) => s + (Number(c.valor_servicio) || 0), 0);

  return {
    fecha: fechaISO,
    kpis: {
      visitas: citas.length,
      completadas: completadas.length,
      km: Number(km.toFixed(1)),
      desplazamientoMin: Math.round(desplazamientoMin),
      consultaMin: Math.round(consultaMin),
      promedioMin: completadas.length ? Math.round(consultaMin / completadas.length) : 0,
      facturadoHoy: Math.round(facturadoHoy),
    },
    veterinario: {
      estado: enConsulta ? 'en_consulta' : 'disponible',
      atendiendo: enConsulta ? { mascota: enConsulta.nombre_mascota, desde: enConsulta.check_in_at } : null,
    },
    disponibilidad: calcularDisponibilidad(citas, fechaISO),
    citas: citas.map((c) => ({
      id: c.id,
      orden: c.orden_ruta,
      mascota: c.nombre_mascota,
      especie: c.especie,
      direccion: c.direccion,
      motivo: c.tipo_consulta,
      hora: c.fecha_hora_confirmada,
      canal: c.canal,
      estado: c.check_out_at ? 'completada' : c.check_in_at ? 'en_consulta' : 'programada',
      duracionRealMin: c.duracion_real_min == null ? null : Math.round(c.duracion_real_min),
      observaciones: c.observaciones || null,
      metodoPago: c.metodo_pago || null,
      valorServicio: c.valor_servicio == null ? null : Number(c.valor_servicio),
      clienteId: c.cliente_id || null,
      nombreDueno: c.nombre_dueno || null,
      telefonoContacto: c.telefono_contacto || null,
    })),
  };
}

/* ---------- visitas de la semana ---------- */

async function visitasDeLaSemana(fechaISO) {
  const hoy = enBogota(fechaISO, 12);
  const diaSemana = (hoy.getUTCDay() + 6) % 7; // 0 = lunes
  const lunes = new Date(hoy.getTime() - diaSemana * 86400000);

  const dias = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(lunes.getTime() + i * 86400000);
    return d.toISOString().slice(0, 10);
  });

  const { data, error } = await supabase
    .from('citas')
    .select('fecha_hora_confirmada, check_out_at')
    .in('estado', ['confirmada', 'completada'])
    .gte('fecha_hora_confirmada', `${dias[0]}T00:00:00${OFFSET}`)
    .lte('fecha_hora_confirmada', `${dias[4]}T23:59:59${OFFSET}`);

  if (error) throw error;

  // "Hoy" es el día real, no la fecha que se esté consultando: si el panel
  // mira otra semana, marcar esa fecha como hoy sería mentir.
  const hoyBogota = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
  const nombres = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'];
  return dias.map((fecha, i) => ({
    fecha,
    dia: fecha === hoyBogota ? 'Hoy' : nombres[i],
    esHoy: fecha === hoyBogota,
    visitas: (data || []).filter((c) => (c.fecha_hora_confirmada || '').slice(0, 10) === fecha).length,
    completadas: (data || []).filter(
      (c) => (c.fecha_hora_confirmada || '').slice(0, 10) === fecha && c.check_out_at
    ).length,
  }));
}

/* ---------- informes (diario / semanal / mensual) ---------- */

// Rango [desde, hasta] en Bogotá para cada tipo de periodo, anclado a
// la fecha de referencia (normalmente "hoy").
function rangoDePeriodo(tipo, fechaISO) {
  const ref = enBogota(fechaISO, 12); // mediodía evita problemas de borde por DST/redondeo
  if (tipo === 'dia') return { desde: fechaISO, hasta: fechaISO };

  if (tipo === 'semana') {
    const diaSemana = (ref.getUTCDay() + 6) % 7; // 0 = lunes
    const lunes = new Date(ref.getTime() - diaSemana * 86400000);
    const viernes = new Date(lunes.getTime() + 4 * 86400000);
    return {
      desde: lunes.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }),
      hasta: viernes.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }),
    };
  }

  // mes
  const [y, m] = fechaISO.split('-').map(Number);
  const ultimoDia = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { desde: `${fechaISO.slice(0, 7)}-01`, hasta: `${fechaISO.slice(0, 7)}-${String(ultimoDia).padStart(2, '0')}` };
}

async function citasCompletadasEnRango(desde, hasta) {
  const { data, error } = await supabase
    .from('citas')
    .select(
      'nombre_mascota, especie, nombre_dueno, telefono_contacto, tipo_consulta, direccion, ' +
        'fecha_hora_confirmada, check_out_at, valor_servicio, metodo_pago, observaciones'
    )
    .eq('estado', 'completada')
    .gte('check_out_at', `${desde}T00:00:00${OFFSET}`)
    .lte('check_out_at', `${hasta}T23:59:59${OFFSET}`)
    .order('check_out_at', { ascending: true });

  if (error) throw error;
  return data || [];
}

function agregarInforme(visitas, periodo) {
  const ingresos = visitas.reduce((s, c) => s + (Number(c.valor_servicio) || 0), 0);

  const porEspecie = {};
  const porMetodoPago = {};
  for (const c of visitas) {
    const esp = c.especie || 'Sin especificar';
    porEspecie[esp] = (porEspecie[esp] || 0) + 1;

    const met = c.metodo_pago || 'sin_registrar';
    if (!porMetodoPago[met]) porMetodoPago[met] = { visitas: 0, ingresos: 0 };
    porMetodoPago[met].visitas += 1;
    porMetodoPago[met].ingresos += Number(c.valor_servicio) || 0;
  }

  return {
    periodo,
    totales: {
      visitas: visitas.length,
      ingresos,
      ticketPromedio: visitas.length ? Math.round(ingresos / visitas.length) : 0,
    },
    porEspecie: Object.entries(porEspecie)
      .map(([especie, visitas]) => ({ especie, visitas }))
      .sort((a, b) => b.visitas - a.visitas),
    porMetodoPago: Object.entries(porMetodoPago)
      .map(([metodo, v]) => ({ metodo, ...v }))
      .sort((a, b) => b.ingresos - a.ingresos),
  };
}

async function informesPeriodo(tipo, fechaISO) {
  const { desde, hasta } = rangoDePeriodo(tipo, fechaISO);
  const visitas = await citasCompletadasEnRango(desde, hasta);
  return agregarInforme(visitas, { tipo, desde, hasta });
}

async function informesRango(desde, hasta) {
  const visitas = await citasCompletadasEnRango(desde, hasta);
  return agregarInforme(visitas, { tipo: 'rango', desde, hasta });
}

/* ---------- historial de clientes ---------- */

// Busca por teléfono (clientes de WhatsApp) o directamente por cliente_id.
// Devuelve el cliente, todas sus mascotas y el historial completo de
// citas de cada una — así el veterinario ve los antecedentes reales.
async function historialCliente({ telefono, clienteId }) {
  let cliente;

  if (clienteId) {
    const { data, error } = await supabase.from('clientes').select('*').eq('id', clienteId).maybeSingle();
    if (error) throw error;
    cliente = data;
  } else {
    const { data, error } = await supabase.from('clientes').select('*').eq('telefono', telefono).maybeSingle();
    if (error) throw error;
    cliente = data;
  }

  if (!cliente) return null;

  const { data: mascotas, error: errMascotas } = await supabase
    .from('mascotas')
    .select('*')
    .eq('cliente_id', cliente.id)
    .order('creado_en', { ascending: true });
  if (errMascotas) throw errMascotas;

  const { data: citas, error: errCitas } = await supabase
    .from('citas')
    .select('id, mascota_id, tipo_consulta, fecha_hora_confirmada, estado, observaciones, valor_servicio, metodo_pago')
    .eq('cliente_id', cliente.id)
    .order('fecha_hora_confirmada', { ascending: false });
  if (errCitas) throw errCitas;

  return {
    cliente: { id: cliente.id, nombre: cliente.nombre, telefono: cliente.telefono, canal: cliente.canal },
    mascotas: mascotas.map((m) => ({
      id: m.id,
      nombre: m.nombre,
      especie: m.especie,
      visitas: citas
        .filter((c) => c.mascota_id === m.id)
        .map((c) => ({
          motivo: c.tipo_consulta,
          fecha: c.fecha_hora_confirmada,
          estado: c.estado,
          observaciones: c.observaciones,
          valorServicio: c.valor_servicio,
          metodoPago: c.metodo_pago,
        })),
    })),
    totalVisitas: citas.filter((c) => c.estado === 'completada').length,
  };
}

/* ---------- notificación de disponibilidad a MÜVA ---------- */

async function notificarDisponibilidad(fechaISO) {
  const citas = await citasDelDia(fechaISO);
  const disp = calcularDisponibilidad(citas, fechaISO);
  if (!disp.proximoLibre) return null;

  const desde = new Date(disp.proximoLibre.inicio).toLocaleTimeString('es-CO', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/Bogota',
  });
  const mensaje = `Agenda libre desde las ${desde} (${disp.proximoLibre.minutos} min disponibles).`;

  const { error } = await supabase.from('notificaciones').upsert(
    { tipo: 'disponibilidad', fecha: fechaISO, mensaje, datos: disp.proximoLibre, actualizada_en: new Date().toISOString() },
    { onConflict: 'tipo,fecha' }
  );
  if (error) throw error;

  return { mensaje, proximoLibre: disp.proximoLibre };
}

async function ultimaNotificacion(fechaISO) {
  const { data } = await supabase
    .from('notificaciones')
    .select('mensaje, actualizada_en')
    .eq('tipo', 'disponibilidad')
    .eq('fecha', fechaISO)
    .maybeSingle();
  return data || null;
}

module.exports = {
  resumenDelDia,
  visitasDeLaSemana,
  informesPeriodo,
  informesRango,
  citasCompletadasEnRango,
  historialCliente,
  calcularDisponibilidad,
  notificarDisponibilidad,
  ultimaNotificacion,
  JORNADA_INICIO,
  JORNADA_FIN,
};
