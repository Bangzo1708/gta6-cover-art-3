// Vice Cover Studio — shared state: templates, colour grades, export sizes and the
// default cover. Everything the renderer needs lives here so the page (main.js), the
// screenshot scenes (shots.js) and the drawing engine (cover.js) all agree on one shape.
//
// A cover state is:
//   {
//     template: 'vice-grid' | 'sunset-strip' | 'neon-nights',
//     grade:    'sunset' | 'neon' | 'gold' | 'noir',
//     size:     '1080x1080' | '1080x1350' | '1920x1080',
//     title:    string,            // big poster lettering, uppercased when drawn
//     subtitle: string,            // letterspaced line under the title
//     tagline:  string,            // small line tucked into the hero corner
//     effects:  { halftone: bool, vignette: bool, grain: bool, gutters: bool },
//     panels:   [ { photo, zoom, ox, oy } x 4 ]   // photo: an <img>/canvas or null
//   }
// Panel photos are filled in by the page: the two bundled samples first, then the
// person's own uploads. zoom is a multiplier on the cover-fit scale (1 = fit);
// ox / oy shift the photo inside its panel as a fraction of the panel (-0.5 .. 0.5).

export const SIZES = {
  '1080x1080': { w: 1080, h: 1080, label: 'Square · 1080 × 1080' },
  '1080x1350': { w: 1080, h: 1350, label: 'Portrait · 1080 × 1350' },
  '1920x1080': { w: 1920, h: 1080, label: 'Wide · 1920 × 1080' },
};

export const TEMPLATES = {
  'vice-grid': {
    label: 'Vice Grid',
    hint: 'Classic key-art grid: one big hero, three supporting panels.',
    titleBand: 0.2, // fraction of the height taken by the lettering band at the foot
  },
  'sunset-strip': {
    label: 'Sunset Strip',
    hint: 'Tall poster: hero on top, a strip of moments below.',
    titleBand: 0.15,
  },
  'neon-nights': {
    label: 'Neon Nights',
    hint: 'Diagonal slices, neon dividers, made for wide covers.',
    titleBand: 0.18,
  },
};

export const GRADES = {
  sunset: { label: 'Vice Sunset', swatch: 'linear-gradient(135deg,#ff5e62,#ff9966 55%,#c2188b)' },
  neon: { label: 'Neon Nights', swatch: 'linear-gradient(135deg,#ff2ea6,#7b2fff 55%,#00e5ff)' },
  gold: { label: 'Palm Gold', swatch: 'linear-gradient(135deg,#ffd166,#f4842b 55%,#0f766e)' },
  noir: { label: 'Noir', swatch: 'linear-gradient(135deg,#e8e8e8,#5a5a5a 55%,#111111)' },
};

/** A fresh panel slot: no photo yet, fit at 1:1 zoom, centred. */
export function blankPanel() {
  return { photo: null, zoom: 1, ox: 0, oy: 0 };
}

/** The cover the page opens with: Vice Grid, Vice Sunset grade, square export. */
export function defaultState() {
  return {
    template: 'vice-grid',
    grade: 'sunset',
    size: '1080x1080',
    title: 'VICE CITY',
    subtitle: 'SUNSET HEIST',
    tagline: 'A VICE CITY STORY',
    effects: { halftone: true, vignette: true, grain: true, gutters: true },
    panels: [blankPanel(), blankPanel(), blankPanel(), blankPanel()],
  };
}

/** Shallow-clones a state (panels are shared by reference — photos are immutable). */
export function cloneState(state) {
  return {
    ...state,
    effects: { ...state.effects },
    panels: state.panels.map((p) => ({ ...p })),
  };
}
