/*
 * labs_p2.js: the four labs of Part 2 of "Pixels to Islands" (the Vision Transformer).
 *   lab-2a-patches         the picture cut into patches, one patch's numbers and its toy token (ported from the first
 *                          explainer's Lab B), with a choice of patch size (8, 16 or 32 pixels) and the attention cost
 *   lab-2b-attention       attention for four tokens worked by hand (ported from Lab C), deepened: one gradient step
 *                          of a query towards a target, the square-root scale on random vectors, six toy heads side by
 *                          side on the picture
 *   lab-2c-block           one pre-norm block on four tokens of four numbers, forward and backward, every number shown;
 *                          a stack of twelve such blocks with and without its skip connections and its LayerNorm, and a
 *                          toy task trained by plain gradient descent
 *   lab-2d-real-attention  the last block's real attention on the followed photograph (data/followed.json): every head,
 *                          any patch, the class token's row, four networks, and run 2's patch 34 in each of the twelve
 *                          blocks
 * Contract: docs/research/explainer_v2_2026-10-13/README.md section 4 and the first explainer's src/README.md sections
 * 3 and 4. Vanilla ES2019, no library. Toy numbers start from DEFAULTS below (repeated in src/labs_defaults.json under
 * the lab ids); real numbers come from the bundle files that the page's data-needs loads; nothing else is fetched,
 * stored or sent. window.LabsP2 holds the pure functions the labs compute with; tests/smoke_p2.js checks them.
 */
(function (root) {
  'use strict';

  var Labs = root.Labs;
  if (!Labs || typeof Labs.register !== 'function') {
    if (root.console && typeof root.console.error === 'function') {
      root.console.error('[labs_p2] window.Labs is missing: load core.js before labs_p2.js');
    }
    return;
  }

  // ------------------------------------------------------------------ toy defaults

  // DEFAULTS: the numbers the four labs start from (strict JSON between the markers; src/labs_defaults.json repeats them).
  var DEFAULTS = /*defaults-json*/{
    "a": {
      "sides": [224, 480],
      "side": 224,
      "patch_sizes": [8, 16, 32],
      "patch": 16,
      "selected": [5, 7],
      "show_flattening": false,
      "class_token": true,
      "numbers_listed": 9,
      "token_values_listed": 4,
      "arrow_steps": [1, 5]
    },
    "b": {
      "tokens": ["A", "B", "C", "D"],
      "q": [[2, 0], [1.5, 0.5], [0, 2], [-1, 1]],
      "k": [[1, 0], [1, 0.2], [0, 1], [-0.5, 0.8]],
      "v": [[1, 0], [0.9, 0.1], [0, 1], [0.2, 0.8]],
      "d": 2,
      "temperature": 1,
      "asking": "A",
      "input_step": 0.1,
      "input_range": [-9, 9],
      "target": "C",
      "learning_rate": {"min": 0.1, "max": 2, "default": 1, "step": 0.1},
      "steps_listed": 12,
      "widths": [2, 8, 64, 384],
      "width": 64,
      "scaled": true,
      "pairs": 2000,
      "row": 196,
      "bins": 40,
      "bars": 24,
      "seed": 2,
      "grid": 14,
      "centre_patch": [7, 7],
      "heads": [
        {"name": "colour", "measures": [0, 1, 2], "sigma": 0.5},
        {"name": "brightness", "measures": [3], "sigma": 0.25},
        {"name": "texture", "measures": [4], "sigma": 0.25},
        {"name": "position", "measures": [7, 8], "sigma": 1},
        {"name": "edges across", "measures": [5], "sigma": 0.25},
        {"name": "edges down", "measures": [6], "sigma": 0.25}
      ],
      "map_side": 196,
      "arrow_steps": [1, 3]
    },
    "c": {
      "tokens": ["A", "B", "C", "D"],
      "z": [[1, 0.5, -0.5, 0], [0.8, 0.6, -0.4, 0.2], [-0.5, 0.2, 1, 0.6], [0, -1, 0.3, 0.9]],
      "width": 4,
      "heads": 2,
      "hidden": 16,
      "eps": 1e-6,
      "spread": {"min": 0.1, "max": 0.5, "default": 0.2, "step": 0.05},
      "seed": 1,
      "decimals": 2,
      "depth": 12,
      "learning_rate": 0.03,
      "steps": 100,
      "steps_per_frame": 4,
      "follow": "A",
      "residual": true,
      "layer_norm": true,
      "input_step": 0.1,
      "input_range": [-9, 9],
      "diverged_above": 1000000
    },
    "d": {
      "models": ["original_dino", "dino", "selfpatch", "con2"],
      "model": "selfpatch",
      "query": 34,
      "shortcuts": [34, 136, 0],
      "row": "patch",
      "head": 1,
      "class_block": 2,
      "big": 336,
      "small": 120,
      "top_listed": 5,
      "arrow_steps": [1, 3],
      "block": 12,
      "grid": 14
    }
  }/*end-defaults-json*/;

  // CH: the few non-ASCII characters the widgets write as text (this file stays ASCII).
  var CH = {
    times: '\u00D7', arrow: '\u2192', minus: '\u2212', middot: '\u00B7', sqrt: '\u221A', approx: '\u2248',
    ellipsis: '\u2026', partial: '\u2202', sigma: '\u03C3', mu: '\u03BC', eps: '\u03B5', sum: '\u03A3',
    half: '\u00BD', sq: '\u00B2', le: '\u2264', ge: '\u2265', nb: '\u00A0'
  };

  // ------------------------------------------------------------------ small helpers

  // clamp(x, lo, hi): x limited to the closed interval [lo, hi].
  function clamp(x, lo, hi) {
    return x < lo ? lo : (x > hi ? hi : x);
  }

  // escapeHtml(s): s with &, <, >, double and single quotes escaped.
  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // term(key, shown): the HTML of a glossary term; `shown` (trusted HTML) defaults to the key itself.
  function term(key, shown) {
    return '<dfn data-term="' + escapeHtml(key) + '">' + (shown === undefined ? escapeHtml(key) : shown) + '</dfn>';
  }

  var MARK_WORD = { fact: 'Fact', real: 'Real', toy: 'Toy', reading: 'Reading' };

  // mark(kind, ref): the HTML of one mark; ref is the data-source of a Fact or Reading mark, the data-bundle of a Real one.
  function mark(kind, ref) {
    var attr = '';
    if (kind === 'real') attr = ' data-bundle="' + escapeHtml(ref) + '"';
    else if (ref) attr = ' data-source="' + escapeHtml(ref) + '"';
    return '<span class="mark mark-' + kind + '"' + attr + '>' + MARK_WORD[kind] + '</span>';
  }

  // refreshMarks(): let boot.js prepare the marks and terms a lab wrote after the page had loaded.
  function refreshMarks() {
    if (root.Boot && typeof root.Boot.refreshTerms === 'function') {
      try { root.Boot.refreshTerms(); } catch (e) { /* the marks still read as text */ }
    }
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

  // arrowDelta(ev, steps): [dx, dy] for an arrow key (Shift takes the larger step), or null for any other key.
  function arrowDelta(ev, steps) {
    var s = ev.shiftKey ? steps[1] : steps[0];
    if (ev.key === 'ArrowLeft') return [-s, 0];
    if (ev.key === 'ArrowRight') return [s, 0];
    if (ev.key === 'ArrowUp') return [0, -s];
    if (ev.key === 'ArrowDown') return [0, s];
    return null;
  }

  // trimNum(core, x, digits): x with at most `digits` decimals (default 3), trailing zeros removed, true minus sign.
  // twoFigures(core, v): a positive size to two significant figures, written plainly from 0.001 up to 1,000 and as a
  // power of ten outside that range.
  function twoFigures(core, v) {
    if (!(v > 0)) return core.fmt(v, 3);
    if (v >= 1e-3 && v < 1e3) return String(Number(v.toPrecision(2)));
    return core.fmtSci(v, 1);
  }

  function trimNum(core, x, digits) {
    var s = core.fmt(x, digits === undefined ? 3 : digits);
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s;
  }

  // sumOf(values): the sum of an array or typed array.
  function sumOf(values) {
    var s = 0;
    for (var i = 0; i < values.length; i++) s += values[i];
    return s;
  }

  // rgbCss(r, g, b): an rgb() colour string from three bytes.
  function rgbCss(r, g, b) {
    return 'rgb(' + Math.round(r) + ', ' + Math.round(g) + ', ' + Math.round(b) + ')';
  }

  // vecText(core, values, digits): a vector written as (a, b, ...), each number with `digits` decimals.
  function vecText(core, values, digits) {
    var out = [];
    for (var i = 0; i < values.length; i++) out.push(core.fmt(values[i], digits === undefined ? 3 : digits));
    return '(' + out.join(', ') + ')';
  }

  // normOf(v): the Euclidean length of a vector.
  function normOf(v) {
    var s = 0;
    for (var i = 0; i < v.length; i++) s += v[i] * v[i];
    return Math.sqrt(s);
  }

  // clearNode(node): remove every child of node.
  function clearNode(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  // ------------------------------------------------------------------ DOM helpers (ported from labs_part1.js)

  // imageChooser(core, id, label): the shared picture chooser from boot.js, or null when it is missing.
  function imageChooser(core, id, label) {
    var make = typeof core.imageChooser === 'function' ? core.imageChooser
      : (root.Boot && typeof root.Boot.imageChooser === 'function' ? root.Boot.imageChooser : null);
    return make ? make({ id: id, label: label }) : null;
  }

  // hint(core, html): a small explanatory paragraph for the control strip.
  function hint(core, html) {
    return core.el('p', { class: 'control-hint', html: html });
  }

  // slider(core, o): a labelled range input with its live value; o = {id, label, min, max, step, value, digits, hint, format}.
  function slider(core, o) {
    var input = core.el('input', { type: 'range', id: o.id, min: String(o.min), max: String(o.max), step: String(o.step), value: String(o.value) });
    var out = core.el('output', { id: o.id + '-out', for: o.id });
    var kids = [core.el('label', { for: o.id, text: o.label }), out, input];
    if (o.hint) kids.push(hint(core, o.hint));
    var box = core.el('div', { class: 'control' }, kids);
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

  // toggle(core, o): a checkbox with its words; o = {id, label, checked}.
  function toggle(core, o) {
    var input = core.el('input', { type: 'checkbox', id: o.id, checked: !!o.checked });
    var label = core.el('label', { class: 'toggle' }, [input, ' ' + o.label]);
    return { root: label, input: input };
  }

  // segmented(core, o): one-of-several choices drawn as small buttons; o = {id, label, options: [{value, text}], value, hint}.
  function segmented(core, o) {
    var inputs = [];
    var labelId = o.id + '-label';
    var group = core.el('div', { class: 'segmented', role: 'radiogroup', 'aria-labelledby': labelId });
    o.options.forEach(function (opt) {
      var input = core.el('input', { type: 'radio', name: o.id, id: o.id + '-' + String(opt.value).replace(/[^A-Za-z0-9-]/g, '-'), value: String(opt.value), checked: String(opt.value) === String(o.value) });
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
      // enable(v, on): allow or forbid the option whose value is v.
      enable: function (v, on) { inputs.forEach(function (inp) { if (inp.value === String(v)) inp.disabled = !on; }); },
      // onChange(fn): call fn whenever the choice changes.
      onChange: function (fn) { inputs.forEach(function (inp) { inp.addEventListener('change', fn); }); }
    };
  }

  // button(core, id, text, primary): a plain button (the primary one filled with ink).
  function button(core, id, text, primary) {
    return core.el('button', { type: 'button', id: id, class: primary ? 'btn btn-primary' : 'btn' }, text);
  }

  // canvasBox(core, o): a canvas drawn in CSS pixels, sharp on dense screens; o = {id, label, focusable, pixelated}.
  function canvasBox(core, o) {
    var attrs = { id: o.id, 'aria-label': o.label };
    if (o.focusable) attrs.tabindex = '0'; else attrs.role = 'img';
    if (o.pixelated) attrs.class = 'pixelated';
    var canvas = core.el('canvas', attrs);
    var box = { canvas: canvas, w: 0, h: 0, dpr: 0, ctx: null };
    // begin(w, h): size the canvas to w x h CSS pixels when that changed, clear it, and return its context.
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

  // readoutList(core, rows): a dl.readout of [key, dtHtml] rows whose values can be set; returns {root, set(key, text), html(key, html)}.
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
      // set(key, text): write the value of row key.
      set: function (key, text) { dds[key].textContent = text; },
      // html(key, html): write trusted HTML into row key.
      html: function (key, html) { dds[key].innerHTML = html; }
    };
  }

  // svgText(core, x, y, text, attrs): an SVG text element at (x, y).
  function svgText(core, x, y, text, attrs) {
    var a = { x: String(Math.round(x * 10) / 10), y: String(Math.round(y * 10) / 10) };
    Object.keys(attrs || {}).forEach(function (k) { a[k] = attrs[k]; });
    return core.el('text', a, String(text));
  }

  // r1(v): v rounded to one decimal, for SVG coordinates.
  function r1(v) {
    return Math.round(v * 10) / 10;
  }

  // numTable(core, caption, colHeads, rowHeads): a table of numbers whose cells can be set; returns {root, cells[r][c], rows}.
  function numTable(core, caption, colHeads, rowHeads) {
    var cells = [];
    var trs = rowHeads.map(function (rh) {
      var tds = colHeads.map(function () { return core.el('td', { class: 'num' }); });
      cells.push(tds);
      return core.el('tr', null, [core.el('th', { scope: 'row', html: rh })].concat(tds));
    });
    var head = core.el('tr', null, [core.el('th', { scope: 'col', text: '' })].concat(colHeads.map(function (c) {
      return core.el('th', { scope: 'col', class: 'num', html: c });
    })));
    var el = core.el('table', null, [core.el('caption', { html: caption }), core.el('thead', null, head), core.el('tbody', null, trs)]);
    return { root: el, cells: cells, rows: trs };
  }

  // lineChart(core, svg, o): draw a small line chart into svg. o = {w, h, left, right, top, bottom, x0, x1, log, y0, y1,
  // xTicks, yTicks, xLabel, yLabel, series: [{points: [[x, y]], dash, muted, label}], marks: [{x}], legend}; with legend (an
  // HTML element) the series' labels go into a legend there instead of beside the lines' ends.
  function lineChart(core, svg, o) {
    clearNode(svg);
    var W = o.w, H = o.h, L = o.left, R = o.right, T = o.top, B = o.bottom;
    var tf = o.log ? function (v) { return Math.log(Math.max(v, 1e-300)) / Math.LN10; } : function (v) { return v; };
    var ya = tf(o.y0), yb = tf(o.y1);
    if (!(yb > ya)) yb = ya + 1;
    var sx = function (x) { return L + (W - L - R) * (x - o.x0) / ((o.x1 - o.x0) || 1); };
    var sy = function (y) { return H - B - (H - T - B) * (clamp(tf(y), ya, yb) - ya) / (yb - ya); };
    var grid = core.el('g', { class: 'grid' });
    var axis = core.el('g', { class: 'axis' });
    (o.yTicks || []).forEach(function (t) {
      grid.appendChild(core.el('line', { x1: String(L), x2: String(W - R), y1: String(r1(sy(t.v))), y2: String(r1(sy(t.v))) }));
      svg.appendChild(svgText(core, L - 4, sy(t.v) + 3.5, t.text, { 'text-anchor': 'end' }));
    });
    (o.xTicks || []).forEach(function (t) {
      svg.appendChild(svgText(core, sx(t.v), H - B + 13, t.text, { 'text-anchor': 'middle' }));
    });
    axis.appendChild(core.el('line', { x1: String(L), x2: String(W - R), y1: String(H - B), y2: String(H - B) }));
    axis.appendChild(core.el('line', { x1: String(L), x2: String(L), y1: String(T), y2: String(H - B) }));
    svg.insertBefore(grid, svg.firstChild);
    svg.appendChild(axis);
    if (o.xLabel) svg.appendChild(svgText(core, (L + W - R) / 2, H - 2, o.xLabel, { 'text-anchor': 'middle' }));
    if (o.yLabel) svg.appendChild(svgText(core, L, T - 6, o.yLabel, { 'text-anchor': 'start' }));
    (o.marks || []).forEach(function (m) {
      svg.appendChild(core.el('line', { class: 'mark-line', x1: String(r1(sx(m.x))), x2: String(r1(sx(m.x))), y1: String(T), y2: String(H - B), style: 'stroke: var(--muted); stroke-dasharray: 2 3' }));
    });
    (o.series || []).forEach(function (s) {
      var pts = [];
      s.points.forEach(function (p) {
        if (isFinite(p[1])) pts.push(r1(sx(p[0])) + ',' + r1(sy(p[1])));
      });
      if (!pts.length) return;
      var style = 'stroke: ' + (s.muted ? 'var(--muted)' : 'var(--ink)') + (s.dash ? '; stroke-dasharray: 5 4' : '');
      svg.appendChild(core.el('polyline', { class: 'series', points: pts.join(' '), style: style }));
      var last = s.points[s.points.length - 1];
      if (s.dots) {
        s.points.forEach(function (p) {
          if (isFinite(p[1])) svg.appendChild(core.el('circle', { cx: String(r1(sx(p[0]))), cy: String(r1(sy(p[1]))), r: '2.2', style: 'fill: ' + (s.muted ? 'var(--muted)' : 'var(--ink)') }));
        });
      }
      if (s.label && !o.legend && last && isFinite(last[1])) {
        svg.appendChild(svgText(core, sx(last[0]) - 2, sy(last[1]) - 5, s.label, { 'text-anchor': 'end', style: 'fill: ' + (s.muted ? 'var(--muted)' : 'var(--ink)') }));
      }
    });
    if (o.legend) drawLegend(core, o.legend, o.series || []);
    return { sx: sx, sy: sy };
  }

  // drawLegend(core, box, series): a line sample and the label of every labelled series, in the HTML element box: a
  // legend above the chart, so that no label sits on another label or on a line.
  function drawLegend(core, box, series) {
    clearNode(box);
    series.forEach(function (s) {
      if (!s.label) return;
      var style = 'stroke: ' + (s.muted ? 'var(--muted)' : 'var(--ink)') + '; stroke-width: 2' + (s.dash ? '; stroke-dasharray: 5 4' : '');
      var sample = core.el('svg', { class: 'p2-key', viewBox: '0 0 28 10', width: '28', height: '10', 'aria-hidden': 'true' },
        core.el('line', { x1: '1', x2: '27', y1: '5', y2: '5', style: style }));
      box.appendChild(core.el('span', { class: 'p2-key-item' }, [sample, core.el('span', { text: s.label })]));
    });
  }

  // logTicks(lo, hi): ticks at the powers of ten from lo to hi (at most 7), written as 10 to the power.
  function logTicks(core, lo, hi) {
    var a = Math.floor(Math.log(Math.max(lo, 1e-300)) / Math.LN10), b = Math.ceil(Math.log(Math.max(hi, 1e-300)) / Math.LN10);
    var step = Math.max(1, Math.ceil((b - a) / 6));
    var out = [];
    for (var e = a; e <= b; e += step) out.push({ v: Math.pow(10, e), text: e === 0 ? '1' : '10' + supText(e) });
    return { ticks: out, lo: Math.pow(10, a), hi: Math.pow(10, b) };
  }

  // supText(k): the integer k in superscript digits.
  function supText(k) {
    var digits = ['\u2070', '\u00B9', '\u00B2', '\u00B3', '\u2074', '\u2075', '\u2076', '\u2077', '\u2078', '\u2079'];
    var s = String(Math.abs(k)).split('').map(function (ch) { return digits[Number(ch)]; }).join('');
    return (k < 0 ? '\u207B' : '') + s;
  }

  // ------------------------------------------------------------------ pure maths (window.LabsP2)

  var P2 = {};

  // erf(x): the error function to about 1e-15: a Taylor series below 3, a continued fraction for the complement above.
  P2.erf = function (x) {
    var ax = Math.abs(x), r;
    if (ax < 3) {
      var sum = 0, termv = ax, n = 0, x2 = ax * ax;
      while (n < 3 || Math.abs(termv) > 1e-17 * Math.abs(sum)) {
        sum += termv / (2 * n + 1);
        n += 1;
        termv *= -x2 / n;
        if (n > 200) break;
      }
      r = 2 / Math.sqrt(Math.PI) * sum;
    } else {
      var f = ax, C = ax, D = 0, tiny = 1e-300;
      for (var i = 1; i < 300; i++) {
        var a = i / 2;
        D = ax + a * D; if (Math.abs(D) < tiny) D = tiny; D = 1 / D;
        C = ax + a / C; if (Math.abs(C) < tiny) C = tiny;
        var delta = C * D;
        f *= delta;
        if (Math.abs(delta - 1) < 1e-16) break;
      }
      r = 1 - Math.exp(-ax * ax) / (Math.sqrt(Math.PI) * f);
    }
    return x < 0 ? -r : r;
  };

  // gelu(x): the exact GELU, x times the normal distribution function, as nn.GELU computes it by default.
  P2.gelu = function (x) { return 0.5 * x * (1 + P2.erf(x / Math.SQRT2)); };

  // geluGrad(x): the slope of the exact GELU.
  P2.geluGrad = function (x) { return 0.5 * (1 + P2.erf(x / Math.SQRT2)) + x * Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI); };

  // layerNorm(x, gamma, beta, eps): {mu, v, s, xh, y}: the mean, the variance (divided by d), s = sqrt(v + eps), the
  // normalised numbers and gamma * xh + beta (torch's nn.LayerNorm).
  P2.layerNorm = function (x, g, b, eps) {
    var d = x.length, mu = 0, v = 0, i;
    for (i = 0; i < d; i++) mu += x[i];
    mu /= d;
    for (i = 0; i < d; i++) v += (x[i] - mu) * (x[i] - mu);
    v /= d;
    var s = Math.sqrt(v + eps);
    var xh = new Float64Array(d), y = new Float64Array(d);
    for (i = 0; i < d; i++) { xh[i] = (x[i] - mu) / s; y[i] = (g ? g[i] : 1) * xh[i] + (b ? b[i] : 0); }
    return { mu: mu, v: v, s: s, xh: xh, y: y };
  };

  // layerNormBack(c, gy, gamma, gGamma, gBeta): the gradient at the input of a LayerNorm whose forward record is c, for
  // the gradient gy at its output: (h - mean(h) - xh * mean(h * xh)) / s with h = gamma * gy; adds into gGamma and gBeta.
  P2.layerNormBack = function (c, gy, g, gg, gb) {
    var d = gy.length, m1 = 0, m2 = 0, i;
    var h = new Float64Array(d);
    for (i = 0; i < d; i++) {
      h[i] = gy[i] * (g ? g[i] : 1);
      m1 += h[i];
      m2 += h[i] * c.xh[i];
      if (gg) { gg[i] += gy[i] * c.xh[i]; gb[i] += gy[i]; }
    }
    m1 /= d;
    m2 /= d;
    var gx = new Float64Array(d);
    for (i = 0; i < d; i++) gx[i] = (h[i] - m1 - c.xh[i] * m2) / c.s;
    return gx;
  };

  // softmaxRow(s): the softmax of a list of scores (stable).
  function softmaxRow(s) {
    var mx = -Infinity, i;
    for (i = 0; i < s.length; i++) if (s[i] > mx) mx = s[i];
    var e = new Float64Array(s.length), z = 0;
    for (i = 0; i < s.length; i++) { e[i] = Math.exp(s[i] - mx); z += e[i]; }
    for (i = 0; i < s.length; i++) e[i] /= z;
    return e;
  }
  P2.softmaxRow = softmaxRow;

  // entropy(p): -sum p ln p in nats.
  P2.entropy = function (p) {
    var s = 0;
    for (var i = 0; i < p.length; i++) if (p[i] > 0) s -= p[i] * Math.log(p[i]);
    return s;
  };

  // ---- attention for four tokens (lab 2b)

  // byHand(q, k, v, d): the scores q.k / sqrt(d), the exponentials, the softmax weights and the outputs of every token.
  P2.byHand = function (q, k, v, d) {
    var sd = Math.sqrt(d);
    var scores = q.map(function (qi) { return k.map(function (kj) { var s = 0; for (var t = 0; t < qi.length; t++) s += qi[t] * kj[t]; return s / sd; }); });
    var exps = scores.map(function (row) { return row.map(function (s) { return Math.exp(s); }); });
    var sums = exps.map(sumOf);
    var weights = scores.map(function (row) { return Array.from(softmaxRow(row)); });
    var outputs = weights.map(function (w) {
      var o = new Array(v[0].length).fill(0);
      for (var j = 0; j < w.length; j++) for (var t = 0; t < o.length; t++) o[t] += w[j] * v[j][t];
      return o;
    });
    return { sd: sd, scores: scores, exps: exps, sums: sums, weights: weights, outputs: outputs };
  };

  // queryStep(q, k, v, ask, target, lr, d): one step of gradient descent on the asking token's query for the loss
  // L = 1/2 |o - target|^2: g = o - target; each key j adds a_j (g.v_j - g.o) / sqrt(d) times k_j to dL/dq; q - lr dL/dq.
  P2.queryStep = function (q, k, v, ask, target, lr, d) {
    var r = P2.byHand(q, k, v, d);
    var o = r.outputs[ask], w = r.weights[ask];
    var g = o.map(function (x, t) { return x - target[t]; });
    var loss = 0.5 * sumOf(g.map(function (x) { return x * x; }));
    var gv = v.map(function (vj) { var s = 0; for (var t = 0; t < g.length; t++) s += g[t] * vj[t]; return s; });
    var go = 0;
    for (var t = 0; t < g.length; t++) go += g[t] * o[t];
    var coef = w.map(function (wj, j) { return wj * (gv[j] - go) / r.sd; });
    var grad = new Array(q[ask].length).fill(0);
    coef.forEach(function (c, j) { for (var u = 0; u < grad.length; u++) grad[u] += c * k[j][u]; });
    var qNew = q[ask].map(function (x, u) { return x - lr * grad[u]; });
    var q2 = q.map(function (row, i) { return i === ask ? qNew : row; });
    var r2 = P2.byHand(q2, k, v, d);
    var g2 = r2.outputs[ask].map(function (x, u) { return x - target[u]; });
    return {
      output: o, weights: w, g: g, loss: loss, gv: gv, go: go, coef: coef, grad: grad, qNew: qNew,
      weightsNew: r2.weights[ask], outputNew: r2.outputs[ask], lossNew: 0.5 * sumOf(g2.map(function (x) { return x * x; }))
    };
  };

  // ---- the square-root scale (lab 2b)

  var ROOT3 = Math.sqrt(3);
  var spreadCache = Object.create(null);

  // unit(r): a random number of mean 0 and spread 1, uniform between -sqrt(3) and sqrt(3) (one draw of the stream, ten
  // times cheaper than a normal number; the square-root argument needs only the mean 0 and the spread 1).
  function unit(r) {
    return (2 * r.next() - 1) * ROOT3;
  }

  // dotSpread(d, pairs, seed): `pairs` dot products of two random vectors of d numbers of mean 0 and spread 1, with
  // their spread (standard deviation) before and after dividing by sqrt(d); remembered for each (d, pairs, seed).
  P2.dotSpread = function (d, pairs, seed) {
    var key = d + '/' + pairs + '/' + seed;
    if (spreadCache[key]) return spreadCache[key];
    var r = root.Core.rng(seed);
    var raw = new Float64Array(pairs);
    for (var p = 0; p < pairs; p++) {
      var s = 0;
      for (var t = 0; t < d; t++) s += unit(r) * unit(r);
      raw[p] = s;
    }
    var mean = sumOf(raw) / pairs, ss = 0;
    for (var i = 0; i < pairs; i++) ss += (raw[i] - mean) * (raw[i] - mean);
    var sdRaw = Math.sqrt(ss / pairs);
    spreadCache[key] = { raw: raw, sdRaw: sdRaw, sdScaled: sdRaw / Math.sqrt(d) };
    return spreadCache[key];
  };

  // scoreRow(d, n, seed, scaled): one query against n random keys of width d (numbers of mean 0 and spread 1): the
  // softmax weights sorted from the largest, the largest weight, the effective number of keys exp(entropy) and the size
  // of the softmax's slope matrix J = diag(a) - a a^T (how strongly the weights move when the scores move), whose
  // squared size is S2 - 2 S3 + S2^2 with S2 = sum a^2 and S3 = sum a^3; it is 0 for a row with all its weight on one key.
  P2.scoreRow = function (d, n, seed, scaled) {
    var r = root.Core.rng(seed * 7919 + d);
    var q = new Float64Array(d), t;
    for (t = 0; t < d; t++) q[t] = unit(r);
    var s = new Float64Array(n);
    for (var j = 0; j < n; j++) {
      var dot = 0;
      for (t = 0; t < d; t++) dot += q[t] * unit(r);
      s[j] = scaled ? dot / Math.sqrt(d) : dot;
    }
    var w = Array.from(softmaxRow(s)).sort(function (a, b) { return b - a; });
    var s2 = 0, s3 = 0;
    w.forEach(function (a) { s2 += a * a; s3 += a * a * a; });
    return { weights: w, max: w[0], effective: Math.exp(P2.entropy(w)), slope: Math.sqrt(Math.max(0, s2 - 2 * s3 + s2 * s2)) };
  };

  // ---- six toy heads (lab 2b)

  // patchMeasures(grid): per patch [red, green, blue, brightness, texture, edge across, edge down, column, row]: the
  // first seven standardised over the picture's patches (mean 0, spread 1), the position in patch units.
  P2.patchMeasures = function (grid) {
    var LUMA = [0.299, 0.587, 0.114];
    var raw = grid.patches.map(function (p) {
      var P = p.size, rgb = p.rgb, sl = 0, sll = 0, left = 0, right = 0, top = 0, bottom = 0;
      for (var y = 0; y < P; y++) {
        for (var x = 0; x < P; x++) {
          var o = (y * P + x) * 3;
          var l = (LUMA[0] * rgb[o] + LUMA[1] * rgb[o + 1] + LUMA[2] * rgb[o + 2]) / 255;
          sl += l; sll += l * l;
          if (x < P / 2) left += l; else right += l;
          if (y < P / 2) top += l; else bottom += l;
        }
      }
      var n = P * P, mean = sl / n;
      return [p.mean[0] / 255, p.mean[1] / 255, p.mean[2] / 255, mean, Math.sqrt(Math.max(0, sll / n - mean * mean)),
        (right - left) / (n / 2), (bottom - top) / (n / 2), p.col, p.row];
    });
    var mu = [], sd = [], k;
    for (k = 0; k < 7; k++) {
      var m = 0, s2 = 0;
      raw.forEach(function (row) { m += row[k]; });
      m /= raw.length;
      raw.forEach(function (row) { s2 += (row[k] - m) * (row[k] - m); });
      mu.push(m);
      sd.push(Math.sqrt(s2 / raw.length));
    }
    return raw.map(function (row) {
      return row.map(function (x, kk) { return kk < 7 ? (sd[kk] > 0 ? (x - mu[kk]) / sd[kk] : 0) : x; });
    });
  };

  // toyHeadRow(measures, query, head): one toy head's weights: softmax over the patches of -|phi(query) - phi(patch)|^2
  // / (2 sigma^2), phi keeping only the head's measures. (A dot product q . k can give exactly this score, with the
  // query (phi, 1) and the key (phi / sigma^2, -|phi|^2 / (2 sigma^2)) up to a number that is the same for every key.)
  P2.toyHeadRow = function (measures, query, head) {
    var mq = measures[query], s2 = 2 * head.sigma * head.sigma;
    var logits = measures.map(function (m) {
      var d2 = 0;
      head.measures.forEach(function (k) { d2 += (mq[k] - m[k]) * (mq[k] - m[k]); });
      return -d2 / s2;
    });
    return softmaxRow(logits);
  };

  // ---- the toy block (lab 2c)

  // zeros(r, c): r rows of c zeros.
  function zeros(r, c) {
    var a = [];
    for (var i = 0; i < r; i++) a.push(new Float64Array(c));
    return a;
  }

  // copyRows(M): a deep copy of an array of number rows.
  function copyRows(M) {
    return M.map(function (row) { return Float64Array.from(row); });
  }

  // makeBlock(seed, index, spread, o): the toy parameters of block `index`: query, key, value and output matrices (d x d),
  // the MLP's two matrices (d x m and m x d), every weight a random normal number times `spread` rounded to o.decimals,
  // every bias 0, LayerNorm scales 1 and shifts 0 (the real code's start). Matrices are input x output.
  P2.makeBlock = function (seed, index, spread, o) {
    var r = root.Core.rng(seed * 1000 + index);
    var d = o.width, m = o.hidden, f = Math.pow(10, o.decimals);
    // mat(a, b): an a x b matrix of rounded random numbers.
    function mat(a, b) {
      var M = zeros(a, b);
      for (var i = 0; i < a; i++) for (var j = 0; j < b; j++) M[i][j] = (Math.round(r.normal() * spread * f) / f) || 0;
      return M;
    }
    var ones = function (n) { var v = new Float64Array(n); v.fill(1); return v; };
    var P = { g1: ones(d), b1: new Float64Array(d) };
    P.Wq = mat(d, d); P.Wk = mat(d, d); P.Wv = mat(d, d);
    P.bq = new Float64Array(d); P.bk = new Float64Array(d); P.bv = new Float64Array(d);
    P.Wo = mat(d, d); P.bo = new Float64Array(d);
    P.g2 = ones(d); P.b2 = new Float64Array(d);
    P.W1 = mat(d, m); P.c1 = new Float64Array(m);
    P.W2 = mat(m, d); P.c2 = new Float64Array(d);
    return P;
  };

  // makeStack(seed, spread, o): o.depth toy blocks.
  P2.makeStack = function (seed, spread, o) {
    var out = [];
    for (var b = 0; b < o.depth; b++) out.push(P2.makeBlock(seed, b, spread, o));
    return out;
  };

  // copyBlock(P): a deep copy of one block's parameters.
  function copyBlock(P) {
    var out = {};
    Object.keys(P).forEach(function (k) { out[k] = Array.isArray(P[k]) ? copyRows(P[k]) : Float64Array.from(P[k]); });
    return out;
  }

  // linear(X, W, b): X W + b for every row of X.
  function linear(X, W, b) {
    var n = X.length, a = W.length, c = W[0].length;
    var Y = zeros(n, c);
    for (var i = 0; i < n; i++) {
      for (var k = 0; k < a; k++) {
        var x = X[i][k];
        if (!x) continue;
        for (var j = 0; j < c; j++) Y[i][j] += x * W[k][j];
      }
      for (var j2 = 0; j2 < c; j2++) Y[i][j2] += b[j2];
    }
    return Y;
  }

  // blockForward(Z, P, opt): one pre-norm block on the rows of Z, every intermediate kept: ln1, X1, Q, K, V, S and A
  // (one n x n matrix per head), O, M, U, ln2, X2, Hpre, Hact, F, out. opt = {heads, eps, residual, norm}.
  P2.blockForward = function (Z, P, opt) {
    var n = Z.length, d = Z[0].length, H = opt.heads, dh = d / H, rs = Math.sqrt(dh);
    var c = { Z: Z };
    c.ln1 = Z.map(function (z) { return opt.norm ? P2.layerNorm(z, P.g1, P.b1, opt.eps) : null; });
    c.X1 = Z.map(function (z, i) { return opt.norm ? c.ln1[i].y : Float64Array.from(z); });
    c.Q = linear(c.X1, P.Wq, P.bq);
    c.K = linear(c.X1, P.Wk, P.bk);
    c.V = linear(c.X1, P.Wv, P.bv);
    c.S = []; c.A = [];
    c.O = zeros(n, d);
    for (var h = 0; h < H; h++) {
      var S = zeros(n, n), A = [];
      for (var i = 0; i < n; i++) {
        for (var j = 0; j < n; j++) {
          var s = 0;
          for (var t = 0; t < dh; t++) s += c.Q[i][h * dh + t] * c.K[j][h * dh + t];
          S[i][j] = s / rs;
        }
        A.push(softmaxRow(S[i]));
      }
      for (var i2 = 0; i2 < n; i2++) for (var j2 = 0; j2 < n; j2++) for (var t2 = 0; t2 < dh; t2++) c.O[i2][h * dh + t2] += A[i2][j2] * c.V[j2][h * dh + t2];
      c.S.push(S);
      c.A.push(A);
    }
    c.M = linear(c.O, P.Wo, P.bo);
    c.U = Z.map(function (z, i) { return z.map(function (v, k) { return (opt.residual ? v : 0) + c.M[i][k]; }); });
    c.ln2 = c.U.map(function (u) { return opt.norm ? P2.layerNorm(u, P.g2, P.b2, opt.eps) : null; });
    c.X2 = c.U.map(function (u, i) { return opt.norm ? c.ln2[i].y : Float64Array.from(u); });
    c.Hpre = linear(c.X2, P.W1, P.c1);
    c.Hact = c.Hpre.map(function (row) { return row.map(P2.gelu); });
    c.F = linear(c.Hact, P.W2, P.c2);
    c.out = c.U.map(function (u, i) { return u.map(function (v, k) { return (opt.residual ? v : 0) + c.F[i][k]; }); });
    return c;
  };

  // zeroGrads(P): a zero gradient of the same shapes as the parameters P.
  function zeroGrads(P) {
    var G = {};
    Object.keys(P).forEach(function (k) { G[k] = Array.isArray(P[k]) ? zeros(P[k].length, P[k][0].length) : new Float64Array(P[k].length); });
    return G;
  }

  // linearBack(X, W, gY, G, wKey, bKey): dL/dX of Y = X W + b, adding dL/dW and dL/db into G when it is given.
  function linearBack(X, W, gY, G, wKey, bKey) {
    var n = gY.length, a = W.length, c = W[0].length;
    var gX = zeros(n, a);
    for (var i = 0; i < n; i++) {
      for (var k = 0; k < a; k++) {
        var s = 0;
        for (var j = 0; j < c; j++) {
          s += gY[i][j] * W[k][j];
          if (G) G[wKey][k][j] += X[i][k] * gY[i][j];
        }
        gX[i][k] = s;
      }
      if (G) for (var j2 = 0; j2 < c; j2++) G[bKey][j2] += gY[i][j2];
    }
    return gX;
  }

  // blockBackward(c, P, G, gOut, opt): the backward pass of one block from the gradient gOut at its output: returns
  // {gZ, parts} where parts holds every intermediate gradient, the add of each skip connection split into the skip's part
  // and the branch's part (Uskip, Ubranch, Zskip, Zbranch). Adds the parameters' gradients into G when it is given.
  P2.blockBackward = function (c, P, G, gOut, opt) {
    var n = gOut.length, d = gOut[0].length, H = opt.heads, dh = d / H, rs = Math.sqrt(dh), i, k;
    var parts = { out: gOut };
    parts.F = copyRows(gOut);
    parts.Uskip = opt.residual ? copyRows(gOut) : zeros(n, d);
    parts.Hact = linearBack(c.Hact, P.W2, parts.F, G, 'W2', 'c2');
    parts.Hpre = parts.Hact.map(function (row, ii) { return row.map(function (v, a) { return v * P2.geluGrad(c.Hpre[ii][a]); }); });
    parts.X2 = linearBack(c.X2, P.W1, parts.Hpre, G, 'W1', 'c1');
    parts.Ubranch = parts.X2.map(function (g, ii) {
      return opt.norm ? P2.layerNormBack(c.ln2[ii], g, P.g2, G ? G.g2 : null, G ? G.b2 : null) : Float64Array.from(g);
    });
    parts.U = parts.Uskip.map(function (row, ii) { return row.map(function (v, kk) { return v + parts.Ubranch[ii][kk]; }); });
    parts.M = parts.U;
    parts.Zskip = opt.residual ? copyRows(parts.U) : zeros(n, d);
    parts.O = linearBack(c.O, P.Wo, parts.M, G, 'Wo', 'bo');
    var gQ = zeros(n, d), gK = zeros(n, d), gV = zeros(n, d);
    for (var h = 0; h < H; h++) {
      var A = c.A[h];
      for (i = 0; i < n; i++) {
        var gA = new Float64Array(n), dotp = 0, j, t;
        for (j = 0; j < n; j++) {
          var s = 0;
          for (t = 0; t < dh; t++) s += parts.O[i][h * dh + t] * c.V[j][h * dh + t];
          gA[j] = s;
          dotp += s * A[i][j];
        }
        for (j = 0; j < n; j++) {
          var gs = A[i][j] * (gA[j] - dotp) / rs;
          for (t = 0; t < dh; t++) {
            gQ[i][h * dh + t] += gs * c.K[j][h * dh + t];
            gK[j][h * dh + t] += gs * c.Q[i][h * dh + t];
            gV[j][h * dh + t] += A[i][j] * parts.O[i][h * dh + t];
          }
        }
      }
    }
    parts.Q = gQ; parts.K = gK; parts.V = gV;
    var gX1 = zeros(n, d);
    [['Wq', 'bq', gQ], ['Wk', 'bk', gK], ['Wv', 'bv', gV]].forEach(function (tr) {
      var gx = linearBack(c.X1, P[tr[0]], tr[2], G, tr[0], tr[1]);
      for (var ii = 0; ii < n; ii++) for (var kk = 0; kk < d; kk++) gX1[ii][kk] += gx[ii][kk];
    });
    parts.X1 = gX1;
    parts.Zbranch = gX1.map(function (g, ii) {
      return opt.norm ? P2.layerNormBack(c.ln1[ii], g, P.g1, G ? G.g1 : null, G ? G.b1 : null) : Float64Array.from(g);
    });
    parts.Z = parts.Zskip.map(function (row, ii) { return row.map(function (v, kk) { return v + parts.Zbranch[ii][kk]; }); });
    for (i = 0; i < n; i++) for (k = 0; k < d; k++) if (!isFinite(parts.Z[i][k])) parts.Z[i][k] = NaN;
    return { gZ: parts.Z, parts: parts };
  };

  // rotateTargets(Z): the toy task: token i must leave carrying the numbers token i + 1 came in with (the last takes the first's).
  P2.rotateTargets = function (Z) {
    return Z.map(function (row, i) { return Float64Array.from(Z[(i + 1) % Z.length]); });
  };

  // loss(out, T): the mean over tokens of 1/2 |out_i - T_i|^2.
  P2.loss = function (out, T) {
    var s = 0;
    for (var i = 0; i < out.length; i++) for (var k = 0; k < out[i].length; k++) s += 0.5 * (out[i][k] - T[i][k]) * (out[i][k] - T[i][k]);
    return s / out.length;
  };

  // lossGrad(out, T): dL/dout for that loss.
  P2.lossGrad = function (out, T) {
    return out.map(function (row, i) { return row.map(function (v, k) { return (v - T[i][k]) / out.length; }); });
  };

  // stackForward(Z, blocks, opt): the blocks one after another; {caches, out, sizes} with sizes[b] the mean token
  // length entering block b + 1 (sizes[0] the input, sizes[depth] the output).
  P2.stackForward = function (Z, blocks, opt) {
    var caches = [], X = Z, sizes = [meanNorm(Z)];
    for (var b = 0; b < blocks.length; b++) {
      var c = P2.blockForward(X, blocks[b], opt);
      caches.push(c);
      X = c.out;
      sizes.push(meanNorm(X));
    }
    return { caches: caches, out: X, sizes: sizes };
  };

  // meanNorm(M): the mean length of the rows of M.
  function meanNorm(M) {
    var s = 0;
    M.forEach(function (row) { s += normOf(row); });
    return s / M.length;
  }

  // frob(M): the length of all the numbers of M taken together.
  function frob(M) {
    var s = 0;
    M.forEach(function (row) { for (var k = 0; k < row.length; k++) s += row[k] * row[k]; });
    return Math.sqrt(s);
  }

  // stackBackward(fw, blocks, T, opt, wantParams): the gradient at the input of every block (gradAt[b], gradAt[depth] at
  // the output) and, with wantParams, the parameters' gradients of every block.
  P2.stackBackward = function (fw, blocks, T, opt, wantParams) {
    var g = P2.lossGrad(fw.out, T);
    var gradAt = [g], Gs = [];
    for (var b = blocks.length - 1; b >= 0; b--) {
      var G = wantParams ? zeroGrads(blocks[b]) : null;
      g = P2.blockBackward(fw.caches[b], blocks[b], G, g, opt).gZ;
      gradAt.unshift(g);
      Gs.unshift(G);
    }
    return { gradAt: gradAt, sizes: gradAt.map(frob), G: Gs };
  };

  // trainer(Z, blocks0, T, opt, lr, steps, limit): plain gradient descent on copies of the blocks, run a few steps at a
  // time: t.run(k) takes up to k more steps and returns t.done. t.curve holds the loss before every step and after the
  // last; LayerNorm's parameters stay put when opt.norm is off; the run stops early (t.diverged) when the loss leaves
  // the finite numbers below `limit`.
  P2.trainer = function (Z, blocks0, T, opt, lr, steps, limit) {
    var blocks = blocks0.map(copyBlock);
    var t = { curve: [], diverged: false, done: false, steps: steps };
    var s = 0;
    t.run = function (k) {
      for (var i = 0; i < k && !t.done; i++) {
        var fw = P2.stackForward(Z, blocks, opt);
        var L = P2.loss(fw.out, T);
        if (!isFinite(L) || L > limit) { t.diverged = true; t.done = true; break; }
        t.curve.push(L);
        if (s === steps) { t.done = true; break; }
        var bw = P2.stackBackward(fw, blocks, T, opt, true);
        blocks.forEach(function (B, b) {
          var G = bw.G[b];
          Object.keys(B).forEach(function (key) {
            if (!opt.norm && /^[gb][12]$/.test(key)) return;
            var v = B[key], gk = G[key];
            if (Array.isArray(v)) v.forEach(function (row, r) { for (var j = 0; j < row.length; j++) row[j] -= lr * gk[r][j]; });
            else for (var i2 = 0; i2 < v.length; i2++) v[i2] -= lr * gk[i2];
          });
        });
        s += 1;
      }
      return t.done;
    };
    return t;
  };

  // train(Z, blocks0, T, opt, lr, steps, limit): the whole run at once ({curve, diverged}).
  P2.train = function (Z, blocks0, T, opt, lr, steps, limit) {
    var t = P2.trainer(Z, blocks0, T, opt, lr, steps, limit);
    while (!t.run(steps + 1)) { /* one call of run(steps + 1) always ends the run */ }
    return { curve: t.curve, diverged: t.diverged };
  };

  // ---- the real attention of followed.json (lab 2d)

  // realRow(F, model, head, query, kind, block): one row of the bundle's attention: {weights (196 patch weights), self,
  // cls, member, length}. model: 'original_dino' (attention_last_original_dino, 197 x 197 with the class token at 0),
  // 'dino', 'selfpatch' or 'con2' (attention_last, 196 x 196); kind 'patch' (the row of patch `query`) or 'cls' (the class
  // token's row: the original DINO's row 0, or the aggregation head's class token of class_attention, block 1 or 2).
  // Returns null when the bundle holds no such row (the converted DINO has no class token).
  P2.realRow = function (F, model, head, query, kind, block) {
    var row, off;
    if (model === 'original_dino') {
      var A = F.attention_last_original_dino;
      var r = kind === 'cls' ? 0 : query + 1;
      off = (head * 197 + r) * 197;
      row = A.array.subarray(off, off + 197);
      return { weights: Float64Array.from(row.subarray(1)), cls: row[0], self: row[r], member: 'attention_last_original_dino', length: 197 };
    }
    if (kind === 'cls') {
      var mi = F.class_attention_models.indexOf(model);
      if (mi < 0) return null;
      off = ((mi * 2 + (block - 1)) * 6 + head) * 197;
      row = F.class_attention.array.subarray(off, off + 197);
      return { weights: Float64Array.from(row.subarray(1)), cls: row[0], self: row[0], member: 'class_attention', length: 197 };
    }
    var m = F.attention_last_models.indexOf(model);
    if (m < 0) return null;
    off = ((m * 6 + head) * 196 + query) * 196;
    row = F.attention_last.array.subarray(off, off + 196);
    return { weights: Float64Array.from(row), cls: null, self: row[query], member: 'attention_last', length: 196 };
  };

  // meanRow(rows): the mean of several rows of the same kind (the six heads together).
  P2.meanRow = function (rows) {
    var w = new Float64Array(196), cls = 0, self = 0, hasCls = rows[0].cls !== null;
    rows.forEach(function (r) {
      for (var j = 0; j < 196; j++) w[j] += r.weights[j] / rows.length;
      if (hasCls) cls += r.cls / rows.length;
      self += r.self / rows.length;
    });
    return { weights: w, cls: hasCls ? cls : null, self: self, member: rows[0].member, length: rows[0].length };
  };

  // blockRow(F, block, head): run 2's attention row of the followed anchor in block 1 to 12 (attention_rows_con2).
  P2.blockRow = function (F, block, head) {
    var off = ((block - 1) * 6 + head) * 196;
    var row = F.attention_rows_con2.array.subarray(off, off + 196);
    return { weights: Float64Array.from(row), cls: null, self: row[F.anchor], member: 'attention_rows_con2', length: 196 };
  };

  // rowStats(row, top): the entropy of the whole row (the class token's entry included), the effective number of
  // entries exp(entropy), the largest weight and the `top` largest patches as [index, weight].
  P2.rowStats = function (row, top) {
    var all = Array.from(row.weights);
    if (row.cls !== null && row.cls !== undefined) all.push(row.cls);
    var H = P2.entropy(all);
    var order = Array.from(row.weights.keys()).sort(function (a, b) { return (row.weights[b] - row.weights[a]) || (a - b); });
    return { entropy: H, effective: Math.exp(H), max: row.weights[order[0]], top: order.slice(0, top).map(function (j) { return [j, row.weights[j]]; }) };
  };

  root.LabsP2 = P2;

  // ------------------------------------------------------------------ Lab 2A: from patches to tokens

  Labs.register('lab-2a-patches', function mount(body, core) {
    var ID = 'lab-2a-patches';
    var D = DEFAULTS.a;
    var MAIN = 448;
    var ZOOM = 128;
    var STRIP = 640;
    var st = { side: D.side, patch: D.patch, row: D.selected[0], col: D.selected[1], flat: D.show_flattening, cls: D.class_token, image: null, grid: null, pic: null, token: null };

    var controls = core.el('div', { class: 'lab-controls' });
    var stage = core.el('div', { class: 'lab-stage' });
    var chooser = imageChooser(core, ID, 'Picture used by Lab 2A');
    if (chooser) controls.appendChild(chooser);
    var side = segmented(core, {
      id: ID + '-side', label: 'Picture size',
      options: D.sides.map(function (s) { return { value: String(s), text: core.fmt(s) + ' px' }; }),
      value: String(st.side),
      hint: '224 pixels is the side of the large training crops, and 480 the side at which the label-free decoder of Part 6 reads a picture. ' +
        mark('fact', '[our architecture doc \u00A73.1, \u00A75.2] (crop_global_side, decoder_side)')
    });
    controls.appendChild(side.root);
    var patchSize = segmented(core, {
      id: ID + '-patch', label: 'Patch size',
      options: D.patch_sizes.map(function (p) { return { value: String(p), text: p + ' px' }; }),
      value: String(st.patch),
      hint: 'ViT-S/16 cuts patches of 16 pixels, and DINO also trains ViT-S/8 with patches of 8; the choice of 32 is this lab\'s own, to show the trend. ' +
        mark('fact', '[DINO \u00A73.2, Tab. 1] (patch_size, why_dino_patch_tokens)')
    });
    controls.appendChild(patchSize.root);
    var flatten = toggle(core, { id: ID + '-flatten', label: 'Show the patch as one line of numbers', checked: st.flat });
    var cls = toggle(core, { id: ID + '-class-token', label: 'Add DINO\'s class token', checked: st.cls });
    controls.appendChild(core.el('div', { class: 'toggle-row' }, [flatten.root, cls.root]));
    controls.appendChild(hint(core, 'A patch of 16 pixels holds 16 ' + CH.times + ' 16 ' + CH.times + ' 3 = 768 numbers. DINO adds one learned ' +
      term('class token') + ' to the patch tokens; the backbone our runs train has none, so a crop of 224 pixels gives it 196 tokens. ' +
      mark('fact', '[our architecture doc \u00A73.2, \u00A73.12; DINO \u00A73.2] (patch_values, dino_cls_token, sp_output_224)')));
    controls.appendChild(hint(core, 'Point at a patch, or tap it. After a click, the arrow keys move the choice; you can also point at the strip of tokens.'));

    var main = canvasBox(core, { id: ID + '-picture', focusable: true, label: 'The picture with its grid of patches. Point at it, or use the arrow keys, to choose a patch.' });
    var zoom = canvasBox(core, { id: ID + '-patch-view', pixelated: true, label: 'The chosen patch, enlarged' });
    var facts = readoutList(core, [
      ['picture', 'Picture'], ['psize', 'Patch size'], ['grid', 'Patches'], ['chosen', 'Chosen patch'], ['patch', 'One patch'],
      ['token', 'One ' + term('token')], ['tokens', 'Tokens in'], ['scores', 'Scores per head and block']
    ]);

    var flatPix = canvasBox(core, { id: ID + '-rows', label: 'The chosen patch\'s rows of pixels placed end to end' });
    var flatNum = canvasBox(core, { id: ID + '-numbers', label: 'The chosen patch\'s numbers in one line, as greys' });
    var flatText = core.el('p', { class: 'readout' });
    var flatLabel1 = core.el('span', { class: 'stage-label' });
    var flatLabel2 = core.el('span', { class: 'stage-label' });
    // a plain wrapper: the hidden attribute cannot hide an element whose class sets its display
    var flatBox = core.el('div', null, core.el('div', { class: 'stage-cell' }, [flatLabel1, flatPix.canvas, flatLabel2, flatNum.canvas, flatText]));
    flatBox.hidden = !st.flat;

    var projBox = canvasBox(core, { id: ID + '-projection', label: 'The 384 numbers of the toy projection, as shades' });
    var posBox = canvasBox(core, { id: ID + '-position', label: 'The 384 numbers of the toy position embedding, as shades' });
    var tokBox = canvasBox(core, { id: ID + '-token', label: 'The 384 numbers of the token, as shades' });
    var projText = core.el('span', { class: 'stage-label' });
    var posText = core.el('span', { class: 'stage-label' });
    var tokText = core.el('span', { class: 'stage-label' });
    var scaleText = core.el('p', { class: 'stage-label' });
    var projLabel = core.el('span', { class: 'stage-label' });
    var tokenCell = core.el('div', { class: 'stage-cell' }, [
      projLabel, projBox.canvas, projText,
      core.el('span', { class: 'stage-label', html: '2. A ' + term('position embedding') + ' row for this position (toy): 384 numbers' }), posBox.canvas, posText,
      core.el('span', { class: 'stage-label', html: '3. Their sum: the token that enters the first block, 384 numbers' }), tokBox.canvas, tokText,
      scaleText
    ]);

    var seq = canvasBox(core, { id: ID + '-sequence', label: 'Every token of the picture in the order the network reads them. Point at it to choose a patch.' });
    var seqText = core.el('p', { class: 'stage-label' });
    var seqCell = core.el('div', { class: 'stage-cell' }, [
      core.el('span', { class: 'stage-label', text: 'The tokens as the network reads them: one row of patches after another' }), seq.canvas, seqText
    ]);

    stage.appendChild(core.el('div', { class: 'stage-row' }, [
      core.el('div', { class: 'stage-cell' }, [main.canvas, core.el('span', { class: 'stage-label', text: 'The picture and its patch grid' })]),
      core.el('div', { class: 'stage-cell', style: 'width: ' + ZOOM + 'px; max-width: 100%' }, [zoom.canvas, core.el('span', { class: 'stage-label', text: 'The chosen patch, enlarged' })])
    ]));
    stage.appendChild(facts.root);
    stage.appendChild(flatBox);
    stage.appendChild(tokenCell);
    stage.appendChild(seqCell);
    body.appendChild(controls);
    body.appendChild(stage);

    // load(): read the shared picture at the chosen side and cut it into patches of the chosen size.
    function load() {
      st.image = core.currentImage(st.side).imageData;
      st.grid = core.patchGrid(st.image, st.patch);
      st.pic = core.toCanvas(st.image);
      st.token = null;
      st.row = clamp(st.row, 0, st.grid.g - 1);
      st.col = clamp(st.col, 0, st.grid.g - 1);
    }

    // chosen(): the chosen patch record from Core.patchGrid.
    function chosen() {
      return st.grid.patches[st.row * st.grid.g + st.col];
    }

    // computeToken(): the toy projection, the toy position embedding and their sum for the chosen patch.
    function computeToken() {
      var p = chosen();
      var proj = core.toyProject(p.rgb);
      var pos = core.positionEmbedding(p.index, st.grid.g, proj.length);
      var tok = new Float32Array(proj.length);
      var vmax = 0;
      for (var i = 0; i < tok.length; i++) {
        tok[i] = proj[i] + pos[i];
        vmax = Math.max(vmax, Math.abs(proj[i]), Math.abs(pos[i]), Math.abs(tok[i]));
      }
      st.token = { index: p.index, side: st.side, patch: st.patch, proj: proj, pos: pos, tok: tok, vmax: vmax || 1 };
    }

    // drawMain(): the picture scaled to the canvas, its patch grid and the chosen patch.
    function drawMain() {
      var th = core.theme();
      var g = st.grid.g, cell = MAIN / g;
      var ctx = main.begin(MAIN, MAIN);
      ctx.imageSmoothingEnabled = st.side > MAIN;
      try { ctx.imageSmoothingQuality = 'high'; } catch (e) { /* older browsers */ }
      ctx.drawImage(st.pic, 0, 0, MAIN, MAIN);
      ctx.strokeStyle = core.rgba(th.paper, g > 40 ? 0.35 : 0.6);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (var i = 1; i < g; i++) {
        var t = Math.round(i * cell) + 0.5;
        ctx.moveTo(t, 0); ctx.lineTo(t, MAIN);
        ctx.moveTo(0, t); ctx.lineTo(MAIN, t);
      }
      ctx.stroke();
      var x = st.col * cell, y = st.row * cell;
      ctx.lineWidth = 4; ctx.strokeStyle = th.paper; ctx.strokeRect(x, y, cell, cell);
      ctx.lineWidth = 2; ctx.strokeStyle = th.ink; ctx.strokeRect(x, y, cell, cell);
    }

    // drawZoom(): the chosen patch enlarged to fill the zoom canvas, with faint pixel borders.
    function drawZoom() {
      var th = core.theme();
      var p = chosen(), P = st.patch, k = ZOOM / P;
      var ctx = zoom.begin(ZOOM, ZOOM);
      for (var y = 0; y < P; y++) {
        for (var x = 0; x < P; x++) {
          var o = (y * P + x) * 3;
          ctx.fillStyle = rgbCss(p.rgb[o], p.rgb[o + 1], p.rgb[o + 2]);
          ctx.fillRect(x * k, y * k, k + 0.5, k + 0.5);
        }
      }
      if (P <= 16) {
        ctx.fillStyle = core.rgba(th.paper, 0.35);
        for (var t = 1; t < P; t++) {
          ctx.fillRect(t * k - 0.5, 0, 1, ZOOM);
          ctx.fillRect(0, t * k - 0.5, ZOOM, 1);
        }
      }
      ctx.strokeStyle = th.ink;
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, ZOOM - 1, ZOOM - 1);
    }

    // drawFlattening(): the patch's rows end to end, then its numbers as greys.
    function drawFlattening() {
      if (!st.flat) return;
      var th = core.theme();
      var p = chosen(), P = st.patch, H = 22;
      flatLabel1.textContent = 'Flattening, step 1: the ' + P + ' rows of the patch, end to end (' + core.fmt(P * P) + ' pixels)';
      flatLabel2.textContent = 'Step 2: each pixel gives its red, green and blue numbers (' + core.fmt(P * P * 3) + ' numbers, drawn as greys)';
      var ctx = flatPix.begin(STRIP, H), w = STRIP / (P * P);
      for (var i = 0; i < P * P; i++) {
        ctx.fillStyle = rgbCss(p.rgb[3 * i], p.rgb[3 * i + 1], p.rgb[3 * i + 2]);
        ctx.fillRect(i * w, 0, w + 0.6, H);
      }
      ctx.fillStyle = th.paper;
      for (var r = 1; r < P; r++) ctx.fillRect(r * P * w - 0.75, 0, 1.5, H);
      var ctx2 = flatNum.begin(STRIP, H), w2 = STRIP / p.rgb.length;
      for (var j = 0; j < p.rgb.length; j++) {
        var v = p.rgb[j];
        ctx2.fillStyle = rgbCss(v, v, v);
        ctx2.fillRect(j * w2, 0, w2 + 0.6, H);
      }
      ctx2.strokeStyle = th.line;
      ctx2.strokeRect(0.5, 0.5, STRIP - 1, H - 1);
      var first = [];
      for (var q = 0; q < D.numbers_listed; q += 3) first.push('(' + p.rgb[q] + ', ' + p.rgb[q + 1] + ', ' + p.rgb[q + 2] + ')');
      flatText.textContent = 'The line starts ' + first.join(', ') + ', ' + CH.ellipsis + ': the first pixels\' red, green and blue, then the next pixel\'s.';
    }

    // drawStrip(box, values, vmax): 384 numbers as shades from the page ground (low) to the ink (high); 0 is the middle shade.
    function drawStrip(box, values, vmax) {
      var th = core.theme();
      var H = 20, n = values.length, w = STRIP / n;
      var ctx = box.begin(STRIP, H);
      for (var i = 0; i < n; i++) {
        var t = clamp(values[i] / vmax, -1, 1);
        ctx.fillStyle = core.mix(th.paper, th.ink, 0.5 + 0.5 * t);
        ctx.fillRect(i * w, 0, w + 0.6, H);
      }
      ctx.strokeStyle = th.line;
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, STRIP - 1, H - 1);
    }

    // firstValues(values): the first few numbers of a strip, written out.
    function firstValues(values) {
      var out = [];
      for (var i = 0; i < D.token_values_listed; i++) out.push(core.fmt(values[i], 3));
      return 'starts ' + out.join(', ') + ', ' + CH.ellipsis;
    }

    // drawToken(): the three strips of the chosen patch's toy token.
    function drawToken() {
      if (!st.token || st.token.index !== chosen().index || st.token.side !== st.side || st.token.patch !== st.patch) computeToken();
      var t = st.token;
      projLabel.innerHTML = '1. The patch\'s numbers times a fixed random table of 384 rows (toy' +
        (st.patch === 16 ? '' : '; the toy first resizes the patch to 16 ' + CH.times + ' 16 pixels') + '): 384 numbers';
      drawStrip(projBox, t.proj, t.vmax);
      drawStrip(posBox, t.pos, t.vmax);
      drawStrip(tokBox, t.tok, t.vmax);
      projText.textContent = firstValues(t.proj);
      posText.textContent = firstValues(t.pos);
      tokText.textContent = firstValues(t.tok);
      scaleText.textContent = 'Shades: the middle shade is 0; the closer to the page colour, the more negative; the closer to the text colour, ' +
        'the more positive, up to ' + CH.minus + core.fmt(t.vmax, 2) + ' and +' + core.fmt(t.vmax, 2) + '.';
    }

    // drawSequence(): every token in reading order (patch colours), the class token first when it is on, the chosen one marked.
    function drawSequence() {
      var th = core.theme();
      var n = st.grid.n, extra = st.cls ? 1 : 0, total = n + extra, top = 9, H = 24;
      var ctx = seq.begin(STRIP, top + H);
      var w = STRIP / total;
      if (extra) {
        ctx.fillStyle = th.ink;
        ctx.fillRect(0, top, Math.max(w, 1) + 0.6, H);
      }
      for (var i = 0; i < n; i++) {
        var m = st.grid.patches[i].mean;
        ctx.fillStyle = rgbCss(m[0], m[1], m[2]);
        ctx.fillRect((i + extra) * w, top, w + 0.6, H);
      }
      var cx = (st.row * st.grid.g + st.col + extra + 0.5) * w;
      ctx.fillStyle = th.ink;
      ctx.beginPath();
      ctx.moveTo(cx - 5, 0); ctx.lineTo(cx + 5, 0); ctx.lineTo(cx, top - 1);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = th.line;
      ctx.strokeRect(0.5, top + 0.5, STRIP - 1, H - 1);
      seqText.textContent = (extra ? 'First, in the text colour: DINO\'s class token. Then ' : '') + core.fmt(n) + ' patch tokens, row by row; ' +
        'the marker shows the chosen patch at position ' + core.fmt(st.row * st.grid.g + st.col + extra) + ' (counting from 0)' +
        (extra ? ', one more than its patch number, because the class token takes position 0.' : ', the same as its patch number.');
    }

    // fillFacts(): the numbers beside the enlarged patch.
    function fillFacts() {
      var g = st.grid.g, n = st.grid.n, P = st.patch, idx = st.row * g + st.col, extra = st.cls ? 1 : 0, N = n + extra;
      facts.set('picture', core.fmt(st.side) + ' ' + CH.times + ' ' + core.fmt(st.side) + ' pixels');
      facts.set('psize', P + ' ' + CH.times + ' ' + P + ' pixels' + (P === 16 ? ' (the real one)' : ' (for comparison)'));
      facts.set('grid', core.fmt(g) + ' ' + CH.times + ' ' + core.fmt(g) + ' = ' + core.fmt(n));
      facts.set('chosen', 'row ' + st.row + ', column ' + st.col + ': patch number ' + st.row + ' ' + CH.times + ' ' + g + ' + ' + st.col + ' = ' + core.fmt(idx));
      facts.set('patch', P + ' ' + CH.times + ' ' + P + ' ' + CH.times + ' 3 = ' + core.fmt(P * P * 3) + ' numbers');
      facts.set('token', core.fmt(384) + ' numbers');
      facts.set('tokens', st.cls ? core.fmt(n) + ' + 1 class token = ' + core.fmt(n + 1) : core.fmt(n) + ' patch tokens');
      var scores = core.fmt(N) + ' ' + CH.times + ' ' + core.fmt(N) + ' = ' + core.fmt(N * N);
      if (P !== 16) {
        var n16 = Math.pow(st.side / 16, 2) + extra;
        scores += ', against ' + core.fmt(n16 * n16) + ' with patches of 16 pixels';
      }
      facts.set('scores', scores);
    }

    // drawFast(): everything except the token strips (which need the toy projection).
    function drawFast() {
      drawMain();
      drawZoom();
      drawFlattening();
      drawSequence();
      fillFacts();
    }

    // drawAll(): every part of the lab.
    function drawAll() {
      drawFast();
      drawToken();
    }

    var redraw = later(body, core, drawAll);

    // choose(row, col): make the patch at (row, col) the chosen one, kept inside the grid.
    function choose(row, col) {
      var g = st.grid.g;
      var r = clamp(Math.floor(row), 0, g - 1), c = clamp(Math.floor(col), 0, g - 1);
      if (r === st.row && c === st.col) return;
      st.row = r;
      st.col = c;
      redraw();
    }

    // regrid(change): change the side or the patch size and keep the chosen place on the picture.
    function regrid(change) {
      var old = st.grid.g;
      var fy = (st.row + 0.5) / old, fxr = (st.col + 0.5) / old;
      change();
      load();
      st.row = clamp(Math.floor(fy * st.grid.g), 0, st.grid.g - 1);
      st.col = clamp(Math.floor(fxr * st.grid.g), 0, st.grid.g - 1);
      redraw();
    }

    var onPicture = core.guard(body, function (ev) {
      var p = main.point(ev), cell = MAIN / st.grid.g;
      choose(p.y / cell, p.x / cell);
    });
    main.canvas.addEventListener('pointermove', onPicture);
    main.canvas.addEventListener('pointerdown', onPicture);
    main.canvas.addEventListener('keydown', core.guard(body, function (ev) {
      var dlt = arrowDelta(ev, D.arrow_steps);
      if (!dlt) return;
      ev.preventDefault();
      choose(st.row + dlt[1], st.col + dlt[0]);
    }));
    var onSequence = core.guard(body, function (ev) {
      var p = seq.point(ev), extra = st.cls ? 1 : 0;
      var i = Math.floor(p.x / (STRIP / (st.grid.n + extra))) - extra;
      if (i < 0 || i >= st.grid.n) return;
      choose(Math.floor(i / st.grid.g), i % st.grid.g);
    });
    seq.canvas.addEventListener('pointermove', onSequence);
    seq.canvas.addEventListener('pointerdown', onSequence);
    side.onChange(core.guard(body, function () { regrid(function () { st.side = Number(side.value()); }); }));
    patchSize.onChange(core.guard(body, function () { regrid(function () { st.patch = Number(patchSize.value()); }); }));
    flatten.input.addEventListener('change', core.guard(body, function () {
      st.flat = flatten.input.checked;
      flatBox.hidden = !st.flat;
      redraw();
    }));
    cls.input.addEventListener('change', core.guard(body, function () {
      st.cls = cls.input.checked;
      redraw();
    }));
    core.on('image-changed', core.guard(body, function () {
      load();
      redraw();
    }));
    core.on('theme-changed', redraw);

    load();
    drawFast();
    // the first toy projection builds a 384 x 768 matrix, so the token strips follow one frame later; blank strips hold their place
    [projBox, posBox, tokBox].forEach(function (b) { b.begin(STRIP, 20); });
    tick(core.guard(body, drawToken));
  });

  // ------------------------------------------------------------------ Lab 2B: attention by hand, the scale, six heads

  Labs.register('lab-2b-attention', function mount(body, core) {
    var ID = 'lab-2b-attention';
    var D = DEFAULTS.b;
    var TOK = D.tokens;
    var st = { ask: TOK.indexOf(D.asking), target: TOK.indexOf(D.target), history: [], width: D.width, scaled: D.scaled, seed: D.seed, query: D.centre_patch[0] * D.grid + D.centre_patch[1], measures: null, pic: null, source: 'sample' };

    // ---- panel 1: four tokens by hand, and one gradient step of the asking token's query
    var controls1 = core.el('div', { class: 'lab-controls' });
    var stage1 = core.el('div', { class: 'lab-stage' });
    controls1.appendChild(core.el('p', { class: 'control-group-title', text: 'Four tokens, two numbers each' }));
    var qT = matrix('q', term('query', 'Queries') + ' q', D.q);
    var kT = matrix('k', term('key', 'Keys') + ' k', D.k);
    var vT = matrix('v', term('value', 'Values') + ' v', D.v);
    controls1.appendChild(qT.root);
    controls1.appendChild(kT.root);
    controls1.appendChild(vT.root);
    var ask = segmented(core, { id: ID + '-asking', label: 'Token that asks', options: TOK.map(function (t) { return { value: t, text: t }; }), value: D.asking });
    controls1.appendChild(ask.root);
    var reset = button(core, ID + '-reset', 'Reset the numbers');
    controls1.appendChild(core.el('div', { class: 'button-row' }, reset));
    controls1.appendChild(hint(core, 'Type any number from ' + CH.minus + '9 to 9. Every table beside or below follows as you type.'));
    var learnGroup = core.el('div', { class: 'control-group' });
    learnGroup.appendChild(core.el('p', { class: 'control-group-title', text: 'Teach the asking token' }));
    var target = segmented(core, { id: ID + '-target', label: 'Its output should become the value of', options: TOK.map(function (t) { return { value: t, text: t }; }), value: D.target });
    learnGroup.appendChild(target.root);
    var lr = slider(core, { id: ID + '-step-size', label: 'Step size', min: D.learning_rate.min, max: D.learning_rate.max, step: D.learning_rate.step, value: D.learning_rate.default, digits: 1 });
    learnGroup.appendChild(lr.root);
    var stepBtn = button(core, ID + '-step', 'One gradient step', true);
    var undoBtn = button(core, ID + '-undo', 'Undo the steps');
    learnGroup.appendChild(core.el('div', { class: 'button-row' }, [stepBtn, undoBtn]));
    learnGroup.appendChild(hint(core, 'A step changes only the asking token\'s query, against the gradient of the loss; watch its weight on the target token grow.'));
    controls1.appendChild(learnGroup);

    var setup = core.el('p', { class: 'readout', html: 'Each vector has d = 2 numbers, so every score, the dot product q ' + CH.middot + ' k, is divided by ' +
      CH.sqrt + '2 ' + CH.approx + ' 1.414. A softmax then turns each row of scores into ' + term('attention weight', 'attention weights') + '. ' +
      'The lab computes with every digit and prints its numbers rounded, to three decimals and the keys\' factors of the gradient step to four, so a step that you redo from the printed numbers can differ in its last decimal.' });
    var worked = core.el('div', { class: 'readout' });
    var workedLines = [];
    for (var w = 0; w < 8; w++) {
      workedLines.push(core.el('p'));
      worked.appendChild(workedLines[w]);
    }
    var scoresT = square('Scores q ' + CH.middot + ' k / ' + CH.sqrt + '2 (row: the token that asks)', false);
    var weightsT = square('Attention weights: the softmax of each row', true);
    var outT = outputs();
    var learn = core.el('div', { class: 'readout' });
    var learnLines = [];
    for (var w2 = 0; w2 < 6; w2++) {
      learnLines.push(core.el('p'));
      learn.appendChild(learnLines[w2]);
    }
    var historyList = core.el('ol', { class: 'readout', start: '0' });
    stage1.appendChild(setup);
    stage1.appendChild(worked);
    stage1.appendChild(core.el('div', { class: 'stage-row' }, [
      core.el('div', { class: 'scroll-x' }, scoresT.root),
      core.el('div', { class: 'scroll-x' }, weightsT.root),
      core.el('div', { class: 'scroll-x' }, outT.root)
    ]));
    stage1.appendChild(core.el('p', { class: 'stage-label', text: 'One gradient step, worked out' }));
    stage1.appendChild(learn);
    stage1.appendChild(core.el('p', { class: 'stage-label', text: 'The steps so far: the loss and the weight on the target' }));
    stage1.appendChild(historyList);

    // ---- panel 2: why divide by the square root of d
    var controls2 = core.el('div', { class: 'lab-controls', style: 'border-top: 1px solid var(--line)' });
    var stage2 = core.el('div', { class: 'lab-stage', style: 'border-top: 1px solid var(--line)' });
    controls2.appendChild(core.el('p', { class: 'control-group-title', text: 'Why divide by ' + CH.sqrt + 'd' }));
    var width = segmented(core, {
      id: ID + '-width', label: 'Width d of a query and a key',
      options: D.widths.map(function (dd) { return { value: String(dd), text: String(dd) }; }), value: String(st.width),
      hint: 'A head of ViT-S/16 works with 64 numbers; 384 is a whole token. ' + mark('fact', '[our architecture doc \u00A73.2] (vit_head_width, token_width)')
    });
    controls2.appendChild(width.root);
    var scaled = toggle(core, { id: ID + '-scaled', label: 'Divide every score by ' + CH.sqrt + 'd', checked: st.scaled });
    controls2.appendChild(core.el('div', { class: 'toggle-row' }, [scaled.root]));
    var redrawBtn = button(core, ID + '-new-draw', 'New random numbers');
    controls2.appendChild(core.el('div', { class: 'button-row' }, redrawBtn));
    controls2.appendChild(hint(core, 'Every query and key here holds d random numbers of mean 0 and spread 1 (uniform between ' + CH.minus + CH.sqrt + '3 and ' + CH.sqrt + '3), a toy stand-in for queries and keys of spread 1. ' + mark('toy')));
    var histSvg = core.el('svg', { class: 'chart', viewBox: '0 0 460 190', width: '460', role: 'img', 'aria-label': 'Histogram of the dot products of random vectors, before and after the division by the square root of d' });
    var histText = core.el('p', { class: 'readout' });
    var barSvg = core.el('svg', { class: 'chart', viewBox: '0 0 460 190', width: '460', role: 'img', 'aria-label': 'The largest softmax weights of one row of 196 scores' });
    var barText = readoutList(core, [['max', 'Largest weight'], ['eff', 'Spread'], ['slope', 'Slope of the softmax']]);
    stage2.appendChild(core.el('div', { class: 'stage-cell' }, [core.el('span', { class: 'stage-label', text: '2,000 scores q ' + CH.middot + ' k of random vectors: grey before the division, ink after it' }), histSvg, histText]));
    var barKey = core.el('div', { class: 'p2-legend' });
    drawLegend(core, barKey, [{ label: 'an even share, 1/196 of the weight', muted: true, dash: true }]);
    stage2.appendChild(core.el('div', { class: 'stage-cell' }, [core.el('span', { class: 'stage-label', text: 'One query against 196 random keys: the 24 largest weights after the softmax' }), barKey, barSvg, barText.root]));

    // ---- panel 3: six toy heads on the picture
    var controls3 = core.el('div', { class: 'lab-controls', style: 'border-top: 1px solid var(--line)' });
    var stage3 = core.el('div', { class: 'lab-stage', style: 'border-top: 1px solid var(--line)' });
    controls3.appendChild(core.el('p', { class: 'control-group-title', text: 'Six toy heads on the picture' }));
    var chooser = imageChooser(core, ID, 'Picture used by Lab 2B');
    if (chooser) controls3.appendChild(chooser);
    controls3.appendChild(hint(core, 'Click or tap a patch on any map to make it the patch that asks; after a click, the arrow keys move it. Each toy head compares one kind of measurement of the patches. ' + mark('toy')));
    var headRow = core.el('div', { class: 'stage-row' });
    var heads = D.heads.map(function (h, i) {
      var box = canvasBox(core, { id: ID + '-head-' + (i + 1), focusable: true, label: 'Toy head ' + (i + 1) + ', ' + h.name + ': its weights over the picture. Click a patch, or use the arrow keys, to choose the patch that asks.' });
      var label = core.el('span', { class: 'stage-label' });
      headRow.appendChild(core.el('div', { class: 'stage-cell', style: 'width: ' + D.map_side + 'px; max-width: 100%' }, [box.canvas, label]));
      return { box: box, label: label, spec: h };
    });
    var headFacts = readoutList(core, [['asks', 'Patch that asks'], ['sum', 'Each map\'s weights add up to']]);
    stage3.appendChild(headRow);
    stage3.appendChild(headFacts.root);

    body.appendChild(controls1);
    body.appendChild(stage1);
    body.appendChild(controls2);
    body.appendChild(stage2);
    body.appendChild(controls3);
    body.appendChild(stage3);

    // matrix(kind, titleHtml, values): a small table of editable 2-number vectors for the four tokens.
    function matrix(kind, titleHtml, values) {
      var inputs = [];
      var rows = TOK.map(function (name, i) {
        var tds = [0, 1].map(function (j) {
          var input = core.el('input', {
            type: 'number', id: ID + '-' + kind + '-' + name.toLowerCase() + '-' + (j + 1),
            step: String(D.input_step), min: String(D.input_range[0]), max: String(D.input_range[1]),
            value: String(values[i][j]), 'aria-label': kind + ' of token ' + name + ', number ' + (j + 1)
          });
          inputs.push(input);
          return core.el('td', null, input);
        });
        return core.el('tr', null, [core.el('th', { scope: 'row', text: name })].concat(tds));
      });
      var root2 = core.el('table', { class: 'matrix' }, [core.el('caption', { html: titleHtml }), core.el('tbody', null, rows)]);
      return {
        root: root2, inputs: inputs,
        // read(): the four vectors as numbers (an empty or unreadable box counts as 0), kept inside the input range.
        read: function () {
          var out = [];
          for (var i = 0; i < TOK.length; i++) {
            var pair = [];
            for (var j = 0; j < 2; j++) {
              var inp = inputs[i * 2 + j];
              var v = parseFloat(inp.value);
              var ok = isFinite(v);
              if (ok) inp.removeAttribute('aria-invalid'); else inp.setAttribute('aria-invalid', 'true');
              pair.push(ok ? clamp(v, D.input_range[0], D.input_range[1]) : 0);
            }
            out.push(pair);
          }
          return out;
        },
        // write(i, pair): put a vector into row i, rounded to three decimals.
        write: function (i, pair) {
          for (var j = 0; j < 2; j++) inputs[i * 2 + j].value = String(Math.round(pair[j] * 1000) / 1000);
        },
        // tidy(): write back clamped values once the reader leaves a box.
        tidy: function () {
          inputs.forEach(function (inp) {
            var v = parseFloat(inp.value);
            if (isFinite(v) && v !== clamp(v, D.input_range[0], D.input_range[1])) inp.value = String(clamp(v, D.input_range[0], D.input_range[1]));
          });
        },
        // reset(): the default numbers again.
        reset: function () {
          for (var i = 0; i < TOK.length; i++) for (var j = 0; j < 2; j++) inputs[i * 2 + j].value = String(values[i][j]);
        }
      };
    }

    // square(caption, withSum): a 4 x 4 table (rows: the token that asks; columns: the other token), with an optional sum column.
    function square(caption, withSum) {
      var cells = [];
      var trs = [];
      var head = [core.el('th', { scope: 'col', text: 'asks' })].concat(TOK.map(function (t) { return core.el('th', { scope: 'col', class: 'num', text: t }); }));
      if (withSum) head.push(core.el('th', { scope: 'col', class: 'num', text: 'sum' }));
      TOK.forEach(function (t) {
        var tds = TOK.map(function () { return core.el('td', { class: 'num' }); });
        var sum = withSum ? core.el('td', { class: 'num' }) : null;
        cells.push({ tds: tds, sum: sum });
        trs.push(core.el('tr', null, [core.el('th', { scope: 'row', text: t })].concat(tds, sum ? [sum] : [])));
      });
      var el = core.el('table', null, [core.el('caption', { text: caption }), core.el('thead', null, core.el('tr', null, head)), core.el('tbody', null, trs)]);
      return { root: el, cells: cells, rows: trs };
    }

    // outputs(): the table of the four output vectors.
    function outputs() {
      var cells = [];
      var trs = TOK.map(function (t) {
        var tds = [core.el('td', { class: 'num' }), core.el('td', { class: 'num' })];
        cells.push(tds);
        return core.el('tr', null, [core.el('th', { scope: 'row', text: t })].concat(tds));
      });
      var el = core.el('table', null, [
        core.el('caption', { text: 'Outputs: the weighted sum of the values' }),
        core.el('thead', null, core.el('tr', null, [core.el('th', { scope: 'col', text: 'token' }), core.el('th', { scope: 'col', class: 'num', text: '1st' }), core.el('th', { scope: 'col', class: 'num', text: '2nd' })])),
        core.el('tbody', null, trs)
      ]);
      return { root: el, cells: cells, rows: trs };
    }

    // n(x): a number for a worked line, in brackets when it is negative.
    function n(x) {
      var s = trimNum(core, x, 3);
      return x < 0 ? '(' + s + ')' : s;
    }

    // vec(values, digits): a vector written as (a, b).
    function vec(values, digits) {
      var out = [];
      for (var i = 0; i < values.length; i++) out.push(digits === undefined ? trimNum(core, values[i], 3) : core.fmt(values[i], digits));
      return '(' + out.join(', ') + ')';
    }

    // drawExample(): the worked lines, the three tables and the worked gradient step.
    function drawExample() {
      var q = qT.read(), k = kT.read(), v = vT.read();
      var r = P2.byHand(q, k, v, D.d);
      var a = st.ask, qa = q[a];
      workedLines[0].textContent = 'Token ' + TOK[a] + ' asks with its query q = ' + vec(qa) + '.';
      for (var j = 0; j < TOK.length; j++) {
        workedLines[1 + j].textContent = 'Score with ' + TOK[j] + ': (' + n(qa[0]) + ' ' + CH.times + ' ' + n(k[j][0]) + ' + ' + n(qa[1]) + ' ' +
          CH.times + ' ' + n(k[j][1]) + ') / ' + core.fmt(r.sd, 3) + ' = ' + core.fmt(r.scores[a][j], 3);
      }
      workedLines[5].textContent = 'exp of each score: ' + r.exps[a].map(function (x) { return core.fmt(x, 3); }).join(', ') + '; their total is ' + core.fmt(r.sums[a], 3) + '.';
      workedLines[6].textContent = 'Each exp divided by the total gives the weights ' + vec(r.weights[a], 3) + ', which add up to ' + core.fmt(sumOf(r.weights[a]), 3) + '.';
      var terms = r.weights[a].map(function (wa, jj) { return core.fmt(wa, 3) + ' ' + CH.times + ' ' + vec(v[jj]); });
      workedLines[7].textContent = 'Output: ' + terms.join(' + ') + ' = ' + vec(r.outputs[a], 3) + '.';
      for (var i = 0; i < TOK.length; i++) {
        for (var jj = 0; jj < TOK.length; jj++) {
          scoresT.cells[i].tds[jj].textContent = core.fmt(r.scores[i][jj], 3);
          var wv = r.weights[i][jj];
          var cell = weightsT.cells[i].tds[jj];
          cell.textContent = core.fmt(wv, 3);
          cell.style.backgroundColor = 'color-mix(in srgb, var(--ink) ' + Math.round(clamp(wv, 0, 1) * 30) + '%, transparent)';
        }
        weightsT.cells[i].sum.textContent = core.fmt(sumOf(r.weights[i]), 3);
        outT.cells[i][0].textContent = core.fmt(r.outputs[i][0], 3);
        outT.cells[i][1].textContent = core.fmt(r.outputs[i][1], 3);
        [scoresT.rows[i], weightsT.rows[i], outT.rows[i]].forEach(function (tr) {
          if (i === a) { tr.setAttribute('aria-current', 'true'); tr.style.fontWeight = '700'; }
          else { tr.removeAttribute('aria-current'); tr.style.fontWeight = ''; }
        });
      }
      drawLearning(q, k, v);
    }

    // drawLearning(q, k, v): the gradient of L = 1/2 |o - v_target|^2 on the asking token's query, worked line by line.
    function drawLearning(q, k, v) {
      var a = st.ask, t = st.target;
      var s = P2.queryStep(q, k, v, a, v[t], lr.value(), D.d);
      learnLines[0].textContent = 'Target: token ' + TOK[a] + '\'s output should become ' + TOK[t] + '\'s value ' + vec(v[t]) + '. The loss is ' + CH.half + ' |o ' + CH.minus +
        ' target|' + CH.sq + ' = ' + CH.half + ' (' + n(s.g[0]) + CH.sq + ' + ' + n(s.g[1]) + CH.sq + ') = ' + core.fmt(s.loss, 3) + '.';
      learnLines[1].textContent = 'The gradient on the output is g = o ' + CH.minus + ' target = ' + vec(s.g, 3) + '.';
      learnLines[2].textContent = 'How much each value would help: g ' + CH.middot + ' v = ' + s.gv.map(function (x, j) { return TOK[j] + ' ' + core.fmt(x, 3); }).join(', ') +
        '; the attention-weighted average is g ' + CH.middot + ' o = ' + core.fmt(s.go, 3) + '.';
      learnLines[3].textContent = 'Each key\'s share of ' + CH.partial + 'L/' + CH.partial + 'q, weight ' + CH.times + ' (g ' + CH.middot + ' v ' + CH.minus + ' g ' + CH.middot + ' o) / ' +
        core.fmt(Math.sqrt(D.d), 3) + ' times the key: ' + s.coef.map(function (c, j) { return TOK[j] + ' ' + core.fmt(c, 4) + ' ' + CH.times + ' ' + vec(k[j]); }).join('; ') + '.';
      learnLines[4].textContent = 'Together ' + CH.partial + 'L/' + CH.partial + 'q = ' + vec(s.grad, 3) + '. A step of size ' + trimNum(core, lr.value(), 1) + ' moves the query against it: ' +
        vec(q[a]) + ' ' + CH.minus + ' ' + trimNum(core, lr.value(), 1) + ' ' + CH.times + ' ' + vec(s.grad, 3) + ' = ' + vec(s.qNew, 3) + '.';
      learnLines[5].textContent = 'After that step the weights would be ' + vec(s.weightsNew, 3) + ' (on ' + TOK[t] + ': ' + core.fmt(s.weights[t], 3) + ' ' + CH.arrow + ' ' +
        core.fmt(s.weightsNew[t], 3) + ') and the loss ' + core.fmt(s.loss, 3) + ' ' + CH.arrow + ' ' + core.fmt(s.lossNew, 3) + '.';
      clearNode(historyList);
      var shown = st.history.slice(-D.steps_listed);
      var first = st.history.length - shown.length;
      historyList.setAttribute('start', String(first));
      shown.concat([{ loss: s.loss, w: s.weights[t] }]).forEach(function (h) {
        historyList.appendChild(core.el('li', { text: 'loss ' + core.fmt(h.loss, 3) + ', weight on ' + TOK[t] + ' ' + core.fmt(h.w, 3) }));
      });
    }

    // doStep(): apply one gradient step to the asking token's query (written into its boxes) and remember the state before it.
    function doStep() {
      var q = qT.read(), k = kT.read(), v = vT.read();
      if (!st.saved) st.saved = { ask: st.ask, q: q[st.ask].slice() };
      var s = P2.queryStep(q, k, v, st.ask, v[st.target], lr.value(), D.d);
      st.history.push({ loss: s.loss, w: s.weights[st.target] });
      qT.write(st.ask, s.qNew);
      redrawExample();
    }

    // undoSteps(): put the asking token's query back as it was before the first step.
    function undoSteps() {
      if (st.saved) qT.write(st.saved.ask, st.saved.q);
      st.saved = null;
      st.history = [];
      redrawExample();
    }

    // drawScale(): the histogram of raw and divided dot products and one softmax row at the chosen width.
    function drawScale() {
      var dd = st.width;
      var sp = P2.dotSpread(dd, D.pairs, st.seed);
      var root2 = Math.sqrt(dd);
      var hi = Math.max(4 * sp.sdRaw, 4);
      var bins = D.bins, rawH = new Array(bins).fill(0), scH = new Array(bins).fill(0);
      for (var i = 0; i < sp.raw.length; i++) {
        var b1 = Math.floor((sp.raw[i] + hi) / (2 * hi) * bins), b2 = Math.floor((sp.raw[i] / root2 + hi) / (2 * hi) * bins);
        if (b1 >= 0 && b1 < bins) rawH[b1] += 1;
        if (b2 >= 0 && b2 < bins) scH[b2] += 1;
      }
      var maxCount = Math.max(Math.max.apply(null, rawH), Math.max.apply(null, scH), 1);
      clearNode(histSvg);
      var W = 460, H = 190, L = 44, R = 10, T = 16, B = 30;
      var bw = (W - L - R) / bins;
      var g = core.el('g', { class: 'axis' });
      g.appendChild(core.el('line', { x1: String(L), x2: String(W - R), y1: String(H - B), y2: String(H - B) }));
      histSvg.appendChild(g);
      for (var k2 = 0; k2 < bins; k2++) {
        var x = L + k2 * bw;
        var hr = (H - T - B) * rawH[k2] / maxCount, hs = (H - T - B) * scH[k2] / maxCount;
        if (hr > 0) histSvg.appendChild(core.el('rect', { x: String(r1(x + 0.5)), y: String(r1(H - B - hr)), width: String(r1(bw - 1)), height: String(r1(hr)), style: 'fill: var(--muted); fill-opacity: 0.35' }));
        if (hs > 0) histSvg.appendChild(core.el('rect', { x: String(r1(x + bw * 0.2)), y: String(r1(H - B - hs)), width: String(r1(bw * 0.6)), height: String(r1(hs)), style: 'fill: var(--ink)' }));
      }
      [-hi, -hi / 2, 0, hi / 2, hi].forEach(function (v) {
        histSvg.appendChild(svgText(core, L + (v + hi) / (2 * hi) * (W - L - R), H - B + 14, core.fmt(v, Math.abs(v) < 10 ? 1 : 0), { 'text-anchor': 'middle' }));
      });
      histSvg.appendChild(svgText(core, L + (W - L - R) / 2, H - 2, 'score', { 'text-anchor': 'middle' }));
      histText.textContent = 'Spread of the raw scores: ' + core.fmt(sp.sdRaw, 2) + ' (' + CH.sqrt + dd + ' = ' + core.fmt(root2, 2) + '); after dividing by ' +
        CH.sqrt + dd + ': ' + core.fmt(sp.sdScaled, 2) + '. The raw spread grows like ' + CH.sqrt + 'd; the division keeps it near 1 at every width.';
      var row = P2.scoreRow(dd, D.row, st.seed, st.scaled);
      clearNode(barSvg);
      var nb = D.bars, bW = (W - L - R) / nb;
      var top = Math.max(row.max, 1 / D.row);
      var g2 = core.el('g', { class: 'axis' });
      g2.appendChild(core.el('line', { x1: String(L), x2: String(W - R), y1: String(H - B), y2: String(H - B) }));
      barSvg.appendChild(g2);
      for (var j = 0; j < nb; j++) {
        var h = (H - T - B) * row.weights[j] / top;
        barSvg.appendChild(core.el('rect', { x: String(r1(L + j * bW + 1)), y: String(r1(H - B - h)), width: String(r1(bW - 2)), height: String(r1(Math.max(h, 0.5))), style: 'fill: var(--ink)' }));
      }
      var ye = H - B - (H - T - B) * (1 / D.row) / top;
      barSvg.appendChild(core.el('line', { x1: String(L), x2: String(W - R), y1: String(r1(ye)), y2: String(r1(ye)), style: 'stroke: var(--muted); stroke-dasharray: 4 3' }));
      barSvg.appendChild(svgText(core, L - 4, T + 4, core.fmt(top, 3), { 'text-anchor': 'end' }));
      barSvg.appendChild(svgText(core, L - 4, H - B, '0', { 'text-anchor': 'end' }));
      barSvg.appendChild(svgText(core, L + (W - L - R) / 2, H - 6, 'the 24 largest weights, largest first', { 'text-anchor': 'middle' }));
      barText.set('max', core.fmt(row.max, 3) + (st.scaled ? '' : ' (without the division)'));
      barText.set('eff', 'about ' + core.fmt(row.effective, 1) + ' keys\' worth of weight, out of 196');
      barText.set('slope', core.fmt(row.slope, 3) + ': how strongly the 196 weights move when the scores move, the size of the table of how much each weight moves when each score moves (a(1 ' + CH.minus +
        ' a) for a weight a and its own score, minus the product of the two weights for another score); at 0 no gradient passes back through the row to the queries and keys');
    }

    // loadPicture(): the shared picture at 224 pixels, its patch grid and the measurements of its patches.
    function loadPicture() {
      var cur = core.currentImage(D.grid * 16);
      st.source = cur.source || 'sample';
      st.pic = core.toCanvas(cur.imageData);
      st.measures = P2.patchMeasures(core.patchGrid(cur.imageData, 16));
    }

    // place(i): "row r, column c", with the sample scene's object in brackets when the sample is shown.
    function place(i) {
      var g = D.grid, r = Math.floor(i / g), c = i % g;
      var s = 'row ' + r + ', column ' + c;
      if (st.source === 'sample' && typeof core.sceneObjectAt === 'function') {
        var obj = core.sceneObjectAt((c + 0.5) / g, (r + 0.5) / g);
        if (obj) s += ' (' + obj + ')';
      }
      return s;
    }

    // drawHeads(): the six toy heads' maps over the picture for the patch that asks.
    function drawHeads() {
      var th = core.theme();
      var g = D.grid, S = D.map_side, cell = S / g, N = g * g;
      var sums = [];
      heads.forEach(function (h, hi) {
        var wts = P2.toyHeadRow(st.measures, st.query, h.spec);
        sums.push(sumOf(wts));
        var ctx = h.box.begin(S, S);
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(st.pic, 0, 0, S, S);
        var wmax = 0;
        for (var i = 0; i < N; i++) wmax = Math.max(wmax, wts[i]);
        for (var j = 0; j < N; j++) {
          var fade = 0.86 * (1 - Math.sqrt(wts[j] / wmax));
          if (fade > 0.01) {
            ctx.fillStyle = core.rgba(th.paper, fade);
            ctx.fillRect((j % g) * cell, Math.floor(j / g) * cell, cell, cell);
          }
        }
        var qx = (st.query % g) * cell, qy = Math.floor(st.query / g) * cell;
        ctx.lineWidth = 3; ctx.strokeStyle = th.paper; ctx.strokeRect(qx, qy, cell, cell);
        ctx.lineWidth = 1.5; ctx.strokeStyle = th.ink; ctx.strokeRect(qx, qy, cell, cell);
        h.label.textContent = 'Head ' + (hi + 1) + ', ' + h.spec.name + ': about ' + core.fmt(Math.exp(P2.entropy(wts)), 0) + ' patches\' worth';
      });
      headFacts.set('asks', place(st.query));
      headFacts.set('sum', sums.map(function (s) { return core.fmt(s, 3); }).join(', '));
    }

    var redrawExample = later(body, core, drawExample);
    var redrawScale = later(body, core, drawScale);
    var redrawHeads = later(body, core, drawHeads);

    [qT, kT, vT].forEach(function (t) {
      t.inputs.forEach(function (inp) {
        inp.addEventListener('input', redrawExample);
        inp.addEventListener('change', core.guard(body, function () { t.tidy(); redrawExample(); }));
      });
    });
    ask.onChange(core.guard(body, function () {
      st.ask = TOK.indexOf(ask.value());
      st.history = [];
      st.saved = null;
      redrawExample();
    }));
    target.onChange(core.guard(body, function () {
      st.target = TOK.indexOf(target.value());
      st.history = [];
      st.saved = null;
      redrawExample();
    }));
    lr.input.addEventListener('input', core.guard(body, function () { lr.show(); redrawExample(); }));
    stepBtn.addEventListener('click', core.guard(body, doStep));
    undoBtn.addEventListener('click', core.guard(body, undoSteps));
    reset.addEventListener('click', core.guard(body, function () {
      qT.reset(); kT.reset(); vT.reset();
      ask.set(D.asking);
      target.set(D.target);
      st.ask = TOK.indexOf(D.asking);
      st.target = TOK.indexOf(D.target);
      st.history = [];
      st.saved = null;
      redrawExample();
    }));
    width.onChange(core.guard(body, function () { st.width = Number(width.value()); redrawScale(); }));
    scaled.input.addEventListener('change', core.guard(body, function () { st.scaled = scaled.input.checked; redrawScale(); }));
    redrawBtn.addEventListener('click', core.guard(body, function () { st.seed += 1; redrawScale(); }));

    // chooseQuery(row, col): make the patch at (row, col) the one that asks.
    function chooseQuery(row, col) {
      var g = D.grid;
      var q = clamp(Math.floor(row), 0, g - 1) * g + clamp(Math.floor(col), 0, g - 1);
      if (q === st.query) return;
      st.query = q;
      redrawHeads();
    }
    heads.forEach(function (h) {
      h.box.canvas.addEventListener('click', core.guard(body, function (ev) {
        var p = h.box.point(ev), cell = D.map_side / D.grid;
        chooseQuery(p.y / cell, p.x / cell);
      }));
      h.box.canvas.addEventListener('keydown', core.guard(body, function (ev) {
        var dlt = arrowDelta(ev, D.arrow_steps);
        if (!dlt) return;
        ev.preventDefault();
        chooseQuery(Math.floor(st.query / D.grid) + dlt[1], (st.query % D.grid) + dlt[0]);
      }));
    });
    core.on('image-changed', core.guard(body, function () { loadPicture(); redrawHeads(); }));
    core.on('theme-changed', function () { redrawExample(); redrawScale(); redrawHeads(); });

    drawExample();
    drawScale();
    loadPicture();
    drawHeads();
  });

  // ------------------------------------------------------------------ Lab 2C: one block, every number; twelve blocks

  Labs.register('lab-2c-block', function mount(body, core) {
    var ID = 'lab-2c-block';
    var D = DEFAULTS.c;
    var TOK = D.tokens;
    var SHAPE = { width: D.width, hidden: D.hidden, decimals: D.decimals, depth: D.depth };
    var st = { follow: TOK.indexOf(D.follow), residual: D.residual, norm: D.layer_norm, spread: D.spread.default, seed: D.seed, blocks: null };

    // ---- panel 1 controls
    var controls1 = core.el('div', { class: 'lab-controls' });
    var stage1 = core.el('div', { class: 'lab-stage' });
    controls1.appendChild(core.el('p', { class: 'control-group-title', text: 'One block, four tokens of four numbers' }));
    var follow = segmented(core, { id: ID + '-follow', label: 'Token to follow', options: TOK.map(function (t) { return { value: t, text: t }; }), value: D.follow });
    controls1.appendChild(follow.root);
    var resT = toggle(core, { id: ID + '-residual', label: 'Skip connections (add the input back)', checked: st.residual });
    var lnT = toggle(core, { id: ID + '-layernorm', label: 'LayerNorm before attention and before the MLP', checked: st.norm });
    controls1.appendChild(core.el('div', { class: 'toggle-row' }, [resT.root, lnT.root]));
    var spread = slider(core, { id: ID + '-spread', label: 'Spread of the toy weights', min: D.spread.min, max: D.spread.max, step: D.spread.step, value: D.spread.default, digits: 2 });
    controls1.appendChild(spread.root);
    var newW = button(core, ID + '-new-weights', 'New random weights');
    var resetBtn = button(core, ID + '-reset', 'Reset');
    controls1.appendChild(core.el('div', { class: 'button-row' }, [newW, resetBtn]));
    controls1.appendChild(hint(core, 'Every toy weight is a random number of this spread, rounded to two decimals; every bias starts at 0, and each LayerNorm\'s scale and shift start at 1 and 0, as the real code starts them. ' + mark('toy')));
    controls1.appendChild(hint(core, 'The real code draws each linear layer\'s weights with a spread of 0.02 from 384 or 1,536 inputs. From 4 inputs a spread of 0.2 gives a toy layer about the same gain: 0.2 ' + CH.times + ' ' + CH.sqrt + '4 = 0.4, against 0.02 ' + CH.times + ' ' + CH.sqrt + '384 ' + CH.approx + ' 0.39. ' +
      mark('fact', '[code: cluster/selfpatch_official/selfpatch_vision_transformer.py:291-298] (p2_init_spread)')));
    var editBox = core.el('details', null, [core.el('summary', { text: 'Edit the four tokens' })]);
    var zT = tokenInputs();
    editBox.appendChild(zT.root);
    controls1.appendChild(editBox);

    // ---- panel 1 stage
    var fwdTable = core.el('table', { class: 'p2-stages' });
    var attnRow = core.el('div', { class: 'stage-row' });
    var attnTables = [0, 1].map(function (h) {
      var t = numTable(core, 'Head ' + (h + 1) + ': attention weights (row: the token that asks)', TOK, TOK);
      attnRow.appendChild(core.el('div', { class: 'scroll-x' }, t.root));
      return t;
    });
    var bwdLead = core.el('p', { class: 'readout' });
    var bwdTable = core.el('table', { class: 'p2-stages' });
    var weightsBox = core.el('details', null, [core.el('summary', { text: 'The toy weights of this block (rows: input number; columns: output number)' })]);
    var weightsRow = core.el('div', { class: 'stage-row' });
    weightsBox.appendChild(weightsRow);
    stage1.appendChild(core.el('p', { class: 'stage-label', text: 'Forward: the followed token through the block, every number' }));
    stage1.appendChild(core.el('div', { class: 'scroll-x' }, fwdTable));
    stage1.appendChild(attnRow);
    stage1.appendChild(core.el('p', { class: 'stage-label', text: 'Backward: the gradient of the toy task\'s loss, from the block\'s output back to its input' }));
    stage1.appendChild(bwdLead);
    stage1.appendChild(core.el('div', { class: 'scroll-x' }, bwdTable));
    stage1.appendChild(weightsBox);

    // ---- panel 2: twelve blocks
    var controls2 = core.el('div', { class: 'lab-controls', style: 'border-top: 1px solid var(--line)' });
    var stage2 = core.el('div', { class: 'lab-stage', style: 'border-top: 1px solid var(--line)' });
    controls2.appendChild(core.el('p', { class: 'control-group-title', text: 'Twelve blocks' }));
    controls2.appendChild(hint(core, 'Twelve toy blocks, each with its own random weights, one after another, as in ViT-S/16. Each chart compares the stack with and without one ingredient, the others switched on; the loss chart also trains it with its skips and without LayerNorm. The tokens, the spread and the weights are those of the panel above. ' + mark('toy')));
    controls2.appendChild(hint(core, 'The toy task: every token must leave the twelfth block carrying the numbers the next token came in with (A takes B\'s, B takes C\'s, C takes D\'s, D takes A\'s). Only attention can move numbers from one token to another.'));
    var sizeSvg = core.el('svg', { class: 'chart', viewBox: '0 0 460 200', width: '460', role: 'img', 'aria-label': 'The mean size of the tokens after each of the twelve blocks, with and without LayerNorm' });
    var gradSvg = core.el('svg', { class: 'chart', viewBox: '0 0 460 200', width: '460', role: 'img', 'aria-label': 'The size of the gradient that reaches each block, with and without the skip connections' });
    var lossSvg = core.el('svg', { class: 'chart', viewBox: '0 0 460 200', width: '460', role: 'img', 'aria-label': 'The toy task\'s loss over 100 steps of plain gradient descent, with and without the skip connections, and with them but without LayerNorm' });
    var sizeText = core.el('p', { class: 'readout' });
    var gradText = core.el('p', { class: 'readout' });
    var lossText = core.el('p', { class: 'readout' });
    var sizeKey = core.el('div', { class: 'p2-legend' });
    var gradKey = core.el('div', { class: 'p2-legend' });
    var lossKey = core.el('div', { class: 'p2-legend' });
    stage2.appendChild(core.el('div', { class: 'stage-cell' }, [core.el('span', { class: 'stage-label', text: '1. How big the tokens are after each block (skip connections on)' }), sizeKey, sizeSvg, sizeText]));
    stage2.appendChild(core.el('div', { class: 'stage-cell' }, [core.el('span', { class: 'stage-label', text: '2. How big the gradient is that reaches each block (LayerNorm on)' }), gradKey, gradSvg, gradText]));
    stage2.appendChild(core.el('div', { class: 'stage-cell' }, [core.el('span', { class: 'stage-label', text: '3. The toy task\'s loss during 100 steps of plain gradient descent: with and without the skips (LayerNorm on), and with the skips but without LayerNorm' }), lossKey, lossSvg, lossText]));

    body.appendChild(controls1);
    body.appendChild(stage1);
    body.appendChild(controls2);
    body.appendChild(stage2);

    // tokenInputs(): a table of 4 x 4 number boxes for the tokens' numbers.
    function tokenInputs() {
      var inputs = [];
      var rows = TOK.map(function (name, i) {
        var tds = [0, 1, 2, 3].map(function (j) {
          var input = core.el('input', {
            type: 'number', id: ID + '-z-' + name.toLowerCase() + '-' + (j + 1), step: String(D.input_step),
            min: String(D.input_range[0]), max: String(D.input_range[1]), value: String(D.z[i][j]),
            'aria-label': 'token ' + name + ', number ' + (j + 1)
          });
          inputs.push(input);
          return core.el('td', null, input);
        });
        return core.el('tr', null, [core.el('th', { scope: 'row', text: name })].concat(tds));
      });
      return {
        root: core.el('table', { class: 'matrix' }, [core.el('caption', { text: 'The tokens that enter the block' }), core.el('tbody', null, rows)]),
        inputs: inputs,
        // read(): the four tokens as rows of numbers (an unreadable box counts as 0).
        read: function () {
          return TOK.map(function (name, i) {
            return Float64Array.from([0, 1, 2, 3].map(function (j) {
              var inp = inputs[i * 4 + j], v = parseFloat(inp.value);
              if (isFinite(v)) inp.removeAttribute('aria-invalid'); else inp.setAttribute('aria-invalid', 'true');
              return isFinite(v) ? clamp(v, D.input_range[0], D.input_range[1]) : 0;
            }));
          });
        },
        // reset(): the default tokens again.
        reset: function () {
          for (var i = 0; i < TOK.length; i++) for (var j = 0; j < 4; j++) inputs[i * 4 + j].value = String(D.z[i][j]);
        }
      };
    }

    // opts(residual, norm): the options of a forward pass.
    function opts(residual, norm) {
      return { heads: D.heads, eps: D.eps, residual: residual, norm: norm };
    }

    // ensureBlocks(): the twelve toy blocks for the current seed and spread.
    function ensureBlocks() {
      if (!st.blocks || st.blocks.seed !== st.seed || st.blocks.spread !== st.spread) {
        st.blocks = { seed: st.seed, spread: st.spread, list: P2.makeStack(st.seed, st.spread, SHAPE) };
      }
      return st.blocks.list;
    }

    // v3(v): a vector with three decimals.
    function v3(v) {
      return vecText(core, v, 3);
    }

    // stageRow(table, label, value, note): one row of a stage table.
    function stageRow(table, label, value, note) {
      table.appendChild(core.el('tr', null, [
        core.el('th', { scope: 'row', html: label }),
        core.el('td', { class: 'p2-val' }, [core.el('span', { class: 'p2-vec', text: value }), core.el('span', { class: 'p2-note', html: note || '' })])
      ]));
    }

    // drawBlock(): the forward and backward tables of block 1 for the followed token, and the weight tables.
    function drawBlock() {
      var Z = zT.read(), blocks = ensureBlocks(), P = blocks[0], o = opts(st.residual, st.norm);
      var c = P2.blockForward(Z, P, o);
      var T = P2.rotateTargets(Z);
      var L = P2.loss(c.out, T);
      var b = P2.blockBackward(c, P, null, P2.lossGrad(c.out, T), o);
      var i = st.follow, name = TOK[i];
      clearNode(fwdTable);
      fwdTable.appendChild(core.el('tr', null, [core.el('th', { scope: 'col', text: 'Stage' }), core.el('th', { scope: 'col', text: 'Token ' + name + ', and what happened' })]));
      stageRow(fwdTable, '1. enters', v3(Z[i]), 'Z, the token as the block receives it');
      if (st.norm) {
        var l1 = c.ln1[i];
        stageRow(fwdTable, '2. LayerNorm', v3(c.X1[i]), 'mean ' + core.fmt(l1.mu, 3) + ', spread ' + core.fmt(Math.sqrt(l1.v), 3) + '; (Z ' + CH.minus + ' mean) / ' + CH.sqrt + '(variance + ' + CH.eps + '), then ' + CH.times + ' 1 + 0');
      } else {
        stageRow(fwdTable, '2. LayerNorm (off)', v3(c.X1[i]), 'passed on unchanged');
      }
      stageRow(fwdTable, '3. query q', v3(c.Q[i]), 'head 1 uses the first two numbers, head 2 the last two');
      stageRow(fwdTable, '4. key k', v3(c.K[i]), 'what this token offers to every query');
      stageRow(fwdTable, '5. value v', v3(c.V[i]), 'what it hands over');
      stageRow(fwdTable, '6. weights, head 1', v3(c.A[0][i]), 'softmax of q ' + CH.middot + ' k / ' + CH.sqrt + '2 over A, B, C, D');
      stageRow(fwdTable, '7. weights, head 2', v3(c.A[1][i]), 'the same with the second slice');
      stageRow(fwdTable, '8. heads joined', v3(c.O[i]), 'each head\'s weighted sum of the values, side by side');
      stageRow(fwdTable, '9. output layer', v3(c.M[i]), 'the attention branch\'s result, MSA(LN(Z))');
      stageRow(fwdTable, '10. ' + (st.residual ? 'add the input back' : 'no add'), v3(c.U[i]), st.residual ? 'U = Z + MSA(LN(Z))' : 'U = MSA(LN(Z)): the token\'s own numbers are gone');
      stageRow(fwdTable, '11. ' + (st.norm ? 'LayerNorm' : 'LayerNorm (off)'), v3(c.X2[i]), st.norm ? 'U rescaled to mean 0 and spread 1' : 'passed on unchanged');
      stageRow(fwdTable, '12. MLP, 16 numbers', vecText(core, c.Hpre[i], 2), 'the first layer widens the token four times');
      stageRow(fwdTable, '13. after the GELU', vecText(core, c.Hact[i], 2), 'negative numbers squashed towards 0');
      stageRow(fwdTable, '14. MLP, back to 4', v3(c.F[i]), 'the MLP branch\'s result');
      stageRow(fwdTable, '15. ' + (st.residual ? 'add again: leaves' : 'leaves (no add)'), v3(c.out[i]), st.residual ? 'Z\u2032 = U + MLP(LN(U))' : 'Z\u2032 = MLP(LN(U))');
      [0, 1].forEach(function (h) {
        for (var r = 0; r < 4; r++) {
          for (var cc = 0; cc < 4; cc++) {
            var cell = attnTables[h].cells[r][cc], wv = c.A[h][r][cc];
            cell.textContent = core.fmt(wv, 3);
            cell.style.backgroundColor = 'color-mix(in srgb, var(--ink) ' + Math.round(clamp(wv, 0, 1) * 30) + '%, transparent)';
          }
          var tr = attnTables[h].rows[r];
          if (r === i) { tr.setAttribute('aria-current', 'true'); tr.style.fontWeight = '700'; }
          else { tr.removeAttribute('aria-current'); tr.style.fontWeight = ''; }
        }
      });
      var pr = b.parts;
      bwdLead.textContent = 'The toy task wants token ' + name + ' to leave as ' + TOK[(i + 1) % 4] + ' came in, ' + v3(T[i]) + '. The loss over all four tokens is the mean of ' +
        CH.half + ' |Z\u2032 ' + CH.minus + ' target|' + CH.sq + ' = ' + core.fmt(L, 3) + '. Each row below is ' + CH.partial + 'L/' + CH.partial + '(that stage) for token ' + name + '.';
      clearNode(bwdTable);
      bwdTable.appendChild(core.el('tr', null, [core.el('th', { scope: 'col', text: 'Gradient at' }), core.el('th', { scope: 'col', text: 'Token ' + name + ': the gradient, its size and meaning' })]));
      stageRow(bwdTable, 'the output Z\u2032', v3(pr.out[i]), 'size ' + core.fmt(normOf(pr.out[i]), 3) + ': (Z\u2032 ' + CH.minus + ' target) / 4');
      stageRow(bwdTable, 'U, through the skip', v3(pr.Uskip[i]), st.residual ? 'copied unchanged by the add' : 'no skip: nothing');
      stageRow(bwdTable, 'U, through the MLP', v3(pr.Ubranch[i]), 'back through the MLP and its LayerNorm');
      stageRow(bwdTable, 'U, together', v3(pr.U[i]), 'size ' + core.fmt(normOf(pr.U[i]), 3));
      stageRow(bwdTable, 'Z, through the skip', v3(pr.Zskip[i]), st.residual ? 'copied unchanged by the first add' : 'no skip: nothing');
      stageRow(bwdTable, 'Z, through attention', v3(pr.Zbranch[i]), 'back through attention (every token\'s use of ' + name + '\'s key and value) and LayerNorm');
      stageRow(bwdTable, 'Z, together', v3(pr.Z[i]), 'size ' + core.fmt(normOf(pr.Z[i]), 3) + ': what reaches the block before this one');
      drawWeights(P);
    }

    // drawWeights(P): the tables of block 1's toy weights.
    function drawWeights(P) {
      clearNode(weightsRow);
      [['Wq', 'query'], ['Wk', 'key'], ['Wv', 'value'], ['Wo', 'output'], ['W1', 'MLP, first (4 to 16)'], ['W2', 'MLP, second (16 to 4)']].forEach(function (pair) {
        var M = P[pair[0]];
        var rows = M.map(function (row, r) {
          return core.el('tr', null, [core.el('th', { scope: 'row', text: String(r + 1) })].concat(Array.prototype.map.call(row, function (v) { return core.el('td', { class: 'num', text: core.fmt(v, 2) }); })));
        });
        weightsRow.appendChild(core.el('div', { class: 'scroll-x' }, core.el('table', null, [core.el('caption', { text: pair[1] }), core.el('tbody', null, rows)])));
      });
    }

    // drawStack(): the three charts of the twelve-block stack.
    function drawStack() {
      var Z = zT.read(), blocks = ensureBlocks(), T = P2.rotateTargets(Z);
      var xTicks = [0, 3, 6, 9, 12].map(function (v) { return { v: v, text: String(v) }; });
      // 1. token sizes with and without LayerNorm (skips on)
      var fwOn = P2.stackForward(Z, blocks, opts(true, true));
      var fwOff = P2.stackForward(Z, blocks, opts(true, false));
      var sizes = fwOn.sizes.concat(fwOff.sizes).filter(isFinite);
      var lt = logTicks(core, Math.max(Math.min.apply(null, sizes), 1e-6), Math.max.apply(null, sizes));
      lineChart(core, sizeSvg, {
        w: 460, h: 200, left: 48, right: 12, top: 20, bottom: 30, x0: 0, x1: 12, log: true, y0: lt.lo, y1: lt.hi, yTicks: lt.ticks, xTicks: xTicks,
        xLabel: 'after block', yLabel: 'mean token size', legend: sizeKey,
        series: [
          { points: fwOn.sizes.map(function (v, k) { return [k, v]; }), label: 'with LayerNorm', dots: true },
          { points: fwOff.sizes.map(function (v, k) { return [k, v]; }), label: 'without', muted: true, dash: true, dots: true }
        ]
      });
      sizeText.textContent = 'Token size in: ' + core.fmt(fwOn.sizes[0], 2) + '. After 12 blocks: ' + core.fmt(fwOn.sizes[12], 2) + ' with LayerNorm, ' +
        core.fmt(fwOff.sizes[12], 2) + ' without. Raise the spread of the weights to see which stack stays in range.';
      // 2. the gradient reaching each block with and without skips (LayerNorm on)
      var gOn = P2.stackBackward(fwOn, blocks, T, opts(true, true), false).sizes;
      var fwNoRes = P2.stackForward(Z, blocks, opts(false, true));
      var gOff = P2.stackBackward(fwNoRes, blocks, T, opts(false, true), false).sizes;
      var gs = gOn.concat(gOff).filter(function (v) { return isFinite(v) && v > 0; });
      var gt = logTicks(core, Math.max(Math.min.apply(null, gs), 1e-30), Math.max.apply(null, gs));
      lineChart(core, gradSvg, {
        w: 460, h: 200, left: 48, right: 12, top: 20, bottom: 30, x0: 0, x1: 12, log: true, y0: gt.lo, y1: gt.hi, yTicks: gt.ticks, xTicks: xTicks,
        xLabel: 'entering block (12: the output)', yLabel: 'gradient size', legend: gradKey,
        series: [
          { points: gOn.map(function (v, k) { return [k, v]; }), label: 'with skips', dots: true },
          { points: gOff.map(function (v, k) { return [k, v]; }), label: 'without', muted: true, dash: true, dots: true }
        ]
      });
      gradText.textContent = 'At the output the gradient has size ' + core.fmt(gOn[12], 3) + ' (with skips) and ' + core.fmt(gOff[12], 3) + ' (without). At the input of block 1 it is ' +
        twoFigures(core, gOn[0]) + ' with the skip connections and ' + twoFigures(core, gOff[0]) + ' without them.';
      scheduleTraining();
    }

    // trainingKey(Z): what the training curves depend on: the seed, the spread and the tokens.
    function trainingKey(Z) {
      return st.seed + '|' + st.spread + '|' + Z.map(function (row) { return Array.from(row).join(','); }).join(';');
    }

    // scheduleTraining(): keep the runs that belong to the current seed, spread and tokens, or start three new ones
    // (with and without the skip connections, LayerNorm on; with the skips, LayerNorm off) that take D.steps_per_frame
    // steps on every frame, so that the loss curves grow while the stack trains; newer runs stop the older ones.
    function scheduleTraining() {
      var Z = zT.read(), key = trainingKey(Z);
      if (st.training && st.training.key === key) {
        drawTraining();
        return;
      }
      var blocks = ensureBlocks(), T = P2.rotateTargets(Z);
      var job = {
        key: key,
        on: P2.trainer(Z, blocks, T, opts(true, true), D.learning_rate, D.steps, D.diverged_above),
        off: P2.trainer(Z, blocks, T, opts(false, true), D.learning_rate, D.steps, D.diverged_above),
        noLn: P2.trainer(Z, blocks, T, opts(true, false), D.learning_rate, D.steps, D.diverged_above)
      };
      st.training = job;
      advance(job);
    }

    // advance(job): D.steps_per_frame more steps of the three runs, the chart redrawn, the next frame booked until all end.
    function advance(job) {
      if (st.training !== job) return;
      var doneOn = job.on.run(D.steps_per_frame);
      var doneOff = job.off.run(D.steps_per_frame);
      var doneNoLn = job.noLn.run(D.steps_per_frame);
      drawTraining();
      if (!doneOn || !doneOff || !doneNoLn) tick(core.guard(body, function () { advance(job); }));
    }

    // drawTraining(): the loss curves of the current three runs, as far as they have got.
    function drawTraining() {
      var tOn = st.training.on, tOff = st.training.off, tNoLn = st.training.noLn;
      var ls = tOn.curve.concat(tOff.curve, tNoLn.curve).filter(function (v) { return isFinite(v) && v > 0; });
      if (!ls.length) ls = [0.1, 1];
      var ltk = logTicks(core, Math.max(Math.min.apply(null, ls), 1e-12), Math.max.apply(null, ls));
      lineChart(core, lossSvg, {
        w: 460, h: 200, left: 48, right: 12, top: 20, bottom: 30, x0: 0, x1: D.steps, log: true, y0: ltk.lo, y1: ltk.hi, yTicks: ltk.ticks,
        xTicks: [0, 25, 50, 75, 100].map(function (v) { return { v: v, text: String(v) }; }), xLabel: 'step', yLabel: 'loss', legend: lossKey,
        series: [
          { points: tOn.curve.map(function (v, k) { return [k, v]; }), label: 'with skips' },
          { points: tOff.curve.map(function (v, k) { return [k, v]; }), label: 'without skips', muted: true, dash: true },
          { points: tNoLn.curve.map(function (v, k) { return [k, v]; }), label: 'with skips, no LayerNorm', dash: true }
        ]
      });
      // ends(t): the first and last loss of a run, or where it stopped.
      var ends = function (t) {
        if (!t.curve.length) return 'the numbers overflowed at once';
        return core.fmt(t.curve[0], 3) + ' ' + CH.arrow + ' ' + core.fmt(t.curve[t.curve.length - 1], 3) + (t.diverged ? ' (the numbers overflowed after step ' + (t.curve.length - 1) + ')' : '');
      };
      var running = !(tOn.done && tOff.done && tNoLn.done);
      var taken = Math.min(D.steps, Math.max(tOn.curve.length, tOff.curve.length, tNoLn.curve.length));
      lossText.textContent = (running ? 'Training: ' + taken + ' of ' + D.steps + ' steps taken. ' : '') +
        'Loss with the skip connections: ' + ends(tOn) + '; without them: ' + ends(tOff) + '; with them and without LayerNorm: ' + ends(tNoLn) + '. Plain gradient descent with a step of ' +
        trimNum(core, D.learning_rate, 2) + ' on every weight; the real runs use AdamW (Part 5).';
    }

    var redrawBlock = later(body, core, drawBlock);
    var redrawStack = later(body, core, drawStack);

    // redrawAll(): both panels.
    function redrawAll() {
      redrawBlock();
      redrawStack();
    }

    follow.onChange(core.guard(body, function () { st.follow = TOK.indexOf(follow.value()); redrawBlock(); }));
    resT.input.addEventListener('change', core.guard(body, function () { st.residual = resT.input.checked; redrawBlock(); }));
    lnT.input.addEventListener('change', core.guard(body, function () { st.norm = lnT.input.checked; redrawBlock(); }));
    spread.input.addEventListener('input', core.guard(body, function () { spread.show(); st.spread = spread.value(); redrawAll(); }));
    newW.addEventListener('click', core.guard(body, function () { st.seed += 1; redrawAll(); }));
    resetBtn.addEventListener('click', core.guard(body, function () {
      st.seed = D.seed;
      st.spread = D.spread.default;
      spread.set(D.spread.default);
      st.residual = D.residual; resT.input.checked = D.residual;
      st.norm = D.layer_norm; lnT.input.checked = D.layer_norm;
      st.follow = TOK.indexOf(D.follow); follow.set(D.follow);
      zT.reset();
      redrawAll();
    }));
    zT.inputs.forEach(function (inp) {
      inp.addEventListener('input', redrawAll);
    });
    core.on('theme-changed', redrawAll);

    drawBlock();
    drawStack();
  });

  // ------------------------------------------------------------------ Lab 2D: the real attention of the last block

  Labs.register('lab-2d-real-attention', function mount(body, core, bundles) {
    bundles = bundles || core.bundles || {};
    var ID = 'lab-2d-real-attention';
    var D = DEFAULTS.d;
    var F = bundles.followed || bundles['followed.json'];
    var IM = bundles.images || bundles['images.json'];
    if (!F || !F.attention_last || !F.attention_last.array) throw new Error('followed.json did not arrive with its attention arrays');
    var G = D.grid;
    var NAMES = {
      original_dino: 'DINO as released, with its class token',
      dino: 'DINO converted (run 2\'s start)',
      selfpatch: 'SelfPatch as released (the start of runs 1 and 3)',
      con2: 'Run 2 after its 20 epochs (its teacher)'
    };
    var SHORT = { original_dino: 'DINO with [CLS]', dino: 'DINO converted', selfpatch: 'SelfPatch', con2: 'Run 2' };
    var st = { model: D.model, row: D.row, head: D.head, query: D.query, block: D.class_block, depth: D.block, pic: null, picNote: '' };

    var controls = core.el('div', { class: 'lab-controls' });
    var stage = core.el('div', { class: 'lab-stage' });
    var model = segmented(core, {
      id: ID + '-network', label: 'Network',
      options: D.models.map(function (m) { return { value: m, text: SHORT[m] }; }), value: st.model
    });
    controls.appendChild(model.root);
    var rowKind = segmented(core, {
      id: ID + '-row', label: 'Whose row', options: [{ value: 'patch', text: 'a patch (click one)' }, { value: 'cls', text: 'the class token' }], value: st.row
    });
    controls.appendChild(rowKind.root);
    var clsBlock = segmented(core, {
      id: ID + '-class-block', label: 'Aggregation head block', options: [{ value: '1', text: '1' }, { value: '2', text: '2' }], value: String(st.block)
    });
    // a plain wrapper: the hidden attribute cannot hide an element whose class sets its display
    var clsBlockBox = core.el('div', null, clsBlock.root);
    controls.appendChild(clsBlockBox);
    var headSel = segmented(core, {
      id: ID + '-head', label: 'Head in the large map',
      options: [1, 2, 3, 4, 5, 6].map(function (h) { return { value: String(h), text: String(h) }; }).concat([{ value: 'mean', text: 'all six' }]),
      value: String(st.head)
    });
    controls.appendChild(headSel.root);
    var jumpRow = core.el('div', { class: 'button-row' });
    var jumps = [
      { q: D.shortcuts[0], text: 'Dog\'s nose (34)' },
      { q: D.shortcuts[1], text: 'Cat\'s eye (136)' },
      { q: D.shortcuts[2], text: 'Corner (0)' }
    ].map(function (j, i) {
      var b = button(core, ID + '-jump-' + (i + 1), j.text);
      jumpRow.appendChild(b);
      return { el: b, q: j.q };
    });
    controls.appendChild(core.el('div', { class: 'control' }, [core.el('span', { class: 'control-label', text: 'Go to a patch' }), jumpRow]));
    var clsNote = hint(core, '');
    controls.appendChild(clsNote);
    controls.appendChild(hint(core, 'Click or tap a patch of the large map to read its row; after a click, the arrow keys move it. Click a small map to show its head large. ' +
      'The brighter a patch, the more weight it gets; the five largest are outlined. ' + mark('real', 'followed.json#attention_last')));

    var big = canvasBox(core, { id: ID + '-large', focusable: true, label: 'The chosen head\'s attention over the photograph. Click a patch, or use the arrow keys, to choose whose row it is.' });
    var bigLabel = core.el('span', { class: 'stage-label' });
    var facts = readoutList(core, [['whose', 'Row of'], ['net', 'Network'], ['head', 'Head'], ['top', 'Largest weights'], ['self', 'On itself'], ['cls', 'On the class token'], ['spread', 'Spread']]);
    var smallRow = core.el('div', { class: 'stage-row', style: 'max-width: ' + (3 * D.small + 36) + 'px' });
    var smalls = [0, 1, 2, 3, 4, 5].map(function (h) {
      var box = canvasBox(core, { id: ID + '-head-' + (h + 1), label: 'Head ' + (h + 1) + ' of the chosen row over the photograph. Click to show it in the large map.' });
      var label = core.el('span', { class: 'stage-label' });
      var cell = core.el('div', { class: 'stage-cell', style: 'width: ' + D.small + 'px; max-width: 100%' }, [box.canvas, label]);
      smallRow.appendChild(cell);
      return { box: box, label: label };
    });
    var photoNote = core.el('p', { class: 'stage-label' });
    stage.appendChild(core.el('div', { class: 'stage-row' }, [
      core.el('div', { class: 'stage-cell' }, [big.canvas, bigLabel]),
      core.el('div', { class: 'stage-cell' }, [facts.root])
    ]));
    stage.appendChild(core.el('p', { class: 'stage-label', text: 'The six heads of the same row' }));
    stage.appendChild(smallRow);
    stage.appendChild(photoNote);

    // the second panel: run 2, patch 34, every block
    var controls2 = core.el('div', { class: 'lab-controls', style: 'border-top: 1px solid var(--line)' });
    var stage2 = core.el('div', { class: 'lab-stage', style: 'border-top: 1px solid var(--line)' });
    controls2.appendChild(core.el('p', { class: 'control-group-title', text: 'Run 2, patch 34, every block' }));
    var depth = slider(core, { id: ID + '-block', label: 'Block', min: 1, max: 12, step: 1, value: st.depth, digits: 0 });
    controls2.appendChild(depth.root);
    controls2.appendChild(hint(core, 'The bundle keeps the dog\'s nose\'s row in all twelve blocks for run 2 only: move the slider to watch the same patch look at the picture block after block. ' +
      mark('real', 'followed.json#attention_rows_con2')));
    var deepRow = core.el('div', { class: 'stage-row', style: 'max-width: ' + (3 * D.small + 36) + 'px' });
    var deeps = [0, 1, 2, 3, 4, 5].map(function (h) {
      var box = canvasBox(core, { id: ID + '-block-head-' + (h + 1), label: 'Run 2, patch 34, head ' + (h + 1) + ' in the chosen block' });
      var label = core.el('span', { class: 'stage-label' });
      deepRow.appendChild(core.el('div', { class: 'stage-cell', style: 'width: ' + D.small + 'px; max-width: 100%' }, [box.canvas, label]));
      return { box: box, label: label };
    });
    var spreadTable = numTable(core, 'Spread of each row, in patches\' worth (exp of its entropy; an even row has 196): blocks down, heads across', ['1', '2', '3', '4', '5', '6'],
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(function (b) { return 'block ' + b; }));
    stage2.appendChild(deepRow);
    stage2.appendChild(core.el('div', { class: 'scroll-x' }, spreadTable.root));
    body.appendChild(controls);
    body.appendChild(stage);
    body.appendChild(controls2);
    body.appendChild(stage2);

    // currentRows(): the six rows of the chosen network and row kind (null when the bundle holds none).
    function currentRows() {
      var rows = [];
      for (var h = 0; h < 6; h++) {
        var r = P2.realRow(F, st.model, h, st.query, st.row, st.block);
        if (!r) return null;
        rows.push(r);
      }
      return rows;
    }

    // drawMap(box, size, row, showQuery, topN): the photograph (or a plain ground) with every patch faded by how little
    // weight the row gives it, the `topN` largest outlined and the asking patch marked.
    function drawMap(box, size, row, showQuery, topN) {
      var th = core.theme();
      var cell = size / G;
      var ctx = box.begin(size, size);
      if (st.pic) {
        ctx.imageSmoothingEnabled = true;
        try { ctx.imageSmoothingQuality = 'high'; } catch (e) { /* older browsers */ }
        ctx.drawImage(st.pic, 0, 0, size, size);
      } else {
        ctx.fillStyle = core.mix(th.paper, th.ink, 0.3);
        ctx.fillRect(0, 0, size, size);
      }
      var w = row.weights, wmax = 0, j;
      for (j = 0; j < 196; j++) wmax = Math.max(wmax, w[j]);
      for (j = 0; j < 196; j++) {
        var fade = 0.88 * (1 - Math.sqrt(wmax > 0 ? w[j] / wmax : 0));
        if (fade > 0.01) {
          ctx.fillStyle = core.rgba(th.paper, fade);
          ctx.fillRect((j % G) * cell, Math.floor(j / G) * cell, cell, cell);
        }
      }
      if (topN) {
        var stats = P2.rowStats(row, topN);
        ctx.strokeStyle = th.ink;
        ctx.lineWidth = 1;
        stats.top.forEach(function (t) {
          if (showQuery && t[0] === st.query) return;
          ctx.strokeRect((t[0] % G) * cell + 1.5, Math.floor(t[0] / G) * cell + 1.5, cell - 3, cell - 3);
        });
      }
      if (showQuery) {
        var qx = (st.query % G) * cell, qy = Math.floor(st.query / G) * cell;
        ctx.lineWidth = 4; ctx.strokeStyle = th.paper; ctx.strokeRect(qx, qy, cell, cell);
        ctx.lineWidth = 2; ctx.strokeStyle = th.ink; ctx.strokeRect(qx, qy, cell, cell);
      }
    }

    // where(i): "patch i (row r, column c)".
    function where(i) {
      return 'patch ' + i + ' (row ' + Math.floor(i / G) + ', column ' + (i % G) + ')';
    }

    // drawMain(): the large map, the readouts and the six small maps.
    function drawMain() {
      var hasCls = st.model !== 'dino';
      rowKind.enable('cls', hasCls);
      if (!hasCls && st.row === 'cls') { st.row = 'patch'; rowKind.set('patch'); }
      var clsFromHead = st.row === 'cls' && st.model !== 'original_dino';
      clsBlockBox.hidden = !clsFromHead;
      clsNote.textContent = st.model === 'dino'
        ? 'The converted DINO network has no class token: the conversion removed it, and its aggregation head is untrained, so the bundle keeps no class-token row for it.'
        : (st.model === 'original_dino'
          ? 'Only the released DINO network has a class token inside its backbone, at position 0: its last block holds 197 rows of 197 weights.'
          : 'SelfPatch\'s backbone has no class token; its class token lives in the aggregation head, which reads the 196 final tokens in two blocks of class attention.');
      var rows = currentRows();
      if (!rows) return;
      var shown = st.head === 'mean' ? P2.meanRow(rows) : rows[Number(st.head) - 1];
      drawMap(big, D.big, shown, st.row === 'patch', D.top_listed);
      var stats = P2.rowStats(shown, D.top_listed);
      bigLabel.textContent = NAMES[st.model] + ', ' + (st.head === 'mean' ? 'the six heads averaged' : 'head ' + st.head);
      facts.set('whose', st.row === 'patch' ? where(st.query) : (st.model === 'original_dino' ? 'the class token [CLS] of the backbone' : 'the aggregation head\'s class token, block ' + st.block));
      facts.set('net', NAMES[st.model]);
      facts.set('head', st.head === 'mean' ? 'the mean of the six heads' : String(st.head) + ' of 6');
      facts.set('top', stats.top.map(function (t) { return t[0] + ': ' + core.fmt(t[1], 3); }).join(', '));
      facts.set('self', st.row === 'patch' ? core.fmt(shown.self, 3) : (shown.cls !== null ? core.fmt(shown.cls, 3) + ' (the class token on itself)' : 'n/a'));
      facts.set('cls', st.row === 'patch' ? (shown.cls !== null ? core.fmt(shown.cls, 3) : 'none: this backbone has no class token') : 'it is the class token');
      facts.set('spread', core.fmt(stats.entropy, 2) + ' nats (an even row: ' + core.fmt(Math.log(shown.length), 2) + '), about ' + core.fmt(stats.effective, 0) + ' patches\' worth of weight');
      rows.forEach(function (r, h) {
        drawMap(smalls[h].box, D.small, r, st.row === 'patch', 0);
        var s = P2.rowStats(r, 1);
        smalls[h].label.textContent = 'head ' + (h + 1) + ': about ' + core.fmt(s.effective, 0) + ' patches\' worth';
      });
      photoNote.textContent = st.pic ? 'The photograph under the maps is the followed image\'s 224-pixel view as your browser draws it.' :
        (st.picNote || 'Loading the photograph' + CH.ellipsis);
    }

    // drawDeep(): run 2's row of patch 34 in the chosen block, six heads, and the table of spreads.
    function drawDeep() {
      var saved = st.query;
      st.query = F.anchor;
      for (var h = 0; h < 6; h++) {
        var r = P2.blockRow(F, st.depth, h);
        drawMap(deeps[h].box, D.small, r, true, 0);
        deeps[h].label.textContent = 'head ' + (h + 1) + ': about ' + core.fmt(P2.rowStats(r, 1).effective, 0) + ' patches\' worth';
      }
      st.query = saved;
      for (var b = 1; b <= 12; b++) {
        for (var hh = 0; hh < 6; hh++) {
          var eff = P2.rowStats(P2.blockRow(F, b, hh), 1).effective;
          var cell = spreadTable.cells[b - 1][hh];
          cell.textContent = core.fmt(eff, 0);
          cell.style.backgroundColor = 'color-mix(in srgb, var(--ink) ' + Math.round(clamp(1 - eff / 196, 0, 1) * 35) + '%, transparent)';
        }
        var tr = spreadTable.rows[b - 1];
        if (b === st.depth) { tr.setAttribute('aria-current', 'true'); tr.style.fontWeight = '700'; }
        else { tr.removeAttribute('aria-current'); tr.style.fontWeight = ''; }
      }
    }

    var redraw = later(body, core, function () { drawMain(); drawDeep(); });

    // choose(q): make patch q the asking one.
    function choose(q) {
      var c = clamp(q, 0, 195);
      if (c === st.query && st.row === 'patch') return;
      st.query = c;
      if (st.row !== 'patch') { st.row = 'patch'; rowKind.set('patch'); }
      redraw();
    }

    model.onChange(core.guard(body, function () { st.model = model.value(); redraw(); }));
    rowKind.onChange(core.guard(body, function () { st.row = rowKind.value(); redraw(); }));
    clsBlock.onChange(core.guard(body, function () { st.block = Number(clsBlock.value()); redraw(); }));
    headSel.onChange(core.guard(body, function () { st.head = headSel.value() === 'mean' ? 'mean' : Number(headSel.value()); redraw(); }));
    jumps.forEach(function (j) { j.el.addEventListener('click', core.guard(body, function () { choose(j.q); })); });
    big.canvas.addEventListener('click', core.guard(body, function (ev) {
      var p = big.point(ev), cell = D.big / G;
      choose(clamp(Math.floor(p.y / cell), 0, G - 1) * G + clamp(Math.floor(p.x / cell), 0, G - 1));
    }));
    big.canvas.addEventListener('keydown', core.guard(body, function (ev) {
      var dlt = arrowDelta(ev, D.arrow_steps);
      if (!dlt) return;
      ev.preventDefault();
      var r = clamp(Math.floor(st.query / G) + dlt[1], 0, G - 1), c = clamp((st.query % G) + dlt[0], 0, G - 1);
      choose(r * G + c);
    }));
    smalls.forEach(function (s, h) {
      s.box.canvas.addEventListener('click', core.guard(body, function () {
        st.head = h + 1;
        headSel.set(String(h + 1));
        redraw();
      }));
    });
    depth.input.addEventListener('input', core.guard(body, function () { depth.show(); st.depth = depth.value(); redraw(); }));
    core.on('theme-changed', redraw);

    // the photograph: the followed image's 224-pixel view, as images.json records it
    var info = null;
    if (IM && IM.images) IM.images.forEach(function (im) { if (im.id === F.image) info = im; });
    if (info && info.views && info.views['224'] && core.image && typeof core.image.load === 'function') {
      try {
        core.image.load(core.image.url(info.id), { side: 224, box: info.views['224'].box_native }).then(function (data) {
          st.pic = core.toCanvas(data);
          redraw();
        }, function (err) {
          st.picNote = 'The photograph did not load (' + (err && err.message ? err.message : 'no reason given') + '); the weights are drawn on a plain ground.';
          redraw();
        });
      } catch (err) {
        st.picNote = 'The photograph could not be drawn here; the weights are drawn on a plain ground.';
      }
    } else {
      st.picNote = 'images.json did not describe the photograph; the weights are drawn on a plain ground.';
    }

    drawMain();
    drawDeep();
  });
})(typeof window !== 'undefined' ? window : this);
