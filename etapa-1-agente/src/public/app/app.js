/* MÜVA · App del veterinario */
const LLAVE_TOKEN = 'muva.token';
const $ = (id) => document.getElementById(id);

let sesion = null;      // { token, usuario }
let citas = [];         // jornada de hoy
let citaAbierta = null; // cita en la vista de detalle
let cronoTimer = null;

/* ---------------- utilidades ---------------- */

const hoyISO = () => {
  // Fecha local (Bogotá en el dispositivo), no UTC: evita saltar de día de noche.
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const hora = (iso) =>
  iso ? new Date(iso).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true }) : '—';

const fechaLarga = () =>
  new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });

function duracion(min) {
  if (min == null) return '—';
  const m = Math.round(min);
  if (m < 60) return `${m}<small> min</small>`;
  return `${Math.floor(m / 60)}<small>h</small> ${String(m % 60).padStart(2, '0')}<small>m</small>`;
}

function mostrar(vista) {
  document.querySelectorAll('.vista').forEach((v) => v.classList.remove('on'));
  $(vista).classList.add('on');
  window.scrollTo(0, 0);
}

function aviso(el, texto) {
  el.textContent = texto || '';
  el.classList.toggle('on', Boolean(texto));
}

/* ---------------- API ---------------- */

async function api(ruta, opciones = {}) {
  const res = await fetch(ruta, {
    ...opciones,
    headers: {
      'Content-Type': 'application/json',
      ...(sesion?.token ? { Authorization: `Bearer ${sesion.token}` } : {}),
      ...opciones.headers,
    },
  });

  if (res.status === 401) {
    cerrarSesion();
    throw new Error('Tu sesión expiró. Ingresa de nuevo.');
  }

  const cuerpo = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(cuerpo.error || 'No pudimos completar la acción');
  return cuerpo;
}

/* ---------------- sesión ---------------- */

function guardarSesion(datos) {
  sesion = datos;
  localStorage.setItem(LLAVE_TOKEN, datos.token);
}

function cerrarSesion() {
  sesion = null;
  citas = [];
  localStorage.removeItem(LLAVE_TOKEN);
  mostrar('v-login');
}

async function restaurarSesion() {
  const token = localStorage.getItem(LLAVE_TOKEN);
  if (!token) return mostrar('v-login');

  sesion = { token };
  try {
    sesion.usuario = await api('/api/auth/me');
    await cargarRuta();
  } catch {
    cerrarSesion();
  }
}

$('form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('btn-entrar');
  aviso($('login-error'), '');
  btn.disabled = true;
  btn.textContent = 'Ingresando…';

  try {
    const datos = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: $('email').value.trim(), password: $('password').value }),
    });
    guardarSesion(datos);
    $('password').value = '';
    await cargarRuta();
  } catch (err) {
    aviso($('login-error'), err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Ingresar a mi jornada';
  }
});

$('btn-salir').addEventListener('click', cerrarSesion);

/* ---------------- ruta del día ---------------- */

async function cargarRuta() {
  mostrar('v-ruta');
  $('lista-visitas').innerHTML = '<div class="cargando"><div class="spinner"></div>Cargando tu jornada…</div>';
  $('ruta-fecha').textContent = fechaLarga();
  $('ruta-saludo').textContent = sesion?.usuario?.nombre
    ? `Buenos días,\n${sesion.usuario.nombre}`
    : 'Tu jornada';

  try {
    const datos = await api(`/api/veterinario/ruta/${hoyISO()}`);
    citas = datos.citas || [];
    pintarRuta();
  } catch (err) {
    $('lista-visitas').innerHTML = `<div class="vacio"><span class="em">⚠️</span>${err.message}</div>`;
  }
}

function esCompletada(c) {
  return Boolean(c.check_out_at);
}
function enCurso(c) {
  return Boolean(c.check_in_at) && !c.check_out_at;
}

function pintarRuta() {
  const total = citas.length;
  const hechas = citas.filter(esCompletada).length;
  const km = citas.reduce((s, c) => s + (Number(c.distancia_km) || 0), 0);

  $('r-total').textContent = total;
  $('r-hechas').textContent = hechas;
  $('r-km').innerHTML = total ? `${km.toFixed(1)}<small> km</small>` : '—';

  const lista = $('lista-visitas');

  if (!total) {
    lista.innerHTML =
      '<div class="vacio"><span class="em">🌿</span>No tienes visitas agendadas para hoy.<br>Disfruta el día.</div>';
    return;
  }

  const siguiente = citas.find((c) => !esCompletada(c));
  lista.innerHTML = '';

  citas.forEach((c, i) => {
    const done = esCompletada(c);
    const curso = enCurso(c);
    const esSiguiente = siguiente && c.id === siguiente.id;

    const chip = done
      ? '<span class="chip done">Completada</span>'
      : curso
      ? '<span class="chip curso">En consulta</span>'
      : esSiguiente
      ? '<span class="chip ahora">Siguiente</span>'
      : '<span class="chip pend">Programada</span>';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `visita ${done ? 'lista-done' : ''} ${esSiguiente && !done ? 'ahora' : ''}`;
    btn.innerHTML = `
      <span class="ord">${done ? '✓' : c.orden_ruta ?? i + 1}</span>
      <span class="info">
        <span class="mascota">${c.nombre_mascota || 'Sin nombre'}</span>
        <span class="dir">${c.direccion || ''}</span>
        <span class="hora">${hora(c.fecha_hora_confirmada)} · ${c.especie || ''}</span>
      </span>
      ${chip}`;
    btn.addEventListener('click', () => abrirDetalle(c.id));
    lista.appendChild(btn);
  });

  // Cuando ya no queda nada pendiente, ofrecemos el cierre de jornada.
  if (hechas === total) {
    const cerrar = document.createElement('button');
    cerrar.type = 'button';
    cerrar.className = 'btn btn-forest';
    cerrar.style.marginTop = '8px';
    cerrar.textContent = 'Ver cierre de jornada';
    cerrar.addEventListener('click', pintarCierre);
    lista.appendChild(cerrar);
  }
}

/* ---------------- detalle ---------------- */

function abrirDetalle(id) {
  citaAbierta = citas.find((c) => c.id === id);
  if (!citaAbierta) return;
  const c = citaAbierta;

  aviso($('d-error'), '');
  $('d-posicion').textContent = `Visita ${citas.indexOf(c) + 1} de ${citas.length}`;
  $('d-parada').textContent = `Parada ${String(c.orden_ruta ?? citas.indexOf(c) + 1).padStart(2, '0')}`;
  $('d-mascota').textContent = c.nombre_mascota || 'Sin nombre';
  $('d-sub').textContent = [c.especie, c.tipo_consulta].filter(Boolean).join(' · ');
  $('d-dir').textContent = c.direccion || '—';
  $('d-motivo').textContent = c.tipo_consulta || '—';
  $('d-hora').textContent = hora(c.fecha_hora_confirmada);
  $('d-mapa').href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    (c.direccion || '') + ', Bogotá'
  )}`;

  pintarAccion();
  mostrar('v-detalle');
}

function pintarAccion() {
  const c = citaAbierta;
  const btn = $('btn-accion');
  const obsWrap = $('d-obs-wrap');
  detenerCrono();

  if (esCompletada(c)) {
    btn.textContent = 'Visita completada ✓';
    btn.disabled = true;
    btn.className = 'btn btn-ghost';
    $('d-crono').style.display = 'none';
    // Ya cerrada: mostramos lo que quedó guardado, sin editar.
    obsWrap.classList.remove('oculto');
    $('d-obs').value = c.observaciones || '';
    $('d-obs').disabled = true;
    $('d-valor').value = c.valor_servicio ?? '';
    $('d-valor').disabled = true;
    $('d-pago').value = c.metodo_pago || '';
    $('d-pago').disabled = true;
    return;
  }

  btn.disabled = false;
  $('d-obs').disabled = false;
  $('d-valor').disabled = false;
  $('d-pago').disabled = false;

  if (enCurso(c)) {
    btn.textContent = 'Finalizar visita · Check-out';
    btn.className = 'btn btn-forest';
    $('d-crono').style.display = 'flex';
    iniciarCrono(new Date(c.check_in_at));
    // Estos datos solo se piden al cerrar, cuando ya hubo consulta.
    obsWrap.classList.remove('oculto');
    $('d-obs').value = '';
    $('d-valor').value = '';
    $('d-pago').value = '';
  } else {
    btn.textContent = 'Llegué · Check-in';
    btn.className = 'btn btn-terra';
    $('d-crono').style.display = 'none';
    obsWrap.classList.add('oculto');
  }
}

function iniciarCrono(desde) {
  const tick = () => {
    const s = Math.max(0, Math.floor((Date.now() - desde.getTime()) / 1000));
    const hh = String(Math.floor(s / 3600)).padStart(2, '0');
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    $('d-crono-txt').textContent = `En consulta · ${hh}:${mm}:${ss}`;
  };
  tick();
  cronoTimer = setInterval(tick, 1000);
}

function detenerCrono() {
  if (cronoTimer) clearInterval(cronoTimer);
  cronoTimer = null;
}

$('btn-accion').addEventListener('click', async () => {
  const c = citaAbierta;
  const btn = $('btn-accion');
  const accion = enCurso(c) ? 'checkout' : 'checkin';

  aviso($('d-error'), '');

  // Observación, valor y método de pago son obligatorios para cerrar la
  // visita: son el dato que alimenta los informes de MÜVA. Se valida aquí
  // antes de gastar una llamada al servidor.
  let cuerpo;
  if (accion === 'checkout') {
    const observaciones = $('d-obs').value.trim();
    const valorServicio = $('d-valor').value;
    const metodoPago = $('d-pago').value;

    if (!observaciones) {
      aviso($('d-error'), 'Escribe una observación de la visita antes de cerrarla.');
      return $('d-obs').focus();
    }
    if (!valorServicio || Number(valorServicio) <= 0) {
      aviso($('d-error'), 'Ingresa el valor cobrado por la consulta.');
      return $('d-valor').focus();
    }
    if (!metodoPago) {
      aviso($('d-error'), 'Selecciona el método de pago.');
      return $('d-pago').focus();
    }
    cuerpo = JSON.stringify({ observaciones, valorServicio, metodoPago });
  }

  btn.disabled = true;
  btn.textContent = accion === 'checkin' ? 'Registrando llegada…' : 'Cerrando visita…';

  try {
    const actualizada = await api(`/api/veterinario/${accion}/${c.id}`, {
      method: 'POST',
      body: cuerpo,
    });
    const i = citas.findIndex((x) => x.id === c.id);
    if (i >= 0) citas[i] = { ...citas[i], ...actualizada };
    citaAbierta = citas[i];

    if (accion === 'checkout') {
      detenerCrono();
      pintarRuta();
      mostrar('v-ruta');
    } else {
      pintarAccion();
    }
  } catch (err) {
    aviso($('d-error'), err.message);
    btn.disabled = false;
    pintarAccion();
  }
});

$('btn-volver').addEventListener('click', () => {
  detenerCrono();
  pintarRuta();
  mostrar('v-ruta');
});

/* ---------------- cierre de jornada ---------------- */

function pintarCierre() {
  const hechas = citas.filter(esCompletada);
  const km = citas.reduce((s, c) => s + (Number(c.distancia_km) || 0), 0);
  const desplazamiento = citas.reduce((s, c) => s + (Number(c.duracion_min) || 0), 0);
  const consulta = hechas.reduce((s, c) => s + (Number(c.duracion_real_min) || 0), 0);
  const promedio = hechas.length ? consulta / hechas.length : 0;

  $('c-titulo').innerHTML = `${hechas.length} de ${citas.length} visitas<br>atendidas`;
  $('c-km').innerHTML = `${km.toFixed(1)}<small> km</small>`;
  $('c-desp').innerHTML = duracion(desplazamiento);
  $('c-consulta').innerHTML = duracion(consulta);
  $('c-prom').innerHTML = duracion(promedio);

  const ultima = hechas
    .map((c) => c.check_out_at)
    .filter(Boolean)
    .sort()
    .pop();
  // hora() en es-CO ya termina en punto ("8:32 p. m."); no añadimos otro.
  $('c-libre').textContent = ultima
    ? `Tu agenda quedó libre desde las ${hora(ultima)}`
    : 'Tu agenda quedó libre.';

  mostrar('v-cierre');
}

$('btn-volver-ruta').addEventListener('click', () => {
  pintarRuta();
  mostrar('v-ruta');
});

/* ---------------- arranque ---------------- */

restaurarSesion();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/app/sw.js').catch(() => {}));
}
