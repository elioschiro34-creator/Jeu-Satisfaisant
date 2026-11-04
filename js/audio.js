/* Douceurs — moteur de sons ASMR, entièrement synthétisé (Web Audio API).
   Réverbération de petite pièce, sons à couches, crépitements granulaires. */
(function () {
  'use strict';
  const SG = window.SG;
  const A = (SG.audio = {});
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  let ctx = null, master = null, dry = null, verb = null, verbIn = null;
  const buf = {};

  /* ---------- Mise en place ---------- */
  function makeNoise(kind) {
    const len = ctx.sampleRate * 2;
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    if (kind === 'white') {
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } else if (kind === 'pink') {
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
      }
    } else {
      let last = 0;
      for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    }
    return b;
  }
  // Réponse impulsionnelle synthétique : petite pièce chaleureuse
  function makeImpulse(sec, decay) {
    const len = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        lp = lp * 0.6 + (Math.random() * 2 - 1) * 0.4; // un peu feutré
        d[i] = lp * Math.pow(1 - t, decay) * (i < 40 ? i / 40 : 1);
      }
    }
    return b;
  }

  A.init = () => {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 3.5;
    comp.attack.value = 0.003; comp.release.value = 0.15;
    master = ctx.createGain();
    master.gain.value = level();
    // Bus sec + envoi réverbération
    dry = ctx.createGain(); dry.gain.value = 1;
    verbIn = ctx.createGain(); verbIn.gain.value = 1;
    verb = ctx.createConvolver();
    verb.buffer = makeImpulse(1.4, 3.2);
    const verbOut = ctx.createGain(); verbOut.gain.value = 0.55;
    const verbHp = ctx.createBiquadFilter(); verbHp.type = 'highpass'; verbHp.frequency.value = 180;
    verbIn.connect(verbHp); verbHp.connect(verb); verb.connect(verbOut); verbOut.connect(master);
    dry.connect(master);
    master.connect(comp); comp.connect(ctx.destination);
    buf.white = makeNoise('white'); buf.pink = makeNoise('pink'); buf.brown = makeNoise('brown');
    if (SG.settings.music) A.music(true);
  };
  A.ctx = () => ctx;
  A.out = () => dry;
  // Volume général (courbe douce : la moitié du curseur ≈ moitié du ressenti)
  const level = () => (SG.settings.sound ? 1.1 * Math.pow(clamp(SG.settings.volume ?? 0.8, 0, 1), 1.6) : 0);
  const applyLevel = () => { if (master) master.gain.setTargetAtTime(level(), ctx.currentTime, 0.05); };
  A.setEnabled = (on) => { SG.settings.sound = on; SG.saveSettings(); applyLevel(); };
  A.setVolume = (v) => { SG.settings.volume = clamp(v, 0, 1); SG.saveSettings(); applyLevel(); };

  /* ---------- Musique d'ambiance générative (douce, optionnelle) ---------- */
  // Accords planants Fmaj9 → Am7 → Dm9 → Bbmaj7 (lents), + petites notes de boîte à musique
  const CHORDS = [[53, 57, 60, 64, 67], [57, 60, 64, 67, 71], [50, 57, 60, 64, 65], [46, 53, 57, 60, 62]];
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  let music = null;
  A.music = (on) => {
    SG.settings.music = !!on; SG.saveSettings();
    if (!ctx) return;
    if (!on) {
      if (music) {
        const m = music; music = null;
        clearInterval(m.iv); clearTimeout(m.bell);
        m.bus.gain.setTargetAtTime(0, ctx.currentTime, 0.6);
        setTimeout(() => { try { m.bus.disconnect(); } catch (e) { /* ignore */ } }, 4000);
      }
      return;
    }
    if (music) return;
    const bus = ctx.createGain(); bus.gain.value = 0;
    const lp = filt('lowpass', 1400, 0.5);
    bus.connect(lp); lp.connect(dry);
    const sendV = ctx.createGain(); sendV.gain.value = 0.9; lp.connect(sendV); sendV.connect(verbIn);
    bus.gain.setTargetAtTime(0.16, ctx.currentTime, 1.5);
    let ci = 0;
    const playChord = () => {
      const t = ctx.currentTime + 0.05, dur = 7.5;
      CHORDS[ci % CHORDS.length].forEach((m, k) => {
        [-4, 4].forEach((det) => {
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.type = k === 0 ? 'triangle' : 'sine';
          o.frequency.value = mtof(m - (k === 0 ? 12 : 0)); o.detune.value = det + Math.random() * 3;
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(0.09 / (1 + k * 0.3), t + 2.5);
          g.gain.linearRampToValueAtTime(0.0001, t + dur);
          o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.1);
        });
      });
      ci++;
    };
    // Boîte à musique : notes de la gamme, rares et aléatoires
    const SCALE = [65, 67, 69, 72, 74, 76, 77, 79, 81, 84];
    const bell = () => {
      if (!music) return;
      if (SG.settings.sound) {
        const f = mtof(SCALE[Math.floor(Math.random() * SCALE.length)]), t = ctx.currentTime + 0.02;
        [[1, 0.06, 1.6], [2.76, 0.015, 0.6], [5.4, 0.006, 0.3]].forEach(([r, v, d]) => {
          const o = ctx.createOscillator(), g = gainEnv(t, 0.004, v, d);
          o.frequency.value = f * r; o.connect(g); g.connect(bus); o.start(t); o.stop(t + d + 0.1);
        });
      }
      music.bell = setTimeout(bell, 900 + Math.random() * 2600);
    };
    playChord();
    music = { bus, iv: setInterval(playChord, 6000), bell: 0 };
    music.bell = setTimeout(bell, 2000);
  };
  const ready = () => ctx && SG.settings.sound && ctx.state !== 'closed';

  /* ---------- Briques ---------- */
  // Envoie un nœud vers la sortie (sec + réverb)
  function send(node, wet = 0.15) {
    node.connect(dry);
    if (wet > 0) { const g = ctx.createGain(); g.gain.value = wet; node.connect(g); g.connect(verbIn); }
  }
  function noise(kind = 'white') {
    const s = ctx.createBufferSource();
    s.buffer = buf[kind]; s.loop = true;
    return s;
  }
  function filt(type, f, q = 1) {
    const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b;
  }
  function gainEnv(t, a, peak, d, curve = 'exp') {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    if (a <= 0.0005) g.gain.setValueAtTime(Math.max(peak, 0.0002), t);
    else g.gain.linearRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    if (curve === 'exp') g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    else g.gain.linearRampToValueAtTime(0.0001, t + a + d);
    return g;
  }
  // Rafale de bruit filtré
  function burst(t, { kind = 'white', type = 'bandpass', f = 2000, q = 1, a = 0.001, d = 0.03, vol = 0.5, wet = 0.1, fEnd = 0 }) {
    const n = noise(kind), b = filt(type, f, q), g = gainEnv(t, a, vol, d);
    if (fEnd) b.frequency.exponentialRampToValueAtTime(fEnd, t + a + d);
    n.connect(b); b.connect(g); send(g, wet);
    n.start(t, Math.random() * 1.5); n.stop(t + a + d + 0.05);
  }
  // Oscillateur avec glissando
  function tone(t, { type = 'sine', f0 = 440, f1 = 0, a = 0.002, d = 0.1, vol = 0.3, wet = 0.15, glide = 0 }) {
    const o = ctx.createOscillator(), g = gainEnv(t, a, vol, d);
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + (glide || a + d));
    o.connect(g); send(g, wet);
    o.start(t); o.stop(t + a + d + 0.05);
  }
  const now = () => ctx.currentTime + 0.005;

  /* ---------- Sons ponctuels ---------- */

  /** Bulle qui éclate (papier bulle) : claquement sec + résonance de l'air */
  A.pop = (pitch = 1, vol = 0.7) => {
    if (!ready()) return;
    const t = now(), p = pitch * rnd(0.9, 1.12);
    burst(t, { type: 'highpass', f: 2500 * p, q: 0.7, d: 0.012, vol: vol * 0.9, wet: 0.08 });
    burst(t, { type: 'bandpass', f: 1300 * p, q: 6, d: rnd(0.03, 0.05), vol: vol * 0.7, wet: 0.12 });
    tone(t, { f0: 260 * p, f1: 90 * p, d: 0.06, vol: vol * 0.35, wet: 0 });
    // petit souffle d'air qui s'échappe
    burst(t + 0.006, { kind: 'pink', type: 'bandpass', f: 3500 * p, q: 1.5, a: 0.004, d: 0.06, vol: vol * 0.12, wet: 0.2 });
  };

  /** « Plop » doux du silicone (pop-it) */
  A.plop = (pitch = 1, vol = 0.6) => {
    if (!ready()) return;
    const t = now(), p = pitch * rnd(0.94, 1.06);
    tone(t, { f0: 520 * p, f1: 170 * p, d: 0.08, vol: vol * 0.55, wet: 0.18, glide: 0.05 });
    tone(t, { type: 'triangle', f0: 1100 * p, f1: 500 * p, d: 0.025, vol: vol * 0.12, wet: 0.1 });
    burst(t, { kind: 'pink', type: 'lowpass', f: 900 * p, q: 2, d: 0.04, vol: vol * 0.45, wet: 0.1 });
  };

  /** Craquement granulaire (beurre froid, savon, croûte, sable, caramel). intensity 0..1, tone ~0.5..2 */
  A.crunch = (intensity = 0.6, toneK = 1) => {
    if (!ready()) return;
    const t0 = now();
    const n = 4 + Math.floor(intensity * 18);
    const span = 0.04 + intensity * 0.12;
    let t = t0;
    for (let i = 0; i < n; i++) {
      t += -Math.log(1 - Math.random()) * span / n; // arrivées en grappes
      const hi = Math.random() < 0.75;
      burst(t, {
        type: 'bandpass', f: (hi ? rnd(1800, 6500) : rnd(450, 1200)) * toneK, q: rnd(1.5, 7),
        d: hi ? rnd(0.004, 0.018) : rnd(0.012, 0.035), vol: (hi ? rnd(0.25, 0.7) : rnd(0.3, 0.6)) * intensity, wet: 0.12,
      });
    }
    // corps sourd
    burst(t0, { kind: 'pink', type: 'lowpass', f: 500 * toneK, q: 1, d: 0.06, vol: 0.35 * intensity, wet: 0.05 });
  };

  /** Cassure nette (tablette, caramel, glace) */
  A.crack = (vol = 0.7, toneK = 1) => {
    if (!ready()) return;
    const t = now();
    burst(t, { type: 'highpass', f: 3000 * toneK, q: 0.8, d: 0.008, vol: vol, wet: 0.2 });
    burst(t, { type: 'bandpass', f: rnd(2200, 3200) * toneK, q: 12, d: 0.05, vol: vol * 0.5, wet: 0.25 });
    tone(t, { f0: 140 * toneK, f1: 70, d: 0.07, vol: vol * 0.4, wet: 0 });
    A.crunch(vol * 0.5, toneK * 1.2);
  };

  /** Bruit mouillé, gluant (slime, peinture, crème) */
  A.squish = (pitch = 1, vol = 0.6) => {
    if (!ready()) return;
    const t = now(), p = pitch * rnd(0.9, 1.1), d = rnd(0.16, 0.26);
    // deux formants qui glissent : effet « bouche » humide
    [[280, 1100, 260], [700, 2200, 600]].forEach(([a, b, c], k) => {
      const n = noise('brown'), f = filt('bandpass', a * p, 6), g = gainEnv(t, 0.012, vol * (k ? 0.35 : 0.8), d);
      f.frequency.setValueAtTime(a * p, t);
      f.frequency.exponentialRampToValueAtTime(b * p, t + d * 0.35);
      f.frequency.exponentialRampToValueAtTime(c * p, t + d);
      n.connect(f); f.connect(g); send(g, 0.15);
      n.start(t, Math.random()); n.stop(t + d + 0.1);
    });
    // micro-bulles qui claquent
    const nb = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < nb; i++) A.bubble(p * rnd(0.8, 1.6), vol * 0.25, rnd(0.02, d));
  };

  /** Petite bulle liquide (blup) — delay en secondes */
  A.bubble = (pitch = 1, vol = 0.3, delay = 0) => {
    if (!ready()) return;
    const t = now() + delay, f = rnd(500, 900) * pitch;
    tone(t, { f0: f, f1: f * rnd(1.6, 2.4), d: rnd(0.02, 0.04), vol, wet: 0.2, glide: 0.03 });
  };

  /** Goutte / blob qui tombe (peinture, glaçage) */
  A.drip = (pitch = 1, vol = 0.5) => {
    if (!ready()) return;
    const t = now(), p = pitch * rnd(0.9, 1.1);
    tone(t, { f0: 300 * p, f1: 1000 * p, d: 0.05, vol: vol * 0.45, wet: 0.3, glide: 0.04 });
    burst(t, { kind: 'brown', type: 'lowpass', f: 600 * p, q: 3, d: 0.08, vol: vol * 0.5, wet: 0.1 });
  };

  /** Atterrissage mou (morceau qui tombe sur une planche / un tapis) */
  A.thud = (vol = 0.5, pitch = 1) => {
    if (!ready()) return;
    const t = now();
    tone(t, { f0: 120 * pitch, f1: 55 * pitch, d: 0.09, vol: vol * 0.7, wet: 0.05 });
    burst(t, { kind: 'pink', type: 'lowpass', f: 700 * pitch, q: 1, d: 0.05, vol: vol * 0.5, wet: 0.08 });
  };

  /** Petit choc sur un matériau : 'wood' | 'ceramic' | 'glass' | 'metal' | 'plastic' */
  const MODES = {
    wood: { f: 420, r: [1, 2.6, 4.1], d: 0.06 },
    ceramic: { f: 1150, r: [1, 2.32, 4.25, 6.6], d: 0.25 },
    glass: { f: 1800, r: [1, 2.76, 5.4, 8.9], d: 0.5 },
    metal: { f: 900, r: [1, 2.43, 3.87, 5.6], d: 0.6 },
    plastic: { f: 700, r: [1, 2.1, 3.3], d: 0.05 },
  };
  A.tap = (material = 'wood', vol = 0.5, pitch = 1) => {
    if (!ready()) return;
    const m = MODES[material] || MODES.wood, t = now(), f = m.f * pitch * rnd(0.97, 1.03);
    m.r.forEach((r, i) => tone(t, { f0: f * r, d: m.d / (1 + i * 0.7), vol: vol * 0.35 / (1 + i), wet: 0.25 }));
    burst(t, { type: 'bandpass', f: f * 3, q: 1, d: 0.006, vol: vol * 0.5, wet: 0.1 });
  };

  /** Froissement de plastique / papier (film, emballage) */
  A.rustle = (vol = 0.4, dur = 0.3) => {
    if (!ready()) return;
    const t0 = now(), n = Math.floor(10 + dur * 60);
    for (let i = 0; i < n; i++) {
      const t = t0 + Math.random() * dur;
      burst(t, { type: 'bandpass', f: rnd(2500, 8000), q: rnd(2, 8), d: rnd(0.003, 0.012), vol: vol * rnd(0.2, 0.7), wet: 0.12 });
    }
  };

  /** Souffle (objet qui glisse, nouvelle feuille) */
  A.whoosh = (vol = 0.4, dur = 0.4, up = false) => {
    if (!ready()) return;
    const t = now();
    const n = noise('pink'), f = filt('bandpass', up ? 300 : 2500, 1.2), g = ctx.createGain();
    f.frequency.exponentialRampToValueAtTime(up ? 2500 : 300, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(f); f.connect(g); send(g, 0.2);
    n.start(t, Math.random()); n.stop(t + dur + 0.05);
  };

  /** Bruit de chute de sable */
  A.sand = (vol = 0.4, dur = 0.25) => {
    if (!ready()) return;
    const t0 = now(), n = Math.floor(20 + dur * 140);
    for (let i = 0; i < n; i++) {
      const t = t0 + Math.pow(Math.random(), 0.7) * dur;
      burst(t, { type: 'bandpass', f: rnd(3000, 9000), q: rnd(2, 6), d: rnd(0.002, 0.006), vol: vol * rnd(0.1, 0.45), wet: 0.08 });
    }
    burst(t0, { kind: 'pink', type: 'highpass', f: 2500, q: 0.7, a: 0.03, d: dur, vol: vol * 0.25, wet: 0.1 });
  };

  /** Note cristalline pentatonique (récompense) */
  const PENTA = [0, 2, 4, 7, 9];
  A.chime = (step = 0, vol = 0.3, type = 'sine') => {
    if (!ready()) return;
    const t = now();
    const oct = Math.floor(step / 5), semis = PENTA[((step % 5) + 5) % 5] + oct * 12;
    const f = 523.25 * Math.pow(2, semis / 12);
    [[1, 1, 1.2], [2.01, 0.35, 0.6], [3.02, 0.12, 0.35], [4.1, 0.05, 0.2]].forEach(([m, v, d], i) => {
      tone(t, { type: i === 0 ? type : 'sine', f0: f * m, a: 0.003, d, vol: vol * v, wet: 0.45 });
    });
  };

  /** Arpège de victoire, scintillant */
  A.win = () => {
    if (!ready()) return;
    [0, 2, 4, 5, 7, 9].forEach((s, i) => setTimeout(() => A.chime(s, 0.22), i * 85));
    setTimeout(() => A.sparkle(0.25), 450);
  };

  /** Pluie de petites étincelles sonores */
  A.sparkle = (vol = 0.2) => {
    if (!ready()) return;
    for (let i = 0; i < 10; i++) {
      const t = now() + i * 0.04 + Math.random() * 0.03;
      tone(t, { f0: rnd(2500, 5000), d: rnd(0.05, 0.15), vol: vol * rnd(0.2, 0.6), wet: 0.6 });
    }
  };

  /** Clic d'interface doux */
  A.click = () => {
    if (!ready()) return;
    const t = now();
    tone(t, { type: 'triangle', f0: 1100, f1: 600, d: 0.04, vol: 0.12, wet: 0.1 });
    burst(t, { type: 'highpass', f: 4000, d: 0.004, vol: 0.12, wet: 0 });
  };

  /* ---------- Sons continus pilotés par le geste ---------- */
  /*
   * A.loop(type) → { set(level 0..1, tone 0..1), stop() }
   * Types : 'smear' (beurre, crème, peinture épaisse), 'paint' (pinceau mouillé),
   * 'scrape' (lame sur surface sèche), 'brush' (frottement léger), 'sand' (sable fin),
   * 'hum' (versement, ronronnement), 'sticky' (slime qui s'étire), 'peel' (film plastique),
   * 'flame' (chalumeau), 'pour' (liquide qui coule).
   * Chaque type mélange un bruit filtré continu et des « grains » (micro-craquements)
   * dont la densité suit le niveau : c'est ce qui rend le son vivant.
   */
  const LOOPS = {
    smear:  { kind: 'brown', ft: 'lowpass',  f0: 260,  f1: 1300, q: 4,   max: 0.55, grains: 26, grain: 'wet' },
    paint:  { kind: 'brown', ft: 'bandpass', f0: 400,  f1: 1500, q: 2,   max: 0.45, grains: 30, grain: 'wet' },
    scrape: { kind: 'pink',  ft: 'bandpass', f0: 1500, f1: 4200, q: 1.4, max: 0.32, grains: 70, grain: 'dry' },
    brush:  { kind: 'pink',  ft: 'bandpass', f0: 2500, f1: 6500, q: 0.8, max: 0.2,  grains: 20, grain: 'fine' },
    sand:   { kind: 'white', ft: 'highpass', f0: 3000, f1: 6000, q: 0.7, max: 0.16, grains: 220, grain: 'fine' },
    hum:    { kind: 'brown', ft: 'lowpass',  f0: 220,  f1: 700,  q: 5,   max: 0.45, grains: 6,  grain: 'wet' },
    sticky: { kind: 'brown', ft: 'bandpass', f0: 300,  f1: 1100, q: 5,   max: 0.5,  grains: 18, grain: 'stick' },
    peel:   { kind: 'pink',  ft: 'bandpass', f0: 2500, f1: 6000, q: 2.5, max: 0.18, grains: 90, grain: 'crackle' },
    flame:  { kind: 'brown', ft: 'bandpass', f0: 500,  f1: 900,  q: 0.8, max: 0.6,  grains: 40, grain: 'fine', hiss: true },
    pour:   { kind: 'brown', ft: 'lowpass',  f0: 500,  f1: 1400, q: 3,   max: 0.4,  grains: 40, grain: 'bub' },
  };
  function grainOf(kind, t, lv, tn) {
    switch (kind) {
      case 'wet':
        if (Math.random() < 0.5) tone(t, { f0: rnd(350, 700), f1: rnd(900, 1600), d: rnd(0.012, 0.025), vol: 0.12 * lv, wet: 0.15 });
        else burst(t, { kind: 'brown', type: 'bandpass', f: rnd(500, 1500), q: 6, d: rnd(0.01, 0.03), vol: 0.35 * lv, wet: 0.1 });
        break;
      case 'dry':
        burst(t, { type: 'bandpass', f: rnd(1800, 6000) * (0.8 + tn * 0.4), q: rnd(2, 6), d: rnd(0.002, 0.008), vol: rnd(0.15, 0.5) * lv, wet: 0.08 });
        break;
      case 'fine':
        burst(t, { type: 'bandpass', f: rnd(4000, 9000), q: rnd(2, 5), d: rnd(0.0015, 0.004), vol: rnd(0.08, 0.3) * lv, wet: 0.05 });
        break;
      case 'stick':
        tone(t, { f0: rnd(200, 420), f1: rnd(600, 1200), d: rnd(0.02, 0.05), vol: 0.14 * lv, wet: 0.2, glide: 0.03 });
        break;
      case 'crackle':
        burst(t, { type: 'highpass', f: rnd(2500, 6000), q: 1, d: rnd(0.001, 0.004), vol: rnd(0.2, 0.7) * lv, wet: 0.1 });
        break;
      case 'bub':
        tone(t, { f0: rnd(300, 800), f1: rnd(900, 1800), d: rnd(0.015, 0.035), vol: 0.1 * lv, wet: 0.3 });
        break;
    }
  }
  A.loop = (type = 'smear') => {
    const dummy = { set() {}, stop() {} };
    if (!ctx) return dummy;
    const c = LOOPS[type] || LOOPS.smear;
    const n = noise(c.kind), f = filt(c.ft, c.f0, c.q), g = ctx.createGain();
    g.gain.value = 0;
    n.connect(f); f.connect(g); send(g, 0.12);
    n.start(0, Math.random());
    let hiss = null, hg = null;
    if (c.hiss) {
      hiss = noise('white'); const hf = filt('highpass', 5000, 0.7); hg = ctx.createGain(); hg.gain.value = 0;
      hiss.connect(hf); hf.connect(hg); send(hg, 0.05); hiss.start();
    }
    let level = 0, tn = 0.5, stopped = false;
    // Planificateur de grains : densité ∝ niveau
    const iv = setInterval(() => {
      if (stopped || !SG.settings.sound || level < 0.02) return;
      const t0 = ctx.currentTime + 0.02;
      const expect = c.grains * level * 0.03;
      let k = Math.floor(expect) + (Math.random() < expect % 1 ? 1 : 0);
      k = Math.min(k, 12);
      for (let i = 0; i < k; i++) grainOf(c.grain, t0 + Math.random() * 0.03, level, tn);
    }, 30);
    return {
      set(lv = 0, tone01 = 0.5) {
        if (stopped) return;
        level = clamp(lv, 0, 1); tn = clamp(tone01, 0, 1);
        const t = ctx.currentTime;
        g.gain.setTargetAtTime(level * c.max, t, 0.035);
        f.frequency.setTargetAtTime(c.f0 + (c.f1 - c.f0) * tn, t, 0.05);
        if (hg) hg.gain.setTargetAtTime(level * 0.08, t, 0.05);
      },
      stop() {
        if (stopped) return; stopped = true;
        clearInterval(iv);
        const t = ctx.currentTime;
        g.gain.setTargetAtTime(0, t, 0.03);
        if (hg) hg.gain.setTargetAtTime(0, t, 0.03);
        try { n.stop(t + 0.25); if (hiss) hiss.stop(t + 0.25); } catch (e) { /* ignore */ }
      },
    };
  };
})();
