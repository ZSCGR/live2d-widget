/**
 * @file Hit area debug overlay.
 * @module debug
 */

import logger from './logger.js';

interface HitProbe {
  (clientX: number, clientY: number): { x: number; y: number; areas: string[] } | null;
}

const OVERLAY_ID = 'live2d-hit-overlay';
const READOUT_ID = 'live2d-hit-readout';
const MEASURE_ID = 'live2d-hit-measure';

// Sampling step in CSS pixels. Smaller is sharper but costs one hitTest call
// per area per cell, and the model keeps breathing so the map is redrawn
// continuously.
const STEP = 4;
const REFRESH_MS = 500;

// head/body are what the widget acts on, so they keep fixed colours; any
// further area a model declares gets the next hue in the palette.
const COLOURS: Record<string, string> = {
  head: 'rgba(80, 220, 120, 0.45)',
  body: 'rgba(80, 160, 255, 0.40)',
};
const PALETTE = [
  'rgba(255, 120, 200, 0.45)',
  'rgba(255, 170, 60, 0.45)',
  'rgba(180, 120, 255, 0.45)',
  'rgba(60, 220, 220, 0.45)',
  'rgba(220, 90, 90, 0.45)',
];
const extraColours: Record<string, string> = {};

function colourFor(area: string): string {
  if (COLOURS[area]) return COLOURS[area];
  if (!extraColours[area]) {
    extraColours[area] = PALETTE[Object.keys(extraColours).length % PALETTE.length];
  }
  return extraColours[area];
}

let overlay: HTMLCanvasElement | null = null;
let readout: HTMLDivElement | null = null;
let timer: number | null = null;
let pointerHandler: ((e: MouseEvent) => void) | null = null;
let probe: HitProbe | null = null;
let lastPointer: { x: number; y: number } | null = null;

function canvasElement(): HTMLCanvasElement | null {
  return document.getElementById('live2d') as HTMLCanvasElement | null;
}

/**
 * Paint one cell per sampled point, coloured by which hit areas answered.
 */
function drawMap() {
  const live2d = canvasElement();
  if (!live2d || !probe) return;

  if (!overlay || !overlay.isConnected || !document.getElementById(OVERLAY_ID)) {
    const host = live2d.parentElement || document.body;
    if (getComputedStyle(host).position === 'static') {
      (host as HTMLElement).style.position = 'relative';
    }
    overlay = document.getElementById(OVERLAY_ID) as HTMLCanvasElement | null;
    if (!overlay) {
      overlay = document.createElement('canvas');
      overlay.id = OVERLAY_ID;
      overlay.style.cssText =
        'position:absolute;left:0;top:0;pointer-events:none;z-index:2147483647';
      host.appendChild(overlay);
    }
  }

  const rect = live2d.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  // Keep the overlay glued to the canvas: the widget slides on hover and
  // during its entry transition, so the box moves under us.
  if (overlay.width !== Math.round(rect.width) || overlay.height !== Math.round(rect.height)) {
    overlay.width = Math.round(rect.width);
    overlay.height = Math.round(rect.height);
  }
  overlay.style.width = `${rect.width}px`;
  overlay.style.height = `${rect.height}px`;

  const ctx = overlay.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, overlay.width, overlay.height);

  const counts: Record<string, number> = {};

  for (let ly = 0; ly < rect.height; ly += STEP) {
    for (let lx = 0; lx < rect.width; lx += STEP) {
      const hit = probe(rect.left + lx, rect.top + ly);
      if (!hit || !hit.areas.length) continue;
      // Overlapping areas are drawn stacked, so a region covered by two
      // declarations reads as a blend rather than hiding one of them.
      for (const area of hit.areas) {
        counts[area] = (counts[area] || 0) + 1;
        ctx.fillStyle = colourFor(area);
        ctx.fillRect(lx, ly, STEP, STEP);
      }
    }
  }

  // Canvas outline, so the clickable surface itself is visible.
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, overlay.width - 1, overlay.height - 1);

  // Crosshair at the last pointer position.
  if (lastPointer) {
    const cx = lastPointer.x - rect.left;
    const cy = lastPointer.y - rect.top;
    if (cx >= 0 && cy >= 0 && cx <= rect.width && cy <= rect.height) {
      ctx.strokeStyle = 'rgba(255,60,60,0.9)';
      ctx.beginPath();
      ctx.moveTo(cx, 0); ctx.lineTo(cx, overlay.height);
      ctx.moveTo(0, cy); ctx.lineTo(overlay.width, cy);
      ctx.stroke();
    }
  }

  return counts;
}

function updateReadout(clientX: number, clientY: number) {
  const live2d = canvasElement();
  if (!readout || !live2d || !probe) return;
  const rect = live2d.getBoundingClientRect();
  const hit = probe(clientX, clientY);
  const lx = (clientX - rect.left).toFixed(0);
  const ly = (clientY - rect.top).toFixed(0);
  const areas = hit && hit.areas.length ? hit.areas.join(' + ') : '—';
  readout.innerHTML =
    `canvas <b>${lx}, ${ly}</b> px<br>` +
    `view <b>${hit ? hit.x.toFixed(3) : '?'}, ${hit ? hit.y.toFixed(3) : '?'}</b><br>` +
    `hit <b style="color:#ffd23c">${areas}</b>`;
}

/**
 * Drag a rectangle over the canvas and get back the view coordinates it
 * spans, ready to paste into a model's hit_areas_custom.
 *
 * The declared areas that ship with the common model packs are boilerplate
 * copied between unrelated models, so they rarely line up with what is
 * actually drawn. This measures the real thing instead of guessing.
 */
function measure(area = 'head') {
  const live2d = canvasElement();
  if (!live2d || !probe) {
    logger.error('Overlay is not running, call live2dDebug.show() first.');
    return;
  }
  document.getElementById(MEASURE_ID)?.remove();

  const host = live2d.parentElement || document.body;
  const pad = document.createElement('div');
  pad.id = MEASURE_ID;
  const rect0 = live2d.getBoundingClientRect();
  pad.style.cssText =
    `position:absolute;left:0;top:0;width:${rect0.width}px;height:${rect0.height}px;` +
    'cursor:crosshair;z-index:2147483647;background:rgba(255,255,255,0.01)';
  host.appendChild(pad);

  const box = document.createElement('div');
  box.style.cssText =
    'position:absolute;border:2px dashed #ff3c3c;background:rgba(255,60,60,0.12);' +
    'pointer-events:none;display:none';
  pad.appendChild(box);

  let start: { x: number; y: number } | null = null;

  const toView = (clientX: number, clientY: number) => probe!(clientX, clientY);

  pad.addEventListener('mousedown', e => {
    start = { x: e.clientX, y: e.clientY };
    box.style.display = 'block';
  });

  pad.addEventListener('mousemove', e => {
    if (!start) return;
    const r = live2d.getBoundingClientRect();
    const x0 = Math.min(start.x, e.clientX) - r.left;
    const y0 = Math.min(start.y, e.clientY) - r.top;
    box.style.left = `${x0}px`;
    box.style.top = `${y0}px`;
    box.style.width = `${Math.abs(e.clientX - start.x)}px`;
    box.style.height = `${Math.abs(e.clientY - start.y)}px`;
    if (readout) {
      const a = toView(start.x, start.y);
      const b = toView(e.clientX, e.clientY);
      if (a && b) {
        readout.innerHTML =
          `<b>${area}</b> 拖框中<br>` +
          `x [${Math.min(a.x, b.x).toFixed(2)}, ${Math.max(a.x, b.x).toFixed(2)}]<br>` +
          `y [${Math.min(a.y, b.y).toFixed(2)}, ${Math.max(a.y, b.y).toFixed(2)}]`;
      }
    }
  });

  pad.addEventListener('mouseup', e => {
    if (!start) return;
    const a = toView(start.x, start.y);
    const b = toView(e.clientX, e.clientY);
    start = null;
    if (!a || !b) return;
    const xs = [+Math.min(a.x, b.x).toFixed(2), +Math.max(a.x, b.x).toFixed(2)];
    const ys = [+Math.max(a.y, b.y).toFixed(2), +Math.min(a.y, b.y).toFixed(2)];
    const json = `"${area}_x":[${xs}], "${area}_y":[${ys}]`;
    if (readout) readout.innerHTML = `<b>${area}</b><br>${json}`;
    logger.info(`hit_areas_custom -> ${json}`);
    console.log(json);
    // The page listens for this to collect measurements across models.
    window.dispatchEvent(new CustomEvent('live2d:measured', {
      detail: { area, x: xs, y: ys, json },
    }));
    pad.remove();
  });

  logger.info(`拖一个框圈住 ${area}，松开后输出 hit_areas_custom 数值。`);
}

/**
 * Show the overlay. `probeFn` is asked, per sampled point, which hit areas
 * respond there.
 */
function show(probeFn: HitProbe) {
  const live2d = canvasElement();
  if (!live2d) {
    logger.error('No #live2d canvas found, is the widget loaded?');
    return;
  }
  probe = probeFn;
  hide();

  const host = live2d.parentElement || document.body;
  if (getComputedStyle(host).position === 'static') {
    (host as HTMLElement).style.position = 'relative';
  }

  overlay = document.createElement('canvas');
  overlay.id = OVERLAY_ID;
  overlay.style.cssText =
    'position:absolute;left:0;top:0;pointer-events:none;z-index:2147483647';
  host.appendChild(overlay);

  readout = document.createElement('div');
  readout.id = READOUT_ID;
  readout.style.cssText =
    'position:fixed;left:8px;bottom:8px;padding:6px 10px;border-radius:6px;' +
    'background:rgba(0,0,0,0.78);color:#fff;font:12px/1.5 monospace;' +
    'white-space:nowrap;pointer-events:none;z-index:2147483647';
  readout.textContent = 'move the pointer over the model';
  document.body.appendChild(readout);

  pointerHandler = (e: MouseEvent) => {
    lastPointer = { x: e.clientX, y: e.clientY };
    updateReadout(e.clientX, e.clientY);
  };
  document.addEventListener('mousemove', pointerHandler, { passive: true });

  drawMap();
  timer = window.setInterval(drawMap, REFRESH_MS);
  logger.info('Hit area overlay on. green = head, blue = body, other areas get their own colour.');
}

function hide() {
  if (timer !== null) { window.clearInterval(timer); timer = null; }
  if (pointerHandler) {
    document.removeEventListener('mousemove', pointerHandler);
    pointerHandler = null;
  }
  document.getElementById(OVERLAY_ID)?.remove();
  document.getElementById(READOUT_ID)?.remove();
  document.getElementById(MEASURE_ID)?.remove();
  overlay = null;
  readout = null;
}

export { show, hide, measure, drawMap };
export type { HitProbe };
