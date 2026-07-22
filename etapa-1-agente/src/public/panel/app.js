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
    cargarInformes();
  })
);

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
        <td><div class="pet">${c.mascota || '—'}</div><div class="sub-c">${[c.especie, c.motivo].filter(Boolean).join(' · ')}</div></td>
        <td class="zone">${c.direccion || '—'}</td>
        <td class="zone">${c.canal === 'instagram' ? 'Instagram' : 'WhatsApp'}</td>
        <td>${hora(c.hora)}</td>
        <td><span class="st ${c.estado}"><span class="dot"></span>${etiqueta[c.estado]}</span>
          ${c.observaciones ? `<span class="nota" title="${escapeAttr(c.observaciones)}">📝</span>` : ''}
        </td>
      </tr>`
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

const plata = (n) => `$${Math.round(n || 0).toLocaleString('es-CO')}`;

const NOMBRE_METODO = { efectivo: 'Efectivo', transferencia: 'Transferencia', link_pago: 'Link de pago', sin_registrar: 'Sin registrar' };
const NOMBRE_PERIODO = { dia: 'Hoy', semana: 'Esta semana', mes: 'Este mes' };

async function cargarInformes() {
  const periodo = document.querySelector('.periodo-btn.on')?.dataset.periodo || 'dia';
  const fecha = $('p-fecha').value || hoyISO();

  $('i-especie').innerHTML = '<tr><td><div class="cargando"><div class="spinner"></div>Cargando…</div></td></tr>';
  $('i-pago').innerHTML = '';

  try {
    const d = await api(`/api/muva/informes/${periodo}/${fecha}`);
    pintarInformes(d);
  } catch (err) {
    $('i-especie').innerHTML = `<tr><td><div class="vacio">${err.message}</div></td></tr>`;
  }
}

function pintarInformes(d) {
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
