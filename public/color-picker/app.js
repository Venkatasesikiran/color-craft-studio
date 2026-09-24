/* ============================================================
   Tintwell — shared client-side logic (vanilla JavaScript)
   Pages: index.html (picker) · harmony.html · palettes.html
   ============================================================ */
(function () {
  'use strict';

  /* ---------- helpers ---------- */
  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.prototype.slice.call((el || document).querySelectorAll(sel));
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const mod360 = (h) => ((h % 360) + 360) % 360;

  /* ---------- color math ---------- */
  function hexToRgb(hex) {
    hex = String(hex).replace('#', '');
    if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
    const n = parseInt(hex, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function rgbToHex(r, g, b) {
    return '#' + [r, g, b]
      .map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0'))
      .join('').toUpperCase();
  }
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        default: h = (r - g) / d + 4;
      }
      h *= 60;
    }
    return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
  }
  function hslToRgb(h, s, l) {
    s /= 100; l /= 100;
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return {
      r: Math.round(f(0) * 255),
      g: Math.round(f(8) * 255),
      b: Math.round(f(4) * 255),
    };
  }
  function hslToHex(h, s, l) {
    const { r, g, b } = hslToRgb(mod360(h), clamp(s, 0, 100), clamp(l, 0, 100));
    return rgbToHex(r, g, b);
  }
  function relativeLuminance(hex) {
    const { r, g, b } = hexToRgb(hex);
    const f = (v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  }
  /* readable label on any background */
  function inkFor(hex) { return relativeLuminance(hex) > 0.4 ? '#171A24' : '#F4F2EE'; }

  /* ---------- persistent state (localStorage) ---------- */
  const LS_COLOR = 'tintwell.color';
  const LS_PAL = 'tintwell.palettes';
  const SEED = [
    { id: 'seed-1', name: 'Sunset Tin', colors: ['#FF5A5F', '#FFB020', '#F4F2EE', '#171A24'] },
    { id: 'seed-2', name: 'Lagoon Mix', colors: ['#0F9D8F', '#0F6F8F', '#3FA87F', '#F4F2EE'] },
    { id: 'seed-3', name: 'Berry Stain', colors: ['#D6456F', '#8F0F9D', '#FFB020', '#171A24'] },
  ];

  const store = {
    getColor() {
      try { return localStorage.getItem(LS_COLOR) || '#0F9D8F'; } catch (e) { return '#0F9D8F'; }
    },
    setColor(hex) {
      try { localStorage.setItem(LS_COLOR, hex); } catch (e) { /* private mode */ }
    },
    getPalettes() {
      try {
        const raw = localStorage.getItem(LS_PAL);
        if (raw === null) { localStorage.setItem(LS_PAL, JSON.stringify(SEED)); return SEED.slice(); }
        const list = JSON.parse(raw);
        return Array.isArray(list) ? list : [];
      } catch (e) { return []; }
    },
    savePalettes(list) {
      try { localStorage.setItem(LS_PAL, JSON.stringify(list)); } catch (e) { /* private mode */ }
    },
    addPalette(colors, name) {
      const list = this.getPalettes();
      const p = {
        id: 'p' + Date.now(),
        name: name || 'Palette ' + new Date().toLocaleTimeString(),
        colors: colors.slice(0, 6),
      };
      list.unshift(p);
      this.savePalettes(list);
      return p;
    },
    deletePalette(id) { this.savePalettes(this.getPalettes().filter((p) => p.id !== id)); },
    clearAll() { this.savePalettes([]); },
  };

  /* ---------- clipboard + toast ---------- */
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) { /* noop */ }
    document.body.removeChild(ta);
    return Promise.resolve();
  }

  let toastTimer = null;
  function toast(msg) {
    let t = $('#tintwell-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'tintwell-toast';
      t.className = 'toast';
      t.setAttribute('role', 'status');
      document.body.appendChild(t);
    }
    t.textContent = msg;
    /* force reflow so repeated toasts re-animate */
    void t.offsetWidth;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 1600);
  }

  function flash(el) {
    if (!el) return;
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
    el.addEventListener('animationend', () => el.classList.remove('flash'), { once: true });
  }

  function copyValue(text, label, flashEl) {
    copyText(text).then(() => {
      toast((label ? label + ' copied: ' : 'Copied ') + text);
      flash(flashEl);
    });
  }

  /* ============================================================
     PAGE 1 — PICKER (index.html)
     ============================================================ */
  function initPicker() {
    const start = hexToRgb(store.getColor());
    const startHsl = rgbToHsl(start.r, start.g, start.b);
    const state = {
      r: start.r, g: start.g, b: start.b,
      h: startHsl.h, s: startHsl.s, l: startHsl.l,
    };

    const swatch = $('#swatch');
    const swatchHex = $('#swatchHex');
    const heroHex = $('#heroHex');
    const chipHex = $('#chipHex');
    const chipRgb = $('#chipRgb');
    const chipHsl = $('#chipHsl');
    const copyHexBtn = $('#copyHex');
    const copyRgbBtn = $('#copyRgb');
    const copyHslBtn = $('#copyHsl');
    const sliders = { r: $('#r'), g: $('#g'), b: $('#b'), h: $('#hue'), s: $('#sat'), l: $('#light') };
    const vals = { r: $('#vR'), g: $('#vG'), b: $('#vB'), h: $('#vH'), s: $('#vS'), l: $('#vL') };
    const wheel = $('#wheel');
    const hexInput = $('#hexInput');

    const HUE_TRACK = 'linear-gradient(90deg,#ff3b3b,#f5d53b,#3bf56e,#3bd0f5,#4b3bf5,#d13bf5,#ff3bd0,#ff3b3b)';

    function currentHex() { return rgbToHex(state.r, state.g, state.b); }
    function currentRgbText() { return state.r + ', ' + state.g + ', ' + state.b; }

    function render() {
      const hex = currentHex();

      swatch.style.background = hex;
      swatchHex.textContent = hex;
      swatchHex.style.color = inkFor(hex);
      if (heroHex) heroHex.textContent = hex;

      chipHex.textContent = hex;
      chipRgb.textContent = currentRgbText();
      chipHsl.textContent = state.h + ', ' + state.s + '%, ' + state.l + '%';

      sliders.r.value = state.r; sliders.g.value = state.g; sliders.b.value = state.b;
      sliders.h.value = state.h; sliders.s.value = state.s; sliders.l.value = state.l;
      vals.r.textContent = state.r; vals.g.textContent = state.g; vals.b.textContent = state.b;
      vals.h.textContent = state.h; vals.s.textContent = state.s; vals.l.textContent = state.l;

      /* live gradient tracks that mirror the current color */
      sliders.r.style.background = 'linear-gradient(90deg, rgb(0,' + state.g + ',' + state.b + '), rgb(255,' + state.g + ',' + state.b + '))';
      sliders.g.style.background = 'linear-gradient(90deg, rgb(' + state.r + ',0,' + state.b + '), rgb(' + state.r + ',255,' + state.b + '))';
      sliders.b.style.background = 'linear-gradient(90deg, rgb(' + state.r + ',' + state.g + ',0), rgb(' + state.r + ',' + state.g + ',255))';
      sliders.h.style.background = HUE_TRACK;
      sliders.s.style.background = 'linear-gradient(90deg, hsl(' + state.h + ',0%,' + state.l + '%), hsl(' + state.h + ',100%,' + state.l + '%))';
      sliders.l.style.background = 'linear-gradient(90deg, hsl(' + state.h + ',' + state.s + '%,0%), hsl(' + state.h + ',' + state.s + '%,100%))';

      wheel.value = hex.toLowerCase();
      hexInput.value = hex;

      store.setColor(hex);
    }

    function syncFromRgb() {
      const { h, s, l } = rgbToHsl(state.r, state.g, state.b);
      state.h = h; state.s = s; state.l = l;
    }
    function syncFromHsl() {
      const { r, g, b } = hslToRgb(state.h, state.s, state.l);
      state.r = r; state.g = g; state.b = b;
    }

    /* sliders */
    sliders.r.addEventListener('input', () => { state.r = +sliders.r.value; syncFromRgb(); render(); });
    sliders.g.addEventListener('input', () => { state.g = +sliders.g.value; syncFromRgb(); render(); });
    sliders.b.addEventListener('input', () => { state.b = +sliders.b.value; syncFromRgb(); render(); });
    sliders.h.addEventListener('input', () => { state.h = +sliders.h.value; syncFromHsl(); render(); });
    sliders.s.addEventListener('input', () => { state.s = +sliders.s.value; syncFromHsl(); render(); });
    sliders.l.addEventListener('input', () => { state.l = +sliders.l.value; syncFromHsl(); render(); });

    /* wheel + typed hex */
    wheel.addEventListener('input', () => {
      const { r, g, b } = hexToRgb(wheel.value);
      state.r = r; state.g = g; state.b = b;
      syncFromRgb(); render();
    });
    hexInput.addEventListener('change', () => {
      let v = hexInput.value.trim();
      if (!v.startsWith('#')) v = '#' + v;
      if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) {
        const { r, g, b } = hexToRgb(v);
        state.r = r; state.g = g; state.b = b;
        syncFromRgb(); render();
      } else {
        toast('That is not a valid hex value');
        hexInput.value = currentHex();
      }
    });

    /* copy actions */
    swatch.addEventListener('click', () => copyValue(currentHex(), 'HEX', swatch));
    copyHexBtn.addEventListener('click', () => copyValue(currentHex(), 'HEX', chipHex));
    copyRgbBtn.addEventListener('click', () => copyValue(currentRgbText(), 'RGB', chipRgb));
    copyHslBtn.addEventListener('click', () => copyValue(state.h + ', ' + state.s + '%, ' + state.l + '%', 'HSL', chipHsl));

    render();
  }

  /* ============================================================
     PAGE 2 — HARMONIES (harmony.html)
     ============================================================ */
  const SCHEMES = [
    {
      id: 'complementary',
      label: 'Complementary',
      colors: (b) => [
        { h: b.h, s: b.s, l: b.l },
        { h: b.h + 180, s: b.s, l: b.l },
        { h: b.h, s: b.s, l: clamp(b.l + 18, 0, 100) },
        { h: b.h + 180, s: b.s, l: clamp(b.l - 18, 0, 100) },
        { h: b.h, s: Math.round(b.s * 0.35), l: 16 },
      ],
    },
    {
      id: 'analogous',
      label: 'Analogous',
      colors: (b) => [-60, -30, 0, 30, 60].map((d) => ({ h: b.h + d, s: b.s, l: b.l })),
    },
    {
      id: 'triadic',
      label: 'Triadic',
      colors: (b) => [
        { h: b.h, s: b.s, l: b.l },
        { h: b.h + 120, s: b.s, l: b.l },
        { h: b.h + 240, s: b.s, l: b.l },
        { h: b.h, s: Math.round(b.s * 0.5), l: clamp(b.l + 22, 0, 100) },
        { h: b.h, s: Math.round(b.s * 0.5), l: clamp(b.l - 22, 0, 100) },
      ],
    },
    {
      id: 'split',
      label: 'Split-complementary',
      colors: (b) => [
        { h: b.h, s: b.s, l: b.l },
        { h: b.h + 150, s: b.s, l: b.l },
        { h: b.h + 210, s: b.s, l: b.l },
        { h: b.h + 150, s: Math.round(b.s * 0.5), l: clamp(b.l + 20, 0, 100) },
        { h: b.h + 210, s: Math.round(b.s * 0.5), l: clamp(b.l - 20, 0, 100) },
      ],
    },
    {
      id: 'tetradic',
      label: 'Tetradic',
      colors: (b) => [
        { h: b.h, s: b.s, l: b.l },
        { h: b.h + 90, s: b.s, l: b.l },
        { h: b.h + 180, s: b.s, l: b.l },
        { h: b.h + 270, s: b.s, l: b.l },
        { h: b.h + 90, s: Math.round(b.s * 0.5), l: clamp(b.l + 22, 0, 100) },
      ],
    },
  ];

  function initHarmony() {
    const seed = hexToRgb(store.getColor());
    const seedHsl = rgbToHsl(seed.r, seed.g, seed.b);
    const base = { h: seedHsl.h, s: seedHsl.s, l: seedHsl.l };

    const baseSwatch = $('#baseSwatch');
    const baseHex = $('#baseHex');
    const heroBase = $('#heroBase');
    const wheel = $('#baseWheel');
    const randomBtn = $('#randomBtn');
    const container = $('#schemes');

    function currentHex() { return hslToHex(base.h, base.s, base.l); }

    function renderBase() {
      const hex = currentHex();
      baseSwatch.style.background = hex;
      baseHex.textContent = hex;
      baseHex.style.color = inkFor(hex);
      heroBase.textContent = hex;
      wheel.value = hex.toLowerCase();
      store.setColor(hex);
    }

    function renderSchemes() {
      container.innerHTML = '';
      SCHEMES.forEach((scheme) => {
        const row = document.createElement('div');
        row.className = 'scheme';

        const head = document.createElement('div');
        head.className = 'scheme-head';
        const name = document.createElement('span');
        name.className = 'scheme-name';
        name.textContent = scheme.label;
        const save = document.createElement('button');
        save.className = 'scheme-save';
        save.type = 'button';
        save.textContent = 'save as tray';
        head.appendChild(name);
        head.appendChild(save);

        const strip = document.createElement('div');
        strip.className = 'scheme-strip';

        const hexes = scheme.colors(base).map((c) => hslToHex(c.h, c.s, c.l));
        hexes.forEach((hex) => {
          const cell = document.createElement('div');
          cell.className = 'cell';
          const tone = document.createElement('div');
          tone.className = 'tone';
          tone.style.background = hex;
          tone.title = 'Click to copy ' + hex;
          const label = document.createElement('span');
          label.className = 'tone-hex';
          label.textContent = hex;
          tone.addEventListener('click', () => copyValue(hex, null, tone));
          cell.appendChild(tone);
          cell.appendChild(label);
          strip.appendChild(cell);
        });

        save.addEventListener('click', () => {
          store.addPalette(hexes, scheme.label + ' · ' + Math.round(mod360(base.h)) + '°');
          save.textContent = 'saved ✓';
          save.classList.add('saved');
          toast(scheme.label + ' saved to Palettes');
          setTimeout(() => { save.textContent = 'save as tray'; save.classList.remove('saved'); }, 1600);
        });

        row.appendChild(head);
        row.appendChild(strip);
        container.appendChild(row);
      });
    }

    baseSwatch.addEventListener('click', () => copyValue(currentHex(), 'HEX', baseSwatch));

    wheel.addEventListener('input', () => {
      const { r, g, b } = hexToRgb(wheel.value);
      const hsl = rgbToHsl(r, g, b);
      base.h = hsl.h; base.s = hsl.s; base.l = hsl.l;
      renderBase(); renderSchemes();
    });

    randomBtn.addEventListener('click', () => {
      base.h = Math.floor(Math.random() * 360);
      base.s = 30 + Math.floor(Math.random() * 61);   /* 30–90 */
      base.l = 25 + Math.floor(Math.random() * 46);   /* 25–70 */
      renderBase(); renderSchemes();
      toast('Rolled a new base color');
    });

    renderBase();
    renderSchemes();
  }

  /* ============================================================
     PAGE 3 — PALETTES (palettes.html)
     ============================================================ */
  function initPalettes() {
    const grid = $('#paletteGrid');
    const count = $('#palCount');
    const clearBtn = $('#clearAll');

    function render() {
      const list = store.getPalettes();
      count.textContent = list.length + ' saved';

      grid.innerHTML = '';
      if (!list.length) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = 'No trays yet — mix a scheme on the Harmonies page and hit “save as tray”.';
        grid.appendChild(empty);
        return;
      }

      list.forEach((p) => {
        const card = document.createElement('div');
        card.className = 'pal-card';

        const strip = document.createElement('div');
        strip.className = 'pal-strip';
        p.colors.forEach((hex) => {
          const s = document.createElement('span');
          s.style.background = hex;
          s.title = hex + ' — click to copy';
          s.addEventListener('click', () => copyValue(hex));
          strip.appendChild(s);
        });

        const meta = document.createElement('div');
        meta.className = 'pal-meta';

        const name = document.createElement('span');
        name.className = 'pal-name';
        name.textContent = p.name;
        name.title = p.name;

        const actions = document.createElement('div');
        actions.className = 'pal-actions';

        const restore = document.createElement('button');
        restore.className = 'restore';
        restore.type = 'button';
        restore.textContent = 'restore';
        restore.addEventListener('click', () => {
          store.setColor(p.colors[0]);
          toast(p.name + ' loaded into the picker');
          setTimeout(() => { window.location.href = 'index.html'; }, 450);
        });

        const del = document.createElement('button');
        del.className = 'del';
        del.type = 'button';
        del.textContent = 'del';
        del.addEventListener('click', () => {
          store.deletePalette(p.id);
          render();
          toast('Deleted “' + p.name + '”');
        });

        actions.appendChild(restore);
        actions.appendChild(del);
        meta.appendChild(name);
        meta.appendChild(actions);
        card.appendChild(strip);
        card.appendChild(meta);
        grid.appendChild(card);
      });
    }

    clearBtn.addEventListener('click', () => {
      const list = store.getPalettes();
      if (!list.length) { toast('Nothing to clear'); return; }
      if (window.confirm('Clear all ' + list.length + ' saved palettes?')) {
        store.clearAll();
        render();
        toast('All palettes cleared');
      }
    });

    render();
  }

  /* ---------- boot per page ---------- */
  const page = document.body.getAttribute('data-page');
  if (page === 'picker') initPicker();
  else if (page === 'harmony') initHarmony();
  else if (page === 'palettes') initPalettes();
})();
