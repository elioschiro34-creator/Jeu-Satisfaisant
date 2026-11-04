/* Douceurs — socle commun : sons synthétisés, vibrations, canvas, pointeur, registre des jeux. */
(function () {
  'use strict';

  const SG = (window.SG = {});
  SG.games = [];
  SG.registerGame = (def) => SG.games.push(def);

  /* ---------- Utilitaires ---------- */
  SG.util = {
    clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
    lerp: (a, b, t) => a + (b - a) * t,
    rand: (a, b) => a + Math.random() * (b - a),
    randInt: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
    pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
    dist: (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1),
    hsl: (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`,
  };

  /* Palette pastel partagée */
  SG.palette = {
    cream: '#fff7ec', butter: '#ffe39a', peach: '#ffc8a8', pink: '#ffb5c8',
    lilac: '#d6c4ff', sky: '#b8dcff', mint: '#b9f0d4', lemon: '#fff3a6',
    coral: '#ff9e9e', ink: '#5b4a5e',
    list: ['#ffb5c8', '#ffc8a8', '#ffe39a', '#b9f0d4', '#b8dcff', '#d6c4ff', '#ff9e9e', '#a8eee8'],
  };

  /* ---------- Vibrations ---------- */
  SG.haptic = (pattern = 10) => {
    if (!SG.settings.haptics) return;
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* ignore */ }
  };

  /* ---------- Réglages ---------- */
  SG.settings = { sound: true, haptics: true, volume: 0.8, music: false, night: false, favs: [] };
  try {
    const saved = JSON.parse(localStorage.getItem('douceurs-settings') || '{}');
    Object.assign(SG.settings, saved);
  } catch (e) { /* ignore */ }
  SG.saveSettings = () => {
    try { localStorage.setItem('douceurs-settings', JSON.stringify(SG.settings)); } catch (e) { /* ignore */ }
  };

  /* L'audio est dans js/audio.js */

  // ?test dans l'URL : boucle par minuterie (utile quand la page n'est pas affichée)
  const TEST = /[?&]test\b/.test(location.search);

  /* ---------- Qualité automatique ---------- */
  /*
   * Si le jeu rame (images trop lentes pendant ~3 s), on baisse la qualité d'un cran :
   * moins de pixels par canvas (dprCap), et SG.quality.level diminue (2 = haute, 1 = moyenne, 0 = basse).
   * Les jeux lourds peuvent lire SG.quality.level et s'abonner avec SG.quality.onChange(fn).
   * La qualité repart en haute à chaque ouverture de jeu (SG.quality.reset()).
   */
  const canvases = new Set();
  const qcbs = new Set();
  const DPR_CAP = [1, 1.5, 2];
  SG.quality = {
    level: 2,
    get dprCap() { return DPR_CAP[this.level]; },
    onChange(fn) { qcbs.add(fn); return () => qcbs.delete(fn); },
    set(level) {
      level = Math.max(0, Math.min(2, level));
      if (level === this.level) return;
      this.level = level;
      canvases.forEach((rs) => rs());
      qcbs.forEach((fn) => { try { fn(level); } catch (e) { console.error(e); } });
    },
    reset() { qcbs.clear(); slow = 0; ema = 1 / 60; this.level = 2; },
  };
  let ema = 1 / 60, slow = 0, grace = 0;
  function watchFrame(rawDt) {
    if (TEST || document.hidden) return;
    if (rawDt > 0.25) return; // onglet en pause, pas une vraie lenteur
    ema += (rawDt - ema) * 0.05;
    if (grace > 0) { grace -= rawDt; return; }
    if (ema > 1 / 34) slow += rawDt; else slow = Math.max(0, slow - rawDt * 0.5);
    if (slow > 3 && SG.quality.level > 0) {
      SG.quality.set(SG.quality.level - 1);
      slow = 0; grace = 2; ema = 1 / 60;
    }
  }

  /* ---------- Canvas plein cadre avec gestion du DPR ---------- */
  /**
   * Crée un canvas qui remplit `container` et se redimensionne.
   * Renvoie { canvas, ctx, w, h, dpr, onResize(fn), destroy() }.
   * ctx est déjà mis à l'échelle : on dessine en pixels CSS.
   */
  SG.makeCanvas = (container, opts = {}) => {
    const canvas = document.createElement('canvas');
    canvas.className = 'sg-canvas';
    container.appendChild(canvas);
    const c = canvas.getContext('2d', { willReadFrequently: !!opts.readback });
    const st = { canvas, ctx: c, w: 0, h: 0, dpr: 1, _cbs: [] };
    const resize = () => {
      const r = container.getBoundingClientRect();
      st.dpr = Math.min(window.devicePixelRatio || 1, opts.maxDpr || 2, SG.quality.dprCap);
      st.w = Math.max(1, Math.round(r.width)); st.h = Math.max(1, Math.round(r.height));
      canvas.width = Math.round(st.w * st.dpr); canvas.height = Math.round(st.h * st.dpr);
      canvas.style.width = st.w + 'px'; canvas.style.height = st.h + 'px';
      c.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
      st._cbs.forEach((fn) => fn(st.w, st.h));
    };
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    resize();
    canvases.add(resize);
    st.onResize = (fn) => { st._cbs.push(fn); };
    st.destroy = () => { ro.disconnect(); canvases.delete(resize); canvas.remove(); };
    return st;
  };

  /* ---------- Pointeur unifié (souris + tactile) ---------- */
  /**
   * SG.pointer(el, { down(p), move(p), up(p) })
   * p = { x, y, dx, dy, speed (px/ms), id, pressed, e }
   * Coordonnées relatives à l'élément, en pixels CSS. Gère le multi-touch.
   */
  SG.pointer = (el, h) => {
    const pts = new Map();
    el.style.touchAction = 'none';
    const pos = (e) => { const r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const onDown = (e) => {
      SG.audio.init();
      try { el.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      const q = pos(e);
      const p = { x: q.x, y: q.y, dx: 0, dy: 0, speed: 0, id: e.pointerId, pressed: true, t: performance.now(), e };
      pts.set(e.pointerId, p);
      h.down && h.down(p);
      e.preventDefault();
    };
    const onMove = (e) => {
      const q = pos(e);
      let p = pts.get(e.pointerId);
      const now = performance.now();
      if (!p) { // survol sans clic (souris)
        h.hover && h.hover({ x: q.x, y: q.y, e });
        return;
      }
      const dt = Math.max(1, now - p.t);
      p.dx = q.x - p.x; p.dy = q.y - p.y;
      p.speed = SG.util.lerp(p.speed, Math.hypot(p.dx, p.dy) / dt, 0.5);
      p.x = q.x; p.y = q.y; p.t = now; p.e = e;
      h.move && h.move(p);
    };
    const onUp = (e) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      p.pressed = false; p.e = e;
      pts.delete(e.pointerId);
      h.up && h.up(p);
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    return {
      active: pts,
      destroy() {
        el.removeEventListener('pointerdown', onDown);
        el.removeEventListener('pointermove', onMove);
        el.removeEventListener('pointerup', onUp);
        el.removeEventListener('pointercancel', onUp);
      },
    };
  };

  /* ---------- Boucle d'animation ---------- */
  /** SG.loop(fn(dt en secondes, t)) → { stop() } ; dt plafonné à 1/20 s */
  let lastWatched = 0;
  const raf = TEST ? (f) => setTimeout(() => f(performance.now()), 16) : (f) => requestAnimationFrame(f);
  const caf = TEST ? clearTimeout : cancelAnimationFrame;
  SG.loop = (fn) => {
    let id = 0, last = performance.now(), running = true;
    const tick = (now) => {
      if (!running) return;
      const raw = (now - last) / 1000;
      const dt = Math.min(0.05, raw); last = now;
      // une seule mesure de fluidité par image, même avec plusieurs boucles
      if (now !== lastWatched) { lastWatched = now; watchFrame(raw); }
      fn(dt, now / 1000);
      id = raf(tick);
    };
    id = raf(tick);
    return { stop() { running = false; caf(id); } };
  };

  /* ---------- Petits éléments d'interface dans un jeu ---------- */
  /**
   * SG.toolbar(container, items) : barre de boutons flottante en bas.
   * items: [{ label, icon?, onClick, active? , color? }]  → renvoie l'élément.
   */
  SG.toolbar = (container, items) => {
    const bar = document.createElement('div');
    bar.className = 'sg-toolbar';
    items.forEach((it) => {
      const b = document.createElement('button');
      b.className = 'sg-tool' + (it.active ? ' active' : '');
      if (it.color) { b.style.setProperty('--swatch', it.color); b.classList.add('swatch'); }
      b.innerHTML = (it.icon ? `<span class="ic">${it.icon}</span>` : '') + (it.label ? `<span class="lb">${it.label}</span>` : '');
      b.title = it.title || it.label || '';
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        SG.audio.init(); SG.audio.click(); SG.haptic(5);
        if (it.group) bar.querySelectorAll(`[data-group="${it.group}"]`).forEach((x) => x.classList.remove('active'));
        if (it.group) b.classList.add('active');
        it.onClick && it.onClick(b);
      });
      if (it.group) b.dataset.group = it.group;
      bar.appendChild(b);
    });
    container.appendChild(bar);
    return bar;
  };

  /** Indication discrète en haut (« Glisse pour tartiner »), disparaît seule. */
  SG.hint = (container, text, ms = 3500) => {
    const el = document.createElement('div');
    el.className = 'sg-hint';
    el.textContent = text;
    container.appendChild(el);
    setTimeout(() => el.classList.add('hide'), ms);
    setTimeout(() => el.remove(), ms + 800);
    return el;
  };

  /** Jauge de progression en haut (0..1). Renvoie { set(v) }. */
  SG.progress = (container, label = '') => {
    const el = document.createElement('div');
    el.className = 'sg-progress';
    el.innerHTML = `<span class="pl">${label}</span><div class="pt"><div class="pf"></div></div><span class="pv">0%</span>`;
    container.appendChild(el);
    const pf = el.querySelector('.pf'), pv = el.querySelector('.pv');
    return {
      el,
      set(v) {
        v = SG.util.clamp(v, 0, 1);
        pf.style.width = (v * 100).toFixed(1) + '%';
        pv.textContent = Math.floor(v * 100) + '%';
      },
    };
  };

  /** Petite célébration (confettis DOM légers + son) */
  SG.celebrate = (container, text = 'Parfait !') => {
    SG.audio.win(); SG.haptic([20, 40, 20]);
    const el = document.createElement('div');
    el.className = 'sg-celebrate';
    el.textContent = text;
    container.appendChild(el);
    for (let i = 0; i < 30; i++) {
      const c = document.createElement('i');
      c.className = 'sg-confetti';
      c.style.left = SG.util.rand(10, 90) + '%';
      c.style.background = SG.util.pick(SG.palette.list);
      c.style.animationDelay = SG.util.rand(0, 0.4) + 's';
      c.style.setProperty('--dx', SG.util.rand(-80, 80) + 'px');
      c.style.setProperty('--rot', SG.util.rand(-720, 720) + 'deg');
      container.appendChild(c);
      setTimeout(() => c.remove(), 2600);
    }
    setTimeout(() => el.remove(), 2200);
  };
})();
