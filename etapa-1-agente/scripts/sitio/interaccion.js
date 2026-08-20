/* MÜVA PETS · microinteracciones del sitio de documentación
   ---------------------------------------------------------------------
   Sin librerías: IntersectionObserver y transformaciones CSS. Un
   documento clínico no necesita un motor de animación de 90 KB, y así
   abre igual de rápido en el celular del veterinario en la calle.

   Dos reglas de las que no nos movemos:

   1. El contenido nunca depende del JavaScript para ser visible. El CSS
      solo esconde los bloques si este script alcanza a marcar
      <html class="animar">, y aun así hay una red de seguridad que los
      muestra todos si el observador no responde. Un manual en blanco
      porque una animación no disparó es peor que no tener animación.

   2. Nada depende de requestAnimationFrame. En pestañas en segundo
      plano, con ahorro de batería o dentro de ciertos webviews, rAF se
      congela: si el reveal colgara de él, el texto no aparecería nunca.
      Se usa un acelerador con temporizadores, que se atrasa pero jamás
      se queda trabado. */

(function () {
  'use strict';

  var quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var puedeAnimar = !quieto && 'IntersectionObserver' in window;

  /* ── 1. Aparición progresiva al hacer scroll ──────────────────────── */
  function prepararReveals() {
    if (!puedeAnimar) return;

    var objetivos = document.querySelectorAll(
      '.hoja > header, .hoja > section, .hoja > nav, .hoja > .docs > *, .hoja > .pie'
    );

    var piezas = [];
    Array.prototype.forEach.call(objetivos, function (bloque) {
      // Los bloques con varios hijos entran escalonados, para que la
      // sección se lea como una unidad y no como diez cosas parpadeando.
      var hijos = bloque.matches('.doc') ? [bloque] : Array.prototype.slice.call(bloque.children);
      var grupo = hijos.length > 1 ? hijos : [bloque];
      grupo.forEach(function (el, i) {
        el.classList.add('rv');
        el.style.transitionDelay = Math.min(i * 55, 330) + 'ms';
        piezas.push(el);
      });
    });

    if (!piezas.length) return;

    // A partir de acá el CSS ya puede esconder: el script está vivo.
    document.documentElement.classList.add('animar');

    function revelar(el) {
      el.classList.add('on');
    }

    var obs = new IntersectionObserver(
      function (entradas) {
        entradas.forEach(function (e) {
          if (!e.isIntersecting) return;
          revelar(e.target);
          obs.unobserve(e.target); // revelado una vez, revelado para siempre
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 }
    );

    piezas.forEach(function (el) { obs.observe(el); });

    // Lo que ya está en pantalla no debe esperar a que el usuario mueva
    // el dedo. Comprobación directa, sin rAF de por medio.
    function revelarLoVisible() {
      var alto = window.innerHeight || document.documentElement.clientHeight;
      piezas.forEach(function (el) {
        if (el.classList.contains('on')) return;
        var caja = el.getBoundingClientRect();
        if (caja.top < alto * 0.95 && caja.bottom > 0) revelar(el);
      });
    }
    revelarLoVisible();
    setTimeout(revelarLoVisible, 120);

    // Segundo respaldo: por si el observador no entrega nada. Con esto
    // basta con hacer scroll para que el contenido siga apareciendo.
    var ultimo = 0;
    window.addEventListener(
      'scroll',
      function () {
        var ahora = Date.now();
        if (ahora - ultimo < 100) return;
        ultimo = ahora;
        revelarLoVisible();
      },
      { passive: true }
    );

    // Interruptor de emergencia. No basta con preguntar si se marcaron
    // piezas como reveladas: hay entornos donde la clase se aplica pero
    // la transición nunca avanza (render congelado, compositor detenido),
    // y el texto queda en opacidad 0 para siempre. Por eso se comprueba
    // el resultado PINTADO. Si a los 2,5 s una pieza ya revelada sigue
    // invisible, se quita "animar": desaparece la regla que esconde y el
    // documento se ve sin depender de ninguna transición.
    setTimeout(function () {
      var muestra = document.querySelector('.rv.on');
      if (!muestra || window.getComputedStyle(muestra).opacity === '0') {
        document.documentElement.classList.remove('animar');
      }
    }, 2500);
  }

  /* ── 2. Barra de progreso, cabecera flotante y botón de volver ────── */
  function prepararScroll() {
    var progreso = document.querySelector('.progreso');
    var barra = document.querySelector('.barra');
    var arriba = document.querySelector('.arriba');
    var ambiente = document.querySelectorAll('.ambiente i');

    function alScroll() {
      var y = window.scrollY || document.documentElement.scrollTop || 0;
      var alto = document.documentElement.scrollHeight - window.innerHeight;
      var razon = alto > 0 ? Math.min(1, Math.max(0, y / alto)) : 0;

      if (progreso) progreso.style.transform = 'scaleX(' + razon + ')';
      if (barra) barra.classList.toggle('on', y > 180);
      if (arriba) arriba.classList.toggle('on', y > 600);

      // Paralaje muy leve del fondo: da profundidad al cristal sin que
      // se note que "algo se mueve".
      if (!quieto) {
        for (var i = 0; i < ambiente.length; i++) {
          ambiente[i].style.transform = 'translate3d(0,' + y * (0.04 + i * 0.025) + 'px,0)';
        }
      }
    }

    // Acelerador por tiempo: se ejecuta de inmediato si pasaron más de
    // 24 ms desde la última vez, y si no, agenda la última. Nunca se
    // queda esperando un frame que puede no llegar.
    var ultimo = 0;
    var pendiente = null;
    function pedir() {
      var ahora = Date.now();
      if (ahora - ultimo >= 24) {
        ultimo = ahora;
        alScroll();
        return;
      }
      if (pendiente) return;
      pendiente = setTimeout(function () {
        pendiente = null;
        ultimo = Date.now();
        alScroll();
      }, 24);
    }

    window.addEventListener('scroll', pedir, { passive: true });
    window.addEventListener('resize', pedir, { passive: true });
    alScroll();

    if (arriba) {
      arriba.addEventListener('click', function () {
        window.scrollTo({ top: 0, behavior: quieto ? 'auto' : 'smooth' });
      });
    }
  }

  /* ── 3. Índice que marca en qué sección vas ───────────────────────── */
  function prepararIndice() {
    var enlaces = document.querySelectorAll('.indice a[href^="#"]');
    if (!enlaces.length) return;

    var porId = {};
    var secciones = [];
    Array.prototype.forEach.call(enlaces, function (a) {
      var destino = document.getElementById(a.getAttribute('href').slice(1));
      if (!destino) return;
      porId[destino.id] = a;
      secciones.push(destino);
    });
    if (!secciones.length) return;

    function marcar(id) {
      Array.prototype.forEach.call(enlaces, function (a) { a.classList.remove('activo'); });
      if (porId[id]) porId[id].classList.add('activo');
    }

    if ('IntersectionObserver' in window) {
      var obs = new IntersectionObserver(
        function (entradas) {
          entradas.forEach(function (e) {
            if (e.isIntersecting) marcar(e.target.id);
          });
        },
        // La franja alta marca la sección que estás leyendo, no la que
        // apenas asoma por el borde inferior.
        { rootMargin: '-15% 0px -70% 0px' }
      );
      secciones.forEach(function (s) { obs.observe(s); });
    }

    // Respaldo por scroll: cubre los navegadores donde el observador no
    // entrega nada, y corrige el caso de dos secciones visibles a la vez.
    var ultimo = 0;
    window.addEventListener(
      'scroll',
      function () {
        var ahora = Date.now();
        if (ahora - ultimo < 120) return;
        ultimo = ahora;
        var corte = window.innerHeight * 0.25;
        var actual = null;
        secciones.forEach(function (s) {
          if (s.getBoundingClientRect().top <= corte) actual = s.id;
        });
        if (actual) marcar(actual);
      },
      { passive: true }
    );
  }

  function iniciar() {
    // Si una parte falla, las otras dos siguen funcionando.
    try { prepararReveals(); } catch (e) { document.documentElement.classList.remove('animar'); }
    try { prepararScroll(); } catch (e) {}
    try { prepararIndice(); } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();
