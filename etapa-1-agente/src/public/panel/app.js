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
    throw new Error('Tu sesión expiró. Ingresa de nuevo.');
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
  } catch {
    cerrarSesion();
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
  } catch (err) {
    $('t-body').innerHTML = `<tr><td colspan="6"><div class="vacio">${err.message}</div></td></tr>`;
  }
}

function pintarKPIs({ kpis }) {
  $('k-visitas').textContent = kpis.visitas;
  $('k-completadas').innerHTML = `${kpis.completadas}<small> / ${kpis.visitas}</small>`;
  $('k-completadas-sub').textContent =
    kpis.visitas - kpis.completadas > 0 ? `${kpis.visitas - kpis.completadas} pendientes` : 'Jornada al día';
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
  $('p-prox').textContent = disponibilidad.proximoLibre ? hora(disponibilidad.proximoLibre.inicio) : 'Sin espacio';
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
        <td><div class="pet">${c.mascota || '—'}</div><div class="sub-c">${[c.especie, c.motivo].filter(Boolean).join(' · ')}</div></td>
        <td class="zone">${c.direccion || '—'}</td>
        <td class="zone">${c.canal === 'instagram' ? 'Instagram' : 'WhatsApp'}</td>
        <td>${hora(c.hora)}</td>
        <td><span class="st ${c.estado}"><span class="dot"></span>${etiqueta[c.estado]}</span></td>
      </tr>`
    )
    .join('');
}

function pintarDisponibilidad({ disponibilidad, avisoDisponibilidad }) {
  const { bloques, proximoLibre, totalLibreMin, jornada } = disponibilidad;
  const total = new Date(jornada.cierra) - new Date(jornada.abre);

  $('d-timeline').innerHTML = bloques
    .map((b) => {
      const ancho = ((new Date(b.fin) - new Date(b.inicio)) / total) * 100;
      const texto = ancho > 11 ? (b.tipo === 'libre' ? 'libre' : 'consulta') : '';
      return `<div class="seg ${b.tipo}" style="width:${ancho}%" title="${b.tipo} ${hora(b.inicio)}–${hora(b.fin)}">${texto}</div>`;
    })
    .join('');

  $('d-cap').textContent = `Jornada 8:00 a.m. – 4:00 p.m. · ${Math.round(totalLibreMin)} min libres`;
  $('d-libre').textContent = proximoLibre
    ? `${hora(proximoLibre.inicio)} – ${hora(proximoLibre.fin)}`
    : 'Sin espacio disponible';

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

/* ---------------- arranque ---------------- */
restaurarSesion();
