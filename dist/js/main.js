/* Guadarramaa.guidess · comportamiento de la web (sin librerías) */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var ICON = function (p) { return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>'; };

  /* Menú móvil */
  var burger = $('.burger'), menu = $('#menu');
  if (burger && menu) {
    var closeMenu = function () { menu.hidden = true; burger.setAttribute('aria-expanded', 'false'); burger.setAttribute('aria-label', 'Abrir menú'); };
    burger.addEventListener('click', function () {
      var open = menu.hidden; menu.hidden = !open;
      burger.setAttribute('aria-expanded', String(open)); burger.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });
  }

  /* Sombra de cabecera y desplazamiento suave de la imagen de portada */
  var head = $('.site-head'), bg = $('.hero .bgimg'), ticking = false;
  function onScroll() {
    ticking = false;
    var y = window.scrollY;
    if (head) head.classList.toggle('scrolled', y > 8);
    if (bg && !reduce && y < 1000) bg.style.transform = 'translate3d(0,' + (y * 0.18).toFixed(1) + 'px,0)';
  }
  window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  onScroll();

  /* Aparición al desplazarse */
  var rv = $$('.rv');
  if ('IntersectionObserver' in window && !reduce) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    rv.forEach(function (el, i) { el.style.transitionDelay = ((i % 3) * 80) + 'ms'; io.observe(el); });
    setTimeout(function () { rv.forEach(function (el) { el.classList.add('in'); }); }, 4000);
  } else { rv.forEach(function (el) { el.classList.add('in'); }); }

  /* Actividades pasadas: se ocultan solas */
  var d = new Date(), today = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  $$('[data-evlist]').forEach(function (list) {
    var items = $$('[data-fecha]', list), visible = 0;
    items.forEach(function (it) { var f = it.getAttribute('data-fecha'); if (f && f < today) it.hidden = true; else visible++; });
    var empty = $('.empty-n', list); if (empty) empty.hidden = visible > 0;
  });

  /* Galería: filtros y ampliación */
  var lb, lbList = [], lbI = 0, lastFocus;
  function lbShow() {
    var a = lbList[lbI];
    lb.innerHTML = '<button type="button" class="lb-x" data-x aria-label="Cerrar">' + ICON('<path d="M6 6l12 12M18 6L6 18"/>') + '</button><button type="button" data-p aria-label="Anterior">' + ICON('<path d="M15 5l-7 7 7 7"/>') + '</button><figure><img alt=""><figcaption></figcaption></figure><button type="button" data-n aria-label="Siguiente">' + ICON('<path d="M9 5l7 7-7 7"/>') + '</button>';
    var img = $('img', lb); img.src = a.getAttribute('href'); img.alt = a.getAttribute('data-alt') || '';
    $('figcaption', lb).textContent = (a.getAttribute('data-alt') || '') + ' · ' + (lbI + 1) + ' de ' + lbList.length;
    $('.lb-x', lb).focus();
  }
  function lbClose() { if (lb) { lb.remove(); lb = null; document.body.style.overflow = ''; if (lastFocus) lastFocus.focus(); } }
  function lbStep(n) { lbI = (lbI + n + lbList.length) % lbList.length; lbShow(); }
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[data-lb]');
    if (a) {
      e.preventDefault();
      var scope = a.closest('[data-gal]') || document;
      lbList = $$('a[data-lb]', scope).filter(function (x) { return !x.hidden; }); lbI = lbList.indexOf(a); lastFocus = a;
      lb = document.createElement('div'); lb.className = 'lb'; lb.setAttribute('role', 'dialog'); lb.setAttribute('aria-modal', 'true'); lb.setAttribute('aria-label', 'Fotografía ampliada');
      document.body.appendChild(lb); document.body.style.overflow = 'hidden'; lbShow(); return;
    }
    if (lb) {
      if (e.target.closest('[data-x]') || e.target === lb) lbClose();
      else if (e.target.closest('[data-p]')) lbStep(-1);
      else if (e.target.closest('[data-n]')) lbStep(1);
    }
  });
  document.addEventListener('keydown', function (e) {
    if (!lb) return;
    if (e.key === 'Escape') lbClose(); else if (e.key === 'ArrowLeft') lbStep(-1); else if (e.key === 'ArrowRight') lbStep(1);
  });
  var chips = $$('.chip');
  chips.forEach(function (c) {
    c.addEventListener('click', function () {
      var f = c.getAttribute('data-filter'), n = 0;
      chips.forEach(function (x) { x.setAttribute('aria-pressed', String(x === c)); });
      $$('.gal a[data-lb]').forEach(function (g) { var ok = !f || g.getAttribute('data-ruta') === f; g.hidden = !ok; if (ok) n++; });
      var em = $('[data-gal-empty]'); if (em) em.hidden = n > 0;
    });
  });

  /* Mapa: se carga solo al pulsar (privacidad y velocidad) */
  $$('.map').forEach(function (m) {
    var b = $('[data-map-load]', m); if (!b) return;
    b.addEventListener('click', function () {
      var bbox = m.getAttribute('data-map'), mk = m.getAttribute('data-marker');
      var src = 'https://www.openstreetmap.org/export/embed.html?bbox=' + encodeURIComponent(bbox) + '&layer=mapnik' + (mk ? '&marker=' + encodeURIComponent(mk) : '');
      var f = document.createElement('iframe'); f.src = src; f.title = 'Mapa interactivo de la zona'; f.loading = 'lazy'; f.referrerPolicy = 'no-referrer';
      m.innerHTML = ''; m.appendChild(f);
      var p = bbox.split(','), cx = ((+p[0] + +p[2]) / 2).toFixed(4), cy = ((+p[1] + +p[3]) / 2).toFixed(4);
      var l = document.createElement('a'); l.className = 'map-link'; l.target = '_blank'; l.rel = 'noopener'; l.textContent = 'Abrir en OpenStreetMap';
      l.href = 'https://www.openstreetmap.org/?' + (mk ? 'mlat=' + mk.split(',')[0] + '&mlon=' + mk.split(',')[1] + '&' : '') + 'zoom=12#map=12/' + cy + '/' + cx;
      m.insertAdjacentElement('afterend', l);
    });
  });

  /* Calendario */
  var cal = $('#cal'), dataEl = $('#salidas-data');
  if (cal && dataEl) {
    var evs = []; try { evs = JSON.parse(dataEl.textContent); } catch (e) { }
    var now = new Date(), y = now.getFullYear(), mo = now.getMonth(), sel = '';
    var first = evs.filter(function (e) { return e.f >= today; })[0]; if (first) { y = +first.f.slice(0, 4); mo = +first.f.slice(5, 7) - 1; }
    var grid = $('[data-cal-grid]'), title = $('[data-cal-title]'), out = $('[data-cal-sel]');
    var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
    var draw = function () {
      var pad = function (n) { return ('0' + n).slice(-2); }, mk = y + '-' + pad(mo + 1);
      var start = (new Date(y, mo, 1).getDay() + 6) % 7, nd = new Date(y, mo + 1, 0).getDate(), by = {};
      evs.forEach(function (e) { if (e.f.slice(0, 7) === mk) (by[e.f] = by[e.f] || []).push(e); });
      var h = ['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(function (x) { return '<span class="dow">' + x + '</span>'; }).join('');
      for (var i = 0; i < start; i++) h += '<span></span>';
      for (var k = 1; k <= nd; k++) {
        var key = mk + '-' + pad(k), t = key === today ? ' today' : '';
        h += by[key] ? '<button type="button" class="day has' + t + (sel === key ? ' sel' : '') + '" data-d="' + key + '" aria-label="' + k + ': ' + by[key].length + ' actividad(es)">' + k + '<i class="dot"></i></button>' : '<span class="day' + t + '">' + k + '</span>';
      }
      grid.innerHTML = h; title.textContent = new Date(y, mo, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
      out.innerHTML = sel && by[sel] ? by[sel].map(function (e) { return '<div class="ev"><div class="ev-m"><strong>' + (e.u ? '<a href="' + e.u + '">' + esc(e.t) + '</a>' : esc(e.t)) + '</strong><small>' + (e.h ? esc(e.h) + ' h' : 'Hora por confirmar') + '</small></div></div>'; }).join('') : (!Object.keys(by).length ? '<p class="empty-n">Este mes no hay actividades con fecha publicadas.</p>' : '');
    };
    $('[data-cal-prev]').addEventListener('click', function () { mo--; if (mo < 0) { mo = 11; y--; } sel = ''; draw(); });
    $('[data-cal-next]').addEventListener('click', function () { mo++; if (mo > 11) { mo = 0; y++; } sel = ''; draw(); });
    grid.addEventListener('click', function (e) { var b = e.target.closest('[data-d]'); if (b) { sel = sel === b.getAttribute('data-d') ? '' : b.getAttribute('data-d'); draw(); } });
    draw();
  }

  /* Formulario de contacto (Netlify Forms) */
  var form = $('#contact-form');
  if (form) {
    var q = new URLSearchParams(location.search).get('ruta'); if (q && $('#f-ruta')) $('#f-ruta').value = q;
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var errs = { 'f-nombre': 'Escribe tu nombre.', 'f-email': 'Escribe un correo válido.', 'f-pers': 'Indica al menos una persona.', 'f-msg': 'Escribe tu mensaje.', 'f-ok': 'Debes aceptar la política de privacidad.' };
      var bad = [];
      Object.keys(errs).forEach(function (id) {
        var el = document.getElementById(id), v = el.value.trim(), ok = true;
        if (id === 'f-email') ok = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);
        else if (id === 'f-pers') ok = parseInt(v, 10) >= 1;
        else if (id === 'f-ok') ok = el.checked;
        else ok = v.length > 0;
        var lab = el.closest('label'), box = el.closest('.full'), span = (lab && lab.querySelector('[data-err]')) || (box && box.querySelector('[data-err]'));
        if (span) span.textContent = ok ? '' : errs[id];
        el.setAttribute('aria-invalid', String(!ok)); if (!ok) bad.push(el);
      });
      if (bad.length) { bad[0].focus(); return; }
      var btn = form.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'Enviando…';
      var body = new URLSearchParams(new FormData(form)).toString();
      fetch('/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body })
        .then(function (r) { if (!r.ok) throw new Error(r.status); form.hidden = true; var ok = $('#form-ok'); ok.hidden = false; ok.focus(); })
        .catch(function () { $('#form-err').hidden = false; btn.disabled = false; btn.textContent = 'Enviar mensaje'; });
    });
  }
})();
