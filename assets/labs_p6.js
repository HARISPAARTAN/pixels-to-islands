/*
 * labs_p6.js: the five labs of Part 6 ("Reading the model") of the course "Pixels to Islands"
 * (docs/research/explainer_v2_2026-10-13/; plan Task 10, spec sections 4 and 7).
 *
 *   lab-6a-decoder      MaskCut on keys. Real mode: the frozen decoder (Core.decoder.maskcut) on the real 480 px keys
 *                       of a bundle photograph under the converted DINO, released SelfPatch or run 2, with a tau slider,
 *                       the key rule, every stage's outcome, the Fiedler vector, the cosine histogram, and, for the
 *                       followed photograph at tau 0.2 with the frozen key rule, the bundle's Python stages beside the
 *                       page's. Toy mode: the first explainer's Lab J (64 toy keys on an 8 x 8 grid), ported.
 *   lab-6b-key-bias     The first explainer's Lab K, ported and deepened: two shared vectors (a key bias and a LayerNorm
 *                       shift) added to the toy keys, three key rules (raw, bias-free, mean subtraction); then the cosine
 *                       histogram and the first cut of a photograph's real keys, raw or with the mean subtracted.
 *   lab-6c-hungarian    Three truth objects and two to four editable rectangles on a 48 x 48 grid: the IoU table, the
 *                       Hungarian matching (Core.metrics.hungarianIoU), the greedy matching, every one-to-one pairing.
 *   lab-6d-secondaries  The same drawing (shared with lab-6c): union IoU, recall, foreground ARI with its table of
 *                       counts, the background false-positive rate, mBO-i and the region count, with the zero-region rule.
 *   lab-6e-probe        A linear probe of 2-number toy tokens of three classes, trained by gradient descent in the page:
 *                       the decision areas, the true and predicted label grids, the loss curve, the confusion table and
 *                       mIoU, and one token's logits, loss and gradient.
 *
 * Vanilla ES2019 in UTF-8 (the characters beyond ASCII are typographic: the constants under "characters", the section
 * sign and an arrow in FACTS, and a Greek letter, a subscript and a middle dot in one hint), no library, no
 * storage, no dialog; data are read only through Core.bundle.load and
 * Core.image.load. Every default number is in src/labs_defaults.json under the keys lab-6a-decoder to lab-6e-probe
 * (DEFAULTS below, compared with that file by tests/smoke_p6.js); every fact a lab writes is in FACTS below with its
 * fact-sheet id (also compared). Glossary terms are defined in src/glossary_p6.html.
 */
(function (root) {
  'use strict';

  const Labs = root.Labs;
  if (!Labs || typeof Labs.register !== 'function') {
    if (root.console && typeof root.console.error === 'function') {
      root.console.error('[course] labs_p6.js: window.Labs is missing, so core.js must load first');
    }
    return;
  }

  // ------------------------------------------------------------------ defaults (src/labs_defaults.json)

  const DEFAULTS = {
    // lab-6a-decoder: the first explainer's toy mode (ported entries) and the real mode (new)
    'j.part3.tau': { min: 0.05, max: 0.6, default: 0.2, step: 0.01 },
    'j.part3.stages': { min: 1, max: 3, default: 1, run: 3 },
    'j.part3.picture': { side: 128, patch: 16, grid: 8, patches: 64 },
    'j.part3.keys': { dimensions: 384, feature_weight: 4, padding_zeros: 376 },
    'j.part3.drawing': { picture: 240, v2_map: 176, matrix: 256, matrix_cell: 4 },
    '6a.real_tau': { min: 0.05, max: 0.5, default: 0.2, step: 0.01 },
    '6a.real_start': { image: '000000114269', model: 'con2', key_rule: 'mean_subtract', stage: 1 },
    '6a.real_models': ['dino', 'selfpatch', 'con2'],
    '6a.real_grid': { side: 480, grid: 30, keys: 900, dimensions: 384, slots: 5 },
    '6a.real_drawing': { picture: 360, fiedler: 240, histogram_bins: 40, wait_ms: 250 },
    '6a.walk_ncut': { lambda2: 0.00002, score: 0.99998 },
    // lab-6b-key-bias
    'k.part3.direction': { seed: 11, dimensions: 384 },
    'k.part3.histogram': { bins: 40, bin_width: 0.05, range: [-1, 1], pairs: 2016 },
    '6b.offsets': { bias: { min: 0, max: 40, default: 0, step: 1 }, shift: { min: 0, max: 40, default: 0, step: 1 }, shift_seed: 12 },
    '6b.rules': { options: ['raw', 'bias_free', 'mean_subtract'], default: 'raw', tau: 0.2, stages: 3 },
    '6b.real_start': { model: 'selfpatch', key_rule: 'raw', bins: 40, pairs: 404550 },
    '6b.walk_key_rule': { cos_12: 0.724, cos_13: 0.979, cos_14: 0.567, cos_34: 0.385, sqrt_377: 19.416, product: 377 },
    // lab-6c-hungarian
    '6c.grid': { cells: 48, cell_px: 8, picture: 384, max_regions: 4 },
    '6c.truth': {
      box: { rows: [6, 17], cols: [5, 20] },
      ball: { centre: [15, 35], radius: 8.5 },
      boot: { leg: { rows: [26, 43], cols: [9, 14] }, foot: { rows: [38, 43], cols: [15, 26] } }
    },
    '6c.presets': {
      start: [[4, 3, 19, 22], [6, 25, 34, 44]],
      greedy: [[6, 10, 17, 35], [6, 5, 17, 9]],
      tight: [[6, 5, 17, 20], [7, 27, 23, 43], [26, 9, 43, 26]]
    },
    '6c.walk_strip': {
      iou_t0_p0: 0.4286, iou_t0_p1: 0.3333, iou_t2_p1: 0.1429, greedy_total: 0.5714, greedy_score: 0.1905,
      hungarian_total: 0.7333, hungarian_score: 0.2444, other_total: 0.5429, mbo_i: 0.3238
    },
    // lab-6d-secondaries
    '6d.presets': {
      whole: [[0, 0, 47, 47]],
      merged: [[5, 4, 24, 44], [26, 9, 43, 26]],
      split: [[6, 5, 17, 12], [6, 13, 17, 20], [7, 27, 23, 43], [26, 9, 43, 26]],
      none: []
    },
    '6d.pixels': 2304,
    '6d.walk_ari': { most: 10.5, ari: 0.1975 },
    // lab-6e-probe
    '6e.picture': { grid: 14, tokens: 196, classes: ['background', 'dog', 'cat'] },
    '6e.features': { means: [[0, 0], [2, 0.6], [0.6, 2]], noise: 0.55, edge_mix: 0.35, seeds: { train: 61, panel: 62 } },
    '6e.learning_rate': { min: 0.1, max: 2, default: 0.5, step: 0.1 },
    '6e.drawing': { scatter: 260, grid_px: 168, curve: [300, 120], plane: 3 },
    '6e.walk_probe': {
      p_background: 0.2741, p_dog: 0.4519, loss: 0.7944, gradient: -0.5481, gradient_row: [-1.0963, -0.5481],
      loss_after: 0.098, iou_background: 0.875, iou_dog: 0.3333, miou: 0.4028, miou_background_only: 0.2333,
      exp_half: 1.6487, exp_one: 2.7183, exp_sum: 6.0157, logit_change: [-0.8222, 1.6444, -0.8222],
      logits_after: [-0.3222, 2.6444, -0.3222], p_after: [0.0467, 0.9067, 0.0467]
    }
  };

  // The facts the labs write, with the fact-sheet ids (facts/course_facts.json, facts/bundle_facts.json) and sources.
  const FACTS = {
    p6_dec_tau: { value: 0.2, source: '[decoder config] configs/decoder_v2_frozen_v2.json (tau 0.2)' },
    p6_dec_eps: { value: 1e-05, source: '[decoder config] configs/decoder_v2_frozen_v2.json (eps 1e-05)' },
    p6_dec_n: { value: 5, source: '[decoder config] configs/decoder_v2_frozen_v2.json (n 5)' },
    p6_dec_overlap_iou: { value: 0.5, source: '[decoder config] configs/decoder_v2_frozen_v2.json (overlap_iou 0.5)' },
    p6_dec_min_area_ratio: { value: 0.01, source: '[decoder config] configs/decoder_v2_frozen_v2.json (min_area_ratio 0.01)' },
    p6_dec_side: { value: 480, source: '[decoder config] configs/decoder_v2_frozen_v2.json (side 480)' },
    p6_dec_key_rule: { value: 'mean_subtract', source: '[decoder config] configs/decoder_v2_frozen_v2.json (key_rule mean_subtract)' },
    token_width: { value: 384, source: '[our architecture doc §2.5]' },
    kb_bias_norm: { value: '28.25 against 0.041', source: '[our addendum 01c; our report §5.4]' },
    kb_offset_norm: { value: '32.09 against 4.320', source: '[our architecture doc §5.6; our parameter count]' },
    p5_probe_background: { value: 70.1, source: '[probe reading 2026-10-10] docs/protocols/2026-10-10-linear-probe-reading.md:31' },
    p6_probe_head: { value: 'one linear layer, 384 → 81', source: '[probe protocol 2026-10-10] docs/protocols/2026-10-10-linear-probe-protocol.md:50' }
  };

  // ------------------------------------------------------------------ characters

  const MONO = '"JetBrains Mono", ui-monospace, "Cascadia Mono", Consolas, monospace';
  const TIMES = '×';
  const MINUS = '−';
  const TAU = 'τ';
  const LAMBDA = 'λ';
  const RSQUO = '’';
  const ELLIPSIS = '…';
  const UP = '↑';
  const DOWN = '↓';
  const CAP = '∩';
  const CUP = '∪';
  const HALO = 'paint-order: stroke; stroke: var(--surface); stroke-width: 3px; stroke-linejoin: round';
  const FOLLOWED = DEFAULTS['6a.real_start'].image;

  // ------------------------------------------------------------------ small DOM helpers

  // appendAll(node, content): append strings and numbers as text, nodes as they are, arrays recursively; null and booleans are skipped.
  function appendAll(node, content) {
    if (content === null || content === undefined || content === false || content === true) return;
    if (Array.isArray(content)) { content.forEach(function (c) { appendAll(node, c); }); return; }
    if (typeof content === 'object' && typeof content.nodeType === 'number') { node.appendChild(content); return; }
    node.appendChild(root.document.createTextNode(String(content)));
  }

  // setContent(node, content): replace every child of node with content.
  function setContent(node, content) {
    while (node.firstChild) node.removeChild(node.firstChild);
    appendAll(node, content);
  }

  // mark(core, kind, where): a mark of the course: kind 'fact' or 'reading' with its source, 'real' with its data file and member, or 'toy'.
  function mark(core, kind, where) {
    const word = { fact: 'Fact', real: 'Real', toy: 'Toy', reading: 'Reading' }[kind];
    const attrs = { class: 'mark mark-' + kind };
    if (kind === 'real') attrs['data-bundle'] = where;
    else if (kind !== 'toy') attrs['data-source'] = where;
    return core.el('span', attrs, [word]);
  }

  // factMark(core, id): the Fact mark of one entry of FACTS.
  function factMark(core, id) {
    const f = FACTS[id];
    if (!f) throw new Error('labs_p6: unknown fact ' + id);
    return mark(core, 'fact', f.source);
  }

  // term(core, key, text): a glossary term, <dfn data-term="key">; its definition is in src/glossary_p6.html.
  function term(core, key, text) {
    return core.el('dfn', { 'data-term': key }, [text === undefined ? key : text]);
  }

  // slider(core, o): a labelled range control; o = {id, label, min, max, step, value, format(v), hint?, role?}. Returns {root, input, get(), set(v)}.
  function slider(core, o) {
    const input = core.el('input', { type: 'range', id: o.id, min: o.min, max: o.max, step: o.step, value: o.value });
    const output = core.el('output', { id: o.id + '-out', for: o.id, 'aria-live': 'off' }, [o.format(o.value)]);
    const kids = [core.el('label', { for: o.id }, [o.label]), output, input];
    if (o.hint) {
      kids.push(core.el('p', { class: 'control-hint', id: o.id + '-hint' }, o.hint));
      input.setAttribute('aria-describedby', o.id + '-hint');
    }
    const box = core.el('div', { class: o.role ? ['control', 'role-' + o.role] : 'control' }, kids);
    // refresh(): write the current value into the output and the accessible value text.
    function refresh() {
      const text = o.format(Number(input.value));
      output.textContent = text;
      input.setAttribute('aria-valuetext', text);
    }
    input.addEventListener('input', refresh);
    refresh();
    return {
      root: box, input: input,
      // get(): the slider's value as a number.
      get: function () { return Number(input.value); },
      // set(v): move the slider to v and refresh its readout.
      set: function (v) { input.value = String(v); refresh(); }
    };
  }

  // segmented(core, o): radios drawn as small buttons; o = {id, label, options: [[value, text]], value, hint?}. Returns {root, get(), set(v), onChange(fn)}.
  function segmented(core, o) {
    const labelId = o.id + '-label';
    const radios = o.options.map(function (opt) {
      return core.el('input', { type: 'radio', name: o.id, id: o.id + '-' + opt[0], value: String(opt[0]), checked: String(opt[0]) === String(o.value) });
    });
    const group = core.el('div', { class: 'segmented', role: 'radiogroup', 'aria-labelledby': labelId },
      o.options.map(function (opt, i) { return core.el('label', { for: radios[i].id }, [radios[i], core.el('span', null, [opt[1]])]); }));
    const kids = [core.el('span', { class: 'control-label', id: labelId }, [o.label]), group];
    if (o.hint) {
      kids.push(core.el('p', { class: 'control-hint', id: o.id + '-hint' }, o.hint));
      group.setAttribute('aria-describedby', o.id + '-hint');
    }
    return {
      root: core.el('div', { class: 'control' }, kids),
      // get(): the value of the checked radio.
      get: function () {
        for (let i = 0; i < radios.length; i++) if (radios[i].checked) return radios[i].value;
        return String(o.value);
      },
      // set(v): check the radio whose value is v.
      set: function (v) { radios.forEach(function (r) { r.checked = r.value === String(v); }); },
      // onChange(fn): call fn when the reader checks another radio.
      onChange: function (fn) { radios.forEach(function (r) { r.addEventListener('change', fn); }); }
    };
  }

  // toggle(core, o): a checkbox with its words; o = {id, label, checked, hint?}. Returns {root, input, get()}.
  function toggle(core, o) {
    const input = core.el('input', { type: 'checkbox', id: o.id, checked: !!o.checked });
    const kids = [core.el('div', { class: 'toggle-row' }, [core.el('label', { class: 'toggle', for: o.id }, [input, ' ', o.label])])];
    if (o.hint) {
      kids.push(core.el('p', { class: 'control-hint', id: o.id + '-hint' }, o.hint));
      input.setAttribute('aria-describedby', o.id + '-hint');
    }
    return { root: core.el('div', null, kids), input: input, get: function () { return input.checked; } };
  }

  // button(core, id, text, data): a plain button with an id and data attributes (data = {action: 'add'} gives data-action="add").
  function button(core, id, text, data) {
    const attrs = { type: 'button', class: 'btn', id: id };
    Object.keys(data || {}).forEach(function (k) { attrs['data-' + k] = data[k]; });
    return core.el('button', attrs, [text]);
  }

  // readout(core, id, rows): a <dl class="readout"> with one dt and dd per [key, name]; returns {root, set(key, content)}.
  function readout(core, id, rows) {
    const cells = {};
    const kids = [];
    rows.forEach(function (r) {
      kids.push(core.el('dt', null, [r[1]]));
      cells[r[0]] = core.el('dd', { id: id + '-' + r[0] });
      kids.push(cells[r[0]]);
    });
    return { root: core.el('dl', { class: 'readout', id: id }, kids), set: function (key, content) { setContent(cells[key], content); } };
  }

  // stageCell(core, label, content, width): one figure of a stage row: a mono label, then the drawing; width caps the cell.
  function stageCell(core, label, content, width) {
    return core.el('div', { class: 'stage-cell', style: width ? { maxWidth: width + 'px' } : null }, [core.el('p', { class: 'stage-label' }, label), content]);
  }

  // subhead(core, id, title, text, markNode): a full-width heading row inside a lab body.
  function subhead(core, id, title, text, markNode) {
    return core.el('div', { class: 'p6-sub', id: id }, [core.el('h4', null, [title]), core.el('p', null, [text, ' ', markNode])]);
  }

  // imageChooser(core, id, label): the shared picture chooser for a toy (sample, upload, photographs), or null without boot.js.
  function imageChooser(core, id, label) {
    let make = null;
    if (typeof core.imageChooser === 'function') make = core.imageChooser;
    else if (root.Boot && typeof root.Boot.imageChooser === 'function') make = root.Boot.imageChooser;
    return make ? make({ id: id, label: label }) : null;
  }

  // photoPicker(core, id): the picker of the eight bundle photographs, or null without boot.js.
  function photoPicker(core, id) {
    let make = null;
    if (typeof core.bundleImagePicker === 'function') make = core.bundleImagePicker;
    else if (root.Boot && typeof root.Boot.bundleImagePicker === 'function') make = root.Boot.bundleImagePicker;
    return make ? make({ id: id, label: 'Photograph' }) : null;
  }

  // chosenPhoto(): the bundle photograph the real-number labs use (the followed one until the reader picks another).
  function chosenPhoto() {
    try {
      if (root.Boot && typeof root.Boot.bundleImage === 'function') return root.Boot.bundleImage() || FOLLOWED;
    } catch (e) { /* the followed photograph */ }
    return FOLLOWED;
  }

  // later(fn, ms): run fn after ms milliseconds (a timer), so that the page can paint a status line first.
  function later(fn, ms) { return root.setTimeout(fn, ms === undefined ? 30 : ms); }

  // onFrame(fn): a function that runs fn at most once per animation frame (a short timer where frames do not run).
  function onFrame(fn) {
    let queued = false;
    // run(): call fn once for everything queued since the last call.
    function run() {
      if (!queued) return;
      queued = false;
      fn();
    }
    return function () {
      if (queued) return;
      queued = true;
      if (typeof root.requestAnimationFrame === 'function') root.requestAnimationFrame(run);
      root.setTimeout(run, 60);
    };
  }

  // ------------------------------------------------------------------ canvas and SVG helpers

  const sourceCache = typeof WeakMap === 'function' ? new WeakMap() : null;

  // imageSource(core, imageData): an offscreen canvas holding imageData, built once per ImageData, for drawImage.
  function imageSource(core, imageData) {
    if (sourceCache && sourceCache.has(imageData)) return sourceCache.get(imageData);
    const c = core.toCanvas(imageData);
    if (sourceCache) sourceCache.set(imageData, c);
    return c;
  }

  // makeCanvas(core, o): a canvas drawn at o.w x o.h CSS pixels that shrinks with its container; o = {id, w, h, label, interactive}.
  function makeCanvas(core, o) {
    const c = core.el('canvas', { id: o.id, width: o.w, height: o.h, role: o.interactive ? null : 'img', 'aria-label': o.label || '', tabindex: o.interactive ? '0' : null });
    c.style.width = o.w + 'px';
    c.style.maxWidth = '100%';
    c.style.height = 'auto';
    if (o.interactive) c.style.cursor = 'pointer';
    return c;
  }

  // cellFromEvent(core, canvas, ev, size, g): the grid cell under a pointer event on a size x size canvas showing a g x g grid.
  function cellFromEvent(core, canvas, ev, size, g) {
    const p = core.canvasPoint(canvas, ev, size, size);
    const cell = size / g;
    const r = Math.min(g - 1, Math.max(0, Math.floor(p.y / cell)));
    const c = Math.min(g - 1, Math.max(0, Math.floor(p.x / cell)));
    return r * g + c;
  }

  // haloText(ctx, T, text, x, y): ink text with a paper-coloured halo, readable on any fill.
  function haloText(ctx, T, text, x, y) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = T.paper;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = T.ink;
    ctx.fillText(text, x, y);
  }

  // centredText(ctx, T, text, x, y, px): bold mono text with a halo, centred on (x, y).
  function centredText(ctx, T, text, x, y, px) {
    ctx.font = '700 ' + px + 'px ' + MONO;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    haloText(ctx, T, text, x, y);
  }

  // gridLines(ctx, T, g, size, alpha): the lines of a g x g grid over a size x size square.
  function gridLines(ctx, T, g, size, alpha) {
    const cell = size / g;
    ctx.save();
    ctx.strokeStyle = T.line;
    ctx.globalAlpha = alpha === undefined ? 0.9 : alpha;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let k = 1; k < g; k++) {
      ctx.moveTo(Math.round(k * cell) + 0.5, 0);
      ctx.lineTo(Math.round(k * cell) + 0.5, size);
      ctx.moveTo(0, Math.round(k * cell) + 0.5);
      ctx.lineTo(size, Math.round(k * cell) + 0.5);
    }
    ctx.stroke();
    ctx.restore();
  }

  // ringCell(ctx, T, index, g, cell, colour, width): an outline drawn inside one grid cell over a paper-coloured halo.
  function ringCell(ctx, T, index, g, cell, colour, width) {
    const x = (index % g) * cell, y = Math.floor(index / g) * cell;
    const inset = width / 2 + 1;
    ctx.save();
    ctx.setLineDash([]);
    ctx.lineWidth = width + 3;
    ctx.strokeStyle = T.paper;
    ctx.strokeRect(x + inset, y + inset, Math.max(1, cell - 2 * inset), Math.max(1, cell - 2 * inset));
    ctx.lineWidth = width;
    ctx.strokeStyle = colour;
    ctx.strokeRect(x + inset, y + inset, Math.max(1, cell - 2 * inset), Math.max(1, cell - 2 * inset));
    ctx.restore();
  }

  // hatchCell(ctx, T, x, y, size): a grey wash with diagonal lines, the mark of a patch whose key was painted to zero.
  function hatchCell(ctx, T, x, y, size) {
    ctx.save();
    ctx.fillStyle = T.ignored;
    ctx.globalAlpha = 0.5;
    ctx.fillRect(x, y, size, size);
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = T.muted;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(x, y, size, size);
    ctx.clip();
    ctx.beginPath();
    for (let d = -size; d < size; d += 6) {
      ctx.moveTo(x + d, y + size);
      ctx.lineTo(x + d + size, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  // hatchRect(ctx, colour, x, y, w, h, gap, angle): thin parallel lines across a rectangle ('/' for angle 1, '\' for -1, '-' for 0).
  function hatchRect(ctx, colour, x, y, w, h, gap, angle) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.strokeStyle = colour;
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (angle === 0) {
      for (let d = y + gap / 2; d < y + h; d += gap) { ctx.moveTo(x, d); ctx.lineTo(x + w, d); }
    } else {
      const span = w + h;
      for (let d = -span; d < span; d += gap) {
        if (angle > 0) { ctx.moveTo(x + d, y + h); ctx.lineTo(x + d + h, y); } else { ctx.moveTo(x + d, y); ctx.lineTo(x + d + h, y + h); }
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  // outlineMask(ctx, mask, g, cell, colour, width, dash): the outer border of the cells set in mask.
  function outlineMask(ctx, mask, g, cell, colour, width, dash) {
    ctx.save();
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.setLineDash(dash || []);
    ctx.beginPath();
    for (let i = 0; i < g * g; i++) {
      if (!mask[i]) continue;
      const r = Math.floor(i / g), c = i % g, x = c * cell, y = r * cell;
      if (r === 0 || !mask[i - g]) { ctx.moveTo(x, y); ctx.lineTo(x + cell, y); }
      if (r === g - 1 || !mask[i + g]) { ctx.moveTo(x, y + cell); ctx.lineTo(x + cell, y + cell); }
      if (c === 0 || !mask[i - 1]) { ctx.moveTo(x, y); ctx.lineTo(x, y + cell); }
      if (c === g - 1 || !mask[i + 1]) { ctx.moveTo(x + cell, y); ctx.lineTo(x + cell, y + cell); }
    }
    ctx.stroke();
    ctx.restore();
  }

  // centroid(mask, g, cell): the centre of the cells set in mask, in drawing units, or null for an empty mask.
  function centroid(mask, g, cell) {
    let cx = 0, cy = 0, n = 0;
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i]) continue;
      cx += (i % g + 0.5) * cell;
      cy += (Math.floor(i / g) + 0.5) * cell;
      n++;
    }
    return n ? { x: cx / n, y: cy / n } : null;
  }

  // svgChart(core, id, w, h, label): an <svg class="chart"> with viewBox 0 0 w h, drawn at w x h CSS pixels at most.
  function svgChart(core, id, w, h, label) {
    return core.el('svg', { class: 'chart', id: id, viewBox: '0 0 ' + w + ' ' + h, width: w, height: h, role: 'img', 'aria-label': label });
  }

  // tx(core, x, y, text, attrs): one SVG text element at (x, y).
  function tx(core, x, y, text, attrs) {
    return core.el('text', Object.assign({ x: x.toFixed(1), y: y.toFixed(1) }, attrs || {}), [String(text)]);
  }

  // line(core, x1, y1, x2, y2, attrs): one SVG line.
  function line(core, x1, y1, x2, y2, attrs) {
    return core.el('line', Object.assign({ x1: x1.toFixed(1), y1: y1.toFixed(1), x2: x2.toFixed(1), y2: y2.toFixed(1) }, attrs || {}));
  }

  // rect(core, x, y, w, h, attrs): one SVG rectangle (negative sizes become 0).
  function rect(core, x, y, w, h, attrs) {
    return core.el('rect', Object.assign({ x: x.toFixed(1), y: y.toFixed(1), width: Math.max(0, w).toFixed(1), height: Math.max(0, h).toFixed(1) }, attrs || {}));
  }

  // circle(core, x, y, r, attrs): one SVG circle.
  function circle(core, x, y, r, attrs) {
    return core.el('circle', Object.assign({ cx: x.toFixed(1), cy: y.toFixed(1), r: r }, attrs || {}));
  }

  // points(list): an SVG points attribute from [[x, y], ...].
  function points(list) {
    return list.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ');
  }

  // withTitle(core, node, text): node with an SVG <title> child, which browsers show as a tooltip.
  function withTitle(core, node, text) {
    node.appendChild(core.el('svg:title', null, [text]));
    return node;
  }

  // histogramSvg(core, o): a histogram of cosines from -1 to 1; o = {id, counts (bins), tau, label, total}. Bars at or above tau are teacher blue (linked), the others grey.
  function histogramSvg(core, o) {
    const W = 420, H = 190, x0 = 34, x1 = 408, y0 = 18, y1 = 150;
    const bins = o.counts.length;
    const most = Math.max.apply(null, o.counts) || 1;
    // X(c): the horizontal position of cosine c.
    function X(c) { return x0 + (c + 1) / 2 * (x1 - x0); }
    const svg = svgChart(core, o.id, W, H, o.label);
    const grid = core.el('g', { class: 'grid' });
    [-1, -0.5, 0, 0.5, 1].forEach(function (c) {
      grid.appendChild(line(core, X(c), y0, X(c), y1));
      svg.appendChild(tx(core, X(c), y1 + 16, (c < 0 ? MINUS : '') + String(Math.abs(c)), { 'text-anchor': 'middle' }));
    });
    svg.appendChild(grid);
    o.counts.forEach(function (n, k) {
      if (!n) return;
      const lo = -1 + 2 * k / bins, hi = -1 + 2 * (k + 1) / bins;
      const h = Math.max(1, (y1 - y0 - 10) * n / most);
      svg.appendChild(withTitle(core, rect(core, X(lo) + 0.5, y1 - h, X(hi) - X(lo) - 1, h, { class: lo >= o.tau - 1e-9 ? 'bar role-teacher' : 'bar role-ignored' }),
        core.fmt(n, 0) + ' pairs with a cosine from ' + core.fmt(lo, 2) + ' to ' + core.fmt(hi, 2)));
    });
    svg.appendChild(core.el('g', { class: 'axis' }, [line(core, x0, y1 + 0.5, x1, y1 + 0.5)]));
    svg.appendChild(line(core, X(o.tau), y0 - 6, X(o.tau), y1, { style: 'stroke: var(--ink); stroke-width: 1.5; stroke-dasharray: 4 3' }));
    svg.appendChild(tx(core, X(o.tau) + 5, y0 + 4, TAU + ' = ' + core.fmt(o.tau, 2), { class: 'title', style: HALO }));
    svg.appendChild(tx(core, (x0 + x1) / 2, H - 4, 'cosine between two keys', { 'text-anchor': 'middle' }));
    return svg;
  }

  // ------------------------------------------------------------------ numbers

  // countSet(mask): how many entries of a 0/1 mask are set.
  function countSet(mask) {
    let n = 0;
    for (let i = 0; i < mask.length; i++) if (mask[i]) n++;
    return n;
  }

  // meanOf(values): the arithmetic mean (NaN for an empty list).
  function meanOf(values) {
    let s = 0;
    for (let i = 0; i < values.length; i++) s += values[i];
    return values.length ? s / values.length : NaN;
  }

  // largestAbs(values): the first index of the largest |value|, the patch that numpy's argmax of |v2| and the decoder pick.
  function largestAbs(values) {
    let at = 0, best = -Infinity;
    for (let i = 0; i < values.length; i++) {
      const x = Math.abs(values[i]);
      if (x > best) { best = x; at = i; }
    }
    return at;
  }

  // plural(n, one, many): n followed by the singular or the plural word.
  function plural(n, one, many) {
    return core0fmt(n) + ' ' + (n === 1 ? one : many);
  }

  // core0fmt(n): a whole number with thousands commas (Core.fmt when it is there).
  function core0fmt(n) {
    return root.Core && typeof root.Core.fmt === 'function' ? root.Core.fmt(n, 0) : String(n);
  }

  // cellName(index, g): 'row r, column c' of a flat grid index (rows and columns counted from 0).
  function cellName(index, g) {
    return 'row ' + Math.floor(index / g) + ', column ' + (index % g);
  }

  // moveOnGrid(index, g, key): the index after an arrow key (clamped to the grid), or -1 for another key.
  function moveOnGrid(index, g, key) {
    let r = Math.floor(index / g), c = index % g;
    if (key === 'ArrowLeft') c = Math.max(0, c - 1);
    else if (key === 'ArrowRight') c = Math.min(g - 1, c + 1);
    else if (key === 'ArrowUp') r = Math.max(0, r - 1);
    else if (key === 'ArrowDown') r = Math.min(g - 1, r + 1);
    else return -1;
    return r * g + c;
  }

  // histogramOf(cos, n, bins): the counts of the n(n - 1)/2 pairwise cosines i < j in bins from -1 to 1, their mean and the cosines in a list for the share above any tau.
  function histogramOf(cos, n, bins) {
    const counts = new Array(bins).fill(0);
    const values = new Float32Array(n * (n - 1) / 2);
    let sum = 0, k = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const c = cos[i * n + j];
        values[k++] = c;
        sum += c;
        counts[Math.min(bins - 1, Math.max(0, Math.floor((c + 1) / 2 * bins)))]++;
      }
    }
    return { counts: counts, mean: sum / Math.max(1, k), pairs: k, values: values };
  }

  // aboveOf(values, tau): how many values exceed tau (strictly, as the decoder's affinity).
  function aboveOf(values, tau) {
    const t = Math.fround(tau);
    let n = 0;
    for (let i = 0; i < values.length; i++) if (values[i] > t) n++;
    return n;
  }

  // ------------------------------------------------------------------ the real-data bundle, shared by labs 6A and 6B

  const keyDocs = Object.create(null);
  const photos = Object.create(null);

  // imageEntryOf(images, id): the record of one photograph in images.json, or null.
  function imageEntryOf(images, id) {
    const list = images && images.images;
    if (!Array.isArray(list)) return null;
    for (let i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  // keysNameOf(images, id, model): the bundle file of one photograph's 480 px keys under one model, without .json.
  function keysNameOf(images, id, model) {
    const e = imageEntryOf(images, id);
    const f = e && e.files && e.files.keys480 && e.files.keys480[model];
    return (f ? String(f) : id + '_' + model + '_keys480.json').replace(/\.json$/, '');
  }

  // loadKeys(core, bundles, name): a promise of the keys (Float32Array 900 x 384) of one keys480 file, from the lab's bundles or through Core.bundle.load; cached per name.
  function loadKeys(core, bundles, name) {
    if (!keyDocs[name]) {
      const pre = bundles && (bundles[name] || bundles[name + '.json']);
      const p = (pre ? Promise.resolve(pre) : core.bundle.load(name)).then(function (doc) {
        const k = doc && doc.keys;
        if (!k || !k.array || !k.shape || k.shape[0] !== 900) throw new Error(name + '.json holds no 900 x 384 keys');
        return { array: k.array, n: k.shape[0], d: k.shape[1] };
      });
      keyDocs[name] = p;
      p.then(null, function () { if (keyDocs[name] === p) delete keyDocs[name]; });
    }
    return keyDocs[name];
  }

  // loadPhoto(core, images, id): a promise of a canvas holding the photograph's 480 px view (Core.image.load), cached per id.
  function loadPhoto(core, images, id) {
    if (!photos[id]) {
      const e = imageEntryOf(images, id);
      const box = e && e.views && e.views['480'] && e.views['480'].box_native;
      const p = Promise.resolve().then(function () {
        return core.image.load(core.image.url(id), box ? { side: 480, box: box } : 480);
      }).then(function (img) { return core.toCanvas(img); });
      photos[id] = p;
      p.then(null, function () { /* drawn as unavailable */ });
    }
    return photos[id];
  }

  // ------------------------------------------------------------------ the toy keys of the first explainer's Labs J and K

  let keyCache = null;
  // keyData(core): the 64 toy keys of Labs J and K, built by Core.labKeys from the current picture at 128 px; cached per picture.
  function keyData(core) {
    const P = DEFAULTS['j.part3.picture'];
    const cur = core.currentImage(P.side);
    if (keyCache && keyCache.imageData === cur.imageData) return keyCache;
    const img = cur.imageData;
    const lk = core.labKeys(img, { patch: P.patch, featureWeight: DEFAULTS['j.part3.keys'].feature_weight });
    const norms = lk.keys.map(function (k) { return core.norm(k); });
    keyCache = { imageData: img, g: lk.g, n: lk.keys.length, keys: lk.keys, medianNorm: core.quantile(norms, 0.5) };
    return keyCache;
  }

  // paintToyMasks(ctx, T, stages, upto, strong, g, cell): the kept masks of the toy decoder's first `upto` stages in teacher blue, each with its stage number.
  function paintToyMasks(ctx, T, stages, upto, strong, g, cell) {
    for (let s = 0; s < Math.min(upto, stages.length); s++) {
      const st = stages[s];
      if (st.status !== 'ok') continue;
      const bold = strong(s);
      ctx.fillStyle = T.teacher;
      ctx.globalAlpha = bold ? 0.42 : 0.24;
      for (let i = 0; i < g * g; i++) if (st.mask[i]) ctx.fillRect((i % g) * cell, Math.floor(i / g) * cell, cell, cell);
      ctx.globalAlpha = 1;
      outlineMask(ctx, st.mask, g, cell, bold ? T.ink : T.teacher, bold ? 2.5 : 1.5, bold ? null : [5, 3]);
      const c = centroid(st.mask, g, cell);
      if (c) centredText(ctx, T, String(s + 1), c.x, c.y, 15);
    }
  }

  // toyStatusWords(rec, index): what one stage of the toy decoder did, in words.
  function toyStatusWords(rec, index) {
    if (!rec) return 'not run: the loop stopped earlier';
    if (rec.status === 'ok') return 'kept a mask of ' + plural(countSet(rec.mask), 'patch', 'patches');
    if (rec.status === 'overlap') return 'dropped: it covers much the same patches as the stage before';
    if (rec.status === 'small') return 'dropped: too small';
    if (rec.status === 'empty') return 'nothing new: its patches were masked already';
    if (rec.status === 'degenerate') {
      return index === 0 ? 'degenerate: ' + LAMBDA + '2 and ' + LAMBDA + '3 tie, so there is no mask at all'
        : 'degenerate: the loop stops and keeps the masks found so far';
    }
    return rec.status;
  }

  // realStatusWords(rec): what one stage of the frozen decoder did, in words.
  function realStatusWords(rec) {
    if (!rec) return 'not run: the loop stopped earlier';
    if (rec.reason === 'ok') return 'kept a region of ' + plural(rec.area, 'patch', 'patches');
    if (rec.reason === 'overlap') return 'dropped (overlap): IoU ' + core0fmtd(rec.iouPrevious, 3) + ' with the previous mask, above 0.5';
    if (rec.reason === 'small') return 'dropped (small): at most 1 % of the grid';
    if (rec.reason === 'empty') return 'empty: its patches belong to earlier regions';
    if (rec.reason === 'degenerate') {
      return rec.index === 0 ? 'degenerate: ' + LAMBDA + '2 and ' + LAMBDA + '3 tie, so the picture gets no region'
        : 'degenerate: the loop stops and keeps the regions found so far';
    }
    return String(rec.reason);
  }

  // core0fmtd(x, digits): a number with fixed decimals (Core.fmt when it is there).
  function core0fmtd(x, digits) {
    if (x === null || x === undefined) return 'n/a';
    return root.Core && typeof root.Core.fmt === 'function' ? root.Core.fmt(x, digits) : Number(x).toFixed(digits);
  }

  // ------------------------------------------------------------------ Lab 6A: MaskCut on real and toy keys

  const decoderLabs = typeof WeakMap === 'function' ? new WeakMap() : null;

  Labs.register('lab-6a-decoder', function mount(body, core, bundles) {
    bundles = bundles || core.bundles || {};
    const ID = 'lab-6a-decoder';
    const images = bundles.images || bundles['images.json'] || null;
    const followed = bundles.followed || bundles['followed.json'] || null;

    const modeBar = core.el('div', { class: 'p6-modebar' });
    const modeCtl = segmented(core, {
      id: ID + '-mode', label: 'Mode', value: 'real',
      options: [['real', 'Real keys at 480 pixels'], ['toy', 'Toy grid of 8 ' + TIMES + ' 8 keys']]
    });
    modeBar.appendChild(modeCtl.root);
    body.appendChild(modeBar);

    const real = buildReal();
    body.appendChild(real.controls);
    body.appendChild(real.stage);
    let toy = null;

    modeCtl.onChange(core.guard(body, function () {
      const m = modeCtl.get();
      if (m === 'toy' && !toy) {
        toy = buildToy();
        body.appendChild(toy.controls);
        body.appendChild(toy.stage);
      }
      real.controls.hidden = m !== 'real';
      real.stage.hidden = m !== 'real';
      if (toy) {
        toy.controls.hidden = m !== 'toy';
        toy.stage.hidden = m !== 'toy';
        if (m === 'toy') toy.draw();
      }
      if (m === 'real') real.draw();
    }));

    // ---- the real mode

    // buildReal(): the real mode's controls, stage and state; returns {controls, stage, draw, compare}.
    function buildReal() {
      const D = DEFAULTS['6a.real_start'];
      const R = DEFAULTS['6a.real_tau'];
      const G = DEFAULTS['6a.real_grid'];
      const DR = DEFAULTS['6a.real_drawing'];
      const state = { image: chosenPhoto(), model: D.model, rule: D.key_rule, tau: R.default, stage: D.stage, pick: null };
      let result = null, hist = null, photo = null, photoFailed = false, job = 0, wait = null, loading = '';
      const cosCache = Object.create(null);
      const histCache = Object.create(null);

      const controls = core.el('div', { class: 'lab-controls' });
      const picker = photoPicker(core, ID);
      if (picker) controls.appendChild(picker);
      const modelCtl = segmented(core, {
        id: ID + '-model', label: 'Model', value: D.model,
        options: [['dino', 'converted DINO'], ['selfpatch', 'released SelfPatch'], ['con2', 'run 2']],
        hint: ['The teacher of each model: the converted DINO (run 2' + RSQUO + 's start), the released SelfPatch checkpoint (the start of runs 1 and 3) and run 2 after its 20 epochs. ',
          mark(core, 'real', 'images.json#models')]
      });
      const ruleCtl = segmented(core, {
        id: ID + '-rule', label: 'Key rule', value: D.key_rule,
        options: [['mean_subtract', 'subtract the mean'], ['raw', 'raw keys']],
        hint: ['The frozen decoder subtracts each picture' + RSQUO + 's mean key first (6.4). ', factMark(core, 'p6_dec_key_rule')]
      });
      const tauCtl = slider(core, {
        id: ID + '-tau', label: 'Link threshold ' + TAU, min: R.min, max: R.max, step: R.step, value: R.default, role: 'teacher',
        // format(v): the value with two decimals.
        format: function (v) { return core.fmt(v, 2); },
        hint: ['Two patches are linked when the cosine of their keys is above ' + TAU + '. The frozen decoder uses 0.2. ', factMark(core, 'p6_dec_tau')]
      });
      const stageCtl = segmented(core, {
        id: ID + '-stage', label: 'Stage shown', value: String(D.stage),
        options: [['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5']],
        hint: ['The decoder runs up to 5 stages; each one paints the patches of the masks before it to zero and cuts again. ', factMark(core, 'p6_dec_n')]
      });
      const resetBtn = button(core, ID + '-reset', 'Back to the frozen settings', { action: 'reset' });
      const status = core.el('p', { class: 'p6-status', id: ID + '-status', role: 'status' });
      [modelCtl.root, ruleCtl.root, tauCtl.root, stageCtl.root, core.el('div', { class: 'button-row' }, [resetBtn]), status].forEach(function (n) { controls.appendChild(n); });

      const stage = core.el('div', { class: 'lab-stage' });
      const PIC = DR.picture, FIED = DR.fiedler, g = G.grid;
      const picCv = makeCanvas(core, { id: ID + '-photo', w: PIC, h: PIC, interactive: true });
      const fiedCv = makeCanvas(core, { id: ID + '-fiedler', w: FIED, h: FIED });
      const picNote = core.el('p', { class: 'small', id: ID + '-photo-note', style: { maxWidth: PIC + 'px' } });
      const fiedNote = core.el('p', { class: 'small', id: ID + '-fiedler-note', style: { maxWidth: FIED + 'px' } });
      const histHolder = core.el('div', { id: ID + '-histogram' });
      const histNote = core.el('p', { class: 'small', id: ID + '-histogram-note' });
      const out = readout(core, ID + '-readout', [
        ['stage', 'This stage'], ['eigen', 'Eigenvalues'], ['pairs', 'Pairs above ' + TAU], ['seed', 'Seed and flip'],
        ['area', 'Mask'], ['score', 'ncut score'], ['regions', 'Regions kept']
      ]);
      const stageList = core.el('ol', { class: 'small', id: ID + '-stages', style: { margin: '0', paddingInlineStart: '1.2rem' } });
      const compare = core.el('div', { 'data-role': 'python-compare', id: ID + '-compare' });

      stage.appendChild(core.el('div', { class: 'stage-row' }, [
        stageCell(core, ['The photograph' + RSQUO + 's 480-pixel view and the regions kept'], [picCv, core.el('ul', { class: 'legend' }, [
          core.el('li', { class: 'role-teacher' }, ['region, numbered by its stage']),
          core.el('li', { class: 'role-ignored' }, ['patch painted to zero before this stage'])
        ]), picNote], PIC + 12),
        stageCell(core, ['The Fiedler vector of this stage, minus its mean'], [fiedCv, core.el('ul', { class: 'legend' }, [
          core.el('li', null, ['towards the text colour: above the mean']),
          core.el('li', { style: { '--role': 'var(--line)' } }, ['towards the page colour: below the mean'])
        ]), fiedNote], FIED + 24)
      ]));
      stage.appendChild(core.el('div', { class: 'stage-row' }, [
        stageCell(core, ['All pairwise cosines of the keys, after the key rule'], [histHolder, histNote], 430),
        core.el('div', { class: 'stage-cell', style: { minWidth: '15rem', flex: '1 1 15rem' } }, [out.root, stageList])
      ]));
      stage.appendChild(core.el('div', { class: 'stage-row' }, [core.el('div', { class: 'stage-cell', style: { flex: '1 1 100%' } }, [
        core.el('p', { class: 'stage-label' }, ['The Python decoder' + RSQUO + 's stages beside the page' + RSQUO + 's']), compare
      ])]));

      // setStatus(text): the status line under the controls.
      function setStatus(text) { setContent(status, text); }

      // keysName(): the bundle file of the current photograph and model.
      function keysName() { return keysNameOf(images, state.image, state.model); }

      // request(now): decode the current photograph, model, key rule and tau (after a short wait unless now).
      function request(now) {
        if (wait !== null) { root.clearTimeout(wait); wait = null; }
        const go = function () { wait = null; run(); };
        if (now) go(); else wait = later(go, DR.wait_ms);
      }

      // run(): load the keys if needed, then decode in a later task, so the status line paints first.
      function run() {
        const mine = ++job;
        const name = keysName();
        loading = name;
        setStatus('Loading the real keys' + ELLIPSIS);
        loadKeys(core, bundles, name).then(function (keys) {
          if (mine !== job) return;
          setStatus('Cutting the graph of 900 keys' + ELLIPSIS);
          later(core.guard(body, function () {
            if (mine !== job) return;
            const key = name + '|' + state.rule;
            const t0 = Date.now();
            const cfg = { tau: state.tau, keyRule: state.rule };
            if (cosCache[key]) cfg.cosines = cosCache[key];
            const res = core.decoder.maskcut(keys.array, keys.n, g, cfg);
            cosCache[key] = res.cosines;
            if (!histCache[key]) histCache[key] = histogramOf(res.cosines, keys.n, DR.histogram_bins);
            result = { res: res, name: name, image: state.image, model: state.model, rule: state.rule, tau: state.tau, ms: Date.now() - t0 };
            hist = histCache[key];
            setStatus('Cut in ' + core.fmt(result.ms / 1000, 1) + ' s in your browser.');
            draw();
          }));
        }, function (err) {
          if (mine !== job) return;
          setStatus('The real keys did not load: ' + (err && err.message ? err.message : String(err)));
          result = null;
          draw();
        });
      }

      // ensurePhoto(): start loading the photograph of the current image.
      function ensurePhoto() {
        const id = state.image;
        photo = null;
        photoFailed = false;
        loadPhoto(core, images, id).then(function (cv) {
          if (state.image !== id) return;
          photo = cv;
          draw();
        }, function () {
          if (state.image !== id) return;
          photoFailed = true;
          draw();
        });
      }

      // stageRecord(): the record of the chosen stage, or null when the loop stopped before it.
      function stageRecord() {
        return result && result.res.stages[state.stage - 1] ? result.res.stages[state.stage - 1] : null;
      }

      // drawPhoto(T): the photograph, the painted patches of this stage, the regions kept, the seed and the picked patch's links.
      function drawPhoto(T) {
        const cell = PIC / g;
        const ctx = core.fitCanvas(picCv, PIC, PIC);
        ctx.fillStyle = T.paper;
        ctx.fillRect(0, 0, PIC, PIC);
        if (photo) {
          ctx.imageSmoothingEnabled = true;
          ctx.drawImage(photo, 0, 0, PIC, PIC);
        } else {
          ctx.fillStyle = core.rgba(T.ignored, 0.25);
          ctx.fillRect(0, 0, PIC, PIC);
          centredText(ctx, T, photoFailed ? 'the photograph cannot be drawn here' : 'loading the photograph' + ELLIPSIS, PIC / 2, PIC / 2, 12);
        }
        const rec = stageRecord();
        if (result && rec && rec.painted) {
          for (let i = 0; i < g * g; i++) if (rec.painted[i]) hatchCell(ctx, T, (i % g) * cell, Math.floor(i / g) * cell, cell);
        }
        if (result) {
          result.res.masks.forEach(function (m, s) {
            if (!countSet(m)) return;
            const bold = s === state.stage - 1;
            ctx.fillStyle = T.teacher;
            ctx.globalAlpha = bold ? 0.45 : 0.28;
            for (let i = 0; i < g * g; i++) if (m[i]) ctx.fillRect((i % g) * cell, Math.floor(i / g) * cell, cell, cell);
            ctx.globalAlpha = 1;
            outlineMask(ctx, m, g, cell, bold ? T.ink : T.teacher, bold ? 2.5 : 1.5, bold ? null : [5, 3]);
            const c = centroid(m, g, cell);
            if (c) centredText(ctx, T, String(s + 1), c.x, c.y, 15);
          });
          if (rec && rec.seed !== undefined && rec.seed !== null && rec.fiedler) {
            const sx = (rec.seed % g + 0.5) * cell, sy = (Math.floor(rec.seed / g) + 0.5) * cell;
            ctx.beginPath();
            ctx.arc(sx, sy, cell * 0.8, 0, 2 * Math.PI);
            ctx.lineWidth = 4;
            ctx.strokeStyle = T.paper;
            ctx.stroke();
            ctx.lineWidth = 2;
            ctx.strokeStyle = T.ink;
            ctx.stroke();
          }
          if (state.pick !== null) {
            const cos = result.res.cosines, n = g * g, t = Math.fround(state.tau);
            let links = 0;
            ctx.save();
            ctx.fillStyle = T.ink;
            for (let j = 0; j < n; j++) {
              if (j === state.pick || !(cos[state.pick * n + j] > t)) continue;
              links++;
              ctx.beginPath();
              ctx.arc((j % g + 0.5) * cell, (Math.floor(j / g) + 0.5) * cell, 1.6, 0, 2 * Math.PI);
              ctx.fill();
            }
            ctx.restore();
            ringCell(ctx, T, state.pick, g, cell, T.ink, 2.5);
            setContent(picNote, ['Patch ', cellName(state.pick, g), ' is linked to ', plural(links, 'other patch', 'other patches'),
              ' at ' + TAU + ' = ', core.fmt(state.tau, 2), ' (the dots), before any painting. Click another patch, or use the arrow keys.']);
          } else {
            setContent(picNote, 'Click a patch to see which patches its key is linked to.');
          }
        } else {
          setContent(picNote, loading ? 'The regions appear when the cut is done.' : '');
        }
        picCv.setAttribute('aria-label', 'The photograph on a 30 by 30 grid with the regions the decoder keeps. ' + picNote.textContent);
      }

      // drawFiedler(T): the Fiedler vector of the chosen stage minus its mean, in neutral shades, with the seed and the seed's component.
      function drawFiedler(T) {
        const cell = FIED / g;
        const ctx = core.fitCanvas(fiedCv, FIED, FIED);
        ctx.fillStyle = T.paper;
        ctx.fillRect(0, 0, FIED, FIED);
        const rec = stageRecord();
        if (!rec || !rec.fiedler) {
          ctx.fillStyle = core.rgba(T.ignored, 0.35);
          ctx.fillRect(0, 0, FIED, FIED);
          centredText(ctx, T, rec ? 'no usable Fiedler vector' : (result ? 'stage not run' : 'not cut yet'), FIED / 2, FIED / 2, 12);
          setContent(fiedNote, rec ? 'The spectrum of this stage is degenerate, so no split is preferred.' : 'The loop stopped before this stage.');
          fiedCv.setAttribute('aria-label', fiedNote.textContent);
          return;
        }
        const v = rec.fiedler;
        const mean = meanOf(v);
        let big = 0;
        for (let i = 0; i < v.length; i++) big = Math.max(big, Math.abs(v[i] - mean));
        big = big || 1;
        for (let i = 0; i < v.length; i++) {
          ctx.fillStyle = core.mix(T.paper, T.ink, 0.5 + 0.45 * (v[i] - mean) / big);
          ctx.fillRect((i % g) * cell, Math.floor(i / g) * cell, cell + 0.5, cell + 0.5);
        }
        if (rec.component) outlineMask(ctx, rec.component, g, cell, T.teacher, 2.5, rec.reason === 'ok' ? null : [4, 3]);
        if (rec.seed !== null && rec.seed !== undefined) ringCell(ctx, T, rec.seed, g, cell, T.ink, 2);
        // The flip rule of src/decoder_v2.py:114-119: the largest |v2| and the corners decide the side; the seed is then re-picked on the kept side.
        const top = largestAbs(v);
        const topAbove = v[top] > mean;
        let why;
        if (!rec.flipped) why = 'No swap: that patch lies above the mean and fewer than 3 corners do, so the object is the side above the mean.';
        else if (rec.fgCorners >= 3) why = 'The sides swap because ' + rec.fgCorners + ' corners lie above the mean: the object is the side below it.';
        else why = 'The sides swap because that patch lies below the mean: the object is the side below it.';
        setContent(fiedNote, [String(rec.fgCorners), ' of 4 corners lie above the mean; the largest entry, ignoring its sign, is at ', cellName(top, g),
          ', ', topAbove ? 'above' : 'below', ' the mean. ', why, ' The seed, ringed, is the largest entry of ',
          rec.flipped ? 'minus the Fiedler vector, since the sides swapped' : 'the Fiedler vector', ', at ', cellName(rec.seed, g),
          '; the blue outline is its component.']);
        fiedCv.setAttribute('aria-label', 'The Fiedler vector of stage ' + state.stage + ' on the 30 by 30 grid. ' + fiedNote.textContent);
      }

      // drawHistogram(): the histogram of the keys' pairwise cosines after the key rule, with tau.
      function drawHistogram() {
        if (!hist) {
          setContent(histHolder, '');
          setContent(histNote, '');
          return;
        }
        const above = aboveOf(hist.values, state.tau);
        setContent(histHolder, histogramSvg(core, {
          id: ID + '-histogram-chart', counts: hist.counts, tau: state.tau,
          label: 'Histogram of the ' + core.fmt(hist.pairs, 0) + ' pairwise key cosines; ' + core.fmt(above / hist.pairs, 3) + ' of them lie above ' + TAU + '.'
        }));
        setContent(histNote, ['Mean cosine ', core.fmt(hist.mean, 3), '; ', core.fmt(above, 0), ' of ', core.fmt(hist.pairs, 0), ' pairs (',
          core.fmt(100 * above / hist.pairs, 1), ' %) lie above ' + TAU + '. ', mark(core, 'real', result.name + '.json#keys')]);
      }

      // drawReadouts(): the numbers of the chosen stage and one line per stage.
      function drawReadouts() {
        const rec = stageRecord();
        if (!result) {
          ['stage', 'eigen', 'pairs', 'seed', 'area', 'score', 'regions'].forEach(function (k) { out.set(k, 'n/a'); });
          setContent(stageList, '');
          return;
        }
        const res = result.res;
        out.set('stage', 'stage ' + state.stage + ': ' + realStatusWords(rec));
        if (rec) {
          out.set('eigen', LAMBDA + '2 ' + core.fmt(rec.lambda2, 4) + ', ' + LAMBDA + '3 ' + core.fmt(rec.lambda3, 4));
          out.set('pairs', core.fmt(rec.strongPairs, 0) + ' of ' + core.fmt(900 * 899 / 2, 0) + ' (patches painted before this stage link to nothing)');
          out.set('seed', rec.fiedler ? cellName(rec.seed, g) + '; ' + (rec.flipped ? 'flipped' : 'not flipped') + ', ' + rec.fgCorners + ' of 4 corners' : 'none');
          out.set('area', rec.fiedler ? rec.componentArea + ' patches in the component; ' + rec.area + ' new' : 'none');
          out.set('score', rec.area > 0 ? core.fmt(rec.scoreNcut, 3) + ' = 1 ' + MINUS + ' ' + LAMBDA + '2' : 'none: no new patch, so no score');
        } else {
          ['eigen', 'pairs', 'seed', 'area', 'score'].forEach(function (k) { out.set(k, 'n/a'); });
        }
        out.set('regions', String(res.kept.length) + ' of 5 slots' + (res.failure ? ' (no region: ' + res.failure + ')' : ''));
        const items = [];
        for (let s = 0; s < 5; s++) {
          const st = res.stages[s] || null;
          items.push(core.el('li', null, [realStatusWords(st) + (st && st.area > 0 ? ', score ' + core.fmt(st.scoreNcut, 3) : '')]));
        }
        setContent(stageList, items);
      }

      // comparison(res, model): the page's result against the bundle's Python stages for the followed photograph (tau 0.2, mean_subtract), or null.
      function comparison(res, model) {
        const py = followed && followed.decoder && followed.decoder[model];
        if (!py || !py.ids || !py.status) return null;
        let sameIds = py.ids.length === res.ids.length;
        for (let c = 0; sameIds && c < py.ids.length; c++) if (Number(py.ids[c]) !== res.ids[c]) sameIds = false;
        const sameStatus = py.status.length === res.status.length && py.status.every(function (s, i) { return s === res.status[i]; });
        return {
          sameIds: sameIds, sameStatus: sameStatus, status: py.status.slice(), pageStatus: res.status.slice(),
          pyAreas: py.stages.map(function (st) { return st.area || 0; }), pageAreas: res.stages.map(function (st) { return st.area || 0; }),
          pyLambda2: py.stages.map(function (st) { return st.lambda2; }), pageLambda2: res.stages.map(function (st) { return st.lambda2; })
        };
      }

      // isComparable(): whether the current setting is the one the bundle's Python stages were computed for.
      function isComparable() {
        return !!result && result.image === FOLLOWED && result.rule === 'mean_subtract' && Math.abs(result.tau - 0.2) < 1e-9;
      }

      // drawCompare(): the Python decoder's stages beside the page's, or why there are none.
      function drawCompare() {
        if (!result) { setContent(compare, ''); return; }
        if (!isComparable()) {
          setContent(compare, [core.el('p', { class: 'small' }, ['The bundle holds the Python decoder' + RSQUO + 's stages for the followed photograph (the dog and the cat by the door) at ' + TAU +
            ' = 0.2 with the key rule that subtracts the mean, for each of the three models. Choose that setting to compare; here the page' + RSQUO + 's decoder gives its own answer, which nothing checks.'])]);
          return;
        }
        const cmp = comparison(result.res, result.model);
        if (!cmp) { setContent(compare, 'The Python stages are not in the bundle.'); return; }
        const same = cmp.sameIds && cmp.sameStatus;
        const rows = [core.el('tr', null, [core.el('th', null, ['stage']), core.el('th', null, ['Python']), core.el('th', null, ['this page']),
          core.el('th', null, ['area, Python']), core.el('th', null, ['area, page']), core.el('th', null, [LAMBDA + '2, Python']), core.el('th', null, [LAMBDA + '2, page'])])];
        for (let s = 0; s < 5; s++) {
          rows.push(core.el('tr', null, [
            core.el('td', null, [String(s + 1)]), core.el('td', null, [cmp.status[s] || '']), core.el('td', null, [cmp.pageStatus[s] || '']),
            core.el('td', null, [String(cmp.pyAreas[s] === undefined ? '' : cmp.pyAreas[s])]), core.el('td', null, [String(cmp.pageAreas[s] === undefined ? '' : cmp.pageAreas[s])]),
            core.el('td', null, [cmp.pyLambda2[s] === undefined ? '' : core.fmt(cmp.pyLambda2[s], 4)]), core.el('td', null, [cmp.pageLambda2[s] === undefined ? '' : core.fmt(cmp.pageLambda2[s], 4)])
          ]));
        }
        setContent(compare, [
          core.el('div', { class: 'scroll-x' }, [core.el('table', { class: 'p6-table' }, rows)]),
          core.el('p', { class: same ? 'small' : 'small p6-mismatch' }, [same ? 'The page' + RSQUO + 's decoder gives the same regions as the Python decoder on this photograph: every one of the 900 patches has the same region number, and every stage the same outcome. '
            : 'The page' + RSQUO + 's decoder differs from the Python decoder here. ', mark(core, 'real', 'followed.json#decoder')])
        ]);
      }

      // draw(): every drawing and number of the real mode.
      function draw() {
        const T = core.theme();
        drawPhoto(T);
        drawFiedler(T);
        drawHistogram();
        drawReadouts();
        drawCompare();
        if (root.Boot && typeof root.Boot.refreshTerms === 'function') root.Boot.refreshTerms();
      }

      // setImage(id): another photograph.
      function setImage(id) {
        if (!id || id === state.image) return;
        state.image = id;
        state.pick = null;
        result = null;
        hist = null;
        ensurePhoto();
        draw();
        request(true);
      }

      modelCtl.onChange(core.guard(body, function () { state.model = modelCtl.get(); state.pick = null; request(true); }));
      ruleCtl.onChange(core.guard(body, function () { state.rule = ruleCtl.get(); request(true); }));
      tauCtl.input.addEventListener('input', core.guard(body, function () { state.tau = tauCtl.get(); setStatus('Waiting for the slider to settle' + ELLIPSIS); request(false); }));
      tauCtl.input.addEventListener('change', core.guard(body, function () { state.tau = tauCtl.get(); request(true); }));
      stageCtl.onChange(core.guard(body, function () { state.stage = Number(stageCtl.get()); draw(); }));
      resetBtn.addEventListener('click', core.guard(body, function () {
        state.tau = R.default; tauCtl.set(R.default);
        state.rule = D.key_rule; ruleCtl.set(D.key_rule);
        state.stage = D.stage; stageCtl.set(String(D.stage));
        request(true);
      }));
      picCv.addEventListener('click', core.guard(body, function (ev) { state.pick = cellFromEvent(core, picCv, ev, PIC, g); draw(); }));
      picCv.addEventListener('keydown', core.guard(body, function (ev) {
        const next = moveOnGrid(state.pick === null ? (g * g - 1) >> 1 : state.pick, g, ev.key);
        if (next < 0) return;
        ev.preventDefault();
        state.pick = next;
        draw();
      }));
      core.on('theme-changed', core.guard(body, function () { if (!real.controls || !real.controls.hidden) draw(); }));
      core.on('bundle-image-changed', core.guard(body, function (e) { setImage(e && e.id ? e.id : chosenPhoto()); }));

      ensurePhoto();
      draw();
      request(true);

      return {
        controls: controls, stage: stage, draw: draw,
        // compare(model): decode the followed photograph at tau 0.2 with the frozen key rule under one model and compare it with the bundle (for tests/smoke_p6.js).
        compare: function (model) {
          const name = keysNameOf(images, FOLLOWED, model);
          return loadKeys(core, bundles, name).then(function (keys) {
            const res = core.decoder.maskcut(keys.array, keys.n, g, { tau: 0.2, keyRule: 'mean_subtract' });
            return comparison(res, model);
          });
        }
      };
    }

    // ---- the toy mode: the first explainer's Lab J, ported

    // buildToy(): the toy mode's controls and stage; returns {controls, stage, draw}.
    function buildToy() {
      const JT = DEFAULTS['j.part3.tau'];
      const JS = DEFAULTS['j.part3.stages'];
      const JD = DEFAULTS['j.part3.drawing'];
      const state = { tau: JT.default, stage: JS.default, raw: false, sorted: false, pick: null };
      let kd = null, cut = null;

      const controls = core.el('div', { class: 'lab-controls', hidden: true });
      const pick = imageChooser(core, ID + '-toy', 'Picture for the toy mode of Lab 6A');
      if (pick) controls.appendChild(pick);
      const tauCtl = slider(core, {
        id: ID + '-toy-tau', label: 'Link threshold ' + TAU, min: JT.min, max: JT.max, step: JT.step, value: JT.default, role: 'teacher',
        // format(v): the value with two decimals.
        format: function (v) { return core.fmt(v, 2); },
        hint: ['Two patches are linked when the cosine of their keys is above ' + TAU + '. Our frozen decoder uses 0.2. ', factMark(core, 'p6_dec_tau')]
      });
      const stageCtl = segmented(core, {
        id: ID + '-toy-stage', label: 'Stage', value: String(JS.default), options: [['1', '1'], ['2', '2'], ['3', '3']],
        hint: ['Each stage zeroes the keys of the patches already in a mask, then cuts again. From stage 2 a mask is dropped when its IoU with the previous one is above 0.5 or it covers at most 1 % of the grid. Our decoder allows up to 5 stages; this toy shows 3. ', factMark(core, 'p6_dec_n')]
      });
      const rawCtl = toggle(core, { id: ID + '-toy-raw', label: 'Shade the matrix by the raw cosines', checked: false });
      const sortCtl = toggle(core, {
        id: ID + '-toy-sort', label: 'List the chosen side of the cut first', checked: false,
        hint: ['Reorders the rows and columns of the matrix, so the two sides of the cut form two blocks.']
      });
      const info = core.el('p', { class: 'small' }, ['Toy keys: the picture at 128 pixels cut into 8 ' + TIMES + ' 8 patches of 16 pixels. Each key has 384 numbers: a fixed random projection of the patch' + RSQUO +
        's pixels plus a little of its colour, texture, edges and position. ', mark(core, 'toy')]);
      [tauCtl.root, stageCtl.root, rawCtl.root, sortCtl.root, info].forEach(function (n) { controls.appendChild(n); });

      const stage = core.el('div', { class: 'lab-stage', hidden: true });
      const J_PIC = JD.picture, J_VMAP = JD.v2_map, J_MAT = JD.matrix;
      const pic = makeCanvas(core, { id: ID + '-toy-picture', w: J_PIC, h: J_PIC, interactive: true });
      const vmap = makeCanvas(core, { id: ID + '-toy-v2', w: J_VMAP, h: J_VMAP });
      const mat = makeCanvas(core, { id: ID + '-toy-matrix', w: J_MAT, h: J_MAT, interactive: true });
      const hoverNote = core.el('p', { class: 'small', id: ID + '-toy-matrix-hover', style: { minHeight: '2.8em', maxWidth: '16rem' } });
      const flipLive = core.el('span', { id: ID + '-toy-flip-live' });
      const flipTail = core.el('span', null, [' The circle is the ', term(core, 'seed patch'), '; the thick blue outline is the region grown from it.']);
      const flipNote = core.el('p', { class: 'small', id: ID + '-toy-flip', style: { maxWidth: '12rem' } }, [flipLive, flipTail]);
      const picNote = core.el('p', { class: 'small', id: ID + '-toy-picture-note', style: { maxWidth: '16rem' } });
      const out = readout(core, ID + '-toy-readout', [
        ['status', 'This stage'], ['eigen', 'Eigenvalues'], ['score', 'ncut score'],
        ['density', term(core, 'graph density', 'Graph density')], ['seed', 'Seed and flip'], ['size', 'Mask']
      ]);
      const stageList = core.el('p', { class: 'small', id: ID + '-toy-stages' });

      stage.appendChild(core.el('div', { class: 'stage-row' }, [
        stageCell(core, ['Picture, the masks up to this stage, and the links of one patch'], [pic, core.el('ul', { class: 'legend' }, [
          core.el('li', { class: 'role-teacher' }, ['mask (the number is its stage)']),
          core.el('li', { class: 'role-ignored' }, ['key zeroed by an earlier stage'])
        ]), picNote], J_PIC + 12),
        stageCell(core, ['v2 minus its mean, in shades'], [vmap, core.el('ul', { class: 'legend' }, [
          core.el('li', null, ['towards the text colour: above the mean']),
          core.el('li', { style: { '--role': 'var(--line)' } }, ['towards the page colour: below the mean'])
        ]), flipNote], J_VMAP + 24)
      ]));
      stage.appendChild(core.el('div', { class: 'stage-row' }, [
        stageCell(core, ['The affinity matrix, 64 ' + TIMES + ' 64, drawn as a ', term(core, 'heat map')], [mat, core.el('ul', { class: 'legend' }, [
          core.el('li', { class: 'role-teacher' }, ['linked: cosine above ' + TAU]),
          core.el('li', { class: 'role-ignored' }, ['zeroed key'])
        ]), hoverNote], J_MAT + 12),
        core.el('div', { class: 'stage-cell', style: { minWidth: '14rem', flex: '1 1 14rem' } }, [out.root, stageList])
      ]));

      // recompute(): the toy keys of the current picture and MaskCut's three stages at the current threshold.
      function recompute() {
        kd = keyData(core);
        cut = core.maskcut(kd.keys, { tau: state.tau, n: JS.run });
      }

      // record(): the record of the chosen stage, or null when the loop stopped before it.
      function record() { return cut.stages[state.stage - 1] || null; }

      // pickIndex(rec): the patch whose links are drawn: the reader's choice, else this stage's seed, else patch 0.
      function pickIndex(rec) {
        if (state.pick !== null) return state.pick;
        return rec && rec.seed !== null ? rec.seed : 0;
      }

      // drawPicture(T, rec): the picture with the zeroed patches, the kept masks up to this stage and the picked patch's links.
      function drawPicture(T, rec) {
        const g = kd.g, cell = J_PIC / g;
        const ctx = core.fitCanvas(pic, J_PIC, J_PIC);
        ctx.fillStyle = T.paper;
        ctx.fillRect(0, 0, J_PIC, J_PIC);
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(imageSource(core, kd.imageData), 0, 0, J_PIC, J_PIC);
        if (rec) for (let i = 0; i < kd.n; i++) if (rec.painted[i]) hatchCell(ctx, T, (i % g) * cell, Math.floor(i / g) * cell, cell);
        paintToyMasks(ctx, T, cut.stages, state.stage, function (s) { return s === state.stage - 1; }, g, cell);
        gridLines(ctx, T, g, J_PIC);
        const p = pickIndex(rec);
        if (rec) {
          const px = (p % g + 0.5) * cell, py = (Math.floor(p / g) + 0.5) * cell;
          let links = 0;
          ctx.save();
          ctx.strokeStyle = T.teacher;
          ctx.fillStyle = T.teacher;
          ctx.lineWidth = 1.5;
          for (let j = 0; j < kd.n; j++) {
            if (j === p || rec.affinity[p][j] !== 1) continue;
            links++;
            const qx = (j % g + 0.5) * cell, qy = (Math.floor(j / g) + 0.5) * cell;
            ctx.globalAlpha = 0.75;
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(qx, qy);
            ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.beginPath();
            ctx.arc(qx, qy, 3, 0, 2 * Math.PI);
            ctx.fill();
          }
          ctx.restore();
          setContent(picNote, 'Patch ' + p + ' (' + cellName(p, g) + ') is linked to ' + plural(links, 'other patch', 'other patches') + ' at this ' + TAU + '. Click a patch to see its links.');
        } else {
          setContent(picNote, 'This stage did not run, so there are no links to show.');
        }
        ringCell(ctx, T, p, g, cell, T.ink, 3);
        pic.setAttribute('aria-label', 'The picture on an 8 by 8 grid with the masks up to stage ' + state.stage + '. ' + picNote.textContent);
      }

      // drawV2(T, rec): v2 minus its mean on the grid in neutral shades, the seed and the region the cut picked.
      function drawV2(T, rec) {
        const g = kd.g, cell = J_VMAP / g;
        const ctx = core.fitCanvas(vmap, J_VMAP, J_VMAP);
        ctx.fillStyle = T.paper;
        ctx.fillRect(0, 0, J_VMAP, J_VMAP);
        if (!rec || rec.status === 'degenerate') {
          ctx.fillStyle = core.rgba(T.ignored, 0.35);
          ctx.fillRect(0, 0, J_VMAP, J_VMAP);
          centredText(ctx, T, rec ? 'no usable v2' : 'not run', J_VMAP / 2, J_VMAP / 2, 12);
          setContent(flipLive, rec ? 'The spectrum is degenerate, so v2 has no preferred split.' : 'The loop stopped before this stage.');
          flipTail.hidden = true;
          vmap.setAttribute('aria-label', flipLive.textContent);
          return;
        }
        const v = rec.v2;
        const mean = meanOf(v);
        let big = 0;
        for (let i = 0; i < kd.n; i++) big = Math.max(big, Math.abs(v[i] - mean));
        big = big || 1;
        for (let i = 0; i < kd.n; i++) {
          ctx.fillStyle = core.mix(T.paper, T.ink, 0.5 + 0.45 * (v[i] - mean) / big);
          ctx.fillRect((i % g) * cell, Math.floor(i / g) * cell, cell, cell);
          if (rec.painted[i]) hatchCell(ctx, T, (i % g) * cell, Math.floor(i / g) * cell, cell);
        }
        gridLines(ctx, T, g, J_VMAP);
        if (rec.component) outlineMask(ctx, rec.component, g, cell, T.teacher, 2.5, rec.status === 'ok' ? null : [4, 3]);
        if (rec.seed !== null) {
          const sx = (rec.seed % g + 0.5) * cell, sy = (Math.floor(rec.seed / g) + 0.5) * cell;
          ctx.beginPath();
          ctx.arc(sx, sy, cell * 0.28, 0, 2 * Math.PI);
          ctx.lineWidth = 4;
          ctx.strokeStyle = T.paper;
          ctx.stroke();
          ctx.lineWidth = 2;
          ctx.strokeStyle = T.ink;
          ctx.stroke();
        }
        setContent(flipLive, 'Corners on the side above the mean: ' + rec.cornersForeground + ' of 4. ' +
          (rec.reversed ? 'The cut flips: the object is the side below the mean.' : 'No flip: the object is the side above the mean.'));
        flipTail.hidden = false;
        vmap.setAttribute('aria-label', 'v2 minus its mean on the 8 by 8 grid. ' + flipLive.textContent);
      }

      // order(rec): the patch order of the matrix: row by row, or the chosen side of the cut first.
      function order(rec) {
        const idx = [];
        for (let i = 0; i < kd.n; i++) idx.push(i);
        if (!state.sorted || !rec || !rec.foreground) return idx;
        return idx.filter(function (i) { return rec.foreground[i]; }).concat(idx.filter(function (i) { return !rec.foreground[i]; }));
      }

      // drawMatrix(T, rec): the 64 x 64 affinity (or the raw cosines) as a heat map, with the picked patch's row and column outlined.
      function drawMatrix(T, rec) {
        const n = kd.n, px = J_MAT / n;
        const ctx = core.fitCanvas(mat, J_MAT, J_MAT);
        ctx.fillStyle = T.paper;
        ctx.fillRect(0, 0, J_MAT, J_MAT);
        if (!rec) {
          centredText(ctx, T, 'stage not run', J_MAT / 2, J_MAT / 2, 12);
          mat.setAttribute('aria-label', 'Affinity matrix: this stage did not run.');
          return;
        }
        const ord = order(rec);
        for (let a = 0; a < n; a++) {
          const i = ord[a];
          for (let b = 0; b < n; b++) {
            const j = ord[b];
            let colour = null;
            if (rec.painted[i] || rec.painted[j]) colour = core.rgba(T.ignored, 0.5);
            else if (state.raw) {
              const c = rec.cosines[i][j];
              colour = c > state.tau
                ? core.rgba(T.teacher, 0.3 + 0.7 * (c - state.tau) / Math.max(1e-9, 1 - state.tau))
                : core.rgba(T.muted, 0.04 + 0.3 * (state.tau - c) / (state.tau + 1));
            } else if (rec.affinity[i][j] === 1) {
              colour = T.teacher;
            }
            if (colour) {
              ctx.fillStyle = colour;
              ctx.fillRect(b * px, a * px, px, px);
            }
          }
        }
        if (state.sorted && rec.foreground) {
          const k = countSet(rec.foreground);
          ctx.strokeStyle = T.ink;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(k * px, 0);
          ctx.lineTo(k * px, J_MAT);
          ctx.moveTo(0, k * px);
          ctx.lineTo(J_MAT, k * px);
          ctx.stroke();
        }
        const at = ord.indexOf(pickIndex(rec));
        ctx.strokeStyle = T.ink;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(0.75, at * px - 0.25, J_MAT - 1.5, px + 0.5);
        ctx.strokeRect(at * px - 0.25, 0.75, px + 0.5, J_MAT - 1.5);
        mat.setAttribute('aria-label', 'Affinity matrix of the 64 patches at stage ' + state.stage + ': ' + core.fmt(rec.density, 3) +
          ' of the entries are linked. Point at it to read one pair; click to pick a patch.');
      }

      // drawReadouts(rec): the numbers of this stage and one line for every stage.
      function drawReadouts(rec) {
        out.set('status', 'stage ' + state.stage + ': ' + toyStatusWords(rec, state.stage - 1));
        if (rec && isFinite(rec.lambda2)) {
          out.set('eigen', LAMBDA + '1 ' + core.fmt(rec.lambda1, 3) + ', ' + LAMBDA + '2 ' + core.fmt(rec.lambda2, 3) + ', ' + LAMBDA + '3 ' + core.fmt(rec.lambda3, 3));
          const score = Math.min(1, Math.max(0, 1 - rec.lambda2));
          out.set('score', '1 ' + MINUS + ' ' + LAMBDA + '2 = ' + core.fmt(score, 3) + (rec.status === 'ok' ? '' : '; no mask is kept, so it counts for nothing'));
          out.set('density', core.fmt(rec.density, 3) + ' of all 64 ' + TIMES + ' 64 entries are 1');
          out.set('seed', rec.seed === null ? 'none' : 'patch ' + rec.seed + ' (' + cellName(rec.seed, kd.g) + '); ' + (rec.reversed ? 'flipped' : 'not flipped'));
          out.set('size', rec.status === 'ok' ? countSet(rec.mask) + ' of 64 patches' : 'none kept');
        } else {
          ['eigen', 'score', 'density', 'seed', 'size'].forEach(function (k) { out.set(k, 'n/a'); });
        }
        const lines = [];
        for (let s = 0; s < JS.run; s++) {
          const st = cut.stages[s] || null;
          lines.push('Stage ' + (s + 1) + ': ' + toyStatusWords(st, s) + (st && st.status === 'ok' ? ', score ' + core.fmt(st.score, 3) : '') + '.');
          if (s < JS.run - 1) lines.push(core.el('br'));
        }
        setContent(stageList, lines);
      }

      // draw(): every drawing and number of the toy mode.
      function draw() {
        if (!kd) recompute();
        const T = core.theme();
        const rec = record();
        drawPicture(T, rec);
        drawV2(T, rec);
        drawMatrix(T, rec);
        drawReadouts(rec);
      }

      // cellAt(ev): the matrix entry under a pointer event as {i, j, rec}, or null.
      function cellAt(ev) {
        const rec = record();
        if (!rec) return null;
        const p = core.canvasPoint(mat, ev, J_MAT, J_MAT);
        const px = J_MAT / kd.n;
        const a = Math.floor(p.y / px), b = Math.floor(p.x / px);
        if (a < 0 || b < 0 || a >= kd.n || b >= kd.n) return null;
        const ord = order(rec);
        return { i: ord[a], j: ord[b], rec: rec };
      }

      const resting = 'Point at the matrix to read one pair. Click it to pick that row' + RSQUO + 's patch.';
      const update = onFrame(core.guard(body, function () { recompute(); draw(); }));
      tauCtl.input.addEventListener('input', core.guard(body, function () { state.tau = tauCtl.get(); update(); }));
      stageCtl.onChange(core.guard(body, function () { state.stage = Number(stageCtl.get()); state.pick = null; draw(); }));
      rawCtl.input.addEventListener('change', core.guard(body, function () { state.raw = rawCtl.get(); draw(); }));
      sortCtl.input.addEventListener('change', core.guard(body, function () { state.sorted = sortCtl.get(); draw(); }));
      pic.addEventListener('click', core.guard(body, function (ev) { state.pick = cellFromEvent(core, pic, ev, J_PIC, kd.g); draw(); }));
      pic.addEventListener('keydown', core.guard(body, function (ev) {
        const next = moveOnGrid(pickIndex(record()), kd.g, ev.key);
        if (next < 0) return;
        ev.preventDefault();
        state.pick = next;
        draw();
      }));
      mat.addEventListener('pointermove', core.guard(body, function (ev) {
        const c = cellAt(ev);
        if (!c) { setContent(hoverNote, resting); return; }
        setContent(hoverNote, 'Row ' + c.i + ', column ' + c.j + ': patches ' + c.i + ' and ' + c.j + ', cosine ' + core.fmt(c.rec.cosines[c.i][c.j], 3) + ', ' +
          (c.rec.affinity[c.i][c.j] === 1 ? 'linked.' : 'not linked.'));
      }));
      mat.addEventListener('pointerleave', core.guard(body, function () { setContent(hoverNote, resting); }));
      mat.addEventListener('click', core.guard(body, function (ev) {
        const c = cellAt(ev);
        if (!c) return;
        state.pick = c.i;
        draw();
      }));
      core.on('theme-changed', core.guard(body, function () { if (!controls.hidden) draw(); }));
      core.on('image-changed', core.guard(body, function () { state.pick = null; kd = null; if (!controls.hidden) draw(); }));
      setContent(hoverNote, resting);
      recompute();
      return { controls: controls, stage: stage, draw: draw };
    }

    if (decoderLabs) decoderLabs.set(body, real);
  });

  // ------------------------------------------------------------------ Lab 6B: one shared offset breaks the cut

  Labs.register('lab-6b-key-bias', function mount(body, core, bundles) {
    bundles = bundles || core.bundles || {};
    const ID = 'lab-6b-key-bias';
    const images = bundles.images || bundles['images.json'] || null;
    const OFF = DEFAULTS['6b.offsets'];
    const RU = DEFAULTS['6b.rules'];
    const HI = DEFAULTS['k.part3.histogram'];
    const PIC = DEFAULTS['j.part3.drawing'].picture;
    const state = { bias: OFF.bias.default, shift: OFF.shift.default, rule: RU.default };
    const dirBias = core.randomUnit(DEFAULTS['k.part3.direction'].dimensions, DEFAULTS['k.part3.direction'].seed);
    const dirShift = core.randomUnit(DEFAULTS['k.part3.direction'].dimensions, OFF.shift_seed);
    let kd = null, view = null;

    // ---- the toy part

    const controls = core.el('div', { class: 'lab-controls' });
    const pick = imageChooser(core, ID, 'Picture for Lab 6B');
    if (pick) controls.appendChild(pick);
    const biasCtl = slider(core, {
      id: ID + '-bias', label: 'Length of the key bias b', min: OFF.bias.min, max: OFF.bias.max, step: OFF.bias.step, value: OFF.bias.default,
      // format(v): a whole number.
      format: function (v) { return core.fmt(v, 0); },
      hint: ['One fixed vector of 384 numbers added to every key, like the last block' + RSQUO + 's key bias. ', mark(core, 'toy')]
    });
    const shiftCtl = slider(core, {
      id: ID + '-shift', label: 'Length of the LayerNorm shift part', min: OFF.shift.min, max: OFF.shift.max, step: OFF.shift.step, value: OFF.shift.default,
      // format(v): a whole number.
      format: function (v) { return core.fmt(v, 0); },
      hint: ['A second fixed vector added to every key, in another direction, like the part W', 'ₖ', '·β1 that the LayerNorm' + RSQUO + 's shift adds. ', mark(core, 'toy')]
    });
    const ruleCtl = segmented(core, {
      id: ID + '-rule', label: 'Key rule', value: RU.default,
      options: [['raw', 'raw keys'], ['bias_free', 'bias-free'], ['mean_subtract', 'subtract the mean']],
      hint: ['Bias-free keys take away b only; mean subtraction takes away whatever all the keys share. The frozen decoder subtracts the mean. ', factMark(core, 'p6_dec_key_rule')]
    });
    const fixed = core.el('p', { class: 'small' }, ['Link threshold ' + TAU + ' = 0.2, fixed, as in our decoder. ', factMark(core, 'p6_dec_tau')]);
    [biasCtl.root, shiftCtl.root, ruleCtl.root, fixed].forEach(function (n) { controls.appendChild(n); });

    const stage = core.el('div', { class: 'lab-stage' });
    const histHolder = core.el('div', { id: ID + '-histogram' });
    const pic = makeCanvas(core, { id: ID + '-picture', w: PIC, h: PIC });
    const status = core.el('p', { id: ID + '-status', role: 'status', style: { fontWeight: '600' } });
    const sketchHolder = core.el('div', { id: ID + '-sketch' });
    const sketchNote = core.el('p', { class: 'small', id: ID + '-sketch-note', style: { maxWidth: '14rem' } });
    const out = readout(core, ID + '-readout', [
      ['length', 'Typical key length'], ['offset', 'Shared part left'], ['mean', 'Mean pairwise cosine'],
      ['above', 'Pairs above ' + TAU], ['density', 'Graph density'], ['eigen', 'First cut'], ['result', 'Result']
    ]);
    stage.appendChild(core.el('div', { class: 'stage-row' }, [
      stageCell(core, ['Cosines of every pair of the 64 toy keys'], [histHolder, core.el('ul', { class: 'legend' }, [
        core.el('li', { class: 'role-teacher' }, ['above ' + TAU + ': linked']),
        core.el('li', { class: 'role-ignored' }, ['at or below ' + TAU + ': not linked'])
      ])], 430),
      stageCell(core, ['What the toy cut finds, up to 3 stages'], [pic, status], PIC + 12)
    ]));
    stage.appendChild(core.el('div', { class: 'stage-row' }, [
      stageCell(core, ['The same effect in two dimensions, as a sketch'], [sketchHolder, sketchNote], 232),
      core.el('div', { class: 'stage-cell', style: { minWidth: '14rem', flex: '1 1 14rem' } }, [out.root])
    ]));
    stage.appendChild(core.el('p', { class: 'small' }, ['Real keys: the shared part of every key is ', FACTS.kb_offset_norm.value.replace(' against ', ' long in the released SelfPatch checkpoint against '),
      ' in DINO, and the release' + RSQUO + 's key bias alone is ', FACTS.kb_bias_norm.value.replace(' against ', ' long against '), ' in DINO. ', factMark(core, 'kb_offset_norm')]));

    // ---- the real part

    const RS = DEFAULTS['6b.real_start'];
    const realState = { image: chosenPhoto(), model: RS.model, rule: RS.key_rule };
    let realView = null, realJob = 0;
    const realControls = core.el('div', { class: 'lab-controls' });
    const realPicker = photoPicker(core, ID);
    if (realPicker) realControls.appendChild(realPicker);
    const modelCtl = segmented(core, {
      id: ID + '-model', label: 'Model', value: RS.model,
      options: [['dino', 'converted DINO'], ['selfpatch', 'released SelfPatch'], ['con2', 'run 2']]
    });
    const realRuleCtl = segmented(core, {
      id: ID + '-real-rule', label: 'Key rule', value: RS.key_rule,
      options: [['raw', 'raw keys'], ['mean_subtract', 'subtract the mean']],
      hint: ['The course' + RSQUO + 's data hold the keys, not the key bias, so bias-free keys cannot be made here.']
    });
    const realStatus = core.el('p', { class: 'p6-status', id: ID + '-real-status', role: 'status' });
    [modelCtl.root, realRuleCtl.root, realStatus].forEach(function (n) { realControls.appendChild(n); });
    const realStage = core.el('div', { class: 'lab-stage' });
    const realHist = core.el('div', { id: ID + '-real-histogram' });
    const realOut = readout(core, ID + '-real-readout', [
      ['mean', 'Mean pairwise cosine'], ['above', 'Pairs above ' + TAU], ['cut', 'First cut']
    ]);
    const realNote = core.el('p', { class: 'small', id: ID + '-real-note' });
    realStage.appendChild(core.el('div', { class: 'stage-row' }, [
      stageCell(core, ['Cosines of every pair of the photograph' + RSQUO + 's 900 real keys'], [realHist], 430),
      core.el('div', { class: 'stage-cell', style: { minWidth: '14rem', flex: '1 1 14rem' } }, [realOut.root, realNote])
    ]));

    body.appendChild(controls);
    body.appendChild(stage);
    body.appendChild(subhead(core, ID + '-real-head', 'The same on real keys',
      'The histogram of a course photograph' + RSQUO + 's real keys, raw or with the mean subtracted, and what the frozen decoder' + RSQUO + 's first cut does with them.', mark(core, 'real', '000000114269_selfpatch_keys480.json#keys')));
    body.appendChild(realControls);
    body.appendChild(realStage);

    // recompute(): the toy keys plus the two shared parts, the key rule, their pairwise cosines and the toy cut.
    function recompute() {
      kd = keyData(core);
      const off = new Float64Array(dirBias.length);
      for (let t = 0; t < off.length; t++) off[t] = dirBias[t] * state.bias + dirShift[t] * state.shift;
      let keys = core.addToRows(kd.keys, off);
      if (state.rule === 'bias_free') keys = core.addToRows(keys, Array.from(dirBias, function (x) { return -x * state.bias; }));
      else if (state.rule === 'mean_subtract') keys = core.centreRows(keys);
      const cm = core.cosineMatrix(keys);
      const pairs = [];
      let sum = 0, above = 0;
      for (let i = 0; i < kd.n; i++) {
        for (let j = i + 1; j < kd.n; j++) {
          const c = cm[i][j];
          pairs.push(c);
          sum += c;
          if (c > RU.tau) above++;
        }
      }
      let left = 0;
      if (state.rule === 'raw') left = Math.hypot(state.bias, state.shift);
      else if (state.rule === 'bias_free') left = state.shift;
      view = { pairs: pairs, mean: sum / pairs.length, above: above, left: left, cut: core.maskcut(keys, { tau: RU.tau, n: RU.stages }) };
    }

    // drawHistogram(): the cosines of all toy pairs in bins from -1 to 1, coloured by the side of tau.
    function drawHistogram() {
      const counts = new Array(HI.bins).fill(0);
      view.pairs.forEach(function (c) { counts[Math.min(HI.bins - 1, Math.max(0, Math.floor((c + 1) / 2 * HI.bins)))]++; });
      setContent(histHolder, histogramSvg(core, {
        id: ID + '-histogram-chart', counts: counts, tau: RU.tau,
        label: 'Histogram of the ' + view.pairs.length + ' pairwise toy key cosines; ' + core.fmt(view.above / view.pairs.length, 3) + ' of them lie above ' + TAU + '.'
      }));
    }

    // drawPicture(T): the picture with the masks the toy decoder kept, or a grey wash when the cut is degenerate.
    function drawPicture(T) {
      const g = kd.g, cell = PIC / g;
      const ctx = core.fitCanvas(pic, PIC, PIC);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(imageSource(core, kd.imageData), 0, 0, PIC, PIC);
      if (view.cut.failure) {
        ctx.fillStyle = core.rgba(T.ignored, 0.7);
        ctx.fillRect(0, 0, PIC, PIC);
        gridLines(ctx, T, g, PIC);
        centredText(ctx, T, 'degenerate: no mask', PIC / 2, PIC / 2, 14);
      } else {
        paintToyMasks(ctx, T, view.cut.stages, RU.stages, function () { return true; }, g, cell);
        gridLines(ctx, T, g, PIC);
      }
      pic.setAttribute('aria-label', status.textContent);
    }

    // drawSketch(): six unit arrows in two dimensions plus the shared part left after the key rule, and the widest angle between two of them.
    function drawSketch() {
      const W = 220, H = 200, ox = 36, oy = 100;
      const shift = view.left / (kd.medianNorm || 1);
      const unit = Math.min(42, (W - 8 - ox) / (1 + shift));
      const arrows = [];
      for (let k = 0; k < 6; k++) {
        const ang = (15 + 60 * k) * Math.PI / 180;
        arrows.push([Math.cos(ang) + shift, Math.sin(ang)]);
      }
      let widest = 0;
      for (let a = 0; a < arrows.length; a++) {
        for (let b = a + 1; b < arrows.length; b++) {
          const u = arrows[a], v = arrows[b];
          const c = (u[0] * v[0] + u[1] * v[1]) / (Math.hypot(u[0], u[1]) * Math.hypot(v[0], v[1]));
          widest = Math.max(widest, Math.acos(Math.max(-1, Math.min(1, c))) * 180 / Math.PI);
        }
      }
      const svg = svgChart(core, ID + '-sketch-chart', W, H, 'Six arrows from one point; with the shared part added they all lean the same way. Widest angle ' + Math.round(widest) + ' degrees.');
      svg.appendChild(core.el('g', { class: 'axis' }, [line(core, 6, oy + 0.5, W - 6, oy + 0.5), line(core, ox + 0.5, 12, ox + 0.5, H - 12)]));
      if (shift > 0) {
        svg.appendChild(line(core, ox, oy, ox + shift * unit, oy, { style: 'stroke: var(--ink); stroke-width: 2; stroke-dasharray: 5 3' }));
        svg.appendChild(tx(core, ox + Math.max(24, shift * unit / 2), oy + 16, 'offset', { 'text-anchor': 'middle', class: 'title', style: HALO }));
      }
      arrows.forEach(function (p) {
        const ex = ox + p[0] * unit, ey = oy - p[1] * unit;
        const ang = Math.atan2(ey - oy, ex - ox);
        const head = [[ex, ey], [ex - 8 * Math.cos(ang - 0.4), ey - 8 * Math.sin(ang - 0.4)], [ex - 8 * Math.cos(ang + 0.4), ey - 8 * Math.sin(ang + 0.4)]];
        svg.appendChild(core.el('g', { class: 'role-teacher' }, [
          line(core, ox, oy, ex, ey, { class: 'series', style: 'stroke-width: 2' }),
          core.el('polygon', { points: points(head), class: 'dot' })
        ]));
      });
      setContent(sketchHolder, svg);
      setContent(sketchNote, ['Widest angle between two arrows: ', core.fmt(widest, 0), ' degrees. One long arrow added to all of them makes every angle small, so every cosine grows. ', mark(core, 'toy')]);
    }

    // draw(): every drawing and number of the toy part.
    function draw() {
      const T = core.theme();
      const c = view.cut;
      const first = c.stages[0];
      const kept = c.stages.filter(function (st) { return st.status === 'ok'; });
      if (c.failure) {
        setContent(status, 'Degenerate. Every pair of keys is linked, so ' + LAMBDA + '2 and ' + LAMBDA + '3 tie and the cut has no preferred split. The decoder returns no mask for this picture.');
      } else {
        const fixedBy = state.rule !== 'raw' && (state.bias > 0 || state.shift > 0) ? (state.rule === 'mean_subtract' ? 'Mean subtraction removed the shared part. ' : (state.shift > 0 ? 'Bias-free keys removed the bias; the shift is still there. ' : 'Bias-free keys removed the bias. ')) : '';
        setContent(status, fixedBy + 'The cut works: it keeps ' + plural(kept.length, 'region', 'regions') + '.');
      }
      drawHistogram();
      drawPicture(T);
      drawSketch();
      out.set('length', core.fmt(kd.medianNorm, 1) + ', the median over the 64 keys before anything is added');
      out.set('offset', core.fmt(view.left, 1) + (state.rule === 'mean_subtract' ? ': the mean is subtracted' : state.rule === 'bias_free' ? ': the bias is subtracted' : ''));
      out.set('mean', core.fmt(view.mean, 3));
      out.set('above', core.fmt(view.above / view.pairs.length, 3) + ' (' + core.fmt(view.above, 0) + ' of ' + core.fmt(view.pairs.length, 0) + ')');
      out.set('density', core.fmt(first.density, 3) + ' of all 64 ' + TIMES + ' 64 entries are 1');
      out.set('eigen', LAMBDA + '2 ' + core.fmt(first.lambda2, 3) + ', ' + LAMBDA + '3 ' + core.fmt(first.lambda3, 3) + (first.degenerate ? ': a tie' : ''));
      out.set('result', c.failure ? 'no mask: the spectrum is degenerate' : kept.map(function (st) { return countSet(st.mask); }).join(', ') + ' patches in ' + plural(kept.length, 'mask', 'masks'));
      if (root.Boot && typeof root.Boot.refreshTerms === 'function') root.Boot.refreshTerms();
    }

    // realRun(): the real keys of the photograph and model, the key rule, their cosines and the first cut (n = 1), in a later task.
    function realRun() {
      const mine = ++realJob;
      const name = keysNameOf(images, realState.image, realState.model);
      setContent(realStatus, 'Loading the real keys' + ELLIPSIS);
      loadKeys(core, bundles, name).then(function (keys) {
        if (mine !== realJob) return;
        setContent(realStatus, 'Comparing every pair of 900 keys' + ELLIPSIS);
        later(core.guard(body, function () {
          if (mine !== realJob) return;
          const features = core.decoder.keyRule(keys.array, keys.n, keys.d, realState.rule);
          const cos = core.decoder.cosines(features, keys.n, keys.d);
          const h = histogramOf(cos, keys.n, RS.bins);
          const first = core.decoder.maskcut(keys.array, keys.n, DEFAULTS['6a.real_grid'].grid, { tau: RU.tau, keyRule: realState.rule, n: 1, cosines: cos });
          realView = { name: name, hist: h, above: aboveOf(h.values, RU.tau), first: first, model: realState.model, rule: realState.rule };
          setContent(realStatus, '');
          drawReal();
        }));
      }, function (err) {
        if (mine !== realJob) return;
        setContent(realStatus, 'The real keys did not load: ' + (err && err.message ? err.message : String(err)));
      });
    }

    // drawReal(): the real histogram and the first cut.
    function drawReal() {
      if (!realView) return;
      const h = realView.hist;
      setContent(realHist, histogramSvg(core, {
        id: ID + '-real-histogram-chart', counts: h.counts, tau: RU.tau,
        label: 'Histogram of the ' + core.fmt(h.pairs, 0) + ' pairwise cosines of the real keys; ' + core.fmt(realView.above / h.pairs, 3) + ' of them lie above ' + TAU + '.'
      }));
      realOut.set('mean', core.fmt(h.mean, 3));
      realOut.set('above', core.fmt(realView.above, 0) + ' of ' + core.fmt(h.pairs, 0) + ' (' + core.fmt(100 * realView.above / h.pairs, 1) + ' %)');
      const st = realView.first.stages[0];
      if (!st) realOut.set('cut', 'n/a');
      else if (st.reason === 'degenerate') realOut.set('cut', 'degenerate: ' + LAMBDA + '2 = ' + core.fmt(st.lambda2, 4) + ' and ' + LAMBDA + '3 = ' + core.fmt(st.lambda3, 4) + ' tie, so the photograph gets no region');
      else realOut.set('cut', 'a region of ' + plural(st.area, 'patch', 'patches') + '; ' + LAMBDA + '2 = ' + core.fmt(st.lambda2, 4) + ', ' + LAMBDA + '3 = ' + core.fmt(st.lambda3, 4));
      setContent(realNote, ['Computed in your browser from the bundle' + RSQUO + 's keys of this photograph: one photograph, so its numbers need not match the ranges measured on the panel. ',
        mark(core, 'real', realView.name + '.json#keys')]);
      if (root.Boot && typeof root.Boot.refreshTerms === 'function') root.Boot.refreshTerms();
    }

    const update = onFrame(core.guard(body, function () { recompute(); draw(); }));
    biasCtl.input.addEventListener('input', core.guard(body, function () { state.bias = biasCtl.get(); update(); }));
    shiftCtl.input.addEventListener('input', core.guard(body, function () { state.shift = shiftCtl.get(); update(); }));
    ruleCtl.onChange(core.guard(body, function () { state.rule = ruleCtl.get(); recompute(); draw(); }));
    modelCtl.onChange(core.guard(body, function () { realState.model = modelCtl.get(); realRun(); }));
    realRuleCtl.onChange(core.guard(body, function () { realState.rule = realRuleCtl.get(); realRun(); }));
    core.on('theme-changed', core.guard(body, function () { draw(); drawReal(); }));
    core.on('image-changed', core.guard(body, function () { recompute(); draw(); }));
    core.on('bundle-image-changed', core.guard(body, function (e) {
      const id = e && e.id ? e.id : chosenPhoto();
      if (id === realState.image) return;
      realState.image = id;
      realRun();
    }));

    recompute();
    draw();
    realRun();
  });

  // ------------------------------------------------------------------ the shared drawing of Labs 6C and 6D

  const DG = DEFAULTS['6c.grid'];
  const DRAW = {
    regions: DEFAULTS['6c.presets'].start.map(function (r) { return r.slice(); }),
    selected: 0,
    listeners: []
  };

  // truthMasks(): the three truth objects of the drawing (A the box, B the ball, C the boot) as 0/1 masks on the 48 x 48 grid.
  const TRUTH = (function () {
    const g = DG.cells, S = DEFAULTS['6c.truth'];
    const make = function (inside) {
      const m = new Uint8Array(g * g);
      for (let r = 0; r < g; r++) for (let c = 0; c < g; c++) if (inside(r, c)) m[r * g + c] = 1;
      return m;
    };
    const within = function (box, r, c) { return r >= box.rows[0] && r <= box.rows[1] && c >= box.cols[0] && c <= box.cols[1]; };
    return [
      { name: 'A', words: 'the box', mask: make(function (r, c) { return within(S.box, r, c); }) },
      { name: 'B', words: 'the ball', mask: make(function (r, c) { const dr = r + 0.5 - S.ball.centre[0], dc = c + 0.5 - S.ball.centre[1]; return dr * dr + dc * dc <= S.ball.radius * S.ball.radius; }) },
      { name: 'C', words: 'the boot', mask: make(function (r, c) { return within(S.boot.leg, r, c) || within(S.boot.foot, r, c); }) }
    ];
  })();

  // drawingNotify(): tell every view of the drawing that it changed.
  function drawingNotify() { DRAW.listeners.forEach(function (fn) { fn(); }); }

  // setRegions(list): replace the predicted rectangles ([r0, c0, r1, c1], inclusive) and notify.
  function setRegions(list) {
    DRAW.regions = list.map(function (r) { return r.slice(); });
    DRAW.selected = Math.min(DRAW.selected, Math.max(0, DRAW.regions.length - 1));
    drawingNotify();
  }

  // drawingState(core): the drawing's masks and every score: truth, raw rectangles, the first-slot-wins id map and its regions, and the metrics of Core.metrics.
  function drawingState(core) {
    const g = DG.cells, N = g * g;
    const raw = DRAW.regions.map(function (r) {
      const m = new Uint8Array(N);
      for (let row = r[0]; row <= r[2]; row++) for (let col = r[1]; col <= r[3]; col++) m[row * g + col] = 1;
      return m;
    });
    const ids = raw.length ? core.metrics.idsFromMasks(raw) : new Int16Array(N);
    const regions = raw.map(function (m, k) {
      const e = new Uint8Array(N);
      for (let i = 0; i < N; i++) if (ids[i] === k + 1) e[i] = 1;
      return e;
    });
    const truthIds = new Int16Array(N), truthFg = new Uint8Array(N), predFg = new Uint8Array(N);
    TRUTH.forEach(function (t, k) { for (let i = 0; i < N; i++) if (t.mask[i]) { truthIds[i] = k + 1; truthFg[i] = 1; } });
    for (let i = 0; i < N; i++) if (ids[i] > 0) predFg[i] = 1;
    const count = core.metrics.regionCount(regions);
    const h = core.metrics.hungarianIoU(TRUTH.map(function (t) { return t.mask; }), regions);
    const zero = count === 0;
    // the pieces of the scores, as counts
    let inter = 0, uni = 0, fg = 0, bg = 0, fp = 0;
    for (let i = 0; i < N; i++) {
      if (truthFg[i] && predFg[i]) inter++;
      if (truthFg[i] || predFg[i]) uni++;
      if (truthFg[i]) fg++; else { bg++; if (predFg[i]) fp++; }
    }
    const mbo = TRUTH.map(function (t) {
      let best = 0;
      raw.forEach(function (m) {
        let a = 0, b = 0;
        for (let i = 0; i < N; i++) { if (t.mask[i] && m[i]) a++; if (t.mask[i] || m[i]) b++; }
        if (b && a / b > best) best = a / b;
      });
      return best;
    });
    // the contingency table of foreground ARI: truth objects as rows, predicted ids (0 = background) as columns
    const table = TRUTH.map(function () { return new Array(raw.length + 1).fill(0); });
    for (let i = 0; i < N; i++) if (truthIds[i] > 0) table[truthIds[i] - 1][ids[i]]++;
    const ari = core.metrics.fgARI(truthIds, ids, truthFg);
    return {
      g: g, N: N, raw: raw, ids: ids, regions: regions, truthIds: truthIds, truthFg: truthFg, predFg: predFg, count: count,
      hungarian: h, zero: zero, inter: inter, uni: uni, fg: fg, bg: bg, fp: fp, mbo: mbo, table: table,
      scores: {
        hungarian: zero ? 0 : h.score, mbo: zero ? 0 : meanOf(mbo), union: zero ? 0 : inter / uni, recall: zero ? 0 : inter / fg,
        ari: zero ? 0 : ari, bgfpr: zero ? 1 : fp / bg, regions: count
      }
    };
  }

  // greedyOf(matrix): the greedy matching, the largest IoU first: [{truth, pred, iou}] and the total.
  function greedyOf(matrix) {
    const T = matrix.length, P = T ? matrix[0].length : 0;
    const usedT = new Uint8Array(T), usedP = new Uint8Array(P);
    const pairs = [];
    for (;;) {
      let best = 0, bt = -1, bp = -1;
      for (let t = 0; t < T; t++) {
        if (usedT[t]) continue;
        for (let p = 0; p < P; p++) if (!usedP[p] && matrix[t][p] > best) { best = matrix[t][p]; bt = t; bp = p; }
      }
      if (bt < 0) break;
      usedT[bt] = 1;
      usedP[bp] = 1;
      pairs.push({ truth: bt, pred: bp, iou: best });
    }
    return { pairs: pairs, total: pairs.reduce(function (s, p) { return s + p.iou; }, 0) };
  }

  // assignmentsOf(matrix): every one-to-one assignment that pairs min(objects, regions) objects with distinct regions, with its total, largest first.
  function assignmentsOf(matrix) {
    const T = matrix.length, P = T ? matrix[0].length : 0, m = Math.min(T, P);
    const out = [];
    // walk(t, used, pairs, total): extend the assignment from object t on.
    function walk(t, used, pairs, total) {
      if (pairs.length === m) { out.push({ pairs: pairs.slice(), total: total }); return; }
      if (t >= T || T - t < m - pairs.length) return;
      for (let p = 0; p < P; p++) {
        if (used & (1 << p)) continue;
        pairs.push({ truth: t, pred: p });
        walk(t + 1, used | (1 << p), pairs, total + matrix[t][p]);
        pairs.pop();
      }
      walk(t + 1, used, pairs, total);
    }
    walk(0, 0, [], 0);
    out.sort(function (a, b) { return b.total - a.total; });
    return out;
  }

  // drawDrawing(core, canvas, st, o): the truth objects (hatched, ink outlines, letters) and the predicted regions (blue, numbered); o.paint paints each pixel by what it is.
  function drawDrawing(core, canvas, st, o) {
    const T = core.theme();
    const g = st.g, S = DG.picture, cell = S / g;
    const ctx = core.fitCanvas(canvas, S, S);
    ctx.fillStyle = T.paper;
    ctx.fillRect(0, 0, S, S);
    // regions: a blue wash over each pixel a region owns (first slot wins)
    for (let i = 0; i < st.N; i++) {
      if (!st.ids[i]) continue;
      const strong = o.paint ? !st.truthFg[i] : true;
      ctx.fillStyle = core.rgba(T.teacher, o.paint ? (strong ? 0.28 : 0.5) : 0.32);
      ctx.fillRect((i % g) * cell, Math.floor(i / g) * cell, cell, cell);
    }
    // truth: hatching in three directions and an ink outline
    TRUTH.forEach(function (t, k) {
      for (let i = 0; i < st.N; i++) {
        if (!t.mask[i]) continue;
        const x = (i % g) * cell, y = Math.floor(i / g) * cell;
        hatchRect(ctx, core.rgba(T.ink, o.paint && !st.predFg[i] ? 0.85 : 0.55), x, y, cell, cell, 4, k === 0 ? 1 : (k === 1 ? -1 : 0));
      }
      outlineMask(ctx, t.mask, g, cell, T.ink, 2);
    });
    // rectangles: dashed blue outlines, the selected one solid, each with its number and a corner handle
    DRAW.regions.forEach(function (r, k) {
      const x = r[1] * cell, y = r[0] * cell, w = (r[3] - r[1] + 1) * cell, h = (r[2] - r[0] + 1) * cell;
      const sel = k === DRAW.selected;
      ctx.save();
      ctx.strokeStyle = T.teacher;
      ctx.lineWidth = sel ? 2.5 : 1.5;
      ctx.setLineDash(sel ? [] : [6, 3]);
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      ctx.restore();
      ctx.fillStyle = T.teacher;
      ctx.fillRect(x + w - 9, y + h - 9, 9, 9);
      centredText(ctx, T, String(k + 1), x + 11, y + 11, 13);
    });
    TRUTH.forEach(function (t) {
      const c = centroid(t.mask, g, cell);
      if (c) centredText(ctx, T, t.name, c.x, c.y, 16);
    });
    canvas.setAttribute('aria-label', 'A 48 by 48 grid with three truth objects, A, B and C, and ' + plural(DRAW.regions.length, 'predicted region', 'predicted regions') +
      '. Drag a region to move it, or its corner to resize it; on the keyboard press a number to choose a region, the arrows to move it, Shift and the arrows to resize it.');
  }

  // attachEditing(core, body, canvas): dragging, resizing and the keyboard on a drawing canvas.
  function attachEditing(core, body, canvas) {
    const S = DG.picture, g = DG.cells, cell = S / g;
    let drag = null;
    // cellOf(ev): the grid cell [row, col] under a pointer event.
    function cellOf(ev) {
      const p = core.canvasPoint(canvas, ev, S, S);
      return [Math.min(g - 1, Math.max(0, Math.floor(p.y / cell))), Math.min(g - 1, Math.max(0, Math.floor(p.x / cell)))];
    }
    canvas.addEventListener('pointerdown', core.guard(body, function (ev) {
      const rc = cellOf(ev);
      for (let k = DRAW.regions.length - 1; k >= 0; k--) {
        const r = DRAW.regions[k];
        if (rc[0] >= r[2] - 1 && rc[0] <= r[2] && rc[1] >= r[3] - 1 && rc[1] <= r[3]) { drag = { k: k, mode: 'resize', start: rc, box: r.slice() }; break; }
        if (rc[0] >= r[0] && rc[0] <= r[2] && rc[1] >= r[1] && rc[1] <= r[3]) { drag = { k: k, mode: 'move', start: rc, box: r.slice() }; break; }
      }
      if (!drag) return;
      DRAW.selected = drag.k;
      if (typeof canvas.setPointerCapture === 'function' && ev.pointerId !== undefined) { try { canvas.setPointerCapture(ev.pointerId); } catch (e) { /* not captured */ } }
      ev.preventDefault();
      drawingNotify();
    }));
    canvas.addEventListener('pointermove', core.guard(body, function (ev) {
      if (!drag) return;
      const rc = cellOf(ev), dr = rc[0] - drag.start[0], dc = rc[1] - drag.start[1], b = drag.box;
      let next;
      if (drag.mode === 'move') {
        const h = b[2] - b[0], w = b[3] - b[1];
        const r0 = Math.min(g - 1 - h, Math.max(0, b[0] + dr)), c0 = Math.min(g - 1 - w, Math.max(0, b[1] + dc));
        next = [r0, c0, r0 + h, c0 + w];
      } else {
        next = [b[0], b[1], Math.min(g - 1, Math.max(b[0], b[2] + dr)), Math.min(g - 1, Math.max(b[1], b[3] + dc))];
      }
      if (next.join() === DRAW.regions[drag.k].join()) return;
      DRAW.regions[drag.k] = next;
      drawingNotify();
    }));
    const stop = function () { drag = null; };
    canvas.addEventListener('pointerup', stop);
    canvas.addEventListener('pointercancel', stop);
    canvas.addEventListener('keydown', core.guard(body, function (ev) {
      if (/^[1-4]$/.test(ev.key) && Number(ev.key) <= DRAW.regions.length) { DRAW.selected = Number(ev.key) - 1; drawingNotify(); ev.preventDefault(); return; }
      const r = DRAW.regions[DRAW.selected];
      if (!r) return;
      const d = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[ev.key];
      if (!d) return;
      ev.preventDefault();
      if (ev.shiftKey) {
        r[2] = Math.min(g - 1, Math.max(r[0], r[2] + d[0]));
        r[3] = Math.min(g - 1, Math.max(r[1], r[3] + d[1]));
      } else {
        const h = r[2] - r[0], w = r[3] - r[1];
        r[0] = Math.min(g - 1 - h, Math.max(0, r[0] + d[0]));
        r[1] = Math.min(g - 1 - w, Math.max(0, r[1] + d[1]));
        r[2] = r[0] + h;
        r[3] = r[1] + w;
      }
      drawingNotify();
    }));
  }

  // ------------------------------------------------------------------ Lab 6C: matching and scoring

  Labs.register('lab-6c-hungarian', function mount(body, core) {
    const ID = 'lab-6c-hungarian';
    const S = DG.picture;
    const state = { greedy: false };

    const controls = core.el('div', { class: 'lab-controls' });
    const addBtn = button(core, ID + '-add', 'Add a region', { action: 'add' });
    const removeBtn = button(core, ID + '-remove', 'Remove the chosen region', { action: 'remove' });
    const regionPick = core.el('div', { class: 'button-row', id: ID + '-pick', role: 'group', 'aria-label': 'Choose a region' });
    const presets = core.el('div', { class: 'button-row' }, [
      button(core, ID + '-start', 'Back to the start', { preset: 'start' }),
      button(core, ID + '-greedy-case', 'Greedy loses', { preset: 'greedy' }),
      button(core, ID + '-tight', 'Tight boxes', { preset: 'tight' })
    ]);
    const greedyCtl = toggle(core, { id: ID + '-show-greedy', label: 'Show the greedy matching too', checked: false });
    controls.appendChild(core.el('div', { class: 'control-group' }, [core.el('p', { class: 'control-group-title' }, ['Regions']),
      core.el('div', { class: 'button-row' }, [addBtn, removeBtn]), regionPick,
      core.el('p', { class: 'control-hint' }, ['Drag a region to move it and its blue corner to resize it. On the keyboard, focus the drawing, press 1 to 4 to choose a region, the arrows to move it and Shift with the arrows to resize it.'])]));
    controls.appendChild(core.el('div', { class: 'control-group' }, [core.el('p', { class: 'control-group-title' }, ['Ready-made drawings']), presets]));
    controls.appendChild(greedyCtl.root);

    const stage = core.el('div', { class: 'lab-stage' });
    const canvas = makeCanvas(core, { id: ID + '-drawing', w: S, h: S, interactive: true });
    canvas.classList.add('drag-surface');
    const tableHolder = core.el('div', { id: ID + '-table' });
    const out = readout(core, ID + '-readout', [['match', 'The matching'], ['score', 'Score'], ['greedy', 'Greedy'], ['ceiling', 'Best possible'], ['ways', 'Every pairing']]);
    const ways = core.el('ol', { class: 'small', id: ID + '-ways', style: { margin: '0', paddingInlineStart: '1.2rem' } });
    stage.appendChild(core.el('div', { class: 'stage-row' }, [
      stageCell(core, ['Three truth objects and the predicted regions'], [canvas, core.el('ul', { class: 'legend' }, [
        core.el('li', null, ['truth object, hatched']), core.el('li', { class: 'role-teacher' }, ['predicted region, numbered'])
      ])], S + 12),
      core.el('div', { class: 'stage-cell', style: { minWidth: '16rem', flex: '1 1 16rem' } }, [
        core.el('p', { class: 'stage-label' }, ['IoU of every object with every region']), tableHolder, out.root,
        core.el('p', { class: 'stage-label' }, ['The best pairings, largest total first']), ways
      ])
    ]));
    body.appendChild(controls);
    body.appendChild(stage);

    // pickButtons(): one button per region, the chosen one pressed.
    function pickButtons() {
      setContent(regionPick, DRAW.regions.map(function (r, k) {
        const b = core.el('button', { type: 'button', class: 'btn', 'aria-pressed': k === DRAW.selected ? 'true' : 'false', 'data-region': String(k + 1) }, ['Region ' + (k + 1)]);
        b.addEventListener('click', core.guard(body, function () { DRAW.selected = k; drawingNotify(); }));
        return b;
      }));
      addBtn.disabled = DRAW.regions.length >= DG.max_regions;
      removeBtn.disabled = DRAW.regions.length === 0;
    }

    // draw(): the drawing, the IoU table, the matching, the score and the pairings.
    function draw() {
      const st = drawingState(core);
      drawDrawing(core, canvas, st, { paint: false });
      pickButtons();
      const h = st.hungarian, M = h.matrix, P = DRAW.regions.length;
      const gr = greedyOf(M);
      const matched = {}, greedySet = {};
      h.pairs.forEach(function (p) { matched[p.truth + ':' + p.pred] = true; });
      gr.pairs.forEach(function (p) { greedySet[p.truth + ':' + p.pred] = true; });
      if (!P) {
        setContent(tableHolder, core.el('p', { class: 'small' }, ['No region: there is nothing to match, and every object counts 0.']));
      } else {
        const head = core.el('tr', null, [core.el('th', null, ['object'])].concat(DRAW.regions.map(function (r, k) { return core.el('th', null, ['region ' + (k + 1)]); })));
        const rows = TRUTH.map(function (t, i) {
          return core.el('tr', null, [core.el('th', null, [t.name + ', ' + t.words])].concat(M[i] ? Array.prototype.map.call(M[i], function (v, p) {
            let a = 0, b = 0;
            const reg = st.regions[p];
            for (let q = 0; q < st.N; q++) { if (t.mask[q] && reg[q]) a++; if (t.mask[q] || reg[q]) b++; }
            const cls = [matched[i + ':' + p] ? 'is-match' : '', state.greedy && greedySet[i + ':' + p] ? 'is-greedy' : ''].filter(Boolean).join(' ');
            return core.el('td', { class: cls || null }, [core.fmt(v, 3), core.el('small', null, [CAP + ' ' + a + ' / ' + CUP + ' ' + b])]);
          }) : []));
        });
        setContent(tableHolder, core.el('div', { class: 'scroll-x' }, [core.el('table', { class: 'p6-table' }, [head].concat(rows))]));
      }
      const parts = TRUTH.map(function (t, i) {
        const p = h.pairs.filter(function (x) { return x.truth === i; })[0];
        return p ? t.name + ' with region ' + (p.pred + 1) + ': ' + core.fmt(p.iou, 3) : t.name + ': no region, 0';
      });
      out.set('match', parts.join('; '));
      out.set('score', '(' + TRUTH.map(function (t, i) { return core.fmt(h.perTruth[i], 3); }).join(' + ') + ') / 3 = ' + core.fmt(st.scores.hungarian, 4));
      const greedyScore = gr.total / TRUTH.length;
      out.set('greedy', P ? (Math.abs(greedyScore - st.scores.hungarian) < 1e-12 ? 'the same pairs, the same score' :
        'largest first gives ' + gr.pairs.map(function (p) { return TRUTH[p.truth].name + ' with ' + (p.pred + 1); }).join(', ') + ', score ' + core.fmt(greedyScore, 4) + ': lower') : 'n/a');
      out.set('ceiling', 'with ' + plural(P, 'region', 'regions') + ' and 3 objects, perfect regions score ' + Math.min(P, 3) + '/3 = ' + core.fmt(Math.min(P, 3) / 3, 3));
      const all = P ? assignmentsOf(M) : [];
      out.set('ways', P ? core.fmt(all.length, 0) + ' one-to-one pairings of ' + Math.min(P, 3) + ' objects with distinct regions' : 'none');
      setContent(ways, all.slice(0, 5).map(function (a, n) {
        return core.el('li', null, [a.pairs.map(function (p) { return TRUTH[p.truth].name + '-' + (p.pred + 1); }).join(', ') + ': total ' + core.fmt(a.total, 3) + (n === 0 ? ' (the Hungarian matching)' : '')]);
      }));
    }

    addBtn.addEventListener('click', core.guard(body, function () {
      if (DRAW.regions.length >= DG.max_regions) return;
      DRAW.regions.push([30, 30, 41, 41]);
      DRAW.selected = DRAW.regions.length - 1;
      drawingNotify();
    }));
    removeBtn.addEventListener('click', core.guard(body, function () {
      if (!DRAW.regions.length) return;
      DRAW.regions.splice(DRAW.selected, 1);
      DRAW.selected = Math.max(0, Math.min(DRAW.selected, DRAW.regions.length - 1));
      drawingNotify();
    }));
    presets.addEventListener('click', core.guard(body, function (ev) {
      const t = ev.target && ev.target.closest ? ev.target.closest('button[data-preset]') : null;
      if (!t) return;
      setRegions(DEFAULTS['6c.presets'][t.getAttribute('data-preset')] || DEFAULTS['6c.presets'].start);
    }));
    greedyCtl.input.addEventListener('change', core.guard(body, function () { state.greedy = greedyCtl.get(); draw(); }));
    attachEditing(core, body, canvas);
    DRAW.listeners.push(core.guard(body, draw));
    core.on('theme-changed', core.guard(body, draw));
    draw();
  });

  // ------------------------------------------------------------------ Lab 6D: the other scores

  Labs.register('lab-6d-secondaries', function mount(body, core) {
    const ID = 'lab-6d-secondaries';
    const S = DG.picture;
    const state = { paint: true };

    const controls = core.el('div', { class: 'lab-controls' });
    const presets = core.el('div', { class: 'button-row' }, [
      button(core, ID + '-whole', 'One region over everything', { preset: 'whole' }),
      button(core, ID + '-merged', 'Two objects merged', { preset: 'merged' }),
      button(core, ID + '-split', 'One object split in two', { preset: 'split' }),
      button(core, ID + '-none', 'No region at all', { preset: 'none' }),
      button(core, ID + '-start', 'Back to the start', { preset: 'start' })
    ]);
    const paintCtl = toggle(core, { id: ID + '-paint', label: 'Paint what each pixel is', checked: true });
    controls.appendChild(core.el('div', { class: 'control-group' }, [core.el('p', { class: 'control-group-title' }, ['The classic failures']), presets,
      core.el('p', { class: 'control-hint' }, ['This drawing is the one of Lab 6C: an edit in either lab shows in both. Drag a region here too, or resize it from its corner.'])]));
    controls.appendChild(paintCtl.root);

    const stage = core.el('div', { class: 'lab-stage' });
    const canvas = makeCanvas(core, { id: ID + '-drawing', w: S, h: S, interactive: true });
    canvas.classList.add('drag-surface');
    const cards = core.el('div', { class: 'p6-score-grid', id: ID + '-scores' });
    const ariHolder = core.el('div', { id: ID + '-ari' });
    const zeroNote = core.el('p', { class: 'small', id: ID + '-zero' });
    stage.appendChild(core.el('div', { class: 'stage-row' }, [
      stageCell(core, ['The drawing of Lab 6C, painted by what each pixel is'], [canvas, core.el('ul', { class: 'legend' }, [
        core.el('li', { class: 'role-teacher' }, ['covered and inside an object']),
        core.el('li', { class: 'role-teacher', style: { opacity: '0.6' } }, ['covered, on the background']),
        core.el('li', null, ['inside an object, missed (hatching only)'])
      ])], S + 12)
    ]));
    stage.appendChild(cards);
    stage.appendChild(core.el('div', { class: 'stage-row' }, [core.el('div', { class: 'stage-cell', style: { flex: '1 1 100%' } }, [
      core.el('p', { class: 'stage-label' }, ['The pixels that foreground ARI counts: truth objects as rows, regions as columns, 0 the background']), ariHolder, zeroNote
    ])]));
    body.appendChild(controls);
    body.appendChild(stage);

    // card(key, name, good, value, how): one score card.
    function card(key, name, good, value, how) {
      return core.el('div', { class: 'p6-card', 'data-score': key }, [
        core.el('div', { class: 'p6-card-head' }, [core.el('span', null, [name]), core.el('span', { class: 'p6-good' }, [good])]),
        core.el('div', { class: 'p6-card-value' }, [value]),
        core.el('div', { class: 'p6-card-how' }, [how])
      ]);
    }

    // pairsWithin(list): the pairs among each count, summed (C(n, 2) for each n).
    function pairsWithin(list) { return list.reduce(function (s, n) { return s + n * (n - 1) / 2; }, 0); }

    // draw(): the painted drawing, the score cards and the table of foreground ARI.
    function draw() {
      const st = drawingState(core);
      drawDrawing(core, canvas, st, { paint: state.paint });
      const s = st.scores, z = st.zero;
      const zeroWhy = 'no region: the zero-region rule';
      setContent(cards, [
        card('hungarian', 'Hungarian matched IoU', UP + ' higher is better', core.fmt(s.hungarian, 4), z ? zeroWhy : 'the primary endpoint, from Lab 6C'),
        card('mbo', 'mBO-i', UP + ' higher is better', core.fmt(s.mbo, 4), z ? zeroWhy : 'best IoU per object: ' + st.mbo.map(function (v, i) { return TRUTH[i].name + ' ' + core.fmt(v, 3); }).join(', ')),
        card('union', 'Foreground union IoU', UP + ' higher is better', core.fmt(s.union, 4), z ? zeroWhy : CAP + ' ' + st.inter + ' / ' + CUP + ' ' + st.uni + ' pixels'),
        card('recall', 'Recall', UP + ' higher is better', core.fmt(s.recall, 4), z ? zeroWhy : st.inter + ' of the ' + st.fg + ' object pixels covered'),
        card('ari', 'Foreground ARI', UP + ' higher is better', core.fmt(s.ari, 4), z ? zeroWhy : 'over the ' + st.fg + ' object pixels; 0 is chance'),
        card('bgfpr', 'Background false positives', DOWN + ' lower is better', core.fmt(s.bgfpr, 4), z ? zeroWhy + ', the worst value' : st.fp + ' of the ' + st.bg + ' background pixels covered'),
        card('regions', 'Regions', 'a count', String(s.regions), 'regions that hold at least one pixel')
      ]);
      // the ARI table and its pieces
      const cols = st.table[0].length;
      const head = core.el('tr', null, [core.el('th', null, ['object'])].concat(Array.from({ length: cols }, function (_, j) { return core.el('th', null, [j === 0 ? '0, background' : 'region ' + j]); })));
      const rows = st.table.map(function (row, i) { return core.el('tr', null, [core.el('th', null, [TRUTH[i].name])].concat(row.map(function (v) { return core.el('td', null, [String(v)]); }))); });
      const cells = [], rowSums = [], colSums = new Array(cols).fill(0);
      st.table.forEach(function (row) { rowSums.push(row.reduce(function (a, b) { return a + b; }, 0)); row.forEach(function (v, j) { cells.push(v); colSums[j] += v; }); });
      const idx = pairsWithin(cells), rs = pairsWithin(rowSums), cs = pairsWithin(colSums), all = st.fg * (st.fg - 1) / 2;
      const expected = all ? rs * cs / all : 0, most = (rs + cs) / 2;
      setContent(ariHolder, [
        core.el('div', { class: 'scroll-x' }, [core.el('table', { class: 'p6-table' }, [head].concat(rows))]),
        core.el('p', { class: 'small p6-card-how' }, ['pairs together in both: ' + core.fmt(idx, 0) + '; within objects: ' + core.fmt(rs, 0) + '; within regions: ' + core.fmt(cs, 0) +
          '; all pairs: ' + core.fmt(all, 0) + '; expected by chance: ' + core.fmt(expected, 1) + '; most possible: ' + core.fmt(most, 1) +
          '; ARI = (' + core.fmt(idx, 0) + ' ' + MINUS + ' ' + core.fmt(expected, 1) + ') / (' + core.fmt(most, 1) + ' ' + MINUS + ' ' + core.fmt(expected, 1) + ') = ' + core.fmt(core.metrics.fgARI(st.truthIds, st.ids, st.truthFg), 4)])
      ]);
      setContent(zeroNote, z ? ['No region holds a pixel, so the evaluator' + RSQUO + 's ', term(core, 'zero-region rule'), ' gives no credit: 0 on every credit and 1 on the background false-positive rate; without it this empty prediction would score a foreground ARI of ',
        core.fmt(core.metrics.fgARI(st.truthIds, st.ids, st.truthFg), 4), ' here. ', mark(core, 'fact', '[code: evaluation/metrics_v2.py:25-31]')] : '');
      if (root.Boot && typeof root.Boot.refreshTerms === 'function') root.Boot.refreshTerms();
    }

    presets.addEventListener('click', core.guard(body, function (ev) {
      const t = ev.target && ev.target.closest ? ev.target.closest('button[data-preset]') : null;
      if (!t) return;
      const name = t.getAttribute('data-preset');
      setRegions(name === 'start' ? DEFAULTS['6c.presets'].start : DEFAULTS['6d.presets'][name]);
    }));
    paintCtl.input.addEventListener('change', core.guard(body, function () { state.paint = paintCtl.get(); draw(); }));
    attachEditing(core, body, canvas);
    DRAW.listeners.push(core.guard(body, draw));
    core.on('theme-changed', core.guard(body, draw));
    draw();
  });

  // ------------------------------------------------------------------ Lab 6E: the linear probe

  const PR = {
    picture: DEFAULTS['6e.picture'], features: DEFAULTS['6e.features'], lr: DEFAULTS['6e.learning_rate'], drawing: DEFAULTS['6e.drawing']
  };
  // start: 'zero' (W and b all zero, three equal guesses) or 'background' (the bias of background 1, so the layer always answers background).
  const PROBE = { W: [[0, 0], [0, 0], [0, 0]], b: [0, 0, 0], steps: 0, losses: [], lr: PR.lr.default, pick: null, start: 'zero' };

  // toyLabels(kind): the 14 x 14 label map of a toy picture: 'train' (a dog top left, a cat bottom right) or 'panel' (a dog bottom left, a cat top right); 0 background, 1 dog, 2 cat.
  function toyLabels(kind) {
    const g = PR.picture.grid, out = new Uint8Array(g * g);
    for (let r = 0; r < g; r++) {
      for (let c = 0; c < g; c++) {
        let v = 0;
        if (kind === 'train') {
          if ((r - 4) * (r - 4) / 10.5 + (c - 4) * (c - 4) / 9 <= 1) v = 1;
          else if (r >= 8 && r <= 12 && c >= 8 && c <= 12) v = 2;
        } else {
          if (r >= 8 && r <= 12 && c >= 1 && c <= 6) v = 1;
          else if ((r - 4) * (r - 4) + (c - 10) * (c - 10) <= 7.3) v = 2;
        }
        out[r * g + c] = v;
      }
    }
    return out;
  }

  // toyTokens(core, labels, seed): the 2-number token of every cell: its class mean plus noise, pulled part of the way towards a different neighbouring class at an object's edge.
  function toyTokens(core, labels, seed) {
    const g = PR.picture.grid, F = PR.features, r = core.rng(seed);
    const out = [];
    for (let i = 0; i < g * g; i++) {
      const m = F.means[labels[i]];
      let x = [m[0] + F.noise * r.normal(), m[1] + F.noise * r.normal()];
      const row = Math.floor(i / g), col = i % g;
      const nb = [[row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1]].filter(function (p) { return p[0] >= 0 && p[0] < g && p[1] >= 0 && p[1] < g; })
        .map(function (p) { return labels[p[0] * g + p[1]]; }).filter(function (l) { return l !== labels[i]; });
      if (nb.length) {
        const o = F.means[nb[0]];
        x = [x[0] + F.edge_mix * (o[0] - m[0]), x[1] + F.edge_mix * (o[1] - m[1])];
      }
      out.push(x);
    }
    return out;
  }

  let probeData = null;
  // probeSet(core): the two toy pictures, their tokens standardised by the training tokens' mean and standard deviation.
  function probeSet(core) {
    if (probeData) return probeData;
    const trainL = toyLabels('train'), panelL = toyLabels('panel');
    const trainX = toyTokens(core, trainL, PR.features.seeds.train), panelX = toyTokens(core, panelL, PR.features.seeds.panel);
    const mean = [0, 0], sd = [0, 0];
    trainX.forEach(function (x) { mean[0] += x[0] / trainX.length; mean[1] += x[1] / trainX.length; });
    trainX.forEach(function (x) { sd[0] += (x[0] - mean[0]) * (x[0] - mean[0]) / trainX.length; sd[1] += (x[1] - mean[1]) * (x[1] - mean[1]) / trainX.length; });
    sd[0] = Math.sqrt(sd[0]) || 1;
    sd[1] = Math.sqrt(sd[1]) || 1;
    const std = function (x) { return [(x[0] - mean[0]) / sd[0], (x[1] - mean[1]) / sd[1]]; };
    probeData = { trainL: trainL, panelL: panelL, trainX: trainX.map(std), panelX: panelX.map(std), mean: mean, sd: sd };
    return probeData;
  }

  // logitsOf(x): the probe's three logits of one token.
  function logitsOf(x) { return PROBE.W.map(function (w, c) { return w[0] * x[0] + w[1] * x[1] + PROBE.b[c]; }); }

  // softmax3(z): the probabilities of three logits.
  function softmax3(z) {
    const m = Math.max(z[0], z[1], z[2]);
    const e = z.map(function (v) { return Math.exp(v - m); });
    const s = e[0] + e[1] + e[2];
    return e.map(function (v) { return v / s; });
  }

  // argmax3(z): the index of the largest logit (the first on a tie, as the real probe's argmax).
  function argmax3(z) { let k = 0; for (let c = 1; c < 3; c++) if (z[c] > z[k]) k = c; return k; }

  // trainLoss(): the mean cross-entropy of the training tokens.
  function trainLoss(set) {
    let s = 0;
    set.trainX.forEach(function (x, i) { s -= Math.log(Math.max(1e-300, softmax3(logitsOf(x))[set.trainL[i]])); });
    return s / set.trainX.length;
  }

  // trainSteps(set, n): n steps of full-batch gradient descent on the mean cross-entropy: dL/dz = p - onehot(y), dL/dW_c = (p_c - y_c) x.
  function trainSteps(set, n) {
    for (let k = 0; k < n; k++) {
      const gW = [[0, 0], [0, 0], [0, 0]], gb = [0, 0, 0];
      const N = set.trainX.length;
      set.trainX.forEach(function (x, i) {
        const p = softmax3(logitsOf(x));
        for (let c = 0; c < 3; c++) {
          const d = (p[c] - (set.trainL[i] === c ? 1 : 0)) / N;
          gW[c][0] += d * x[0];
          gW[c][1] += d * x[1];
          gb[c] += d;
        }
      });
      for (let c = 0; c < 3; c++) {
        PROBE.W[c][0] -= PROBE.lr * gW[c][0];
        PROBE.W[c][1] -= PROBE.lr * gW[c][1];
        PROBE.b[c] -= PROBE.lr * gb[c];
      }
      PROBE.steps += 1;
      PROBE.losses.push(trainLoss(set));
    }
  }

  // panelReading(set): the confusion counts on the panel picture, the IoU of each class, mIoU, aAcc and mAcc.
  function panelReading(set) {
    const conf = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    const pred = set.panelX.map(function (x) { return argmax3(logitsOf(x)); });
    pred.forEach(function (p, i) { conf[set.panelL[i]][p]++; });
    const iou = [], acc = [];
    let present = 0, sum = 0, correct = 0, sumAcc = 0;
    for (let c = 0; c < 3; c++) {
      const tp = conf[c][c], truth = conf[c][0] + conf[c][1] + conf[c][2], predicted = conf[0][c] + conf[1][c] + conf[2][c];
      correct += tp;
      if (truth > 0) {
        present++;
        iou.push(tp / (truth + predicted - tp));
        acc.push(tp / truth);
        sum += iou[c];
        sumAcc += acc[c];
      } else { iou.push(null); acc.push(null); }
    }
    return { conf: conf, pred: pred, iou: iou, acc: acc, miou: sum / present, aacc: correct / pred.length, macc: sumAcc / present };
  }

  Labs.register('lab-6e-probe', function mount(body, core) {
    const ID = 'lab-6e-probe';
    const set = probeSet(core);
    const g = PR.picture.grid, D = PR.drawing;
    const NAMES = PR.picture.classes;
    if (!PROBE.losses.length) PROBE.losses.push(trainLoss(set));
    if (PROBE.pick === null) for (let i = 0; i < set.panelL.length; i++) if (set.panelL[i] === 1) { PROBE.pick = i; break; }

    const controls = core.el('div', { class: 'lab-controls' });
    const trainRow = core.el('div', { class: 'button-row' }, [
      button(core, ID + '-train-1', 'Train 1 step', { train: '1' }),
      button(core, ID + '-train-10', 'Train 10', { train: '10' }),
      button(core, ID + '-train-100', 'Train 100', { train: '100' })
    ]);
    const resetRow = core.el('div', { class: 'button-row' }, [
      button(core, ID + '-reset', 'Start again from zero', { action: 'reset' }),
      button(core, ID + '-background', 'Always background', { action: 'background' })
    ]);
    const lrCtl = slider(core, {
      id: ID + '-lr', label: 'Learning rate (toy)', min: PR.lr.min, max: PR.lr.max, step: PR.lr.step, value: PR.lr.default,
      // format(v): one decimal.
      format: function (v) { return core.fmt(v, 1); },
      hint: ['Each step subtracts the learning rate times the gradient of the mean cross-entropy over the 196 training tokens. The real probe uses Adam instead. ', mark(core, 'toy')]
    });
    const stepOut = core.el('p', { class: 'p6-status', id: ID + '-steps', role: 'status' });
    controls.appendChild(core.el('div', { class: 'control-group' }, [core.el('p', { class: 'control-group-title' }, ['Fit the layer']), trainRow, resetRow]));
    controls.appendChild(lrCtl.root);
    controls.appendChild(stepOut);
    controls.appendChild(core.el('p', { class: 'small' }, ['Background holds 70.1 per cent of the real probe' + RSQUO + 's training tokens; the toy pictures hold about the same share. ', mark(core, 'reading', FACTS.p5_probe_background.source)]));

    const stage = core.el('div', { class: 'lab-stage' });
    const scatter = makeCanvas(core, { id: ID + '-scatter', w: D.scatter, h: D.scatter, interactive: true });
    const truthCv = makeCanvas(core, { id: ID + '-truth', w: D.grid_px, h: D.grid_px, interactive: true });
    const predCv = makeCanvas(core, { id: ID + '-pred', w: D.grid_px, h: D.grid_px, interactive: true });
    const curve = core.el('div', { id: ID + '-curve' });
    const confHolder = core.el('div', { id: ID + '-confusion' });
    const metrics = readout(core, ID + '-metrics', [['miou', 'mIoU'], ['aacc', 'aAcc'], ['macc', 'mAcc']]);
    const tokenOut = readout(core, ID + '-token', [['token', 'Token'], ['x', 'x (standardised)'], ['z', 'Logits z = Wx + b'], ['p', 'Softmax p'], ['loss', 'Loss ' + MINUS + 'log p of its class'], ['grad', 'dL/dz = p ' + MINUS + ' y']]);
    const legend = core.el('ul', { class: 'legend' }, [
      core.el('li', { class: 'role-ignored' }, ['background: small grey dot, plain area']),
      core.el('li', null, ['dog: filled circle, light area']),
      core.el('li', null, ['cat: hollow square, darker area'])
    ]);
    stage.appendChild(core.el('div', { class: 'stage-row' }, [
      stageCell(core, ['The panel picture' + RSQUO + 's tokens and the layer' + RSQUO + 's three areas'], [scatter, legend], D.scatter + 12),
      core.el('div', { class: 'stage-cell' }, [core.el('div', { class: 'stage-row' }, [
        stageCell(core, ['True labels'], [truthCv], D.grid_px + 8), stageCell(core, ['Predicted labels, a cross on each mistake'], [predCv], D.grid_px + 8)
      ])])
    ]));
    stage.appendChild(core.el('div', { class: 'stage-row' }, [
      stageCell(core, ['Training loss, step by step'], [curve], D.curve[0] + 12),
      core.el('div', { class: 'stage-cell', style: { minWidth: '15rem', flex: '1 1 15rem' } }, [core.el('p', { class: 'stage-label' }, ['What mIoU counts on the panel picture']), confHolder, metrics.root])
    ]));
    stage.appendChild(core.el('div', { class: 'stage-row' }, [core.el('div', { class: 'stage-cell', style: { flex: '1 1 100%' } }, [
      core.el('p', { class: 'stage-label' }, ['One token of the panel picture (click a token or a cell)']), tokenOut.root
    ])]));
    body.appendChild(controls);
    body.appendChild(stage);

    const span = D.plane;
    // toPlane(x): the scatter's drawing position of a standardised token.
    function toPlane(x) { return [(x[0] + span) / (2 * span) * D.scatter, (span - x[1]) / (2 * span) * D.scatter]; }

    // drawScatter(T, reading): the three decision areas of the layer and the panel's tokens by class.
    function drawScatter(T, reading) {
      const S = D.scatter, ctx = core.fitCanvas(scatter, S, S), step = 5;
      const tints = [T.paper, core.mix(T.paper, T.ink, 0.12), core.mix(T.paper, T.ink, 0.26)];
      for (let py = 0; py < S; py += step) {
        for (let px = 0; px < S; px += step) {
          const x = [(px + step / 2) / S * 2 * span - span, span - (py + step / 2) / S * 2 * span];
          ctx.fillStyle = tints[argmax3(logitsOf(x))];
          ctx.fillRect(px, py, step, step);
        }
      }
      ctx.strokeStyle = T.line;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(S / 2 + 0.5, 0); ctx.lineTo(S / 2 + 0.5, S);
      ctx.moveTo(0, S / 2 + 0.5); ctx.lineTo(S, S / 2 + 0.5);
      ctx.stroke();
      set.panelX.forEach(function (x, i) {
        const p = toPlane(x), l = set.panelL[i];
        ctx.save();
        if (l === 0) {
          ctx.fillStyle = T.ignored;
          ctx.beginPath(); ctx.arc(p[0], p[1], 2.2, 0, 2 * Math.PI); ctx.fill();
        } else if (l === 1) {
          ctx.fillStyle = T.ink;
          ctx.strokeStyle = T.paper;
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(p[0], p[1], 4, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
        } else {
          ctx.strokeStyle = T.paper;
          ctx.lineWidth = 3;
          ctx.strokeRect(p[0] - 4, p[1] - 4, 8, 8);
          ctx.strokeStyle = T.ink;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(p[0] - 4, p[1] - 4, 8, 8);
        }
        ctx.restore();
      });
      if (PROBE.pick !== null) {
        const p = toPlane(set.panelX[PROBE.pick]);
        ctx.beginPath(); ctx.arc(p[0], p[1], 8, 0, 2 * Math.PI);
        ctx.lineWidth = 4; ctx.strokeStyle = T.paper; ctx.stroke();
        ctx.lineWidth = 2; ctx.strokeStyle = T.ink; ctx.stroke();
      }
      scatter.setAttribute('aria-label', 'The panel picture' + RSQUO + 's 196 tokens on a plane, with the areas where the layer predicts background, dog or cat. mIoU ' + core.fmt(reading.miou, 3) + '.');
    }

    // drawGrid(T, canvas, labels, marks): a 14 x 14 grid of labels: background plain, dog dark, cat hatched; marks (optional) crosses the cells where the prediction is wrong.
    function drawGrid(T, canvas, labels, wrong) {
      const S = D.grid_px, cell = S / g, ctx = core.fitCanvas(canvas, S, S);
      ctx.fillStyle = T.paper;
      ctx.fillRect(0, 0, S, S);
      for (let i = 0; i < g * g; i++) {
        const x = (i % g) * cell, y = Math.floor(i / g) * cell;
        if (labels[i] === 1) { ctx.fillStyle = core.mix(T.paper, T.ink, 0.55); ctx.fillRect(x, y, cell, cell); }
        else if (labels[i] === 2) hatchRect(ctx, T.ink, x, y, cell, cell, 4, 1);
        if (wrong && wrong[i]) {
          ctx.save();
          ctx.lineWidth = 3.5; ctx.strokeStyle = T.paper;
          ctx.beginPath(); ctx.moveTo(x + 3, y + 3); ctx.lineTo(x + cell - 3, y + cell - 3); ctx.moveTo(x + cell - 3, y + 3); ctx.lineTo(x + 3, y + cell - 3); ctx.stroke();
          ctx.lineWidth = 1.5; ctx.strokeStyle = T.ink; ctx.stroke();
          ctx.restore();
        }
      }
      gridLines(ctx, T, g, S, 0.6);
      if (PROBE.pick !== null) ringCell(ctx, T, PROBE.pick, g, cell, T.ink, 2);
    }

    // drawCurve(): the training loss over the steps so far.
    function drawCurve() {
      const W = D.curve[0], H = D.curve[1], x0 = 36, x1 = W - 8, y0 = 10, y1 = H - 24;
      const L = PROBE.losses, top = Math.max(1.2, L[0] || 1);
      const svg = svgChart(core, ID + '-curve-chart', W, H, 'Training loss over ' + PROBE.steps + ' steps, now ' + core.fmt(L[L.length - 1], 3) + '.');
      svg.appendChild(core.el('g', { class: 'axis' }, [line(core, x0, y1 + 0.5, x1, y1 + 0.5), line(core, x0 - 0.5, y0, x0 - 0.5, y1)]));
      svg.appendChild(tx(core, x0 - 4, y0 + 8, core.fmt(top, 1), { 'text-anchor': 'end' }));
      svg.appendChild(tx(core, x0 - 4, y1, '0', { 'text-anchor': 'end' }));
      svg.appendChild(tx(core, (x0 + x1) / 2, H - 6, 'steps: ' + PROBE.steps, { 'text-anchor': 'middle' }));
      if (L.length > 1) {
        const pts = L.map(function (v, k) { return [x0 + (x1 - x0) * k / (L.length - 1), y1 - (y1 - y0) * Math.min(v, top) / top]; });
        // In the ink colour: the probe is neither the student nor the teacher, so it wears no role colour.
        svg.appendChild(core.el('g', null, [core.el('polyline', { class: 'series', points: points(pts) })]));
      }
      setContent(curve, svg);
    }

    // draw(): every drawing and number of the lab.
    function draw() {
      const T = core.theme();
      const reading = panelReading(set);
      const wrong = reading.pred.map(function (p, i) { return p !== set.panelL[i]; });
      drawScatter(T, reading);
      drawGrid(T, truthCv, set.panelL, null);
      drawGrid(T, predCv, reading.pred, wrong);
      drawCurve();
      const head = core.el('tr', null, [core.el('th', null, ['true \\ predicted'])].concat(NAMES.map(function (n) { return core.el('th', null, [n]); })).concat([core.el('th', null, ['IoU'])]));
      const rows = reading.conf.map(function (row, c) {
        return core.el('tr', null, [core.el('th', null, [NAMES[c]])].concat(row.map(function (v, p) { return core.el('td', { class: p === c ? 'is-match' : null }, [String(v)]); }))
          .concat([core.el('td', null, [reading.iou[c] === null ? 'n/a' : core.fmt(reading.iou[c], 3)])]));
      });
      setContent(confHolder, core.el('div', { class: 'scroll-x' }, [core.el('table', { class: 'p6-table' }, [head].concat(rows))]));
      metrics.set('miou', core.fmt(reading.miou, 4) + ', the mean of the three IoUs');
      metrics.set('aacc', core.fmt(reading.aacc, 4) + ', the share of the 196 tokens right');
      metrics.set('macc', core.fmt(reading.macc, 4) + ', the mean of each class' + RSQUO + 's share right');
      const startLoss = core.fmt(PROBE.losses[0], 4);
      setContent(stepOut, 'Steps: ' + PROBE.steps + '. Training loss: ' + core.fmt(PROBE.losses[PROBE.losses.length - 1], 4) + '; at step 0 it was ' + startLoss +
        (PROBE.start === 'background' ? ', the loss of a layer that always answers background.' : ', which is log 3, the loss of three equal guesses.'));
      if (PROBE.pick !== null) {
        const x = set.panelX[PROBE.pick], z = logitsOf(x), p = softmax3(z), y = set.panelL[PROBE.pick];
        tokenOut.set('token', cellName(PROBE.pick, g) + ', truly ' + NAMES[y] + ', predicted ' + NAMES[argmax3(z)]);
        tokenOut.set('x', '(' + core.fmt(x[0], 3) + ', ' + core.fmt(x[1], 3) + ')');
        tokenOut.set('z', '(' + z.map(function (v) { return core.fmt(v, 3); }).join(', ') + ')');
        tokenOut.set('p', '(' + p.map(function (v) { return core.fmt(v, 3); }).join(', ') + ')');
        tokenOut.set('loss', core.fmt(-Math.log(Math.max(1e-300, p[y])), 4));
        tokenOut.set('grad', '(' + p.map(function (v, c) { return core.fmt(v - (c === y ? 1 : 0), 3); }).join(', ') + '); on the row of class c of W it is that number times x');
      }
    }

    // pickFrom(canvas, ev): choose the token under a click on one of the two grids.
    function pickFrom(canvas, ev) { PROBE.pick = cellFromEvent(core, canvas, ev, D.grid_px, g); draw(); }

    trainRow.addEventListener('click', core.guard(body, function (ev) {
      const t = ev.target && ev.target.closest ? ev.target.closest('button[data-train]') : null;
      if (!t) return;
      trainSteps(set, Number(t.getAttribute('data-train')));
      draw();
    }));
    resetRow.addEventListener('click', core.guard(body, function (ev) {
      const t = ev.target && ev.target.closest ? ev.target.closest('button[data-action]') : null;
      if (!t) return;
      PROBE.W = [[0, 0], [0, 0], [0, 0]];
      PROBE.start = t.getAttribute('data-action') === 'background' ? 'background' : 'zero';
      PROBE.b = PROBE.start === 'background' ? [1, 0, 0] : [0, 0, 0];
      PROBE.steps = 0;
      PROBE.losses = [trainLoss(set)];
      draw();
    }));
    lrCtl.input.addEventListener('input', core.guard(body, function () { PROBE.lr = lrCtl.get(); }));
    truthCv.addEventListener('click', core.guard(body, function (ev) { pickFrom(truthCv, ev); }));
    predCv.addEventListener('click', core.guard(body, function (ev) { pickFrom(predCv, ev); }));
    scatter.addEventListener('click', core.guard(body, function (ev) {
      const p = core.canvasPoint(scatter, ev, D.scatter, D.scatter);
      let best = -1, dist = Infinity;
      set.panelX.forEach(function (x, i) { const q = toPlane(x); const d = (q[0] - p.x) * (q[0] - p.x) + (q[1] - p.y) * (q[1] - p.y); if (d < dist) { dist = d; best = i; } });
      if (best >= 0) { PROBE.pick = best; draw(); }
    }));
    [truthCv, predCv].forEach(function (cv) {
      cv.addEventListener('keydown', core.guard(body, function (ev) {
        const next = moveOnGrid(PROBE.pick === null ? 0 : PROBE.pick, g, ev.key);
        if (next < 0) return;
        ev.preventDefault();
        PROBE.pick = next;
        draw();
      }));
    });
    core.on('theme-changed', core.guard(body, draw));
    draw();
  });

  // ------------------------------------------------------------------ for tests/smoke_p6.js

  root.LabsP6 = {
    facts: FACTS,
    defaults: DEFAULTS,
    decoder: {
      // compare(core, body, model): a promise of the comparison of the page's decoder with the bundle's Python stages for the lab mounted in body.
      compare: function (core, body, model) {
        const inst = decoderLabs && decoderLabs.get(body);
        if (!inst) return Promise.reject(new Error('no Lab 6A is mounted in this body'));
        return inst.compare(model);
      }
    },
    drawing: {
      // scores(): the shared drawing's scores (the Core of the page).
      scores: function () {
        const st = drawingState(root.Core);
        return Object.assign({ truthCount: TRUTH.length, regionCount: DRAW.regions.length }, st.scores);
      },
      truth: TRUTH,
      set: setRegions
    },
    probe: {
      // state(): the probe's steps, its training loss and its panel mIoU.
      state: function () {
        const set = probeData;
        return { steps: PROBE.steps, loss: PROBE.losses[PROBE.losses.length - 1], miou: set ? panelReading(set).miou : NaN };
      }
    }
  };
})(typeof window !== 'undefined' ? window : this);
