/*
 * labs_p7.js: Part 7 of the course "Pixels to Islands" (docs/research/explainer_v2_2026-10-13/), the pipeline film.
 *
 *   lab-7a-film   One photograph of the course's bundle (000000114269, a dog and a cat by a door) followed end to end
 *                 in twelve stops that Scenes.create plays (src/scenes.js): 1 the image as numbers, 2 the crops, 3 the
 *                 patches and the token of the followed patch, 4 its attention in the twelve blocks, 5 teacher and
 *                 student, 6 the similarity matrix and its two quantiles, 7 the positives and negatives with the caps,
 *                 8 the InfoNCE term and its shares, 9 the gradient as a pull and a push, 10 the AdamW update and the
 *                 teacher's moving average, 11 the decoder on the 480 px keys, 12 what a reading does with the regions.
 *
 * The real numbers come from four files of data/ that boot.js loads (the section's data-needs) and hands to mount as
 * its third argument: images.json (the views), followed.json (run 2's student and teacher tokens, the similarity
 * matrix, the sets, the InfoNCE values and shares, the gradient and its pull and push, the attention rows of the
 * followed token, the decoder's stages and regions under run 2, the converted DINO and released SelfPatch),
 * 000000114269_con2_tokens224.json (run 2's teacher tokens) and 000000114269_con2_keys480.json (run 2's teacher keys
 * at 480 px); the photograph is read from data/images by Core.image. Run 2's schedule at four steps (stops 8 and 10)
 * comes from its training log through facts/bundle_facts.json (SCHEDULE). The toy parts say so on the page: the pixel
 * values that the browser decodes in stop 1, the crops other than the bundle's view, the scaling of each attention map
 * in stop 4, the colour projection of stop 5, the plane of stop 9, the AdamW and moving-average arithmetic and the two
 * objects of stop 12. Every stop has a resting frame (its picture at t = 1) and a frame for any t from 0 to 1 while the
 * film plays.
 *
 * Vanilla ES2019, ASCII only, no library; this file fetches, stores and sends nothing. Defaults: src/labs_defaults.json,
 * key "lab-7a-film". Contract: design.md sections 4 (Part 7) and 8, the plan's Task 11, README.md section 4.
 * window.LabP7 exposes the copy and the constants of the film for tests/smoke_p7.js.
 */
(function (root) {
  'use strict';

  const Labs = root.Labs;
  if (!Labs || typeof Labs.register !== 'function') return;

  // ------------------------------------------------------------------ constants (src/labs_defaults.json, "lab-7a-film")

  const VERSION = '2026-10-13.2';
  const IMAGE_ID = '000000114269';
  const FILES = Object.freeze({
    images: 'images.json',
    followed: 'followed.json',
    tokens: '000000114269_con2_tokens224.json',
    keys: '000000114269_con2_keys480.json'
  });
  const N = 196;   // tokens of the 224 px view
  const G = 14;    // the side of their grid
  const D = 384;   // numbers in a token or a key
  const NK = 900;  // keys of the 480 px view
  const GK = 30;   // the side of their grid
  const PATCH = 16;
  const DURATIONS = Object.freeze([6, 6, 7, 9, 7, 8, 8, 8, 8, 9, 10, 8]);
  const CROP_SEED = 7;
  const LOCAL_CROPS = 8;
  const TOY_WEIGHT = 0.5;
  const HIST_BINS = 50;
  const TAU_SLIDER = Object.freeze({ min: 0.05, max: 0.5, step: 0.01, value: 0.2 });
  const DECODER_TAU_SLIDER = Object.freeze({ min: 0.05, max: 0.5, step: 0.01, value: 0.2 });
  const UPDATES = Object.freeze({ min: 1, max: 20, value: 10 });
  const TOY_BOXES = Object.freeze([
    Object.freeze({ name: 'A', r0: 2, c0: 9, r1: 16, c1: 21 }),
    Object.freeze({ name: 'B', r0: 18, c0: 3, r1: 29, c1: 27 })
  ]);
  const ADAM = Object.freeze({ beta1: 0.9, beta2: 0.999, eps: 1e-8 });
  // Run 2's schedule at four steps of its telemetry: facts/bundle_facts.json real_tel_con2_s1_*, _s463_*, _s4620_*, _s9240_*.
  const SCHEDULE = Object.freeze([
    Object.freeze({ step: 1, label: '1', lr: 0, wd: 0.04, momentum: 0.9995, conLoss: 0.7336 }),
    Object.freeze({ step: 463, label: '463', lr: 1e-6, wd: 0.0422, momentum: 0.999503, conLoss: 0.7302 }),
    Object.freeze({ step: 4620, label: '4,620', lr: 1e-5, wd: 0.2199, momentum: 0.99975, conLoss: 0.0372 }),
    Object.freeze({ step: 9240, label: '9,240', lr: 1e-7, wd: 0.4, momentum: 1, conLoss: 0.0269 })
  ]);
  const DECODER_MODELS = Object.freeze([
    Object.freeze({ key: 'con2', label: 'run 2' }),
    Object.freeze({ key: 'dino', label: 'converted DINO' }),
    Object.freeze({ key: 'selfpatch', label: 'released SelfPatch' })
  ]);
  const SUBSTEPS = Object.freeze(['keys', 'key rule', 'links', 'Fiedler', 'split', 'region']);
  const MONO = '"JetBrains Mono", ui-monospace, "Cascadia Mono", Consolas, monospace';

  // characters, escaped so that the file stays ASCII
  const TIMES = '\u00D7';
  const MINUS = '\u2212';
  const TAU = '\u03C4';
  const LAMBDA = '\u03BB';
  const EPSILON = '\u03B5';
  const ELLIPSIS = '\u2026';
  const RSQUO = '\u2019';
  const SUB2 = '\u2082';
  const ARROW = '\u2192';
  const SQRT = '\u221A';
  const HAT = '\u0302';

  // ------------------------------------------------------------------ small helpers

  // clamp(x, lo, hi): x limited to [lo, hi].
  function clamp(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }
  // phase(t, a, b): how far t has come from a to b, from 0 to 1: the share of a stop's time that one movement takes.
  function phase(t, a, b) { return clamp((t - a) / (b - a), 0, 1); }
  // ease(x): x from 0 to 1 with a gentle start and stop.
  function ease(x) { const s = clamp(x, 0, 1); return s * s * (3 - 2 * s); }
  // lerp(a, b, k): the value k of the way from a to b.
  function lerp(a, b, k) { return a + (b - a) * k; }
  // logError(where, err): a problem written to the console; never throws.
  function logError(where, err) {
    try {
      if (root.console && typeof root.console.error === 'function') root.console.error('[lab-7a-film] ' + where, err);
    } catch (e) { /* nothing more can be done */ }
  }
  // cellOf(i, side): 'row r, column c' of cell i on a side x side grid, counting from 0.
  function cellOf(i, side) { return 'row ' + Math.floor(i / side) + ', column ' + (i % side); }
  // num(core, x, digits): a number for a readout: commas, a true minus sign, a power of ten for tiny values.
  function num(core, x, digits) {
    const v = Number(x);
    if (v === 0) return '0';
    if (isFinite(v) && Math.abs(v) < 1e-3) return core.fmtSci(v, 2);
    return core.fmt(v, digits === undefined ? 4 : digits);
  }
  // rowOf(array, i, d): row i of a flat row-major array, as a view.
  function rowOf(array, i, d) { return array.subarray(i * d, (i + 1) * d); }
  // dot(a, b) and norm(a): the dot product and the length.
  function dot(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }
  function norm(a) { return Math.sqrt(dot(a, a)); }
  // unitRows(array, n, d): every row scaled to length 1, as a Float64Array.
  function unitRows(array, n, d) {
    const out = new Float64Array(n * d);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let k = 0; k < d; k++) s += array[i * d + k] * array[i * d + k];
      const r = Math.max(Math.sqrt(s), 1e-12);
      for (let k = 0; k < d; k++) out[i * d + k] = array[i * d + k] / r;
    }
    return out;
  }
  // maxAbs(a): the largest size of a value.
  function maxAbs(a) { let m = 0; for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i])); return m; }
  // argMax(a): the index of the largest value.
  function argMax(a) { let k = 0; for (let i = 1; i < a.length; i++) if (a[i] > a[k]) k = i; return k; }
  // cached(state, key, make): make() once per key and film.
  function cached(state, key, make) {
    if (!Object.prototype.hasOwnProperty.call(state.cache, key)) state.cache[key] = make();
    return state.cache[key];
  }

  // ------------------------------------------------------------------ colours (core.theme(): the page's tokens)

  const TOKENS = ['paper', 'ink', 'muted', 'line', 'student', 'teacher', 'positive', 'negative', 'ignored'];
  // palette(core): the colour tokens as CSS strings and as [r, g, b].
  function palette(core) {
    const css = core.theme();
    const rgb = {};
    TOKENS.forEach(function (k) {
      const p = core.parseColour(css[k]);
      rgb[k] = p ? [p[0], p[1], p[2]] : [128, 128, 128];
    });
    return { css: css, rgb: rgb };
  }
  // mix3(a, b, k): the colour k of the way from a to b, as [r, g, b].
  function mix3(a, b, k) {
    const t = clamp(k, 0, 1);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }
  // rgbCss(c, alpha): an [r, g, b] colour as an rgba() string.
  function rgbCss(c, alpha) {
    return 'rgba(' + Math.round(c[0]) + ', ' + Math.round(c[1]) + ', ' + Math.round(c[2]) + ', ' +
      (alpha === undefined ? 1 : clamp(alpha, 0, 1)) + ')';
  }

  // ------------------------------------------------------------------ the elements of a stop

  // kit(stage, state, key, build): the stop's own elements, built once per visit (the film empties the stage when it moves
  // to another stop, and every frame of the stop draws into the same elements).
  function kit(stage, state, key, build) {
    const known = state.ui[key];
    if (known && stage.firstChild === known.root) return known;
    while (stage.firstChild) stage.removeChild(stage.firstChild);
    const ui = build(state.core);
    ui.root.setAttribute('data-p7-stop', key);
    stage.appendChild(ui.root);
    state.ui[key] = ui;
    return ui;
  }
  // makeCanvas(core, w, h, label, focusable): a canvas of w x h CSS pixels (sharp on dense screens) with its context.
  function makeCanvas(core, w, h, label, focusable) {
    const attrs = { 'class': 'p7-canvas', 'aria-label': label };
    if (focusable) {
      attrs.tabindex = '0';
      attrs['class'] = 'p7-canvas drag-surface';
    } else {
      attrs.role = 'img';
    }
    const canvas = core.el('canvas', attrs);
    const ctx = core.fitCanvas(canvas, w, h);
    return { canvas: canvas, ctx: ctx, w: w, h: h };
  }
  function stopBox(core, kids) { return core.el('div', { 'class': 'p7-stop' }, kids); }
  function panel(core, kids) { return core.el('div', { 'class': 'p7-panel' }, kids); }
  function hint(core, text) { return core.el('p', { 'class': 'p7-hint' }, text); }
  function readoutList(core) { return core.el('dl', { 'class': 'readout p7-readout' }); }
  // fillReadout(core, dl, rows): the rows [[name, value], ...] as dt and dd pairs, rebuilt only when the text changes.
  function fillReadout(core, dl, rows) {
    const key = JSON.stringify(rows);
    if (dl.p7Key === key) return;
    dl.p7Key = key;
    while (dl.firstChild) dl.removeChild(dl.firstChild);
    rows.forEach(function (r) {
      dl.appendChild(core.el('dt', null, r[0]));
      dl.appendChild(core.el('dd', null, r[1]));
    });
  }
  // legend(core, items): a list of [class, text] items with their colour squares.
  function legend(core, items) {
    return core.el('ul', { 'class': 'legend p7-legend' }, items.map(function (it) { return core.el('li', { 'class': it[0] }, it[1]); }));
  }
  // listen(state, node, type, fn): an event handler whose errors show in the lab instead of breaking the page.
  function listen(state, node, type, fn) { node.addEventListener(type, state.core.guard(state.rootEl, fn)); }
  // segmented(state, name, label, options, value, onPick): a radio group drawn as small buttons; options [{value, label}].
  function segmented(state, name, label, options, value, onPick) {
    const core = state.core;
    const group = core.el('div', { 'class': 'segmented', role: 'radiogroup', 'aria-label': label });
    options.forEach(function (o, i) {
      const input = core.el('input', { type: 'radio', name: name, value: String(i) });
      input.checked = o.value === value;
      listen(state, input, 'change', function () { if (input.checked) onPick(o.value); });
      group.appendChild(core.el('label', null, [input, core.el('span', null, o.label)]));
    });
    return group;
  }
  // slider(state, id, label, range, value, show, onInput): a labelled range input with its live value.
  function slider(state, id, label, range, value, show, onInput) {
    const core = state.core;
    const out = core.el('output', { id: id + '-out', 'for': id }, show(value));
    const input = core.el('input', {
      type: 'range', id: id, min: String(range.min), max: String(range.max), step: String(range.step), value: String(value)
    });
    listen(state, input, 'input', function () {
      const v = Number(input.value);
      out.textContent = show(v);
      onInput(v);
    });
    return { node: core.el('div', { 'class': 'control p7-control' }, [core.el('label', { 'for': id }, label), out, input]), input: input, out: out };
  }
  // button(state, text, onClick): a plain button.
  function button(state, text, onClick) {
    const b = state.core.el('button', { type: 'button', 'class': 'btn' }, text);
    listen(state, b, 'click', onClick);
    return b;
  }
  // controlRow(core, kids): a wrapping row of controls.
  function controlRow(core, kids) { return core.el('div', { 'class': 'p7-controls' }, kids); }
  // pointerAt(state, cv, ev): the pointer in the canvas's drawing units.
  function pointerAt(state, cv, ev) { return state.core.canvasPoint(cv.canvas, ev, cv.w, cv.h); }

  // ------------------------------------------------------------------ drawing

  function clear(cv) { cv.ctx.clearRect(0, 0, cv.w, cv.h); }
  // text(ctx, s, x, y, colour, size, align, bold): one line of text in the mono face.
  function text(ctx, s, x, y, colour, size, align, bold) {
    ctx.font = (bold ? '600 ' : '') + (size || 11) + 'px ' + MONO;
    ctx.fillStyle = colour;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(s, x, y);
  }
  // backedText(ctx, state, s, x, y, colour, size, align): text on a small paper plate, readable over a photograph.
  function backedText(ctx, state, s, x, y, colour, size, align) {
    const sz = size || 11;
    ctx.font = sz + 'px ' + MONO;
    const w = ctx.measureText(s).width;
    const left = align === 'center' ? x - w / 2 : (align === 'right' ? x - w : x);
    ctx.fillStyle = rgbCss(state.pal.rgb.paper, 0.85);
    ctx.fillRect(left - 3, y - sz, w + 6, sz + 4);
    text(ctx, s, x, y, colour, sz, align);
  }
  // frame(ctx, x, y, w, h, colour, width): a rectangle outline.
  function frame(ctx, x, y, w, h, colour, width) {
    ctx.strokeStyle = colour;
    ctx.lineWidth = width || 1;
    ctx.strokeRect(x, y, w, h);
  }
  // arrow(ctx, x0, y0, x1, y1, colour, width): a straight arrow from (x0, y0) to (x1, y1).
  function arrow(ctx, x0, y0, x1, y1, colour, width) {
    const dx = x1 - x0, dy = y1 - y0, len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.5) return;
    const ux = dx / len, uy = dy / len, head = Math.min(10, len * 0.5);
    ctx.strokeStyle = colour;
    ctx.fillStyle = colour;
    ctx.lineWidth = width || 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1 - ux * head * 0.7, y1 - uy * head * 0.7);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - ux * head - uy * head * 0.45, y1 - uy * head + ux * head * 0.45);
    ctx.lineTo(x1 - ux * head + uy * head * 0.45, y1 - uy * head - ux * head * 0.45);
    ctx.closePath();
    ctx.fill();
  }
  // partialRect(ctx, x, y, w, h, f): the first f (0 to 1) of a rectangle's outline, drawn clockwise from its top left.
  function partialRect(ctx, x, y, w, h, f) {
    const pts = [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]];
    let left = 2 * (w + h) * clamp(f, 0, 1);
    if (left <= 0) return;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let i = 1; i < pts.length && left > 0; i++) {
      const a = pts[i - 1], b = pts[i];
      const seg = Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]);
      const take = Math.min(left, seg);
      ctx.lineTo(a[0] + (b[0] - a[0]) * take / seg, a[1] + (b[1] - a[1]) * take / seg);
      left -= take;
    }
    ctx.stroke();
  }
  // placeholder(ctx, state, x, y, w, h, message): an empty box that says why there is no picture yet.
  function placeholder(ctx, state, x, y, w, h, message) {
    const P = state.pal;
    ctx.fillStyle = rgbCss(P.rgb.muted, 0.12);
    ctx.fillRect(x, y, w, h);
    frame(ctx, x + 0.5, y + 0.5, w - 1, h - 1, P.css.line, 1);
    ctx.font = '10px ' + MONO;
    const say = ctx.measureText(message).width <= w - 8 ? message : (ctx.measureText(ELLIPSIS).width <= w - 4 ? ELLIPSIS : '');
    if (say && h >= 14) text(ctx, say, x + w / 2, y + h / 2 + 4, P.css.muted, 10, 'center');
  }
  // drawPhoto(ctx, state, x, y, w, h, src): the photograph, or its part src = [sx, sy, sw, sh], into the box.
  function drawPhoto(ctx, state, x, y, w, h, src) {
    if (state.photo) {
      if (src) ctx.drawImage(state.photo, src[0], src[1], src[2], src[3], x, y, w, h);
      else ctx.drawImage(state.photo, x, y, w, h);
      return true;
    }
    placeholder(ctx, state, x, y, w, h, state.photoFailed ? 'the photograph did not load' : 'loading the photograph' + ELLIPSIS);
    return false;
  }
  // drawView(ctx, state, side, x, y, size, src): the 224 or 480 px view (or its part src) as a size x size square.
  function drawView(ctx, state, side, x, y, size, src) {
    const v = state.views[side];
    if (v && v.canvas) {
      if (src) ctx.drawImage(v.canvas, src[0], src[1], src[2], src[3], x, y, size, size);
      else ctx.drawImage(v.canvas, x, y, size, size);
      return true;
    }
    placeholder(ctx, state, x, y, size, size, state.viewFailed[side] ? 'the view did not load' : 'loading the view' + ELLIPSIS);
    return false;
  }
  // gridLines(ctx, x, y, size, cells, colour): the lines of a cells x cells grid over a size x size square.
  function gridLines(ctx, x, y, size, cells, colour) {
    ctx.strokeStyle = colour;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < cells; i++) {
      const p = Math.round(i * size / cells) + 0.5;
      ctx.moveTo(x + p, y);
      ctx.lineTo(x + p, y + size);
      ctx.moveTo(x, y + p);
      ctx.lineTo(x + size, y + p);
    }
    ctx.stroke();
  }
  // cellBox(x, y, size, cells, i): the square of cell i of a cells x cells grid drawn over a size x size square.
  function cellBox(x, y, size, cells, i) {
    const s = size / cells;
    return { x: x + (i % cells) * s, y: y + Math.floor(i / cells) * s, s: s };
  }
  // cellAt(p, x, y, size, cells): the cell under the point p, or -1.
  function cellAt(p, x, y, size, cells) {
    if (p.x < x || p.y < y || p.x >= x + size || p.y >= y + size) return -1;
    const s = size / cells;
    return Math.floor((p.y - y) / s) * cells + Math.floor((p.x - x) / s);
  }
  // offscreen(core, imageData): a canvas that holds the image (null where the page cannot make one).
  function offscreen(core, imageData) {
    try { return core.toCanvas(imageData); } catch (err) { logError('an offscreen picture', err); return null; }
  }
  // blit(ctx, source, sx, sy, sw, sh, x, y, w, h): a part of an offscreen picture drawn without smoothing.
  function blit(ctx, source, sx, sy, sw, sh, x, y, w, h) {
    if (!source) return;
    const before = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(source, sx, sy, sw, sh, x, y, w, h);
    ctx.imageSmoothingEnabled = before;
  }

  // ------------------------------------------------------------------ the data of the film

  // need(member, shape, what): a decoded member of the given shape, or an error that names it.
  function need(member, shape, what) {
    if (!member || !member.array || !Array.isArray(member.shape) || member.shape.join(',') !== shape.join(',')) {
      throw new Error(what + ' should have the shape ' + shape.join(' x ') + ' (did the data files load whole?)');
    }
    return member.array;
  }
  // anchorGeometry(rec, anchor): where the followed patch lies in the photograph and on the 480 px grid.
  function anchorGeometry(rec, anchor) {
    const v224 = rec.views['224'], v480 = rec.views['480'];
    const b = v224.box_native, b4 = v480.box_native;
    const row = Math.floor(anchor / G), col = anchor % G;
    const nx = b[0] + (col + 0.5) * PATCH * (b[2] - b[0]) / v224.side;
    const ny = b[1] + (row + 0.5) * PATCH * (b[3] - b[1]) / v224.side;
    const kx = (nx - b4[0]) * v480.side / (b4[2] - b4[0]), ky = (ny - b4[1]) * v480.side / (b4[3] - b4[1]);
    const kc = clamp(Math.floor(kx / PATCH), 0, GK - 1), kr = clamp(Math.floor(ky / PATCH), 0, GK - 1);
    return { row: row, col: col, native: { x: Math.round(nx), y: Math.round(ny) }, cell480: kr * GK + kc };
  }
  // prepare(core, bundles): the film's state: the four data files, checked, and the reader's choices.
  function prepare(core, bundles) {
    const pick = function (file) {
      const b = bundles && (bundles[file] || bundles[file.replace(/\.json$/, '')]);
      if (!b) throw new Error('the data file ' + file + ' did not arrive');
      return b;
    };
    const I = pick(FILES.images), F = pick(FILES.followed), T = pick(FILES.tokens), K = pick(FILES.keys);
    const rec = (I.images || []).filter(function (r) { return r.id === IMAGE_ID; })[0];
    if (!rec || !rec.views || !rec.views['224'] || !rec.views['480']) throw new Error('images.json does not describe the photograph ' + IMAGE_ID);
    need(F.student_tokens224, [N, D], 'followed.json student_tokens224');
    need(F.teacher_tokens224, [N, D], 'followed.json teacher_tokens224');
    need(F.sim_teacher, [N, N], 'followed.json sim_teacher');
    need(F.attention_rows_con2, [12, 6, N], 'followed.json attention_rows_con2');
    need(F.anchor_grad, [D], 'followed.json anchor_grad');
    need(F.anchor_pull, [D], 'followed.json anchor_pull');
    need(F.anchor_push, [D], 'followed.json anchor_push');
    need(T.tokens, [N, D], FILES.tokens + ' tokens');
    need(K.keys, [NK, D], FILES.keys + ' keys');
    if (!F.decoder || !F.decoder.con2 || !Array.isArray(F.pos) || F.pos.length !== N) throw new Error('followed.json lacks the sets or the decoder\'s stages');
    const anchor = Number(F.anchor);
    return {
      core: core, I: I, F: F, T: T, K: K, rec: rec, IW: rec.width, IH: rec.height, anchor: anchor, geo: anchorGeometry(rec, anchor),
      views: {}, viewFailed: {}, photo: null, pixels: null, photoFailed: false,
      pal: palette(core), themeKey: 0, cache: {}, ui: {}, t: 1, film: null, rootEl: null,
      sel: {
        pixel: null, cropSeed: CROP_SEED, patch: anchor, block: null, twin: anchor, pair: null, setAnchor: anchor, tau: TAU_SLIDER.value,
        dot: null, schedule: 2, updates: UPDATES.value, substep: SUBSTEPS.length - 1, decoderTau: DECODER_TAU_SLIDER.value,
        pageDecoder: null, busy: false, model: 'con2', box: 0,
        boxes: TOY_BOXES.map(function (b) { return { name: b.name, r0: b.r0, c0: b.c0, r1: b.r1, c1: b.c1 }; }), drag: null
      }
    };
  }
  // pixelsOf(img, w, h): the photograph's RGBA bytes as the browser decodes them (null where the page cannot read them).
  function pixelsOf(img, w, h) {
    const d = root.document;
    if (!d || typeof d.createElement !== 'function') return null;
    const c = d.createElement('canvas');
    if (!c || typeof c.getContext !== 'function') return null;
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h).data;
  }
  // loadPictures(state): the photograph and its 224 and 480 px views, drawn by the browser; each redraws the film when
  // it arrives.
  function loadPictures(state) {
    const core = state.core;
    let url;
    try { url = core.image.url(IMAGE_ID); } catch (err) { state.photoFailed = true; return; }
    if (typeof root.Image === 'function') {
      const img = new root.Image();
      img.onload = function () {
        state.photo = img;
        try { state.pixels = pixelsOf(img, state.IW, state.IH); } catch (err) { logError('reading the pixels', err); }
        repaint(state);
      };
      img.onerror = function () { state.photoFailed = true; repaint(state); };
      img.src = url;
    } else {
      state.photoFailed = true;
    }
    [224, 480].forEach(function (side) {
      const view = state.rec.views[String(side)];
      core.image.load(url, { side: side, box: view.box_native }).then(function (data) {
        state.views[side] = { data: data, canvas: offscreen(core, data) };
        repaint(state);
      }, function (err) {
        state.viewFailed[side] = true;
        logError('the ' + side + ' px view', err);
        repaint(state);
      });
    });
  }
  // repaint(state, t): the current stop drawn again (at t, by default the last t drawn) while the film is paused.
  function repaint(state, t) {
    const film = state.film;
    if (!film || film.isPlaying()) return;
    const stop = STOPS[film.index()];
    try {
      stop.paint(film.stage, state, t === undefined ? state.t : t);
    } catch (err) {
      logError('redrawing the stop ' + stop.id, err);
    }
  }
  // touched(state): a reader's change: draw the whole picture of the stop (t = 1) unless the film is playing.
  function touched(state) { repaint(state, 1); }

  // derived numbers, computed once
  function teacherUnit(state) { return cached(state, 'teacherUnit', function () { return unitRows(state.F.teacher_tokens224.array, N, D); }); }
  function studentUnit(state) { return cached(state, 'studentUnit', function () { return unitRows(state.F.student_tokens224.array, N, D); }); }
  // simMatrix(state): the teacher's cosines with the diagonal set to minus infinity, as Core.rule.similarity gives them
  // (followed.json stores the diagonal as -1e9).
  function simMatrix(state) {
    return cached(state, 'sim', function () {
      const s = Float32Array.from(state.F.sim_teacher.array);
      for (let i = 0; i < N; i++) s[i * N + i] = -Infinity;
      return s;
    });
  }
  // ruleSets(state): every anchor's sets under the run's values, from Core.rule.sets (the bundle's own sets, checked
  // equal by tests/run_node_checks.js).
  function ruleSets(state) {
    return cached(state, 'sets', function () {
      const d = state.core.rule.defaults;
      return state.core.rule.sets(simMatrix(state), N, { k: d.k, negPct: d.negPct, capPos: d.capPos, capNeg: d.capNeg });
    });
  }
  // studentTeacher(state): cos(student token i, teacher token j) for every pair, n x n.
  function studentTeacher(state) {
    return cached(state, 'st', function () {
      const S = studentUnit(state), T = teacherUnit(state);
      const out = new Float64Array(N * N);
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          let s = 0;
          for (let k = 0, a = i * D, b = j * D; k < D; k++) s += S[a + k] * T[b + k];
          out[i * N + j] = s;
        }
      }
      return out;
    });
  }

  // ------------------------------------------------------------------ stop 1: the image is numbers

  function pixelAt(state, x, y) {
    if (!state.pixels) return null;
    const px = clamp(Math.round(x), 0, state.IW - 1), py = clamp(Math.round(y), 0, state.IH - 1);
    const o = (py * state.IW + px) * 4;
    return [state.pixels[o], state.pixels[o + 1], state.pixels[o + 2]];
  }
  function paintPixels(stage, state, t) {
    state.t = t;
    const core = state.core, P = state.pal;
    const W = 520, H = 290;
    const PH = { x: 0, y: 10, w: 360, h: 270 };
    const LP = { x: 376, y: 10, cell: 46 };
    const ui = kit(stage, state, 'pixels', function () {
      const cv = makeCanvas(core, W, H, 'The photograph of a dog and a cat by a door, with a magnifier that shows three by three of its pixels and their numbers');
      const dl = readoutList(core);
      const move = function (ev) {
        const p = pointerAt(state, cv, ev);
        if (p.x < PH.x || p.x >= PH.x + PH.w || p.y < PH.y || p.y >= PH.y + PH.h) return;
        state.sel.pixel = {
          x: clamp(Math.floor((p.x - PH.x) * state.IW / PH.w), 0, state.IW - 1),
          y: clamp(Math.floor((p.y - PH.y) * state.IH / PH.h), 0, state.IH - 1)
        };
        touched(state);
      };
      listen(state, cv.canvas, 'pointermove', move);
      listen(state, cv.canvas, 'pointerdown', move);
      return { root: stopBox(core, [cv.canvas, panel(core, [dl, hint(core, 'Point at the photograph, or tap it, to move the magnifier.')])]), cv: cv, dl: dl };
    });
    const cv = ui.cv, ctx = cv.ctx;
    clear(cv);
    drawPhoto(ctx, state, PH.x, PH.y, PH.w, PH.h);
    const target = state.sel.pixel || state.geo.native;
    const k = ease(phase(t, 0, 0.35));
    const px = Math.round(lerp(24, target.x, k)), py = Math.round(lerp(24, target.y, k));
    const sx = PH.x + (px + 0.5) * PH.w / state.IW, sy = PH.y + (py + 0.5) * PH.h / state.IH;
    ctx.lineWidth = 4;
    ctx.strokeStyle = rgbCss(P.rgb.paper, 0.9);
    ctx.beginPath();
    ctx.arc(sx, sy, 9, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = P.css.ink;
    ctx.beginPath();
    ctx.arc(sx, sy, 9, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = P.css.muted;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sx + 9, sy);
    ctx.lineTo(LP.x, LP.y + 1.5 * LP.cell);
    ctx.stroke();
    ctx.setLineDash([]);
    // the magnifier: 3 x 3 pixels, each with its own three numbers (dark or light figures, whichever reads on it)
    const reveal = Math.floor(9 * phase(t, 0.35, 0.7) + 1e-9);
    for (let q = 0; q < 9; q++) {
      const x = LP.x + (q % 3) * LP.cell, y = LP.y + Math.floor(q / 3) * LP.cell;
      const rgb = pixelAt(state, px + (q % 3) - 1, py + Math.floor(q / 3) - 1);
      if (q < reveal && rgb) {
        ctx.fillStyle = 'rgb(' + rgb[0] + ', ' + rgb[1] + ', ' + rgb[2] + ')';
        ctx.fillRect(x, y, LP.cell, LP.cell);
        const figures = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2] > 140 ? '#14181D' : '#FFFFFF';
        rgb.forEach(function (v, c) { text(ctx, String(v), x + LP.cell / 2, y + 14 + c * 13, figures, 10, 'center'); });
      }
      frame(ctx, x + 0.5, y + 0.5, LP.cell - 1, LP.cell - 1, P.css.line, 1);
    }
    frame(ctx, LP.x + LP.cell, LP.y + LP.cell, LP.cell, LP.cell, P.css.ink, 2);
    text(ctx, '3 ' + TIMES + ' 3 pixels enlarged', LP.x, LP.y + 3 * LP.cell + 16, P.css.muted, 10);
    text(ctx, 'with red, green, blue', LP.x, LP.y + 3 * LP.cell + 30, P.css.muted, 10);
    const rgb = pixelAt(state, px, py);
    const mean = core.constants.imagenetMean, std = core.constants.imagenetStd;
    const shown = t >= 0.7 && rgb;
    if (t >= 0.85 && rgb) {
      const nv = rgb.map(function (v, c) { return (v / 255 - mean[c]) / std[c]; });
      text(ctx, 'centre, normalised:', LP.x, LP.y + 3 * LP.cell + 58, P.css.muted, 10);
      nv.forEach(function (v, c) { text(ctx, ['red', 'green', 'blue'][c] + ' ' + core.fmt(v, 3), LP.x, LP.y + 3 * LP.cell + 74 + c * 15, P.css.ink, 11); });
    }
    const rows = [['pixel', 'x ' + px + ', y ' + py + ' of ' + state.IW + ' ' + TIMES + ' ' + state.IH]];
    if (shown) {
      rows.push(['red, green, blue', rgb.join(', ')]);
      rows.push(['divided by 255', rgb.map(function (v) { return core.fmt(v / 255, 3); }).join(', ')]);
      rows.push(['normalised', rgb.map(function (v, c) { return core.fmt((v / 255 - mean[c]) / std[c], 3); }).join(', ')]);
    } else {
      rows.push(['red, green, blue', state.photoFailed ? 'the photograph did not load' : ELLIPSIS]);
    }
    rows.push(['numbers in the photograph', state.IW + ' ' + TIMES + ' ' + state.IH + ' ' + TIMES + ' 3 = ' + core.fmt(state.IW * state.IH * 3)]);
    fillReadout(core, ui.dl, rows);
  }

  // ------------------------------------------------------------------ stop 2: the crops

  // toyCrop(r, w, h, scale, ratio): one crop drawn the way torchvision's RandomResizedCrop draws it (an area share in
  // scale, an aspect ratio in ratio, ten tries, then the centre square), on a w x h photograph.
  function toyCrop(r, w, h, scale, ratio) {
    const area = w * h, lo = Math.log(ratio[0]), hi = Math.log(ratio[1]);
    for (let attempt = 0; attempt < 10; attempt++) {
      const target = area * r.uniform(scale[0], scale[1]);
      const aspect = Math.exp(r.uniform(lo, hi));
      const cw = Math.round(Math.sqrt(target * aspect)), ch = Math.round(Math.sqrt(target / aspect));
      if (cw > 0 && ch > 0 && cw <= w && ch <= h) {
        return { x: r.int(w - cw + 1), y: r.int(h - ch + 1), w: cw, h: ch, share: cw * ch / area };
      }
    }
    // torchvision's fallback after ten failed tries: the whole image, its width or height cut to the nearest allowed ratio
    const inRatio = w / h;
    let fw = w, fh = h;
    if (inRatio < ratio[0]) fh = Math.round(w / ratio[0]);
    else if (inRatio > ratio[1]) fw = Math.round(h * ratio[1]);
    return { x: Math.floor((w - fw) / 2), y: Math.floor((h - fh) / 2), w: fw, h: fh, share: fw * fh / area };
  }
  function toyCrops(state) {
    const seed = state.sel.cropSeed;
    return cached(state, 'crops@' + seed, function () {
      const core = state.core, c = core.constants, r = core.rng(seed);
      const g2 = toyCrop(r, state.IW, state.IH, c.globalScale, c.cropRatio);
      const locals = [];
      for (let i = 0; i < LOCAL_CROPS; i++) locals.push(toyCrop(r, state.IW, state.IH, c.localScale, c.cropRatio));
      return { g2: g2, locals: locals };
    });
  }
  function paintCrops(stage, state, t) {
    state.t = t;
    const core = state.core, P = state.pal;
    const W = 520, H = 334;
    const PH = { x: 0, y: 0, w: 360, h: 270 };
    const VT = { x: 372, y: 0, s: 148 };
    const G2 = { x: 372, y: 186, s: 96 };
    const LT = { x: 0, y: 292, s: 38, gap: 7 };
    const ui = kit(stage, state, 'crops', function () {
      const cv = makeCanvas(core, W, H, 'The photograph with the bundle\u2019s 224-pixel view outlined, a toy second global crop and eight toy local crops, each also shown resized');
      const dl = readoutList(core);
      const key = legend(core, [['p7-key-ink', 'the bundle' + RSQUO + 's view (real)'], ['p7-key-dash', 'toy global crop 2'], ['p7-key-dot', 'toy local crops']]);
      const again = button(state, 'Cut other toy crops', function () {
        state.sel.cropSeed += 1;
        touched(state);
      });
      return { root: stopBox(core, [cv.canvas, panel(core, [controlRow(core, [again]), key, dl, hint(core, 'Each press draws the toy crops again with new random numbers, as each training step does; the bundle' + RSQUO + 's view stays.')])]), cv: cv, dl: dl };
    });
    const cv = ui.cv, ctx = cv.ctx;
    clear(cv);
    const sc = PH.w / state.IW;
    drawPhoto(ctx, state, PH.x, PH.y, PH.w, PH.h);
    const b = state.rec.views['224'].box_native;
    const box = { x: PH.x + b[0] * sc, y: PH.y + b[1] * sc, w: (b[2] - b[0]) * sc, h: (b[3] - b[1]) * sc };
    const f1 = phase(t, 0, 0.25);
    ctx.lineWidth = 5;
    ctx.strokeStyle = rgbCss(P.rgb.paper, 0.85);
    partialRect(ctx, box.x + 2, box.y + 2, box.w - 4, box.h - 4, f1);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = P.css.ink;
    partialRect(ctx, box.x + 2, box.y + 2, box.w - 4, box.h - 4, f1);
    const fv = phase(t, 0.1, 0.3);
    if (fv > 0) {
      ctx.globalAlpha = fv;
      drawView(ctx, state, 224, VT.x, VT.y, VT.s);
      frame(ctx, VT.x + 1, VT.y + 1, VT.s - 2, VT.s - 2, P.css.ink, 2);
      text(ctx, 'the bundle' + RSQUO + 's view', VT.x, VT.y + VT.s + 14, P.css.ink, 11);
      text(ctx, '224 ' + TIMES + ' 224 pixels', VT.x, VT.y + VT.s + 28, P.css.muted, 10);
      ctx.globalAlpha = 1;
    }
    const crops = toyCrops(state);
    const f2 = phase(t, 0.3, 0.45);
    if (f2 > 0) {
      const c = crops.g2;
      ctx.globalAlpha = f2;
      ctx.setLineDash([6, 4]);
      frame(ctx, PH.x + c.x * sc + 1, PH.y + c.y * sc + 1, c.w * sc - 2, c.h * sc - 2, P.css.ink, 2);
      ctx.setLineDash([]);
      drawPhoto(ctx, state, G2.x, G2.y, G2.s, G2.s, [c.x, c.y, c.w, c.h]);
      ctx.setLineDash([6, 4]);
      frame(ctx, G2.x + 1, G2.y + 1, G2.s - 2, G2.s - 2, P.css.ink, 2);
      ctx.setLineDash([]);
      text(ctx, 'toy global crop 2', G2.x, G2.y + G2.s + 14, P.css.muted, 10);
      ctx.globalAlpha = 1;
    }
    const fl = phase(t, 0.45, 0.5);
    if (fl > 0) {
      ctx.globalAlpha = fl;
      text(ctx, 'toy local crops, each resized to 96 ' + TIMES + ' 96', LT.x, LT.y - 7, P.css.muted, 10);
      ctx.globalAlpha = 1;
    }
    crops.locals.forEach(function (c, i) {
      const f = phase(t, 0.45 + i * 0.0625, 0.45 + (i + 1) * 0.0625);
      if (f <= 0) return;
      ctx.globalAlpha = f;
      ctx.setLineDash([2, 3]);
      frame(ctx, PH.x + c.x * sc + 0.5, PH.y + c.y * sc + 0.5, c.w * sc - 1, c.h * sc - 1, P.css.ink, 1.5);
      ctx.setLineDash([]);
      backedText(ctx, state, String(i + 1), PH.x + c.x * sc + 5, PH.y + c.y * sc + 14, P.css.ink, 10);
      const tx = LT.x + i * (LT.s + LT.gap);
      drawPhoto(ctx, state, tx, LT.y, LT.s, LT.s, [c.x, c.y, c.w, c.h]);
      ctx.setLineDash([2, 3]);
      frame(ctx, tx + 0.5, LT.y + 0.5, LT.s - 1, LT.s - 1, P.css.ink, 1.5);
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    });
    const v = state.rec.views['224'];
    let lo = 1, hi = 0;
    crops.locals.forEach(function (c) { lo = Math.min(lo, c.share); hi = Math.max(hi, c.share); });
    fillReadout(core, ui.dl, [
      ['the bundle' + RSQUO + 's view (real)', 'the photograph resized to ' + v.resize[0] + ' ' + TIMES + ' ' + v.resize[1] + ', columns ' + v.crop[0] + ' to ' + (v.crop[0] + v.crop[2] - 1) + ' kept'],
      ['toy global crop 2', 'covers ' + core.fmt(crops.g2.share, 2) + ' of the photograph'],
      ['toy local crops', 'each covers ' + core.fmt(lo, 2) + ' to ' + core.fmt(hi, 2) + ' of it']
    ]);
  }

  // ------------------------------------------------------------------ stop 3: patches and tokens

  function viewPixel(state, side, x, y) {
    const v = state.views[side];
    if (!v || !v.data || !v.data.data) return null;
    const o = (clamp(y, 0, side - 1) * side + clamp(x, 0, side - 1)) * 4;
    return [v.data.data[o], v.data.data[o + 1], v.data.data[o + 2]];
  }
  // tokenCells(ctx, state, values, x, y, cols, cell, count, role, scale): a vector as a grid of cells, positive values in
  // the role's colour and negative ones in grey, stronger for larger sizes (the square root of the size against scale, so
  // that the many small numbers stay visible beside a few large ones); the first count cells only.
  function tokenCells(ctx, state, values, x, y, cols, cell, count, role, scale) {
    const P = state.pal;
    const s = scale || maxAbs(values) || 1;
    for (let i = 0; i < values.length && i < count; i++) {
      const v = values[i] / s;
      ctx.fillStyle = rgbCss(mix3(P.rgb.paper, v >= 0 ? P.rgb[role] : P.rgb.ignored, Math.sqrt(Math.min(1, Math.abs(v)))));
      ctx.fillRect(x + (i % cols) * cell, y + Math.floor(i / cols) * cell, cell, cell);
    }
    frame(ctx, x - 0.5, y - 0.5, cols * cell + 1, Math.ceil(values.length / cols) * cell + 1, P.css.line, 1);
  }
  function paintPatches(stage, state, t) {
    state.t = t;
    const core = state.core, P = state.pal;
    const W = 520, H = 296;
    const VW = { x: 0, y: 24, s: 224 };
    const ui = kit(stage, state, 'patches', function () {
      const cv = makeCanvas(core, W, H, 'The 224-pixel view cut into a 14 by 14 grid of patches; the followed patch enlarged, its 768 numbers, and its real token of 384 numbers');
      const dl = readoutList(core);
      const pick = function (ev) {
        const c = cellAt(pointerAt(state, cv, ev), VW.x, VW.y, VW.s, G);
        if (c < 0) return;
        state.sel.patch = c;
        touched(state);
      };
      listen(state, cv.canvas, 'pointermove', pick);
      listen(state, cv.canvas, 'pointerdown', pick);
      const back = button(state, 'Back to patch ' + state.anchor, function () { state.sel.patch = state.anchor; touched(state); });
      return { root: stopBox(core, [cv.canvas, panel(core, [controlRow(core, [back]), dl, hint(core, 'Point at another patch of the view to see its numbers and its token.')])]), cv: cv, dl: dl };
    });
    const cv = ui.cv, ctx = cv.ctx;
    clear(cv);
    const k = state.sel.patch, r = Math.floor(k / G), c = k % G;
    text(ctx, 'the 224-pixel view, 14 ' + TIMES + ' 14 patches', VW.x, 14, P.css.muted, 10);
    drawView(ctx, state, 224, VW.x, VW.y, VW.s);
    ctx.globalAlpha = phase(t, 0, 0.2);
    gridLines(ctx, VW.x, VW.y, VW.s, G, rgbCss(P.rgb.paper, 0.55));
    ctx.globalAlpha = 1;
    frame(ctx, VW.x + c * PATCH - 1, VW.y + r * PATCH - 1, PATCH + 2, PATCH + 2, P.css.paper, 3);
    frame(ctx, VW.x + c * PATCH - 1, VW.y + r * PATCH - 1, PATCH + 2, PATCH + 2, P.css.ink, 1.5);
    const fz = ease(phase(t, 0.2, 0.4));
    if (fz > 0) {
      const x = lerp(VW.x + c * PATCH, 240, fz), y = lerp(VW.y + r * PATCH, 24, fz), s = lerp(PATCH, 80, fz);
      const before = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      drawView(ctx, state, 224, x, y, s, [c * PATCH, r * PATCH, PATCH, PATCH]);
      ctx.imageSmoothingEnabled = before;
      frame(ctx, x - 1, y - 1, s + 2, s + 2, P.css.ink, 2);
      if (fz >= 1) text(ctx, 'patch ' + k, 240, 118, P.css.ink, 11);
    }
    const fc = phase(t, 0.4, 0.65);
    if (fc > 0) {
      const rows = Math.ceil(PATCH * fc);
      ['red', 'green', 'blue'].forEach(function (name, ch) {
        const x0 = 334 + ch * 62, y0 = 24;
        for (let py = 0; py < rows; py++) {
          for (let qx = 0; qx < PATCH; qx++) {
            const rgb = viewPixel(state, 224, c * PATCH + qx, r * PATCH + py);
            if (!rgb) continue;
            ctx.fillStyle = 'rgb(' + rgb[ch] + ', ' + rgb[ch] + ', ' + rgb[ch] + ')';
            ctx.fillRect(x0 + qx * 3, y0 + py * 3, 3, 3);
          }
        }
        frame(ctx, x0 - 0.5, y0 - 0.5, 49, 49, P.css.line, 1);
        text(ctx, name, x0, 86, P.css.muted, 10);
      });
      text(ctx, '16 ' + TIMES + ' 16 ' + TIMES + ' 3 = 768 numbers', 334, 104, P.css.ink, 10);
    }
    const fm = phase(t, 0.65, 0.75);
    if (fm > 0) {
      ctx.globalAlpha = fm;
      arrow(ctx, 334, 114, 334, 146, P.css.muted, 1.5);
      text(ctx, 'a learned map, 768 ' + ARROW + ' 384,', 344, 126, P.css.muted, 10);
      text(ctx, 'plus the position row', 344, 140, P.css.muted, 10);
      ctx.globalAlpha = 1;
    }
    const ft = phase(t, 0.75, 1);
    const token = rowOf(state.T.tokens.array, k, D);
    if (ft > 0) {
      text(ctx, 'its real token after block 12', 240, 162, P.css.ink, 10);
      tokenCells(ctx, state, token, 240, 168, 24, 7, Math.floor(D * ft + 1e-9), 'teacher');
      text(ctx, '384 numbers, 24 per row', 240, 168 + 16 * 7 + 13, P.css.muted, 10);
    }
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < D; i++) { lo = Math.min(lo, token[i]); hi = Math.max(hi, token[i]); }
    fillReadout(core, ui.dl, [
      ['patch', k + ': ' + cellOf(k, G) + (k === state.anchor ? ', the followed one' : '')],
      ['its pixels', '16 ' + TIMES + ' 16 ' + TIMES + ' 3 = 768 numbers'],
      ['its token (real)', '384 numbers of length ' + core.fmt(norm(token), 3) + ', from ' + core.fmt(lo, 3) + ' to ' + core.fmt(hi, 3)],
      ['first six numbers', Array.prototype.slice.call(token, 0, 6).map(function (v) { return core.fmt(v, 3); }).join(', ')]
    ]);
  }

  // ------------------------------------------------------------------ stop 4: twelve blocks of attention

  // attentionAtlas(state): every block's and head's attention row of the followed token as a 14 x 14 picture, side by
  // side (blocks across, heads down), each scaled to its own largest weight, in the teacher's colour.
  function attentionAtlas(state) {
    return cached(state, 'atlas@' + state.themeKey, function () {
      const rows = state.F.attention_rows_con2.array, P = state.pal;
      const w = 12 * G, h = 6 * G;
      const img = state.core.makeImageData(w, h);
      for (let b = 0; b < 12; b++) {
        for (let hd = 0; hd < 6; hd++) {
          const off = (b * 6 + hd) * N;
          let mx = 0;
          for (let j = 0; j < N; j++) mx = Math.max(mx, rows[off + j]);
          for (let j = 0; j < N; j++) {
            const col = mix3(P.rgb.paper, P.rgb.teacher, mx > 0 ? rows[off + j] / mx : 0);
            const o = ((hd * G + Math.floor(j / G)) * w + b * G + (j % G)) * 4;
            img.data[o] = col[0];
            img.data[o + 1] = col[1];
            img.data[o + 2] = col[2];
            img.data[o + 3] = 255;
          }
        }
      }
      return offscreen(state.core, img);
    });
  }
  function headRow(state, b, hd) { return state.F.attention_rows_con2.array.subarray((b * 6 + hd) * N, (b * 6 + hd + 1) * N); }
  function paintBlocks(stage, state, t) {
    state.t = t;
    const core = state.core, P = state.pal;
    const W = 540, H = 404;
    const L = 24, TOP = 22, MAP = 40, PITCH = 42;
    const BIG = { y: 304, s: 84, pitch: 89, x0: 2 };
    const ui = kit(stage, state, 'blocks', function () {
      const cv = makeCanvas(core, W, H, 'Seventy-two small maps, one for every block and head, of where the followed patch takes its attention from; below, the six heads of one block over the view');
      const dl = readoutList(core);
      const pick = function (ev) {
        const p = pointerAt(state, cv, ev);
        if (p.x < L || p.y < TOP || p.y >= TOP + 6 * PITCH) return;
        const b = Math.floor((p.x - L) / PITCH);
        if (b < 0 || b > 11) return;
        state.sel.block = b;
        touched(state);
      };
      listen(state, cv.canvas, 'click', pick);
      return { root: stopBox(core, [cv.canvas, panel(core, [dl, hint(core, 'Click a column of small maps to show that block below. Each map is scaled to its own largest weight.')])]), cv: cv, dl: dl };
    });
    const cv = ui.cv, ctx = cv.ctx;
    clear(cv);
    const played = Math.min(11, Math.floor(phase(t, 0, 0.92) * 12));
    const current = t >= 1 ? (state.sel.block === null ? 11 : state.sel.block) : played;
    const atlas = attentionAtlas(state);
    for (let b = 0; b < 12; b++) {
      text(ctx, String(b + 1), L + b * PITCH + MAP / 2, TOP - 6, b === current ? P.css.ink : P.css.muted, 10, 'center', b === current);
      ctx.globalAlpha = t >= 1 || b <= current ? 1 : 0.18;
      for (let hd = 0; hd < 6; hd++) blit(ctx, atlas, b * G, hd * G, G, G, L + b * PITCH, TOP + hd * PITCH, MAP, MAP);
      ctx.globalAlpha = 1;
    }
    for (let hd = 0; hd < 6; hd++) text(ctx, 'h' + (hd + 1), 2, TOP + hd * PITCH + MAP / 2 + 4, P.css.muted, 10);
    frame(ctx, L + current * PITCH - 2, TOP - 2, MAP + 4, 6 * PITCH + 2, P.css.ink, 2);
    text(ctx, 'block ' + (current + 1) + ' of 12: its six heads over the view, patch ' + state.anchor + ' outlined', BIG.x0, BIG.y - 8, P.css.ink, 11);
    const a = state.anchor;
    for (let hd = 0; hd < 6; hd++) {
      const x = BIG.x0 + hd * BIG.pitch, y = BIG.y, s = BIG.s, cell = s / G;
      drawView(ctx, state, 224, x, y, s);
      ctx.fillStyle = rgbCss(P.rgb.paper, 0.35);
      ctx.fillRect(x, y, s, s);
      const row = headRow(state, current, hd);
      let mx = 0;
      for (let j = 0; j < N; j++) mx = Math.max(mx, row[j]);
      for (let j = 0; j < N; j++) {
        const w = mx > 0 ? row[j] / mx : 0;
        if (w < 0.02) continue;
        ctx.fillStyle = rgbCss(P.rgb.teacher, 0.9 * w);
        ctx.fillRect(x + (j % G) * cell, y + Math.floor(j / G) * cell, cell, cell);
      }
      frame(ctx, x + (a % G) * cell - 0.5, y + Math.floor(a / G) * cell - 0.5, cell + 1, cell + 1, P.css.ink, 1.5);
      frame(ctx, x - 0.5, y - 0.5, s + 1, s + 1, P.css.line, 1);
      text(ctx, 'head ' + (hd + 1), x, y + s + 13, P.css.muted, 10);
    }
    const rows = [['block', (current + 1) + ' of 12 (real attention of run 2' + RSQUO + 's teacher)']];
    for (let hd = 0; hd < 6; hd++) {
      const row = headRow(state, current, hd);
      const top = argMax(row);
      rows.push(['head ' + (hd + 1), 'on patch ' + a + ' itself ' + core.fmt(row[a], 3) + '; largest ' + core.fmt(row[top], 3) + ' on patch ' + top + ' (' + cellOf(top, G) + ')']);
    }
    fillReadout(core, ui.dl, rows);
  }

  // ------------------------------------------------------------------ stop 5: teacher and student

  // twinProjection(state): every teacher and student token (length 1) along the direction in which the teacher's tokens
  // vary most (the first principal direction of their centred unit vectors, by power iteration), one scale for both.
  function twinProjection(state) {
    return cached(state, 'pca', function () {
      const Tu = teacherUnit(state), Su = studentUnit(state);
      const mu = new Float64Array(D);
      for (let i = 0; i < N; i++) for (let k = 0; k < D; k++) mu[k] += Tu[i * D + k] / N;
      const v = new Float64Array(D).fill(1 / Math.sqrt(D));
      for (let it = 0; it < 60; it++) {
        const w = new Float64Array(D);
        for (let i = 0; i < N; i++) {
          let p = 0;
          for (let k = 0; k < D; k++) p += (Tu[i * D + k] - mu[k]) * v[k];
          for (let k = 0; k < D; k++) w[k] += p * (Tu[i * D + k] - mu[k]);
        }
        const n = norm(w) || 1;
        for (let k = 0; k < D; k++) v[k] = w[k] / n;
      }
      const pT = new Float64Array(N), pS = new Float64Array(N), same = new Float64Array(N);
      for (let i = 0; i < N; i++) {
        let a = 0, b = 0, c = 0;
        for (let k = 0; k < D; k++) {
          a += (Tu[i * D + k] - mu[k]) * v[k];
          b += (Su[i * D + k] - mu[k]) * v[k];
          c += Tu[i * D + k] * Su[i * D + k];
        }
        pT[i] = a;
        pS[i] = b;
        same[i] = c;
      }
      if (pT[state.anchor] < 0) for (let i = 0; i < N; i++) { pT[i] = -pT[i]; pS[i] = -pS[i]; }
      let lo = Infinity, hi = -Infinity, mean = 0;
      for (let i = 0; i < N; i++) {
        lo = Math.min(lo, pT[i], pS[i]);
        hi = Math.max(hi, pT[i], pS[i]);
        mean += same[i] / N;
      }
      return { pT: pT, pS: pS, lo: lo, hi: hi, same: same, meanSame: mean };
    });
  }
  function paintTwins(stage, state, t) {
    state.t = t;
    const core = state.core, P = state.pal;
    const W = 520, H = 306;
    const TG = { x: 8, y: 24, cell: 12 }, SG = { x: 196, y: 24, cell: 12 };
    const ui = kit(stage, state, 'twins', function () {
      const cv = makeCanvas(core, W, H, 'The 196 tokens of the teacher and of the student as two 14 by 14 grids of shades, the two tokens of one patch below them, and their cosine');
      const dl = readoutList(core);
      const pick = function (ev) {
        const p = pointerAt(state, cv, ev);
        let c = cellAt(p, TG.x, TG.y, G * TG.cell, G);
        if (c < 0) c = cellAt(p, SG.x, SG.y, G * SG.cell, G);
        if (c < 0) return;
        state.sel.twin = c;
        touched(state);
      };
      listen(state, cv.canvas, 'pointermove', pick);
      listen(state, cv.canvas, 'pointerdown', pick);
      const key = legend(core, [['role-teacher', 'teacher, run 2'], ['role-student', 'student, run 2'], ['role-ignored', 'a negative number in a token']]);
      return { root: stopBox(core, [cv.canvas, panel(core, [key, dl, hint(core, 'Point at a cell of either grid to compare that patch' + RSQUO + 's two tokens.')])]), cv: cv, dl: dl };
    });
    const cv = ui.cv, ctx = cv.ctx;
    clear(cv);
    const pr = twinProjection(state);
    const span = (pr.hi - pr.lo) || 1;
    const fill = Math.floor(N * phase(t, 0, 0.5) + 1e-9);
    text(ctx, 'teacher', TG.x, 14, P.css.teacher, 11, 'left', true);
    text(ctx, 'student', SG.x, 14, P.css.student, 11, 'left', true);
    for (let i = 0; i < fill; i++) {
      const bt = cellBox(TG.x, TG.y, G * TG.cell, G, i), bs = cellBox(SG.x, SG.y, G * SG.cell, G, i);
      ctx.fillStyle = rgbCss(mix3(P.rgb.paper, P.rgb.teacher, (pr.pT[i] - pr.lo) / span));
      ctx.fillRect(bt.x, bt.y, bt.s, bt.s);
      ctx.fillStyle = rgbCss(mix3(P.rgb.paper, P.rgb.student, (pr.pS[i] - pr.lo) / span));
      ctx.fillRect(bs.x, bs.y, bs.s, bs.s);
    }
    frame(ctx, TG.x - 0.5, TG.y - 0.5, G * TG.cell + 1, G * TG.cell + 1, P.css.teacher, 1);
    frame(ctx, SG.x - 0.5, SG.y - 0.5, G * SG.cell + 1, G * SG.cell + 1, P.css.student, 1);
    const k = state.sel.twin;
    [TG, SG].forEach(function (g) {
      const bx = cellBox(g.x, g.y, G * g.cell, G, k);
      frame(ctx, bx.x - 1, bx.y - 1, bx.s + 2, bx.s + 2, P.css.ink, 2);
    });
    const tTok = rowOf(state.F.teacher_tokens224.array, k, D), sTok = rowOf(state.F.student_tokens224.array, k, D);
    const scale = Math.max(maxAbs(tTok), maxAbs(sTok)) || 1;
    const ftok = phase(t, 0.5, 0.75);
    if (ftok > 0) {
      text(ctx, 'teacher token of patch ' + k, TG.x, 212, P.css.ink, 10);
      text(ctx, 'student token of patch ' + k, SG.x, 212, P.css.ink, 10);
      tokenCells(ctx, state, tTok, TG.x, 218, 24, 5, Math.floor(D * ftok + 1e-9), 'teacher', scale);
      tokenCells(ctx, state, sTok, SG.x, 218, 24, 5, Math.floor(D * ftok + 1e-9), 'student', scale);
    }
    const cosK = pr.same[k];
    const GA = { x: 384, y: 120, w: 110 };
    const fg = ease(phase(t, 0.75, 1));
    text(ctx, 'cosine of the two', GA.x, GA.y - 30, P.css.ink, 10);
    text(ctx, 'tokens of patch ' + k, GA.x, GA.y - 17, P.css.ink, 10);
    ctx.strokeStyle = P.css.muted;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(GA.x, GA.y);
    ctx.lineTo(GA.x + GA.w, GA.y);
    [-1, 0, 1].forEach(function (v) {
      const x = GA.x + (v + 1) / 2 * GA.w;
      ctx.moveTo(x, GA.y - 4);
      ctx.lineTo(x, GA.y + 4);
    });
    ctx.stroke();
    text(ctx, MINUS + '1', GA.x, GA.y + 16, P.css.muted, 10, 'center');
    text(ctx, '0', GA.x + GA.w / 2, GA.y + 16, P.css.muted, 10, 'center');
    text(ctx, '1', GA.x + GA.w, GA.y + 16, P.css.muted, 10, 'center');
    if (fg > 0) {
      const mx = GA.x + (lerp(0, cosK, fg) + 1) / 2 * GA.w;
      ctx.fillStyle = P.css.ink;
      ctx.beginPath();
      ctx.moveTo(mx, GA.y - 2);
      ctx.lineTo(mx - 6, GA.y - 12);
      ctx.lineTo(mx + 6, GA.y - 12);
      ctx.closePath();
      ctx.fill();
      if (fg >= 1) text(ctx, core.fmt(cosK, 3), clamp(mx, GA.x + 20, GA.x + GA.w), GA.y + 34, P.css.ink, 12, 'center', true);
    }
    fillReadout(core, ui.dl, [
      ['patch', k + ': ' + cellOf(k, G)],
      ['cosine of its two tokens', core.fmt(cosK, 3) + ' (real)'],
      ['their lengths', 'student ' + core.fmt(norm(sTok), 3) + ', teacher ' + core.fmt(norm(tTok), 3)],
      ['mean over the 196 patches', core.fmt(pr.meanSame, 3)],
      ['shades (toy)', 'each token' + RSQUO + 's place along the direction in which the teacher' + RSQUO + 's tokens vary most']
    ]);
  }

  // ------------------------------------------------------------------ stop 6: the similarity matrix

  // matrixPicture(state): the teacher's cosines as a 196 x 196 picture in the teacher's blue, from paper at the lowest
  // cosine off the diagonal to full blue at 1; the diagonal grey. Orange and purple stay for the rule's positives and
  // negatives (spec section 3), which only the histogram's thresholds mark here.
  function matrixPicture(state) {
    return cached(state, 'matrix@' + state.themeKey, function () {
      const P = state.pal, sim = state.F.sim_teacher.array;
      const img = state.core.makeImageData(N, N);
      let lo = 1;
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (i !== j) lo = Math.min(lo, sim[i * N + j]);
      const span = (1 - lo) || 1;
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          const v = sim[i * N + j];
          const col = i === j ? P.rgb.ignored : mix3(P.rgb.paper, P.rgb.teacher, (v - lo) / span);
          const o = (i * N + j) * 4;
          img.data[o] = col[0];
          img.data[o + 1] = col[1];
          img.data[o + 2] = col[2];
          img.data[o + 3] = 255;
        }
      }
      return offscreen(state.core, img);
    });
  }
  function histogram(state) {
    return cached(state, 'hist', function () {
      const sim = state.F.sim_teacher.array, counts = new Array(HIST_BINS).fill(0);
      let n = 0;
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          if (i === j) continue;
          counts[clamp(Math.floor((sim[i * N + j] + 1) / 2 * HIST_BINS), 0, HIST_BINS - 1)]++;
          n++;
        }
      }
      const d = state.core.rule.defaults;
      const th = state.core.rule.thresholds(simMatrix(state), N, { k: d.k, negPct: d.negPct });
      return { counts: counts, max: Math.max.apply(null, counts), n: n, page: th };
    });
  }
  function paintMatrix(stage, state, t) {
    state.t = t;
    const core = state.core, P = state.pal, F = state.F;
    const W = 520, H = 330;
    const M = { x: 0, y: 22, s: 294 };
    const HG = { x: 312, y: 56, w: 200, h: 206 };
    const ui = kit(stage, state, 'matrix', function () {
      const cv = makeCanvas(core, W, H, 'The 196 by 196 matrix of the teacher' + RSQUO + 's cosines, a stronger blue for a higher cosine, and the histogram of its values with the two thresholds');
      const dl = readoutList(core);
      const point = function (ev) {
        const p = pointerAt(state, cv, ev);
        if (p.x < M.x || p.y < M.y || p.x >= M.x + M.s || p.y >= M.y + M.s) return;
        state.sel.pair = [Math.floor((p.y - M.y) / M.s * N), Math.floor((p.x - M.x) / M.s * N)];
        touched(state);
      };
      listen(state, cv.canvas, 'pointermove', point);
      listen(state, cv.canvas, 'pointerdown', point);
      const key = legend(core, [['role-teacher', 'a cosine of two teacher tokens, stronger when higher'], ['role-ignored', 'the diagonal, left out'], ['role-positive', 'histogram: at or above ' + TAU + ' hi'], ['role-negative', 'histogram: at or below ' + TAU + ' lo']]);
      return { root: stopBox(core, [cv.canvas, panel(core, [key, dl, hint(core, 'Point at the matrix to read one pair. Row ' + state.anchor + ', the followed patch, is outlined.')])]), cv: cv, dl: dl };
    });
    const cv = ui.cv, ctx = cv.ctx;
    clear(cv);
    const reveal = Math.ceil(N * phase(t, 0, 0.6));
    text(ctx, 'token j ' + ARROW, M.x + M.s, M.y - 8, P.css.muted, 10, 'right');
    text(ctx, 'token i, from row 0 down', M.x, M.y - 8, P.css.muted, 10);
    const pic = matrixPicture(state);
    if (reveal > 0) blit(ctx, pic, 0, 0, N, reveal, M.x, M.y, M.s, M.s * reveal / N);
    frame(ctx, M.x - 0.5, M.y - 0.5, M.s + 1, M.s + 1, P.css.line, 1);
    const cs = M.s / N, a = state.anchor;
    frame(ctx, M.x - 1, M.y + a * cs - 1, M.s + 2, cs + 2, P.css.ink, 1.5);
    const pair = state.sel.pair;
    if (pair && t >= 1) {
      ctx.strokeStyle = rgbCss(P.rgb.ink, 0.6);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(M.x, M.y + (pair[0] + 0.5) * cs);
      ctx.lineTo(M.x + M.s, M.y + (pair[0] + 0.5) * cs);
      ctx.moveTo(M.x + (pair[1] + 0.5) * cs, M.y);
      ctx.lineTo(M.x + (pair[1] + 0.5) * cs, M.y + M.s);
      ctx.stroke();
    }
    const hist = histogram(state);
    const tauHi = F.tau_hi, tauLo = F.tau_lo;
    const bw = HG.w / HIST_BINS, grow = phase(t, 0, 0.6);
    for (let b = 0; b < HIST_BINS; b++) {
      const centre = -1 + (b + 0.5) * 2 / HIST_BINS;
      const h = HG.h * hist.counts[b] / hist.max * grow;
      ctx.fillStyle = t >= 0.6 ? (centre >= tauHi ? P.css.positive : (centre <= tauLo ? P.css.negative : P.css.ignored)) : P.css.ignored;
      ctx.fillRect(HG.x + b * bw + 0.5, HG.y + HG.h - h, bw - 1, h);
    }
    ctx.strokeStyle = P.css.muted;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(HG.x, HG.y + HG.h + 0.5);
    ctx.lineTo(HG.x + HG.w, HG.y + HG.h + 0.5);
    ctx.stroke();
    [-1, 0, 1].forEach(function (v) {
      text(ctx, v < 0 ? MINUS + '1' : String(v), HG.x + (v + 1) / 2 * HG.w, HG.y + HG.h + 14, P.css.muted, 10, 'center');
    });
    text(ctx, 'cosine', HG.x + HG.w / 2, HG.y + HG.h + 28, P.css.muted, 10, 'center');
    const fl = ease(phase(t, 0.6, 1));
    if (fl > 0) {
      const xHi = HG.x + (lerp(1, tauHi, fl) + 1) / 2 * HG.w, xLo = HG.x + (lerp(-1, tauLo, fl) + 1) / 2 * HG.w;
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = P.css.positive;
      ctx.beginPath();
      ctx.moveTo(xHi, HG.y - 18);
      ctx.lineTo(xHi, HG.y + HG.h);
      ctx.stroke();
      ctx.strokeStyle = P.css.negative;
      ctx.beginPath();
      ctx.moveTo(xLo, HG.y - 32);
      ctx.lineTo(xLo, HG.y + HG.h);
      ctx.stroke();
      ctx.setLineDash([]);
      if (fl >= 1) {
        backedText(ctx, state, TAU + ' hi ' + core.fmt(tauHi, 4), xHi - 4, HG.y - 8, P.css.ink, 10, 'right');
        backedText(ctx, state, TAU + ' lo ' + core.fmt(tauLo, 4), xLo + 4, HG.y - 24, P.css.ink, 10, 'left');
      }
    }
    text(ctx, core.fmt(hist.n) + ' cosines off the diagonal', HG.x, HG.y + HG.h + 44, P.css.ink, 10);
    const rows = [
      [TAU + ' hi (real)', core.fmt(tauHi, 4) + ', the quantile at 1 ' + MINUS + ' 8/195, about ' + core.fmt(F.quantile_levels.hi, 3)],
      [TAU + ' lo (real)', core.fmt(tauLo, 4) + ', the quantile at ' + core.fmt(F.quantile_levels.lo, 2)],
      ['computed again here', core.fmt(hist.page.tauHi, 4) + ' and ' + core.fmt(hist.page.tauLo, 4) + ' from the same matrix'],
      ['entries', core.fmt(hist.n) + ', every token against the 195 others']
    ];
    if (pair) rows.push(['pointed pair', 'tokens ' + pair[0] + ' and ' + pair[1] + ': ' + (pair[0] === pair[1] ? 'the diagonal, left out' : 'cosine ' + core.fmt(F.sim_teacher.array[pair[0] * N + pair[1]], 4))]);
    fillReadout(core, ui.dl, rows);
  }

  // ------------------------------------------------------------------ stop 7: positives and negatives

  // anchorSets(state, a): the anchor's positives (from its top k and from the threshold), its kept negatives, the
  // negatives that the cap cut, and its ranking.
  function anchorSets(state, a) {
    const sets = ruleSets(state), sim = simMatrix(state);
    const pos = Array.prototype.slice.call(sets.pos[a]);
    const top = Array.prototype.slice.call(sets.posFromTopk[a]);
    const added = Array.prototype.slice.call(sets.posFromThreshold[a]);
    const neg = Array.prototype.slice.call(sets.neg[a]);
    const isPos = {}, isNeg = {};
    pos.forEach(function (j) { isPos[j] = true; });
    neg.forEach(function (j) { isNeg[j] = true; });
    const cut = [];
    for (let j = 0; j < N; j++) if (j !== a && !isPos[j] && !isNeg[j] && sim[a * N + j] <= sets.tauLo) cut.push(j);
    return { pos: pos, top: top, added: added, neg: neg, cut: cut, ranking: sets.ranking[a], union: sets.posUncapped[a], negAll: sets.negUncapped[a], tauHi: sets.tauHi, tauLo: sets.tauLo };
  }
  function paintSets(stage, state, t) {
    state.t = t;
    const core = state.core, P = state.pal, F = state.F;
    const W = 520, H = 268;
    const VW = { x: 0, y: 30, s: 224 };
    const BC = { x: 246, y: 30, w: 268, h: 224 };
    const ui = kit(stage, state, 'sets', function () {
      const cv = makeCanvas(core, W, H, 'The positives and negatives of the followed patch on the view, and its 195 cosines ranked from the most to the least similar, with the two thresholds');
      const dl = readoutList(core);
      listen(state, cv.canvas, 'click', function (ev) {
        const c = cellAt(pointerAt(state, cv, ev), VW.x, VW.y, VW.s, G);
        if (c < 0) return;
        state.sel.setAnchor = c;
        touched(state);
      });
      const back = button(state, 'Back to patch ' + state.anchor, function () { state.sel.setAnchor = state.anchor; touched(state); });
      const key = legend(core, [['role-positive', 'positive from the top 8'], ['role-positive p7-light', 'positive added by ' + TAU + ' hi'], ['role-negative', 'negative'], ['role-negative p7-outline', 'cut by the cap of 48'], ['role-ignored', 'neither']]);
      return { root: stopBox(core, [cv.canvas, panel(core, [key, controlRow(core, [back]), dl, hint(core, 'Click any patch of the view to see its own sets.')])]), cv: cv, dl: dl };
    });
    const cv = ui.cv, ctx = cv.ctx;
    clear(cv);
    const a = state.sel.setAnchor;
    const S = anchorSets(state, a);
    const sim = simMatrix(state);
    const fTop = phase(t, 0.3, 0.45), fHi = ease(phase(t, 0.45, 0.6)), fLo = ease(phase(t, 0.6, 0.8)), fCap = phase(t, 0.8, 1);
    text(ctx, 'the view, patch ' + a + ' outlined', VW.x, 20, P.css.muted, 10);
    drawView(ctx, state, 224, VW.x, VW.y, VW.s);
    const role = {};
    S.top.forEach(function (j) { role[j] = 'top'; });
    S.added.forEach(function (j) { role[j] = 'added'; });
    S.neg.forEach(function (j) { role[j] = 'neg'; });
    S.cut.forEach(function (j) { role[j] = 'cut'; });
    for (let j = 0; j < N; j++) {
      if (j === a) continue;
      const b = cellBox(VW.x, VW.y, VW.s, G, j);
      const r = role[j];
      if ((r === 'top' || r === 'added') && fTop > 0) {
        ctx.fillStyle = rgbCss(P.rgb.positive, (r === 'top' ? 0.75 : 0.4) * fTop);
        ctx.fillRect(b.x, b.y, b.s, b.s);
      } else if (r === 'neg' && fLo >= 1) {
        ctx.fillStyle = rgbCss(P.rgb.negative, 0.7);
        ctx.fillRect(b.x, b.y, b.s, b.s);
      } else if (r === 'cut' && fLo >= 1) {
        ctx.fillStyle = rgbCss(P.rgb.negative, 0.7 * (1 - fCap));
        ctx.fillRect(b.x, b.y, b.s, b.s);
        if (fCap > 0) frame(ctx, b.x + 1.5, b.y + 1.5, b.s - 3, b.s - 3, rgbCss(P.rgb.negative, fCap), 2);
      } else if (t >= 0.3) {
        ctx.fillStyle = rgbCss(P.rgb.paper, 0.45);
        ctx.fillRect(b.x, b.y, b.s, b.s);
      }
    }
    const ab = cellBox(VW.x, VW.y, VW.s, G, a);
    frame(ctx, ab.x - 1, ab.y - 1, ab.s + 2, ab.s + 2, P.css.paper, 4);
    frame(ctx, ab.x - 1, ab.y - 1, ab.s + 2, ab.s + 2, P.css.ink, 2);
    const yOf = function (v) { return BC.y + (1 - v) / 2 * BC.h; };
    const bw = BC.w / (N - 1), grow = ease(phase(t, 0, 0.3));
    text(ctx, 'its 195 cosines, most similar first', BC.x, 20, P.css.muted, 10);
    for (let q = 0; q < N - 1; q++) {
      const j = S.ranking[q], v = sim[a * N + j], r = role[j];
      let colour = P.css.ignored;
      if ((r === 'top' || r === 'added') && fTop > 0) colour = r === 'top' ? P.css.positive : rgbCss(P.rgb.positive, 0.5);
      else if (r === 'neg' && fLo >= 1) colour = P.css.negative;
      else if (r === 'cut' && fLo >= 1) colour = rgbCss(P.rgb.negative, 1 - 0.65 * fCap);
      ctx.fillStyle = colour;
      const y0 = yOf(0), y1 = yOf(v * grow);
      ctx.fillRect(BC.x + q * bw, Math.min(y0, y1), Math.max(bw - 0.3, 0.6), Math.max(Math.abs(y1 - y0), 0.5));
    }
    ctx.strokeStyle = P.css.muted;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(BC.x, yOf(0) + 0.5);
    ctx.lineTo(BC.x + BC.w, yOf(0) + 0.5);
    ctx.stroke();
    text(ctx, '1', BC.x - 4, yOf(1) + 4, P.css.muted, 10, 'right');
    text(ctx, '0', BC.x - 4, yOf(0) + 4, P.css.muted, 10, 'right');
    text(ctx, MINUS + '1', BC.x - 4, yOf(-1) + 4, P.css.muted, 10, 'right');
    if (fHi > 0) {
      const y = lerp(yOf(1), yOf(S.tauHi), fHi);
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = P.css.positive;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(BC.x, y);
      ctx.lineTo(BC.x + BC.w, y);
      ctx.stroke();
      ctx.setLineDash([]);
      backedText(ctx, state, TAU + ' hi', BC.x + BC.w - 2, y - 4, P.css.ink, 10, 'right');
    }
    if (fLo > 0) {
      const y = lerp(yOf(-1), yOf(S.tauLo), fLo);
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = P.css.negative;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(BC.x, y);
      ctx.lineTo(BC.x + BC.w, y);
      ctx.stroke();
      ctx.setLineDash([]);
      backedText(ctx, state, TAU + ' lo', BC.x + 4, y - 5, P.css.ink, 10, 'left');
    }
    const rs = F.rule_stats || {};
    const at = function (j) { return sim[a * N + j]; };
    fillReadout(core, ui.dl, [
      ['anchor', 'patch ' + a + ': ' + cellOf(a, G) + (a === state.anchor ? ', the followed one' : '')],
      ['positives (real)', S.pos.length + ': ' + S.top.length + ' from the top 8, ' + S.added.length + ' added by ' + TAU + ' hi; ' + S.union + ' before the cap of 24'],
      ['negatives (real)', S.neg.length + ' kept of the ' + S.negAll + ' at or below ' + TAU + ' lo'],
      ['cosines of the positives', S.pos.length ? core.fmt(at(S.pos[0]), 4) + ' down to ' + core.fmt(at(S.pos[S.pos.length - 1]), 4) : 'none'],
      ['cosines of the negatives', S.neg.length ? core.fmt(at(S.neg[0]), 4) + ' up to ' + core.fmt(at(S.neg[S.neg.length - 1]), 4) : 'none: this anchor has no negative term'],
      ['the whole crop (real)', 'positives per anchor ' + core.fmt(rs.pos_degree_mean, 2) + ' on average; ' + rs.pos_from_threshold_total + ' pairs added by ' + TAU + ' hi; the caps cut ' + rs.cap_cuts_pos + ' and ' + rs.cap_cuts_neg + ' anchors; ' + rs.neg_empty + ' anchors without a negative']
    ]);
  }

  // ------------------------------------------------------------------ stop 8: the InfoNCE term

  // termsAt(state, tau): the term of every anchor at tau, from cos(student i, teacher j) and the bundle's sets.
  function termsAt(state, tau) {
    return cached(state, 'terms@' + tau.toFixed(3), function () {
      const st = studentTeacher(state), F = state.F, rule = state.core.rule;
      const out = new Float64Array(N);
      let sum = 0;
      for (let i = 0; i < N; i++) {
        out[i] = rule.infonce(st.subarray(i * N, (i + 1) * N), F.pos[i], F.neg[i], tau).loss;
        sum += out[i];
      }
      return { values: out, mean: sum / N, max: maxAbs(out) };
    });
  }
  function paintInfonce(stage, state, t) {
    state.t = t;
    const core = state.core, P = state.pal, F = state.F;
    const W = 520, H = 340;
    const B = { x: 34, y: 20, w: 266, pitch: 37 };
    const MP = { x: 358, y: 30, s: 154 };
    const ui = kit(stage, state, 'infonce', function () {
      const cv = makeCanvas(core, W, H, 'Eight bars, one per positive of the followed patch, split into the positive' + RSQUO + 's share and the negatives' + RSQUO + ' shares, and a map of the term of every anchor');
      const dl = readoutList(core);
      const sl = slider(state, 'lab-7a-film-tau', 'Temperature ' + TAU, TAU_SLIDER, state.sel.tau, function (v) { return core.fmt(v, 2); }, function (v) {
        state.sel.tau = Math.round(v * 100) / 100;
        touched(state);
      });
      const key = legend(core, [['role-positive', 'the positive' + RSQUO + 's share of its denominator'], ['role-negative', 'each negative' + RSQUO + 's share'], ['role-student', 'the term of an anchor, stronger when larger']]);
      return { root: stopBox(core, [cv.canvas, panel(core, [sl.node, key, dl])]), cv: cv, dl: dl };
    });
    const cv = ui.cv, ctx = cv.ctx;
    clear(cv);
    const a = state.anchor, tau = state.sel.tau;
    const res = core.rule.infonce(F.anchor_cos_student_teacher, F.pos[a], F.neg[a], tau);
    const reveal = phase(t, 0, 0.6);
    text(ctx, 'the 8 positives of patch ' + a + ' at ' + TAU + ' = ' + core.fmt(tau, 2), 0, 12, P.css.ink, 10);
    F.pos[a].forEach(function (j, p) {
      const y = B.y + p * B.pitch;
      const f = phase(reveal, p / 10, p / 10 + 0.3);
      if (f <= 0) return;
      const shares = res.shares.rows[p];
      text(ctx, String(j), B.x - 6, y + 11, P.css.muted, 10, 'right');
      let x = B.x;
      const end = B.x + B.w * f;
      for (let q = 0; q < shares.length && x < end; q++) {
        const w = Math.min(shares[q] * B.w, end - x);
        ctx.fillStyle = q === 0 ? P.css.positive : rgbCss(P.rgb.negative, q % 2 ? 0.95 : 0.6);
        ctx.fillRect(x, y, w, 14);
        x += shares[q] * B.w;
      }
      const negTotal = 1 - shares[0];
      let z = B.x;
      for (let q = 1; q < shares.length; q++) {
        const w = negTotal > 0 ? shares[q] / negTotal * B.w * f : 0;
        ctx.fillStyle = rgbCss(P.rgb.negative, q % 2 ? 0.95 : 0.55);
        ctx.fillRect(z, y + 17, w, 7);
        z += w;
      }
      if (f >= 1) text(ctx, 'l = ' + num(core, res.perPositive[p], 3), B.x + B.w + 6, y + 11, P.css.ink, 10);
    });
    text(ctx, 'thin bars: the negatives' + RSQUO + ' part, spread to the full width', B.x, B.y + 8 * B.pitch + 2, P.css.muted, 10);
    if (t >= 0.6) text(ctx, 'the term of patch ' + a + ', the mean of the 8: ' + num(core, res.loss, 4), B.x, B.y + 8 * B.pitch + 20, P.css.ink, 11, 'left', true);
    const terms = termsAt(state, tau);
    const fm = Math.floor(N * phase(t, 0.6, 1) + 1e-9);
    text(ctx, 'the term of every anchor', MP.x, 12, P.css.ink, 10);
    text(ctx, 'stronger when larger', MP.x, 24, P.css.muted, 10);
    for (let i = 0; i < fm; i++) {
      const b = cellBox(MP.x, MP.y, MP.s, G, i);
      ctx.fillStyle = rgbCss(mix3(P.rgb.paper, P.rgb.student, terms.max > 0 ? terms.values[i] / terms.max : 0));
      ctx.fillRect(b.x, b.y, b.s, b.s);
    }
    frame(ctx, MP.x - 0.5, MP.y - 0.5, MP.s + 1, MP.s + 1, P.css.line, 1);
    const ab = cellBox(MP.x, MP.y, MP.s, G, a);
    frame(ctx, ab.x - 1, ab.y - 1, ab.s + 2, ab.s + 2, P.css.ink, 2);
    if (fm >= N) text(ctx, 'crop mean ' + num(core, terms.mean, 4), MP.x, MP.y + MP.s + 16, P.css.ink, 10);
    const bundleTau = ['0.1', '0.2', '0.3'].filter(function (s) { return Math.abs(Number(s) - tau) < 1e-9; })[0];
    fillReadout(core, ui.dl, [
      [TAU, core.fmt(tau, 2) + (bundleTau ? ', one of the bundle' + RSQUO + 's three' : '')],
      ['term of patch ' + a, num(core, res.loss, 4) + (bundleTau ? '; the bundle: ' + num(core, F.infonce.per_anchor[bundleTau][a], 4) : '')],
      ['mean over the crop', num(core, terms.mean, 4) + (bundleTau ? '; the bundle: ' + num(core, F.infonce.crop_mean[bundleTau], 4) : '')],
      ['a positive' + RSQUO + 's share', core.fmt(res.shares.positive.reduce(function (s, x) { return s + x; }, 0) / res.shares.positive.length, 4) + ' on average'],
      ['the bundle at ' + TAU + ' 0.1, 0.2, 0.3', ['0.1', '0.2', '0.3'].map(function (s) { return num(core, F.infonce.per_anchor[s][a], 4); }).join(', ')]
    ]);
  }

  // ------------------------------------------------------------------ stop 9: the gradient, a pull and a push

  // gradientPlane(state): the plane that holds the pull and the push (e1 the direction toward the positives, -pull; e2
  // the push, made orthogonal to e1) and the place of every positive and negative of the followed anchor in it: the parts
  // of their unit teacher tokens along e1 and e2, once the part along the student's unit token is taken away.
  function gradientPlane(state) {
    return cached(state, 'plane', function () {
      const F = state.F, a = state.anchor, rule = state.core.rule;
      const pull = F.anchor_pull.array, push = F.anchor_push.array, grad = F.anchor_grad.array;
      const np = norm(pull) || 1;
      const e1 = new Float64Array(D), e2 = new Float64Array(D);
      for (let k = 0; k < D; k++) e1[k] = -pull[k] / np;
      const c = dot(push, e1);
      for (let k = 0; k < D; k++) e2[k] = push[k] - c * e1[k];
      const n2 = norm(e2) || 1;
      for (let k = 0; k < D; k++) e2[k] /= n2;
      const z = unitRows(rowOf(F.student_tokens224.array, a, D), 1, D);
      const Tu = teacherUnit(state);
      const place = function (j) {
        const tj = Tu.subarray(j * D, (j + 1) * D);
        const along = dot(tj, z);
        let x = 0, y = 0;
        for (let k = 0; k < D; k++) {
          const v = tj[k] - along * z[k];
          x += v * e1[k];
          y += v * e2[k];
        }
        return { j: j, x: x, y: y };
      };
      const res = rule.infonce(F.anchor_cos_student_teacher, F.pos[a], F.neg[a], F.tau);
      const count = F.pos[a].length;
      const pos = F.pos[a].map(function (j, p) { const d = place(j); d.weight = (1 - res.shares.positive[p]) / count / F.tau; return d; });
      const negWeight = new Float64Array(F.neg[a].length);
      res.shares.rows.forEach(function (r) { for (let q = 1; q < r.length; q++) negWeight[q - 1] += r[q] / count / F.tau; });
      const neg = F.neg[a].map(function (j, q) { const d = place(j); d.weight = negWeight[q]; return d; });
      const page = rule.gradient(rowOf(F.student_tokens224.array, a, D), F.teacher_tokens224.array, F.pos[a], F.neg[a], F.tau);
      let diff = 0;
      for (let k = 0; k < D; k++) diff = Math.max(diff, Math.abs(page.grad[k] - grad[k]));
      const vec = function (v) { return { x: -dot(v, e1), y: -dot(v, e2) }; };
      return {
        pos: pos, neg: neg, pull: vec(pull), push: vec(push), step: vec(grad),
        norms: { grad: norm(grad), pull: np, push: norm(push) }, cosPullPush: dot(pull, push) / np / (norm(push) || 1),
        pageDiff: diff, pageNorm: page.norms.grad
      };
    });
  }
  // linePlot(ctx, state, values, x, y, w, h, scale, colour, upTo): the first upTo values as a line around a zero line.
  function linePlot(ctx, state, values, x, y, w, h, scale, colour, upTo) {
    ctx.strokeStyle = state.pal.css.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y + h / 2 + 0.5);
    ctx.lineTo(x + w, y + h / 2 + 0.5);
    ctx.stroke();
    const n = Math.min(values.length, upTo);
    if (n < 2) return;
    ctx.strokeStyle = colour;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const px = x + i * w / (values.length - 1), py = y + h / 2 - values[i] / scale * h / 2;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  function paintGradient(stage, state, t) {
    state.t = t;
    const core = state.core, P = state.pal, F = state.F;
    const W = 520, H = 320;
    const O = { x: 110, y: 248 }, SC = 330;
    const LP = { x: 352, w: 164, h: 64 };
    const ui = kit(stage, state, 'gradient', function () {
      const cv = makeCanvas(core, W, H, 'A flat slice through the space of 384 numbers that holds the pull and the push: the positives on one side, the negatives on another, and the arrows of the pull, the push and the step; on the right, the 384 numbers of each');
      const dl = readoutList(core);
      const point = function (ev) {
        const p = pointerAt(state, cv, ev);
        const plane = gradientPlane(state);
        let best = null, bestD = 100;
        plane.pos.concat(plane.neg).forEach(function (d) {
          const dx = O.x + d.x * SC - p.x, dy = O.y - d.y * SC - p.y, dd = dx * dx + dy * dy;
          if (dd < bestD) { bestD = dd; best = d.j; }
        });
        state.sel.dot = best;
        touched(state);
      };
      listen(state, cv.canvas, 'pointermove', point);
      listen(state, cv.canvas, 'pointerdown', point);
      const key = legend(core, [['role-student', 'the student' + RSQUO + 's token and its step'], ['role-positive', 'positives and the pull'], ['role-negative', 'negatives and the push']]);
      return { root: stopBox(core, [cv.canvas, panel(core, [key, dl, hint(core, 'Point at a dot to read its share of the arrows.')])]), cv: cv, dl: dl };
    });
    const cv = ui.cv, ctx = cv.ctx;
    clear(cv);
    const pl = gradientPlane(state);
    const X = function (v) { return O.x + v * SC; }, Y = function (v) { return O.y - v * SC; };
    ctx.strokeStyle = P.css.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(8, O.y + 0.5);
    ctx.lineTo(338, O.y + 0.5);
    ctx.moveTo(O.x + 0.5, 8);
    ctx.lineTo(O.x + 0.5, 312);
    ctx.stroke();
    text(ctx, 'toward the positives ' + ARROW, 338, O.y + 14, P.css.muted, 10, 'right');
    text(ctx, 'toward the negatives', O.x + 6, 16, P.css.muted, 10);
    ctx.globalAlpha = phase(t, 0, 0.3);
    pl.neg.forEach(function (d) {
      ctx.fillStyle = P.css.negative;
      ctx.beginPath();
      ctx.arc(X(d.x), Y(d.y), 3.5, 0, 2 * Math.PI);
      ctx.fill();
    });
    pl.pos.forEach(function (d) {
      ctx.fillStyle = P.css.positive;
      ctx.beginPath();
      ctx.arc(X(d.x), Y(d.y), 5, 0, 2 * Math.PI);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    const sel = state.sel.dot;
    if (sel !== null && t >= 1) {
      const d = pl.pos.concat(pl.neg).filter(function (e) { return e.j === sel; })[0];
      if (d) {
        ctx.strokeStyle = P.css.ink;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(X(d.x), Y(d.y), 8, 0, 2 * Math.PI);
        ctx.stroke();
      }
    }
    ctx.fillStyle = P.css.student;
    ctx.beginPath();
    ctx.arc(O.x, O.y, 6, 0, 2 * Math.PI);
    ctx.fill();
    text(ctx, 'the student' + RSQUO + 's', O.x - 12, O.y - 16, P.css.ink, 10, 'right');
    text(ctx, 'token of ' + state.anchor, O.x - 12, O.y - 3, P.css.ink, 10, 'right');
    const fPull = ease(phase(t, 0.3, 0.55)), fPush = ease(phase(t, 0.55, 0.8)), fStep = ease(phase(t, 0.8, 1));
    if (fPull > 0) arrow(ctx, O.x, O.y, X(pl.pull.x * fPull), Y(pl.pull.y * fPull), P.css.positive, 3);
    if (fPush > 0) arrow(ctx, O.x, O.y, X(pl.push.x * fPush), Y(pl.push.y * fPush), P.css.negative, 3);
    if (fStep > 0) {
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = P.css.muted;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(X(pl.pull.x), Y(pl.pull.y));
      ctx.lineTo(X(pl.step.x), Y(pl.step.y));
      ctx.lineTo(X(pl.push.x), Y(pl.push.y));
      ctx.stroke();
      ctx.setLineDash([]);
      arrow(ctx, O.x, O.y, X(pl.step.x * fStep), Y(pl.step.y * fStep), P.css.student, 3);
    }
    if (fStep >= 1) {
      backedText(ctx, state, 'pull', X(pl.pull.x) + 8, Y(pl.pull.y) - 6, P.css.ink, 10);
      backedText(ctx, state, 'push', X(pl.push.x) - 8, Y(pl.push.y) + 4, P.css.ink, 10, 'right');
      backedText(ctx, state, 'step', X(pl.step.x) + 8, Y(pl.step.y) + 12, P.css.ink, 10);
    }
    const scale = Math.max(maxAbs(F.anchor_grad.array), maxAbs(F.anchor_pull.array), maxAbs(F.anchor_push.array)) || 1;
    const upTo = Math.floor(D * phase(t, 0, 0.8) + 1e-9);
    [['gradient, length ' + core.fmt(pl.norms.grad, 4), F.anchor_grad.array, P.css.student, 20],
      ['its pull, length ' + core.fmt(pl.norms.pull, 4), F.anchor_pull.array, P.css.positive, 122],
      ['its push, length ' + core.fmt(pl.norms.push, 4), F.anchor_push.array, P.css.negative, 224]].forEach(function (s) {
      text(ctx, s[0], LP.x, s[3] - 4, P.css.ink, 10);
      linePlot(ctx, state, s[1], LP.x, s[3], LP.w, LP.h, scale, s[2], upTo);
    });
    text(ctx, 'the 384 numbers of each', LP.x, 306, P.css.muted, 10);
    const rows = [
      ['gradient (real)', 'length ' + core.fmt(pl.norms.grad, 4) + '; this page computes ' + core.fmt(pl.pageNorm, 4) + ', largest difference ' + num(core, pl.pageDiff, 2)],
      ['pull and push (real)', 'the gradient' + RSQUO + 's parts from the positives and from the negatives: lengths ' + core.fmt(pl.norms.pull, 4) + ' and ' + core.fmt(pl.norms.push, 4) + '; their cosine ' + core.fmt(pl.cosPullPush, 4)],
      ['the arrows', 'drawn against the gradient, the way the token moves: the pull toward the positives, the push away from the negatives, the step their sum']
    ];
    if (sel !== null) {
      const d = pl.pos.filter(function (e) { return e.j === sel; })[0];
      const e = pl.neg.filter(function (x) { return x.j === sel; })[0];
      if (d) rows.push(['positive ' + sel, 'cosine with the student' + RSQUO + 's token ' + core.fmt(F.anchor_cos_student_teacher[sel], 3) + '; its weight in the pull ' + core.fmt(d.weight, 3)]);
      if (e) rows.push(['negative ' + sel, 'cosine with the student' + RSQUO + 's token ' + core.fmt(F.anchor_cos_student_teacher[sel], 3) + '; its weight in the push ' + num(core, e.weight, 3)]);
    }
    fillReadout(core, ui.dl, rows);
  }

  // ------------------------------------------------------------------ stop 10: AdamW and the moving average

  // adamRun(entry, updates, g): a toy weight and the teacher's copy of it under AdamW with the constant gradient g and the
  // schedule's values of one step: their paths and the arithmetic of the first update.
  function adamRun(entry, updates, g) {
    const lr = entry.lr, wd = entry.wd, mom = entry.momentum;
    let w = TOY_WEIGHT, teacher = TOY_WEIGHT, m = 0, v = 0;
    const student = [w], teach = [teacher];
    let first = null;
    for (let k = 1; k <= updates; k++) {
      const decay = lr * wd * w;
      w -= decay;
      m = ADAM.beta1 * m + (1 - ADAM.beta1) * g;
      v = ADAM.beta2 * v + (1 - ADAM.beta2) * g * g;
      const mHat = m / (1 - Math.pow(ADAM.beta1, k)), vHat = v / (1 - Math.pow(ADAM.beta2, k));
      const step = lr * mHat / (Math.sqrt(vHat) + ADAM.eps);
      w -= step;
      teacher = mom * teacher + (1 - mom) * w;
      if (k === 1) first = { decay: decay, m: m, v: v, mHat: mHat, vHat: vHat, step: step, w: w, teacher: teacher };
      student.push(w);
      teach.push(teacher);
    }
    return { student: student, teacher: teach, first: first };
  }
  function paintAdamw(stage, state, t) {
    state.t = t;
    const core = state.core, P = state.pal, F = state.F;
    const W = 520, H = 290;
    const C = { x: 64, y: 48, w: 440, h: 192 };
    const ui = kit(stage, state, 'adamw', function () {
      const cv = makeCanvas(core, W, H, 'A toy weight under AdamW over several updates, in green, and the teacher' + RSQUO + 's copy of it under the moving average, in blue');
      const dl = readoutList(core);
      const steps = segmented(state, 'lab-7a-film-step', 'The step of run 2 whose schedule to use', SCHEDULE.map(function (s, i) { return { value: i, label: 'step ' + s.label }; }), state.sel.schedule, function (i) {
        state.sel.schedule = i;
        touched(state);
      });
      const sl = slider(state, 'lab-7a-film-updates', 'Updates', UPDATES, state.sel.updates, function (v) { return String(v); }, function (v) {
        state.sel.updates = Math.round(v);
        touched(state);
      });
      const key = legend(core, [['role-student', 'the weight, updated by AdamW'], ['role-teacher', 'the teacher' + RSQUO + 's copy, the moving average']]);
      return { root: stopBox(core, [cv.canvas, panel(core, [controlRow(core, [steps]), sl.node, key, dl])]), cv: cv, dl: dl };
    });
    const cv = ui.cv, ctx = cv.ctx;
    clear(cv);
    const entry = SCHEDULE[state.sel.schedule];
    const g = norm(F.anchor_grad.array);
    const U = state.sel.updates;
    const run = adamRun(entry, U, g);
    const lr = entry.lr;
    const unit = lr > 0 ? lr : 1;
    const ys = run.student.map(function (w) { return (w - TOY_WEIGHT) / unit; });
    const yt = run.teacher.map(function (w) { return (w - TOY_WEIGHT) / unit; });
    let lo = -1;
    ys.concat(yt).forEach(function (v) { lo = Math.min(lo, v); });
    const hi = Math.max(0.15 * -lo, 0.5);
    const X = function (k) { return C.x + k / U * C.w; }, Y = function (v) { return C.y + (hi - v) / (hi - lo) * C.h; };
    text(ctx, 'step ' + entry.label + ' of run 2: learning rate ' + num(core, lr, 2) + ',', 0, 12, P.css.ink, 10);
    text(ctx, 'weight decay ' + core.fmt(entry.wd, 4) + ', teacher momentum ' + core.fmt(entry.momentum, 6), 0, 26, P.css.ink, 10);
    text(ctx, lr > 0 ? 'change of the weight, in learning rates' : 'change of the weight', 0, C.y - 10, P.css.muted, 10);
    ctx.strokeStyle = P.css.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(C.x + 0.5, C.y);
    ctx.lineTo(C.x + 0.5, C.y + C.h);
    ctx.lineTo(C.x + C.w, C.y + C.h + 0.5);
    ctx.moveTo(C.x, Y(0) + 0.5);
    ctx.lineTo(C.x + C.w, Y(0) + 0.5);
    ctx.stroke();
    text(ctx, '0', C.x - 6, Y(0) + 4, P.css.muted, 10, 'right');
    text(ctx, core.fmt(lo, 1), C.x - 6, Y(lo) + 4, P.css.muted, 10, 'right');
    text(ctx, 'update 0', C.x, C.y + C.h + 14, P.css.muted, 10);
    text(ctx, 'update ' + U, C.x + C.w, C.y + C.h + 14, P.css.muted, 10, 'right');
    const shown = U * phase(t, 0, 0.9);
    const series = function (vals, colour, r) {
      ctx.strokeStyle = colour;
      ctx.fillStyle = colour;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(X(0), Y(vals[0]));
      for (let k = 1; k <= U; k++) {
        if (k - 1 >= shown) break;
        const f = Math.min(1, shown - (k - 1));
        ctx.lineTo(X(k - 1 + f), Y(lerp(vals[k - 1], vals[k], f)));
      }
      ctx.stroke();
      for (let k = 0; k <= U && k <= shown; k++) {
        ctx.beginPath();
        ctx.arc(X(k), Y(vals[k]), r, 0, 2 * Math.PI);
        ctx.fill();
      }
    };
    series(yt, P.css.teacher, 2.5);
    series(ys, P.css.student, 3);
    if (shown >= U && lr > 0) {
      text(ctx, 'after update ' + U + ':', X(U) - 6, Y(0) + 24, P.css.muted, 10, 'right');
      text(ctx, 'the teacher' + RSQUO + 's copy ' + core.fmt(yt[U], 3), X(U) - 6, Y(0) + 40, P.css.teacher, 10, 'right', true);
      text(ctx, 'the weight ' + core.fmt(ys[U], 2), X(U) - 6, Y(0) + 56, P.css.student, 10, 'right', true);
    }
    if (lr === 0) text(ctx, 'the learning rate is 0 at step 1: nothing moves', C.x + 10, Y(0) - 10, P.css.ink, 11);
    else if (entry.momentum >= 1) text(ctx, 'the momentum is 1: the teacher stops following', C.x + 10, Y(lo) + 18, P.css.ink, 11);
    text(ctx, 'each update the teacher closes 1 ' + MINUS + ' ' + LAMBDA + ' = ' + num(core, 1 - entry.momentum, 2) + ' of its gap to the weight', 0, C.y + C.h + 34, P.css.muted, 10);
    const f1 = run.first;
    fillReadout(core, ui.dl, [
      ['schedule at step ' + entry.label + ' (real)', 'learning rate ' + num(core, lr, 2) + ', weight decay ' + core.fmt(entry.wd, 4) + ', teacher momentum ' + core.fmt(entry.momentum, 6)],
      ['gradient (toy)', 'g = ' + core.fmt(g, 4) + ', the length of patch ' + state.anchor + RSQUO + 's real gradient'],
      ['first update (toy)', 'm = ' + core.fmt(f1.m, 5) + ', v = ' + num(core, f1.v, 3) + '; scaled up, m' + HAT + ' = ' + core.fmt(f1.mHat, 4) + ' and ' + SQRT + 'v' + HAT + ' = ' + core.fmt(Math.sqrt(f1.vHat), 4)],
      ['its step', 'learning rate ' + TIMES + ' m' + HAT + ' / (' + SQRT + 'v' + HAT + ' + ' + EPSILON + ') = ' + num(core, f1.step, 3) + '; the decay ' + num(core, f1.decay, 3)],
      ['the weight after it', core.fmt(f1.w, 9) + ', from ' + TOY_WEIGHT],
      ['the teacher after it', core.fmt(f1.teacher, 11)]
    ]);
  }

  // ------------------------------------------------------------------ stop 11: the decoder reads the keys

  // keyCosines(state): the cosine of every key with the followed patch's key, before and after the key rule.
  function keyCosines(state) {
    return cached(state, 'keycos', function () {
      const core = state.core, keys = state.K.keys.array;
      const ms = core.decoder.keyRule(keys, NK, D, 'mean_subtract');
      const c0 = state.geo.cell480;
      const row = function (arr) {
        const a = arr.subarray(c0 * D, (c0 + 1) * D), na = norm(a) || 1;
        const out = new Float64Array(NK);
        for (let c = 0; c < NK; c++) {
          const b = arr.subarray(c * D, (c + 1) * D);
          out[c] = dot(a, b) / na / (norm(b) || 1);
        }
        return out;
      };
      return { raw: row(keys), rule: row(ms) };
    });
  }
  // decoderView(state): the stages that the film shows: the Python decoder's from the bundle, or the page's after a run.
  function decoderView(state) {
    const page = state.sel.pageDecoder;
    if (page) {
      const s0 = page.result.stages[0] || {};
      return {
        source: 'page', tau: page.tau, status: page.result.status, ids: page.result.ids,
        fiedler: s0.fiedler || null, bipartition: s0.bipartition || null, seed: s0.seed, flipped: s0.flipped, corners: s0.fgCorners,
        lambda2: s0.lambda2, strong: s0.strongPairs,
        stages: page.result.stages.map(function (s) { return { reason: s.reason, mask: s.mask, area: s.area, component: s.component, lambda2: s.lambda2 }; }),
        same: page.same
      };
    }
    const d = state.F.decoder.con2, s0 = d.stages[0];
    return {
      source: 'bundle', tau: d.config.tau, status: d.status, ids: d.ids, fiedler: s0.fiedler, bipartition: s0.bipartition,
      seed: s0.seed, flipped: s0.flipped, corners: s0.fg_corners, lambda2: s0.lambda2, strong: s0.strong_pairs,
      stages: d.stages.map(function (s) { return { reason: s.reason, mask: s.mask, area: s.area, component: s.component, lambda2: s.lambda2 }; }),
      same: null
    };
  }
  // afterPaint(fn): fn once the browser has painted what the page shows now: an animation frame runs just before the
  // next paint, and a timer set inside it runs after that paint (a 30 ms timer where the page has no animation frames).
  function afterPaint(fn) {
    if (typeof root.requestAnimationFrame === 'function') root.requestAnimationFrame(function () { root.setTimeout(fn, 0); });
    else root.setTimeout(fn, 30);
  }
  // runPageDecoder(state, tau): Core.decoder.maskcut on the decoded keys at tau, once the page has painted that it is
  // computing (the decoder then holds the page for about a second on a laptop).
  function runPageDecoder(state, tau) {
    if (state.sel.busy) return;
    state.sel.busy = true;
    touched(state);
    afterPaint(function () {
      try {
        const prior = state.cache.decoderCosines;
        const result = state.core.decoder.maskcut(state.K.keys.array, NK, GK, prior ? { tau: tau, cosines: prior } : { tau: tau });
        state.cache.decoderCosines = result.cosines;
        let same = null;
        if (Math.abs(tau - 0.2) < 1e-9) {
          same = state.F.decoder.con2.stages.every(function (s, i) {
            const m = result.masks[i];
            for (let c = 0; c < NK; c++) if ((m[c] ? 1 : 0) !== (s.mask[c] ? 1 : 0)) return false;
            return true;
          });
        }
        state.sel.pageDecoder = { tau: tau, result: result, same: same };
      } catch (err) {
        logError('the decoder in the page', err);
      }
      state.sel.busy = false;
      touched(state);
    });
  }
  function paintDecoder(stage, state, t) {
    state.t = t;
    const core = state.core, P = state.pal;
    const W = 520, H = 350;
    const V = { x: 0, y: 26, s: 300 };
    const ST = { x: 330, y: 26, s: 54, pitch: 64 };
    const ui = kit(stage, state, 'decoder', function () {
      const cv = makeCanvas(core, W, H, 'The 480-pixel view on its 30 by 30 grid of keys, coloured by the step of the decoder, and the five stages of the cut');
      const dl = readoutList(core);
      const sub = segmented(state, 'lab-7a-film-substep', 'What the picture shows', SUBSTEPS.map(function (s, i) { return { value: i, label: s }; }), state.sel.substep, function (i) {
        state.sel.substep = i;
        touched(state);
      });
      const sl = slider(state, 'lab-7a-film-dtau', 'Decoder ' + TAU + ' for the button', DECODER_TAU_SLIDER, state.sel.decoderTau, function (v) { return core.fmt(v, 2); }, function (v) {
        state.sel.decoderTau = Math.round(v * 100) / 100;
      });
      const run = button(state, 'Run the decoder here', function () { runPageDecoder(state, state.sel.decoderTau); });
      const reset = button(state, 'Show the bundle' + RSQUO + 's stages', function () { state.sel.pageDecoder = null; touched(state); });
      return { root: stopBox(core, [cv.canvas, panel(core, [controlRow(core, [sub]), sl.node, controlRow(core, [run, reset]), dl])]), cv: cv, dl: dl, run: run };
    });
    const cv = ui.cv, ctx = cv.ctx;
    clear(cv);
    ui.run.disabled = !!state.sel.busy;
    const view = decoderView(state);
    const kc = keyCosines(state);
    const c0 = state.geo.cell480;
    const played = Math.min(SUBSTEPS.length - 1, Math.floor(t * SUBSTEPS.length));
    const s = t >= 1 ? state.sel.substep : played;
    const local = t >= 1 ? 1 : clamp(t * SUBSTEPS.length - s, 0, 1);
    const titles = [
      'the cosine of every key with the followed key, as read',
      'the same after the key rule (the mean key taken away)',
      'the keys linked to the followed key: cosine above ' + TAU + ' ' + core.fmt(view.tau, 2),
      'the Fiedler vector of the first cut: strong above its mean, faint below',
      'the side of the first cut that the region comes from',
      'the regions the decoder keeps'
    ];
    text(ctx, titles[s], V.x, 14, P.css.ink, 10);
    drawView(ctx, state, 480, V.x, V.y, V.s);
    const cell = V.s / GK;
    const paint = function (fn) {
      for (let c = 0; c < NK; c++) {
        const style = fn(c);
        if (!style) continue;
        ctx.fillStyle = style;
        ctx.fillRect(V.x + (c % GK) * cell, V.y + Math.floor(c / GK) * cell, cell, cell);
      }
    };
    if (s === 0 || s === 1) {
      const vals = s === 0 ? kc.raw : kc.rule;
      let lo = Infinity, hi = -Infinity;
      for (let c = 0; c < NK; c++) if (c !== c0) { lo = Math.min(lo, vals[c]); hi = Math.max(hi, vals[c]); }
      paint(function (c) { return rgbCss(mix3(P.rgb.paper, P.rgb.teacher, (vals[c] - lo) / ((hi - lo) || 1)), 0.85 * local); });
    } else if (s === 2) {
      paint(function (c) { return kc.rule[c] > view.tau ? rgbCss(P.rgb.teacher, 0.7 * local) : rgbCss(P.rgb.paper, 0.6 * local); });
    } else if (s === 3 && view.fiedler) {
      const f = view.fiedler;
      let mean = 0, span = 0;
      for (let c = 0; c < NK; c++) mean += f[c] / NK;
      for (let c = 0; c < NK; c++) span = Math.max(span, Math.abs(f[c] - mean));
      paint(function (c) { return rgbCss(mix3(P.rgb.paper, P.rgb.ink, 0.5 + 0.5 * (f[c] - mean) / (span || 1)), 0.85 * local); });
    } else if (s === 4 && view.bipartition) {
      paint(function (c) { return view.bipartition[c] ? rgbCss(P.rgb.ink, 0.5 * local) : rgbCss(P.rgb.paper, 0.45 * local); });
      [0, GK - 1, NK - GK, NK - 1].forEach(function (c) {
        const b = cellBox(V.x, V.y, V.s, GK, c);
        frame(ctx, b.x + 1, b.y + 1, b.s - 2, b.s - 2, P.css.ink, 2);
      });
    } else if (s === 5) {
      paint(function (c) {
        const id = view.ids[c];
        if (!id) return rgbCss(P.rgb.paper, 0.5 * local);
        return rgbCss(mix3(P.rgb.ink, P.rgb.paper, [0.1, 0.35, 0.55, 0.7, 0.82][(id - 1) % 5]), 0.5 * local);
      });
    }
    gridLines(ctx, V.x, V.y, V.s, GK, rgbCss(P.rgb.paper, 0.18));
    if (s <= 2) {
      const b = cellBox(V.x, V.y, V.s, GK, c0);
      frame(ctx, b.x - 1, b.y - 1, b.s + 2, b.s + 2, P.css.paper, 4);
      frame(ctx, b.x - 1, b.y - 1, b.s + 2, b.s + 2, P.css.ink, 2);
    } else if (s >= 4 && view.seed !== undefined && view.seed !== null) {
      const b = cellBox(V.x, V.y, V.s, GK, view.seed);
      ctx.strokeStyle = P.css.ink;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(b.x + b.s / 2, b.y + b.s / 2, b.s * 0.9, 0, 2 * Math.PI);
      ctx.stroke();
    }
    text(ctx, 'the five stages', ST.x, ST.y - 8, P.css.ink, 10);
    const stageReveal = s >= 5 ? (t >= 1 ? 5 : Math.ceil(5 * local)) : (s >= 4 ? 1 : 0);
    view.stages.forEach(function (st, i) {
      const y = ST.y + i * ST.pitch;
      const shownStage = i < stageReveal;
      ctx.fillStyle = rgbCss(P.rgb.muted, 0.12);
      ctx.fillRect(ST.x, y, ST.s, ST.s);
      if (shownStage && st.component) {
        const cs = ST.s / GK;
        for (let c = 0; c < NK; c++) {
          if (st.mask && st.mask[c]) ctx.fillStyle = rgbCss(P.rgb.ink, 0.75);
          else if (st.component[c]) ctx.fillStyle = rgbCss(P.rgb.ignored, 0.6);
          else continue;
          ctx.fillRect(ST.x + (c % GK) * cs, y + Math.floor(c / GK) * cs, cs, cs);
        }
      }
      frame(ctx, ST.x - 0.5, y - 0.5, ST.s + 1, ST.s + 1, P.css.line, 1);
      text(ctx, 'stage ' + (i + 1) + ': ' + (shownStage ? st.reason : ELLIPSIS), ST.x + ST.s + 8, y + 16, shownStage && st.reason === 'ok' ? P.css.ink : P.css.muted, 10);
      if (shownStage) {
        text(ctx, st.area ? st.area + ' patches' : 'nothing new', ST.x + ST.s + 8, y + 30, P.css.muted, 10);
        if (isFinite(st.lambda2)) text(ctx, LAMBDA + SUB2 + ' ' + core.fmt(st.lambda2, 4), ST.x + ST.s + 8, y + 44, P.css.muted, 10);
      }
    });
    let links = 0;
    for (let c = 0; c < NK; c++) if (c !== c0 && kc.rule[c] > view.tau) links++;
    const notes = [
      'faint to strong: the lowest to the highest cosine',
      'faint to strong: the lowest to the highest cosine',
      'the followed key is linked to ' + links + ' of the other 899 keys',
      LAMBDA + SUB2 + ' = ' + core.fmt(view.lambda2, 4) + ', the second-smallest eigenvalue',
      view.corners + ' of the 4 corners above the mean: ' + (view.flipped ? 'the side is swapped' : 'the side is kept'),
      'stages that kept a region: ' + view.status.filter(function (x) { return x === 'ok'; }).length + ' of ' + view.status.length
    ];
    if (local >= 1) text(ctx, notes[s], V.x, V.y + V.s + 16, P.css.muted, 10);
    const rows = [
      ['keys (real)', '900 ' + TIMES + ' 384, run 2' + RSQUO + 's teacher on the 480-pixel view'],
      ['the followed key', 'cell ' + c0 + ' (' + cellOf(c0, GK) + '), under patch ' + state.anchor],
      ['its links at ' + TAU + ' ' + core.fmt(view.tau, 2), links + ' of the other 899 keys'],
      ['first cut', core.fmt(view.strong) + ' linked pairs, ' + LAMBDA + SUB2 + ' ' + core.fmt(view.lambda2, 4) + ', ' + view.corners + ' corners above the mean, ' + (view.flipped ? 'swapped' : 'not swapped') + ', seed cell ' + view.seed],
      ['stages', view.status.join(', ')],
      ['stages shown', view.source === 'bundle' ? 'the Python decoder' + RSQUO + 's, from the bundle' : 'computed in this page at ' + TAU + ' ' + core.fmt(view.tau, 2) + (view.same === null ? '' : (view.same ? '; the same masks as the Python decoder' : '; masks that differ from the Python decoder' + RSQUO + 's'))]
    ];
    if (state.sel.busy) rows.push(['decoder', 'computing in your browser' + ELLIPSIS]);
    fillReadout(core, ui.dl, rows);
  }

  // ------------------------------------------------------------------ stop 12: what a reading would do

  function boxCells(b) {
    const m = new Uint8Array(NK);
    for (let r = b.r0; r <= b.r1; r++) for (let c = b.c0; c <= b.c1; c++) m[r * GK + c] = 1;
    return m;
  }
  // scores(state): the toy truth (object A, then B over it) against the chosen model's regions, with Core.metrics.
  function scores(state) {
    const core = state.core;
    const ids = state.F.decoder[state.sel.model].ids;
    const labels = new Int16Array(NK);
    state.sel.boxes.forEach(function (b, k) {
      const m = boxCells(b);
      for (let c = 0; c < NK; c++) if (m[c]) labels[c] = k + 1;
    });
    const truth = [1, 2].map(function (k) { return Uint8Array.from(labels, function (v) { return v === k ? 1 : 0; }); });
    const truthFg = Uint8Array.from(labels, function (v) { return v > 0 ? 1 : 0; });
    const regionIds = [], preds = [];
    for (let k = 1; k <= 5; k++) {
      const m = Uint8Array.from(ids, function (v) { return v === k ? 1 : 0; });
      if (m.some(function (x) { return x; })) { regionIds.push(k); preds.push(m); }
    }
    const predFg = Uint8Array.from(ids, function (v) { return v > 0 ? 1 : 0; });
    const h = core.metrics.hungarianIoU(truth, preds);
    return {
      ids: ids, labels: labels, regionIds: regionIds, h: h,
      union: core.metrics.unionIoU(truthFg, predFg), ari: core.metrics.fgARI(labels, Int16Array.from(ids), truthFg),
      bgfpr: core.metrics.bgFPR(truthFg, predFg), count: core.metrics.regionCount(preds)
    };
  }
  // moveBox(state, k, dr, dc, resize): move toy object k by dr rows and dc columns, or move its lower right corner.
  function moveBox(state, k, dr, dc, resize) {
    const b = state.sel.boxes[k];
    if (resize) {
      b.r1 = clamp(b.r1 + dr, b.r0, GK - 1);
      b.c1 = clamp(b.c1 + dc, b.c0, GK - 1);
    } else {
      const h = b.r1 - b.r0, w = b.c1 - b.c0;
      b.r0 = clamp(b.r0 + dr, 0, GK - 1 - h);
      b.c0 = clamp(b.c0 + dc, 0, GK - 1 - w);
      b.r1 = b.r0 + h;
      b.c1 = b.c0 + w;
    }
  }
  function paintReading(stage, state, t) {
    state.t = t;
    const core = state.core, P = state.pal;
    const W = 520, H = 330;
    const V = { x: 0, y: 20, s: 300 };
    const MT = { x: 312, y: 40 };
    const cell = V.s / GK;
    const ui = kit(stage, state, 'reading', function () {
      const cv = makeCanvas(core, W, H, 'The decoder' + RSQUO + 's regions on the 480-pixel view with two dashed toy objects. Drag a toy object, or its corner square to resize it; with the focus here, the arrow keys move the chosen object and Shift with an arrow key resizes it.', true);
      const dl = readoutList(core);
      const table = core.el('div', { 'class': 'scroll-x p7-iou' });
      const models = segmented(state, 'lab-7a-film-model', 'Whose regions', DECODER_MODELS.map(function (m) { return { value: m.key, label: m.label }; }), state.sel.model, function (k) {
        state.sel.model = k;
        touched(state);
      });
      const which = segmented(state, 'lab-7a-film-box', 'The toy object that the arrow keys move', [{ value: 0, label: 'object A' }, { value: 1, label: 'object B' }], state.sel.box, function (k) {
        state.sel.box = k;
        touched(state);
      });
      const reset = button(state, 'Put the objects back', function () {
        state.sel.boxes = TOY_BOXES.map(function (b) { return { name: b.name, r0: b.r0, c0: b.c0, r1: b.r1, c1: b.c1 }; });
        touched(state);
      });
      const cellUnder = function (ev) {
        const p = pointerAt(state, cv, ev);
        if (p.x < V.x || p.y < V.y || p.x >= V.x + V.s || p.y >= V.y + V.s) return null;
        return { r: Math.floor((p.y - V.y) / cell), c: Math.floor((p.x - V.x) / cell) };
      };
      listen(state, cv.canvas, 'pointerdown', function (ev) {
        const at = cellUnder(ev);
        if (!at) return;
        let hit = null;
        for (let k = state.sel.boxes.length - 1; k >= 0 && !hit; k--) {
          const b = state.sel.boxes[k];
          if (at.r === b.r1 && at.c === b.c1) hit = { k: k, resize: true };
          else if (at.r >= b.r0 && at.r <= b.r1 && at.c >= b.c0 && at.c <= b.c1) hit = { k: k, resize: false };
        }
        if (!hit) return;
        state.sel.box = hit.k;
        state.sel.drag = { k: hit.k, resize: hit.resize, r: at.r, c: at.c };
        if (typeof cv.canvas.setPointerCapture === 'function' && ev.pointerId !== undefined) {
          try { cv.canvas.setPointerCapture(ev.pointerId); } catch (e) { /* not every pointer can be captured */ }
        }
        touched(state);
      });
      listen(state, cv.canvas, 'pointermove', function (ev) {
        const d = state.sel.drag;
        if (!d) return;
        const at = cellUnder(ev);
        if (!at || (at.r === d.r && at.c === d.c)) return;
        moveBox(state, d.k, at.r - d.r, at.c - d.c, d.resize);
        d.r = at.r;
        d.c = at.c;
        touched(state);
      });
      const end = function () { state.sel.drag = null; };
      listen(state, cv.canvas, 'pointerup', end);
      listen(state, cv.canvas, 'pointercancel', end);
      listen(state, cv.canvas, 'keydown', function (ev) {
        const moves = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] };
        const mv = moves[ev.key];
        if (!mv) return;
        moveBox(state, state.sel.box, mv[0], mv[1], !!ev.shiftKey);
        if (typeof ev.preventDefault === 'function') ev.preventDefault();
        if (typeof ev.stopPropagation === 'function') ev.stopPropagation();
        touched(state);
      });
      return { root: stopBox(core, [cv.canvas, panel(core, [controlRow(core, [models]), controlRow(core, [which, reset]), table, dl])]), cv: cv, dl: dl, table: table };
    });
    const cv = ui.cv, ctx = cv.ctx;
    clear(cv);
    const sc = scores(state);
    const fr = phase(t, 0, 0.3), fb = phase(t, 0.3, 0.5), fm = phase(t, 0.5, 1);
    const model = DECODER_MODELS.filter(function (m) { return m.key === state.sel.model; })[0];
    text(ctx, model.label + RSQUO + 's regions (real) and two toy objects', V.x, 12, P.css.ink, 10);
    drawView(ctx, state, 480, V.x, V.y, V.s);
    ctx.fillStyle = rgbCss(P.rgb.paper, 0.35);
    ctx.fillRect(V.x, V.y, V.s, V.s);
    const shade = [0.1, 0.35, 0.55, 0.7, 0.82];
    for (let c = 0; c < NK; c++) {
      const id = sc.ids[c];
      if (!id) continue;
      ctx.fillStyle = rgbCss(mix3(P.rgb.ink, P.rgb.paper, shade[(id - 1) % 5]), 0.5 * fr);
      ctx.fillRect(V.x + (c % GK) * cell, V.y + Math.floor(c / GK) * cell, cell, cell);
    }
    if (fr >= 1) {
      sc.regionIds.forEach(function (k) {
        let sx = 0, sy = 0, n = 0;
        for (let c = 0; c < NK; c++) if (sc.ids[c] === k) { sx += c % GK; sy += Math.floor(c / GK); n++; }
        backedText(ctx, state, 'region ' + k, V.x + (sx / n + 0.5) * cell, V.y + (sy / n + 0.5) * cell + 4, P.css.ink, 10, 'center');
      });
    }
    if (fb > 0) {
      ctx.globalAlpha = fb;
      state.sel.boxes.forEach(function (b, k) {
        const x = V.x + b.c0 * cell, y = V.y + b.r0 * cell, w = (b.c1 - b.c0 + 1) * cell, h = (b.r1 - b.r0 + 1) * cell;
        ctx.setLineDash([6, 4]);
        frame(ctx, x + 1, y + 1, w - 2, h - 2, P.css.paper, 4);
        frame(ctx, x + 1, y + 1, w - 2, h - 2, P.css.ink, k === state.sel.box ? 2.5 : 1.5);
        ctx.setLineDash([]);
        backedText(ctx, state, 'toy ' + b.name, x + 5, y + 15, P.css.ink, 10);
        ctx.fillStyle = P.css.ink;
        ctx.fillRect(x + w - cell + 2, y + h - cell + 2, cell - 4, cell - 4);
      });
      ctx.globalAlpha = 1;
    }
    if (fm > 0) {
      // the matching as a list: each toy object, the region the Hungarian matching gives it, and the IoU it earns
      text(ctx, 'the Hungarian matching', MT.x, MT.y - 6, P.css.ink, 11, 'left', true);
      const credit = [];
      state.sel.boxes.forEach(function (b, k) {
        const f = phase(fm, k * 0.3, k * 0.3 + 0.3);
        if (f <= 0) return;
        const pair = sc.h.pairs.filter(function (pr) { return pr.truth === k; })[0];
        credit.push(pair ? core.fmt(pair.iou, 3) : '0');
        ctx.globalAlpha = f;
        text(ctx, 'toy ' + b.name + ' ' + ARROW + ' ' + (pair ? 'region ' + sc.regionIds[pair.pred] : 'no region'), MT.x, MT.y + 22 + k * 40, P.css.ink, 11);
        text(ctx, pair ? 'IoU ' + core.fmt(pair.iou, 3) : 'unmatched, counts 0', MT.x + 14, MT.y + 38 + k * 40, P.css.muted, 10);
        ctx.globalAlpha = 1;
      });
      const unused = sc.regionIds.filter(function (rid, q) { return !sc.h.pairs.some(function (pr) { return pr.pred === q; }); });
      if (fm >= 0.6 && unused.length) text(ctx, 'left over: region' + (unused.length > 1 ? 's ' : ' ') + unused.join(', '), MT.x, MT.y + 112, P.css.muted, 10);
      if (fm >= 1) {
        text(ctx, 'score = (' + credit.join(' + ') + ') / ' + credit.length, MT.x, MT.y + 150, P.css.ink, 11);
        text(ctx, '= ' + core.fmt(sc.h.score, 3), MT.x, MT.y + 170, P.css.ink, 13, 'left', true);
        text(ctx, 'the mean over the toy objects', MT.x, MT.y + 188, P.css.muted, 10);
      }
    }
    const tbl = ui.table;
    const key = state.sel.model + JSON.stringify(state.sel.boxes);
    if (tbl.p7Key !== key) {
      tbl.p7Key = key;
      while (tbl.firstChild) tbl.removeChild(tbl.firstChild);
      const head = core.el('tr', null, [core.el('th', { scope: 'col' }, 'IoU')].concat(sc.regionIds.map(function (k) { return core.el('th', { scope: 'col' }, 'region ' + k); })));
      const body = sc.h.matrix.map(function (rowVals, tIdx) {
        return core.el('tr', null, [core.el('th', { scope: 'row' }, 'toy ' + state.sel.boxes[tIdx].name)].concat(Array.prototype.map.call(rowVals, function (v, q) {
          const matched = sc.h.pairs.some(function (p) { return p.truth === tIdx && p.pred === q; });
          return core.el('td', { 'class': matched ? 'p7-matched' : null }, core.fmt(v, 3) + (matched ? ', matched' : ''));
        })));
      });
      tbl.appendChild(core.el('table', { 'class': 'p7-table' }, [core.el('thead', null, [head]), core.el('tbody', null, body)]));
    }
    fillReadout(core, ui.dl, [
      ['Hungarian matched IoU', core.fmt(sc.h.score, 3) + ', the mean of the matched IoU over the two toy objects'],
      ['foreground union IoU', core.fmt(sc.union, 3)],
      ['foreground ARI', core.fmt(sc.ari, 3)],
      ['background false-positive rate', core.fmt(sc.bgfpr, 3)],
      ['regions', String(sc.count)]
    ]);
  }

  // ------------------------------------------------------------------ the copy of the stops (every statement marked)

  const STOPS = [
    {
      id: 'pixels', title: 'The image is numbers', paint: paintPixels,
      explain: [
        '<p>The film follows one photograph of the course\'s bundle, a dog and a cat by a door. It is 640 <dfn data-term="pixel">pixels</dfn> wide and 480 high, with three numbers for each pixel: 921,600 numbers in all. <span class="mark mark-real" data-bundle="images.json#images">Real</span></p>',
        '<p>Each number is an amount of red, green or blue from 0 to 255. Before the network reads them, each is divided by 255 and then <dfn data-term="normalisation">normalised</dfn> channel by channel, (value &minus; mean) / std, with the ImageNet means 0.485, 0.456 and 0.406 and standard deviations 0.229, 0.224 and 0.225. <span class="mark mark-fact" data-source="torchvision docs; official code: main_selfpatch.py">Fact</span></p>',
        '<p>Point at the photograph to read any pixel. Your browser decodes the JPEG file itself, so a value here can differ by a few levels from the one the bundle\'s script read. <span class="mark mark-toy">Toy</span></p>',
        '<p class="p7-taught">Taught in <a href="p1-foundations.html#s1-1">1.1</a>.</p>'
      ].join('')
    },
    {
      id: 'crops', title: 'The crops', paint: paintCrops,
      explain: [
        '<p>In training, every step cuts each image into ten <dfn data-term="crop">crops</dfn>: two global crops of 224 pixels that cover 0.25 to 1.0 of its area and eight local crops of 96 pixels that cover 0.05 to 0.25, at new random places every time. <span class="mark mark-fact" data-source="our architecture doc &#167;2.5">Fact</span></p>',
        '<p>The bundle kept one fixed view instead: the photograph resized to 298 by 224 pixels and its centre square kept, starting 37 pixels from the left. Stops 3 to 10 use this view; the decoder of stop 11 reads the centre square at 480 pixels. <span class="mark mark-real" data-bundle="images.json#images">Real</span></p>',
        '<p>The second global crop and the eight local crops are toy rectangles that this page draws with its own random numbers. The real crops changed at every step and were never stored. <span class="mark mark-toy">Toy</span></p>',
        '<p>Both networks read all ten crops: the rule needs the teacher\'s tokens of every crop, and its term is the mean over the ten views. <span class="mark mark-fact" data-source="protocol 2026-10-08 &#167;3.2">Fact</span></p>',
        '<p class="p7-taught">Taught in <a href="p3-dino.html#s3-2">3.2</a>.</p>'
      ].join('')
    },
    {
      id: 'patches', title: 'Patches and tokens', paint: paintPatches,
      explain: [
        '<p>ViT-S/16 cuts the 224-pixel view into <dfn data-term="patch">patches</dfn> of 16 by 16 pixels: a grid of 14 by 14, 196 patches, each holding 16 &times; 16 &times; 3 = 768 numbers. <span class="mark mark-fact" data-source="our architecture doc &#167;3.2">Fact</span></p>',
        '<p>A learned linear map turns each patch\'s 768 numbers into a <dfn data-term="token">token</dfn> of 384, and a learned position row of 384 numbers is added for each place of the grid, so that the token carries where its patch sits. <span class="mark mark-fact" data-source="our architecture doc &#167;2.2">Fact</span></p>',
        '<p>The film follows patch 34, row 2 and column 6, on the bulldog\'s nose. The grid of cells under the arrow is its real token as the rule reads it: the 384 numbers that leave the last of the twelve blocks of stop 4 in run 2\'s teacher. The bundle keeps no token from before the blocks. <span class="mark mark-real" data-bundle="000000114269_con2_tokens224.json#tokens">Real</span></p>',
        '<p>This backbone has no class token: a 224-pixel crop leaves it as 196 tokens of 384 numbers, one per patch. <span class="mark mark-fact" data-source="our architecture doc &#167;3.12">Fact</span></p>',
        '<p class="p7-taught">Taught in <a href="p2-vit.html#s2-1">2.1</a> and <a href="p2-vit.html#s2-2">2.2</a>.</p>'
      ].join('')
    },
    {
      id: 'blocks', title: 'Twelve blocks of attention', paint: paintBlocks,
      explain: [
        '<p>The 196 tokens pass through 12 blocks. In each block, <dfn data-term="attention">attention</dfn> lets every token take a weighted mix of all the tokens, with weights from a softmax that add up to 1, and 6 <dfn data-term="attention head">heads</dfn> do this side by side, each on 64 of the 384 numbers. Then an MLP widens each token to 1,536 numbers and narrows it back to 384. <span class="mark mark-fact" data-source="DINO Tab. 1; our architecture doc &#167;3.2">Fact</span></p>',
        '<p>Each small map is the real attention of patch 34 in one block (a column) and one head (a row) of run 2\'s teacher: where the patch takes its mix from. In the first four blocks some heads put most of their weight on patch 34 itself or on the patch beside it or above it; in block 12 every head spreads its weight thinly over many patches. <span class="mark mark-real" data-bundle="followed.json#attention_rows_con2">Real</span></p>',
        '<p>Each map is scaled to its own largest weight, so that faint maps stay visible; the numbers under the picture give the real weights. <span class="mark mark-toy">Toy</span></p>',
        '<p>The rule of stop 6 reads the tokens that leave block 12, and the decoder of stop 11 reads the keys inside block 12\'s attention. <span class="mark mark-fact" data-source="protocol 2026-10-08 &#167;3.2; our architecture doc &#167;5.2">Fact</span></p>',
        '<p class="p7-taught">Taught in <a href="p2-vit.html#s2-3">2.3</a>, <a href="p2-vit.html#s2-4">2.4</a>, <a href="p2-vit.html#s2-5">2.5</a> and <a href="p2-vit.html#s2-6">2.6</a>.</p>'
      ].join('')
    },
    {
      id: 'twins', title: 'Teacher and student', paint: paintTwins,
      explain: [
        '<p>Two networks with the same architecture read the crops: the <dfn data-term="student">student</dfn>, which the loss trains, and the <dfn data-term="teacher">teacher</dfn>, whose weights are a moving average of the student\'s past weights. <span class="mark mark-fact" data-source="DINO &#167;3.1">Fact</span></p>',
        '<p>Here both are run 2 at the end of its 9,240 steps, reading the same 224-pixel view: 196 tokens of 384 numbers each. The two small grids under the shades show the 384 numbers of one patch\'s token in each network, and the gauge gives the cosine of the two. <span class="mark mark-real" data-bundle="followed.json#student_tokens224">Real</span></p>',
        '<p>The shades are a projection that this page computes: each token\'s place along the direction in which the teacher\'s tokens vary most, on one scale for both grids, so that similar tokens get similar shades. <span class="mark mark-toy">Toy</span></p>',
        '<p>The teacher\'s tokens carry no gradient: they choose the positives and the negatives and serve as the targets, and only the student learns from the loss. <span class="mark mark-fact" data-source="protocol 2026-10-08 &#167;3.2">Fact</span></p>',
        '<p class="p7-taught">Taught in <a href="p3-dino.html#s3-1">3.1</a> and <a href="p3-dino.html#s3-6">3.6</a>.</p>'
      ].join('')
    },
    {
      id: 'matrix', title: 'The similarity matrix', paint: paintMatrix,
      explain: [
        '<p>The rule compares the teacher\'s tokens of one crop with each other: the <dfn data-term="cosine similarity">cosine</dfn> of every pair, a 196 by 196 matrix. A token is never compared with itself, so the diagonal is left out. <span class="mark mark-fact" data-source="protocol 2026-10-08 &#167;3.2">Fact</span></p>',
        '<p>Two thresholds come from the 38,220 cosines off the diagonal: &tau;<sub>hi</sub>, the <dfn data-term="quantile">quantile</dfn> at 1 &minus; 8/195, about 0.959, so that on average each anchor has 8 tokens at or above it, and &tau;<sub>lo</sub>, the quantile at 0.20, the bottom fifth of the pairs. <span class="mark mark-fact" data-source="protocol 2026-10-08 &#167;3.2">Fact</span></p>',
        '<p>On this crop under run 2\'s teacher, &tau;<sub>hi</sub> = 0.8685 and &tau;<sub>lo</sub> = &minus;0.3202. In the matrix, the stronger the blue, the higher the cosine. The histogram shows all 38,220 values with the two thresholds: its bars at or above &tau;<sub>hi</sub> are orange and those at or below &tau;<sub>lo</sub> purple, the colours of the positives and the negatives of stop 7. <span class="mark mark-real" data-bundle="followed.json#tau_hi">Real</span></p>',
        '<p class="p7-taught">Taught in <a href="p5-rule.html#s5-2">5.2</a> and <a href="p5-rule.html#s5-3">5.3</a>.</p>'
      ].join('')
    },
    {
      id: 'sets', title: 'Positives and negatives', paint: paintSets,
      explain: [
        '<p>An anchor\'s <dfn data-term="positive">positives</dfn> are its 8 most similar tokens, united with every token at or above &tau;<sub>hi</sub>, at most 24. Its <dfn data-term="negative">negatives</dfn> are the tokens at or below &tau;<sub>lo</sub> that are not positives, the 48 least similar kept. <span class="mark mark-fact" data-source="protocol 2026-10-08 &#167;3.2">Fact</span></p>',
        '<p>Patch 34 gets 8 positives, all from its top 8 and all on the dog\'s face: its most similar token has a cosine of 0.8137, below &tau;<sub>hi</sub>, so the threshold adds none. 79 tokens lie at or below &tau;<sub>lo</sub> without being positives, and the cap keeps the 48 least similar. <span class="mark mark-real" data-bundle="followed.json#anchor_summary">Real</span></p>',
        '<p>Across the crop the threshold adds 747 positive pairs beyond the anchors\' top 8, the cap of 24 cuts the positives of 7 anchors, the cap of 48 cuts the negatives of 36, and 6 anchors have no negative at all. Click a patch to see its own sets: the lighter orange marks positives that the threshold added. <span class="mark mark-real" data-bundle="followed.json#rule_stats">Real</span></p>',
        '<p class="p7-taught">Taught in <a href="p5-rule.html#s5-2">5.2</a> and <a href="p5-rule.html#s5-3">5.3</a>; the reasons for each choice are the why cards of <a href="p5-rule.html#s5-5">5.5</a>.</p>'
      ].join('')
    },
    {
      id: 'infonce', title: 'The InfoNCE term', paint: paintInfonce,
      explain: [
        '<p>For each positive p, the <dfn data-term="InfoNCE">InfoNCE</dfn> term asks the student\'s token of patch 34 to be closer to the teacher\'s token of p than to the teacher\'s token of every negative: <span class="formula">l<sub>p</sub> = &minus;log( e<sup>s<sub>p</sub>/&tau;</sup> / ( e<sup>s<sub>p</sub>/&tau;</sup> + &sum;<sub>n</sub> e<sup>s<sub>n</sub>/&tau;</sup> ) )</span>, where s is the cosine between the student\'s token and a teacher\'s token and &tau; = 0.2 is the <dfn data-term="temperature">temperature</dfn>. <span class="mark mark-fact" data-source="protocol 2026-10-08 &#167;3.2">Fact</span></p>',
        '<p>Each long bar is one positive\'s denominator: its orange part is the positive\'s share, the purple slivers are the 48 negatives\' shares, and the thin bar under it spreads the negatives\' part over the full width. A positive of patch 34 holds 0.9529 of its denominator on average, so each l<sub>p</sub> is small, and the anchor\'s term, their mean, is 0.0483. <span class="mark mark-real" data-bundle="followed.json#anchor_shares">Real</span></p>',
        '<p>At &tau; 0.1 the same anchor gives 0.0000605 and at 0.3 it gives 0.392; over the whole crop the mean is 0.0379 at 0.2. The slider recomputes the term at any temperature. <span class="mark mark-real" data-bundle="followed.json#infonce">Real</span></p>',
        '<p>Run 2 is at its end, so its term is already small: over the crops of step 1 it was 0.7336, and over those of step 9,240 it was 0.0269. <span class="mark mark-real" data-bundle="telemetry.json#runs">Real</span></p>',
        '<p class="p7-taught">Taught in <a href="p5-rule.html#s5-4">5.4</a>; the temperature in <a href="p1-foundations.html#s1-5">1.5</a>.</p>'
      ].join('')
    },
    {
      id: 'gradient', title: 'The gradient: pull and push', paint: paintGradient,
      explain: [
        '<p>The <dfn data-term="gradient">gradient</dfn> of the term with respect to the student\'s token points where the term grows fastest. Gradient descent moves the token against it. That draws the token toward each positive, with the weight 1 &minus; w<sub>p</sub>, and drives it away from each negative, with the weight w<sub>n</sub>, where the w are the shares of stop 8. Every weight is also divided by &tau; and by the number of positives. <span class="mark mark-fact" data-source="code: cluster/contrastive.py:35-40">Fact</span></p>',
        '<p>For patch 34 the gradient, computed once with PyTorch, has length 0.1582. It is the sum of two parts: the pull, of length 0.0987, from the 8 positives, and the push, of length 0.1234, from the 48 negatives. The arrows are drawn against the gradient, the way the token moves: the pull toward the positives, the push away from the negatives, and their sum, the step, in green. <span class="mark mark-real" data-bundle="followed.json#anchor_grad">Real</span></p>',
        '<p>The picture is a flat slice through the space of 384 numbers, the slice that holds the pull and the push, with each positive and negative placed by its part along them. The student\'s token sits where the two axes cross, the point where the slice touches the sphere of tokens of length 1. The gradient lies in the slice, so a small step moves the token along the sphere. <span class="mark mark-toy">Toy</span></p>',
        '<p>From this token the gradient flows back into every block of the student; the teacher\'s tokens are detached and move only through the moving average of stop 10. <span class="mark mark-fact" data-source="protocol 2026-10-08 &#167;3.2">Fact</span></p>',
        '<p class="p7-taught">Taught in <a href="p5-rule.html#s5-4">5.4</a>.</p>'
      ].join('')
    },
    {
      id: 'adamw', title: 'AdamW and the moving average', paint: paintAdamw,
      explain: [
        '<p><dfn data-term="AdamW">AdamW</dfn> updates each weight from two running averages, m of its gradient and v of the gradient\'s square, with &beta; = (0.9, 0.999) and &epsilon; = 1e-8. It shrinks a decayed weight by the learning rate times the weight decay times the weight, then subtracts the learning rate times m / (&radic;v + &epsilon;), with m and v first scaled up to make up for their start at zero. <span class="mark mark-fact" data-source="PyTorch docs; official code: main_selfpatch.py">Fact</span></p>',
        '<p>The four buttons take run 2\'s real learning rate of the backbone, weight decay and teacher momentum at steps 1, 463, 4,620 and 9,240. <span class="mark mark-real" data-bundle="telemetry.json#runs">Real</span></p>',
        '<p>Steps 1 to 462 make up epoch 0, in which the backbone\'s gradients are thrown away, so the term moves nothing in the backbone before step 463. <span class="mark mark-fact" data-source="protocol 2026-10-08 &#167;3.2">Fact</span></p>',
        '<p>The arithmetic is a toy: one weight of 0.5 whose gradient has the length of patch 34\'s real gradient, 0.1582. On the first update the scaled-up m equals the gradient and &radic;v its size, so the step is about the learning rate whatever the size of the gradient. <span class="mark mark-toy">Toy</span></p>',
        '<p>Then the teacher follows the student: teacher &larr; &lambda; &times; teacher + (1 &minus; &lambda;) &times; student, the <dfn data-term="moving average">moving average</dfn>, whose momentum &lambda; rises on a cosine from 0.9995 to 1, so each step closes a tiny part of the gap. After 20 epochs of this schedule, 0.099 of the step-0 teacher remains. <span class="mark mark-fact" data-source="DINO &#167;3.1; our code: cluster/train.py; our report &#167;2.4">Fact</span></p>',
        '<p class="p7-taught">Taught in <a href="p1-foundations.html#s1-4">1.4</a>, <a href="p3-dino.html#s3-6">3.6</a>, <a href="p5-rule.html#s5-7">5.7</a> and <a href="p5-rule.html#s5-8">5.8</a>.</p>'
      ].join('')
    },
    {
      id: 'decoder', title: 'The decoder reads the keys', paint: paintDecoder,
      explain: [
        '<p>The decoder reads the <dfn data-term="key">keys</dfn> of the teacher\'s last attention block on the 480-pixel view: a 30 by 30 grid of 900 keys of 384 numbers. It first takes the image\'s mean key away from every key, the <dfn data-term="key rule">key rule</dfn>. <span class="mark mark-fact" data-source="decoder config; our architecture doc &#167;5.2">Fact</span></p>',
        '<p>Two keys are linked with weight 1 when their cosine exceeds &tau; = 0.2 and with &epsilon; = 1e-5 otherwise. The <dfn data-term="normalised cut">normalised cut</dfn> of this graph comes from its <dfn data-term="Fiedler vector">Fiedler vector</dfn>: the patches above its mean form one side. The side is swapped when 3 or more of the grid\'s corners fall in it, or when the patch with the vector\'s largest entry, ignoring its sign, lies outside it. The seed, circled in the picture, is the patch of the kept side farthest from the mean, and the seed\'s connected piece of that side becomes a region. Up to 5 regions are cut, one stage at a time. <span class="mark mark-fact" data-source="decoder config; code: src/decoder_v2.py:114-121">Fact</span></p>',
        '<p>Under run 2 the first cut has 180,919 linked pairs and &lambda;<sub>2</sub> = 0.0238. Its side above the mean holds the four corners, so the cut is swapped, and the seed\'s piece gives region 1: 400 of the 900 patches, the dog and the cat together. The later stages find that region again or nothing new, so the decoder keeps one region. These stages ran on the stored 8-bit keys that this page reads; on the 32-bit keys from before the storing, region 1 holds one patch more. <span class="mark mark-real" data-bundle="followed.json#decoder">Real</span></p>',
        '<p>Not repeated in this page: the bilateral refinement of the masks and their resize to the photograph\'s own size. This view is also the photograph\'s centre square, while the readings\' exports resize the whole photograph to 480 by 480. The button runs the same decoder in your browser, at the &tau; of the slider. <span class="mark mark-fact" data-source="decoder config; src/core.js, Core.decoder; data/bundle_manifest.json (views)">Fact</span></p>',
        '<p class="p7-taught">Taught in <a href="p6-reading.html#s6-2">6.2</a> and <a href="p6-reading.html#s6-3">6.3</a>.</p>'
      ].join('')
    },
    {
      id: 'reading', title: 'What a reading would do', paint: paintReading,
      explain: [
        '<p>A reading compares the decoder\'s regions with an image\'s true objects: the <dfn data-term="IoU">IoU</dfn> of every object with every region, the <dfn data-term="Hungarian matching">Hungarian matching</dfn> that pairs objects with regions so that the sum of their IoUs is as large as it can be, and the mean matched IoU over the objects, an unmatched object counting 0. <span class="mark mark-fact" data-source="our spec &#167;6.1; code: evaluation/metrics.py">Fact</span></p>',
        '<p>The two dashed rectangles are toy objects that this page drew by eye: no label of this photograph was opened, here or in the bundle. Drag them, or focus the picture and use the arrow keys, and every score follows. <span class="mark mark-toy">Toy</span></p>',
        '<p>The regions are the Python decoder\'s for run 2, the converted DINO and released SelfPatch, computed on their keys as the bundle stores them, with 8 bits per number. Run 2\'s one region covers both animals, the converted DINO keeps two regions and released SelfPatch three. <span class="mark mark-real" data-bundle="followed.json#decoder">Real</span></p>',
        '<p>On the 988 defined images of the COCO v4 validation panel, run 2\'s final checkpoint scored 17.41 per cent Hungarian matched IoU against 17.23 for the converted DINO it started from: a difference of +0.18 points with an interval from &minus;0.59 to +0.92, from a single seed and with no verdict. <span class="mark mark-reading" data-source="reading 2026-10-11, run 2">Reading</span></p>',
        '<p>Training and the rule read no label, and the decoder reads none when it cuts. Only the evaluator opens the validation labels, after an export: for run 2 at the looks of epochs 5 and 10, whose scores could have stopped the run, and once more at the end. Both looks let the run go on. No label enters training, and no checkpoint is chosen by a score. <span class="mark mark-fact" data-source="protocol 2026-10-08 &#167;9, &#167;5.1, &#167;6d and &#167;3.1; amendment 2026-10-10, run 2, &#167;3; early looks 2026-10-10, run 2, epochs 5 and 10">Fact</span></p>',
        '<p class="p7-taught">Taught in <a href="p6-reading.html#s6-5">6.5</a> and <a href="p6-reading.html#s6-7">6.7</a>; the readings in <a href="p5-rule.html#s5-9">5.9</a>.</p>'
      ].join('')
    }
  ];

  // ------------------------------------------------------------------ the lab

  Labs.register('lab-7a-film', function mount(rootEl, core, bundles) {
    bundles = bundles || core.bundles;
    if (!root.Scenes || typeof root.Scenes.create !== 'function') throw new Error('the scenes engine (src/scenes.js) is not loaded');
    const state = prepare(core, bundles);
    state.rootEl = rootEl;
    const film = root.Scenes.create(rootEl, {
      stops: STOPS.map(function (s, i) {
        return {
          id: s.id, title: s.title, duration: DURATIONS[i], explain: s.explain,
          still: function (stage, st) { s.paint(stage, st, 1); },
          draw: function (stage, st, t) { s.paint(stage, st, t); }
        };
      }),
      state: state,
      label: 'The pipeline film: one photograph in twelve stops, from its pixels to its regions'
    });
    state.film = film;
    loadPictures(state);
    core.on('theme-changed', function () {
      state.pal = palette(core);
      state.themeKey += 1;
      repaint(state);
    });
    return film;
  });

  root.LabP7 = Object.freeze({
    version: VERSION,
    files: FILES,
    stops: Object.freeze(STOPS.map(function (s, i) { return Object.freeze({ id: s.id, title: s.title, duration: DURATIONS[i], explain: s.explain }); })),
    constants: Object.freeze({
      durations: DURATIONS, cropSeed: CROP_SEED, localCrops: LOCAL_CROPS, toyWeight: TOY_WEIGHT, histBins: HIST_BINS,
      tauSlider: TAU_SLIDER, decoderTauSlider: DECODER_TAU_SLIDER, updates: UPDATES, toyBoxes: TOY_BOXES, adam: ADAM,
      schedule: SCHEDULE, decoderModels: DECODER_MODELS, substeps: SUBSTEPS
    }),
    anchorGeometry: anchorGeometry
  });
})(typeof window !== 'undefined' ? window : this);
