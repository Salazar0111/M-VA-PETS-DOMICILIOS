/* MÜVA · Panel de operación */
const LLAVE_TOKEN = 'muva.panel.token';
const $ = (id) => document.getElementById(id);

let sesion = null;
let refresco = null;

/* ---------------- utilidades ---------------- */

const TZ = 'America/Bogota';

const hoyISO = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });

const hora = (iso) =>
  iso ? new Date(iso).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ }) : '—';

const fechaLarga = (fechaISO) =>
  new Date(`${fechaISO}T12:00:00-05:00`).toLocaleDateString('es-CO', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ,
  });

function duracion(min) {
  const m = Math.round(min || 0);
  if (m < 60) return `${m}<small> min</small>`;
  return `${Math.floor(m / 60)}<small>h</small> ${String(m % 60).padStart(2, '0')}<small>m</small>`;
}

function escapeAttr(texto) {
  const d = document.createElement('div');
  d.textContent = texto || '';
  return d.innerHTML.replace(/"/g, '&quot;');
}

function aviso(el, texto) {
  el.textContent = texto || '';
  el.classList.toggle('on', Boolean(texto));
}

/* ---------------- API ---------------- */

async function api(ruta) {
  const res = await fetch(ruta, {
    headers: { 'Content-Type': 'application/json', ...(sesion?.token ? { Authorization: `Bearer ${sesion.token}` } : {}) },
  });
  if (res.status === 401) {
    cerrarSesion();
    const err = new Error('Tu sesión expiró. Ingresa de nuevo.');
    err.sesionInvalida = true;
    throw err;
  }
  const cuerpo = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(cuerpo.error || 'No pudimos cargar la información');
  return cuerpo;
}

/* ---------------- sesión ---------------- */

function cerrarSesion() {
  sesion = null;
  localStorage.removeItem(LLAVE_TOKEN);
  if (refresco) clearInterval(refresco);
  $('v-panel').classList.add('oculto');
  $('v-login').classList.remove('oculto');
}

function abrirPanel() {
  $('v-login').classList.add('oculto');
  $('v-panel').classList.remove('oculto');
  const u = sesion.usuario;
  $('p-nombre').textContent = u.nombre;
  $('p-email').textContent = u.email;
  $('p-inicial').textContent = (u.nombre || 'M').trim()[0].toUpperCase();

  if (!$('p-fecha').value) $('p-fecha').value = hoyISO();
  cargar();

  if (refresco) clearInterval(refresco);
  refresco = setInterval(() => cargar(true), 60000);
}

async function restaurarSesion() {
  const token = localStorage.getItem(LLAVE_TOKEN);
  if (!token) return;
  sesion = { token };
  try {
    sesion.usuario = await api('/api/auth/me');
    if (sesion.usuario.rol !== 'admin') return cerrarSesion();
    abrirPanel();
  } catch (err) {
    // Un 401 real ya cerró la sesión dentro de api(). Cualquier otra falla
    // (red inestable, Railway despertando, un 500 pasajero) no debe forzar
    // el login de nuevo ni borrar el token — solo reintentamos.
    if (err.sesionInvalida) return;
    $('v-login').classList.add('oculto');
    $('v-panel').classList.remove('oculto');
    $('t-body').innerHTML = `
      <tr><td colspan="6">
        <div class="vacio">📡 No pudimos conectar con el servidor.<br>${err.message}<br><br>
          <button class="btn btn-ghost" id="btn-reintentar" type="button" style="width:auto;padding:10px 20px">Reintentar</button>
        </div>
      </td></tr>`;
    $('btn-reintentar').addEventListener('click', restaurarSesion);
  }
}

$('form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('btn-entrar');
  aviso($('login-error'), '');
  btn.disabled = true;
  btn.textContent = 'Entrando…';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: $('email').value.trim(), password: $('password').value }),
    });
    const datos = await res.json();
    if (!res.ok) throw new Error(datos.error || 'No pudimos iniciar sesión');
    if (datos.usuario.rol !== 'admin') throw new Error('Esta cuenta no tiene acceso al panel de MÜVA');

    sesion = datos;
    localStorage.setItem(LLAVE_TOKEN, datos.token);
    $('password').value = '';
    abrirPanel();
  } catch (err) {
    aviso($('login-error'), err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Entrar';
  }
});

$('btn-salir').addEventListener('click', cerrarSesion);
$('p-fecha').addEventListener('change', () => cargar());

/* ---------------- navegación de secciones ---------------- */

$('nav-resumen').addEventListener('click', () => {
  $('nav-resumen').classList.add('on');
  $('nav-informes').classList.remove('on');
  $('vista-resumen').classList.remove('oculto');
  $('vista-informes').classList.add('oculto');
});

$('nav-informes').addEventListener('click', () => {
  $('nav-informes').classList.add('on');
  $('nav-resumen').classList.remove('on');
  $('vista-informes').classList.remove('oculto');
  $('vista-resumen').classList.add('oculto');
  cargarInformes();
});

document.querySelectorAll('.periodo-btn').forEach((btn) =>
  btn.addEventListener('click', () => {
    document.querySelectorAll('.periodo-btn').forEach((b) => b.classList.remove('on'));
    btn.classList.add('on');

    const esRango = btn.dataset.periodo === 'rango';
    $('rango-wrap').classList.toggle('oculto', !esRango);
    if (esRango) {
      if (!$('rango-desde').value) $('rango-desde').value = hoyISO();
      if (!$('rango-hasta').value) $('rango-hasta').value = hoyISO();
      return; // se carga al pulsar "Aplicar", no automáticamente
    }
    cargarInformes();
  })
);

$('btn-aplicar-rango').addEventListener('click', () => cargarInformes());

$('btn-exportar').addEventListener('click', async () => {
  if (!ultimoRango) return;
  const { desde, hasta } = ultimoRango;
  const btn = $('btn-exportar');
  btn.disabled = true;
  btn.textContent = 'Generando…';

  try {
    const res = await fetch(`/api/muva/informes/exportar?desde=${desde}&hasta=${hasta}`, {
      headers: { Authorization: `Bearer ${sesion.token}` },
    });
    if (!res.ok) throw new Error('No pudimos generar el archivo');

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `muva-informe-${desde}-a-${hasta}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    btn.textContent = '⬇ Descargar Excel';
  } catch (err) {
    console.error(err);
    btn.textContent = 'Error al generar';
    setTimeout(() => (btn.textContent = '⬇ Descargar Excel'), 2500);
  } finally {
    btn.disabled = false;
  }
});

/* ---------------- historial de cliente ---------------- */

async function abrirHistorial(telefono) {
  $('hist-fondo').classList.remove('oculto');
  $('hist-nombre').textContent = 'Cargando…';
  $('hist-tel').textContent = telefono;
  $('hist-cuerpo').innerHTML = '<div class="cargando"><div class="spinner"></div>Buscando antecedentes…</div>';

  try {
    const d = await api(`/api/muva/cliente?telefono=${encodeURIComponent(telefono)}`);
    $('hist-nombre').textContent = d.cliente.nombre;
    $('hist-tel').textContent = `${d.cliente.telefono} · ${d.totalVisitas} visita${d.totalVisitas === 1 ? '' : 's'} atendida${d.totalVisitas === 1 ? '' : 's'} en total`;

    $('hist-cuerpo').innerHTML = d.mascotas
      .map((m) => {
        const visitas = m.visitas.filter((v) => v.estado === 'completada');
        return `<div class="hist-mascota">
          <h3>${m.nombre}</h3>
          <div class="esp">${m.especie || 'Especie sin registrar'} · ${visitas.length} antecedente${visitas.length === 1 ? '' : 's'}</div>
          ${
            visitas.length
              ? visitas
                  .map(
                    (v) => `<div class="hist-visita">
                      <div class="fila-top"><span>${v.motivo || 'Consulta'}</span><span>${v.fecha ? fechaLarga(v.fecha.slice(0, 10)) : ''}</span></div>
                      <div class="txt">${escapeAttr(v.observaciones || 'Sin observaciones registradas')}</div>
                    </div>`
                  )
                  .join('')
              : '<div class="hist-visita"><div class="txt">Sin visitas completadas todavía.</div></div>'
          }
        </div>`;
      })
      .join('');
  } catch (err) {
    $('hist-nombre').textContent = 'Sin antecedentes';
    $('hist-tel').textContent = telefono;
    $('hist-cuerpo').innerHTML = `<div class="vacio">🌿 ${err.message}</div>`;
  }
}

$('hist-cerrar').addEventListener('click', () => $('hist-fondo').classList.add('oculto'));
$('hist-fondo').addEventListener('click', (e) => {
  if (e.target.id === 'hist-fondo') $('hist-fondo').classList.add('oculto');
});

/* ---------------- pintar ---------------- */

async function cargar(silencioso = false) {
  const fecha = $('p-fecha').value || hoyISO();
  $('p-fecha-larga').textContent = fechaLarga(fecha);

  if (!silencioso) {
    $('t-body').innerHTML = '<tr><td colspan="6"><div class="cargando"><div class="spinner"></div>Cargando…</div></td></tr>';
  }

  try {
    const [resumen, semana] = await Promise.all([
      api(`/api/muva/resumen/${fecha}`),
      api(`/api/muva/semana/${fecha}`),
    ]);
    pintarKPIs(resumen);
    pintarEstado(resumen);
    pintarCitas(resumen);
    pintarDisponibilidad(resumen);
    pintarSemana(semana);
    pintarObservaciones(resumen);
  } catch (err) {
    $('t-body').innerHTML = `<tr><td colspan="6"><div class="vacio">${err.message}</div></td></tr>`;
  }
}

const plata = (n) => `$${Math.round(n || 0).toLocaleString('es-CO')}`;

function pintarKPIs({ kpis }) {
  $('k-visitas').textContent = kpis.visitas;
  $('k-completadas').innerHTML = `${kpis.completadas}<small> / ${kpis.visitas}</small>`;
  $('k-completadas-sub').textContent =
    kpis.visitas - kpis.completadas > 0 ? `${kpis.visitas - kpis.completadas} pendientes` : 'Jornada al día';
  $('k-facturado').textContent = plata(kpis.facturadoHoy);
  $('k-km').innerHTML = `${kpis.km}<small> km</small>`;
  $('k-km-sub').innerHTML = `${duracion(kpis.desplazamientoMin)} de desplazamiento`;
  $('k-prom').innerHTML = duracion(kpis.promedioMin);
}

function pintarEstado({ veterinario, disponibilidad }) {
  const pill = $('p-estado');
  const ocupado = veterinario.estado === 'en_consulta';
  pill.classList.toggle('ocupado', ocupado);
  $('p-vet-t1').textContent = ocupado ? 'En consulta' : 'Disponible';
  $('p-vet-t2').textContent = ocupado
    ? `${veterinario.atendiendo.mascota} · desde ${hora(veterinario.atendiendo.desde)}`
    : 'Sin visita en curso';
  $('p-prox').textContent = disponibilidad.proximoLibre
    ? hora(disponibilidad.proximoLibre.inicio)
    : disponibilidad.motivoSinLibre === 'jornada_finalizada'
    ? 'Jornada finalizada'
    : 'Agenda completa';
}

function pintarCitas({ citas }) {
  const cuerpo = $('t-body');
  $('t-meta').textContent = citas.length ? `${citas.length} en ruta` : '';

  if (!citas.length) {
    cuerpo.innerHTML = '<tr><td colspan="6"><div class="vacio">🌿 No hay citas agendadas para este día.</div></td></tr>';
    return;
  }

  const etiqueta = { completada: 'Completada', en_consulta: 'En consulta', programada: 'Programada' };
  cuerpo.innerHTML = citas
    .map(
      (c) => `<tr>
        <td><span class="ord">${c.estado === 'completada' ? '✓' : c.orden ?? '·'}</span></td>
        <td><div class="pet">${c.mascota || '—'}</div><div class="sub-c" title="${escapeAttr(c.direccion || '')}">${[c.especie, c.canal === 'instagram' ? 'Instagram' : 'WhatsApp'].filter(Boolean).join(' · ')}</div></td>
        <td>
          <div class="pet" style="font-size:13px">${c.nombreDueno || '—'}</div>
          <div class="sub-c">${c.telefonoContacto || 'Sin teléfono'}</div>
          ${c.telefonoContacto ? `<button class="btn-hist" type="button" data-telefono="${escapeAttr(c.telefonoContacto)}">Ver historial</button>` : ''}
        </td>
        <td class="zone">${c.motivo || '—'}</td>
        <td>${hora(c.hora)}</td>
        <td><span class="st ${c.estado}"><span class="dot"></span>${etiqueta[c.estado]}</span>
          ${c.observaciones ? `<span class="nota" title="${escapeAttr(c.observaciones)}">📝</span>` : ''}
        </td>
      </tr>`
    )
    .join('');

  cuerpo.querySelectorAll('.btn-hist').forEach((btn) =>
    btn.addEventListener('click', () => abrirHistorial(btn.dataset.telefono))
  );
}

function pintarObservaciones({ citas }) {
  const conNota = citas.filter((c) => c.observaciones);
  $('obs-meta').textContent = conNota.length ? `${conNota.length} visitas con nota` : '';

  if (!conNota.length) {
    $('obs-lista').innerHTML = '<div class="vacio">🌿 Aún no hay observaciones registradas para este día.</div>';
    return;
  }

  $('obs-lista').innerHTML = conNota
    .map(
      (c) => `<div class="obs-item">
        <div class="quien">
          <div class="pet">${c.mascota || '—'}</div>
          <div class="meta">${hora(c.hora)} · ${NOMBRE_METODO[c.metodoPago] || 'Sin registrar'}</div>
        </div>
        <div class="texto">${escapeAttr(c.observaciones)}</div>
        <div class="plata">${c.valorServicio ? plata(c.valorServicio) : '—'}</div>
      </div>`
    )
    .join('');
}

function pintarDisponibilidad({ disponibilidad, avisoDisponibilidad, fecha }) {
  const { bloques, proximoLibre, totalLibreMin, jornada, motivoSinLibre } = disponibilidad;
  const total = new Date(jornada.cierra) - new Date(jornada.abre);
  const ahora = new Date();
  const esHoy = fecha === hoyISO();

  $('d-timeline').innerHTML = bloques
    .map((b) => {
      const inicio = new Date(b.inicio);
      const fin = new Date(b.fin);
      const ancho = ((fin - inicio) / total) * 100;
      const rango = `${hora(b.inicio)} – ${hora(b.fin)}`;

      // Solo marcamos "ahora" cuando de verdad estamos viendo hoy y el
      // instante cae dentro de este bloque; otro día no tiene sentido.
      const marca =
        esHoy && ahora >= inicio && ahora <= fin
          ? `<div class="ahora-marca" style="left:${((ahora - inicio) / (fin - inicio)) * 100}%"></div>`
          : '';

      if (b.tipo === 'ocupado') {
        const nombres = (b.mascotas || []).join(', ') || 'Consulta';
        const texto = ancho > 9 ? `<span class="mascota">${nombres}</span><span class="rango">${rango}</span>` : '';
        return `<div class="seg ocupado" style="width:${ancho}%" title="${nombres} · ${rango}">${texto}${marca}</div>`;
      }
      const texto = ancho > 7 ? 'libre' : '';
      return `<div class="seg libre" style="width:${ancho}%" title="Libre · ${rango}">${texto}${marca}</div>`;
    })
    .join('');

  $('d-cap').textContent = `Jornada 8:00 a.m. – 4:00 p.m. · ${Math.round(totalLibreMin)} min libres en total`;

  const caja = $('d-nextfree');
  caja.classList.remove('finalizada', 'completa');

  if (proximoLibre) {
    $('d-libre-lab').textContent = esHoy ? 'Próximo bloque libre' : 'Primer bloque libre del día';
    $('d-libre').textContent = `${hora(proximoLibre.inicio)} – ${hora(proximoLibre.fin)} (${proximoLibre.minutos} min)`;
  } else if (motivoSinLibre === 'jornada_finalizada') {
    caja.classList.add('finalizada');
    $('d-libre-lab').textContent = 'Jornada finalizada';
    $('d-libre').textContent = 'La ventana de 8:00 a.m. – 4:00 p.m. ya terminó por hoy.';
  } else {
    caja.classList.add('completa');
    $('d-libre-lab').textContent = 'Agenda completa';
    $('d-libre').textContent = 'No quedan espacios libres en la jornada.';
  }

  $('d-aviso').innerHTML = avisoDisponibilidad
    ? `🌿 <span><b>MÜVA fue notificado.</b> ${avisoDisponibilidad.mensaje}</span>`
    : '🌿 <span>El aviso de disponibilidad se envía al cerrar una visita.</span>';
}

function pintarSemana({ dias }) {
  const max = Math.max(1, ...dias.map((d) => d.visitas));
  $('s-bars').innerHTML = dias
    .map(
      (d) => `<div class="bar ${d.esHoy ? 'on' : ''}">
        <div class="v">${d.visitas}</div>
        <div class="col" style="height:${(d.visitas / max) * 100}%"></div>
        <div class="d">${d.dia}</div>
      </div>`
    )
    .join('');
}

/* ---------------- informes ---------------- */

const NOMBRE_METODO = { efectivo: 'Efectivo', transferencia: 'Transferencia', link_pago: 'Link de pago', sin_registrar: 'Sin registrar' };
const NOMBRE_PERIODO = { dia: 'Hoy', semana: 'Esta semana', mes: 'Este mes', rango: 'Rango' };

// Rango de fechas exacto del último informe pintado en pantalla. La
// exportación lo reutiliza para no recalcular nada y garantizar que el
// Excel descargado coincide siempre con lo que se está viendo.
let ultimoRango = null;

async function cargarInformes() {
  const periodo = document.querySelector('.periodo-btn.on')?.dataset.periodo || 'dia';

  $('i-especie').innerHTML = '<tr><td><div class="cargando"><div class="spinner"></div>Cargando…</div></td></tr>';
  $('i-pago').innerHTML = '';

  try {
    let d;
    if (periodo === 'rango') {
      const desde = $('rango-desde').value;
      const hasta = $('rango-hasta').value;
      if (!desde || !hasta) throw new Error('Selecciona las dos fechas del rango');
      if (desde > hasta) throw new Error('"Desde" no puede ser posterior a "Hasta"');
      d = await api(`/api/muva/informes/rango?desde=${desde}&hasta=${hasta}`);
    } else {
      const fecha = $('p-fecha').value || hoyISO();
      d = await api(`/api/muva/informes/${periodo}/${fecha}`);
    }
    pintarInformes(d);
  } catch (err) {
    $('i-especie').innerHTML = `<tr><td><div class="vacio">${err.message}</div></td></tr>`;
  }
}

function pintarInformes(d) {
  ultimoRango = { desde: d.periodo.desde, hasta: d.periodo.hasta };
  $('btn-exportar').disabled = false;
  $('i-visitas').textContent = d.totales.visitas;
  $('i-ingresos').textContent = plata(d.totales.ingresos);
  $('i-ticket').textContent = plata(d.totales.ticketPromedio);

  const rango = d.periodo.desde === d.periodo.hasta ? '' : ` · ${d.periodo.desde} a ${d.periodo.hasta}`;
  $('i-periodo-txt').textContent = `${NOMBRE_PERIODO[d.periodo.tipo]}${rango}`;

  if (!d.porEspecie.length) {
    $('i-especie').innerHTML = '<tr><td><div class="vacio">🌿 Sin visitas atendidas en este periodo.</div></td></tr>';
  } else {
    const max = Math.max(...d.porEspecie.map((e) => e.visitas));
    $('i-especie').innerHTML = d.porEspecie
      .map(
        (e) => `<tr><td>
          <div class="i-row" style="padding-left:0;padding-right:0;border:none">
            <span class="nom">${e.especie}</span>
            <div class="i-bar-wrap"><div class="i-bar" style="width:${(e.visitas / max) * 100}%"></div></div>
            <span class="cant">${e.visitas}</span>
          </div>
        </td></tr>`
      )
      .join('');
  }

  if (!d.porMetodoPago.length) {
    $('i-pago').innerHTML = '<tr><td><div class="vacio">🌿 Sin pagos registrados en este periodo.</div></td></tr>';
  } else {
    $('i-pago').innerHTML = d.porMetodoPago
      .map(
        (m) => `<tr><td>
          <div class="i-row" style="padding-left:0;padding-right:0;border:none">
            <span class="nom">${NOMBRE_METODO[m.metodo] || m.metodo}</span>
            <span class="cant">${m.visitas} visitas</span>
            <span class="plata">${plata(m.ingresos)}</span>
          </div>
        </td></tr>`
      )
      .join('');
  }
}

/* ---------------- arranque ---------------- */
restaurarSesion();
