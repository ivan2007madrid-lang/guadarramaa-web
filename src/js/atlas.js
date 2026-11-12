/* Guadarramaa.guidess · Atlas Guadarrama (mapa 3D + semáforo + asistente + pasaporte).
   Todo el contenido que se muestra procede de /data/atlas.json (tus rutas y GPX) y de /api/atlas-tiempo (datos reales de AEMET). */
(function () {
  'use strict';
  var root = document.querySelector('[data-atlas]');
  if (!root) return;

  /* ── Utilidades ─────────────────────────────────────────────── */
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k]; if (v === null || v === undefined || v === false) return;
      if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v);
    });
    (kids || []).forEach(function (c) { if (c === null || c === undefined || c === false) return; e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  var NS = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs) { var e = document.createElementNS(NS, tag); Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); }); return e; }
  var fmt = function (n, d) { if (n === null || n === undefined || isNaN(n)) return '—'; return Number(n).toLocaleString('es-ES', { maximumFractionDigits: d === undefined ? 0 : d }); };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  function lsGet(k, def) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
  function fechaCorta(iso) { var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3] + '/' + m[2] + '/' + m[1] : ''; }
  function horaLocal(iso) {
    if (!iso) return '';
    var t = /[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : iso + 'Z';   // las observaciones de AEMET vienen en UTC
    try { return new Date(t).toLocaleString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }); } catch (e) { return ''; }
  }
  function diaSemana(f) { try { return new Date(f + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' }); } catch (e) { return f; } }

  /* ── Estado ─────────────────────────────────────────────────── */
  var S = { data: null, rutas: [], tiempo: null, sel: null, rec: [], sellos: (lsGet('gg-pasaporte', {}).sellos || []), map: null, mapaListo: false, tracks: {}, markers: {} };
  var porId = function (id) { return S.rutas.filter(function (r) { return r.id === id; })[0] || null; };
  var hecha = function (id) { return S.sellos.some(function (s) { return s.ruta === id; }); };
  var zonaDe = function (id) { var z = (S.data && S.data.tiempo && S.data.tiempo.zonas || []).filter(function (z) { return (z.rutas || []).indexOf(id) >= 0; })[0]; return z ? z.id : null; };
  var estadoDe = function (id) { var z = zonaDe(id); var t = S.tiempo && S.tiempo.zonas && z ? S.tiempo.zonas[z] : null; return t ? t.estado : null; };

  var ESTADOS = {
    'verde': { t: 'Sin alertas', d: 'Los datos de AEMET no superan ningún umbral de precaución.' },
    'ambar': { t: 'Precaución', d: 'Hay factores que conviene tener en cuenta antes de salir.' },
    'rojo': { t: 'Condiciones adversas', d: 'Los datos de AEMET indican condiciones adversas.' },
    'sin-datos': { t: 'Sin datos', d: 'Ahora mismo no hay datos suficientes. Consulta la previsión oficial de AEMET.' }
  };

  /* ══════════════════════════════════════════════════════════════
     1 · MAPA 3D
     ══════════════════════════════════════════════════════════════ */
  var VER = root.getAttribute('data-maplibre') || '4.7.1';
  var CDN_JS = 'https://unpkg.com/maplibre-gl@' + VER + '/dist/maplibre-gl.js', CDN_CSS = 'https://unpkg.com/maplibre-gl@' + VER + '/dist/maplibre-gl.css';
  var IGN = function (capa, ext) { return 'https://www.ign.es/wmts/' + capa[0] + '?service=WMTS&request=GetTile&version=1.0.0&layer=' + capa[1] + '&style=default&tilematrixset=GoogleMapsCompatible&TileMatrix={z}&TileCol={x}&TileRow={y}&format=image/' + ext; };
  var DEM = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
  var CENTRO = [-4.05, 40.72];
  var mapaIniciado = false;

  function webglOk() { try { var c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch (e) { return false; } }
  function cargarMapLibre() {
    return new Promise(function (ok, ko) {
      if (window.maplibregl) return ok();
      var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = CDN_CSS; document.head.appendChild(l);
      var s = document.createElement('script'); s.src = CDN_JS; s.onload = function () { window.maplibregl ? ok() : ko(new Error('maplibre')); }; s.onerror = function () { ko(new Error('red')); };
      document.head.appendChild(s);
    });
  }
  function avisoMapa(txt) { var p = $('#at-nogl'); p.textContent = txt; p.hidden = false; }
  function usaGestosCooperativos() { return window.matchMedia && window.matchMedia('(pointer: coarse)').matches; }

  function iniciarMapa() {
    if (mapaIniciado) return; mapaIniciado = true;
    var cover = $('#at-cover'), hud = $('#at-hud');
    if (!webglOk()) { avisoMapa('Tu navegador no permite el mapa 3D (WebGL). Puedes usar igualmente el semáforo, el asistente y el pasaporte.'); cover.classList.add('is-off'); hud.hidden = false; return; }
    cover.classList.add('is-loading');
    cargarMapLibre().then(function () { crearMapa(); }).catch(function () {
      mapaIniciado = false; cover.classList.remove('is-loading');
      avisoMapa('No se ha podido cargar el mapa 3D (sin conexión con el servidor de mapas). Inténtalo de nuevo en unos minutos.');
    });
  }

  function crearMapa() {
    var ml = window.maplibregl, cover = $('#at-cover'), hud = $('#at-hud');
    var map = S.map = new ml.Map({
      container: 'at-map', center: CENTRO, zoom: 9.6, pitch: 62, bearing: -18, maxPitch: 82, minZoom: 8, maxZoom: 17.5,
      maxBounds: [[-4.9, 40.2], [-3.3, 41.2]], cooperativeGestures: usaGestosCooperativos(), attributionControl: false, hash: false,
      style: {
        version: 8,
        sources: {
          orto: { type: 'raster', tiles: [IGN(['pnoa-ma', 'OI.OrthoimageCoverage'], 'jpeg')], tileSize: 256, maxzoom: 19 },
          topo: { type: 'raster', tiles: [IGN(['mapa-raster', 'MTN'], 'jpeg')], tileSize: 256, maxzoom: 17 },
          dem: { type: 'raster-dem', tiles: [DEM], encoding: 'terrarium', tileSize: 256, maxzoom: 14 },
          demhs: { type: 'raster-dem', tiles: [DEM], encoding: 'terrarium', tileSize: 256, maxzoom: 14 }
        },
        layers: [
          { id: 'base-orto', type: 'raster', source: 'orto' },
          { id: 'base-topo', type: 'raster', source: 'topo', layout: { visibility: 'none' } },
          { id: 'sombras', type: 'hillshade', source: 'demhs', paint: { 'hillshade-exaggeration': 0.28, 'hillshade-shadow-color': '#0b1510', 'hillshade-highlight-color': '#ffffff' } }
        ]
      }
    });
    map.addControl(new ml.AttributionControl({ compact: true, customAttribution: ['Ortofoto y mapa: © IGN · PNOA (CC BY 4.0)', 'Relieve: Mapzen / Tilezen · AWS Terrain Tiles'] }), 'bottom-right');
    map.addControl(new ml.NavigationControl({ visualizePitch: true }), 'top-right');
    map.addControl(new ml.FullscreenControl({ container: $('.at-stage') }), 'top-right');
    if (ml.TerrainControl) map.addControl(new ml.TerrainControl({ source: 'dem', exaggeration: 1.4 }), 'top-right');
    map.addControl(new ml.ScaleControl({ unit: 'metric' }), 'bottom-left');

    var cargados = 0, fallos = 0, avisado = false;
    map.on('data', function (e) { if (e.dataType === 'source' && e.tile) cargados++; });
    map.on('error', function (e) {
      var src = e && e.sourceId; if (src !== 'orto' && src !== 'topo' && src !== 'dem') return;
      fallos++;
      if (fallos > 8 && cargados === 0 && !avisado) { avisado = true; avisoMapa('El servidor de mapas no responde ahora mismo. Las rutas y el resto del Atlas siguen disponibles.'); }
    });
    map.on('load', function () {
      try { map.setTerrain({ source: 'dem', exaggeration: 1.4 }); } catch (e) { }
      S.mapaListo = true;
      hud.hidden = false; cover.classList.add('is-off');
      anadirBase(); S.rutas.forEach(cargarTrack); anadirLugares(); pintarMarcadores(); estiloRutas();
      volar(S.sel || (S.rutas[0] && S.rutas[0].id));
    });
    map.on('dragstart', pausarVuelo); map.on('pitchstart', function (e) { if (e.originalEvent) pausarVuelo(); }); map.on('rotatestart', function (e) { if (e.originalEvent) pausarVuelo(); });
    map.on('wheel', pausarVuelo);
  }

  function anadirBase() {
    var bar = $('#at-routes'); if (!bar || $('.at-base', bar)) return;
    var b = h('div', { class: 'at-base', role: 'group', 'aria-label': 'Capa del mapa' }, [
      h('button', { type: 'button', class: 'is-on', 'data-b': 'orto', text: 'Satélite' }),
      h('button', { type: 'button', 'data-b': 'topo', text: 'Topográfico' })
    ]);
    b.addEventListener('click', function (ev) {
      var t = ev.target.closest('button'); if (!t || !S.map) return;
      $$('button', b).forEach(function (x) { x.classList.toggle('is-on', x === t); });
      S.map.setLayoutProperty('base-orto', 'visibility', t.dataset.b === 'orto' ? 'visible' : 'none');
      S.map.setLayoutProperty('base-topo', 'visibility', t.dataset.b === 'topo' ? 'visible' : 'none');
    });
    $('.at-hud').appendChild(b);
  }

  /* Recorridos GPX */
  function distM(a, b) { var R = 6371000, r = Math.PI / 180, dl = (b[1] - a[1]) * r, dn = (b[0] - a[0]) * r; var x = Math.sin(dl / 2) * Math.sin(dl / 2) + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dn / 2) * Math.sin(dn / 2); return 2 * R * Math.asin(Math.sqrt(x)); }
  function prepararTrack(r, coords) {
    var cum = [0]; for (var i = 1; i < coords.length; i++) cum[i] = cum[i - 1] + distM(coords[i - 1], coords[i]);
    S.tracks[r.id] = { c: coords, cum: cum, total: cum[cum.length - 1] };
  }
  function cargarTrack(r) {
    if (!r.track || !S.map) return Promise.resolve();
    return (S.tracks[r.id] ? Promise.resolve() : fetch(r.track.url).then(function (x) { if (!x.ok) throw 0; return x.json(); }).then(function (j) { prepararTrack(r, j.c); }))
      .then(function () {
        var m = S.map, t = S.tracks[r.id]; if (!t || m.getSource('t-' + r.id)) return;
        m.addSource('t-' + r.id, { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: t.c } } });
        m.addLayer({ id: 'g-' + r.id, type: 'line', source: 't-' + r.id, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#FFD66B', 'line-width': 12, 'line-blur': 8, 'line-opacity': 0 } });
        m.addLayer({ id: 'l-' + r.id, type: 'line', source: 't-' + r.id, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#F4EFE0', 'line-width': 3, 'line-opacity': 0.9 } });
        if (!S.markers[r.id]) pintarMarcadores();
        estiloRutas();
        if (S.sel === r.id) { pintarPerfil(); }
      }).catch(function () { });
  }
  function inicioDe(r) { var t = S.tracks[r.id]; if (t) return t.c[0]; if (r.lng !== null && r.lat !== null && r.lng !== undefined) return [r.lng, r.lat]; return null; }

  function estiloRutas() {
    if (!S.map || !S.mapaListo) return;
    var m = S.map;
    S.rutas.forEach(function (r) {
      if (!m.getLayer('l-' + r.id)) return;
      var sel = r.id === S.sel, rec = S.rec.indexOf(r.id) >= 0, ok = hecha(r.id), hayRec = S.rec.length > 0;
      m.setPaintProperty('l-' + r.id, 'line-color', sel ? '#FFD66B' : ok ? '#8FE0A0' : '#F4EFE0');
      m.setPaintProperty('l-' + r.id, 'line-width', sel ? 5.5 : rec ? 4.5 : 3);
      m.setPaintProperty('l-' + r.id, 'line-opacity', sel || rec ? 1 : hayRec ? 0.4 : 0.85);
      m.setPaintProperty('g-' + r.id, 'line-opacity', sel || rec ? 0.5 : 0);
    });
    Object.keys(S.markers).forEach(function (id) {
      var el = S.markers[id].getElement(), pos = S.rec.indexOf(id);
      el.classList.toggle('is-sel', id === S.sel); el.classList.toggle('is-rec', pos >= 0); el.classList.toggle('is-done', hecha(id));
      el.firstChild.textContent = pos >= 0 ? String(pos + 1) : hecha(id) ? '✓' : '';
    });
  }
  function pintarMarcadores() {
    if (!S.map) return; var ml = window.maplibregl;
    S.rutas.forEach(function (r) {
      var p = inicioDe(r); if (!p || S.markers[r.id]) return;
      var el = h('button', { type: 'button', class: 'at-pin', 'aria-label': 'Ir a ' + r.titulo }, [h('span', { class: 'at-pin-n' }), h('span', { class: 'at-pin-l', text: r.titulo })]);
      el.addEventListener('click', function () { seleccionar(r.id, true); });
      S.markers[r.id] = new ml.Marker({ element: el, anchor: 'bottom' }).setLngLat(p).addTo(S.map);
    });
  }
  function anadirLugares() {
    if (!S.map || !S.data || !S.data.lugares) return; var ml = window.maplibregl;
    S.data.lugares.forEach(function (l) {
      var el = h('button', { type: 'button', class: 'at-poi', 'aria-label': l.n });
      var txt = h('div', { class: 'at-pop' }, [h('strong', { text: l.n }), l.ele ? h('span', { text: fmt(l.ele) + ' m' }) : null, l.texto ? h('p', { text: l.texto }) : null]);
      var pop = new ml.Popup({ offset: 14, closeButton: false }).setDOMContent(txt);
      new ml.Marker({ element: el }).setLngLat([l.lng, l.lat]).setPopup(pop).addTo(S.map);
    });
  }

  function volar(id, suave) {
    var r = porId(id); if (!r || !S.map || !S.mapaListo) return;
    pausarVuelo();
    var t = S.tracks[id], movil = window.innerWidth < 760, pad = movil ? { top: 90, bottom: 230, left: 20, right: 20 } : { top: 90, bottom: 190, left: 400, right: 70 };
    if (t) {
      var b = t.c.reduce(function (a, p) { return [Math.min(a[0], p[0]), Math.min(a[1], p[1]), Math.max(a[2], p[0]), Math.max(a[3], p[1])]; }, [180, 90, -180, -90]);
      S.map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: pad, pitch: 62, bearing: -18, duration: suave === false ? 0 : 2800, maxZoom: 14 });
    } else { var p = inicioDe(r); if (p) S.map.flyTo({ center: p, zoom: 12.6, pitch: 62, bearing: -18, duration: 2400 }); }
  }

  /* ── Vuelo por la ruta ── */
  var V = { id: null, m: 0, play: false, speed: 1, raf: 0, last: 0, bearing: 0 };
  function posEn(t, m) {
    var cum = t.cum, lo = 0, hi = cum.length - 1; m = clamp(m, 0, t.total);
    while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (cum[mid] <= m) lo = mid; else hi = mid; }
    var seg = cum[hi] - cum[lo] || 1, f = clamp((m - cum[lo]) / seg, 0, 1), a = t.c[lo], b = t.c[hi];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, (a[2] !== null && b[2] !== null) ? a[2] + (b[2] - a[2]) * f : null];
  }
  function rumbo(a, b) { var r = Math.PI / 180, y = Math.sin((b[0] - a[0]) * r) * Math.cos(b[1] * r), x = Math.cos(a[1] * r) * Math.sin(b[1] * r) - Math.sin(a[1] * r) * Math.cos(b[1] * r) * Math.cos((b[0] - a[0]) * r); return (Math.atan2(y, x) / r + 360) % 360; }
  function mezclaAngulo(a, b, k) { var d = ((b - a + 540) % 360) - 180; return (a + d * k + 360) % 360; }
  function pintarControles() {
    var box = $('#at-ctrl'); box.innerHTML = ''; var r = porId(S.sel); if (!r || !r.track || !S.tracks[r.id]) { box.classList.add('is-empty'); return; }
    box.classList.remove('is-empty');
    var play = h('button', { type: 'button', class: 'at-play', 'aria-label': V.play ? 'Pausar el vuelo' : 'Volar por la ruta', text: V.play ? '❚❚' : '▶', onclick: function () { V.play ? pausarVuelo() : iniciarVuelo(); } });
    var vel = h('button', { type: 'button', class: 'at-speed', 'aria-label': 'Velocidad del vuelo', text: '×' + V.speed, onclick: function () { V.speed = V.speed === 1 ? 2 : V.speed === 2 ? 4 : 1; vel.textContent = '×' + V.speed; } });
    var gr = h('div', { class: 'at-prof', id: 'at-prof' });
    box.appendChild(h('div', { class: 'at-btns' }, [play, vel, h('span', { class: 'at-prof-info', id: 'at-prof-info', 'aria-live': 'off', text: 'Pulsa ▶ para volar por la ruta' })]));
    box.appendChild(gr); pintarPerfil();
  }
  function iniciarVuelo() {
    var r = porId(S.sel), t = r && S.tracks[r.id]; if (!t || !S.map || !S.mapaListo) return;
    if (V.id !== r.id || V.m >= t.total - 5) { V.id = r.id; V.m = 0; V.bearing = rumbo(t.c[0], posEn(t, 300)); }
    V.play = true; V.last = performance.now(); cancelAnimationFrame(V.raf); V.raf = requestAnimationFrame(pasoVuelo); actualizaPlay();
    $('#at-hud').classList.add('is-flying');
  }
  function pausarVuelo() { if (!V.play) return; V.play = false; cancelAnimationFrame(V.raf); actualizaPlay(); $('#at-hud').classList.remove('is-flying'); }
  function actualizaPlay() { var b = $('.at-play'); if (b) { b.textContent = V.play ? '❚❚' : '▶'; b.setAttribute('aria-label', V.play ? 'Pausar el vuelo' : 'Volar por la ruta'); } }
  function pasoVuelo(ts) {
    if (!V.play) return;
    var t = S.tracks[V.id]; if (!t) return pausarVuelo();
    var dt = Math.min(0.1, (ts - V.last) / 1000); V.last = ts;
    var dur = clamp(t.total / 1000 * 7, 40, 120), v = t.total / dur * V.speed;
    V.m = Math.min(t.total, V.m + v * dt);
    var p = posEn(t, V.m), ahead = posEn(t, Math.min(t.total, V.m + 400));
    V.bearing = mezclaAngulo(V.bearing, rumbo(p, ahead), 0.05);
    S.map.jumpTo({ center: [p[0], p[1]], bearing: V.bearing, pitch: 68, zoom: 14.2 });
    cursorPerfil(V.m);
    if (V.m >= t.total) { pausarVuelo(); return; }
    V.raf = requestAnimationFrame(pasoVuelo);
  }

  /* Perfil de elevación (SVG) sincronizado con el vuelo */
  var P = { w: 600, h: 120, pad: 8, min: 0, max: 1 };
  function pintarPerfil() {
    var box = $('#at-prof'); if (!box) return; box.innerHTML = '';
    var r = porId(S.sel), t = r && S.tracks[r.id]; if (!t) return;
    var els = t.c.map(function (p) { return p[2]; }); if (els.some(function (e) { return e === null; })) { box.appendChild(h('p', { class: 'at-fine', text: 'Este GPX no incluye altitudes.' })); return; }
    var mn = Math.min.apply(null, els), mx = Math.max.apply(null, els); var rg = Math.max(40, mx - mn); P.min = mn - rg * 0.08; P.max = mx + rg * 0.08;
    var X = function (m) { return P.pad + (m / t.total) * (P.w - 2 * P.pad); }, Y = function (e) { return P.h - 14 - ((e - P.min) / (P.max - P.min)) * (P.h - 28); };
    var d = 'M' + X(0) + ' ' + (P.h - 14); t.c.forEach(function (p, i) { d += ' L' + X(t.cum[i]).toFixed(1) + ' ' + Y(p[2]).toFixed(1); }); d += ' L' + X(t.total) + ' ' + (P.h - 14) + ' Z';
    var s = svg('svg', { viewBox: '0 0 ' + P.w + ' ' + P.h, preserveAspectRatio: 'none', role: 'img', 'aria-label': 'Perfil de elevación de la ruta: de ' + fmt(mn) + ' a ' + fmt(mx) + ' metros' });
    s.appendChild(svg('path', { d: d, class: 'at-prof-area' }));
    s.appendChild(svg('line', { x1: P.pad, x2: P.w - P.pad, y1: P.h - 14, y2: P.h - 14, class: 'at-prof-axis' }));
    var tx = function (x, y, txt, an) { var e = svg('text', { x: x, y: y, class: 'at-prof-t', 'text-anchor': an || 'start' }); e.textContent = txt; return e; };
    s.appendChild(tx(P.pad, 11, fmt(mx) + ' m')); s.appendChild(tx(P.pad, P.h - 2, '0 km')); s.appendChild(tx(P.w - P.pad, P.h - 2, fmt(t.total / 1000, 1) + ' km', 'end'));
    s.appendChild(svg('line', { x1: 0, x2: 0, y1: 4, y2: P.h - 14, class: 'at-prof-cur', id: 'at-prof-cur', visibility: 'hidden' }));
    box.appendChild(s);
    var mover = function (ev) {
      var rc = s.getBoundingClientRect(), x = clamp(((ev.touches ? ev.touches[0].clientX : ev.clientX) - rc.left) / rc.width, 0, 1);
      cursorPerfil(x * t.total, true); return x * t.total;
    };
    box.addEventListener('pointermove', function (ev) { if (!V.play) mover(ev); });
    box.addEventListener('click', function (ev) {
      var m = mover(ev); V.id = r.id; V.m = m; var p = posEn(t, m);
      if (S.map && S.mapaListo) S.map.easeTo({ center: [p[0], p[1]], zoom: 14.2, pitch: 66, duration: 900 });
    });
  }
  function cursorPerfil(m, soloTexto) {
    var r = porId(S.sel), t = r && S.tracks[r.id]; if (!t) return;
    var cur = $('#at-prof-cur'), info = $('#at-prof-info'), p = posEn(t, m);
    if (cur) { var x = P.pad + (m / t.total) * (P.w - 2 * P.pad); cur.setAttribute('x1', x); cur.setAttribute('x2', x); cur.setAttribute('visibility', 'visible'); }
    var pend = ''; var q = posEn(t, Math.min(t.total, m + 80)), q0 = posEn(t, Math.max(0, m - 80));
    if (p[2] !== null && q[2] !== null && q0[2] !== null) { var dd = Math.max(1, distM(q0, q)); pend = ' · pendiente ' + fmt((q[2] - q0[2]) / dd * 100) + ' %'; }
    if (info) info.textContent = 'Km ' + fmt(m / 1000, 1) + (p[2] !== null ? ' · ' + fmt(p[2]) + ' m' : '') + pend;
    if (!S.mapaListo) return;
    if (!S.cursorMk) { var el = h('div', { class: 'at-cursor', 'aria-hidden': 'true' }); S.cursorMk = new window.maplibregl.Marker({ element: el }).setLngLat([p[0], p[1]]).addTo(S.map); }
    S.cursorMk.setLngLat([p[0], p[1]]);
  }

  /* ── Selección de ruta, chips y tarjeta ── */
  function seleccionar(id, volarAhora) {
    var r = porId(id); if (!r) return;
    pausarVuelo(); S.sel = id; V.id = null; V.m = 0;
    if (S.cursorMk) { S.cursorMk.remove(); S.cursorMk = null; }
    pintarChips(); pintarTarjeta(); pintarPerfilSiHay(); pintarPill(); estiloRutas();
    if (volarAhora !== false) { if (S.mapaListo) { (r.track && !S.tracks[id]) ? cargarTrack(r).then(function () { volar(id); }) : volar(id); } }
  }
  function pintarPerfilSiHay() { pintarControles(); }
  function pintarChips() {
    var bar = $('#at-routes'); var base = $('.at-base', bar); bar.innerHTML = '';
    S.rutas.forEach(function (r) {
      var b = h('button', { type: 'button', class: 'at-chip' + (r.id === S.sel ? ' is-on' : ''), 'aria-pressed': r.id === S.sel ? 'true' : 'false', onclick: function () { seleccionar(r.id, true); } },
        [h('span', { text: r.titulo }), hecha(r.id) ? h('span', { class: 'at-chip-ok', 'aria-label': 'Sello conseguido', text: '✓' }) : null, !r.track && (r.lat === null || r.lat === undefined) ? h('em', { text: 'GPX pendiente' }) : null]);
      bar.appendChild(b);
    });
    if (base) bar.appendChild(base);
  }
  function nivelTxt(r) { return r.nivel === 1 ? 'Fácil' : r.nivel === 2 ? 'Moderada' : r.nivel === 3 ? 'Exigente' : (r.dificultad || ''); }
  function pintarTarjeta() {
    var box = $('#at-card'); box.innerHTML = ''; var r = porId(S.sel); if (!r) return;
    var tr = r.track, km = tr ? tr.km : r.km, up = tr && tr.up !== null ? tr.up : r.desnivel;
    var datos = [['Distancia', km !== null && km !== undefined ? fmt(km, 1) + ' km' : '—'], ['Desnivel +', up !== null && up !== undefined ? fmt(up) + ' m' : '—'], ['Dificultad', nivelTxt(r) || '—'], ['Duración', r.duracion || '—']];
    if (tr && tr.max !== null) datos.push(['Altitud máx.', fmt(tr.max) + ' m']);
    var cab = [h('p', { class: 'eyebrow', text: hecha(r.id) ? 'Ruta del Atlas · sello conseguido ✓' : 'Ruta del Atlas' }), h('h2', { text: r.titulo })];
    var dl = h('dl', { class: 'at-data' }); datos.forEach(function (d) { dl.appendChild(h('div', {}, [h('dt', { text: d[0] }), h('dd', { text: d[1] })])); });
    var acc = h('div', { class: 'at-acts' }, [r.url ? h('a', { class: 'btn btn-o btn-s', href: r.url, text: 'Ver ficha' }) : null]);
    if (!tr) acc.appendChild(h('p', { class: 'at-fine', text: (r.lat === null || r.lat === undefined) ? 'El recorrido GPX de esta ruta aún no está publicado.' : 'Se muestra el punto de encuentro; el recorrido GPX aún no está publicado.' }));
    var sem = h('div', { class: 'at-card-sem', id: 'at-card-sem' });
    [].concat(cab, [dl, sem, acc]).forEach(function (n) { box.appendChild(n); });
    if (r.nivel === 3) box.appendChild(h('p', { class: 'at-warn', text: 'Ruta larga y exigente: pensada para personas con muy buena preparación física y experiencia en montaña.' }));
    pintarSemCard();
  }
  function lamparas(estado) {
    var s = svg('svg', { viewBox: '0 0 34 90', width: '34', height: '90', 'aria-hidden': 'true', class: 'at-lights' });
    s.appendChild(svg('rect', { x: 1, y: 1, width: 32, height: 88, rx: 12, class: 'at-lights-body' }));
    [['rojo', 18], ['ambar', 45], ['verde', 72]].forEach(function (l) { s.appendChild(svg('circle', { cx: 17, cy: l[1], r: 10, class: 'at-lamp lamp-' + l[0] + (estado === l[0] ? ' on' : '') })); });
    return s;
  }
  function pintarSemCard() {
    var box = $('#at-card-sem'); if (!box) return; box.innerHTML = '';
    var est = estadoDe(S.sel); if (!S.tiempo || S.tiempo.configurado === false || S.tiempo.ok === false) return;
    if (!est) return;
    box.appendChild(h('a', { class: 'at-sem-mini s-' + est, href: '#semaforo' }, [h('span', { class: 'dot' }), h('span', { text: 'Hoy en la zona: ' + ESTADOS[est].t })]));
  }
  function pintarPill() {
    var pill = $('#at-sem-pill'); pill.innerHTML = '';
    var z = zonaDe(S.sel), t = S.tiempo && S.tiempo.zonas && z ? S.tiempo.zonas[z] : null;
    if (!t) { pill.hidden = true; return; } pill.hidden = false;
    pill.appendChild(h('a', { href: '#semaforo', class: 's-' + t.estado, 'aria-label': 'Semáforo de montaña: ' + ESTADOS[t.estado].t }, [lamparas(t.estado), h('span', { class: 'at-pill-t' }, [h('strong', { text: ESTADOS[t.estado].t }), h('small', { text: t.nombre })])]));
  }

  /* ══════════════════════════════════════════════════════════════
     2 · SEMÁFORO DE MONTAÑA
     ══════════════════════════════════════════════════════════════ */
  function cargarTiempo() {
    return fetch('/api/atlas-tiempo', { headers: { Accept: 'application/json' } }).then(function (r) { return r.json(); }).catch(function () { return { ok: false }; }).then(function (j) { S.tiempo = j; pintarSemaforo(); pintarPill(); pintarSemCard(); pintarAsistente(); });
  }
  var AEMET_AVISOS = 'https://www.aemet.es/es/eltiempo/prediccion/avisos?k=mad';
  var AEMET_MONTANA = 'https://www.aemet.es/es/eltiempo/prediccion/montana?p=mad2&w=2';
  function metrica(etq, val, sub) { return h('div', { class: 'at-m' }, [h('span', { class: 'at-m-l', text: etq }), h('strong', { text: val }), sub ? h('small', { text: sub }) : null]); }
  function pintarSemaforo() {
    var box = $('#at-sem-body'); box.innerHTML = ''; var T = S.tiempo;
    var enlaces = h('p', { class: 'at-fine' }, ['Fuente oficial: ', h('a', { href: AEMET_AVISOS, target: '_blank', rel: 'noopener', text: 'Avisos de AEMET' }), ' · ', h('a', { href: AEMET_MONTANA, target: '_blank', rel: 'noopener', text: 'Predicción de montaña de AEMET' })]);
    if (!T || T.ok === false || T.configurado === false || !T.zonas) {
      box.appendChild(h('div', { class: 'at-sem-off' }, [lamparas('sin-datos'), h('div', {}, [h('h3', { text: 'Semáforo no disponible ahora mismo' }), h('p', { text: 'No hemos podido obtener los datos en este momento. Consulta siempre la previsión oficial antes de salir.' }), enlaces])]));
      return;
    }
    var grid = h('div', { class: 'at-sem-grid' });
    (S.data.tiempo.zonas || []).forEach(function (zc) {
      var z = T.zonas[zc.id]; if (!z) return; var a = z.ahora, d0 = z.dias && z.dias[0];
      var card = h('article', { class: 'at-sem-card s-' + z.estado });
      card.appendChild(h('header', {}, [lamparas(z.estado), h('div', {}, [h('p', { class: 'eyebrow', text: z.nombre }), h('h3', { text: ESTADOS[z.estado].t }), h('p', { class: 'at-sem-d', text: ESTADOS[z.estado].d })])]));
      if (z.motivos && z.motivos.length) { var ul = h('ul', { class: 'at-why' }); z.motivos.forEach(function (m) { ul.appendChild(h('li', { class: 'm-' + m.nivel, text: m.texto })); }); card.appendChild(ul); }
      var m = h('div', { class: 'at-metrics' });
      if (a) {
        m.appendChild(metrica('Temperatura', a.ta !== null ? fmt(a.ta, 1) + ' °C' : '—', 'medida' + (a.estacion ? ' en ' + (z.estacion || a.estacion) : '')));
        m.appendChild(metrica('Viento', a.viento !== null ? fmt(a.viento) + ' km/h' : '—', (a.dir ? 'dir. ' + a.dir : '') + (a.racha !== null ? ' · rachas ' + fmt(a.racha) : '')));
        m.appendChild(metrica('Lluvia (1 h)', a.prec !== null ? fmt(a.prec, 1) + ' mm' : '—'));
        m.appendChild(metrica('Nieve en suelo', a.nieve !== null ? fmt(a.nieve) + ' cm' : 'sin dato'));
      } else if (d0) {
        m.appendChild(metrica('Temperatura', fmt(d0.tmin) + ' / ' + fmt(d0.tmax) + ' °C', 'prevista'));
        m.appendChild(metrica('Viento', d0.viento !== null ? fmt(d0.viento) + ' km/h' : '—', (d0.vientoDir ? 'dir. ' + d0.vientoDir : '') + (d0.racha !== null ? ' · rachas ' + fmt(d0.racha) : '')));
        m.appendChild(metrica('Lluvia', d0.probLluvia !== null ? d0.probLluvia + ' %' : '—', 'probabilidad'));
        m.appendChild(metrica('Cota de nieve', d0.cotaNieve !== null ? fmt(d0.cotaNieve) + ' m' : 'sin dato'));
      }
      if (m.children.length) card.appendChild(m);
      if (a && a.hora) card.appendChild(h('p', { class: 'at-fine', text: 'Observación de ' + horaLocal(a.hora) + (z.estacion ? ' · estación ' + z.estacion : '') + '.' }));
      if (z.dias && z.dias.length) {
        var tira = h('div', { class: 'at-days', role: 'list', 'aria-label': 'Próximos días' });
        z.dias.forEach(function (d) {
          tira.appendChild(h('div', { class: 'at-day s-' + (d.estado || 'sin-datos'), role: 'listitem' }, [h('strong', { text: diaSemana(d.fecha) }), h('span', { class: 'dot', 'aria-hidden': 'true' }), h('span', { text: d.cielo || '' }), h('small', { text: (d.tmin !== null ? fmt(d.tmin) : '–') + '° / ' + (d.tmax !== null ? fmt(d.tmax) : '–') + '°' }), h('small', { text: 'Lluvia ' + (d.probLluvia !== null ? d.probLluvia + ' %' : '—') }), h('small', { text: 'Viento ' + (d.viento !== null ? fmt(d.viento) + ' km/h' : '—') + (d.racha !== null ? ', rachas ' + fmt(d.racha) : '') })]));
        });
        card.appendChild(tira);
      }
      if (z.avisos && z.avisos.length) {
        var av = h('div', { class: 'at-avisos' }, [h('h4', { text: 'Avisos oficiales de AEMET' })]);
        z.avisos.forEach(function (x) { av.appendChild(h('p', { class: 'av-' + x.nivel }, [h('strong', { text: (x.titular || x.evento) }), x.descripcion ? h('span', { text: ' ' + x.descripcion }) : null, x.hasta ? h('small', { text: ' Hasta ' + horaLocal(x.hasta) + '.' }) : null])); });
        card.appendChild(av);
      } else if (T.avisosEstado && T.avisosEstado.ok) card.appendChild(h('p', { class: 'at-fine', text: 'AEMET no tiene avisos vigentes para esta zona.' }));
      else card.appendChild(h('p', { class: 'at-fine', text: 'No se han podido consultar los avisos oficiales: míralos en la web de AEMET.' }));
      var f = z.fuentes || {}, pr = [];
      if (f.observacion && !f.observacion.ok && f.observacion.motivo) pr.push('Observación: ' + f.observacion.motivo);
      if (f.prevision && !f.prevision.ok) pr.push('Previsión: ' + (f.prevision.motivo || 'no disponible'));
      if (pr.length) card.appendChild(h('details', { class: 'at-tech' }, [h('summary', { text: 'Datos que faltan' }), h('p', { text: pr.join(' · ') })]));
      grid.appendChild(card);
    });
    box.appendChild(grid);
    var umb = T.umbrales || {};
    box.appendChild(h('details', { class: 'at-crit' }, [h('summary', { text: 'Cómo se calcula el semáforo' }), h('p', { text: 'Es un criterio orientativo propio de Guadarramaa.guidess aplicado a datos de AEMET; no es un criterio oficial. Precaución: rachas desde ' + umb.racha_ambar + ' km/h, viento medio desde ' + umb.viento_ambar + ' km/h, probabilidad de lluvia desde ' + umb.lluvia_ambar + ' %, lluvia medida de ' + umb.prec_ambar + ' mm/h, nieve en el suelo, cota de nieve por debajo de la altitud de la zona, máximas desde ' + umb.tmax_ambar + ' °C o mínimas de ' + umb.tmin_ambar + ' °C o menos, o cualquier aviso amarillo. Condiciones adversas: rachas desde ' + umb.racha_rojo + ' km/h, viento medio desde ' + umb.viento_rojo + ' km/h, lluvia muy probable (' + umb.lluvia_rojo + ' %) o intensa, o un aviso naranja o rojo. Si falta una fuente, no se supone nada.' })]));
    box.appendChild(h('p', { class: 'at-disc' }, ['Información orientativa a partir de datos de AEMET', T.generado ? ' (actualizada ' + horaLocal(T.generado) + (T.obsoleto ? ', datos anteriores porque AEMET no ha respondido' : '') + ')' : '', '. No sustituye la previsión ni los avisos oficiales, ni el criterio del guía. La decisión de salir a la montaña es siempre tuya. ']));
    box.appendChild(enlaces);
  }

  /* ══════════════════════════════════════════════════════════════
     3 · ASISTENTE DE RUTAS
     ══════════════════════════════════════════════════════════════ */
  var TIPOS = ['Naturaleza y bosque', 'Historia y patrimonio', 'Cumbres y vistas', 'Reto físico', 'Ritmo tranquilo'];
  var PASOS = [
    { id: 'tipos', t: '¿Qué aventura te apetece?', d: 'Elige todo lo que te guste.', multi: true, op: TIPOS.map(function (x) { return [x, x]; }) },
    { id: 'nivel', t: '¿Cómo estás de forma?', d: 'Sé sincero: la montaña se disfruta más a tu ritmo.', op: [['1', 'Empiezo o hace tiempo que no camino'], ['2', 'Camino con regularidad'], ['3', 'Estoy entrenado y busco algo exigente']] },
    { id: 'dur', t: '¿Cuánto tiempo tienes?', d: 'Duración aproximada de la ruta.', op: [['3', 'Hasta 3 horas'], ['5', 'Media jornada (3–5 h)'], ['8', 'Jornada completa (5–8 h)'], ['99', 'Más de 8 horas']] },
    { id: 'extras', t: '¿Algo más?', d: 'Opcional: ajustan la recomendación.', multi: true, op: [['poco', 'Prefiero poco desnivel'], ['reto', 'Quiero un buen desafío'], ['nueva', 'Prefiero una ruta que aún no haya hecho']] }
  ];
  var A = { paso: 0, resp: { tipos: [], nivel: null, dur: null, extras: [] }, hecho: false };
  var DUR = { '3': [0, 180], '5': [150, 300], '8': [270, 480], '99': [450, 9999] };

  function puntuar(r, R) {
    var pts = 0, max = 0, why = [], warn = [];
    max += 40; if (R.tipos.length) { var com = R.tipos.filter(function (t) { return r.tipos.indexOf(t) >= 0; }); pts += 40 * com.length / R.tipos.length; if (com.length) why.push('Encaja con lo que buscas: ' + com.join(', ').toLowerCase()); else why.push('No coincide con el tipo de aventura que has elegido'); } else pts += 40;
    max += 30; var n = r.nivel, u = Number(R.nivel);
    if (n === null) { pts += 15; warn.push('Falta indicar la dificultad de esta ruta'); }
    else { var df = n - u; if (df <= 0) { pts += 30 - (R.extras.indexOf('reto') >= 0 && df < 0 ? 10 : 0); why.push(df === 0 ? 'Su dificultad (' + nivelTxt(r).toLowerCase() + ') coincide con tu forma física' : 'Es más suave que tu nivel: la harás con holgura'); } else if (df === 1) { pts += 10; warn.push('Es algo más exigente que tu nivel actual'); } else warn.push('Es demasiado exigente para tu nivel actual: no te la recomendamos todavía'); }
    max += 20; var rg = DUR[R.dur];
    if (r.min === null || r.min === undefined) { pts += 8; warn.push('Falta la duración de esta ruta'); }
    else if (rg && r.min >= rg[0] && r.min <= rg[1]) { pts += 20; why.push('Dura ' + r.duracion + ', dentro de tu tiempo'); }
    else if (rg && (r.min < rg[0] ? rg[0] - r.min : r.min - rg[1]) <= 90) { pts += 10; why.push('Dura ' + r.duracion + ', cerca de tu tiempo'); }
    else if (rg) warn.push('Dura ' + r.duracion + ': no encaja con el tiempo que tienes');
    max += 10; var ex = 0;
    if (R.extras.indexOf('poco') >= 0) { if (r.desnivel !== null && r.desnivel <= 300) { ex = 10; why.push('Poco desnivel (' + fmt(r.desnivel) + ' m)'); } else if (r.desnivel !== null && r.desnivel > 600) warn.push('Desnivel de ' + fmt(r.desnivel) + ' m'); }
    if (R.extras.indexOf('reto') >= 0) { if (r.nivel >= 2 && r.desnivel > 250) { ex = 10; why.push('Un buen desafío (' + fmt(r.desnivel) + ' m de desnivel)'); } }
    if (R.extras.indexOf('nueva') >= 0) { if (hecha(r.id)) { ex = 0; warn.push('Ya tienes su sello en tu pasaporte'); pts -= 8; } else { ex = Math.max(ex, 10); why.push('Todavía no la has hecho'); } }
    if (!R.extras.length) ex = 10; pts += ex;
    var p = Math.round(clamp(pts / max * 100, 0, 100)); if (n !== null && n - u >= 2) p = Math.min(p, 35);
    var est = estadoDe(r.id); if (est === 'rojo') warn.push('Hoy la zona está en «condiciones adversas» según AEMET'); else if (est === 'ambar') warn.push('Hoy la zona está en «precaución» según AEMET: revisa el semáforo');
    return { r: r, p: p, why: why, warn: warn };
  }
  function pintarAsistente() {
    var box = $('#at-asis-body'); if (!box) return; box.innerHTML = '';
    if (!S.rutas.length) { box.appendChild(h('p', { class: 'empty-n', text: 'Todavía no hay rutas en el Atlas.' })); return; }
    if (A.hecho) return pintarResultados(box);
    var P = PASOS[A.paso], sel = A.resp[P.id];
    var prog = h('ol', { class: 'at-steps', 'aria-label': 'Progreso' }); PASOS.forEach(function (x, i) { prog.appendChild(h('li', { class: i === A.paso ? 'is-on' : i < A.paso ? 'is-done' : '', 'aria-current': i === A.paso ? 'step' : null, text: String(i + 1) })); });
    box.appendChild(prog);
    box.appendChild(h('h3', { class: 'at-q', text: P.t })); box.appendChild(h('p', { class: 'at-q-d', text: P.d }));
    var ops = h('div', { class: 'at-opts', role: P.multi ? 'group' : 'radiogroup', 'aria-label': P.t });
    P.op.forEach(function (o) {
      var on = P.multi ? sel.indexOf(o[0]) >= 0 : sel === o[0];
      ops.appendChild(h('button', { type: 'button', class: 'at-opt' + (on ? ' is-on' : ''), role: P.multi ? 'checkbox' : 'radio', 'aria-checked': on ? 'true' : 'false', onclick: function () {
        if (P.multi) { var i = sel.indexOf(o[0]); i >= 0 ? sel.splice(i, 1) : sel.push(o[0]); } else A.resp[P.id] = o[0];
        pintarAsistente(); var b = $('.at-opt.is-on, .at-opt', $('#at-asis-body')); }, text: o[1] }));
    });
    box.appendChild(ops);
    var ok = P.multi ? true : sel !== null;
    box.appendChild(h('div', { class: 'at-nav-btns' }, [
      A.paso > 0 ? h('button', { type: 'button', class: 'btn btn-o', text: 'Atrás', onclick: function () { A.paso--; pintarAsistente(); } }) : null,
      h('button', { type: 'button', class: 'btn btn-a', disabled: ok ? null : true, text: A.paso === PASOS.length - 1 ? 'Ver mis rutas' : 'Siguiente', onclick: function () { if (A.paso === PASOS.length - 1) { A.hecho = true; } else A.paso++; pintarAsistente(); } })
    ]));
  }
  function pintarResultados(box) {
    var res = S.rutas.map(function (r) { return puntuar(r, A.resp); }).sort(function (a, b) { return b.p - a.p; });
    var buenas = res.filter(function (x) { return x.p >= 45; }).slice(0, 3);
    S.rec = buenas.map(function (x) { return x.r.id; }); estiloRutas(); pintarChips();
    box.appendChild(h('h3', { class: 'at-q', text: buenas.length ? 'Tus rutas recomendadas' : 'Ninguna ruta encaja del todo' }));
    box.appendChild(h('p', { class: 'at-q-d', text: buenas.length ? 'Ordenadas de mejor a peor encaje. Ya están resaltadas en el mapa.' : 'Con lo que has elegido no tenemos una ruta que encaje bien ahora mismo. Escríbenos y buscamos una opción a tu medida.' }));
    var lista = h('div', { class: 'at-res' });
    (buenas.length ? buenas : res.slice(0, 1)).forEach(function (x, i) {
      var c = h('article', { class: 'at-rec' }, [h('div', { class: 'at-rec-n', text: buenas.length ? String(i + 1) : '–' }), h('div', { class: 'at-rec-b' }, [h('h4', { text: x.r.titulo }), h('p', { class: 'at-rec-p', text: 'Encaje: ' + x.p + ' %' }), h('ul', {}, x.why.map(function (w) { return h('li', { text: w }); })), x.warn.length ? h('ul', { class: 'at-rec-w' }, x.warn.map(function (w) { return h('li', { text: w }); })) : null,
        h('div', { class: 'at-acts' }, [h('button', { type: 'button', class: 'btn btn-a btn-s', text: 'Verla en el mapa 3D', onclick: function () { irAlMapa(x.r.id); } }), x.r.url ? h('a', { class: 'btn btn-o btn-s', href: x.r.url, text: 'Ver ficha' }) : null])])]);
      lista.appendChild(c);
    });
    box.appendChild(lista);
    box.appendChild(h('p', { class: 'at-fine', text: 'La recomendación es una ayuda orientativa basada en los datos de cada ruta y en tus respuestas. Si tienes dudas sobre tu nivel, escríbenos antes de reservar.' }));
    box.appendChild(h('div', { class: 'at-nav-btns' }, [h('button', { type: 'button', class: 'btn btn-o', text: 'Empezar de nuevo', onclick: function () { A = { paso: 0, resp: { tipos: [], nivel: null, dur: null, extras: [] }, hecho: false }; S.rec = []; estiloRutas(); pintarChips(); pintarAsistente(); } })]));
  }
  function irAlMapa(id) {
    S.sel = id; var st = $('.at-stage'); if (st) st.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (!mapaIniciado) { iniciarMapa(); seleccionar(id, false); } else seleccionar(id, true);
  }

  /* ══════════════════════════════════════════════════════════════
     4 · PASAPORTE MONTAÑERO
     ══════════════════════════════════════════════════════════════ */
  var LOGROS = [
    { id: 'primero', n: 'Primer sello', d: 'Consigue tu primer sello.', ok: function (s) { return s.n >= 1; } },
    { id: 'km10', n: '10 km en la mochila', d: 'Suma 10 km con Guadarramaa.', ok: function (s) { return s.km >= 10; } },
    { id: 'km25', n: '25 km', d: 'Suma 25 km.', ok: function (s) { return s.km >= 25; } },
    { id: 'km50', n: '50 km', d: 'Suma 50 km.', ok: function (s) { return s.km >= 50; } },
    { id: 'km100', n: '100 km', d: 'Suma 100 km.', ok: function (s) { return s.km >= 100; } },
    { id: 'd500', n: '500 m de desnivel', d: 'Acumula 500 m de desnivel positivo.', ok: function (s) { return s.desnivel >= 500; } },
    { id: 'd1000', n: '1.000 m de desnivel', d: 'Acumula 1.000 m de desnivel positivo.', ok: function (s) { return s.desnivel >= 1000; } },
    { id: 'd2500', n: '2.500 m de desnivel', d: 'Acumula 2.500 m de desnivel positivo.', ok: function (s) { return s.desnivel >= 2500; } },
    { id: 'dos', n: 'Doble sello', d: 'Consigue sellos de 2 rutas distintas.', ok: function (s) { return s.rutas >= 2; } },
    { id: 'tres', n: 'Explorador', d: 'Consigue sellos de 3 rutas distintas.', ok: function (s) { return s.rutas >= 3; } },
    { id: 'todas', n: 'Atlas completo', d: 'Consigue el sello de todas las rutas del Atlas.', ok: function (s) { return S.rutas.length >= 2 && S.rutas.every(function (r) { return hecha(r.id); }); } },
    { id: 'repite', n: 'Repetidor', d: 'Haz la misma ruta en dos fechas distintas.', ok: function (s) { return s.repite; } },
    { id: 'reto', n: 'Reto superado', d: 'Consigue el sello de una ruta exigente.', ok: function (s) { return S.sellos.some(function (x) { var r = porId(x.ruta); return r && r.nivel === 3; }); } }
  ];
  function estadisticas() {
    var rutas = {}, fechas = {}, repite = false;
    S.sellos.forEach(function (s) { rutas[s.ruta] = 1; var k = s.ruta + '|' + s.fecha; (fechas[s.ruta] = fechas[s.ruta] || {})[s.fecha] = 1; });
    Object.keys(fechas).forEach(function (r) { if (Object.keys(fechas[r]).length >= 2) repite = true; });
    return { n: S.sellos.length, km: S.sellos.reduce(function (a, s) { return a + (Number(s.km) || 0); }, 0), desnivel: S.sellos.reduce(function (a, s) { return a + (Number(s.desnivel) || 0); }, 0), rutas: Object.keys(rutas).length, repite: repite };
  }
  var RANGOS = [[0, 'Caminante'], [10, 'Explorador'], [25, 'Montañero'], [50, 'Guardián de la sierra'], [100, 'Leyenda del Guadarrama']];
  function rango(km) { var r = RANGOS[0][1]; RANGOS.forEach(function (x) { if (km >= x[0]) r = x[1]; }); return r; }
  function hashN(str) { var x = 0; for (var i = 0; i < str.length; i++) x = (x * 31 + str.charCodeAt(i)) >>> 0; return x; }
  function selloSVG(s) {
    var n = hashN(s.codigo), rot = (n % 17) - 8, col = ['#24462F', '#8A5B38', '#A65823', '#3E5A7A'][n % 4];
    var el = svg('svg', { viewBox: '0 0 160 160', class: 'at-stamp', role: 'img', 'aria-label': 'Sello de ' + s.titulo + ', ' + fechaCorta(s.fecha) });
    var g = svg('g', { transform: 'rotate(' + rot + ' 80 80)', fill: 'none', stroke: col, 'stroke-width': 3 });
    g.appendChild(svg('circle', { cx: 80, cy: 80, r: 72 })); g.appendChild(svg('circle', { cx: 80, cy: 80, r: 64, 'stroke-width': 1.2 }));
    g.appendChild(svg('path', { d: 'M38 104 L64 62 L80 86 L96 58 L122 104 Z', fill: col, 'fill-opacity': 0.16, 'stroke-width': 2.4, 'stroke-linejoin': 'round' }));
    g.appendChild(svg('path', { d: 'M56 76 L64 62 L72 74 M90 70 L96 58 L103 69', 'stroke-width': 2, 'stroke-linecap': 'round' }));
    var t = function (y, size, txt, w) { var e = svg('text', { x: 80, y: y, 'text-anchor': 'middle', fill: col, stroke: 'none', 'font-size': size, 'font-weight': w || 700, 'font-family': 'Barlow Condensed, Arial Narrow, sans-serif', 'letter-spacing': 1.2 }); e.textContent = txt; return e; };
    var corto = s.titulo.replace(/^Ruta (del |de la |de los |de las |de )/i, '').toUpperCase(); if (corto.length > 22) corto = corto.slice(0, 21) + '…';
    g.appendChild(t(40, 12, 'GUADARRAMAA'));
    g.appendChild(t(122, 12, corto)); g.appendChild(t(138, 13, fechaCorta(s.fecha) + ' · ' + fmt(s.km, 1) + ' KM'));
    el.appendChild(g); return el;
  }
  function guardarSellos() { lsSet('gg-pasaporte', { sellos: S.sellos }); }
  function pintarPasaporte(msg, tipo) {
    var box = $('#at-pas-body'); box.innerHTML = ''; var st = estadisticas();
    var form = h('form', { class: 'at-code', novalidate: true, onsubmit: function (ev) { ev.preventDefault(); canjear(inp.value, btn); } });
    var inp = h('input', { id: 'at-code', name: 'codigo', type: 'text', inputmode: 'text', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', maxlength: '20', placeholder: 'GGU-XXXX-XXXX', 'aria-describedby': 'at-code-msg' });
    var btn = h('button', { type: 'submit', class: 'btn btn-a', text: 'Estampar sello' });
    form.appendChild(h('label', { for: 'at-code', text: 'Tu código de la salida' })); form.appendChild(h('div', { class: 'at-code-row' }, [inp, btn]));
    form.appendChild(h('p', { id: 'at-code-msg', class: 'at-code-msg' + (tipo ? ' is-' + tipo : ''), role: 'status', text: msg || '' }));
    var cover = h('div', { class: 'at-book' }, [
      h('div', { class: 'at-book-cover' }, [h('p', { class: 'eyebrow', text: 'Pasaporte montañero' }), h('h3', { text: 'Sierra de Guadarrama' }), h('p', { class: 'at-rank', text: rango(st.km) })]),
      h('dl', { class: 'at-totals' }, [h('div', {}, [h('dt', { text: 'Sellos' }), h('dd', { text: fmt(st.n) })]), h('div', {}, [h('dt', { text: 'Kilómetros' }), h('dd', { text: fmt(st.km, 1) })]), h('div', {}, [h('dt', { text: 'Desnivel +' }), h('dd', { text: fmt(st.desnivel) + ' m' })]), h('div', {}, [h('dt', { text: 'Rutas' }), h('dd', { text: st.rutas + (S.rutas.length ? ' / ' + S.rutas.length : '') })])])
    ]);
    box.appendChild(h('div', { class: 'at-pas-top' }, [cover, form]));
    var hojas = h('div', { class: 'at-stamps' });
    if (!S.sellos.length) hojas.appendChild(h('p', { class: 'empty-n', text: 'Tu pasaporte está en blanco. Tras tu próxima salida con nosotros recibirás tu primer código.' }));
    S.sellos.slice().sort(function (a, b) { return String(b.fecha).localeCompare(String(a.fecha)); }).forEach(function (s) {
      hojas.appendChild(h('figure', { class: 'at-stamp-f' }, [selloSVG(s), h('figcaption', {}, [h('strong', { text: s.titulo }), h('span', { text: fechaCorta(s.fecha) + ' · ' + fmt(s.km, 1) + ' km · ' + fmt(s.desnivel) + ' m +' }), porId(s.ruta) ? h('button', { type: 'button', class: 'at-link', text: 'Ver en el mapa', onclick: function () { irAlMapa(s.ruta); } }) : null])]));
    });
    box.appendChild(hojas);
    var lg = h('div', { class: 'at-logros' }, [h('h3', { text: 'Logros' })]); var grid = h('div', { class: 'at-logros-g' });
    LOGROS.forEach(function (l) { var on = l.ok(st); grid.appendChild(h('div', { class: 'at-logro' + (on ? ' is-on' : '') }, [h('span', { class: 'at-logro-i', 'aria-hidden': 'true', text: on ? '★' : '☆' }), h('div', {}, [h('strong', { text: l.n }), h('small', { text: l.d }), h('span', { class: 'sr', text: on ? ' Conseguido' : ' Pendiente' })])])); });
    lg.appendChild(grid); box.appendChild(lg);
    var pie = h('div', { class: 'at-pas-pie' }, [h('p', { class: 'at-fine', text: 'Tu pasaporte se guarda solo en este navegador (no hay cuenta ni se guardan datos personales). Si cambias de dispositivo, vuelve a escribir tus códigos y recuperarás tus sellos.' })]);
    if (S.sellos.length) pie.appendChild(h('button', { type: 'button', class: 'btn btn-o btn-s', text: 'Descargar mi pasaporte (imagen)', onclick: exportarPNG }));
    box.appendChild(pie);
  }
  function canjear(codigo, btn) {
    codigo = String(codigo || '').trim(); if (!codigo) return pintarPasaporte('Escribe el código que te hemos dado.', 'err');
    btn.disabled = true; btn.textContent = 'Comprobando…';
    fetch('/api/pasaporte', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ codigo: codigo }) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (x) {
        if (!x.ok || !x.d.sello) return pintarPasaporte(x.d.mensaje || 'No se ha podido comprobar el código. Inténtalo de nuevo.', 'err');
        var s = x.d.sello, nuevo = !S.sellos.some(function (y) { return y.codigo === s.codigo; });
        if (nuevo) { S.sellos.push(s); guardarSellos(); }
        pintarChips(); estiloRutas(); pintarAsistente(); var antes = LOGROS.length;
        pintarPasaporte(nuevo ? '¡Sello conseguido! ' + s.titulo + ' · ' + fechaCorta(s.fecha) : 'Ese sello ya estaba en tu pasaporte.', 'ok');
        if (nuevo && porId(s.ruta)) { var b = $('#at-code-msg'); b.appendChild(document.createTextNode(' ')); b.appendChild(h('button', { type: 'button', class: 'at-link', text: 'Verlo en el mapa', onclick: function () { irAlMapa(s.ruta); } })); }
      })
      .catch(function () { pintarPasaporte('No hay conexión con el servidor. Inténtalo de nuevo en un momento.', 'err'); });
  }
  function exportarPNG() {
    var st = estadisticas(), W = 1080, Hh = 1350, c = document.createElement('canvas'); c.width = W; c.height = Hh; var g = c.getContext('2d');
    g.fillStyle = '#ECE6D3'; g.fillRect(0, 0, W, Hh); g.fillStyle = '#1F3D2B'; g.fillRect(0, 0, W, 300);
    g.fillStyle = '#F1EBDA'; g.font = '600 36px "Barlow Condensed", Arial Narrow, sans-serif'; g.fillText('GUADARRAMAA.GUIDESS · PASAPORTE MONTAÑERO', 60, 100);
    g.font = '64px "Young Serif", Georgia, serif'; g.fillText(rango(st.km), 60, 190); g.font = '34px "Albert Sans", Arial, sans-serif'; g.fillStyle = '#B9C4AE'; g.fillText(st.n + ' sellos · ' + fmt(st.km, 1) + ' km · ' + fmt(st.desnivel) + ' m de desnivel', 60, 250);
    var lista = S.sellos.slice().sort(function (a, b) { return String(b.fecha).localeCompare(String(a.fecha)); }).slice(0, 6);
    g.fillStyle = '#1B2A20'; var colores = ['#24462F', '#8A5B38', '#A65823', '#3E5A7A'];
    lista.forEach(function (s, i) {
      var x = 60 + (i % 2) * 510, y = 340 + Math.floor(i / 2) * 290, col = colores[hashN(s.codigo) % 4];
      g.strokeStyle = col; g.lineWidth = 5; g.beginPath(); g.arc(x + 110, y + 110, 100, 0, 7); g.stroke(); g.lineWidth = 2; g.beginPath(); g.arc(x + 110, y + 110, 88, 0, 7); g.stroke();
      g.fillStyle = col; g.textAlign = 'center'; g.font = '700 26px "Barlow Condensed", Arial Narrow, sans-serif';
      var t = s.titulo.replace(/^Ruta (del |de la |de los |de las |de )/i, '').toUpperCase(); g.fillText(t.length > 18 ? t.slice(0, 17) + '…' : t, x + 110, y + 100); g.font = '600 24px "Barlow Condensed", Arial Narrow, sans-serif'; g.fillText(fechaCorta(s.fecha), x + 110, y + 135); g.fillText(fmt(s.km, 1) + ' KM', x + 110, y + 165); g.textAlign = 'left';
      g.fillStyle = '#1B2A20'; g.font = '28px "Albert Sans", Arial, sans-serif'; g.fillText(fmt(s.desnivel) + ' m +', x + 240, y + 120);
    });
    g.fillStyle = '#4B5748'; g.font = '30px "Albert Sans", Arial, sans-serif'; g.fillText('guadarramaaguidess.netlify.app/atlas/', 60, Hh - 60);
    c.toBlob(function (b) { if (!b) return; var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'mi-pasaporte-guadarrama.png'; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500); }, 'image/png');
  }

  /* ── Arranque ───────────────────────────────────────────────── */
  var enter = $('[data-at-enter]'); if (enter) enter.addEventListener('click', function () { iniciarMapa(); });
  fetch('/data/atlas.json').then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (d) {
    S.data = d; S.rutas = d.rutas || []; S.sel = S.rutas.length ? S.rutas[0].id : null;
    S.rutas.forEach(function (r) { if (r.track) fetch(r.track.url).then(function (x) { return x.ok ? x.json() : null; }).then(function (j) { if (j) { prepararTrack(r, j.c); if (S.sel === r.id) pintarControles(); } }).catch(function () { }); });
    pintarChips(); pintarTarjeta(); pintarControles(); pintarAsistente(); pintarPasaporte(); cargarTiempo();
    var q = /[?&]ruta=([a-z0-9-]+)/.exec(location.search); if (q && porId(q[1])) { S.sel = q[1]; pintarChips(); pintarTarjeta(); pintarControles(); }
  }).catch(function () {
    var c = $('#at-sem-body'); if (c) c.innerHTML = ''; ['at-asis-body', 'at-pas-body', 'at-sem-body'].forEach(function (id) { var b = document.getElementById(id); if (b) { b.innerHTML = ''; b.appendChild(h('p', { class: 'empty-n', text: 'No se han podido cargar los datos del Atlas. Recarga la página.' })); } });
  });
})();
