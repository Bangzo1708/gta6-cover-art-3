// Vice Cover Studio — the page: wires the editor controls to the cover state and
// the live preview canvas, loads photos (bundled samples or the person's uploads),
// and exports the finished cover as a PNG in the chosen post size. A `?shot=`
// query instead stages one fixed scene for a screenshot (see shots.js).
//
// Drag on the preview to slide the selected panel's photo; scroll over it to zoom.
// Everything runs offline: photos are read on this machine and never uploaded.

import { GRADES, SIZES, TEMPLATES, cloneState, defaultState } from './state.js';
import { drawCover, panelPixelRects, renderCover } from './cover.js';
import { runShot } from './shots.js';

const $ = (id) => document.getElementById(id);
const canvas = $('preview');
const statusEl = $('status');

const state = defaultState();
let selected = 0; // which panel the sliders and drag act on
let dragging = null; // { x, y } of the last pointer position while dragging

/** Loads an image from a URL, resolving once it can be drawn. */
export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${url}`));
    img.src = url;
  });
}

function say(message) {
  statusEl.textContent = message;
}

function render() {
  drawCover(canvas, state);
  refreshSlotList();
}

/** Rebuilds the four photo slot rows: thumbnail state, name, selected highlight. */
function refreshSlotList() {
  const list = $('slots');
  list.querySelectorAll('.slot').forEach((row, i) => {
    const panel = state.panels[i];
    row.classList.toggle('selected', i === selected);
    row.querySelector('.slot-name').textContent = panel.photo
      ? `Photo ${i + 1} · loaded`
      : `Photo ${i + 1} · empty`;
    row.querySelector('.slot-zoom').value = String(panel.zoom);
    row.querySelector('.slot-ox').value = String(panel.ox);
    row.querySelector('.slot-oy').value = String(panel.oy);
  });
}

/** Builds the control rows once: template, grade, size and effect buttons. */
function buildControls() {
  const templateRow = $('templates');
  for (const [key, t] of Object.entries(TEMPLATES)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = t.label;
    b.title = t.hint;
    b.addEventListener('click', () => {
      state.template = key;
      templateRow.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
      b.classList.add('active');
      render();
    });
    if (key === state.template) b.classList.add('active');
    templateRow.appendChild(b);
  }

  const gradeRow = $('grades');
  for (const [key, g] of Object.entries(GRADES)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch';
    b.style.background = g.swatch;
    b.textContent = g.label;
    b.addEventListener('click', () => {
      state.grade = key;
      gradeRow.querySelectorAll('.swatch').forEach((c) => c.classList.remove('active'));
      b.classList.add('active');
      render();
    });
    if (key === state.grade) b.classList.add('active');
    gradeRow.appendChild(b);
  }

  const sizeRow = $('sizes');
  for (const [key, s] of Object.entries(SIZES)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = s.label;
    b.addEventListener('click', () => {
      state.size = key;
      sizeRow.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
      b.classList.add('active');
      render();
    });
    if (key === state.size) b.classList.add('active');
    sizeRow.appendChild(b);
  }

  const slots = $('slots');
  state.panels.forEach((_, i) => {
    const row = document.createElement('div');
    row.className = 'slot';
    row.innerHTML = `
      <button type="button" class="slot-pick"><span class="slot-name">Photo ${i + 1} · empty</span></button>
      <label class="slot-file">Upload <input type="file" accept="image/*" hidden></label>
      <label>Zoom <input class="slot-zoom" type="range" min="1" max="3" step="0.05" value="1"></label>
      <label>Slide X <input class="slot-ox" type="range" min="-0.5" max="0.5" step="0.01" value="0"></label>
      <label>Slide Y <input class="slot-oy" type="range" min="-0.5" max="0.5" step="0.01" value="0"></label>`;
    row.querySelector('.slot-pick').addEventListener('click', () => {
      selected = i;
      render();
    });
    row.querySelector('input[type=file]').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        state.panels[i].photo = await loadImage(URL.createObjectURL(file));
        state.panels[i].zoom = 1;
        state.panels[i].ox = 0;
        state.panels[i].oy = 0;
        selected = i;
        say(`Photo ${i + 1} loaded from ${file.name}.`);
        render();
      } catch {
        say(`Could not read ${file.name} as an image.`);
      }
    });
    row.querySelector('.slot-zoom').addEventListener('input', (e) => {
      state.panels[i].zoom = Number(e.target.value);
      render();
    });
    row.querySelector('.slot-ox').addEventListener('input', (e) => {
      state.panels[i].ox = Number(e.target.value);
      render();
    });
    row.querySelector('.slot-oy').addEventListener('input', (e) => {
      state.panels[i].oy = Number(e.target.value);
      render();
    });
    slots.appendChild(row);
  });
}

/** Caption fields, effect toggles and the export button. */
function buildActions() {
  $('title').addEventListener('input', (e) => {
    state.title = e.target.value;
    render();
  });
  $('subtitle').addEventListener('input', (e) => {
    state.subtitle = e.target.value;
    render();
  });
  $('tagline').addEventListener('input', (e) => {
    state.tagline = e.target.value;
    render();
  });
  document.querySelectorAll('#effects input[type=checkbox]').forEach((box) => {
    box.addEventListener('change', () => {
      state.effects[box.dataset.effect] = box.checked;
      render();
    });
  });
  $('shuffle').addEventListener('click', () => {
    // Rotate the loaded photos one panel forward: a one-click new arrangement.
    const photos = state.panels.map((p) => p.photo);
    state.panels.forEach((p, i) => {
      p.photo = photos[(i + 1) % photos.length];
    });
    say('Photos rotated — a fresh arrangement.');
    render();
  });
  $('export').addEventListener('click', () => {
    const size = SIZES[state.size];
    const out = renderCover(cloneState(state));
    out.toBlob((blob) => {
      if (!blob) {
        say('Export failed — the canvas could not produce a PNG.');
        return;
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `vice-cover-${state.size}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      say(`Saved vice-cover-${state.size}.png (${size.w} × ${size.h}).`);
    }, 'image/png');
  });
}

/** Click selects a panel; drag slides its photo; wheel zooms it. */
function buildCanvasGestures() {
  const toCanvas = (e) => {
    const box = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - box.left) / box.width) * canvas.width,
      y: ((e.clientY - box.top) / box.height) * canvas.height,
    };
  };
  const hitPanel = (p) => {
    const rects = panelPixelRects(state);
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return i;
    }
    return -1;
  };
  canvas.addEventListener('pointerdown', (e) => {
    const p = toCanvas(e);
    const hit = hitPanel(p);
    if (hit < 0) return;
    selected = hit;
    dragging = p;
    canvas.setPointerCapture(e.pointerId);
    render();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const p = toCanvas(e);
    const panel = state.panels[selected];
    const rects = panelPixelRects(state);
    const r = rects[selected];
    panel.ox = Math.max(-0.5, Math.min(0.5, panel.ox + (p.x - dragging.x) / r.w));
    panel.oy = Math.max(-0.5, Math.min(0.5, panel.oy + (p.y - dragging.y) / r.h));
    dragging = p;
    render();
  });
  canvas.addEventListener('pointerup', () => {
    dragging = null;
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const panel = state.panels[selected];
    panel.zoom = Math.max(1, Math.min(3, panel.zoom * (e.deltaY < 0 ? 1.08 : 0.93)));
    render();
  }, { passive: false });
}

/** The two bundled sample photos fill the panels so the first cover is ready. */
async function loadSamples() {
  const names = ['pier', 'boulevard', 'pier', 'boulevard'];
  for (let i = 0; i < names.length; i++) {
    try {
      state.panels[i].photo = await loadImage(`samples/${names[i]}.jpg`);
    } catch {
      /* a missing sample leaves its panel as the dusk placeholder */
    }
  }
}

buildControls();
buildActions();
buildCanvasGestures();

const query = new URLSearchParams(location.search);
const shot = query.get('shot');
if (shot) {
  await loadSamples();
  runShot(shot, query, { state, loadImage, render, say });
} else {
  await loadSamples();
  render();
  say('Pick a photo per panel, choose a template and grade, then export your PNG.');
}
