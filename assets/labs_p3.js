/*
 * labs_p3.js: the labs of Part 3 (DINO) of the course "Pixels to Islands" (docs/research/explainer_v2_2026-10-13/).
 *   lab-3a-crops            ported from the first explainer's Lab D: ten views of one picture, and which network
 *                           sees which view
 *   lab-3b-prototypes       ported from Lab E and deepened: the two temperatures, centring, the two forms of collapse,
 *                           the cross-entropy and its gradient on the student's scores
 *   lab-3c-ema              ported from Lab F: the teacher as a moving average of the student
 *   lab-3d-loss-pairs       new: the 18 crop pairs of DINO's loss as a grid; a click on a pair works its
 *                           cross-entropy out over five prototypes
 *   lab-3e-collapse         new: two toy networks on four pictures with three prototypes; switch centring or
 *                           sharpening off and watch the answers collapse (a film on the scenes engine)
 *   lab-3f-real-similarity  new, real numbers: click a patch of a real photograph and see its cosine map under DINO,
 *                           the released SelfPatch checkpoint and run 2, on one colour scale, the top 8 marked
 * window.LabP3 holds the pure functions of these labs and the numbers that the worked examples of
 * src/sections_p3.html quote (tests/smoke_p3.js checks them against src/labs_defaults.json and the copy).
 * Contract: the course's README sections 4 and 5 and plan decisions 2 and 5; the first explainer's src/README.md
 * sections 3 and 4 for the control, stage, readout and chart classes. Vanilla ES2019, no library. Nothing is fetched
 * except through Core.bundle.load and Core.image.load (the real-data bundle), nothing is stored or sent.
 */
(function (root) {
  'use strict';

  var Labs = root.Labs;
  if (!Labs || typeof Labs.register !== 'function') {
    if (root.console && typeof root.console.error === 'function') {
      root.console.error('[labs_p3] window.Labs is missing: load core.js before labs_p3.js');
    }
    return;
  }

  // ------------------------------------------------------------------ toy defaults

  // DEFAULTS: the toy numbers the labs start from; src/labs_defaults.json repeats them under the keys of this part's
  // labs (ids 3a. to 3f.), and the ported ones keep the first explainer's values (its entries d., e. and f.).
  var DEFAULTS = {
    a: {
      seed: 1,
      source_side: 480,
      global_count: 2,
      global_side: 224,
      global_scale: [0.25, 1],
      local_count: 8,
      local_side: 96,
      local_scale: [0.05, 0.25],
      toggles: { flip: false, jitter: false, grey: false, blur: false, solarise: false },
      recipe: false,
      method: 'dino',
      view: 'teacher',
      patch_grid: false,
      thumbnail_scale: 0.5,
      crop_seed_step: 1000
    },
    b: {
      prototypes: 12,
      teacher_temperature: { min: 0.02, max: 0.2, default: 0.04, step: 0.01 },
      student_temperature: { min: 0.05, max: 0.5, default: 0.1, step: 0.01 },
      centring: true,
      scenario: 'usual',
      teacher_logits: [0.62, 0.55, 0.3, 0.18, 0.1, 0.05, 0, -0.08, -0.15, -0.25, -0.4, -0.55],
      student_logits: [0.5, 0.58, 0.25, 0.2, 0.12, 0.02, -0.05, -0.1, -0.12, -0.3, -0.35, -0.5],
      centre: [0.1, 0.04, 0.02, 0.01, 0, 0, 0, -0.01, -0.02, -0.03, -0.05, -0.06],
      collapse_logits: [0.95, 0.1, 0.08, 0.06, 0.05, 0.04, 0.03, 0.02, 0.01, 0, -0.01, -0.02],
      flat_logits: [0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2],
      centre_rate: 0.9,
      learning_rate: 0.01,
      score_range: [-1, 1],
      many_steps: 10
    },
    c: {
      momentum: { min: 0.99, max: 0.9995, default: 0.9995, step: 0.0005 },
      steps: [462, 4620, 1251],
      steps_default: 462,
      dino_preset: { momentum: 0.996, steps: 1251 },
      ours_preset: { momentum: 0.9995, steps: 462 },
      cosine: false,
      cosine_total_steps: 9240,
      samples: 240,
      weight_seed: 11,
      weight_rate: 3,
      weight_noise: 0.06,
      weight_memory: 0.97
    },
    d: {
      prototypes: 5,
      teacher: {
        G1: [0.2, 0.15, 0.1, 0.05, 0],
        G2: [0.18, 0.17, 0.08, 0.04, 0.02]
      },
      student: {
        G1: [0.18, 0.16, 0.07, 0.02, -0.03],
        G2: [0.15, 0.2, 0.05, 0, -0.05],
        L1: [0.1, 0.22, 0.12, 0.02, -0.06],
        L2: [0.16, 0.08, 0.18, 0.04, -0.02],
        L3: [0.05, 0.12, 0.2, 0.1, 0.03],
        L4: [0.19, 0.17, 0.02, 0.06, -0.04],
        L5: [0.08, 0.06, 0.04, 0.22, 0.1],
        L6: [0.14, 0.18, 0.09, -0.02, 0.01],
        L7: [0.02, 0.15, 0.06, 0.12, 0.18],
        L8: [0.12, 0.1, 0.15, 0.08, 0.05],
        L9: [0.17, 0.05, 0.1, 0.12, 0],
        L10: [0.06, 0.2, 0.16, 0, 0.08]
      },
      teacher_temperature: { min: 0.02, max: 0.2, default: 0.04, step: 0.01 },
      student_temperature: { min: 0.05, max: 0.5, default: 0.1, step: 0.01 },
      locals: { min: 0, max: 10, default: 8, step: 1 },
      spread: { min: 0, max: 2, default: 1, step: 0.25 },
      learning_rate: 0.01,
      selected: ['G1', 'G2']
    },
    e: {
      prototypes: 3,
      images: [[1, 0], [0, 1], [-1, 0], [0, -1]],
      names: ['A', 'B', 'C', 'D'],
      seed: 2,
      bias: [0.3, 0, 0],
      weight_scale: 0.15,
      view_noise: 0.3,
      teacher_temperature: 0.04,
      teacher_temperature_off: 0.1,
      student_temperature: 0.1,
      centre_rate: 0.9,
      momentum: 0.98,
      learning_rate: 0.05,
      weight_decay: 0.5,
      steps: 300,
      stops: [0, 20, 60, 150, 300],
      trail_every: 2
    },
    f: {
      anchor: 34,
      top: 8,
      grid: 14,
      cell: 16,
      strength: { min: 0.3, max: 1, default: 0.85, step: 0.05 },
      models: ['dino', 'selfpatch', 'con2'],
      names: { dino: 'DINO', selfpatch: 'SelfPatch (released)', con2: 'Run 2 (end of training)' }
    }
  };

  // FACTS: the fact-sheet entries that the labs quote, as id: [cite, value as the sheet holds it]. A lab's mark
  // carries the cites of the facts it states (facts/course_facts.json; tests/smoke_p3.js compares every row).
  var FACTS = {
    aug_flip_p: ['[official code: main_selfpatch.py]', 0.5],
    aug_colour_jitter: ['[official code: main_selfpatch.py]', 'probability 0.8; brightness 0.4, contrast 0.4, saturation 0.2, hue 0.1'],
    aug_greyscale_p: ['[official code: main_selfpatch.py]', 0.2],
    aug_blur_p: ['[official code: main_selfpatch.py]', '1.0 / 0.1 / 0.5'],
    aug_solarise_p: ['[official code: main_selfpatch.py; Pillow docs]', 0.2],
    dino_teacher_crops: ['[DINO \u00A73.1]', '2 global crops'],
    sp_teacher_crops: ['[our architecture doc \u00A73.9]', 'all 10 crops'],
    crop_global_count: ['[DINO \u00A73.1]', 2],
    crop_local_count: ['[official code: main_selfpatch.py; SelfPatch supp. App. A]', 8],
    crop_global_side: ['[our architecture doc \u00A73.1; DINO \u00A73.1]', 224],
    crop_local_side: ['[our architecture doc \u00A73.1; DINO \u00A73.1]', 96],
    crops_recipe: ['[our architecture doc \u00A72.5]', '2 \u00D7 224 (0.25 to 1.0) + 8 \u00D7 96 (0.05 to 0.25)'],
    crop_resampling: ['[official code: main_selfpatch.py]', 'bicubic'],
    dino_release_local_crops: ['[DINO release args]', 10],
    crop_total: ['[our architecture doc \u00A73.1]', 10],
    temp_teacher: ['[official code: main_selfpatch.py; our code: cluster/train.py]', 0.04],
    temp_student: ['[DINO \u00A73.2]', 0.1],
    centre_rule: ['[DINO \u00A73.1]', 'c \u2190 m \u00B7 c + (1 \u2212 m) \u00B7 (batch mean of teacher outputs)'],
    centre_momentum: ['[DINO code; official code: main_selfpatch.py]', 0.9],
    loss_stop_gradient: ['[DINO Alg. 1]', 'stop-gradient'],
    head_prototypes_global: ['[DINO supp. App. C; DINO release args]', 65536],
    sp_patch_prototypes: ['[SelfPatch supp. App. A]', 4096],
    head_score_cosine: ['[our architecture doc \u00A73.8]', '\u22121 to 1'],
    head_norm_last_layer: ['[official code: main_selfpatch.py; DINO release args]', 'fixed in SelfPatch\'s code; learned in the DINO release'],
    loss_cross_entropy: ['[DINO \u00A73.1]', 'H(teacher, student) = \u2212\u03A3 teacher \u00D7 log(student)'],
    ema_ours_schedule: ['[our code: cluster/train.py]', '0.9995 \u2192 1'],
    ema_dino_schedule: ['[DINO \u00A73.1]', '0.996 \u2192 1'],
    ema_rule: ['[DINO \u00A73.1]', 'teacher \u2190 m \u00D7 teacher + (1 \u2212 m) \u00D7 student'],
    ours_steps_per_epoch: ['[our architecture doc \u00A72.5]', 462],
    ours_global_batch: ['[our code: cluster/train.py]', 256],
    ours_warmup_steps: ['[our architecture doc \u00A74.2]', 4620],
    imagenet_steps_per_epoch: ['[arithmetic]', 1251],
    dino_release_batch: ['[DINO release args; DINO \u00A73.2]', 1024],
    ours_epochs_pilot: ['[our code: cluster/train.py]', 20],
    ours_steps_20ep: ['[our spec \u00A79]', 9240],
    ema_keep_20ep_after_1: ['[our report \u00A72.4]', 0.794],
    ema_keep_20ep_after_5: ['[our report \u00A72.4]', 0.334],
    ema_keep_20ep_after_10: ['[our report \u00A72.4]', 0.151],
    ema_keep_20ep_after_20: ['[our report \u00A72.4]', 0.099],
    loss_global_pairs: ['[our architecture doc \u00A73.9]', 18],
    loss_global_pairs_dino_release: ['[arithmetic]', 22],
    why_dino_eq3: ['[DINO \u00A73.1, Eq. 3]', 'each global view x seen by the teacher against every view x\u2032 \u2260 x seen by the student'],
    why_dino_local_to_global: ['[DINO \u00A73.1]', 'only the global views pass through the teacher'],
    why_dino_collapse_forms: ['[DINO supp. App. D]', 'an output uniform along all dimensions, or dominated by one'],
    why_dino_collapse_entropy: ['[DINO supp. Fig. 3]', 'entropy \u2192 0 without centring, \u2192 \u2212log(1/K) without sharpening; KL \u2192 0 either way']
  };

  // REAL: the bundle facts the real-data lab quotes, as id: [bundle file#member, value] (facts/bundle_facts.json).
  var REAL = {
    real_anchor_index: ['followed.json#anchor', 34],
    real_quant_tokens_error_max: ['bundle_manifest.json#quantisation', 0.00621]
  };

  // CH: the few non-ASCII characters the widgets write as text (this file stays ASCII).
  var CH = {
    times: '\u00D7', arrow: '\u2192', minus: '\u2212', middot: '\u00B7', larr: '\u2190', tau: '\u03C4',
    ellipsis: '\u2026', le: '\u2264', ge: '\u2265', approx: '\u2248', sub_s: '\u209B', sub_t: '\u209C',
    nnbsp: '\u202F', lambda: '\u03BB', ne: '\u2260'
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

  // term(key, shown): the HTML of a glossary term; `shown` (trusted HTML) defaults to the key itself.
  function term(key, shown) {
    return '<dfn data-term="' + escapeHtml(key) + '">' + (shown === undefined ? escapeHtml(key) : shown) + '</dfn>';
  }

  // markHtml(kind, source): the HTML of one mark (plan decision 2): kind fact or reading with a data-source, real with
  // a data-bundle (file.json#member), toy with nothing.
  function markHtml(kind, source) {
    var words = { fact: 'Fact', real: 'Real', toy: 'Toy', reading: 'Reading' };
    var attr = '';
    if (kind === 'real') attr = ' data-bundle="' + escapeHtml(source) + '"';
    else if (source) attr = ' data-source="' + escapeHtml(source) + '"';
    return ' <span class="mark mark-' + kind + '"' + attr + '>' + words[kind] + '</span>';
  }

  // factMark(ids): a Fact mark whose source lists the cites of the facts ids (each cite once).
  function factMark(ids) {
    var cites = [];
    ids.forEach(function (id) {
      var f = FACTS[id];
      if (!f) throw new Error('labs_p3: the fact "' + id + '" is not in the FACTS table');
      if (cites.indexOf(f[0]) < 0) cites.push(f[0]);
    });
    return markHtml('fact', cites.join('; '));
  }

  // realMark(id): a Real mark for the bundle fact id.
  function realMark(id) {
    var f = REAL[id];
    if (!f) throw new Error('labs_p3: the real fact "' + id + '" is not in the REAL table');
    return markHtml('real', f[0]);
  }

  // toyMark(): the Toy mark.
  function toyMark() {
    return markHtml('toy');
  }

  // refreshMarks(): ask boot.js to wire the glossary terms and marks a lab wrote after it mounted.
  function refreshMarks() {
    try {
      if (root.Boot && typeof root.Boot.refreshTerms === 'function') root.Boot.refreshTerms();
    } catch (e) {
      if (root.console && typeof root.console.error === 'function') root.console.error('[labs_p3] wiring marks', e);
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

  // chain(body, core): a runner that calls the functions of a list one per frame, guarded; a newer run cancels an older one.
  function chain(body, core) {
    var generation = 0;
    return function run(list) {
      var mine = ++generation;
      var i = 0;
      // next(): run the next function of this list, then queue the one after it.
      var next = core.guard(body, function () {
        if (mine !== generation || i >= list.length) return;
        var fn = list[i];
        i += 1;
        fn();
        if (i < list.length) tick(next);
      });
      tick(next);
    };
  }

  // trimNum(core, x, digits): x with at most `digits` decimals (default 3), trailing zeros removed, true minus sign.
  function trimNum(core, x, digits) {
    var s = core.fmt(x, digits === undefined ? 3 : digits);
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s;
  }

  // fixed(x, digits): x with exactly `digits` decimals and a true minus sign (no thousands separator); the form the
  // worked examples of the copy print.
  function fixed(x, digits) {
    var s = Math.abs(x).toFixed(digits);
    var zero = /^[0.]*$/.test(s);
    return (x < 0 && !zero ? CH.minus : '') + s;
  }

  // entropyOf(p): -sum p ln p in nats (zero entries add nothing).
  function entropyOf(p) {
    var s = 0;
    for (var i = 0; i < p.length; i++) if (p[i] > 0) s -= p[i] * Math.log(p[i]);
    return s;
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

  // imageChooser(core, id, label): the shared "Sample scene / Use your own image" control from boot.js, or null when it is missing.
  function imageChooser(core, id, label) {
    var make = typeof core.imageChooser === 'function' ? core.imageChooser
      : (root.Boot && typeof root.Boot.imageChooser === 'function' ? root.Boot.imageChooser : null);
    return make ? make({ id: id, label: label }) : null;
  }

  // hint(core, html): a small explanatory paragraph for the control strip.
  function hint(core, html) {
    return core.el('p', { class: 'control-hint', html: html });
  }

  // slider(core, o): a labelled range input with its live value; o = {id, label, min, max, step, value, digits, hint, role, format}.
  function slider(core, o) {
    var input = core.el('input', { type: 'range', id: o.id, min: String(o.min), max: String(o.max), step: String(o.step), value: String(o.value) });
    var out = core.el('output', { id: o.id + '-out', for: o.id });
    var kids = [core.el('label', { for: o.id, text: o.label }), out, input];
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
    var label = core.el('label', { class: ['toggle', o.role ? 'role-' + o.role : null] }, [input, ' ' + o.label]);
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
      group.appendChild(core.el('label', { for: input.id || (o.id + '-' + opt.value) }, [input, core.el('span', { text: opt.text })]));
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

  // readoutList(core, rows): a dl.readout of [key, dtHtml] rows whose values can be set; returns {root, set(key, text)}.
  function readoutList(core, rows) {
    // the label column takes at most 40 % of the width, so values never wrap one character per line on a phone
    var dl = core.el('dl', { class: 'readout', style: 'grid-template-columns: fit-content(40%) minmax(0, 1fr)' });
    var dds = {};
    rows.forEach(function (r) {
      dl.appendChild(core.el('dt', { html: r[1] }));
      dds[r[0]] = core.el('dd', { id: r[2] || null });
      dl.appendChild(dds[r[0]]);
    });
    return {
      root: dl,
      // set(key, text): write the value of row key.
      set: function (key, text) { dds[key].textContent = text; },
      // get(key): the text of row key.
      get: function (key) { return dds[key].textContent; }
    };
  }

  // svgText(core, x, y, text, attrs): an SVG text element at (x, y).
  function svgText(core, x, y, text, attrs) {
    var a = { x: String(x), y: String(y) };
    Object.keys(attrs || {}).forEach(function (k) { a[k] = attrs[k]; });
    return core.el('text', a, String(text));
  }

  // barPath(x, y, w, h, r): an SVG path of a bar from the baseline y + h up to y, its top corners rounded by r.
  function barPath(x, y, w, h, r) {
    var rr = Math.min(r, w / 2, h);
    var f = function (v) { return Math.round(v * 100) / 100; };
    return 'M' + f(x) + ',' + f(y + h) + 'V' + f(y + rr) + 'Q' + f(x) + ',' + f(y) + ' ' + f(x + rr) + ',' + f(y) +
      'H' + f(x + w - rr) + 'Q' + f(x + w) + ',' + f(y) + ' ' + f(x + w) + ',' + f(y + rr) + 'V' + f(y + h) + 'Z';
  }

  // pointsOf(xs, ys, sx, sy): the points attribute of an SVG polyline through (sx(x), sy(y)).
  function pointsOf(xs, ys, sx, sy) {
    var out = [];
    for (var i = 0; i < xs.length; i++) out.push((Math.round(sx(xs[i]) * 10) / 10) + ',' + (Math.round(sy(ys[i]) * 10) / 10));
    return out.join(' ');
  }

  // clearNode(node): remove every child of node.
  function clearNode(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  // stageWidth(core, stage, lo, hi, fallback): the stage's inner width in CSS pixels, between lo and hi, so chart text keeps its size on a phone.
  function stageWidth(stage, lo, hi, fallback) {
    var w = stage.clientWidth;
    if (!(w > 0)) return fallback;
    var pad = 40;
    try {
      var cs = root.getComputedStyle(stage);
      pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    } catch (e) { /* keep the default padding */ }
    return clamp(Math.floor(w - pad), lo, hi);
  }

  // ------------------------------------------------------------------ pure functions (window.LabP3)

  // softmaxT(scores, tau): exp(score / tau) normalised to sum 1, computed stably; a plain array.
  function softmaxT(scores, tau) {
    var n = scores.length, mx = -Infinity, out = new Array(n), s = 0, i;
    for (i = 0; i < n; i++) if (scores[i] / tau > mx) mx = scores[i] / tau;
    for (i = 0; i < n; i++) { out[i] = Math.exp(scores[i] / tau - mx); s += out[i]; }
    for (i = 0; i < n; i++) out[i] /= s;
    return out;
  }

  // teacherProbs(scores, centre, tau, centring): DINO's teacher distribution, softmax((scores - centre) / tau), or softmax(scores / tau) without centring.
  function teacherProbs(scores, centre, tau, centring) {
    var z = centring && centre ? scores.map(function (v, i) { return v - centre[i]; }) : scores.slice();
    return softmaxT(z, tau);
  }

  // crossEntropyOf(pt, ps): -sum pt ln ps in nats.
  function crossEntropyOf(pt, ps) {
    var s = 0;
    for (var i = 0; i < pt.length; i++) if (pt[i] > 0) s -= pt[i] * Math.log(Math.max(ps[i], Number.MIN_VALUE));
    return s;
  }

  // studentGradient(pt, ps, tauS): the gradient of H(pt, ps) on each student score, (ps - pt) / tauS.
  function studentGradient(pt, ps, tauS) {
    return ps.map(function (p, i) { return (p - pt[i]) / tauS; });
  }

  // pairTable(t, s, tauT, tauS, centre): every number of one pair's cross-entropy: the teacher's and the student's
  // probabilities, the logs, the terms, H, the teacher's entropy, the KL and the gradient on the student's scores.
  function pairTable(t, s, tauT, tauS, centre) {
    var pt = teacherProbs(t, centre || null, tauT, !!centre);
    var ps = softmaxT(s, tauS);
    var logs = ps.map(function (p) { return Math.log(p); });
    var terms = pt.map(function (p, i) { return -p * logs[i]; });
    var H = terms.reduce(function (a, b) { return a + b; }, 0);
    var h = entropyOf(pt);
    return { pt: pt, ps: ps, logs: logs, terms: terms, H: H, h: h, kl: H - h, grad: studentGradient(pt, ps, tauS) };
  }

  // pairCrops(locals): the names of the student's crops with `locals` local crops: G1, G2, L1 .. Llocals.
  function pairCrops(locals) {
    var out = ['G1', 'G2'];
    for (var i = 1; i <= locals; i++) out.push('L' + i);
    return out;
  }

  // spreadScores(spread, names, base): the student's scores of the toy crops, each moved from the crops' mean by the
  // factor spread (1 gives the defaults, 0 gives every crop the mean, 2 doubles every difference); base defaults to
  // DEFAULTS.d.student.
  function spreadScores(spread, names, base) {
    var src = base || DEFAULTS.d.student;
    var all = Object.keys(DEFAULTS.d.student);
    var K = DEFAULTS.d.prototypes;
    var mean = [];
    for (var k = 0; k < K; k++) {
      var s = 0;
      all.forEach(function (n) { s += DEFAULTS.d.student[n][k]; });
      mean.push(s / all.length);
    }
    var out = {};
    names.forEach(function (n) {
      out[n] = src[n].map(function (v, i) { return mean[i] + spread * (v - mean[i]); });
    });
    return out;
  }

  // pairsLoss(teacher, student, names, tauT, tauS): the pairs of DINO's loss over these crops (each global teacher
  // crop against every other student crop) with their cross-entropies, and the mean.
  function pairsLoss(teacher, student, names, tauT, tauS) {
    var pairs = [];
    ['G1', 'G2'].forEach(function (t) {
      names.forEach(function (s) {
        if (s === t) return;
        pairs.push({ teacher: t, student: s, H: pairTable(teacher[t], student[s], tauT, tauS).H });
      });
    });
    var mean = pairs.reduce(function (a, p) { return a + p.H; }, 0) / Math.max(1, pairs.length);
    return { pairs: pairs, mean: mean };
  }

  // pairsStep(teacher, student, names, tauT, tauS, lr): one toy learning step: every student crop's scores move against
  // the mean gradient of its pairs, s <- s - lr * mean over its teachers of (ps - pt) / tauS; the teacher stays put
  // (stop-gradient). Returns the new student scores.
  function pairsStep(teacher, student, names, tauT, tauS, lr) {
    var out = {};
    names.forEach(function (s) {
      var partners = ['G1', 'G2'].filter(function (t) { return t !== s; });
      var g = student[s].map(function () { return 0; });
      partners.forEach(function (t) {
        var row = pairTable(teacher[t], student[s], tauT, tauS).grad;
        row.forEach(function (v, i) { g[i] += v / partners.length; });
      });
      out[s] = student[s].map(function (v, i) { return v - lr * g[i]; });
    });
    return out;
  }

  // collapseRun(o, makeRng): the toy of lab-3e: a student and a teacher on four pictures (points of a plane), three
  // prototypes, logits W x + b, the teacher an EMA of the student, the centre an EMA of the teacher's logits, noisy
  // views, SGD with weight decay. o = DEFAULTS.e plus {centring, sharpening, seed}. Returns, for steps 0 .. o.steps,
  // the teacher's and the student's answers on the clean pictures (T, S: [step][picture][prototype]), the mean
  // teacher entropy H, the mean KL from teacher to student, and the mean teacher answer.
  function collapseRun(o, makeRng) {
    var K = 3, X = o.images, N = X.length;
    var r = makeRng(o.seed);
    var W = [], b = o.bias.slice(), k, n;
    for (k = 0; k < K; k++) W.push([o.weight_scale * r.normal(), o.weight_scale * r.normal()]);
    var Wt = W.map(function (row) { return row.slice(); });
    var bt = b.slice();
    var c = [0, 0, 0];
    var tauT = o.sharpening ? o.teacher_temperature : o.teacher_temperature_off;
    var tauS = o.student_temperature;
    var out = { T: [], S: [], H: [], KL: [], mean: [], tauT: tauT, centring: !!o.centring, sharpening: !!o.sharpening, seed: o.seed };
    // lin(M, bb, x): the three logits of a picture.
    function lin(M, bb, x) { return [0, 1, 2].map(function (j) { return M[j][0] * x[0] + M[j][1] * x[1] + bb[j]; }); }
    // centred(t): the teacher's logits with the centre taken off when centring is on.
    function centred(t) { return o.centring ? t.map(function (v, j) { return v - c[j]; }) : t; }
    // noisy(x): one view of a picture: the point moved by Gaussian noise.
    function noisy(x) { return [x[0] + o.view_noise * r.normal(), x[1] + o.view_noise * r.normal()]; }
    for (var step = 0; step <= o.steps; step++) {
      var Tc = X.map(function (x) { return softmaxT(centred(lin(Wt, bt, x)), tauT); });
      var Sc = X.map(function (x) { return softmaxT(lin(W, b, x), tauS); });
      var H = 0, KL = 0;
      for (n = 0; n < N; n++) {
        H += entropyOf(Tc[n]);
        KL += crossEntropyOf(Tc[n], Sc[n]) - entropyOf(Tc[n]);
      }
      out.T.push(Tc);
      out.S.push(Sc);
      out.H.push(H / N);
      out.KL.push(Math.max(0, KL / N));
      out.mean.push([0, 1, 2].map(function (j) { return Tc.reduce(function (a, p) { return a + p[j]; }, 0) / N; }));
      if (step === o.steps) break;
      var v1 = X.map(noisy), v2 = X.map(noisy);
      var T1 = v1.map(function (x) { return lin(Wt, bt, x); }), T2 = v2.map(function (x) { return lin(Wt, bt, x); });
      var P1 = T1.map(function (t) { return softmaxT(centred(t), tauT); }), P2 = T2.map(function (t) { return softmaxT(centred(t), tauT); });
      var Q1 = v1.map(function (x) { return softmaxT(lin(W, b, x), tauS); }), Q2 = v2.map(function (x) { return softmaxT(lin(W, b, x), tauS); });
      var gW = [[0, 0], [0, 0], [0, 0]], gb = [0, 0, 0], pairs = 2 * N;
      for (n = 0; n < N; n++) {
        [[P1[n], Q2[n], v2[n]], [P2[n], Q1[n], v1[n]]].forEach(function (pq) {
          for (var j = 0; j < K; j++) {
            var g = (pq[1][j] - pq[0][j]) / tauS / pairs;
            gW[j][0] += g * pq[2][0];
            gW[j][1] += g * pq[2][1];
            gb[j] += g;
          }
        });
      }
      for (k = 0; k < K; k++) {
        W[k][0] -= o.learning_rate * (gW[k][0] + o.weight_decay * W[k][0]);
        W[k][1] -= o.learning_rate * (gW[k][1] + o.weight_decay * W[k][1]);
        b[k] -= o.learning_rate * gb[k];
      }
      var meanT = [0, 1, 2].map(function (j) {
        var s = 0;
        for (var m = 0; m < N; m++) s += T1[m][j] + T2[m][j];
        return s / (2 * N);
      });
      c = c.map(function (v, j) { return o.centre_rate * v + (1 - o.centre_rate) * meanT[j]; });
      for (k = 0; k < K; k++) {
        Wt[k][0] = o.momentum * Wt[k][0] + (1 - o.momentum) * W[k][0];
        Wt[k][1] = o.momentum * Wt[k][1] + (1 - o.momentum) * W[k][1];
        bt[k] = o.momentum * bt[k] + (1 - o.momentum) * b[k];
      }
    }
    return out;
  }

  // collapseVerdict(run): what the end of a collapse run shows, in DINO's two forms of collapse: 'flat' when the
  // teacher's mean entropy is above 0.9 ln 3 (every answer close to the uniform one), 'one' when the same prototype wins
  // for every picture with more than 0.6 of the mean answer (one dimension dominates), otherwise 'none'. Also the
  // winner of each picture, the entropy, the KL and the mean answer.
  function collapseVerdict(run) {
    var last = run.T.length - 1;
    var mean = run.mean[last];
    var best = mean.indexOf(Math.max.apply(null, mean));
    var winners = run.T[last].map(function (p) { return p.indexOf(Math.max.apply(null, p)); });
    var same = winners.every(function (w) { return w === winners[0]; });
    var kind = 'none';
    if (run.H[last] > 0.9 * Math.log(3)) kind = 'flat';
    else if (same && mean[best] > 0.6) kind = 'one';
    return { kind: kind, prototype: best, winners: winners, H: run.H[last], KL: run.KL[last], mean: mean };
  }

  // unitRows(array, n, d): the n rows of a flat n x d array divided by their lengths (a zero row stays zero), in one Float64Array.
  function unitRows(array, n, d) {
    var out = new Float64Array(n * d);
    for (var i = 0; i < n; i++) {
      var s = 0, j, o = i * d;
      for (j = 0; j < d; j++) s += array[o + j] * array[o + j];
      var len = Math.max(Math.sqrt(s), 1e-12);
      for (j = 0; j < d; j++) out[o + j] = array[o + j] / len;
    }
    return out;
  }

  // cosineRow(unit, n, d, a): the cosines of token a with every token (unit rows), a Float64Array of n; entry a is 1.
  function cosineRow(unit, n, d, a) {
    var out = new Float64Array(n), oa = a * d;
    for (var j = 0; j < n; j++) {
      var s = 0, oj = j * d;
      for (var q = 0; q < d; q++) s += unit[oa + q] * unit[oj + q];
      out[j] = s;
    }
    return out;
  }

  // topK(row, k, exclude): the k indices with the largest values (ties to the lower index), leaving out `exclude`.
  function topK(row, k, exclude) {
    var idx = [];
    for (var j = 0; j < row.length; j++) if (j !== exclude) idx.push(j);
    idx.sort(function (x, y) { return row[y] - row[x] || x - y; });
    return idx.slice(0, k);
  }

  // workedExamples(): every number the three equation walks of src/sections_p3.html print, as strings in the form the
  // copy writes them (src/labs_defaults.json holds the same numbers under ids 3b.walk., 3d.walk. and 3c.walk.).
  function workedExamples() {
    var out = {};
    // put(key, values, digits): values as fixed strings.
    function put(key, values, digits) { out[key] = values.map(function (v) { return fixed(v, digits); }); }
    // the teacher's distribution: three prototypes, two pictures, centring and sharpening (section 3.4)
    var A = [0.3, 0.1, 0.2], B = [0.3, 0.25, 0.05];
    var mean = A.map(function (v, i) { return (v + B[i]) / 2; });
    put('walk1.scores_A', A, 2);
    put('walk1.scores_B', B, 2);
    put('walk1.raw_A_over_tau', A.map(function (v) { return v / 0.04; }), 2);
    put('walk1.raw_B_over_tau', B.map(function (v) { return v / 0.04; }), 2);
    put('walk1.raw_A', softmaxT(A, 0.04), 3);
    put('walk1.raw_B', softmaxT(B, 0.04), 3);
    put('walk1.raw_entropy', [entropyOf(softmaxT(A, 0.04)), entropyOf(softmaxT(B, 0.04))], 3);
    put('walk1.batch_mean', mean, 3);
    put('walk1.centre_before', [0.2, 0.15, 0.15], 2);
    put('walk1.centre_after', [0.2, 0.15, 0.15].map(function (v, i) { return 0.9 * v + 0.1 * mean[i]; }), 4);
    var cA = A.map(function (v, i) { return v - mean[i]; });
    put('walk1.centred_A', cA, 3);
    put('walk1.centred_A_over_tau', cA.map(function (v) { return v / 0.04; }), 3);
    put('walk1.centred_A_exp', cA.map(function (v) { return Math.exp(v / 0.04); }), 3);
    put('walk1.centred_A_exp_sum', [cA.reduce(function (a, v) { return a + Math.exp(v / 0.04); }, 0)], 3);
    put('walk1.centred_A', cA, 3);
    put('walk1.sharp_A', teacherProbs(A, mean, 0.04, true), 3);
    put('walk1.sharp_B', teacherProbs(B, mean, 0.04, true), 3);
    put('walk1.soft_A', teacherProbs(A, mean, 0.1, true), 3);
    put('walk1.soft_B', teacherProbs(B, mean, 0.1, true), 3);
    put('walk1.sharp_soft_entropy', [entropyOf(teacherProbs(A, mean, 0.04, true)), entropyOf(teacherProbs(A, mean, 0.1, true))], 3);
    put('walk1.ln3', [Math.log(3)], 3);
    put('walk1.flat_student', [1 / 3], 3);
    put('walk1.gradient', studentGradient(teacherProbs(A, mean, 0.04, true), [1 / 3, 1 / 3, 1 / 3], 0.1), 2);
    // the cross-entropy of one pair and one learning step (section 3.5)
    var t5 = DEFAULTS.d.teacher.G1, s5 = DEFAULTS.d.student.G2;
    var tab = pairTable(t5, s5, 0.04, 0.1);
    put('walk2.teacher_probs', tab.pt, 3);
    put('walk2.student_probs', tab.ps, 3);
    put('walk2.logs', tab.logs, 3);
    put('walk2.terms', tab.terms, 3);
    put('walk2.H', [tab.H], 3);
    put('walk2.teacher_entropy', [tab.h], 3);
    put('walk2.kl', [tab.kl], 3);
    put('walk2.gradient', tab.grad, 2);
    var s1 = s5.map(function (v, i) { return v - 0.01 * tab.grad[i]; });
    var tab1 = pairTable(t5, s1, 0.04, 0.1);
    put('walk2.step_scores', s1, 3);
    put('walk2.step_student_probs', tab1.ps, 3);
    put('walk2.step_H', [tab1.H], 3);
    // the teacher's moving average and its cosine schedule (section 3.6)
    put('walk3.weights', [0.5, 0.8], 3);
    put('walk3.dino_terms', [0.996 * 0.5, 0.004 * 0.8], 4);
    put('walk3.dino_new', [0.996 * 0.5 + 0.004 * 0.8], 4);
    put('walk3.ours_new', [0.9995 * 0.5 + 0.0005 * 0.8], 5);
    put('walk3.gap_after_100', [Math.pow(0.996, 100), Math.pow(0.9995, 100)], 3);
    put('walk3.lambda_mid', [1 - 0.0005 * (Math.cos(Math.PI / 2) + 1) / 2], 5);
    return out;
  }

  // ------------------------------------------------------------------ Lab 3A: ten views of one picture (ported Lab D)

  Labs.register('lab-3a-crops', function mount(body, core) {
    var ID = 'lab-3a-crops';
    var D = DEFAULTS.a;
    var SRC = 448;
    var NAMES = [];
    var i0;
    for (i0 = 0; i0 < D.global_count; i0++) NAMES.push('G' + (i0 + 1));
    for (i0 = 0; i0 < D.local_count; i0++) NAMES.push('L' + (i0 + 1));
    var st = {
      seed: D.seed, flags: {}, recipe: D.recipe, method: D.method, view: D.view, grid: D.patch_grid,
      image: null, pic: null, crops: null, results: []
    };
    Object.keys(D.toggles).forEach(function (k) { st.flags[k] = D.toggles[k]; });
    var runChain = chain(body, core);

    var controls = core.el('div', { class: 'lab-controls' });
    var stage = core.el('div', { class: 'lab-stage' });
    var chooser = imageChooser(core, ID, 'Picture used by Lab 3A');
    if (chooser) controls.appendChild(chooser);
    var again = button(core, ID + '-new', 'New crops', true);
    controls.appendChild(core.el('div', { class: 'button-row' }, again));

    var names = { flip: 'Mirror', jitter: 'Colour jitter', grey: 'Greyscale', blur: 'Blur', solarise: 'Solarise' };
    var toggles = {};
    var augRow = core.el('div', { class: 'toggle-row' });
    Object.keys(names).forEach(function (k) {
      toggles[k] = toggle(core, { id: ID + '-' + k, label: names[k], checked: st.flags[k] });
      augRow.appendChild(toggles[k].root);
    });
    var recipe = toggle(core, { id: ID + '-recipe', label: 'Only with the recipe\'s chances', checked: st.recipe });
    controls.appendChild(core.el('div', { class: 'control-group' }, [
      core.el('p', { class: 'control-group-title', text: 'Changes to each crop' }),
      augRow,
      hint(core, 'Each switched-on change is an ' + term('augmentation') + '. Only the second global crop can be ' +
        term('solarise', 'solarised') + '.' + factMark(['aug_solarise_p'])),
      recipe.root,
      hint(core, 'The real recipe mirrors a crop with probability 0.5, jitters its colours with probability 0.8, turns it grey ' +
        'with 0.2, blurs it with 1.0, 0.1 or 0.5 (the first global crop, the second, each local crop) and solarises the ' +
        'second global crop with 0.2.' + factMark(['aug_flip_p', 'aug_colour_jitter', 'aug_greyscale_p', 'aug_blur_p', 'aug_solarise_p']))
    ]));

    var method = segmented(core, { id: ID + '-method', label: 'Method', options: [{ value: 'dino', text: 'DINO' }, { value: 'selfpatch', text: 'SelfPatch' }], value: st.method });
    var view = segmented(core, { id: ID + '-view', label: 'Highlight the crops that', options: [{ value: 'teacher', text: 'the teacher sees' }, { value: 'student', text: 'the student sees' }], value: st.view });
    controls.appendChild(core.el('div', { class: 'control-group' }, [
      core.el('p', { class: 'control-group-title', text: 'Who sees which crop' }),
      method.root,
      view.root,
      hint(core, 'DINO: only the 2 global crops pass through the ' + term('teacher') + '. SelfPatch: the teacher processes ' +
        'all 10 crops, because SelfPatch needs the teacher\'s view of the patches of every crop (Part 4). In both, the ' +
        term('student') + ' sees every crop.' + factMark(['dino_teacher_crops', 'sp_teacher_crops']))
    ]));
    var gridT = toggle(core, { id: ID + '-patches', label: 'Show the 16-pixel patches', checked: st.grid });
    controls.appendChild(gridT.root);

    var srcBox = canvasBox(core, { id: ID + '-picture', label: 'The picture with this set of crops outlined' });
    var legend = core.el('p', { class: 'stage-label', text: 'Solid outline: global crop, resized to ' + D.global_side + ' px. Dashed outline: local crop, resized to ' + D.local_side + ' px.' });
    var thumbsRow = core.el('div', { class: 'stage-row' });
    var thumbs = NAMES.map(function (name, i) {
      var box = canvasBox(core, { id: ID + '-crop-' + name.toLowerCase(), label: 'Crop ' + name + ' as the network receives it' });
      var nameEl = core.el('span', { class: 'stage-label' });
      var areaEl = core.el('span', { class: 'stage-label' });
      var changesEl = core.el('span', { class: 'stage-label' });
      var chips = core.el('span', { class: 'toggle-row' });
      var cell = core.el('div', { class: 'stage-cell' }, [box.canvas, nameEl, areaEl, changesEl, chips]);
      thumbsRow.appendChild(cell);
      return { box: box, name: nameEl, area: areaEl, changes: changesEl, chips: chips, index: i };
    });
    var facts = readoutList(core, [['total', 'Each picture gives'], ['teacher', 'The teacher sees'], ['student', 'The student sees'],
      ['pairs', 'Pairs in DINO\'s loss'], ['set', 'Crop set', ID + '-set']]);
    stage.appendChild(core.el('div', { class: 'stage-row' }, [
      core.el('div', { class: 'stage-cell' }, [srcBox.canvas, legend]),
      core.el('div', { class: 'stage-cell' }, [facts.root])
    ]));
    stage.appendChild(thumbsRow);
    body.appendChild(controls);
    body.appendChild(stage);

    // teacherSees(i): whether the teacher of the chosen method processes crop i.
    function teacherSees(i) {
      return st.method === 'selfpatch' || st.crops[i].kind === 'global';
    }

    // highlighted(i): whether crop i is highlighted for the chosen network.
    function highlighted(i) {
      return st.view === 'student' ? true : teacherSees(i);
    }

    // roleName(): the role colour of the highlight.
    function roleName() {
      return st.view === 'student' ? 'student' : 'teacher';
    }

    // load(): read the shared picture at the side the crops are cut from.
    function load() {
      st.image = core.currentImage(D.source_side).imageData;
      st.pic = core.toCanvas(st.image);
    }

    // sample(): draw a new set of crop rectangles from the current seed.
    function sample() {
      st.crops = core.cropSampler(core.rng(st.seed), D.source_side, {
        globalScale: D.global_scale, localScale: D.local_scale, nGlobal: D.global_count, nLocal: D.local_count,
        globalSize: D.global_side, localSize: D.local_side
      }).all;
      st.results = [];
    }

    // drawSource(): the picture with every crop outlined; the highlighted crops in the role colour, drawn last.
    function drawSource() {
      var th = core.theme();
      var k = SRC / D.source_side;
      var ctx = srcBox.begin(SRC, SRC);
      ctx.imageSmoothingEnabled = true;
      try { ctx.imageSmoothingQuality = 'high'; } catch (e) { /* older browsers */ }
      ctx.drawImage(st.pic, 0, 0, SRC, SRC);
      var order = st.crops.map(function (c, i) { return i; });
      order.sort(function (a, b) { return (highlighted(a) ? 1 : 0) - (highlighted(b) ? 1 : 0) || a - b; });
      var colour = th[roleName()];
      ctx.font = canvasFont(11, 700);
      ctx.textBaseline = 'top';
      order.forEach(function (i) {
        var r = st.crops[i], hi = highlighted(i);
        var x = r.x * k, y = r.y * k, w = r.w * k, h = r.h * k;
        ctx.setLineDash(r.kind === 'local' ? [6, 4] : []);
        ctx.lineWidth = (hi ? 2.5 : 1.25) + 2;
        ctx.strokeStyle = core.rgba(th.paper, 0.75);
        ctx.strokeRect(x, y, w, h);
        ctx.lineWidth = hi ? 2.5 : 1.25;
        ctx.strokeStyle = hi ? colour : th.muted;
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);
        // tags: global crops at their top-left corner, local crops at their bottom-left corner, so fewer tags collide
        var tw = ctx.measureText(NAMES[i]).width + 6;
        var tx = clamp(x, 0, SRC - tw), ty = clamp(r.kind === 'local' ? y + h - 15 : y, 0, SRC - 15);
        ctx.fillStyle = hi ? colour : th.paper;
        ctx.fillRect(tx, ty, tw, 15);
        ctx.fillStyle = hi ? th.paper : th.ink;
        ctx.fillText(NAMES[i], tx + 3, ty + 2);
      });
    }

    // renderCrop(i): cut, resize and change crop i (Core.augment), then draw its small picture.
    function renderCrop(i) {
      var rect = st.crops[i];
      var flags = { flip: st.flags.flip, jitter: st.flags.jitter, grey: st.flags.grey, blur: st.flags.blur, solarise: st.flags.solarise, mode: st.recipe ? 'recipe' : 'always' };
      var out = core.augment(st.image, rect, rect.out, flags, core.rng(st.seed * D.crop_seed_step + i));
      st.results[i] = { canvas: core.toCanvas(out), applied: out.applied || null };
      drawThumb(i);
    }

    // describe(applied): the changes Core.augment reports for a crop, in words.
    function describe(applied) {
      if (!applied) return 'being prepared' + CH.ellipsis;
      var list = [];
      if (applied.flip) list.push('mirrored');
      if (applied.jitter) list.push('colours jittered');
      if (applied.grey) list.push('grey');
      if (applied.blur) list.push('blurred');
      if (applied.solarise) list.push('solarised');
      return list.length ? list.join(', ') : 'unchanged';
    }

    // drawThumb(i): crop i at half its network size, with its outline, labels and who sees it.
    function drawThumb(i) {
      var th = core.theme();
      var t = thumbs[i], rect = st.crops[i], res = st.results[i];
      var W = Math.round(rect.out * D.thumbnail_scale);
      var ctx = t.box.begin(W, W);
      if (res) {
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(res.canvas, 0, 0, W, W);
      } else {
        ctx.fillStyle = core.rgba(th.line, 0.6);
        ctx.fillRect(0, 0, W, W);
      }
      if (st.grid) {
        var step = 16 * D.thumbnail_scale;
        ctx.fillStyle = core.rgba(th.paper, 0.7);
        for (var s = step; s < W - 0.5; s += step) {
          ctx.fillRect(Math.round(s) - 0.5, 0, 1, W);
          ctx.fillRect(0, Math.round(s) - 0.5, W, 1);
        }
      }
      var hi = highlighted(i);
      t.box.canvas.style.outline = hi ? '3px solid var(--' + roleName() + ')' : '1px solid var(--line)';
      t.box.canvas.style.outlineOffset = '2px';
      t.name.textContent = NAMES[i] + ' ' + CH.middot + ' ' + rect.out + ' px' + (st.grid ? ' ' + CH.middot + ' ' + (rect.out / 16) + ' ' + CH.times + ' ' + (rect.out / 16) + ' patches' : '');
      t.area.textContent = core.fmt(rect.scale, 2) + ' of the area';
      t.changes.textContent = describe(res && res.applied);
      clearNode(t.chips);
      if (teacherSees(i)) t.chips.appendChild(core.el('span', { class: ['chip', 'role-teacher', st.view === 'teacher' ? 'filled' : null], text: 'teacher' }));
      t.chips.appendChild(core.el('span', { class: ['chip', 'role-student', st.view === 'student' ? 'filled' : null], text: 'student' }));
    }

    // fillFacts(): the counts beside the picture.
    function fillFacts() {
      var nG = D.global_count, nL = D.local_count, all = nG + nL;
      facts.set('total', nG + ' global crops of ' + D.global_side + ' px + ' + nL + ' local crops of ' + D.local_side + ' px = ' + all + ' crops');
      facts.set('teacher', st.method === 'dino' ? NAMES.slice(0, nG).join(' and ') + ': the ' + nG + ' global crops' : 'all ' + all + ' crops');
      facts.set('student', 'all ' + all + ' crops');
      facts.set('pairs', nG + ' teacher crops ' + CH.times + ' ' + (all - 1) + ' other student crops = ' + (nG * (all - 1)) +
        (st.method === 'dino' ? '' : '; SelfPatch keeps these image-level pairs and adds patch targets in every crop'));
      facts.set('set', String(st.seed));
    }

    // drawHighlights(): the outlines, labels and chips after a change of method or highlight.
    function drawHighlights() {
      drawSource();
      for (var i = 0; i < thumbs.length; i++) drawThumb(i);
      fillFacts();
    }

    // renderAll(): new small pictures for every crop, one crop per frame so the page stays responsive.
    function renderAll() {
      st.results = [];
      for (var i = 0; i < thumbs.length; i++) drawThumb(i);
      runChain(st.crops.map(function (c, i) { return function () { renderCrop(i); }; }));
    }

    var redrawHighlights = later(body, core, drawHighlights);

    again.addEventListener('click', core.guard(body, function () {
      st.seed += 1;
      sample();
      drawHighlights();
      renderAll();
    }));
    Object.keys(toggles).forEach(function (k) {
      toggles[k].input.addEventListener('change', core.guard(body, function () {
        st.flags[k] = toggles[k].input.checked;
        renderAll();
      }));
    });
    recipe.input.addEventListener('change', core.guard(body, function () {
      st.recipe = recipe.input.checked;
      renderAll();
    }));
    method.onChange(core.guard(body, function () { st.method = method.value(); redrawHighlights(); }));
    view.onChange(core.guard(body, function () { st.view = view.value(); redrawHighlights(); }));
    gridT.input.addEventListener('change', core.guard(body, function () { st.grid = gridT.input.checked; redrawHighlights(); }));
    core.on('image-changed', core.guard(body, function () {
      load();
      drawHighlights();
      renderAll();
    }));
    core.on('theme-changed', redrawHighlights);

    load();
    sample();
    drawHighlights();
    renderAll();
    refreshMarks();
  });

  // ------------------------------------------------------------------ Lab 3B: prototypes, temperatures, centring (ported Lab E, deepened)

  Labs.register('lab-3b-prototypes', function mount(body, core) {
    var ID = 'lab-3b-prototypes';
    var D = DEFAULTS.b;
    var K = D.prototypes;
    var LN_K = Math.log(K);
    var st = { tt: D.teacher_temperature.default, ts: D.student_temperature.default, centring: D.centring, scenario: D.scenario, t: null, s: null, c: null, learned: 0, updates: 0 };

    // resetScores(): the scenario's starting scores and centre. 'one': one prototype high in every picture (teacher,
    // student and centre all equal those scores); 'flat': every prototype equal for every picture.
    function resetScores() {
      if (st.scenario === 'one') {
        st.t = D.collapse_logits.slice();
        st.s = D.collapse_logits.slice();
        st.c = D.collapse_logits.slice();
      } else if (st.scenario === 'flat') {
        st.t = D.flat_logits.slice();
        st.s = D.student_logits.slice();
        st.c = D.flat_logits.slice();
      } else {
        st.t = D.teacher_logits.slice();
        st.s = D.student_logits.slice();
        st.c = D.centre.slice();
      }
      st.learned = 0;
      st.updates = 0;
    }

    var controls = core.el('div', { class: 'lab-controls' });
    var stage = core.el('div', { class: 'lab-stage' });
    var tT = slider(core, {
      id: ID + '-teacher-temp', label: 'Teacher temperature', role: 'teacher', digits: 2,
      min: D.teacher_temperature.min, max: D.teacher_temperature.max, step: D.teacher_temperature.step, value: st.tt,
      hint: 'Lower is sharper. SelfPatch\'s code and our runs use 0.04 for the whole run.' + factMark(['temp_teacher'])
    });
    var sT = slider(core, {
      id: ID + '-student-temp', label: 'Student temperature', role: 'student', digits: 2,
      min: D.student_temperature.min, max: D.student_temperature.max, step: D.student_temperature.step, value: st.ts,
      hint: 'DINO uses 0.1.' + factMark(['temp_student'])
    });
    var centring = toggle(core, { id: ID + '-centring', label: 'Centring', checked: st.centring });
    var scenario = segmented(core, {
      id: ID + '-scenario', label: 'Scores', value: st.scenario,
      options: [{ value: 'usual', text: 'Usual' }, { value: 'one', text: 'One wins' }, { value: 'flat', text: 'All equal' }],
      hint: 'The two forms of ' + term('collapse') + ': in \'One wins\' one prototype scores high for every picture, in the ' +
        'teacher and the student alike; in \'All equal\' every prototype scores the same for every picture.' + factMark(['why_dino_collapse_forms'])
    });
    var learn = button(core, ID + '-learn', 'Student learns one step', true);
    var learnMany = button(core, ID + '-learn-many', 'Ten steps');
    var update = button(core, ID + '-centre-step', 'Update the centre');
    var reset = button(core, ID + '-reset', 'Reset the scores');
    controls.appendChild(tT.root);
    controls.appendChild(sT.root);
    controls.appendChild(core.el('div', { class: 'control-group' }, [
      centring.root,
      hint(core, term('centring', 'Centring') + ' subtracts the centre, a running mean of the teacher\'s scores, before the softmax.' + factMark(['centre_rule']))
    ]));
    controls.appendChild(scenario.root);
    controls.appendChild(core.el('div', { class: 'button-row' }, [learn, learnMany, update, reset]));
    controls.appendChild(hint(core, 'A learning step moves each student score against its ' + term('gradient') + ': by 0.01 ' +
      CH.times + ' (student probability ' + CH.minus + ' teacher probability) / student temperature. The teacher gets no gradient (' +
      term('stop-gradient') + ').' + factMark(['loss_stop_gradient'])));
    controls.appendChild(hint(core, 'The centre update is c ' + CH.larr + ' m ' + CH.middot + ' c + (1 ' + CH.minus + ' m) ' +
      CH.middot + ' teacher scores, with m = 0.9.' + factMark(['centre_momentum'])));

    var chartRow = core.el('div', { class: 'stage-row' });
    var gradRow = core.el('div', { class: 'stage-row' });
    var ceLine = core.el('p', { class: 'readout', id: ID + '-ce' });
    var info = readoutList(core, [
      ['ht', 'Teacher ' + term('entropy')], ['kl', term('kl divergence', 'KL') + ' = cross-entropy ' + CH.minus + ' teacher entropy'],
      ['hs', 'Student entropy'], ['best', 'Lowest possible loss'], ['flat', 'A flat answer'], ['count', 'Steps so far']
    ]);
    var status = core.el('p', { class: 'readout', id: ID + '-status' });
    var tableWrap = core.el('div', { class: 'scroll-x' });
    stage.appendChild(chartRow);
    stage.appendChild(ceLine);
    stage.appendChild(status);
    stage.appendChild(gradRow);
    stage.appendChild(info.root);
    stage.appendChild(tableWrap);
    body.appendChild(controls);
    body.appendChild(stage);

    // compute(): the centred teacher scores, both distributions, the cross-entropy, the entropies and the gradient.
    function compute() {
      var tc = st.t.map(function (v, i) { return st.centring ? v - st.c[i] : v; });
      var pt = softmaxT(tc, st.tt);
      var ps = softmaxT(st.s, st.ts);
      var ce = crossEntropyOf(pt, ps);
      var ht = entropyOf(pt);
      return { tc: tc, pt: pt, ps: ps, ce: ce, ht: ht, hs: entropyOf(ps), kl: ce - ht, grad: studentGradient(pt, ps, st.ts) };
    }

    // chart(title, probs, role, name): an SVG bar chart of 12 probabilities in the role colour.
    function chart(title, probs, role, name) {
      var W = 330, H = 206, L = 34, R = 6, T = 30, B = 34;
      var pw = W - L - R, ph = H - T - B, band = pw / K, bw = Math.min(16, band - 5);
      var y = function (v) { return T + ph * (1 - v); };
      var svg = core.el('svg', { class: 'chart', viewBox: '0 0 ' + W + ' ' + H, width: String(W), role: 'img', 'aria-label': name + ' probabilities over 12 prototypes' });
      svg.appendChild(svgText(core, 0, 13, title, { class: 'title' }));
      var grid = core.el('g', { class: 'grid' });
      var axis = core.el('g', { class: 'axis' });
      [0, 0.5, 1].forEach(function (v) {
        grid.appendChild(core.el('line', { x1: String(L), x2: String(W - R), y1: String(y(v)), y2: String(y(v)) }));
        svg.appendChild(svgText(core, L - 6, y(v) + 4, v === 0 ? '0' : (v === 1 ? '1' : '0.5'), { 'text-anchor': 'end' }));
      });
      svg.appendChild(grid);
      var bars = core.el('g', { class: 'role-' + role });
      var order = probs.map(function (p, i) { return i; }).sort(function (a, b) { return probs[b] - probs[a] || a - b; });
      var labelled = order.slice(0, 2).filter(function (i) { return probs[i] >= 0.05; });
      for (var i = 0; i < K; i++) {
        var x = L + i * band + (band - bw) / 2;
        var h = ph * clamp(probs[i], 0, 1);
        var tip = core.el('svg:title', null, 'Prototype ' + (i + 1) + ': ' + core.fmt(probs[i], 3));
        if (h >= 0.5) bars.appendChild(core.el('path', { class: 'bar', d: barPath(x, y(0) - h, bw, h, 4) }, tip));
        else bars.appendChild(core.el('rect', { x: String(x), y: String(y(0) - 0.5), width: String(bw), height: '0.5', class: 'bar' }, tip));
        svg.appendChild(svgText(core, x + bw / 2, H - B + 14, i + 1, { 'text-anchor': 'middle' }));
        // a transparent band over the whole column, so a hairline bar still shows its value on hover (as Lab E did)
        svg.appendChild(core.el('rect', { x: String(L + i * band), y: String(T), width: String(band), height: String(ph), fill: 'transparent' },
          core.el('svg:title', null, 'Prototype ' + (i + 1) + ': ' + core.fmt(probs[i], 3))));
      }
      svg.appendChild(bars);
      labelled.forEach(function (i2) {
        var x2 = L + i2 * band + band / 2;
        svg.appendChild(svgText(core, x2, Math.max(T - 4, y(probs[i2]) - 5), core.fmt(probs[i2], 2), { 'text-anchor': 'middle', class: 'title' }));
      });
      axis.appendChild(core.el('line', { x1: String(L), x2: String(W - R), y1: String(y(0)), y2: String(y(0)) }));
      svg.appendChild(axis);
      svg.appendChild(svgText(core, L + pw / 2, H - 4, 'prototype', { 'text-anchor': 'middle' }));
      return core.el('div', { class: 'stage-cell' }, [svg]);
    }

    // gradChart(grad): the gradient on each student score as bars above and below zero; a step moves each score the other way.
    function gradChart(grad) {
      var W = 680, H = 190, L = 40, R = 8, T = 34, B = 30;
      var pw = W - L - R, ph = H - T - B, band = pw / K, bw = Math.min(26, band - 8);
      var top = Math.max(1, Math.max.apply(null, grad.map(Math.abs)));
      // the bars use four fifths of each half, so a value label clears the prototype numbers below the chart
      var span = 1.25 * top;
      var y = function (v) { return T + ph / 2 - (ph / 2) * (v / span); };
      var svg = core.el('svg', { class: 'chart', viewBox: '0 0 ' + W + ' ' + H, width: String(W), role: 'img', 'aria-label': 'The gradient of the cross-entropy on each of the student\'s 12 scores' });
      svg.appendChild(svgText(core, 0, 13, 'Gradient on each student score: (p' + CH.sub_s + ' ' + CH.minus + ' p' + CH.sub_t + ') / ' + CH.tau + CH.sub_s, { class: 'title' }));
      svg.appendChild(svgText(core, 0, 27, 'A bar above zero: the step lowers that score. Below zero: the step raises it.', {}));
      var grid = core.el('g', { class: 'grid' });
      [-top, 0, top].forEach(function (v) {
        grid.appendChild(core.el('line', { x1: String(L), x2: String(W - R), y1: String(y(v)), y2: String(y(v)) }));
        svg.appendChild(svgText(core, L - 6, y(v) + 4, trimNum(core, v, 1), { 'text-anchor': 'end' }));
      });
      svg.appendChild(grid);
      var bars = core.el('g', { class: 'role-student' });
      var biggest = grad.map(function (g, i) { return i; }).sort(function (a, b) { return Math.abs(grad[b]) - Math.abs(grad[a]) || a - b; }).slice(0, 2);
      for (var i = 0; i < K; i++) {
        var x = L + i * band + (band - bw) / 2;
        var y0 = y(0), y1 = y(grad[i]);
        var top2 = Math.min(y0, y1), h = Math.max(0.5, Math.abs(y1 - y0));
        bars.appendChild(core.el('rect', { class: 'bar', x: String(Math.round(x * 10) / 10), y: String(Math.round(top2 * 10) / 10), width: String(bw), height: String(Math.round(h * 10) / 10) },
          core.el('svg:title', null, 'Prototype ' + (i + 1) + ': ' + core.fmt(grad[i], 3))));
        svg.appendChild(svgText(core, x + bw / 2, H - B + 16, i + 1, { 'text-anchor': 'middle' }));
        svg.appendChild(core.el('rect', { x: String(Math.round((L + i * band) * 10) / 10), y: String(T), width: String(Math.round(band * 10) / 10), height: String(ph), fill: 'transparent' },
          core.el('svg:title', null, 'Prototype ' + (i + 1) + ': ' + core.fmt(grad[i], 3))));
        if (biggest.indexOf(i) >= 0 && Math.abs(grad[i]) > 0.005) {
          svg.appendChild(svgText(core, x + bw / 2, grad[i] >= 0 ? top2 - 4 : top2 + h + 12, trimNum(core, grad[i], 2), { 'text-anchor': 'middle', class: 'title' }));
        }
      }
      svg.appendChild(bars);
      svg.appendChild(core.el('g', { class: 'axis' }, core.el('line', { x1: String(L), x2: String(W - R), y1: String(y(0)), y2: String(y(0)) })));
      return core.el('div', { class: 'stage-cell' }, [svg]);
    }

    // table(r): the scores, probabilities and gradients of all 12 prototypes, one column each.
    function table(r) {
      var head = [core.el('th', { scope: 'col', text: 'prototype' })];
      for (var i = 0; i < K; i++) head.push(core.el('th', { scope: 'col', class: 'num', text: String(i + 1) }));
      // row(label, values, digits): one row of numbers, in compact cells so the twelve columns fit the stage.
      function row(label, values, digits) {
        var cells = [core.el('th', { scope: 'row', text: label, style: 'white-space: nowrap; padding: 0.3rem 0.5rem 0.3rem 0' })];
        for (var j = 0; j < K; j++) cells.push(core.el('td', { class: 'num', text: values ? core.fmt(values[j], digits) : 'off', style: 'padding: 0.3rem 0.35rem' }));
        return core.el('tr', null, cells);
      }
      head.forEach(function (h, i) { h.style.padding = i === 0 ? '0.3rem 0.5rem 0.3rem 0' : '0.3rem 0.35rem'; });
      return core.el('table', { style: 'font-size: 0.8rem' }, [
        core.el('caption', { text: 'Every number behind the three charts' }),
        core.el('thead', null, core.el('tr', null, head)),
        core.el('tbody', null, [
          row('teacher score', st.t, 2),
          row('centre (running mean)', st.c, 2),
          row('score ' + CH.minus + ' centre', st.centring ? r.tc : null, 2),
          row('teacher probability', r.pt, 3),
          row('student score', st.s, 2),
          row('student probability', r.ps, 3),
          row('gradient on the student score', r.grad, 2)
        ])
      ]);
    }

    // draw(): the three charts, the readouts and the table.
    function draw() {
      var r = compute();
      clearNode(chartRow);
      var tLabel = st.centring
        ? 'Teacher: softmax((score ' + CH.minus + ' centre) / ' + core.fmt(st.tt, 2) + ')'
        : 'Teacher: softmax(score / ' + core.fmt(st.tt, 2) + ')';
      chartRow.appendChild(chart(tLabel, r.pt, 'teacher', 'Teacher'));
      chartRow.appendChild(chart('Student: softmax(score / ' + core.fmt(st.ts, 2) + ')', r.ps, 'student', 'Student'));
      clearNode(gradRow);
      gradRow.appendChild(gradChart(r.grad));
      ceLine.textContent = 'Cross-entropy H(teacher, student) = ' + core.fmt(r.ce, 3) + ' nats';
      ceLine.style.fontWeight = '700';
      info.set('ht', core.fmt(r.ht, 3) + ' nats');
      info.set('kl', core.fmt(r.kl, 3) + ' nats: zero only when the student\'s probabilities equal the teacher\'s');
      info.set('hs', core.fmt(r.hs, 3) + ' nats');
      info.set('best', core.fmt(r.ht, 3) + ' nats: the teacher\'s own entropy, reached when the student matches the teacher exactly');
      info.set('flat', 'every prototype at 1/' + K + ': entropy ln ' + K + ' (the natural logarithm of ' + K + ') = ' + core.fmt(LN_K, 3) + ' nats');
      info.set('count', st.learned + ' learning steps, ' + st.updates + ' centre updates');
      var msg;
      var rawSpread = Math.max.apply(null, st.t) - Math.min.apply(null, st.t);
      var centredSpread = Math.max.apply(null, r.tc) - Math.min.apply(null, r.tc);
      if (st.centring && rawSpread > 1e-6 && centredSpread < 1e-6) msg = 'Centring has taken the shared lead off entirely: here the centre matches the teacher\'s scores, so every score minus the centre is 0 and the teacher\'s answer is flat. The real centre is the mean over a whole batch of pictures; here the batch is this one picture. Switch centring off to see the first form of collapse.';
      else if (r.ht < 0.05) msg = 'The teacher puts almost all its weight on one prototype. If it says the same for every picture, the student can copy it without looking: the first form of collapse.';
      else if (r.ht > 0.98 * LN_K) msg = 'The teacher\'s answer is flat: every prototype gets about the same weight, so its answer says nothing about the picture: the second form of collapse.';
      else msg = 'The teacher\'s answer favours a few prototypes without being a single spike.';
      status.textContent = msg;
      clearNode(tableWrap);
      tableWrap.appendChild(table(r));
    }

    var redraw = later(body, core, draw);

    // learnSteps(n): n learning steps of the student's scores.
    function learnSteps(n) {
      for (var k = 0; k < n; k++) {
        var r = compute();
        st.s = st.s.map(function (v, i) {
          return clamp(v - D.learning_rate * r.grad[i], D.score_range[0], D.score_range[1]);
        });
        st.learned += 1;
      }
      redraw();
    }

    tT.input.addEventListener('input', core.guard(body, function () { st.tt = tT.value(); tT.show(); redraw(); }));
    sT.input.addEventListener('input', core.guard(body, function () { st.ts = sT.value(); sT.show(); redraw(); }));
    centring.input.addEventListener('change', core.guard(body, function () { st.centring = centring.input.checked; redraw(); }));
    scenario.onChange(core.guard(body, function () { st.scenario = scenario.value(); resetScores(); redraw(); }));
    learn.addEventListener('click', core.guard(body, function () { learnSteps(1); }));
    learnMany.addEventListener('click', core.guard(body, function () { learnSteps(D.many_steps); }));
    update.addEventListener('click', core.guard(body, function () {
      st.c = st.c.map(function (v, i) { return D.centre_rate * v + (1 - D.centre_rate) * st.t[i]; });
      st.updates += 1;
      redraw();
    }));
    reset.addEventListener('click', core.guard(body, function () { resetScores(); redraw(); }));
    core.on('theme-changed', redraw);

    resetScores();
    draw();
    refreshMarks();
  });

  // ------------------------------------------------------------------ Lab 3C: the teacher as a slow average (ported Lab F)

  Labs.register('lab-3c-ema', function mount(body, core) {
    var ID = 'lab-3c-ema';
    var D = DEFAULTS.c;
    var COCO_STEPS = [D.steps[0], D.steps[1]];
    var st = { m: D.momentum.default, T: D.steps_default, cosine: D.cosine };

    var controls = core.el('div', { class: 'lab-controls' });
    var stage = core.el('div', { class: 'lab-stage' });
    var mS = slider(core, {
      id: ID + '-momentum', label: 'Momentum m', role: 'teacher',
      format: function (v) { return trimNum(core, v, 4); },
      min: D.momentum.min, max: D.momentum.max, step: D.momentum.step, value: st.m,
      hint: 'Our runs start at 0.9995, DINO at 0.996.' + factMark(['ema_ours_schedule', 'ema_dino_schedule'])
    });
    var steps = segmented(core, {
      id: ID + '-steps', label: 'Steps', value: String(st.T),
      options: D.steps.map(function (s) { return { value: String(s), text: core.fmt(s) }; }),
      hint: '462 ' + term('step', 'steps') + ' make one COCO ' + term('epoch') + ' at a ' + term('batch') + ' of 256 pictures; 4,620 make ' +
        'ten of them; 1,251 make one ImageNet epoch at DINO\'s batch of 1,024.' +
        factMark(['ours_steps_per_epoch', 'ours_global_batch', 'ours_warmup_steps', 'imagenet_steps_per_epoch', 'dino_release_batch'])
    });
    var dino = button(core, ID + '-dino', 'DINO setting');
    var ours = button(core, ID + '-ours', 'Our setting');
    var cos = toggle(core, { id: ID + '-cosine', label: 'Show our cosine schedule', checked: st.cosine });
    var cosHint = hint(core, 'The dashed curve raises m along a ' + term('cosine schedule', 'cosine') + ' from the slider\'s value to 1 over a ' +
      '20-epoch run of 9,240 steps. It is drawn for the COCO step counts only.' + factMark(['ours_epochs_pilot', 'ours_steps_20ep']));
    controls.appendChild(mS.root);
    controls.appendChild(steps.root);
    controls.appendChild(core.el('div', { class: 'control-group' }, [
      core.el('p', { class: 'control-group-title', text: 'Presets' }),
      core.el('div', { class: 'button-row' }, [dino, ours]),
      hint(core, 'DINO setting: m = 0.996 over one ImageNet epoch. Our setting: m = 0.9995 over one COCO epoch.' + toyMark())
    ]));
    controls.appendChild(core.el('div', { class: 'control-group' }, [cos.root, cosHint]));

    var chart1 = core.el('div', { class: 'stage-cell' });
    var facts = readoutList(core, [
      ['left', 'Step-0 teacher left', ID + '-left'], ['half', 'Half gone after'], ['window', 'Averaging window'], ['cosine', 'Cosine schedule']
    ]);
    var chart2 = core.el('div', { class: 'stage-cell' });
    var legend = core.el('ul', { class: 'legend' }, [
      core.el('li', { class: 'role-student', text: 'a student weight (made up)' }),
      core.el('li', { class: 'role-teacher', text: 'the matching teacher weight' })
    ]);
    stage.appendChild(chart1);
    stage.appendChild(facts.root);
    stage.appendChild(chart2);
    stage.appendChild(legend);
    body.appendChild(controls);
    body.appendChild(stage);

    // cosineMomentum(t, total, base): DINO's momentum schedule at step t, through Core when it exists.
    function cosineMomentum(t, total, base) {
      if (typeof core.cosineMomentum === 'function') return core.cosineMomentum(t, total, base, 1);
      return 1 - (1 - base) * (1 + Math.cos(Math.PI * t / total)) / 2;
    }

    // cosineShown(): whether the dashed cosine curve applies to the chosen step count.
    function cosineShown() {
      return st.cosine && COCO_STEPS.indexOf(st.T) >= 0;
    }

    // share(v): a share of the teacher written with enough digits to read (three decimals, more for small shares).
    function share(v) {
      if (v >= 0.1) return core.fmt(v, 3);
      if (v >= 1e-4) return core.fmt(v, clamp(1 - Math.floor(Math.log(v) / Math.LN10), 3, 6));
      return core.fmtSci ? core.fmtSci(v, 1) : core.fmt(v, 6);
    }

    // samplesOf(T): the steps at which the curves are drawn (at most D.samples + 1 points, always 0 and T).
    function samplesOf(T) {
      var n = Math.min(D.samples, T), xs = [];
      for (var i = 0; i <= n; i++) xs.push(Math.round(i * T / n));
      return xs;
    }

    // cosineShares(xs): the share of the step-0 teacher left at each step of xs under the cosine schedule.
    function cosineShares(xs) {
      var out = [], logSum = 0, j = 0;
      var last = xs[xs.length - 1];
      for (var t = 0; t <= last; t++) {
        while (j < xs.length && xs[j] === t) { out.push(Math.exp(logSum)); j++; }
        logSum += Math.log(cosineMomentum(t, D.cosine_total_steps, st.m));
      }
      return out;
    }

    // axes(svg, o): gridlines, tick labels and the x axis of a line chart; o = {W, H, L, R, T, B, xmax, sx, sy, yticks}.
    function axes(svg, o) {
      var grid = core.el('g', { class: 'grid' }), axis = core.el('g', { class: 'axis' });
      o.yticks.forEach(function (v) {
        var yy = o.sy(v);
        grid.appendChild(core.el('line', { x1: String(o.L), x2: String(o.W - o.R), y1: String(yy), y2: String(yy) }));
        svg.appendChild(svgText(core, o.L - 6, yy + 4, trimNum(core, v, 2), { 'text-anchor': 'end' }));
      });
      [0, 0.25, 0.5, 0.75, 1].forEach(function (f) {
        var t = Math.round(f * o.xmax), xx = o.sx(t);
        axis.appendChild(core.el('line', { x1: String(xx), x2: String(xx), y1: String(o.H - o.B), y2: String(o.H - o.B + 4) }));
        svg.appendChild(svgText(core, xx, o.H - o.B + 16, core.fmt(t), { 'text-anchor': 'middle' }));
      });
      axis.appendChild(core.el('line', { x1: String(o.L), x2: String(o.W - o.R), y1: String(o.H - o.B), y2: String(o.H - o.B) }));
      svg.insertBefore(grid, svg.firstChild);
      svg.appendChild(axis);
      svg.appendChild(svgText(core, o.W - o.R, o.H - 4, 'steps', { 'text-anchor': 'end' }));
    }

    // remainingChart(W): the share m^t of the step-0 teacher that is left, with a crosshair that follows the pointer.
    function remainingChart(W) {
      var H = 250, L = 46, R = 76, T = 30, B = 40;
      var pw = W - L - R, ph = H - T - B, Tn = st.T, m = st.m;
      var sx = function (t) { return L + pw * t / Tn; };
      var sy = function (v) { return T + ph * (1 - v); };
      var xs = samplesOf(Tn);
      var ys = xs.map(function (t) { return Math.pow(m, t); });
      var yc = cosineShown() ? cosineShares(xs) : null;
      var svg = core.el('svg', { class: 'chart', viewBox: '0 0 ' + W + ' ' + H, width: String(W), role: 'img', 'aria-label': 'Share of the step-0 teacher left after each of ' + Tn + ' steps at momentum ' + m });
      svg.appendChild(svgText(core, 0, 14, 'Share of the step-0 teacher left', { class: 'title' }));
      axes(svg, { W: W, H: H, L: L, R: R, T: T, B: B, xmax: Tn, sx: sx, sy: sy, yticks: [0, 0.25, 0.5, 0.75, 1] });
      if (yc) {
        svg.appendChild(core.el('polyline', { class: 'series', points: pointsOf(xs, yc, sx, sy), style: 'stroke-dasharray: 6 5' }));
      }
      var g = core.el('g', { class: 'role-teacher' });
      g.appendChild(core.el('polyline', { class: 'series', points: pointsOf(xs, ys, sx, sy) }));
      var endV = ys[ys.length - 1];
      g.appendChild(core.el('circle', { class: 'dot', cx: String(sx(Tn)), cy: String(sy(endV)), r: '4.5', style: 'stroke: var(--surface); stroke-width: 2' }));
      svg.appendChild(g);
      svg.appendChild(svgText(core, sx(Tn) + 8, sy(endV) + 4, share(endV), { class: 'title' }));
      if (yc) {
        var endC = yc[yc.length - 1];
        if (Math.abs(sy(endC) - sy(endV)) > 13) svg.appendChild(svgText(core, sx(Tn) + 8, sy(endC) + 4, share(endC)));
      }
      // crosshair
      var cross = core.el('g', { class: 'axis', visibility: 'hidden' });
      var cLine = core.el('line', { y1: String(T), y2: String(H - B) });
      var cText = svgText(core, 0, T + 12, '', { class: 'title' });
      cross.appendChild(cLine);
      cross.appendChild(cText);
      svg.appendChild(cross);
      svg.appendChild(core.el('rect', { x: String(L), y: String(T), width: String(pw), height: String(ph), fill: 'transparent', style: 'pointer-events: all' }));
      var onMove = core.guard(body, function (ev) {
        var b = svg.getBoundingClientRect();
        if (!b.width) return;
        var x = (ev.clientX - b.left) * W / b.width;
        var t = clamp(Math.round((x - L) / pw * Tn), 0, Tn);
        var text = 'step ' + core.fmt(t) + ': ' + share(Math.pow(m, t)) + ' left';
        if (yc) {
          var k = 0;
          while (k < xs.length - 1 && xs[k + 1] <= t) k++;
          text += ' (cosine near ' + share(yc[k]) + ')';
        }
        var xx = sx(t);
        cLine.setAttribute('x1', String(xx));
        cLine.setAttribute('x2', String(xx));
        cText.textContent = text;
        cText.setAttribute('x', String(xx > L + pw / 2 ? xx - 6 : xx + 6));
        cText.setAttribute('text-anchor', xx > L + pw / 2 ? 'end' : 'start');
        cross.setAttribute('visibility', 'visible');
      });
      svg.addEventListener('pointermove', onMove);
      svg.addEventListener('pointerdown', onMove);
      svg.addEventListener('pointerleave', function () { cross.setAttribute('visibility', 'hidden'); });
      return svg;
    }

    // studentPath(Tn): the made-up student weight: a rise from 0 towards 1 over the shown steps plus slowly wandering noise (seeded).
    function studentPath(Tn) {
      var r = core.rng(D.weight_seed);
      var s = new Float64Array(Tn + 1), noise = 0, phi = D.weight_memory, kick = D.weight_noise * Math.sqrt(1 - phi * phi);
      for (var t = 0; t <= Tn; t++) {
        if (t > 0) noise = phi * noise + kick * r.normal();
        s[t] = 1 - Math.exp(-D.weight_rate * t / Tn) + (t > 0 ? noise : 0);
      }
      return s;
    }

    // weightChart(W): the made-up student weight and the teacher weight that follows it by the EMA rule (Core.ema).
    function weightChart(W) {
      var H = 210, L = 46, R = 76, T = 30, B = 40;
      var pw = W - L - R, ph = H - T - B, Tn = st.T, m = st.m;
      var s = studentPath(Tn);
      var th = new Float64Array(Tn + 1);
      th[0] = s[0];
      for (var t = 1; t <= Tn; t++) th[t] = core.ema(th[t - 1], s[t], m);
      var lo = 0, hi = 1;
      for (var i = 0; i <= Tn; i++) { lo = Math.min(lo, s[i], th[i]); hi = Math.max(hi, s[i], th[i]); }
      var sx = function (tt) { return L + pw * tt / Tn; };
      var sy = function (v) { return T + ph * (1 - (v - lo) / (hi - lo)); };
      var xs = samplesOf(Tn);
      var svg = core.el('svg', { class: 'chart', viewBox: '0 0 ' + W + ' ' + H, width: String(W), role: 'img', 'aria-label': 'A made-up student weight and the teacher weight that follows it' });
      svg.appendChild(svgText(core, 0, 14, 'One made-up weight over the steps (toy)', { class: 'title' }));
      axes(svg, { W: W, H: H, L: L, R: R, T: T, B: B, xmax: Tn, sx: sx, sy: sy, yticks: [0, 0.5, 1] });
      var gs = core.el('g', { class: 'role-student' });
      gs.appendChild(core.el('polyline', { class: 'series', points: pointsOf(xs, xs.map(function (x) { return s[x]; }), sx, sy) }));
      var gt = core.el('g', { class: 'role-teacher' });
      gt.appendChild(core.el('polyline', { class: 'series', points: pointsOf(xs, xs.map(function (x) { return th[x]; }), sx, sy) }));
      svg.appendChild(gs);
      svg.appendChild(gt);
      var ys = sy(s[Tn]), yt = sy(th[Tn]);
      if (Math.abs(ys - yt) < 13) { var mid = (ys + yt) / 2; ys = mid - 7; yt = mid + 7; }
      svg.appendChild(svgText(core, sx(Tn) + 8, ys + 4, 'student'));
      svg.appendChild(svgText(core, sx(Tn) + 8, yt + 4, 'teacher'));
      return svg;
    }

    var drawnWidth = 0;

    // draw(): both charts and the readouts.
    function draw() {
      var m = st.m, Tn = st.T;
      drawnWidth = stageWidth(stage, 300, 640, 640);
      clearNode(chart1);
      chart1.appendChild(remainingChart(drawnWidth));
      clearNode(chart2);
      chart2.appendChild(weightChart(drawnWidth));
      facts.set('left', trimNum(core, m, 4) + '^' + String(Tn) + ' = ' + share(Math.pow(m, Tn)));
      facts.set('half', core.fmt(Math.log(0.5) / Math.log(m), 0) + ' steps (when m^t, m multiplied by itself once per step for t steps, reaches 0.5)');
      facts.set('window', 'roughly the last 1 / (1 ' + CH.minus + ' m) = ' + core.fmt(1 / (1 - m), 0) + ' steps');
      if (cosineShown()) {
        var xs = samplesOf(Tn), yc = cosineShares(xs);
        facts.set('cosine', share(yc[yc.length - 1]) + ' left after ' + core.fmt(Tn) + ' steps of a ' + core.fmt(D.cosine_total_steps) + '-step run');
      } else {
        facts.set('cosine', st.cosine ? 'drawn for the COCO step counts only' : 'switched off');
      }
      cos.input.disabled = COCO_STEPS.indexOf(Tn) < 0;
    }

    var redraw = later(body, core, draw);

    mS.input.addEventListener('input', core.guard(body, function () { st.m = mS.value(); mS.show(); redraw(); }));
    steps.onChange(core.guard(body, function () { st.T = Number(steps.value()); redraw(); }));
    dino.addEventListener('click', core.guard(body, function () {
      st.m = D.dino_preset.momentum; st.T = D.dino_preset.steps;
      mS.set(st.m); steps.set(String(st.T)); redraw();
    }));
    ours.addEventListener('click', core.guard(body, function () {
      st.m = D.ours_preset.momentum; st.T = D.ours_preset.steps;
      mS.set(st.m); steps.set(String(st.T)); redraw();
    }));
    cos.input.addEventListener('change', core.guard(body, function () { st.cosine = cos.input.checked; redraw(); }));
    if (typeof root.addEventListener === 'function') {
      root.addEventListener('resize', core.guard(body, function () { if (stageWidth(stage, 300, 640, 640) !== drawnWidth) redraw(); }));
    }
    core.on('theme-changed', redraw);

    draw();
    refreshMarks();
  });

  // ------------------------------------------------------------------ Lab 3D: the 18 crop pairs (new)

  Labs.register('lab-3d-loss-pairs', function mount(body, core) {
    var ID = 'lab-3d-loss-pairs';
    var D = DEFAULTS.d;
    var K = D.prototypes;
    var st = {
      tauT: D.teacher_temperature.default, tauS: D.student_temperature.default, locals: D.locals.default,
      spread: D.spread.default, selected: D.selected.slice(), student: null, steps: 0
    };

    // resetStudent(): the student's scores of every crop at the current view difference, before any learning step.
    function resetStudent() {
      st.student = spreadScores(st.spread, Object.keys(D.student));
      st.steps = 0;
    }

    var controls = core.el('div', { class: 'lab-controls' });
    var stage = core.el('div', { class: 'lab-stage' });
    var tT = slider(core, {
      id: ID + '-teacher-temp', label: 'Teacher temperature', role: 'teacher', digits: 2,
      min: D.teacher_temperature.min, max: D.teacher_temperature.max, step: D.teacher_temperature.step, value: st.tauT,
      hint: 'The teacher\'s answers are sharpened by this temperature; our runs use 0.04.' + factMark(['temp_teacher'])
    });
    var sT = slider(core, {
      id: ID + '-student-temp', label: 'Student temperature', role: 'student', digits: 2,
      min: D.student_temperature.min, max: D.student_temperature.max, step: D.student_temperature.step, value: st.tauS,
      hint: 'The student\'s scores are divided by 0.1 in DINO and our runs.' + factMark(['temp_student'])
    });
    var locS = slider(core, {
      id: ID + '-locals', label: 'Local crops', role: 'student', digits: 0,
      min: D.locals.min, max: D.locals.max, step: D.locals.step, value: st.locals,
      hint: 'Our runs cut 8 local crops (18 pairs); the released DINO run cut 10 (22 pairs).' +
        factMark(['crop_local_count', 'loss_global_pairs', 'dino_release_local_crops', 'loss_global_pairs_dino_release'])
    });
    var spS = slider(core, {
      id: ID + '-spread', label: 'How different the views are', digits: 2,
      min: D.spread.min, max: D.spread.max, step: D.spread.step, value: st.spread,
      hint: 'At 0 every crop gives the student the same scores; at 2 every difference between the crops doubles. Moving it resets the student.' + toyMark()
    });
    var learn = button(core, ID + '-learn', 'Student learns one step', true);
    var reset = button(core, ID + '-reset', 'Reset');
    controls.appendChild(tT.root);
    controls.appendChild(sT.root);
    controls.appendChild(locS.root);
    controls.appendChild(spS.root);
    controls.appendChild(core.el('div', { class: 'button-row' }, [learn, reset]));
    controls.appendChild(hint(core, 'A learning step moves each student crop\'s scores against the mean gradient of its pairs, by 0.01 ' + CH.times +
      ' (student probability ' + CH.minus + ' teacher probability) / student temperature. The teacher\'s scores stay as they are: the ' +
      term('stop-gradient') + '.' + factMark(['loss_stop_gradient'])));
    var facts = readoutList(core, [
      ['pairs', 'Pairs', ID + '-pairs'], ['mean', 'Mean over the pairs: the image\'s loss', ID + '-mean'],
      ['largest', 'Largest pair'], ['smallest', 'Smallest pair'], ['local', 'Local-to-global pairs'], ['steps', 'Learning steps so far']
    ]);

    // the grid keeps its drawn size; on a narrow screen its cell scrolls sideways, as the tables do
    var gridCell = core.el('div', { class: 'stage-cell scroll-x' });
    var gridNote = core.el('p', { class: 'stage-label', text: 'Rows: the teacher\'s two global crops. Columns: the student\'s crops. A cell is one pair; its number is the pair\'s cross-entropy in nats. Click a cell, or move with the arrow keys, to work it out below.' });
    var workTitle = core.el('p', { class: 'readout', id: ID + '-work-title' });
    var workWrap = core.el('div', { class: 'scroll-x' });
    var workNote = core.el('p', { class: 'control-hint', id: ID + '-work-note' });
    stage.appendChild(gridCell);
    stage.appendChild(gridNote);
    stage.appendChild(workTitle);
    stage.appendChild(workWrap);
    stage.appendChild(workNote);
    stage.appendChild(facts.root);
    body.appendChild(controls);
    body.appendChild(stage);

    // names(): the student's crops in play.
    function names() { return pairCrops(st.locals); }

    // cellId(t, s): the id of the grid cell of teacher crop t and student crop s.
    function cellId(t, s) { return ID + '-cell-' + t.toLowerCase() + '-' + s.toLowerCase(); }

    // kindOf(name): 'global' or 'local'.
    function kindOf(name) { return name.charAt(0) === 'G' ? 'global' : 'local'; }

    // drawGrid(loss): the pairs as an SVG grid, the skipped cells crossed, the selected cell outlined.
    function drawGrid(loss) {
      var ns = names();
      var cw = 50, ch = 40, L = 96, T = 30, W = L + ns.length * cw + 4, H = T + 2 * ch + 6;
      var values = loss.pairs.map(function (p) { return p.H; });
      var lo = Math.min.apply(null, values), hi = Math.max.apply(null, values);
      var svg = core.el('svg', { class: 'chart no-scale', viewBox: '0 0 ' + W + ' ' + H, width: String(W), height: String(H), role: 'group', 'aria-label': 'The pairs of DINO\'s loss for one image', id: ID + '-grid' });
      ns.forEach(function (s, j) {
        svg.appendChild(svgText(core, L + j * cw + cw / 2, T - 10, s, { 'text-anchor': 'middle', class: 'title', style: 'fill: var(--student)' }));
      });
      ['G1', 'G2'].forEach(function (t, i) {
        svg.appendChild(svgText(core, L - 8, T + i * ch + ch / 2 + 4, 'Teacher ' + t, { 'text-anchor': 'end', class: 'title', style: 'fill: var(--teacher)' }));
        ns.forEach(function (s, j) {
          var x = L + j * cw + 2, y = T + i * ch + 2, w = cw - 4, h = ch - 4;
          var sel = st.selected[0] === t && st.selected[1] === s;
          var g = core.el('g', { id: cellId(t, s), 'data-teacher': t, 'data-student': s });
          if (s === t) {
            g.appendChild(core.el('rect', { x: String(x), y: String(y), width: String(w), height: String(h), rx: '3', class: 'area role-ignored', style: 'fill-opacity: 0.5' }));
            g.appendChild(core.el('line', { x1: String(x + 12), y1: String(y + 8), x2: String(x + w - 12), y2: String(y + h - 8), style: 'stroke: var(--muted); stroke-width: 1.5' }));
            g.appendChild(core.el('line', { x1: String(x + w - 12), y1: String(y + 8), x2: String(x + 12), y2: String(y + h - 8), style: 'stroke: var(--muted); stroke-width: 1.5' }));
            g.appendChild(core.el('svg:title', null, 'Teacher ' + t + ' and student ' + s + ': the same crop, skipped'));
          } else {
            var pair = loss.pairs.filter(function (p) { return p.teacher === t && p.student === s; })[0];
            var f = hi > lo ? (pair.H - lo) / (hi - lo) : 0.5;
            g.setAttribute('tabindex', '0');
            g.setAttribute('role', 'button');
            g.setAttribute('aria-pressed', sel ? 'true' : 'false');
            g.setAttribute('aria-label', 'Teacher ' + t + ', student ' + s + ': cross-entropy ' + core.fmt(pair.H, 3) + ' nats');
            g.setAttribute('style', 'cursor: pointer');
            g.appendChild(core.el('rect', { x: String(x), y: String(y), width: String(w), height: String(h), rx: '3', style: 'fill: var(--student); fill-opacity: ' + (0.1 + 0.5 * f).toFixed(3) + (sel ? '; stroke: var(--ink); stroke-width: 2.5' : '') }));
            g.appendChild(svgText(core, x + w / 2, y + h / 2 + 4, core.fmt(pair.H, 2), { 'text-anchor': 'middle', style: 'fill: var(--ink)' }));
            g.appendChild(core.el('svg:title', null, 'Teacher ' + t + ', student ' + s + ': ' + core.fmt(pair.H, 3) + ' nats'));
          }
          svg.appendChild(g);
        });
      });
      svg.addEventListener('click', core.guard(body, function (ev) {
        var node = ev.target;
        while (node && node !== svg && !(node.getAttribute && node.getAttribute('data-student'))) node = node.parentNode;
        if (!node || node === svg) return;
        choose(node.getAttribute('data-teacher'), node.getAttribute('data-student'));
      }));
      svg.addEventListener('keydown', core.guard(body, function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') {
          var node = ev.target;
          if (node && node.getAttribute && node.getAttribute('data-student')) choose(node.getAttribute('data-teacher'), node.getAttribute('data-student'), true);
          ev.preventDefault();
          return;
        }
        var moves = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0] };
        var mv = moves[ev.key];
        if (!mv) return;
        ev.preventDefault();
        var ns2 = names();
        var i = clamp((st.selected[0] === 'G1' ? 0 : 1) + mv[0], 0, 1);
        var j = clamp(ns2.indexOf(st.selected[1]) + mv[1], 0, ns2.length - 1);
        var tt = i === 0 ? 'G1' : 'G2';
        if (ns2[j] === tt) {
          // the skipped cell: step over it in the direction of the move, or back when the grid ends there
          var dir = mv[1] !== 0 ? mv[1] : 1;
          j = j + dir >= 0 && j + dir < ns2.length ? j + dir : j - dir;
        }
        if (ns2[j] === tt) return;
        choose(tt, ns2[j], true);
      }));
      clearNode(gridCell);
      gridCell.appendChild(svg);
    }

    // choose(t, s, focus): select the pair of teacher crop t and student crop s and draw it.
    function choose(t, s, focus) {
      if (!t || !s || t === s) return;
      st.selected = [t, s];
      draw();
      if (focus) {
        var cell = root.document && root.document.getElementById ? root.document.getElementById(cellId(t, s)) : null;
        if (cell && typeof cell.focus === 'function') cell.focus();
      }
    }

    // drawWork(): the selected pair worked out, one column per prototype.
    function drawWork() {
      var t = st.selected[0], s = st.selected[1];
      var tab = pairTable(D.teacher[t], st.student[s], st.tauT, st.tauS);
      var head = [core.el('th', { scope: 'col', text: 'prototype' })];
      for (var i = 0; i < K; i++) head.push(core.el('th', { scope: 'col', class: 'num', text: String(i + 1) }));
      head.push(core.el('th', { scope: 'col', class: 'num', text: 'sum' }));
      // row(label, values, digits, total, role): one row of the table.
      function row(label, values, digits, total, role) {
        var cells = [core.el('th', { scope: 'row', text: label, class: role ? 'text-role role-' + role : null, style: 'white-space: nowrap' })];
        values.forEach(function (v) { cells.push(core.el('td', { class: 'num', text: core.fmt(v, digits) })); });
        cells.push(core.el('td', { class: 'num', html: total || '' }));
        return core.el('tr', null, cells);
      }
      clearNode(workWrap);
      workWrap.appendChild(core.el('table', { id: ID + '-work' }, [
        core.el('thead', null, core.el('tr', null, head)),
        core.el('tbody', null, [
          row('teacher ' + t + ' score', D.teacher[t], 2, '', 'teacher'),
          row('teacher probability, ' + CH.tau + ' = ' + core.fmt(st.tauT, 2), tab.pt, 3, '', 'teacher'),
          row('student ' + s + ' score', st.student[s], 3, '', 'student'),
          row('student probability, ' + CH.tau + ' = ' + core.fmt(st.tauS, 2), tab.ps, 3, '', 'student'),
          row('log of the student probability', tab.logs, 3, ''),
          row('term: ' + CH.minus + '(teacher probability) ' + CH.times + ' log', tab.terms, 3, '<strong>H = ' + core.fmt(tab.H, 3) + '</strong>'),
          row('gradient on the student score', tab.grad, 2, '', 'student')
        ])
      ]));
      var kind = kindOf(s);
      workTitle.textContent = 'Teacher ' + t + ' (global, ' + DEFAULTS.a.global_side + ' px) against student ' + s + ' (' + kind + ', ' +
        (kind === 'global' ? DEFAULTS.a.global_side : DEFAULTS.a.local_side) + ' px): H = ' + core.fmt(tab.H, 3) + ' nats';
      workNote.innerHTML = (kind === 'local'
        ? 'A local crop answers for a global crop: the local-to-global pairs that DINO wants. '
        : 'Both crops are global: the student\'s view of one large crop against the teacher\'s view of the other. ') +
        'H can never fall below the teacher\'s own entropy, here ' + core.fmt(tab.h, 3) + ' nats; the gap, ' + core.fmt(tab.kl, 3) +
        ' nats, is the ' + term('kl divergence', 'KL divergence') + '.' + toyMark();
      refreshMarks();
    }

    // draw(): the grid, the readouts and the worked pair.
    function draw() {
      var ns = names();
      if (ns.indexOf(st.selected[1]) < 0) st.selected = ['G1', 'G2'];
      var loss = pairsLoss(D.teacher, st.student, ns, st.tauT, st.tauS);
      drawGrid(loss);
      var sorted = loss.pairs.slice().sort(function (a, b) { return b.H - a.H; });
      var nPairs = loss.pairs.length;
      facts.set('pairs', '2 teacher crops ' + CH.times + ' ' + (ns.length - 1) + ' other student crops = ' + nPairs);
      facts.set('mean', core.fmt(loss.mean, 3) + ' nats');
      facts.set('largest', 'teacher ' + sorted[0].teacher + ', student ' + sorted[0].student + ': ' + core.fmt(sorted[0].H, 3));
      facts.set('smallest', 'teacher ' + sorted[nPairs - 1].teacher + ', student ' + sorted[nPairs - 1].student + ': ' + core.fmt(sorted[nPairs - 1].H, 3));
      facts.set('local', String(loss.pairs.filter(function (p) { return kindOf(p.student) === 'local'; }).length) + ' of ' + nPairs);
      facts.set('steps', String(st.steps));
      drawWork();
    }

    var redraw = later(body, core, draw);

    tT.input.addEventListener('input', core.guard(body, function () { st.tauT = tT.value(); tT.show(); redraw(); }));
    sT.input.addEventListener('input', core.guard(body, function () { st.tauS = sT.value(); sT.show(); redraw(); }));
    locS.input.addEventListener('input', core.guard(body, function () { st.locals = Math.round(locS.value()); locS.show(); redraw(); }));
    spS.input.addEventListener('input', core.guard(body, function () { st.spread = spS.value(); spS.show(); resetStudent(); redraw(); }));
    learn.addEventListener('click', core.guard(body, function () {
      st.student = Object.assign({}, st.student, pairsStep(D.teacher, st.student, names(), st.tauT, st.tauS, D.learning_rate));
      st.steps += 1;
      redraw();
    }));
    reset.addEventListener('click', core.guard(body, function () { resetStudent(); redraw(); }));
    core.on('theme-changed', redraw);

    resetStudent();
    draw();
    refreshMarks();
  });

  // ------------------------------------------------------------------ Lab 3E: collapse and how DINO avoids it (new)

  Labs.register('lab-3e-collapse', function mount(body, core) {
    var ID = 'lab-3e-collapse';
    var D = DEFAULTS.e;
    var LN3 = Math.log(3);
    var st = { centring: true, sharpening: true, seed: D.seed, run: null, film: null };

    var controls = core.el('div', { class: 'lab-controls' });
    var stage = core.el('div', { class: 'lab-stage' });
    var cen = toggle(core, { id: ID + '-centring', label: 'Centring', checked: st.centring, role: 'teacher' });
    var sha = toggle(core, { id: ID + '-sharpening', label: 'Sharpening', checked: st.sharpening, role: 'teacher' });
    controls.appendChild(core.el('div', { class: 'control-group' }, [
      core.el('p', { class: 'control-group-title', text: 'The teacher\'s two tricks' }),
      core.el('div', { class: 'toggle-row' }, [cen.root, sha.root]),
      hint(core, 'Sharpening on: the teacher divides by 0.04, the student by 0.1. Off: both divide by 0.1. Centring takes a running mean ' +
        'of the teacher\'s scores, rate 0.9, off the teacher\'s scores.' + toyMark())
    ]));
    var again = button(core, ID + '-new', 'New start');
    var both = button(core, ID + '-dino', 'DINO: both on', true);
    controls.appendChild(core.el('div', { class: 'button-row' }, [both, again]));
    controls.appendChild(hint(core, 'DINO names two forms of ' + term('collapse') + ': every output the same along all dimensions, or one ' +
      'dimension dominating. Without centring the ' + term('entropy') + ' of the teacher goes to 0; without sharpening it goes to its largest value.' +
      factMark(['why_dino_collapse_forms', 'why_dino_collapse_entropy'])));
    var facts = readoutList(core, [
      ['setting', 'Setting', ID + '-setting'], ['verdict', 'At the end', ID + '-verdict'], ['winners', 'Each picture\'s winner'],
      ['entropy', 'Teacher entropy at the end'], ['kl', 'KL from teacher to student at the end']
    ]);
    var host = core.el('div', { class: 'p3-film', id: ID + '-film' });
    stage.appendChild(host);
    stage.appendChild(facts.root);
    body.appendChild(controls);
    body.appendChild(stage);

    // settingName(): the switches in words.
    function settingName() {
      if (st.centring && st.sharpening) return 'centring and sharpening on (DINO)';
      if (st.sharpening) return 'centring off, sharpening on';
      if (st.centring) return 'centring on, sharpening off';
      return 'both off';
    }

    // simulate(): the run for the current switches.
    function simulate() {
      st.run = collapseRun(Object.assign({}, D, { centring: st.centring, sharpening: st.sharpening, seed: st.seed }), core.rng);
    }

    // verdictText(v): the end of the run in words.
    function verdictText(v) {
      if (v.kind === 'one') return 'collapse: every picture gets the same answer, led by prototype ' + (v.prototype + 1) + ' with ' + core.fmt(v.mean[v.prototype], 2) + ' of the weight';
      if (v.kind === 'flat') return 'collapse to the flat answer: every picture gets about a third on each prototype';
      return 'no collapse: the pictures keep different answers';
    }

    // fillFacts(): the readouts of the end of the run.
    function fillFacts() {
      var v = collapseVerdict(st.run);
      facts.set('setting', settingName() + '; start ' + st.seed);
      facts.set('verdict', verdictText(v));
      facts.set('winners', D.names.map(function (n, i) { return n + ' ' + CH.arrow + ' ' + (v.winners[i] + 1); }).join(', '));
      facts.set('entropy', core.fmt(v.H, 3) + ' of at most ' + core.fmt(LN3, 3) + ' nats');
      facts.set('kl', core.fmt(v.KL, 3) + ' nats');
    }

    // corner(j): the corner of prototype j in the triangle (prototype 1 at the top).
    var TRI = [[150, 46], [40, 240], [260, 240]];
    // toXY(p): the point of a distribution p in the triangle (barycentric coordinates).
    function toXY(p) {
      return [p[0] * TRI[0][0] + p[1] * TRI[1][0] + p[2] * TRI[2][0], p[0] * TRI[0][1] + p[1] * TRI[1][1] + p[2] * TRI[2][1]];
    }

    // drawStep(stageEl, step): the triangle with every picture's answers and trail up to `step`, and the two curves.
    function drawStep(stageEl, step) {
      var run = st.run;
      var s = clamp(Math.round(step), 0, run.T.length - 1);
      var W = 600, H = 300;
      var svg = root.Scenes && typeof root.Scenes.surface === 'function'
        ? root.Scenes.surface(stageEl, 'svg', { class: 'chart', viewBox: '0 0 ' + W + ' ' + H, width: String(W), role: 'img' })
        : null;
      if (!svg) {
        svg = core.el('svg', { class: 'chart', viewBox: '0 0 ' + W + ' ' + H, width: String(W), role: 'img' });
        clearNode(stageEl);
        stageEl.appendChild(svg);
      }
      svg.setAttribute('aria-label', 'Step ' + s + ' of ' + D.steps + ': the four pictures\' answers in the triangle of three prototypes, and the teacher\'s entropy and KL over the steps');
      clearNode(svg);
      // the triangle
      svg.appendChild(svgText(core, 0, 14, 'The answers of four pictures, step ' + s, { class: 'title' }));
      svg.appendChild(core.el('polygon', { points: TRI.map(function (p) { return p[0] + ',' + p[1]; }).join(' '), style: 'fill: var(--sunken); stroke: var(--line)' }));
      var labels = [['prototype 1', 140, 52, 'end'], ['prototype 2', 40, 272, 'middle'], ['prototype 3', 260, 272, 'middle']];
      labels.forEach(function (l) { svg.appendChild(svgText(core, l[1], l[2], l[0], { 'text-anchor': l[3] })); });
      var mid = toXY([1 / 3, 1 / 3, 1 / 3]);
      svg.appendChild(core.el('circle', { cx: String(mid[0]), cy: String(mid[1]), r: '3', style: 'fill: var(--muted)' }));
      svg.appendChild(svgText(core, mid[0], mid[1] + 15, 'flat', { 'text-anchor': 'middle' }));
      // trails, teacher answers (blue dots) and student answers (green rings)
      for (var n = 0; n < D.names.length; n++) {
        var pts = [];
        for (var k = 0; k <= s; k += D.trail_every) pts.push(toXY(run.T[k][n]));
        pts.push(toXY(run.T[s][n]));
        svg.appendChild(core.el('polyline', { class: 'series role-teacher', points: pts.map(function (p) { return (Math.round(p[0] * 10) / 10) + ',' + (Math.round(p[1] * 10) / 10); }).join(' '), style: 'stroke-opacity: 0.35; stroke-width: 1.5' }));
      }
      for (n = 0; n < D.names.length; n++) {
        var ps = toXY(run.S[s][n]);
        svg.appendChild(core.el('circle', { cx: String(Math.round(ps[0] * 10) / 10), cy: String(Math.round(ps[1] * 10) / 10), r: '8', style: 'fill: none; stroke: var(--student); stroke-width: 2' }));
      }
      // each picture's letter sits 15 px out from the triangle's middle, and moves 10 px right while another letter is there
      var placed = [];
      var taken = function (x, y) { return placed.some(function (p) { return Math.abs(p[0] - x) < 10 && Math.abs(p[1] - y) < 11; }); };
      for (n = 0; n < D.names.length; n++) {
        var pt = toXY(run.T[s][n]);
        svg.appendChild(core.el('circle', { class: 'dot role-teacher', cx: String(Math.round(pt[0] * 10) / 10), cy: String(Math.round(pt[1] * 10) / 10), r: '5' }));
        var dx = pt[0] - mid[0], dy = pt[1] - mid[1], dl = Math.sqrt(dx * dx + dy * dy);
        var lx = pt[0] + (dl > 1 ? 15 * dx / dl : 11), ly = pt[1] + (dl > 1 ? 15 * dy / dl : -11) + 4;
        for (var tries = 0; tries < 4 && taken(lx, ly); tries++) lx += 10;
        placed.push([lx, ly]);
        svg.appendChild(svgText(core, Math.round(lx * 10) / 10, Math.round(ly * 10) / 10, D.names[n], { class: 'title', 'text-anchor': 'middle' }));
      }
      // the two curves
      curve(svg, run.H, s, 330, 30, 260, 110, 'Teacher entropy (nats)', LN3, 'teacher');
      curve(svg, run.KL, s, 330, 172, 260, 100, 'KL from teacher to student (nats)', Math.max(0.05, Math.max.apply(null, run.KL)), null);
    }

    // curve(svg, values, s, x0, y0, w, h, title, top, role): a small line chart of values over the steps, marked at step s.
    function curve(svg, values, s, x0, y0, w, h, title, top, role) {
      var L = x0 + 34, T = y0 + 16, pw = w - 40, ph = h - 34;
      var sx = function (t) { return L + pw * t / (values.length - 1); };
      var sy = function (v) { return T + ph * (1 - clamp(v / top, 0, 1)); };
      svg.appendChild(svgText(core, x0, y0 + 8, title, { class: 'title' }));
      var g = core.el('g', { class: 'grid' });
      [0, top].forEach(function (v) { g.appendChild(core.el('line', { x1: String(L), x2: String(L + pw), y1: String(sy(v)), y2: String(sy(v)) })); });
      svg.appendChild(g);
      svg.appendChild(svgText(core, L - 4, sy(0) + 4, '0', { 'text-anchor': 'end' }));
      svg.appendChild(svgText(core, L - 4, sy(top) + 4, trimNum(core, top, 2), { 'text-anchor': 'end' }));
      svg.appendChild(svgText(core, L + pw, T + ph + 14, String(values.length - 1), { 'text-anchor': 'end' }));
      svg.appendChild(svgText(core, L, T + ph + 14, 'step 0', { 'text-anchor': 'start' }));
      var xs = [], ys = [];
      for (var t = 0; t < values.length; t += 2) { xs.push(t); ys.push(values[t]); }
      svg.appendChild(core.el('polyline', { class: ['series', role ? 'role-' + role : null].filter(Boolean).join(' '), points: pointsOf(xs, ys, sx, sy), style: 'stroke-opacity: 0.35' }));
      var xs2 = [], ys2 = [];
      for (t = 0; t <= s; t += 2) { xs2.push(t); ys2.push(values[t]); }
      xs2.push(s);
      ys2.push(values[s]);
      svg.appendChild(core.el('polyline', { class: ['series', role ? 'role-' + role : null].filter(Boolean).join(' '), points: pointsOf(xs2, ys2, sx, sy) }));
      svg.appendChild(core.el('line', { x1: String(sx(s)), x2: String(sx(s)), y1: String(T), y2: String(T + ph), style: 'stroke: var(--muted); stroke-dasharray: 3 3' }));
      svg.appendChild(svgText(core, Math.min(sx(s) + 4, L + pw - 30), T + 10, trimNum(core, values[s], 3), { class: 'title' }));
    }

    // usual(v): whether the run v took the course its setting takes on most starts (tests/smoke_p3.js sweeps the starts 2
    // to 101): both tricks on, no collapse with the pictures on at least two prototypes; centring on and sharpening off,
    // the flat answer; centring off, one prototype (on most starts, not on all of them when sharpening is on).
    function usual(v) {
      if (st.centring && st.sharpening) return v.kind === 'none' && v.winners.filter(function (w, i, all) { return all.indexOf(w) === i; }).length >= 2;
      if (st.centring) return v.kind === 'flat';
      return v.kind === 'one';
    }

    // phaseText(a, b): the copy of the stop that runs from step a to step b; the run's own verdict decides what it says.
    function phaseText(a, b) {
      var run = st.run;
      var v = collapseVerdict(run);
      var head = '<p>Steps ' + a + ' to ' + b + '. At step ' + b + ' the teacher\'s entropy is ' + core.fmt(run.H[b], 3) + ' nats (the flat answer would be ' +
        core.fmt(LN3, 3) + ') and its KL to the student ' + core.fmt(run.KL[b], 3) + ' nats.' + toyMark() + '</p>';
      var watch;
      if (!usual(v)) watch = 'On this start the run does not take the usual course of this setting: after ' + D.steps + ' steps, ' + verdictText(v) + '. The toy is small, and its outcome depends on its start; press New start for another.';
      else if (st.centring && st.sharpening) watch = 'Watch the blue dots spread out from prototype 1: the centre takes the shared lead off, and the sharp teacher pushes the pictures apart, towards different corners; with four pictures and three corners, at least two of them share one.';
      else if (st.sharpening) watch = 'Watch the blue dots run into prototype 1: nothing takes the shared lead off, and the sharp teacher turns it into a certainty for every picture.';
      else if (st.centring) watch = 'Watch the blue dots drift to the middle: the centre takes the lead off, and a teacher as soft as the student never asks for anything sharper, so the weight decay shrinks every difference.';
      else watch = 'Watch the blue dots stay together near prototype 1: the student only copies a teacher that says the same for every picture.';
      return head + '<p>' + watch + '</p>';
    }

    // endText(): the copy of the last stop.
    function endText() {
      var v = collapseVerdict(st.run);
      var lead = '<p>After ' + D.steps + ' steps: ' + verdictText(v) + '. The teacher\'s entropy is ' + core.fmt(v.H, 3) + ' nats and its KL to the student ' +
        core.fmt(v.KL, 3) + '.' + toyMark() + '</p>';
      var why;
      if (v.kind === 'one') why = 'This is the first form of collapse: one dimension dominates, the entropy is near 0, and the KL is near 0 because the student copies a teacher that no longer looks at the picture.';
      else if (v.kind === 'flat') why = 'This is the second form of collapse: the output is uniform along all dimensions, the entropy is near its largest value, and the KL is near 0.';
      else if (st.centring && st.sharpening) why = 'Both forms are avoided: the entropy stays between the two ends and the KL stays above 0, as DINO\'s collapse study reports for its runs with both operations.';
      else why = 'Neither form appears on this start, although a trick is off: the toy is small, and its outcome depends on its start; on most starts this setting collapses.';
      return lead + '<p>' + why + ' Switch the tricks on and off and press play again.</p>';
    }

    // stops(): the film of the run: the start, four phases, the end.
    function stops() {
      var list = [{
        id: 'start', title: 'Step 0: the starting network', duration: 3,
        explain: '<p>Four pictures, A to D, each a point of a plane, go through a small network with three prototypes; its ' +
          'answer for a picture is a point of the triangle. A corner means one prototype takes everything; the middle is the ' +
          'flat answer. The starting network slightly favours prototype 1 for every picture: the lazy answer that collapse would keep. ' +
          'Blue dots are the teacher\'s answers, green rings the student\'s.' + toyMark() + '</p>',
        still: function (stageEl) { drawStep(stageEl, 0); }
      }];
      for (var i = 1; i < D.stops.length; i++) {
        (function (a, b) {
          list.push({
            id: 'steps-' + a + '-' + b, title: 'Steps ' + a + ' to ' + b, duration: 4,
            explain: phaseText(a, b),
            still: function (stageEl) { drawStep(stageEl, b); },
            draw: function (stageEl, state, t) { drawStep(stageEl, a + (b - a) * t); }
          });
        })(D.stops[i - 1], D.stops[i]);
      }
      list.push({
        id: 'end', title: 'What happened', duration: 4,
        explain: endText(),
        still: function (stageEl) { drawStep(stageEl, D.steps); }
      });
      return list;
    }

    // build(): run the toy and make its film, resting on the last stop.
    function build() {
      simulate();
      fillFacts();
      if (st.film && typeof st.film.destroy === 'function') st.film.destroy();
      st.film = null;
      clearNode(host);
      if (root.Scenes && typeof root.Scenes.create === 'function') {
        st.film = root.Scenes.create(host, { stops: stops(), state: {}, label: 'Collapse toy, ' + settingName() });
        st.film.goTo(D.stops.length);
        // The film opens on its last stop, a still. Play from there would hold that still for its 4 seconds and end, so
        // Play pressed on that resting frame runs the film from its first stop instead (one tick later, outside the
        // engine's own play call).
        var film = st.film;
        film.onChange(function (info) {
          if (info.reason !== 'play' || info.index !== info.count - 1 || info.t !== 0) return;
          root.setTimeout(function () {
            if (st.film === film && film.isPlaying() && film.index() === info.count - 1) { film.goTo(0); film.play(); }
          }, 0);
        });
      } else {
        var still = core.el('div', { class: 'scene-stage' });
        host.appendChild(still);
        drawStep(still, D.steps);
        host.appendChild(core.el('p', { class: 'control-hint', html: endText() }));
      }
      refreshMarks();
    }

    cen.input.addEventListener('change', core.guard(body, function () { st.centring = cen.input.checked; build(); }));
    sha.input.addEventListener('change', core.guard(body, function () { st.sharpening = sha.input.checked; build(); }));
    again.addEventListener('click', core.guard(body, function () { st.seed += 1; build(); }));
    both.addEventListener('click', core.guard(body, function () {
      st.centring = true; st.sharpening = true; st.seed = D.seed;
      cen.input.checked = true; sha.input.checked = true;
      build();
    }));
    core.on('theme-changed', core.guard(body, function () { if (st.film) st.film.goTo(st.film.index()); }));

    build();
  });

  // ------------------------------------------------------------------ Lab 3F: real similarity under three models (new)

  Labs.register('lab-3f-real-similarity', function mount(body, core, bundles) {
    bundles = bundles || core.bundles || {};
    var ID = 'lab-3f-real-similarity';
    var D = DEFAULTS.f;
    var images = bundles['images.json'] || bundles.images;
    if (!images || !Array.isArray(images.images)) throw new Error('images.json did not load');
    var N = D.grid * D.grid;
    var S = D.grid * D.cell;
    var MODELS = D.models;
    var st = {
      id: images.followed, anchor: D.anchor, photo: true, strength: D.strength.default,
      data: {}, pics: {}, pending: null, message: '', hover: null
    };

    // entry(id): the images.json record of a photograph.
    function entry(id) {
      for (var i = 0; i < images.images.length; i++) if (images.images[i].id === id) return images.images[i];
      return null;
    }

    // unitOf(doc): the unit rows of a tokens file (its member tokens: int8 196 x 384, decoded by Core.bundle).
    function unitOf(doc) {
      var m = doc && doc.tokens;
      if (!m || !m.array || !m.shape || m.shape[0] !== N) throw new Error('a tokens file without its 196 x 384 member');
      return { unit: unitRows(m.array, m.shape[0], m.shape[1]), d: m.shape[1], meta: doc.meta || {} };
    }

    // seed the followed photograph from the bundles that boot.js loaded
    (function () {
      var e = entry(st.id);
      if (!e) return;
      var got = {};
      MODELS.forEach(function (m) {
        var name = e.files.tokens224[m];
        var doc = bundles[name] || bundles[name.replace(/\.json$/, '')];
        if (doc) got[m] = unitOf(doc);
      });
      if (Object.keys(got).length === MODELS.length) st.data[st.id] = got;
    })();

    var controls = core.el('div', { class: 'lab-controls' });
    var stage = core.el('div', { class: 'lab-stage' });
    var pickerEl = null;
    if (typeof core.bundleImagePicker === 'function') {
      pickerEl = core.bundleImagePicker({ id: ID, label: 'Photograph' });
    } else {
      var sel = core.el('select', { id: ID + '-photo' }, images.images.map(function (im) {
        return core.el('option', { value: im.id, text: im.description || im.id });
      }));
      sel.value = st.id;
      sel.addEventListener('change', core.guard(body, function () { show(sel.value); }));
      pickerEl = core.el('div', { class: 'bundle-pick' }, [core.el('label', { for: ID + '-photo', text: 'Photograph' }), sel]);
    }
    controls.appendChild(pickerEl);
    var photoT = toggle(core, { id: ID + '-show-photo', label: 'Show the photograph under the maps', checked: st.photo });
    controls.appendChild(photoT.root);
    var strengthS = slider(core, {
      id: ID + '-strength', label: 'Colour strength', role: 'teacher', digits: 2,
      min: D.strength.min, max: D.strength.max, step: D.strength.step, value: st.strength,
      hint: 'How strongly the blue covers the photograph at the most similar patch.' + toyMark()
    });
    controls.appendChild(strengthS.root);
    controls.appendChild(hint(core, 'Click a patch of any map, or focus a map and use the arrow keys, to move the anchor. The anchor has a ' +
      'thick outline; its eight most similar patches have orange outlines.' + toyMark()));
    var statusEl = core.el('p', { class: 'readout', id: ID + '-status', 'aria-live': 'polite' });
    controls.appendChild(statusEl);
    var overlap = readoutList(core, [['dc', 'Top 8 shared by DINO and run 2', ID + '-overlap-dc'], ['sc', 'by SelfPatch and run 2'], ['ds', 'by DINO and SelfPatch'], ['all', 'by all three']]);
    controls.appendChild(overlap.root);

    var row = core.el('div', { class: 'stage-row' });
    var panels = {};
    MODELS.forEach(function (m) {
      var box = canvasBox(core, { id: ID + '-map-' + m, label: 'Cosine map under ' + D.names[m] + '; arrow keys move the anchor', focusable: true });
      var title = core.el('span', { class: 'stage-label', text: D.names[m] });
      var list = readoutList(core, [['top', 'Top 8', ID + '-top-' + m], ['mean', 'Their mean'], ['low', 'Lowest']]);
      // a fixed width, so the three maps sit side by side where the stage has room and stack where it has not
      var cell = core.el('div', { class: 'stage-cell', style: 'width: ' + S + 'px; max-width: 100%' }, [title, box.canvas, list.root]);
      row.appendChild(cell);
      panels[m] = { box: box, list: list, title: title };
    });
    var legendCell = core.el('div', { class: 'stage-cell' });
    var message = core.el('p', { class: 'control-hint', id: ID + '-message' });
    stage.appendChild(row);
    stage.appendChild(legendCell);
    stage.appendChild(message);
    body.appendChild(controls);
    body.appendChild(stage);

    // rows(): for the current photograph and anchor, each model's cosine row, top 8 and the shared scale.
    function rows() {
      var data = st.data[st.id];
      var out = { models: {}, lo: Infinity, hi: -Infinity };
      MODELS.forEach(function (m) {
        var u = data[m];
        var c = cosineRow(u.unit, N, u.d, st.anchor);
        var top = topK(c, D.top, st.anchor);
        var lo = Infinity, hi = -Infinity, lowAt = 0;
        for (var j = 0; j < N; j++) {
          if (j === st.anchor) continue;
          if (c[j] < lo) { lo = c[j]; lowAt = j; }
          if (c[j] > hi) hi = c[j];
        }
        out.models[m] = { cos: c, top: top, lo: lo, hi: hi, lowAt: lowAt };
        out.lo = Math.min(out.lo, lo);
        out.hi = Math.max(out.hi, hi);
      });
      return out;
    }

    // drawMap(m, r): the photograph, the heat of model m's cosines on the shared scale, the anchor and its top 8.
    function drawMap(m, r) {
      var th = core.theme();
      var ctx = panels[m].box.begin(S, S);
      var pic = st.pics[st.id];
      if (st.photo && pic) {
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(pic, 0, 0, S, S);
      } else {
        ctx.fillStyle = th.paper;
        ctx.fillRect(0, 0, S, S);
      }
      var row2 = r.models[m], span = r.hi - r.lo || 1;
      for (var j = 0; j < N; j++) {
        if (j === st.anchor) continue;
        var f = clamp((row2.cos[j] - r.lo) / span, 0, 1);
        ctx.fillStyle = core.rgba(th.teacher, st.strength * f);
        ctx.fillRect((j % D.grid) * D.cell, Math.floor(j / D.grid) * D.cell, D.cell, D.cell);
      }
      ctx.lineWidth = 2;
      ctx.strokeStyle = th.positive;
      row2.top.forEach(function (j) {
        ctx.strokeRect((j % D.grid) * D.cell + 1, Math.floor(j / D.grid) * D.cell + 1, D.cell - 2, D.cell - 2);
      });
      var ax = (st.anchor % D.grid) * D.cell, ay = Math.floor(st.anchor / D.grid) * D.cell;
      ctx.lineWidth = 4;
      ctx.strokeStyle = th.paper;
      ctx.strokeRect(ax + 1, ay + 1, D.cell - 2, D.cell - 2);
      ctx.lineWidth = 2;
      ctx.strokeStyle = th.ink;
      ctx.strokeRect(ax + 1, ay + 1, D.cell - 2, D.cell - 2);
      if (st.hover !== null && st.hover !== st.anchor) {
        ctx.setLineDash([3, 2]);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = th.ink;
        ctx.strokeRect((st.hover % D.grid) * D.cell + 0.5, Math.floor(st.hover / D.grid) * D.cell + 0.5, D.cell - 1, D.cell - 1);
        ctx.setLineDash([]);
      }
      var list = panels[m].list;
      list.set('top', row2.top.map(function (j) { return j + ' (' + core.fmt(row2.cos[j], 3) + ')'; }).join(', '));
      var mean = row2.top.reduce(function (a, j) { return a + row2.cos[j]; }, 0) / row2.top.length;
      list.set('mean', core.fmt(mean, 3));
      list.set('low', core.fmt(row2.lo, 3) + ' at patch ' + row2.lowAt);
    }

    // drawLegend(r): the shared colour scale and the two outlines.
    function drawLegend(r) {
      var W = 300, H = 92, L = 8, w = 220;
      var svg = core.el('svg', { class: 'chart', viewBox: '0 0 ' + W + ' ' + H, width: String(W), role: 'img', 'aria-label': 'The colour scale, shared by the three maps, from cosine ' + core.fmt(r.lo, 3) + ' to ' + core.fmt(r.hi, 3) });
      var steps = 22;
      for (var i = 0; i < steps; i++) {
        svg.appendChild(core.el('rect', { x: String(L + i * w / steps), y: '18', width: String(w / steps + 0.5), height: '14', style: 'fill: var(--teacher); fill-opacity: ' + (st.strength * i / (steps - 1)).toFixed(3) }));
      }
      // the caption above the bar, the lowest and the highest cosine under its two ends, the two outlines below
      svg.appendChild(svgText(core, L, 11, 'Cosine, one scale for the three maps', { 'text-anchor': 'start' }));
      svg.appendChild(core.el('rect', { x: String(L), y: '18', width: String(w), height: '14', style: 'fill: none; stroke: var(--line)' }));
      svg.appendChild(svgText(core, L, 47, core.fmt(r.lo, 3), { 'text-anchor': 'start' }));
      svg.appendChild(svgText(core, L + w, 47, core.fmt(r.hi, 3), { 'text-anchor': 'end' }));
      svg.appendChild(core.el('rect', { x: String(L + 1), y: '58', width: '13', height: '13', style: 'fill: none; stroke: var(--ink); stroke-width: 2' }));
      svg.appendChild(svgText(core, L + 22, 69, 'the anchor', {}));
      svg.appendChild(core.el('rect', { x: String(L + 1), y: '76', width: '13', height: '13', style: 'fill: none; stroke: var(--positive); stroke-width: 2' }));
      svg.appendChild(svgText(core, L + 22, 87, 'its 8 most similar patches', {}));
      clearNode(legendCell);
      legendCell.appendChild(svg);
    }

    // shared(a, b): how many indices two lists share.
    function shared(a, b) { return a.filter(function (x) { return b.indexOf(x) >= 0; }).length; }

    // draw(): every map, the legend, the readouts and the status.
    function draw() {
      if (!st.data[st.id]) {
        MODELS.forEach(function (m) {
          var ctx = panels[m].box.begin(S, S);
          ctx.fillStyle = core.theme().paper;
          ctx.fillRect(0, 0, S, S);
        });
        message.textContent = st.message || ('Loading the real numbers' + CH.ellipsis);
        return;
      }
      var r = rows();
      MODELS.forEach(function (m) { drawMap(m, r); });
      drawLegend(r);
      var t = {};
      MODELS.forEach(function (m) { t[m] = r.models[m].top; });
      overlap.set('dc', shared(t.dino, t.con2) + ' of 8');
      overlap.set('sc', shared(t.selfpatch, t.con2) + ' of 8');
      overlap.set('ds', shared(t.dino, t.selfpatch) + ' of 8');
      overlap.set('all', String(t.dino.filter(function (x) { return t.selfpatch.indexOf(x) >= 0 && t.con2.indexOf(x) >= 0; }).length));
      var e = entry(st.id);
      statusEl.textContent = 'Anchor: patch ' + st.anchor + ' (row ' + Math.floor(st.anchor / D.grid) + ', column ' + (st.anchor % D.grid) + ') of ' +
        (e && e.description ? '\u201C' + e.description + '\u201D' : st.id) + '.';
      message.innerHTML = st.message ? escapeHtml(st.message) : '';
    }

    // setAnchor(j): move the anchor to patch j and draw.
    function setAnchor(j) {
      st.anchor = clamp(j, 0, N - 1);
      draw();
    }

    // patchAt(m, ev): the patch under the pointer on model m's map.
    function patchAt(m, ev) {
      var p = panels[m].box.point(ev);
      var c = clamp(Math.floor(p.x / D.cell), 0, D.grid - 1), r = clamp(Math.floor(p.y / D.cell), 0, D.grid - 1);
      return r * D.grid + c;
    }

    MODELS.forEach(function (m) {
      var cv = panels[m].box.canvas;
      cv.addEventListener('click', core.guard(body, function (ev) { if (st.data[st.id]) setAnchor(patchAt(m, ev)); }));
      cv.addEventListener('pointermove', core.guard(body, function (ev) {
        if (!st.data[st.id]) return;
        var j = patchAt(m, ev);
        if (j === st.hover) return;
        st.hover = j;
        draw();
        var r = rows();
        message.textContent = 'Patch ' + j + ': ' + MODELS.map(function (mm) { return D.names[mm] + ' ' + core.fmt(r.models[mm].cos[j], 3); }).join(', ');
      }));
      cv.addEventListener('pointerleave', core.guard(body, function () { st.hover = null; draw(); }));
      cv.addEventListener('keydown', core.guard(body, function (ev) {
        var r = Math.floor(st.anchor / D.grid), c = st.anchor % D.grid;
        if (ev.key === 'ArrowLeft') c -= 1;
        else if (ev.key === 'ArrowRight') c += 1;
        else if (ev.key === 'ArrowUp') r -= 1;
        else if (ev.key === 'ArrowDown') r += 1;
        else return;
        ev.preventDefault();
        setAnchor(clamp(r, 0, D.grid - 1) * D.grid + clamp(c, 0, D.grid - 1));
      }));
    });

    // loadPicture(id): the photograph's 224 px view, drawn by the browser (Core.image.load); null when it cannot be drawn.
    function loadPicture(id) {
      if (Object.prototype.hasOwnProperty.call(st.pics, id)) return Promise.resolve(st.pics[id]);
      var e = entry(id);
      if (!e || !core.image || typeof core.image.load !== 'function') { st.pics[id] = null; return Promise.resolve(null); }
      var v = e.views && e.views['224'];
      var opts = v && v.box_native ? { side: 224, box: v.box_native } : 224;
      return Promise.resolve().then(function () { return core.image.load(core.image.url(id), opts); }).then(function (img) {
        st.pics[id] = core.toCanvas(img);
        return st.pics[id];
      }, function () {
        st.pics[id] = null;
        return null;
      });
    }

    // loadTokens(id): the three models' tokens of a photograph, loaded through Core.bundle.
    function loadTokens(id) {
      if (st.data[id]) return Promise.resolve(st.data[id]);
      var e = entry(id);
      if (!e) return Promise.reject(new Error('no photograph ' + id + ' in images.json'));
      return Promise.all(MODELS.map(function (m) { return core.bundle.load(e.files.tokens224[m]); })).then(function (docs) {
        var got = {};
        MODELS.forEach(function (m, i) { got[m] = unitOf(docs[i]); });
        st.data[id] = got;
        return got;
      });
    }

    // show(id): switch to a photograph: its tokens, then its picture.
    function show(id) {
      if (!entry(id)) return;
      var previous = st.id;
      st.pending = id;
      st.message = '';
      if (!st.data[id]) {
        message.textContent = 'Loading the real numbers of this photograph' + CH.ellipsis;
      }
      loadTokens(id).then(function () {
        if (st.pending !== id) return;
        st.id = id;
        st.hover = null;
        draw();
        return loadPicture(id).then(function () { if (st.id === id) draw(); });
      }).then(null, core.guard(body, function (err) {
        if (st.pending !== id) return;
        st.id = previous;
        st.message = 'The real numbers of this photograph did not load (' + (err && err.message ? err.message : String(err)) + '). The maps still show the previous photograph.';
        draw();
      }));
    }

    photoT.input.addEventListener('change', core.guard(body, function () { st.photo = photoT.input.checked; draw(); }));
    strengthS.input.addEventListener('input', core.guard(body, function () { st.strength = strengthS.value(); strengthS.show(); draw(); }));
    core.on('bundle-image-changed', core.guard(body, function (e) { if (e && e.id) show(e.id); }));
    core.on('theme-changed', core.guard(body, draw));

    draw();
    var start = root.Boot && typeof root.Boot.bundleImage === 'function' ? root.Boot.bundleImage() : st.id;
    if (start && start !== st.id) show(start);
    else loadPicture(st.id).then(function () { draw(); });
    refreshMarks();
  });

  // ------------------------------------------------------------------ export of the pure functions

  root.LabP3 = {
    DEFAULTS: DEFAULTS,
    FACTS: FACTS,
    REAL: REAL,
    softmax: softmaxT,
    teacherProbs: teacherProbs,
    crossEntropy: crossEntropyOf,
    entropy: entropyOf,
    studentGradient: studentGradient,
    pairTable: pairTable,
    pairCrops: pairCrops,
    spreadScores: spreadScores,
    pairsLoss: pairsLoss,
    pairsStep: pairsStep,
    collapseRun: collapseRun,
    collapseVerdict: collapseVerdict,
    unitRows: unitRows,
    cosineRow: cosineRow,
    topK: topK,
    workedExamples: workedExamples,
    fixed: fixed
  };
})(typeof window !== 'undefined' ? window : this);
