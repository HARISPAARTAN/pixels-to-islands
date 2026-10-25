/*
 * labs_p1.js: the labs of Part 1 of the course "Pixels to Islands" (p1-foundations.html, "Numbers, vectors and
 * learning from zero").
 *   lab-1a-pixels   an image is numbers: read one pixel of the sample scene, of the course's photograph or of your own
 *                   picture, follow its numbers through the normalisation, and mix a pixel of your own (ported from the
 *                   first explainer's Lab A, docs/research/explainer_2026-09-28/src/labs_part1.js, lab-a-pixels)
 *   lab-1b-cosine   two arrows you drag, and two vectors of three numbers you type: the dot product, the lengths, the
 *                   cosine and the angle, with the circle of radius 1
 *   lab-1c-descent  a line fitted to three points by gradient descent: the loss landscape, the step, the learning rate,
 *                   the path, the arithmetic of the next step, and the next steps as a film (src/scenes.js)
 *   lab-1d-softmax  three scores, a temperature, the shares, the entropy, every step of the arithmetic, the shares across
 *                   all temperatures, and the gradient for a target
 *   lab-1e-layer    a layer from three inputs to two outputs: editable weights, the products on the arrows, the bend
 *                   (none, ReLU or GELU), and a second layer that shows what the bend is for
 * Contract: the plan docs/superpowers/plans/2026-10-13-explainer-v2-build.md (decision 5 and Task 5), the spec
 * docs/superpowers/specs/2026-10-13-explainer-v2-design.md (sections 4 and 7) and README.md section 4. Vanilla ES2019,
 * no library. Nothing is fetched by this file: the course's photograph is drawn through Core.image.load from
 * data/images/; nothing is stored. Every number below is a toy, listed in DEFAULTS (repeated in src/labs_defaults.json
 * under the lab's key); the statements about the real models sit in fact spans whose sources are those of
 * facts/course_facts.json. Only src/scenes.js animates (Lab 1C's film); everything else changes when the reader acts.
 */
(function (root) {
  'use strict';

  var Labs = root.Labs;
  if (!Labs || typeof Labs.register !== 'function') {
    if (root.console && typeof root.console.error === 'function') {
      root.console.error('[labs_p1] window.Labs is missing: load core.js before labs_p1.js');
    }
    return;
  }

  // ------------------------------------------------------------------ toy defaults and fact sources

  // DEFAULTS: the toy numbers Labs 1A to 1E start from (strict JSON between the markers; src/labs_defaults.json repeats them).
  var DEFAULTS = /*defaults-json*/{
    "1a": {
      "side": 224,
      "pixel": [165, 194],
      "channel": "colour",
      "magnifier_cells": 7,
      "arrow_steps": [1, 10],
      "photo": "000000114269",
      "mix": [217, 58, 51]
    },
    "1b": {
      "a": [2, 1],
      "b": [1, 2],
      "range": 3,
      "snap": 0.1,
      "arrow_steps": [0.1, 0.5],
      "presets": {"start": [[2, 1], [1, 2]], "same": [[1, 0.5], [2, 1]], "right": [[2, 1], [-1, 2]], "opposite": [[2, 1], [-2, -1]]},
      "a3": [1, 2, 2],
      "b3": [2, 1, 2],
      "input_step": 0.5,
      "input_range": [-9, 9],
      "presets3": {"example": [[1, 2, 2], [2, 1, 2]], "right": [[1, 2, 2], [2, -2, 1]], "opposite": [[1, 2, 2], [-1, -2, -2]], "longer": [[1, 2, 2], [2, 4, 4]]}
    },
    "1c": {
      "points": [[1, 1], [2, 3], [3, 2]],
      "start": [0, 0],
      "lr": {"min": 0.01, "max": 0.25, "step": 0.01, "default": 0.1},
      "w_range": [-0.5, 1.5],
      "b_range": [-1, 2.5],
      "best": [0.5, 1],
      "best_loss": 0.5,
      "scale": 10,
      "film_steps": 8,
      "max_path": 400
    },
    "1d": {
      "z": [0.8, 0.5, 0.2],
      "z_range": [-3, 3],
      "z_step": 0.05,
      "tau": {"min": 0.04, "max": 5, "default": 1},
      "presets": {"teacher": 0.04, "student": 0.1, "rule": 0.2, "one": 1, "flat": 5},
      "target": 0,
      "sweep_samples": 160
    },
    "1e": {
      "x": [2, -1, 1],
      "W": [[1, 2, -1], [0.5, -1, 2]],
      "b": [0.5, -1],
      "bend": "gelu",
      "v": [1, 1],
      "c": -1,
      "second": false,
      "input_step": 0.5,
      "input_range": [-9, 9],
      "random_seed": 5,
      "random_range": 2
    }
  }/*end-defaults-json*/;

  // FACTS: the fact-sheet entries these labs quote, as id: [cite tag, source], copied from facts/course_facts.json.
  var FACTS = {
    "img_pixel_range": ["[torchvision docs]", ".venv-repro/Lib/site-packages/torchvision/transforms/transforms.py:112-113 (in the range [0, 255])"],
    "img_scaled_range": ["[torchvision docs]", ".venv-repro/Lib/site-packages/torchvision/transforms/transforms.py:112-113 (in the range [0.0, 1.0]); .venv-repro/Lib/site-packages/torchvision/transforms/functional.py:157 (.div(255))"],
    "imagenet_mean": ["[official code: main_selfpatch.py]", "cluster/selfpatch_official/main_selfpatch.py:497-500; research/references/repos/DINO/main_dino.py:431; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:349"],
    "imagenet_std": ["[official code: main_selfpatch.py]", "cluster/selfpatch_official/main_selfpatch.py:497-500; research/references/repos/DINO/main_dino.py:431; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:349"]
  };

  // CH: the few non-ASCII characters the widgets write as text, kept in one place (the file is UTF-8; none is an em dash).
  var CH = {
    times: '×', minus: '−', middot: '·', sqrt: '√', approx: '≈', theta: 'θ',
    tau: 'τ', eta: 'η', larr: '←', rarr: '→', deg: '°', partial: '∂', sigma: 'Σ',
    ellipsis: '…', phi: 'Φ', norm: '‖', sup2: '²', yhat: 'ŷ', rsquo: '’',
    sub: ['₀', '₁', '₂', '₃']
  };

  // ------------------------------------------------------------------ small helpers

  // clamp(x, lo, hi): x limited to the closed interval [lo, hi].
  function clamp(x, lo, hi) {
    return x < lo ? lo : (x > hi ? hi : x);
  }

  // escapeHtml(s): s with &, <, >, double and single quotes escaped, for HTML text and attribute values.
  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // fx(id, shown): the HTML of a fact span for fact-sheet entry id, showing the trusted HTML `shown`.
  function fx(id, shown) {
    var f = FACTS[id];
    if (!f) throw new Error('labs_p1: the fact "' + id + '" is not in the FACTS table');
    return '<span class="fact" data-fact="' + id + '" data-source="' + escapeHtml(f[0] + ' ' + f[1]) + '">' + shown + '</span>';
  }

  // term(key, shown): the HTML of a glossary term; `shown` (trusted HTML) defaults to the key itself.
  function term(key, shown) {
    return '<dfn data-term="' + escapeHtml(key) + '">' + (shown === undefined ? escapeHtml(key) : shown) + '</dfn>';
  }

  // raf(fn): fn on the next animation frame, or after 16 ms where frames are not available.
  var raf = typeof root.requestAnimationFrame === 'function'
    ? function (fn) { return root.requestAnimationFrame(fn); }
    : function (fn) { return root.setTimeout(fn, 16); };

  // tick(fn): fn once, on the next animation frame or after 50 ms, whichever comes first (frames pause in hidden tabs).
  function tick(fn) {
    var done = false;
    // go(): run fn the first time only.
    function go() {
      if (done) return;
      done = true;
      fn();
    }
    raf(go);
    root.setTimeout(go, 50);
  }

  // later(body, core, fn): a function that queues one guarded call of fn for the next frame; calls made before it runs merge.
  function later(body, core, fn) {
    var queued = false;
    var run = core.guard(body, function () {
      if (!queued) return;
      queued = false;
      fn();
    });
    return function () {
      if (queued) return;
      queued = true;
      tick(run);
    };
  }

  // arrowDelta(ev, steps): [dx, dy] for an arrow key (Shift takes the larger step; up is +y), or null for any other key.
  function arrowDelta(ev, steps) {
    var s = ev.shiftKey ? steps[1] : steps[0];
    if (ev.key === 'ArrowLeft') return [-s, 0];
    if (ev.key === 'ArrowRight') return [s, 0];
    if (ev.key === 'ArrowUp') return [0, s];
    if (ev.key === 'ArrowDown') return [0, -s];
    return null;
  }

  // num(core, x, digits): x with exactly `digits` decimals (default 3), commas between thousands, a true minus sign.
  function num(core, x, digits) {
    return core.fmt(x, digits === undefined ? 3 : digits);
  }

  // short(core, x, digits): x with at most `digits` decimals (default 3), trailing zeros removed, a true minus sign.
  function short(core, x, digits) {
    var s = core.fmt(x, digits === undefined ? 3 : digits);
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    if (s === CH.minus + '0') s = '0';
    return s;
  }

  // paren(core, x, digits): short(x), in brackets when it is negative, as a factor of a product is written.
  function paren(core, x, digits) {
    var s = short(core, x, digits);
    return x < 0 && s !== '0' ? '(' + s + ')' : s;
  }

  // sig(x, n): x rounded to n significant digits (0 stays 0).
  function sig(x, n) {
    if (!x) return 0;
    var p = Math.pow(10, n - 1 - Math.floor(Math.log10(Math.abs(x))));
    return Math.round(x * p) / p;
  }

  // describe(err): a short readable message for a thrown value or a rejection.
  function describe(err) {
    if (err && typeof err.message === 'string' && err.message) return err.message.replace(/\.$/, '');
    return String(err || 'an unknown error');
  }

  // cssToken(name, fallback): a custom property of the page root, trimmed; fallback when it is empty or unreadable.
  function cssToken(name, fallback) {
    try {
      var v = root.getComputedStyle(root.document.documentElement).getPropertyValue(name);
      v = String(v || '').trim();
      return v || fallback;
    } catch (e) {
      return fallback;
    }
  }

  // canvasFont(px, weight): a canvas font string in the page's mono face.
  function canvasFont(px, weight) {
    return (weight || 500) + ' ' + px + 'px ' + cssToken('--font-mono', 'ui-monospace, Menlo, Consolas, monospace');
  }

  // relativeLuminance(r, g, b): the relative luminance of sRGB bytes, from 0 (black) to 1 (white).
  function relativeLuminance(r, g, b) {
    // lin(x): one sRGB byte in linear light.
    function lin(x) { var v = x / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  }

  // contrastInk(core, th, r, g, b): whichever of the theme's ink and paper reads better on the colour r, g, b.
  function contrastInk(core, th, r, g, b) {
    var ink = core.parseColour(th.ink) || [20, 24, 29], paper = core.parseColour(th.paper) || [238, 241, 244];
    var lc = relativeLuminance(r, g, b);
    var li = relativeLuminance(ink[0], ink[1], ink[2]), lp = relativeLuminance(paper[0], paper[1], paper[2]);
    // ratio(a, b2): the WCAG contrast ratio of two luminances.
    function ratio(a, b2) { return (Math.max(a, b2) + 0.05) / (Math.min(a, b2) + 0.05); }
    return ratio(lc, li) >= ratio(lc, lp) ? th.ink : th.paper;
  }

  // rgbCss(r, g, b): an rgb() colour string from three bytes.
  function rgbCss(r, g, b) {
    return 'rgb(' + Math.round(r) + ', ' + Math.round(g) + ', ' + Math.round(b) + ')';
  }

  // erf(x): the error function (Abramowitz and Stegun 7.1.26; absolute error below 1.5e-7, ample for three decimals).
  function erf(x) {
    var s = x < 0 ? -1 : 1, a = Math.abs(x);
    var t = 1 / (1 + 0.3275911 * a);
    var y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
    return s * y;
  }

  // Phi(z): the standard normal distribution function, the chance that a standard bell-curve number is below z.
  function Phi(z) {
    return 0.5 * (1 + erf(z / Math.SQRT2));
  }

  // bell(z): the standard normal density, the height of the bell curve at z.
  function bell(z) {
    return Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI);
  }

  // ------------------------------------------------------------------ DOM helpers

  // imageChooser(core, id, label): the shared "Sample scene / Use your own image" control from boot.js, or null.
  function imageChooser(core, id, label) {
    var make = typeof core.imageChooser === 'function' ? core.imageChooser
      : (root.Boot && typeof root.Boot.imageChooser === 'function' ? root.Boot.imageChooser : null);
    return make ? make({ id: id, label: label }) : null;
  }

  // hint(core, html): a small explanatory paragraph for the control strip.
  function hint(core, html) {
    return core.el('p', { class: 'control-hint', html: html });
  }

  // groupTitle(core, text): the small title of a group of controls.
  function groupTitle(core, text) {
    return core.el('p', { class: 'control-group-title', text: text });
  }

  // slider(core, o): a labelled range input with its live value; o = {id, label, min, max, step, value, digits, hint, role, format}.
  function slider(core, o) {
    var input = core.el('input', { type: 'range', id: o.id, min: String(o.min), max: String(o.max), step: String(o.step), value: String(o.value) });
    var out = core.el('output', { id: o.id + '-out', for: o.id });
    var kids = [core.el('label', { for: o.id, html: o.label }), out, input];
    if (o.hint) kids.push(hint(core, o.hint));
    var box = core.el('div', { class: ['control', o.role ? 'role-' + o.role : null] }, kids);
    var api = {
      root: box, input: input, output: out,
      // value(): the current number.
      value: function () { return Number(input.value); },
      // show(): write the current number into the output.
      show: function () { out.textContent = o.format ? o.format(Number(input.value)) : core.fmt(Number(input.value), o.digits); },
      // set(v): move the slider to v and show it.
      set: function (v) { input.value = String(v); api.show(); }
    };
    api.show();
    return api;
  }

  // toggle(core, o): a checkbox with its words; o = {id, label, checked, role}.
  function toggle(core, o) {
    var input = core.el('input', { type: 'checkbox', id: o.id, checked: !!o.checked });
    var label = core.el('label', { class: ['toggle', o.role ? 'role-' + o.role : null], for: o.id }, [input, ' ' + o.label]);
    return { root: label, input: input };
  }

  // segmented(core, o): one-of-several choices drawn as small buttons; o = {id, label, options: [{value, text}], value, hint}.
  function segmented(core, o) {
    var inputs = [];
    var labelId = o.id + '-label';
    var group = core.el('div', { class: 'segmented', role: 'radiogroup', 'aria-labelledby': labelId });
    o.options.forEach(function (opt) {
      var input = core.el('input', { type: 'radio', name: o.id, id: o.id + '-' + opt.value, value: String(opt.value), checked: String(opt.value) === String(o.value) });
      inputs.push(input);
      group.appendChild(core.el('label', { for: input.id }, [input, core.el('span', { text: opt.text })]));
    });
    var kids = [core.el('span', { class: 'control-label', id: labelId, text: o.label }), group];
    if (o.hint) kids.push(hint(core, o.hint));
    return {
      root: core.el('div', { class: 'control' }, kids),
      inputs: inputs,
      // value(): the chosen option's value.
      value: function () {
        for (var i = 0; i < inputs.length; i++) if (inputs[i].checked) return inputs[i].value;
        return String(o.value);
      },
      // set(v): choose the option whose value is v.
      set: function (v) { inputs.forEach(function (inp) { inp.checked = inp.value === String(v); }); },
      // onChange(fn): call fn whenever the choice changes.
      onChange: function (fn) { inputs.forEach(function (inp) { inp.addEventListener('change', fn); }); }
    };
  }

  // button(core, id, text, primary): a plain button (the primary one filled with ink).
  function button(core, id, text, primary) {
    return core.el('button', { type: 'button', id: id, class: primary ? 'btn btn-primary' : 'btn' }, text);
  }

  // numberBox(core, id, value, o): a number input with an accessible name; o = {label, step, min, max}.
  function numberBox(core, id, value, o) {
    return core.el('input', {
      type: 'number', id: id, value: String(value), step: String(o.step), min: String(o.min), max: String(o.max),
      'aria-label': o.label, inputmode: 'decimal'
    });
  }

  // readNumber(input, fallback, lo, hi): the typed number, limited to [lo, hi], or fallback when the box holds no number.
  function readNumber(input, fallback, lo, hi) {
    var raw = String(input.value).replace(/−/g, '-').trim();
    var v = raw === '' ? NaN : Number(raw);
    if (!isFinite(v)) return fallback;
    return clamp(v, lo, hi);
  }

  // canvasBox(core, o): a canvas drawn in CSS pixels, sharp on dense screens and shrinking with its container; o = {id, label, focusable, pixelated}.
  function canvasBox(core, o) {
    var attrs = { id: o.id, 'aria-label': o.label };
    if (o.focusable) attrs.tabindex = '0'; else attrs.role = 'img';
    if (o.pixelated) attrs.class = 'pixelated';
    var canvas = core.el('canvas', attrs);
    var box = { canvas: canvas, w: 0, h: 0, dpr: 0, ctx: null };
    // begin(w, h): size the canvas to w x h CSS pixels when that changed, clear it, and return its context (drawing units = CSS pixels).
    box.begin = function (w, h) {
      var dpr = clamp(Number(root.devicePixelRatio) || 1, 1, 3);
      if (!box.ctx || w !== box.w || h !== box.h || dpr !== box.dpr) {
        box.w = w;
        box.h = h;
        box.dpr = dpr;
        box.ctx = core.fitCanvas(canvas, w, h);
      } else {
        box.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        box.ctx.clearRect(0, 0, w, h);
      }
      box.ctx.setLineDash([]);
      box.ctx.globalAlpha = 1;
      return box.ctx;
    };
    // point(ev): the pointer position in drawing units.
    box.point = function (ev) {
      return core.canvasPoint(canvas, ev, box.w || 1, box.h || 1);
    };
    return box;
  }

  // readoutList(core, rows): a dl.readout of [key, dtHtml] rows whose values can be set; returns {root, dd(key), set(key, text), parts(key, list)}.
  function readoutList(core, rows) {
    var dl = core.el('dl', { class: 'readout', style: 'grid-template-columns: fit-content(40%) minmax(0, 1fr)' });
    var dds = {};
    rows.forEach(function (r) {
      dl.appendChild(core.el('dt', { html: r[1] }));
      dds[r[0]] = core.el('dd');
      dl.appendChild(dds[r[0]]);
    });
    return {
      root: dl,
      dd: function (key) { return dds[key]; },
      set: function (key, text) { dds[key].textContent = text; },
      parts: function (key, list) { setParts(core, dds[key], list); }
    };
  }

  // clearNode(node): remove every child of node.
  function clearNode(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  // setParts(core, node, list): replace the children of node by a list of texts and nodes.
  function setParts(core, node, list) {
    clearNode(node);
    list.forEach(function (p) {
      if (p === null || p === undefined) return;
      node.appendChild(typeof p === 'object' ? p : root.document.createTextNode(String(p)));
    });
  }

  // value(core, id, text): a span with an id that holds one number, for readouts that tests and screen readers find.
  function valueSpan(core, id, text) {
    return core.el('span', { id: id, class: 'p1-val', text: text });
  }

  // svgText(core, x, y, text, attrs): an SVG text element at (x, y).
  function svgText(core, x, y, text, attrs) {
    var a = { x: String(Math.round(x * 10) / 10), y: String(Math.round(y * 10) / 10) };
    Object.keys(attrs || {}).forEach(function (k) { a[k] = attrs[k]; });
    return core.el('text', a, String(text));
  }

  // svgLine(core, x1, y1, x2, y2, cls): an SVG line.
  function svgLine(core, x1, y1, x2, y2, cls) {
    var r = function (v) { return String(Math.round(v * 10) / 10); };
    return core.el('line', { x1: r(x1), y1: r(y1), x2: r(x2), y2: r(y2), class: cls || null });
  }

  // arrowHead(core, x1, y1, x2, y2, size, cls): a filled triangle at (x2, y2) pointing along the line from (x1, y1).
  function arrowHead(core, x1, y1, x2, y2, size, cls) {
    var dx = x2 - x1, dy = y2 - y1, len = Math.sqrt(dx * dx + dy * dy) || 1;
    var ux = dx / len, uy = dy / len, s = size || 9;
    var bx = x2 - ux * s, by = y2 - uy * s;
    var r = function (v) { return Math.round(v * 10) / 10; };
    var p = [[x2, y2], [bx - uy * s * 0.5, by + ux * s * 0.5], [bx + uy * s * 0.5, by - ux * s * 0.5]];
    return core.el('polygon', { points: p.map(function (q) { return r(q[0]) + ',' + r(q[1]); }).join(' '), class: cls || null });
  }

  // svgArrow(core, x1, y1, x2, y2, o): a group of a line and its head; o = {cls, head, dashed}.
  function svgArrow(core, x1, y1, x2, y2, o) {
    var opt = o || {};
    var dx = x2 - x1, dy = y2 - y1, len = Math.sqrt(dx * dx + dy * dy);
    var head = opt.head === undefined ? 9 : opt.head;
    var g = core.el('g', { class: opt.cls || null });
    if (len < 0.5) return g;
    var stop = Math.max(0, len - head * 0.8) / len;
    var line = svgLine(core, x1, y1, x1 + dx * stop, y1 + dy * stop, opt.dashed ? 'p1-dashed' : null);
    if (opt.width) line.setAttribute('style', 'stroke-width: ' + opt.width + 'px');
    g.appendChild(line);
    if (head > 0) g.appendChild(arrowHead(core, x1, y1, x2, y2, head));
    return g;
  }

  // svgBox(core, id, w, h, label, cls): an <svg viewBox> that scales with its container, with an accessible name.
  function svgBox(core, id, w, h, label, cls) {
    return core.el('svg', {
      id: id, viewBox: '0 0 ' + w + ' ' + h, width: String(w), height: String(h), role: 'img', 'aria-label': label,
      class: cls || 'chart', preserveAspectRatio: 'xMidYMid meet'
    });
  }

  // svgPoint(svg, ev, w, h): the pointer position in the viewBox units of an svg drawn at any size.
  function svgPoint(svg, ev, w, h) {
    var r = svg.getBoundingClientRect();
    return {
      x: (ev.clientX - r.left) * w / (r.width || w),
      y: (ev.clientY - r.top) * h / (r.height || h)
    };
  }

  // arithTable(core, caption, head): a small table of arithmetic in a sideways-scrolling box; returns {root, table, body, foot}.
  function arithTable(core, caption, head) {
    var thead = core.el('thead', null, core.el('tr', null, head.map(function (h, i) {
      return core.el('th', { scope: 'col', class: i ? 'num' : null, html: h });
    })));
    var tbody = core.el('tbody');
    var tfoot = core.el('tfoot');
    var table = core.el('table', { class: 'p1-arith' }, [core.el('caption', { html: caption }), thead, tbody, tfoot]);
    return { root: core.el('div', { class: 'scroll-x' }, table), table: table, body: tbody, foot: tfoot };
  }

  // row(core, cells, headFirst): a table row; the first cell is a row header when headFirst; a cell is an HTML string or a node.
  function row(core, cells, headFirst) {
    return core.el('tr', null, cells.map(function (c, i) {
      var isNode = c !== null && typeof c === 'object';
      var attrs = i === 0 && headFirst ? { scope: 'row' } : { class: i ? 'num' : null };
      if (!isNode) attrs.html = c;
      var cell = core.el(i === 0 && headFirst ? 'th' : 'td', attrs);
      if (isNode) cell.appendChild(c);
      return cell;
    }));
  }

  // filmApi(): the scenes engine, or null where src/scenes.js did not load.
  function filmApi() {
    var S = root.Scenes;
    return S && typeof S.create === 'function' && !S.placeholder ? S : null;
  }

  // ------------------------------------------------------------------ Lab 1A: pixels are numbers

  Labs.register('lab-1a-pixels', function mount(body, core) {
    var ID = 'lab-1a-pixels';
    var D = DEFAULTS['1a'];
    var ZOOM = 2;
    var CELL = 36;
    var CHANNEL_INDEX = { red: 0, green: 1, blue: 2 };
    var MEAN = core.constants && core.constants.imagenetMean ? core.constants.imagenetMean : [0.485, 0.456, 0.406];
    var STD = core.constants && core.constants.imagenetStd ? core.constants.imagenetStd : [0.229, 0.224, 0.225];
    var st = {
      side: D.side, x: D.pixel[0], y: D.pixel[1], channel: D.channel, image: null, views: {},
      source: 'shared', photo: null, loading: false, mix: D.mix.slice()
    };
    var doc = root.document;
    var pageOffersPhotos = !!(doc && typeof doc.querySelector === 'function' && doc.querySelector('.page[data-bundle-images]'));

    var controls = core.el('div', { class: 'lab-controls' });
    var stage = core.el('div', { class: 'lab-stage' });
    var chooser = imageChooser(core, ID, 'Picture used by Lab 1A');
    if (chooser) controls.appendChild(chooser);

    // the course's photograph (where the page's own chooser does not offer the eight photographs already)
    var photoBtn = button(core, ID + '-photo', 'The course' + CH.rsquo + 's photograph');
    photoBtn.setAttribute('aria-pressed', 'false');
    var photoStatus = core.el('p', { class: 'control-hint', id: ID + '-photo-status', 'aria-live': 'polite' },
      'The dog and the cat by the door, cut to the centre square at 224 by 224 pixels by your browser.');
    var photoGroup = core.el('div', { class: 'control-group' }, [groupTitle(core, 'Or a real photograph'), photoBtn, photoStatus]);
    if (!pageOffersPhotos) controls.appendChild(photoGroup);

    var show = segmented(core, {
      id: ID + '-channel', label: 'Show',
      options: [{ value: 'colour', text: 'Colour' }, { value: 'red', text: 'Red' }, { value: 'green', text: 'Green' }, { value: 'blue', text: 'Blue' }],
      value: st.channel,
      hint: 'One colour at a time, drawn in grey: the brighter the grey, the larger that colour' + CH.rsquo + 's number.'
    });
    controls.appendChild(show.root);
    controls.appendChild(hint(core, 'Point at the picture, or tap it. After a click, the arrow keys move one pixel at a time, and ten with Shift.'));

    // the mixer: three numbers make one colour
    var mixR = slider(core, { id: ID + '-mix-r', label: 'Red', min: 0, max: 255, step: 1, value: st.mix[0], digits: 0 });
    var mixG = slider(core, { id: ID + '-mix-g', label: 'Green', min: 0, max: 255, step: 1, value: st.mix[1], digits: 0 });
    var mixB = slider(core, { id: ID + '-mix-b', label: 'Blue', min: 0, max: 255, step: 1, value: st.mix[2], digits: 0 });
    var swatch = core.el('span', { class: 'p1-swatch', 'aria-hidden': 'true' });
    var mixOut = core.el('p', { class: 'readout', id: ID + '-mix-out', 'aria-live': 'polite' });
    controls.appendChild(core.el('div', { class: 'control-group' }, [
      groupTitle(core, 'Mix a pixel of your own'),
      mixR.root, mixG.root, mixB.root,
      core.el('div', { class: 'p1-mix-row' }, [swatch, mixOut])
    ]));

    var main = canvasBox(core, { id: ID + '-picture', focusable: true, pixelated: true, label: 'The picture, pixel by pixel. Point at it, or use the arrow keys, to choose a pixel.' });
    var mag = canvasBox(core, { id: ID + '-magnifier', label: 'The pixels around the chosen one, enlarged, with their numbers' });
    var magLabel = core.el('span', { class: 'stage-label', id: ID + '-mag-label' });
    var sizeLine = core.el('p', { class: 'readout', id: ID + '-size' });
    var whereLine = core.el('p', { class: 'readout', id: ID + '-where' });
    var table = buildTable();
    // the runtime's own note on how the browser's pixels of a photograph differ from the bundle script's (plan decision 6)
    var photoNote = core.el('p', { class: 'control-hint', id: ID + '-photo-note' },
      core.image && typeof core.image.note === 'string' ? core.image.note : '');
    photoNote.hidden = true;

    stage.appendChild(sizeLine);
    stage.appendChild(core.el('div', { class: 'stage-row' }, [
      core.el('div', { class: 'stage-cell' }, [main.canvas, core.el('span', { class: 'stage-label', text: 'The whole picture; the box marks the magnified pixels' })]),
      core.el('div', { class: 'stage-cell', style: 'width: ' + (D.magnifier_cells * CELL) + 'px; max-width: 100%' }, [mag.canvas, magLabel])
    ]));
    stage.appendChild(whereLine);
    stage.appendChild(core.el('div', { class: 'scroll-x' }, table.root));
    stage.appendChild(photoNote);
    body.appendChild(controls);
    body.appendChild(stage);

    // buildTable(): the table that takes the chosen pixel from its stored numbers to the normalised ones.
    function buildTable() {
      var cells = {};
      // numberCells(key): three empty number cells (red, green, blue) remembered under key.
      function numberCells(key) {
        cells[key] = [0, 1, 2].map(function () { return core.el('td', { class: 'num' }); });
        return cells[key];
      }
      // factCells(id, values): three cells holding fact spans.
      function factCells(id, values) {
        return values.map(function (v) { return core.el('td', { class: 'num', html: fx(id, v) }); });
      }
      // trow(headHtml, tds): one table row with a row header.
      function trow(headHtml, tds) {
        return core.el('tr', null, [core.el('th', { scope: 'row', html: headHtml })].concat(tds));
      }
      var el = core.el('table', null, [
        core.el('caption', { text: 'From the stored numbers to what the network receives (each row is rounded to three decimals; the next row is computed from the unrounded number)' }),
        core.el('thead', null, core.el('tr', null, [
          core.el('th', { scope: 'col', text: 'Step' }),
          core.el('th', { scope: 'col', class: 'num', text: 'Red' }),
          core.el('th', { scope: 'col', class: 'num', text: 'Green' }),
          core.el('th', { scope: 'col', class: 'num', text: 'Blue' })
        ])),
        core.el('tbody', null, [
          trow('Stored number, ' + fx('img_pixel_range', '0 to 255'), numberCells('raw')),
          trow('Divided by 255, now ' + fx('img_scaled_range', '0.0 to 1.0'), numberCells('scaled')),
          trow('ImageNet ' + term('mean'), factCells('imagenet_mean', ['0.485', '0.456', '0.406'])),
          trow('Minus the mean', numberCells('centred')),
          trow('ImageNet ' + term('standard deviation'), factCells('imagenet_std', ['0.229', '0.224', '0.225']))
        ]),
        core.el('tfoot', null, trow('Divided by the standard deviation: what the network receives', numberCells('norm')))
      ]);
      return { root: el, cells: cells };
    }

    // load(): read the picture the lab shows (the shared one, or the course's photograph) and forget the cached views.
    function load() {
      st.image = st.source === 'photo' && st.photo ? st.photo : core.currentImage(st.side).imageData;
      st.views = {};
      st.x = clamp(st.x, 0, st.side - 1);
      st.y = clamp(st.y, 0, st.side - 1);
    }

    // viewCanvas(): a canvas of the picture in colour, or of one colour's numbers as grey.
    function viewCanvas() {
      var key = st.channel;
      if (!st.views[key]) {
        var img = st.image;
        if (key === 'colour') {
          st.views[key] = core.toCanvas(img);
        } else {
          var c = CHANNEL_INDEX[key], data = img.data, out = new Uint8ClampedArray(data.length);
          for (var i = 0; i < data.length; i += 4) {
            var v = data[i + c];
            out[i] = v; out[i + 1] = v; out[i + 2] = v; out[i + 3] = 255;
          }
          st.views[key] = core.toCanvas(core.makeImageData(img.width, img.height, out));
        }
      }
      return st.views[key];
    }

    // pixelAt(x, y): the [red, green, blue] bytes of one pixel.
    function pixelAt(x, y) {
      var img = st.image, k = (y * img.width + x) * 4;
      return [img.data[k], img.data[k + 1], img.data[k + 2]];
    }

    // drawMain(): the whole picture, two screen pixels per picture pixel, with the magnified area boxed.
    function drawMain() {
      var th = core.theme();
      var W = st.side * ZOOM;
      var ctx = main.begin(W, W);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(viewCanvas(), 0, 0, W, W);
      var half = (D.magnifier_cells - 1) / 2;
      var bx = (st.x - half) * ZOOM - 2, by = (st.y - half) * ZOOM - 2, bs = D.magnifier_cells * ZOOM + 4;
      ctx.strokeStyle = core.rgba(th.ink, 0.45);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, by + bs / 2); ctx.lineTo(bx, by + bs / 2);
      ctx.moveTo(bx + bs, by + bs / 2); ctx.lineTo(W, by + bs / 2);
      ctx.moveTo(bx + bs / 2, 0); ctx.lineTo(bx + bs / 2, by);
      ctx.moveTo(bx + bs / 2, by + bs); ctx.lineTo(bx + bs / 2, W);
      ctx.stroke();
      ctx.lineWidth = 4; ctx.strokeStyle = th.paper; ctx.strokeRect(bx, by, bs, bs);
      ctx.lineWidth = 2; ctx.strokeStyle = th.ink; ctx.strokeRect(bx, by, bs, bs);
    }

    // drawMagnifier(): the pixels around the chosen one as large squares, each with its numbers.
    function drawMagnifier() {
      var th = core.theme();
      var n = D.magnifier_cells, half = (n - 1) / 2, W = n * CELL, S = st.side;
      var ci = CHANNEL_INDEX[st.channel];
      var ctx = mag.begin(W, W);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (var j = 0; j < n; j++) {
        for (var i = 0; i < n; i++) {
          var px = st.x - half + i, py = st.y - half + j, x = i * CELL, y = j * CELL;
          if (px < 0 || py < 0 || px >= S || py >= S) {
            ctx.fillStyle = core.rgba(th.line, 0.4);
            ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
            continue;
          }
          var rgb = pixelAt(px, py);
          var fill = ci === undefined ? rgb : [rgb[ci], rgb[ci], rgb[ci]];
          ctx.fillStyle = rgbCss(fill[0], fill[1], fill[2]);
          ctx.fillRect(x, y, CELL, CELL);
          ctx.fillStyle = contrastInk(core, th, fill[0], fill[1], fill[2]);
          if (ci === undefined) {
            ctx.font = canvasFont(10, 500);
            ctx.fillText(String(rgb[0]), x + CELL / 2, y + CELL * 0.22);
            ctx.fillText(String(rgb[1]), x + CELL / 2, y + CELL * 0.5);
            ctx.fillText(String(rgb[2]), x + CELL / 2, y + CELL * 0.78);
          } else {
            ctx.font = canvasFont(12, 600);
            ctx.fillText(String(rgb[ci]), x + CELL / 2, y + CELL / 2);
          }
        }
      }
      ctx.fillStyle = core.rgba(th.paper, 0.6);
      for (var t = 1; t < n; t++) {
        ctx.fillRect(t * CELL - 0.5, 0, 1, W);
        ctx.fillRect(0, t * CELL - 0.5, W, 1);
      }
      var c0 = half * CELL;
      ctx.lineWidth = 4; ctx.strokeStyle = th.paper; ctx.strokeRect(c0 + 2, c0 + 2, CELL - 4, CELL - 4);
      ctx.lineWidth = 2; ctx.strokeStyle = th.ink; ctx.strokeRect(c0 + 2, c0 + 2, CELL - 4, CELL - 4);
      magLabel.textContent = ci === undefined
        ? 'Enlarged: one square per pixel; its numbers are red, green and blue from the top'
        : 'Enlarged: one square per pixel, showing its ' + st.channel + ' number';
    }

    // sourceName(): what the lab is showing, in words.
    function sourceName() {
      if (st.source === 'photo') return 'the course' + CH.rsquo + 's photograph';
      var info = core.currentImage(st.side);
      return info && info.name ? String(info.name) : 'the picture';
    }

    // fillReadouts(): the size line, the chosen pixel and the normalisation table.
    function fillReadouts() {
      var S = st.side;
      sizeLine.textContent = 'This picture (' + sourceName() + '): ' + core.fmt(S) + ' ' + CH.times + ' ' + core.fmt(S) + ' pixels ' + CH.times +
        ' 3 numbers = ' + core.fmt(S * S * 3) + ' numbers.';
      whereLine.textContent = 'Chosen pixel: column ' + st.x + ', row ' + st.y + ', counted from 0 at the top left.';
      var rgb = pixelAt(st.x, st.y);
      var nrm = core.normalisePixel(rgb[0], rgb[1], rgb[2]);
      for (var c = 0; c < 3; c++) {
        table.cells.raw[c].textContent = String(rgb[c]);
        table.cells.scaled[c].textContent = core.fmt(rgb[c] / 255, 3);
        table.cells.centred[c].textContent = core.fmt(rgb[c] / 255 - MEAN[c], 3);
        table.cells.norm[c].textContent = core.fmt(nrm[c], 3);
      }
    }

    // drawMix(): the mixer's colour and its three normalised numbers.
    function drawMix() {
      st.mix = [mixR.value(), mixG.value(), mixB.value()];
      [mixR, mixG, mixB].forEach(function (s) { s.show(); });
      swatch.style.background = rgbCss(st.mix[0], st.mix[1], st.mix[2]);
      var n = st.mix.map(function (v, c) { return (v / 255 - MEAN[c]) / STD[c]; });
      mixOut.textContent = '(' + st.mix.join(', ') + ') reaches the network as (' +
        n.map(function (v) { return core.fmt(v, 3); }).join(', ') + ').';
    }

    // photoState(): the photograph button, its status line, and the runtime's pixel note while the photograph is shown.
    function photoState() {
      photoBtn.setAttribute('aria-pressed', st.source === 'photo' ? 'true' : 'false');
      photoBtn.disabled = st.loading;
      photoNote.hidden = st.source !== 'photo' || !photoNote.textContent;
    }

    // drawAll(): every part of the lab.
    function drawAll() {
      drawMain();
      drawMagnifier();
      fillReadouts();
      photoState();
    }

    var redraw = later(body, core, drawAll);

    // moveTo(x, y): choose the pixel at (x, y), kept inside the picture.
    function moveTo(x, y) {
      var nx = clamp(Math.floor(x), 0, st.side - 1), ny = clamp(Math.floor(y), 0, st.side - 1);
      if (nx === st.x && ny === st.y) return;
      st.x = nx;
      st.y = ny;
      redraw();
    }

    var onPoint = core.guard(body, function (ev) {
      var p = main.point(ev);
      moveTo(p.x / ZOOM, p.y / ZOOM);
    });
    main.canvas.addEventListener('pointermove', onPoint);
    main.canvas.addEventListener('pointerdown', onPoint);
    main.canvas.addEventListener('keydown', core.guard(body, function (ev) {
      var d = arrowDelta(ev, D.arrow_steps);
      if (!d) return;
      ev.preventDefault();
      moveTo(st.x + d[0], st.y - d[1]);
    }));
    show.onChange(core.guard(body, function () {
      st.channel = show.value();
      redraw();
    }));
    [mixR, mixG, mixB].forEach(function (s) {
      s.input.addEventListener('input', core.guard(body, drawMix));
      s.input.addEventListener('change', core.guard(body, drawMix));
    });
    photoBtn.addEventListener('click', core.guard(body, function () {
      if (st.loading) return;
      if (st.source === 'photo') {
        // pressed again: back to the picture of the shared chooser
        st.source = 'shared';
        load();
        photoStatus.textContent = 'Back to the picture chosen above. Press the button again for the photograph.';
        redraw();
        return;
      }
      if (st.photo) {
        st.source = 'photo';
        load();
        photoStatus.textContent = 'Showing the course' + CH.rsquo + 's photograph. Press the button again for the picture chosen above.';
        redraw();
        return;
      }
      if (!core.image || typeof core.image.load !== 'function') {
        photoStatus.textContent = 'The photograph cannot be drawn on this page: the runtime has no image loader.';
        return;
      }
      st.loading = true;
      photoState();
      photoStatus.textContent = 'Loading the photograph' + CH.ellipsis;
      var url = 'data/images/' + D.photo + '.jpg';
      try { url = core.image.url(D.photo); } catch (e) { /* keep the plain address */ }
      var done = core.guard(body, function (img) {
        st.loading = false;
        st.photo = img;
        st.source = 'photo';
        load();
        photoStatus.textContent = 'Showing the course' + CH.rsquo + 's photograph, cut as the bundle cut it. Press the button again for the picture chosen above.';
        redraw();
      });
      var failed = core.guard(body, function (err) {
        st.loading = false;
        photoState();
        photoStatus.textContent = 'The photograph could not be loaded here (' + describe(err) + '). The lab keeps the picture it had.';
      });
      var pending;
      try {
        pending = core.image.load(url, st.side);
      } catch (err) {
        failed(err);
        return;
      }
      Promise.resolve(pending).then(done, failed);
    }));
    core.on('image-changed', core.guard(body, function () {
      st.source = 'shared';
      load();
      photoStatus.textContent = 'The dog and the cat by the door, cut to the centre square at 224 by 224 pixels by your browser.';
      redraw();
    }));
    core.on('theme-changed', redraw);

    load();
    drawAll();
    drawMix();
  });

  // ------------------------------------------------------------------ Lab 1B: two vectors, one number

  Labs.register('lab-1b-cosine', function mount(body, core) {
    var ID = 'lab-1b-cosine';
    var D = DEFAULTS['1b'];
    var SIZE = 320, C = SIZE / 2, U = (SIZE / 2 - 16) / D.range;
    var st = { a: D.a.slice(), b: D.b.slice(), move: 'a', unit: false, shadow: true, drag: null, a3: D.a3.slice(), b3: D.b3.slice() };

    var controls = core.el('div', { class: 'lab-controls' });
    var stage = core.el('div', { class: 'lab-stage' });

    var moveSeg = segmented(core, {
      id: ID + '-move', label: 'The arrow keys move',
      options: [{ value: 'a', text: 'a' }, { value: 'b', text: 'b' }], value: 'a',
      hint: 'Drag either tip on the drawing, or tap where it should go. With the drawing focused, the arrow keys move the chosen arrow by 0.1, and by 0.5 with Shift.'
    });
    controls.appendChild(moveSeg.root);
    var presetBtns = {
      start: button(core, ID + '-preset-start', 'Start'),
      same: button(core, ID + '-preset-same', 'Same direction'),
      right: button(core, ID + '-preset-right', 'Right angle'),
      opposite: button(core, ID + '-preset-opposite', 'Opposite')
    };
    controls.appendChild(core.el('div', { class: 'control-group' }, [
      groupTitle(core, 'Presets'),
      core.el('div', { class: 'button-row' }, [presetBtns.start, presetBtns.same, presetBtns.right, presetBtns.opposite]),
      hint(core, '<em>Same direction</em> puts b along a and twice as long: the cosine is 1, and stays 1 however long either arrow is.')
    ]));
    var unitT = toggle(core, { id: ID + '-unit', label: 'Keep both arrows at length 1' });
    var shadowT = toggle(core, { id: ID + '-shadow', label: 'Show b' + CH.rsquo + 's shadow on a', checked: true });
    controls.appendChild(core.el('div', { class: 'toggle-row' }, [unitT.root, shadowT.root]));
    controls.appendChild(hint(core, 'At length 1 both tips sit on the circle, and the cosine is just the dot product.'));
    controls.appendChild(hint(core, 'Every number shown is rounded to three decimals; the lab computes with all the digits.'));

    var svg = svgBox(core, ID + '-plane', SIZE, SIZE, 'Two arrows a and b from the origin on a grid, with the circle of radius 1. Drag a tip, or focus the drawing and use the arrow keys.', 'chart p1-vec drag-surface');
    svg.setAttribute('tabindex', '0');
    var meter = svgBox(core, ID + '-meter', 300, 54, 'Where the cosine lies between minus 1 and 1', 'chart p1-meter');
    var out = readoutList(core, [
      ['a', 'a'], ['b', 'b'], ['dot', 'a ' + CH.middot + ' b'], ['na', CH.norm + 'a' + CH.norm], ['nb', CH.norm + 'b' + CH.norm],
      ['cos', 'cos(a, b)'], ['angle', 'angle ' + CH.theta]
    ]);
    var note = core.el('p', { class: 'control-hint', id: ID + '-note', 'aria-live': 'polite' });
    stage.appendChild(core.el('div', { class: 'stage-row' }, [
      core.el('div', { class: 'stage-cell p1-cell-plane' }, [svg, core.el('span', { class: 'stage-label', text: 'One square of the grid is 1; the dashed circle has radius 1' })]),
      core.el('div', { class: 'stage-cell p1-cell-readout' }, [out.root, meter, note])
    ]));
    body.appendChild(controls);
    body.appendChild(stage);

    // ---- the three-number table, across the whole lab
    var wide = core.el('div', { class: 'p1-wide' });
    wide.appendChild(core.el('h4', { class: 'p1-wide-title', text: 'Three numbers each, every step written out' }));
    var presets3 = {
      example: button(core, ID + '-t-preset-example', 'The worked example'),
      right: button(core, ID + '-t-preset-right', 'A right angle'),
      opposite: button(core, ID + '-t-preset-opposite', 'Opposite'),
      longer: button(core, ID + '-t-preset-longer', 'Twice as long')
    };
    wide.appendChild(core.el('div', { class: 'button-row' }, [presets3.example, presets3.right, presets3.opposite, presets3.longer]));
    var boxes = { a: [], b: [] };
    var t = arithTable(core, 'Type any number from ' + CH.minus + '9 to 9 into a or b', ['', 'i = 1', 'i = 2', 'i = 3', 'Result']);
    ['a', 'b'].forEach(function (v) {
      var tds = [core.el('th', { scope: 'row', text: v })];
      for (var i = 0; i < 3; i++) {
        var box = numberBox(core, ID + '-t-' + v + i, st[v + '3'][i], { label: v + ' number ' + (i + 1), step: D.input_step, min: D.input_range[0], max: D.input_range[1] });
        boxes[v].push(box);
        tds.push(core.el('td', { class: 'num' }, box));
      }
      tds.push(core.el('td', { class: 'num' }));
      t.body.appendChild(core.el('tr', null, tds));
    });
    var calcRows = {};
    [['prod', 'a<sub>i</sub> ' + CH.times + ' b<sub>i</sub>'], ['asq', 'a<sub>i</sub>' + CH.sup2], ['bsq', 'b<sub>i</sub>' + CH.sup2]].forEach(function (r) {
      var cells = [core.el('th', { scope: 'row', html: r[1] })];
      for (var i = 0; i < 4; i++) cells.push(core.el('td', { class: 'num' }));
      calcRows[r[0]] = cells;
      t.body.appendChild(core.el('tr', null, cells));
    });
    var tCos = core.el('span', { id: ID + '-t-cos' });
    var tAngle = core.el('span', { id: ID + '-t-angle' });
    var tCosLine = core.el('span');
    t.foot.appendChild(core.el('tr', null, [
      core.el('th', { scope: 'row', text: 'cos(a, b)' }),
      core.el('td', { colspan: '4', class: 'num' }, [tCosLine, tCos, core.el('span', { text: ', an angle of ' }), tAngle])
    ]));
    wide.appendChild(t.root);
    var tNote = core.el('p', { class: 'control-hint', id: ID + '-t-note', 'aria-live': 'polite' });
    wide.appendChild(tNote);
    body.appendChild(wide);

    // geometry
    function px(v) { return [C + U * v[0], C - U * v[1]]; }
    function dot(p, q) { var s = 0; for (var i = 0; i < p.length; i++) s += p[i] * q[i]; return s; }
    function len(p) { return Math.sqrt(dot(p, p)); }
    function round1(x) { return Math.round(x * 10) / 10; }

    // setTip(which, p): put the tip of arrow `which` at p (grid units): kept on the grid of 0.1 and inside the drawing, or on the circle.
    function setTip(which, p) {
      var x = clamp(p[0], -D.range, D.range), y = clamp(p[1], -D.range, D.range);
      if (st.unit) {
        var L = Math.sqrt(x * x + y * y);
        if (L < 1e-6) return;
        st[which] = [x / L, y / L];
      } else {
        var q = function (v) { return round1(Math.round(v / D.snap) * D.snap); };
        st[which] = [q(x), q(y)];
      }
      draw();
    }

    // drawPlane(): the grid, the axes, the circle, the shadow, the angle and the two arrows.
    function drawPlane() {
      clearNode(svg);
      var grid = core.el('g', { class: 'grid' });
      for (var i = -D.range; i <= D.range; i++) {
        grid.appendChild(svgLine(core, C + U * i, C - U * D.range, C + U * i, C + U * D.range));
        grid.appendChild(svgLine(core, C - U * D.range, C + U * i, C + U * D.range, C + U * i));
      }
      svg.appendChild(grid);
      var axis = core.el('g', { class: 'axis' });
      axis.appendChild(svgLine(core, C - U * D.range, C, C + U * D.range, C));
      axis.appendChild(svgLine(core, C, C - U * D.range, C, C + U * D.range));
      svg.appendChild(axis);
      for (var k = -D.range; k <= D.range; k++) {
        if (!k) continue;
        svg.appendChild(svgText(core, C + U * k, C + 13, String(k).replace('-', CH.minus), { 'text-anchor': 'middle' }));
        svg.appendChild(svgText(core, C - 6, C - U * k + 4, String(k).replace('-', CH.minus), { 'text-anchor': 'end' }));
      }
      svg.appendChild(core.el('circle', { cx: String(C), cy: String(C), r: String(U), class: 'p1-circle' }));
      var la = len(st.a), lb = len(st.b);
      if (st.shadow && la > 1e-6) {
        var k2 = dot(st.a, st.b) / (la * la);
        var proj = [st.a[0] * k2, st.a[1] * k2];
        var P = px(proj), B = px(st.b);
        svg.appendChild(svgLine(core, B[0], B[1], P[0], P[1], 'p1-dotted'));
        svg.appendChild(svgLine(core, C, C, P[0], P[1], 'p1-shadow'));
      }
      if (la > 1e-6 && lb > 1e-6) {
        var t1 = Math.atan2(st.a[1], st.a[0]), t2 = Math.atan2(st.b[1], st.b[0]);
        var d = t2 - t1;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        var rr = 26, steps = 24, pts = [];
        for (var s = 0; s <= steps; s++) {
          var ang = t1 + d * s / steps;
          pts.push(round1(C + rr * Math.cos(ang)) + ',' + round1(C - rr * Math.sin(ang)));
        }
        svg.appendChild(core.el('polyline', { points: pts.join(' '), class: 'p1-arc' }));
        var mid = t1 + d / 2;
        svg.appendChild(svgText(core, C + (rr + 11) * Math.cos(mid), C - (rr + 11) * Math.sin(mid) + 4, CH.theta, { 'text-anchor': 'middle', class: 'p1-ink' }));
      }
      [['b', true], ['a', false]].forEach(function (pair) {
        var v = st[pair[0]], T = px(v);
        svg.appendChild(svgArrow(core, C, C, T[0], T[1], { cls: 'p1-arrow p1-arrow-' + pair[0], dashed: pair[1], head: 11 }));
        svg.appendChild(core.el('circle', { cx: String(round1(T[0])), cy: String(round1(T[1])), r: '8', class: 'p1-handle' + (st.move === pair[0] ? ' is-chosen' : '') }));
        var L = len(v) || 1;
        svg.appendChild(svgText(core, T[0] + 14 * v[0] / L, T[1] - 14 * v[1] / L + 4, pair[0], { 'text-anchor': 'middle', class: 'p1-ink p1-bold' }));
      });
    }

    // drawMeter(c): the cosine as a mark on a scale from -1 to 1.
    function drawMeter(c) {
      clearNode(meter);
      var x0 = 20, x1 = 280, y = 20;
      var X = function (v) { return x0 + (v + 1) / 2 * (x1 - x0); };
      var axis = core.el('g', { class: 'axis' });
      axis.appendChild(svgLine(core, x0, y, x1, y));
      [-1, 0, 1].forEach(function (v) { axis.appendChild(svgLine(core, X(v), y - 5, X(v), y + 5)); });
      meter.appendChild(axis);
      [[-1, CH.minus + '1 opposite'], [0, '0 right angle'], [1, '1 same']].forEach(function (p) {
        meter.appendChild(svgText(core, X(p[0]), y + 22, p[1], { 'text-anchor': p[0] < 0 ? 'start' : (p[0] > 0 ? 'end' : 'middle') }));
      });
      if (isFinite(c)) {
        meter.appendChild(core.el('circle', { cx: String(round1(X(c))), cy: String(y), r: '6', class: 'p1-meter-dot' }));
      }
    }

    // draw(): the plane, the readouts and the meter for the two arrows.
    function draw() {
      drawPlane();
      var a = st.a, b = st.b, la = len(a), lb = len(b), d = dot(a, b);
      var f1 = function (x) { return short(core, x, st.unit ? 3 : 1); };
      out.set('a', '(' + f1(a[0]) + ', ' + f1(a[1]) + ')');
      out.set('b', '(' + f1(b[0]) + ', ' + f1(b[1]) + ')');
      out.parts('dot', [paren(core, a[0], 3) + ' ' + CH.times + ' ' + paren(core, b[0], 3) + ' + ' + paren(core, a[1], 3) + ' ' +
        CH.times + ' ' + paren(core, b[1], 3) + ' = ', valueSpan(core, ID + '-dot', num(core, d))]);
      out.set('na', CH.sqrt + '(' + paren(core, a[0], 3) + CH.sup2 + ' + ' + paren(core, a[1], 3) + CH.sup2 + ') = ' + num(core, la));
      out.set('nb', CH.sqrt + '(' + paren(core, b[0], 3) + CH.sup2 + ' + ' + paren(core, b[1], 3) + CH.sup2 + ') = ' + num(core, lb));
      var c = la > 1e-9 && lb > 1e-9 ? clamp(d / (la * lb), -1, 1) : NaN;
      if (isFinite(c)) {
        out.parts('cos', [num(core, d) + ' / (' + num(core, la) + ' ' + CH.times + ' ' + num(core, lb) + ') = ', valueSpan(core, ID + '-cos', num(core, c))]);
        out.parts('angle', [valueSpan(core, ID + '-angle', core.fmt(Math.acos(c) * 180 / Math.PI, 1) + CH.deg)]);
        note.textContent = c > 0.95 ? 'Almost the same direction: the cosine is near 1.'
          : (c < -0.95 ? 'Almost opposite: the cosine is near ' + CH.minus + '1.'
            : (Math.abs(c) < 0.05 ? 'Close to a right angle: the cosine is near 0, and so is the dot product.'
              : 'The cosine only sees the angle: drag a tip outwards along its own line and it does not change.'));
      } else {
        out.parts('cos', ['not defined: ', valueSpan(core, ID + '-cos', 'n/a')]);
        out.parts('angle', [valueSpan(core, ID + '-angle', 'n/a')]);
        note.textContent = 'An arrow of length 0 points nowhere, so it has no angle with the other one.';
      }
      drawMeter(c);
    }

    // drawTable(): the three-number table, every product, square and sum.
    function drawTable() {
      var a = st.a3, b = st.b3;
      var prod = [0, 1, 2].map(function (i) { return a[i] * b[i]; });
      var asq = a.map(function (v) { return v * v; }), bsq = b.map(function (v) { return v * v; });
      var d = prod[0] + prod[1] + prod[2], sa = asq[0] + asq[1] + asq[2], sb = bsq[0] + bsq[1] + bsq[2];
      var la = Math.sqrt(sa), lb = Math.sqrt(sb);
      for (var i = 0; i < 3; i++) {
        calcRows.prod[i + 1].textContent = short(core, prod[i], 3);
        calcRows.asq[i + 1].textContent = short(core, asq[i], 3);
        calcRows.bsq[i + 1].textContent = short(core, bsq[i], 3);
      }
      setParts(core, calcRows.prod[4], ['a ' + CH.middot + ' b = ', valueSpan(core, ID + '-t-dot', short(core, d, 3))]);
      setParts(core, calcRows.asq[4], [CH.norm + 'a' + CH.norm + ' = ' + CH.sqrt + short(core, sa, 3) + ' = ', valueSpan(core, ID + '-t-na', short(core, la, 3))]);
      setParts(core, calcRows.bsq[4], [CH.norm + 'b' + CH.norm + ' = ' + CH.sqrt + short(core, sb, 3) + ' = ', valueSpan(core, ID + '-t-nb', short(core, lb, 3))]);
      if (la > 1e-9 && lb > 1e-9) {
        var c = clamp(d / (la * lb), -1, 1);
        tCosLine.textContent = short(core, d, 3) + ' / (' + short(core, la, 3) + ' ' + CH.times + ' ' + short(core, lb, 3) + ') = ';
        tCos.textContent = num(core, c);
        tAngle.textContent = core.fmt(Math.acos(c) * 180 / Math.PI, 1) + CH.deg;
        tNote.textContent = Math.abs(la - 2 * lb) < 1e-9 || Math.abs(lb - 2 * la) < 1e-9
          ? 'One vector is twice as long as the other: the dot product doubled, the cosine did not.' : '';
      } else {
        tCosLine.textContent = 'not defined: ';
        tCos.textContent = 'n/a';
        tAngle.textContent = 'n/a';
        tNote.textContent = 'A vector of zeros has length 0 and no direction, so its cosine with anything is not defined.';
      }
    }

    // fromBoxes(): read the six typed numbers into the table's vectors.
    function fromBoxes() {
      ['a', 'b'].forEach(function (v) {
        for (var i = 0; i < 3; i++) st[v + '3'][i] = readNumber(boxes[v][i], st[v + '3'][i], D.input_range[0], D.input_range[1]);
      });
      drawTable();
    }

    // setTable(pair): put a preset pair of three-number vectors into the boxes.
    function setTable(pair) {
      st.a3 = pair[0].slice();
      st.b3 = pair[1].slice();
      for (var i = 0; i < 3; i++) {
        boxes.a[i].value = String(st.a3[i]);
        boxes.b[i].value = String(st.b3[i]);
      }
      drawTable();
    }

    // pointer and keyboard on the plane
    function toUnits(ev) {
      var p = svgPoint(svg, ev, SIZE, SIZE);
      return [(p.x - C) / U, (C - p.y) / U];
    }
    function nearest(p) {
      var da = Math.hypot(p[0] - st.a[0], p[1] - st.a[1]), db = Math.hypot(p[0] - st.b[0], p[1] - st.b[1]);
      return da <= db ? 'a' : 'b';
    }
    svg.addEventListener('pointerdown', core.guard(body, function (ev) {
      var p = toUnits(ev);
      st.drag = nearest(p);
      st.move = st.drag;
      moveSeg.set(st.move);
      if (typeof svg.setPointerCapture === 'function') {
        try { svg.setPointerCapture(ev.pointerId); } catch (e) { /* not every pointer can be captured */ }
      }
      if (typeof ev.preventDefault === 'function') ev.preventDefault();
      setTip(st.drag, p);
    }));
    svg.addEventListener('pointermove', core.guard(body, function (ev) {
      if (!st.drag) return;
      setTip(st.drag, toUnits(ev));
    }));
    var endDrag = function () { st.drag = null; };
    svg.addEventListener('pointerup', endDrag);
    svg.addEventListener('pointercancel', endDrag);
    svg.addEventListener('keydown', core.guard(body, function (ev) {
      var d = arrowDelta(ev, D.arrow_steps);
      if (!d) return;
      ev.preventDefault();
      var v = st[st.move];
      if (st.unit) {
        // on the circle: left and up turn the arrow anticlockwise, right and down clockwise
        var ang = Math.atan2(v[1], v[0]) + (d[1] - d[0]) * 0.5;
        setTip(st.move, [Math.cos(ang), Math.sin(ang)]);
      } else {
        setTip(st.move, [v[0] + d[0], v[1] + d[1]]);
      }
    }));
    moveSeg.onChange(core.guard(body, function () { st.move = moveSeg.value(); draw(); }));
    Object.keys(presetBtns).forEach(function (k) {
      presetBtns[k].addEventListener('click', core.guard(body, function () {
        var pair = D.presets[k];
        st.a = pair[0].slice();
        st.b = pair[1].slice();
        if (st.unit) {
          st.unit = false;
          unitT.input.checked = false;
        }
        draw();
      }));
    });
    unitT.input.addEventListener('change', core.guard(body, function () {
      st.unit = !!unitT.input.checked;
      if (st.unit) {
        ['a', 'b'].forEach(function (v) {
          var L = len(st[v]);
          st[v] = L > 1e-9 ? [st[v][0] / L, st[v][1] / L] : [1, 0];
        });
      }
      draw();
    }));
    shadowT.input.addEventListener('change', core.guard(body, function () { st.shadow = !!shadowT.input.checked; draw(); }));
    ['a', 'b'].forEach(function (v) {
      boxes[v].forEach(function (box) {
        box.addEventListener('input', core.guard(body, fromBoxes));
        box.addEventListener('change', core.guard(body, fromBoxes));
      });
    });
    Object.keys(presets3).forEach(function (k) {
      presets3[k].addEventListener('click', core.guard(body, function () { setTable(D.presets3[k]); }));
    });
    core.on('theme-changed', core.guard(body, draw));

    draw();
    drawTable();
  });

  // ------------------------------------------------------------------ Lab 1C: walking downhill

  Labs.register('lab-1c-descent', function mount(body, core) {
    var ID = 'lab-1c-descent';
    var D = DEFAULTS['1c'];
    var LAND = 300, DATA = 300;
    var st = { lr: D.lr.default, scale: 1, start: D.start.slice(), w: D.start[0], b: D.start[1], path: [], losses: [], count: 0 };
    var heat = { key: '', canvas: null };
    var film = null;

    // ---- the maths of the toy: a line y-hat = w x + b and the mean squared error over the three points
    function points() {
      return D.points.map(function (p) { return [p[0] * st.scale, p[1]]; });
    }
    function lossAt(w, b) {
      var P = points(), s = 0;
      for (var i = 0; i < 3; i++) { var e = w * P[i][0] + b - P[i][1]; s += e * e; }
      return s / 3;
    }
    function gradAt(w, b) {
      var P = points(), e = [], gw = 0, gb = 0;
      for (var i = 0; i < 3; i++) {
        e.push(w * P[i][0] + b - P[i][1]);
        gw += e[i] * P[i][0];
        gb += e[i];
      }
      return { e: e, P: P, L: (e[0] * e[0] + e[1] * e[1] + e[2] * e[2]) / 3, gw: 2 / 3 * gw, gb: 2 / 3 * gb, sumEx: gw, sumE: gb };
    }
    function ranges() {
      return { w: [D.w_range[0] / st.scale, D.w_range[1] / st.scale], b: D.b_range.slice() };
    }
    function best() {
      return [D.best[0] / st.scale, D.best[1]];
    }

    // ---- controls
    var controls = core.el('div', { class: 'lab-controls' });
    var stage = core.el('div', { class: 'lab-stage' });
    var lrS = slider(core, {
      id: ID + '-lr', label: 'Learning rate ' + CH.eta, min: D.lr.min, max: D.lr.max, step: D.lr.step, value: D.lr.default,
      format: function (v) { return short(core, v, 2); },
      hint: 'The size of each step. On these three points any rate above about 0.18 overshoots the valley further at every step.'
    });
    controls.appendChild(lrS.root);
    var b1 = button(core, ID + '-step1', 'One step', true);
    var b10 = button(core, ID + '-step10', 'Ten steps');
    var bReset = button(core, ID + '-reset', 'Reset');
    controls.appendChild(core.el('div', { class: 'button-row' }, [b1, b10, bReset]));
    var scaleT = toggle(core, { id: ID + '-scale10', label: 'Inputs ten times larger' });
    controls.appendChild(core.el('div', { class: 'control-group' }, [
      groupTitle(core, 'Unnormalised inputs'),
      scaleT.root,
      hint(core, 'Multiplies every x by 10, as raw inputs would be on a larger scale. The valley becomes far steeper across, and the same learning rate now overshoots.')
    ]));
    controls.appendChild(hint(core, 'Click or tap the landscape to start from another w and b. With the landscape focused, the arrow keys move the start.'));

    // ---- stage: the data and the landscape side by side, the readouts, the loss per step, the arithmetic
    var dataSvg = svgBox(core, ID + '-data', DATA, DATA, 'The three points, the current line and its errors', 'chart p1-data');
    var land = canvasBox(core, { id: ID + '-landscape', focusable: true, label: 'The loss for every w (across) and b (up). Click to choose where the steps start.' });
    land.canvas.classList.add('drag-surface');
    var landLegend = core.el('span', { class: 'stage-label', id: ID + '-land-label' });
    stage.appendChild(core.el('div', { class: 'stage-row' }, [
      core.el('div', { class: 'stage-cell' }, [dataSvg, core.el('span', { class: 'stage-label', text: 'The points, the line w x + b and its errors' })]),
      core.el('div', { class: 'stage-cell' }, [land.canvas, landLegend])
    ]));
    var out = readoutList(core, [
      ['count', 'steps taken'], ['w', 'w'], ['b', 'b'], ['loss', 'loss L'], ['gw', CH.partial + 'L/' + CH.partial + 'w'], ['gb', CH.partial + 'L/' + CH.partial + 'b']
    ]);
    var vals = {
      count: valueSpan(core, ID + '-count', ''), w: valueSpan(core, ID + '-w', ''), b: valueSpan(core, ID + '-b', ''),
      loss: valueSpan(core, ID + '-loss', ''), lossNote: core.el('span', { class: 'p1-aside', id: ID + '-loss-note' }),
      gw: valueSpan(core, ID + '-gw', ''), gb: valueSpan(core, ID + '-gb', '')
    };
    out.parts('count', [vals.count]);
    out.parts('w', [vals.w]);
    out.parts('b', [vals.b]);
    out.parts('loss', [vals.loss, vals.lossNote]);
    out.parts('gw', [vals.gw]);
    out.parts('gb', [vals.gb]);
    var lossSvg = svgBox(core, ID + '-losses', 300, 150, 'The loss after every step, on a scale of powers of ten', 'chart p1-losses');
    stage.appendChild(core.el('div', { class: 'stage-row' }, [
      core.el('div', { class: 'stage-cell' }, [out.root]),
      core.el('div', { class: 'stage-cell' }, [lossSvg, core.el('span', { class: 'stage-label', text: 'The loss after each step (powers of ten); dashed: the best any line can do' })])
    ]));
    var t = arithTable(core, 'The arithmetic of the next step (every number rounded to three decimals; the lab computes with all the digits, so a step redone from the rounded numbers can differ in its last digit)', ['Point', 'x', 'y', CH.yhat + ' = w x + b', 'e = ' + CH.yhat + ' ' + CH.minus + ' y', 'e' + CH.sup2, 'e ' + CH.times + ' x']);
    t.table.setAttribute('id', ID + '-table');
    stage.appendChild(t.root);
    var stepLines = core.el('div', { class: 'readout p1-steplines', id: ID + '-steplines' });
    stage.appendChild(stepLines);
    body.appendChild(controls);
    body.appendChild(stage);

    // ---- the film, across the whole lab
    var filmBox = core.el('div', { class: 'p1-wide p1-film' });
    filmBox.appendChild(core.el('h4', { class: 'p1-wide-title', text: 'The next ' + D.film_steps + ' steps as a film' }));
    filmBox.appendChild(core.el('p', { class: 'control-hint', text: 'Press play, or step through. Each stop moves w and b one step downhill and writes out its arithmetic, rounded to three decimals. The film starts wherever the lab stands now.' }));
    var filmHost = core.el('div', { class: 'p1-film-host' });
    filmBox.appendChild(filmHost);
    body.appendChild(filmBox);

    // ---- drawing helpers for the data plot and the landscape (shared by the lab and the film)
    function dataGeom(w, h) {
      var xmax = 4 * st.scale;
      return {
        X: function (x) { return 36 + (w - 48) * x / xmax; },
        Y: function (y) { return h - 30 - (h - 48) * (y + 1) / 6; },
        xmax: xmax
      };
    }

    // lineInBox(w, b, xmax): the part of the line y = w x + b with 0 <= x <= xmax and -1 <= y <= 5, as [x0, x1], or null.
    function lineInBox(w, b, xmax) {
      var lo = 0, hi = xmax;
      if (Math.abs(w) < 1e-12) {
        if (b < -1 || b > 5) return null;
      } else {
        var xa = (-1 - b) / w, xb = (5 - b) / w;
        lo = Math.max(lo, Math.min(xa, xb));
        hi = Math.min(hi, Math.max(xa, xb));
      }
      return isFinite(lo) && isFinite(hi) && hi > lo ? [lo, hi] : null;
    }

    // drawData(svgEl, w, b, wd, ht): the points, the line w x + b, its errors and the best line, into an svg.
    function drawData(svgEl, w, b, wd, ht) {
      clearNode(svgEl);
      var G = dataGeom(wd, ht), P = points();
      var grid = core.el('g', { class: 'grid' }), axis = core.el('g', { class: 'axis' });
      for (var y = -1; y <= 5; y++) grid.appendChild(svgLine(core, G.X(0), G.Y(y), G.X(G.xmax), G.Y(y)));
      for (var k = 0; k <= 4; k++) grid.appendChild(svgLine(core, G.X(k * st.scale), G.Y(-1), G.X(k * st.scale), G.Y(5)));
      axis.appendChild(svgLine(core, G.X(0), G.Y(0), G.X(G.xmax), G.Y(0)));
      axis.appendChild(svgLine(core, G.X(0), G.Y(-1), G.X(0), G.Y(5)));
      svgEl.appendChild(grid);
      svgEl.appendChild(axis);
      for (var j = 0; j <= 4; j++) svgEl.appendChild(svgText(core, G.X(j * st.scale), G.Y(-1) + 14, String(j * st.scale), { 'text-anchor': 'middle' }));
      for (var i = -1; i <= 5; i++) svgEl.appendChild(svgText(core, G.X(0) - 6, G.Y(i) + 4, String(i).replace('-', CH.minus), { 'text-anchor': 'end' }));
      svgEl.appendChild(svgText(core, G.X(G.xmax) - 2, G.Y(0) - 6, 'x', { 'text-anchor': 'end' }));
      svgEl.appendChild(svgText(core, G.X(0) + 6, G.Y(5) + 12, 'y', {}));
      // the best line, faint
      var bb = best();
      svgEl.appendChild(svgLine(core, G.X(0), G.Y(bb[1]), G.X(G.xmax), G.Y(bb[0] * G.xmax + bb[1]), 'p1-best-line'));
      // the current line, the part of it inside the plot
      var clip = function (v) { return clamp(v, -1, 5); };
      var seg = lineInBox(w, b, G.xmax);
      if (seg) svgEl.appendChild(svgLine(core, G.X(seg[0]), G.Y(w * seg[0] + b), G.X(seg[1]), G.Y(w * seg[1] + b), 'p1-fit-line'));
      P.forEach(function (p, idx) {
        var yh = clip(w * p[0] + b);
        svgEl.appendChild(svgLine(core, G.X(p[0]), G.Y(p[1]), G.X(p[0]), G.Y(yh), 'p1-error'));
        svgEl.appendChild(core.el('circle', { cx: String(G.X(p[0])), cy: String(G.Y(p[1])), r: '5', class: 'p1-point' }));
        svgEl.appendChild(svgText(core, G.X(p[0]) + 8, (G.Y(p[1]) + G.Y(yh)) / 2 + 4, 'e' + CH.sub[idx + 1], { class: 'p1-small' }));
      });
    }

    // landGeom(): the pixel mapping of the landscape.
    function landGeom(size) {
      var R = ranges(), m = { l: 34, r: 8, t: 8, b: 30 };
      var w = size - m.l - m.r, h = size - m.t - m.b;
      return {
        R: R, m: m, w: w, h: h,
        X: function (wv) { return m.l + (wv - R.w[0]) / (R.w[1] - R.w[0]) * w; },
        Y: function (bv) { return m.t + (1 - (bv - R.b[0]) / (R.b[1] - R.b[0])) * h; },
        W: function (xp) { return R.w[0] + (xp - m.l) / w * (R.w[1] - R.w[0]); },
        B: function (yp) { return R.b[0] + (1 - (yp - m.t) / h) * (R.b[1] - R.b[0]); }
      };
    }

    // heatCanvas(): the landscape's shading, banded by the logarithm of the loss; cached until the scale or the theme changes.
    function heatCanvas() {
      var th = core.theme();
      var key = st.scale + '|' + th.ink + '|' + th.paper;
      if (heat.key === key && heat.canvas) return heat.canvas;
      var G = landGeom(LAND), n = 150;
      var ink = core.parseColour(th.ink) || [20, 24, 29], paper = core.parseColour(th.paper) || [238, 241, 244];
      var vals = new Float64Array(n * n), lo = Infinity, hi = -Infinity;
      for (var j = 0; j < n; j++) {
        for (var i = 0; i < n; i++) {
          var wv = G.R.w[0] + (i + 0.5) / n * (G.R.w[1] - G.R.w[0]);
          var bv = G.R.b[1] - (j + 0.5) / n * (G.R.b[1] - G.R.b[0]);
          var v = Math.log(lossAt(wv, bv));
          vals[j * n + i] = v;
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
      }
      var data = new Uint8ClampedArray(n * n * 4), bands = 12;
      for (var k = 0; k < n * n; k++) {
        var f = (vals[k] - lo) / ((hi - lo) || 1);
        var band = Math.min(bands - 1, Math.floor(f * bands));
        var mixv = 0.18 + 0.82 * (band / (bands - 1));
        var amount = 0.62 * (1 - mixv);
        data[k * 4] = Math.round(paper[0] + (ink[0] - paper[0]) * amount);
        data[k * 4 + 1] = Math.round(paper[1] + (ink[1] - paper[1]) * amount);
        data[k * 4 + 2] = Math.round(paper[2] + (ink[2] - paper[2]) * amount);
        data[k * 4 + 3] = 255;
      }
      try {
        heat.canvas = core.toCanvas(core.makeImageData(n, n, data));
      } catch (e) {
        heat.canvas = null;
      }
      heat.key = key;
      return heat.canvas;
    }

    // drawLandscape(ctx, size, path, current, next, ox, oy): the shading, the axes, the best point, the path, the
    // current point and the next step as an arrow, drawn at (ox, oy) on a context in CSS pixels.
    function drawLandscape(ctx, size, path, current, next, ox, oy) {
      var th = core.theme();
      var G = landGeom(size);
      ctx.save();
      ctx.translate(ox || 0, oy || 0);
      var hc = heatCanvas();
      if (hc) {
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(hc, G.m.l, G.m.t, G.w, G.h);
      }
      ctx.strokeStyle = th.line;
      ctx.lineWidth = 1;
      ctx.strokeRect(G.m.l + 0.5, G.m.t + 0.5, G.w - 1, G.h - 1);
      ctx.fillStyle = th.muted;
      ctx.font = canvasFont(10, 500);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      var R = G.R;
      [0, 0.25, 0.5, 0.75, 1].forEach(function (f) {
        var wv = R.w[0] + f * (R.w[1] - R.w[0]);
        ctx.fillText(short(core, wv, st.scale > 1 ? 3 : 2), G.X(wv), G.m.t + G.h + 4);
      });
      ctx.fillText('w', G.m.l + G.w / 2, G.m.t + G.h + 17);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      [R.b[0], 0, 1, 2].forEach(function (bv) { if (bv >= R.b[0] && bv <= R.b[1]) ctx.fillText(short(core, bv, 1), G.m.l - 4, G.Y(bv)); });
      ctx.fillText('b', G.m.l - 22, G.m.t + 8);
      // clip what follows to the landscape
      ctx.beginPath();
      ctx.rect(G.m.l, G.m.t, G.w, G.h);
      ctx.clip();
      // the best point
      var bp = best();
      ctx.strokeStyle = th.paper;
      ctx.lineWidth = 4;
      crossAt(ctx, G.X(bp[0]), G.Y(bp[1]), 6);
      ctx.strokeStyle = th.ink;
      ctx.lineWidth = 2;
      crossAt(ctx, G.X(bp[0]), G.Y(bp[1]), 6);
      // the path
      if (path.length > 1) {
        ctx.strokeStyle = th.paper;
        ctx.lineWidth = 4;
        polyline(ctx, path, G);
        ctx.strokeStyle = th.ink;
        ctx.lineWidth = 1.6;
        polyline(ctx, path, G);
      }
      path.forEach(function (p, i) {
        if (i === path.length - 1) return;
        ctx.fillStyle = th.ink;
        ctx.beginPath();
        ctx.arc(G.X(p[0]), G.Y(p[1]), 2.2, 0, 2 * Math.PI);
        ctx.fill();
      });
      // the next step, as an arrow
      if (next) {
        var x1 = clamp(G.X(current[0]), -1e4, 1e4), y1 = clamp(G.Y(current[1]), -1e4, 1e4);
        var x2 = clamp(G.X(next[0]), -1e4, 1e4), y2 = clamp(G.Y(next[1]), -1e4, 1e4);
        var dx = x2 - x1, dy = y2 - y1, L = Math.sqrt(dx * dx + dy * dy);
        if (L > 3) {
          ctx.setLineDash([4, 3]);
          ctx.strokeStyle = th.ink;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2 - dx / L * 6, y2 - dy / L * 6);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = th.ink;
          ctx.beginPath();
          ctx.moveTo(x2, y2);
          ctx.lineTo(x2 - dx / L * 9 - dy / L * 4.5, y2 - dy / L * 9 + dx / L * 4.5);
          ctx.lineTo(x2 - dx / L * 9 + dy / L * 4.5, y2 - dy / L * 9 - dx / L * 4.5);
          ctx.closePath();
          ctx.fill();
        }
      }
      // the current point
      var cx = clamp(G.X(current[0]), -1e4, 1e4), cy = clamp(G.Y(current[1]), -1e4, 1e4);
      ctx.fillStyle = th.paper;
      ctx.beginPath();
      ctx.arc(cx, cy, 6.5, 0, 2 * Math.PI);
      ctx.fill();
      ctx.fillStyle = th.ink;
      ctx.beginPath();
      ctx.arc(cx, cy, 4.5, 0, 2 * Math.PI);
      ctx.fill();
      ctx.restore();
    }

    function crossAt(ctx, x, y, r) {
      ctx.beginPath();
      ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r);
      ctx.moveTo(x - r, y + r); ctx.lineTo(x + r, y - r);
      ctx.stroke();
    }

    function polyline(ctx, path, G) {
      ctx.beginPath();
      path.forEach(function (p, i) {
        var x = clamp(G.X(p[0]), -1e4, 1e4), y = clamp(G.Y(p[1]), -1e4, 1e4);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    // inView(p): whether a point lies inside the landscape's ranges.
    function inView(p) {
      var R = ranges();
      return p[0] >= R.w[0] && p[0] <= R.w[1] && p[1] >= R.b[0] && p[1] <= R.b[1];
    }

    // drawLosses(): the loss after every step on a logarithmic scale, and the best loss dashed.
    function drawLosses() {
      clearNode(lossSvg);
      var W = 300, H = 150, m = { l: 40, r: 8, t: 10, b: 24 };
      var Ls = st.losses.filter(function (v) { return isFinite(v) && v > 0; });
      var top = Math.log10(Math.max(D.best_loss * 10, Ls.reduce(function (a, b) { return Math.max(a, b); }, 1)));
      var bottom = Math.log10(D.best_loss) - 0.15;
      top = Math.max(top, bottom + 1);
      var n = Math.max(st.losses.length - 1, 10);
      var X = function (i) { return m.l + (W - m.l - m.r) * i / n; };
      var Y = function (v) { return m.t + (H - m.t - m.b) * (1 - (Math.log10(Math.max(v, 1e-12)) - bottom) / (top - bottom)); };
      var grid = core.el('g', { class: 'grid' }), axis = core.el('g', { class: 'axis' });
      for (var p = Math.ceil(bottom); p <= Math.floor(top); p++) {
        grid.appendChild(svgLine(core, m.l, Y(Math.pow(10, p)), W - m.r, Y(Math.pow(10, p))));
        lossSvg.appendChild(svgText(core, m.l - 4, Y(Math.pow(10, p)) + 4, p >= 0 ? String(Math.pow(10, p)) : core.fmt(Math.pow(10, p), -p), { 'text-anchor': 'end' }));
      }
      axis.appendChild(svgLine(core, m.l, H - m.b, W - m.r, H - m.b));
      axis.appendChild(svgLine(core, m.l, m.t, m.l, H - m.b));
      lossSvg.appendChild(grid);
      lossSvg.appendChild(axis);
      lossSvg.appendChild(svgText(core, W - m.r, H - 6, 'step ' + (st.losses.length - 1), { 'text-anchor': 'end' }));
      lossSvg.appendChild(svgText(core, m.l, H - 6, '0', { 'text-anchor': 'middle' }));
      lossSvg.appendChild(svgLine(core, m.l, Y(D.best_loss), W - m.r, Y(D.best_loss), 'p1-best-line'));
      var pts = [];
      st.losses.forEach(function (v, i) {
        if (!isFinite(v)) return;
        pts.push((Math.round(X(i) * 10) / 10) + ',' + (Math.round(clamp(Y(v), -50, H + 50) * 10) / 10));
      });
      if (pts.length > 1) lossSvg.appendChild(core.el('polyline', { points: pts.join(' '), class: 'series' }));
      if (pts.length) {
        var last = pts[pts.length - 1].split(',');
        lossSvg.appendChild(core.el('circle', { cx: last[0], cy: last[1], r: '3', class: 'dot' }));
      }
    }

    // drawTable(g): the arithmetic of the next step from the current w and b.
    function drawTable(g) {
      clearNode(t.body);
      clearNode(t.foot);
      for (var i = 0; i < 3; i++) {
        var p = g.P[i], yh = st.w * p[0] + st.b;
        t.body.appendChild(row(core, [String(i + 1), short(core, p[0], 3), short(core, p[1], 3), num(core, yh), num(core, g.e[i]),
          num(core, g.e[i] * g.e[i]), num(core, g.e[i] * p[0])], true));
      }
      t.foot.appendChild(row(core, ['Sum', '', '', '', num(core, g.sumE), num(core, g.e[0] * g.e[0] + g.e[1] * g.e[1] + g.e[2] * g.e[2]), num(core, g.sumEx)], true));
      var eta = short(core, st.lr, 2);
      var nw = st.w - st.lr * g.gw, nb = st.b - st.lr * g.gb;
      clearNode(stepLines);
      [
        'L = ' + CH.sigma + 'e' + CH.sup2 + ' / 3 = ' + num(core, g.L),
        CH.partial + 'L/' + CH.partial + 'w = (2/3) ' + CH.sigma + ' e ' + CH.times + ' x = (2/3) ' + CH.times + ' ' + paren(core, g.sumEx, 3) + ' = ' + num(core, g.gw),
        CH.partial + 'L/' + CH.partial + 'b = (2/3) ' + CH.sigma + ' e = (2/3) ' + CH.times + ' ' + paren(core, g.sumE, 3) + ' = ' + num(core, g.gb),
        'w ' + CH.larr + ' ' + num(core, st.w) + ' ' + CH.minus + ' ' + eta + ' ' + CH.times + ' ' + paren(core, g.gw, 3) + ' = ' + num(core, nw),
        'b ' + CH.larr + ' ' + num(core, st.b) + ' ' + CH.minus + ' ' + eta + ' ' + CH.times + ' ' + paren(core, g.gb, 3) + ' = ' + num(core, nb),
        'loss after this step: ' + num(core, lossAt(nw, nb))
      ].forEach(function (line) { stepLines.appendChild(core.el('p', { text: line })); });
    }

    // drawAll(): every part of the lab, then the film rebuilt from where the lab stands.
    function drawAll() {
      var g = gradAt(st.w, st.b);
      drawData(dataSvg, st.w, st.b, DATA, DATA);
      var ctx = land.begin(LAND, LAND);
      var next = [st.w - st.lr * g.gw, st.b - st.lr * g.gb];
      drawLandscape(ctx, LAND, st.path, [st.w, st.b], next, 0, 0);
      landLegend.textContent = 'The loss landscape: ' + (core.theme().dark ? 'lighter' : 'darker') + ' where the loss is lower; ' + CH.times +
        ' marks the lowest point (w ' + short(core, best()[0], 3) + ', b 1); the dashed arrow is the next step';
      vals.count.textContent = String(st.count);
      vals.w.textContent = big(st.w);
      vals.b.textContent = big(st.b);
      vals.loss.textContent = isFinite(g.L) ? big(g.L) : 'too large to show';
      vals.lossNote.textContent = !inView([st.w, st.b]) ? ' (the steps have left the picture: the loss is growing)'
        : (Math.abs(g.L - D.best_loss) < 5e-4 ? ' (the best any line can do)' : '');
      vals.gw.textContent = big(g.gw);
      vals.gb.textContent = big(g.gb);
      drawLosses();
      drawTable(g);
      buildFilm();
    }

    // big(x): three decimals for an ordinary number, powers of ten once the steps have run away.
    function big(x) {
      return Math.abs(x) < 1e6 ? num(core, x) : core.fmtSci(x, 2);
    }

    var redraw = later(body, core, drawAll);

    // reset(): back to the start, the path and the losses cleared.
    function reset() {
      st.w = st.start[0];
      st.b = st.start[1];
      st.path = [[st.w, st.b]];
      st.losses = [lossAt(st.w, st.b)];
      st.count = 0;
    }

    // step(n): n steps of gradient descent from the current w and b.
    function step(n) {
      for (var i = 0; i < n; i++) {
        var g = gradAt(st.w, st.b);
        var nw = st.w - st.lr * g.gw, nb = st.b - st.lr * g.gb;
        if (!isFinite(nw) || !isFinite(nb) || Math.abs(nw) > 1e150 || Math.abs(nb) > 1e150) break;
        st.w = nw;
        st.b = nb;
        st.count += 1;
        st.path.push([st.w, st.b]);
        st.losses.push(lossAt(st.w, st.b));
        if (st.path.length > D.max_path) {
          st.path.shift();
          st.losses.shift();
        }
      }
    }

    // ---- the film: the next steps from where the lab stands, one stop per step
    function buildFilm() {
      var Scenes = filmApi();
      if (film && typeof film.destroy === 'function') {
        try { film.destroy(); } catch (e) { /* a film that cannot be destroyed is replaced anyway */ }
      }
      film = null;
      clearNode(filmHost);
      if (!Scenes) {
        filmHost.appendChild(core.el('p', { class: 'control-hint', text: 'The film needs the page' + CH.rsquo + 's scenes engine, which did not load.' }));
        return;
      }
      var steps = [], w = st.w, b = st.b, lr = st.lr, path0 = st.path.slice(-40);
      for (var k = 0; k < D.film_steps; k++) {
        var g = gradAt(w, b);
        var nw = w - lr * g.gw, nb = b - lr * g.gb;
        steps.push({ w: w, b: b, g: g, nw: nw, nb: nb, after: lossAt(nw, nb) });
        if (!isFinite(nw) || !isFinite(nb)) break;
        w = nw;
        b = nb;
      }
      var stops = steps.map(function (s, k) {
        var eta = short(core, lr, 2);
        var explain = '<p>From w = ' + escapeHtml(num(core, s.w)) + ', b = ' + escapeHtml(num(core, s.b)) + ' the errors are (' +
          escapeHtml(s.g.e.map(function (v) { return num(core, v); }).join(', ')) + '), so L = ' + escapeHtml(num(core, s.g.L)) +
          '. The gradient is ' + CH.partial + 'L/' + CH.partial + 'w = ' + escapeHtml(num(core, s.g.gw)) + ' and ' + CH.partial + 'L/' + CH.partial + 'b = ' +
          escapeHtml(num(core, s.g.gb)) + '. One step at ' + CH.eta + ' = ' + eta + ': w ' + CH.larr + ' ' + escapeHtml(num(core, s.w)) + ' ' + CH.minus + ' ' + eta +
          ' ' + CH.times + ' ' + escapeHtml(paren(core, s.g.gw, 3)) + ' = ' + escapeHtml(num(core, s.nw)) + ' and b ' + CH.larr + ' ' + escapeHtml(num(core, s.b)) + ' ' + CH.minus + ' ' +
          eta + ' ' + CH.times + ' ' + escapeHtml(paren(core, s.g.gb, 3)) + ' = ' + escapeHtml(num(core, s.nb)) + '. The loss becomes ' +
          escapeHtml(isFinite(s.after) && s.after < 1e6 ? num(core, s.after) : 'very large') + '. <span class="mark mark-toy">Toy</span></p>';
        return {
          id: 'step-' + (st.count + k + 1),
          title: 'Step ' + (st.count + k + 1),
          duration: 2.4,
          explain: explain,
          still: function (stageEl) { paintFilm(stageEl, k, 1); },
          draw: function (stageEl, state, tt) { paintFilm(stageEl, k, tt); }
        };
      });
      // paintFilm(stageEl, k, tt): stop k at time tt from 0 to 1: the line and the point move from one step to the next.
      function paintFilm(stageEl, k, tt) {
        var s = steps[k];
        var e = tt < 0.5 ? 2 * tt * tt : 1 - Math.pow(-2 * tt + 2, 2) / 2;
        var w = s.w + (s.nw - s.w) * e, b = s.b + (s.nb - s.b) * e;
        var Scn = filmApi();
        var cv = Scn && typeof Scn.surface === 'function' ? Scn.surface(stageEl, 'canvas', { 'aria-label': 'Step ' + (st.count + k + 1) + ' of gradient descent', role: 'img' }) : null;
        if (!cv || typeof cv.getContext !== 'function') return;
        var Wd = 600, Ht = LAND;
        var ctx = core.fitCanvas(cv, Wd, Ht);
        var th = core.theme();
        ctx.clearRect(0, 0, Wd, Ht);
        // left: the points and the moving line
        var G = dataGeom(290, Ht), P = points();
        ctx.strokeStyle = th.line;
        ctx.lineWidth = 1;
        for (var y = -1; y <= 5; y++) { ctx.beginPath(); ctx.moveTo(G.X(0), G.Y(y)); ctx.lineTo(G.X(G.xmax), G.Y(y)); ctx.stroke(); }
        ctx.strokeStyle = th.muted;
        ctx.beginPath(); ctx.moveTo(G.X(0), G.Y(0)); ctx.lineTo(G.X(G.xmax), G.Y(0)); ctx.stroke();
        var clip = function (v) { return clamp(v, -40, 10); };
        ctx.save();
        ctx.beginPath();
        ctx.rect(G.X(0), G.Y(5), G.X(G.xmax) - G.X(0), G.Y(-1) - G.Y(5));
        ctx.clip();
        P.forEach(function (p) {
          ctx.setLineDash([3, 3]);
          ctx.strokeStyle = th.muted;
          ctx.beginPath(); ctx.moveTo(G.X(p[0]), G.Y(p[1])); ctx.lineTo(G.X(p[0]), G.Y(clip(w * p[0] + b))); ctx.stroke();
          ctx.setLineDash([]);
        });
        ctx.strokeStyle = th.ink;
        ctx.lineWidth = 2;
        var seg = lineInBox(w, b, G.xmax);
        if (seg) { ctx.beginPath(); ctx.moveTo(G.X(seg[0]), G.Y(w * seg[0] + b)); ctx.lineTo(G.X(seg[1]), G.Y(w * seg[1] + b)); ctx.stroke(); }
        ctx.restore();
        P.forEach(function (p) {
          ctx.fillStyle = th.ink;
          ctx.beginPath(); ctx.arc(G.X(p[0]), G.Y(p[1]), 4.5, 0, 2 * Math.PI); ctx.fill();
        });
        ctx.fillStyle = th.muted;
        ctx.font = canvasFont(11, 500);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText('w = ' + num(core, w) + ', b = ' + num(core, b), G.X(0) + 4, 4);
        ctx.fillText('L = ' + (isFinite(lossAt(w, b)) && lossAt(w, b) < 1e6 ? num(core, lossAt(w, b)) : 'very large'), G.X(0) + 4, 18);
        // right: the landscape with the path so far, the moving point and the step's arrow
        var path = path0.concat(steps.slice(0, k).map(function (q) { return [q.nw, q.nb]; }));
        path.push([w, b]);
        drawLandscape(ctx, LAND, path, [w, b], tt < 1 ? [s.nw, s.nb] : null, 300, 0);
      }
      if (!stops.length) return;
      film = Scenes.create(filmHost, { stops: stops, state: {}, speed: 1, label: 'Gradient descent, step by step' });
    }

    // ---- events
    lrS.input.addEventListener('input', core.guard(body, function () { st.lr = lrS.value(); lrS.show(); redraw(); }));
    lrS.input.addEventListener('change', core.guard(body, function () { st.lr = lrS.value(); lrS.show(); redraw(); }));
    b1.addEventListener('click', core.guard(body, function () { step(1); drawAll(); }));
    b10.addEventListener('click', core.guard(body, function () { step(10); drawAll(); }));
    bReset.addEventListener('click', core.guard(body, function () { reset(); drawAll(); }));
    scaleT.input.addEventListener('change', core.guard(body, function () {
      var was = st.scale;
      st.scale = scaleT.input.checked ? D.scale : 1;
      st.start = [st.start[0] * was / st.scale, st.start[1]];
      reset();
      drawAll();
    }));
    var setStart = core.guard(body, function (ev) {
      var p = land.point(ev);
      var G = landGeom(LAND);
      if (p.x < G.m.l || p.x > G.m.l + G.w || p.y < G.m.t || p.y > G.m.t + G.h) return;
      st.start = [G.W(p.x), G.B(p.y)];
      reset();
      drawAll();
    });
    land.canvas.addEventListener('pointerdown', setStart);
    land.canvas.addEventListener('keydown', core.guard(body, function (ev) {
      var R = ranges();
      var d = arrowDelta(ev, [0.05, 0.25]);
      if (!d) return;
      ev.preventDefault();
      st.start = [clamp(st.start[0] + d[0] * (R.w[1] - R.w[0]) / 2, R.w[0], R.w[1]), clamp(st.start[1] + d[1] * (R.b[1] - R.b[0]) / 2, R.b[0], R.b[1])];
      reset();
      drawAll();
    }));
    core.on('theme-changed', core.guard(body, function () { heat.key = ''; drawAll(); }));

    reset();
    drawAll();
  });

  // ------------------------------------------------------------------ Lab 1D: turning scores into shares

  Labs.register('lab-1d-softmax', function mount(body, core) {
    var ID = 'lab-1d-softmax';
    var D = DEFAULTS['1d'];
    var LOG_MIN = Math.log10(D.tau.min), LOG_MAX = Math.log10(D.tau.max);
    var st = { z: D.z.slice(), tau: D.tau.default, grad: false, target: D.target };

    // softmax(z, tau): the shares, the scaled scores, the shifted ones and their powers (the largest subtracted first).
    function softmax(z, tau) {
      var s = z.map(function (v) { return v / tau; });
      var m = Math.max.apply(null, s);
      var sh = s.map(function (v) { return v - m; });
      var ex = sh.map(function (v) { return Math.exp(v); });
      var sum = ex[0] + ex[1] + ex[2];
      return { s: s, m: m, sh: sh, ex: ex, sum: sum, p: ex.map(function (v) { return v / sum; }) };
    }
    function entropy(p) {
      var h = 0;
      p.forEach(function (q) { if (q > 0) h -= q * Math.log(q); });
      return h;
    }
    function tauText(tau) {
      return short(core, sig(tau, 3), 3);
    }

    // ---- controls
    var controls = core.el('div', { class: 'lab-controls' });
    var stage = core.el('div', { class: 'lab-stage' });
    var zS = [0, 1, 2].map(function (i) {
      return slider(core, {
        id: ID + '-z' + i, label: 'Score z' + CH.sub[i + 1], min: D.z_range[0], max: D.z_range[1], step: D.z_step, value: st.z[i],
        format: function (v) { return core.fmt(v, 2); }
      });
    });
    controls.appendChild(core.el('div', { class: 'control-group' }, [groupTitle(core, 'Three scores')].concat(zS.map(function (s) { return s.root; }))));
    var tauS = slider(core, {
      id: ID + '-tau', label: 'Temperature ' + CH.tau, min: LOG_MIN, max: LOG_MAX, step: 0.001, value: Math.log10(st.tau),
      format: function (v) { return tauText(Math.pow(10, v)); },
      hint: 'The slider runs on a scale of powers of ten, from 0.04 to 5.'
    });
    controls.appendChild(tauS.root);
    var presets = {
      one: button(core, ID + '-preset-one', CH.tau + ' = 1'),
      rule: button(core, ID + '-preset-rule', 'Our rule, 0.2'),
      student: button(core, ID + '-preset-student', 'DINO' + CH.rsquo + 's student, 0.1'),
      teacher: button(core, ID + '-preset-teacher', 'Our runs' + CH.rsquo + ' teacher, 0.04'),
      flat: button(core, ID + '-preset-flat', CH.tau + ' = 5')
    };
    controls.appendChild(core.el('div', { class: 'control-group' }, [
      groupTitle(core, 'The course' + CH.rsquo + 's temperatures'),
      core.el('div', { class: 'button-row' }, [presets.one, presets.rule, presets.student, presets.teacher, presets.flat])
    ]));
    var gradT = toggle(core, { id: ID + '-grad', label: 'Show the gradient for a target' });
    var targetSeg = segmented(core, {
      id: ID + '-target', label: 'Target',
      options: [{ value: 0, text: 'option 1' }, { value: 1, text: 'option 2' }, { value: 2, text: 'option 3' }], value: st.target,
      hint: 'With a target, the loss is ' + CH.minus + 'ln p of the target: the target is the positive (orange), the others the negatives (purple), as in Part 5' + CH.rsquo + 's loss.'
    });
    targetSeg.root.hidden = true;
    controls.appendChild(core.el('div', { class: 'control-group' }, [gradT.root, targetSeg.root]));

    // ---- stage
    var bars = svgBox(core, ID + '-bars', 340, 210, 'The three shares as bars', 'chart p1-bars');
    var ent = core.el('p', { class: 'readout', id: ID + '-entropy' });
    var entBar = svgBox(core, ID + '-entropy-bar', 300, 34, 'The entropy between 0 and ln 3', 'chart p1-meter');
    var gradBox = core.el('div', { class: 'p1-grad', id: ID + '-gradbox' });
    gradBox.hidden = true;
    stage.appendChild(core.el('div', { class: 'stage-row' }, [
      core.el('div', { class: 'stage-cell' }, [bars, core.el('span', { class: 'stage-label', text: 'The shares after the softmax; they always add up to 1' })]),
      core.el('div', { class: 'stage-cell p1-cell-readout' }, [ent, entBar, gradBox])
    ]));
    var t = arithTable(core, 'Every step of the softmax at this temperature: the plain powers, and the same with the largest subtracted first, as code does it (rounded for display; the lab computes with all the digits)',
      ['Option', 'score z', 'z / ' + CH.tau, 'e to z / ' + CH.tau, 'minus the largest', 'e to that', 'share p']);
    stage.appendChild(t.root);
    var sweep = svgBox(core, ID + '-sweep', 520, 230, 'The three shares at every temperature from 0.04 to 5; the vertical line is the temperature you chose', 'chart p1-sweep');
    stage.appendChild(core.el('div', { class: 'stage-cell' }, [sweep, core.el('span', { class: 'stage-label', text: 'Every temperature at once: left, sharp; right, flat. The line marks your temperature.' })]));
    body.appendChild(controls);
    body.appendChild(stage);

    var CLASSES = ['p1-opt1', 'p1-opt2', 'p1-opt3'];

    // roleOf(i): the role class of option i: positive for the target and negative for the others when the gradient is shown.
    function roleOf(i) {
      if (!st.grad) return CLASSES[i];
      return i === st.target ? 'role-positive' : 'role-negative';
    }

    // drawBars(r): the three shares as bars, with their values and the scores below.
    function drawBars(r) {
      clearNode(bars);
      var W = 340, H = 210, base = 160, top = 20, bw = 70;
      var axis = core.el('g', { class: 'axis' });
      axis.appendChild(svgLine(core, 30, base, W - 10, base));
      bars.appendChild(axis);
      var grid = core.el('g', { class: 'grid' });
      [0.25, 0.5, 0.75, 1].forEach(function (v) {
        grid.appendChild(svgLine(core, 30, base - (base - top) * v, W - 10, base - (base - top) * v));
        bars.appendChild(svgText(core, 26, base - (base - top) * v + 4, short(core, v, 2), { 'text-anchor': 'end' }));
      });
      bars.insertBefore(grid, axis);
      for (var i = 0; i < 3; i++) {
        var x = 50 + i * 95, h = (base - top) * r.p[i];
        var g = core.el('g', { class: roleOf(i) });
        g.appendChild(core.el('rect', { x: String(x), y: String(Math.round((base - h) * 10) / 10), width: String(bw), height: String(Math.max(0.5, Math.round(h * 10) / 10)), class: 'bar' + (st.grad ? '' : ' p1-bar-' + (i + 1)) }));
        bars.appendChild(g);
        bars.appendChild(svgText(core, x + bw / 2, base - h - 6, num(core, r.p[i]), { 'text-anchor': 'middle', class: 'p1-ink' }));
        bars.appendChild(svgText(core, x + bw / 2, base + 16, 'option ' + (i + 1), { 'text-anchor': 'middle' }));
        bars.appendChild(svgText(core, x + bw / 2, base + 31, 'z = ' + core.fmt(st.z[i], 2), { 'text-anchor': 'middle' }));
      }
    }

    // drawEntropy(r): the entropy and where it lies between 0 and ln 3.
    function drawEntropy(r) {
      var h = entropy(r.p), hmax = Math.log(3);
      ent.textContent = 'Entropy H = ' + CH.minus + CH.sigma + ' p ln p = ' + num(core, h) + ', of at most ln 3 = ' + num(core, hmax) +
        (h < 0.05 ? ': one option takes almost everything.' : (h > hmax - 0.02 ? ': the shares are almost equal.' : '.'));
      clearNode(entBar);
      var x0 = 10, x1 = 290, y = 14;
      var axis = core.el('g', { class: 'axis' });
      axis.appendChild(svgLine(core, x0, y, x1, y));
      entBar.appendChild(axis);
      entBar.appendChild(core.el('rect', { x: String(x0), y: String(y - 5), width: String(Math.round((x1 - x0) * h / hmax * 10) / 10), height: '10', class: 'p1-ent-fill' }));
      entBar.appendChild(svgText(core, x0, y + 18, '0: decided', { 'text-anchor': 'start' }));
      entBar.appendChild(svgText(core, x1, y + 18, 'ln 3: undecided', { 'text-anchor': 'end' }));
    }

    // drawTable(r): every step of the arithmetic.
    function drawTable(r) {
      clearNode(t.body);
      clearNode(t.foot);
      var plain = r.s.map(function (v) { return Math.exp(v); });
      var huge = function (v) { return isFinite(v) && v < 1e9 ? num(core, v) : core.fmtSci(v, 3); };
      for (var i = 0; i < 3; i++) {
        var tr = row(core, ['option ' + (i + 1), core.fmt(st.z[i], 2), num(core, r.s[i]), huge(plain[i]), num(core, r.sh[i]), num(core, r.ex[i], 4), valueSpan(core, ID + '-p' + i, num(core, r.p[i]))], true);
        t.body.appendChild(tr);
      }
      t.foot.appendChild(row(core, ['Sum', '', '', huge(plain[0] + plain[1] + plain[2]), '', num(core, r.sum, 4), '1.000'], true));
    }

    // drawGrad(r): the loss of the target and its gradient on the three scores, as text and bars.
    function drawGrad(r) {
      gradBox.hidden = !st.grad;
      clearNode(gradBox);
      if (!st.grad) return;
      var k = st.target, tau = st.tau;
      var g = r.p.map(function (p, i) { return (p - (i === k ? 1 : 0)) / tau; });
      // the share with four significant digits, so that the logarithm of the shown number gives the shown loss
      var pd = clamp(3 - Math.floor(Math.log10(Math.max(r.p[k], 1e-12))), 3, 12);
      gradBox.appendChild(core.el('p', { class: 'readout', id: ID + '-loss', text: 'Loss ' + CH.minus + 'ln p' + CH.sub[k + 1] + ' = ' + CH.minus + 'ln ' + num(core, r.p[k], pd) + ' = ' + num(core, -Math.log(r.p[k])) }));
      gradBox.appendChild(core.el('p', { class: 'readout', text: 'Gradient (p ' + CH.minus + ' target) / ' + CH.tau + ' = (' + g.map(function (v) { return num(core, v); }).join(', ') + ')' }));
      var gs = svgBox(core, ID + '-gradbars', 300, 120, 'The step against the gradient on each score: an upward bar is the target' + CH.rsquo + 's pull up, a downward bar a push down', 'chart p1-gradbars');
      var mid = 60, sc = 40 / Math.max(1e-9, Math.max.apply(null, g.map(Math.abs)));
      gs.appendChild(core.el('g', { class: 'axis' }, svgLine(core, 10, mid, 290, mid)));
      for (var i = 0; i < 3; i++) {
        var x = 30 + i * 90, h = -g[i] * sc;
        var grp = core.el('g', { class: i === k ? 'role-positive' : 'role-negative' });
        grp.appendChild(core.el('rect', { x: String(x), y: String(Math.round(Math.min(mid, mid - h) * 10) / 10), width: '60', height: String(Math.max(0.5, Math.round(Math.abs(h) * 10) / 10)), class: 'bar' }));
        gs.appendChild(grp);
        gs.appendChild(svgText(core, x + 30, h > 0 ? mid - h - 5 : mid - h + 13, (i === k ? 'pull ' : 'push ') + short(core, Math.abs(g[i]), 3), { 'text-anchor': 'middle', class: 'p1-ink' }));
      }
      gradBox.appendChild(gs);
      gradBox.appendChild(core.el('p', {
        class: 'control-hint',
        text: 'Downhill is against the gradient: the target' + CH.rsquo + 's score rises by (1 ' + CH.minus + ' p) / ' + CH.tau + ' per unit of step, and each other score falls by its own share / ' + CH.tau + '. A small ' + CH.tau + ' makes both larger until the target dominates.'
      }));
    }

    // drawSweep(): the three shares across every temperature from 0.04 to 5, and the chosen temperature.
    function drawSweep() {
      clearNode(sweep);
      var W = 520, H = 230, m = { l: 40, r: 12, t: 12, b: 40 };
      var X = function (lt) { return m.l + (W - m.l - m.r) * (lt - LOG_MIN) / (LOG_MAX - LOG_MIN); };
      var Y = function (p) { return m.t + (H - m.t - m.b) * (1 - p); };
      var grid = core.el('g', { class: 'grid' }), axis = core.el('g', { class: 'axis' });
      [0, 0.25, 0.5, 0.75, 1].forEach(function (p) {
        grid.appendChild(svgLine(core, m.l, Y(p), W - m.r, Y(p)));
        sweep.appendChild(svgText(core, m.l - 6, Y(p) + 4, short(core, p, 2), { 'text-anchor': 'end' }));
      });
      [0.04, 0.1, 0.2, 0.5, 1, 2, 5].forEach(function (tv) {
        grid.appendChild(svgLine(core, X(Math.log10(tv)), m.t, X(Math.log10(tv)), H - m.b));
        sweep.appendChild(svgText(core, X(Math.log10(tv)), H - m.b + 15, short(core, tv, 2), { 'text-anchor': 'middle' }));
      });
      axis.appendChild(svgLine(core, m.l, H - m.b, W - m.r, H - m.b));
      axis.appendChild(svgLine(core, m.l, m.t, m.l, H - m.b));
      sweep.appendChild(grid);
      sweep.appendChild(axis);
      sweep.appendChild(svgText(core, (m.l + W - m.r) / 2, H - 6, 'temperature ' + CH.tau, { 'text-anchor': 'middle' }));
      var n = D.sweep_samples, lines = [[], [], []];
      for (var s = 0; s <= n; s++) {
        var lt = LOG_MIN + (LOG_MAX - LOG_MIN) * s / n;
        var r = softmax(st.z, Math.pow(10, lt));
        for (var i = 0; i < 3; i++) lines[i].push((Math.round(X(lt) * 10) / 10) + ',' + (Math.round(Y(r.p[i]) * 10) / 10));
      }
      for (var j = 0; j < 3; j++) {
        var g = core.el('g', { class: roleOf(j) });
        g.appendChild(core.el('polyline', { points: lines[j].join(' '), class: 'series p1-sweep-' + (j + 1) }));
        sweep.appendChild(g);
      }
      var xc = X(Math.log10(st.tau));
      sweep.appendChild(svgLine(core, xc, m.t, xc, H - m.b, 'p1-cursor'));
      var rr = softmax(st.z, st.tau);
      for (var q = 0; q < 3; q++) {
        var gg = core.el('g', { class: roleOf(q) });
        gg.appendChild(core.el('circle', { cx: String(Math.round(xc * 10) / 10), cy: String(Math.round(Y(rr.p[q]) * 10) / 10), r: '4', class: 'dot' }));
        sweep.appendChild(gg);
      }
      var lx = W - m.r - 4;
      ['option 1', 'option 2', 'option 3'].forEach(function (label, i) {
        var y = m.t + 12 + i * 14;
        var g = core.el('g', { class: roleOf(i) });
        g.appendChild(core.el('line', { x1: String(lx - 86), y1: String(y - 4), x2: String(lx - 66), y2: String(y - 4), class: 'series p1-sweep-' + (i + 1) }));
        sweep.appendChild(g);
        sweep.appendChild(svgText(core, lx, y, label, { 'text-anchor': 'end' }));
      });
    }

    // drawAll(): every part of the lab for the current scores and temperature.
    function drawAll() {
      zS.forEach(function (s) { s.show(); });
      // the output shows the temperature itself: a preset's exact value, which the slider's step may round
      tauS.output.textContent = tauText(st.tau);
      var r = softmax(st.z, st.tau);
      drawBars(r);
      drawEntropy(r);
      drawTable(r);
      drawGrad(r);
      drawSweep();
      targetSeg.root.hidden = !st.grad;
    }

    var redraw = later(body, core, drawAll);

    // setTau(tau): choose a temperature exactly (a preset) and move the slider to it.
    function setTau(tau) {
      st.tau = tau;
      tauS.input.value = String(Math.log10(tau));
      drawAll();
    }

    zS.forEach(function (s, i) {
      var on = core.guard(body, function () { st.z[i] = s.value(); redraw(); });
      s.input.addEventListener('input', on);
      s.input.addEventListener('change', on);
    });
    var onTau = core.guard(body, function () { st.tau = sig(Math.pow(10, tauS.value()), 3); drawAll(); });
    tauS.input.addEventListener('input', onTau);
    tauS.input.addEventListener('change', onTau);
    Object.keys(presets).forEach(function (k) {
      presets[k].addEventListener('click', core.guard(body, function () { setTau(D.presets[k]); }));
    });
    gradT.input.addEventListener('change', core.guard(body, function () { st.grad = !!gradT.input.checked; drawAll(); }));
    targetSeg.onChange(core.guard(body, function () { st.target = Number(targetSeg.value()); drawAll(); }));
    core.on('theme-changed', redraw);

    drawAll();
  });

  // ------------------------------------------------------------------ Lab 1E: one layer, by hand

  Labs.register('lab-1e-layer', function mount(body, core) {
    var ID = 'lab-1e-layer';
    var D = DEFAULTS['1e'];
    var st = {
      x: D.x.slice(), W: D.W.map(function (r) { return r.slice(); }), b: D.b.slice(), bend: D.bend,
      second: D.second, v: D.v.slice(), c: D.c, rng: null
    };
    var BENDS = {
      none: { name: 'no bend', f: function (z) { return z; } },
      relu: { name: 'ReLU', f: function (z) { return Math.max(0, z); } },
      gelu: { name: 'GELU', f: function (z) { return z * Phi(z); } }
    };
    var R = D.input_range;

    // ---- controls
    var controls = core.el('div', { class: 'lab-controls' });
    var stage = core.el('div', { class: 'lab-stage' });
    var boxes = { x: [], W: [[], []], b: [], v: [], c: null };
    var opt = { step: D.input_step, min: R[0], max: R[1] };
    // inRow(label, list): one labelled row of number boxes.
    function inRow(label, list) {
      return core.el('div', { class: 'p1-inrow' }, [core.el('span', { class: 'p1-inrow-label', html: label })].concat(list));
    }
    for (var i = 0; i < 3; i++) {
      boxes.x.push(numberBox(core, ID + '-x' + i, st.x[i], { label: 'input x' + (i + 1), step: opt.step, min: opt.min, max: opt.max }));
    }
    for (var j = 0; j < 2; j++) {
      for (var k = 0; k < 3; k++) {
        boxes.W[j].push(numberBox(core, ID + '-w' + j + k, st.W[j][k], { label: 'weight from x' + (k + 1) + ' to z' + (j + 1), step: opt.step, min: opt.min, max: opt.max }));
      }
      boxes.b.push(numberBox(core, ID + '-b' + j, st.b[j], { label: 'bias of z' + (j + 1), step: opt.step, min: opt.min, max: opt.max }));
    }
    controls.appendChild(core.el('div', { class: 'control-group' }, [
      groupTitle(core, 'Inputs, weights and biases'),
      inRow('x', boxes.x),
      inRow('to z' + CH.sub[1], boxes.W[0]),
      inRow('to z' + CH.sub[2], boxes.W[1]),
      inRow('biases', boxes.b),
      hint(core, 'The row "to z' + CH.sub[1] + '" holds the weights that multiply x' + CH.sub[1] + ', x' + CH.sub[2] + ' and x' + CH.sub[3] + ' on their way to z' + CH.sub[1] + '. Any number from ' + CH.minus + '9 to 9, in steps of 0.5 with the arrows of a box.')
    ]));
    var bendSeg = segmented(core, {
      id: ID + '-bend', label: 'The bend',
      options: [{ value: 'none', text: 'none' }, { value: 'relu', text: 'ReLU' }, { value: 'gelu', text: 'GELU' }], value: st.bend,
      hint: 'GELU is the bend inside every block of the real model' + CH.rsquo + 's transformer.'
    });
    controls.appendChild(bendSeg.root);
    var secondT = toggle(core, { id: ID + '-second', label: 'Add a second layer, 2 to 1', checked: st.second });
    var vRow = core.el('div', { class: 'p1-vrow' });
    boxes.v.push(numberBox(core, ID + '-v0', st.v[0], { label: 'weight from y1', step: opt.step, min: opt.min, max: opt.max }));
    boxes.v.push(numberBox(core, ID + '-v1', st.v[1], { label: 'weight from y2', step: opt.step, min: opt.min, max: opt.max }));
    boxes.c = numberBox(core, ID + '-c', st.c, { label: 'bias of the output', step: opt.step, min: opt.min, max: opt.max });
    vRow.appendChild(core.el('span', { text: 'v' + CH.sub[1] }));
    vRow.appendChild(boxes.v[0]);
    vRow.appendChild(core.el('span', { text: 'v' + CH.sub[2] }));
    vRow.appendChild(boxes.v[1]);
    vRow.appendChild(core.el('span', { text: 'c' }));
    vRow.appendChild(boxes.c);
    var secondGroup = core.el('div', { class: 'control-group' }, [secondT.root, vRow,
      hint(core, 'With no bend, the second layer reports the single layer that does the same job.')]);
    controls.appendChild(secondGroup);
    var bReset = button(core, ID + '-reset', 'The worked example');
    var bRandom = button(core, ID + '-random', 'Random numbers');
    controls.appendChild(core.el('div', { class: 'button-row' }, [bReset, bRandom]));

    // ---- stage
    var net = svgBox(core, ID + '-net', 640, 300, 'The layer as arrows: three inputs on the left, two outputs on the right, each arrow with its weight and its product', 'chart p1-net');
    var sums = core.el('div', { class: 'readout p1-sums', id: ID + '-sums' });
    var curve = svgBox(core, ID + '-curve', 300, 210, 'The bend as a curve, with the two outputs marked', 'chart p1-curve');
    stage.appendChild(core.el('div', { class: 'stage-cell p1-cell-net' }, [net, core.el('span', { class: 'stage-label', text: 'Weights near the inputs, products near the outputs; a dashed arrow carries a negative product' })]));
    stage.appendChild(sums);
    stage.appendChild(core.el('div', { class: 'stage-cell' }, [curve, core.el('span', { class: 'stage-label', text: 'The chosen bend (solid) and the others (faint); the dots are z' + CH.sub[1] + ' and z' + CH.sub[2] })]));
    body.appendChild(controls);
    body.appendChild(stage);

    function compute() {
      var prods = st.W.map(function (rw) { return rw.map(function (w, i) { return w * st.x[i]; }); });
      var z = prods.map(function (p, j) { return p[0] + p[1] + p[2] + st.b[j]; });
      var f = BENDS[st.bend].f;
      var y = z.map(f);
      var out = st.v[0] * y[0] + st.v[1] * y[1] + st.c;
      var Wc = [0, 1, 2].map(function (i) { return st.v[0] * st.W[0][i] + st.v[1] * st.W[1][i]; });
      var bc = st.v[0] * st.b[0] + st.v[1] * st.b[1] + st.c;
      return { prods: prods, z: z, y: y, out: out, Wc: Wc, bc: bc };
    }

    // drawNet(r): the diagram of the layer (and the second layer when it is on).
    function drawNet(r) {
      clearNode(net);
      var xin = 70, xout = st.second ? 330 : 380, xfin = 560;
      var yin = [50, 150, 250], yout = [100, 200], yfin = 150;
      var maxp = 1e-9;
      r.prods.forEach(function (p) { p.forEach(function (v) { maxp = Math.max(maxp, Math.abs(v)); }); });
      for (var j = 0; j < 2; j++) {
        for (var i = 0; i < 3; i++) {
          var p = r.prods[j][i];
          var width = p === 0 ? 1 : 1.2 + 3.2 * Math.abs(p) / maxp;
          net.appendChild(svgArrow(core, xin + 26, yin[i], xout - 30, yout[j], { cls: 'p1-edge' + (p === 0 ? ' p1-zero' : ''), dashed: p < 0, head: 8, width: width }));
        }
      }
      for (var j2 = 0; j2 < 2; j2++) {
        for (var i2 = 0; i2 < 3; i2++) {
          var x1 = xin + 26, y1 = yin[i2], x2 = xout - 30, y2 = yout[j2];
          var wl = st.W[j2][i2], pl = r.prods[j2][i2];
          net.appendChild(svgText(core, x1 + (x2 - x1) * 0.24, y1 + (y2 - y1) * 0.24 - 3, CH.times + paren(core, wl, 2), { 'text-anchor': 'middle', class: 'p1-lbl' }));
          net.appendChild(svgText(core, x1 + (x2 - x1) * 0.74, y1 + (y2 - y1) * 0.74 - 3, '= ' + short(core, pl, 3), { 'text-anchor': 'middle', class: 'p1-lbl p1-ink' }));
        }
      }
      for (var a = 0; a < 3; a++) {
        net.appendChild(core.el('circle', { cx: String(xin), cy: String(yin[a]), r: '25', class: 'p1-node' }));
        net.appendChild(svgText(core, xin, yin[a] + 4, short(core, st.x[a], 2), { 'text-anchor': 'middle', class: 'p1-ink p1-bold' }));
        net.appendChild(svgText(core, xin - 32, yin[a] + 4, 'x' + CH.sub[a + 1], { 'text-anchor': 'end' }));
      }
      for (var o = 0; o < 2; o++) {
        net.appendChild(core.el('rect', { x: String(xout - 30), y: String(yout[o] - 24), width: '120', height: '48', rx: '6', class: 'p1-node' }));
        net.appendChild(svgText(core, xout + 30, yout[o] - 7, 'z' + CH.sub[o + 1] + ' = ' + short(core, r.z[o], 3), { 'text-anchor': 'middle', class: 'p1-ink' }));
        net.appendChild(svgText(core, xout + 30, yout[o] + 13, 'y' + CH.sub[o + 1] + ' = ' + short(core, r.y[o], 3), { 'text-anchor': 'middle', class: 'p1-ink p1-bold' }));
        net.appendChild(svgText(core, xout + 30, yout[o] - 30, '+ bias ' + short(core, st.b[o], 2) + ', then ' + BENDS[st.bend].name, { 'text-anchor': 'middle', class: 'p1-small' }));
      }
      if (st.second) {
        for (var q = 0; q < 2; q++) {
          var vv = st.v[q], pv = vv * r.y[q];
          net.appendChild(svgArrow(core, xout + 90, yout[q], xfin - 34, yfin, { cls: 'p1-edge', dashed: pv < 0, head: 8, width: 1.6 }));
          net.appendChild(svgText(core, xout + 90 + (xfin - 34 - xout - 90) * 0.45, yout[q] + (yfin - yout[q]) * 0.45 - 5, CH.times + paren(core, vv, 2), { 'text-anchor': 'middle', class: 'p1-lbl' }));
        }
        net.appendChild(core.el('circle', { cx: String(xfin), cy: String(yfin), r: '34', class: 'p1-node' }));
        net.appendChild(svgText(core, xfin, yfin - 4, 'out', { 'text-anchor': 'middle' }));
        net.appendChild(svgText(core, xfin, yfin + 13, short(core, r.out, 3), { 'text-anchor': 'middle', class: 'p1-ink p1-bold' }));
        net.appendChild(svgText(core, xfin, yfin - 42, '+ bias ' + short(core, st.c, 2), { 'text-anchor': 'middle', class: 'p1-small' }));
      }
    }

    // drawSums(r): every product and sum written out, the bend applied, and the second layer.
    function drawSums(r) {
      clearNode(sums);
      for (var j = 0; j < 2; j++) {
        var terms = [0, 1, 2].map(function (i) { return paren(core, st.W[j][i], 2) + ' ' + CH.times + ' ' + paren(core, st.x[i], 2); }).join(' + ');
        var zLine = core.el('p', null, [
          'z' + CH.sub[j + 1] + ' = ' + terms + ' + ' + paren(core, st.b[j], 2) + ' = ',
          core.el('span', { id: ID + '-z' + (j + 1), text: num(core, r.z[j]) })
        ]);
        sums.appendChild(zLine);
        var how;
        if (st.bend === 'gelu') {
          how = 'GELU(' + num(core, r.z[j]) + ') = ' + num(core, r.z[j]) + ' ' + CH.times + ' ' + CH.phi + '(' + num(core, r.z[j]) + ') = ' + num(core, r.z[j]) + ' ' + CH.times + ' ' + num(core, Phi(r.z[j]), 4) + ' = ';
        } else if (st.bend === 'relu') {
          how = 'ReLU(' + num(core, r.z[j]) + ') = max(0, ' + num(core, r.z[j]) + ') = ';
        } else {
          how = 'no bend: y' + CH.sub[j + 1] + ' = z' + CH.sub[j + 1] + ' = ';
        }
        sums.appendChild(core.el('p', null, [
          (st.bend === 'none' ? '' : 'y' + CH.sub[j + 1] + ' = ') + how,
          core.el('span', { id: ID + '-y' + (j + 1), text: num(core, r.y[j]) })
        ]));
      }
      var outLine = core.el('p', { hidden: !st.second }, [
        'out = ' + paren(core, st.v[0], 2) + ' ' + CH.times + ' y' + CH.sub[1] + ' + ' + paren(core, st.v[1], 2) + ' ' + CH.times + ' y' + CH.sub[2] + ' + ' + paren(core, st.c, 2) + ' = ',
        core.el('span', { id: ID + '-out', text: num(core, r.out) })
      ]);
      sums.appendChild(outLine);
      var collapsed = core.el('p', { id: ID + '-collapsed', class: 'p1-collapsed' });
      if (st.bend === 'none') {
        collapsed.textContent = 'With no bend the two layers are one layer in disguise: weights (' +
          r.Wc.map(function (v) { return short(core, v, 3); }).join(', ') + ') and bias ' + short(core, r.bc, 3) +
          ' give ' + short(core, r.Wc[0] * st.x[0] + r.Wc[1] * st.x[1] + r.Wc[2] * st.x[2] + r.bc, 3) + ' for this input too, and for every other input.';
      } else {
        collapsed.textContent = 'With the ' + BENDS[st.bend].name + ' bend no single layer gives these outputs for every input: the bend is what makes a second layer worth having.';
      }
      collapsed.hidden = !st.second;
      sums.appendChild(collapsed);
      sums.appendChild(core.el('p', { class: 'control-hint', text: 'Every number here is rounded for display; the lab computes with all the digits, so a step redone from the shown numbers can differ in its last digit.' }));
    }

    // drawCurve(r): the bends as curves over -3 to 3, the chosen one solid, with the two outputs marked.
    function drawCurve(r) {
      clearNode(curve);
      var W = 300, H = 210, m = { l: 30, r: 10, t: 10, b: 26 };
      var X = function (z) { return m.l + (W - m.l - m.r) * (z + 3) / 6; };
      var Y = function (y) { return m.t + (H - m.t - m.b) * (1 - (y + 1) / 4); };
      var grid = core.el('g', { class: 'grid' }), axis = core.el('g', { class: 'axis' });
      for (var zz = -3; zz <= 3; zz++) {
        grid.appendChild(svgLine(core, X(zz), Y(-1), X(zz), Y(3)));
        curve.appendChild(svgText(core, X(zz), H - m.b + 14, String(zz).replace('-', CH.minus), { 'text-anchor': 'middle' }));
      }
      for (var yy = -1; yy <= 3; yy++) {
        grid.appendChild(svgLine(core, X(-3), Y(yy), X(3), Y(yy)));
        curve.appendChild(svgText(core, m.l - 5, Y(yy) + 4, String(yy).replace('-', CH.minus), { 'text-anchor': 'end' }));
      }
      axis.appendChild(svgLine(core, X(-3), Y(0), X(3), Y(0)));
      axis.appendChild(svgLine(core, X(0), Y(-1), X(0), Y(3)));
      curve.appendChild(grid);
      curve.appendChild(axis);
      Object.keys(BENDS).forEach(function (key) {
        var pts = [];
        for (var s = 0; s <= 120; s++) {
          var z = -3 + 6 * s / 120;
          pts.push((Math.round(X(z) * 10) / 10) + ',' + (Math.round(Y(clamp(BENDS[key].f(z), -1, 3)) * 10) / 10));
        }
        curve.appendChild(core.el('polyline', { points: pts.join(' '), class: 'series ' + (key === st.bend ? 'p1-chosen' : 'p1-faint') }));
      });
      curve.appendChild(svgText(core, X(-3) + 4, Y(3) + 12, BENDS[st.bend].name, { class: 'p1-ink p1-bold' }));
      for (var o = 0; o < 2; o++) {
        var zc = clamp(r.z[o], -3, 3), yc = clamp(r.y[o], -1, 3);
        curve.appendChild(core.el('circle', { cx: String(Math.round(X(zc) * 10) / 10), cy: String(Math.round(Y(yc) * 10) / 10), r: '5', class: 'dot' }));
        curve.appendChild(svgText(core, X(zc) + 7, Y(yc) - 6, 'z' + CH.sub[o + 1], { class: 'p1-small' }));
      }
    }

    function drawAll() {
      var r = compute();
      drawNet(r);
      drawSums(r);
      drawCurve(r);
      vRow.hidden = !st.second;
    }

    var redraw = later(body, core, drawAll);

    // fromBoxes(): read every typed number.
    function fromBoxes() {
      for (var i = 0; i < 3; i++) st.x[i] = readNumber(boxes.x[i], st.x[i], R[0], R[1]);
      for (var j = 0; j < 2; j++) {
        for (var k = 0; k < 3; k++) st.W[j][k] = readNumber(boxes.W[j][k], st.W[j][k], R[0], R[1]);
        st.b[j] = readNumber(boxes.b[j], st.b[j], R[0], R[1]);
        st.v[j] = readNumber(boxes.v[j], st.v[j], R[0], R[1]);
      }
      st.c = readNumber(boxes.c, st.c, R[0], R[1]);
      drawAll();
    }

    // toBoxes(): write the state into the boxes.
    function toBoxes() {
      for (var i = 0; i < 3; i++) boxes.x[i].value = String(st.x[i]);
      for (var j = 0; j < 2; j++) {
        for (var k = 0; k < 3; k++) boxes.W[j][k].value = String(st.W[j][k]);
        boxes.b[j].value = String(st.b[j]);
        boxes.v[j].value = String(st.v[j]);
      }
      boxes.c.value = String(st.c);
    }

    [].concat(boxes.x, boxes.W[0], boxes.W[1], boxes.b, boxes.v, [boxes.c]).forEach(function (box) {
      box.addEventListener('input', core.guard(body, fromBoxes));
      box.addEventListener('change', core.guard(body, fromBoxes));
    });
    bendSeg.onChange(core.guard(body, function () { st.bend = bendSeg.value(); drawAll(); }));
    secondT.input.addEventListener('change', core.guard(body, function () { st.second = !!secondT.input.checked; drawAll(); }));
    bReset.addEventListener('click', core.guard(body, function () {
      st.x = D.x.slice();
      st.W = D.W.map(function (r) { return r.slice(); });
      st.b = D.b.slice();
      st.v = D.v.slice();
      st.c = D.c;
      toBoxes();
      drawAll();
    }));
    bRandom.addEventListener('click', core.guard(body, function () {
      if (!st.rng) st.rng = core.rng(D.random_seed);
      var half = function () { return Math.round((st.rng.next() * 2 - 1) * D.random_range * 2) / 2; };
      st.x = [half(), half(), half()];
      st.W = [[half(), half(), half()], [half(), half(), half()]];
      st.b = [half(), half()];
      st.v = [half(), half()];
      st.c = half();
      toBoxes();
      drawAll();
    }));
    core.on('theme-changed', redraw);

    drawAll();
  });
})(typeof window !== 'undefined' ? window : this);
