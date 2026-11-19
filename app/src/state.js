// Vice Cover Studio — shared state: templates, colour grades, photo slots,
// lettering and effects. Plain data and small helpers only; no DOM here, so the
// cover renderer and the editor both read the same single source of truth.

/** The three cover templates. `aspect` is width / height of the poster. */
export const TEMPLATES = [
  {
    id: 'vice-grid',
    name: 'Vice Grid',
    blurb: 'Key-art grid: one hero panel, three supporting panels, bold title band.',
    aspect: 1,
  },
  {
    id: 'sunset-strip',
    name: 'Sunset Strip',
    blurb: 'Tall poster of diagonal comic strips with a halftone sunset.',
    aspect: 1080 / 1350,
  },
  {
    id: 'neon-nights',
    name: 'Neon Nights',
    blurb: 'Wide night poster: four neon-framed panels under a glowing title.',
    aspect: 16 / 9,
  },
];

/** The four colour grades. Each carries the wash gradient, the lettering
 *  gradient, the glow colour and the vignette tint it paints over the photos. */
export const GRADES = [
  {
    id: 'vice-sunset',
    name: 'Vice Sunset',
    washTop: 'rgba(255, 94, 98, 0.00)',
    washMid: 'rgba(255, 122, 89, 0.20)',
    washBottom: 'rgba(124, 38, 120, 0.55)',
    titleTop: '#ffd166',
    titleBottom: '#ff5e62',
    glow: 'rgba(255, 94, 98, 0.85)',
    vignette: 'rgba(43, 16, 56, 0.55)',
    band: '#2b1038',
  },
  {
    id: 'neon-nights',
    name: 'Neon Nights',
    washTop: 'rgba(34, 211, 238, 0.00)',
    washMid: 'rgba(168, 85, 247, 0.18)',
    washBottom: 'rgba(255, 46, 136, 0.50)',
    titleTop: '#67e8f9',
    titleBottom: '#ff2e88',
    glow: 'rgba(255, 46, 136, 0.9)',
    vignette: 'rgba(8, 6, 24, 0.6)',
    band: '#0a0618',
  },
  {
    id: 'palm-gold',
    name: 'Palm Gold',
    washTop: 'rgba(255, 214, 120, 0.00)',
    washMid: 'rgba(255, 170, 60, 0.22)',
    washBottom: 'rgba(20, 90, 80, 0.55)',
    titleTop: '#fff3b0',
    titleBottom: '#ff9e00',
    glow: 'rgba(255, 170, 60, 0.85)',
    vignette: 'rgba(10, 42, 38, 0.55)',
    band: '#0e2a26',
  },
  {
    id: 'noir',
    name: 'Noir',
    washTop: 'rgba(255, 255, 255, 0.00)',
    washMid: 'rgba(160, 160, 170, 0.16)',
    washBottom: 'rgba(0, 0, 0, 0.62)',
    titleTop: '#ffffff',
    titleBottom: '#c9c9d4',
    glow: 'rgba(255, 255, 255, 0.7)',
    vignette: 'rgba(0, 0, 0, 0.62)',
    band: '#101014',
  },
];

/** The three export sizes: the common post sizes the bounty asks for. */
export const EXPORT_SIZES = [
  { id: 'square', label: '1080 × 1080 · square post', w: 1080, h: 1080 },
  { id: 'portrait', label: '1080 × 1350 · portrait post', w: 1080, h: 1350 },
  { id: 'wide', label: '1920 × 1080 · wide post', w: 1920, h: 1080 },
];

/** The six editor steps, in the order a person walks them. */
export const STEPS = [
  { id: 'photos', label: '1 · Photos' },
  { id: 'template', label: '2 · Template' },
  { id: 'grade', label: '3 · Grade' },
  { id: 'lettering', label: '4 · Lettering' },
  { id: 'effects', label: '5 · Effects' },
  { id: 'size', label: '6 · Size & export' },
];

/** One photo slot: what image it holds and how it is cropped inside a panel.
 *  `zoom` 1 fills the panel; `fx`/`fy` 0..1 move the focal point. */
export function makePhotoSlot(src) {
  return { src, zoom: 1, fx: 0.5, fy: 0.5 };
}

/** A fresh editor state. Slots 0 and 1 start on the two kit sample photos;
 *  slots 2 and 3 reuse them with different crops until the user uploads. */
export function createDefaultState() {
  return {
    template: 'vice-grid',
    grade: 'vice-sunset',
    title: 'VICE CITY',
    subtitle: 'A STORY IN NEON',
    photos: [
      makePhotoSlot('samples/pier.jpg'),
      makePhotoSlot('samples/boulevard.jpg'),
      makePhotoSlot('samples/pier.jpg'),
      makePhotoSlot('samples/boulevard.jpg'),
    ],
    // Which photo slot fills each of the four panels, in panel order.
    panelPhoto: [0, 1, 2, 3],
    // Per-panel crop offsets, so the same photo can show a different part.
    panelCrop: [
      { fx: 0.5, fy: 0.42 },
      { fx: 0.5, fy: 0.5 },
      { fx: 0.32, fy: 0.55 },
      { fx: 0.68, fy: 0.45 },
    ],
    effects: { halftone: true, vignette: true, grain: true, grainSeed: 7 },
    size: 'square',
    step: 'photos',
  };
}

/** Deterministic PRNG (mulberry32): the grain and halftone never change
 *  between runs for the same seed, so an export is reproducible. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Clamps `v` into [lo, hi]. */
export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Looks a template up by id, falling back to the first one. */
export function templateById(id) {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
}

/** Looks a grade up by id, falling back to the first one. */
export function gradeById(id) {
  return GRADES.find((g) => g.id === id) ?? GRADES[0];
}

/** Looks an export size up by id, falling back to the first one. */
export function sizeById(id) {
  return EXPORT_SIZES.find((s) => s.id === id) ?? EXPORT_SIZES[0];
}
