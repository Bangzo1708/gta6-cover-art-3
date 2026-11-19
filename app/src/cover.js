// Vice Cover Studio — the drawing engine. One function, drawCover, turns a cover
// state (see state.js) into poster art on any canvas at any size: it lays the panels
// out for the chosen template, draws each photo cover-fit with its zoom and offset,
// grades the whole thing in a Vice City sunset / neon / gold / noir wash, then sets
// the bold poster lettering on the foot band. No network, no fonts to fetch: the
// lettering uses the system sans stack at weight 900, the art is pure canvas.
//
// Determinism: the grain pass uses a fixed-seed generator (mulberry32), so the same
// state always paints the same pixels — screenshots and exports are reproducible.

import { SIZES, TEMPLATES } from './state.js';

const INK = '#14081d'; // the near-black plum behind the panels and lettering
const PAPER = '#fff4e6'; // warm off-white for gutters and lettering
const ACCENT = '#ff2ea6'; // neon pink, the grade's highlight colour

/** A tiny seeded generator so the grain pass is identical on every run. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Panel rectangles for a template, as fractions of the content area (the canvas
 * minus the lettering band at the foot). Each entry is { x, y, w, h, slant } where
 * slant shears the panel's top edge right by that fraction of the width (0 = square).
 */
function panelRects(template, contentH) {
  if (template === 'sunset-strip') {
    return [
      { x: 0, y: 0, w: 1, h: 0.52, slant: 0 },
      { x: 0, y: 0.52, w: 0.5, h: 0.2, slant: 0 },
      { x: 0.5, y: 0.52, w: 0.5, h: 0.2, slant: 0 },
      { x: 0, y: 0.72, w: 1, h: 0.28, slant: 0 },
    ];
  }
  if (template === 'neon-nights') {
    // Four diagonal slices across the content area; the slant is what makes it neon.
    const slant = 0.055;
    return [0, 1, 2, 3].map((i) => ({ x: i / 4, y: 0, w: 1 / 4, h: 1, slant }));
  }
  // vice-grid: the classic key-art grid.
  return [
    { x: 0, y: 0, w: 0.56, h: 1, slant: 0 },
    { x: 0.56, y: 0, w: 0.22, h: 0.5, slant: 0 },
    { x: 0.78, y: 0, w: 0.22, h: 0.5, slant: 0 },
    { x: 0.56, y: 0.5, w: 0.44, h: 0.5, slant: 0 },
  ];
}

/** The pixel rect of one fractional panel, inset by half a gutter on each side. */
function rectOf(frac, W, contentH, gutter) {
  return {
    x: frac.x * W + gutter / 2,
    y: frac.y * contentH + gutter / 2,
    w: frac.w * W - gutter,
    h: frac.h * contentH - gutter,
    slant: (frac.slant || 0) * W,
  };
}

/** Clips the context to a panel rect (a parallelogram when slant is set). */
function clipPanel(ctx, r) {
  ctx.beginPath();
  ctx.moveTo(r.x + r.slant, r.y);
  ctx.lineTo(r.x + r.w + r.slant, r.y);
  ctx.lineTo(r.x + r.w, r.y + r.h);
  ctx.lineTo(r.x, r.y + r.h);
  ctx.closePath();
  ctx.clip();
}

/** Draws one photo cover-fit inside rect r, honouring zoom and ox/oy offsets. */
function drawPhoto(ctx, photo, r, panel) {
  const iw = photo.naturalWidth || photo.width;
  const ih = photo.naturalHeight || photo.height;
  if (!iw || !ih) return;
  const scale = Math.max(r.w / iw, r.h / ih) * panel.zoom;
  const pw = iw * scale;
  const ph = ih * scale;
  const cx = r.x + r.w / 2 + panel.ox * r.w;
  const cy = r.y + r.h / 2 + panel.oy * r.h;
  ctx.drawImage(photo, cx - pw / 2, cy - ph / 2, pw, ph);
}

/** A placeholder panel when no photo is loaded yet: dusk gradient, sun, label. */
function drawPlaceholder(ctx, r, index) {
  const g = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
  g.addColorStop(0, '#3b1d5a');
  g.addColorStop(0.55, '#c2188b');
  g.addColorStop(1, '#ff7a3d');
  ctx.fillStyle = g;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  const sunR = Math.min(r.w, r.h) * 0.22;
  ctx.fillStyle = '#ffd166';
  ctx.beginPath();
  ctx.arc(r.x + r.w / 2, r.y + r.h * 0.42, sunR, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = `700 ${Math.max(12, r.h * 0.055)}px "Noto Sans","DejaVu Sans",sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(`ADD PHOTO ${index + 1}`, r.x + r.w / 2, r.y + r.h * 0.82);
}

/** The colour grade: a wash over the whole cover, per grade name. */
function applyGrade(ctx, W, H, grade, contentH) {
  if (grade === 'noir') {
    // Noir is graded at draw time (grayscale filter on the photos); here just a
    // cool contrast wash and a hard vignette-friendly base.
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(255,255,255,0.05)');
    g.addColorStop(1, 'rgba(0,0,0,0.28)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    return;
  }
  const washes = {
    sunset: [
      ['overlay', [[0, 'rgba(255,94,98,0.38)'], [0.6, 'rgba(255,150,60,0.16)'], [1, 'rgba(194,24,139,0.42)']], 'vertical'],
      ['source-over', [[0, 'rgba(255,120,40,0.14)'], [1, 'rgba(120,10,90,0.14)']], 'vertical'],
    ],
    neon: [
      ['overlay', [[0, 'rgba(255,46,166,0.34)'], [0.5, 'rgba(123,47,255,0.16)'], [1, 'rgba(0,229,255,0.30)']], 'diagonal'],
      ['source-over', [[0, 'rgba(0,229,255,0.06)'], [1, 'rgba(255,46,166,0.12)']], 'diagonal'],
    ],
    gold: [
      ['overlay', [[0, 'rgba(255,209,102,0.30)'], [0.55, 'rgba(244,132,43,0.14)'], [1, 'rgba(15,118,110,0.30)']], 'vertical'],
      ['source-over', [[0, 'rgba(255,209,102,0.08)'], [1, 'rgba(15,118,110,0.12)']], 'vertical'],
    ],
  };
  const layers = washes[grade] || washes.sunset;
  for (const [composite, stops, dir] of layers) {
    const grad =
      dir === 'diagonal'
        ? ctx.createLinearGradient(0, 0, W, H)
        : ctx.createLinearGradient(0, 0, 0, H);
    for (const [at, colour] of stops) grad.addColorStop(at, colour);
    ctx.globalCompositeOperation = composite;
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, contentH);
    ctx.globalCompositeOperation = 'source-over';
  }
}

/** A halftone dot strip fading across the top of the lettering band. */
function drawHalftone(ctx, W, bandY, bandH) {
  const step = Math.max(10, W * 0.011);
  const rows = Math.floor(bandH / step);
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  for (let row = 0; row < rows; row++) {
    const y = bandY + row * step + step / 2;
    const fade = 1 - row / rows; // dots shrink as the band goes down
    for (let col = 0; col * step < W; col++) {
      const x = col * step + step / 2 + (row % 2 ? step / 2 : 0);
      const r = step * 0.22 * fade;
      if (r < 0.4) continue;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** Soft dark corners so the lettering band and panels sit in one poster. */
function drawVignette(ctx, W, H) {
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.36, W / 2, H / 2, Math.max(W, H) * 0.75);
  g.addColorStop(0, 'rgba(10,4,18,0)');
  g.addColorStop(1, 'rgba(10,4,18,0.42)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

/** Film grain: 900 seeded specks, identical on every render of the same cover. */
function drawGrain(ctx, W, H) {
  const rand = mulberry32(20261119);
  for (let i = 0; i < 900; i++) {
    const x = rand() * W;
    const y = rand() * H;
    ctx.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
    ctx.fillRect(x, y, 1.6, 1.6);
  }
}

/** Fits a font size so `text` spans at most `maxW` at weight 900. */
function fitFont(ctx, text, maxW, start, family) {
  let size = start;
  ctx.font = `900 ${size}px ${family}`;
  while (ctx.measureText(text).width > maxW && size > 10) {
    size -= 2;
    ctx.font = `900 ${size}px ${family}`;
  }
  return size;
}

const LETTER_FAMILY = '"Noto Sans","DejaVu Sans",sans-serif';

/** The poster lettering on the foot band: gradient title, dark outline, subtitle. */
function drawLettering(ctx, state, W, H, bandY, bandH) {
  const title = (state.title || 'VICE CITY').trim().toUpperCase() || 'VICE CITY';
  const subtitle = (state.subtitle || '').trim().toUpperCase();
  // The band's own dusk: dark plum fading up into the panels.
  const band = ctx.createLinearGradient(0, bandY - bandH * 0.35, 0, H);
  band.addColorStop(0, 'rgba(20,8,29,0)');
  band.addColorStop(0.35, 'rgba(20,8,29,0.88)');
  band.addColorStop(1, 'rgba(20,8,29,1)');
  ctx.fillStyle = band;
  ctx.fillRect(0, bandY - bandH * 0.35, W, bandH * 1.35);

  const pad = W * 0.045;
  const maxW = W - pad * 2;
  const size = fitFont(ctx, title, maxW, bandH * 0.62, LETTER_FAMILY);
  const titleY = bandY + bandH * 0.62;
  const fill = ctx.createLinearGradient(0, titleY - size, 0, titleY + size * 0.15);
  fill.addColorStop(0, '#ffffff');
  fill.addColorStop(0.55, '#ffe9c4');
  fill.addColorStop(1, '#ffb347');
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(3, size * 0.09);
  ctx.shadowColor = 'rgba(255,46,166,0.55)';
  ctx.shadowBlur = size * 0.16;
  ctx.shadowOffsetY = size * 0.03;
  ctx.strokeText(title, pad, titleY);
  ctx.fillStyle = fill;
  ctx.fillText(title, pad, titleY);
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  if (subtitle) {
    const subSize = Math.max(12, bandH * 0.17);
    ctx.font = `700 ${subSize}px ${LETTER_FAMILY}`;
    try {
      ctx.letterSpacing = `${Math.max(2, subSize * 0.32)}px`;
    } catch {
      /* older engines ignore letterSpacing; the subtitle still reads fine */
    }
    ctx.fillStyle = '#ff7ad9';
    ctx.fillText(subtitle, pad, bandY + bandH * 0.9);
    try {
      ctx.letterSpacing = '0px';
    } catch {
      /* reset where supported */
    }
  }
  if (state.tagline) {
    const tagSize = Math.max(10, bandH * 0.11);
    ctx.font = `700 ${tagSize}px ${LETTER_FAMILY}`;
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,244,230,0.75)';
    ctx.fillText(state.tagline.trim().toUpperCase(), W - pad, bandY + bandH * 0.16);
    ctx.textAlign = 'left';
  }
}

/**
 * Paints a whole cover onto `canvas` (its width/height are set from state.size).
 * Photos are drawn cover-fit per panel; empty panels get a dusk placeholder.
 */
export function drawCover(canvas, state) {
  const size = SIZES[state.size] || SIZES['1080x1080'];
  const W = size.w;
  const H = size.h;
  if (canvas.width !== W || canvas.height !== H) {
    canvas.width = W;
    canvas.height = H;
  }
  const ctx = canvas.getContext('2d');
  const template = TEMPLATES[state.template] || TEMPLATES['vice-grid'];
  const bandH = H * template.titleBand;
  const bandY = H - bandH;
  const contentH = bandY;
  const gutter = state.effects.gutters ? Math.max(3, W * 0.005) : 0;

  ctx.fillStyle = state.effects.gutters ? PAPER : INK;
  ctx.fillRect(0, 0, W, H);
  // Diagonal slices leave triangular gaps at the content edges; fill those
  // with ink so they read as shadow, not as a white rendering slip.
  if (state.template === 'neon-nights') {
    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, W, contentH);
  }

  const fracs = panelRects(state.template, contentH);
  const rects = fracs.map((f) => rectOf(f, W, contentH, gutter));
  rects.forEach((r, i) => {
    const panel = state.panels[i] || { photo: null, zoom: 1, ox: 0, oy: 0 };
    ctx.save();
    clipPanel(ctx, r);
    if (state.grade === 'noir') ctx.filter = 'grayscale(1) contrast(1.12) brightness(1.06)';
    if (panel.photo) drawPhoto(ctx, panel.photo, r, panel);
    else drawPlaceholder(ctx, r, i);
    ctx.filter = 'none';
    ctx.restore();
    if (state.effects.gutters) {
      ctx.save();
      clipPanel(ctx, r);
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = Math.max(2, W * 0.002);
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.restore();
    }
  });

  // A thin neon divider under diagonal panels so the slices read as slices.
  if (state.template === 'neon-nights') {
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = Math.max(2, W * 0.003);
    ctx.shadowColor = ACCENT;
    ctx.shadowBlur = W * 0.012;
    rects.forEach((r) => {
      ctx.beginPath();
      ctx.moveTo(r.x + r.slant, r.y);
      ctx.lineTo(r.x, r.y + r.h);
      ctx.stroke();
    });
    ctx.shadowBlur = 0;
  }

  applyGrade(ctx, W, H, state.grade, contentH);
  if (state.effects.halftone) drawHalftone(ctx, W, bandY, bandH);
  if (state.effects.vignette) drawVignette(ctx, W, H);
  if (state.effects.grain) drawGrain(ctx, W, H);
  drawLettering(ctx, state, W, H, bandY, bandH);
}

/** Renders a state onto a fresh offscreen canvas and returns it (for export). */
export function renderCover(state) {
  const canvas = document.createElement('canvas');
  drawCover(canvas, state);
  return canvas;
}

/**
 * The four panel rects in canvas pixels for a state (same math drawCover uses),
 * so the page can hit-test a click or a drag against a panel.
 */
export function panelPixelRects(state) {
  const size = SIZES[state.size] || SIZES['1080x1080'];
  const W = size.w;
  const H = size.h;
  const template = TEMPLATES[state.template] || TEMPLATES['vice-grid'];
  const contentH = H - H * template.titleBand;
  const gutter = state.effects.gutters ? Math.max(3, W * 0.005) : 0;
  return panelRects(state.template, contentH).map((f) => rectOf(f, W, contentH, gutter));
}
