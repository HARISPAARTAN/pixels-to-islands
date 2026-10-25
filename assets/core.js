/*
 * core.js: the shared runtime of the course "Pixels to Islands" (docs/research/explainer_v2_2026-10-13/).
 * Vanilla ES2019, no library. It defines window.Core and window.Labs. Nothing touches the page at load time; a
 * function that needs the DOM looks for it when it is called. Lab defaults: src/labs_defaults.json.
 *
 * The first explainer's runtime (docs/research/explainer_2026-09-28/src/core.js, its design.md section 6) is kept as
 * it was: the toy maths (rng, the sample scene, patchGrid, toyFeatures, softmax, ema, neighbours8, quantile, eigSym,
 * ncut, maskcut, cropSampler, augment, the schedules), the colours, fmt, el, guard and the lab registry, with
 * Labs.get(id) added (boot.js hands a lab that waits for data its bundles through it). Plan decision 6
 * (docs/superpowers/plans/2026-10-13-explainer-v2-build.md) adds five namespaces:
 *   Core.bundle   the real-data bundle: load(name) fetches data/<name>.json once and decodes its int8 and float32
 *                 members; decode(doc) and rows(member, i) are the pure parts.
 *   Core.rule     the thesis's contrastive rule as cluster/contrastive.py computes it: similarity, quantile,
 *                 thresholds, sets, infonce and gradient (and the helpers unitRows, studentTeacherRow, kFor).
 *   Core.decoder  the frozen label-free decoder of configs/decoder_v2_frozen_v2.json as src/decoder_v2.py runs it:
 *                 keyRule and maskcut (stages, masks, ids); the bilateral post-processing and the resize of the masks
 *                 to the photograph's own size are not replicated.
 *   Core.metrics  the readings' scores as evaluation/metrics.py computes them: hungarianIoU, fgARI, bgFPR, unionIoU,
 *                 regionCount (and idsFromMasks).
 *   Core.image    the eight photographs of the bundle: viewGeometry(width, height, side) and load(url, side).
 * Core.rule, Core.decoder and Core.metrics are pure: they read their arguments, return new arrays and touch no DOM.
 * The real numbers they are checked against live in data/ (tests/run_node_checks.js).
 */
(function (root) {
  'use strict';

  if (root.Core && root.Core.version && root.Labs && typeof root.Labs.register === 'function') return;

  // ------------------------------------------------------------------ constants

  const IMAGENET_MEAN = [0.485, 0.456, 0.406];
  const IMAGENET_STD = [0.229, 0.224, 0.225];
  const LUMA = [0.299, 0.587, 0.114];
  const PATCH = 16;
  const TOKEN_DIM = 384;
  const PATCH_VALUES = PATCH * PATCH * 3;
  const PROJECTION_SEED = 7;
  const DEFAULT_EPS = 1e-5;
  const DEGENERATE_GAP = 1e-8;
  const MINUS = '\u2212';
  const SAMPLE_NAME = 'the sample scene';
  const MAX_SIDE = 2048;
  const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
  const GRAIN = 2;

  const CONSTANTS = Object.freeze({
    imagenetMean: IMAGENET_MEAN.slice(),
    imagenetStd: IMAGENET_STD.slice(),
    luma: LUMA.slice(),
    patch: PATCH,
    tokenDim: TOKEN_DIM,
    patchValues: PATCH_VALUES,
    projectionSeed: PROJECTION_SEED,
    eps: DEFAULT_EPS,
    degenerateGap: DEGENERATE_GAP,
    overlapIoU: 0.5,
    minAreaRatio: 0.01,
    globalScale: [0.25, 1],
    localScale: [0.05, 0.25],
    cropRatio: [3 / 4, 4 / 3],
    cropAttempts: 10,
    globalSize: 224,
    localSize: 96,
    nGlobal: 2,
    nLocal: 8,
    jitterGain: [0.75, 1.25],
    jitterBrightness: [0.6, 1.4],
    blurSigma: [0.1, 2],
    solariseThreshold: 128,
    recipeProbabilities: { flip: 0.5, jitter: 0.8, grey: 0.2, blurGlobal1: 1, blurGlobal2: 0.1, blurLocal: 0.5, solariseGlobal2: 0.2 },
    grain: GRAIN
  });

  // ------------------------------------------------------------------ small utilities

  // isArrayLike(x): true for plain arrays and typed arrays, also when they come from another realm.
  function isArrayLike(x) {
    return Array.isArray(x) || ArrayBuffer.isView(x);
  }

  // isNode(x): true for DOM nodes (anything with a numeric nodeType).
  function isNode(x) {
    return !!x && typeof x === 'object' && typeof x.nodeType === 'number';
  }

  // clamp(x, lo, hi): x limited to the closed interval [lo, hi].
  function clamp(x, lo, hi) {
    return x < lo ? lo : (x > hi ? hi : x);
  }

  // describeError(err): a short readable message for any thrown value.
  function describeError(err) {
    if (err && typeof err.message === 'string' && err.message) return err.message;
    try { return String(err); } catch (e) { return 'unknown error'; }
  }

  // logError(where, err): write the error to the console when there is one; never throws.
  function logError(where, err) {
    try {
      if (root.console && typeof root.console.error === 'function') root.console.error('[explainer] ' + where, err);
    } catch (e) { /* nothing more can be done */ }
  }

  // toRows(x, width): an array of Float64Array rows, from an array of rows or from a flat array cut every `width` values.
  function toRows(x, width) {
    if (!isArrayLike(x)) throw new TypeError('expected an array of rows or a flat numeric array');
    if (x.length === 0) return [];
    if (isArrayLike(x[0])) {
      return Array.prototype.map.call(x, function (row) { return Float64Array.from(row); });
    }
    if (!(width > 0) || x.length % width !== 0) throw new RangeError('a flat array needs a row width that divides its length');
    const rows = [];
    for (let i = 0; i < x.length; i += width) {
      const row = new Float64Array(width);
      for (let j = 0; j < width; j++) row[j] = x[i + j];
      rows.push(row);
    }
    return rows;
  }

  // toSquare(m): a fresh n x n matrix (array of Float64Array rows) from rows or from a flat array of n*n values.
  function toSquare(m) {
    if (!isArrayLike(m)) throw new TypeError('expected a square matrix');
    if (m.length === 0) return [];
    let rows;
    if (isArrayLike(m[0])) {
      rows = toRows(m);
    } else {
      const n = Math.round(Math.sqrt(m.length));
      if (n * n !== m.length) throw new RangeError('a flat matrix needs n*n values');
      rows = toRows(m, n);
    }
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].length !== rows.length) throw new RangeError('the matrix is not square');
    }
    return rows;
  }

  // flattenFinite(x): every finite number inside x (nested arrays and typed arrays), in reading order.
  function flattenFinite(x) {
    const out = [];
    // walk(v): push the finite numbers of v onto out, descending into nested arrays.
    function walk(v) {
      if (isArrayLike(v)) {
        for (let i = 0; i < v.length; i++) walk(v[i]);
      } else if (typeof v === 'number' && isFinite(v)) {
        out.push(v);
      }
    }
    walk(x);
    return out;
  }

  // rgbaToRgb(rgba): the red, green and blue bytes of RGBA data, as a Uint8ClampedArray of 3 values per pixel.
  function rgbaToRgb(rgba) {
    const out = new Uint8ClampedArray((rgba.length / 4) * 3);
    for (let i = 0, o = 0; i < rgba.length; i += 4, o += 3) {
      out[o] = rgba[i]; out[o + 1] = rgba[i + 1]; out[o + 2] = rgba[i + 2];
    }
    return out;
  }

  // ------------------------------------------------------------------ random numbers

  // toSeed(seed): a 32-bit unsigned seed from a number or a string (FNV-1a); 1 when nothing usable is given.
  function toSeed(seed) {
    if (typeof seed === 'string') {
      let h = 0x811C9DC5;
      for (let i = 0; i < seed.length; i++) {
        h ^= seed.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
      }
      return h >>> 0;
    }
    const x = Number(seed);
    return isFinite(x) ? (Math.floor(x) >>> 0) : 1;
  }

  // rng(seed): a deterministic mulberry32 stream; next() is uniform in [0, 1). Also uniform(lo, hi), int(n) and normal().
  function rng(seed) {
    let state = toSeed(seed) | 0;
    let spare = null;
    // next(): the next uniform number in [0, 1).
    function next() {
      state = (state + 0x6D2B79F5) | 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    return {
      next: next,
      // uniform(lo, hi): a uniform number in [lo, hi).
      uniform: function (lo, hi) { return lo + (hi - lo) * next(); },
      // int(n): a uniform integer in 0 .. n-1.
      int: function (n) { return Math.floor(next() * n); },
      // normal(): a standard normal number (Box-Muller; the second value of each pair serves the next call).
      normal: function () {
        if (spare !== null) { const s = spare; spare = null; return s; }
        let u = next();
        while (u <= 0) u = next();
        const v = next();
        const r = Math.sqrt(-2 * Math.log(u));
        spare = r * Math.sin(2 * Math.PI * v);
        return r * Math.cos(2 * Math.PI * v);
      }
    };
  }

  // toRng(r): r itself when it already has next(), otherwise a new rng seeded by r (seed 1 when r is missing).
  function toRng(r) {
    return (r && typeof r.next === 'function') ? r : rng(r === undefined || r === null ? 1 : r);
  }

  // ------------------------------------------------------------------ image data and canvases

  // makeImageData(w, h, data): a real ImageData in a browser, otherwise a plain {width, height, data} object; data defaults to transparent black.
  function makeImageData(w, h, data) {
    const px = data || new Uint8ClampedArray(w * h * 4);
    if (typeof root.ImageData === 'function') {
      try { return new root.ImageData(px, w, h); } catch (e) { /* fall back to a plain object */ }
    }
    return { width: w, height: h, data: px, colorSpace: 'srgb' };
  }

  // assertImage(img): throw unless img looks like ImageData (width, height and width*height*4 bytes).
  function assertImage(img) {
    if (!img || !(img.width > 0) || !(img.height > 0) || !img.data || img.data.length !== img.width * img.height * 4) {
      throw new TypeError('expected ImageData (width, height and RGBA bytes)');
    }
  }

  // checkSide(side): side as an integer from 8 to 2048 pixels, or a RangeError.
  function checkSide(side) {
    const s = Math.round(Number(side));
    if (!(s >= 8 && s <= MAX_SIDE)) throw new RangeError('the image side must be between 8 and ' + MAX_SIDE + ' pixels');
    return s;
  }

  // newCanvas(w, h): an offscreen canvas with its 2D context as {canvas, ctx}, or null when this environment cannot make one.
  function newCanvas(w, h) {
    const d = root.document;
    if (!d || typeof d.createElement !== 'function') return null;
    let canvas = null;
    try { canvas = d.createElement('canvas'); } catch (e) { return null; }
    if (!canvas || typeof canvas.getContext !== 'function') return null;
    canvas.width = w;
    canvas.height = h;
    let ctx = null;
    try { ctx = canvas.getContext('2d', { willReadFrequently: true }); } catch (e) { ctx = null; }
    if (!ctx) return null;
    return { canvas: canvas, ctx: ctx };
  }

  // paintImage(canvas, imageData): size the canvas to the image and copy its pixels in (plain image objects work too); returns the 2D context.
  function paintImage(canvas, imageData) {
    assertImage(imageData);
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const ctx = canvas.getContext('2d');
    let img = imageData;
    if (typeof root.ImageData !== 'function' || !(imageData instanceof root.ImageData)) {
      img = ctx.createImageData(imageData.width, imageData.height);
      img.data.set(imageData.data);
    }
    ctx.putImageData(img, 0, 0);
    return ctx;
  }

  // toCanvas(imageData): a new canvas element that holds the image (handy for drawImage with scaling).
  function toCanvas(imageData) {
    const cv = newCanvas(imageData.width, imageData.height);
    if (!cv) throw new Error('this browser cannot draw on a canvas');
    paintImage(cv.canvas, imageData);
    return cv.canvas;
  }

  // fitCanvas(canvas, cssWidth, cssHeight): a backing store for the device pixel ratio and a 2D context that draws in CSS pixels; the canvas shrinks with its container.
  function fitCanvas(canvas, cssWidth, cssHeight) {
    const dpr = clamp(Number(root.devicePixelRatio) || 1, 1, 3);
    canvas.width = Math.max(1, Math.round(cssWidth * dpr));
    canvas.height = Math.max(1, Math.round(cssHeight * dpr));
    if (canvas.style) {
      canvas.style.width = cssWidth + 'px';
      canvas.style.maxWidth = '100%';
      canvas.style.height = 'auto';
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  // canvasPoint(canvas, event, logicalWidth, logicalHeight): the pointer position in the canvas's drawing units, whatever size it is displayed at.
  function canvasPoint(canvas, event, logicalWidth, logicalHeight) {
    const r = canvas.getBoundingClientRect();
    const lw = logicalWidth || canvas.width;
    const lh = logicalHeight || canvas.height;
    return {
      x: (event.clientX - r.left) * lw / (r.width || 1),
      y: (event.clientY - r.top) * lh / (r.height || 1)
    };
  }

  // resampleRect(img, x, y, w, h, outW, outH, flip): the source rectangle resized to outW x outH by bilinear samples averaged over k x k sub-samples (k grows with the shrink factor); optional horizontal flip; RGBA bytes.
  function resampleRect(img, x, y, w, h, outW, outH, flip) {
    const W = img.width, H = img.height, d = img.data;
    const out = new Uint8ClampedArray(outW * outH * 4);
    const fx = w / outW, fy = h / outH;
    const kx = clamp(Math.ceil(fx), 1, 6), ky = clamp(Math.ceil(fy), 1, 6);
    const n = kx * ky;
    for (let oy = 0; oy < outH; oy++) {
      for (let ox = 0; ox < outW; ox++) {
        let r = 0, g = 0, b = 0;
        for (let sy = 0; sy < ky; sy++) {
          const py = clamp(y + (oy + (sy + 0.5) / ky) * fy - 0.5, 0, H - 1);
          const y0 = Math.floor(py), y1 = Math.min(y0 + 1, H - 1), ty = py - y0;
          for (let sx = 0; sx < kx; sx++) {
            const px = clamp(x + (ox + (sx + 0.5) / kx) * fx - 0.5, 0, W - 1);
            const x0 = Math.floor(px), x1 = Math.min(x0 + 1, W - 1), tx = px - x0;
            const a = (y0 * W + x0) * 4, bb = (y0 * W + x1) * 4, c = (y1 * W + x0) * 4, e = (y1 * W + x1) * 4;
            r += (d[a] * (1 - tx) + d[bb] * tx) * (1 - ty) + (d[c] * (1 - tx) + d[e] * tx) * ty;
            g += (d[a + 1] * (1 - tx) + d[bb + 1] * tx) * (1 - ty) + (d[c + 1] * (1 - tx) + d[e + 1] * tx) * ty;
            b += (d[a + 2] * (1 - tx) + d[bb + 2] * tx) * (1 - ty) + (d[c + 2] * (1 - tx) + d[e + 2] * tx) * ty;
          }
        }
        const tx2 = flip ? outW - 1 - ox : ox;
        const o = (oy * outW + tx2) * 4;
        out[o] = Math.round(r / n);
        out[o + 1] = Math.round(g / n);
        out[o + 2] = Math.round(b / n);
        out[o + 3] = 255;
      }
    }
    return out;
  }

  // ------------------------------------------------------------------ the sample scene

  // The scene in unit coordinates (u to the right, v downwards), painted back to front. Colours are sRGB hex.
  const SCENE = [
    { name: 'sky', shape: 'rect', x0: 0, y0: 0, x1: 1, y1: 1, fill: { y0: 0, y1: 0.62, stops: [[0, '#3B77C2'], [1, '#CFE6F5']] } },
    { name: 'sun', shape: 'ellipse', cx: 0.8, cy: 0.17, rx: 0.075, ry: 0.075, fill: '#FFCE3D' },
    { name: 'meadow', shape: 'rect', x0: 0, y0: 0.62, x1: 1, y1: 1, fill: { y0: 0.62, y1: 1, stops: [[0, '#4F9046'], [1, '#2D5C2B']] } },
    { name: 'far hill', shape: 'ellipse', cx: 0.24, cy: 0.68, rx: 0.46, ry: 0.17, fill: '#88C066' },
    { name: 'near hill', shape: 'ellipse', cx: 0.82, cy: 0.72, rx: 0.42, ry: 0.15, fill: '#5F9F50' },
    { name: 'road', shape: 'poly', pts: [[0.28, 1], [0.66, 1], [0.515, 0.72], [0.465, 0.72]], fill: '#53575D' },
    { name: 'road marking', shape: 'rect', x0: 0.4666, y0: 0.93, x1: 0.4806, y1: 0.97, fill: '#E4DDC1' },
    { name: 'road marking', shape: 'rect', x0: 0.4749, y0: 0.835, x1: 0.4859, y1: 0.875, fill: '#E4DDC1' },
    { name: 'road marking', shape: 'rect', x0: 0.4817, y0: 0.765, x1: 0.4897, y1: 0.795, fill: '#E4DDC1' },
    { name: 'house wall', shape: 'rect', x0: 0.38, y0: 0.52, x1: 0.6, y1: 0.72, fill: '#EAD9B6' },
    { name: 'roof', shape: 'poly', pts: [[0.345, 0.53], [0.635, 0.53], [0.49, 0.38]], fill: '#B4442E' },
    { name: 'door', shape: 'rect', x0: 0.46, y0: 0.61, x1: 0.52, y1: 0.72, fill: '#6A4125' },
    { name: 'window', shape: 'rect', x0: 0.4, y0: 0.575, x1: 0.44, y1: 0.625, fill: '#8FC3E6' },
    { name: 'window', shape: 'rect', x0: 0.54, y0: 0.575, x1: 0.58, y1: 0.625, fill: '#8FC3E6' },
    { name: 'tree trunk', shape: 'rect', x0: 0.145, y0: 0.56, x1: 0.185, y1: 0.8, fill: '#7B5231' },
    { name: 'tree crown', shape: 'ellipse', cx: 0.165, cy: 0.5, rx: 0.105, ry: 0.105, fill: '#2E6A34' },
    { name: 'ball', shape: 'ellipse', cx: 0.74, cy: 0.87, rx: 0.052, ry: 0.052, fill: '#D93A33' }
  ];

  // Interior points (unit coordinates) whose colour a canvas rendering must reproduce; a blocked or noised canvas fails them.
  const SCENE_PROBES = [[0.05, 0.05], [0.8, 0.17], [0.74, 0.87], [0.49, 0.47], [0.165, 0.5], [0.55, 0.97], [0.5, 0.66]];

  let preparedScene = null;
  const sampleCache = Object.create(null);
  const sampleRenderer = Object.create(null);

  // parseHex(hex): [r, g, b] bytes for '#rgb' or '#rrggbb'.
  function parseHex(hex) {
    let h = String(hex).replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  // prepareScene(): the scene with its colours parsed once, for the pure-JS painter and the probes.
  function prepareScene() {
    if (preparedScene) return preparedScene;
    preparedScene = SCENE.map(function (s) {
      const p = Object.assign({}, s);
      if (typeof s.fill === 'string') p.rgb = parseHex(s.fill);
      else p.stops = s.fill.stops.map(function (st) { return [st[0], parseHex(st[1])]; });
      return p;
    });
    return preparedScene;
  }

  // insideShape(s, u, v): whether the unit-coordinate point (u, v) lies inside shape s (polygons use the even-odd rule).
  function insideShape(s, u, v) {
    if (s.shape === 'rect') return u >= s.x0 && u < s.x1 && v >= s.y0 && v < s.y1;
    if (s.shape === 'ellipse') {
      const a = (u - s.cx) / s.rx, b = (v - s.cy) / s.ry;
      return a * a + b * b <= 1;
    }
    let inside = false;
    const pts = s.pts;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
      if (((yi > v) !== (yj > v)) && (u < (xj - xi) * (v - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }

  // shapeColour(s, v): the fill of prepared shape s at height v; vertical gradients interpolate linearly between stops.
  function shapeColour(s, v) {
    if (s.rgb) return s.rgb;
    const f = s.fill;
    const t = clamp((v - f.y0) / (f.y1 - f.y0), 0, 1);
    const st = s.stops;
    if (t <= st[0][0]) return st[0][1];
    for (let i = 1; i < st.length; i++) {
      if (t <= st[i][0]) {
        const a = st[i - 1], b = st[i];
        const w = (t - a[0]) / (b[0] - a[0]);
        return [a[1][0] + (b[1][0] - a[1][0]) * w, a[1][1] + (b[1][1] - a[1][1]) * w, a[1][2] + (b[1][2] - a[1][2]) * w];
      }
    }
    return st[st.length - 1][1];
  }

  // topShapeAt(u, v): the prepared shape painted last at (u, v), or null outside every shape.
  function topShapeAt(u, v) {
    const shapes = prepareScene();
    for (let i = shapes.length - 1; i >= 0; i--) {
      if (insideShape(shapes[i], u, v)) return shapes[i];
    }
    return null;
  }

  // sceneObjectAt(u, v): the name of the sample scene's object at unit coordinates (u, v), for example 'roof'; null outside [0, 1).
  function sceneObjectAt(u, v) {
    if (!(u >= 0 && u < 1 && v >= 0 && v < 1)) return null;
    const s = topShapeAt(u, v);
    return s ? s.name : null;
  }

  // paintSceneOnCanvas(ctx, side): draw the scene with the 2D canvas API at side x side pixels.
  function paintSceneOnCanvas(ctx, side) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    SCENE.forEach(function (s) {
      if (typeof s.fill === 'string') {
        ctx.fillStyle = s.fill;
      } else {
        const grad = ctx.createLinearGradient(0, s.fill.y0 * side, 0, s.fill.y1 * side);
        s.fill.stops.forEach(function (st) { grad.addColorStop(st[0], st[1]); });
        ctx.fillStyle = grad;
      }
      ctx.beginPath();
      if (s.shape === 'rect') {
        ctx.rect(s.x0 * side, s.y0 * side, (s.x1 - s.x0) * side, (s.y1 - s.y0) * side);
      } else if (s.shape === 'ellipse') {
        ctx.ellipse(s.cx * side, s.cy * side, s.rx * side, s.ry * side, 0, 0, 2 * Math.PI);
      } else {
        s.pts.forEach(function (p, i) {
          if (i === 0) ctx.moveTo(p[0] * side, p[1] * side);
          else ctx.lineTo(p[0] * side, p[1] * side);
        });
        ctx.closePath();
      }
      ctx.fill();
    });
    ctx.restore();
  }

  // rasteriseScene(side): the same scene painted in pure JS (2 x 2 sub-samples per pixel); RGBA bytes.
  function rasteriseScene(side) {
    const data = new Uint8ClampedArray(side * side * 4);
    const SS = 2;
    const step = 1 / (side * SS);
    for (let y = 0; y < side; y++) {
      for (let x = 0; x < side; x++) {
        let r = 0, g = 0, b = 0;
        for (let sy = 0; sy < SS; sy++) {
          const v = (y * SS + sy + 0.5) * step;
          for (let sx = 0; sx < SS; sx++) {
            const u = (x * SS + sx + 0.5) * step;
            const s = topShapeAt(u, v);
            const c = s ? shapeColour(s, v) : [0, 0, 0];
            r += c[0]; g += c[1]; b += c[2];
          }
        }
        const k = (y * side + x) * 4;
        data[k] = Math.round(r / (SS * SS));
        data[k + 1] = Math.round(g / (SS * SS));
        data[k + 2] = Math.round(b / (SS * SS));
        data[k + 3] = 255;
      }
    }
    return data;
  }

  // canvasLooksRight(px, side): whether the canvas pixels match the scene at the probe points (a blocked or noised canvas does not).
  function canvasLooksRight(px, side) {
    for (let i = 0; i < SCENE_PROBES.length; i++) {
      const u = SCENE_PROBES[i][0], v = SCENE_PROBES[i][1];
      const x = Math.min(side - 1, Math.floor(u * side)), y = Math.min(side - 1, Math.floor(v * side));
      const s = topShapeAt((x + 0.5) / side, (y + 0.5) / side);
      const want = s ? shapeColour(s, (y + 0.5) / side) : [0, 0, 0];
      const k = (y * side + x) * 4;
      for (let c = 0; c < 3; c++) {
        if (Math.abs(px[k + c] - want[c]) > 24) return false;
      }
    }
    return true;
  }

  // addGrain(data, side): add a fixed, position-hashed grain of at most 2 levels per channel (deterministic, the same for both painters).
  function addGrain(data, side) {
    for (let y = 0; y < side; y++) {
      for (let x = 0; x < side; x++) {
        const k = (y * side + x) * 4;
        for (let c = 0; c < 3; c++) {
          let h = Math.imul(x + 1, 0x27D4EB2F) ^ Math.imul(y + 1, 0x165667B1) ^ Math.imul(c + 1, 0x61C88647);
          h ^= h >>> 15;
          h = Math.imul(h, 0x2C1B3C6D);
          h ^= h >>> 12;
          data[k + c] = data[k + c] + (((h >>> 0) % (2 * GRAIN + 1)) - GRAIN);
        }
      }
    }
  }

  // sampleImage(side=224): the drawn sample scene (sky, sun, two hills, house, tree, ball, road) at side x side; deterministic; a fresh copy each call.
  function sampleImage(side) {
    const s = checkSide(side === undefined ? 224 : side);
    let px = sampleCache[s];
    if (!px) {
      let used = 'software';
      const cv = newCanvas(s, s);
      if (cv) {
        try {
          paintSceneOnCanvas(cv.ctx, s);
          const got = new Uint8ClampedArray(cv.ctx.getImageData(0, 0, s, s).data);
          if (canvasLooksRight(got, s)) { px = got; used = 'canvas'; }
        } catch (e) {
          px = null;
        }
      }
      if (!px) px = rasteriseScene(s);
      for (let k = 3; k < px.length; k += 4) px[k] = 255;
      addGrain(px, s);
      sampleCache[s] = px;
      sampleRenderer[s] = used;
    }
    return makeImageData(s, s, new Uint8ClampedArray(px));
  }

  // sceneRenderer(side=224): 'canvas' or 'software', the painter that produced the cached sample at that side (null before the first draw).
  function sceneRenderer(side) {
    const s = side === undefined ? 224 : Math.round(side);
    return sampleRenderer[s] || null;
  }

  // ------------------------------------------------------------------ events

  const listeners = Object.create(null);

  // on(event, fn): call fn(payload) on every emit of event ('image-changed', 'theme-changed'); returns a function that unsubscribes.
  function on(event, fn) {
    if (typeof fn !== 'function') throw new TypeError('on() needs a function');
    (listeners[event] = listeners[event] || []).push(fn);
    return function () { off(event, fn); };
  }

  // off(event, fn): stop calling fn for event.
  function off(event, fn) {
    const list = listeners[event];
    if (!list) return;
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  }

  // emit(event, payload): call every listener of event; a failing listener is logged and the others still run; returns how many were called.
  function emit(event, payload) {
    const list = (listeners[event] || []).slice();
    list.forEach(function (fn) {
      try { fn(payload); } catch (err) { logError('listener for ' + event, err); }
    });
    return list.length;
  }

  // ------------------------------------------------------------------ the shared image (sample or upload)

  const imageState = { source: 'sample', upload: null, cache: Object.create(null) };

  // renderUpload(img, side): the uploaded picture centre-cropped to a square, resized to side x side over white.
  function renderUpload(img, side) {
    const cv = newCanvas(side, side);
    if (!cv) throw new Error('this browser cannot draw on a canvas');
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    if (!(w > 0 && h > 0)) throw new Error('the image has no pixels');
    const s = Math.min(w, h);
    const ctx = cv.ctx;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, side, side);
    ctx.imageSmoothingEnabled = true;
    try { ctx.imageSmoothingQuality = 'high'; } catch (e) { /* older browsers */ }
    ctx.drawImage(img, (w - s) / 2, (h - s) / 2, s, s, 0, 0, side, side);
    const data = new Uint8ClampedArray(ctx.getImageData(0, 0, side, side).data);
    for (let k = 3; k < data.length; k += 4) data[k] = 255;
    return makeImageData(side, side, data);
  }

  // currentImage(side=224): the shared image, the sample or the viewer's upload (centre-cropped and resized to side x side), as {imageData, side, name, source}; cached, treat as read-only.
  function currentImage(side) {
    const s = checkSide(side === undefined ? 224 : side);
    const key = imageState.source + ':' + s;
    let hit = imageState.cache[key];
    if (!hit) {
      const isUpload = imageState.source === 'upload' && imageState.upload;
      hit = {
        imageData: isUpload ? renderUpload(imageState.upload.img, s) : sampleImage(s),
        side: s,
        name: isUpload ? imageState.upload.name : SAMPLE_NAME,
        source: isUpload ? 'upload' : 'sample'
      };
      imageState.cache[key] = hit;
    }
    return hit;
  }

  // setUploadedImage(file): read an image file (FileReader, then an <img>, then a canvas) and make it the shared image; emits 'image-changed' and resolves, or rejects with a readable error.
  function setUploadedImage(file) {
    return new Promise(function (resolve, reject) {
      if (!file) { reject(new Error('no file was chosen')); return; }
      if (file.type && !/^image\//.test(file.type)) { reject(new Error('this file is not an image')); return; }
      if (typeof file.size === 'number' && file.size > MAX_UPLOAD_BYTES) { reject(new Error('the image is larger than 50 MB')); return; }
      if (typeof root.FileReader !== 'function' || typeof root.Image !== 'function') { reject(new Error('this browser cannot read files')); return; }
      const reader = new root.FileReader();
      reader.onerror = function () { reject(new Error('the file could not be read')); };
      reader.onload = function () {
        const img = new root.Image();
        img.onerror = function () { reject(new Error('the browser could not decode this image')); };
        img.onload = function () {
          try {
            renderUpload(img, 224);
          } catch (err) {
            reject(err);
            return;
          }
          imageState.upload = { img: img, name: file.name || 'your image' };
          imageState.source = 'upload';
          imageState.cache = Object.create(null);
          emit('image-changed', { source: 'upload', name: imageState.upload.name, width: img.naturalWidth, height: img.naturalHeight });
          resolve();
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // useSampleImage(): make the drawn sample the shared image again; emits 'image-changed'.
  function useSampleImage() {
    imageState.source = 'sample';
    imageState.cache = Object.create(null);
    emit('image-changed', { source: 'sample', name: SAMPLE_NAME });
  }

  // ------------------------------------------------------------------ patches, tokens and toy features

  // normalisePixel(r, g, b): the three bytes as the network sees them: (value / 255 - ImageNet mean) / ImageNet std, per channel.
  function normalisePixel(r, g, b) {
    return [(r / 255 - IMAGENET_MEAN[0]) / IMAGENET_STD[0], (g / 255 - IMAGENET_MEAN[1]) / IMAGENET_STD[1], (b / 255 - IMAGENET_MEAN[2]) / IMAGENET_STD[2]];
  }

  // patchGrid(imageData, patch=16): non-overlapping patch x patch tiles in row-major order; each has x (column), y (row), index = y*g + x, px/py (top-left pixel), rgb (patch*patch*3 bytes, r, g, b per pixel) and mean [r, g, b] in 0..255. A bare number is read as a blank square image of that side.
  function patchGrid(imageData, patch) {
    const p = patch === undefined ? PATCH : Math.floor(patch);
    const img = typeof imageData === 'number' ? makeImageData(checkSide(imageData), checkSide(imageData)) : imageData;
    assertImage(img);
    if (!(p >= 1)) throw new RangeError('the patch size must be at least 1 pixel');
    const W = img.width, H = img.height, d = img.data;
    const gx = Math.floor(W / p), gy = Math.floor(H / p);
    const patches = [];
    for (let row = 0; row < gy; row++) {
      for (let col = 0; col < gx; col++) {
        const rgb = new Uint8ClampedArray(p * p * 3);
        let sr = 0, sg = 0, sb = 0, o = 0;
        for (let yy = 0; yy < p; yy++) {
          let k = ((row * p + yy) * W + col * p) * 4;
          for (let xx = 0; xx < p; xx++, k += 4) {
            rgb[o++] = d[k]; rgb[o++] = d[k + 1]; rgb[o++] = d[k + 2];
            sr += d[k]; sg += d[k + 1]; sb += d[k + 2];
          }
        }
        const m = p * p;
        patches.push({
          index: row * gx + col, x: col, y: row, col: col, row: row,
          px: col * p, py: row * p, size: p, rgb: rgb, mean: [sr / m, sg / m, sb / m]
        });
      }
    }
    return { g: gx, gy: gy, n: gx * gy, patch: p, side: W, patches: patches };
  }

  // normaliseInPlace(v): divide v by its Euclidean length (a zero vector stays zero); returns v.
  function normaliseInPlace(v) {
    let s = 0;
    for (let i = 0; i < v.length; i++) s += v[i] * v[i];
    if (s > 0) {
      const inv = 1 / Math.sqrt(s);
      for (let i = 0; i < v.length; i++) v[i] *= inv;
    }
    return v;
  }

  // toyFeatures(imageData, g): per cell of a g x g grid, [mean r, mean g, mean b (0..1), luminance std, x/g, y/g, horizontal and vertical luminance gradient] with x, y the cell's column and row; each row L2-normalised (array of Float32Array(8)).
  function toyFeatures(imageData, g) {
    assertImage(imageData);
    const W = imageData.width, H = imageData.height, d = imageData.data;
    const G = g === undefined ? Math.floor(W / PATCH) : Math.floor(g);
    if (!(G >= 1) || G > Math.min(W, H)) throw new RangeError('toyFeatures needs 1 <= g <= the image side');
    const rows = [];
    for (let row = 0; row < G; row++) {
      const y0 = Math.floor(row * H / G), y1 = Math.floor((row + 1) * H / G), ym = (y0 + y1) / 2;
      for (let col = 0; col < G; col++) {
        const x0 = Math.floor(col * W / G), x1 = Math.floor((col + 1) * W / G), xm = (x0 + x1) / 2;
        let sr = 0, sg = 0, sb = 0, sy = 0, syy = 0, n = 0;
        let left = 0, nl = 0, right = 0, nr = 0, top = 0, nt = 0, bottom = 0, nb = 0;
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            const k = (y * W + x) * 4;
            const r = d[k] / 255, gg = d[k + 1] / 255, b = d[k + 2] / 255;
            const lum = LUMA[0] * r + LUMA[1] * gg + LUMA[2] * b;
            sr += r; sg += gg; sb += b; sy += lum; syy += lum * lum; n++;
            if (x + 0.5 < xm) { left += lum; nl++; } else { right += lum; nr++; }
            if (y + 0.5 < ym) { top += lum; nt++; } else { bottom += lum; nb++; }
          }
        }
        const mean = sy / n;
        const f = new Float32Array(8);
        f[0] = sr / n; f[1] = sg / n; f[2] = sb / n;
        f[3] = Math.sqrt(Math.max(0, syy / n - mean * mean));
        f[4] = col / G; f[5] = row / G;
        f[6] = (nr ? right / nr : 0) - (nl ? left / nl : 0);
        f[7] = (nb ? bottom / nb : 0) - (nt ? top / nt : 0);
        rows.push(normaliseInPlace(f));
      }
    }
    return rows;
  }

  const projectionCache = Object.create(null);

  // projectionMatrix(seed): the fixed 384 x 768 Gaussian matrix (entries with variance 1/768) for a seed, built once and cached.
  function projectionMatrix(seed) {
    const key = String(toSeed(seed));
    if (!projectionCache[key]) {
      const r = rng(seed);
      const m = new Float32Array(TOKEN_DIM * PATCH_VALUES);
      const s = 1 / Math.sqrt(PATCH_VALUES);
      for (let i = 0; i < m.length; i++) m[i] = r.normal() * s;
      projectionCache[key] = m;
    }
    return projectionCache[key];
  }

  // resamplePatchTo16(rgb): a square patch of p x p pixels (r, g, b per pixel) resized to 16 x 16, as 768 values.
  function resamplePatchTo16(rgb) {
    const p = Math.round(Math.sqrt(rgb.length / 3));
    if (p < 1 || p * p * 3 !== rgb.length) throw new RangeError('a patch needs p x p x 3 values (768 for 16 x 16)');
    const rgba = new Uint8ClampedArray(p * p * 4);
    for (let i = 0, o = 0; i < rgb.length; i += 3, o += 4) {
      rgba[o] = rgb[i]; rgba[o + 1] = rgb[i + 1]; rgba[o + 2] = rgb[i + 2]; rgba[o + 3] = 255;
    }
    return rgbaToRgb(resampleRect({ width: p, height: p, data: rgba }, 0, 0, p, p, PATCH, PATCH, false));
  }

  // toyProject(rgb768, seed=7): a toy patch embedding: the 768 bytes normalised with the ImageNet mean and std, times a fixed random 384 x 768 matrix; deterministic (other square patch sizes are resized to 16 x 16 first).
  function toyProject(rgb, seed) {
    if (!isArrayLike(rgb)) throw new TypeError('toyProject needs the patch pixels (r, g, b per pixel)');
    const px = rgb.length === PATCH_VALUES ? rgb : resamplePatchTo16(rgb);
    const W = projectionMatrix(seed === undefined ? PROJECTION_SEED : seed);
    const x = new Float64Array(PATCH_VALUES);
    for (let i = 0; i < PATCH_VALUES; i++) {
      const c = i % 3;
      x[i] = (px[i] / 255 - IMAGENET_MEAN[c]) / IMAGENET_STD[c];
    }
    const out = new Float32Array(TOKEN_DIM);
    for (let j = 0; j < TOKEN_DIM; j++) {
      let s = 0;
      const off = j * PATCH_VALUES;
      for (let i = 0; i < PATCH_VALUES; i++) s += W[off + i] * x[i];
      out[j] = s;
    }
    return out;
  }

  // positionEmbedding(index, g, dim=384): a toy sinusoidal position code: the first half encodes the row, the second half the column, sin and cos interleaved at geometric frequencies (DINO itself learns its position embeddings).
  function positionEmbedding(index, g, dim) {
    const D = dim === undefined ? TOKEN_DIM : Math.floor(dim);
    const row = Math.floor(index / g), col = index % g;
    const out = new Float32Array(D);
    const half = Math.floor(D / 2);
    for (let k = 0; k < D; k++) {
      const useRow = k < half;
      const pos = useRow ? row : col;
      const j = useRow ? k : k - half;
      const len = Math.max(1, useRow ? half : D - half);
      const omega = 1 / Math.pow(10000, (2 * Math.floor(j / 2)) / len);
      out[k] = (j % 2 === 0) ? Math.sin(pos * omega) : Math.cos(pos * omega);
    }
    return out;
  }

  // cellPixels(imageData, g, row, col): the pixels of one cell of a g x g grid resized to 16 x 16, as 768 bytes (r, g, b per pixel).
  function cellPixels(imageData, g, row, col) {
    const W = imageData.width, H = imageData.height;
    return rgbaToRgb(resampleRect(imageData, col * W / g, row * H / g, W / g, H / g, PATCH, PATCH, false));
  }

  // toyKeys(imageData, g=8, {alpha=1, seed=7}): 384-number toy keys on a g x g grid: toyProject of each cell (resized to 16 x 16) plus alpha times the cell's toyFeatures row repeated 48 times.
  function toyKeys(imageData, g, opts) {
    assertImage(imageData);
    const G = g === undefined ? 8 : Math.floor(g);
    const o = opts || {};
    const alpha = o.alpha === undefined ? 1 : o.alpha;
    const seed = o.seed === undefined ? PROJECTION_SEED : o.seed;
    const feats = toyFeatures(imageData, G);
    const keys = [];
    for (let row = 0; row < G; row++) {
      for (let col = 0; col < G; col++) {
        const k = toyProject(cellPixels(imageData, G, row, col), seed);
        const f = feats[row * G + col];
        for (let t = 0; t < TOKEN_DIM; t++) k[t] += alpha * f[t % 8];
        keys.push(k);
      }
    }
    return keys;
  }

  // labKeys(imageData, {patch=16, featureWeight=4, seed=7}): the toy keys that Labs J and K draw, as {g, n, keys}: the picture cut into patches of `patch` pixels (a g x g grid of n patches); each key is toyProject of the patch's pixels (384 numbers) with featureWeight times the patch's toyFeatures row added to its first 8 numbers.
  function labKeys(imageData, opts) {
    assertImage(imageData);
    const o = opts || {};
    const size = o.patch === undefined ? PATCH : Math.floor(o.patch);
    const weight = o.featureWeight === undefined ? 4 : Number(o.featureWeight);
    const seed = o.seed === undefined ? PROJECTION_SEED : o.seed;
    const grid = patchGrid(imageData, size);
    const feats = toyFeatures(imageData, grid.g);
    const keys = grid.patches.map(function (p, i) {
      const k = Float64Array.from(toyProject(p.rgb, seed));
      for (let t = 0; t < feats[i].length; t++) k[t] += weight * feats[i][t];
      return k;
    });
    return { g: grid.g, n: keys.length, keys: keys };
  }

  // ------------------------------------------------------------------ vector maths

  // dot(a, b): the sum of a[i] * b[i] over the common length.
  function dot(a, b) {
    const n = Math.min(a.length, b.length);
    let s = 0;
    for (let i = 0; i < n; i++) s += a[i] * b[i];
    return s;
  }

  // norm(a): the Euclidean length of a.
  function norm(a) {
    return Math.sqrt(dot(a, a));
  }

  // normalise(a): a divided by its length, as a new Float64Array; the zero vector stays zero.
  function normalise(a) {
    return normaliseInPlace(Float64Array.from(a));
  }

  // unitVector(a): a / max(|a|, 1e-12) as a new Float64Array, as torch's F.normalize does (zero stays zero).
  function unitVector(a) {
    const out = Float64Array.from(a);
    const n = Math.max(Math.sqrt(dot(out, out)), 1e-12);
    for (let i = 0; i < out.length; i++) out[i] /= n;
    return out;
  }

  // cosine(a, b): a.b / (|a| |b|) clipped to [-1, 1]; 0 when either vector is all zeros.
  function cosine(a, b) {
    if (a.length !== b.length) throw new RangeError('cosine needs two vectors of the same length');
    let s = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) { s += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
    if (na === 0 || nb === 0) return 0;
    return clamp(s / Math.sqrt(na * nb), -1, 1);
  }

  // centreRows(rows): each row minus the mean row (the per-image mean), as new Float64Array rows.
  function centreRows(rows) {
    const R = toRows(rows);
    if (R.length === 0) return R;
    const mean = new Float64Array(R[0].length);
    R.forEach(function (r) { for (let i = 0; i < r.length; i++) mean[i] += r[i] / R.length; });
    return R.map(function (r) { return r.map(function (v, i) { return v - mean[i]; }); });
  }

  // addToRows(rows, v): each row plus the vector v, as new Float64Array rows.
  function addToRows(rows, v) {
    return toRows(rows).map(function (r) { return r.map(function (x, i) { return x + v[i]; }); });
  }

  // cosineMatrix(rows): the n x n matrix of pairwise cosines, as an array of Float64Array rows.
  function cosineMatrix(rows) {
    const U = toRows(rows).map(unitVector);
    return U.map(function (a) { return Float64Array.from(U, function (b) { return clamp(dot(a, b), -1, 1); }); });
  }

  // randomUnit(dim, seed): a deterministic random direction of length 1 in dim dimensions.
  function randomUnit(dim, seed) {
    const r = rng(seed === undefined ? 1 : seed);
    const v = new Float64Array(dim);
    for (let i = 0; i < dim; i++) v[i] = r.normal();
    return normaliseInPlace(v);
  }

  // softmax(logits, temperature=1): exp(logit / T) normalised to sum 1, computed stably; a new Float64Array.
  function softmax(logits, temperature) {
    const T = temperature === undefined ? 1 : Number(temperature);
    if (!(T > 0)) throw new RangeError('softmax needs a temperature above 0');
    const n = logits.length;
    const out = new Float64Array(n);
    let mx = -Infinity;
    for (let i = 0; i < n; i++) if (logits[i] / T > mx) mx = logits[i] / T;
    let s = 0;
    for (let i = 0; i < n; i++) { out[i] = Math.exp(logits[i] / T - mx); s += out[i]; }
    for (let i = 0; i < n; i++) out[i] /= s;
    return out;
  }

  // entropy(p): -sum p ln p in nats (zero entries add nothing).
  function entropy(p) {
    let s = 0;
    for (let i = 0; i < p.length; i++) if (p[i] > 0) s -= p[i] * Math.log(p[i]);
    return s;
  }

  // crossEntropy(pTeacher, pStudent): -sum pTeacher * ln pStudent in nats; terms where the teacher gives 0 add nothing.
  function crossEntropy(pt, ps) {
    if (pt.length !== ps.length) throw new RangeError('crossEntropy needs two distributions of the same length');
    let s = 0;
    for (let i = 0; i < pt.length; i++) {
      if (pt[i] > 0) s -= pt[i] * Math.log(Math.max(ps[i], Number.MIN_VALUE));
    }
    return s;
  }

  // ema(teacher, student, m): m * teacher + (1 - m) * student elementwise, for numbers or arrays; returns a new value and leaves the inputs alone.
  function ema(teacher, student, m) {
    if (!(m >= 0 && m <= 1)) throw new RangeError('the EMA momentum must lie in [0, 1]');
    if (typeof teacher === 'number') return m * teacher + (1 - m) * student;
    const n = teacher.length;
    const out = ArrayBuffer.isView(teacher) ? new teacher.constructor(n) : new Array(n);
    for (let i = 0; i < n; i++) out[i] = m * teacher[i] + (1 - m) * (typeof student === 'number' ? student : student[i]);
    return out;
  }

  // ------------------------------------------------------------------ neighbours and positive selection

  // checkGrid(index, g): throw unless g is an integer of at least 3 and 0 <= index < g*g.
  function checkGrid(index, g) {
    if (!(Number.isInteger(g) && g >= 3)) throw new RangeError('the grid side g must be an integer of at least 3');
    if (!(Number.isInteger(index) && index >= 0 && index < g * g)) throw new RangeError('the patch index must lie in 0 .. g*g-1');
  }

  // neighbours8(index, g, wrap=true): the 8 cells of the 3 x 3 window around index on a g x g grid, in increasing flat index; wrap=true wraps around the border as the official table does, wrap=false drops cells beyond it.
  function neighbours8(index, g, wrap) {
    checkGrid(index, g);
    const w = wrap !== false;
    const r = Math.floor(index / g), c = index % g;
    const out = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        let rr = r + dr, cc = c + dc;
        if (w) {
          rr = (rr + g) % g;
          cc = (cc + g) % g;
        } else if (rr < 0 || rr >= g || cc < 0 || cc >= g) {
          continue;
        }
        out.push(rr * g + cc);
      }
    }
    return out.sort(function (a, b) { return a - b; });
  }

  // neighbourInfo(index, g): the 8 wrapped neighbours as {index, row, col, dr, dc, wrapped}, in the same order as neighbours8.
  function neighbourInfo(index, g) {
    checkGrid(index, g);
    const r = Math.floor(index / g), c = index % g;
    const out = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const rr = r + dr, cc = c + dc;
        const wrapped = rr < 0 || rr >= g || cc < 0 || cc >= g;
        const row = (rr + g) % g, col = (cc + g) % g;
        out.push({ index: row * g + col, row: row, col: col, dr: dr, dc: dc, wrapped: wrapped });
      }
    }
    return out.sort(function (a, b) { return a.index - b.index; });
  }

  // neighbourSims(rows, g): for every anchor, the cosines to its 8 wrapped window neighbours in neighbours8 order (an n x 8 array of Float64Array).
  function neighbourSims(rows, g) {
    const n = rows.length;
    if (g * g !== n) throw new RangeError('neighbourSims needs g*g rows');
    const out = [];
    for (let i = 0; i < n; i++) {
      const nb = neighbours8(i, g);
      const s = new Float64Array(8);
      for (let j = 0; j < 8; j++) s[j] = cosine(rows[i], rows[nb[j]]);
      out.push(s);
    }
    return out;
  }

  // rankRow(values): the column indices sorted by value, largest first, ties to the lower index, NaN last.
  function rankRow(values) {
    const idx = [];
    for (let j = 0; j < values.length; j++) idx.push(j);
    idx.sort(function (a, b) {
      const va = values[a], vb = values[b];
      const na = va !== va, nb = vb !== vb;
      if (na || nb) return (na && nb) ? a - b : (na ? 1 : -1);
      if (va > vb) return -1;
      if (va < vb) return 1;
      return a - b;
    });
    return idx;
  }

  // quantile(values, q): torch.quantile's 'linear' rule: sort, then interpolate at position q*(N-1); non-finite values are dropped; NaN when none is left.
  function quantile(values, q) {
    if (!(q >= 0 && q <= 1)) throw new RangeError('the quantile level q must lie in [0, 1]');
    const flat = flattenFinite(values);
    const N = flat.length;
    if (N === 0) return NaN;
    const s = Float64Array.from(flat).sort();
    const pos = q * (N - 1);
    const lo = Math.floor(pos), hi = Math.min(lo + 1, N - 1);
    return s[lo] + (s[hi] - s[lo]) * (pos - lo);
  }

  // applyThreshold(rows, t): mask (s >= t, inclusive) and degree for rows of window similarities; NaN never passes.
  function applyThreshold(rows, t) {
    const n = rows.length, w = n ? rows[0].length : 8;
    const mask = new Uint8Array(n * w);
    const degree = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < w; j++) {
        if (rows[i][j] >= t) { mask[i * w + j] = 1; degree[i]++; }
      }
    }
    return { mask: mask, degree: degree };
  }

  // selectPositives(sims, rule, {k=4, q=0.5, pools}): positives among each anchor's window candidates (n x 8). 'row': the anchor's own top k, ties to the lower index. 'image': one q-quantile over this crop's n x 8 values, s >= t. 'batch': one q-quantile over the concatenation of pools (this crop alone when no pools), s >= t.
  function selectPositives(sims, rule, opts) {
    const o = opts || {};
    const rows = toRows(sims, 8);
    const n = rows.length;
    const w = n ? rows[0].length : 8;
    const k = o.k === undefined ? 4 : o.k;
    const q = o.q === undefined ? 0.5 : o.q;
    const ranking = new Int32Array(n * w);
    rows.forEach(function (row, i) { rankRow(row).forEach(function (j, r) { ranking[i * w + r] = j; }); });
    let mask, degree, threshold = null, perPool = null;
    const thresholds = new Float64Array(n);
    if (rule === 'row') {
      const kk = clamp(Math.floor(k), 0, w);
      mask = new Uint8Array(n * w);
      degree = new Int32Array(n);
      for (let i = 0; i < n; i++) {
        for (let r = 0; r < kk; r++) mask[i * w + ranking[i * w + r]] = 1;
        degree[i] = kk;
        thresholds[i] = kk > 0 ? rows[i][ranking[i * w + kk - 1]] : NaN;
      }
    } else if (rule === 'image' || rule === 'batch') {
      const usePools = rule === 'batch' && o.pools && o.pools.length > 0;
      threshold = quantile(usePools ? o.pools : rows, q);
      const applied = applyThreshold(rows, threshold);
      mask = applied.mask;
      degree = applied.degree;
      thresholds.fill(threshold);
      if (usePools) perPool = o.pools.map(function (p) { return applyThreshold(toRows(p, w), threshold); });
    } else {
      throw new RangeError("the rule must be 'row', 'image' or 'batch'");
    }
    let empty = 0, total = 0;
    for (let i = 0; i < n; i++) { total += degree[i]; if (degree[i] === 0) empty++; }
    return {
      rule: rule, k: k, q: q, n: n, width: w, mask: mask, degree: degree, threshold: threshold,
      thresholds: thresholds, ranking: ranking, empty: empty, meanDegree: n ? total / n : NaN, perPool: perPool
    };
  }

  // ------------------------------------------------------------------ eigenvectors, normalised cut and MaskCut

  // eigSym(matrix): eigenvalues (ascending, Float64Array) and unit eigenvectors of a symmetric n x n matrix (n <= 100 intended) by cyclic Jacobi rotations, run until the off-diagonal mass is below 1e-14 of the matrix norm; vectors[i][j] is component i of eigenvector j (the columns), columns[j] the same vector on its own; each vector's largest entry is made positive.
  function eigSym(matrix) {
    const a = toSquare(matrix);
    const n = a.length;
    const v = [];
    for (let i = 0; i < n; i++) { const row = new Float64Array(n); row[i] = 1; v.push(row); }
    let finite = true;
    for (let i = 0; i < n && finite; i++) {
      for (let j = 0; j < n; j++) if (!isFinite(a[i][j])) { finite = false; break; }
    }
    let sweeps = 0;
    if (finite) {
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) { const s = 0.5 * (a[i][j] + a[j][i]); a[i][j] = s; a[j][i] = s; }
      }
      let fro = 0;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) fro += a[i][j] * a[i][j];
      const stopAt = 1e-14 * Math.sqrt(fro);
      for (let sweep = 1; sweep <= 60; sweep++) {
        let sm = 0;
        for (let p = 0; p < n - 1; p++) for (let q = p + 1; q < n; q++) sm += Math.abs(a[p][q]);
        if (sm === 0 || sm <= stopAt) break;
        sweeps = sweep;
        const tresh = sweep < 4 ? 0.2 * sm / (n * n) : 0;
        for (let p = 0; p < n - 1; p++) {
          for (let q = p + 1; q < n; q++) {
            const apq = a[p][q];
            const g = 100 * Math.abs(apq);
            if (sweep > 4 && Math.abs(a[p][p]) + g === Math.abs(a[p][p]) && Math.abs(a[q][q]) + g === Math.abs(a[q][q])) {
              a[p][q] = 0; a[q][p] = 0;
            } else if (Math.abs(apq) > tresh) {
              const h = a[q][q] - a[p][p];
              let t;
              if (Math.abs(h) + g === Math.abs(h)) {
                t = apq / h;
              } else {
                const theta = 0.5 * h / apq;
                t = 1 / (Math.abs(theta) + Math.sqrt(1 + theta * theta));
                if (theta < 0) t = -t;
              }
              const c = 1 / Math.sqrt(1 + t * t), s = t * c, tau = s / (1 + c);
              a[p][p] -= t * apq;
              a[q][q] += t * apq;
              a[p][q] = 0; a[q][p] = 0;
              for (let k = 0; k < n; k++) {
                if (k === p || k === q) continue;
                const akp = a[k][p], akq = a[k][q];
                const nkp = akp - s * (akq + tau * akp);
                const nkq = akq + s * (akp - tau * akq);
                a[k][p] = nkp; a[p][k] = nkp;
                a[k][q] = nkq; a[q][k] = nkq;
              }
              for (let k = 0; k < n; k++) {
                const vkp = v[k][p], vkq = v[k][q];
                v[k][p] = vkp - s * (vkq + tau * vkp);
                v[k][q] = vkq + s * (vkp - tau * vkq);
              }
            }
          }
        }
      }
    }
    const order = [];
    for (let i = 0; i < n; i++) order.push(i);
    const diag = order.map(function (i) { return finite ? a[i][i] : NaN; });
    order.sort(function (x, y) { return (diag[x] - diag[y]) || (x - y); });
    const values = new Float64Array(n);
    const columns = [];
    order.forEach(function (src, j) {
      values[j] = diag[src];
      const col = new Float64Array(n);
      let big = -1, at = 0;
      for (let i = 0; i < n; i++) {
        col[i] = v[i][src];
        if (Math.abs(col[i]) > big) { big = Math.abs(col[i]); at = i; }
      }
      if (col[at] < 0) for (let i = 0; i < n; i++) col[i] = -col[i];
      columns.push(col);
    });
    const vectors = [];
    for (let i = 0; i < n; i++) vectors.push(Float64Array.from(columns, function (col) { return col[i]; }));
    return { values: values, vectors: vectors, columns: columns, sweeps: sweeps, finite: finite };
  }

  // ncut(affinity, eps=1e-5): the normalised cut of a symmetric affinity A: D = diag(A 1); solve D^-1/2 (D - A) D^-1/2 u = lambda u with eigSym and set v = D^-1/2 u. Returns v2, lambda2, lambda3, all eigenvalues, the degrees and degenerate (fewer than 3 eigenvalues, a non-finite value, or |lambda3 - lambda2| < 1e-8). A node with no weight at all gets degree eps.
  function ncut(affinity, eps) {
    const e = eps === undefined ? DEFAULT_EPS : eps;
    const A = toSquare(affinity);
    const n = A.length;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) { const s = 0.5 * (A[i][j] + A[j][i]); A[i][j] = s; A[j][i] = s; }
    }
    const degrees = new Float64Array(n);
    let floored = 0;
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let j = 0; j < n; j++) s += A[i][j];
      if (!(s > 0)) { s = e; floored++; }
      degrees[i] = s;
    }
    const r = degrees.map(function (x) { return 1 / Math.sqrt(x); });
    const L = [];
    for (let i = 0; i < n; i++) {
      const row = new Float64Array(n);
      for (let j = 0; j < n; j++) row[j] = ((i === j ? degrees[i] : 0) - A[i][j]) * r[i] * r[j];
      L.push(row);
    }
    const eig = eigSym(L);
    const values = eig.values;
    const u2 = n >= 2 ? eig.columns[1] : new Float64Array(n);
    const v2 = new Float64Array(n);
    for (let i = 0; i < n; i++) v2[i] = u2[i] * r[i];
    const lambda2 = n >= 2 ? values[1] : NaN;
    const lambda3 = n >= 3 ? values[2] : NaN;
    let finite = eig.finite;
    for (let i = 0; i < Math.min(3, n); i++) if (!isFinite(values[i])) finite = false;
    for (let i = 0; i < n; i++) if (!isFinite(v2[i])) finite = false;
    const degenerate = n < 3 || !finite || Math.abs(lambda3 - lambda2) < DEGENERATE_GAP;
    return { v2: v2, lambda2: lambda2, lambda3: lambda3, degenerate: degenerate, values: values, degrees: degrees, u2: u2, floored: floored };
  }

  // argmaxOf(v, sign): numpy's argmax of sign * v (sign 0: of |v|): the first index holding the largest value, so exact ties go to the lower index.
  function argmaxOf(v, sign) {
    let best = -Infinity, at = 0;
    for (let i = 0; i < v.length; i++) {
      const x = sign === 0 ? Math.abs(v[i]) : sign * v[i];
      if (x > best) { best = x; at = i; }
    }
    return at;
  }

  // componentOf(fg, seed, rows, cols): the 4-connected foreground component that contains seed (scipy.ndimage.label's default cross); if seed is background, every background cell, as the official label lookup gives.
  function componentOf(fg, seed, rows, cols) {
    const N = rows * cols;
    const out = new Uint8Array(N);
    if (!fg[seed]) {
      for (let c = 0; c < N; c++) out[c] = fg[c] ? 0 : 1;
      return out;
    }
    const stack = [seed];
    out[seed] = 1;
    while (stack.length) {
      const c = stack.pop();
      const r = Math.floor(c / cols), q = c % cols;
      const next = [];
      if (r > 0) next.push(c - cols);
      if (r < rows - 1) next.push(c + cols);
      if (q > 0) next.push(c - 1);
      if (q < cols - 1) next.push(c + 1);
      for (let i = 0; i < next.length; i++) {
        const m = next[i];
        if (fg[m] && !out[m]) { out[m] = 1; stack.push(m); }
      }
    }
    return out;
  }

  // countOnes(mask): how many cells are set.
  function countOnes(mask) {
    let s = 0;
    for (let i = 0; i < mask.length; i++) if (mask[i]) s++;
    return s;
  }

  // maskIoU(a, b): intersection over union of two binary masks; NaN when both are empty (as TokenCut's metric gives).
  function maskIoU(a, b) {
    let inter = 0, uni = 0;
    for (let i = 0; i < a.length; i++) {
      if (a[i] && b[i]) inter++;
      if (a[i] || b[i]) uni++;
    }
    return uni === 0 ? NaN : inter / uni;
  }

  // meanOffDiagonal(A, mask): the mean affinity between distinct cells of the mask, clipped to [0, 1]; 0 for fewer than two cells.
  function meanOffDiagonal(A, mask) {
    const idx = [];
    for (let i = 0; i < mask.length; i++) if (mask[i]) idx.push(i);
    const k = idx.length;
    if (k < 2) return 0;
    let s = 0;
    for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) if (a !== b) s += A[idx[a]][idx[b]];
    return clamp(s / (k * (k - 1)), 0, 1);
  }

  // maskcut(keys, {tau=0.2, n=3, eps=1e-5, g or rows and cols, overlapIoU=0.5, minArea=0.01, onDegenerate='keep_prior'}): our decoder's MaskCut loop (src/decoder_v2.py) on n x d keys laid out row-major on a grid. Returns the kept masks with their scores (1 - lambda2 clipped to [0, 1]), the decoder's per-slot status and slotMasks, and one record per stage run. v2's sign is fixed by eigSym; when the corner rule fires, the official loop's answer can depend on that sign.
  function maskcut(keys, opts) {
    const o = Object.assign({ tau: 0.2, n: 3, eps: DEFAULT_EPS, overlapIoU: 0.5, minArea: 0.01, onDegenerate: 'keep_prior' }, opts || {});
    let x = toRows(keys, o.d);
    const N = x.length;
    let rows, cols;
    if (o.rows && o.cols) { rows = o.rows; cols = o.cols; } else { rows = cols = o.g || Math.round(Math.sqrt(N)); }
    if (!(rows * cols === N && N >= 1)) throw new RangeError('a ' + rows + ' x ' + cols + ' grid does not match ' + N + ' keys');
    const stages = [];
    const claimed = new Uint8Array(N);
    const painting = new Uint8Array(N);
    let current = null;
    let degenerate = false, degenerateStage = null, failure = null;
    for (let i = 0; i < o.n; i++) {
      let work = x;
      if (i > 0) {
        for (let c = 0; c < N; c++) painting[c] = (painting[c] + current[c]) > 0 ? 1 : 0;
        work = x.map(function (row, c) { return painting[c] ? new Float64Array(row.length) : row; });
      }
      const unit = work.map(unitVector);
      const cosines = [], A = [];
      let above = 0;
      for (let a = 0; a < N; a++) {
        const ca = new Float64Array(N), aa = new Float64Array(N);
        for (let b = 0; b < N; b++) {
          const cv = dot(unit[a], unit[b]);
          ca[b] = cv;
          if (cv > o.tau) { aa[b] = 1; above++; } else { aa[b] = o.eps; }
        }
        cosines.push(ca);
        A.push(aa);
      }
      const cut = ncut(A, o.eps);
      const record = {
        stage: i, status: 'ok', cosines: cosines, affinity: A, density: above / (N * N), painted: Uint8Array.from(painting),
        values: cut.values, lambda1: cut.values[0], lambda2: cut.lambda2, lambda3: cut.lambda3, v2: cut.v2, degenerate: cut.degenerate,
        seed: null, reversed: false, cornersForeground: null, foreground: null, component: null,
        mask: new Uint8Array(N), score: 0, affinityScore: 0, orderScore: 0
      };
      if (cut.degenerate) {
        record.status = 'degenerate';
        degenerate = true;
        degenerateStage = i;
        stages.push(record);
        if (i === 0 || o.onDegenerate === 'discard_all') {
          failure = 'degenerate_spectrum';
          stages.forEach(function (st) { st.status = 'degenerate'; st.mask = new Uint8Array(N); st.score = 0; st.affinityScore = 0; st.orderScore = 0; });
        }
        break;
      }
      const v2 = cut.v2;
      let mean = 0;
      for (let c = 0; c < N; c++) mean += v2[c];
      mean /= N;
      const fg = new Uint8Array(N);
      for (let c = 0; c < N; c++) fg[c] = v2[c] > mean ? 1 : 0;
      let seed = argmaxOf(v2, 0);
      const nc = fg[0] + fg[cols - 1] + fg[(rows - 1) * cols] + fg[N - 1];
      const reverse = nc >= 3 ? true : fg[seed] !== 1;
      if (reverse) {
        for (let c = 0; c < N; c++) fg[c] = fg[c] ? 0 : 1;
        seed = argmaxOf(v2, -1);
      } else {
        seed = argmaxOf(v2, 1);
      }
      const component = componentOf(fg, seed, rows, cols);
      let pseudo = component;
      if (i >= 1) {
        if (maskIoU(current, pseudo) > o.overlapIoU) { record.status = 'overlap'; pseudo = new Uint8Array(N); }
        else if (countOnes(pseudo) / N <= o.minArea) { record.status = 'small'; pseudo = new Uint8Array(N); }
      }
      current = pseudo;
      const mask = new Uint8Array(N);
      let added = 0;
      for (let c = 0; c < N; c++) if (pseudo[c] && !claimed[c]) { mask[c] = 1; added++; }
      if (record.status === 'ok' && added === 0) record.status = 'empty';
      for (let c = 0; c < N; c++) if (mask[c]) claimed[c] = 1;
      record.seed = seed;
      record.reversed = reverse;
      record.cornersForeground = nc;
      record.foreground = fg;
      record.component = component;
      record.mask = mask;
      if (added > 0) {
        record.score = clamp(1 - cut.lambda2, 0, 1);
        record.orderScore = 1 - 0.1 * i;
        record.affinityScore = meanOffDiagonal(A, mask);
      }
      stages.push(record);
      x = work;
    }
    const kept = stages.filter(function (st) { return st.status === 'ok'; });
    const status = [], slotMasks = [];
    for (let i = 0; i < o.n; i++) {
      if (failure) { status.push('degenerate'); slotMasks.push(new Uint8Array(N)); continue; }
      status.push(i < stages.length ? stages[i].status : 'not_run');
      slotMasks.push(i < stages.length ? stages[i].mask : new Uint8Array(N));
    }
    return {
      masks: kept.map(function (st) { return st.mask; }),
      scores: kept.map(function (st) { return st.score; }),
      stages: stages, status: status, slotMasks: slotMasks,
      degenerate: degenerate, degenerateStage: degenerateStage, failure: failure,
      grid: { rows: rows, cols: cols }, n: o.n, tau: o.tau
    };
  }

  // ------------------------------------------------------------------ multi-crop views

  // sampleCrop(r, side, scale, ratio, kind, index, out): one RandomResizedCrop rectangle drawn as torchvision draws it (10 tries, then the whole image).
  function sampleCrop(r, side, scale, ratio, kind, index, out) {
    const area = side * side;
    const logLo = Math.log(ratio[0]), logHi = Math.log(ratio[1]);
    for (let attempt = 1; attempt <= 10; attempt++) {
      const target = area * r.uniform(scale[0], scale[1]);
      const aspect = Math.exp(r.uniform(logLo, logHi));
      const w = Math.round(Math.sqrt(target * aspect));
      const h = Math.round(Math.sqrt(target / aspect));
      if (w > 0 && h > 0 && w <= side && h <= side) {
        const y = r.int(side - h + 1);
        const x = r.int(side - w + 1);
        return { x: x, y: y, w: w, h: h, kind: kind, index: index, out: out, side: side, scale: (w * h) / area, ratio: w / h, attempts: attempt, fallback: false };
      }
    }
    return { x: 0, y: 0, w: side, h: side, kind: kind, index: index, out: out, side: side, scale: 1, ratio: 1, attempts: 10, fallback: true };
  }

  // cropSampler(rng, side, {globalScale=[0.25, 1], localScale=[0.05, 0.25], nGlobal=2, nLocal=8, globalSize=224, localSize=96}): the multi-crop rectangles on a side x side image, as {globals, locals, all}.
  function cropSampler(rngArg, side, opts) {
    const o = Object.assign({
      globalScale: CONSTANTS.globalScale, localScale: CONSTANTS.localScale, ratio: CONSTANTS.cropRatio,
      nGlobal: CONSTANTS.nGlobal, nLocal: CONSTANTS.nLocal, globalSize: CONSTANTS.globalSize, localSize: CONSTANTS.localSize
    }, opts || {});
    const r = toRng(rngArg);
    const s = checkSide(side === undefined ? 224 : side);
    const globals = [], locals = [];
    for (let i = 0; i < o.nGlobal; i++) globals.push(sampleCrop(r, s, o.globalScale, o.ratio, 'global', i, o.globalSize));
    for (let i = 0; i < o.nLocal; i++) locals.push(sampleCrop(r, s, o.localScale, o.ratio, 'local', i, o.localSize));
    return { globals: globals, locals: locals, all: globals.concat(locals) };
  }

  // boxBlur(data, w, h, radius): one horizontal and one vertical box-filter pass of the given radius over RGBA data, in place (edges clamp).
  function boxBlur(data, w, h, radius) {
    const tmp = new Float64Array(w * h * 3);
    const span = 2 * radius + 1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        for (let c = 0; c < 3; c++) {
          let s = 0;
          for (let d = -radius; d <= radius; d++) s += data[(y * w + clamp(x + d, 0, w - 1)) * 4 + c];
          tmp[(y * w + x) * 3 + c] = s / span;
        }
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        for (let c = 0; c < 3; c++) {
          let s = 0;
          for (let d = -radius; d <= radius; d++) s += tmp[(clamp(y + d, 0, h - 1) * w + x) * 3 + c];
          data[(y * w + x) * 4 + c] = Math.round(s / span);
        }
      }
    }
  }

  // augment(imageData, rect, outSide, {flip, jitter, grey, blur, solarise, mode}, rng): the crop rect resized to outSide x outSide, then the switched-on augmentations in DINO's order (flip, colour jitter as per-channel gain and brightness, greyscale, box blur, solarise on the second global crop only). mode 'always' (default) applies each switched-on one; mode 'recipe' applies it with DINO's probability. Returns ImageData with .applied.
  function augment(imageData, rect, outSide, flags, rngArg) {
    assertImage(imageData);
    const f = flags || {};
    const r = toRng(rngArg);
    const out = Math.round(outSide || rect.out || 224);
    const u = {
      flip: r.next(), jitter: r.next(), gainR: r.next(), gainG: r.next(), gainB: r.next(), bright: r.next(),
      grey: r.next(), blur: r.next(), sigma: r.next(), solar: r.next()
    };
    const P = CONSTANTS.recipeProbabilities;
    const recipe = f.mode === 'recipe';
    const secondGlobal = rect.kind === 'global' && rect.index === 1;
    const pBlur = rect.kind === 'global' ? (rect.index === 0 ? P.blurGlobal1 : P.blurGlobal2) : P.blurLocal;
    const doFlip = !!f.flip && (!recipe || u.flip < P.flip);
    const doJitter = !!f.jitter && (!recipe || u.jitter < P.jitter);
    const doGrey = !!f.grey && (!recipe || u.grey < P.grey);
    const doBlur = !!f.blur && (!recipe || u.blur < pBlur);
    const doSolar = !!f.solarise && secondGlobal && (!recipe || u.solar < P.solariseGlobal2);
    const k = imageData.width / (rect.side || imageData.width);
    const data = resampleRect(imageData, rect.x * k, rect.y * k, rect.w * k, rect.h * k, out, out, doFlip);
    let jitter = null, blur = null;
    if (doJitter) {
      const G = CONSTANTS.jitterGain, B = CONSTANTS.jitterBrightness;
      const gains = [G[0] + (G[1] - G[0]) * u.gainR, G[0] + (G[1] - G[0]) * u.gainG, G[0] + (G[1] - G[0]) * u.gainB];
      const brightness = B[0] + (B[1] - B[0]) * u.bright;
      for (let i = 0; i < data.length; i += 4) {
        data[i] = data[i] * gains[0] * brightness;
        data[i + 1] = data[i + 1] * gains[1] * brightness;
        data[i + 2] = data[i + 2] * gains[2] * brightness;
      }
      jitter = { gains: gains, brightness: brightness };
    }
    if (doGrey) {
      for (let i = 0; i < data.length; i += 4) {
        const yv = LUMA[0] * data[i] + LUMA[1] * data[i + 1] + LUMA[2] * data[i + 2];
        data[i] = yv; data[i + 1] = yv; data[i + 2] = yv;
      }
    }
    if (doBlur) {
      const S = CONSTANTS.blurSigma;
      const sigma = S[0] + (S[1] - S[0]) * u.sigma;
      const radius = Math.max(1, Math.round(sigma));
      boxBlur(data, out, out, radius);
      blur = { sigma: sigma, radius: radius };
    }
    if (doSolar) {
      const T = CONSTANTS.solariseThreshold;
      for (let i = 0; i < data.length; i += 4) {
        for (let c = 0; c < 3; c++) if (data[i + c] >= T) data[i + c] = 255 - data[i + c];
      }
    }
    const result = makeImageData(out, out, data);
    try {
      result.applied = { mode: recipe ? 'recipe' : 'always', flip: doFlip, jitter: jitter, grey: doGrey, blur: blur, solarise: doSolar };
    } catch (e) { /* a sealed object keeps no note */ }
    return result;
  }

  // ------------------------------------------------------------------ schedules

  // cosineMomentum(step, totalSteps, base=0.996, final=1): DINO's teacher momentum at step: final - (final - base) * (1 + cos(pi * step / totalSteps)) / 2.
  function cosineMomentum(step, totalSteps, base, final) {
    const b = base === undefined ? 0.996 : base;
    const f = final === undefined ? 1 : final;
    return f - (f - b) * (1 + Math.cos(Math.PI * step / totalSteps)) / 2;
  }

  // teacherRemaining(steps, {m=0.9995, schedule='constant', totalSteps}): the share of the step-0 teacher left after `steps` EMA updates: m^steps, or with schedule 'cosine' the product of the momenta of a totalSteps-long cosine schedule from m to 1.
  function teacherRemaining(steps, opts) {
    const o = opts || {};
    const m = o.m === undefined ? 0.9995 : o.m;
    if (o.schedule !== 'cosine') return Math.pow(m, steps);
    const T = o.totalSteps || steps;
    let logSum = 0;
    for (let s = 0; s < steps; s++) logSum += Math.log(cosineMomentum(s, T, m, 1));
    return Math.exp(logSum);
  }

  // warmupCosine(t, {peak, total, start=0, warmup=0, delay=0, final=0}): a learning rate at time t: start until delay, then linear to peak over warmup, then cosine from peak down to final at total.
  function warmupCosine(t, opts) {
    const o = opts || {};
    const delay = o.delay || 0, warm = o.warmup || 0, start = o.start || 0, fin = o.final || 0;
    if (t < delay) return start;
    if (t < delay + warm) return start + (o.peak - start) * (t - delay) / warm;
    const span = Math.max(1e-12, o.total - delay - warm);
    const p = clamp((t - delay - warm) / span, 0, 1);
    return fin + (o.peak - fin) * (1 + Math.cos(Math.PI * p)) / 2;
  }

  // ------------------------------------------------------------------ colours and numbers

  const THEME_KEYS = ['paper', 'ink', 'muted', 'line', 'student', 'teacher', 'positive', 'negative', 'ignored'];
  const THEME_LIGHT = {
    paper: '#EEF1F4', ink: '#14181D', muted: '#4C5661', line: '#C9D1DA',
    student: '#2A7F62', teacher: '#1F6FB2', positive: '#E4572E', negative: '#7A3E9D', ignored: '#9AA5B1'
  };
  const THEME_DARK = {
    paper: '#0F1418', ink: '#ECEFF3', muted: '#A6B0BB', line: '#2A343E',
    student: '#43B18D', teacher: '#579FDB', positive: '#F17855', negative: '#B47DD4', ignored: '#6A7581'
  };

  // prefersDark(): whether the page shows its dark palette: data-theme on the root element wins, otherwise the system setting.
  function prefersDark() {
    try {
      const d = root.document;
      const forced = d && d.documentElement && typeof d.documentElement.getAttribute === 'function' ? d.documentElement.getAttribute('data-theme') : null;
      if (forced === 'dark') return true;
      if (forced === 'light') return false;
      return !!(typeof root.matchMedia === 'function' && root.matchMedia('(prefers-color-scheme: dark)').matches);
    } catch (e) {
      return false;
    }
  }

  // parseColour(c): [r, g, b, a] (bytes, alpha 0..1) for #rgb, #rrggbb, #rrggbbaa, rgb() and rgba(); null for anything else.
  function parseColour(c) {
    const s = String(c || '').trim();
    let m = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(s);
    if (m) {
      let h = m[1];
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), a];
    }
    m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i.exec(s);
    if (m) {
      let a = 1;
      if (m[4] !== undefined) a = m[4].slice(-1) === '%' ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
      return [Math.round(Number(m[1])), Math.round(Number(m[2])), Math.round(Number(m[3])), a];
    }
    return null;
  }

  // rgba(colour, alpha): the colour at the given opacity as an rgba() string (returned unchanged when it cannot be parsed).
  function rgba(colour, alpha) {
    const p = parseColour(colour);
    if (!p) return colour;
    return 'rgba(' + p[0] + ', ' + p[1] + ', ' + p[2] + ', ' + clamp(Number(alpha), 0, 1) + ')';
  }

  // mix(a, b, t): the colour t of the way from a to b (t = 0 gives a, t = 1 gives b), as an rgb() string.
  function mix(a, b, t) {
    const p = parseColour(a) || [0, 0, 0, 1], q = parseColour(b) || [255, 255, 255, 1];
    const w = clamp(Number(t) || 0, 0, 1);
    return 'rgb(' + Math.round(p[0] + (q[0] - p[0]) * w) + ', ' + Math.round(p[1] + (q[1] - p[1]) * w) + ', ' + Math.round(p[2] + (q[2] - p[2]) * w) + ')';
  }

  // isDarkColour(c): true when the colour's relative luminance is below 0.35 (false when it cannot be parsed).
  function isDarkColour(c) {
    const p = parseColour(c);
    if (!p) return false;
    // lin(x): an sRGB byte converted to linear light.
    function lin(x) { const v = x / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
    return 0.2126 * lin(p[0]) + 0.7152 * lin(p[1]) + 0.0722 * lin(p[2]) < 0.35;
  }

  // theme(): the nine colour tokens (--paper, --ink, --muted, --line, --student, --teacher, --positive, --negative, --ignored) read from the page's CSS, with the design's values as fallbacks; plus dark (true on a dark ground).
  function theme() {
    const base = prefersDark() ? THEME_DARK : THEME_LIGHT;
    let cs = null;
    try {
      const d = root.document;
      if (d && d.documentElement && typeof root.getComputedStyle === 'function') cs = root.getComputedStyle(d.documentElement);
    } catch (e) {
      cs = null;
    }
    const out = {};
    THEME_KEYS.forEach(function (k) {
      let v = '';
      if (cs) {
        try { v = String(cs.getPropertyValue('--' + k) || '').trim(); } catch (e) { v = ''; }
      }
      out[k] = v || base[k];
    });
    out.dark = isDarkColour(out.paper);
    return out;
  }

  // superscript(k): the integer k written with Unicode superscript digits and minus sign.
  function superscript(k) {
    const digits = ['\u2070', '\u00B9', '\u00B2', '\u00B3', '\u2074', '\u2075', '\u2076', '\u2077', '\u2078', '\u2079'];
    const s = String(Math.abs(k)).split('').map(function (ch) { return digits[Number(ch)]; }).join('');
    return (k < 0 ? '\u207B' : '') + s;
  }

  // fmt(n, digits): n with `digits` decimals (default 0 for integers, 3 otherwise), commas between thousands (as the page's copy and fact sheets write them; design.md section 6 first asked for thin spaces) and a true minus sign; 'n/a' for a missing value.
  function fmt(n, digits) {
    const x = Number(n);
    if (n === null || n === undefined || x !== x) return 'n/a';
    if (!isFinite(x)) return x > 0 ? '\u221E' : MINUS + '\u221E';
    const dg = digits === undefined ? (Number.isInteger(x) ? 0 : 3) : clamp(Math.floor(digits), 0, 20);
    const s = Math.abs(x).toFixed(dg);
    const parts = s.split('.');
    const whole = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const body = parts.length > 1 ? whole + '.' + parts[1] : whole;
    const isZero = /^[0.]*$/.test(s);
    return (x < 0 && !isZero ? MINUS : '') + body;
  }

  // fmtSci(n, digits=1): n as a mantissa with `digits` decimals times a power of ten, for example 1.0 x 10^-4 written with a real times sign and superscripts; 0 prints as 0.
  function fmtSci(n, digits) {
    const x = Number(n);
    if (x !== x || !isFinite(x)) return fmt(x);
    if (x === 0) return '0';
    const dg = digits === undefined ? 1 : clamp(Math.floor(digits), 0, 15);
    let e = Math.floor(Math.log10(Math.abs(x)));
    let m = x / Math.pow(10, e);
    if (Math.abs(Number(m.toFixed(dg))) >= 10) { e += 1; m = x / Math.pow(10, e); }
    return fmt(m, dg) + ' \u00D7 10' + superscript(e);
  }

  // ------------------------------------------------------------------ DOM helpers

  const SVG_TAGS = {
    svg: 1, g: 1, path: 1, rect: 1, circle: 1, ellipse: 1, line: 1, polyline: 1, polygon: 1, text: 1, tspan: 1,
    textPath: 1, defs: 1, marker: 1, clipPath: 1, linearGradient: 1, radialGradient: 1, stop: 1, use: 1,
    pattern: 1, mask: 1, symbol: 1, foreignObject: 1
  };
  let svgNamespaceURI = null;

  // svgNamespace(): the SVG namespace URI, read from an <svg> element that the HTML parser creates (so no address is written in this file).
  function svgNamespace() {
    if (svgNamespaceURI) return svgNamespaceURI;
    try {
      const holder = root.document.createElement('div');
      holder.innerHTML = '<svg></svg>';
      const node = holder.firstChild;
      if (node && node.namespaceURI) svgNamespaceURI = node.namespaceURI;
    } catch (e) {
      svgNamespaceURI = null;
    }
    return svgNamespaceURI;
  }

  // kebab(name): camelCase turned into kebab-case (for data attributes).
  function kebab(name) {
    return String(name).replace(/[A-Z]/g, function (ch) { return '-' + ch.toLowerCase(); });
  }

  // appendChildren(node, children): append strings and numbers as text, nodes as they are, arrays recursively; null, undefined and booleans are skipped.
  function appendChildren(node, children) {
    if (children === null || children === undefined || children === false || children === true) return;
    if (Array.isArray(children)) { children.forEach(function (c) { appendChildren(node, c); }); return; }
    if (isNode(children)) { node.appendChild(children); return; }
    node.appendChild(root.document.createTextNode(String(children)));
  }

  // el(tag, attrs, children): a new element (SVG tags, or 'svg:name', in the SVG namespace) with attributes, class (string or array), style (string or object, custom properties allowed), dataset, text, html (trusted strings only), onEvent handlers, and children; attrs may be skipped; checked and selected count as on whenever present, as in HTML.
  function el(tag, attrs, children) {
    const d = root.document;
    if (!d) throw new Error('el() needs a document');
    let at = attrs, kids = children;
    if (at !== undefined && at !== null && (typeof at !== 'object' || isArrayLike(at) || isNode(at))) { kids = at; at = null; }
    let name = String(tag), ns = null;
    if (name.indexOf('svg:') === 0) { name = name.slice(4); ns = svgNamespace(); } else if (SVG_TAGS[name] === 1) { ns = svgNamespace(); }
    const node = ns ? d.createElementNS(ns, name) : d.createElement(name);
    const late = [];
    if (at) {
      Object.keys(at).forEach(function (key) {
        const v = at[key];
        if (v === null || v === undefined || v === false) return;
        if (key === 'class' || key === 'className') {
          node.setAttribute('class', Array.isArray(v) ? v.filter(Boolean).join(' ') : String(v));
        } else if (key === 'style' && typeof v === 'object') {
          Object.keys(v).forEach(function (p) {
            if (p.indexOf('--') === 0) node.style.setProperty(p, v[p]); else node.style[p] = v[p];
          });
        } else if (key === 'dataset' && typeof v === 'object') {
          Object.keys(v).forEach(function (p) { node.setAttribute('data-' + kebab(p), String(v[p])); });
        } else if (key === 'text') {
          node.textContent = String(v);
        } else if (key === 'html') {
          node.innerHTML = String(v);
        } else if (key.indexOf('on') === 0 && typeof v === 'function') {
          node.addEventListener(key.slice(2).toLowerCase(), v);
        } else if (key === 'value' || key === 'checked' || key === 'selected') {
          node.setAttribute(key, v === true ? '' : String(v));
          late.push([key, key === 'value' ? v : true]);
        } else {
          node.setAttribute(key, v === true ? '' : String(v));
        }
      });
    }
    appendChildren(node, kids);
    late.forEach(function (kv) { try { node[kv[0]] = kv[1]; } catch (e) { /* not a form control */ } });
    return node;
  }

  // showNote(body, message, replace, kind): put message into one visible alert paragraph (class lab-error) in body; replace=true empties the body first. kind 'handler' marks a note that guard() removes after the next handler call that succeeds.
  function showNote(body, message, replace, kind) {
    const d = root.document;
    if (!body || !d) return;
    try {
      if (replace) body.textContent = '';
      let p = (!replace && typeof body.querySelector === 'function') ? body.querySelector('.lab-error') : null;
      if (!p) {
        p = d.createElement('p');
        p.className = 'lab-error';
        p.setAttribute('role', 'alert');
        if (replace || !body.firstChild) body.appendChild(p); else body.insertBefore(p, body.firstChild);
      }
      p.textContent = message;
      if (kind) p.setAttribute('data-note-kind', kind);
      else if (typeof p.removeAttribute === 'function') p.removeAttribute('data-note-kind');
    } catch (e) {
      logError('showNote', e);
    }
  }

  // clearHandlerNote(body): remove the note a failed handler left in body, once a handler has worked again.
  function clearHandlerNote(body) {
    try {
      const p = body && typeof body.querySelector === 'function' ? body.querySelector('.lab-error[data-note-kind="handler"]') : null;
      if (p && p.parentNode) p.parentNode.removeChild(p);
    } catch (e) {
      logError('clearHandlerNote', e);
    }
  }

  // guard(body, fn): fn wrapped so that an error writes a visible note into the lab body (and the console) instead of breaking the page; the note goes away after the next call that succeeds.
  function guard(body, fn) {
    return function () {
      try {
        const result = fn.apply(this, arguments);
        clearHandlerNote(body);
        return result;
      } catch (err) {
        logError('lab handler', err);
        showNote(body, 'This lab hit an error: ' + describeError(err), false, 'handler');
        return undefined;
      }
    };
  }

  // ------------------------------------------------------------------ Core.bundle: the real-data bundle (plan decision 6)

  const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let base64Codes = null;
  const bundleCache = Object.create(null);

  // base64Bytes(text): the bytes of a standard base64 text (white space skipped, '=' ends it) as a Uint8Array; a RangeError for any other character.
  function base64Bytes(text) {
    if (!base64Codes) {
      base64Codes = new Int16Array(128).fill(-1);
      for (let i = 0; i < 64; i++) base64Codes[BASE64_ALPHABET.charCodeAt(i)] = i;
    }
    const s = String(text);
    const vals = new Uint8Array(s.length);
    let m = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c === 61) break;
      if (c === 32 || c === 9 || c === 10 || c === 13) continue;
      const v = c < 128 ? base64Codes[c] : -1;
      if (v < 0) throw new RangeError('the base64 text holds a character it cannot hold, at position ' + i);
      vals[m++] = v;
    }
    if (m % 4 === 1) throw new RangeError('the base64 text ends with a single character');
    const out = new Uint8Array(Math.floor(m * 3 / 4));
    let o = 0, i = 0;
    for (; i + 4 <= m; i += 4) {
      const n24 = (vals[i] << 18) | (vals[i + 1] << 12) | (vals[i + 2] << 6) | vals[i + 3];
      out[o++] = (n24 >> 16) & 255;
      out[o++] = (n24 >> 8) & 255;
      out[o++] = n24 & 255;
    }
    if (m - i >= 2) {
      const n24 = (vals[i] << 18) | (vals[i + 1] << 12) | (m - i === 3 ? vals[i + 2] << 6 : 0);
      out[o++] = (n24 >> 16) & 255;
      if (m - i === 3) out[o++] = (n24 >> 8) & 255;
    }
    return out;
  }

  // shapeSize(shape): the number of values a member of this shape holds; a RangeError unless every size is a whole number of at least 1.
  function shapeSize(shape) {
    let size = 1;
    for (let i = 0; i < shape.length; i++) {
      const s = shape[i];
      if (!(Number.isInteger(s) && s >= 1)) throw new RangeError('a member\'s shape holds sizes of at least 1, not ' + JSON.stringify(shape));
      size *= s;
    }
    return size;
  }

  // isPacked(value): whether value is a member written by build/make_bundle.py: {dtype: 'int8' or 'float32', shape, data} (int8 with a scale per row).
  function isPacked(value) {
    return !!value && typeof value === 'object' && !isArrayLike(value) && (value.dtype === 'int8' || value.dtype === 'float32') &&
      Array.isArray(value.shape) && typeof value.data === 'string';
  }

  // decodeMember(member): {dtype, shape, array}, the member's numbers as one Float32Array in row-major order. int8 [r, c]: array[i*c + j] = int8[i*c + j] * scale[i], computed in float64 and stored as float32, as make_bundle.py's dequantise does; float32: the little-endian bytes as they are.
  function decodeMember(member) {
    const shape = member.shape.map(Number);
    const size = shapeSize(shape);
    const bytes = base64Bytes(member.data);
    const array = new Float32Array(size);
    if (member.dtype === 'int8') {
      if (shape.length !== 2) throw new RangeError('an int8 member has the shape [rows, columns], not ' + JSON.stringify(shape));
      if (bytes.length !== size) throw new RangeError('an int8 member of shape ' + JSON.stringify(shape) + ' needs ' + size + ' bytes, not ' + bytes.length);
      if (!isArrayLike(member.scale) || member.scale.length !== shape[0]) throw new RangeError('an int8 member needs one scale per row');
      const q = new Int8Array(bytes.buffer, bytes.byteOffset, bytes.length);
      const c = shape[1];
      for (let i = 0; i < shape[0]; i++) {
        const s = Number(member.scale[i]);
        for (let j = 0, k = i * c; j < c; j++, k++) array[k] = q[k] * s;
      }
    } else {
      if (bytes.length !== size * 4) throw new RangeError('a float32 member of shape ' + JSON.stringify(shape) + ' needs ' + (size * 4) + ' bytes, not ' + bytes.length);
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
      for (let i = 0; i < size; i++) array[i] = view.getFloat32(i * 4, true);
    }
    return { dtype: member.dtype, shape: shape, array: array };
  }

  // decodeBundle(doc): doc with every packed member, at any depth, replaced by decodeMember's {dtype, shape, array}; other values pass through. Works in place and returns doc (a parsed JSON document).
  function decodeBundle(doc) {
    if (isPacked(doc)) return decodeMember(doc);
    if (!doc || typeof doc !== 'object' || ArrayBuffer.isView(doc)) return doc;
    if (Array.isArray(doc)) {
      for (let i = 0; i < doc.length; i++) {
        const v = doc[i];
        if (v && typeof v === 'object') doc[i] = decodeBundle(v);
      }
      return doc;
    }
    Object.keys(doc).forEach(function (key) {
      const v = doc[key];
      if (v && typeof v === 'object') doc[key] = decodeBundle(v);
    });
    return doc;
  }

  // bundleRows(member, i): row i of a decoded member as a Float32Array view (no copy); rows run along the last dimension, so a [3, 6, 196, 196] member has 3 * 6 * 196 rows of 196 values.
  function bundleRows(member, i) {
    if (!member || !member.array || !isArrayLike(member.shape) || !member.shape.length) throw new TypeError('rows() takes a decoded member {shape, array}');
    const c = member.shape[member.shape.length - 1];
    const count = member.array.length / c;
    const r = Number(i);
    if (!(Number.isInteger(r) && r >= 0 && r < count)) throw new RangeError('row ' + i + ' lies outside 0 .. ' + (count - 1));
    return member.array.subarray(r * c, (r + 1) * c);
  }

  // bundleKeyOf(name): the file's name in data/ without .json; a RangeError for anything else than a plain file name.
  function bundleKeyOf(name) {
    const key = String(name).replace(/\.json$/i, '');
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(key) || key.indexOf('..') >= 0) {
      throw new RangeError('a bundle is named by its file in data/, such as followed or images, not ' + JSON.stringify(String(name)));
    }
    return key;
  }

  // loadBundle(name): a promise of the decoded data/<name>.json (relative to the page; the .json is optional), fetched once per name; a load that fails rejects with the file and the reason and is forgotten, so that a later call tries again.
  function loadBundle(name) {
    let key;
    try { key = bundleKeyOf(name); } catch (err) { return Promise.reject(err); }
    if (bundleCache[key]) return bundleCache[key];
    const url = 'data/' + key + '.json';
    if (typeof root.fetch !== 'function') return Promise.reject(new Error('this browser cannot read ' + url));
    const promise = Promise.resolve().then(function () {
      return root.fetch(url);
    }).then(function (response) {
      if (!response || !response.ok) throw new Error(url + ' did not load (HTTP ' + (response ? response.status : 'no answer') + ')');
      return response.json();
    }).then(decodeBundle);
    bundleCache[key] = promise;
    promise.then(null, function () { if (bundleCache[key] === promise) delete bundleCache[key]; });
    return promise;
  }

  const bundle = Object.freeze({ load: loadBundle, decode: decodeBundle, rows: bundleRows });

  // ------------------------------------------------------------------ Core.rule: the contrastive rule (plan decision 6)
  // Protocol 2026-10-08 section 3.2 and cluster/contrastive.py: on one crop's N teacher tokens, the cosine of every pair
  // (the diagonal -inf); tau_hi = the quantile at 1 - k/(N - 1) and tau_lo = the quantile at neg_pct/100 of the N(N - 1)
  // off-diagonal cosines; positives = the anchor's top k united with every candidate at or above tau_hi, capped at its
  // cap most similar; negatives = the candidates at or below tau_lo that are no positive, capped at the cap least
  // similar; InfoNCE per positive against the negatives at temperature tau.

  const RULE_DEFAULTS = Object.freeze({ k: 8, kLocal: 4, negPct: 20, capPos: 24, capNeg: 48, tau: 0.2, lambda: 1 });

  // wholeAtLeast(x, low, name): x as a whole number of at least low, or a RangeError that names it.
  function wholeAtLeast(x, low, name) {
    const v = Number(x);
    if (!(Number.isInteger(v) && v >= low)) throw new RangeError(name + ' must be a whole number of at least ' + low + ', not ' + x);
    return v;
  }

  // flatOf(values, what): one flat array of numbers: a flat array (or typed array) as it is, a list of rows (as Core.labKeys gives them) copied row after row into a Float64Array.
  function flatOf(values, what) {
    if (!isArrayLike(values)) throw new TypeError(what + ' must be a flat array of numbers or a list of rows');
    if (!values.length || !isArrayLike(values[0])) return values;
    const d = values[0].length;
    const out = new Float64Array(values.length * d);
    for (let i = 0; i < values.length; i++) {
      const row = values[i];
      if (!isArrayLike(row) || row.length !== d) throw new RangeError(what + ': row ' + i + ' does not hold ' + d + ' numbers');
      for (let j = 0; j < d; j++) out[i * d + j] = row[j];
    }
    return out;
  }

  // checkFlat(values, n, d, what): throw unless values is an array-like of n * d numbers.
  function checkFlat(values, n, d, what) {
    if (!isArrayLike(values)) throw new TypeError(what + ' must be a flat array of n x d numbers');
    if (!(Number.isInteger(n) && n >= 1 && Number.isInteger(d) && d >= 1) || values.length !== n * d) {
      throw new RangeError(what + ' holds ' + values.length + ' numbers, not n x d = ' + n + ' x ' + d);
    }
  }

  // unitRowsOf(values, n, d): the n rows (flat, or a list of rows) divided by max(length, 1e-12), as torch's F.normalize does (a zero row stays zero), in one Float64Array.
  function unitRowsOf(input, n, d) {
    const values = flatOf(input, 'the tokens');
    checkFlat(values, n, d, 'the tokens');
    const out = new Float64Array(n * d);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let j = 0, o = i * d; j < d; j++, o++) s += values[o] * values[o];
      const r = Math.max(Math.sqrt(s), 1e-12);
      for (let j = 0, o = i * d; j < d; j++, o++) out[o] = values[o] / r;
    }
    return out;
  }

  // ruleSimilarity(tokens, n, d): the n x n cosines of the n token rows (each scaled to length 1 first; a zero row gives 0), the diagonal -Infinity so that a patch never ranks as its own candidate, as all_pairs_similarity; a Float32Array, row-major.
  function ruleSimilarity(tokens, n, d) {
    const u = unitRowsOf(tokens, n, d);
    const out = new Float32Array(n * n);
    for (let i = 0; i < n; i++) {
      out[i * n + i] = -Infinity;
      for (let j = i + 1; j < n; j++) {
        let s = 0;
        for (let t = 0, a = i * d, b = j * d; t < d; t++) s += u[a + t] * u[b + t];
        out[i * n + j] = s;
        out[j * n + i] = s;
      }
    }
    return out;
  }

  // ruleQuantile(sorted, q): torch.quantile's linear rule on values already sorted ascending: pos = q (m - 1), lo = floor(pos), hi = min(lo + 1, m - 1), sorted[lo] + (pos - lo)(sorted[hi] - sorted[lo]); NaN for no value. torch computes this in the input's float32 arithmetic, so its last float32 digits can differ from this float64 value; a set changes only if a similarity lies between the two.
  function ruleQuantile(sorted, q) {
    if (!(q >= 0 && q <= 1)) throw new RangeError('the quantile level q must lie in [0, 1], not ' + q);
    const m = sorted.length;
    if (m === 0) return NaN;
    const pos = q * (m - 1);
    const lo = Math.floor(pos), hi = Math.min(lo + 1, m - 1);
    if (pos === lo) return sorted[lo];
    return sorted[lo] + (pos - lo) * (sorted[hi] - sorted[lo]);
  }

  // checkSquare(sim, n): throw unless sim holds n x n similarities for n of at least 2.
  function checkSquare(sim, n) {
    if (!isArrayLike(sim)) throw new TypeError('the similarities must be a flat n x n array');
    if (!(Number.isInteger(n) && n >= 2) || sim.length !== n * n) throw new RangeError('the similarities hold ' + sim.length + ' numbers, not n x n for n = ' + n);
  }

  // ruleThresholds(sim, n, {k, negPct}): the crop's tau_hi (the quantile at 1 - k/(n - 1)) and tau_lo (the quantile at negPct/100) of its n(n - 1) off-diagonal similarities, whatever the diagonal holds (-Infinity, or the bundle's -1e9); also the two levels and the number of entries.
  function ruleThresholds(sim, n, opts) {
    checkSquare(sim, n);
    const o = opts || {};
    const k = wholeAtLeast(o.k === undefined ? RULE_DEFAULTS.k : o.k, 1, 'k');
    if (k > n - 1) throw new RangeError('k must be at most n - 1 = ' + (n - 1) + ', not ' + k);
    const negPct = Number(o.negPct === undefined ? RULE_DEFAULTS.negPct : o.negPct);
    if (!(negPct >= 0 && negPct <= 100)) throw new RangeError('the negative percentage must lie in [0, 100], not ' + o.negPct);
    const x = new Float64Array(n * (n - 1));
    let m = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j) x[m++] = sim[i * n + j];
    x.sort();
    const qHi = 1 - k / (n - 1), qLo = negPct / 100;
    return { tauHi: ruleQuantile(x, qHi), tauLo: ruleQuantile(x, qLo), qHi: qHi, qLo: qLo, entries: m };
  }

  // ruleSets(sim, n, {k=8, negPct=20, capPos=24, capNeg=48}): every anchor's positives and negatives as positive_mask and negative_mask choose them. Per anchor i the candidates j != i are ranked by descending similarity, equal values by ascending index (torch's argsort is not stable on equal values and may order such ties otherwise; the thresholds compare inclusively, so a tie only matters at the k-th place or a cap's last place). pos = the longer of the top k and the candidates >= tau_hi (both are prefixes of the ranking), cut to the capPos most similar; posFromTopk = its first k, posFromThreshold = the rest; neg = the candidates <= tau_lo that are no positive, least similar first, cut to capNeg. Counts as the trainer's telemetry: capCutPos (anchors whose union the cap cut), capCutNeg, negEmpty (anchors left without a negative), posFromThresholdTotal (the sum of degree - k).
  function ruleSets(sim, n, opts) {
    const o = Object.assign({ k: RULE_DEFAULTS.k, negPct: RULE_DEFAULTS.negPct, capPos: RULE_DEFAULTS.capPos, capNeg: RULE_DEFAULTS.capNeg }, opts || {});
    const th = ruleThresholds(sim, n, o);
    const k = wholeAtLeast(o.k, 1, 'k');
    const capPos = wholeAtLeast(o.capPos, 0, 'capPos');
    const capNeg = wholeAtLeast(o.capNeg, 0, 'capNeg');
    const pos = [], neg = [], posFromTopk = [], posFromThreshold = [], ranking = [];
    const posUncapped = new Int32Array(n), negUncapped = new Int32Array(n);
    const isPos = new Uint8Array(n);
    let capCutPos = 0, capCutNeg = 0, negEmpty = 0, fromThreshold = 0;
    for (let i = 0; i < n; i++) {
      const row = i * n;
      const order = new Int32Array(n - 1);
      for (let j = 0, m = 0; j < n; j++) if (j !== i) order[m++] = j;
      order.sort(function (a, b) {
        const va = sim[row + a], vb = sim[row + b];
        if (va > vb) return -1;
        if (va < vb) return 1;
        return a - b;
      });
      let above = 0;
      for (let j = 0; j < n; j++) if (j !== i && sim[row + j] >= th.tauHi) above++;
      const union = Math.max(above, k);
      const degree = Math.min(union, capPos);
      const p = order.slice(0, degree);
      const split = Math.min(k, degree);
      pos.push(p);
      posFromTopk.push(p.slice(0, split));
      posFromThreshold.push(p.slice(split));
      posUncapped[i] = union;
      if (union > capPos) capCutPos++;
      fromThreshold += degree - k;
      isPos.fill(0);
      for (let t = 0; t < p.length; t++) isPos[p[t]] = 1;
      const cand = [];
      for (let j = 0; j < n; j++) if (j !== i && !isPos[j] && sim[row + j] <= th.tauLo) cand.push(j);
      cand.sort(function (a, b) {
        const va = sim[row + a], vb = sim[row + b];
        if (va < vb) return -1;
        if (va > vb) return 1;
        return a - b;
      });
      negUncapped[i] = cand.length;
      const keep = Math.min(cand.length, capNeg);
      neg.push(Int32Array.from(cand.slice(0, keep)));
      if (cand.length > capNeg) capCutNeg++;
      if (keep === 0) negEmpty++;
      ranking.push(order);
    }
    return {
      pos: pos, neg: neg, posFromTopk: posFromTopk, posFromThreshold: posFromThreshold,
      tauHi: th.tauHi, tauLo: th.tauLo, qHi: th.qHi, qLo: th.qLo,
      capCutPos: capCutPos, capCutNeg: capCutNeg, negEmpty: negEmpty, posFromThresholdTotal: fromThreshold,
      posUncapped: posUncapped, negUncapped: negUncapped, ranking: ranking,
      n: n, k: k, negPct: Number(o.negPct), capPos: capPos, capNeg: capNeg
    };
  }

  // softplus(x): log(1 + e^x) without overflow; 0 at -Infinity. (torch's softplus returns x itself above 20, which differs from this by less than 2.1e-9.)
  function softplus(x) {
    return x > 0 ? x + Math.log1p(Math.exp(-x)) : Math.log1p(Math.exp(x));
  }

  // ruleInfonce(simRow, pos, neg, tau, {follow=0}): one anchor's multi-positive InfoNCE from simRow[j] = cos(student token of the anchor, teacher token j). For each positive p: l_p = -log(e^(s_p/tau) / (e^(s_p/tau) + sum over neg of e^(s_n/tau))), computed as softplus(logsumexp of the negatives' s_n/tau - s_p/tau) in float64; loss = their mean (0 without a positive; every l_p is 0 without a negative). perPositive holds the l_p as a Float32Array; shares.rows[i] = the softmax of [s_p, s_neg...]/tau of positive i (the layout of followed.json's anchor_shares), shares.positive[i] = its first entry, shares.negatives = the negatives' shares of the followed positive (opts.follow, the first by default). simRow may be any array of numbers; a Float64Array keeps every digit.
  function ruleInfonce(simRow, pos, neg, tau, opts) {
    const T = Number(tau);
    if (!(T > 0)) throw new RangeError('the temperature tau must be above 0, not ' + tau);
    if (!isArrayLike(simRow) || !isArrayLike(pos) || !isArrayLike(neg)) throw new TypeError('infonce takes a row of similarities and two index lists');
    const P = pos.length, N = neg.length;
    [pos, neg].forEach(function (list) {
      for (let i = 0; i < list.length; i++) {
        if (!(Number.isInteger(list[i]) && list[i] >= 0 && list[i] < simRow.length)) throw new RangeError('index ' + list[i] + ' lies outside the row of ' + simRow.length + ' similarities');
      }
    });
    const negLogits = new Float64Array(N);
    let top = -Infinity;
    for (let i = 0; i < N; i++) {
      negLogits[i] = simRow[neg[i]] / T;
      if (negLogits[i] > top) top = negLogits[i];
    }
    let lseNeg = -Infinity;
    if (N > 0) {
      let s = 0;
      for (let i = 0; i < N; i++) s += Math.exp(negLogits[i] - top);
      lseNeg = top + Math.log(s);
    }
    const per = new Float64Array(P);
    const rows = [];
    let total = 0;
    for (let i = 0; i < P; i++) {
      const lp = simRow[pos[i]] / T;
      per[i] = N > 0 ? softplus(lseNeg - lp) : 0;
      total += per[i];
      const mx = Math.max(lp, top);
      let den = Math.exp(lp - mx);
      for (let t = 0; t < N; t++) den += Math.exp(negLogits[t] - mx);
      const row = new Array(N + 1);
      row[0] = Math.exp(lp - mx) / den;
      for (let t = 0; t < N; t++) row[t + 1] = Math.exp(negLogits[t] - mx) / den;
      rows.push(row);
    }
    const follow = opts && opts.follow !== undefined ? Number(opts.follow) : 0;
    if (P > 0 && !(Number.isInteger(follow) && follow >= 0 && follow < P)) throw new RangeError('follow must index one of the ' + P + ' positives');
    return {
      loss: P > 0 ? total / P : 0,
      perPositive: Float32Array.from(per),
      shares: {
        positive: rows.map(function (r) { return r[0]; }),
        negatives: P > 0 ? rows[follow].slice(1) : [],
        rows: rows
      },
      lseNeg: lseNeg,
      followed: P > 0 ? follow : null,
      tau: T
    };
  }

  // ruleGradient(student, teacher, pos, neg, tau): the gradient of the anchor's mean InfoNCE with respect to its student token z (student, d numbers, scaled to length 1 here), against the teacher rows (n x d, each scaled to length 1 here). With a_q the softmax shares of [s_p, s_neg...]/tau of each positive p and w = 1/|pos|: pull = -(1/tau) sum_p w (1 - a_p) t_p (stepping against it moves z towards the positives), push = (1/tau) sum_p w sum_n a_n t_n (stepping against it moves z away from the negatives), each then projected onto the sphere's tangent plane at z (minus z (z . g)), the Jacobian of the normalisation; grad = pull + push. Float32Arrays of d, plus the float64 norms.
  function ruleGradient(student, teacherInput, pos, neg, tau) {
    const T = Number(tau);
    if (!(T > 0)) throw new RangeError('the temperature tau must be above 0, not ' + tau);
    if (!isArrayLike(student) || !isArrayLike(teacherInput)) throw new TypeError('gradient takes the student token and the teacher rows');
    const teacher = flatOf(teacherInput, 'the teacher rows');
    const d = student.length;
    if (!(d >= 1) || teacher.length % d !== 0) throw new RangeError('the teacher rows do not have the student token\'s ' + d + ' numbers');
    const n = teacher.length / d;
    const z = unitRowsOf(student, 1, d);
    const used = Array.prototype.slice.call(pos).concat(Array.prototype.slice.call(neg));
    const unit = Object.create(null), cos = Object.create(null);
    used.forEach(function (j) {
      if (!(Number.isInteger(j) && j >= 0 && j < n)) throw new RangeError('index ' + j + ' is not a teacher row');
      if (unit[j]) return;
      let s = 0;
      for (let t = 0; t < d; t++) s += teacher[j * d + t] * teacher[j * d + t];
      const r = Math.max(Math.sqrt(s), 1e-12);
      const u = new Float64Array(d);
      let c = 0;
      for (let t = 0; t < d; t++) { u[t] = teacher[j * d + t] / r; c += u[t] * z[t]; }
      unit[j] = u;
      cos[j] = c;
    });
    const pull = new Float64Array(d), push = new Float64Array(d);
    const P = pos.length, N = neg.length;
    if (P > 0 && N > 0) {
      const w = 1 / P;
      for (let i = 0; i < P; i++) {
        const lp = cos[pos[i]] / T;
        let mx = lp;
        for (let t = 0; t < N; t++) mx = Math.max(mx, cos[neg[t]] / T);
        let den = Math.exp(lp - mx);
        const e = new Float64Array(N);
        for (let t = 0; t < N; t++) { e[t] = Math.exp(cos[neg[t]] / T - mx); den += e[t]; }
        const ap = Math.exp(lp - mx) / den;
        const up = unit[pos[i]];
        for (let c = 0; c < d; c++) pull[c] -= (w / T) * (1 - ap) * up[c];
        for (let t = 0; t < N; t++) {
          const an = e[t] / den, un = unit[neg[t]];
          for (let c = 0; c < d; c++) push[c] += (w / T) * an * un[c];
        }
      }
    }
    // project(g): g minus z (z . g), in place: the part of g along the sphere at z.
    const project = function (g) {
      let s = 0;
      for (let c = 0; c < d; c++) s += z[c] * g[c];
      for (let c = 0; c < d; c++) g[c] -= z[c] * s;
      return g;
    };
    project(pull);
    project(push);
    const grad = new Float64Array(d);
    for (let c = 0; c < d; c++) grad[c] = pull[c] + push[c];
    return {
      grad: Float32Array.from(grad), pull: Float32Array.from(pull), push: Float32Array.from(push),
      norms: { grad: norm(grad), pull: norm(pull), push: norm(push) }
    };
  }

  // studentTeacherRow(student, teacher, i, n, d): cos(student token i, teacher token j) for every j, each row scaled to length 1 first (the term's s_ij), as a Float64Array of n.
  function studentTeacherRow(studentInput, teacherInput, i, n, d) {
    const student = flatOf(studentInput, 'the student tokens'), teacher = flatOf(teacherInput, 'the teacher tokens');
    checkFlat(student, n, d, 'the student tokens');
    checkFlat(teacher, n, d, 'the teacher tokens');
    if (!(Number.isInteger(i) && i >= 0 && i < n)) throw new RangeError('the anchor must lie in 0 .. n - 1');
    const zi = unitRowsOf(Array.prototype.slice.call(student, i * d, (i + 1) * d), 1, d);
    const zt = unitRowsOf(teacher, n, d);
    const out = new Float64Array(n);
    for (let j = 0; j < n; j++) {
      let s = 0;
      for (let t = 0; t < d; t++) s += zi[t] * zt[j * d + t];
      out[j] = s;
    }
    return out;
  }

  // kFor(n, k=8, kLocal=4): the crop's k as cluster/contrastive.py k_for gives it: k for the 196 tokens of a 224 px crop, kLocal for the 36 of a 96 px crop; a RangeError for any other crop.
  function kFor(n, k, kLocal) {
    if (n === 196) return k === undefined ? RULE_DEFAULTS.k : k;
    if (n === 36) return kLocal === undefined ? RULE_DEFAULTS.kLocal : kLocal;
    throw new RangeError('the rule has a k for 196 tokens (224 px) and 36 tokens (96 px) only, not ' + n);
  }

  const rule = Object.freeze({
    defaults: RULE_DEFAULTS,
    similarity: ruleSimilarity, quantile: ruleQuantile, thresholds: ruleThresholds, sets: ruleSets,
    infonce: ruleInfonce, gradient: ruleGradient,
    unitRows: function (tokens, n, d) { return unitRowsOf(tokens, n, d); },
    studentTeacherRow: studentTeacherRow, kFor: kFor
  });

  // ------------------------------------------------------------------ Core.decoder: the frozen decoder (plan decision 6)
  // configs/decoder_v2_frozen_v2.json read by src/decoder_v2.py maskcut_core_v2, the archived CutLER loop: the key rule;
  // per stage the affinity A = 1 where the cosine of two keys exceeds tau (strictly, as CutLER's get_affinity_matrix
  // writes A > tau; plan decision 6 wrote >=) and eps elsewhere, self-loops included; the generalised problem
  // (D - A) v = lambda D v solved as the symmetric D^-1/2 (D - A) D^-1/2; a stage is degenerate when fewer than 3
  // eigenvalues exist, one is not finite, or lambda3 - lambda2 < 1e-8 in size; v2 > its mean is the foreground; the
  // largest |v2| and the corners decide the flip: it flips when 3 or 4 corners are foreground or the largest |v2| is
  // not; the seed is then the largest entry of v2, of -v2 after a flip; the seed's
  // 4-connected component is the pseudo-mask; from stage 1 on a mask whose IoU with the previous one exceeds 0.5 is
  // dropped (overlap), then one of at most 1 per cent of the grid (small); earlier slots keep their pixels; the painted
  // keys (the earlier pseudo-masks) become 0 for the next stages. The keys are read as float32 and their cosines rounded
  // to float32, as the Python decoder computes them. Eigenvalues come from Householder tridiagonalisation and
  // bisection, the Fiedler vector from inverse iteration, as LAPACK's dsygvx does for scipy's eigh with
  // subset_by_index: its sign follows dstein (the tridiagonal eigenvector's first largest entry positive), which matters
  // because the corner rule can give a different mask for the opposite sign; where the Fiedler vector holds exact ties
  // (painted keys are all zero, so their entries are equal) the seed is the first of them, and LAPACK's rounding may
  // pick another cell of the same component. Not replicated: run_decoder's bilateral post-processing and the resize
  // of the masks to the photograph's size.

  const DECODER_DEFAULTS = Object.freeze({
    tau: 0.2, eps: 1e-5, n: 5, keyRule: 'mean_subtract', minAreaRatio: 0.01, overlapIoU: 0.5, onDegenerate: 'keep_prior',
    side: 480, grid: 30
  });
  const DEGENERATE_LIMIT = 1e-8;
  const MACHINE_EPS = 2.220446049250313e-16;

  // decoderKeyRule(keys, n, d, rule='mean_subtract', {keyBias}): src/key_rule_v2.py apply_key_rule: 'raw' hands back the very same array; 'mean_subtract' takes the mean key (float64, over the n keys) from every key, 'bias_free' takes opts.keyBias (d numbers); both answer a new Float32Array.
  function decoderKeyRule(input, n, d, ruleName, opts) {
    const name = ruleName === undefined ? DECODER_DEFAULTS.keyRule : ruleName;
    if (name === 'raw') return input;
    const keys = flatOf(input, 'the keys');
    checkFlat(keys, n, d, 'the keys');
    const take = new Float64Array(d);
    if (name === 'mean_subtract') {
      for (let i = 0; i < n; i++) for (let t = 0; t < d; t++) take[t] += keys[i * d + t];
      for (let t = 0; t < d; t++) take[t] /= n;
    } else if (name === 'bias_free') {
      const bias = opts && opts.keyBias;
      if (!isArrayLike(bias) || bias.length !== d) throw new RangeError('the key rule bias_free needs the final block\'s key bias (' + d + ' numbers)');
      for (let t = 0; t < d; t++) take[t] = Number(bias[t]);
    } else {
      throw new RangeError('the key rule must be raw, mean_subtract or bias_free, not ' + name);
    }
    const out = new Float32Array(n * d);
    for (let i = 0; i < n; i++) for (let t = 0; t < d; t++) out[i * d + t] = keys[i * d + t] - take[t];
    return out;
  }

  // decoderCosines(features, n, d): the n x n cosines of the keys as the decoder's float32 arithmetic gives them (each key scaled to length 1 and rounded to float32, each dot product rounded to float32; a zero key gives 0), in a Float32Array.
  function decoderCosines(features, n, d) {
    checkFlat(features, n, d, 'the keys');
    const unit = new Float64Array(n * d);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let t = 0, o = i * d; t < d; t++, o++) s += features[o] * features[o];
      const r = Math.max(Math.sqrt(s), 1e-12);
      for (let t = 0, o = i * d; t < d; t++, o++) unit[o] = Math.fround(features[o] / r);
    }
    const out = new Float32Array(n * n);
    for (let i = 0; i < n; i++) {
      for (let j = i; j < n; j++) {
        let s = 0;
        for (let t = 0, a = i * d, b = j * d; t < d; t++) s += unit[a + t] * unit[b + t];
        out[i * n + j] = s;
        out[j * n + i] = s;
      }
    }
    return out;
  }

  // householder(a, n): reduce the symmetric n x n matrix a (row-major Float64Array, overwritten) to tridiagonal form T = Q' a Q by Householder reflections P_k = I - beta_k v_k v_k' (Q = P_0 ... P_(n-3)), column by column from the first, with LAPACK's conventions (dsytd2 with the lower triangle, dlarfg): the new off-diagonal entry is -sign(x0) |x|, and a column already zero below its first entry is left as it is. v_k is kept in column k below the diagonal of a. Returns {d, e, betas, a, n}.
  function householder(a, n) {
    const d = new Float64Array(n), e = new Float64Array(Math.max(n - 1, 0));
    const betas = new Float64Array(Math.max(n - 2, 0));
    const v = new Float64Array(n), p = new Float64Array(n), w = new Float64Array(n);
    for (let k = 0; k < n - 2; k++) {
      const m = n - k - 1;
      let rest = 0;
      for (let i = 0; i < m; i++) { v[i] = a[(k + 1 + i) * n + k]; if (i > 0) rest += v[i] * v[i]; }
      if (rest === 0) { e[k] = v[0]; betas[k] = 0; continue; }
      const xnorm = Math.sqrt(v[0] * v[0] + rest);
      const alpha = v[0] >= 0 ? -xnorm : xnorm;
      v[0] -= alpha;
      let vv = 0;
      for (let i = 0; i < m; i++) vv += v[i] * v[i];
      const beta = 2 / vv;
      let pv = 0;
      for (let i = 0; i < m; i++) {
        const row = (k + 1 + i) * n + k + 1;
        let acc = 0;
        for (let j = 0; j < m; j++) acc += a[row + j] * v[j];
        p[i] = beta * acc;
        pv += p[i] * v[i];
      }
      const K = beta * pv / 2;
      for (let i = 0; i < m; i++) w[i] = p[i] - K * v[i];
      for (let i = 0; i < m; i++) {
        const row = (k + 1 + i) * n + k + 1, vi = v[i], wi = w[i];
        for (let j = 0; j < m; j++) a[row + j] -= vi * w[j] + wi * v[j];
      }
      for (let i = 0; i < m; i++) a[(k + 1 + i) * n + k] = v[i];
      e[k] = alpha;
      betas[k] = beta;
    }
    for (let i = 0; i < n; i++) d[i] = a[i * n + i];
    if (n >= 2) e[n - 2] = a[(n - 1) * n + n - 2];
    return { d: d, e: e, betas: betas, a: a, n: n };
  }

  // sturmCount(d, e2, x, pivmin): how many eigenvalues of the symmetric tridiagonal matrix (diagonal d, squared off-diagonal e2) lie below x (the negative pivots of T - x I).
  function sturmCount(d, e2, x, pivmin) {
    let count = 0;
    let q = d[0] - x;
    if (Math.abs(q) < pivmin) q = -pivmin;
    if (q < 0) count++;
    for (let i = 1; i < d.length; i++) {
      q = d[i] - x - e2[i - 1] / q;
      if (Math.abs(q) < pivmin) q = -pivmin;
      if (q < 0) count++;
    }
    return count;
  }

  // smallestEigenvalues(d, e, count): the `count` smallest eigenvalues of the symmetric tridiagonal (d, e), ascending, each found by bisection on Sturm counts (the Gershgorin interval halved until it is a few units in the last place of the matrix's size wide, as LAPACK's default tolerance).
  function smallestEigenvalues(d, e, count) {
    const n = d.length;
    const e2 = new Float64Array(Math.max(n - 1, 0));
    let maxE2 = 0, lo = Infinity, hi = -Infinity;
    for (let i = 0; i < n - 1; i++) { e2[i] = e[i] * e[i]; maxE2 = Math.max(maxE2, e2[i]); }
    for (let i = 0; i < n; i++) {
      const r = (i > 0 ? Math.abs(e[i - 1]) : 0) + (i < n - 1 ? Math.abs(e[i]) : 0);
      lo = Math.min(lo, d[i] - r);
      hi = Math.max(hi, d[i] + r);
    }
    const size = Math.max(Math.abs(lo), Math.abs(hi));
    const pivmin = 1e-300 * Math.max(1, maxE2);
    const pad = 4 * MACHINE_EPS * size * n + pivmin;
    const abstol = MACHINE_EPS * size;
    const out = [];
    for (let j = 0; j < Math.min(count, n); j++) {
      let a = lo - pad, b = hi + pad;
      for (let iter = 0; iter < 200; iter++) {
        if (b - a <= abstol + 2 * MACHINE_EPS * Math.max(Math.abs(a), Math.abs(b))) break;
        const mid = a + (b - a) / 2;
        if (mid <= a || mid >= b) break;
        if (sturmCount(d, e2, mid, pivmin) > j) b = mid; else a = mid;
      }
      out.push(a + (b - a) / 2);
    }
    return out;
  }

  // tridiagonalVector(d, e, lambda): a unit eigenvector of the symmetric tridiagonal (d, e) for its eigenvalue lambda, by inverse iteration: T - lambda I factored once with partial pivoting (a zero pivot becomes eps times the matrix's size), four solves from a fixed pseudo-random start; its sign is LAPACK dstein's: the first entry of largest size is positive.
  function tridiagonalVector(d, e, lambda) {
    const n = d.length;
    if (n === 1) return Float64Array.of(1);
    const D = new Float64Array(n), U1 = new Float64Array(n), U2 = new Float64Array(n), L = new Float64Array(n), swap = new Uint8Array(n);
    let size = 0;
    for (let i = 0; i < n; i++) {
      D[i] = d[i] - lambda;
      U1[i] = i < n - 1 ? e[i] : 0;
      size = Math.max(size, Math.abs(D[i]) + (i > 0 ? Math.abs(e[i - 1]) : 0) + (i < n - 1 ? Math.abs(e[i]) : 0));
    }
    const tiny = Math.max(size, 1e-300) * MACHINE_EPS;
    for (let i = 0; i < n - 1; i++) {
      const sub = e[i];
      if (Math.abs(D[i]) >= Math.abs(sub)) {
        if (D[i] === 0) D[i] = tiny;
        const mult = sub / D[i];
        L[i] = mult;
        D[i + 1] -= mult * U1[i];
      } else {
        const mult = D[i] / sub;
        L[i] = mult;
        swap[i] = 1;
        const nextD = D[i + 1], nextU1 = i + 1 < n - 1 ? U1[i + 1] : 0, oldU1 = U1[i];
        D[i] = sub;
        U1[i] = nextD;
        U2[i] = nextU1;
        D[i + 1] = oldU1 - mult * nextD;
        if (i + 1 < n - 1) U1[i + 1] = -mult * nextU1;
      }
    }
    if (D[n - 1] === 0) D[n - 1] = tiny;
    const r = rng(20261013);
    let x = new Float64Array(n);
    for (let i = 0; i < n; i++) x[i] = r.next() - 0.5;
    for (let iter = 0; iter < 4; iter++) {
      for (let i = 0; i < n - 1; i++) {
        if (swap[i]) { const t = x[i]; x[i] = x[i + 1]; x[i + 1] = t; }
        x[i + 1] -= L[i] * x[i];
      }
      const y = new Float64Array(n);
      y[n - 1] = x[n - 1] / D[n - 1];
      y[n - 2] = (x[n - 2] - U1[n - 2] * y[n - 1]) / D[n - 2];
      for (let i = n - 3; i >= 0; i--) y[i] = (x[i] - U1[i] * y[i + 1] - U2[i] * y[i + 2]) / D[i];
      let big = 0;
      for (let i = 0; i < n; i++) big = Math.max(big, Math.abs(y[i]));
      if (!(big > 0) || !isFinite(big)) break;
      let s = 0;
      for (let i = 0; i < n; i++) { y[i] /= big; s += y[i] * y[i]; }
      s = Math.sqrt(s);
      for (let i = 0; i < n; i++) y[i] /= s;
      x = y;
    }
    let big = -1, at = 0;
    for (let i = 0; i < n; i++) if (Math.abs(x[i]) > big) { big = Math.abs(x[i]); at = i; }
    if (x[at] < 0) for (let i = 0; i < n; i++) x[i] = -x[i];
    return x;
  }

  // backTransform(h, y): Q y for the reflections of householder(): P_(n-3) applied first, P_0 last, giving an eigenvector of the original matrix from one of T.
  function backTransform(h, y) {
    const n = h.n, a = h.a, x = Float64Array.from(y);
    for (let k = n - 3; k >= 0; k--) {
      const beta = h.betas[k];
      if (!beta) continue;
      let s = 0;
      for (let i = k + 1; i < n; i++) s += a[i * n + k] * x[i];
      s *= beta;
      for (let i = k + 1; i < n; i++) x[i] -= s * a[i * n + k];
    }
    return x;
  }

  // gridOf(grid, n): {rows, cols} from a side (a square grid), [rows, cols] or {rows, cols}; a RangeError unless rows * cols = n.
  function gridOf(grid, n) {
    let rows, cols;
    if (typeof grid === 'number') { rows = grid; cols = grid; }
    else if (isArrayLike(grid)) { rows = Number(grid[0]); cols = Number(grid[1]); }
    else if (grid && typeof grid === 'object') { rows = Number(grid.rows); cols = Number(grid.cols); }
    if (!(Number.isInteger(rows) && Number.isInteger(cols) && rows >= 1 && cols >= 1 && rows * cols === n)) {
      throw new RangeError('a ' + rows + ' x ' + cols + ' grid does not hold ' + n + ' keys');
    }
    return { rows: rows, cols: cols };
  }

  // decoderMaskcut(keys, n, grid, cfg): maskcut_core_v2 on n keys (keys: n x d numbers, row-major, or a list of n rows, read as float32 as the Python decoder reads them; grid: the side of a square grid, or [rows, cols], which the Python decoder does not allow) under the frozen configuration (cfg overrides {tau 0.2, eps 1e-5, n 5 slots, keyRule mean_subtract, minAreaRatio 0.01, overlapIoU 0.5, onDegenerate keep_prior}; cfg.cosines may hand back the cosines of an earlier call on the same keys and rule, so that only the cut is recomputed). Returns {stages, masks, ids, status, scores, kept, degenerateStage, failure, grid, config, features, cosines}: one stage record per stage run ({index, reason, eigenvalues (the 3 smallest), lambda2, lambda3, fiedler (the generalised eigenvector v2, D-normalised; null in a degenerate stage), seed, flipped, fgCorners, bipartition, component, componentArea, iouPrevious, areaRatio, mask, area, painted (the cells zeroed for this stage), strongPairs, scoreNcut}), one mask per slot (Uint8Array n; empty for a slot without pixels), ids (Int16Array n: 0 for background, else the slot number + 1, earlier slots first), the per-slot status (ok, overlap, small, empty, degenerate, failed, not_run) and ncut scores (1 - lambda2 clipped to [0, 1] for a slot with pixels).
  function decoderMaskcut(input, n, grid, cfg) {
    const o = Object.assign({}, DECODER_DEFAULTS, cfg || {});
    const slots = wholeAtLeast(o.n, 1, 'the number of slots n');
    if (slots > 10) throw new RangeError('the number of slots n must be at most 10');
    if (o.onDegenerate !== 'keep_prior' && o.onDegenerate !== 'discard_all') throw new RangeError('onDegenerate must be keep_prior or discard_all');
    const flat = flatOf(input, 'the keys');
    const keys = Object.prototype.toString.call(flat) === '[object Float32Array]' ? flat : Float32Array.from(flat);
    if (!(Number.isInteger(n) && n >= 1) || keys.length % n !== 0) throw new RangeError('the keys must hold n rows of equal length');
    const d = keys.length / n;
    for (let i = 0; i < keys.length; i++) if (!isFinite(keys[i])) throw new RangeError('the keys must be finite (index ' + i + ')');
    const g = gridOf(grid, n);
    const tau32 = Math.fround(Number(o.tau)), eps = Number(o.eps);
    const features = decoderKeyRule(keys, n, d, o.keyRule, o);
    const cosines = o.cosines && o.cosines.length === n * n ? o.cosines : decoderCosines(features, n, d);
    const painted = new Uint8Array(n), claimed = new Uint8Array(n);
    let current = new Uint8Array(n);
    const masks = [], status = [], scores = new Float64Array(slots);
    for (let s = 0; s < slots; s++) { masks.push(new Uint8Array(n)); status.push('not_run'); }
    const stages = [];
    let degenerateStage = null, failure = null;
    const L = new Float64Array(n * n), deg = new Float64Array(n);
    let cached = null;
    // spectrum(): the cut of the graph of the current painting: its strong pairs, its 3 smallest eigenvalues, whether
    // it is degenerate, and the generalised Fiedler vector v2 (D-normalised). A stage whose painting equals the previous
    // stage's (that stage's pseudo-mask was dropped, or lay on painted cells) has the very same graph, so it reuses the
    // previous answer, which the same computation would give again.
    const spectrum = function () {
      if (cached && cached.painted.every(function (x, c) { return x === painted[c]; })) return cached;
      let strong = 0;
      for (let a = 0; a < n; a++) {
        let sum = 0;
        const ra = a * n;
        for (let b = 0; b < n; b++) {
          const one = !painted[a] && !painted[b] && cosines[ra + b] > tau32;
          sum += one ? 1 : eps;
          if (one && b > a) strong++;
        }
        deg[a] = sum;
      }
      for (let a = 0; a < n; a++) {
        const ra = a * n, da = deg[a];
        for (let b = 0; b < n; b++) {
          const one = !painted[a] && !painted[b] && cosines[ra + b] > tau32;
          L[ra + b] = (a === b ? 1 : 0) - (one ? 1 : eps) / Math.sqrt(da * deg[b]);
        }
      }
      const h = householder(L, n);
      const values = smallestEigenvalues(h.d, h.e, 3);
      const l2 = n >= 2 ? values[1] : NaN, l3 = n >= 3 ? values[2] : NaN;
      const degenerate = n < 3 || !values.every(isFinite) || Math.abs(l3 - l2) < DEGENERATE_LIMIT;
      let v2 = null;
      if (!degenerate) {
        const u = backTransform(h, tridiagonalVector(h.d, h.e, l2));
        let unorm = 0;
        for (let c = 0; c < n; c++) unorm += u[c] * u[c];
        unorm = Math.sqrt(unorm);
        v2 = new Float64Array(n);
        for (let c = 0; c < n; c++) v2[c] = u[c] / unorm / Math.sqrt(deg[c]);
      }
      cached = { painted: Uint8Array.from(painted), strong: strong, values: values, lambda2: l2, lambda3: l3, degenerate: degenerate, v2: v2 };
      return cached;
    };
    try {
      for (let i = 0; i < slots; i++) {
        if (i > 0) for (let c = 0; c < n; c++) if (current[c]) painted[c] = 1;
        const record = { index: i, reason: 'ok', painted: Uint8Array.from(painted), strongPairs: 0 };
        const sp = spectrum();
        record.strongPairs = sp.strong;
        record.eigenvalues = sp.values.slice();
        record.lambda1 = sp.values[0];
        record.lambda2 = sp.lambda2;
        record.lambda3 = sp.lambda3;
        if (sp.degenerate) {
          degenerateStage = i;
          record.reason = 'degenerate';
          record.fiedler = null;
          stages.push(record);
          if (o.onDegenerate === 'discard_all' || i === 0) {
            for (let s = 0; s < slots; s++) { masks[s].fill(0); status[s] = 'degenerate'; scores[s] = 0; }
            claimed.fill(0);
            failure = 'degenerate_spectrum';
          } else {
            status[i] = 'degenerate';
          }
          break;
        }
        const v2 = Float64Array.from(sp.v2);
        let mean = 0;
        for (let c = 0; c < n; c++) mean += v2[c];
        mean /= n;
        const fg = new Uint8Array(n);
        for (let c = 0; c < n; c++) fg[c] = v2[c] > mean ? 1 : 0;
        const seed0 = argmaxOf(v2, 0);
        const corners = fg[0] + fg[g.cols - 1] + fg[(g.rows - 1) * g.cols] + fg[n - 1];
        const flipped = corners >= 3 ? true : fg[seed0] !== 1;
        let seed;
        if (flipped) {
          for (let c = 0; c < n; c++) fg[c] = fg[c] ? 0 : 1;
          seed = argmaxOf(v2, -1);
        } else {
          seed = argmaxOf(v2, 1);
        }
        const component = componentOf(fg, seed, g.rows, g.cols);
        const area = countOnes(component);
        let pseudo = component;
        let iouPrevious = null;
        if (i >= 1) {
          const iou = maskIoU(current, component);
          iouPrevious = iou === iou ? iou : null;
          if (iou > o.overlapIoU) { record.reason = 'overlap'; pseudo = new Uint8Array(n); }
          else if (area / n <= o.minAreaRatio) { record.reason = 'small'; pseudo = new Uint8Array(n); }
        }
        current = pseudo;
        const mask = masks[i];
        let added = 0;
        for (let c = 0; c < n; c++) if (pseudo[c] && !claimed[c]) { mask[c] = 1; added++; }
        if (record.reason === 'ok' && added === 0) record.reason = 'empty';
        for (let c = 0; c < n; c++) if (mask[c]) claimed[c] = 1;
        status[i] = record.reason;
        if (added > 0) scores[i] = clamp(1 - record.lambda2, 0, 1);
        record.fiedler = v2;
        record.seed = seed;
        record.flipped = flipped;
        record.fgCorners = corners;
        record.bipartition = fg;
        record.component = component;
        record.componentArea = area;
        record.iouPrevious = iouPrevious;
        record.areaRatio = area / n;
        record.mask = mask;
        record.area = added;
        record.scoreNcut = scores[i];
        stages.push(record);
      }
    } catch (err) {
      for (let s = 0; s < slots; s++) { masks[s].fill(0); status[s] = 'failed'; scores[s] = 0; }
      failure = (err && err.name ? err.name : 'Error') + ':' + describeError(err);
    }
    const ids = new Int16Array(n);
    for (let s = slots - 1; s >= 0; s--) for (let c = 0; c < n; c++) if (masks[s][c]) ids[c] = s + 1;
    const kept = [];
    for (let s = 0; s < slots; s++) if (countOnes(masks[s]) > 0) kept.push(s);
    return {
      stages: stages, masks: masks, ids: ids, status: status, scores: scores, kept: kept,
      degenerateStage: degenerateStage, failure: failure, grid: g,
      config: { tau: Number(o.tau), eps: eps, n: slots, keyRule: o.keyRule, minAreaRatio: o.minAreaRatio, overlapIoU: o.overlapIoU, onDegenerate: o.onDegenerate },
      features: features, cosines: cosines
    };
  }

  const decoder = Object.freeze({
    defaults: DECODER_DEFAULTS,
    keyRule: decoderKeyRule, cosines: decoderCosines, maskcut: decoderMaskcut,
    notReplicated: 'the bilateral post-processing of the masks and their resize to the photograph\'s own size'
  });

  // ------------------------------------------------------------------ Core.metrics: the readings' scores (plan decision 6)
  // evaluation/metrics.py (instance_metrics, adjusted_rand_index), the yardstick of the readings, on binary masks and
  // label arrays of one length (any number of pixels, in any layout).

  // checkSameLength(a, b, what): throw unless a and b are array-likes of one length.
  function checkSameLength(a, b, what) {
    if (!isArrayLike(a) || !isArrayLike(b)) throw new TypeError(what + ' must be arrays of pixels');
    if (a.length !== b.length) throw new RangeError(what + ' cover ' + a.length + ' and ' + b.length + ' pixels');
  }

  // pairIoU(a, b): |a and b| / |a or b| of two masks; 0 when both are empty (no overlap, so never a match).
  function pairIoU(a, b) {
    let inter = 0, uni = 0;
    for (let i = 0; i < a.length; i++) {
      const x = !!a[i], y = !!b[i];
      if (x && y) inter++;
      if (x || y) uni++;
    }
    return uni ? inter / uni : 0;
  }

  // assignMax(matrix, rows, cols): the assignment of rows to columns that maximises the sum of matrix[r][c], by the Hungarian algorithm with potentials (O(s^3) on the s x s matrix padded with zeros); answers an Int32Array of each row's column, or -1 for a row left with padding.
  function assignMax(matrix, rows, cols) {
    const s = Math.max(rows, cols);
    const u = new Float64Array(s + 1), v = new Float64Array(s + 1), way = new Int32Array(s + 1), p = new Int32Array(s + 1);
    // cost(r, c): the value to minimise, minus the matrix entry, 0 in the padding.
    const cost = function (r, c) { return r < rows && c < cols ? -matrix[r][c] : 0; };
    for (let i = 1; i <= s; i++) {
      p[0] = i;
      let j0 = 0;
      const minv = new Float64Array(s + 1).fill(Infinity), used = new Uint8Array(s + 1);
      do {
        used[j0] = 1;
        const i0 = p[j0];
        let delta = Infinity, j1 = 0;
        for (let j = 1; j <= s; j++) {
          if (used[j]) continue;
          const cur = cost(i0 - 1, j - 1) - u[i0] - v[j];
          if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
          if (minv[j] < delta) { delta = minv[j]; j1 = j; }
        }
        for (let j = 0; j <= s; j++) {
          if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
        }
        j0 = j1;
      } while (p[j0] !== 0);
      do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
    }
    const out = new Int32Array(rows).fill(-1);
    for (let j = 1; j <= s; j++) if (p[j] >= 1 && p[j] <= rows && j <= cols) out[p[j] - 1] = j - 1;
    return out;
  }

  // hungarianIoU(truthMasks, predMasks): the readings' primary score: the IoU of every truth object with every predicted region (matrix, truth rows), the Hungarian assignment that maximises their sum, and the mean over the truth objects of each one's matched IoU (score); an object left unmatched, or matched with IoU 0, counts 0, as instance_metrics' matched_instance_iou. pairs lists the matches with IoU above 0 ({truth, pred, iou}); perTruth each object's credit. score is NaN without a truth object (the evaluator's undefined image).
  function hungarianIoU(truthMasks, predMasks) {
    if (!isArrayLike(truthMasks) || !isArrayLike(predMasks)) throw new TypeError('hungarianIoU takes two lists of masks');
    const T = truthMasks.length, P = predMasks.length;
    const matrix = [];
    for (let t = 0; t < T; t++) {
      const row = new Float64Array(P);
      for (let p = 0; p < P; p++) {
        checkSameLength(truthMasks[t], predMasks[p], 'a truth mask and a predicted mask');
        row[p] = pairIoU(truthMasks[t], predMasks[p]);
      }
      matrix.push(row);
    }
    const perTruth = new Float64Array(T);
    const pairs = [];
    if (T === 0) return { score: NaN, pairs: pairs, matrix: matrix, perTruth: perTruth, matched: 0 };
    if (P > 0) {
      const colOf = assignMax(matrix, T, P);
      for (let t = 0; t < T; t++) {
        const p = colOf[t];
        if (p >= 0 && matrix[t][p] > 0) { perTruth[t] = matrix[t][p]; pairs.push({ truth: t, pred: p, iou: matrix[t][p] }); }
      }
    }
    let sum = 0;
    for (let t = 0; t < T; t++) sum += perTruth[t];
    return { score: sum / T, pairs: pairs, matrix: matrix, perTruth: perTruth, matched: pairs.length };
  }

  // fgARI(truthLabels, predLabels, fgMask): the adjusted Rand index between the truth's object ids and the predicted ids over the foreground pixels (fgMask, or truthLabels > 0 without it), the predicted background (id 0) counting as one cluster, as adjusted_rand_index: 1 for fewer than two pixels and when the maximum index equals the expected one; 0 is chance level and a value can be negative.
  function fgARI(truthLabels, predLabels, fgMask) {
    checkSameLength(truthLabels, predLabels, 'the truth and the predicted labels');
    if (fgMask !== undefined && fgMask !== null) checkSameLength(truthLabels, fgMask, 'the labels and the foreground mask');
    const tIds = new Map(), pIds = new Map();
    let n = 0;
    for (let i = 0; i < truthLabels.length; i++) {
      const inFg = fgMask !== undefined && fgMask !== null ? !!fgMask[i] : truthLabels[i] > 0;
      if (!inFg) continue;
      n++;
      if (!tIds.has(truthLabels[i])) tIds.set(truthLabels[i], tIds.size);
      if (!pIds.has(predLabels[i])) pIds.set(predLabels[i], pIds.size);
    }
    if (n < 2) return 1;
    const R = tIds.size, C = pIds.size;
    const table = new Float64Array(R * C), rowSum = new Float64Array(R), colSum = new Float64Array(C);
    for (let i = 0; i < truthLabels.length; i++) {
      const inFg = fgMask !== undefined && fgMask !== null ? !!fgMask[i] : truthLabels[i] > 0;
      if (!inFg) continue;
      const r = tIds.get(truthLabels[i]), c = pIds.get(predLabels[i]);
      table[r * C + c]++;
      rowSum[r]++;
      colSum[c]++;
    }
    // choose2(list): the number of pairs within each count, summed (n (n - 1) / 2 for each n).
    const choose2 = function (list) {
      let s = 0;
      for (let i = 0; i < list.length; i++) s += list[i] * (list[i] - 1) / 2;
      return s;
    };
    const pairs = n * (n - 1) / 2;
    const index = choose2(table), rows = choose2(rowSum), cols = choose2(colSum);
    const expected = rows * cols / pairs;
    const maximum = 0.5 * (rows + cols);
    return maximum === expected ? 1 : (index - expected) / (maximum - expected);
  }

  // bgFPR(truthFg, predFg): the predicted foreground pixels that are truth background, over the truth background (lower is better); NaN without truth background (evaluation/metrics.py leaves it None; the readings' metrics_v2 writes 0 there).
  function bgFPR(truthFg, predFg) {
    checkSameLength(truthFg, predFg, 'the truth and the predicted foreground');
    let bg = 0, fp = 0;
    for (let i = 0; i < truthFg.length; i++) {
      if (truthFg[i]) continue;
      bg++;
      if (predFg[i]) fp++;
    }
    return bg ? fp / bg : NaN;
  }

  // unionIoU(truthUnion, predUnion): the IoU of the predicted foreground (every region) with the truth foreground; NaN when both are empty.
  function unionIoU(truthUnion, predUnion) {
    checkSameLength(truthUnion, predUnion, 'the truth and the predicted foreground');
    let inter = 0, uni = 0;
    for (let i = 0; i < truthUnion.length; i++) {
      const x = !!truthUnion[i], y = !!predUnion[i];
      if (x && y) inter++;
      if (x || y) uni++;
    }
    return uni ? inter / uni : NaN;
  }

  // regionCount(predMasks): how many predicted masks hold at least one pixel.
  function regionCount(predMasks) {
    let count = 0;
    for (let i = 0; i < predMasks.length; i++) if (countOnes(predMasks[i]) > 0) count++;
    return count;
  }

  // idsFromMasks(masks): an id map (Int16Array) with 0 for background and k + 1 where mask k holds the pixel, the earlier mask winning where masks overlap, as src/decoder_v2.py ids_from_masks.
  function idsFromMasks(masks) {
    if (!isArrayLike(masks) || !masks.length) return new Int16Array(0);
    const n = masks[0].length;
    const ids = new Int16Array(n);
    for (let k = masks.length - 1; k >= 0; k--) {
      if (masks[k].length !== n) throw new RangeError('the masks cover different numbers of pixels');
      for (let i = 0; i < n; i++) if (masks[k][i]) ids[i] = k + 1;
    }
    return ids;
  }

  const metrics = Object.freeze({
    hungarianIoU: hungarianIoU, fgARI: fgARI, bgFPR: bgFPR, unionIoU: unionIoU, regionCount: regionCount,
    idsFromMasks: idsFromMasks, assign: function (matrix) { return assignMax(matrix, matrix.length, matrix.length ? matrix[0].length : 0); }
  });

  // ------------------------------------------------------------------ Core.image: the bundle's photographs (plan decision 6)

  // The note a lab shows beside a photograph it drew with Core.image.load (plan decision 6: the resampling difference).
  const IMAGE_NOTE = 'Toy: not the real model\'s pixels. The bundle\'s script decoded each photograph with PIL, resized its ' +
    'short side with PIL\'s bicubic filter (a cubic kernel with a = -0.5, widened by the shrink factor so that it averages ' +
    'every source pixel it covers) and cut the centre square. This page asks the browser to decode the same JPEG file and ' +
    'to draw the same square into a canvas with imageSmoothingQuality set to high, a filter the HTML standard leaves to each ' +
    'browser; the two JPEG decoders can also differ in how they fill in the colour detail. So single pixel values can differ ' +
    'by a few levels. The tokens and keys in the labs are the bundle\'s own numbers, computed from PIL\'s pixels.';

  // pythonRound(x): Python's round(x) to a whole number: halves go to the even neighbour.
  function pythonRound(x) {
    const f = Math.floor(x), diff = x - f;
    if (diff > 0.5) return f + 1;
    if (diff < 0.5) return f;
    return f % 2 === 0 ? f : f + 1;
  }

  // viewGeometry(width, height, side): the square view of a photograph as build/make_bundle.py view_geometry cuts it: the short side resized to `side` (the long side to int(side * long / short)), then the centre crop at offsets round((size - side) / 2), Python's rounding. {side, resize: [w, h], crop: [left, top, side, side], box: [x0, y0, x1, y1] (the same square in the photograph's own pixels, unrounded), grid: [side / 16, side / 16], tokens}.
  function viewGeometry(width, height, side) {
    const w = Number(width), h = Number(height), s = checkSide(side);
    if (!(w >= 1 && h >= 1)) throw new RangeError('the photograph needs a width and a height');
    const short = Math.min(w, h), long = Math.max(w, h);
    const newLong = Math.floor(s * long / short);
    const rw = w <= h ? s : newLong, rh = w <= h ? newLong : s;
    const left = pythonRound((rw - s) / 2), top = pythonRound((rh - s) / 2);
    const sx = w / rw, sy = h / rh;
    const g = Math.floor(s / PATCH);
    return {
      side: s, resize: [rw, rh], crop: [left, top, s, s],
      box: [left * sx, top * sy, (left + s) * sx, (top + s) * sy],
      grid: [g, g], tokens: g * g
    };
  }

  // imageUrl(id): the relative address of a bundle photograph, data/images/<id>.jpg (the id has twelve digits).
  function imageUrl(id) {
    const s = String(id);
    if (!/^\d{12}$/.test(s)) throw new RangeError('a bundle photograph has a twelve-digit id, not ' + JSON.stringify(s));
    return 'data/images/' + s + '.jpg';
  }

  // loadImage(url, sideOrOptions): a promise of the side x side view (224 by default, or 480) of a photograph as ImageData: the browser decodes the file and draws the view's box (options.box, or viewGeometry of its natural size) into a canvas with high-quality smoothing; the result carries .view = {url, side, box}. See Core.image.note for how these pixels differ from the bundle script's.
  function loadImage(url, sideOrOptions) {
    const o = typeof sideOrOptions === 'number' ? { side: sideOrOptions } : (sideOrOptions || {});
    return new Promise(function (resolve, reject) {
      let side;
      try { side = checkSide(o.side === undefined ? 224 : o.side); } catch (err) { reject(err); return; }
      if (typeof root.Image !== 'function') { reject(new Error('this browser cannot load images')); return; }
      const img = new root.Image();
      img.onerror = function () { reject(new Error('the photograph ' + url + ' did not load')); };
      img.onload = function () {
        try {
          const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
          const box = o.box || viewGeometry(w, h, side).box;
          const cv = newCanvas(side, side);
          if (!cv) throw new Error('this browser cannot draw on a canvas');
          const ctx = cv.ctx;
          ctx.imageSmoothingEnabled = true;
          try { ctx.imageSmoothingQuality = 'high'; } catch (e) { /* older browsers */ }
          ctx.drawImage(img, box[0], box[1], box[2] - box[0], box[3] - box[1], 0, 0, side, side);
          const data = new Uint8ClampedArray(ctx.getImageData(0, 0, side, side).data);
          for (let k = 3; k < data.length; k += 4) data[k] = 255;
          const out = makeImageData(side, side, data);
          try { out.view = { url: String(url), side: side, box: box.slice() }; } catch (e) { /* a sealed object keeps no note */ }
          resolve(out);
        } catch (err) {
          reject(err);
        }
      };
      img.src = url;
    });
  }

  const image = Object.freeze({ viewGeometry: viewGeometry, load: loadImage, url: imageUrl, note: IMAGE_NOTE, sides: Object.freeze([224, 480]) });

  // ------------------------------------------------------------------ labs

  const labRegistry = Object.create(null);
  const labOrder = [];

  // registerLab(id, mount): remember mount(root, core) for the section <section class="lab" data-lab="id">; registering an id again replaces it.
  function registerLab(id, mount) {
    if (typeof id !== 'string' || !id) throw new TypeError('Labs.register needs an id string');
    if (typeof mount !== 'function') throw new TypeError('Labs.register needs a mount function for ' + id);
    if (labRegistry[id]) logError('Labs.register', new Error('replacing the widget registered as ' + id));
    else labOrder.push(id);
    labRegistry[id] = mount;
  }

  // mountOne(d, section, useCore, report): mount one lab section into its .lab-body and record the outcome (see mountAll).
  function mountOne(d, section, useCore, report) {
    const id = section.getAttribute('data-lab') || '';
    const state = section.getAttribute('data-lab-state');
    let body = typeof section.querySelector === 'function' ? section.querySelector('.lab-body') : null;
    if (!body) {
      body = d.createElement('div');
      body.className = 'lab-body';
      section.appendChild(body);
    }
    const mount = labRegistry[id];
    if (!mount) {
      showNote(body, 'This lab could not start: no widget is registered as "' + id + '"', true);
      section.setAttribute('data-lab-state', 'missing');
      report.missing.push(id);
      return;
    }
    if (state === 'missing') body.textContent = '';
    try {
      const result = mount(body, useCore);
      section.setAttribute('data-lab-state', 'mounted');
      report.mounted.push(id);
      if (result && typeof result.then === 'function') {
        result.then(null, function (err) {
          logError('lab ' + id, err);
          showNote(body, 'This lab could not start: ' + describeError(err), true);
          section.setAttribute('data-lab-state', 'failed');
        });
      }
    } catch (err) {
      logError('lab ' + id, err);
      showNote(body, 'This lab could not start: ' + describeError(err), true);
      section.setAttribute('data-lab-state', 'failed');
      report.failed.push({ id: id, error: describeError(err) });
    }
  }

  // mountAll(core, options): mount each registered lab into the .lab-body of its <section class="lab" data-lab="id">; a missing widget, a mount that throws or one whose promise rejects leaves 'This lab could not start: <error>' in that body. A later call mounts only sections still missing a widget. Returns {mounted, failed, missing, unused, done}, where done is a promise that resolves with the report once every lab has been tried.
  // By default every lab mounts at once. With options.stagger, each lab mounts in its own task, in page order, so a slow device can scroll and respond between labs; the labs before options.before (an element, such as a deep-link target) still mount at once, so the page above it does not grow after the browser has scrolled there.
  function mountAll(core, options) {
    const useCore = core || root.Core;
    const report = { mounted: [], failed: [], missing: [], unused: [], done: null };
    const d = root.document;
    const settle = typeof Promise === 'function'
      ? function () { return Promise.resolve(report); }
      : function () { return null; };
    if (!d || typeof d.querySelectorAll !== 'function') {
      report.done = settle();
      return report;
    }
    const sections = Array.prototype.slice.call(d.querySelectorAll('section.lab[data-lab]'));
    const seen = Object.create(null);
    const todo = [];
    sections.forEach(function (section) {
      seen[section.getAttribute('data-lab') || ''] = true;
      const state = section.getAttribute('data-lab-state');
      if (state !== 'mounted' && state !== 'failed' && state !== 'pending') todo.push(section);
    });
    const finish = function () {
      labOrder.forEach(function (id) { if (!seen[id]) report.unused.push(id); });
    };
    const o = options || {};
    if (!o.stagger || typeof root.setTimeout !== 'function' || typeof Promise !== 'function') {
      todo.forEach(function (section) { mountOne(d, section, useCore, report); });
      finish();
      report.done = settle();
      return report;
    }
    // before(section): whether the section comes earlier in the page than o.before.
    const before = function (section) {
      try {
        return !!(o.before && typeof section.compareDocumentPosition === 'function' &&
          (section.compareDocumentPosition(o.before) & 4) && !section.contains(o.before));
      } catch (e) {
        return false;
      }
    };
    const later = [];
    todo.forEach(function (section) {
      if (before(section)) mountOne(d, section, useCore, report);
      else {
        section.setAttribute('data-lab-state', 'pending');
        later.push(section);
      }
    });
    report.done = new Promise(function (resolve) {
      // next(): mount the next waiting lab, then give the browser a turn before the one after it.
      function next() {
        const section = later.shift();
        if (!section) {
          finish();
          resolve(report);
          return;
        }
        section.removeAttribute('data-lab-state');
        mountOne(d, section, useCore, report);
        root.setTimeout(next, 0);
      }
      root.setTimeout(next, 0);
    });
    return report;
  }

  const Labs = {
    register: registerLab,
    mountAll: mountAll,
    // has(id): whether a widget is registered as id.
    has: function (id) { return !!labRegistry[id]; },
    // get(id): the mount function registered as id, or null. boot.js hands the bundles of a lab that waits for data (a section with
    // data-needs) to it as the third argument, mount(root, core, bundles), which mountAll cannot do (it passes two arguments).
    get: function (id) { return labRegistry[id] || null; },
    // ids(): the registered ids in registration order.
    ids: function () { return labOrder.slice(); }
  };

  // ------------------------------------------------------------------ export

  const Core = {
    version: '2026-10-13.1',
    constants: CONSTANTS,
    bundle: bundle,
    rule: rule,
    decoder: decoder,
    metrics: metrics,
    image: image,
    rng: rng,
    sampleImage: sampleImage,
    sceneRenderer: sceneRenderer,
    sceneObjectAt: sceneObjectAt,
    currentImage: currentImage,
    setUploadedImage: setUploadedImage,
    useSampleImage: useSampleImage,
    on: on,
    off: off,
    emit: emit,
    patchGrid: patchGrid,
    toyFeatures: toyFeatures,
    toyProject: toyProject,
    toyKeys: toyKeys,
    labKeys: labKeys,
    positionEmbedding: positionEmbedding,
    normalisePixel: normalisePixel,
    cosine: cosine,
    dot: dot,
    norm: norm,
    normalise: normalise,
    centreRows: centreRows,
    addToRows: addToRows,
    cosineMatrix: cosineMatrix,
    randomUnit: randomUnit,
    softmax: softmax,
    entropy: entropy,
    crossEntropy: crossEntropy,
    ema: ema,
    neighbours8: neighbours8,
    neighbourInfo: neighbourInfo,
    neighbourSims: neighbourSims,
    rankRow: rankRow,
    selectPositives: selectPositives,
    quantile: quantile,
    eigSym: eigSym,
    ncut: ncut,
    maskcut: maskcut,
    cropSampler: cropSampler,
    augment: augment,
    resampleRect: resampleRect,
    cosineMomentum: cosineMomentum,
    teacherRemaining: teacherRemaining,
    warmupCosine: warmupCosine,
    theme: theme,
    parseColour: parseColour,
    rgba: rgba,
    mix: mix,
    fmt: fmt,
    fmtSci: fmtSci,
    el: el,
    guard: guard,
    makeImageData: makeImageData,
    paintImage: paintImage,
    toCanvas: toCanvas,
    fitCanvas: fitCanvas,
    canvasPoint: canvasPoint
  };

  root.Core = Core;
  root.Labs = Labs;
})(typeof window !== 'undefined' ? window : this);
