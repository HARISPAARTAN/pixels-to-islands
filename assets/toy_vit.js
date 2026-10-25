/*
 * toy_vit.js: the miniature network behind Lab M ("One image, end to end") of the teaching page "Patches, Teachers
 * and Neighbours". It has the wiring, depth, head count, token count, activations, loss arithmetic, optimiser
 * arithmetic and schedules of our SelfPatch runs, reduced widths and seeded random weights, and a small reverse-mode
 * autograd, so that the gradient, the AdamW step and the loss after the step are computed, not drawn. A DINO wiring
 * (class token, final LayerNorm, the image-level loss only) is there to teach the difference.
 *
 * Toy maths only: no checkpoint is loaded and no real activation is baked in; the picture is the drawn sample scene
 * or the viewer's own upload, cut into crops by the lab. Pure functions: no page elements, timers, storage, network
 * or dialogs. The only outside object it reads is window.Core (core.js, loaded first): its seeded random numbers, its
 * pixel normalisation constants and its schedule curves. Vanilla ES2019, ASCII only, plain Float64Array numbers.
 *
 * Contract: design_end_to_end_2026-09-29.md section 3 (window.ToyViT has exactly that section's API), design.md
 * sections 5 and 6, src/README.md. Checks: tests/run_node_checks.js (shapes, invariants, the selection against Core,
 * determinism, numeric gradient checks, AdamW, the EMA, the centres, the loss after the step, timing).
 *
 * Where each piece follows the real code (read, not copied):
 *   blocks, attention, class attention, the aggregation module, the heads and the 96-pixel position rows:
 *     cluster/selfpatch_official/selfpatch_vision_transformer.py (Block, Attention, Class_Attention,
 *     LayerScale_Block_CA, which has no layer scale despite its name, SelfPatchHead, DINOHead,
 *     interpolate_pos_encoding with torch's bicubic interpolate);
 *   DINO's class token, its own position row and its final LayerNorm: research/references/repos/DINO/vision_transformer.py;
 *   the step (the loss and its pairs, the centres, the clip, the last-layer freeze, the AdamW groups, the schedules,
 *     the EMA): cluster/selfpatch_official/main_selfpatch.py (MultiCropWrapper, DINOLoss, train_one_epoch),
 *     cluster/selfpatch_official/utils.py (clip_gradients, cancel_gradients_last_layer, get_params_groups,
 *     cosine_scheduler), cluster/train.py and cluster/selection.py (our trainer and loss);
 *   AdamW: torch's _single_tensor_adam with decoupled weight decay (.venv-repro/Lib/site-packages/torch/optim/adam.py).
 *
 * Numbers that differ from the real network (the lab says so): the widths (WIDTHS), random untrained weights, three
 * crops instead of ten, four of the eighteen image-level pairs, and an optimiser state that starts empty at every t.
 */
(function (root) {
  'use strict';

  if (root.ToyViT && typeof root.ToyViT.trainingStep === 'function') return;

  // ------------------------------------------------------------------ built-ins, widths, recipe and constants

  // The built-ins the loops call, bound once: inside a node vm context (where the checks run) every global lookup costs
  // about 100 ns against 3 ns for a local name; in a page the two cost the same.
  const exp = Math.exp, log = Math.log, sqrt = Math.sqrt, abs = Math.abs, floor = Math.floor, ceil = Math.ceil, pow = Math.pow;
  const mathMin = Math.min, mathMax = Math.max, SQRT1_2 = Math.SQRT1_2;
  const F64 = Float64Array, I32 = Int32Array, U8 = Uint8Array;
  const isArray = Array.isArray, isView = ArrayBuffer.isView, isInteger = Number.isInteger;

  // The toy widths. Every other number of the network is the real one. Toy -> real: token width 48 -> 384; 6 heads of
  // 8 numbers -> 6 of 64; MLP hidden 192 -> 1,536; 12 blocks; 2 class-attention blocks; head hidden 96 -> 2,048 and
  // bottleneck 32 -> 256; 64 prototypes -> 65,536 (image level) and 4,096 (patch level).
  const WIDTHS = Object.freeze({
    D: 48, heads: 6, headDim: 8, mlp: 192, blocks: 12, aggBlocks: 2, headHidden: 96, bottleneck: 32, kImage: 64, kPatch: 64
  });
  const WIDTH_KEYS = Object.keys(WIDTHS);

  // The recipe values the toy keeps unchanged (steps are counted as the lab's slider counts them, 1 to 9,240).
  const RECIPE = Object.freeze({
    patch: 16, grid: 14, localGrid: 6, layerNormEps: 1e-6,
    tempTeacher: 0.04, tempStudent: 0.1, centreMomentum: 0.9,
    candidates: 8, k: 4, lambda: 0.1, globalCrops: 2,
    clip: 3, clipEps: 1e-6,
    betas: Object.freeze([0.9, 0.999]), eps: 1e-8,
    weightDecay: Object.freeze([0.04, 0.4]),
    lrPeak: 5e-4, lrMin: 1e-6, warmupSteps: 4620, totalSteps: 9240, stepsPerEpoch: 462,
    momentum: Object.freeze([0.9995, 1]),
    freezeLastLayerEpochs: 1, dropPathRate: 0.1,
    initStd: 0.02, initBound: 2, normaliseEps: 1e-12
  });

  // The fact-sheet entry (facts/dino_selfpatch_facts.json) that states each unchanged recipe value; tests compare them.
  const RECIPE_FACTS = Object.freeze({
    patch: 'patch_size', grid: 'patch_grid_224', localGrid: 'patch_grid_96', layerNormEps: 'vit_layernorm_eps',
    tempTeacher: 'temp_teacher', tempStudent: 'temp_student', centreMomentum: 'centre_momentum',
    candidates: 'nbr_candidates', k: 'sp_k', lambda: 'sp_lambda', globalCrops: 'crop_global_count', clip: 'ours_clip',
    betas: 'adamw_betas_eps', eps: 'adamw_betas_eps', weightDecay: 'ours_weight_decay',
    lrPeak: 'ours_lr_peak', lrMin: 'ours_min_lr', warmupSteps: 'ours_warmup_steps', totalSteps: 'ours_steps_20ep',
    stepsPerEpoch: 'ours_steps_per_epoch', momentum: 'ema_ours_schedule', freezeLastLayerEpochs: 'ours_freeze_last_layer',
    dropPathRate: 'drop_path_student'
  });

  const PATCH = RECIPE.patch;
  const CHANNELS = 3;
  const PATCH_VALUES = PATCH * PATCH * CHANNELS;
  const WINDOW = RECIPE.candidates;
  const WIRINGS = ['selfpatch', 'dino'];
  // torch's cubic convolution constant for mode 'bicubic', and the 0.1 that interpolate_pos_encoding adds to the grid side.
  const CUBIC_A = -0.75;
  const POS_OFFSET = 0.1;
  // Abramowitz and Stegun 7.1.26: erf(x) = 1 - (a1 t + ... + a5 t^5) exp(-x^2), t = 1 / (1 + p x), for x >= 0.
  const ERF_P = 0.3275911;
  const ERF_A = [0.254829592, -0.284496736, 1.421413741, -1.453152027, 1.061405429];
  // Work per pause of a chunked step: multiply-adds of the backward pass, anchors of the teacher's targets.
  const BACKWARD_CHUNK = 12e6;
  const ANCHOR_CHUNK = 49;

  // core(): window.Core, which core.js defines; a clear error when it is missing.
  function core() {
    const c = root.Core;
    if (!c || typeof c.rng !== 'function') throw new Error('ToyViT needs window.Core: load core.js before toy_vit.js');
    return c;
  }

  // now(): a clock in milliseconds (performance.now when there is one), for the record's timing only.
  function now() {
    const p = root.performance;
    return p && typeof p.now === 'function' ? p.now() : Date.now();
  }

  // ------------------------------------------------------------------ matrices and the tape

  // Mat(rows, cols, data): a row-major matrix of doubles; data is a Float64Array of rows * cols numbers. Every op takes and returns these.
  function Mat(rows, cols, data) {
    this.rows = rows;
    this.cols = cols;
    this.data = data || new F64(rows * cols);
    this.grad = null;
    this.tape = null;
    this.keepGrad = false;
  }

  // Mat.row(i): row i as a Float64Array view on the same numbers.
  Mat.prototype.row = function (i) {
    return this.data.subarray(i * this.cols, (i + 1) * this.cols);
  };

  // Mat.get(i, j): the number at row i, column j.
  Mat.prototype.get = function (i, j) {
    return this.data[i * this.cols + j];
  };

  // copyMat(m): a new matrix with a copy of m's numbers and no tape.
  function copyMat(m) {
    return new Mat(m.rows, m.cols, F64.from(m.data));
  }

  // toMat(x, cols): x as a matrix without a tape: a matrix (its numbers shared), an array of rows (copied), or a flat array of rows of `cols` numbers (shared when it is a Float64Array).
  function toMat(x, cols) {
    if (x && typeof x.rows === 'number' && typeof x.cols === 'number' && x.data) return new Mat(x.rows, x.cols, x.data);
    if (isArray(x) && x.length > 0 && (isArray(x[0]) || isView(x[0]))) {
      const w = x[0].length;
      const m = new Mat(x.length, w);
      x.forEach(function (r, i) {
        if (r.length !== w) throw new RangeError('every row needs ' + w + ' numbers');
        for (let j = 0; j < w; j++) m.data[i * w + j] = r[j];
      });
      return m;
    }
    if ((isArray(x) || isView(x)) && cols > 0 && x.length % cols === 0 && x.length > 0) {
      return new Mat(x.length / cols, cols, x instanceof F64 ? x : F64.from(x));
    }
    throw new TypeError('expected a matrix {rows, cols, data}, an array of rows, or a flat array of rows of ' + cols + ' numbers');
  }

  // Tape(): the ops of one forward pass with gradient, in the order they ran.
  function Tape() {
    this.nodes = [];
  }

  // onTape(out, inputs, backward, cost): put an op on the tape of its first input that has one (out then carries it too); returns out.
  function onTape(out, inputs, backward, cost) {
    for (let i = 0; i < inputs.length; i++) {
      const tp = inputs[i].tape;
      if (tp) {
        out.tape = tp;
        tp.nodes.push({ out: out, backward: backward, cost: cost === undefined ? out.rows * out.cols : cost });
        break;
      }
    }
    return out;
  }

  // needs(m): whether a gradient flows into m (it sits on a tape).
  function needs(m) {
    return m.tape !== null;
  }

  // gradOf(m): m's gradient buffer, created as zeros on first use.
  function gradOf(m) {
    if (!m.grad) m.grad = new F64(m.rows * m.cols);
    return m.grad;
  }

  // release(m): drop m's numbers once no backward step needs them (a later backward step uses only its gradient).
  function release(m) {
    m.data = null;
  }

  // backwardTask(tape, loss, tick): a generator that runs the tape backwards from the 1 x 1 loss, pausing after about BACKWARD_CHUNK multiply-adds; each intermediate gradient is freed once used.
  function* backwardTask(tape, loss, tick) {
    loss.grad = new F64([1]);
    const nodes = tape.nodes;
    let spent = 0;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i];
      nodes[i] = null;
      if (node.out.grad) {
        node.backward();
        spent += node.cost;
      }
      if (!node.out.keepGrad) node.out.grad = null;
      node.out.tape = null;
      if (spent >= BACKWARD_CHUNK) {
        spent = 0;
        yield tick('backward', -1, i);
      }
    }
    tape.nodes = [];
  }

  // ------------------------------------------------------------------ kernels

  // dotAt(a, ai, b, bi, k): the dot product of a[ai .. ai+k-1] and b[bi .. bi+k-1], four terms at a time.
  function dotAt(a, ai, b, bi, k) {
    let s0 = 0, s1 = 0, s2 = 0, s3 = 0, p = 0;
    for (; p + 3 < k; p += 4) {
      s0 += a[ai + p] * b[bi + p];
      s1 += a[ai + p + 1] * b[bi + p + 1];
      s2 += a[ai + p + 2] * b[bi + p + 2];
      s3 += a[ai + p + 3] * b[bi + p + 3];
    }
    for (; p < k; p++) s0 += a[ai + p] * b[bi + p];
    return (s0 + s1) + (s2 + s3);
  }

  // axpyAt(y, yi, x, a, ai, k): y[yi + p] += x * a[ai + p] for p = 0 .. k-1.
  function axpyAt(y, yi, x, a, ai, k) {
    for (let p = 0; p < k; p++) y[yi + p] += x * a[ai + p];
  }

  // erfApprox(z): erf(z) by Abramowitz and Stegun 7.1.26 (absolute error below 1.5e-7), extended as an odd function.
  function erfApprox(z) {
    const x = abs(z);
    const t = 1 / (1 + ERF_P * x);
    const poly = ((((ERF_A[4] * t + ERF_A[3]) * t + ERF_A[2]) * t + ERF_A[1]) * t + ERF_A[0]) * t;
    const e = 1 - poly * exp(-x * x);
    return z < 0 ? -e : e;
  }

  // erfApproxSlope(z): the exact derivative of erfApprox at z, so the backward pass matches the forward function to rounding.
  function erfApproxSlope(z) {
    const x = abs(z);
    const t = 1 / (1 + ERF_P * x);
    const poly = ((((ERF_A[4] * t + ERF_A[3]) * t + ERF_A[2]) * t + ERF_A[1]) * t + ERF_A[0]) * t;
    const slope = (((5 * ERF_A[4] * t + 4 * ERF_A[3]) * t + 3 * ERF_A[2]) * t + 2 * ERF_A[1]) * t + ERF_A[0];
    return exp(-x * x) * (ERF_P * t * t * slope + 2 * x * poly);
  }

  // ------------------------------------------------------------------ ops (each records its backward pass when an input sits on a tape)

  // matmulT(A, B): A B^T for A (n x k) and B (m x k): a linear layer's x W^T. The inner loops are written out (four terms at a time) because this op carries most of the work.
  function matmulT(A, B) {
    const n = A.rows, k = A.cols, m = B.rows;
    if (B.cols !== k) throw new RangeError('matmulT: ' + n + ' x ' + k + ' times the transpose of ' + m + ' x ' + B.cols);
    const a = A.data, b = B.data;
    const C = new Mat(n, m);
    const c = C.data;
    const k4 = k - (k % 4);
    for (let i = 0; i < n; i++) {
      const ai = i * k, ci = i * m;
      for (let j = 0; j < m; j++) {
        const bj = j * k;
        let s0 = 0, s1 = 0, s2 = 0, s3 = 0, p = 0;
        for (; p < k4; p += 4) {
          s0 += a[ai + p] * b[bj + p];
          s1 += a[ai + p + 1] * b[bj + p + 1];
          s2 += a[ai + p + 2] * b[bj + p + 2];
          s3 += a[ai + p + 3] * b[bj + p + 3];
        }
        for (; p < k; p++) s0 += a[ai + p] * b[bj + p];
        c[ci + j] = (s0 + s1) + (s2 + s3);
      }
    }
    return onTape(C, [A, B], function () {
      const g = C.grad;
      const ga = needs(A) ? gradOf(A) : null, gb = needs(B) ? gradOf(B) : null;
      for (let i = 0; i < n; i++) {
        const ai = i * k, ci = i * m;
        for (let j = 0; j < m; j++) {
          const x = g[ci + j];
          if (x === 0) continue;
          const bj = j * k;
          if (ga) for (let p = 0; p < k; p++) ga[ai + p] += x * b[bj + p];
          if (gb) for (let p = 0; p < k; p++) gb[bj + p] += x * a[ai + p];
        }
      }
    }, n * k * m);
  }

  // matmul(A, B): A B for A (n x k) and B (k x m); a constant A (no tape) makes it a fixed linear map of B.
  function matmul(A, B) {
    const n = A.rows, k = A.cols, m = B.cols;
    if (B.rows !== k) throw new RangeError('matmul: ' + n + ' x ' + k + ' times ' + B.rows + ' x ' + m);
    const a = A.data, b = B.data;
    const C = new Mat(n, m);
    const c = C.data;
    for (let i = 0; i < n; i++) {
      const ai = i * k, ci = i * m;
      for (let p = 0; p < k; p++) {
        const x = a[ai + p];
        if (x !== 0) axpyAt(c, ci, x, b, p * m, m);
      }
    }
    return onTape(C, [A, B], function () {
      const g = C.grad;
      const ga = needs(A) ? gradOf(A) : null, gb = needs(B) ? gradOf(B) : null;
      for (let i = 0; i < n; i++) {
        const ai = i * k, ci = i * m;
        for (let p = 0; p < k; p++) {
          if (ga) ga[ai + p] += dotAt(g, ci, b, p * m, m);
          if (gb) {
            const x = a[ai + p];
            if (x !== 0) axpyAt(gb, p * m, x, g, ci, m);
          }
        }
      }
    }, n * k * m);
  }

  // transpose(A): A^T.
  function transpose(A) {
    const n = A.rows, m = A.cols, a = A.data;
    const C = new Mat(m, n);
    const c = C.data;
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) c[j * n + i] = a[i * m + j];
    return onTape(C, [A], function () {
      const g = C.grad, ga = gradOf(A);
      for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) ga[i * m + j] += g[j * n + i];
    });
  }

  // add(A, B): A + B for equal shapes, or B (one row) added to every row of A (a bias, broadcast over the rows).
  function add(A, B) {
    const n = A.rows, d = A.cols;
    const broadcast = B.rows === 1 && n !== 1;
    if (B.cols !== d || (!broadcast && B.rows !== n)) throw new RangeError('add: ' + n + ' x ' + d + ' plus ' + B.rows + ' x ' + B.cols);
    const a = A.data, b = B.data;
    const C = new Mat(n, d);
    const c = C.data;
    if (broadcast) {
      for (let i = 0; i < n; i++) for (let j = 0; j < d; j++) c[i * d + j] = a[i * d + j] + b[j];
    } else {
      for (let i = 0; i < c.length; i++) c[i] = a[i] + b[i];
    }
    return onTape(C, [A, B], function () {
      const g = C.grad;
      if (needs(A)) {
        const ga = gradOf(A);
        for (let i = 0; i < g.length; i++) ga[i] += g[i];
      }
      if (needs(B)) {
        const gb = gradOf(B);
        if (broadcast) {
          for (let i = 0; i < n; i++) for (let j = 0; j < d; j++) gb[j] += g[i * d + j];
        } else {
          for (let i = 0; i < g.length; i++) gb[i] += g[i];
        }
      }
    });
  }

  // mulScalar(A, s): s A.
  function mulScalar(A, s) {
    const a = A.data;
    const C = new Mat(A.rows, A.cols);
    const c = C.data;
    for (let i = 0; i < c.length; i++) c[i] = a[i] * s;
    return onTape(C, [A], function () {
      const g = C.grad, ga = gradOf(A);
      for (let i = 0; i < g.length; i++) ga[i] += g[i] * s;
    });
  }

  // mulConst(A, K): A times the constant numbers K entry by entry (K: a Float64Array or matrix of A's size; no gradient flows into K).
  function mulConst(A, K) {
    const k = K.data || K;
    const a = A.data;
    if (k.length !== a.length) throw new RangeError('mulConst: ' + a.length + ' numbers times ' + k.length);
    const C = new Mat(A.rows, A.cols);
    const c = C.data;
    for (let i = 0; i < c.length; i++) c[i] = a[i] * k[i];
    return onTape(C, [A], function () {
      const g = C.grad, ga = gradOf(A);
      for (let i = 0; i < g.length; i++) ga[i] += g[i] * k[i];
    });
  }

  // layerNorm(X, W, B, eps): every row normalised to mean 0 and variance 1 (the variance over the row, eps inside the root), then scaled by W and shifted by B (both one row).
  function layerNorm(X, W, B, eps) {
    const n = X.rows, d = X.cols, x = X.data, w = W.data, b = B.data;
    const Y = new Mat(n, d);
    const y = Y.data;
    const xhat = new F64(n * d), rstd = new F64(n);
    for (let i = 0; i < n; i++) {
      const o = i * d;
      let mu = 0;
      for (let j = 0; j < d; j++) mu += x[o + j];
      mu /= d;
      let v = 0;
      for (let j = 0; j < d; j++) {
        const c = x[o + j] - mu;
        v += c * c;
      }
      v /= d;
      const r = 1 / sqrt(v + eps);
      rstd[i] = r;
      for (let j = 0; j < d; j++) {
        const h = (x[o + j] - mu) * r;
        xhat[o + j] = h;
        y[o + j] = h * w[j] + b[j];
      }
    }
    return onTape(Y, [X, W, B], function () {
      const g = Y.grad;
      const gx = needs(X) ? gradOf(X) : null, gw = needs(W) ? gradOf(W) : null, gb = needs(B) ? gradOf(B) : null;
      for (let i = 0; i < n; i++) {
        const o = i * d;
        let s1 = 0, s2 = 0;
        for (let j = 0; j < d; j++) {
          const gh = g[o + j] * w[j];
          s1 += gh;
          s2 += gh * xhat[o + j];
          if (gw) gw[j] += g[o + j] * xhat[o + j];
          if (gb) gb[j] += g[o + j];
        }
        if (gx) {
          s1 /= d;
          s2 /= d;
          for (let j = 0; j < d; j++) gx[o + j] += rstd[i] * (g[o + j] * w[j] - s1 - xhat[o + j] * s2);
        }
      }
    }, 3 * n * d);
  }

  // gelu(X): the exact GELU, x (1 + erf(x / sqrt 2)) / 2, with erf from Abramowitz and Stegun 7.1.26.
  function gelu(X) {
    const x = X.data, n = x.length;
    const Y = new Mat(X.rows, X.cols);
    const y = Y.data;
    for (let i = 0; i < n; i++) y[i] = 0.5 * x[i] * (1 + erfApprox(x[i] * SQRT1_2));
    return onTape(Y, [X], function () {
      const g = Y.grad, gx = gradOf(X);
      for (let i = 0; i < n; i++) {
        const z = x[i] * SQRT1_2;
        gx[i] += g[i] * (0.5 * (1 + erfApprox(z)) + 0.5 * x[i] * SQRT1_2 * erfApproxSlope(z));
      }
    }, 4 * n);
  }

  // softmaxRows(X, T, inPlace): the softmax of every row of X / T, with the row's maximum subtracted first; with inPlace the result takes over X's numbers (X keeps only its gradient, which is all its backward step needs).
  function softmaxRows(X, T, inPlace) {
    const n = X.rows, d = X.cols, x = X.data;
    const Y = new Mat(n, d, inPlace ? x : null);
    if (inPlace) X.data = null;
    const y = Y.data;
    for (let i = 0; i < n; i++) {
      const o = i * d;
      let mx = -Infinity;
      for (let j = 0; j < d; j++) {
        const z = x[o + j] / T;
        y[o + j] = z;
        if (z > mx) mx = z;
      }
      let s = 0;
      for (let j = 0; j < d; j++) {
        const e = exp(y[o + j] - mx);
        y[o + j] = e;
        s += e;
      }
      for (let j = 0; j < d; j++) y[o + j] /= s;
    }
    return onTape(Y, [X], function () {
      const g = Y.grad, gx = gradOf(X);
      for (let i = 0; i < n; i++) {
        const o = i * d;
        const gy = dotAt(g, o, y, o, d);
        for (let j = 0; j < d; j++) gx[o + j] += y[o + j] * (g[o + j] - gy) / T;
      }
    }, 2 * n * d);
  }

  // logOf(X): the natural logarithm of every entry.
  function logOf(X) {
    const x = X.data;
    const Y = new Mat(X.rows, X.cols);
    const y = Y.data;
    for (let i = 0; i < x.length; i++) y[i] = log(x[i]);
    return onTape(Y, [X], function () {
      const g = Y.grad, gx = gradOf(X);
      for (let i = 0; i < x.length; i++) gx[i] += g[i] / x[i];
    });
  }

  // sumAll(X): the sum of every entry, as a 1 x 1 matrix.
  function sumAll(X) {
    const x = X.data;
    let s = 0;
    for (let i = 0; i < x.length; i++) s += x[i];
    const Y = new Mat(1, 1, new F64([s]));
    return onTape(Y, [X], function () {
      const g = Y.grad[0], gx = gradOf(X);
      for (let i = 0; i < gx.length; i++) gx[i] += g;
    }, x.length);
  }

  // meanAll(X): the mean of every entry, as a 1 x 1 matrix.
  function meanAll(X) {
    const x = X.data, n = x.length;
    let s = 0;
    for (let i = 0; i < n; i++) s += x[i];
    const Y = new Mat(1, 1, new F64([s / n]));
    return onTape(Y, [X], function () {
      const g = Y.grad[0] / n, gx = gradOf(X);
      for (let i = 0; i < n; i++) gx[i] += g;
    }, n);
  }

  // sumRows(X): the sum of each row, as an n x 1 matrix.
  function sumRows(X) {
    const n = X.rows, d = X.cols, x = X.data;
    const Y = new Mat(n, 1);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let j = 0; j < d; j++) s += x[i * d + j];
      Y.data[i] = s;
    }
    return onTape(Y, [X], function () {
      const g = Y.grad, gx = gradOf(X);
      for (let i = 0; i < n; i++) for (let j = 0; j < d; j++) gx[i * d + j] += g[i];
    }, n * d);
  }

  // gatherRows(X, idx): the rows idx[0], idx[1], ... of X (repeats allowed; their gradients add up).
  function gatherRows(X, idx) {
    const d = X.cols, x = X.data, ix = Array.from(idx);
    const Y = new Mat(ix.length, d);
    ix.forEach(function (src, r) {
      if (!(src >= 0 && src < X.rows)) throw new RangeError('gatherRows: row ' + src + ' of ' + X.rows);
      Y.data.set(x.subarray(src * d, src * d + d), r * d);
    });
    return onTape(Y, [X], function () {
      const g = Y.grad, gx = gradOf(X);
      ix.forEach(function (src, r) { axpyAt(gx, src * d, 1, g, r * d, d); });
    });
  }

  // concatRows(list): the matrices stacked top to bottom.
  function concatRows(list) {
    const d = list[0].cols;
    let n = 0;
    list.forEach(function (m) {
      if (m.cols !== d) throw new RangeError('concatRows: ' + m.cols + ' columns among ' + d);
      n += m.rows;
    });
    const Y = new Mat(n, d);
    let off = 0;
    list.forEach(function (m) {
      Y.data.set(m.data, off);
      off += m.rows * d;
    });
    return onTape(Y, list, function () {
      const g = Y.grad;
      let o = 0;
      list.forEach(function (m) {
        const len = m.rows * d;
        if (needs(m)) {
          const gm = gradOf(m);
          for (let i = 0; i < len; i++) gm[i] += g[o + i];
        }
        o += len;
      });
    });
  }

  // colSlice(X, from, width): the columns from .. from + width - 1.
  function colSlice(X, from, width) {
    const n = X.rows, d = X.cols, x = X.data;
    if (from < 0 || from + width > d) throw new RangeError('colSlice: columns ' + from + ' to ' + (from + width - 1) + ' of ' + d);
    const Y = new Mat(n, width);
    for (let i = 0; i < n; i++) Y.data.set(x.subarray(i * d + from, i * d + from + width), i * width);
    return onTape(Y, [X], function () {
      const g = Y.grad, gx = gradOf(X);
      for (let i = 0; i < n; i++) axpyAt(gx, i * d + from, 1, g, i * width, width);
    });
  }

  // concatCols(list): the matrices side by side.
  function concatCols(list) {
    const n = list[0].rows;
    let d = 0;
    list.forEach(function (m) {
      if (m.rows !== n) throw new RangeError('concatCols: ' + m.rows + ' rows among ' + n);
      d += m.cols;
    });
    const Y = new Mat(n, d);
    let off = 0;
    list.forEach(function (m) {
      for (let i = 0; i < n; i++) Y.data.set(m.data.subarray(i * m.cols, (i + 1) * m.cols), i * d + off);
      off += m.cols;
    });
    return onTape(Y, list, function () {
      const g = Y.grad;
      let o = 0;
      list.forEach(function (m) {
        if (needs(m)) {
          const gm = gradOf(m);
          for (let i = 0; i < n; i++) axpyAt(gm, i * m.cols, 1, g, i * d + o, m.cols);
        }
        o += m.cols;
      });
    });
  }

  // l2NormaliseRows(X, eps): every row divided by max(its length, eps), as torch's F.normalize (eps 1e-12) and weight_norm (no eps) do.
  function l2NormaliseRows(X, eps) {
    const n = X.rows, d = X.cols, x = X.data;
    const Y = new Mat(n, d);
    const y = Y.data;
    const len = new F64(n);
    for (let i = 0; i < n; i++) {
      const o = i * d;
      const norm = sqrt(dotAt(x, o, x, o, d));
      len[i] = norm;
      const den = mathMax(norm, eps);
      for (let j = 0; j < d; j++) y[o + j] = x[o + j] / den;
    }
    return onTape(Y, [X], function () {
      const g = Y.grad, gx = gradOf(X);
      for (let i = 0; i < n; i++) {
        const o = i * d;
        if (len[i] > eps) {
          const yg = dotAt(y, o, g, o, d);
          for (let j = 0; j < d; j++) gx[o + j] += (g[o + j] - y[o + j] * yg) / len[i];
        } else {
          for (let j = 0; j < d; j++) gx[o + j] += g[o + j] / eps;
        }
      }
    }, 3 * n * d);
  }

  // ------------------------------------------------------------------ the network's layers

  // linear(X, W, b): X W^T + b, a torch nn.Linear (W: out x in, b: one row of out); no bias when b is null.
  function linear(X, W, b) {
    const y = matmulT(X, W);
    if (!b) return y;
    const out = add(y, b);
    release(y);
    return out;
  }

  // branch(y, m): a residual branch through stochastic depth: y itself without a draw, y / (1 - rate) when kept, 0 when dropped (torch's drop_path).
  function branch(y, m) {
    return (!m || m.factor === 1) ? y : mulScalar(y, m.factor);
  }

  // copyColumns(m, from, width): a plain copy of columns from .. from + width - 1 (for a record; no tape).
  function copyColumns(m, from, width) {
    const out = new Mat(m.rows, width);
    for (let i = 0; i < m.rows; i++) out.data.set(m.data.subarray(i * m.cols + from, i * m.cols + from + width), i * width);
    return out;
  }

  // attention(q, k, v, W): multi-head attention composed from the ops: per head, softmax((q_h / sqrt(headDim)) k_h^T) v_h, the heads side by side; returns {out, maps}. The weighted sum a v_h is taken as a (v_h^T)^T, the same numbers with long inner loops.
  function attention(q, k, v, W) {
    const hd = W.headDim, scale = pow(hd, -0.5);
    const maps = [], outs = [];
    for (let h = 0; h < W.heads; h++) {
      const qh = mulScalar(colSlice(q, h * hd, hd), scale);
      const a = softmaxRows(matmul(qh, transpose(colSlice(k, h * hd, hd))), 1, true);
      maps.push(a);
      outs.push(matmulT(a, transpose(colSlice(v, h * hd, hd))));
    }
    return { out: concatCols(outs), maps: maps };
  }

  // vitBlock(P, pre, x, W, mask, rec): one pre-norm Transformer block: x + attention(LN(x)), then + MLP(LN(.)), each branch through stochastic depth when a mask is given; fills rec when given.
  function vitBlock(P, pre, x, W, mask, rec) {
    const D = W.D;
    const eps = RECIPE.layerNormEps;
    const ln1 = layerNorm(x, P[pre + 'norm1.weight'], P[pre + 'norm1.bias'], eps);
    const qkv = linear(ln1, P[pre + 'attn.qkv.weight'], P[pre + 'attn.qkv.bias']);
    const q = colSlice(qkv, 0, D), k = colSlice(qkv, D, D), v = colSlice(qkv, 2 * D, D);
    const att = attention(q, k, v, W);
    const proj = linear(att.out, P[pre + 'attn.proj.weight'], P[pre + 'attn.proj.bias']);
    const afterAttn = add(x, branch(proj, mask ? mask.attn : null));
    const ln2 = layerNorm(afterAttn, P[pre + 'norm2.weight'], P[pre + 'norm2.bias'], eps);
    const hidden = gelu(linear(ln2, P[pre + 'mlp.fc1.weight'], P[pre + 'mlp.fc1.bias']));
    const mlpOut = linear(hidden, P[pre + 'mlp.fc2.weight'], P[pre + 'mlp.fc2.bias']);
    const out = add(afterAttn, branch(mlpOut, mask ? mask.mlp : null));
    if (rec) {
      rec.input = x;
      rec.ln1 = ln1;
      rec.q = copyColumns(qkv, 0, D);
      rec.k = copyColumns(qkv, D, D);
      rec.v = copyColumns(qkv, 2 * D, D);
      rec.attn = att.maps;
      rec.attnOut = att.out;
      rec.proj = proj;
      rec.afterAttn = afterAttn;
      rec.ln2 = ln2;
      rec.hidden = hidden;
      rec.mlpOut = mlpOut;
      rec.out = out;
      rec.rate = mask ? mask.rate : 0;
      rec.skipped = { attn: !!(mask && !mask.attn.keep), mlp: !!(mask && !mask.mlp.keep) };
      rec.factor = { attn: mask ? mask.attn.factor : 1, mlp: mask ? mask.mlp.factor : 1 };
    }
    return out;
  }

  // caBlock(P, pre, query, X, W, rec): one class-attention block: the query row attends over [query; X] (LayerNorm, separate q, k and v, projection), then an MLP; the residuals change the query only; fills rec when given.
  function caBlock(P, pre, query, X, W, rec) {
    const eps = RECIPE.layerNormEps;
    const u = concatRows([query, X]);
    const un = layerNorm(u, P[pre + 'norm1.weight'], P[pre + 'norm1.bias'], eps);
    const q = linear(gatherRows(un, [0]), P[pre + 'attn.q.weight'], P[pre + 'attn.q.bias']);
    const k = linear(un, P[pre + 'attn.k.weight'], P[pre + 'attn.k.bias']);
    const v = linear(un, P[pre + 'attn.v.weight'], P[pre + 'attn.v.bias']);
    const att = attention(q, k, v, W);
    const proj = linear(att.out, P[pre + 'attn.proj.weight'], P[pre + 'attn.proj.bias']);
    const afterAttn = add(query, proj);
    const ln2 = layerNorm(afterAttn, P[pre + 'norm2.weight'], P[pre + 'norm2.bias'], eps);
    const hidden = gelu(linear(ln2, P[pre + 'mlp.fc1.weight'], P[pre + 'mlp.fc1.bias']));
    const mlpOut = linear(hidden, P[pre + 'mlp.fc2.weight'], P[pre + 'mlp.fc2.bias']);
    const out = add(afterAttn, mlpOut);
    if (rec) {
      rec.input = query;
      rec.lnRows = un;
      rec.q = q;
      rec.k = k;
      rec.v = v;
      rec.attn = att.maps;
      rec.attnOut = att.out;
      rec.proj = proj;
      rec.afterAttn = afterAttn;
      rec.ln2 = ln2;
      rec.hidden = hidden;
      rec.mlpOut = mlpOut;
      rec.out = out;
    }
    return { query: out, maps: att.maps };
  }

  // aggModule(P, W, X, recs): the aggregation module: its learned query token through the class-attention blocks over the rows X, then the module's final LayerNorm; returns {query (before that LayerNorm), vector (after it), maps (per block, per head: 1 x (1 + rows))}; pushes a record per block into recs when given.
  function aggModule(P, W, X, recs) {
    let query = P['ca_head.cls_token'];
    const maps = [];
    for (let b = 0; b < W.aggBlocks; b++) {
      const rec = recs ? { index: b } : null;
      const r = caBlock(P, 'ca_head.cls_blocks.' + b + '.', query, X, W, rec);
      query = r.query;
      maps.push(r.maps);
      if (recs) recs.push(rec);
    }
    const vector = layerNorm(query, P['ca_head.norm.weight'], P['ca_head.norm.bias'], RECIPE.layerNormEps);
    return { query: query, vector: vector, maps: maps };
  }

  // flatMaps(maps): the aggregation module's attention weights as one Float64Array, block by block, head by head, row by row.
  function flatMaps(maps) {
    const parts = [];
    maps.forEach(function (heads) { heads.forEach(function (m) { parts.push(m.data); }); });
    const out = new F64(parts.reduce(function (s, p) { return s + p.length; }, 0));
    let o = 0;
    parts.forEach(function (p) {
      out.set(p, o);
      o += p.length;
    });
    return out;
  }

  // projHead(P, pre, X, W): a projection head on every row of X: Linear, GELU, Linear, GELU, Linear to the bottleneck, L2 normalisation, then the scores against the unit-length prototypes (a weight-normalised last layer whose gain stays 1); returns {hidden1, hidden2, bottleneck, unit, scores}.
  function projHead(P, pre, X, W) {
    const hidden1 = gelu(linear(X, P[pre + 'mlp.0.weight'], P[pre + 'mlp.0.bias']));
    const hidden2 = gelu(linear(hidden1, P[pre + 'mlp.2.weight'], P[pre + 'mlp.2.bias']));
    const bottleneck = linear(hidden2, P[pre + 'mlp.4.weight'], P[pre + 'mlp.4.bias']);
    const unit = l2NormaliseRows(bottleneck, RECIPE.normaliseEps);
    const prototypes = l2NormaliseRows(P[pre + 'last_layer.weight_v'], 0);
    return { hidden1: hidden1, hidden2: hidden2, bottleneck: bottleneck, unit: unit, scores: matmulT(unit, prototypes) };
  }

  // headPrefix(net, which): the tensor-name prefix of the image-level ('image') or patch-level ('patch') head of the wiring.
  function headPrefix(net, which) {
    if (which === 'image') return net.wiring === 'dino' ? 'head.' : 'c_head.';
    if (which === 'patch') {
      if (net.wiring === 'dino') throw new Error('the DINO wiring has no patch-level head: DINO trains the image-level token only');
      return 'p_head.';
    }
    throw new RangeError("the head must be 'image' or 'patch'");
  }

  // ------------------------------------------------------------------ patches and position rows

  // patchMatrix(img, g): the g * g patches of a square crop as a g*g x 768 matrix of normalised values ((byte / 255 - mean) / std per channel, ImageNet's), each row in the order the real 16 x 16 convolution reads a patch: channel, then row, then column.
  function patchMatrix(img, g) {
    const C = core().constants;
    const mean = C.imagenetMean, std = C.imagenetStd;
    const side = img.width, d = img.data;
    const X = new Mat(g * g, PATCH_VALUES);
    const x = X.data;
    for (let r = 0; r < g; r++) {
      for (let c = 0; c < g; c++) {
        const o = (r * g + c) * PATCH_VALUES;
        for (let ch = 0; ch < CHANNELS; ch++) {
          for (let yy = 0; yy < PATCH; yy++) {
            let k = ((r * PATCH + yy) * side + c * PATCH) * 4 + ch;
            const base = o + ch * PATCH * PATCH + yy * PATCH;
            for (let xx = 0; xx < PATCH; xx++, k += 4) x[base + xx] = (d[k] / 255 - mean[ch]) / std[ch];
          }
        }
      }
    }
    return X;
  }

  const BICUBIC = Object.create(null);

  // cubicNear(x): torch's cubic convolution weight for a tap at distance x <= 1 (A = -0.75).
  function cubicNear(x) {
    return ((CUBIC_A + 2) * x - (CUBIC_A + 3)) * x * x + 1;
  }

  // cubicFar(x): torch's cubic convolution weight for a tap at distance 1 < x < 2 (A = -0.75).
  function cubicFar(x) {
    return ((CUBIC_A * x - 5 * CUBIC_A) * x + 8 * CUBIC_A) * x - 4 * CUBIC_A;
  }

  // bicubicTaps(gIn, gOut): per output coordinate, the 4 source indices (clamped to the border) and weights of torch's bicubic resize from gIn to gOut with scale factor (gOut + 0.1) / gIn and align_corners False (source index (o + 0.5) / factor - 0.5).
  function bicubicTaps(gIn, gOut) {
    const factor = (gOut + POS_OFFSET) / gIn;
    if (floor(gIn * factor) !== gOut) throw new RangeError('bicubic: ' + gIn + ' does not resize to ' + gOut);
    const scale = 1 / factor;
    const taps = [];
    for (let o = 0; o < gOut; o++) {
      const real = scale * (o + 0.5) - 0.5;
      const i0 = mathMin(floor(real), gIn - 1);
      const t = mathMin(mathMax(real - i0, 0), 1);
      const index = [];
      for (let j = -1; j <= 2; j++) index.push(mathMin(mathMax(i0 + j, 0), gIn - 1));
      taps.push({ index: index, weight: [cubicFar(t + 1), cubicNear(t), cubicNear(1 - t), cubicFar(2 - t)] });
    }
    return taps;
  }

  // bicubicMatrix(gIn, gOut): the (gOut*gOut) x (gIn*gIn) constant that maps a gIn x gIn position table (rows in grid order) to gOut x gOut rows as interpolate_pos_encoding does (cached; never on a tape).
  function bicubicMatrix(gIn, gOut) {
    const key = gIn + '>' + gOut;
    if (BICUBIC[key]) return BICUBIC[key];
    const taps = bicubicTaps(gIn, gOut);
    const M = new Mat(gOut * gOut, gIn * gIn);
    for (let oy = 0; oy < gOut; oy++) {
      for (let ox = 0; ox < gOut; ox++) {
        const row = (oy * gOut + ox) * gIn * gIn;
        for (let a = 0; a < 4; a++) {
          for (let b = 0; b < 4; b++) M.data[row + taps[oy].index[a] * gIn + taps[ox].index[b]] += taps[oy].weight[a] * taps[ox].weight[b];
        }
      }
    }
    BICUBIC[key] = M;
    return M;
  }

  // rangeOf(from, to): the integers from .. to - 1.
  function rangeOf(from, to) {
    const out = [];
    for (let i = from; i < to; i++) out.push(i);
    return out;
  }

  // netEmbed(P, net, crop): the crop's patches, their projections (the 768 -> D map), the tokens (projections plus position rows; DINO: its class token first, with its own row) and the position rows used ('table' at the table's grid, 'bicubic' otherwise).
  function netEmbed(P, net, crop) {
    const X = patchMatrix(crop.imageData, crop.g);
    const projected = linear(X, P['backbone.patch_embed.proj.weight'], P['backbone.patch_embed.proj.bias']);
    let tokens = projected;
    const table = P['backbone.pos_embed'];
    const G = net.grid, N = G * G;
    let pos;
    if (crop.g === G) pos = table;
    else if (net.wiring === 'dino') pos = concatRows([gatherRows(table, [0]), matmul(bicubicMatrix(G, crop.g), gatherRows(table, rangeOf(1, N + 1)))]);
    else pos = matmul(bicubicMatrix(G, crop.g), table);
    if (net.wiring === 'dino') tokens = concatRows([P['backbone.cls_token'], tokens]);
    return {
      patches: X, projected: projected, tokens0: add(tokens, pos), pos: pos, posMode: crop.g === G ? 'table' : 'bicubic',
      g: crop.g, n: crop.n, hasCls: net.wiring === 'dino'
    };
  }

  // ------------------------------------------------------------------ forward passes (generators that pause between blocks)

  // noTick(): the progress value of a pass that nobody watches.
  function noTick() {
    return null;
  }

  // runAll(task): drive a generator to its end; returns its value.
  function runAll(task) {
    let r = task.next();
    while (!r.done) r = task.next();
    return r.value;
  }

  // backboneTask(P, net, tokens0, masks, record, tick, phase, crop): the 12 blocks (and DINO's final LayerNorm), pausing after each block; returns {tokens, blocks, final}.
  function* backboneTask(P, net, tokens0, masks, record, tick, phase, crop) {
    const W = net.widths;
    let x = tokens0;
    const blocks = [];
    for (let b = 0; b < W.blocks; b++) {
      const rec = record ? { index: b } : null;
      x = vitBlock(P, 'backbone.blocks.' + b + '.', x, W, masks ? masks[b] : null, rec);
      if (rec) blocks.push(rec);
      yield tick(phase, crop, b);
    }
    if (net.wiring !== 'dino') return { tokens: x, blocks: blocks, final: null };
    const tokens = layerNorm(x, P['backbone.norm.weight'], P['backbone.norm.bias'], RECIPE.layerNormEps);
    return { tokens: tokens, blocks: blocks, final: { input: x, output: tokens } };
  }

  // teacherCropTask(P, net, crop, tick): the teacher's pass on one crop, without gradient: its tokens; under SelfPatch also the selection, every anchor's target (the aggregation module over its positives, then the module's LayerNorm) with the patch head's scores, and the image-level token (the module over all tokens) with the image head's scores.
  function* teacherCropTask(P, net, crop, tick) {
    const W = net.widths;
    const e = netEmbed(P, net, crop);
    const bb = yield* backboneTask(P, net, e.tokens0, null, false, tick, 'teacher', crop.position);
    if (net.wiring === 'dino') {
      const cls = gatherRows(bb.tokens, [0]);
      return { tokens: bb.tokens, final: bb.final, selection: null, targets: null, patchScores: null,
        image: { vector: cls.data, query: null, attn: null, scores: projHead(P, headPrefix(net, 'image'), cls, W).scores } };
    }
    const sel = selectFrom(bb.tokens, crop.g, net.k);
    const n = crop.n, k = net.k, per = W.aggBlocks * W.heads * (1 + k);
    const vectors = new Mat(n, W.D);
    const attn = new F64(n * per);
    for (let i = 0; i < n; i++) {
      const agg = aggModule(P, W, gatherRows(bb.tokens, sel.positives.subarray(i * k, (i + 1) * k)), null);
      vectors.data.set(agg.vector.data, i * W.D);
      attn.set(flatMaps(agg.maps), i * per);
      if ((i + 1) % ANCHOR_CHUNK === 0 && i + 1 < n) yield tick('targets', crop.position, i + 1);
    }
    yield tick('targets', crop.position, n);
    const img = aggModule(P, W, bb.tokens, null);
    return {
      tokens: bb.tokens, final: null, selection: sel,
      targets: { vectors: vectors, attn: attn },
      patchScores: projHead(P, headPrefix(net, 'patch'), vectors, W).scores,
      image: { vector: img.vector.data, query: img.query.data, attn: flatMaps(img.maps), scores: projHead(P, headPrefix(net, 'image'), img.vector, W).scores }
    };
  }

  // studentCropTask(P, net, crop, masks, record, tick, phase): the student's pass on one crop (recorded on P's tape when P has one): tokens, block records, the image-level token and the scores of both heads; under SelfPatch the patch rows go through the aggregation module's final LayerNorm first, as the official code does.
  function* studentCropTask(P, net, crop, masks, record, tick, phase) {
    const W = net.widths;
    const e = netEmbed(P, net, crop);
    const bb = yield* backboneTask(P, net, e.tokens0, masks, record, tick, phase, crop.position);
    if (net.wiring === 'dino') {
      const cls = gatherRows(bb.tokens, [0]);
      return { embed: e, backbone: bb, image: { vector: cls, query: null, maps: null }, imageScores: projHead(P, headPrefix(net, 'image'), cls, W).scores,
        patchRows: null, patchScores: null };
    }
    const agg = aggModule(P, W, bb.tokens, null);
    const patchRows = layerNorm(bb.tokens, P['ca_head.norm.weight'], P['ca_head.norm.bias'], RECIPE.layerNormEps);
    return {
      embed: e, backbone: bb, image: { vector: agg.vector, query: agg.query, maps: agg.maps },
      imageScores: projHead(P, headPrefix(net, 'image'), agg.vector, W).scores,
      patchRows: patchRows, patchScores: projHead(P, headPrefix(net, 'patch'), patchRows, W).scores
    };
  }

  // ------------------------------------------------------------------ selection

  // windowCells(index, g): the 8 cells of the wrapped 3 x 3 window around index on a g x g grid, in increasing flat index (the official table's order), with whether each wrapped across the border; below 3 x 3 some cells repeat.
  function windowCells(index, g) {
    const r = floor(index / g), c = index % g;
    const out = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const rr = r + dr, cc = c + dc;
        out.push({ index: ((rr + g) % g) * g + ((cc + g) % g), wrapped: rr < 0 || rr >= g || cc < 0 || cc >= g });
      }
    }
    return out.sort(function (a, b) { return a.index - b.index; });
  }

  // rankColumns(values, off, w): the columns 0 .. w-1 of values[off ..] sorted largest first, ties to the lower column, NaN last (as Core.rankRow).
  function rankColumns(values, off, w) {
    const idx = rangeOf(0, w);
    idx.sort(function (a, b) {
      const va = values[off + a], vb = values[off + b];
      const na = va !== va, nb = vb !== vb;
      if (na || nb) return (na && nb) ? a - b : (na ? 1 : -1);
      if (va > vb) return -1;
      if (va < vb) return 1;
      return a - b;
    });
    return idx;
  }

  // selectFrom(X, g, k): SelfPatch's row rule on the n = g * g tokens X: each anchor's 8 window candidates, their cosines (rows normalised as F.normalize does, then dot products), the ranking and the top k as positives.
  function selectFrom(X, g, k) {
    const n = X.rows, d = X.cols, x = X.data;
    if (g * g !== n) throw new RangeError('the selection needs g * g token rows (' + g + ' x ' + g + ' against ' + n + ')');
    if (!(isInteger(k) && k >= 1 && k <= WINDOW)) throw new RangeError('k must be an integer from 1 to ' + WINDOW);
    const U = new F64(n * d);
    for (let i = 0; i < n; i++) {
      const den = mathMax(sqrt(dotAt(x, i * d, x, i * d, d)), RECIPE.normaliseEps);
      for (let j = 0; j < d; j++) U[i * d + j] = x[i * d + j] / den;
    }
    const candidates = new I32(n * WINDOW), wrapped = new U8(n * WINDOW), cosines = new F64(n * WINDOW);
    const ranking = new I32(n * WINDOW), mask = new U8(n * WINDOW), positives = new I32(n * k);
    for (let i = 0; i < n; i++) {
      const cells = windowCells(i, g);
      for (let c = 0; c < WINDOW; c++) {
        candidates[i * WINDOW + c] = cells[c].index;
        wrapped[i * WINDOW + c] = cells[c].wrapped ? 1 : 0;
        cosines[i * WINDOW + c] = dotAt(U, cells[c].index * d, U, i * d, d);
      }
      const order = rankColumns(cosines, i * WINDOW, WINDOW);
      for (let r = 0; r < WINDOW; r++) ranking[i * WINDOW + r] = order[r];
      for (let r = 0; r < k; r++) {
        mask[i * WINDOW + order[r]] = 1;
        positives[i * k + r] = candidates[i * WINDOW + order[r]];
      }
    }
    return { g: g, n: n, k: k, width: WINDOW, candidates: candidates, wrapped: wrapped, cosines: cosines, ranking: ranking, mask: mask, positives: positives };
  }

  // ------------------------------------------------------------------ targets, losses and centres

  // centredSoftmax(S, centre, T): softmax((scores - centre) / T) of every row of S (the teacher's centring and sharpening; no tape).
  function centredSoftmax(S, centre, T) {
    const n = S.rows, K = S.cols;
    const Z = new Mat(n, K);
    for (let i = 0; i < n; i++) for (let j = 0; j < K; j++) Z.data[i * K + j] = S.data[i * K + j] - centre[j];
    return softmaxRows(Z, T);
  }

  // makeTargets(net, list, T, centres): what the student is scored against: the teacher's probabilities softmax((scores - centre) / 0.04) for the image-level token of each global crop and, under SelfPatch, for every anchor of every crop; with the image-level pairs (teacher global crop, student crop), a crop never paired with itself.
  function makeTargets(net, list, T, centres) {
    const Tt = RECIPE.tempTeacher, G = RECIPE.globalCrops;
    const pairs = [];
    for (let iq = 0; iq < G; iq++) for (let v = 0; v < list.length; v++) if (v !== iq) pairs.push([iq, v]);
    const image = list.map(function (c, i) {
      return i < G ? centredSoftmax(new Mat(1, T[i].image.scores.cols, T[i].image.scores.data), centres.image, Tt).data : null;
    });
    const patch = net.wiring === 'selfpatch' ? list.map(function (c, i) { return centredSoftmax(T[i].patchScores, centres.patch, Tt); }) : null;
    return {
      wiring: net.wiring, pairs: pairs, image: image, patch: patch, tempTeacher: Tt, tempStudent: RECIPE.tempStudent, lambda: RECIPE.lambda,
      centres: { image: F64.from(centres.image), patch: centres.patch ? F64.from(centres.patch) : null }
    };
  }

  // lossTerms(net, S, targets): the step's losses as ops (on the student's tape when S has one): each image-level pair's cross-entropy, each anchor's and each crop's patch loss, L_global (the mean over the pairs), L_patch (the mean over the crops) and L = L_global + 0.1 L_patch.
  function lossTerms(net, S, targets) {
    const Ts = targets.tempStudent;
    const pairTerms = targets.pairs.map(function (pr) {
      const logp = logOf(softmaxRows(S[pr[1]].imageScores, Ts));
      return mulScalar(sumRows(mulConst(logp, targets.image[pr[0]])), -1);
    });
    const L_global = mulScalar(sumAll(concatRows(pairTerms)), 1 / pairTerms.length);
    if (net.wiring !== 'selfpatch') return { pairTerms: pairTerms, anchorTerms: null, cropTerms: null, L_global: L_global, L_patch: null, L: L_global };
    const anchorTerms = S.map(function (s, c) {
      const logp = logOf(softmaxRows(s.patchScores, Ts));
      return mulScalar(sumRows(mulConst(logp, targets.patch[c])), -1);
    });
    const cropTerms = anchorTerms.map(meanAll);
    const L_patch = mulScalar(sumAll(concatRows(cropTerms)), 1 / cropTerms.length);
    return { pairTerms: pairTerms, anchorTerms: anchorTerms, cropTerms: cropTerms, L_global: L_global, L_patch: L_patch, L: add(L_global, mulScalar(L_patch, targets.lambda)) };
  }

  // lossNumbers(terms, targets): the plain numbers of lossTerms: the pairs, per-anchor and per-crop patch losses, L_global, L_patch and L.
  function lossNumbers(terms, targets) {
    return {
      pairs: targets.pairs.map(function (pr, i) { return { teacher: pr[0], student: pr[1], ce: terms.pairTerms[i].data[0] }; }),
      perAnchor: terms.anchorTerms ? terms.anchorTerms.map(function (m) { return F64.from(m.data); }) : null,
      perCrop: terms.cropTerms ? terms.cropTerms.map(function (m) { return m.data[0]; }) : null,
      L_global: terms.L_global.data[0],
      L_patch: terms.L_patch ? terms.L_patch.data[0] : null,
      L: terms.L.data[0]
    };
  }

  // updateCentres(net, T, centres): the two centres after the step, each centre * 0.9 + batch mean * (1 - 0.9): the image-level mean over the teacher's image-level scores of every crop it saw, the patch-level mean over every anchor row of every crop (SelfPatch).
  function updateCentres(net, T, centres) {
    const m = RECIPE.centreMomentum;
    const seen = T.filter(function (t) { return t !== null; });
    // move(before, mean): the rate-0.9 update of one centre.
    const move = function (before, mean) { return F64.from(before, function (c, j) { return c * m + mean[j] * (1 - m); }); };
    const K = centres.image.length;
    const meanI = new F64(K);
    seen.forEach(function (t) { for (let j = 0; j < K; j++) meanI[j] += t.image.scores.data[j]; });
    for (let j = 0; j < K; j++) meanI[j] /= seen.length;
    const image = { before: F64.from(centres.image), batchMean: meanI, after: move(centres.image, meanI), crops: seen.length };
    if (net.wiring !== 'selfpatch') return { image: image, patch: null };
    const KP = centres.patch.length;
    const meanP = new F64(KP);
    let rows = 0;
    seen.forEach(function (t) {
      const s = t.patchScores;
      for (let i = 0; i < s.rows; i++) for (let j = 0; j < KP; j++) meanP[j] += s.data[i * KP + j];
      rows += s.rows;
    });
    for (let j = 0; j < KP; j++) meanP[j] /= rows;
    return { image: image, patch: { before: F64.from(centres.patch), batchMean: meanP, after: move(centres.patch, meanP), rows: rows } };
  }

  // ------------------------------------------------------------------ parameters

  // truncNormal(r, std, bound): a normal draw of the given std, drawn again while outside [-bound, bound] (trunc_normal_ with DINO's absolute bounds -2 and 2).
  function truncNormal(r, std, bound) {
    let x;
    do { x = r.normal() * std; } while (x < -bound || x > bound);
    return x;
  }

  // widthsOf(config): the widths of a network: WIDTHS, with any of its keys overridden by config (the tests' tiny configuration).
  function widthsOf(config) {
    const W = {};
    WIDTH_KEYS.forEach(function (k) {
      const v = config && config[k] !== undefined ? config[k] : WIDTHS[k];
      if (!(isInteger(v) && v >= 1)) throw new RangeError('width ' + k + ' must be a positive integer');
      W[k] = v;
    });
    if (W.heads * W.headDim !== W.D) throw new RangeError('heads x headDim must equal D');
    return Object.freeze(W);
  }

  // tensorSpecs(wiring, W, grid): the student's named tensors in torch's named_parameters order: rows x cols (a tensor of more dimensions is stored as the matrix its maths uses), torch's shape, whether AdamW decays it (two or more dimensions and not a bias), its kind, how it starts and the key of its random draws (shared by both wirings).
  function tensorSpecs(wiring, W, grid) {
    const D = W.D, N = grid * grid;
    const specs = [];
    // put(name, rows, cols, shape, init, kind, key): add one tensor.
    const put = function (name, rows, cols, shape, init, kind, key) {
      specs.push({ name: name, rows: rows, cols: cols, shape: shape, init: init, kind: kind, key: key || name,
        decay: !/\.bias$/.test(name) && shape.length > 1 });
    };
    // norm(pre): a LayerNorm's weight and bias.
    const norm = function (pre) {
      put(pre + '.weight', 1, D, [D], 'ones', 'LayerNorm weight');
      put(pre + '.bias', 1, D, [D], 'zeros', 'LayerNorm bias');
    };
    // lin(pre, out, inp, kind): a Linear layer's weight and bias.
    const lin = function (pre, out, inp, kind, key) {
      put(pre + '.weight', out, inp, [out, inp], 'normal', kind + ' weight', key ? key + '.weight' : null);
      put(pre + '.bias', 1, out, [out], 'zeros', kind + ' bias', key ? key + '.bias' : null);
    };
    // head(pre, K, key): a projection head: three Linear layers and the prototype directions.
    const head = function (pre, K, key) {
      lin(pre + 'mlp.0', W.headHidden, D, 'head', key + 'mlp.0');
      lin(pre + 'mlp.2', W.headHidden, W.headHidden, 'head', key + 'mlp.2');
      lin(pre + 'mlp.4', W.bottleneck, W.headHidden, 'head', key + 'mlp.4');
      put(pre + 'last_layer.weight_v', K, W.bottleneck, [K, W.bottleneck], 'prototypes', 'prototypes', key + 'last_layer.weight_v');
    };
    if (wiring === 'dino') put('backbone.cls_token', 1, D, [1, 1, D], 'normal', 'class token');
    put('backbone.pos_embed', wiring === 'dino' ? N + 1 : N, D, [1, wiring === 'dino' ? N + 1 : N, D], 'position', 'position table');
    put('backbone.patch_embed.proj.weight', D, PATCH_VALUES, [D, CHANNELS, PATCH, PATCH], 'normal', 'patch embedding weight');
    put('backbone.patch_embed.proj.bias', 1, D, [D], 'zeros', 'patch embedding bias');
    for (let b = 0; b < W.blocks; b++) {
      const p = 'backbone.blocks.' + b + '.';
      norm(p + 'norm1');
      lin(p + 'attn.qkv', 3 * D, D, 'attention');
      lin(p + 'attn.proj', D, D, 'attention');
      norm(p + 'norm2');
      lin(p + 'mlp.fc1', W.mlp, D, 'MLP');
      lin(p + 'mlp.fc2', D, W.mlp, 'MLP');
    }
    if (wiring === 'dino') {
      norm('backbone.norm');
      head('head.', W.kImage, 'c_head.');
      return specs;
    }
    put('ca_head.cls_token', 1, D, [1, 1, D], 'normal', 'query token');
    for (let b = 0; b < W.aggBlocks; b++) {
      const p = 'ca_head.cls_blocks.' + b + '.';
      norm(p + 'norm1');
      lin(p + 'attn.q', D, D, 'class-attention');
      lin(p + 'attn.k', D, D, 'class-attention');
      lin(p + 'attn.v', D, D, 'class-attention');
      lin(p + 'attn.proj', D, D, 'class-attention');
      norm(p + 'norm2');
      lin(p + 'mlp.fc1', W.mlp, D, 'class-attention MLP');
      lin(p + 'mlp.fc2', D, W.mlp, 'class-attention MLP');
    }
    norm('ca_head.norm');
    head('c_head.', W.kImage, 'c_head.');
    head('p_head.', W.kPatch, 'p_head.');
    return specs;
  }

  // fillTensor(T, spec, seed, wiring): the tensor's starting numbers: 'normal' truncated normal draws of std 0.02; 'position' the same for the table (DINO's class-token row drawn apart, so both wirings share the patch rows); 'zeros'; 'ones'; 'prototypes' random unit rows. Each tensor draws from its own seeded stream.
  function fillTensor(T, spec, seed, wiring) {
    const C = core();
    const d = T.data;
    const std = RECIPE.initStd, bound = RECIPE.initBound;
    if (spec.init === 'ones') {
      d.fill(1);
    } else if (spec.init === 'normal') {
      const r = C.rng(String(seed) + '|' + spec.key);
      for (let i = 0; i < d.length; i++) d[i] = truncNormal(r, std, bound);
    } else if (spec.init === 'position') {
      const r = C.rng(String(seed) + '|' + spec.key);
      const skip = wiring === 'dino' ? T.cols : 0;
      for (let i = skip; i < d.length; i++) d[i] = truncNormal(r, std, bound);
      if (skip) {
        const rc = C.rng(String(seed) + '|' + spec.key + '|class-token-row');
        for (let i = 0; i < skip; i++) d[i] = truncNormal(rc, std, bound);
      }
    } else if (spec.init === 'prototypes') {
      const r = C.rng(String(seed) + '|' + spec.key);
      for (let i = 0; i < T.rows; i++) {
        let s = 0;
        for (let j = 0; j < T.cols; j++) {
          const v = r.normal();
          d[i * T.cols + j] = v;
          s += v * v;
        }
        const inv = 1 / sqrt(s);
        for (let j = 0; j < T.cols; j++) d[i * T.cols + j] *= inv;
      }
    }
  }

  // assemble(wiring, seed, widths, grid, k, tensors): a parameter set: its wiring, seed, widths, table grid, number of positives, tensors (in order) and the same tensors by name.
  function assemble(wiring, seed, widths, grid, k, tensors) {
    const byName = {};
    tensors.forEach(function (T) { byName[T.name] = T; });
    return { wiring: wiring, seed: seed, widths: widths, grid: grid, k: k, tensors: tensors, byName: byName };
  }

  // checkParams(p, what): p when it is a parameter set from init or cloneParams, otherwise a clear error.
  function checkParams(p, what) {
    if (!p || !isArray(p.tensors) || !p.byName || WIRINGS.indexOf(p.wiring) < 0 || !p.widths) {
      throw new TypeError((what || 'params') + ' must be a parameter set from ToyViT.init or ToyViT.cloneParams');
    }
    return p;
  }

  // netOf(params): what the forward passes need to know about a parameter set: wiring, widths, table grid and number of positives.
  function netOf(params) {
    return { wiring: params.wiring, widths: params.widths, grid: params.grid, k: params.k };
  }

  // paramMats(params, tape): every tensor as a matrix sharing its numbers, on the tape when one is given (then its gradient builds up in .grad).
  function paramMats(params, tape) {
    const P = {};
    params.tensors.forEach(function (T) {
      const m = new Mat(T.rows, T.cols, T.data);
      m.tape = tape;
      P[T.name] = m;
    });
    return P;
  }

  // ------------------------------------------------------------------ the public functions (addendum section 3)

  // init(seed, wiring, config): the student's parameters for wiring 'selfpatch' (default, our runs) or 'dino', seeded by seed; config may override the widths and set grid (the table's side, 14) and k (4) for the tests' tiny network. The teacher starts as cloneParams of it.
  function init(seed, wiring, config) {
    const w = wiring === undefined ? 'selfpatch' : String(wiring);
    if (WIRINGS.indexOf(w) < 0) throw new RangeError("the wiring must be 'selfpatch' or 'dino'");
    const s = seed === undefined ? 1 : seed;
    const widths = widthsOf(config);
    const grid = config && config.grid !== undefined ? config.grid : RECIPE.grid;
    const k = config && config.k !== undefined ? config.k : RECIPE.k;
    if (!(isInteger(grid) && grid >= 1)) throw new RangeError('grid must be a positive integer');
    if (!(isInteger(k) && k >= 1 && k <= WINDOW)) throw new RangeError('k must be an integer from 1 to ' + WINDOW);
    const tensors = tensorSpecs(w, widths, grid).map(function (spec) {
      const T = { name: spec.name, rows: spec.rows, cols: spec.cols, size: spec.rows * spec.cols, shape: spec.shape.slice(),
        decay: spec.decay, kind: spec.kind, data: new F64(spec.rows * spec.cols) };
      fillTensor(T, spec, s, w);
      return T;
    });
    return assemble(w, s, widths, grid, k, tensors);
  }

  // cloneParams(params): a copy with its own numbers (the teacher at step 0 is cloneParams of the student).
  function cloneParams(params) {
    const p = checkParams(params, 'params');
    const tensors = p.tensors.map(function (T) {
      return { name: T.name, rows: T.rows, cols: T.cols, size: T.size, shape: T.shape.slice(), decay: T.decay, kind: T.kind, data: F64.from(T.data) };
    });
    return assemble(p.wiring, p.seed, p.widths, p.grid, p.k, tensors);
  }

  // cropInfo(crop): a crop's picture and grid: {imageData, side, g, n} from the lab's crop object (or bare ImageData); the side must be a multiple of 16.
  function cropInfo(crop) {
    const img = crop && crop.imageData ? crop.imageData : crop;
    if (!img || !(img.width > 0) || img.width !== img.height || !img.data || img.data.length !== img.width * img.height * 4) {
      throw new TypeError('a crop needs square RGBA imageData');
    }
    const side = img.width;
    if (side % PATCH !== 0) throw new RangeError('a crop side must be a multiple of ' + PATCH + ' pixels, not ' + side);
    const g = side / PATCH;
    if (crop.g !== undefined && crop.g !== g) throw new RangeError('the crop says g = ' + crop.g + ' but its side gives ' + g);
    return { imageData: img, side: side, g: g, n: g * g };
  }

  // embed(params, crop): the crop cut into 16 x 16 patches (each 768 normalised values in the real convolution's order: channel, row, column), mapped to D numbers, plus the position rows (DINO: its class token first); returns {patches: n x 768, projected: n x D (before the position rows), tokens0: n (+1) x D, pos: the rows added, posMode, g, n, hasCls}.
  function embed(params, crop) {
    const net = netOf(checkParams(params, 'params'));
    const e = netEmbed(paramMats(params, null), net, cropInfo(crop));
    e.pos = copyMat(e.pos);
    return e;
  }

  // dropPathMasks(blocks, rate, r): stochastic-depth draws for one crop: block b's rate is rate * b / (blocks - 1) (torch.linspace from 0); each branch is kept when floor(1 - rate + u) = 1 for a uniform u, and then scaled by 1 / (1 - rate), or dropped (factor 0); a rate of 0 draws nothing.
  function dropPathMasks(blocks, rate, r) {
    const out = [];
    for (let b = 0; b < blocks; b++) {
      const p = blocks > 1 ? rate * b / (blocks - 1) : 0;
      // draw(): one branch's decision.
      const draw = function () {
        if (p === 0) return { keep: true, factor: 1 };
        const keep = floor(1 - p + r.next()) >= 1;
        return { keep: keep, factor: keep ? 1 / (1 - p) : 0 };
      };
      const attn = draw();
      const mlp = draw();
      out.push({ rate: p, attn: attn, mlp: mlp });
    }
    return out;
  }

  // rngOf(x): x itself when it already has next(), otherwise Core's seeded stream for x.
  function rngOf(x) {
    return x && typeof x.next === 'function' ? x : core().rng(x);
  }

  // forwardBackbone(params, tokens0, opts): the 12 blocks on tokens0 (from embed), without gradient; opts {dropPath, rng or masks, record (default true)}; returns {tokens: n x D (DINO: n + 1 rows after its final LayerNorm), blocks: per block {input, ln1, q, k, v, attn: heads x n x n, attnOut, proj, afterAttn, ln2, hidden: n x mlp (after GELU), mlpOut, out, rate, skipped, factor}, final, masks}.
  function forwardBackbone(params, tokens0, opts) {
    const o = opts || {};
    const net = netOf(checkParams(params, 'params'));
    const W = net.widths;
    const X = toMat(tokens0, W.D);
    if (X.cols !== W.D) throw new RangeError('tokens0 needs ' + W.D + ' numbers per row');
    let masks = o.masks || null;
    if (!masks && o.dropPath) masks = dropPathMasks(W.blocks, RECIPE.dropPathRate, rngOf(o.rng === undefined ? 'toyvit|droppath|' + params.seed : o.rng));
    const r = runAll(backboneTask(paramMats(params, null), net, X, masks, o.record !== false, noTick, 'backbone', -1));
    return { tokens: r.tokens, blocks: r.blocks, final: r.final, masks: masks };
  }

  // aggregate(params, tokenRows): the aggregation module (SelfPatch wiring) over a set of token rows, without gradient: the learned query attends over [query; rows] in each class-attention block; returns {vector: D (after the module's final LayerNorm, what the head reads), query: D (before it), attn: aggBlocks x heads x (1 + rows), rows, steps: per block {input, lnRows, q, k, v, attn, attnOut, proj, afterAttn, ln2, hidden, mlpOut, out}}.
  function aggregate(params, tokenRows) {
    const net = netOf(checkParams(params, 'params'));
    if (net.wiring !== 'selfpatch') throw new Error('the DINO wiring has no aggregation module: its class token feeds the image-level head');
    const X = toMat(tokenRows, net.widths.D);
    const steps = [];
    const r = aggModule(paramMats(params, null), net.widths, X, steps);
    return { vector: F64.from(r.vector.data), query: F64.from(r.query.data), attn: flatMaps(r.maps), rows: X.rows, steps: steps };
  }

  // head(params, which, vector): the image-level ('image') or patch-level ('patch', SelfPatch only) projection head on one vector (or on every row of a matrix), without gradient; returns {hidden1, hidden2, bottleneck, unit, scores: K} as Float64Arrays for one vector, as matrices for several rows.
  function head(params, which, vector) {
    const net = netOf(checkParams(params, 'params'));
    const pre = headPrefix(net, which);
    const X = toMat(isView(vector) || (isArray(vector) && typeof vector[0] === 'number') ? [vector] : vector, net.widths.D);
    const r = projHead(paramMats(params, null), pre, X, net.widths);
    if (X.rows !== 1) return r;
    return { hidden1: r.hidden1.data, hidden2: r.hidden2.data, bottleneck: r.bottleneck.data, unit: r.unit.data, scores: r.scores.data };
  }

  // selectPositives(teacherTokens, g, k): SelfPatch's selection on a g x g grid of token rows: each anchor's 8 candidates (the wrapped 3 x 3 window in increasing flat index), their cosines, the ranking (largest first, ties to the lower column) and the top k (default 4) as positives; returns {g, n, k, width, candidates, wrapped, cosines, ranking, mask, positives}, each flat, anchor by anchor.
  function selectPositives(teacherTokens, g, k) {
    const X = toMat(teacherTokens, 0);
    return selectFrom(X, g, k === undefined ? RECIPE.k : k);
  }

  // scheduleAt(t): the recipe's values at the 1-based optimiser step t (the trainer's step t - 1): the learning rate (np.linspace from 0 to the peak over the 4,620 warm-up steps, then Core.warmupCosine's cosine down to 1e-6), the weight decay and the teacher momentum (Core.cosineMomentum from 0.04 to 0.4 and from 0.9995 to 1), the epoch and whether the prototype layers are frozen.
  function scheduleAt(t) {
    const C = core();
    const s = t - 1, W = RECIPE.warmupSteps, T = RECIPE.totalSteps;
    let lr;
    if (s < W) lr = s === W - 1 ? RECIPE.lrPeak : s * (RECIPE.lrPeak / (W - 1));
    else lr = C.warmupCosine(s, { peak: RECIPE.lrPeak, total: T, warmup: W, final: RECIPE.lrMin });
    const epoch = floor(s / RECIPE.stepsPerEpoch);
    return {
      t: t, index: s, epoch: epoch, lr: lr,
      weightDecay: C.cosineMomentum(s, T, RECIPE.weightDecay[0], RECIPE.weightDecay[1]),
      momentum: C.cosineMomentum(s, T, RECIPE.momentum[0], RECIPE.momentum[1]),
      frozenLastLayer: epoch < RECIPE.freezeLastLayerEpochs,
      stepsPerEpoch: RECIPE.stepsPerEpoch, totalSteps: T, warmupSteps: W
    };
  }

  // resolveFollow(params, spec): the followed weight {name, index, row, col} from {name, index} or {name, row, col}; the default is one entry of the last block's key weight (row D, column 0 of attn.qkv.weight).
  function resolveFollow(params, spec) {
    const W = params.widths;
    const s = spec || { name: 'backbone.blocks.' + (W.blocks - 1) + '.attn.qkv.weight', row: W.D, col: 0 };
    const T = params.byName[s.name];
    if (!T) throw new RangeError('no tensor named ' + s.name);
    const index = s.index !== undefined ? s.index : s.row * T.cols + s.col;
    if (!(isInteger(index) && index >= 0 && index < T.size)) throw new RangeError('entry ' + index + ' is outside ' + s.name);
    const row = floor(index / T.cols), col = index % T.cols;
    const key = /\.attn\.qkv\.weight$/.test(s.name) && row >= W.D && row < 2 * W.D;
    return { name: s.name, index: index, row: row, col: col, label: key ? 'key weight: row ' + row + ', column ' + col + ' of ' + s.name : 'row ' + row + ', column ' + col + ' of ' + s.name };
  }

  // adamw(params, grads, state, t, schedule): one AdamW step in place on params, as torch's single-tensor AdamW with decoupled weight decay: p *= 1 - lr wd (decayed tensors only), m and v move towards g and g^2 at 1 - beta, then p -= lr / (1 - beta1^t) * m / (sqrt(v) / sqrt(1 - beta2^t) + eps). Tensors whose gradient is missing or null are skipped (no decay, no state). t is the bias-correction count (each tensor's own count + 1 when t is not a number); schedule {lr, weightDecay, betas, eps, follow}; returns {updated, skipped, follow: the followed weight's details}.
  function adamw(params, grads, state, t, schedule) {
    const p = checkParams(params, 'params');
    const s = schedule || {};
    if (!(s.lr >= 0)) throw new RangeError('adamw needs schedule.lr >= 0');
    const wd = s.weightDecay === undefined ? 0 : s.weightDecay;
    const betas = s.betas || RECIPE.betas, b1 = betas[0], b2 = betas[1];
    const eps = s.eps === undefined ? RECIPE.eps : s.eps;
    const st = state || {};
    if (!st.m) st.m = {};
    if (!st.v) st.v = {};
    if (!st.steps) st.steps = {};
    const follow = s.follow ? resolveFollow(p, s.follow) : null;
    const updated = [], skipped = [];
    let details = null;
    p.tensors.forEach(function (T) {
      const g = grads ? grads[T.name] : null;
      const fi = follow && follow.name === T.name ? follow.index : -1;
      if (!g) {
        skipped.push(T.name);
        if (fi >= 0) details = { name: T.name, index: fi, skipped: true, lr: s.lr, weightDecay: 0, before: T.data[fi], after: T.data[fi] };
        return;
      }
      if (g.length !== T.size) throw new RangeError('the gradient of ' + T.name + ' has ' + g.length + ' numbers, not ' + T.size);
      const count = typeof t === 'number' ? t : (st.steps[T.name] || 0) + 1;
      st.steps[T.name] = count;
      if (!st.m[T.name]) {
        st.m[T.name] = new F64(T.size);
        st.v[T.name] = new F64(T.size);
      }
      const m = st.m[T.name], v = st.v[T.name], x = T.data;
      const decay = T.decay ? wd : 0;
      const bc1 = 1 - pow(b1, count), bc2 = 1 - pow(b2, count);
      const stepSize = s.lr / bc1, bc2Root = sqrt(bc2);
      const before = fi >= 0 ? { p: x[fi], m: m[fi], v: v[fi] } : null;
      for (let i = 0; i < x.length; i++) {
        if (decay !== 0) x[i] *= 1 - s.lr * decay;
        m[i] += (g[i] - m[i]) * (1 - b1);
        v[i] = v[i] * b2 + (1 - b2) * g[i] * g[i];
        x[i] -= stepSize * (m[i] / (sqrt(v[i]) / bc2Root + eps));
      }
      updated.push(T.name);
      if (fi >= 0) {
        const denom = sqrt(v[fi]) / bc2Root + eps;
        details = {
          name: T.name, index: fi, skipped: false, count: count, lr: s.lr, weightDecay: decay, betas: [b1, b2], eps: eps,
          g: g[fi], mBefore: before.m, vBefore: before.v, m: m[fi], v: v[fi],
          biasCorrection1: bc1, biasCorrection2: bc2, mHat: m[fi] / bc1, vHat: v[fi] / bc2,
          stepSize: stepSize, denom: denom, step: stepSize * (m[fi] / denom),
          decayTerm: before.p * s.lr * decay, before: before.p, afterDecay: decay !== 0 ? before.p * (1 - s.lr * decay) : before.p, after: x[fi]
        };
      }
    });
    return { updated: updated, skipped: skipped, follow: details };
  }

  // numericGradient(fn, params, index, eps): the central difference (fn(p + eps) - fn(p - eps)) / (2 eps) for one entry, index {name, i} or a flat position over all tensors in order; the entry is restored exactly (for the tests only).
  function numericGradient(fn, params, index, eps) {
    const p = checkParams(params, 'params');
    const h = eps === undefined ? 1e-5 : eps;
    let T, i;
    if (typeof index === 'number') {
      let rest = index;
      for (let k = 0; k < p.tensors.length && T === undefined; k++) {
        if (rest < p.tensors[k].size) { T = p.tensors[k]; i = rest; } else rest -= p.tensors[k].size;
      }
    } else if (index) {
      T = p.byName[index.name];
      i = index.i;
    }
    if (!T || !(isInteger(i) && i >= 0 && i < T.size)) throw new RangeError('numericGradient: no such entry');
    const x0 = T.data[i];
    const up = x0 + h, down = x0 - h;
    T.data[i] = up;
    const fUp = fn(p);
    T.data[i] = down;
    const fDown = fn(p);
    T.data[i] = x0;
    return (fUp - fDown) / (up - down);
  }

  // ------------------------------------------------------------------ the training step

  // cropList(crops): the step's crops with their grids, kinds and positions: the two global crops first, then the local crops.
  function cropList(crops) {
    if (!isArray(crops) || crops.length < RECIPE.globalCrops) throw new RangeError('a step needs the two global crops first, then any local crops');
    return crops.map(function (c, i) {
      const info = cropInfo(c);
      info.position = i;
      info.kind = c.kind || (i < RECIPE.globalCrops ? 'global' : 'local');
      info.index = c.index !== undefined ? c.index : (i < RECIPE.globalCrops ? i : i - RECIPE.globalCrops);
      info.rect = c.rect || null;
      info.applied = c.applied || (c.imageData && c.imageData.applied) || null;
      return info;
    });
  }

  // centresOf(centres, net): the loss centres a step starts from (zeros when none are given, as at the start of training).
  function centresOf(centres, net) {
    const c = centres || {};
    return {
      image: c.image ? F64.from(c.image) : new F64(net.widths.kImage),
      patch: net.wiring === 'selfpatch' ? (c.patch ? F64.from(c.patch) : new F64(net.widths.kPatch)) : null
    };
  }

  // cloneOptimizer(o): a copy of an AdamW state {m, v, steps} (an empty one when none is given).
  function cloneOptimizer(o) {
    const out = { m: {}, v: {}, steps: {} };
    if (!o) return out;
    Object.keys(o.m || {}).forEach(function (k) { out.m[k] = F64.from(o.m[k]); });
    Object.keys(o.v || {}).forEach(function (k) { out.v[k] = F64.from(o.v[k]); });
    Object.keys(o.steps || {}).forEach(function (k) { out.steps[k] = o.steps[k]; });
    return out;
  }

  // progressCounter(net, list): the tick(phase, crop, unit) of one step: it counts the pauses against an estimate of their number and returns {phase, crop, unit, done, total, fraction} for the lab's progress bar.
  function progressCounter(net, list) {
    const W = net.widths;
    let macs = 0, total = 0;
    list.forEach(function (c, i) {
      const n = c.n + (net.wiring === 'dino' ? 1 : 0), D = W.D;
      macs += n * PATCH_VALUES * D + W.blocks * (n * D * 4 * D + 2 * n * n * D + 2 * n * D * W.mlp);
      const teacher = net.wiring === 'selfpatch' || i < RECIPE.globalCrops;
      total += W.blocks * (teacher ? 2 : 1) + W.blocks;
      if (net.wiring === 'selfpatch') total += ceil(c.n / ANCHOR_CHUNK);
    });
    total += ceil(2 * macs / BACKWARD_CHUNK) + 1;
    let done = 0;
    // tick(phase, crop, unit): one pause's progress value.
    return function tick(phase, crop, unit) {
      done++;
      return { phase: phase, crop: crop, unit: unit, done: done, total: total, fraction: mathMin(done / total, 0.99) };
    };
  }

  // snapshotBlocks(blocks): the block records with the rows the lab reads kept and every tape link dropped.
  function snapshotBlocks(blocks) {
    return blocks.map(function (b) {
      return {
        index: b.index, input: b.input, ln1: b.ln1, q: b.q, k: b.k, v: b.v, attn: b.attn, attnOut: b.attnOut, proj: b.proj,
        afterAttn: b.afterAttn, ln2: b.ln2, hidden: b.hidden, mlpOut: b.mlpOut, out: b.out, rate: b.rate, skipped: b.skipped, factor: b.factor
      };
    });
  }

  // cropRecords(net, list, T, S, targets, losses): the per-crop part of a StepRecord: the student's patches, tokens and block records, the teacher's tokens, selection and targets, the image-level tokens, scores, probabilities, cross-entropies and the gradient on the student's scores.
  function cropRecords(net, list, T, S, targets, losses) {
    const Ts = RECIPE.tempStudent;
    return list.map(function (c, i) {
      const s = S[i], t = T[i];
      // probs(m): the student's probabilities at 0.1 for a matrix of scores (none for a missing head).
      const probs = function (m) { return m ? softmaxRows(new Mat(m.rows, m.cols, m.data), Ts) : null; };
      return {
        position: i, kind: c.kind, index: c.index, side: c.side, g: c.g, n: c.n, rect: c.rect, applied: c.applied, seenByTeacher: t !== null,
        patches: s.embed.patches, projected: s.embed.projected, tokens0: s.embed.tokens0, pos: copyMat(s.embed.pos), posMode: s.embed.posMode,
        blocks: snapshotBlocks(s.backbone.blocks), tokens: s.backbone.tokens, final: s.backbone.final,
        studentPatchRows: s.patchRows,
        teacherTokens: t ? t.tokens : null,
        selection: t ? t.selection : null,
        targets: t ? t.targets : null,
        imageToken: {
          teacher: t ? { vector: t.image.vector, query: t.image.query, attn: t.image.attn } : null,
          student: { vector: s.image.vector.data, query: s.image.query ? s.image.query.data : null, attn: s.image.maps ? flatMaps(s.image.maps) : null }
        },
        scores: {
          teacherImage: t ? t.image.scores.data : null, teacherPatch: t ? t.patchScores : null,
          studentImage: s.imageScores.data, studentPatch: s.patchScores
        },
        probs: {
          teacherImage: i < RECIPE.globalCrops ? targets.image[i] : (t ? centredSoftmax(t.image.scores, targets.centres.image, targets.tempTeacher).data : null),
          teacherPatch: targets.patch ? targets.patch[i] : null,
          studentImage: probs(s.imageScores).data, studentPatch: probs(s.patchScores)
        },
        ce: losses.perAnchor ? losses.perAnchor[i] : null,
        patchLoss: losses.perCrop ? losses.perCrop[i] : null,
        scoreGrads: { image: s.imageScores.grad, patch: s.patchScores ? new Mat(c.n, s.patchScores.cols, s.patchScores.grad) : null }
      };
    });
  }

  // recordSet(which, n): for each of n crops, whether the student's block records are kept: every crop when which is undefined, else the crop positions listed in which (the block records of a 224-pixel crop take about 23 MB).
  function recordSet(which, n) {
    const out = [];
    for (let c = 0; c < n; c++) out.push(which === undefined || which === null || (isArray(which) && which.indexOf(c) >= 0));
    return out;
  }

  // forwardTask(student, teacher, net, list, centres, o, tick): the part of a step that t does not change: the stochastic-depth draws, the teacher's pass, the targets, the student's pass on a tape, the losses, the backward pass, the raw gradients and the centre updates.
  function* forwardTask(student, teacher, net, list, centres, o, tick) {
    const W = net.widths;
    const dropPath = !!o.dropPath;
    const seed = o.seed === undefined ? student.seed : o.seed;
    let masks = list.map(function () { return null; });
    if (dropPath) {
      const r = core().rng('toyvit|droppath|' + seed);
      masks = list.map(function () { return dropPathMasks(W.blocks, RECIPE.dropPathRate, r); });
    }
    const PT = paramMats(teacher, null);
    const T = list.map(function () { return null; });
    for (let c = 0; c < list.length; c++) {
      if (net.wiring === 'dino' && c >= RECIPE.globalCrops) continue;
      T[c] = yield* teacherCropTask(PT, net, list[c], tick);
    }
    const targets = makeTargets(net, list, T, centres);
    const tape = new Tape();
    const PS = paramMats(student, tape);
    const keep = recordSet(o.recordCrops, list.length);
    const S = [];
    for (let c = 0; c < list.length; c++) S.push(yield* studentCropTask(PS, net, list[c], masks[c], keep[c], tick, 'student'));
    S.forEach(function (s) {
      s.imageScores.keepGrad = true;
      if (s.patchScores) s.patchScores.keepGrad = true;
    });
    const terms = lossTerms(net, S, targets);
    const losses = lossNumbers(terms, targets);
    yield* backwardTask(tape, terms.L, tick);
    const grads = {};
    student.tensors.forEach(function (Tn) {
      const m = PS[Tn.name];
      grads[Tn.name] = m.grad;
      m.grad = null;
      m.tape = null;
    });
    return {
      dropPath: dropPath, seed: seed, masks: masks, list: list, targets: targets, losses: losses, grads: grads,
      centres: updateCentres(net, T, centres), crops: cropRecords(net, list, T, S, targets, losses)
    };
  }

  // updatePart(student, teacher, fw, sched, follow, optimizer): the part of a step that t changes: the per-tensor clip at 3.0 (coefficient 3 / (norm + 1e-6)), the last-layer freeze in epoch 0, AdamW on a copy of the student, the EMA on a copy of the teacher.
  function updatePart(student, teacher, fw, sched, follow, optimizer) {
    const table = [], clipped = {};
    student.tensors.forEach(function (T) {
      const raw = fw.grads[T.name];
      const row = { name: T.name, kind: T.kind, shape: T.shape.slice(), size: T.size, decay: T.decay, norm: null, normClipped: null, coef: null, clipped: false, frozen: false };
      table.push(row);
      if (!raw) {
        clipped[T.name] = null;
        return;
      }
      const norm = sqrt(dotAt(raw, 0, raw, 0, raw.length));
      const coef = RECIPE.clip / (norm + RECIPE.clipEps);
      const g = F64.from(raw);
      if (coef < 1) for (let i = 0; i < g.length; i++) g[i] *= coef;
      row.norm = norm;
      row.coef = coef;
      row.clipped = coef < 1;
      row.normClipped = coef < 1 ? sqrt(dotAt(g, 0, g, 0, g.length)) : norm;
      row.frozen = sched.frozenLastLayer && T.name.indexOf('last_layer') >= 0;
      clipped[T.name] = row.frozen ? null : g;
    });
    const studentAfter = cloneParams(student);
    const opt = cloneOptimizer(optimizer);
    const adam = adamw(studentAfter, clipped, opt, undefined, { lr: sched.lr, weightDecay: sched.weightDecay, follow: follow });
    const teacherAfter = cloneParams(teacher);
    const m = sched.momentum;
    teacherAfter.tensors.forEach(function (T) {
      const s = studentAfter.byName[T.name].data, d = T.data;
      for (let j = 0; j < d.length; j++) d[j] = d[j] * m + (1 - m) * s[j];
    });
    const f = follow.index;
    const ema = {
      name: follow.name, index: f, momentum: m, teacherBefore: teacher.byName[follow.name].data[f],
      studentAfter: studentAfter.byName[follow.name].data[f], teacherAfter: teacherAfter.byName[follow.name].data[f]
    };
    return { table: table, studentAfter: studentAfter, teacherAfter: teacherAfter, optimizer: opt, adam: adam.follow, ema: ema };
  }

  // blockNorms(table, W): per backbone block, the gradient norms before the clip of its attention part (norm1, qkv, proj) and of its MLP part (norm2, fc1, fc2).
  function blockNorms(table, W) {
    const out = [];
    for (let b = 0; b < W.blocks; b++) out.push({ block: b, attn: 0, mlp: 0 });
    table.forEach(function (row) {
      const m = /^backbone\.blocks\.(\d+)\.(norm1|attn|norm2|mlp)\./.exec(row.name);
      if (!m || row.norm === null) return;
      const part = (m[2] === 'norm1' || m[2] === 'attn') ? 'attn' : 'mlp';
      out[Number(m[1])][part] += row.norm * row.norm;
    });
    out.forEach(function (o) {
      o.attn = sqrt(o.attn);
      o.mlp = sqrt(o.mlp);
    });
    return out;
  }

  // afterTask(studentAfter, net, list, targets, masks, tick): the student with the updated weights run again on the same crops (the same stochastic-depth draws) and scored against the same targets: L_after and its parts.
  function* afterTask(studentAfter, net, list, targets, masks, tick) {
    const P = paramMats(studentAfter, null);
    const S = [];
    for (let c = 0; c < list.length; c++) S.push(yield* studentCropTask(P, net, list[c], masks[c], false, tick, 'after'));
    return lossNumbers(lossTerms(net, S, targets), targets);
  }

  // checkReuse(from, state, list, o): the forward part of a previous StepRecord, when it belongs to this state, these crops and the same stochastic-depth setting.
  function checkReuse(from, state, list, o) {
    const fw = from && from.forward;
    if (!fw || !from.stateBefore) throw new TypeError('opts.from must be a StepRecord of ToyViT.trainingStep');
    const sb = from.stateBefore;
    if (sb.student !== state.student || sb.teacherGiven !== state.teacher || sb.optimizerGiven !== state.optimizer || sb.centresGiven !== state.centres) {
      throw new Error('opts.from belongs to another state: reuse needs the same student, teacher, optimiser state and centres objects');
    }
    if (fw.list.length !== list.length || fw.list.some(function (c, i) { return c.imageData !== list[i].imageData; })) {
      throw new Error('opts.from was computed on other crops');
    }
    if (fw.dropPath !== !!o.dropPath || (fw.dropPath && (o.seed === undefined ? state.student.seed : o.seed) !== fw.seed)) {
      throw new Error('opts.from was computed with another stochastic-depth setting');
    }
    return fw;
  }

  // stepTask(state, crops, o): the whole step as a generator (see trainingStep); its value is the StepRecord.
  function* stepTask(state, crops, o) {
    const started = now();
    if (!state) throw new TypeError('trainingStep needs a state {student, teacher, optimizer, centres}');
    const student = checkParams(state.student, 'state.student');
    const teacher = state.teacher ? checkParams(state.teacher, 'state.teacher') : cloneParams(student);
    if (teacher.wiring !== student.wiring || teacher.tensors.length !== student.tensors.length || teacher.grid !== student.grid) {
      throw new Error('the teacher must have the student\'s wiring and shapes');
    }
    const net = netOf(student);
    const t = o.t === undefined ? 1 : o.t;
    if (!(isInteger(t) && t >= 1 && t <= RECIPE.totalSteps)) throw new RangeError('t must be an integer from 1 to ' + RECIPE.totalSteps);
    const list = cropList(crops);
    const sched = scheduleAt(t);
    const follow = resolveFollow(student, o.follow);
    const tick = progressCounter(net, list);
    const fw = o.from ? checkReuse(o.from, state, list, o) : yield* forwardTask(student, teacher, net, list, centresOf(state.centres, net), o, tick);
    const up = updatePart(student, teacher, fw, sched, follow, state.optimizer);
    yield tick('update', -1, 0);
    const after = o.reforward === false ? null : yield* afterTask(up.studentAfter, net, list, fw.targets, fw.masks, tick);
    return {
      kind: 'ToyViT.StepRecord', wiring: net.wiring, widths: net.widths, grid: net.grid, k: net.k, t: t, dropPath: fw.dropPath,
      recipe: RECIPE, recipeFacts: RECIPE_FACTS, schedule: sched,
      crops: fw.crops, pairs: fw.losses.pairs,
      losses: { L_global: fw.losses.L_global, L_patch: fw.losses.L_patch, L: fw.losses.L, lambda: RECIPE.lambda },
      targets: fw.targets, masks: fw.masks, grads: fw.grads, centres: fw.centres,
      gradients: up.table, gradBlocks: blockNorms(up.table, net.widths),
      follow: follow, adam: up.adam, ema: up.ema, after: after,
      stateBefore: { student: student, teacher: teacher, teacherGiven: state.teacher, optimizerGiven: state.optimizer, centresGiven: state.centres },
      stateAfter: {
        student: up.studentAfter, teacher: up.teacherAfter, optimizer: up.optimizer,
        centres: { image: fw.centres.image.after, patch: fw.centres.patch ? fw.centres.patch.after : null }
      },
      forward: fw,
      timing: { ms: now() - started, reused: !!o.from }
    };
  }

  // trainingStep(state, crops, opts): one whole training step on the crops (global crop 1, global crop 2, then local crops): the teacher's pass without gradient (SelfPatch: every crop; DINO: the two global crops), the selection and the targets, the student's pass with gradient, the losses, the backward pass, the per-tensor clip, the last-layer freeze in epoch 0, AdamW, the teacher EMA, the centre updates and the student run again on the same views. state {student, teacher (default a copy of the student), optimizer, centres} is left as it was; opts {t (1 to 9,240, default 1), dropPath, seed, follow, recordCrops (the crop positions whose block records to keep, default all), from (a StepRecord whose forward and backward passes to reuse), reforward (default true), chunked}. Returns a StepRecord; with chunked, an iterator whose next() pauses between blocks, anchor groups and backward chunks, with {phase, done, total, fraction} values, and ends with the StepRecord.
  function trainingStep(state, crops, opts) {
    const o = opts || {};
    const task = stepTask(state, crops, o);
    return o.chunked ? task : runAll(task);
  }

  // lossRecord(studentParams, crops, targets, opts): the losses of a student against fixed targets (a StepRecord's targets), without gradient: per-image-level-pair cross-entropies, per-anchor cross-entropies, per-crop patch losses, L_global, L_patch and L; opts.masks repeats a step's stochastic-depth draws.
  function lossRecord(studentParams, crops, targets, opts) {
    const o = opts || {};
    const net = netOf(checkParams(studentParams, 'studentParams'));
    if (!targets || targets.wiring !== net.wiring) throw new TypeError('lossRecord needs the targets of a step of the same wiring');
    const list = cropList(crops);
    const P = paramMats(studentParams, null);
    const S = list.map(function (c, i) { return runAll(studentCropTask(P, net, c, o.masks ? o.masks[i] : null, false, noTick, 'loss')); });
    const r = lossNumbers(lossTerms(net, S, targets), targets);
    r.studentScores = S.map(function (s) { return { image: s.imageScores.data, patch: s.patchScores }; });
    return r;
  }

  const ToyViT = {
    WIDTHS: WIDTHS,
    init: init,
    cloneParams: cloneParams,
    embed: embed,
    forwardBackbone: forwardBackbone,
    aggregate: aggregate,
    head: head,
    selectPositives: selectPositives,
    trainingStep: trainingStep,
    lossRecord: lossRecord,
    adamw: adamw,
    numericGradient: numericGradient
  };

  root.ToyViT = Object.freeze(ToyViT);
})(typeof window !== 'undefined' ? window : this);
