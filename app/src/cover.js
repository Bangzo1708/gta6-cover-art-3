// Vice Cover Studio — the cover renderer. Draws the multi-panel GTA-style
// poster onto any 2D canvas: panels per template, a colour grade wash, bold
// gradient lettering, and the halftone / vignette / grain effects. Every size
// is relative to the canvas, so the same code draws the preview and the
// full-resolution PNG export.

import { clamp, gradeById, mulberry32, templateById } from './state.js';

/** Gutter between panels, as a share of the poster's width. */
const GUTTER_SHARE = 0.012;

/** Draws the whole cover for `state` onto `canvas`, using `images` — an
 *  array of four loaded images (or null) in photo-slot order. */
export function drawCover(canvas, state, images) {
  const ctx = canvas.getContext('2d');
  renderCover(ctx, state, images, canvas.width, canvas.height);
}

/** Same as drawCover, but onto an existing context at an explicit size. */
export function renderCover(ctx, state, images, w, h) {
  const grade = gradeById(state.grade);
  const template = templateById(state.template);
  const g = Math.max(2, Math.round(w * GUTTER_SHARE));

  // Dark backing: the gutters and the lettering band sit on it.
  ctx.save();
  ctx.fillStyle = grade.band;
  ctx.fillRect(0, 0, w, h);

  const layout = layoutPanels(template.id, w, h, g);
  for (let i = 0; i < layout.panels.length; i++) {
    const rect = layout.panels[i];
    const slot = state.panelPhoto[i] ?? i;
    const photo = state.photos[slot];
    const image = images[slot] ?? null;
    const crop = state.panelCrop[i] ?? { fx: 0.5, fy: 0.5 };
    if (template.id === 'sunset-strip') {
      drawDiagonalPanel(ctx, image, photo, crop, rect, g);
    } else {
      ctx.save();
      ctx.beginPath();
      ctx.rect(rect.x, rect.y, rect.w, rect.h);
      ctx.clip();
      drawPhotoInto(ctx, image, photo, crop, rect);
      ctx.restore();
      if (template.id === 'neon-nights') drawNeonFrame(ctx, grade, rect, w);
    }
  }

  paintGradeWash(ctx, grade, w, h);
  paintTitleBand(ctx, state, grade, layout.band, w, h);
  if (state.effects.halftone) paintHalftone(ctx, state, layout.band, w, h);
  if (state.effects.vignette) paintVignette(ctx, grade, w, h);
  if (state.effects.grain) paintGrain(ctx, state.effects.grainSeed, w, h);
  ctx.restore();
}

/** Panel rectangles and the title band for each template. */
export function layoutPanels(templateId, w, h, g) {
  if (templateId === 'sunset-strip') {
    const bandH = Math.round(h * 0.2);
    const regionH = h - bandH;
    const stripH = (regionH - 3 * g) / 4;
    const panels = [];
    for (let i = 0; i < 4; i++) {
      panels.push({ x: 0, y: i * (stripH + g), w, h: stripH, slant: w * 0.07 });
    }
    return { panels, band: { x: 0, y: regionH, w, h: bandH } };
  }
  if (templateId === 'neon-nights') {
    const bandH = Math.round(h * 0.24);
    const regionY = bandH;
    const regionH = h - bandH;
    const panelW = (w - 3 * g) / 4;
    const panels = [];
    for (let i = 0; i < 4; i++) {
      panels.push({ x: i * (panelW + g), y: regionY, w: panelW, h: regionH });
    }
    return { panels, band: { x: 0, y: 0, w, h: bandH } };
  }
  // vice-grid: hero panel left, three stacked panels right, title band below.
  const bandH = Math.round(h * 0.26);
  const regionH = h - bandH;
  const heroW = Math.round(w * 0.62);
  const colX = heroW + g;
  const colW = w - colX;
  const sideH = (regionH - 2 * g) / 3;
  return {
    panels: [
      { x: 0, y: 0, w: heroW, h: regionH },
      { x: colX, y: 0, w: colW, h: sideH },
      { x: colX, y: sideH + g, w: colW, h: sideH },
      { x: colX, y: 2 * (sideH + g), w: colW, h: sideH },
    ],
    band: { x: 0, y: regionH, w, h: bandH },
  };
}

/** Draws one photo into a rectangular panel, cover-fit, with the slot's zoom
 *  and the panel's focal point deciding which part of the photo shows. */
export function drawPhotoInto(ctx, image, photo, crop, rect) {
  if (!image) {
    // Empty slot: a flat placeholder with a dashed frame and a label.
    ctx.fillStyle = '#241a33';
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = Math.max(1, rect.w * 0.004);
    ctx.setLineDash([rect.w * 0.02, rect.w * 0.015]);
    ctx.strokeRect(rect.x + 6, rect.y + 6, rect.w - 12, rect.h - 12);
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = `700 ${Math.max(12, rect.w * 0.045)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ADD PHOTO', rect.x + rect.w / 2, rect.y + rect.h / 2);
    return;
  }
  const iw = image.naturalWidth;
  const ih = image.naturalHeight;
  const zoom = photo?.zoom ?? 1;
  const scale = Math.max(rect.w / iw, rect.h / ih) * zoom;
  const dw = iw * scale;
  const dh = ih * scale;
  const fx = clamp(crop?.fx ?? 0.5, 0, 1);
  const fy = clamp(crop?.fy ?? 0.5, 0, 1);
  const dx = rect.x + (rect.w - dw) * fx;
  const dy = rect.y + (rect.h - dh) * fy;
  ctx.drawImage(image, dx, dy, dw, dh);
}

/** A diagonal comic strip: the panel is a leaning parallelogram, so the
 *  photo is clipped to the slant and the strips read like a poster. */
function drawDiagonalPanel(ctx, image, photo, crop, rect, g) {
  const s = rect.slant ?? 0;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(rect.x, rect.y + s);
  ctx.lineTo(rect.x + rect.w, rect.y);
  ctx.lineTo(rect.x + rect.w, rect.y + rect.h);
  ctx.lineTo(rect.x, rect.y + rect.h + s);
  ctx.closePath();
  ctx.clip();
  drawPhotoInto(ctx, image, photo, crop, {
    x: rect.x,
    y: rect.y - s / 2,
    w: rect.w,
    h: rect.h + s,
  });
  ctx.restore();
}

/** Neon frame around a panel: a bright stroke with a soft outer glow. */
function drawNeonFrame(ctx, grade, rect, w) {
  ctx.save();
  ctx.strokeStyle = grade.titleBottom;
  ctx.lineWidth = Math.max(2, w * 0.004);
  ctx.shadowColor = grade.glow;
  ctx.shadowBlur = w * 0.02;
  ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  ctx.restore();
}

/** The grade wash: a top-to-bottom tint plus a warm or cool cast that
 *  unifies the panels into one sunset or neon mood. */
function paintGradeWash(ctx, grade, w, h) {
  const wash = ctx.createLinearGradient(0, 0, 0, h);
  wash.addColorStop(0, grade.washTop);
  wash.addColorStop(0.55, grade.washMid);
  wash.addColorStop(1, grade.washBottom);
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, w, h);
}

/** The lettering band: a solid band, a glowing accent rule, the big title
 *  in a gradient with a dark outline and glow, and the subtitle beneath it. */
function paintTitleBand(ctx, state, grade, band, w, h) {
  ctx.save();
  ctx.fillStyle = grade.band;
  ctx.fillRect(band.x, band.y, band.w, band.h);
  ctx.fillStyle = grade.titleBottom;
  ctx.fillRect(band.x, band.y, band.w, Math.max(2, h * 0.004));

  const title = (state.title || 'UNTITLED').trim().toUpperCase();
  const subtitle = (state.subtitle || '').trim().toUpperCase();
  const cx = band.x + band.w / 2;

  // Big title, shrunk until it fits the band with room to spare.
  let size = band.h * (subtitle ? 0.46 : 0.6);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const setTitleFont = (s) => {
    ctx.font = `900 ${s}px system-ui, "Arial Black", sans-serif`;
  };
  setTitleFont(size);
  while (ctx.measureText(title).width > band.w * 0.92 && size > 10) {
    size -= 2;
    setTitleFont(size);
  }
  const titleY = band.y + band.h * (subtitle ? 0.36 : 0.52);
  const grad = ctx.createLinearGradient(0, titleY - size / 2, 0, titleY + size / 2);
  grad.addColorStop(0, grade.titleTop);
  grad.addColorStop(1, grade.titleBottom);
  ctx.shadowColor = grade.glow;
  ctx.shadowBlur = size * 0.32;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(10, 4, 18, 0.9)';
  ctx.lineWidth = Math.max(2, size * 0.07);
  ctx.strokeText(title, cx, titleY);
  ctx.fillStyle = grad;
  ctx.fillText(title, cx, titleY);
  ctx.shadowBlur = 0;

  if (subtitle) {
    let subSize = Math.max(10, band.h * 0.13);
    ctx.font = `700 ${subSize}px system-ui, sans-serif`;
    try {
      ctx.letterSpacing = `${Math.max(2, subSize * 0.32)}px`;
    } catch {
      // letterSpacing is optional; the subtitle still draws without it.
    }
    ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
    ctx.fillText(subtitle, cx, band.y + band.h * 0.78);
    try {
      ctx.letterSpacing = '0px';
    } catch {
      // ignore
    }
  }

  // Small maker credit in the band's corner.
  ctx.font = `600 ${Math.max(9, h * 0.011)}px system-ui, sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.textAlign = 'right';
  ctx.fillText('VICE COVER STUDIO', band.x + band.w - w * 0.015, band.y + band.h - h * 0.02);
  ctx.restore();
}

/** Comic halftone: rows of dots over the lettering band, their size jittered
 *  by the seeded PRNG so the pattern is identical on every render. */
function paintHalftone(ctx, state, band, w, h) {
  const rand = mulberry32(state.effects.grainSeed * 31 + 5);
  const step = Math.max(10, w / 72);
  ctx.save();
  for (let y = band.y + step / 2; y < band.y + band.h; y += step) {
    for (let x = step / 2; x < band.x + band.w; x += step) {
      const r = step * (0.12 + rand() * 0.22);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = (Math.floor(y / step) + Math.floor(x / step)) % 2 === 0
        ? 'rgba(255,255,255,0.07)'
        : 'rgba(0,0,0,0.09)';
      ctx.fill();
    }
  }
  ctx.restore();
}

/** Vignette: darkens the corners so the eye stays on the panels. */
function paintVignette(ctx, grade, w, h) {
  const radius = Math.hypot(w, h) / 2;
  const vig = ctx.createRadialGradient(w / 2, h / 2, radius * 0.45, w / 2, h / 2, radius);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, grade.vignette);
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);
}

/** Film grain: deterministic per-pixel noise from the seeded PRNG. The
 *  amount is small on purpose — texture, not snow. */
function paintGrain(ctx, seed, w, h) {
  const rand = mulberry32(seed);
  const image = ctx.getImageData(0, 0, w, h);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const n = (rand() - 0.5) * 16;
    data[i] += n;
    data[i + 1] += n;
    data[i + 2] += n;
  }
  ctx.putImageData(image, 0, 0);
}
