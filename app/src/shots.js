// Vice Cover Studio — fixed screenshot scenes. `?shot=<name>` stages one exact
// cover or editor view, then sets window.__shotReady once it has painted, so a
// screenshot tool can wait on that flag instead of guessing. The scenes reuse the
// same state the editor edits — nothing here is drawn by a separate path.
//
//   cover            the Vice Grid cover alone, wide export, sunset grade
//   editor           the full editor with photos loaded, ready to tweak
//   cover-portrait   the Sunset Strip poster, portrait export, neon grade
//   cover-diagonal   the Neon Nights cover, square export, gold grade
//
// Query params: photo=<sample>, caption=<title>, sub=<subtitle>.

const SCENES = {
  cover: {
    template: 'vice-grid',
    grade: 'sunset',
    size: '1920x1080',
    title: 'VICE CITY',
    subtitle: 'SUNSET HEIST',
    tagline: 'A VICE CITY STORY',
    coverOnly: true,
  },
  editor: {
    template: 'vice-grid',
    grade: 'sunset',
    size: '1080x1080',
    title: 'VICE CITY',
    subtitle: 'SUNSET HEIST',
    tagline: 'A VICE CITY STORY',
    coverOnly: false,
  },
  'cover-portrait': {
    template: 'sunset-strip',
    grade: 'neon',
    size: '1080x1350',
    title: 'NEON NIGHTS',
    subtitle: 'BOULEVARD QUEEN',
    tagline: 'AFTER DARK',
    coverOnly: true,
    // The hero and middle panels are wide strips of landscape photos: nudge the
    // photos down so the faces (top of frame) stay in shot.
    tweaks: [
      { panel: 0, oy: 0.2 },
      { panel: 1, oy: 0.14 },
      { panel: 2, oy: 0.14 },
    ],
  },
  'cover-diagonal': {
    template: 'neon-nights',
    grade: 'gold',
    size: '1080x1080',
    title: 'PALM GOLD',
    subtitle: 'OCEAN DRIVE',
    tagline: 'GOLDEN HOUR',
    coverOnly: true,
  },
};

/** Stages a scene, then flags it ready after two painted frames. */
export async function runShot(shot, query, app) {
  const scene = SCENES[shot] || SCENES.cover;
  const { state, loadImage, render } = app;
  state.template = scene.template;
  state.grade = scene.grade;
  state.size = scene.size;
  state.title = query.get('caption') || scene.title;
  state.subtitle = query.get('sub') || scene.subtitle;
  state.tagline = scene.tagline;

  // The requested sample photo fills every panel; a second sample alternates in
  // so the grid shows two different moments instead of one photo four times.
  const first = query.get('photo') || 'pier';
  const second = first === 'pier' ? 'boulevard' : 'pier';
  const names = [first, second, first, second];
  for (let i = 0; i < names.length; i++) {
    try {
      state.panels[i].photo = await loadImage(`samples/${names[i]}.jpg`);
      state.panels[i].zoom = 1;
      state.panels[i].ox = 0;
      state.panels[i].oy = 0;
    } catch {
      /* keep whatever the panel already holds */
    }
  }
  for (const tweak of scene.tweaks || []) {
    const panel = state.panels[tweak.panel];
    if (!panel) continue;
    if (tweak.ox !== undefined) panel.ox = tweak.ox;
    if (tweak.oy !== undefined) panel.oy = tweak.oy;
    if (tweak.zoom !== undefined) panel.zoom = tweak.zoom;
  }

  // Sync the editor controls with the staged scene so the editor shot is honest.
  const titleInput = document.getElementById('title');
  if (titleInput) titleInput.value = state.title;
  const subInput = document.getElementById('subtitle');
  if (subInput) subInput.value = state.subtitle;
  const tagInput = document.getElementById('tagline');
  if (tagInput) tagInput.value = state.tagline;
  document.querySelectorAll('#templates .chip').forEach((c) => {
    c.classList.toggle('active', c.textContent === sceneLabel(state.template));
  });
  document.querySelectorAll('#grades .swatch').forEach((c) => {
    c.classList.toggle('active', c.textContent === gradeLabel(state.grade));
  });
  document.querySelectorAll('#sizes .chip').forEach((c) => {
    c.classList.toggle('active', c.textContent.includes(state.size.replace('x', ' × ')));
  });

  if (scene.coverOnly) document.body.classList.add('shot-cover');
  render();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.__shotReady = true;
      // A DOM flag too: some automation reads the document, not the window.
      document.documentElement.setAttribute('data-shot-ready', 'true');
    });
  });
}

function sceneLabel(template) {
  return { 'vice-grid': 'Vice Grid', 'sunset-strip': 'Sunset Strip', 'neon-nights': 'Neon Nights' }[template];
}

function gradeLabel(grade) {
  return { sunset: 'Vice Sunset', neon: 'Neon Nights', gold: 'Palm Gold', noir: 'Noir' }[grade];
}
