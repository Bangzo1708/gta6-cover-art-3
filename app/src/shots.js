// Vice Cover Studio — fixed scenes for screenshots. `?shot=` picks one:
// cover (the Vice Grid cover alone), editor (the editor with a photo loaded),
// cover-portrait (the Sunset Strip poster) and cover-diagonal (the Neon
// Nights wide poster). Each scene loads the kit sample photos, sets its
// template, grade and lettering, draws once, and then signals readiness twice:
// window.__shotReady and the data-shot-ready attribute on the document.
import { drawCover } from './cover.js';

/** Runs one scene. `api` is the editor handle main.js passes in. */
export async function runShot(shot, query, api) {
  const { state, loadSamples, redraw, canvas } = api;
  const caption = query.get('caption') ?? 'VICE CITY';

  const scenes = {
    cover: {
      bodyClass: 'shot-cover',
      template: 'vice-grid',
      grade: 'vice-sunset',
      title: caption,
      subtitle: 'A STORY IN NEON',
    },
    editor: {
      bodyClass: 'shot-editor',
      template: 'vice-grid',
      grade: 'neon-nights',
      title: caption,
      subtitle: 'A STORY IN NEON',
    },
    'cover-portrait': {
      bodyClass: 'shot-cover',
      template: 'sunset-strip',
      grade: 'palm-gold',
      title: caption,
      subtitle: 'EVERY SUNSET HAS A PRICE',
      // The diagonal strips are wide and short, so each photo shows only a
      // horizontal slice: aim the focal points at the faces, high in frame.
      panelCrop: [
        { fx: 0.5, fy: 0.18 },
        { fx: 0.5, fy: 0.22 },
        { fx: 0.5, fy: 0.18 },
        { fx: 0.5, fy: 0.22 },
      ],
    },
    'cover-diagonal': {
      bodyClass: 'shot-cover',
      template: 'neon-nights',
      grade: 'neon-nights',
      title: caption,
      subtitle: 'THE CITY NEVER SLEEPS',
    },
  };
  const scene = scenes[shot] ?? scenes.cover;

  document.body.classList.add(scene.bodyClass);
  state.template = scene.template;
  state.grade = scene.grade;
  state.title = scene.title;
  state.subtitle = scene.subtitle;
  if (scene.panelCrop) state.panelCrop = scene.panelCrop;
  document.getElementById('title').value = scene.title;
  document.getElementById('subtitle').value = scene.subtitle;
  document.querySelectorAll('[data-template]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.template === scene.template);
  });
  document.querySelectorAll('[data-grade]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.grade === scene.grade);
  });

  // In a cover scene the canvas is the screenshot: size it to the viewport.
  if (scene.bodyClass === 'shot-cover') {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  await loadSamples();

  if (scene.bodyClass === 'shot-cover') {
    // Draw directly at viewport size instead of the preview size.
    drawCover(canvas, state, api.images);
  } else {
    redraw();
  }

  // Two animation frames, then both readiness signals.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.__shotReady = true;
      document.documentElement.setAttribute('data-shot-ready', 'true');
    });
  });
}
