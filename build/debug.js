import logger from './logger.js';
const OVERLAY_ID = 'live2d-hit-overlay';
const READOUT_ID = 'live2d-hit-readout';
const MEASURE_ID = 'live2d-hit-measure';
const STEP = 4;
const REFRESH_MS = 500;
const COLOURS = {
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
const extraColours = {};
function colourFor(area) {
    if (COLOURS[area])
        return COLOURS[area];
    if (!extraColours[area]) {
        extraColours[area] = PALETTE[Object.keys(extraColours).length % PALETTE.length];
    }
    return extraColours[area];
}
let overlay = null;
let readout = null;
let timer = null;
let pointerHandler = null;
let probe = null;
let lastPointer = null;
function canvasElement() {
    return document.getElementById('live2d');
}
function drawMap() {
    const live2d = canvasElement();
    if (!live2d || !probe)
        return;
    if (!overlay || !overlay.isConnected || !document.getElementById(OVERLAY_ID)) {
        const host = live2d.parentElement || document.body;
        if (getComputedStyle(host).position === 'static') {
            host.style.position = 'relative';
        }
        overlay = document.getElementById(OVERLAY_ID);
        if (!overlay) {
            overlay = document.createElement('canvas');
            overlay.id = OVERLAY_ID;
            overlay.style.cssText =
                'position:absolute;left:0;top:0;pointer-events:none;z-index:2147483647';
            host.appendChild(overlay);
        }
    }
    const rect = live2d.getBoundingClientRect();
    if (!rect.width || !rect.height)
        return;
    if (overlay.width !== Math.round(rect.width) || overlay.height !== Math.round(rect.height)) {
        overlay.width = Math.round(rect.width);
        overlay.height = Math.round(rect.height);
    }
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
    const ctx = overlay.getContext('2d');
    if (!ctx)
        return;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    const counts = {};
    for (let ly = 0; ly < rect.height; ly += STEP) {
        for (let lx = 0; lx < rect.width; lx += STEP) {
            const hit = probe(rect.left + lx, rect.top + ly);
            if (!hit || !hit.areas.length)
                continue;
            for (const area of hit.areas) {
                counts[area] = (counts[area] || 0) + 1;
                ctx.fillStyle = colourFor(area);
                ctx.fillRect(lx, ly, STEP, STEP);
            }
        }
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, overlay.width - 1, overlay.height - 1);
    if (lastPointer) {
        const cx = lastPointer.x - rect.left;
        const cy = lastPointer.y - rect.top;
        if (cx >= 0 && cy >= 0 && cx <= rect.width && cy <= rect.height) {
            ctx.strokeStyle = 'rgba(255,60,60,0.9)';
            ctx.beginPath();
            ctx.moveTo(cx, 0);
            ctx.lineTo(cx, overlay.height);
            ctx.moveTo(0, cy);
            ctx.lineTo(overlay.width, cy);
            ctx.stroke();
        }
    }
    return counts;
}
function updateReadout(clientX, clientY) {
    const live2d = canvasElement();
    if (!readout || !live2d || !probe)
        return;
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
function measure(area = 'head') {
    var _a;
    const live2d = canvasElement();
    if (!live2d || !probe) {
        logger.error('Overlay is not running, call live2dDebug.show() first.');
        return;
    }
    (_a = document.getElementById(MEASURE_ID)) === null || _a === void 0 ? void 0 : _a.remove();
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
    let start = null;
    const toView = (clientX, clientY) => probe(clientX, clientY);
    pad.addEventListener('mousedown', e => {
        start = { x: e.clientX, y: e.clientY };
        box.style.display = 'block';
    });
    pad.addEventListener('mousemove', e => {
        if (!start)
            return;
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
        if (!start)
            return;
        const a = toView(start.x, start.y);
        const b = toView(e.clientX, e.clientY);
        start = null;
        if (!a || !b)
            return;
        const xs = [+Math.min(a.x, b.x).toFixed(2), +Math.max(a.x, b.x).toFixed(2)];
        const ys = [+Math.max(a.y, b.y).toFixed(2), +Math.min(a.y, b.y).toFixed(2)];
        const json = `"${area}_x":[${xs}], "${area}_y":[${ys}]`;
        if (readout)
            readout.innerHTML = `<b>${area}</b><br>${json}`;
        logger.info(`hit_areas_custom -> ${json}`);
        console.log(json);
        window.dispatchEvent(new CustomEvent('live2d:measured', {
            detail: { area, x: xs, y: ys, json },
        }));
        pad.remove();
    });
    logger.info(`拖一个框圈住 ${area}，松开后输出 hit_areas_custom 数值。`);
}
function show(probeFn) {
    const live2d = canvasElement();
    if (!live2d) {
        logger.error('No #live2d canvas found, is the widget loaded?');
        return;
    }
    probe = probeFn;
    hide();
    const host = live2d.parentElement || document.body;
    if (getComputedStyle(host).position === 'static') {
        host.style.position = 'relative';
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
    pointerHandler = (e) => {
        lastPointer = { x: e.clientX, y: e.clientY };
        updateReadout(e.clientX, e.clientY);
    };
    document.addEventListener('mousemove', pointerHandler, { passive: true });
    drawMap();
    timer = window.setInterval(drawMap, REFRESH_MS);
    logger.info('Hit area overlay on. green = head, blue = body, other areas get their own colour.');
}
function hide() {
    var _a, _b, _c;
    if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
    }
    if (pointerHandler) {
        document.removeEventListener('mousemove', pointerHandler);
        pointerHandler = null;
    }
    (_a = document.getElementById(OVERLAY_ID)) === null || _a === void 0 ? void 0 : _a.remove();
    (_b = document.getElementById(READOUT_ID)) === null || _b === void 0 ? void 0 : _b.remove();
    (_c = document.getElementById(MEASURE_ID)) === null || _c === void 0 ? void 0 : _c.remove();
    overlay = null;
    readout = null;
}
export { show, hide, measure, drawMap };
