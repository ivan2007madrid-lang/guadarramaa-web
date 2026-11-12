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

  /* Mapa de Wikiloc: se carga solo al pulsar (privacidad y velocidad) */
  $$('.wl').forEach(function (w) {
    var b = $('[data-wl-load]', w); if (!b) return;
    b.addEventListener('click', function () {
      var id = (w.getAttribute('data-wl') || '').replace(/\D/g, ''); if (!id) return;
      var f = document.createElement('iframe');
      f.src = 'https://es.wikiloc.com/wikiloc/embedv2.do?id=' + id + '&elevation=on&images=on&maptype=H';
      f.title = 'Mapa de la ruta en Wikiloc: ' + (w.getAttribute('data-title') || '');
      f.setAttribute('frameborder', '0'); f.setAttribute('scrolling', 'no'); f.loading = 'lazy'; f.allowFullscreen = true;
      w.innerHTML = ''; w.appendChild(f);
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
  /* Valoraciones públicas (se cargan desde /api/valoraciones) */
  var vroot = $('[data-valoraciones]');
  if (vroot) {
    var vlist = $('[data-val-list]', vroot), vsum = $('[data-val-sum]', vroot), vempty = $('[data-val-empty]', vroot), vmore = $('[data-val-more]', vroot), vload = $('[data-val-loaderr]', vroot);
    var vlim = +vroot.getAttribute('data-limit') || 0, vform = $('#val-form'), vstart = Date.now(), vitems = [], vshown = 0, VPASO = 6;
    var STAR = vroot.getAttribute('data-star') || '';
    var mkStars = function (n, off) { var h = ''; for (var i = 1; i <= 5; i++) h += '<span' + (i > n ? ' class="off-s" style="opacity:.28"' : '') + '>' + STAR + '</span>'; return h; };
    var fmtMedia = function (m) { return String(m).replace('.', ','); };
    var fmtFecha = function (iso) { try { return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { return ''; } };
    var drawSum = function (total, media) {
      if (!total) { vsum.hidden = true; return; }
      vsum.hidden = false; vsum.innerHTML = '';
      var b = document.createElement('b'); b.textContent = fmtMedia(media);
      var st = document.createElement('span'); st.className = 'stars'; st.setAttribute('role', 'img'); st.setAttribute('aria-label', 'Puntuación media: ' + fmtMedia(media) + ' de 5'); st.innerHTML = mkStars(Math.round(media));
      var tx = document.createElement('span'); tx.textContent = total === 1 ? '1 valoración' : total + ' valoraciones';
      vsum.appendChild(b); vsum.appendChild(st); vsum.appendChild(tx);
    };
    var card = function (it) {
      var f = document.createElement('figure'); f.className = 'quote';
      var s = document.createElement('div'); s.className = 'stars'; s.setAttribute('role', 'img'); s.setAttribute('aria-label', it.estrellas + ' de 5'); s.innerHTML = mkStars(it.estrellas);
      var q = document.createElement('blockquote'); var p = document.createElement('p'); p.className = 'val-text'; p.textContent = it.comentario; q.appendChild(p);
      var c = document.createElement('figcaption'); var n = document.createElement('strong'); n.textContent = it.nombre; c.appendChild(n);
      var d = fmtFecha(it.fecha); if (d) { var sp = document.createElement('span'); sp.textContent = d; c.appendChild(sp); }
      f.appendChild(s); f.appendChild(q); f.appendChild(c); return f;
    };
    var drawList = function () {
      var end = Math.min(vitems.length, vlim || vshown);
      vlist.innerHTML = ''; vitems.slice(0, end).forEach(function (it) { vlist.appendChild(card(it)); });
      vempty.hidden = vitems.length > 0; if (vmore) vmore.hidden = !!vlim || end >= vitems.length;
    };
    var apply = function (d) { vitems = d.items || []; vshown = vlim || Math.max(vshown, VPASO); drawSum(d.total, d.media); drawList(); };
    fetch('/api/valoraciones', { headers: { Accept: 'application/json' } })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (d) { vload.hidden = true; apply(d); })
      .catch(function () { vload.hidden = false; });
    if (vmore) $('button', vmore).addEventListener('click', function () { vshown += VPASO; drawList(); });

    if (vform) {
    /* Estrellas interactivas */
    var rows = $$('.star-in label', vform), radios = $$('.star-in input', vform);
    var paint = function (n) { rows.forEach(function (l, i) { l.classList.toggle('on', i < n); }); };
    var cur = function () { var c = radios.filter(function (r) { return r.checked; })[0]; return c ? +c.value : 0; };
    rows.forEach(function (l, i) {
      l.addEventListener('mouseenter', function () { paint(i + 1); });
      l.addEventListener('mouseleave', function () { paint(cur()); });
    });
    radios.forEach(function (r) { r.addEventListener('change', function () { paint(cur()); var e = $('#v-e-err'); if (e) e.textContent = ''; }); });

    /* Contador de caracteres */
    var msg = $('#v-msg'), cnt = $('[data-count]', vform);
    msg.addEventListener('input', function () { cnt.textContent = msg.value.length + ' / 600'; });

    /* Envío */
    vform.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var nombre = $('#v-nombre'), fail = $('#val-fail'), bad = [], nv = nombre.value.trim(), mv = msg.value.trim(), ev5 = cur();
      var setErr = function (el, t) { var box = el.closest('label') || el.closest('fieldset'); var sp = box && box.querySelector('[data-err]'); if (sp) sp.textContent = t; el.setAttribute('aria-invalid', String(!!t)); if (t) bad.push(el); };
      setErr(nombre, nv ? '' : 'Escribe tu nombre.');
      setErr(radios[0], ev5 ? '' : 'Elige una puntuación de 1 a 5 estrellas.');
      setErr(msg, mv ? '' : 'Escribe tu comentario.');
      fail.hidden = true;
      if (bad.length) { bad[0].focus(); return; }
      var btn = vform.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'Publicando…';
      var reset = function () { btn.disabled = false; btn.textContent = 'Publicar valoración'; };
      fetch('/api/valoraciones', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ nombre: nv, estrellas: ev5, comentario: mv, web: $('input[name=web]', vform).value, t: vstart })
      }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (x) {
          if (!x.ok || !x.d.ok) { fail.textContent = x.d.mensaje || 'No se ha podido publicar. Inténtalo de nuevo.'; fail.hidden = false; reset(); return; }
          if (x.d.item) { vitems.unshift(x.d.item); vshown = Math.max(vshown, VPASO) + 1; drawSum(x.d.total, x.d.media); drawList(); vload.hidden = true; }
          vform.hidden = true; var ok = $('#val-ok'); ok.hidden = false; ok.focus();
        })
        .catch(function () { fail.textContent = 'No se ha podido publicar. Revisa tu conexión e inténtalo de nuevo.'; fail.hidden = false; reset(); });
    });
    }
  }
})();
