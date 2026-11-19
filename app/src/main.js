// Vice Cover Studio — wires the editor page: photo uploads, the six steps,
// drag-to-crop on the preview, and the PNG export. A `?shot=` query switches
// the page into a fixed scene for screenshots (see shots.js).
import { drawCover, layoutPanels, renderCover } from './cover.js';
import { createDefaultState, sizeById, templateById } from './state.js';
import { runShot } from './shots.js';

const canvas = document.getElementById('cover');
const status = document.getElementById('status');
const state = createDefaultState();
/** Loaded images in photo-slot order; null until a slot has a photo. */
const images = [null, null, null, null];

const PREVIEW_BASE = 900;

/** Loads an image from a URL, resolving once it can be drawn. */
export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load image ${url}`));
    img.src = url;
  });
}

/** Sizes the preview canvas to the active template's aspect, then redraws. */
function sizePreviewCanvas() {
  const template = templateById(state.template);
  if (template.aspect >= 1) {
    canvas.width = PREVIEW_BASE;
    canvas.height = Math.round(PREVIEW_BASE / template.aspect);
  } else {
    canvas.height = PREVIEW_BASE;
    canvas.width = Math.round(PREVIEW_BASE * template.aspect);
  }
}

/** Redraws the preview from the current state. */
export function redraw() {
  sizePreviewCanvas();
  drawCover(canvas, state, images);
}

/** Loads the two kit sample photos into the four slots. */
async function loadSamples() {
  const pier = await loadImage('samples/pier.jpg');
  const boulevard = await loadImage('samples/boulevard.jpg');
  images[0] = pier;
  images[1] = boulevard;
  images[2] = pier;
  images[3] = boulevard;
}

/** Shows one editor step and hides the others. */
function showStep(stepId) {
  state.step = stepId;
  document.querySelectorAll('.step-panel').forEach((panel) => {
    panel.hidden = panel.dataset.panel !== stepId;
  });
  document.querySelectorAll('.step-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.step === stepId);
  });
}

/** Marks the active choice inside a group of buttons. */
function markActive(group, value) {
  document.querySelectorAll(`[data-${group}]`).forEach((btn) => {
    btn.classList.toggle('active', btn.dataset[group] === value);
  });
}

function bindControls() {
  // Step navigation.
  document.querySelectorAll('.step-btn').forEach((btn) => {
    btn.addEventListener('click', () => showStep(btn.dataset.step));
  });

  // Photo uploads, one file input per slot.
  for (let slot = 0; slot < 4; slot++) {
    const input = document.getElementById(`photo-${slot}`);
    if (!input) continue;
    input.addEventListener('change', async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      try {
        images[slot] = await loadImage(URL.createObjectURL(file));
        state.photos[slot].src = file.name;
        redraw();
        status.textContent = `Photo ${slot + 1} loaded: ${file.name}`;
      } catch {
        status.textContent = `Photo ${slot + 1} could not be loaded.`;
      }
    });
    const useSample = document.getElementById(`sample-${slot}`);
    if (useSample) {
      useSample.addEventListener('click', async () => {
        images[slot] = await loadImage(slot % 2 === 0 ? 'samples/pier.jpg' : 'samples/boulevard.jpg');
        state.photos[slot].src = slot % 2 === 0 ? 'samples/pier.jpg' : 'samples/boulevard.jpg';
        redraw();
      });
    }
  }

  // Per-panel zoom sliders.
  for (let panel = 0; panel < 4; panel++) {
    const slider = document.getElementById(`zoom-${panel}`);
    if (!slider) continue;
    slider.addEventListener('input', () => {
      const slot = state.panelPhoto[panel] ?? panel;
      state.photos[slot].zoom = Number(slider.value);
      redraw();
    });
  }

  // Template choice.
  document.querySelectorAll('[data-template]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.template = btn.dataset.template;
      markActive('template', state.template);
      redraw();
    });
  });

  // Grade choice.
  document.querySelectorAll('[data-grade]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.grade = btn.dataset.grade;
      markActive('grade', state.grade);
      redraw();
    });
  });

  // Lettering.
  const titleInput = document.getElementById('title');
  titleInput.addEventListener('input', () => {
    state.title = titleInput.value;
    redraw();
  });
  const subtitleInput = document.getElementById('subtitle');
  subtitleInput.addEventListener('input', () => {
    state.subtitle = subtitleInput.value;
    redraw();
  });

  // Effect toggles.
  const halftone = document.getElementById('fx-halftone');
  halftone.addEventListener('change', () => {
    state.effects.halftone = halftone.checked;
    redraw();
  });
  const vignette = document.getElementById('fx-vignette');
  vignette.addEventListener('change', () => {
    state.effects.vignette = vignette.checked;
    redraw();
  });
  const grain = document.getElementById('fx-grain');
  grain.addEventListener('change', () => {
    state.effects.grain = grain.checked;
    redraw();
  });

  // Export size.
  document.querySelectorAll('[data-size]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.size = btn.dataset.size;
      markActive('size', state.size);
    });
  });

  // Export: draw the cover at full post size on an offscreen canvas.
  document.getElementById('export').addEventListener('click', () => {
    const size = sizeById(state.size);
    const off = document.createElement('canvas');
    off.width = size.w;
    off.height = size.h;
    renderCover(off.getContext('2d'), state, images, size.w, size.h);
    off.toBlob((blob) => {
      if (!blob) {
        status.textContent = 'Export failed: the browser could not make the PNG.';
        return;
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `vice-cover-${size.w}x${size.h}.png`;
      a.click();
      status.textContent = `Saved vice-cover-${size.w}x${size.h}.png`;
    }, 'image/png');
  });

  // Drag on the preview to pan the photo inside the panel under the pointer.
  let drag = null;
  const gutter = () => Math.max(2, Math.round(canvas.width * 0.012));
  canvas.addEventListener('pointerdown', (event) => {
    const rect = canvas.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * canvas.width;
    const py = ((event.clientY - rect.top) / rect.height) * canvas.height;
    const layout = layoutPanels(state.template, canvas.width, canvas.height, gutter());
    const hit = layout.panels.findIndex(
      (p) => px >= p.x && px <= p.x + p.w && py >= p.y && py <= p.y + p.h,
    );
    if (hit === -1) return;
    drag = { panel: hit, lastX: px, lastY: py };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!drag) return;
    const rect = canvas.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * canvas.width;
    const py = ((event.clientY - rect.top) / rect.height) * canvas.height;
    const layout = layoutPanels(state.template, canvas.width, canvas.height, gutter());
    const panel = layout.panels[drag.panel];
    const slot = state.panelPhoto[drag.panel] ?? drag.panel;
    const image = images[slot];
    const crop = state.panelCrop[drag.panel];
    if (image && crop) {
      const zoom = state.photos[slot].zoom;
      const scale = Math.max(panel.w / image.naturalWidth, panel.h / image.naturalHeight) * zoom;
      const dw = image.naturalWidth * scale;
      const dh = image.naturalHeight * scale;
      const dx = px - drag.lastX;
      const dy = py - drag.lastY;
      if (Math.abs(panel.w - dw) > 1) crop.fx += dx / (panel.w - dw);
      if (Math.abs(panel.h - dh) > 1) crop.fy += dy / (panel.h - dh);
      crop.fx = Math.min(1, Math.max(0, crop.fx));
      crop.fy = Math.min(1, Math.max(0, crop.fy));
      redraw();
    }
    drag.lastX = px;
    drag.lastY = py;
  });
  const endDrag = () => {
    drag = null;
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
}

// Small handle for automated checks: lets a test drive every template,
// grade and export size through the real editor and redraw path.
window.__viceCover = { state, images, redraw };

const params = new URLSearchParams(location.search);
const shot = params.get('shot');
bindControls();
showStep('photos');
markActive('template', state.template);
markActive('grade', state.grade);
markActive('size', state.size);
if (shot) {
  runShot(shot, params, { state, images, loadImage, loadSamples, redraw, canvas });
} else {
  loadSamples().then(redraw).catch(() => redraw());
}
