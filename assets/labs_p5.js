/*
 * labs_p5.js: the labs of Part 5 ("Our rule", src/sections_p5.html) of the course "Pixels to Islands"
 * (docs/research/explainer_v2_2026-10-13/). Vanilla ES2019, ASCII only, no library, no storage, no dialog and no
 * animation; nothing is fetched except the page's own data files through Core.bundle.load. Loaded after core.js,
 * scenes.js and toy_vit.js and before boot.js (src/pages.json).
 *
 *   lab-5d-sets-nonlocal  Lab N of the first explainer (docs/research/explainer_2026-09-28/src/labs_part5.js), ported:
 *                         its pure functions and its mount function are copied unchanged except for the lab id, the
 *                         section numbers that its hints name (now 5.2, 5.4 and 5.5), its log prefix, and its "plan"
 *                         statements, which became the protocol's values once the runs were executed (marked()).
 *                         The combined rule and the contrastive term on a toy crop of 4 x 4 or 6 x 6 patches, with
 *                         window.LabN and LabN.workedExample(), whose numbers section 5.2 prints through
 *                         src/labs_defaults.json ("lab-5d-sets-nonlocal": n.worked_example, n.contrastive_example).
 *   lab-5a-real-sets      The rule live on the real teacher tokens of a bundle photograph (any of the eight, any of
 *                         the five models; run 2 by default): Core.rule.sets with k, the negatives' per cent and both
 *                         caps on sliders, the photograph's 14 x 14 patches painted by role, the histogram of the
 *                         crop's 38,220 cosines with tau_hi and tau_lo, and the counts. A toy local crop (the 36
 *                         tokens around the anchor, ranked with k = 4) shows the rule on a 36-token crop.
 *   lab-5b-infonce        The InfoNCE term of one anchor of the followed crop (followed.json: run 2's student and
 *                         teacher tokens and the bundle's sets), step by step for one positive, the shares of its
 *                         denominator, every positive's term, L_i against the temperature, and a check against the
 *                         bundle's own values at tau 0.1, 0.2 and 0.3; a toy shift of the positive's cosine.
 *   lab-5c-pull-push      The gradient on the student's token as pulls and pushes, drawn on a fixed 2-D projection
 *                         (power iteration on the centred unit teacher tokens) of the crop's 196 teacher tokens, the
 *                         followed anchor's gradient checked against the bundle's autograd gradient, and toy steps
 *                         that move the token against the gradient.
 *   lab-5e-telemetry      The real progress lines of runs 1, 2 and 3 (telemetry.json): any field against the step,
 *                         a scrubber, the frozen epoch and the stop lines, and what every field means.
 *   lab-5f-head           Run 3's projection head, 384 to 1,024 to 256, as a toy head of the real shape on run 3's
 *                         real teacher tokens of the followed photograph: the cosines raw and in the head's space,
 *                         and the gradient that reaches the token through the head against the raw one.
 *   lab-5g-readings       The decoder and probe readings of the eight checkpoints and their paired contrasts with
 *                         their intervals, as an interactive chart (READINGS, copied from facts/course_facts.json;
 *                         tests/smoke_p5.js compares them value for value), and one line, with its source, saying
 *                         what the chosen endpoint measures (ENDPOINTS).
 *   window.LabP5          The pure helpers of the new labs and their constants (READINGS, RUN, histogram, pca2,
 *                         project, projectDirection, anchorInfonce, series, erf, gelu, geluSlope, toyHead,
 *                         headForward, headBackward, headGradient, cosineGradient, infonceOnVectors).
 */
(function (root) {
  'use strict';

  // ------------------------------------------------------------------ constants (all in labs_defaults.json, "labs_part5")

  const ID = 'lab-5d-sets-nonlocal';
  const VERSION = '2026-10-08.4';
  const DIM = 8;
  const SHARED = 0.4;
  const NOISE = 0.7;
  const SEED_FROM = 20261008;
  const SEED = 20261008;
  const W_SEED = 8;
  const PAIR_SEED = 64;
  const PAIRS = 64;
  const TAU_T = 0.04;
  const TAU_S = 0.1;
  // SelfPatch's own weight of its patch term: the first version's totals and the lab's pull forms keep it (the run's
  // contrastive term has its own weight, CON.lambda).
  const LAMBDA = 0.1;
  const EMA = 0.9;
  // The first version's cap on the image rule and its combined rule, 16 a side; the worked example's first-version
  // blocks still use it, the lab no longer does (the run's caps are CON.capPos and CON.capNeg).
  const CAP = 16;
  // The k slider, 1 to 8, and its start on each scene: 4 on 4 x 4 (the worked example's k) and 4 on 6 x 6 (the run's k
  // on its 96 px crops, whose 36 patches the 6 x 6 scene has; Revision 3). The run's k on its 224 px crops is 8, the
  // slider's top, which the training numbers (dynamics) also trace on each scene.
  const K = { min: 1, max: 8, value: 4, step: 1 };
  const K_START = { 4: 4, 6: 4 };
  // The negatives slider: the share of the crop's ordered pairs at or below tau_lo, in per cent; the run's is 20.
  const NEG = { min: 10, max: 30, value: 20, step: 1 };
  // The temperature slider of the contrastive term; the run's is 0.2.
  const TAU_C = { min: 0.05, max: 0.5, value: 0.2, step: 0.01 };
  const MARGIN = { min: 0, max: 0.5, step: 0.001 };
  const BETA = { min: 0, max: 2, value: 1, step: 0.05 };
  const LR = { min: 0, max: 2, value: 0.5, step: 0.05 };
  const TRAIN = [1, 10, 100];
  const BETA_PLAN = { direct: 1, hinge: 0.1 };
  const RULES = ['window', 'row', 'image', 'both'];
  // The first version's push forms, which LabN.losses and the worked example's first-version blocks read.
  const PUSHES = ['none', 'hinge', 'direct'];
  // Revision 2's objectives: the run's contrastive term, then SelfPatch's pull alone and the pull with each dropped push.
  const OBJECTIVES = ['contrastive', 'pull', 'hinge', 'direct'];
  const OBJECTIVE_PUSH = { pull: 'none', hinge: 'hinge', direct: 'direct' };
  // The first version's defaults for LabN.losses: the row rule (top k and bottom k) with the direct push.
  const FIRST = { rule: 'row', push: 'direct' };
  // The lab at load: the worked example's scene and anchor under the run's rule and loss (k 4, 20 per cent, tau 0.2).
  const START = { side: 4, rule: 'both', objective: 'contrastive', k: 4, neg: 20, tau: 0.2 };
  // The run's setting button: the 6 x 6 scene at k 4 (the run's k on its 96 px crops; Revision 3), the combined rule,
  // 20 per cent, the contrastive term at tau 0.2.
  const RUN = { side: 6, rule: 'both', objective: 'contrastive', k: 4, neg: 20, tau: 0.2 };
  const WORKED = { side: 4, anchor: 5, k: 4 };
  // The run's rule and loss (the addendum's Revision 2, sections 3, 5 and 8, and
  // docs/superpowers/specs/2026-10-08-supervisor-contrastive-run-design.md sections 3 and 4): the combined rule's low
  // quantile (the bottom 20 per cent of the crop's pairs) and its two caps, the contrastive term's temperatures (0.2 the
  // run's, 0.1 and 0.3 for comparison) and its weight lambda; and the temperature arithmetic of section 4.4, one positive
  // at cosine 0.75 against 39 negatives at cosine 0, and against one hard negative at cosine 0.7.
  const CON = { negQ: 0.2, capPos: 24, capNeg: 48, tau: 0.2, taus: [0.1, 0.2, 0.3], lambda: 1 };
  const TAU_ARITH = { positive: 0.75, negatives: 39, negative: 0, hard: 0.7 };
  // The object directions d_i: cat, ball and grass on the first three axes; the 6 x 6 scene's fence takes the fourth
  // axis, which is also the shared direction u (the 8 numbers have no axis left: u is axis 3 and t_i fills axes 4 to 7).
  // Section 4.7 writes f_i = d_i + 0.4 u + 0.7 t_i; S_AXIS below is the axis of u.
  const AXIS = { cat: 0, ball: 1, grass: 2, fence: 3 };
  const S_AXIS = 3;
  const T_AXES = [4, 5, 6, 7];
  // The scenes, row by row: G grass, C the cat's body, T the cat's tail (same object, detached), B ball, F fence.
  const SCENES = {
    4: { anchor: 5, rows: ['GGBB', 'GCCB', 'GCCG', 'GGGT'] },
    6: { anchor: 14, rows: ['GGGGBB', 'GCCCBB', 'GCCCGG', 'GCCCGG', 'GGGGGT', 'FFFGGT'] }
  };
  const LETTERS = { G: ['grass', 'grass'], C: ['cat', 'body'], T: ['cat', 'tail'], B: ['ball', 'ball'], F: ['fence', 'fence'] };

  // The facts the lab states: the source string and the source tag of each, copied from facts/*.json when this file was built.
  const FACTS = {
      "ema_ours_schedule_90b506d": {
          "cite": "[our code: cluster/train.py]",
          "source": "cluster/train.py@90b506d:266 (--momentum_teacher, default=0.9995); cluster/train.py@90b506d:1273 (utils.cosine_scheduler(args.momentum_teacher, 1.0, ...)); docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:139; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:263"
      },
      "lc1_margin": {
          "cite": "[our report \u00a77.3; our architecture proposal \u00a74.7]",
          "source": "docs/research/selection_scope_2026-09-27/05_report_final_v2.md:1069 (\u00a77.3); docs/research/selection_scope_2026-09-27/architecture/11_architecture_proposed_v2.md:329-334 (\u00a74.7)"
      },
      "lc1_total": {
          "cite": "[our report \u00a77.3; our architecture proposal \u00a74.5]",
          "source": "docs/research/selection_scope_2026-09-27/05_report_final_v2.md:1072 (\u00a77.3); docs/research/selection_scope_2026-09-27/architecture/11_architecture_proposed_v2.md:312-314 (\u00a74.5)"
      },
      "nl_eq_negatives": {
          "cite": "[our run spec]",
          "source": "docs/superpowers/specs/2026-10-08-supervisor-contrastive-run-design.md:39 (negatives N(i): pairs at or below tau_lo, capped at 48 by rank, cuts counted; a member of P(i) is never a negative)"
      },
      "nl_eq_positives_k": {
          "cite": "[our run spec \u00a73, \u00a710]",
          "source": "docs/superpowers/specs/2026-10-08-supervisor-contrastive-run-design.md:38 (positives P(i): the union of the two parts, capped at 24 by rank, cuts counted); docs/superpowers/specs/2026-10-08-supervisor-contrastive-run-design.md:36-37 (the row part and the image part); docs/superpowers/specs/2026-10-08-supervisor-contrastive-run-design.md:172-179 (k per crop size; tau_hi uses the crop's own k)"
      },
      "nl_eq_tau_lo": {
          "cite": "[our run spec]",
          "source": "docs/superpowers/specs/2026-10-08-supervisor-contrastive-run-design.md:39 (tau_lo = quantile_{0.20} of the same entries, the bottom 20 per cent of all pairs)"
      },
      "nl_eq_total": {
          "cite": "[our run spec]",
          "source": "docs/superpowers/specs/2026-10-08-supervisor-contrastive-run-design.md:53-54 (L = L_global + lambda L_con, lambda = 1.0; L_global as the trainer computes it today)"
      },
      "nl_k_local": {
          "cite": "[our run spec \u00a710]",
          "source": "docs/superpowers/specs/2026-10-08-supervisor-contrastive-run-design.md:172-177 (k = 8 on the 224 px crops (195 candidates) and k = 4 on the 96 px crops (35 candidates), flags --con_k 8 and --con_k_local 4; the owner can set --con_k_local 8 before the launch commit); docs/superpowers/plans/2026-10-08-supervisor-contrastive-run-build.md:48 (--con_k 8, --con_k_local 4); docs/research/explainer_2026-09-28/design_nonlocal_2026-10-08.md:124-126 (row part: k = 8 on the 224 px crops and k = 4 on the 96 px crops)"
      },
      "nl_k_rev3": {
          "cite": "[our run spec \u00a710]",
          "source": "docs/superpowers/specs/2026-10-08-supervisor-contrastive-run-design.md:172-173 (k = 8 on the 224 px crops (195 candidates) and k = 4 on the 96 px crops (35 candidates), flags --con_k 8 and --con_k_local 4); docs/superpowers/plans/2026-10-08-supervisor-contrastive-run-build.md:48 (--con_k 8, --con_k_local 4)"
      },
      "nl_tau": {
          "cite": "[our run spec]",
          "source": "docs/superpowers/specs/2026-10-08-supervisor-contrastive-run-design.md:51 (tau = 0.2, calibrated before launch, section 6); docs/superpowers/specs/2026-10-08-supervisor-contrastive-run-design.md:131 (the test sets tau before the protocol is committed)"
      },
      "patch_count_224": {
          "cite": "[our architecture doc \u00a73.2]",
          "source": "docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:158; docs/research/selection_scope_2026-09-27/architecture/10_param_counts_output.txt:25"
      },
      "patch_count_96": {
          "cite": "[our architecture doc \u00a73.2]",
          "source": "docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:158; docs/research/selection_scope_2026-09-27/architecture/10_param_counts_output.txt:27"
      },
      "sp_k_90b506d": {
          "cite": "[SelfPatch \u00a72.2]",
          "source": "research/audits/base_papers_text/yun_selfpatch_cvpr2022.txt:404-409; cluster/selfpatch_official/main_selfpatch.py@90b506d:70 (k_num 4); cluster/train.py@90b506d:210 (K = 4); docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:188"
      },
      "sp_lambda_90b506d": {
          "cite": "[SelfPatch \u00a74]",
          "source": "research/audits/base_papers_text/yun_selfpatch_cvpr2022.txt:506 (\u03bb = 0.1); cluster/selfpatch_official/main_selfpatch.py@90b506d:456 (c_loss + p_loss*0.1); cluster/train.py@90b506d:268 (--patch_loss_weight, default=0.1); docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:247"
      },
      "sp_patch_prototypes": {
          "cite": "[SelfPatch supp. App. A]",
          "source": "SelfPatch supplement App. A, p. 1 (research/references/papers/base_audit_20260914_selfpatch/selfpatch_cvpr2022_supplement.pdf) (K = 4096 for our projection head); cluster/selfpatch_official/main_selfpatch.py:59; research/references/repos/SelfPatch/README.md:15; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:87"
      },
      "temp_student": {
          "cite": "[DINO \u00a73.2]",
          "source": "research/audits/base_papers_text/caron_dino_iccv2021.txt:268 (\u03c4s is set to 0.1); cluster/selfpatch_official/main_selfpatch.py:402 (student_temp=0.1); docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:140; docs/research/selection_scope_2026-09-27/architecture/10_param_counts_output.txt:55"
      },
      "temp_teacher_90b506d": {
          "cite": "[official code: main_selfpatch.py; our code: cluster/train.py]",
          "source": "cluster/selfpatch_official/main_selfpatch.py@90b506d:73-80 (0.04 to 0.04 over 0 warm-up epochs); cluster/train.py@90b506d:267 (--teacher_temp, default=0.04); cluster/train.py@90b506d:1252 (DistributedSelectorLoss(65536, 4096, 10, args.teacher_temp, args.teacher_temp, 0, ...)); docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:140; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:227; research/audits/base_papers_text/caron_dino_iccv2021.txt:218-219"
      }
  };

  // ------------------------------------------------------------------ small vector helpers

  // coreOf(): window.Core, which core.js defines; throws when core.js has not loaded.
  function coreOf() {
    const c = root.Core;
    if (!c || typeof c.rng !== 'function') throw new Error('window.Core is missing: core.js must load before labs_p5.js');
    return c;
  }

  // dotOf(a, b): the sum of a[i] * b[i].
  function dotOf(a, b) {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;
  }

  // lengthOf(a): the Euclidean length of a.
  function lengthOf(a) {
    return Math.sqrt(dotOf(a, a));
  }

  // unitOf(a): a divided by its length, as a new Float64Array (the zero vector stays zero).
  function unitOf(a) {
    const n = lengthOf(a);
    const out = new Float64Array(a.length);
    for (let i = 0; i < a.length; i++) out[i] = n > 0 ? a[i] / n : 0;
    return out;
  }

  // matVec(W, z): the vector W z for a matrix given as an array of rows.
  function matVec(W, z) {
    const out = new Float64Array(W.length);
    for (let r = 0; r < W.length; r++) out[r] = dotOf(W[r], z);
    return out;
  }

  // softmaxOf(a, c, tau): softmax((a - c) / tau), computed stably; c may be null (no centre).
  function softmaxOf(a, c, tau) {
    const n = a.length;
    const out = new Float64Array(n);
    let mx = -Infinity;
    for (let k = 0; k < n; k++) {
      out[k] = (a[k] - (c ? c[k] : 0)) / tau;
      if (out[k] > mx) mx = out[k];
    }
    let s = 0;
    for (let k = 0; k < n; k++) {
      out[k] = Math.exp(out[k] - mx);
      s += out[k];
    }
    for (let k = 0; k < n; k++) out[k] /= s;
    return out;
  }

  // logSoftmaxOf(a, tau): log softmax(a / tau), computed stably (finite even where the probability underflows).
  function logSoftmaxOf(a, tau) {
    const n = a.length;
    const u = new Float64Array(n);
    let mx = -Infinity;
    for (let k = 0; k < n; k++) {
      u[k] = a[k] / tau;
      if (u[k] > mx) mx = u[k];
    }
    let s = 0;
    for (let k = 0; k < n; k++) s += Math.exp(u[k] - mx);
    const lse = mx + Math.log(s);
    for (let k = 0; k < n; k++) u[k] -= lse;
    return u;
  }

  // toPlain(x): typed arrays (also nested in arrays and objects) as plain arrays, for JSON.
  function toPlain(x) {
    if (x === null || x === undefined) return x;
    if (ArrayBuffer.isView(x)) return Array.from(x);
    if (Array.isArray(x)) return x.map(toPlain);
    if (typeof x === 'object') {
      const out = {};
      Object.keys(x).forEach(function (k) { out[k] = toPlain(x[k]); });
      return out;
    }
    return x;
  }

  // ------------------------------------------------------------------ the toy scene

  // scene(side, seed): the toy crop of side x side patches (4 or 6): every patch's object and part, its raw feature f_i = d_i + 0.4 u + 0.7 t_i (8 numbers) and its token, f_i scaled to length 1. d_i is the object's axis, u is axis 3 (the direction every patch shares), and t_i is four uniform numbers in [-1, 1) from Core.rng(seed), drawn in index order, scaled to length 1 and placed on axes 4 to 7.
  function scene(side, seed) {
    const spec = SCENES[side];
    if (!spec) throw new RangeError('the toy scene is 4 x 4 or 6 x 6 patches');
    const useSeed = seed === undefined ? SEED : seed;
    const rng = coreOf().rng(useSeed);
    const n = side * side;
    const objects = [], parts = [], features = [], tokens = [];
    for (let i = 0; i < n; i++) {
      const kind = LETTERS[spec.rows[Math.floor(i / side)].charAt(i % side)];
      objects.push(kind[0]);
      parts.push(kind[1]);
      const t = [rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-1, 1)];
      const tn = lengthOf(t);
      const f = new Float64Array(DIM);
      f[AXIS[kind[0]]] += 1;
      f[S_AXIS] += SHARED;
      for (let d = 0; d < T_AXES.length; d++) f[T_AXES[d]] += NOISE * (t[d] / tn);
      features.push(f);
      tokens.push(unitOf(f));
    }
    return { side: side, n: n, seed: useSeed, anchor: spec.anchor, objects: objects, parts: parts, features: features, tokens: tokens };
  }

  // cosines(tokens): the n x n matrix of cosines between the tokens (rows of Float64Array); the diagonal is set to 1 and no rule ever uses it.
  function cosines(tokens) {
    const n = tokens.length;
    const len = tokens.map(lengthOf);
    const S = [];
    for (let i = 0; i < n; i++) S.push(new Float64Array(n));
    for (let i = 0; i < n; i++) {
      S[i][i] = 1;
      for (let j = i + 1; j < n; j++) {
        const v = len[i] > 0 && len[j] > 0 ? dotOf(tokens[i], tokens[j]) / (len[i] * len[j]) : 0;
        const c = Math.max(-1, Math.min(1, v));
        S[i][j] = c;
        S[j][i] = c;
      }
    }
    return S;
  }

  // rankings(S): for every anchor i, the other n - 1 patches sorted by S[i][j], largest first, ties to the lower index.
  function rankings(S) {
    const n = S.length;
    return S.map(function (row, i) {
      const idx = [];
      for (let j = 0; j < n; j++) if (j !== i) idx.push(j);
      idx.sort(function (a, b) { return (row[b] - row[a]) || (a - b); });
      return idx;
    });
  }

  // offDiagonal(S): the n (n - 1) entries S[i][j] with j != i, row by row (every pair twice, once in each order).
  function offDiagonal(S) {
    const n = S.length;
    const out = new Float64Array(n * (n - 1));
    let at = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (j !== i) out[at++] = S[i][j];
    return out;
  }

  // quantileDetail(values, q): torch.quantile's linear rule spelled out: the sorted values, the position q (n - 1), its lower and upper index, the fraction between them, the two values and the result.
  function quantileDetail(values, q) {
    if (!(q >= 0 && q <= 1)) throw new RangeError('the quantile level must lie in [0, 1]');
    const s = Float64Array.from(values).sort();
    const n = s.length;
    if (!n) throw new RangeError('the quantile needs at least one value');
    const position = q * (n - 1);
    const lower = Math.floor(position);
    const upper = Math.min(lower + 1, n - 1);
    const fraction = position - lower;
    return {
      count: n, q: q, position: position, lower: lower, upper: upper, fraction: fraction,
      lowerValue: s[lower], upperValue: s[upper], value: s[lower] + (s[upper] - s[lower]) * fraction
    };
  }

  // quantile(values, q): the q-quantile with linear interpolation, as Core.quantile and torch.quantile compute it.
  function quantile(values, q) {
    return quantileDetail(values, q).value;
  }

  // checkK(k, n): k as an integer, refused unless 1 <= k and 2 k <= n - 1 (so that the top k and the bottom k never share a member).
  function checkK(k, n) {
    const kk = Math.floor(Number(k));
    if (!(kk >= 1 && 2 * kk <= n - 1)) throw new RangeError('k must lie in 1 .. (n - 1) / 2');
    return kk;
  }

  // thresholds(S, k): the image rule's two crop-wide thresholds over the n (n - 1) ordered pairs: tau_hi at q_hi = 1 - k / (n - 1), tau_lo at q_lo = k / (n - 1).
  function thresholds(S, k) {
    const n = S.length;
    const pool = offDiagonal(S);
    const qHi = 1 - k / (n - 1), qLo = k / (n - 1);
    return { qHi: qHi, qLo: qLo, hi: quantileDetail(pool, qHi), lo: quantileDetail(pool, qLo), pairs: pool.length };
  }

  // finishSets(rule, k, cap, P, N, extra): the result of a rule: P(i) most similar first, N(i) least similar first, the degrees, the cap cuts and the empty anchors.
  function finishSets(rule, k, cap, P, N, extra) {
    const out = Object.assign({ rule: rule, k: k, cap: cap, P: P, N: N, cutsPositive: 0, cutsNegative: 0, tauHi: null, tauLo: null, qHi: null, qLo: null }, extra || {});
    out.degreePositive = P.map(function (p) { return p.length; });
    out.degreeNegative = N.map(function (m) { return m.length; });
    out.emptyPositive = out.degreePositive.filter(function (d) { return d === 0; }).length;
    out.emptyNegative = out.degreeNegative.filter(function (d) { return d === 0; }).length;
    return out;
  }

  // windowSets(S, side, k): SelfPatch's rule, the comparator: P(i) = the k most similar of the 8 wrapped 3 x 3 neighbours (Core.neighbours8, the official table), ties to the lower index; no negatives (SelfPatch only pulls).
  function windowSets(S, side, k) {
    const core = coreOf();
    const n = S.length;
    if (side * side !== n) throw new RangeError('windowSets needs side x side patches');
    const kk = Math.max(0, Math.min(8, Math.floor(Number(k))));
    const P = [], N = [];
    for (let i = 0; i < n; i++) {
      const nb = core.neighbours8(i, side).slice();
      nb.sort(function (a, b) { return (S[i][b] - S[i][a]) || (a - b); });
      P.push(nb.slice(0, kk));
      N.push([]);
    }
    return finishSets('window', kk, null, P, N);
  }

  // windowTop4(S, side): SelfPatch's official rule, the top 4 of the wrapped window.
  function windowTop4(S, side) {
    return windowSets(S, side, 4);
  }

  // rowSets(S, k): NL-row: for every anchor, the k most similar of all n - 1 other patches are its positives and the k least similar its negatives.
  function rowSets(S, k) {
    const n = S.length;
    const kk = checkK(k, n);
    const R = rankings(S);
    const P = [], N = [];
    for (let i = 0; i < n; i++) {
      P.push(R[i].slice(0, kk));
      N.push(R[i].slice(n - 1 - kk).reverse());
    }
    return finishSets('row', kk, null, P, N);
  }

  // imageSets(S, k, cap): NL-image: P(i) = {j : S_ij >= tau_hi}, N(i) = {j : S_ij <= tau_lo} with the two crop-wide thresholds, each cut to its `cap` best members by rank (the most similar for P, the least similar for N); the cuts are counted.
  function imageSets(S, k, cap) {
    const n = S.length;
    const kk = checkK(k, n);
    const cc = cap === undefined ? CAP : cap;
    const th = thresholds(S, kk);
    const R = rankings(S);
    const P = [], N = [];
    let cutP = 0, cutN = 0;
    for (let i = 0; i < n; i++) {
      const hi = R[i].filter(function (j) { return S[i][j] >= th.hi.value; });
      const p = hi.slice(0, cc);
      cutP += hi.length - p.length;
      const inP = {};
      p.forEach(function (j) { inP[j] = true; });
      const lo = R[i].filter(function (j) { return S[i][j] <= th.lo.value && !inP[j]; }).reverse();
      const m = lo.slice(0, cc);
      cutN += lo.length - m.length;
      P.push(p);
      N.push(m);
    }
    return finishSets('image', kk, cc, P, N, {
      tauHi: th.hi.value, tauLo: th.lo.value, qHi: th.qHi, qLo: th.qLo, cutsPositive: cutP, cutsNegative: cutN, thresholds: th
    });
  }

  // bothSets(S, k, cap): NL-both: P(i) = the top k together with {j : S_ij >= tau_hi}, N(i) = the bottom k together with {j : S_ij <= tau_lo}; P is cut to its `cap` most similar, then N loses every member of P and is cut to its `cap` least similar; the cuts are counted.
  function bothSets(S, k, cap) {
    const n = S.length;
    const kk = checkK(k, n);
    const cc = cap === undefined ? CAP : cap;
    const th = thresholds(S, kk);
    const R = rankings(S);
    const P = [], N = [];
    let cutP = 0, cutN = 0;
    for (let i = 0; i < n; i++) {
      const hi = R[i].filter(function (j, r) { return r < kk || S[i][j] >= th.hi.value; });
      const p = hi.slice(0, cc);
      cutP += hi.length - p.length;
      const inP = {};
      p.forEach(function (j) { inP[j] = true; });
      const lo = R[i].filter(function (j, r) { return (r >= n - 1 - kk || S[i][j] <= th.lo.value) && !inP[j]; }).reverse();
      const m = lo.slice(0, cc);
      cutN += lo.length - m.length;
      P.push(p);
      N.push(m);
    }
    return finishSets('both', kk, cc, P, N, {
      tauHi: th.hi.value, tauLo: th.lo.value, qHi: th.qHi, qLo: th.qLo, cutsPositive: cutP, cutsNegative: cutN, thresholds: th
    });
  }

  // selectSets(rule, S, side, k, cap): the sets of one rule: 'window', 'row', 'image' or 'both'.
  function selectSets(rule, S, side, k, cap) {
    if (rule === 'window') return windowSets(S, side, k);
    if (rule === 'row') return rowSets(S, k);
    if (rule === 'image') return imageSets(S, k, cap);
    if (rule === 'both') return bothSets(S, k, cap);
    throw new RangeError("the rule must be 'window', 'row', 'image' or 'both'");
  }

  // combinedSets(S, k, negQ, capPos, capNeg): the run's combined rule (the addendum's Revision 2, section 3): P(i) = the k most similar candidates together with every j whose S_ij is at least tau_hi, the crop's quantile 1 - k / (n - 1) of its n (n - 1) ordered pairs, cut to its capPos most similar; N(i) = every j whose S_ij is at most tau_lo, the crop's quantile negQ of the same pairs, never a member of P(i), cut to its capNeg least similar; the cuts are counted.
  function combinedSets(S, k, negQ, capPos, capNeg) {
    const n = S.length;
    const kk = Math.floor(Number(k));
    if (!(kk >= 1 && kk <= n - 1)) throw new RangeError('k must lie in 1 .. n - 1');
    if (!(negQ > 0 && negQ < 1)) throw new RangeError('the low quantile must lie strictly between 0 and 1');
    if (!(capPos >= kk && capNeg >= 1)) throw new RangeError('the caps must keep the k positives and at least one negative');
    const pool = offDiagonal(S);
    const hi = quantileDetail(pool, 1 - kk / (n - 1)), lo = quantileDetail(pool, negQ);
    const R = rankings(S);
    const P = [], N = [];
    let cutP = 0, cutN = 0;
    for (let i = 0; i < n; i++) {
      const up = R[i].filter(function (j, r) { return r < kk || S[i][j] >= hi.value; });
      const p = up.slice(0, capPos);
      cutP += up.length - p.length;
      const inP = {};
      p.forEach(function (j) { inP[j] = true; });
      const down = R[i].filter(function (j) { return S[i][j] <= lo.value && !inP[j]; }).reverse();
      const m = down.slice(0, capNeg);
      cutN += down.length - m.length;
      P.push(p);
      N.push(m);
    }
    return finishSets('combined', kk, capPos, P, N, {
      tauHi: hi.value, tauLo: lo.value, qHi: hi.q, qLo: negQ, capNegative: capNeg, cutsPositive: cutP, cutsNegative: cutN,
      thresholds: { hi: hi, lo: lo, pairs: pool.length }
    });
  }

  // runThresholds(S, k, negQ): the crop's two shared thresholds as the lab shows them under every rule: tau_hi at q_hi = 1 - k / (n - 1) and tau_lo at the quantile negQ, both over the n (n - 1) ordered pairs.
  function runThresholds(S, k, negQ) {
    const n = S.length;
    const kk = Math.floor(Number(k));
    if (!(kk >= 1 && kk <= n - 1)) throw new RangeError('k must lie in 1 .. n - 1');
    if (!(negQ > 0 && negQ < 1)) throw new RangeError('the low quantile must lie strictly between 0 and 1');
    const pool = offDiagonal(S);
    return { qHi: 1 - kk / (n - 1), qLo: negQ, hi: quantileDetail(pool, 1 - kk / (n - 1)), lo: quantileDetail(pool, negQ), pairs: pool.length };
  }

  // runSets(rule, S, side, k, negQ, capPos, capNeg): the lab's four rules (the addendum's Revision 2, section 8). 'window' is SelfPatch's rule, the comparator: the k most similar of the 8 wrapped neighbours and no negatives. 'row', 'image' and 'both' choose the positives: the anchor's own k most similar candidates (row), every j whose S_ij is at least tau_hi (image), or both together (the run's combined rule, combinedSets); the positives keep their capPos most similar. All three take the run's negatives: every j whose S_ij is at most tau_lo, the crop's quantile negQ, never a positive, the capNeg least similar. The cuts are counted.
  function runSets(rule, S, side, k, negQ, capPos, capNeg) {
    if (rule === 'window') return windowSets(S, side, k);
    if (rule === 'both') return combinedSets(S, k, negQ, capPos, capNeg);
    if (rule !== 'row' && rule !== 'image') throw new RangeError("the rule must be 'window', 'row', 'image' or 'both'");
    const n = S.length;
    const th = runThresholds(S, k, negQ);
    const kk = Math.floor(Number(k));
    if (!(capPos >= 1 && capNeg >= 1)) throw new RangeError('the caps must keep at least one member');
    const R = rankings(S);
    const P = [], N = [];
    let cutP = 0, cutN = 0;
    for (let i = 0; i < n; i++) {
      const up = rule === 'row' ? R[i].slice(0, kk) : R[i].filter(function (j) { return S[i][j] >= th.hi.value; });
      const p = up.slice(0, capPos);
      cutP += up.length - p.length;
      const inP = {};
      p.forEach(function (j) { inP[j] = true; });
      const down = R[i].filter(function (j) { return S[i][j] <= th.lo.value && !inP[j]; }).reverse();
      const m = down.slice(0, capNeg);
      cutN += down.length - m.length;
      P.push(p);
      N.push(m);
    }
    return finishSets(rule, kk, capPos, P, N, {
      tauHi: th.hi.value, tauLo: th.lo.value, qHi: th.qHi, qLo: negQ, capNegative: capNeg, cutsPositive: cutP, cutsNegative: cutN,
      thresholds: { hi: th.hi, lo: th.lo, pairs: th.pairs }
    });
  }

  // ------------------------------------------------------------------ the toy heads

  let headCache = null;
  // heads(seed): the toy's one patch head W, 8 prototypes by 8 numbers, standing for both the teacher's and the student's: uniform numbers in [-1, 1) from Core.rng(seed), row by row, each row scaled to length 1. The default seed's matrix is made once.
  function heads(seed) {
    const s = seed === undefined ? W_SEED : seed;
    if (s === W_SEED && headCache) return headCache;
    const rng = coreOf().rng(s);
    const W = [];
    for (let r = 0; r < DIM; r++) {
      const row = new Float64Array(DIM);
      for (let c = 0; c < DIM; c++) row[c] = rng.uniform(-1, 1);
      W.push(unitOf(row));
    }
    if (s === W_SEED) headCache = W;
    return W;
  }

  // centre(W, teacher): the centre c, the mean of the teacher's logit vectors W z_j over the crop.
  function centre(W, teacher) {
    const c = new Float64Array(W.length);
    teacher.forEach(function (z) {
      const a = matVec(W, z);
      for (let k = 0; k < c.length; k++) c[k] += a[k];
    });
    for (let k = 0; k < c.length; k++) c[k] /= teacher.length;
    return c;
  }

  // teacherTarget(W, z, c): q_j = softmax((W z_j - c) / 0.04), the teacher's own target for one patch (a negative's target).
  function teacherTarget(W, z, c) {
    return softmaxOf(matVec(W, z), c, TAU_T);
  }

  // aggregatedTarget(W, teacher, set, c): q_i = softmax((W zbar_i - c) / 0.04) with zbar_i the mean of the teacher's tokens in the set P(i), a stand-in for SelfPatch's class-attention head; null for an empty set.
  function aggregatedTarget(W, teacher, set, c) {
    if (!set.length) return null;
    const mean = new Float64Array(DIM);
    set.forEach(function (j) { for (let d = 0; d < DIM; d++) mean[d] += teacher[j][d]; });
    for (let d = 0; d < DIM; d++) mean[d] /= set.length;
    return softmaxOf(matVec(W, mean), c, TAU_T);
  }

  // studentProbs(W, z): p_i = softmax(W z_i / 0.1), the student's distribution over the 8 prototypes, and its logarithm.
  function studentProbs(W, z) {
    const a = matVec(W, z);
    return { logits: a, p: softmaxOf(a, null, TAU_S), logp: logSoftmaxOf(a, TAU_S) };
  }

  // ------------------------------------------------------------------ the losses and their gradient

  // pushOf(form, o, m): the push f(o) and its slope f'(o): none 0; direct o; hinge max(0, o - m) squared.
  function pushOf(form, o, m) {
    if (form === 'direct') return { f: o, slope: 1 };
    if (form === 'hinge') {
      const e = Math.max(0, o - m);
      return { f: e * e, slope: 2 * e };
    }
    if (form === 'none') return { f: 0, slope: 0 };
    throw new RangeError("the push must be 'none', 'hinge' or 'direct'");
  }

  // options(o): the settings of one first-version evaluation with their defaults: rule, k, cap, push, margin, beta.
  function options(o) {
    const x = o || {};
    return {
      rule: x.rule || FIRST.rule, k: x.k === undefined ? K.value : x.k, cap: x.cap === undefined ? CAP : x.cap,
      push: x.push || FIRST.push, margin: x.margin === undefined ? 0 : x.margin, beta: x.beta === undefined ? BETA.value : x.beta
    };
  }

  // losses(student, teacher, side, opts): everything one first-version toy step reads: the cosines and the sets of the first version's rules (from the teacher, cap 16), then pullPush on those sets.
  function losses(student, teacher, side, opts) {
    const o = options(opts);
    const S = cosines(teacher);
    const sets = selectSets(o.rule, S, side, o.k, o.cap);
    const out = pullPush(student, teacher, S, sets, o.push, o.margin, o.beta);
    out.options = o;
    out.side = side;
    return out;
  }

  // pullPush(student, teacher, S, sets, push, margin, beta): SelfPatch's pull and one push form on given sets: the centre, the targets q, the student's p, L_patch per anchor and its mean over the anchors with positives, the overlaps o_ij over N(i), the push f(o) per anchor and its mean over the pairs, the pairs with o > m, and the objective L_patch + beta L_push.
  function pullPush(student, teacher, S, sets, push, margin, beta) {
    const o = { push: push, margin: margin, beta: beta };
    const W = heads();
    const n = teacher.length;
    const c = centre(W, teacher);
    const qSingle = teacher.map(function (z) { return teacherTarget(W, z, c); });
    const qAgg = sets.P.map(function (set) { return aggregatedTarget(W, teacher, set, c); });
    const stud = student.map(function (z) { return studentProbs(W, z); });
    const patch = [], overlaps = [], pushes = [], slopes = [], pushAnchor = [];
    let patchSum = 0, anchors = 0, pushSum = 0, pairs = 0, active = 0;
    for (let i = 0; i < n; i++) {
      if (qAgg[i]) {
        let ce = 0;
        for (let k = 0; k < DIM; k++) ce -= qAgg[i][k] * stud[i].logp[k];
        patch.push(ce);
        patchSum += ce;
        anchors++;
      } else {
        patch.push(null);
      }
      const ov = [], fv = [], sv = [];
      let anchorSum = 0;
      sets.N[i].forEach(function (j) {
        const oij = dotOf(stud[i].p, qSingle[j]);
        const pf = pushOf(o.push, oij, o.margin);
        ov.push(oij);
        fv.push(pf.f);
        sv.push(pf.slope);
        anchorSum += pf.f;
        if (oij > o.margin) active++;
      });
      overlaps.push(ov);
      pushes.push(fv);
      slopes.push(sv);
      pushAnchor.push(ov.length ? anchorSum / ov.length : null);
      pushSum += anchorSum;
      pairs += ov.length;
    }
    const Lpatch = anchors ? patchSum / anchors : 0;
    const Lpush = pairs ? pushSum / pairs : 0;
    return {
      options: o, n: n, S: S, sets: sets, W: W, centre: c, qSingle: qSingle, qAgg: qAgg,
      p: stud.map(function (s) { return s.p; }), logp: stud.map(function (s) { return s.logp; }),
      patch: patch, anchors: anchors, Lpatch: Lpatch, overlaps: overlaps, pushes: pushes, slopes: slopes,
      pushAnchor: pushAnchor, pairs: pairs, active: active, Lpush: Lpush, objective: Lpatch + o.beta * Lpush
    };
  }

  // gradients(an): the analytic gradient of L_patch + beta L_push with respect to the student's features (W and the teacher fixed): for anchor i, W^T g_i / 0.1 with g_i = (p_i - q_i) / |A| (when P(i) is not empty) plus beta / |pairs| times the sum over j in N(i) of f'(o_ij) p_i (q_j - o_ij), elementwise.
  function gradients(an) {
    const beta = an.options.beta;
    const G = [];
    for (let i = 0; i < an.n; i++) {
      const g = new Float64Array(DIM);
      const p = an.p[i];
      if (an.qAgg[i]) for (let k = 0; k < DIM; k++) g[k] += (p[k] - an.qAgg[i][k]) / an.anchors;
      an.sets.N[i].forEach(function (j, t) {
        const w = beta * an.slopes[i][t] / an.pairs;
        if (w === 0) return;
        const q = an.qSingle[j], oij = an.overlaps[i][t];
        for (let k = 0; k < DIM; k++) g[k] += w * p[k] * (q[k] - oij);
      });
      const out = new Float64Array(DIM);
      for (let d = 0; d < DIM; d++) {
        let s = 0;
        for (let k = 0; k < DIM; k++) s += an.W[k][d] * g[k];
        out[d] = s / TAU_S;
      }
      G.push(out);
    }
    return G;
  }

  // contrastiveAnchor(student, teacher, i, P, N, tau): the run's contrastive term for anchor i (the addendum's Revision 2, section 5): s_ij = cos(student_i, teacher_j); for each positive p, l_ip = -log(exp(s_ip / tau) / (exp(s_ip / tau) + the sum over n in N of exp(s_in / tau))), with the shares of that denominator that the positive (w_p) and each negative (w_n) hold, and the gap s_ip - max over n of s_in; L_i is the mean of l_ip over P; null when P or N is empty (no term).
  function contrastiveAnchor(student, teacher, i, P, N, tau) {
    if (!(tau > 0)) throw new RangeError('the temperature must be positive');
    if (!P.length || !N.length) return null;
    const zi = student[i], li = lengthOf(zi);
    // cosineTo(j): the cosine of the student's token i and the teacher's token j.
    const cosineTo = function (j) {
      const lj = lengthOf(teacher[j]);
      return li > 0 && lj > 0 ? dotOf(zi, teacher[j]) / (li * lj) : 0;
    };
    const negatives = N.map(function (j) { const s = cosineTo(j); return { index: j, cosine: s, exp: Math.exp(s / tau) }; });
    let negSum = 0, closest = -Infinity;
    negatives.forEach(function (e) { negSum += e.exp; closest = Math.max(closest, e.cosine); });
    let total = 0;
    const positives = P.map(function (p) {
      const s = cosineTo(p), e = Math.exp(s / tau), d = e + negSum;
      const term = Math.log(d) - s / tau;
      total += term;
      return {
        index: p, cosine: s, exp: e, denominator: d, share_positive: e / d, share_negatives: negSum / d,
        shares_negative: negatives.map(function (x) { return x.exp / d; }), term: term, gap: s - closest
      };
    });
    return { tau: tau, negatives: negatives, negative_sum: negSum, positives: positives, value: total / positives.length };
  }

  // trainStep(state, opts, lr): one toy step: the gradient of L_patch + beta L_push at the student's features, a descent step of size lr, each feature scaled back to length 1, then the teacher's tokens move by EMA 0.9 towards the student's and are scaled to length 1 too; the sets and the centre follow from the new teacher at the next evaluation. Returns the new state.
  function trainStep(state, opts, lr) {
    const an = losses(state.student, state.teacher, state.side, opts);
    const G = gradients(an);
    const rate = lr === undefined ? LR.value : lr;
    const student = state.student.map(function (z, i) {
      const v = new Float64Array(DIM);
      for (let d = 0; d < DIM; d++) v[d] = z[d] - rate * G[i][d];
      return unitOf(v);
    });
    const teacher = state.teacher.map(function (z, i) {
      const v = new Float64Array(DIM);
      for (let d = 0; d < DIM; d++) v[d] = EMA * z[d] + (1 - EMA) * student[i][d];
      return unitOf(v);
    });
    return { side: state.side, objects: state.objects, parts: state.parts, student: student, teacher: teacher, step: state.step + 1 };
  }

  // startState(side, seed): the state at step 0: student and teacher both hold the scene's tokens, as at the start of a run.
  function startState(side, seed) {
    const sc = scene(side, seed);
    return {
      side: side, objects: sc.objects, parts: sc.parts, step: 0,
      student: sc.tokens.map(function (z) { return Float64Array.from(z); }),
      teacher: sc.tokens.map(function (z) { return Float64Array.from(z); })
    };
  }

  // runOptions(o): the settings of one evaluation of the lab (Revision 2) with the lab's resting values: objective ('contrastive', 'pull', 'hinge' or 'direct'), rule, k, negQ (the negatives' share of the crop's pairs, a fraction), tau, margin, beta.
  function runOptions(o) {
    const x = o || {};
    const out = {
      objective: x.objective || START.objective, rule: x.rule || START.rule, k: x.k === undefined ? START.k : x.k,
      negQ: x.negQ === undefined ? START.neg / 100 : x.negQ, tau: x.tau === undefined ? START.tau : x.tau,
      margin: x.margin === undefined ? 0 : x.margin, beta: x.beta === undefined ? BETA.value : x.beta
    };
    if (OBJECTIVES.indexOf(out.objective) < 0) throw new RangeError("the objective must be 'contrastive', 'pull', 'hinge' or 'direct'");
    if (!(out.tau > 0)) throw new RangeError('the temperature must be positive');
    return out;
  }

  // evaluate(student, teacher, side, opts): everything one toy step of the lab reads: the cosines of the teacher's tokens and the sets of runSets (caps 24 and 48). For the contrastive objective, each anchor's term (contrastiveAnchor; null, and 0 in the mean, for an anchor without a positive or a negative, whose l_ip is 0), the crop's L_con, the mean of L_i over all n anchors, the negatives' mean share of the denominator over all (anchor, positive) pairs (0 for an anchor without a negative) and the objective lambda L_con. For the pull forms, pullPush on the same sets (the objective L_patch + beta L_push).
  function evaluate(student, teacher, side, opts) {
    const o = runOptions(opts);
    const S = cosines(teacher);
    const n = teacher.length;
    const sets = runSets(o.rule, S, side, o.k, o.negQ, CON.capPos, CON.capNeg);
    const out = { options: o, side: side, n: n, S: S, sets: sets, student: student, teacher: teacher };
    if (o.objective === 'contrastive') {
      const terms = [];
      let sum = 0, pairs = 0, shareSum = 0, withTerm = 0;
      for (let i = 0; i < n; i++) {
        const t = contrastiveAnchor(student, teacher, i, sets.P[i], sets.N[i], o.tau);
        terms.push(t);
        pairs += sets.P[i].length;
        if (t) {
          sum += t.value;
          withTerm++;
          t.positives.forEach(function (e) { shareSum += e.share_negatives; });
        }
      }
      out.terms = terms;
      out.L = sum / n;
      out.pairs = pairs;
      out.withTerm = withTerm;
      out.shareMean = pairs ? shareSum / pairs : 0;
      out.objective = CON.lambda * out.L;
    } else {
      out.pull = pullPush(student, teacher, S, sets, OBJECTIVE_PUSH[o.objective], o.margin, o.beta);
      out.objective = out.pull.objective;
    }
    return out;
  }

  // evaluateGradients(ev): the analytic gradient of ev's objective with respect to the student's features (the teacher fixed). Contrastive: for anchor i, lambda / (n |P(i)|) times the sum over its positives p of (1 / tau) [-(1 - w_p) g_ip + the sum over n of w_n g_in], with g_ij = (zhat_j - s_ij zhat_i) / |z_i| the gradient of the cosine (section 4.4, item 4); the pull forms: gradients() of the first version on the same sets.
  function evaluateGradients(ev) {
    if (ev.options.objective !== 'contrastive') return gradients(ev.pull);
    const n = ev.n, tau = ev.options.tau;
    const unitTeacher = ev.teacher.map(unitOf);
    const G = [];
    for (let i = 0; i < n; i++) {
      const g = new Float64Array(DIM);
      const t = ev.terms[i];
      if (t) {
        const zi = ev.student[i], li = lengthOf(zi), zhat = unitOf(zi);
        const scale = CON.lambda / (n * t.positives.length * tau);
        // addCosine(w, j, s): add w times the gradient of the cosine s of the student's token i and the teacher's token j.
        const addCosine = function (w, j, s) {
          const zj = unitTeacher[j];
          for (let d = 0; d < DIM; d++) g[d] += w * (zj[d] - s * zhat[d]) / li;
        };
        t.positives.forEach(function (e) {
          addCosine(-(1 - e.share_positive) * scale, e.index, e.cosine);
          e.shares_negative.forEach(function (w, m) { addCosine(w * scale, t.negatives[m].index, t.negatives[m].cosine); });
        });
      }
      G.push(g);
    }
    return G;
  }

  // trainStepRun(state, opts, lr): one toy step of the lab: the gradient of the chosen objective at the student's features, a descent step of size lr, each feature scaled back to length 1, then the teacher's tokens move by EMA 0.9 towards the student's and are scaled to length 1 too; the sets follow from the new teacher at the next evaluation. Returns the new state.
  function trainStepRun(state, opts, lr) {
    const G = evaluateGradients(evaluate(state.student, state.teacher, state.side, opts));
    const rate = lr === undefined ? LR.value : lr;
    const student = state.student.map(function (z, i) {
      const v = new Float64Array(DIM);
      for (let d = 0; d < DIM; d++) v[d] = z[d] - rate * G[i][d];
      return unitOf(v);
    });
    const teacher = state.teacher.map(function (z, i) {
      const v = new Float64Array(DIM);
      for (let d = 0; d < DIM; d++) v[d] = EMA * z[d] + (1 - EMA) * student[i][d];
      return unitOf(v);
    });
    return { side: state.side, objects: state.objects, parts: state.parts, student: student, teacher: teacher, step: state.step + 1 };
  }

  // overlapMatrix(an): O[a][b] = <p_a, q_b>, every student distribution against every teacher target of the crop.
  function overlapMatrix(an) {
    return an.p.map(function (p) { return an.qSingle.map(function (q) { return dotOf(p, q); }); });
  }

  // randomPairMedian(M, rng): the median of M[a][b] over 64 ordered pairs a != b drawn with rng (a uniform, then b uniform among the other n - 1), with the pairs and the values.
  function randomPairMedian(M, rng) {
    const n = M.length;
    const r = rng || coreOf().rng(PAIR_SEED);
    const pairs = [], values = [];
    for (let t = 0; t < PAIRS; t++) {
      const a = r.int(n);
      let b = r.int(n - 1);
      if (b >= a) b += 1;
      pairs.push([a, b]);
      values.push(M[a][b]);
    }
    return { median: quantile(values, 0.5), pairs: pairs, values: values };
  }

  // marginOf(an): the toy's random-pair median of the overlaps now: 64 ordered pairs from Core.rng(64).
  function marginOf(an) {
    return randomPairMedian(overlapMatrix(an), coreOf().rng(PAIR_SEED)).median;
  }

  // islands(tokens, objects): the mean cosine over the pairs of patches inside one object (cat with cat, ball with ball, fence with fence), over the pairs inside the grass (the background, counted on its own), and over the pairs of patches of different kinds.
  function islands(tokens, objects) {
    const S = cosines(tokens);
    let w = 0, nw = 0, g = 0, ng = 0, b = 0, nb = 0;
    for (let i = 0; i < S.length; i++) {
      for (let j = i + 1; j < S.length; j++) {
        if (objects[i] !== objects[j]) {
          b += S[i][j];
          nb++;
        } else if (objects[i] === 'grass') {
          g += S[i][j];
          ng++;
        } else {
          w += S[i][j];
          nw++;
        }
      }
    }
    return { objects: nw ? w / nw : NaN, grass: ng ? g / ng : NaN, between: nb ? b / nb : NaN };
  }

  // objectCosines(tokens, objects): the mean cosine over the pairs inside each kind of patch (cat, ball, fence, grass), for the kinds the crop has.
  function objectCosines(tokens, objects) {
    const S = cosines(tokens), sum = {}, count = {};
    for (let i = 0; i < S.length; i++) {
      for (let j = i + 1; j < S.length; j++) {
        if (objects[i] !== objects[j]) continue;
        sum[objects[i]] = (sum[objects[i]] || 0) + S[i][j];
        count[objects[i]] = (count[objects[i]] || 0) + 1;
      }
    }
    const out = {};
    ['cat', 'ball', 'fence', 'grass'].forEach(function (k) { if (count[k]) out[k] = sum[k] / count[k]; });
    return out;
  }

  // seedWorks(seed): whether the 4 x 4 scene of this seed gives the worked example the addendum asks for: anchor 5's non-local top 4 are its three window cat neighbours and the tail (15), its bottom 4 are ball or grass, and its window top 4 are the three cat neighbours and one grass patch.
  function seedWorks(seed) {
    const sc = scene(WORKED.side, seed);
    const S = cosines(sc.tokens);
    const a = WORKED.anchor;
    const row = rowSets(S, WORKED.k), win = windowTop4(S, WORKED.side);
    const top = row.P[a].slice().sort(function (x, y) { return x - y; });
    const catWindow = [6, 9, 10];
    const okTop = top.join(',') === '6,9,10,15';
    const okBottom = row.N[a].every(function (j) { return sc.objects[j] === 'ball' || sc.objects[j] === 'grass'; });
    const winRest = win.P[a].filter(function (j) { return catWindow.indexOf(j) < 0; });
    const okWindow = catWindow.every(function (j) { return win.P[a].indexOf(j) >= 0; }) && winRest.length === 1 && sc.objects[winRest[0]] === 'grass';
    return okTop && okBottom && okWindow;
  }

  // dynamics(): what the lab shows when it trains, as src/labs_defaults.json quotes it for the copy ("n.dynamics"): at learning rate 0.5, on each scene at its start k (4 on both: the worked example's k on 4 x 4, the run's k on its 96 px crops on 6 x 6) and the run's 20 per cent. Under the combined rule with the contrastive objective at tau 0.1, 0.2 and 0.5: the islands of the teacher's tokens (within the objects, within the grass, between kinds; three decimals) and the negatives' mean share of the denominator (four decimals) at steps 0, 10, 20, 50 and 100, and the cosine inside each kind of patch after 100 steps; the same at tau 0.2 with k at the slider's top, 8, the run's k on its 224 px crops (contrastive_k8). After 100 steps of SelfPatch's pull alone, under the window rule at its own k = 4 and under the combined rule: the islands and the kinds. Under the pull with the hinge (beta 0.1, the margin at the step-0 median) and under SelfPatch's pull alone with the same margin, on the combined rule: the pairs with o > m and all the negative pairs at steps 0, 5, 10, 20 and 100 (hinge, pull_active). At step 0: the cosine inside each kind, and the anchors that the image rule leaves without a positive for k = 1 to 8.
  function dynamics() {
    const steps = [0, 10, 20, 50, 100], hingeSteps = [0, 5, 10, 20, 100], taus = [0.1, 0.2, 0.5];
    // r3(x): x rounded to three decimals (0 stays 0).
    const r3 = function (x) { const r = Math.round(x * 1e3) / 1e3; return r === 0 ? 0 : r; };
    // kindsOf(st): the cosine inside each kind of patch of a state's teacher, three decimals.
    const kindsOf = function (st) {
      const per = objectCosines(st.teacher, st.objects), outK = {};
      Object.keys(per).forEach(function (k) { outK[k] = r3(per[k]); });
      return outK;
    };
    // trace(side, o, list): a run to the last listed step under the options o: at each listed step the islands and, for the contrastive objective, the negatives' mean share, for the pull forms the pairs with o > m and all the negative pairs; and the kinds at the last step.
    const trace = function (side, o, list) {
      let st = startState(side);
      const rows = { objects: [], grass: [], between: [], share: [], active: [], pairs: [] };
      const last = list[list.length - 1];
      for (let s = 0; s <= last; s++) {
        if (list.indexOf(s) >= 0) {
          const e = evaluate(st.student, st.teacher, side, o);
          const isl = islands(st.teacher, st.objects);
          rows.objects.push(r3(isl.objects));
          rows.grass.push(r3(isl.grass));
          rows.between.push(r3(isl.between));
          if (e.pull) {
            rows.active.push(e.pull.active);
            rows.pairs.push(e.pull.pairs);
          } else {
            rows.share.push(round4(e.shareMean));
          }
        }
        if (s < last) st = trainStepRun(st, o, LR.value);
      }
      rows.kinds = kindsOf(st);
      return rows;
    };
    const out = { lr: LR.value, neg: START.neg, steps: steps, hinge_steps: hingeSteps, taus: taus };
    [4, 6].forEach(function (side) {
      const st0 = startState(side);
      const m0 = marginOf(losses(st0.student, st0.teacher, side, {}));
      const base = { rule: 'both', k: K_START[side], negQ: START.neg / 100, margin: m0 };
      const contrastive = {};
      taus.forEach(function (tau) {
        const t = trace(side, Object.assign({}, base, { objective: 'contrastive', tau: tau }), steps);
        contrastive[String(tau)] = { objects: t.objects, grass: t.grass, between: t.between, share: t.share, kinds_100: t.kinds };
      });
      const top = trace(side, Object.assign({}, base, { k: K.max, objective: 'contrastive', tau: CON.tau }), steps);
      const win = trace(side, Object.assign({}, base, { rule: 'window', k: 4, objective: 'pull' }), [100]);
      // the pull alone, read at the hinge's steps with the same margin, so that the copy can say what the hinge adds
      const pull = trace(side, Object.assign({}, base, { objective: 'pull' }), hingeSteps);
      const hinge = trace(side, Object.assign({}, base, { objective: 'hinge', beta: BETA_PLAN.hinge }), hingeSteps);
      const S0 = cosines(st0.teacher), empty = [];
      for (let k = K.min; k <= K.max; k++) empty.push(runSets('image', S0, side, k, START.neg / 100, CON.capPos, CON.capNeg).emptyPositive);
      const lastPull = pull.objects.length - 1;
      out['scene_' + side] = {
        k: K_START[side], margin: round4(m0), kinds_0: kindsOf(st0), contrastive: contrastive,
        contrastive_k8: { k: K.max, tau: CON.tau, objects: top.objects, grass: top.grass, between: top.between, share: top.share, kinds_100: top.kinds },
        pull_100: {
          window: [win.objects[0], win.grass[0], win.between[0]], window_kinds: win.kinds,
          both: [pull.objects[lastPull], pull.grass[lastPull], pull.between[lastPull]], both_kinds: pull.kinds
        },
        hinge: { active: hinge.active, pairs: hinge.pairs },
        pull_active: { active: pull.active, pairs: pull.pairs },
        image_empty: empty
      };
    });
    return out;
  }

  // findSeed(from, tries): the first seed from `from` on (at most `tries` of them) whose 4 x 4 scene passes seedWorks, and the seeds that failed before it.
  function findSeed(from, tries) {
    const start = from === undefined ? SEED_FROM : from;
    const rejected = [];
    for (let s = start; s < start + (tries || 100); s++) {
      if (seedWorks(s)) return { seed: s, rejected: rejected };
      rejected.push(s);
    }
    throw new Error('no seed from ' + start + ' on gives the worked example');
  }

  // ------------------------------------------------------------------ the worked example of section 4.7

  // round4(x): x rounded to four decimals, as the copy prints it (0 stays 0, never minus zero).
  function round4(x) {
    const r = Math.round(x * 1e4) / 1e4;
    return r === 0 ? 0 : r;
  }

  // sortedKeys(x): a copy of x whose objects list their keys in sorted order (arrays keep their order), for a JSON text that does not depend on the order the code built it in.
  function sortedKeys(x) {
    if (Array.isArray(x)) return x.map(sortedKeys);
    if (x && typeof x === 'object') {
      const out = {};
      Object.keys(x).sort().forEach(function (k) { out[k] = sortedKeys(x[k]); });
      return out;
    }
    return x;
  }

  // workedExample(): every number section 4.7 prints, computed by the lab's own functions on the 4 x 4 scene at step 0 (student = teacher = the tokens): anchor 5's 15 cosines in order with their window flags and objects, the crop's two thresholds with the interpolation spelled out, the four rules' sets for the anchor, the targets q (window rule and row rule), p_5, the four negatives' targets, L_patch(5) term by term, the overlaps, the push in its direct and hinge forms with the random-pair median, one gradient line and the totals; plus the scene, the head and the seeds, so that tests/nonlocal_toy_replica.py can recompute all of it.
  function workedExample() {
    const core = coreOf();
    const side = WORKED.side, a = WORKED.anchor, k = WORKED.k;
    const sc = scene(side, SEED);
    const S = cosines(sc.tokens);
    const R = rankings(S);
    const win = core.neighbours8(a, side).slice();
    const sets = { window: windowTop4(S, side), row: rowSets(S, k), image: imageSets(S, k, CAP), both: bothSets(S, k, CAP) };
    const th = thresholds(S, k);
    const base = { k: k, cap: CAP, beta: BETA_PLAN.direct };
    const direct = losses(sc.tokens, sc.tokens, side, Object.assign({}, base, { rule: 'row', push: 'direct', margin: 0 }));
    const margin = randomPairMedian(overlapMatrix(direct), core.rng(PAIR_SEED));
    const hinge = losses(sc.tokens, sc.tokens, side, Object.assign({}, base, { rule: 'row', push: 'hinge', margin: margin.median, beta: BETA_PLAN.hinge }));
    const windowed = losses(sc.tokens, sc.tokens, side, Object.assign({}, base, { rule: 'window', push: 'none', margin: 0 }));
    // has(list, j): whether j is in the list.
    function has(list, j) { return list.indexOf(j) >= 0; }
    const ranked = R[a].map(function (j, r) {
      return {
        rank: r + 1, index: j, row: Math.floor(j / side), column: j % side, object: sc.objects[j], part: sc.parts[j], cosine: S[a][j],
        in_window: has(win, j), window_top4: has(sets.window.P[a], j), row_top4: has(sets.row.P[a], j), row_bottom4: has(sets.row.N[a], j),
        image_positive: has(sets.image.P[a], j), image_negative: has(sets.image.N[a], j), both_positive: has(sets.both.P[a], j), both_negative: has(sets.both.N[a], j)
      };
    });
    // quantileJson(d): one threshold's interpolation, as the copy spells it out.
    function quantileJson(d) {
      return { q: d.q, position: d.position, lower_index: d.lower, upper_index: d.upper, fraction: d.fraction, lower_value: d.lowerValue, upper_value: d.upperValue, value: d.value };
    }
    const p = direct.p[a], logp = direct.logp[a], qRow = direct.qAgg[a], qWin = windowed.qAgg[a];
    // termsOf(q): the cross-entropy -sum q log p prototype by prototype (prototypes counted from 1).
    function termsOf(q) {
      const out = [];
      for (let t = 0; t < DIM; t++) out.push({ prototype: t + 1, q: q[t], p: p[t], log_p: logp[t], term: -q[t] * logp[t] });
      return out;
    }
    const negatives = sets.row.N[a].map(function (j, t) {
      const o = direct.overlaps[a][t];
      return {
        index: j, object: sc.objects[j], cosine: S[a][j], q: Array.from(direct.qSingle[j]), overlap: o,
        hinge_excess: o - margin.median, hinge: hinge.pushes[a][t], hinge_active: o > margin.median
      };
    });
    // the gradient line: the negative with the largest overlap; the derivative of its overlap on the student's logits
    let top = 0;
    negatives.forEach(function (n, t) { if (n.overlap > negatives[top].overlap) top = t; });
    const neg = negatives[top];
    const qj = direct.qSingle[neg.index];
    // order(v): the prototype indices by value, largest first, ties to the lower index.
    function order(v) {
      const idx = [];
      for (let t = 0; t < v.length; t++) idx.push(t);
      return idx.sort(function (x, y) { return (v[y] - v[x]) || (x - y); });
    }
    const qOrder = order(qj), pOrder = order(p);
    const picked = [];
    [[qOrder[0], 'largest of q_j'], [qOrder[1], 'second largest of q_j'], [pOrder[0], 'largest of p_5']].forEach(function (e) {
      const found = picked.filter(function (x) { return x.k === e[0]; })[0];
      if (found) found.roles.push(e[1]);
      else picked.push({ k: e[0], roles: [e[1]] });
    });
    const gradientEntries = picked.map(function (e) {
      const d = p[e.k] * (qj[e.k] - neg.overlap) / TAU_S;
      return { prototype: e.k + 1, roles: e.roles, q_j: qj[e.k], p: p[e.k], q_minus_overlap: qj[e.k] - neg.overlap, derivative: d, descent_moves_logit: d > 0 ? 'down' : (d < 0 ? 'up' : 'not at all') };
    });
    // totalOf(push, beta): the anchor's share of the total, lambda (L_patch(5) + beta L_push(5)), without the global term.
    const totalOf = function (push, beta) { return LAMBDA * (direct.patch[a] + beta * push); };
    // stats(s): one rule's sets for the anchor and its degree counts over the crop.
    const stats = function (s) {
      return {
        positives: s.P[a].slice(), negatives: s.N[a].slice(), degrees_positive: s.degreePositive.slice(), degrees_negative: s.degreeNegative.slice(),
        mean_degree_positive: s.degreePositive.reduce(function (x, y) { return x + y; }, 0) / s.degreePositive.length,
        mean_degree_negative: s.degreeNegative.reduce(function (x, y) { return x + y; }, 0) / s.degreeNegative.length,
        empty_positive: s.emptyPositive, empty_negative: s.emptyNegative, cuts_positive: s.cutsPositive, cuts_negative: s.cutsNegative
      };
    };
    // The run's rule and loss (the addendum's Revision 2, section 8, "What section 4.7 prints"): the combined sets with the
    // crop's two thresholds, the contrastive term of the anchor at each temperature, the gradient line of the positive with
    // the smallest gap, the total with lambda, the dropped forms on these sets (SelfPatch's pull under the window and the
    // combined positives, the hinge over the combined negatives at the random-pair median), and the arithmetic of 4.4.
    const comb = combinedSets(S, k, CON.negQ, CON.capPos, CON.capNeg);
    const conTerms = CON.taus.map(function (t) { return contrastiveAnchor(sc.tokens, sc.tokens, a, comb.P[a], comb.N[a], t); });
    const conMain = conTerms[CON.taus.indexOf(CON.tau)];
    if (!conMain) throw new Error('the worked example needs positives and negatives for anchor ' + a);
    let narrow = 0;
    conMain.positives.forEach(function (e, t) { if (e.gap < conMain.positives[narrow].gap) narrow = t; });
    const gp = conMain.positives[narrow];
    const qComb = aggregatedTarget(heads(), sc.tokens, comb.P[a], direct.centre);
    let pullComb = 0;
    for (let t = 0; t < DIM; t++) pullComb -= qComb[t] * logp[t];
    const hingeComb = comb.N[a].map(function (j) {
      const o = dotOf(p, direct.qSingle[j]);
      const e = Math.max(0, o - margin.median);
      return { index: j, object: sc.objects[j], overlap: o, excess: o - margin.median, hinge: e * e, active: o > margin.median };
    });
    const hingeMean = hingeComb.reduce(function (x, h) { return x + h.hinge; }, 0) / hingeComb.length;
    // arithmeticOf(count, cosine): one positive at TAU_ARITH.positive against `count` negatives at `cosine`, at each temperature: the term, the positive's share w_p, the negatives' share 1 - w_p and the weight of the pull on the student's token, (1 / tau) (1 - w_p), which the pushes' weights add up to.
    const arithmeticOf = function (count, cosine) {
      return CON.taus.map(function (t) {
        const ep = Math.exp(TAU_ARITH.positive / t), en = count * Math.exp(cosine / t);
        return { tau: t, term: Math.log(ep + en) - TAU_ARITH.positive / t, share_positive: ep / (ep + en), share_negatives: en / (ep + en), pull: en / (ep + en) / t };
      });
    };
    const arithmetic = arithmeticOf(TAU_ARITH.negatives, TAU_ARITH.negative);
    const hardArithmetic = arithmeticOf(1, TAU_ARITH.hard);
    return sortedKeys(toPlain({
      schema: 'lab_n_worked_example_v1',
      generator: 'docs/research/explainer_2026-09-28/src/labs_part5.js (LabN.workedExample, version ' + VERSION + ')',
      seeds: { scene: SEED, scene_first_tried: SEED_FROM, scene_rejected: findSeed(SEED_FROM).rejected, head: W_SEED, pairs: PAIR_SEED },
      settings: { side: side, n: sc.n, anchor: a, k: k, cap: CAP, tau_teacher: TAU_T, tau_student: TAU_S, lambda: LAMBDA, beta_direct: BETA_PLAN.direct, beta_hinge: BETA_PLAN.hinge, shared: SHARED, noise: NOISE, prototypes: DIM },
      scene: { objects: sc.objects, parts: sc.parts, features: sc.features, tokens: sc.tokens, anchor_row: Math.floor(a / side), anchor_column: a % side, window: win },
      head: { W: heads(), centre: direct.centre },
      anchor_cosines: ranked,
      thresholds: { pairs: th.pairs, q_hi: th.qHi, q_lo: th.qLo, tau_hi: quantileJson(th.hi), tau_lo: quantileJson(th.lo) },
      sets: { window: stats(sets.window), row: stats(sets.row), image: stats(sets.image), both: stats(sets.both) },
      targets: { q_window: qWin, q_row: qRow, p: p, negatives: negatives.map(function (n) { return { index: n.index, object: n.object, q: n.q }; }) },
      patch_loss: { rule: 'row', terms: termsOf(qRow), value: direct.patch[a], window_rule_value: windowed.patch[a], window_rule_terms: termsOf(qWin) },
      push: {
        negatives: negatives, direct: direct.pushAnchor[a], hinge: hinge.pushAnchor[a],
        hinge_active: negatives.filter(function (n) { return n.hinge_active; }).length,
        margin: { median: margin.median, pairs: margin.pairs, values: margin.values }
      },
      gradient: { negative: neg.index, overlap: neg.overlap, entries: gradientEntries },
      totals: {
        lambda: LAMBDA,
        direct: { beta: BETA_PLAN.direct, patch: direct.patch[a], push: direct.pushAnchor[a], value: totalOf(direct.pushAnchor[a], BETA_PLAN.direct) },
        hinge: { beta: BETA_PLAN.hinge, patch: direct.patch[a], push: hinge.pushAnchor[a], value: totalOf(hinge.pushAnchor[a], BETA_PLAN.hinge) },
        global_term: '+ L_global (unchanged)'
      },
      crop: { L_patch: direct.Lpatch, L_push_direct: direct.Lpush, L_push_hinge: hinge.Lpush, hinge_active_pairs: hinge.active, pairs: direct.pairs },
      contrastive: {
        rule: 'combined', k: k, q_hi: comb.qHi, q_lo: CON.negQ, cap_positive: CON.capPos, cap_negative: CON.capNeg,
        pairs: comb.thresholds.pairs, tau_hi: quantileJson(comb.thresholds.hi), tau_lo: quantileJson(comb.thresholds.lo),
        sets: stats(comb),
        negatives: comb.N[a].map(function (j) { return { index: j, object: sc.objects[j], cosine: S[a][j] }; }),
        tau: CON.tau, lambda: CON.lambda, terms: conTerms,
        gradient: {
          positive: gp.index, gap: gp.gap, factor: 1 / CON.tau, pull: 1 - gp.share_positive,
          pushes: conMain.negatives.map(function (e, t) { return { index: e.index, object: sc.objects[e.index], share: gp.shares_negative[t] }; })
        },
        total: { lambda: CON.lambda, value: CON.lambda * conMain.value, global_term: '+ L_global (unchanged)' },
        dropped: {
          pull_window: windowed.patch[a], pull_combined: pullComb, q_combined: qComb, margin: margin.median,
          hinge: { negatives: hingeComb, value: hingeMean, active: hingeComb.filter(function (h) { return h.active; }).length }
        },
        temperature_arithmetic: {
          positive: TAU_ARITH.positive, negatives: TAU_ARITH.negatives, negative: TAU_ARITH.negative, terms: arithmetic,
          hard: { negatives: 1, negative: TAU_ARITH.hard, terms: hardArithmetic }
        }
      }
    }));
  }

  // workedExampleJson(): workedExample() as the text of tests/lab_n_worked_example.json: sorted keys, 2-space indent, LF line ends, one final newline.
  function workedExampleJson() {
    return JSON.stringify(workedExample(), null, 2) + '\n';
  }

  root.LabN = Object.freeze({
    version: VERSION,
    scene: scene,
    cosines: cosines,
    rankings: rankings,
    offDiagonal: offDiagonal,
    quantile: quantile,
    quantileDetail: quantileDetail,
    thresholds: thresholds,
    windowSets: windowSets,
    windowTop4: windowTop4,
    rowSets: rowSets,
    imageSets: imageSets,
    bothSets: bothSets,
    selectSets: selectSets,
    combinedSets: combinedSets,
    runThresholds: runThresholds,
    runSets: runSets,
    contrastiveAnchor: contrastiveAnchor,
    heads: heads,
    centre: centre,
    teacherTarget: teacherTarget,
    aggregatedTarget: aggregatedTarget,
    studentProbs: studentProbs,
    pushOf: pushOf,
    pullPush: pullPush,
    losses: losses,
    gradients: gradients,
    trainStep: trainStep,
    startState: startState,
    evaluate: evaluate,
    evaluateGradients: evaluateGradients,
    trainStepRun: trainStepRun,
    overlapMatrix: overlapMatrix,
    randomPairMedian: randomPairMedian,
    marginOf: marginOf,
    islands: islands,
    seedWorks: seedWorks,
    objectCosines: objectCosines,
    findSeed: findSeed,
    dynamics: dynamics,
    round4: round4,
    workedExample: workedExample,
    workedExampleJson: workedExampleJson,
    defaults: Object.freeze({
      seed: SEED, seedFrom: SEED_FROM, headSeed: W_SEED, pairSeed: PAIR_SEED, pairs: PAIRS, shared: SHARED, noise: NOISE,
      tauTeacher: TAU_T, tauStudent: TAU_S, lambda: LAMBDA, lambdaRun: CON.lambda, ema: EMA, cap: CAP,
      caps: Object.freeze([CON.capPos, CON.capNeg]),
      k: Object.freeze([K.min, K.max, K.value, K.step]), kStart: Object.freeze([K_START[4], K_START[6]]),
      neg: Object.freeze([NEG.min, NEG.max, NEG.value, NEG.step]), tau: Object.freeze([TAU_C.min, TAU_C.max, TAU_C.value, TAU_C.step]),
      margin: Object.freeze([MARGIN.min, MARGIN.max, MARGIN.step]),
      beta: Object.freeze([BETA.min, BETA.max, BETA.value, BETA.step]), lr: Object.freeze([LR.min, LR.max, LR.value, LR.step]),
      train: Object.freeze(TRAIN.slice()), betaPlan: Object.freeze([BETA_PLAN.direct, BETA_PLAN.hinge]),
      anchors: Object.freeze([SCENES[4].anchor, SCENES[6].anchor]), sides: Object.freeze([4, 6]),
      rules: Object.freeze(RULES.slice()), pushes: Object.freeze(PUSHES.slice()), objectives: Object.freeze(OBJECTIVES.slice()),
      start: Object.freeze({ side: START.side, rule: START.rule, objective: START.objective, k: START.k, neg: START.neg, tau: START.tau }),
      run: Object.freeze({ side: RUN.side, rule: RUN.rule, objective: RUN.objective, k: RUN.k, neg: RUN.neg, tau: RUN.tau }),
      scenes: Object.freeze({ 4: Object.freeze(SCENES[4].rows.slice()), 6: Object.freeze(SCENES[6].rows.slice()) })
    })
  });

  // ------------------------------------------------------------------ small DOM helpers

  const MONO = '"JetBrains Mono", ui-monospace, "Cascadia Mono", Consolas, monospace';
  const TIMES = '\u00D7';
  const MINUS = '\u2212';
  const TAU = '\u03C4';
  const BETA_CH = '\u03B2';
  const LAMBDA_CH = '\u03BB';
  const SIGMA = '\u03A3';
  const RSQUO = '\u2019';
  const LE = '\u2264';
  const SUB_PLUS = '\u208A';
  const SUP_2 = '\u00B2';
  const HALO = 'paint-order: stroke; stroke: var(--surface); stroke-width: 3px; stroke-linejoin: round';

  // logError(where, err): write a problem to the console; never throws.
  function logError(where, err) {
    try {
      if (root.console && typeof root.console.error === 'function') root.console.error('[labs_p5, Lab N] ' + where, err);
    } catch (e) { /* nothing more can be done */ }
  }

  // appendAll(node, content): append strings and numbers as text, nodes as they are, arrays recursively; null and booleans are skipped.
  function appendAll(node, content) {
    if (content === null || content === undefined || content === false || content === true) return;
    if (Array.isArray(content)) {
      content.forEach(function (c) { appendAll(node, c); });
      return;
    }
    if (typeof content === 'object' && typeof content.nodeType === 'number') {
      node.appendChild(content);
      return;
    }
    node.appendChild(root.document.createTextNode(String(content)));
  }

  // setContent(node, content): replace every child of node with content.
  function setContent(node, content) {
    while (node.firstChild) node.removeChild(node.firstChild);
    appendAll(node, content);
  }

  // factSpan(core, id, text): the words `text` marked as fact `id` (class fact, data-fact, data-source from the fact sheets).
  function factSpan(core, id, text) {
    const f = FACTS[id];
    if (!f) throw new Error('labs_p5 (Lab N): unknown fact id ' + id);
    return core.el('span', { class: 'fact', 'data-fact': id, 'data-source': f.source }, [String(text)]);
  }

  // cite(core, id): the visible source tag of fact `id`, such as [SelfPatch section 2.2].
  function cite(core, id) {
    const f = FACTS[id];
    if (!f) throw new Error('labs_p5 (Lab N): unknown fact id ' + id);
    return core.el('cite', { class: 'src' }, [f.cite]);
  }

  // term(core, key, text): a glossary term (a dfn element whose data-term is key), defined in the page's glossary.
  function term(core, key, text) {
    return core.el('dfn', { 'data-term': key }, [text === undefined ? key : text]);
  }

  // marked(core, kind, content): content wrapped in <span class="toy">, or, for the run's values, <span class="run-value">.
  // The first explainer marked the run's values as a plan ('plan'), because the run had not been launched; the runs
  // have since been executed with exactly these values (protocol 2026-10-08 section 3.2), so the port shows them as the
  // protocol's values: the sourced numbers inside keep their .fact spans and source tags, and the lab's header wears
  // the course's Toy mark for the toy itself.
  function marked(core, kind, content) {
    return core.el('span', { class: kind === 'plan' ? 'run-value' : kind }, content);
  }

  // slider(core, o): a labelled range control with its value in an output; o = {id, label, min, max, step, value, format(v), hint?, role?}. Returns {root, input, get(), set(v), show(text)}.
  function slider(core, o) {
    const input = core.el('input', { type: 'range', id: o.id, min: o.min, max: o.max, step: o.step, value: o.value });
    const output = core.el('output', { id: o.id + '-out', for: o.id, 'aria-live': 'off' }, [o.format(o.value)]);
    const kids = [core.el('label', { for: o.id }, [o.label]), output, input];
    if (o.hint) {
      kids.push(core.el('p', { class: 'control-hint', id: o.id + '-hint' }, o.hint));
      input.setAttribute('aria-describedby', o.id + '-hint');
    }
    // show(text): write text into the output and into the slider's accessible value.
    function show(text) {
      output.textContent = text;
      input.setAttribute('aria-valuetext', text);
    }
    show(o.format(o.value));
    return {
      root: core.el('div', { class: o.role ? ['control', 'role-' + o.role] : 'control' }, kids),
      input: input,
      // get(): the slider's current value as a number.
      get: function () { return Number(input.value); },
      // set(v): move the slider to v (the browser may round it to the step).
      set: function (v) { input.value = String(v); },
      show: show
    };
  }

  // segmented(core, o): one choice of several, drawn as small buttons, with a label and an output that names the choice; o = {id, label, options: [[value, text]], value, hint?}. The group itself carries the id. Returns {root, get(), set(v), onChange(fn), show(text)}.
  function segmented(core, o) {
    const labelId = o.id + '-label';
    const output = core.el('output', { id: o.id + '-out', 'aria-live': 'off' });
    const radios = o.options.map(function (opt) {
      return core.el('input', { type: 'radio', name: o.id, id: o.id + '-' + opt[0], value: String(opt[0]), checked: String(opt[0]) === String(o.value) });
    });
    const group = core.el('div', { class: 'segmented', role: 'radiogroup', id: o.id, 'aria-labelledby': labelId },
      o.options.map(function (opt, i) {
        return core.el('label', { for: radios[i].id }, [radios[i], core.el('span', null, [opt[1]])]);
      }));
    const kids = [core.el('span', { class: 'control-label', id: labelId }, [o.label]), output, group];
    if (o.hint) {
      kids.push(core.el('p', { class: 'control-hint', id: o.id + '-hint' }, o.hint));
      group.setAttribute('aria-describedby', o.id + '-hint');
    }
    return {
      root: core.el('div', { class: 'control' }, kids),
      // get(): the value of the checked radio (the starting value if none is checked).
      get: function () {
        for (let i = 0; i < radios.length; i++) if (radios[i].checked) return radios[i].value;
        return String(o.value);
      },
      // set(v): check the radio whose value is v.
      set: function (v) { radios.forEach(function (r) { r.checked = r.value === String(v); }); },
      // onChange(fn): call fn whenever the reader checks another radio.
      onChange: function (fn) { radios.forEach(function (r) { r.addEventListener('change', fn); }); },
      // show(text): write text into the output.
      show: function (text) { output.textContent = text; }
    };
  }

  // readout(core, id, rows): a <dl class="readout"> with one dt and dd per [key, name]; returns {root, set(key, content), name(key, text)}, name() relabelling a row.
  function readout(core, id, rows) {
    const cells = {}, names = {};
    const kids = [];
    rows.forEach(function (r) {
      names[r[0]] = core.el('dt', null, [r[1]]);
      kids.push(names[r[0]]);
      cells[r[0]] = core.el('dd', { id: id + '-' + r[0] });
      kids.push(cells[r[0]]);
    });
    return {
      root: core.el('dl', { class: 'readout', id: id }, kids),
      // set(key, content): replace the value of one row.
      set: function (key, content) { setContent(cells[key], content); },
      // name(key, text): replace the name of one row.
      name: function (key, text) { setContent(names[key], text); }
    };
  }

  // stageCell(core, label, content, width): one figure of a stage row: a mono label, then the drawing and anything else; width caps the cell (CSS pixels).
  function stageCell(core, label, content, width) {
    return core.el('div', { class: 'stage-cell', style: width ? { maxWidth: width + 'px' } : null }, [core.el('p', { class: 'stage-label' }, label), content]);
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

  // withTitle(core, node, text): node with an SVG <title> child, which browsers show as a tooltip.
  function withTitle(core, node, text) {
    node.appendChild(core.el('svg:title', null, [text]));
    return node;
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

  // hatchCell(ctx, T, x, y, size): a grey wash with diagonal lines, the mark of a pair that no rule uses (the diagonal).
  function hatchCell(ctx, T, x, y, size) {
    ctx.save();
    ctx.fillStyle = T.ignored;
    ctx.globalAlpha = 0.45;
    ctx.fillRect(x, y, size, size);
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = T.muted;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(x, y, size, size);
    ctx.clip();
    ctx.beginPath();
    for (let d = -size; d < size; d += 4) {
      ctx.moveTo(x + d, y + size);
      ctx.lineTo(x + d + size, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  // cellName(index, side): 'row r, column c' of a flat grid index (rows and columns counted from 0).
  function cellName(index, side) {
    return 'row ' + Math.floor(index / side) + ', column ' + (index % side);
  }

  // moveOnGrid(index, side, key): the index after an arrow key (clamped to the grid), or -1 for another key.
  function moveOnGrid(index, side, key) {
    let r = Math.floor(index / side), c = index % side;
    if (key === 'ArrowLeft') c = Math.max(0, c - 1);
    else if (key === 'ArrowRight') c = Math.min(side - 1, c + 1);
    else if (key === 'ArrowUp') r = Math.max(0, r - 1);
    else if (key === 'ArrowDown') r = Math.min(side - 1, r + 1);
    else return -1;
    return r * side + c;
  }

  // plural(n, one, many): n followed by the singular or the plural word.
  function plural(n, one, many) {
    return n + ' ' + (n === 1 ? one : many);
  }

  // listText(list): the indices of a list joined by commas, or 'none'.
  function listText(list) {
    return list.length ? list.join(', ') : 'none';
  }

  // partWord(objects, parts, j): the word a grid cell shows: cat, tail, ball, grass or fence.
  function partWord(objects, parts, j) {
    return parts[j] === 'tail' ? 'tail' : objects[j];
  }

  // ------------------------------------------------------------------ Lab N: islands and pushes

  const Labs = root.Labs;
  if (!Labs || typeof Labs.register !== 'function') {
    logError('setup', new Error('window.Labs is missing, so core.js must load first (labs_p5.js, Lab N)'));
    return;
  }

  // the id written out, as in the other lab files: tests/check_page.py pairs each lab section with its literal id
  Labs.register('lab-5d-sets-nonlocal', function mount(body, core) {
    const GRID = 240;
    const ROW_H = 242;
    const SHARE = { w: 408, h: 196 };
    const PROTO = { w: 408, h: 168, panel: 120, gap: 18 };
    const HIST = { w: 216, h: 74 };
    const state = {
      side: START.side, rule: START.rule, objective: START.objective, k: START.k, neg: START.neg, tau: START.tau,
      beta: BETA.value, lr: LR.value, margin: 0, m0: 0, anchor: SCENES[START.side].anchor, partner: null,
      toy: null, start: null, startKinds: null
    };
    let ev = null;
    let marginNow = 0;
    let islandsNow = null;
    let kindsNow = null;

    // isCon(): whether the contrastive objective is chosen (the run's), as against SelfPatch's pull or a dropped push.
    function isCon() {
      return state.objective === 'contrastive';
    }

    // ---------------------------------------------------------------- controls

    const controls = core.el('div', { class: 'lab-controls' });
    const sceneCtl = segmented(core, {
      id: ID + '-scene', label: 'Scene', value: String(START.side),
      options: [['4', '4 ' + TIMES + ' 4'], ['6', '6 ' + TIMES + ' 6']],
      hint: ['4 ' + TIMES + ' 4 is the worked example of section 5.2: a cat (body and a detached tail), a ball and grass. 6 ' + TIMES + ' 6 has as many patches as a real local crop, ',
        factSpan(core, 'patch_count_96', '36'), ' ', cite(core, 'patch_count_96'), ', with a cat of nine body patches and two tail patches, a ball of four, a fence of three and grass; a real global crop has ',
        factSpan(core, 'patch_count_224', '196'), '. ', cite(core, 'patch_count_224'),
        marked(core, 'toy', [' A toy patch has only 8 numbers, so the fence has no direction of its own: it lies on the direction that every patch shares, and leans towards all of them. A new scene starts again at step 0, at k = 4.'])]
    });
    const runBtn = core.el('button', { type: 'button', class: 'btn', id: ID + '-run-setting', 'aria-describedby': ID + '-run-setting-hint' }, ['The run' + RSQUO + 's setting']);
    sceneCtl.root.appendChild(core.el('div', { class: 'button-row' }, [runBtn]));
    sceneCtl.root.appendChild(core.el('p', { class: 'control-hint', id: ID + '-run-setting-hint' }, [marked(core, 'plan', [
      'The run', RSQUO, 's setting: 6 ', TIMES, ' 6 at k = ', factSpan(core, 'nl_k_local', '4'), ', the run', RSQUO, 's k on its 96-pixel crops, which have as many patches (on its 224-pixel crops it takes k = ',
      factSpan(core, 'nl_k_rev3', '8'), '); the combined rule, the negatives at the crop', RSQUO, 's ',
      factSpan(core, 'nl_eq_tau_lo', '0.20'), ' quantile, and the contrastive objective at ', TAU, ' = ', factSpan(core, 'nl_tau', '0.2'), '. ']), cite(core, 'nl_k_local')]));
    const ruleCtl = segmented(core, {
      id: ID + '-rule', label: 'Rule: how the positives are chosen', value: START.rule,
      options: [['window', 'window'], ['row', 'row'], ['image', 'image'], ['both', 'both']],
      hint: ['window: SelfPatch', RSQUO, 's rule, the comparator: the top k of the 8 wrapped neighbours pull, and nothing pushes. ',
        'row: the anchor', RSQUO, 's own top k of all the other patches. ',
        'image: every pair at or above ', TAU, '_hi, the crop', RSQUO, 's shared high threshold. ',
        'both: the run', RSQUO, 's combined rule, the top k together with the pairs at or above ', TAU, '_hi. ',
        'Under row, image and both the negatives are the run', RSQUO, 's: every pair at or below ', TAU, '_lo, never a positive.']
    });
    const kCtl = slider(core, {
      id: ID + '-k', label: 'k, positives per anchor by rank', min: K.min, max: K.max, step: K.step, value: START.k,
      // format(v): the value as a whole number.
      format: function (v) { return core.fmt(v, 0); },
      hint: ['SelfPatch takes ', factSpan(core, 'sp_k_90b506d', '4'), ' of its 8 neighbours ', cite(core, 'sp_k_90b506d'), marked(core, 'plan', ['; the run takes ', factSpan(core, 'nl_k_rev3', '8'), ' of all the others on a 224-pixel crop and ',
        factSpan(core, 'nl_k_local', '4'), ' on a 96-pixel one. ']), cite(core, 'nl_k_local'),
        ' ', TAU, '_hi sits at the crop', RSQUO, 's quantile 1 ', MINUS, ' k/(n ', MINUS, ' 1), so the image part gives an anchor k partners on average. Both scenes start at k = 4: on 6 ', TIMES, ' 6 the run', RSQUO, 's own value for a crop of 36 patches, on 4 ', TIMES, ' 4 the worked example', RSQUO, 's.']
    });
    const hiOut = core.el('output', { id: ID + '-quantiles', 'aria-live': 'off' });
    kCtl.root.appendChild(core.el('p', { class: 'small', id: ID + '-quantiles-line' }, ['High threshold: ', hiOut]));
    const negCtl = slider(core, {
      id: ID + '-neg', label: 'Negatives: the crop' + RSQUO + 's bottom per cent of pairs', min: NEG.min, max: NEG.max, step: NEG.step, value: START.neg, role: 'negative',
      // format(v): the value as a whole per cent.
      format: function (v) { return core.fmt(v, 0) + ' %'; },
      hint: [marked(core, 'plan', ['The run puts ', TAU, '_lo at the crop', RSQUO, 's ', factSpan(core, 'nl_eq_tau_lo', '0.20'), ' quantile, the bottom 20 per cent of its ordered pairs. ']), cite(core, 'nl_eq_tau_lo'),
        ' An anchor', RSQUO, 's negatives are its candidates at or below ', TAU, '_lo, so their number varies from anchor to anchor.']
    });
    const loOut = core.el('output', { id: ID + '-low-out', 'aria-live': 'off' });
    negCtl.root.appendChild(core.el('p', { class: 'small', id: ID + '-low-line' }, ['Low threshold: ', loOut]));
    negCtl.root.appendChild(core.el('p', { class: 'small', id: ID + '-caps' }, [marked(core, 'plan', ['Caps, fixed as in the run: at most ',
      factSpan(core, 'nl_eq_positives_k', '24'), ' positives and ', factSpan(core, 'nl_eq_negatives', '48'), ' negatives per anchor, the most and the least similar. ']), cite(core, 'nl_eq_positives_k')]));
    const objectiveCtl = segmented(core, {
      id: ID + '-objective', label: 'Objective', value: START.objective,
      options: [['contrastive', 'contrastive'], ['pull', 'pull'], ['hinge', 'pull + hinge'], ['direct', 'pull + direct']],
      hint: ['contrastive: the run', RSQUO, 's ', term(core, 'contrastive loss', 'contrastive term'), ' (5.4): each positive against all the negatives at once, at temperature ', TAU, '. ',
        'pull: SelfPatch', RSQUO, 's pull alone, the cross-entropy to a target made from the positives. ',
        'pull + hinge and pull + direct: the first version', RSQUO, 's two pushes on the ', term(core, 'overlap'), ' o of the student', RSQUO, 's guess and a negative', RSQUO, 's target, weighted by ', BETA_CH, ': the ',
        term(core, 'hinge'), ' f(o) = [o ', MINUS, ' m]', SUB_PLUS, SUP_2, ' and the ', term(core, 'direct push'), ' f(o) = o. Both were dropped (5.5).']
    });
    const tauCtl = slider(core, {
      id: ID + '-tau', label: TAU + ', the temperature of the contrastive term', min: TAU_C.min, max: TAU_C.max, step: TAU_C.step, value: START.tau, role: 'negative',
      // format(v): the value with two decimals.
      format: function (v) { return core.fmt(v, 2); },
      hint: [marked(core, 'plan', ['The run uses ', TAU, ' = ', factSpan(core, 'nl_tau', '0.2'), ', which the second premise test', RSQUO, 's criterion set (5.5). ']), cite(core, 'nl_tau'),
        ' With easy negatives a lower ', TAU, ' gives them a smaller share of each denominator, so they push less, and the positive pulls less too, because the pull', RSQUO, 's weight is the pushes', RSQUO, ' total (5.4).']
    });
    const marginCtl = slider(core, {
      id: ID + '-margin', label: 'Margin m of the hinge', min: MARGIN.min, max: MARGIN.max, step: MARGIN.step, value: 0, role: 'negative',
      // format(v): the value with four decimals.
      format: function (v) { return core.fmt(v, 4); },
      hint: ['LC1 takes m from the median overlap of ', factSpan(core, 'lc1_margin', '64'), ' random pairs of the same crop. ', cite(core, 'lc1_margin'),
        ' Here it starts at the toy', RSQUO, 's own median over ', String(PAIRS), ' random pairs (seed ', String(PAIR_SEED), '). The direct push does not use m; the readout still counts the pairs with o > m.']
    });
    const betaCtl = slider(core, {
      id: ID + '-beta', label: BETA_CH + ', the weight of the push', min: BETA.min, max: BETA.max, step: BETA.step, value: BETA.value, role: 'negative',
      // format(v): the value with two decimals.
      format: function (v) { return core.fmt(v, 2); },
      hint: ['The first version weighted its direct push with ', BETA_CH, ' = ', String(BETA_PLAN.direct), ', and LC1 gives its hinge ', BETA_CH, ' = ',
        factSpan(core, 'lc1_total', '0.1'), '. ', cite(core, 'lc1_total'), ' Revision 2 dropped both pushes (5.5).']
    });
    const fixed = core.el('div', { class: 'control-group' }, [
      core.el('p', { class: 'control-group-title' }, ['Fixed']),
      core.el('p', { class: 'small', id: ID + '-fixed' }, [marked(core, 'plan', ['The contrastive term enters the total with the run', RSQUO, 's weight ', LAMBDA_CH, ' = ',
        factSpan(core, 'nl_eq_total', '1'), ': L = L_global + ', LAMBDA_CH, ' L_con. ']), cite(core, 'nl_eq_total')]),
      core.el('p', { class: 'small', id: ID + '-fixed-pull' }, ['The pull forms keep SelfPatch', RSQUO, 's own weight of its patch term, ', LAMBDA_CH, ' = ', factSpan(core, 'sp_lambda_90b506d', '0.1'), ' ', cite(core, 'sp_lambda_90b506d'),
        ', and its temperatures, ', TAU, '_t = ', factSpan(core, 'temp_teacher_90b506d', '0.04'), ' ', cite(core, 'temp_teacher_90b506d'), ' for the targets and ', TAU, '_s = ',
        factSpan(core, 'temp_student', '0.1'), ' for the guesses. ', cite(core, 'temp_student')]),
      core.el('p', { class: 'small', id: ID + '-fixed-toy' }, [marked(core, 'toy', [
        'Fixed in this toy: one head W of ', String(DIM), ' ', term(core, 'prototype', 'prototypes'), ' for the pull forms (the real patch head has ']),
        factSpan(core, 'sp_patch_prototypes', '4,096'), ') ', cite(core, 'sp_patch_prototypes'), marked(core, 'toy', [
        ', and a teacher that follows the student by ', term(core, 'exponential moving average', 'EMA'), ' ', String(EMA), ' per ', term(core, 'toy step'),
        ' (the real teacher keeps ']), factSpan(core, 'ema_ours_schedule_90b506d', '0.9995'), ' or more of itself at each step). ', cite(core, 'ema_ours_schedule_90b506d')
      ])
    ]);
    const lrCtl = slider(core, {
      id: ID + '-lr', label: 'Learning rate (toy)', min: LR.min, max: LR.max, step: LR.step, value: LR.value, role: 'student',
      // format(v): the value with two decimals.
      format: function (v) { return core.fmt(v, 2); },
      hint: [marked(core, 'toy', ['A toy number: each step moves the student', RSQUO, 's features directly, then scales them back to length 1.'])]
    });
    const stepOut = core.el('output', { id: ID + '-step-out', 'aria-live': 'polite' }, ['step 0']);
    const trainBtns = TRAIN.map(function (n) {
      return core.el('button', { type: 'button', class: n === 1 ? 'btn btn-primary' : 'btn', id: ID + '-train-' + n }, ['Train ' + plural(n, 'step', 'steps')]);
    });
    const resetBtn = core.el('button', { type: 'button', class: 'btn', id: ID + '-reset' }, ['Reset']);
    const trainCtl = core.el('div', { class: 'control' }, [
      core.el('span', { class: 'control-label', id: ID + '-train-label' }, ['Train the toy']),
      stepOut,
      core.el('div', { class: 'button-row', role: 'group', 'aria-labelledby': ID + '-train-label' }, trainBtns.concat([resetBtn])),
      core.el('p', { class: 'control-hint', id: ID + '-train-hint' }, [marked(core, 'toy', [
        'One ', term(core, 'toy step'), ': the gradient of the chosen objective moves the student', RSQUO, 's features, the teacher follows, and the positives and negatives are chosen again from the teacher. Reset goes back to step 0 and keeps the controls.'])])
    ]);
    const anchorOut = core.el('output', { id: ID + '-anchor-out', 'aria-live': 'off' });
    const anchorCtl = core.el('div', { class: 'control' }, [
      core.el('span', { class: 'control-label', id: ID + '-anchor-label' }, ['Anchor']),
      anchorOut,
      core.el('p', { class: 'control-hint', id: ID + '-anchor-hint' }, ['Click a patch to make it the ', term(core, 'anchor'),
        '. Under the contrastive objective a click on an orange ', term(core, 'positive'), ' shows its denominator, and a second click on it makes it the anchor; under the pull forms the same goes for a purple ',
        term(core, 'negative'), ' and its target. On the focused grid the arrow keys move the anchor and N steps through the partners shown.'])
    ]);
    [sceneCtl.root, ruleCtl.root, kCtl.root, negCtl.root, objectiveCtl.root, tauCtl.root, marginCtl.root, betaCtl.root, fixed, lrCtl.root, trainCtl, anchorCtl].forEach(function (n) { controls.appendChild(n); });

    // ---------------------------------------------------------------- stage

    const stage = core.el('div', { class: 'lab-stage' });
    const grid = makeCanvas(core, { id: ID + '-grid', w: GRID, h: GRID, interactive: true });
    const gridLabel = core.el('span', { id: ID + '-grid-label' });
    const rowHolder = core.el('div', { id: ID + '-row' });
    const matrix = makeCanvas(core, { id: ID + '-matrix', w: GRID, h: GRID });
    const partnerLabel = core.el('span', { id: ID + '-partner-label' });
    const partnerHolder = core.el('div', { id: ID + '-partner' });
    const partnerNote = core.el('p', { class: 'small', id: ID + '-partner-note', style: { maxWidth: SHARE.w + 'px' } });
    const anchorRead = readout(core, ID + '-anchor-readout', [['sets', 'Sets'], ['a', 'Terms'], ['b', 'Shares'], ['c', 'Mean'], ['total', 'Total']]);
    const cropRead = readout(core, ID + '-crop-readout', [
      ['positives', 'Positives per anchor'], ['empty', 'Empty anchors'], ['negatives', 'Negatives per anchor'], ['cuts', 'Cap cuts'],
      ['share', 'Negatives' + RSQUO + ' mean share'], ['losses', 'Whole crop'], ['median', 'Random-pair median'], ['step', 'Step'], ['islands', 'Islands']
    ]);
    const anchorHead = core.el('p', { class: 'stage-label', id: ID + '-anchor-head' });
    // made once and moved into the islands readout at every redraw, so the glossary button boot.js prepares on it stays
    const islandsTerm = term(core, 'within-object cosine', 'within the objects');
    const shareTerm = term(core, 'denominator share', 'denominator shares');
    const cropHead = core.el('p', { class: 'stage-label', id: ID + '-crop-head' });

    stage.appendChild(core.el('div', { class: 'stage-row' }, [
      stageCell(core, [gridLabel], [grid, core.el('ul', { class: 'legend' }, [
        core.el('li', { class: 'role-positive' }, [term(core, 'positive', 'positive'), ': pulled closer']),
        core.el('li', { class: 'role-negative' }, ['negative: pushed apart']),
        core.el('li', { class: 'role-ignored' }, ['candidate the rule leaves alone']),
        core.el('li', null, ['thick outline: anchor; dashed: its 3 ', TIMES, ' 3 window; inner ring: the partner whose chart is shown'])
      ])], GRID + 40),
      stageCell(core, ['The anchor', RSQUO, 's similarity row, most similar first'], [rowHolder, core.el('ul', { class: 'legend' }, [
        core.el('li', null, ['hatched bars: window neighbours']),
        core.el('li', null, ['lines: ', TAU, '_hi and ', TAU, '_lo, the crop', RSQUO, 's two shared thresholds; dashed when the rule does not use one'])
      ])], 520)
    ]));
    stage.appendChild(core.el('div', { class: 'stage-row' }, [
      stageCell(core, ['Cosines of every pair of the crop, a ', term(core, 'heat map')], [matrix, core.el('p', { class: 'small', id: ID + '-matrix-key', style: { maxWidth: GRID + 'px', margin: '0' } },
        ['Stronger ink: more alike; the bare background: 0 or below. Hatched: a patch with itself, never a candidate. The outlined row and column belong to the anchor.'])], GRID + 30),
      stageCell(core, [partnerLabel], [partnerHolder, partnerNote], SHARE.w)
    ]));
    stage.appendChild(anchorHead);
    stage.appendChild(anchorRead.root);
    stage.appendChild(cropHead);
    stage.appendChild(cropRead.root);

    body.appendChild(controls);
    body.appendChild(stage);

    // ---------------------------------------------------------------- the computation

    // opts(): the current settings as LabN.evaluate reads them.
    function opts() {
      return { objective: state.objective, rule: state.rule, k: state.k, negQ: state.neg / 100, tau: state.tau, margin: state.margin, beta: state.beta };
    }

    // resetToy(): the scene at step 0 (student = teacher = the tokens), its random-pair median of the overlaps, and the step-0 islands and kinds.
    function resetToy() {
      state.toy = startState(state.side);
      state.m0 = marginOf(losses(state.toy.student, state.toy.teacher, state.side, {}));
      state.start = islands(state.toy.teacher, state.toy.objects);
      state.startKinds = objectCosines(state.toy.teacher, state.toy.objects);
    }

    // recompute(): the evaluation of the current state and settings, the islands, the median of the overlaps (pull forms), and a valid partner to show: under the contrastive objective the positive with the smallest gap to the closest negative, under the pull forms the negative with the largest overlap.
    function recompute() {
      ev = evaluate(state.toy.student, state.toy.teacher, state.side, opts());
      islandsNow = islands(state.toy.teacher, state.toy.objects);
      kindsNow = objectCosines(state.toy.teacher, state.toy.objects);
      const a = state.anchor;
      if (isCon()) {
        const P = ev.sets.P[a], t = ev.terms[a];
        if (state.partner === null || P.indexOf(state.partner) < 0) {
          state.partner = null;
          if (t) {
            let best = t.positives[0];
            t.positives.forEach(function (e) { if (e.gap < best.gap) best = e; });
            state.partner = best.index;
          } else if (P.length) {
            state.partner = P[0];
          }
        }
      } else {
        marginNow = marginOf(ev.pull);
        const N = ev.sets.N[a];
        if (state.partner === null || N.indexOf(state.partner) < 0) {
          let best = null;
          N.forEach(function (j, t) { if (best === null || ev.pull.overlaps[a][t] > ev.pull.overlaps[a][best]) best = t; });
          state.partner = best === null ? null : N[best];
        }
      }
    }

    // roleOf(j): what patch j is for the anchor under the current rule: 'anchor', 'positive', 'negative', 'ignored' (a candidate left alone) or 'none' (not a candidate).
    function roleOf(j) {
      const a = state.anchor;
      if (j === a) return 'anchor';
      if (ev.sets.P[a].indexOf(j) >= 0) return 'positive';
      if (ev.sets.N[a].indexOf(j) >= 0) return 'negative';
      if (state.rule === 'window' && core.neighbours8(a, state.side).indexOf(j) < 0) return 'none';
      return 'ignored';
    }

    // termOf(a, p): the contrastive term of anchor a for its positive p (an entry of contrastiveAnchor's positives), or null.
    function termOf(a, p) {
      const t = ev.terms ? ev.terms[a] : null;
      if (!t) return null;
      return t.positives.filter(function (e) { return e.index === p; })[0] || null;
    }

    // ---------------------------------------------------------------- drawings

    // drawGrid(T): the crop's patches with their objects, the anchor, its window, its positives and negatives, and the partner shown on the right.
    function drawGrid(T) {
      const side = state.side, cell = GRID / side, a = state.anchor;
      const objects = state.toy.objects, parts = state.toy.parts;
      const ctx = core.fitCanvas(grid, GRID, GRID);
      ctx.fillStyle = T.paper;
      ctx.fillRect(0, 0, GRID, GRID);
      for (let j = 0; j < side * side; j++) {
        const role = roleOf(j);
        let fill = null;
        if (role === 'positive') fill = core.rgba(T.positive, 0.85);
        else if (role === 'negative') fill = core.rgba(T.negative, 0.85);
        else if (role === 'ignored') fill = core.rgba(T.ignored, 0.35);
        if (!fill) continue;
        ctx.fillStyle = fill;
        ctx.fillRect((j % side) * cell, Math.floor(j / side) * cell, cell, cell);
      }
      ctx.strokeStyle = T.line;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let t = 1; t < side; t++) {
        ctx.moveTo(Math.round(t * cell) + 0.5, 0);
        ctx.lineTo(Math.round(t * cell) + 0.5, GRID);
        ctx.moveTo(0, Math.round(t * cell) + 0.5);
        ctx.lineTo(GRID, Math.round(t * cell) + 0.5);
      }
      ctx.stroke();
      for (let j = 0; j < side * side; j++) {
        const x = (j % side) * cell, y = Math.floor(j / side) * cell;
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';
        ctx.font = '500 ' + (side === 4 ? 11 : 9) + 'px ' + MONO;
        haloText(ctx, T, String(j), x + 3, y + 3);
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        ctx.font = '600 ' + (side === 4 ? 12 : 10) + 'px ' + MONO;
        haloText(ctx, T, partWord(objects, parts, j), x + cell / 2, y + cell / 2 + (side === 4 ? 4 : 3));
      }
      ctx.save();
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = T.ink;
      core.neighbours8(a, side).forEach(function (j) {
        ctx.strokeRect((j % side) * cell + 2.5, Math.floor(j / side) * cell + 2.5, cell - 5, cell - 5);
      });
      ctx.restore();
      if (state.partner !== null) {
        const j = state.partner;
        ctx.lineWidth = 2;
        ctx.strokeStyle = T.ink;
        ctx.strokeRect((j % side) * cell + 6, Math.floor(j / side) * cell + 6, cell - 12, cell - 12);
      }
      ctx.lineWidth = 6;
      ctx.strokeStyle = T.paper;
      ctx.strokeRect((a % side) * cell + 3, Math.floor(a / side) * cell + 3, cell - 6, cell - 6);
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = T.ink;
      ctx.strokeRect((a % side) * cell + 3, Math.floor(a / side) * cell + 3, cell - 6, cell - 6);
      const P = ev.sets.P[a], N = ev.sets.N[a];
      grid.setAttribute('aria-label', 'The ' + side + ' by ' + side + ' toy crop. Anchor: patch ' + a + ' (' + cellName(a, side) + '), ' + partWord(objects, parts, a) +
        '. Positives: ' + listText(P) + '. Negatives: ' + listText(N) + '. Click a patch, or use the arrow keys, to move the anchor; click a ' + (isCon() ? 'positive' : 'negative') +
        ', or press N, to show another partner, and click it again to make it the anchor.');
      setContent(gridLabel, ['The crop: ', String(side), ' ', TIMES, ' ', String(side), ' patches under the ', state.rule, ' rule']);
    }

    // drawRow(): the anchor's similarity to every other patch, most similar first: bars coloured by role, window neighbours hatched, and the crop's two shared thresholds, solid when the rule uses them and dashed when it does not.
    function drawRow() {
      const a = state.anchor, S = ev.S, n = S.length;
      const order = rankings(S)[a];
      const th = runThresholds(S, state.k, state.neg / 100);
      const slot = n <= 16 ? 24 : 13;
      const x0 = 46, Wd = x0 + (n - 1) * slot + 14, top = 26, base = ROW_H - 64;
      let lo = 0;
      order.forEach(function (j) { lo = Math.min(lo, S[a][j]); });
      lo = Math.min(-0.25, Math.floor(Math.min(lo, th.lo.value) * 4) / 4);
      const hi = 1;
      // Y(s): the vertical position of cosine s.
      function Y(s) { return top + (base - top) * (hi - s) / (hi - lo); }
      const win = core.neighbours8(a, state.side);
      const svg = svgChart(core, ID + '-row-chart', Wd, ROW_H, 'Similarities of patch ' + a + ' to the ' + (n - 1) + ' other patches, most similar first: ' +
        order.map(function (j) { return j + ' ' + core.fmt(S[a][j], 3) + ' ' + roleOf(j); }).join(', ') + '. Thresholds ' + TAU + '_hi ' + core.fmt(th.hi.value, 4) +
        ' and ' + TAU + '_lo ' + core.fmt(th.lo.value, 4) + '.');
      svg.appendChild(core.el('defs', null, [core.el('pattern', { id: ID + '-hatch', width: 5, height: 5, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, [
        line(core, 0, 0, 0, 5, { style: 'stroke: var(--ink); stroke-width: 1.6; stroke-opacity: 0.6' })
      ])]));
      const gridG = core.el('g', { class: 'grid' });
      [1, 0.5, 0, -0.5, -1].forEach(function (v) {
        if (v < lo) return;
        gridG.appendChild(line(core, x0, Y(v), Wd - 8, Y(v)));
        svg.appendChild(tx(core, x0 - 6, Y(v) + 4, (v < 0 ? MINUS : '') + String(Math.abs(v)), { 'text-anchor': 'end' }));
      });
      svg.appendChild(gridG);
      order.forEach(function (j, r) {
        const s = S[a][j], role = roleOf(j);
        const x = x0 + r * slot + 2, w = slot - 4;
        const y1 = Y(Math.max(0, s)), y2 = Y(Math.min(0, s));
        const cls = role === 'positive' || role === 'negative' ? 'bar role-' + role : 'bar role-ignored';
        svg.appendChild(withTitle(core, rect(core, x, y1, w, Math.max(1, y2 - y1), { class: cls }),
          'patch ' + j + ' (' + partWord(state.toy.objects, state.toy.parts, j) + '): cosine ' + core.fmt(s, 4) + ', ' + role + (win.indexOf(j) >= 0 ? ', window neighbour' : '')));
        if (win.indexOf(j) >= 0) svg.appendChild(rect(core, x, y1, w, Math.max(1, y2 - y1), { style: 'fill: url(#' + ID + '-hatch); pointer-events: none' }));
        svg.appendChild(tx(core, x + w / 2, base + 14, String(j), { 'text-anchor': 'middle', style: n > 16 ? 'font-size: 8px' : null }));
        svg.appendChild(tx(core, x + w / 2, base + 26, partWord(state.toy.objects, state.toy.parts, j).charAt(0), { 'text-anchor': 'middle', style: n > 16 ? 'font-size: 8px' : null }));
      });
      svg.appendChild(core.el('g', { class: 'axis' }, [line(core, x0, Y(0) + 0.5, Wd - 8, Y(0) + 0.5)]));
      const usesHi = state.rule === 'image' || state.rule === 'both', usesLo = state.rule !== 'window';
      [['hi', th.hi.value, usesHi], ['lo', th.lo.value, usesLo]].forEach(function (t) {
        svg.appendChild(line(core, x0, Y(t[1]), Wd - 8, Y(t[1]), { style: 'stroke: var(--ink); stroke-width: 1.5' + (t[2] ? '' : '; stroke-dasharray: 5 4') }));
        svg.appendChild(tx(core, Wd - 10, Y(t[1]) - 4, TAU + '_' + t[0] + ' ' + core.fmt(t[1], 4), { 'text-anchor': 'end', class: 'title', style: HALO }));
      });
      const words = { window: 'dashed: the window rule uses neither threshold', row: TAU + '_lo chooses the negatives; ' + TAU + '_hi (dashed) is not used',
        image: 'both thresholds select under this rule', both: 'both thresholds select under this rule' };
      svg.appendChild(tx(core, x0, 14, words[state.rule], { class: 'title' }));
      // the axis caption on two lines, so that it fits the 4 x 4 scene's 420-unit chart
      svg.appendChild(tx(core, x0 + (Wd - x0) / 2, ROW_H - 19, 'under each bar: the patch index, then its kind', { 'text-anchor': 'middle' }));
      svg.appendChild(tx(core, x0 + (Wd - x0) / 2, ROW_H - 6, 'c cat, t tail, b ball, g grass, f fence', { 'text-anchor': 'middle' }));
      setContent(rowHolder, svg);
    }

    // drawMatrix(T): the n x n cosine matrix in ink on the page's ground, stronger for larger cosines (the bare ground for 0 or below), the diagonal hatched, the anchor's row and column outlined.
    function drawMatrix(T) {
      const n = ev.n, px = n <= 16 ? 15 : 7, size = n * px, a = state.anchor;
      const ctx = core.fitCanvas(matrix, size, size);
      ctx.fillStyle = T.paper;
      ctx.fillRect(0, 0, size, size);
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (i === j) {
            hatchCell(ctx, T, j * px, i * px, px);
            continue;
          }
          const v = ev.S[i][j];
          if (v > 0) {
            ctx.fillStyle = core.rgba(T.ink, Math.min(1, v));
            ctx.fillRect(j * px, i * px, px, px);
          }
        }
      }
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = T.paper;
      ctx.strokeRect(1, a * px, size - 2, px);
      ctx.strokeRect(a * px, 1, px, size - 2);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = T.ink;
      ctx.strokeRect(1, a * px, size - 2, px);
      ctx.strokeRect(a * px, 1, px, size - 2);
      const isl = islandsNow;
      matrix.setAttribute('aria-label', 'Cosine matrix of the ' + n + ' patches of the teacher, patch index on both axes; stronger ink means more alike. Mean cosine within the objects ' +
        core.fmt(isl.objects, 3) + ', within the grass ' + core.fmt(isl.grass, 3) + ', between different kinds ' + core.fmt(isl.between, 3) + '. The anchor ' + a + ' is outlined.');
    }

    // drawShares(): for the contrastive objective, who holds the denominator of the shown positive's term: the positive's share w_p (orange) and each negative's share w_n (purple), with the term and the weights of the pull and of the pushes on the student's token.
    function drawShares() {
      const a = state.anchor, t = ev.terms[a], tau = state.tau;
      const e = termOf(a, state.partner);
      setContent(partnerLabel, ['Who holds the denominator of l(', String(a), ', p): the ', shareTerm]);
      if (!t || !e) {
        const why = state.rule === 'window' ? 'The window rule has no negatives, so anchor ' + a + ' has no contrastive term: SelfPatch' + RSQUO + 's window only pulls. Choose the objective pull to see its loss.'
          : (ev.sets.P[a].length ? 'Anchor ' + a + ' has no candidate at or below ' + TAU + '_lo, so it has no negative and no term; its l is 0, and it still counts in the mean over the anchors.'
            : 'Anchor ' + a + ' has no positive under this rule, so it has no term.');
        setContent(partnerHolder, core.el('p', { class: 'small', id: ID + '-shares-empty', style: { maxWidth: SHARE.w + 'px' } }, [why]));
        setContent(partnerNote, '');
        return;
      }
      const bars = [{ j: e.index, w: e.share_positive, role: 'positive' }].concat(t.negatives.map(function (x, m) { return { j: x.index, w: e.shares_negative[m], role: 'negative' }; }));
      const x0 = 34, top = 30, base = SHARE.h - 40;
      const slot = Math.min(34, (SHARE.w - x0 - 8) / bars.length);
      // Y(w): the vertical position of a share w.
      const Y = function (w) { return base - (base - top) * w; };
      const svg = svgChart(core, ID + '-share-chart', SHARE.w, SHARE.h, 'The denominator of l(' + a + ', ' + e.index + ') at ' + TAU + ' ' + core.fmt(tau, 2) + ': the positive ' + e.index + ' holds ' +
        core.fmt(e.share_positive, 4) + '; the negatives ' + bars.slice(1).map(function (b) { return b.j + ' ' + core.fmt(b.w, 4); }).join(', ') + '; the term is ' + core.fmt(e.term, 4) + '.');
      const gridG = core.el('g', { class: 'grid' });
      [0.5, 1].forEach(function (v) { gridG.appendChild(line(core, x0, Y(v), SHARE.w - 4, Y(v))); });
      svg.appendChild(gridG);
      [[0, '0'], [0.5, '0.5'], [1, '1']].forEach(function (v) { svg.appendChild(tx(core, x0 - 6, Y(v[0]) + 4, v[1], { 'text-anchor': 'end' })); });
      bars.forEach(function (b, m) {
        const x = x0 + m * slot + 1.5, w = slot - 3, h = (base - top) * b.w;
        svg.appendChild(withTitle(core, rect(core, x, base - h, w, Math.max(0.5, h), { class: 'bar role-' + b.role }),
          (b.role === 'positive' ? 'positive ' : 'negative ') + b.j + ': ' + core.fmt(b.w, 4)));
        svg.appendChild(tx(core, x + w / 2, base + 13, String(b.j), { 'text-anchor': 'middle', style: 'font-size: 9px' }));
      });
      svg.appendChild(core.el('g', { class: 'axis' }, [line(core, x0, base + 0.5, SHARE.w - 4, base + 0.5)]));
      svg.appendChild(tx(core, x0, 16, 'l(' + a + ', ' + e.index + ') = ' + MINUS + 'log ' + core.fmt(e.share_positive, 4) + ' = ' + core.fmt(e.term, 4) + ' at ' + TAU + ' = ' + core.fmt(tau, 2), { class: 'title' }));
      svg.appendChild(tx(core, x0 + (SHARE.w - x0) / 2, SHARE.h - 6, 'the positive, then its negatives, by patch', { 'text-anchor': 'middle' }));
      setContent(partnerHolder, svg);
      setContent(partnerNote, [marked(core, 'toy', [
        'The negatives hold 1 ', MINUS, ' w_p = ', core.fmt(e.share_negatives, 4), ' of the denominator. On the student', RSQUO, 's token z^s_', String(a), ' the positive pulls with (1/', TAU, ')(1 ', MINUS, ' w_p) = ',
        core.fmt(1 / tau, 2), ' ', TIMES, ' ', core.fmt(e.share_negatives, 4), ' = ', core.fmt(e.share_negatives / tau, 4), ', and each negative pushes with (1/', TAU, ') w_n: the pull', RSQUO, 's weight is the pushes', RSQUO,
        ' total. Click another orange patch to show its denominator.'])]);
    }

    // drawPrototypes(): for the pull forms, three bar charts over the 8 prototypes: the anchor's target q_i (teacher), the student's guess p_i, and the shown negative's target q_j.
    function drawPrototypes() {
      const a = state.anchor, an = ev.pull;
      const neg = state.partner;
      setContent(partnerLabel, ['Prototype distributions of the pull and the push']);
      const panels = [
        { values: an.qAgg[a], role: 'teacher', title: 'target q_' + a, empty: 'no positives: an empty row' },
        { values: an.p[a], role: 'student', title: 'student p_' + a, empty: '' },
        { values: neg === null ? null : an.qSingle[neg], role: 'negative', title: neg === null ? 'no negative' : 'negative' + RSQUO + 's q_' + neg,
          empty: state.rule === 'window' ? 'the window rule has no negatives' : 'this anchor has no negatives' }
      ];
      const top = 34, base = PROTO.h - 30;
      const svg = svgChart(core, ID + '-prototype-chart', PROTO.w, PROTO.h, 'Prototype distributions of anchor ' + a + ': ' + panels.map(function (p) {
        return p.title + (p.values ? ' ' + Array.from(p.values).map(function (v) { return core.fmt(v, 3); }).join(' ') : ' (' + p.empty + ')');
      }).join('; ') + '.');
      panels.forEach(function (p, t) {
        const x0 = t * (PROTO.panel + PROTO.gap) + 4, slot = PROTO.panel / DIM;
        svg.appendChild(tx(core, x0, 14, p.title, { class: 'title' }));
        svg.appendChild(core.el('g', { class: 'axis' }, [line(core, x0, base + 0.5, x0 + PROTO.panel, base + 0.5)]));
        if (!p.values) {
          svg.appendChild(tx(core, x0, top + 30, p.empty, { style: 'font-size: 10px' }));
          return;
        }
        const g = core.el('g', { class: 'role-' + p.role });
        for (let k = 0; k < DIM; k++) {
          const v = p.values[k], h = (base - top) * v;
          g.appendChild(withTitle(core, rect(core, x0 + k * slot + 1.5, base - h, slot - 3, Math.max(0.5, h), { class: 'bar' }), 'prototype ' + (k + 1) + ': ' + core.fmt(v, 4)));
          svg.appendChild(tx(core, x0 + k * slot + slot / 2, base + 13, String(k + 1), { 'text-anchor': 'middle', style: 'font-size: 9px' }));
        }
        svg.appendChild(g);
        let best = 0;
        for (let k = 1; k < DIM; k++) if (p.values[k] > p.values[best]) best = k;
        svg.appendChild(tx(core, x0 + PROTO.panel, 26, 'top ' + (best + 1) + ': ' + core.fmt(p.values[best], 3), { 'text-anchor': 'end' }));
      });
      svg.appendChild(tx(core, PROTO.w / 2, PROTO.h - 4, 'prototypes 1 to ' + DIM, { 'text-anchor': 'middle' }));
      setContent(partnerHolder, svg);
      const oText = neg === null ? null : core.fmt(an.overlaps[a][ev.sets.N[a].indexOf(neg)], 4);
      setContent(partnerNote, [marked(core, 'toy', [
        'Blue is the teacher', RSQUO, 's target for the anchor, made from its positives; green is the student', RSQUO, 's guess from its own token; purple is the target of one negative. ',
        oText === null ? 'With no negative there is nothing to push.' : 'Their overlap o(' + a + ', ' + neg + ') = ' + SIGMA + '_c p_c q_c = ' + oText + ': the push lowers it. Click another purple patch to show its target.'
      ])]);
    }

    // degreeHistogram(degrees): a small SVG bar chart of how many anchors keep each number of positives.
    function degreeHistogram(degrees) {
      let mx = 0;
      degrees.forEach(function (d) { mx = Math.max(mx, d); });
      const top = Math.max(mx, state.k + 2);
      const counts = [];
      for (let d = 0; d <= top; d++) counts.push(0);
      degrees.forEach(function (d) { counts[d]++; });
      const most = Math.max.apply(null, counts) || 1;
      const slot = Math.min(18, (HIST.w - 12) / counts.length), base = HIST.h - 16;
      const svg = svgChart(core, ID + '-degree-chart', HIST.w, HIST.h, 'Positives per anchor: ' + counts.map(function (c, d) { return c ? c + ' with ' + d : null; }).filter(Boolean).join(', ') + '.');
      counts.forEach(function (c, d) {
        const h = (base - 12) * c / most, x = 6 + d * slot;
        if (c) svg.appendChild(rect(core, x + 1, base - h, slot - 2, h, { class: d === 0 ? 'bar role-ignored' : 'bar role-positive' }));
        if (c) svg.appendChild(tx(core, x + slot / 2, base - h - 2, String(c), { 'text-anchor': 'middle', style: 'font-size: 9px' }));
        if (d % (counts.length > 12 ? 2 : 1) === 0) svg.appendChild(tx(core, x + slot / 2, HIST.h - 4, String(d), { 'text-anchor': 'middle', style: 'font-size: 9px' }));
      });
      svg.appendChild(core.el('g', { class: 'axis' }, [line(core, 4, base + 0.5, HIST.w - 4, base + 0.5)]));
      return svg;
    }

    // kindsText(kinds): the cosine inside each object kind of the crop (cat, ball, fence), three decimals.
    function kindsText(kinds) {
      return ['cat', 'ball', 'fence'].filter(function (k) { return kinds[k] !== undefined; }).map(function (k) { return k + ' ' + core.fmt(kinds[k], 3); }).join(', ');
    }

    // drawReadouts(): the anchor's terms (contrastive) or its pull, overlaps and push (pull forms), and its total; the whole crop's counts, losses, step and islands.
    function drawReadouts() {
      const a = state.anchor, n = ev.n, P = ev.sets.P[a], N = ev.sets.N[a];
      setContent(anchorHead, ['Anchor ', String(a), ' (', cellName(a, state.side), ', ', partWord(state.toy.objects, state.toy.parts, a), ')']);
      anchorRead.set('sets', 'P(' + a + ') = ' + listText(P) + '; N(' + a + ') = ' + listText(N));
      if (isCon()) {
        const t = ev.terms[a];
        anchorRead.name('a', 'Terms l(' + a + ', p)');
        anchorRead.name('b', 'Negatives' + RSQUO + ' share');
        anchorRead.name('c', 'L_' + a);
        if (!t) {
          const why = state.rule === 'window' ? 'none: the window rule has no negatives, so there is no contrastive term' : (P.length ? 'none: no negative, so every l(' + a + ', p) is 0' : 'none: no positive');
          anchorRead.set('a', why);
          anchorRead.set('b', 'no denominator to share');
          anchorRead.set('c', 'L_' + a + ' = 0');
          anchorRead.set('total', 'L_global (unchanged) + ' + LAMBDA_CH + ' ' + TIMES + ' 0');
        } else {
          anchorRead.set('a', t.positives.map(function (e) { return 'l(' + a + ', ' + e.index + ') = ' + core.fmt(e.term, 4); }).join('; '));
          anchorRead.set('b', 'of each denominator: ' + t.positives.map(function (e) { return core.fmt(e.share_negatives, 4); }).join(', '));
          anchorRead.set('c', 'L_' + a + ' = the mean of the ' + plural(t.positives.length, 'term', 'terms') + ' = ' + core.fmt(t.value, 4));
          anchorRead.set('total', 'L_global (unchanged) + ' + LAMBDA_CH + ' L_' + a + ' = L_global + ' + core.fmt(CON.lambda, 0) + ' ' + TIMES + ' ' + core.fmt(t.value, 4));
        }
      } else {
        const an = ev.pull;
        const formWords = { pull: 'no push: f(o) = 0', hinge: 'hinge: f(o) = [o ' + MINUS + ' ' + core.fmt(state.margin, 4) + ']' + SUB_PLUS + SUP_2, direct: 'direct: f(o) = o' };
        anchorRead.name('a', 'Pull');
        anchorRead.name('b', 'Overlaps');
        anchorRead.name('c', 'Push');
        anchorRead.set('a', an.patch[a] === null ? 'P(' + a + ') is empty, so this anchor drops out of the pull'
          : 'L_patch(' + a + ') = ' + MINUS + SIGMA + ' q log p = ' + core.fmt(an.patch[a], 4));
        anchorRead.set('b', N.length ? N.map(function (j, t) {
          const o = an.overlaps[a][t];
          return 'o(' + a + ', ' + j + ') = ' + core.fmt(o, 4) + (o > state.margin ? ' > m' : '');
        }).join('; ') : 'no negatives, nothing to push');
        const pa = an.pushAnchor[a];
        const pushText = state.objective === 'pull' ? 'none under the pull alone' : (pa === null ? 'L_push(' + a + ') = 0 (no negatives)' : 'L_push(' + a + ') = mean of f(o) = ' + core.fmt(pa, 4) + ', ' + formWords[state.objective]);
        const bp = state.objective === 'pull' ? 0 : state.beta * (pa === null ? 0 : pa);
        anchorRead.set('c', state.objective === 'pull' ? pushText : pushText + '; ' + BETA_CH + ' ' + TIMES + ' push = ' + core.fmt(bp, 4));
        anchorRead.set('total', an.patch[a] === null ? 'L_global (unchanged) + ' + core.fmt(LAMBDA, 1) + ' ' + TIMES + ' ' + core.fmt(bp, 4) + ' = L_global + ' + core.fmt(LAMBDA * bp, 4) + ' (SelfPatch' + RSQUO + 's weight 0.1)'
          : 'L_global (unchanged) + ' + core.fmt(LAMBDA, 1) + ' ' + TIMES + ' (' + core.fmt(an.patch[a], 4) + ' + ' + core.fmt(bp, 4) + ') = L_global + ' + core.fmt(LAMBDA * (an.patch[a] + bp), 4) + ' (SelfPatch' + RSQUO + 's weight 0.1)');
      }
      setContent(cropHead, ['The whole crop: ', String(n), ' anchors']);
      const dp = ev.sets.degreePositive, dn = ev.sets.degreeNegative;
      // mean(v): the mean of a list of numbers.
      const mean = function (v) { return v.reduce(function (x, y) { return x + y; }, 0) / v.length; };
      cropRead.set('positives', [degreeHistogram(dp), core.el('br'), 'mean ' + core.fmt(mean(dp), 2) + ', from ' + Math.min.apply(null, dp) + ' to ' + Math.max.apply(null, dp)]);
      cropRead.set('empty', ev.sets.emptyPositive + ' of ' + n + ' anchors have no positive' + (state.rule === 'image' ? ' (the image rule alone can empty an anchor; lower k to see it)' : (state.rule === 'both' ? ' (none can: the floor of k by rank)' : '')));
      cropRead.set('negatives', state.rule === 'window' ? 'none: the window rule only pulls'
        : 'mean ' + core.fmt(mean(dn), 2) + ', from ' + Math.min.apply(null, dn) + ' to ' + Math.max.apply(null, dn) + '; ' + plural(ev.sets.emptyNegative, 'anchor', 'anchors') + ' without one');
      cropRead.set('cuts', state.rule === 'window' ? 'none: the window rule has no cap'
        : ev.sets.cutsPositive + ' positives above the cap of ' + CON.capPos + ' and ' + ev.sets.cutsNegative + ' negatives above the cap of ' + CON.capNeg);
      if (isCon()) {
        cropRead.name('share', 'Negatives' + RSQUO + ' mean share');
        cropRead.set('share', core.fmt(ev.shareMean, 4) + ', the mean over the crop' + RSQUO + 's ' + ev.pairs + ' (anchor, positive) pairs, 0 where an anchor has no negative');
        cropRead.set('losses', 'L_con = the mean of L_i over the ' + n + ' anchors = ' + core.fmt(ev.L, 4) + ' (' + ev.withTerm + ' anchors with a term)');
        cropRead.set('median', 'used by the hinge only');
      } else {
        const an = ev.pull;
        cropRead.name('share', 'Push active (o > m)');
        cropRead.set('share', an.pairs ? an.active + ' of ' + an.pairs + ' pairs (' + core.fmt(100 * an.active / an.pairs, 1) + ' %)' +
          (state.objective === 'hinge' ? ': the hinge pushes these' : (state.objective === 'direct' ? '; the direct push acts on all ' + an.pairs : '; no push is on')) : 'no pairs');
        cropRead.set('losses', 'L_patch ' + core.fmt(an.Lpatch, 4) + ', L_push ' + core.fmt(an.Lpush, 4) + ', L_patch + ' + BETA_CH + ' L_push ' + core.fmt(an.objective, 4));
        cropRead.set('median', core.fmt(marginNow, 4) + ' now; ' + core.fmt(state.m0, 4) + ' at step 0 (' + PAIRS + ' random pairs)');
      }
      cropRead.set('step', String(state.toy.step));
      const isl = islandsNow, st = state.start;
      cropRead.set('islands', [islandsTerm, ' ' + core.fmt(isl.objects, 3) + ' (step 0: ' + core.fmt(st.objects, 3) + '; ' + kindsText(kindsNow) + '); within the grass ' +
        core.fmt(isl.grass, 3) + ' (' + core.fmt(st.grass, 3) + '); between kinds ' + core.fmt(isl.between, 3) + ' (' + core.fmt(st.between, 3) + ')']);
      stepOut.textContent = 'step ' + state.toy.step;
      setContent(anchorOut, 'patch ' + a + ', ' + partWord(state.toy.objects, state.toy.parts, a));
    }

    // syncControls(): the outputs of the controls from the state, and which of the objective's controls show.
    function syncControls() {
      const n = state.side * state.side;
      sceneCtl.show(state.side + ' ' + TIMES + ' ' + state.side + ': ' + n + ' patches');
      const words = {
        window: 'window: the top ' + state.k + ' of 8 neighbours, no push',
        row: 'row: the top ' + state.k + ' pull; the crop' + RSQUO + 's bottom ' + state.neg + ' % push',
        image: 'image: two shared thresholds',
        both: 'both (the run' + RSQUO + 's rule)'
      };
      ruleCtl.show(words[state.rule]);
      kCtl.show(core.fmt(state.k, 0));
      const th = runThresholds(ev ? ev.S : cosines(state.toy.teacher), state.k, state.neg / 100);
      hiOut.textContent = 'q_hi = 1 ' + MINUS + ' ' + state.k + '/' + (n - 1) + ' = ' + core.fmt(th.qHi, 4) + ', ' + TAU + '_hi = ' + core.fmt(th.hi.value, 4);
      negCtl.show(core.fmt(state.neg, 0) + ' %');
      loOut.textContent = 'q_lo = ' + core.fmt(state.neg / 100, 2) + ', ' + TAU + '_lo = ' + core.fmt(th.lo.value, 4);
      objectiveCtl.show({ contrastive: 'contrastive (the run' + RSQUO + 's)', pull: 'SelfPatch' + RSQUO + 's pull alone', hinge: 'pull + hinge (dropped)', direct: 'pull + direct push (dropped)' }[state.objective]);
      tauCtl.show(core.fmt(state.tau, 2));
      marginCtl.show(core.fmt(state.margin, 4) + (Math.abs(state.margin - state.m0) < 1e-12 ? ' (median)' : ''));
      betaCtl.show(core.fmt(state.beta, 2));
      lrCtl.show(core.fmt(state.lr, 2));
      tauCtl.root.hidden = !isCon();
      marginCtl.root.hidden = !(state.objective === 'hinge' || state.objective === 'direct');
      betaCtl.root.hidden = !(state.objective === 'hinge' || state.objective === 'direct');
    }

    // draw(): every drawing and readout of the lab from the current state.
    function draw() {
      const T = core.theme();
      syncControls();
      drawGrid(T);
      drawRow();
      drawMatrix(T);
      if (isCon()) drawShares();
      else drawPrototypes();
      drawReadouts();
    }

    // setScene(side): a new scene at step 0 with its own k, its own default anchor and its random-pair median as the margin.
    function setScene(side) {
      state.side = side;
      state.k = K_START[side];
      kCtl.set(state.k);
      sceneCtl.set(String(side));
      state.anchor = SCENES[side].anchor;
      state.partner = null;
      resetToy();
      state.margin = state.m0;
      marginCtl.set(state.margin);
    }

    // train(steps): run that many toy steps with the current settings, then recompute and draw once.
    function train(steps) {
      for (let t = 0; t < steps; t++) state.toy = trainStepRun(state.toy, opts(), state.lr);
      recompute();
      draw();
    }

    // ---------------------------------------------------------------- events

    sceneCtl.onChange(core.guard(body, function () { setScene(Number(sceneCtl.get())); recompute(); draw(); }));
    runBtn.addEventListener('click', core.guard(body, function () {
      state.rule = RUN.rule;
      ruleCtl.set(RUN.rule);
      state.objective = RUN.objective;
      objectiveCtl.set(RUN.objective);
      state.neg = RUN.neg;
      negCtl.set(RUN.neg);
      state.tau = RUN.tau;
      tauCtl.set(RUN.tau);
      setScene(RUN.side);
      state.k = RUN.k;
      kCtl.set(RUN.k);
      recompute();
      draw();
    }));
    ruleCtl.onChange(core.guard(body, function () { state.rule = ruleCtl.get(); recompute(); draw(); }));
    kCtl.input.addEventListener('input', core.guard(body, function () { state.k = kCtl.get(); recompute(); draw(); }));
    negCtl.input.addEventListener('input', core.guard(body, function () { state.neg = negCtl.get(); recompute(); draw(); }));
    objectiveCtl.onChange(core.guard(body, function () { state.objective = objectiveCtl.get(); state.partner = null; recompute(); draw(); }));
    tauCtl.input.addEventListener('input', core.guard(body, function () { state.tau = tauCtl.get(); recompute(); draw(); }));
    marginCtl.input.addEventListener('input', core.guard(body, function () { state.margin = marginCtl.get(); recompute(); draw(); }));
    betaCtl.input.addEventListener('input', core.guard(body, function () { state.beta = betaCtl.get(); recompute(); draw(); }));
    lrCtl.input.addEventListener('input', core.guard(body, function () { state.lr = lrCtl.get(); syncControls(); }));
    trainBtns.forEach(function (btn, t) {
      btn.addEventListener('click', core.guard(body, function () { train(TRAIN[t]); }));
    });
    resetBtn.addEventListener('click', core.guard(body, function () {
      resetToy();
      state.partner = null;
      recompute();
      draw();
    }));
    grid.addEventListener('click', core.guard(body, function (ev0) {
      const p = core.canvasPoint(grid, ev0, GRID, GRID);
      const cell = GRID / state.side;
      const r = Math.min(state.side - 1, Math.max(0, Math.floor(p.y / cell)));
      const c = Math.min(state.side - 1, Math.max(0, Math.floor(p.x / cell)));
      const j = r * state.side + c;
      const partners = isCon() ? ev.sets.P[state.anchor] : ev.sets.N[state.anchor];
      if (j !== state.anchor && partners.indexOf(j) >= 0 && j !== state.partner) {
        state.partner = j;
      } else if (j !== state.anchor) {
        state.anchor = j;
        state.partner = null;
        recompute();
      }
      draw();
    }));
    grid.addEventListener('keydown', core.guard(body, function (e) {
      if (e.key === 'n' || e.key === 'N') {
        const partners = isCon() ? ev.sets.P[state.anchor] : ev.sets.N[state.anchor];
        if (!partners.length) return;
        e.preventDefault();
        state.partner = partners[(partners.indexOf(state.partner) + 1) % partners.length];
        draw();
        return;
      }
      const next = moveOnGrid(state.anchor, state.side, e.key);
      if (next < 0) return;
      e.preventDefault();
      state.anchor = next;
      state.partner = null;
      recompute();
      draw();
    }));
    core.on('theme-changed', core.guard(body, draw));

    // ---------------------------------------------------------------- the resting state

    setScene(START.side);
    recompute();
    draw();
  });
})(typeof window !== 'undefined' ? window : this);
/* ==========================================================================================================
 * The new labs of Part 5: 5A (real sets), 5B (the InfoNCE term), 5C (pull and push), 5E (telemetry), 5F (the
 * projection head) and 5G (the readings), and window.LabP5, their pure helpers (tests/smoke_p5.js checks them against
 * the bundle and the fact sheet).
 * ========================================================================================================== */
(function (root) {
  'use strict';

  const Labs = root.Labs;
  if (!Labs || typeof Labs.register !== 'function') return;

  // ------------------------------------------------------------------ characters and constants

  const MINUS = '\u2212';
  const TIMES = '\u00D7';
  const TAU = '\u03C4';
  const LAMBDA = '\u03BB';
  const SIGMA = '\u03A3';
  const RSQUO = '\u2019';
  const ELLIPSIS = '\u2026';
  const LE = '\u2264';
  const GE = '\u2265';
  const APPROX = '\u2248';
  const MONO = '"JetBrains Mono", ui-monospace, "Cascadia Mono", Consolas, monospace';
  const HALO = 'paint-order: stroke; stroke: var(--surface); stroke-width: 3px; stroke-linejoin: round';
  const FOLLOWED_IMAGE = '000000114269';
  const FOLLOWED_ANCHOR = 34;
  const GRID = 14;
  const N_GLOBAL = 196;
  const DIM = 384;
  // The run's values of the rule (protocol 2026-10-08 section 3.2; src/labs_defaults.json "core.rule_defaults").
  const RUN = { k: 8, kLocal: 4, negPct: 20, capPos: 24, capNeg: 48, tau: 0.2, lambda: 1 };
  // The models of the bundle whose tokens the labs read (images.json "token_models"), as the reader sees their names.
  const MODELS = [['con2', 'run 2'], ['dino', 'DINO start'], ['selfpatch', 'released SelfPatch'], ['con1', 'run 1'], ['con3', 'run 3']];

  // ------------------------------------------------------------------ small helpers

  // logError(where, err): the console line of a problem; never throws.
  function logError(where, err) {
    try {
      if (root.console && typeof root.console.error === 'function') root.console.error('[labs_p5] ' + where, err);
    } catch (e) { /* nothing more can be done */ }
  }

  // appendAll(node, content): strings and numbers as text, nodes as they are, arrays recursively.
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

  // clamp(x, lo, hi): x inside [lo, hi].
  function clamp(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }

  // sig(core, x, digits): x with `digits` significant digits, a true minus and thousands commas; very small numbers in
  // powers of ten.
  function sig(core, x, digits) {
    const v = Number(x);
    if (v !== v) return 'n/a';
    if (v === 0) return '0';
    const d = digits || 4;
    const a = Math.abs(v);
    if (a < 1e-3) return core.fmtSci(v, d - 1);
    const decimals = Math.max(0, d - 1 - Math.floor(Math.log10(a)));
    return core.fmt(v, Math.min(decimals, 10));
  }

  // plural(n, one, many): n and the singular or plural word.
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  // term(core, key, text): a glossary term; its entry is in src/glossary_p5.html.
  function term(core, key, text) {
    return core.el('dfn', { 'data-term': key }, [text === undefined ? key : text]);
  }

  // slider(core, o): a labelled range with its value in an output; o = {id, label, min, max, step, value, format, hint,
  // role}. Returns {root, input, get, set, show}.
  function slider(core, o) {
    const input = core.el('input', { type: 'range', id: o.id, min: o.min, max: o.max, step: o.step, value: o.value });
    const output = core.el('output', { id: o.id + '-out', for: o.id, 'aria-live': 'off' });
    const kids = [core.el('label', { for: o.id }, [o.label]), output, input];
    if (o.hint) {
      kids.push(core.el('p', { class: 'control-hint', id: o.id + '-hint' }, o.hint));
      input.setAttribute('aria-describedby', o.id + '-hint');
    }
    const show = function (text) { output.textContent = text; input.setAttribute('aria-valuetext', text); };
    show(o.format(o.value));
    return {
      root: core.el('div', { class: o.role ? ['control', 'role-' + o.role] : 'control' }, kids),
      input: input,
      get: function () { return Number(input.value); },
      set: function (v) { input.value = String(v); },
      show: show,
      range: function (min, max) { input.setAttribute('min', String(min)); input.setAttribute('max', String(max)); }
    };
  }

  // segmented(core, o): one choice of several as small buttons; o = {id, label, options: [[value, text]], value, hint}.
  // Returns {root, get, set, onChange, show}.
  function segmented(core, o) {
    const labelId = o.id + '-label';
    const output = core.el('output', { id: o.id + '-out', 'aria-live': 'off' });
    const radios = o.options.map(function (opt) {
      return core.el('input', { type: 'radio', name: o.id, id: o.id + '-' + opt[0], value: String(opt[0]), checked: String(opt[0]) === String(o.value) });
    });
    const group = core.el('div', { class: 'segmented', role: 'radiogroup', id: o.id, 'aria-labelledby': labelId },
      o.options.map(function (opt, i) { return core.el('label', { for: radios[i].id }, [radios[i], core.el('span', null, [opt[1]])]); }));
    const kids = [core.el('span', { class: 'control-label', id: labelId }, [o.label]), output, group];
    if (o.hint) {
      kids.push(core.el('p', { class: 'control-hint', id: o.id + '-hint' }, o.hint));
      group.setAttribute('aria-describedby', o.id + '-hint');
    }
    return {
      root: core.el('div', { class: 'control' }, kids),
      get: function () {
        for (let i = 0; i < radios.length; i++) if (radios[i].checked) return radios[i].value;
        return String(o.value);
      },
      set: function (v) { radios.forEach(function (r) { r.checked = r.value === String(v); }); },
      onChange: function (fn) { radios.forEach(function (r) { r.addEventListener('change', fn); }); },
      show: function (text) { output.textContent = text; }
    };
  }

  // toggle(core, o): a checkbox with its words; o = {id, label, checked, role}. Returns {root, input, get}.
  function toggle(core, o) {
    const input = core.el('input', { type: 'checkbox', id: o.id, checked: !!o.checked });
    return {
      root: core.el('label', { class: o.role ? ['toggle', 'role-' + o.role] : 'toggle', for: o.id }, [input, ' ', o.label]),
      input: input,
      get: function () { return !!input.checked; }
    };
  }

  // readout(core, id, rows): a dl.readout with a dt and dd per [key, name]; returns {root, set, name}.
  function readout(core, id, rows) {
    const cells = {}, names = {}, kids = [];
    rows.forEach(function (r) {
      names[r[0]] = core.el('dt', null, [r[1]]);
      cells[r[0]] = core.el('dd', { id: id + '-' + r[0] });
      kids.push(names[r[0]], cells[r[0]]);
    });
    return {
      root: core.el('dl', { class: 'readout', id: id }, kids),
      set: function (key, content) { setContent(cells[key], content); },
      name: function (key, text) { setContent(names[key], text); }
    };
  }

  // stageCell(core, label, content, width): one figure of a stage row with its mono label.
  function stageCell(core, label, content, width) {
    return core.el('div', { class: 'stage-cell', style: width ? { maxWidth: width + 'px' } : null }, [core.el('p', { class: 'stage-label' }, label), content]);
  }

  // makeCanvas(core, o): a canvas of o.w x o.h CSS pixels that shrinks with its container; o.interactive makes it focusable.
  function makeCanvas(core, o) {
    const c = core.el('canvas', { id: o.id, width: o.w, height: o.h, role: o.interactive ? null : 'img', 'aria-label': o.label || '', tabindex: o.interactive ? '0' : null });
    c.style.width = o.w + 'px';
    c.style.maxWidth = '100%';
    c.style.height = 'auto';
    if (o.interactive) c.style.cursor = 'pointer';
    return c;
  }

  // svgChart(core, id, w, h, label): an svg.chart with viewBox 0 0 w h.
  function svgChart(core, id, w, h, label) {
    return core.el('svg', { class: 'chart', id: id, viewBox: '0 0 ' + w + ' ' + h, width: w, height: h, role: 'img', 'aria-label': label });
  }

  function tx(core, x, y, text, attrs) { return core.el('text', Object.assign({ x: x.toFixed(1), y: y.toFixed(1) }, attrs || {}), [String(text)]); }
  function line(core, x1, y1, x2, y2, attrs) { return core.el('line', Object.assign({ x1: x1.toFixed(1), y1: y1.toFixed(1), x2: x2.toFixed(1), y2: y2.toFixed(1) }, attrs || {})); }
  function rect(core, x, y, w, h, attrs) { return core.el('rect', Object.assign({ x: x.toFixed(1), y: y.toFixed(1), width: Math.max(0, w).toFixed(1), height: Math.max(0, h).toFixed(1) }, attrs || {})); }
  function circle(core, x, y, r, attrs) { return core.el('circle', Object.assign({ cx: x.toFixed(1), cy: y.toFixed(1), r: r.toFixed(1) }, attrs || {})); }
  function path(core, d, attrs) { return core.el('path', Object.assign({ d: d }, attrs || {})); }
  function withTitle(core, node, text) { node.appendChild(core.el('svg:title', null, [text])); return node; }

  // haloText(ctx, T, text, x, y): ink text with a paper halo, readable on any fill.
  function haloText(ctx, T, text, x, y) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = T.paper;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = T.ink;
    ctx.fillText(text, x, y);
  }

  // hatch(ctx, x, y, w, h, colour, gap): diagonal lines inside a rectangle.
  function hatch(ctx, x, y, w, h, colour, gap) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.strokeStyle = colour;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let d = -h; d < w; d += gap || 5) {
      ctx.moveTo(x + d, y + h);
      ctx.lineTo(x + d + h, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  // cellName(i, side): 'row r, column c' of a grid index.
  function cellName(i, side) { return 'row ' + Math.floor(i / side) + ', column ' + (i % side); }

  // moveOnGrid(i, side, key): the index after an arrow key, or -1.
  function moveOnGrid(i, side, key) {
    let r = Math.floor(i / side), c = i % side;
    if (key === 'ArrowLeft') c = Math.max(0, c - 1);
    else if (key === 'ArrowRight') c = Math.min(side - 1, c + 1);
    else if (key === 'ArrowUp') r = Math.max(0, r - 1);
    else if (key === 'ArrowDown') r = Math.min(side - 1, r + 1);
    else return -1;
    return r * side + c;
  }

  // bundleImageId(): the photograph the real-number labs use (boot.js), the followed image by default.
  function bundleImageId() {
    try {
      const id = root.Boot && typeof root.Boot.bundleImage === 'function' ? root.Boot.bundleImage() : null;
      return /^\d{12}$/.test(String(id)) ? String(id) : FOLLOWED_IMAGE;
    } catch (e) {
      return FOLLOWED_IMAGE;
    }
  }

  // picker(core, id): the photograph picker of boot.js for a lab's strip, or null where boot.js is absent.
  function picker(core, id) {
    try {
      if (typeof core.bundleImagePicker === 'function') return core.bundleImagePicker({ id: id, label: 'Photograph' });
    } catch (e) {
      logError('the photograph picker', e);
    }
    return null;
  }

  // Photographs drawn by the browser (Core.image.load), cached by id and side: a canvas, or an error message.
  const photos = Object.create(null);

  // photo(core, id, side, done): the photograph's square view as a canvas (null while it loads or when it cannot be
  // drawn); done() is called once it is there or has failed.
  function photo(core, id, side, done) {
    const key = id + '@' + side;
    const have = photos[key];
    if (have && have.canvas) return have.canvas;
    if (have) {
      if (have.waiting && done && have.waiting.indexOf(done) < 0) have.waiting.push(done);
      return null;
    }
    const entry = { canvas: null, error: null, waiting: done ? [done] : [] };
    photos[key] = entry;
    let promise;
    try { promise = core.image.load(core.image.url(id), side); } catch (err) { promise = Promise.reject(err); }
    Promise.resolve(promise).then(function (img) {
      entry.canvas = core.toCanvas(img);
    }, function (err) {
      entry.error = err && err.message ? err.message : String(err);
    }).then(function () {
      const list = entry.waiting;
      entry.waiting = null;
      list.forEach(function (fn) { try { fn(); } catch (e) { logError('after a photograph', e); } });
    });
    return null;
  }

  // photoError(id, side): why the photograph could not be drawn, or null.
  function photoError(id, side) {
    const e = photos[id + '@' + side];
    return e && e.error ? e.error : null;
  }

  // ------------------------------------------------------------------ pure helpers (window.LabP5)

  // unit(v): v divided by its length (a zero vector stays zero), as a Float64Array.
  function unit(v) {
    let s = 0;
    for (let i = 0; i < v.length; i++) s += v[i] * v[i];
    const r = Math.sqrt(s);
    const out = new Float64Array(v.length);
    for (let i = 0; i < v.length; i++) out[i] = r > 0 ? v[i] / r : 0;
    return out;
  }

  function dot(a, b) {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;
  }

  function norm(a) { return Math.sqrt(dot(a, a)); }

  // rowOf(array, i, d): row i of a flat n x d array as a Float64Array copy.
  function rowOf(array, i, d) {
    const out = new Float64Array(d);
    for (let c = 0; c < d; c++) out[c] = array[i * d + c];
    return out;
  }

  // histogram(sim, n, bins, width): the counts of the n(n - 1) off-diagonal entries of a flat n x n similarity between lo
  // and hi, the smallest and largest entries rounded out to a multiple of `width` (0.05 by default), in bins of that
  // width, or in `bins` equal bins when bins is given.
  function histogram(sim, n, bins, width) {
    const step = width || 0.05;
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const v = sim[i * n + j];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    lo = Math.floor(lo / step + 1e-9) * step;
    hi = Math.ceil(hi / step - 1e-9) * step;
    if (!(hi > lo)) hi = lo + step;
    const count = bins || Math.max(1, Math.round((hi - lo) / step));
    const binWidth = (hi - lo) / count;
    const counts = new Array(count).fill(0);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const b = Math.min(count - 1, Math.max(0, Math.floor((sim[i * n + j] - lo) / binWidth)));
      counts[b] += 1;
    }
    return { lo: lo, hi: hi, width: binWidth, counts: counts };
  }

  // pca2(tokens, n, d): a fixed 2-D projection of the n token rows: each row scaled to length 1, the mean taken away,
  // then the two leading principal directions by power iteration (Gram trick: X^T X v), the second kept orthogonal to
  // the first. Returns {mean, axes: [a1, a2] (unit, orthogonal, d each), points: [[x, y]] (n), explained: [s1, s2]}.
  function pca2(tokens, n, d) {
    const X = new Float64Array(n * d);
    const mean = new Float64Array(d);
    for (let i = 0; i < n; i++) {
      const u = unit(rowOf(tokens, i, d));
      for (let c = 0; c < d; c++) { X[i * d + c] = u[c]; mean[c] += u[c] / n; }
    }
    let total = 0;
    for (let i = 0; i < n; i++) for (let c = 0; c < d; c++) { X[i * d + c] -= mean[c]; total += X[i * d + c] * X[i * d + c]; }
    // apply(v): X^T (X v), the covariance times v (up to the factor n).
    const apply = function (v) {
      const xv = new Float64Array(n);
      for (let i = 0; i < n; i++) { let s = 0; for (let c = 0; c < d; c++) s += X[i * d + c] * v[c]; xv[i] = s; }
      const out = new Float64Array(d);
      for (let i = 0; i < n; i++) for (let c = 0; c < d; c++) out[c] += X[i * d + c] * xv[i];
      return out;
    };
    const axes = [], values = [];
    for (let a = 0; a < 2; a++) {
      let v = new Float64Array(d);
      for (let c = 0; c < d; c++) v[c] = Math.cos(1.7 * c + 0.3 + a) + 0.01 * (c % 7);
      for (let it = 0; it < 300; it++) {
        let w = apply(v);
        axes.forEach(function (b) { const s = dot(w, b); for (let c = 0; c < d; c++) w[c] -= s * b[c]; });
        w = unit(w);
        v = w;
      }
      axes.forEach(function (b) { const s = dot(v, b); for (let c = 0; c < d; c++) v[c] -= s * b[c]; });
      v = unit(v);
      axes.push(v);
      values.push(dot(v, apply(v)));
    }
    const points = [];
    for (let i = 0; i < n; i++) {
      const r = new Float64Array(d);
      for (let c = 0; c < d; c++) r[c] = X[i * d + c];
      points.push([dot(r, axes[0]), dot(r, axes[1])]);
    }
    return { mean: mean, axes: axes, points: points, explained: [values[0] / total, values[1] / total] };
  }

  // project(p, v): the 2-D coordinates of a d-vector v (scaled to length 1, the mean taken away) under the projection p.
  function project(p, v) {
    const u = unit(v);
    const r = new Float64Array(u.length);
    for (let c = 0; c < u.length; c++) r[c] = u[c] - p.mean[c];
    return [dot(r, p.axes[0]), dot(r, p.axes[1])];
  }

  // projectDirection(p, g): the 2-D coordinates of a direction g (no mean taken away).
  function projectDirection(p, g) {
    return [dot(g, p.axes[0]), dot(g, p.axes[1])];
  }

  // anchorInfonce(followed, anchor, tau, studentRow): the InfoNCE term of one anchor of the followed crop with the
  // bundle's sets (followed.pos, followed.neg, chosen on run 2's teacher tokens) and its gradient on the student token:
  // the student's row (studentRow, or run 2's student token of the anchor) against run 2's teacher tokens.
  function anchorInfonce(followed, anchor, tau, studentRow) {
    const C = root.Core;
    const teacher = followed.teacher_tokens224.array;
    const z = studentRow || rowOf(followed.student_tokens224.array, anchor, DIM);
    const zu = unit(z);
    const row = new Float64Array(N_GLOBAL);
    for (let j = 0; j < N_GLOBAL; j++) {
      const t = unit(rowOf(teacher, j, DIM));
      row[j] = dot(zu, t);
    }
    const pos = followed.pos[anchor], neg = followed.neg[anchor];
    const r = C.rule.infonce(row, pos, neg, tau);
    const g = C.rule.gradient(z, teacher, pos, neg, tau);
    return { loss: r.loss, perPositive: r.perPositive, shares: r.shares, row: row, gradient: g, pos: pos, neg: neg };
  }

  // series(telemetry, run, field): the sampled steps of a run and the field's values at them.
  function series(telemetry, run, field) {
    const r = telemetry.runs[run];
    return { steps: r.step, values: r[field] || [] };
  }

  // erf(x): the error function to double precision (a Taylor series below 3, a continued fraction above).
  function erf(x) {
    const ax = Math.abs(x);
    if (ax < 3) {
      let term = ax, sum = ax;
      const x2 = ax * ax;
      for (let k = 1; k < 120; k++) {
        term *= -x2 / k;
        const add = term / (2 * k + 1);
        sum += add;
        if (Math.abs(add) < 1e-17 * Math.abs(sum)) break;
      }
      const v = 2 / Math.sqrt(Math.PI) * sum;
      return x < 0 ? -v : v;
    }
    // erfc by Lentz's continued fraction for x >= 3.
    let f = ax, C = ax, D = 0;
    for (let k = 1; k < 200; k++) {
      const a = k / 2;
      D = ax + a * D;
      D = D === 0 ? 1e-300 : 1 / D;
      C = ax + a / C;
      if (C === 0) C = 1e-300;
      const delta = C * D;
      f *= delta;
      if (Math.abs(delta - 1) < 1e-16) break;
    }
    const erfc = Math.exp(-ax * ax) / Math.sqrt(Math.PI) / f;
    return x < 0 ? -(1 - erfc) : 1 - erfc;
  }

  // gelu(x) and its derivative: the exact GELU of the run's head, x Phi(x).
  function gelu(x) { return 0.5 * x * (1 + erf(x / Math.SQRT2)); }
  function geluSlope(x) { return 0.5 * (1 + erf(x / Math.SQRT2)) + x * Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI); }

  // toyHead(nIn, nHidden, nOut, seed): a head Linear(nIn, nHidden), GELU, Linear(nHidden, nOut), drawn as torch's
  // default Linear initialisation draws it (weights and biases uniform within 1/sqrt(fan_in)), from Core.rng(seed).
  function toyHead(nIn, nHidden, nOut, seed) {
    const r = root.Core.rng(seed);
    const b1 = 1 / Math.sqrt(nIn), b2 = 1 / Math.sqrt(nHidden);
    const W1 = new Float64Array(nHidden * nIn), c1 = new Float64Array(nHidden);
    const W2 = new Float64Array(nOut * nHidden), c2 = new Float64Array(nOut);
    for (let i = 0; i < W1.length; i++) W1[i] = r.uniform(-b1, b1);
    for (let i = 0; i < c1.length; i++) c1[i] = r.uniform(-b1, b1);
    for (let i = 0; i < W2.length; i++) W2[i] = r.uniform(-b2, b2);
    for (let i = 0; i < c2.length; i++) c2[i] = r.uniform(-b2, b2);
    return { nIn: nIn, nHidden: nHidden, nOut: nOut, seed: seed, W1: W1, b1: c1, W2: W2, b2: c2 };
  }

  // headForward(head, z): {pre (nHidden), act (nHidden), out (nOut)} of the head on one token.
  function headForward(head, z) {
    const pre = new Float64Array(head.nHidden), act = new Float64Array(head.nHidden), out = new Float64Array(head.nOut);
    for (let h = 0; h < head.nHidden; h++) {
      let s = head.b1[h];
      for (let i = 0; i < head.nIn; i++) s += head.W1[h * head.nIn + i] * z[i];
      pre[h] = s;
      act[h] = gelu(s);
    }
    for (let o = 0; o < head.nOut; o++) {
      let s = head.b2[o];
      for (let h = 0; h < head.nHidden; h++) s += head.W2[o * head.nHidden + h] * act[h];
      out[o] = s;
    }
    return { pre: pre, act: act, out: out };
  }

  // headBackward(head, fwd, gOut): the gradient on the head's input z for the gradient gOut on its output (the chain
  // rule through the second layer, the GELU's slope and the first layer).
  function headBackward(head, fwd, gOut) {
    const gAct = new Float64Array(head.nHidden);
    for (let o = 0; o < head.nOut; o++) for (let h = 0; h < head.nHidden; h++) gAct[h] += head.W2[o * head.nHidden + h] * gOut[o];
    const gIn = new Float64Array(head.nIn);
    for (let h = 0; h < head.nHidden; h++) {
      const g = gAct[h] * geluSlope(fwd.pre[h]);
      if (g === 0) continue;
      for (let i = 0; i < head.nIn; i++) gIn[i] += head.W1[h * head.nIn + i] * g;
    }
    return gIn;
  }

  // cosineGradient(a, b): the gradient of cos(a, b) with respect to a: (b_hat - cos a_hat) / |a|.
  function cosineGradient(a, b) {
    const na = norm(a), nb = norm(b);
    const c = dot(a, b) / (na * nb);
    const out = new Float64Array(a.length);
    for (let i = 0; i < a.length; i++) out[i] = (b[i] / nb - c * a[i] / na) / na;
    return out;
  }

  // headGradient(head, z, target): the gradient of minus the cosine between the head's output on z and a fixed target,
  // with respect to z (the smoke check compares it with finite differences).
  function headGradient(head, z, target) {
    const fwd = headForward(head, z);
    const g = cosineGradient(fwd.out, target);
    for (let i = 0; i < g.length; i++) g[i] = -g[i];
    return headBackward(head, fwd, g);
  }

  // infonceOnVectors(anchor, others, pos, neg, tau): the anchor's mean InfoNCE over its positives with the cosines of
  // the vector `anchor` to the vectors others[j], and the gradient of that mean on `anchor` (through the cosines).
  function infonceOnVectors(anchorVec, others, pos, neg, tau) {
    const s = {};
    pos.concat(neg).forEach(function (j) { if (s[j] === undefined) s[j] = dot(anchorVec, others[j]) / (norm(anchorVec) * norm(others[j])); });
    const g = new Float64Array(anchorVec.length);
    let loss = 0;
    if (!pos.length || !neg.length) return { loss: 0, grad: g, cos: s };
    pos.forEach(function (p) {
      let mx = s[p] / tau;
      neg.forEach(function (n) { mx = Math.max(mx, s[n] / tau); });
      let den = Math.exp(s[p] / tau - mx);
      const e = neg.map(function (n) { const v = Math.exp(s[n] / tau - mx); den += v; return v; });
      const ap = Math.exp(s[p] / tau - mx) / den;
      loss += -Math.log(ap) / pos.length;
      const gp = cosineGradient(anchorVec, others[p]);
      for (let c = 0; c < g.length; c++) g[c] -= (1 - ap) * gp[c] / (tau * pos.length);
      neg.forEach(function (n, t) {
        const an = e[t] / den;
        const gn = cosineGradient(anchorVec, others[n]);
        for (let c = 0; c < g.length; c++) g[c] += an * gn[c] / (tau * pos.length);
      });
    });
    return { loss: loss, grad: g, cos: s };
  }

  // READINGS: the decoder readings and the probe readings of the reading notes, copied from facts/course_facts.json
  // (tests/smoke_p5.js compares every value and contrast with the sheet). Values in per cent except regions (per image)
  // and degenerate (images); contrasts are b minus a, in percentage points, with the 95 % image-bootstrap interval.
  const READINGS = {"values": [{"ckpt": "released", "metric": "hungarian", "value": 15.58, "fact": "p5_dec_released_hungarian"}, {"ckpt": "released", "metric": "mbo", "value": 17.68, "fact": "p5_dec_released_mbo"}, {"ckpt": "released", "metric": "union", "value": 30.66, "fact": "p5_dec_released_union"}, {"ckpt": "released", "metric": "recall", "value": 81.99, "fact": "p5_dec_released_recall"}, {"ckpt": "released", "metric": "fgari", "value": 22.98, "fact": "p5_dec_released_fgari"}, {"ckpt": "released", "metric": "bgfpr", "value": 60.37, "fact": "p5_dec_released_bgfpr"}, {"ckpt": "released", "metric": "ap100", "value": 0.41, "fact": "p5_dec_released_ap100"}, {"ckpt": "released", "metric": "regions", "value": 2.11, "fact": "p5_dec_released_regions"}, {"ckpt": "released", "metric": "degenerate", "value": 2, "fact": "p5_dec_released_degenerate"}, {"ckpt": "released", "metric": "miou", "value": 23.8, "fact": "p5_probe_released_miou"}, {"ckpt": "released", "metric": "aacc", "value": 74.79, "fact": "p5_probe_released_aacc"}, {"ckpt": "released", "metric": "macc", "value": 39.07, "fact": "p5_probe_released_macc"}, {"ckpt": "released", "metric": "fgbg", "value": 68.58, "fact": "p5_probe_released_fgbg"}, {"ckpt": "row_twin", "metric": "hungarian", "value": 15.71, "fact": "p5_dec_row_twin_hungarian"}, {"ckpt": "row_twin", "metric": "mbo", "value": 17.86, "fact": "p5_dec_row_twin_mbo"}, {"ckpt": "row_twin", "metric": "union", "value": 30.94, "fact": "p5_dec_row_twin_union"}, {"ckpt": "row_twin", "metric": "recall", "value": 82.53, "fact": "p5_dec_row_twin_recall"}, {"ckpt": "row_twin", "metric": "fgari", "value": 23.18, "fact": "p5_dec_row_twin_fgari"}, {"ckpt": "row_twin", "metric": "bgfpr", "value": 60.26, "fact": "p5_dec_row_twin_bgfpr"}, {"ckpt": "row_twin", "metric": "ap100", "value": 0.44, "fact": "p5_dec_row_twin_ap100"}, {"ckpt": "row_twin", "metric": "regions", "value": 2.09, "fact": "p5_dec_row_twin_regions"}, {"ckpt": "row_twin", "metric": "degenerate", "value": 4, "fact": "p5_dec_row_twin_degenerate"}, {"ckpt": "row_twin", "metric": "miou", "value": 24.68, "fact": "p5_probe_row_twin_miou"}, {"ckpt": "row_twin", "metric": "aacc", "value": 75.24, "fact": "p5_probe_row_twin_aacc"}, {"ckpt": "row_twin", "metric": "macc", "value": 40.37, "fact": "p5_probe_row_twin_macc"}, {"ckpt": "row_twin", "metric": "fgbg", "value": 68.91, "fact": "p5_probe_row_twin_fgbg"}, {"ckpt": "image_twin", "metric": "hungarian", "value": 15.68, "fact": "p5_dec_image_twin_hungarian"}, {"ckpt": "image_twin", "metric": "mbo", "value": 17.81, "fact": "p5_dec_image_twin_mbo"}, {"ckpt": "image_twin", "metric": "union", "value": 30.85, "fact": "p5_dec_image_twin_union"}, {"ckpt": "image_twin", "metric": "recall", "value": 82.52, "fact": "p5_dec_image_twin_recall"}, {"ckpt": "image_twin", "metric": "fgari", "value": 22.77, "fact": "p5_dec_image_twin_fgari"}, {"ckpt": "image_twin", "metric": "bgfpr", "value": 60.19, "fact": "p5_dec_image_twin_bgfpr"}, {"ckpt": "image_twin", "metric": "ap100", "value": 0.44, "fact": "p5_dec_image_twin_ap100"}, {"ckpt": "image_twin", "metric": "regions", "value": 2.09, "fact": "p5_dec_image_twin_regions"}, {"ckpt": "image_twin", "metric": "degenerate", "value": 4, "fact": "p5_dec_image_twin_degenerate"}, {"ckpt": "image_twin", "metric": "miou", "value": 24.59, "fact": "p5_probe_image_twin_miou"}, {"ckpt": "image_twin", "metric": "aacc", "value": 75.23, "fact": "p5_probe_image_twin_aacc"}, {"ckpt": "image_twin", "metric": "macc", "value": 40.2, "fact": "p5_probe_image_twin_macc"}, {"ckpt": "image_twin", "metric": "fgbg", "value": 68.91, "fact": "p5_probe_image_twin_fgbg"}, {"ckpt": "run1", "metric": "hungarian", "value": 15.62, "fact": "p5_dec_run1_hungarian"}, {"ckpt": "run1", "metric": "mbo", "value": 17.77, "fact": "p5_dec_run1_mbo"}, {"ckpt": "run1", "metric": "union", "value": 31.47, "fact": "p5_dec_run1_union"}, {"ckpt": "run1", "metric": "recall", "value": 81.42, "fact": "p5_dec_run1_recall"}, {"ckpt": "run1", "metric": "fgari", "value": 21.24, "fact": "p5_dec_run1_fgari"}, {"ckpt": "run1", "metric": "bgfpr", "value": 56.02, "fact": "p5_dec_run1_bgfpr"}, {"ckpt": "run1", "metric": "ap100", "value": 0.46, "fact": "p5_dec_run1_ap100"}, {"ckpt": "run1", "metric": "regions", "value": 1.91, "fact": "p5_dec_run1_regions"}, {"ckpt": "run1", "metric": "degenerate", "value": 4, "fact": "p5_dec_run1_degenerate"}, {"ckpt": "run1", "metric": "miou", "value": 25.15, "fact": "p5_probe_run1_miou"}, {"ckpt": "run1", "metric": "aacc", "value": 75.98, "fact": "p5_probe_run1_aacc"}, {"ckpt": "run1", "metric": "macc", "value": 40.69, "fact": "p5_probe_run1_macc"}, {"ckpt": "run1", "metric": "fgbg", "value": 69.2, "fact": "p5_probe_run1_fgbg"}, {"ckpt": "run3", "metric": "hungarian", "value": 15.95, "fact": "p5_dec_run3_hungarian"}, {"ckpt": "run3", "metric": "mbo", "value": 18.02, "fact": "p5_dec_run3_mbo"}, {"ckpt": "run3", "metric": "union", "value": 30.73, "fact": "p5_dec_run3_union"}, {"ckpt": "run3", "metric": "recall", "value": 81.85, "fact": "p5_dec_run3_recall"}, {"ckpt": "run3", "metric": "fgari", "value": 22.81, "fact": "p5_dec_run3_fgari"}, {"ckpt": "run3", "metric": "bgfpr", "value": 60.29, "fact": "p5_dec_run3_bgfpr"}, {"ckpt": "run3", "metric": "ap100", "value": 0.46, "fact": "p5_dec_run3_ap100"}, {"ckpt": "run3", "metric": "regions", "value": 2.13, "fact": "p5_dec_run3_regions"}, {"ckpt": "run3", "metric": "degenerate", "value": 7, "fact": "p5_dec_run3_degenerate"}, {"ckpt": "run3", "metric": "miou", "value": 25.31, "fact": "p5_probe_run3_miou"}, {"ckpt": "run3", "metric": "aacc", "value": 75.69, "fact": "p5_probe_run3_aacc"}, {"ckpt": "run3", "metric": "macc", "value": 41.01, "fact": "p5_probe_run3_macc"}, {"ckpt": "run3", "metric": "fgbg", "value": 69.24, "fact": "p5_probe_run3_fgbg"}, {"ckpt": "dino", "metric": "hungarian", "value": 17.23, "fact": "p5_dec_dino_hungarian"}, {"ckpt": "dino", "metric": "mbo", "value": 19.58, "fact": "p5_dec_dino_mbo"}, {"ckpt": "dino", "metric": "union", "value": 32.68, "fact": "p5_dec_dino_union"}, {"ckpt": "dino", "metric": "recall", "value": 84.03, "fact": "p5_dec_dino_recall"}, {"ckpt": "dino", "metric": "fgari", "value": 22.62, "fact": "p5_dec_dino_fgari"}, {"ckpt": "dino", "metric": "bgfpr", "value": 56.59, "fact": "p5_dec_dino_bgfpr"}, {"ckpt": "dino", "metric": "ap100", "value": 0.68, "fact": "p5_dec_dino_ap100"}, {"ckpt": "dino", "metric": "regions", "value": 2.38, "fact": "p5_dec_dino_regions"}, {"ckpt": "dino", "metric": "degenerate", "value": 0, "fact": "p5_dec_dino_degenerate"}, {"ckpt": "dino", "metric": "miou", "value": 14.41, "fact": "p5_probe_dino_miou"}, {"ckpt": "dino", "metric": "aacc", "value": 66.35, "fact": "p5_probe_dino_aacc"}, {"ckpt": "dino", "metric": "macc", "value": 25.88, "fact": "p5_probe_dino_macc"}, {"ckpt": "dino", "metric": "fgbg", "value": 62.09, "fact": "p5_probe_dino_fgbg"}, {"ckpt": "pilot", "metric": "hungarian", "value": 16.67, "fact": "p5_dec_pilot_hungarian"}, {"ckpt": "pilot", "metric": "mbo", "value": 19.0, "fact": "p5_dec_pilot_mbo"}, {"ckpt": "pilot", "metric": "union", "value": 32.63, "fact": "p5_dec_pilot_union"}, {"ckpt": "pilot", "metric": "recall", "value": 81.25, "fact": "p5_dec_pilot_recall"}, {"ckpt": "pilot", "metric": "fgari", "value": 22.22, "fact": "p5_dec_pilot_fgari"}, {"ckpt": "pilot", "metric": "bgfpr", "value": 54.52, "fact": "p5_dec_pilot_bgfpr"}, {"ckpt": "pilot", "metric": "ap100", "value": 0.75, "fact": "p5_dec_pilot_ap100"}, {"ckpt": "pilot", "metric": "regions", "value": 2.22, "fact": "p5_dec_pilot_regions"}, {"ckpt": "pilot", "metric": "degenerate", "value": 1, "fact": "p5_dec_pilot_degenerate"}, {"ckpt": "pilot", "metric": "miou", "value": 20.88, "fact": "p5_probe_pilot_miou"}, {"ckpt": "pilot", "metric": "aacc", "value": 73.5, "fact": "p5_probe_pilot_aacc"}, {"ckpt": "pilot", "metric": "macc", "value": 35.31, "fact": "p5_probe_pilot_macc"}, {"ckpt": "pilot", "metric": "fgbg", "value": 67.89, "fact": "p5_probe_pilot_fgbg"}, {"ckpt": "run2", "metric": "hungarian", "value": 17.41, "fact": "p5_dec_run2_hungarian"}, {"ckpt": "run2", "metric": "mbo", "value": 19.72, "fact": "p5_dec_run2_mbo"}, {"ckpt": "run2", "metric": "union", "value": 36.47, "fact": "p5_dec_run2_union"}, {"ckpt": "run2", "metric": "recall", "value": 81.46, "fact": "p5_dec_run2_recall"}, {"ckpt": "run2", "metric": "fgari", "value": 24.56, "fact": "p5_dec_run2_fgari"}, {"ckpt": "run2", "metric": "bgfpr", "value": 41.2, "fact": "p5_dec_run2_bgfpr"}, {"ckpt": "run2", "metric": "ap100", "value": 1.47, "fact": "p5_dec_run2_ap100"}, {"ckpt": "run2", "metric": "regions", "value": 1.77, "fact": "p5_dec_run2_regions"}, {"ckpt": "run2", "metric": "degenerate", "value": 2, "fact": "p5_dec_run2_degenerate"}, {"ckpt": "run2", "metric": "miou", "value": 21.11, "fact": "p5_probe_run2_miou"}, {"ckpt": "run2", "metric": "aacc", "value": 70.33, "fact": "p5_probe_run2_aacc"}, {"ckpt": "run2", "metric": "macc", "value": 36.64, "fact": "p5_probe_run2_macc"}, {"ckpt": "run2", "metric": "fgbg", "value": 63.96, "fact": "p5_probe_run2_fgbg"}], "contrasts": [{"a": "released", "b": "run1", "metric": "hungarian", "d": 0.04, "lo": -0.58, "hi": 0.63, "fact": "p5_con_released_run1_hungarian"}, {"a": "released", "b": "run1", "metric": "mbo", "d": 0.09, "lo": -0.52, "hi": 0.7, "fact": "p5_con_released_run1_mbo"}, {"a": "released", "b": "run1", "metric": "union", "d": 0.81, "lo": 0.0, "hi": 1.62, "fact": "p5_con_released_run1_union"}, {"a": "released", "b": "run1", "metric": "recall", "d": -0.57, "lo": -2.08, "hi": 1.01, "fact": "p5_con_released_run1_recall"}, {"a": "released", "b": "run1", "metric": "fgari", "d": -1.74, "lo": -2.88, "hi": -0.61, "fact": "p5_con_released_run1_fgari"}, {"a": "released", "b": "run1", "metric": "bgfpr", "d": -4.35, "lo": -5.55, "hi": -3.12, "fact": "p5_con_released_run1_bgfpr"}, {"a": "released", "b": "run1", "metric": "ap100", "d": 0.05, "lo": -0.04, "hi": 0.39, "fact": "p5_con_released_run1_ap100"}, {"a": "row_twin", "b": "run1", "metric": "hungarian", "d": -0.09, "lo": -0.68, "hi": 0.49, "fact": "p5_con_row_twin_run1_hungarian"}, {"a": "row_twin", "b": "run1", "metric": "mbo", "d": -0.09, "lo": -0.7, "hi": 0.49, "fact": "p5_con_row_twin_run1_mbo"}, {"a": "row_twin", "b": "run1", "metric": "union", "d": 0.53, "lo": -0.34, "hi": 1.31, "fact": "p5_con_row_twin_run1_union"}, {"a": "row_twin", "b": "run1", "metric": "recall", "d": -1.11, "lo": -2.61, "hi": 0.37, "fact": "p5_con_row_twin_run1_recall"}, {"a": "row_twin", "b": "run1", "metric": "fgari", "d": -1.94, "lo": -3.1, "hi": -0.83, "fact": "p5_con_row_twin_run1_fgari"}, {"a": "row_twin", "b": "run1", "metric": "bgfpr", "d": -4.24, "lo": -5.51, "hi": -2.99, "fact": "p5_con_row_twin_run1_bgfpr"}, {"a": "row_twin", "b": "run1", "metric": "ap100", "d": 0.02, "lo": -0.06, "hi": 0.37, "fact": "p5_con_row_twin_run1_ap100"}, {"a": "image_twin", "b": "run1", "metric": "hungarian", "d": -0.06, "lo": -0.62, "hi": 0.47, "fact": "p5_con_image_twin_run1_hungarian"}, {"a": "image_twin", "b": "run1", "metric": "mbo", "d": -0.05, "lo": -0.6, "hi": 0.49, "fact": "p5_con_image_twin_run1_mbo"}, {"a": "image_twin", "b": "run1", "metric": "union", "d": 0.62, "lo": -0.16, "hi": 1.42, "fact": "p5_con_image_twin_run1_union"}, {"a": "image_twin", "b": "run1", "metric": "recall", "d": -1.11, "lo": -2.59, "hi": 0.4, "fact": "p5_con_image_twin_run1_recall"}, {"a": "image_twin", "b": "run1", "metric": "fgari", "d": -1.54, "lo": -2.59, "hi": -0.45, "fact": "p5_con_image_twin_run1_fgari"}, {"a": "image_twin", "b": "run1", "metric": "bgfpr", "d": -4.16, "lo": -5.39, "hi": -2.94, "fact": "p5_con_image_twin_run1_bgfpr"}, {"a": "image_twin", "b": "run1", "metric": "ap100", "d": 0.02, "lo": -0.11, "hi": 0.36, "fact": "p5_con_image_twin_run1_ap100"}, {"a": "dino", "b": "run2", "metric": "hungarian", "d": 0.18, "lo": -0.59, "hi": 0.92, "fact": "p5_con_dino_run2_hungarian"}, {"a": "dino", "b": "run2", "metric": "mbo", "d": 0.15, "lo": -0.61, "hi": 0.87, "fact": "p5_con_dino_run2_mbo"}, {"a": "dino", "b": "run2", "metric": "union", "d": 3.79, "lo": 2.71, "hi": 4.91, "fact": "p5_con_dino_run2_union"}, {"a": "dino", "b": "run2", "metric": "recall", "d": -2.58, "lo": -4.18, "hi": -0.89, "fact": "p5_con_dino_run2_recall"}, {"a": "dino", "b": "run2", "metric": "fgari", "d": 1.94, "lo": 0.44, "hi": 3.35, "fact": "p5_con_dino_run2_fgari"}, {"a": "dino", "b": "run2", "metric": "bgfpr", "d": -15.39, "lo": -17.01, "hi": -13.69, "fact": "p5_con_dino_run2_bgfpr"}, {"a": "dino", "b": "run2", "metric": "ap100", "d": 0.79, "lo": 0.56, "hi": 1.18, "fact": "p5_con_dino_run2_ap100"}, {"a": "pilot", "b": "run2", "metric": "hungarian", "d": 0.75, "lo": 0.03, "hi": 1.4, "fact": "p5_con_pilot_run2_hungarian"}, {"a": "pilot", "b": "run2", "metric": "mbo", "d": 0.72, "lo": 0.01, "hi": 1.37, "fact": "p5_con_pilot_run2_mbo"}, {"a": "pilot", "b": "run2", "metric": "union", "d": 3.84, "lo": 2.87, "hi": 4.88, "fact": "p5_con_pilot_run2_union"}, {"a": "pilot", "b": "run2", "metric": "recall", "d": 0.21, "lo": -1.52, "hi": 1.91, "fact": "p5_con_pilot_run2_recall"}, {"a": "pilot", "b": "run2", "metric": "fgari", "d": 2.34, "lo": 0.91, "hi": 3.68, "fact": "p5_con_pilot_run2_fgari"}, {"a": "pilot", "b": "run2", "metric": "bgfpr", "d": -13.32, "lo": -14.91, "hi": -11.75, "fact": "p5_con_pilot_run2_bgfpr"}, {"a": "pilot", "b": "run2", "metric": "ap100", "d": 0.72, "lo": 0.45, "hi": 1.11, "fact": "p5_con_pilot_run2_ap100"}, {"a": "run1", "b": "run2", "metric": "hungarian", "d": 1.8, "lo": 1.02, "hi": 2.61, "fact": "p5_con_run1_run2_hungarian"}, {"a": "run1", "b": "run2", "metric": "mbo", "d": 1.95, "lo": 1.17, "hi": 2.76, "fact": "p5_con_run1_run2_mbo"}, {"a": "run1", "b": "run2", "metric": "union", "d": 5.0, "lo": 3.85, "hi": 6.15, "fact": "p5_con_run1_run2_union"}, {"a": "run1", "b": "run2", "metric": "recall", "d": 0.04, "lo": -1.64, "hi": 1.74, "fact": "p5_con_run1_run2_recall"}, {"a": "run1", "b": "run2", "metric": "fgari", "d": 3.32, "lo": 1.85, "hi": 4.77, "fact": "p5_con_run1_run2_fgari"}, {"a": "run1", "b": "run2", "metric": "bgfpr", "d": -14.83, "lo": -16.41, "hi": -13.12, "fact": "p5_con_run1_run2_bgfpr"}, {"a": "run1", "b": "run2", "metric": "ap100", "d": 1.01, "lo": 0.66, "hi": 1.4, "fact": "p5_con_run1_run2_ap100"}, {"a": "released", "b": "run3", "metric": "hungarian", "d": 0.38, "lo": -0.03, "hi": 0.78, "fact": "p5_con_released_run3_hungarian"}, {"a": "released", "b": "run3", "metric": "union", "d": 0.07, "lo": -0.5, "hi": 0.62, "fact": "p5_con_released_run3_union"}, {"a": "released", "b": "run3", "metric": "recall", "d": -0.15, "lo": -1.27, "hi": 1.02, "fact": "p5_con_released_run3_recall"}, {"a": "released", "b": "run3", "metric": "fgari", "d": -0.17, "lo": -1.07, "hi": 0.67, "fact": "p5_con_released_run3_fgari"}, {"a": "released", "b": "run3", "metric": "bgfpr", "d": -0.07, "lo": -0.98, "hi": 0.87, "fact": "p5_con_released_run3_bgfpr"}, {"a": "released", "b": "run3", "metric": "ap100", "d": 0.04, "lo": -0.03, "hi": 0.17, "fact": "p5_con_released_run3_ap100"}, {"a": "run1", "b": "run3", "metric": "hungarian", "d": 0.34, "lo": -0.23, "hi": 0.93, "fact": "p5_con_run1_run3_hungarian"}, {"a": "run1", "b": "run3", "metric": "union", "d": -0.74, "lo": -1.5, "hi": 0.04, "fact": "p5_con_run1_run3_union"}, {"a": "run1", "b": "run3", "metric": "recall", "d": 0.43, "lo": -1.07, "hi": 1.94, "fact": "p5_con_run1_run3_recall"}, {"a": "run1", "b": "run3", "metric": "fgari", "d": 1.58, "lo": 0.53, "hi": 2.62, "fact": "p5_con_run1_run3_fgari"}, {"a": "run1", "b": "run3", "metric": "bgfpr", "d": 4.27, "lo": 3.06, "hi": 5.46, "fact": "p5_con_run1_run3_bgfpr"}, {"a": "run1", "b": "run3", "metric": "ap100", "d": -0.01, "lo": -0.35, "hi": 0.1, "fact": "p5_con_run1_run3_ap100"}, {"a": "row_twin", "b": "run3", "metric": "hungarian", "d": 0.24, "lo": -0.18, "hi": 0.67, "fact": "p5_con_row_twin_run3_hungarian"}, {"a": "row_twin", "b": "run3", "metric": "union", "d": -0.21, "lo": -0.81, "hi": 0.38, "fact": "p5_con_row_twin_run3_union"}, {"a": "row_twin", "b": "run3", "metric": "recall", "d": -0.68, "lo": -1.92, "hi": 0.5, "fact": "p5_con_row_twin_run3_recall"}, {"a": "row_twin", "b": "run3", "metric": "fgari", "d": -0.36, "lo": -1.3, "hi": 0.51, "fact": "p5_con_row_twin_run3_fgari"}, {"a": "row_twin", "b": "run3", "metric": "bgfpr", "d": 0.04, "lo": -0.96, "hi": 1.01, "fact": "p5_con_row_twin_run3_bgfpr"}, {"a": "row_twin", "b": "run3", "metric": "ap100", "d": 0.02, "lo": -0.07, "hi": 0.15, "fact": "p5_con_row_twin_run3_ap100"}, {"a": "image_twin", "b": "run3", "metric": "hungarian", "d": 0.28, "lo": -0.11, "hi": 0.67, "fact": "p5_con_image_twin_run3_hungarian"}, {"a": "image_twin", "b": "run3", "metric": "union", "d": -0.12, "lo": -0.68, "hi": 0.45, "fact": "p5_con_image_twin_run3_union"}, {"a": "image_twin", "b": "run3", "metric": "recall", "d": -0.68, "lo": -1.9, "hi": 0.49, "fact": "p5_con_image_twin_run3_recall"}, {"a": "image_twin", "b": "run3", "metric": "fgari", "d": 0.04, "lo": -0.83, "hi": 0.85, "fact": "p5_con_image_twin_run3_fgari"}, {"a": "image_twin", "b": "run3", "metric": "bgfpr", "d": 0.11, "lo": -0.82, "hi": 1.04, "fact": "p5_con_image_twin_run3_bgfpr"}, {"a": "image_twin", "b": "run3", "metric": "ap100", "d": 0.02, "lo": -0.11, "hi": 0.13, "fact": "p5_con_image_twin_run3_ap100"}, {"a": "dino", "b": "released", "metric": "miou", "d": 9.39, "lo": 8.21, "hi": 10.2, "fact": "p5_probe_c01_miou"}, {"a": "dino", "b": "released", "metric": "aacc", "d": 8.44, "lo": 7.79, "hi": 9.07, "fact": "p5_probe_c01_aacc"}, {"a": "dino", "b": "released", "metric": "macc", "d": 13.18, "lo": 11.5, "hi": 14.38, "fact": "p5_probe_c01_macc"}, {"a": "dino", "b": "released", "metric": "fgbg", "d": 6.49, "lo": 5.68, "hi": 7.25, "fact": "p5_probe_c01_fgbg"}, {"a": "released", "b": "row_twin", "metric": "miou", "d": 0.88, "lo": 0.58, "hi": 1.11, "fact": "p5_probe_c02_miou"}, {"a": "released", "b": "row_twin", "metric": "aacc", "d": 0.45, "lo": 0.34, "hi": 0.56, "fact": "p5_probe_c02_aacc"}, {"a": "released", "b": "row_twin", "metric": "macc", "d": 1.3, "lo": 0.95, "hi": 1.63, "fact": "p5_probe_c02_macc"}, {"a": "released", "b": "row_twin", "metric": "fgbg", "d": 0.33, "lo": 0.19, "hi": 0.48, "fact": "p5_probe_c02_fgbg"}, {"a": "released", "b": "image_twin", "metric": "miou", "d": 0.79, "lo": 0.5, "hi": 1.03, "fact": "p5_probe_c03_miou"}, {"a": "released", "b": "image_twin", "metric": "aacc", "d": 0.43, "lo": 0.31, "hi": 0.55, "fact": "p5_probe_c03_aacc"}, {"a": "released", "b": "image_twin", "metric": "macc", "d": 1.13, "lo": 0.77, "hi": 1.47, "fact": "p5_probe_c03_macc"}, {"a": "released", "b": "image_twin", "metric": "fgbg", "d": 0.34, "lo": 0.18, "hi": 0.48, "fact": "p5_probe_c03_fgbg"}, {"a": "released", "b": "run1", "metric": "miou", "d": 1.35, "lo": 0.87, "hi": 1.79, "fact": "p5_probe_c04_miou"}, {"a": "released", "b": "run1", "metric": "aacc", "d": 1.19, "lo": 0.92, "hi": 1.45, "fact": "p5_probe_c04_aacc"}, {"a": "released", "b": "run1", "metric": "macc", "d": 1.62, "lo": 0.93, "hi": 2.22, "fact": "p5_probe_c04_macc"}, {"a": "released", "b": "run1", "metric": "fgbg", "d": 0.62, "lo": 0.25, "hi": 1.0, "fact": "p5_probe_c04_fgbg"}, {"a": "row_twin", "b": "run1", "metric": "miou", "d": 0.48, "lo": 0.06, "hi": 0.89, "fact": "p5_probe_c05_miou"}, {"a": "row_twin", "b": "run1", "metric": "aacc", "d": 0.73, "lo": 0.46, "hi": 0.99, "fact": "p5_probe_c05_aacc"}, {"a": "row_twin", "b": "run1", "metric": "macc", "d": 0.32, "lo": -0.27, "hi": 0.86, "fact": "p5_probe_c05_macc"}, {"a": "row_twin", "b": "run1", "metric": "fgbg", "d": 0.29, "lo": -0.09, "hi": 0.66, "fact": "p5_probe_c05_fgbg"}, {"a": "image_twin", "b": "run1", "metric": "miou", "d": 0.57, "lo": 0.14, "hi": 0.95, "fact": "p5_probe_c06_miou"}, {"a": "image_twin", "b": "run1", "metric": "aacc", "d": 0.75, "lo": 0.49, "hi": 1.01, "fact": "p5_probe_c06_aacc"}, {"a": "image_twin", "b": "run1", "metric": "macc", "d": 0.49, "lo": -0.1, "hi": 1.02, "fact": "p5_probe_c06_macc"}, {"a": "image_twin", "b": "run1", "metric": "fgbg", "d": 0.28, "lo": -0.08, "hi": 0.65, "fact": "p5_probe_c06_fgbg"}, {"a": "dino", "b": "pilot", "metric": "miou", "d": 6.46, "lo": 5.68, "hi": 7.06, "fact": "p5_probe_c07_miou"}, {"a": "dino", "b": "pilot", "metric": "aacc", "d": 7.15, "lo": 6.68, "hi": 7.65, "fact": "p5_probe_c07_aacc"}, {"a": "dino", "b": "pilot", "metric": "macc", "d": 9.42, "lo": 8.45, "hi": 10.29, "fact": "p5_probe_c07_macc"}, {"a": "dino", "b": "pilot", "metric": "fgbg", "d": 5.8, "lo": 5.19, "hi": 6.42, "fact": "p5_probe_c07_fgbg"}, {"a": "dino", "b": "run2", "metric": "miou", "d": 6.7, "lo": 5.7, "hi": 7.46, "fact": "p5_probe_c08_miou"}, {"a": "dino", "b": "run2", "metric": "aacc", "d": 3.98, "lo": 3.45, "hi": 4.48, "fact": "p5_probe_c08_aacc"}, {"a": "dino", "b": "run2", "metric": "macc", "d": 10.75, "lo": 9.5, "hi": 11.85, "fact": "p5_probe_c08_macc"}, {"a": "dino", "b": "run2", "metric": "fgbg", "d": 1.87, "lo": 1.29, "hi": 2.45, "fact": "p5_probe_c08_fgbg"}, {"a": "pilot", "b": "run2", "metric": "miou", "d": 0.24, "lo": -0.39, "hi": 0.84, "fact": "p5_probe_c09_miou"}, {"a": "pilot", "b": "run2", "metric": "aacc", "d": -3.17, "lo": -3.72, "hi": -2.62, "fact": "p5_probe_c09_aacc"}, {"a": "pilot", "b": "run2", "metric": "macc", "d": 1.33, "lo": 0.52, "hi": 2.16, "fact": "p5_probe_c09_macc"}, {"a": "pilot", "b": "run2", "metric": "fgbg", "d": -3.94, "lo": -4.6, "hi": -3.27, "fact": "p5_probe_c09_fgbg"}, {"a": "run1", "b": "run2", "metric": "miou", "d": -4.04, "lo": -4.82, "hi": -3.0, "fact": "p5_probe_c10_miou"}, {"a": "run1", "b": "run2", "metric": "aacc", "d": -5.65, "lo": -6.33, "hi": -4.99, "fact": "p5_probe_c10_aacc"}, {"a": "run1", "b": "run2", "metric": "macc", "d": -4.05, "lo": -4.99, "hi": -2.59, "fact": "p5_probe_c10_macc"}, {"a": "run1", "b": "run2", "metric": "fgbg", "d": -5.24, "lo": -6.04, "hi": -4.43, "fact": "p5_probe_c10_fgbg"}, {"a": "released", "b": "run3", "metric": "miou", "d": 1.51, "lo": 1.15, "hi": 1.81, "fact": "p5_probe_c11_miou"}, {"a": "released", "b": "run3", "metric": "aacc", "d": 0.9, "lo": 0.76, "hi": 1.04, "fact": "p5_probe_c11_aacc"}, {"a": "released", "b": "run3", "metric": "macc", "d": 1.94, "lo": 1.52, "hi": 2.33, "fact": "p5_probe_c11_macc"}, {"a": "released", "b": "run3", "metric": "fgbg", "d": 0.67, "lo": 0.49, "hi": 0.85, "fact": "p5_probe_c11_fgbg"}, {"a": "run1", "b": "run3", "metric": "miou", "d": 0.16, "lo": -0.18, "hi": 0.51, "fact": "p5_probe_c12_miou"}, {"a": "run1", "b": "run3", "metric": "aacc", "d": -0.29, "lo": -0.53, "hi": -0.06, "fact": "p5_probe_c12_aacc"}, {"a": "run1", "b": "run3", "metric": "macc", "d": 0.32, "lo": -0.13, "hi": 0.84, "fact": "p5_probe_c12_macc"}, {"a": "run1", "b": "run3", "metric": "fgbg", "d": 0.05, "lo": -0.28, "hi": 0.38, "fact": "p5_probe_c12_fgbg"}, {"a": "row_twin", "b": "run3", "metric": "miou", "d": 0.64, "lo": 0.39, "hi": 0.86, "fact": "p5_probe_c13_miou"}, {"a": "row_twin", "b": "run3", "metric": "aacc", "d": 0.44, "lo": 0.35, "hi": 0.55, "fact": "p5_probe_c13_aacc"}, {"a": "row_twin", "b": "run3", "metric": "macc", "d": 0.64, "lo": 0.35, "hi": 0.96, "fact": "p5_probe_c13_macc"}, {"a": "row_twin", "b": "run3", "metric": "fgbg", "d": 0.33, "lo": 0.2, "hi": 0.48, "fact": "p5_probe_c13_fgbg"}, {"a": "image_twin", "b": "run3", "metric": "miou", "d": 0.73, "lo": 0.47, "hi": 0.94, "fact": "p5_probe_c14_miou"}, {"a": "image_twin", "b": "run3", "metric": "aacc", "d": 0.46, "lo": 0.36, "hi": 0.57, "fact": "p5_probe_c14_aacc"}, {"a": "image_twin", "b": "run3", "metric": "macc", "d": 0.81, "lo": 0.5, "hi": 1.14, "fact": "p5_probe_c14_macc"}, {"a": "image_twin", "b": "run3", "metric": "fgbg", "d": 0.33, "lo": 0.2, "hi": 0.47, "fact": "p5_probe_c14_fgbg"}]};

  root.LabP5 = Object.freeze({
    READINGS: READINGS, RUN: RUN, histogram: histogram, pca2: pca2, project: project, projectDirection: projectDirection,
    anchorInfonce: anchorInfonce, series: series, erf: erf, gelu: gelu, geluSlope: geluSlope, toyHead: toyHead,
    headForward: headForward, headBackward: headBackward, headGradient: headGradient, cosineGradient: cosineGradient,
    infonceOnVectors: infonceOnVectors
  });

  // ================================================================== Lab 5A: real positives and negatives

  Labs.register('lab-5a-real-sets', function mount(body, core, bundles) {
    bundles = bundles || core.bundles || {};
    const ID = 'lab-5a-real-sets';
    const CELL = 24, SIZE = GRID * CELL;
    const HIST = { w: 470, h: 220 };
    const images = bundles['images.json'] || bundles.images;
    if (!images || !Array.isArray(images.images)) throw new Error('images.json did not arrive');
    const state = {
      image: bundleImageId(), model: 'con2', crop: 'global', k: RUN.k, kLocal: RUN.kLocal, negPct: RUN.negPct,
      capPos: RUN.capPos, capNeg: RUN.capNeg, anchor: FOLLOWED_ANCHOR, view: 'roles', loading: null, error: null
    };
    const tokenCache = Object.create(null);
    const simCache = Object.create(null);
    const exact = Object.create(null);
    let ev = null;
    Object.keys(bundles).forEach(function (key) {
      const b = bundles[key];
      if (/_tokens224(\.json)?$/.test(key) && b && b.tokens && b.tokens.array) tokenCache[key.replace(/\.json$/, '') + '.json'] = b.tokens.array;
    });
    // On the followed photograph under run 2 the lab reads followed.json's teacher tokens, the full 32-bit numbers from
    // which the bundle chose its sets, so that its thresholds and sets equal the bundle's (and the copy's) exactly.
    const followed = bundles['followed.json'] || bundles.followed || null;
    if (followed && followed.teacher_tokens224 && followed.teacher_tokens224.array && followed.model === 'con2') {
      const ff = fileOf(followed.image, 'con2');
      if (ff) { tokenCache[ff] = followed.teacher_tokens224.array; exact[ff] = true; }
    }

    // entryOf(id), fileOf(id, model): the photograph's entry in images.json and its tokens file for a model.
    function entryOf(id) { return images.images.filter(function (e) { return e.id === id; })[0] || null; }
    function fileOf(id, model) {
      const e = entryOf(id);
      return e && e.files && e.files.tokens224 ? e.files.tokens224[model] || null : null;
    }
    function modelName(m) { return (MODELS.filter(function (x) { return x[0] === m; })[0] || [m, m])[1]; }

    // ---------------------------------------------------------------- controls

    const controls = core.el('div', { class: 'lab-controls' });
    const pick = picker(core, ID);
    const modelCtl = segmented(core, {
      id: ID + '-model', label: 'Whose teacher tokens', value: state.model, options: MODELS,
      hint: ['Run 2 is the default: the rule from the DINO start, at its last epoch. The rule always ranks the teacher', RSQUO, 's tokens.']
    });
    const cropCtl = segmented(core, {
      id: ID + '-crop', label: 'Crop', value: state.crop,
      options: [['global', '224 px global crop'], ['local', '6 ' + TIMES + ' 6 toy local crop']],
      hint: ['The global crop is the real 196 tokens. The local crop is a toy: the 36 tokens of the 6 ', TIMES, ' 6 block around the anchor, ranked with k for 36 tokens. A real 96-pixel crop is a new, smaller picture with tokens of its own.']
    });
    const kCtl = slider(core, {
      id: ID + '-k', label: 'k, the top-k floor', min: 1, max: 32, step: 1, value: state.k, role: 'positive',
      format: function (v) { return core.fmt(v, 0); },
      hint: ['The run', RSQUO, 's value: 8 on a 224-pixel crop and 4 on a 96-pixel crop. k also places ', TAU, '_hi at the quantile 1 ', MINUS, ' k/(N ', MINUS, ' 1).']
    });
    const negCtl = slider(core, {
      id: ID + '-neg', label: 'Negatives: the bottom per cent of pairs', min: 5, max: 50, step: 1, value: state.negPct, role: 'negative',
      format: function (v) { return core.fmt(v, 0) + ' %'; },
      hint: ['The run', RSQUO, 's value: 20 per cent. ', TAU, '_lo is the quantile at this share of all the crop', RSQUO, 's pairs.']
    });
    const capPosCtl = slider(core, {
      id: ID + '-cap-pos', label: 'Cap on positives', min: 8, max: 64, step: 1, value: state.capPos, role: 'positive',
      format: function (v) { return core.fmt(v, 0); },
      hint: ['The run', RSQUO, 's cap: 24, the most similar kept. It never goes below k.']
    });
    const capNegCtl = slider(core, {
      id: ID + '-cap-neg', label: 'Cap on negatives', min: 1, max: 96, step: 1, value: state.capNeg, role: 'negative',
      format: function (v) { return core.fmt(v, 0); },
      hint: ['The run', RSQUO, 's cap: 48, the least similar kept.']
    });
    const runBtn = core.el('button', { type: 'button', class: 'btn', id: ID + '-run' }, ['The run' + RSQUO + 's values']);
    const thrBtn = core.el('button', { type: 'button', class: 'btn', id: ID + '-threshold-anchor' }, ['An anchor the threshold adds to']);
    const homeBtn = core.el('button', { type: 'button', class: 'btn', id: ID + '-home' }, ['The followed anchor']);
    const viewCtl = segmented(core, {
      id: ID + '-view', label: 'Paint the patches by', value: state.view,
      options: [['roles', 'their role'], ['cosine', 'their cosine']],
      hint: ['Role: orange positives (solid from the top k, hatched when the threshold adds them), purple negatives. Cosine: stronger ink, more alike to the anchor.']
    });
    const anchorOut = core.el('output', { id: ID + '-anchor-out', 'aria-live': 'off' });
    const anchorCtl = core.el('div', { class: 'control' }, [
      core.el('span', { class: 'control-label' }, ['Anchor']), anchorOut,
      core.el('p', { class: 'control-hint' }, ['Click a patch of the photograph, or focus it and use the arrow keys, to make it the ', term(core, 'anchor'), '.'])
    ]);
    if (pick) controls.appendChild(pick);
    [modelCtl.root, cropCtl.root, kCtl.root, negCtl.root, capPosCtl.root, capNegCtl.root,
      core.el('div', { class: 'button-row' }, [runBtn, thrBtn, homeBtn]), viewCtl.root, anchorCtl].forEach(function (n) { controls.appendChild(n); });

    // ---------------------------------------------------------------- stage

    const stage = core.el('div', { class: 'lab-stage' });
    const canvas = makeCanvas(core, { id: ID + '-photo', w: SIZE, h: SIZE, interactive: true });
    const noteOk = core.el('span', null, ['The photograph is drawn by your browser, so its pixels can differ slightly from the bundle', RSQUO, 's. ',
      core.el('span', { class: 'mark mark-toy' }, ['Toy'])]);
    const noteErr = core.el('span', { hidden: true });
    const photoNote = core.el('p', { class: 'small', id: ID + '-photo-note', style: { maxWidth: SIZE + 'px' } }, [noteOk, noteErr]);
    const histHolder = core.el('div', { id: ID + '-hist' });
    const status = core.el('p', { class: 'small', id: ID + '-status', 'aria-live': 'polite' });
    const anchorRead = readout(core, ID + '-anchor', [['patch', 'Anchor'], ['pos', 'Positives'], ['neg', 'Negatives'], ['range', 'Their cosines']]);
    const cropRead = readout(core, ID + '-crop-readout', [['thresholds', 'Thresholds'], ['degree', 'Positives per anchor'], ['negs', 'Negatives per anchor'], ['cuts', 'Cap cuts'], ['empty', 'No negative'], ['added', 'Added by the threshold']]);
    const chips = core.el('div', { class: 'stage-row', id: ID + '-chips' });
    stage.appendChild(status);
    stage.appendChild(core.el('div', { class: 'stage-row' }, [
      stageCell(core, ['The photograph', RSQUO, 's 224 px view and its 14 ', TIMES, ' 14 patches'], [canvas, core.el('ul', { class: 'legend' }, [
        core.el('li', { class: 'role-positive' }, ['positive: solid from the top k, hatched from the threshold']),
        core.el('li', { class: 'role-negative' }, ['negative']),
        core.el('li', null, ['thick outline: the anchor'])
      ]), photoNote], SIZE + 10),
      stageCell(core, ['Every pair of the crop: how many have each cosine'], [histHolder], HIST.w)
    ]));
    stage.appendChild(core.el('p', { class: 'stage-label' }, ['This anchor']));
    stage.appendChild(anchorRead.root);
    stage.appendChild(chips);
    stage.appendChild(core.el('p', { class: 'stage-label' }, ['The whole crop']));
    stage.appendChild(cropRead.root);
    body.appendChild(controls);
    body.appendChild(stage);

    // ---------------------------------------------------------------- the computation

    // tokensNow(): the decoded tokens of the current photograph and model, or null while they load (the load is started).
    function tokensNow() {
      const file = fileOf(state.image, state.model);
      if (!file) { state.error = 'The bundle holds no ' + modelName(state.model) + ' tokens for this photograph.'; return null; }
      if (tokenCache[file]) return tokenCache[file];
      if (state.loading !== file) {
        state.loading = file;
        state.error = null;
        Promise.resolve().then(function () { return core.bundle.load(file); }).then(core.guard(body, function (b) {
          tokenCache[file] = b.tokens.array;
          if (state.loading === file) state.loading = null;
          recompute();
          draw();
        }), core.guard(body, function (err) {
          if (state.loading === file) state.loading = null;
          state.error = 'The tokens of this photograph did not load: ' + (err && err.message ? err.message : String(err)) + '.';
          draw();
        }));
      }
      return null;
    }

    // recompute(): the similarities, the thresholds and the sets of the current crop.
    function recompute() {
      const tokens = tokensNow();
      if (!tokens) { ev = null; return; }
      const file = fileOf(state.image, state.model);
      if (state.crop === 'global') {
        if (!simCache[file]) {
          const s = core.rule.similarity(tokens, N_GLOBAL, DIM);
          simCache[file] = { sim: s, hist: histogram(s, N_GLOBAL, 0, 0.05) };
        }
        const sim = simCache[file].sim;
        const sets = core.rule.sets(sim, N_GLOBAL, { k: state.k, negPct: state.negPct, capPos: Math.max(state.capPos, state.k), capNeg: state.capNeg });
        ev = { n: N_GLOBAL, side: GRID, idx: null, sim: sim, sets: sets, hist: simCache[file].hist, a: state.anchor, k: state.k, exact: !!exact[file] };
      } else {
        const ar = Math.floor(state.anchor / GRID), ac = state.anchor % GRID;
        const r0 = clamp(ar - 2, 0, GRID - 6), c0 = clamp(ac - 2, 0, GRID - 6);
        const idx = [];
        for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) idx.push((r0 + r) * GRID + c0 + c);
        const sub = new Float32Array(36 * DIM);
        idx.forEach(function (g, i) { for (let c = 0; c < DIM; c++) sub[i * DIM + c] = tokens[g * DIM + c]; });
        const sim = core.rule.similarity(sub, 36, DIM);
        const k = Math.min(state.kLocal, 35);
        const sets = core.rule.sets(sim, 36, { k: k, negPct: state.negPct, capPos: Math.max(state.capPos, k), capNeg: state.capNeg });
        ev = { n: 36, side: 6, idx: idx, r0: r0, c0: c0, sim: sim, sets: sets, hist: histogram(sim, 36, 0, 0.1), a: idx.indexOf(state.anchor), k: k, exact: !!exact[file] };
      }
    }

    // roleOf(g): what global patch g is for the anchor: anchor, top (a top-k positive), added (threshold-added), negative,
    // none, or outside (beyond the toy local crop).
    function roleOf(g) {
      if (!ev) return 'none';
      const local = ev.idx ? ev.idx.indexOf(g) : g;
      if (local < 0) return 'outside';
      if (local === ev.a) return 'anchor';
      const s = ev.sets;
      if (Array.prototype.indexOf.call(s.posFromTopk[ev.a], local) >= 0) return 'top';
      if (Array.prototype.indexOf.call(s.posFromThreshold[ev.a], local) >= 0) return 'added';
      if (Array.prototype.indexOf.call(s.neg[ev.a], local) >= 0) return 'negative';
      return 'none';
    }

    // cosOf(g): the anchor's cosine with global patch g in the current crop (NaN outside it or for the anchor).
    function cosOf(g) {
      if (!ev) return NaN;
      const local = ev.idx ? ev.idx.indexOf(g) : g;
      if (local < 0 || local === ev.a) return NaN;
      return ev.sim[ev.a * ev.n + local];
    }

    // ---------------------------------------------------------------- drawings

    // redraw(): draw() guarded, the one function the photograph's loader calls back.
    const redraw = core.guard(body, function () { draw(); });

    function drawPhoto(T) {
      const ctx = core.fitCanvas(canvas, SIZE, SIZE);
      ctx.fillStyle = T.paper;
      ctx.fillRect(0, 0, SIZE, SIZE);
      const ph = photo(core, state.image, 224, redraw);
      if (ph) ctx.drawImage(ph, 0, 0, SIZE, SIZE);
      for (let g = 0; g < N_GLOBAL; g++) {
        const x = (g % GRID) * CELL, y = Math.floor(g / GRID) * CELL;
        if (!ev) { ctx.fillStyle = core.rgba(T.paper, 0.35); ctx.fillRect(x, y, CELL, CELL); continue; }
        const role = roleOf(g);
        if (role === 'outside') { ctx.fillStyle = core.rgba(T.paper, 0.75); ctx.fillRect(x, y, CELL, CELL); continue; }
        if (state.view === 'cosine') {
          const v = cosOf(g);
          ctx.fillStyle = core.rgba(T.paper, 0.55);
          ctx.fillRect(x, y, CELL, CELL);
          if (v > 0) { ctx.fillStyle = core.rgba(T.ink, Math.min(0.85, v * 0.85)); ctx.fillRect(x + 2, y + 2, CELL - 4, CELL - 4); }
          continue;
        }
        if (role === 'top') { ctx.fillStyle = core.rgba(T.positive, 0.62); ctx.fillRect(x, y, CELL, CELL); }
        else if (role === 'added') { ctx.fillStyle = core.rgba(T.positive, 0.28); ctx.fillRect(x, y, CELL, CELL); hatch(ctx, x, y, CELL, CELL, T.positive, 5); }
        else if (role === 'negative') { ctx.fillStyle = core.rgba(T.negative, 0.58); ctx.fillRect(x, y, CELL, CELL); }
        else if (role === 'none') { ctx.fillStyle = core.rgba(T.paper, 0.3); ctx.fillRect(x, y, CELL, CELL); }
      }
      ctx.strokeStyle = core.rgba(T.ink, 0.35);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let t = 1; t < GRID; t++) {
        ctx.moveTo(t * CELL + 0.5, 0); ctx.lineTo(t * CELL + 0.5, SIZE);
        ctx.moveTo(0, t * CELL + 0.5); ctx.lineTo(SIZE, t * CELL + 0.5);
      }
      ctx.stroke();
      if (ev && ev.idx) {
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 3]);
        ctx.strokeStyle = T.ink;
        ctx.strokeRect(ev.c0 * CELL + 1, ev.r0 * CELL + 1, 6 * CELL - 2, 6 * CELL - 2);
        ctx.setLineDash([]);
      }
      const ax = (state.anchor % GRID) * CELL, ay = Math.floor(state.anchor / GRID) * CELL;
      ctx.lineWidth = 6;
      ctx.strokeStyle = T.paper;
      ctx.strokeRect(ax + 3, ay + 3, CELL - 6, CELL - 6);
      ctx.lineWidth = 3;
      ctx.strokeStyle = T.ink;
      ctx.strokeRect(ax + 3, ay + 3, CELL - 6, CELL - 6);
      ctx.font = '600 10px ' + MONO;
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      haloText(ctx, T, String(state.anchor), ax + 2, ay - 11 < 0 ? ay + CELL + 1 : ay - 11);
      const s = ev ? ev.sets : null;
      canvas.setAttribute('aria-label', 'The photograph ' + state.image + ' under ' + modelName(state.model) + '. Anchor ' + state.anchor + ' (' + cellName(state.anchor, GRID) + ').' +
        (s ? ' Positives ' + s.pos[ev.a].length + ', negatives ' + s.neg[ev.a].length + '.' : ' The tokens are loading.') + ' Click a patch or use the arrow keys to move the anchor.');
      const err = photoError(state.image, 224);
      noteOk.hidden = !!err;
      noteErr.hidden = !err;
      if (err) setContent(noteErr, ['The photograph itself could not be drawn here (' + err + '); the patches and their roles are drawn on a plain ground.']);
    }

    function drawHistogram() {
      if (!ev) { setContent(histHolder, core.el('p', { class: 'small' }, ['The histogram appears when the tokens have loaded.'])); return; }
      const h = ev.hist, s = ev.sets, n = ev.n;
      const x0 = 46, x1 = HIST.w - 12, top = 30, base = HIST.h - 62;
      const X = function (v) { return x0 + (x1 - x0) * (v - h.lo) / (h.hi - h.lo); };
      let most = 1;
      h.counts.forEach(function (c) { most = Math.max(most, c); });
      const Y = function (c) { return base - (base - top) * c / most; };
      const svg = svgChart(core, ID + '-hist-chart', HIST.w, HIST.h, 'Histogram of the ' + core.fmt(n * (n - 1), 0) + ' cosines between different patches of the crop, from ' +
        core.fmt(h.lo, 2) + ' to ' + core.fmt(h.hi, 2) + '. ' + TAU + '_hi ' + core.fmt(s.tauHi, 4) + ', ' + TAU + '_lo ' + core.fmt(s.tauLo, 4) + '.');
      const gridG = core.el('g', { class: 'grid' });
      for (let v = Math.ceil(h.lo * 4) / 4; v <= h.hi + 1e-9; v += 0.25) {
        gridG.appendChild(line(core, X(v), top - 6, X(v), base));
        svg.appendChild(tx(core, X(v), base + 13, (v < -1e-9 ? MINUS : '') + core.fmt(Math.abs(v), 2), { 'text-anchor': 'middle' }));
      }
      svg.appendChild(gridG);
      h.counts.forEach(function (c, b) {
        if (!c) return;
        const lo = h.lo + b * h.width, hi = lo + h.width, mid = (lo + hi) / 2;
        const cls = mid >= s.tauHi ? 'bar role-positive' : (mid <= s.tauLo ? 'bar role-negative' : 'bar role-ignored');
        svg.appendChild(withTitle(core, rect(core, X(lo) + 0.5, Y(c), Math.max(0.5, X(hi) - X(lo) - 1), base - Y(c), { class: cls }),
          'cosines ' + core.fmt(lo, 2) + ' to ' + core.fmt(hi, 2) + ': ' + core.fmt(c, 0) + ' pairs'));
      });
      svg.appendChild(core.el('g', { class: 'axis' }, [line(core, x0, base + 0.5, x1, base + 0.5)]));
      [['hi', s.tauHi, 'end', 'the top ' + core.fmt(100 * (1 - s.qHi), 1) + ' %'], ['lo', s.tauLo, 'start', 'the bottom ' + core.fmt(100 * s.qLo, 0) + ' %']].forEach(function (t, i) {
        svg.appendChild(line(core, X(t[1]), top - 14, X(t[1]), base + 24, { style: 'stroke: var(--ink); stroke-width: 1.5' }));
        const label = TAU + '_' + t[0] + ' = ' + (t[1] < 0 ? MINUS : '') + core.fmt(Math.abs(t[1]), 4) + ', ' + t[3];
        svg.appendChild(tx(core, X(t[1]) + (t[2] === 'end' ? -4 : 4), top - 18 + i * 12, label, { 'text-anchor': t[2], class: 'title', style: HALO }));
      });
      const rugY = base + 30;
      svg.appendChild(tx(core, x0 - 6, rugY + 4, 'row', { 'text-anchor': 'end' }));
      for (let j = 0; j < n; j++) {
        if (j === ev.a) continue;
        const v = ev.sim[ev.a * n + j];
        const g = ev.idx ? ev.idx[j] : j;
        const role = roleOf(g);
        const cls = role === 'top' || role === 'added' ? 'role-positive' : (role === 'negative' ? 'role-negative' : 'role-ignored');
        svg.appendChild(line(core, X(v), rugY - 6, X(v), rugY + 6, { class: cls, style: 'stroke: var(--role); stroke-width: ' + (role === 'none' ? 1 : 2) + (role === 'added' ? '; stroke-dasharray: 2 2' : '') }));
      }
      svg.appendChild(tx(core, (x0 + x1) / 2, HIST.h - 6, 'cosine of two different patches; the ticks of the bottom row: the anchor' + RSQUO + 's own ' + (n - 1), { 'text-anchor': 'middle' }));
      setContent(histHolder, svg);
    }

    function chip(text, role, filled, title) {
      return core.el('span', { class: ['chip', 'role-' + role, filled ? 'filled' : null], title: title }, [text]);
    }

    function drawReadouts() {
      setContent(anchorOut, 'patch ' + state.anchor + ', ' + cellName(state.anchor, GRID));
      if (state.error) setContent(status, state.error);
      else if (!ev) setContent(status, 'Loading the tokens of ' + modelName(state.model) + ' for this photograph' + ELLIPSIS);
      else setContent(status, [modelName(state.model), ' on the photograph ', state.image, ', ', state.crop === 'global' ? 'the 224 px global crop (196 tokens), k = ' + ev.k : 'a toy local crop of 36 tokens around the anchor, k = ' + ev.k, '. ',
        ev.exact ? 'These are the bundle' + RSQUO + 's 32-bit tokens, so the sets equal the bundle' + RSQUO + 's own.' : 'These tokens are stored to 8 bits per number.']);
      if (!ev) {
        ['patch', 'pos', 'neg', 'range'].forEach(function (k) { anchorRead.set(k, ELLIPSIS); });
        ['thresholds', 'degree', 'negs', 'cuts', 'empty', 'added'].forEach(function (k) { cropRead.set(k, ELLIPSIS); });
        setContent(chips, '');
        return;
      }
      const s = ev.sets, a = ev.a, n = ev.n;
      const P = s.pos[a], N = s.neg[a], top = s.posFromTopk[a], added = s.posFromThreshold[a];
      const glob = function (j) { return ev.idx ? ev.idx[j] : j; };
      anchorRead.set('patch', 'patch ' + state.anchor + ' (' + cellName(state.anchor, GRID) + ')' + (ev.idx ? ', number ' + a + ' of the 36' : ''));
      anchorRead.set('pos', P.length + ' = ' + top.length + ' from the top k + ' + added.length + ' added by the threshold (' + s.posUncapped[a] + ' before the cap of ' + s.capPos + ')');
      anchorRead.set('neg', N.length + ' (' + s.negUncapped[a] + ' at or below ' + TAU + '_lo that are no positive, before the cap of ' + s.capNeg + ')');
      const cos = function (j) { return ev.sim[a * n + j]; };
      const fmtC = function (v) { return (v < 0 ? MINUS : '') + core.fmt(Math.abs(v), 4); };
      anchorRead.set('range', 'positives from ' + fmtC(cos(P[0])) + ' down to ' + fmtC(cos(P[P.length - 1])) +
        (N.length ? '; negatives from ' + fmtC(cos(N[0])) + ' up to ' + fmtC(cos(N[N.length - 1])) : '; no negative'));
      const kids = [];
      Array.prototype.forEach.call(top, function (j) { kids.push(chip(String(glob(j)), 'positive', true, 'top-k positive, cosine ' + fmtC(cos(j)))); });
      Array.prototype.forEach.call(added, function (j) { kids.push(chip(String(glob(j)), 'positive', false, 'threshold-added positive, cosine ' + fmtC(cos(j)))); });
      Array.prototype.slice.call(N, 0, 16).forEach(function (j) { kids.push(chip(String(glob(j)), 'negative', false, 'negative, cosine ' + fmtC(cos(j)))); });
      if (N.length > 16) kids.push(core.el('span', { class: 'small' }, ['and ' + (N.length - 16) + ' more negatives']));
      setContent(chips, kids);
      cropRead.set('thresholds', TAU + '_hi = ' + fmtC(s.tauHi) + ' at the quantile 1 ' + MINUS + ' ' + ev.k + '/' + (n - 1) + ' = ' + core.fmt(s.qHi, 4) + '; ' + TAU + '_lo = ' + fmtC(s.tauLo) +
        ' at the quantile ' + core.fmt(s.qLo, 2) + '; both over ' + core.fmt(n * (n - 1), 0) + ' entries');
      let sumP = 0, sumN = 0, minP = Infinity, maxP = 0;
      for (let i = 0; i < n; i++) { sumP += s.pos[i].length; sumN += s.neg[i].length; minP = Math.min(minP, s.pos[i].length); maxP = Math.max(maxP, s.pos[i].length); }
      cropRead.set('degree', core.fmt(sumP / n, 2) + ' on average, from ' + minP + ' to ' + maxP);
      cropRead.set('negs', core.fmt(sumN / n, 2) + ' on average');
      cropRead.set('cuts', plural(s.capCutPos, 'anchor', 'anchors') + ' cut by the cap on positives, ' + plural(s.capCutNeg, 'anchor', 'anchors') + ' by the cap on negatives');
      cropRead.set('empty', plural(s.negEmpty, 'anchor', 'anchors') + ' of ' + n + ' left without a negative');
      cropRead.set('added', core.fmt(s.posFromThresholdTotal, 0) + ' positive pairs beyond their anchor' + RSQUO + 's top k');
    }

    function syncControls() {
      modelCtl.show(modelName(state.model));
      cropCtl.show(state.crop === 'global' ? '196 tokens' : '36 tokens (toy)');
      kCtl.range(1, state.crop === 'global' ? 32 : 20);
      kCtl.set(state.crop === 'global' ? state.k : state.kLocal);
      kCtl.show(core.fmt(state.crop === 'global' ? state.k : state.kLocal, 0) + (state.crop === 'global' ? (state.k === RUN.k ? ' (the run' + RSQUO + 's)' : '') : (state.kLocal === RUN.kLocal ? ' (the run' + RSQUO + 's)' : '')));
      negCtl.show(core.fmt(state.negPct, 0) + ' %' + (state.negPct === RUN.negPct ? ' (the run' + RSQUO + 's)' : ''));
      const kNow = state.crop === 'global' ? state.k : state.kLocal;
      capPosCtl.range(Math.max(1, kNow), 64);
      if (state.capPos < kNow) { state.capPos = kNow; }
      capPosCtl.set(state.capPos);
      capPosCtl.show(core.fmt(state.capPos, 0) + (state.capPos === RUN.capPos ? ' (the run' + RSQUO + 's)' : ''));
      capNegCtl.show(core.fmt(state.capNeg, 0) + (state.capNeg === RUN.capNeg ? ' (the run' + RSQUO + 's)' : ''));
      viewCtl.show(state.view === 'roles' ? 'role' : 'cosine');
      homeBtn.disabled = state.image !== FOLLOWED_IMAGE;
    }

    function draw() {
      const T = core.theme();
      syncControls();
      drawPhoto(T);
      drawHistogram();
      drawReadouts();
    }

    function update() { recompute(); draw(); }

    // ---------------------------------------------------------------- events

    modelCtl.onChange(core.guard(body, function () { state.model = modelCtl.get(); update(); }));
    cropCtl.onChange(core.guard(body, function () { state.crop = cropCtl.get(); update(); }));
    kCtl.input.addEventListener('input', core.guard(body, function () {
      if (state.crop === 'global') state.k = kCtl.get(); else state.kLocal = kCtl.get();
      update();
    }));
    negCtl.input.addEventListener('input', core.guard(body, function () { state.negPct = negCtl.get(); update(); }));
    capPosCtl.input.addEventListener('input', core.guard(body, function () { state.capPos = capPosCtl.get(); update(); }));
    capNegCtl.input.addEventListener('input', core.guard(body, function () { state.capNeg = capNegCtl.get(); update(); }));
    viewCtl.onChange(core.guard(body, function () { state.view = viewCtl.get(); draw(); }));
    runBtn.addEventListener('click', core.guard(body, function () {
      state.k = RUN.k; state.kLocal = RUN.kLocal; state.negPct = RUN.negPct; state.capPos = RUN.capPos; state.capNeg = RUN.capNeg;
      negCtl.set(RUN.negPct); capNegCtl.set(RUN.capNeg);
      update();
    }));
    thrBtn.addEventListener('click', core.guard(body, function () {
      if (!ev) return;
      let best = -1, most = 0;
      for (let i = 0; i < ev.n; i++) {
        const m = ev.sets.posFromThreshold[i].length;
        if (m > most) { most = m; best = i; }
      }
      if (best < 0) { setContent(status, 'No anchor of this crop gets a positive from the threshold at these settings.'); return; }
      state.anchor = ev.idx ? ev.idx[best] : best;
      update();
    }));
    homeBtn.addEventListener('click', core.guard(body, function () { state.anchor = FOLLOWED_ANCHOR; update(); }));
    canvas.addEventListener('click', core.guard(body, function (e) {
      const p = core.canvasPoint(canvas, e, SIZE, SIZE);
      const r = clamp(Math.floor(p.y / CELL), 0, GRID - 1), c = clamp(Math.floor(p.x / CELL), 0, GRID - 1);
      state.anchor = r * GRID + c;
      update();
    }));
    canvas.addEventListener('keydown', core.guard(body, function (e) {
      const next = moveOnGrid(state.anchor, GRID, e.key);
      if (next < 0) return;
      e.preventDefault();
      state.anchor = next;
      update();
    }));
    core.on('bundle-image-changed', core.guard(body, function (e) {
      if (!e || !/^\d{12}$/.test(String(e.id))) return;
      state.image = String(e.id);
      update();
    }));
    core.on('theme-changed', core.guard(body, draw));

    update();
  });

  // ================================================================== Lab 5B: the InfoNCE term, walked

  Labs.register('lab-5b-infonce', function mount(body, core, bundles) {
    bundles = bundles || core.bundles || {};
    const ID = 'lab-5b-infonce';
    const f = bundles['followed.json'] || bundles.followed;
    if (!f || !f.student_tokens224 || !f.teacher_tokens224) throw new Error('followed.json did not arrive');
    const MINI = 12, MSIZE = GRID * MINI;
    const SHARE = { w: 470, h: 190 };
    const CURVE = { w: 470, h: 200 };
    const TAUS = [0.1, 0.2, 0.3];
    const state = { anchor: f.anchor, follow: 0, tau: RUN.tau, shift: 0 };
    let optionsFor = -1;
    const teacherUnit = [];
    for (let j = 0; j < N_GLOBAL; j++) teacherUnit.push(unit(rowOf(f.teacher_tokens224.array, j, DIM)));
    const rowCache = Object.create(null);

    // rowFor(a): cos(student token a, teacher token j) for every j, the term's s_aj.
    function rowFor(a) {
      if (!rowCache[a]) {
        const z = unit(rowOf(f.student_tokens224.array, a, DIM));
        const r = new Float64Array(N_GLOBAL);
        for (let j = 0; j < N_GLOBAL; j++) r[j] = dot(z, teacherUnit[j]);
        rowCache[a] = r;
      }
      return rowCache[a];
    }

    // ---------------------------------------------------------------- controls

    const controls = core.el('div', { class: 'lab-controls' });
    const tauCtl = slider(core, {
      id: ID + '-tau', label: 'Temperature ' + TAU, min: 0.05, max: 0.5, step: 0.01, value: state.tau,
      format: function (v) { return core.fmt(v, 2); },
      hint: ['The run', RSQUO, 's value is 0.2. The bundle holds the term at 0.1, 0.2 and 0.3 for every anchor of this crop.']
    });
    const tauBtns = TAUS.map(function (t) { return core.el('button', { type: 'button', class: 'btn', id: ID + '-tau-' + String(t).replace('.', '') }, [TAU + ' = ' + t]); });
    const posSelect = core.el('select', { id: ID + '-positive' });
    const posCtl = core.el('div', { class: 'control' }, [core.el('label', { for: ID + '-positive' }, ['The positive followed']), posSelect,
      core.el('p', { class: 'control-hint' }, ['Each positive p has a term of its own: p against all the anchor', RSQUO, 's negatives at once.'])]);
    const shiftCtl = slider(core, {
      id: ID + '-shift', label: 'Toy: move this positive' + RSQUO + 's cosine', min: -0.6, max: 0.3, step: 0.01, value: 0, role: 'positive',
      format: function (v) { return (v > 0 ? '+' : (v < 0 ? MINUS : '')) + core.fmt(Math.abs(v), 2); },
      hint: [core.el('span', { class: 'mark mark-toy' }, ['Toy']), ' What if the student', RSQUO, 's token were less alike to this positive? The real cosine plus this shift, kept between ', MINUS, '1 and 1.']
    });
    const homeBtn = core.el('button', { type: 'button', class: 'btn', id: ID + '-home' }, ['The followed anchor']);
    const anchorOut = core.el('output', { id: ID + '-anchor-out', 'aria-live': 'off' });
    const anchorCtl = core.el('div', { class: 'control' }, [core.el('span', { class: 'control-label' }, ['Anchor']), anchorOut,
      core.el('p', { class: 'control-hint' }, ['Click a patch of the small grid, or use the arrow keys on it, to follow another anchor of the same crop.'])]);
    [tauCtl.root, core.el('div', { class: 'button-row' }, tauBtns), posCtl, shiftCtl.root, anchorCtl, core.el('div', { class: 'button-row' }, [homeBtn])].forEach(function (n) { controls.appendChild(n); });

    // ---------------------------------------------------------------- stage

    const stage = core.el('div', { class: 'lab-stage' });
    const mini = makeCanvas(core, { id: ID + '-grid', w: MSIZE, h: MSIZE, interactive: true });
    const steps = core.el('ol', { class: 'readout', id: ID + '-steps' });
    const shareHolder = core.el('div', { id: ID + '-shares' });
    const table = core.el('div', { class: 'scroll-x', id: ID + '-table' });
    const curveHolder = core.el('div', { id: ID + '-curve' });
    const check = core.el('p', { class: 'small', id: ID + '-check', 'aria-live': 'polite' });
    stage.appendChild(core.el('div', { class: 'stage-row' }, [
      stageCell(core, ['Run 2', RSQUO, 's crop: the anchor, its positives and negatives'], [mini], MSIZE + 10),
      stageCell(core, ['One term, step by step'], [steps], 360)
    ]));
    stage.appendChild(stageCell(core, ['Who holds the denominator: the positive', RSQUO, 's share and each negative', RSQUO, 's'], [shareHolder], SHARE.w));
    stage.appendChild(stageCell(core, ['Every positive of the anchor, and their mean L_i'], [table], 560));
    stage.appendChild(stageCell(core, ['L_i as ', TAU, ' changes (a log scale); the dots are the bundle', RSQUO, 's values'], [curveHolder], CURVE.w));
    stage.appendChild(check);
    body.appendChild(controls);
    body.appendChild(stage);

    // ---------------------------------------------------------------- the computation

    function compute(tau) {
      const a = state.anchor;
      const pos = f.pos[a], neg = f.neg[a];
      let row = rowFor(a);
      if (state.shift !== 0 && pos.length) {
        row = Float64Array.from(row);
        const p = pos[Math.min(state.follow, pos.length - 1)];
        row[p] = clamp(row[p] + state.shift, -1, 1);
      }
      const r = core.rule.infonce(row, pos, neg, tau, { follow: pos.length ? Math.min(state.follow, pos.length - 1) : 0 });
      return { a: a, pos: pos, neg: neg, row: row, r: r, tau: tau };
    }

    // ---------------------------------------------------------------- drawings

    // redraw(): draw() guarded, the one function the photograph's loader calls back.
    const redraw = core.guard(body, function () { draw(); });

    function drawMini(T, c) {
      const ctx = core.fitCanvas(mini, MSIZE, MSIZE);
      ctx.fillStyle = T.paper;
      ctx.fillRect(0, 0, MSIZE, MSIZE);
      const ph = photo(core, f.image, 224, redraw);
      if (ph) ctx.drawImage(ph, 0, 0, MSIZE, MSIZE);
      const followed = c.pos.length ? c.pos[Math.min(state.follow, c.pos.length - 1)] : -1;
      for (let g = 0; g < N_GLOBAL; g++) {
        const x = (g % GRID) * MINI, y = Math.floor(g / GRID) * MINI;
        let fill = core.rgba(T.paper, 0.4);
        if (c.pos.indexOf(g) >= 0) fill = core.rgba(T.positive, 0.7);
        else if (c.neg.indexOf(g) >= 0) fill = core.rgba(T.negative, 0.6);
        ctx.fillStyle = fill;
        ctx.fillRect(x, y, MINI, MINI);
      }
      if (followed >= 0) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = T.ink;
        ctx.strokeRect((followed % GRID) * MINI + 2, Math.floor(followed / GRID) * MINI + 2, MINI - 4, MINI - 4);
      }
      ctx.lineWidth = 3;
      ctx.strokeStyle = T.ink;
      ctx.strokeRect((c.a % GRID) * MINI + 1.5, Math.floor(c.a / GRID) * MINI + 1.5, MINI - 3, MINI - 3);
      mini.setAttribute('aria-label', 'Run 2' + RSQUO + 's crop of the followed photograph. Anchor ' + c.a + ' (' + cellName(c.a, GRID) + '), ' + c.pos.length + ' positives, ' + c.neg.length +
        ' negatives; the positive followed is ' + followed + '. Click a patch or use the arrow keys to follow another anchor.');
    }

    function li(parts) { return core.el('li', null, parts); }

    function drawSteps(c) {
      const r = c.r, tau = c.tau;
      if (!c.pos.length || !c.neg.length) {
        setContent(steps, li([c.neg.length ? 'This anchor has no positive.' : 'This anchor has no negative, so each of its terms is 0 and so is its gradient.']));
        return;
      }
      const fi = Math.min(state.follow, c.pos.length - 1), p = c.pos[fi];
      const sp = c.row[p];
      const ep = Math.exp(sp / tau);
      let sumN = 0, bestN = -Infinity, bestJ = -1;
      c.neg.forEach(function (n) { const v = Math.exp(c.row[n] / tau); sumN += v; if (c.row[n] > bestN) { bestN = c.row[n]; bestJ = n; } });
      const den = ep + sumN, wp = ep / den;
      const fmtC = function (v) { return (v < 0 ? MINUS : '') + sig(core, Math.abs(v), 4); };
      setContent(steps, [
        li(['s_p = cos(student ', c.a, ', teacher ', p, ') = ', fmtC(sp), state.shift ? ' (toy shift included)' : '']),
        li(['s_p / ', TAU, ' = ', fmtC(sp), ' / ', core.fmt(tau, 2), ' = ', fmtC(sp / tau)]),
        li(['e^(s_p / ', TAU, ') = ', sig(core, ep, 5)]),
        li([c.neg.length, ' negatives: ', SIGMA, ' e^(s_n / ', TAU, ') = ', sig(core, sumN, 5), ' (the most alike, patch ', bestJ, ' at ', fmtC(bestN), ', gives ', sig(core, Math.exp(bestN / tau), 4), ')']),
        li(['denominator = ', sig(core, ep, 5), ' + ', sig(core, sumN, 5), ' = ', sig(core, den, 5)]),
        li(['w_p = ', sig(core, ep, 5), ' / ', sig(core, den, 5), ' = ', sig(core, wp, 5), ', the positive', RSQUO, 's share']),
        li(['l_p = ', MINUS, 'log w_p = ', sig(core, -Math.log(wp), 4)]),
        li(['the negatives hold 1 ', MINUS, ' w_p = ', sig(core, 1 - wp, 4), ', so the pull on the student token has the weight (1/', TAU, ')(1 ', MINUS, ' w_p) = ', sig(core, (1 - wp) / tau, 4)])
      ]);
    }

    function drawShares(c) {
      const r = c.r;
      if (!c.pos.length || !c.neg.length) { setContent(shareHolder, core.el('p', { class: 'small' }, ['No denominator to share.'])); return; }
      const fi = Math.min(state.follow, c.pos.length - 1);
      const negShares = c.neg.map(function (n, t) { return { j: n, w: r.shares.negatives[t] }; }).sort(function (x, y) { return y.w - x.w; });
      const bars = [{ j: c.pos[fi], w: r.shares.positive[fi], role: 'positive' }].concat(negShares.map(function (x) { return { j: x.j, w: x.w, role: 'negative' }; }));
      const x0 = 40, top = 28, base = SHARE.h - 34;
      const slot = Math.max(2, Math.min(24, (SHARE.w - x0 - 8) / bars.length));
      const Y = function (w) { return base - (base - top) * w; };
      const svg = svgChart(core, ID + '-share-chart', SHARE.w, SHARE.h, 'The denominator of the term of positive ' + bars[0].j + ': it holds ' + sig(core, bars[0].w, 4) +
        '; the ' + negShares.length + ' negatives hold ' + sig(core, 1 - bars[0].w, 4) + ' together, the largest ' + sig(core, negShares[0].w, 3) + '.');
      const gridG = core.el('g', { class: 'grid' });
      [0.5, 1].forEach(function (v) { gridG.appendChild(line(core, x0, Y(v), SHARE.w - 4, Y(v))); });
      svg.appendChild(gridG);
      [[0, '0'], [0.5, '0.5'], [1, '1']].forEach(function (v) { svg.appendChild(tx(core, x0 - 6, Y(v[0]) + 4, v[1], { 'text-anchor': 'end' })); });
      bars.forEach(function (b, m) {
        const x = x0 + m * slot + 0.5, w = Math.max(1, slot - 1), h = (base - top) * b.w;
        svg.appendChild(withTitle(core, rect(core, x, base - h, w, Math.max(0.5, h), { class: 'bar role-' + b.role }), (b.role === 'positive' ? 'positive ' : 'negative ') + b.j + ': ' + sig(core, b.w, 4)));
      });
      svg.appendChild(core.el('g', { class: 'axis' }, [line(core, x0, base + 0.5, SHARE.w - 4, base + 0.5)]));
      svg.appendChild(tx(core, x0, 16, 'w_p = ' + sig(core, bars[0].w, 4) + ' for positive ' + bars[0].j + '; the negatives, largest first, hold the rest', { class: 'title' }));
      svg.appendChild(tx(core, x0 + (SHARE.w - x0) / 2, SHARE.h - 8, 'the positive, then its ' + negShares.length + ' negatives', { 'text-anchor': 'middle' }));
      setContent(shareHolder, svg);
    }

    function drawTable(c) {
      const r = c.r;
      const rows = c.pos.map(function (p, i) {
        return core.el('tr', { class: i === Math.min(state.follow, c.pos.length - 1) ? 'is-current' : null, style: i === Math.min(state.follow, c.pos.length - 1) ? 'font-weight: 700' : null }, [
          core.el('td', { class: 'num' }, [String(p)]),
          core.el('td', { class: 'num' }, [(c.row[p] < 0 ? MINUS : '') + sig(core, Math.abs(c.row[p]), 4)]),
          core.el('td', { class: 'num' }, [sig(core, r.shares.positive[i], 4)]),
          core.el('td', { class: 'num' }, [sig(core, r.perPositive[i], 4)])
        ]);
      });
      const tbl = core.el('table', { class: 'small' }, [
        core.el('thead', null, [core.el('tr', null, [core.el('th', { class: 'num' }, ['positive p']), core.el('th', { class: 'num' }, ['s_p']), core.el('th', { class: 'num' }, ['w_p']), core.el('th', { class: 'num' }, ['l_p'])])]),
        core.el('tbody', null, rows),
        core.el('tfoot', null, [core.el('tr', null, [core.el('td', { colspan: '3' }, ['L_i, the mean of the ' + c.pos.length + ' terms']), core.el('td', { class: 'num' }, [sig(core, r.loss, 4)])])])
      ]);
      setContent(table, tbl);
    }

    function drawCurve() {
      const a = state.anchor;
      const pts = [];
      for (let t = 0.05; t <= 0.5001; t += 0.01) {
        const c = compute(t);
        pts.push([t, c.r.loss]);
      }
      const x0 = 52, x1 = CURVE.w - 12, top = 18, base = CURVE.h - 34;
      let lo = Infinity, hi = -Infinity;
      pts.forEach(function (p) { if (p[1] > 0) { lo = Math.min(lo, p[1]); hi = Math.max(hi, p[1]); } });
      const bundled = TAUS.map(function (t) { const v = f.infonce && f.infonce.per_anchor ? f.infonce.per_anchor[String(t)][a] : null; return [t, v]; });
      bundled.forEach(function (b) { if (b[1] > 0) { lo = Math.min(lo, b[1]); hi = Math.max(hi, b[1]); } });
      if (!(hi > 0)) { setContent(curveHolder, core.el('p', { class: 'small' }, ['This anchor has no term at any temperature (no negative).'])); return; }
      const e0 = Math.floor(Math.log10(lo)), e1 = Math.ceil(Math.log10(hi));
      const X = function (t) { return x0 + (x1 - x0) * (t - 0.05) / 0.45; };
      const Y = function (v) { return base - (base - top) * (Math.log10(Math.max(v, Math.pow(10, e0))) - e0) / Math.max(1, e1 - e0); };
      const svg = svgChart(core, ID + '-curve-chart', CURVE.w, CURVE.h, 'L_i of anchor ' + a + ' against ' + TAU + ' from 0.05 to 0.5 on a log scale; the bundle' + RSQUO + 's values at 0.1, 0.2 and 0.3: ' +
        bundled.map(function (b) { return b[1] === null ? 'none' : sig(core, b[1], 3); }).join(', ') + '.');
      const gridG = core.el('g', { class: 'grid' });
      const every = e1 - e0 > 6 ? 2 : 1;
      for (let e = e0; e <= e1; e++) {
        gridG.appendChild(line(core, x0, Y(Math.pow(10, e)), x1, Y(Math.pow(10, e))));
        if ((e - e0) % every === 0 || e === e1) {
          svg.appendChild(tx(core, x0 - 6, Y(Math.pow(10, e)) + 4, e === 0 ? '1' : '10' + core.fmtSci(Math.pow(10, e), 0).replace(/^1 \u00D7 10/, ''), { 'text-anchor': 'end' }));
        }
      }
      [0.1, 0.2, 0.3, 0.4, 0.5].forEach(function (t) { gridG.appendChild(line(core, X(t), top, X(t), base)); svg.appendChild(tx(core, X(t), base + 14, core.fmt(t, 1), { 'text-anchor': 'middle' })); });
      svg.appendChild(gridG);
      svg.appendChild(core.el('g', { class: 'axis' }, [line(core, x0, base + 0.5, x1, base + 0.5)]));
      let d = '';
      pts.forEach(function (p, i) { if (p[1] > 0) d += (d ? ' L ' : 'M ') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1); });
      svg.appendChild(path(core, d, { class: 'series' }));
      bundled.forEach(function (b) {
        if (!(b[1] > 0)) return;
        // the bundle's own values, drawn in ink: each is the term of the student against the teacher, so neither
        // network's colour fits
        svg.appendChild(withTitle(core, circle(core, X(b[0]), Y(b[1]), 4, { class: 'dot' }), 'the bundle at ' + TAU + ' ' + b[0] + ': ' + sig(core, b[1], 4)));
      });
      const now = compute(state.tau);
      if (now.r.loss > 0) {
        svg.appendChild(line(core, X(state.tau), top, X(state.tau), base, { style: 'stroke: var(--ink); stroke-dasharray: 4 3' }));
        svg.appendChild(circle(core, X(state.tau), Y(now.r.loss), 5, { style: 'fill: var(--surface); stroke: var(--ink); stroke-width: 2' }));
      }
      svg.appendChild(tx(core, (x0 + x1) / 2, CURVE.h - 6, TAU + ', the temperature', { 'text-anchor': 'middle' }));
      setContent(curveHolder, svg);
    }

    function drawCheck(c) {
      const t = TAUS.filter(function (x) { return Math.abs(x - state.tau) < 1e-9; })[0];
      if (t === undefined) { setContent(check, ['Set ', TAU, ' to 0.1, 0.2 or 0.3 to compare this page with the bundle', RSQUO, 's own value, computed with PyTorch.']); return; }
      const want = f.infonce.per_anchor[String(t)][c.a];
      if (state.shift !== 0) { setContent(check, ['The toy shift is on, so this L_i is the page', RSQUO, 's own. Without it the bundle holds ', sig(core, want, 4), ' for this anchor at ', TAU, ' = ', t, '.']); return; }
      // the followed anchor at the run's temperature: the bundle also holds every share of every denominator
      let shares = '';
      if (c.a === f.anchor && t === RUN.tau && Array.isArray(f.anchor_shares) && f.anchor_shares.length === c.r.shares.rows.length) {
        let worst = 0;
        f.anchor_shares.forEach(function (rowWant, i) {
          rowWant.forEach(function (v, j) { worst = Math.max(worst, Math.abs(v - c.r.shares.rows[i][j])); });
        });
        shares = ' Every share of its ' + c.pos.length + ' denominators matches the bundle' + RSQUO + 's to within ' + sig(core, worst, 2) + '.';
      }
      setContent(check, [core.el('span', { class: 'mark mark-real', 'data-bundle': 'followed.json#infonce' }, ['Real']), ' The bundle holds L_i = ', sig(core, want, 4), ' for anchor ', c.a, ' at ', TAU, ' = ', t,
        '; this page computes ', sig(core, c.r.loss, 4), ' from the same tokens (a difference of ', sig(core, Math.abs(c.r.loss - want), 2), ').', shares]);
    }

    function syncControls(c) {
      tauCtl.show(core.fmt(state.tau, 2) + (Math.abs(state.tau - RUN.tau) < 1e-9 ? ' (the run' + RSQUO + 's)' : ''));
      setContent(anchorOut, 'patch ' + state.anchor + ', ' + cellName(state.anchor, GRID));
      if (optionsFor !== state.anchor) {
        while (posSelect.firstChild) posSelect.removeChild(posSelect.firstChild);
        c.pos.forEach(function (p, i) { posSelect.appendChild(core.el('option', { value: String(i) }, ['patch ' + p + (i < f.k ? ' (top k)' : ' (threshold)')])); });
        optionsFor = state.anchor;
      }
      posSelect.value = String(Math.min(state.follow, Math.max(0, c.pos.length - 1)));
      shiftCtl.show((state.shift > 0 ? '+' : (state.shift < 0 ? MINUS : '')) + core.fmt(Math.abs(state.shift), 2));
      homeBtn.disabled = state.anchor === f.anchor;
    }

    function draw() {
      const T = core.theme();
      const c = compute(state.tau);
      syncControls(c);
      drawMini(T, c);
      drawSteps(c);
      drawShares(c);
      drawTable(c);
      drawCurve();
      drawCheck(c);
      if (root.Boot && typeof root.Boot.refreshTerms === 'function') root.Boot.refreshTerms();
    }

    // ---------------------------------------------------------------- events

    tauCtl.input.addEventListener('input', core.guard(body, function () { state.tau = tauCtl.get(); draw(); }));
    tauBtns.forEach(function (b, i) { b.addEventListener('click', core.guard(body, function () { state.tau = TAUS[i]; tauCtl.set(TAUS[i]); draw(); })); });
    posSelect.addEventListener('change', core.guard(body, function () { state.follow = Number(posSelect.value) || 0; draw(); }));
    shiftCtl.input.addEventListener('input', core.guard(body, function () { state.shift = shiftCtl.get(); draw(); }));
    homeBtn.addEventListener('click', core.guard(body, function () { state.anchor = f.anchor; state.follow = 0; draw(); }));
    mini.addEventListener('click', core.guard(body, function (e) {
      const p = core.canvasPoint(mini, e, MSIZE, MSIZE);
      state.anchor = clamp(Math.floor(p.y / MINI), 0, GRID - 1) * GRID + clamp(Math.floor(p.x / MINI), 0, GRID - 1);
      state.follow = 0;
      draw();
    }));
    mini.addEventListener('keydown', core.guard(body, function (e) {
      const next = moveOnGrid(state.anchor, GRID, e.key);
      if (next < 0) return;
      e.preventDefault();
      state.anchor = next;
      state.follow = 0;
      draw();
    }));
    core.on('theme-changed', core.guard(body, draw));

    draw();
  });

  // ================================================================== Lab 5C: pull and push

  Labs.register('lab-5c-pull-push', function mount(body, core, bundles) {
    bundles = bundles || core.bundles || {};
    const ID = 'lab-5c-pull-push';
    const f = bundles['followed.json'] || bundles.followed;
    if (!f || !f.student_tokens224 || !f.teacher_tokens224) throw new Error('followed.json did not arrive');
    const MAP = { w: 520, h: 420, pad: 30 };
    const ETA = '\u03B7';
    const proj = pca2(f.teacher_tokens224.array, N_GLOBAL, DIM);
    const teacherUnit = [];
    for (let j = 0; j < N_GLOBAL; j++) teacherUnit.push(unit(rowOf(f.teacher_tokens224.array, j, DIM)));
    // trail: the points kept so far, the real token first; eta: how far the token now sits along minus the gradient of
    // the last kept point (0 at load, so the lab starts at the real token with the real gradient).
    const state = { anchor: f.anchor, tau: RUN.tau, eta: 0, trail: [], parts: true };

    // start(): the anchor's own student token (length 1) as the only point of the trail.
    function start() {
      state.trail = [unit(rowOf(f.student_tokens224.array, state.anchor, DIM))];
    }

    // forces(z): the anchor's term at the token z and its gradient, with each partner's part of the step against the
    // gradient: a positive's part (1/tau)(1/|P|)(1 - a_p) times its teacher token's tangent part at z (towards it); a
    // negative's part minus (1/tau)(1/|P|) sum_p a_pn times its tangent part (away from it). The parts add up to minus
    // the gradient.
    function forces(z) {
      const a = state.anchor, tau = state.tau;
      const pos = f.pos[a], neg = f.neg[a];
      const row = new Float64Array(N_GLOBAL);
      for (let j = 0; j < N_GLOBAL; j++) row[j] = dot(z, teacherUnit[j]);
      const r = core.rule.infonce(row, pos, neg, tau);
      const g = core.rule.gradient(z, f.teacher_tokens224.array, pos, neg, tau);
      const tangent = function (t) { const s = dot(z, t); const out = new Float64Array(DIM); for (let c = 0; c < DIM; c++) out[c] = t[c] - s * z[c]; return out; };
      const parts = [];
      const P = pos.length;
      const negWeight = new Float64Array(neg.length);
      pos.forEach(function (p, i) {
        const ap = r.shares.rows[i][0];
        const w = (1 - ap) / (tau * P);
        const tp = tangent(teacherUnit[p]);
        const v = new Float64Array(DIM);
        for (let c = 0; c < DIM; c++) v[c] = w * tp[c];
        parts.push({ j: p, role: 'positive', weight: w, v: v });
        neg.forEach(function (n, t) { negWeight[t] += r.shares.rows[i][t + 1] / (tau * P); });
      });
      neg.forEach(function (n, t) {
        const tn = tangent(teacherUnit[n]);
        const v = new Float64Array(DIM);
        for (let c = 0; c < DIM; c++) v[c] = -negWeight[t] * tn[c];
        parts.push({ j: n, role: 'negative', weight: negWeight[t], v: v });
      });
      return { r: r, g: g, parts: parts, pos: pos, neg: neg };
    }

    // moved(z, eta): z moved by eta along minus the gradient at z, scaled back to length 1 (z itself at eta 0).
    function moved(z, eta) {
      if (!(eta > 0)) return z;
      const g = forces(z).g.grad;
      const next = new Float64Array(DIM);
      for (let c = 0; c < DIM; c++) next[c] = z[c] - eta * g[c];
      return unit(next);
    }

    // ---------------------------------------------------------------- controls

    const controls = core.el('div', { class: 'lab-controls' });
    const tauCtl = slider(core, {
      id: ID + '-tau', label: 'Temperature ' + TAU, min: 0.05, max: 0.5, step: 0.01, value: state.tau,
      format: function (v) { return core.fmt(v, 2); }, hint: ['The run', RSQUO, 's value: 0.2.']
    });
    const etaCtl = slider(core, {
      id: ID + '-eta', label: 'Toy step: move the token by ' + ETA, min: 0, max: 3, step: 0.05, value: state.eta, role: 'student',
      format: function (v) { return core.fmt(v, 2); },
      hint: [core.el('span', { class: 'mark mark-toy' }, ['Toy']), ' Drag to move the student', RSQUO, 's token along minus the gradient: z becomes z ', MINUS, ' ', ETA,
        ' g, scaled back to length 1, and the term and the arrows are computed again there. The real run moves the weights with AdamW instead.']
    });
    const stepBtn = core.el('button', { type: 'button', class: 'btn btn-primary', id: ID + '-step' }, ['Keep this step']);
    const tenBtn = core.el('button', { type: 'button', class: 'btn', id: ID + '-ten' }, ['Ten more like it']);
    const resetBtn = core.el('button', { type: 'button', class: 'btn', id: ID + '-reset' }, ['Back to the real token']);
    const stepHint = core.el('p', { class: 'control-hint' }, ['Keep this step makes the moved token the new start and sets the slider back to 0, so the next move follows the gradient there; Ten more like it makes ten such moves in a row.']);
    const anchorCtl = slider(core, {
      id: ID + '-anchor', label: 'Anchor', min: 0, max: N_GLOBAL - 1, step: 1, value: state.anchor,
      format: function (v) { return 'patch ' + v; },
      hint: ['The followed anchor is 34, the bulldog', RSQUO, 's nose. Its gradient is checked against the bundle', RSQUO, 's own, computed with PyTorch.']
    });
    const partsCtl = toggle(core, { id: ID + '-parts', label: 'Draw each partner' + RSQUO + 's arrow', checked: true });
    [tauCtl.root, etaCtl.root, core.el('div', { class: 'button-row' }, [stepBtn, tenBtn, resetBtn]), stepHint, anchorCtl.root, core.el('div', { class: 'toggle-row' }, [partsCtl.root])].forEach(function (n) { controls.appendChild(n); });

    // ---------------------------------------------------------------- stage

    const stage = core.el('div', { class: 'lab-stage' });
    const mapHolder = core.el('div', { id: ID + '-map' });
    const read = readout(core, ID + '-readout', [['loss', 'The term L_i'], ['grad', 'The gradient'], ['real', 'Against the bundle'], ['share', 'Negatives' + RSQUO + ' share'], ['moved', 'The token moved'], ['proj', 'The projection']]);
    stage.appendChild(stageCell(core, ['Run 2', RSQUO, 's 196 teacher tokens, projected onto their two main directions; the arrows show where the term moves the student', RSQUO, 's token'], [mapHolder, core.el('ul', { class: 'legend' }, [
      core.el('li', { class: 'role-student' }, ['the student' + RSQUO + 's token of the anchor, and its path']),
      core.el('li', { class: 'role-teacher' }, ['the teacher' + RSQUO + 's token of the anchor']),
      core.el('li', { class: 'role-positive' }, ['positives, and their pulls']),
      core.el('li', { class: 'role-negative' }, ['negatives, and their pushes']),
      core.el('li', { class: 'role-ignored' }, ['the other tokens'])
    ])], MAP.w));
    stage.appendChild(read.root);
    body.appendChild(controls);
    body.appendChild(stage);

    // ---------------------------------------------------------------- drawing

    function draw() {
      const base = state.trail[state.trail.length - 1];
      const zNowVec = moved(base, state.eta);
      const fo = forces(zNowVec);
      const a = state.anchor;
      // the frame: every teacher token, the kept path and the token now
      const pts = proj.points;
      const keptPts = state.trail.map(function (z) { return project(proj, z); });
      const zNow = project(proj, zNowVec);
      let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
      pts.concat(keptPts, [zNow]).forEach(function (p) { xmin = Math.min(xmin, p[0]); xmax = Math.max(xmax, p[0]); ymin = Math.min(ymin, p[1]); ymax = Math.max(ymax, p[1]); });
      const span = Math.max(xmax - xmin, ymax - ymin) || 1;
      const cx = (xmin + xmax) / 2, cy = (ymin + ymax) / 2;
      const inner = Math.min(MAP.w, MAP.h) - 2 * MAP.pad;
      const X = function (x) { return MAP.w / 2 + (x - cx) * inner / span; };
      const Y = function (y) { return MAP.h / 2 - (y - cy) * inner / span; };
      const total2 = projectDirection(proj, fo.g.grad);
      const len2 = Math.sqrt(total2[0] * total2[0] + total2[1] * total2[1]);
      // scale: the sum arrow at 0.28 of the frame's span, shrunk for every arrow together when one arrow's tip would
      // leave the frame (after a far toy step, or for an anchor near the frame's edge), so that the arrows keep their
      // proportions and the label below reports the scale in use
      let scale = len2 > 0 ? 0.28 * span / len2 : 1;
      const partVecs = state.parts ? fo.parts.map(function (pt) { return projectDirection(proj, pt.v); }) : [];
      // room(from, vec): the largest scale at which the arrow from `from` along `vec` ends 6 px inside the frame
      const room = function (from, vec) {
        const x1 = X(from[0]), y1 = Y(from[1]), k = inner / span, m = 6;
        let s = Infinity;
        if (vec[0] > 0) s = Math.min(s, (MAP.w - m - x1) / (vec[0] * k));
        if (vec[0] < 0) s = Math.min(s, (m - x1) / (vec[0] * k));
        if (vec[1] > 0) s = Math.min(s, (y1 - m) / (vec[1] * k));
        if (vec[1] < 0) s = Math.min(s, (MAP.h - m - y1) / (-vec[1] * k));
        return s;
      };
      partVecs.concat([[-total2[0], -total2[1]]]).forEach(function (v) { const s = room(zNow, v); if (s > 0 && s < scale) scale = s; });
      const svg = svgChart(core, ID + '-map-chart', MAP.w, MAP.h, 'A 2-D projection of run 2' + RSQUO + 's 196 teacher tokens of the followed crop. Anchor ' + a + ': ' + fo.pos.length + ' positives, ' + fo.neg.length +
        ' negatives. The term L_i is ' + sig(core, fo.r.loss, 4) + ' and the gradient' + RSQUO + 's length ' + sig(core, fo.g.norms.grad, 4) + '.');
      svg.appendChild(rect(core, 0.5, 0.5, MAP.w - 1, MAP.h - 1, { style: 'fill: none; stroke: var(--line)' }));
      const isPos = {}, isNeg = {};
      fo.pos.forEach(function (j) { isPos[j] = true; });
      fo.neg.forEach(function (j) { isNeg[j] = true; });
      const dots = core.el('g');
      pts.forEach(function (p, j) {
        if (isPos[j] || isNeg[j] || j === a) return;
        dots.appendChild(circle(core, X(p[0]), Y(p[1]), 2.2, { class: 'dot role-ignored', style: 'fill-opacity: 0.6' }));
      });
      svg.appendChild(dots);
      // arrow(from, vec, role, width, title): an arrow from a point along a 2-D vector, enlarged by `scale`, with its head.
      const arrow = function (from, vec, role, width, title) {
        const x1 = X(from[0]), y1 = Y(from[1]);
        const x2 = x1 + vec[0] * scale * inner / span, y2 = y1 - vec[1] * scale * inner / span;
        const dx = x2 - x1, dy = y2 - y1, l = Math.sqrt(dx * dx + dy * dy);
        const g = core.el('g', { class: 'role-' + role });
        if (l < 0.5) return g;
        const ux = dx / l, uy = dy / l, hs = Math.min(8, 2 + l * 0.35);
        g.appendChild(line(core, x1, y1, x2 - ux * hs * 0.6, y2 - uy * hs * 0.6, { style: 'stroke: var(--role); stroke-width: ' + width + '; stroke-linecap: round' }));
        g.appendChild(path(core, 'M ' + x2.toFixed(1) + ' ' + y2.toFixed(1) + ' L ' + (x2 - ux * hs - uy * hs * 0.5).toFixed(1) + ' ' + (y2 - uy * hs + ux * hs * 0.5).toFixed(1) +
          ' L ' + (x2 - ux * hs + uy * hs * 0.5).toFixed(1) + ' ' + (y2 - uy * hs - ux * hs * 0.5).toFixed(1) + ' Z', { style: 'fill: var(--role)' }));
        if (title) withTitle(core, g, title);
        return g;
      };
      fo.neg.forEach(function (j) { const p = pts[j]; svg.appendChild(withTitle(core, circle(core, X(p[0]), Y(p[1]), 3.6, { class: 'dot role-negative' }), 'negative ' + j)); });
      fo.pos.forEach(function (j) { const p = pts[j]; svg.appendChild(withTitle(core, circle(core, X(p[0]), Y(p[1]), 4.2, { class: 'dot role-positive' }), 'positive ' + j)); });
      const ta = pts[a];
      svg.appendChild(withTitle(core, circle(core, X(ta[0]), Y(ta[1]), 6, { class: 'role-teacher', style: 'fill: none; stroke: var(--role); stroke-width: 2.5' }), 'the teacher' + RSQUO + 's token of anchor ' + a));
      const pathPts = keptPts.concat(state.eta > 0 ? [zNow] : []);
      if (pathPts.length > 1) {
        let d = '';
        pathPts.forEach(function (p, i) { d += (i ? ' L ' : 'M ') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1); });
        svg.appendChild(path(core, d, { class: 'role-student', style: 'fill: none; stroke: var(--role); stroke-width: 1.5; stroke-dasharray: 4 3' }));
        keptPts.forEach(function (p) { svg.appendChild(circle(core, X(p[0]), Y(p[1]), 2.5, { class: 'dot role-student' })); });
      }
      if (state.parts) {
        fo.parts.forEach(function (pt, i) {
          svg.appendChild(arrow(zNow, partVecs[i], pt.role, 1.2, (pt.role === 'positive' ? 'pull towards ' : 'push away from ') + pt.j + ', weight ' + sig(core, pt.weight, 3)));
        });
      }
      svg.appendChild(arrow(zNow, [-total2[0], -total2[1]], 'student', 3, 'the step against the gradient, the sum of every pull and push'));
      svg.appendChild(withTitle(core, circle(core, X(zNow[0]), Y(zNow[1]), 6, { class: 'dot role-student', style: 'stroke: var(--surface); stroke-width: 2' }), 'the student' + RSQUO + 's token of anchor ' + a));
      svg.appendChild(tx(core, 10, 18, 'arrows drawn ' + sig(core, scale, 2) + ' times the move at ' + ETA + ' = 1; the thick green arrow is their sum', { class: 'title' }));
      setContent(mapHolder, svg);
      // readouts
      const atStart = state.trail.length === 1 && !(state.eta > 0);
      const realLoss = atStart ? fo.r.loss : forces(state.trail[0]).r.loss;
      const kept = state.trail.length - 1;
      read.set('loss', sig(core, fo.r.loss, 4) + (atStart ? ' at the real token, ' + TAU + ' = ' + core.fmt(state.tau, 2) :
        ' here, against ' + sig(core, realLoss, 4) + ' at the real token' + (kept ? ' (' + plural(kept, 'step', 'steps') + ' kept)' : '')));
      read.set('grad', 'length ' + sig(core, fo.g.norms.grad, 4) + ': the pull part ' + sig(core, fo.g.norms.pull, 4) + ', the push part ' + sig(core, fo.g.norms.push, 4));
      if (a === f.anchor && atStart && Math.abs(state.tau - RUN.tau) < 1e-9) {
        let worst = 0;
        for (let c = 0; c < DIM; c++) worst = Math.max(worst, Math.abs(fo.g.grad[c] - f.anchor_grad.array[c]));
        read.set('real', [core.el('span', { class: 'mark mark-real', 'data-bundle': 'followed.json#anchor_grad' }, ['Real']), ' PyTorch' + RSQUO + 's autograd gave a gradient of length ' + sig(core, norm(f.anchor_grad.array), 4) +
          '; this page' + RSQUO + 's differs from it by at most ' + sig(core, worst, 2) + ' in any of the 384 numbers.']);
      } else {
        read.set('real', 'The bundle holds the gradient of anchor ' + f.anchor + ' at its real token and ' + TAU + ' = 0.2; go back to them to compare.');
      }
      let share = 0;
      fo.r.shares.positive.forEach(function (w) { share += (1 - w) / Math.max(1, fo.pos.length); });
      read.set('share', sig(core, share, 4) + ', the mean of 1 ' + MINUS + ' w_p over the ' + fo.pos.length + ' positives');
      const angle = Math.acos(clamp(dot(state.trail[0], zNowVec), -1, 1)) * 180 / Math.PI;
      read.set('moved', core.fmt(angle, 2) + ' degrees on the sphere since the real token');
      read.set('proj', 'the two directions hold ' + core.fmt(100 * proj.explained[0], 1) + ' % and ' + core.fmt(100 * proj.explained[1], 1) + ' % of the tokens' + RSQUO + ' spread; the rest of the 384 directions is flattened away');
      tauCtl.show(core.fmt(state.tau, 2) + (Math.abs(state.tau - RUN.tau) < 1e-9 ? ' (the run' + RSQUO + 's)' : ''));
      etaCtl.show(core.fmt(state.eta, 2));
      anchorCtl.show('patch ' + state.anchor + (state.anchor === f.anchor ? ' (followed)' : ''));
      stepBtn.disabled = !(state.eta > 0);
      tenBtn.disabled = !(state.eta > 0);
      if (root.Boot && typeof root.Boot.refreshTerms === 'function') root.Boot.refreshTerms();
    }

    // keep(n): n moves of the current size, each from the last kept point, kept in the trail; the slider goes back to 0.
    function keep(n) {
      if (!(state.eta > 0)) return;
      for (let i = 0; i < n; i++) state.trail.push(moved(state.trail[state.trail.length - 1], state.eta));
      state.eta = 0;
      etaCtl.set(0);
    }

    tauCtl.input.addEventListener('input', core.guard(body, function () { state.tau = tauCtl.get(); draw(); }));
    etaCtl.input.addEventListener('input', core.guard(body, function () { state.eta = etaCtl.get(); draw(); }));
    stepBtn.addEventListener('click', core.guard(body, function () { keep(1); draw(); }));
    tenBtn.addEventListener('click', core.guard(body, function () { keep(10); draw(); }));
    resetBtn.addEventListener('click', core.guard(body, function () { start(); state.eta = 0; etaCtl.set(0); draw(); }));
    anchorCtl.input.addEventListener('input', core.guard(body, function () { state.anchor = anchorCtl.get(); start(); draw(); }));
    partsCtl.input.addEventListener('change', core.guard(body, function () { state.parts = partsCtl.get(); draw(); }));
    core.on('theme-changed', core.guard(body, draw));

    start();
    draw();
  });

  // ================================================================== Lab 5E: the real telemetry

  // The fields of a progress line that the lab draws: the name the reader sees, what it measures and which way is good.
  const FIELD_INFO = [
    ['con_loss', 'L_con, the contrastive term', 'The mean of every anchor' + RSQUO + 's InfoNCE term over the ten crops. It falls as each student token moves towards its positives and away from its negatives.'],
    ['global_loss', 'L_global, DINO' + RSQUO + 's term', 'The cross-entropy between the teacher' + RSQUO + 's and the student' + RSQUO + 's class outputs over the 18 crop pairs. The rule must not make it rise: a stop rule watches it.'],
    ['loss', 'L, the total', 'L_global plus ' + LAMBDA + ' L_con, with ' + LAMBDA + ' = 1.'],
    ['con_neg_share_mean', 'Negatives' + RSQUO + ' share', 'How much of each denominator the negatives hold, 1 ' + MINUS + ' w_p, averaged over the positive pairs. It is the weight of every pull and push; near 0 the term has stopped working. A stop rule watches the line at 0.02.'],
    ['con_margin_mean', 'Margin', 'A positive' + RSQUO + 's cosine minus the anchor' + RSQUO + 's most alike negative' + RSQUO + 's, averaged. It grows as positives and negatives move apart.'],
    ['con_pos_degree_mean', 'Positives per anchor', 'The mean size of P(i) over every anchor of every crop. The floor of k keeps it at least 8 on the global crops and 4 on the local ones.'],
    ['con_pos_from_threshold_share', 'Share added by the threshold', 'The share of positive pairs beyond their anchor' + RSQUO + 's top k: the part that the crop-wide threshold adds.'],
    ['con_neg_count_mean', 'Negatives per anchor', 'The mean size of N(i).'],
    ['con_tau_hi_mean', TAU + '_hi', 'The crops' + RSQUO + ' high threshold, averaged over the crops. It rises when the crops' + RSQUO + ' most alike pairs grow more alike.'],
    ['con_tau_lo_mean', TAU + '_lo', 'The crops' + RSQUO + ' low threshold, averaged over the crops. It falls when the least alike pairs grow less alike, as the token space spreads.'],
    ['con_window_share', 'Positives inside the window', 'The share of positive pairs inside SelfPatch' + RSQUO + 's wrapped 3 ' + TIMES + ' 3 window: how local the positives are.'],
    ['con_cap_cuts_pos', 'Cap cuts, positives', 'Anchors of the step whose positives the cap of 24 cut.'],
    ['con_cap_cuts_neg', 'Cap cuts, negatives', 'Anchors of the step whose negatives the cap of 48 cut.'],
    ['con_neg_empty_count', 'Anchors without a negative', 'Anchors of the step left without any negative: their terms are 0.'],
    ['lr_backbone', 'Learning rate, backbone', 'The step size of AdamW for the backbone: a straight warm-up from 0 at step 1 to its peak at step 4,620, then a cosine down. The rate already rises through epoch 0, the shaded band, but there the trainer discards the backbone' + RSQUO + 's gradients, so the backbone first moves at step 463.'],
    ['lr_heads', 'Learning rate, heads', 'The same schedule for the heads, ten times larger.'],
    ['teacher_momentum', 'Teacher momentum', 'How much of itself the teacher keeps at each step, rising on a cosine towards 1.'],
    ['weight_decay', 'Weight decay', 'AdamW' + RSQUO + 's pull of every decayed weight towards 0, rising on a cosine.'],
    ['teacher_entropy', 'Teacher entropy', 'How spread the teacher' + RSQUO + 's class distribution is on the global crops (diagnostic).'],
    ['teacher_student_kl', 'Teacher to student KL', 'How far the student' + RSQUO + 's class distribution is from the teacher' + RSQUO + 's (diagnostic).'],
    ['gradient_total_preclip_norm', 'Gradient norm', 'The length of the whole gradient before clipping (diagnostic).']
  ];
  const RUN_STYLE = { con2: { name: 'run 2', dash: null, width: 2.2 }, con1: { name: 'run 1', dash: '7 4', width: 1.6 }, con3: { name: 'run 3', dash: '2 3', width: 1.6 } };

  Labs.register('lab-5e-telemetry', function mount(body, core, bundles) {
    bundles = bundles || core.bundles || {};
    const ID = 'lab-5e-telemetry';
    const t = bundles['telemetry.json'] || bundles.telemetry;
    if (!t || !t.runs || !t.runs.con2) throw new Error('telemetry.json did not arrive');
    const CH = { w: 640, h: 280 };
    const fields = FIELD_INFO.filter(function (fi) { return Array.isArray(t.runs.con2[fi[0]]); });
    const steps = t.runs.con2.step;
    const state = { field: 'con_loss', runs: { con2: true, con1: false, con3: false }, at: steps.length - 1, log: false };

    // ---------------------------------------------------------------- controls

    const controls = core.el('div', { class: 'lab-controls' });
    const fieldSelect = core.el('select', { id: ID + '-field' }, fields.map(function (fi) { return core.el('option', { value: fi[0] }, [fi[1]]); }));
    fieldSelect.value = state.field;
    const fieldCtl = core.el('div', { class: 'control' }, [core.el('label', { for: ID + '-field' }, ['Field of the progress line']), fieldSelect]);
    const runToggles = ['con2', 'con1', 'con3'].map(function (r) {
      return toggle(core, { id: ID + '-' + r, label: RUN_STYLE[r].name + (r === 'con2' ? ' (the DINO start)' : (r === 'con1' ? ' (the released start)' : ' (through the head)')), checked: state.runs[r] });
    });
    const runsCtl = core.el('div', { class: 'control-group' }, [core.el('p', { class: 'control-group-title' }, ['Runs']), core.el('div', { class: 'toggle-row' }, runToggles.map(function (x) { return x.root; }))]);
    const logToggle = toggle(core, { id: ID + '-log', label: 'Log scale', checked: false });
    const scrub = slider(core, {
      id: ID + '-step', label: 'Step', min: 0, max: steps.length - 1, step: 1, value: state.at,
      format: function (i) { return 'step ' + core.fmt(steps[i], 0); },
      hint: ['Sampled steps: the first, every tenth and the first of every epoch, ' + core.fmt(steps.length, 0) + ' of the ' + core.fmt(t.total_steps, 0) + '.']
    });
    const jumps = [1, 463, 4620, 9240].map(function (s) { return core.el('button', { type: 'button', class: 'btn', id: ID + '-jump-' + s }, ['step ' + core.fmt(s, 0)]); });
    [fieldCtl, runsCtl, core.el('div', { class: 'toggle-row' }, [logToggle.root]), scrub.root, core.el('div', { class: 'button-row' }, jumps)].forEach(function (n) { controls.appendChild(n); });

    // ---------------------------------------------------------------- stage

    const stage = core.el('div', { class: 'lab-stage' });
    const chartHolder = core.el('div', { id: ID + '-chart' });
    const meaning = core.el('p', { id: ID + '-meaning' });
    const at = readout(core, ID + '-at', [['step', 'Step'], ['values', 'Values']]);
    const legend = core.el('dl', { class: 'readout', id: ID + '-legend' });
    fields.forEach(function (fi) { legend.appendChild(core.el('dt', null, [fi[1]])); legend.appendChild(core.el('dd', null, [fi[0] + ': ' + fi[2]])); });
    stage.appendChild(stageCell(core, ['The chosen field over the 20 epochs'], [chartHolder], CH.w));
    stage.appendChild(meaning);
    stage.appendChild(at.root);
    stage.appendChild(core.el('details', null, [core.el('summary', null, ['What every field of the progress line means']), legend]));
    body.appendChild(controls);
    body.appendChild(stage);

    function infoOf(field) { return fields.filter(function (fi) { return fi[0] === field; })[0]; }
    function fmtV(v) {
      if (v === null || v === undefined || v !== v) return 'none';
      if (typeof v === 'boolean') return v ? 'yes' : 'no';
      const a = Math.abs(v);
      if (a !== 0 && a < 1e-3) return (v < 0 ? MINUS : '') + core.fmtSci(a, 2);
      if (a >= 1000) return (v < 0 ? MINUS : '') + core.fmt(a, 0);
      return (v < 0 ? MINUS : '') + core.fmt(a, 4);
    }

    function draw() {
      const info = infoOf(state.field);
      const runs = ['con1', 'con3', 'con2'].filter(function (r) { return state.runs[r] && t.runs[r]; });
      const x0 = 62, x1 = CH.w - 16, top = 22, base = CH.h - 40;
      let lo = Infinity, hi = -Infinity;
      const positiveOnly = runs.every(function (r) { return t.runs[r][state.field].every(function (v) { return v === null || v > 0; }); });
      const useLog = state.log && positiveOnly;
      runs.forEach(function (r) { t.runs[r][state.field].forEach(function (v) { if (v !== null && v === v) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }); });
      const extra = [];
      if (state.field === 'con_neg_share_mean') extra.push(0.02);
      if (state.field === 'global_loss') runs.forEach(function (r) { const m = t.runs[r].epoch_means && t.runs[r].epoch_means.global_loss ? t.runs[r].epoch_means.global_loss[0] : null; if (m) extra.push(1.2 * m); });
      extra.forEach(function (v) { lo = Math.min(lo, v); hi = Math.max(hi, v); });
      if (!(hi >= lo)) { lo = 0; hi = 1; }
      if (hi === lo) { hi = lo + Math.max(1e-9, Math.abs(lo) * 0.1) || 1; }
      // the y axis: whole decades on a log scale, otherwise steps of 1, 2 or 5 times a power of ten
      const tickValues = [];
      let ylo, yhi, tickDigits = null;
      if (useLog) {
        ylo = Math.floor(Math.log10(lo));
        yhi = Math.ceil(Math.log10(hi));
        if (yhi === ylo) yhi = ylo + 1;
        for (let e = ylo; e <= yhi; e++) tickValues.push(Math.pow(10, e));
      } else {
        const rough = (hi - lo) / 4;
        const mag = Math.pow(10, Math.floor(Math.log10(rough)));
        const unitStep = rough / mag;
        const step = (unitStep < 1.5 ? 1 : (unitStep < 3 ? 2 : (unitStep < 7 ? 5 : 10))) * mag;
        ylo = Math.floor(lo / step + 1e-9) * step;
        yhi = Math.ceil(hi / step - 1e-9) * step;
        for (let v = ylo; v <= yhi + step / 2; v += step) tickValues.push(Math.abs(v) < step / 1e6 ? 0 : v);
        if (step >= 1e-3) tickDigits = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
      }
      // tickText(v): a tick's label, with as many decimals as the step needs (powers of ten for the tiny ones).
      const tickText = function (v) { return tickDigits === null ? fmtV(v) : (v < 0 ? MINUS : '') + core.fmt(Math.abs(v), tickDigits); };
      const X = function (s) { return x0 + (x1 - x0) * (s - 1) / (t.total_steps - 1); };
      const Y = function (v) { const u = useLog ? Math.log10(Math.max(v, 1e-300)) : v; return base - (base - top) * (u - ylo) / ((yhi - ylo) || 1); };
      const svg = svgChart(core, ID + '-svg', CH.w, CH.h, info[1] + ' over the ' + core.fmt(t.total_steps, 0) + ' steps of ' + runs.map(function (r) { return RUN_STYLE[r].name; }).join(', ') + '.');
      svg.appendChild(withTitle(core, rect(core, X(1), top, X(t.steps_per_epoch + 1) - X(1), base - top, { class: 'band' }), 'epoch 0: the backbone is frozen'));
      svg.appendChild(tx(core, X(1) + 4, top + 12, 'epoch 0: backbone frozen', { style: 'font-size: 10px' }));
      const gridG = core.el('g', { class: 'grid' });
      for (let e = 0; e < t.epochs; e += 5) {
        const s = e * t.steps_per_epoch + 1;
        gridG.appendChild(line(core, X(s), top, X(s), base));
        svg.appendChild(tx(core, X(s), base + 14, 'epoch ' + e, { 'text-anchor': e === 0 ? 'start' : 'middle' }));
      }
      gridG.appendChild(line(core, X(t.total_steps), top, X(t.total_steps), base));
      svg.appendChild(tx(core, X(t.total_steps), base + 14, 'the end', { 'text-anchor': 'end' }));
      tickValues.forEach(function (v) {
        gridG.appendChild(line(core, x0, Y(v), x1, Y(v)));
        svg.appendChild(tx(core, x0 - 6, Y(v) + 4, tickText(v), { 'text-anchor': 'end' }));
      });
      svg.appendChild(gridG);
      svg.appendChild(core.el('g', { class: 'axis' }, [line(core, x0, base + 0.5, x1, base + 0.5), line(core, x0 - 0.5, top, x0 - 0.5, base)]));
      extra.forEach(function (v) {
        svg.appendChild(line(core, x0, Y(v), x1, Y(v), { style: 'stroke: var(--ink); stroke-width: 1; stroke-dasharray: 6 4' }));
        svg.appendChild(tx(core, x1 - 4, Y(v) - 4, 'stop line ' + fmtV(v), { 'text-anchor': 'end', style: HALO }));
      });
      runs.forEach(function (r) {
        const st = RUN_STYLE[r];
        let d = '';
        t.runs[r].step.forEach(function (s, i) {
          const v = t.runs[r][state.field][i];
          if (v === null || v !== v || (useLog && !(v > 0))) return;
          d += (d ? ' L ' : 'M ') + X(s).toFixed(1) + ' ' + Y(v).toFixed(1);
        });
        svg.appendChild(path(core, d, { class: 'series', style: 'stroke: var(--ink); stroke-width: ' + st.width + (st.dash ? '; stroke-dasharray: ' + st.dash : '') + (r === 'con2' ? '' : '; stroke-opacity: 0.75') }));
        const last = t.runs[r][state.field][t.runs[r][state.field].length - 1];
        if (last !== null && last === last) svg.appendChild(tx(core, x1 - 2, Y(last) - 5, st.name, { 'text-anchor': 'end', class: 'title', style: HALO }));
      });
      const s = steps[state.at];
      svg.appendChild(line(core, X(s), top, X(s), base, { style: 'stroke: var(--ink); stroke-width: 1.5' }));
      runs.forEach(function (r) {
        const v = t.runs[r][state.field][state.at];
        if (v !== null && v === v && !(useLog && !(v > 0))) svg.appendChild(circle(core, X(s), Y(v), 4, { style: 'fill: var(--surface); stroke: var(--ink); stroke-width: 2' }));
      });
      svg.appendChild(tx(core, (x0 + x1) / 2, CH.h - 6, 'optimiser step, 1 to ' + core.fmt(t.total_steps, 0), { 'text-anchor': 'middle' }));
      setContent(chartHolder, svg);
      setContent(meaning, [core.el('strong', null, [info[1]]), ' (', info[0], '): ', info[2], useLog || !state.log ? '' : ' This field has values at or below 0, so it stays on a linear scale.']);
      const ep = t.runs.con2.epoch[state.at];
      at.set('step', core.fmt(s, 0) + ', epoch ' + ep + (t.runs.con2.backbone_frozen && t.runs.con2.backbone_frozen[state.at] ? ', the backbone frozen' : ', the backbone training'));
      at.set('values', runs.slice().reverse().map(function (r) { return RUN_STYLE[r].name + ' ' + fmtV(t.runs[r][state.field][state.at]); }).join('; ') || 'no run chosen');
      scrub.show('step ' + core.fmt(s, 0));
    }

    fieldSelect.addEventListener('change', core.guard(body, function () { state.field = fieldSelect.value; draw(); }));
    runToggles.forEach(function (x, i) {
      x.input.addEventListener('change', core.guard(body, function () { state.runs[['con2', 'con1', 'con3'][i]] = x.get(); draw(); }));
    });
    logToggle.input.addEventListener('change', core.guard(body, function () { state.log = logToggle.get(); draw(); }));
    scrub.input.addEventListener('input', core.guard(body, function () { state.at = scrub.get(); draw(); }));
    jumps.forEach(function (b, i) {
      b.addEventListener('click', core.guard(body, function () {
        const want = [1, 463, 4620, 9240][i];
        let best = 0;
        steps.forEach(function (s, j) { if (Math.abs(s - want) < Math.abs(steps[best] - want)) best = j; });
        state.at = best;
        scrub.set(best);
        draw();
      }));
    });
    core.on('theme-changed', core.guard(body, draw));
    draw();
  });

  // ================================================================== Lab 5F: the projection head

  Labs.register('lab-5f-head', function mount(body, core, bundles) {
    bundles = bundles || core.bundles || {};
    const ID = 'lab-5f-head';
    const key = Object.keys(bundles).filter(function (k) { return /_con3_tokens224\.json$/.test(k); })[0];
    const file = key ? bundles[key] : null;
    if (!file || !file.tokens || !file.tokens.array) throw new Error('run 3' + RSQUO + 's tokens did not arrive');
    const tokens = file.tokens.array;
    const BARS = { w: 520, h: 200 };
    const FLOW = { w: 620, h: 150 };
    const sim = core.rule.similarity(tokens, N_GLOBAL, DIM);
    const sets = core.rule.sets(sim, N_GLOBAL, { k: RUN.k, negPct: RUN.negPct, capPos: RUN.capPos, capNeg: RUN.capNeg });
    const raw = [];
    for (let j = 0; j < N_GLOBAL; j++) raw.push(rowOf(tokens, j, DIM));
    const state = { seed: 1, tau: RUN.tau, anchor: FOLLOWED_ANCHOR, head: true };
    const heads = Object.create(null);
    const outs = Object.create(null);

    function headOf(seed) {
      if (!heads[seed]) heads[seed] = toyHead(DIM, 1024, 256, seed);
      return heads[seed];
    }
    // outOf(seed, j): the toy head's forward pass on token j, cached.
    function outOf(seed, j) {
      const k = seed + ':' + j;
      if (!outs[k]) outs[k] = headForward(headOf(seed), raw[j]);
      return outs[k];
    }

    // ---------------------------------------------------------------- controls

    const controls = core.el('div', { class: 'lab-controls' });
    const headCtl = segmented(core, {
      id: ID + '-path', label: 'Where the term is computed', value: 'head',
      options: [['head', 'through the head (run 3)'], ['raw', 'on the raw tokens (runs 1 and 2)']]
    });
    const seedCtl = slider(core, {
      id: ID + '-seed', label: 'Toy head: draw', min: 1, max: 12, step: 1, value: state.seed, role: 'student',
      format: function (v) { return 'number ' + v; },
      hint: [core.el('span', { class: 'mark mark-toy' }, ['Toy']), ' A fresh head of the real shape, drawn as PyTorch draws a new Linear layer. The bundle does not hold run 3', RSQUO, 's trained head.']
    });
    const tauCtl = slider(core, {
      id: ID + '-tau', label: 'Temperature ' + TAU, min: 0.05, max: 0.5, step: 0.01, value: state.tau,
      format: function (v) { return core.fmt(v, 2); }, hint: ['The run', RSQUO, 's value: 0.2.']
    });
    const anchorCtl = slider(core, {
      id: ID + '-anchor', label: 'Anchor', min: 0, max: N_GLOBAL - 1, step: 1, value: state.anchor,
      format: function (v) { return 'patch ' + v; },
      hint: ['The positives and negatives are chosen on the raw tokens in both cases, as run 3 chooses them.']
    });
    [headCtl.root, seedCtl.root, tauCtl.root, anchorCtl.root].forEach(function (n) { controls.appendChild(n); });

    // ---------------------------------------------------------------- stage

    const stage = core.el('div', { class: 'lab-stage' });
    const flowHolder = core.el('div', { id: ID + '-flow' });
    const barsHolder = core.el('div', { id: ID + '-bars' });
    const read = readout(core, ID + '-readout', [['term', 'The term L_i'], ['grad', 'Gradient on the token'], ['angle', 'Head against raw'], ['why', 'What this means']]);
    stage.appendChild(stageCell(core, ['The head on the anchor', RSQUO, 's token: the shape at each stage and its first numbers'], [flowHolder], FLOW.w));
    stage.appendChild(stageCell(core, ['The anchor', RSQUO, 's cosines with its positives and negatives: on the raw tokens (left of each pair) and in the head', RSQUO, 's space (right)'], [barsHolder], BARS.w));
    stage.appendChild(read.root);
    body.appendChild(controls);
    body.appendChild(stage);

    // compute(): the anchor's term and the gradient on its raw token, on the raw tokens and through the head.
    function compute() {
      const a = state.anchor, tau = state.tau;
      const pos = Array.prototype.slice.call(sets.pos[a]), neg = Array.prototype.slice.call(sets.neg[a]);
      const rawRes = infonceOnVectors(raw[a], raw, pos, neg, tau);
      const others = {};
      pos.concat(neg).forEach(function (j) { others[j] = outOf(state.seed, j).out; });
      const fa = outOf(state.seed, a);
      const headRes = infonceOnVectors(fa.out, others, pos, neg, tau);
      const gHead = headBackward(headOf(state.seed), fa, headRes.grad);
      return { a: a, pos: pos, neg: neg, raw: rawRes, head: headRes, gHead: gHead, fa: fa };
    }

    function drawFlow(c) {
      const svg = svgChart(core, ID + '-flow-chart', FLOW.w, FLOW.h, 'The projection head: the 384 numbers of a token, a Linear layer to 1,024, the GELU, a Linear layer to 256, then length 1.');
      const boxes = [
        ['token z', '384', Array.prototype.slice.call(raw[c.a], 0, 3)],
        ['Linear', '1,024', Array.prototype.slice.call(c.fa.pre, 0, 3)],
        ['GELU', '1,024', Array.prototype.slice.call(c.fa.act, 0, 3)],
        ['Linear', '256', Array.prototype.slice.call(c.fa.out, 0, 3)],
        ['length 1', '256', Array.prototype.slice.call(unit(c.fa.out), 0, 3)]
      ];
      const bw = 104, gap = (FLOW.w - 16 - boxes.length * bw) / (boxes.length - 1);
      boxes.forEach(function (b, i) {
        const x = 8 + i * (bw + gap), y = 22;
        const role = i === 0 ? 'student' : 'ignored';
        svg.appendChild(rect(core, x, y, bw, 64, { rx: '5', class: 'role-' + role, style: 'fill: var(--surface); stroke: var(--role); stroke-width: 1.5' }));
        svg.appendChild(tx(core, x + bw / 2, y + 16, b[0], { 'text-anchor': 'middle', class: 'title' }));
        svg.appendChild(tx(core, x + bw / 2, y + 31, b[1] + ' numbers', { 'text-anchor': 'middle' }));
        b[2].forEach(function (v, k) { svg.appendChild(tx(core, x + bw / 2, y + 96 + k * 13, (v < 0 ? MINUS : '') + core.fmt(Math.abs(v), 3), { 'text-anchor': 'middle', style: 'font-size: 10px' })); });
        if (i < boxes.length - 1) svg.appendChild(line(core, x + bw + 2, y + 32, x + bw + gap - 2, y + 32, { style: 'stroke: var(--muted); stroke-width: 1.5' }));
      });
      svg.appendChild(tx(core, 8, 12, 'the first three numbers under each stage', { style: 'font-size: 10px' }));
      setContent(flowHolder, svg);
    }

    function drawBars(c) {
      const list = c.pos.map(function (j) { return [j, 'positive']; }).concat(c.neg.slice(0, Math.max(0, 22 - c.pos.length)).map(function (j) { return [j, 'negative']; }));
      const x0 = 40, top = 18, base = BARS.h - 30, mid = (top + base) / 2;
      const slot = (BARS.w - x0 - 8) / list.length;
      const Y = function (v) { return mid - (base - top) / 2 * v; };
      const svg = svgChart(core, ID + '-bars-chart', BARS.w, BARS.h, 'The anchor' + RSQUO + 's cosines with its first positives and negatives, raw and in the head' + RSQUO + 's space.');
      const gridG = core.el('g', { class: 'grid' });
      [-1, -0.5, 0, 0.5, 1].forEach(function (v) { gridG.appendChild(line(core, x0, Y(v), BARS.w - 4, Y(v))); svg.appendChild(tx(core, x0 - 6, Y(v) + 4, (v < 0 ? MINUS : '') + Math.abs(v), { 'text-anchor': 'end' })); });
      svg.appendChild(gridG);
      list.forEach(function (it, m) {
        const j = it[0], role = it[1];
        const vr = c.raw.cos[j], vh = c.head.cos[j];
        const x = x0 + m * slot;
        const w = Math.max(1, slot / 2 - 1.5);
        [[vr, 0, 1], [vh, 1, 0.55]].forEach(function (b) {
          const y1 = Y(Math.max(0, b[0])), y2 = Y(Math.min(0, b[0]));
          svg.appendChild(withTitle(core, rect(core, x + 1 + b[1] * (w + 1), y1, w, Math.max(0.5, y2 - y1), { class: 'bar role-' + role, style: 'fill-opacity: ' + b[2] }),
            role + ' ' + j + (b[1] ? ' in the head' + RSQUO + 's space: ' : ' raw: ') + sig(core, b[0], 3)));
        });
      });
      svg.appendChild(core.el('g', { class: 'axis' }, [line(core, x0, Y(0) + 0.5, BARS.w - 4, Y(0) + 0.5)]));
      svg.appendChild(tx(core, (x0 + BARS.w) / 2, BARS.h - 8, 'orange: positives; purple: negatives; the paler bar of each pair is in the head' + RSQUO + 's space', { 'text-anchor': 'middle' }));
      setContent(barsHolder, svg);
    }

    function draw() {
      const c = compute();
      drawFlow(c);
      drawBars(c);
      const useHead = state.head;
      const gr = c.raw.grad, gh = c.gHead;
      const cosAngle = dot(gr, gh) / (norm(gr) * norm(gh) || 1);
      read.set('term', (useHead ? 'through the toy head: ' + sig(core, c.head.loss, 4) + '; on the raw tokens: ' + sig(core, c.raw.loss, 4) : 'on the raw tokens: ' + sig(core, c.raw.loss, 4) + '; through the toy head it would be ' + sig(core, c.head.loss, 4)) +
        ', at ' + TAU + ' = ' + core.fmt(state.tau, 2) + ', with ' + c.pos.length + ' positives and ' + c.neg.length + ' negatives');
      read.set('grad', 'its length on the raw path ' + sig(core, norm(gr), 4) + '; through the head ' + sig(core, norm(gh), 4));
      read.set('angle', 'the two gradients on the same 384 numbers point ' + core.fmt(Math.acos(clamp(cosAngle, -1, 1)) * 180 / Math.PI, 1) + ' degrees apart (cosine ' + sig(core, cosAngle, 3) + ')');
      read.set('why', useHead ? 'Through the head, the push acts on the head' + RSQUO + 's outputs, and the head' + RSQUO + 's two layers decide which of the token' + RSQUO + 's 384 numbers move: the backbone receives the term reshaped by the head.' :
        'On the raw tokens the push acts directly on the backbone' + RSQUO + 's final-block tokens, the kind of token that the linear probe reads; nothing stands between the term and the backbone.');
      headCtl.show(useHead ? 'the head' : 'raw');
      seedCtl.show('number ' + state.seed);
      tauCtl.show(core.fmt(state.tau, 2) + (Math.abs(state.tau - RUN.tau) < 1e-9 ? ' (the run' + RSQUO + 's)' : ''));
      anchorCtl.show('patch ' + state.anchor + (state.anchor === FOLLOWED_ANCHOR ? ' (followed)' : ''));
    }

    headCtl.onChange(core.guard(body, function () { state.head = headCtl.get() === 'head'; draw(); }));
    seedCtl.input.addEventListener('input', core.guard(body, function () { state.seed = seedCtl.get(); draw(); }));
    tauCtl.input.addEventListener('input', core.guard(body, function () { state.tau = tauCtl.get(); draw(); }));
    anchorCtl.input.addEventListener('input', core.guard(body, function () { state.anchor = anchorCtl.get(); draw(); }));
    core.on('theme-changed', core.guard(body, draw));
    draw();
  });

  // ================================================================== Lab 5G: the readings

  const CHECKPOINTS = [
    ['released', 'released SelfPatch (the start of runs 1 and 3)', 'released'],
    ['row_twin', 'row twin (SelfPatch' + RSQUO + 's rule, pair 1)', 'released'],
    ['image_twin', 'image twin (pooled rule, pair 1)', 'released'],
    ['run1', 'run 1 (our rule)', 'released'],
    ['run3', 'run 3 (our rule through the head)', 'released'],
    ['dino', 'converted DINO (the start of run 2)', 'dino'],
    ['pilot', 'pilot (SelfPatch' + RSQUO + 's term from DINO)', 'dino'],
    ['run2', 'run 2 (our rule from DINO)', 'dino']
  ];
  // The endpoints: key, name, family, which way is better, what it measures in one line, and that line's source.
  const METRICS_SRC = '[code: evaluation/metrics_v2.py:12]';
  const PROBE_SRC = '[probe protocol 2026-10-10]';
  const ENDPOINTS = [
    ['hungarian', 'Hungarian matched IoU (the primary endpoint)', 'decoder', 'up',
      'IoU is the overlap of two sets of pixels divided by their union. Each true object is paired with at most one predicted region, the pairing that gives the largest total IoU (the Hungarian assignment), and the score is the mean IoU over the true objects, an object left unpaired counting 0.',
      '[code: evaluation/metrics_v2.py:12; code: evaluation/metrics.py:117]'],
    ['mbo', 'mBO-i', 'decoder', 'up',
      'The mean, over the true objects, of the best IoU that any predicted mask reaches with the object; one mask may serve several objects.', METRICS_SRC],
    ['union', 'foreground union IoU', 'decoder', 'up',
      'The IoU of all the predicted regions together with all the true objects together: how well the foreground as a whole is found.', METRICS_SRC],
    ['recall', 'foreground recall', 'decoder', 'up',
      'The share of the true objects' + RSQUO + ' pixels that some predicted region covers.', METRICS_SRC],
    ['fgari', 'foreground ARI', 'decoder', 'up',
      'The adjusted Rand index of the predicted regions against the true objects, over the true foreground' + RSQUO + 's pixels: 1 when the regions split the objects as the truth does, 0 at chance level.', METRICS_SRC],
    ['bgfpr', 'background false-positive rate', 'decoder', 'down',
      'The share of the true background' + RSQUO + 's pixels that the predicted regions claim; lower is better.', METRICS_SRC],
    ['ap100', 'category-agnostic AP100', 'decoder', 'up',
      'The mask average precision of COCO' + RSQUO + 's evaluation with the categories ignored and up to 100 masks per image: the masks, ranked by a label-free score, are matched to true objects at ten overlap thresholds, from an IoU of 50 to 95 per cent, and the precision is averaged over the thresholds and the levels of recall.',
      '[code: evaluation/category_agnostic_ap.py:90; code: evaluation/ap_v2.py:1]'],
    ['regions', 'regions per image', 'decoder', 'none',
      'How many regions the decoder returns for an image, at most 5; more regions are not better in themselves.', '[decoder config]'],
    ['degenerate', 'images with a degenerate spectrum', 'decoder', 'down',
      'The images on which a cut of the decoder met a degenerate spectrum (fewer than three eigenvalues, one not finite, or the second and third equal): the cutting stops there and the masks found before it are kept.',
      '[code: src/decoder_v2.py:67; decoder config]'],
    ['miou', 'probe mIoU', 'probe', 'up',
      'A linear layer fitted with COCO' + RSQUO + 's labels after training gives each frozen token one of 81 classes, COCO' + RSQUO + 's 80 categories and background; mIoU is the mean, over the classes present, of the IoU between each class' + RSQUO + 's true and predicted tokens.', PROBE_SRC],
    ['aacc', 'probe token accuracy on the panel', 'probe', 'up',
      'The share of the panel' + RSQUO + 's tokens that the probe labels correctly.', PROBE_SRC],
    ['macc', 'probe mean class accuracy', 'probe', 'up',
      'The mean, over the classes present, of the share of each class' + RSQUO + 's tokens that the probe labels correctly.', PROBE_SRC],
    ['fgbg', 'probe foreground against background', 'probe', 'up',
      'The mean of the background' + RSQUO + 's IoU and the foreground' + RSQUO + 's IoU when every object of any class counts as foreground.', PROBE_SRC]
  ];

  Labs.register('lab-5g-readings', function mount(body, core) {
    const ID = 'lab-5g-readings';
    const R = READINGS;
    if (!R) throw new Error('the readings table is missing');
    const CH = { w: 600, rowH: 26, pad: 210 };
    const state = { view: 'values', endpoint: 'hungarian', show: {} };
    CHECKPOINTS.forEach(function (c) { state.show[c[0]] = true; });

    const controls = core.el('div', { class: 'lab-controls' });
    const viewCtl = segmented(core, { id: ID + '-view', label: 'Show', value: state.view, options: [['values', 'the values'], ['contrasts', 'the contrasts']],
      hint: ['A contrast is one checkpoint minus another on the same 988 images, with its 95 % image-bootstrap interval.'] });
    const epSelect = core.el('select', { id: ID + '-endpoint' }, ENDPOINTS.map(function (e) { return core.el('option', { value: e[0] }, [e[1]]); }));
    epSelect.value = state.endpoint;
    const epCtl = core.el('div', { class: 'control' }, [core.el('label', { for: ID + '-endpoint' }, ['Endpoint']), epSelect]);
    const boxes = CHECKPOINTS.map(function (c) { return toggle(core, { id: ID + '-' + c[0].replace('_', '-'), label: c[1], checked: true }); });
    const ckCtl = core.el('div', { class: 'control-group' }, [core.el('p', { class: 'control-group-title' }, ['Checkpoints']), core.el('div', { class: 'toggle-row' }, boxes.map(function (b) { return b.root; }))]);
    [viewCtl.root, epCtl, ckCtl].forEach(function (n) { controls.appendChild(n); });

    const stage = core.el('div', { class: 'lab-stage' });
    const chartHolder = core.el('div', { id: ID + '-chart' });
    const note = core.el('p', { class: 'small', id: ID + '-note' });
    // meaning: what the chosen endpoint measures, in one line with its source
    const meaning = core.el('p', { class: 'small', id: ID + '-meaning' });
    stage.appendChild(chartHolder);
    stage.appendChild(meaning);
    stage.appendChild(note);
    body.appendChild(controls);
    body.appendChild(stage);

    function nameOf(c) { return (CHECKPOINTS.filter(function (x) { return x[0] === c; })[0] || [c, c])[1].split(' (')[0]; }
    function fmtSigned(v) { return (v > 0 ? '+' : (v < 0 ? MINUS : '')) + core.fmt(Math.abs(v), 2); }

    function drawValues(ep) {
      const rows = R.values.filter(function (r) { return r.metric === ep[0] && state.show[r.ckpt]; });
      rows.sort(function (a, b) { return CHECKPOINTS.map(function (c) { return c[0]; }).indexOf(a.ckpt) - CHECKPOINTS.map(function (c) { return c[0]; }).indexOf(b.ckpt); });
      if (!rows.length) { setContent(chartHolder, core.el('p', { class: 'small' }, ['No checkpoint of this endpoint is chosen.'])); return; }
      const h = 34 + rows.length * CH.rowH;
      let mx = 0;
      rows.forEach(function (r) { mx = Math.max(mx, r.value); });
      mx = mx > 0 ? mx * 1.12 : 1;
      const x0 = CH.pad, x1 = CH.w - 70;
      const X = function (v) { return x0 + (x1 - x0) * v / mx; };
      const svg = svgChart(core, ID + '-values-chart', CH.w, h, ep[1] + ': ' + rows.map(function (r) { return nameOf(r.ckpt) + ' ' + r.value; }).join(', ') + '.');
      rows.forEach(function (r, i) {
        const y = 24 + i * CH.rowH;
        const family = (CHECKPOINTS.filter(function (c) { return c[0] === r.ckpt; })[0] || [])[2];
        svg.appendChild(tx(core, x0 - 8, y + 13, nameOf(r.ckpt), { 'text-anchor': 'end' }));
        svg.appendChild(withTitle(core, rect(core, x0, y + 2, X(r.value) - x0, CH.rowH - 8, { class: 'bar', style: 'fill: var(--ink); fill-opacity: ' + (/^run/.test(r.ckpt) ? '0.9' : '0.45') }),
          nameOf(r.ckpt) + ': ' + r.value + ' (' + r.fact + ')'));
        svg.appendChild(tx(core, X(r.value) + 5, y + 13, core.fmt(r.value, ep[0] === 'degenerate' ? 0 : 2), { class: 'title' }));
        if (family === 'dino' && i > 0 && (CHECKPOINTS.filter(function (c) { return c[0] === rows[i - 1].ckpt; })[0] || [])[2] === 'released') {
          svg.appendChild(line(core, 8, y - 1, CH.w - 8, y - 1, { style: 'stroke: var(--line); stroke-dasharray: 3 3' }));
        }
      });
      svg.appendChild(tx(core, x0, 14, ep[3] === 'up' ? 'higher is better' : (ep[3] === 'down' ? 'lower is better' : 'neither direction is better'), { class: 'title' }));
      setContent(chartHolder, svg);
      setContent(note, [core.el('span', { class: 'mark mark-reading', 'data-source': '[reading 2026-10-10; reading 2026-10-11, runs 2 and 3; probe reading 2026-10-10]' }, ['Reading']),
        ' Darker bars: our three runs. Above the dashed line the checkpoints of the released start, below it those of the DINO start. Each value is one checkpoint at one seed on the COCO v4 validation panel; ',
        ep[2] === 'probe' ? 'the probe is a linear layer fitted with labels after training, a secondary reading.' : 'the decoder is frozen and never sees a label.']);
    }

    function drawContrasts(ep) {
      const rows = R.contrasts.filter(function (r) { return r.metric === ep[0] && state.show[r.a] && state.show[r.b]; });
      if (!rows.length) { setContent(chartHolder, core.el('p', { class: 'small' }, ['No contrast of this endpoint joins two chosen checkpoints.'])); return; }
      const h = 40 + rows.length * CH.rowH;
      let lo = 0, hi = 0;
      rows.forEach(function (r) { lo = Math.min(lo, r.lo); hi = Math.max(hi, r.hi); });
      const span = Math.max(Math.abs(lo), Math.abs(hi)) * 1.1 || 1;
      const x0 = CH.pad + 20, x1 = CH.w - 20;
      const X = function (v) { return x0 + (x1 - x0) * (v + span) / (2 * span); };
      const svg = svgChart(core, ID + '-contrasts-chart', CH.w, h, 'Contrasts of ' + ep[1] + ': ' + rows.map(function (r) { return nameOf(r.b) + ' minus ' + nameOf(r.a) + ' ' + fmtSigned(r.d) + ' [' + fmtSigned(r.lo) + ', ' + fmtSigned(r.hi) + ']'; }).join('; ') + '.');
      svg.appendChild(line(core, X(0), 18, X(0), h - 6, { style: 'stroke: var(--ink); stroke-width: 1' }));
      svg.appendChild(tx(core, X(0), 12, '0: no difference', { 'text-anchor': 'middle' }));
      rows.forEach(function (r, i) {
        const y = 28 + i * CH.rowH;
        const clear = r.lo > 0 || r.hi < 0;
        svg.appendChild(tx(core, x0 - 10, y + 12, nameOf(r.b) + ' ' + MINUS + ' ' + nameOf(r.a), { 'text-anchor': 'end' }));
        svg.appendChild(line(core, X(r.lo), y + 8, X(r.hi), y + 8, { style: 'stroke: var(--' + (clear ? 'ink' : 'ignored') + '); stroke-width: 3; stroke-linecap: round' }));
        svg.appendChild(withTitle(core, circle(core, X(r.d), y + 8, 4.5, { style: 'fill: var(--' + (clear ? 'ink' : 'ignored') + ')' }),
          nameOf(r.b) + ' minus ' + nameOf(r.a) + ': ' + fmtSigned(r.d) + ' [' + fmtSigned(r.lo) + ', ' + fmtSigned(r.hi) + '] (' + r.fact + ')'));
        // the value beside the interval: right of it when it fits, else left of it, else above the dot
        const label = fmtSigned(r.d);
        const room = 8 * label.length;
        if (X(r.hi) + 6 + room <= CH.w - 2) svg.appendChild(tx(core, X(r.hi) + 6, y + 12, label, { class: 'title', style: HALO }));
        else if (X(r.lo) - 6 - room >= x0) svg.appendChild(tx(core, X(r.lo) - 6, y + 12, label, { class: 'title', style: HALO, 'text-anchor': 'end' }));
        else svg.appendChild(tx(core, X(r.d), y + 1, label, { class: 'title', style: HALO, 'text-anchor': 'middle' }));
      });
      setContent(chartHolder, svg);
      setContent(note, [core.el('span', { class: 'mark mark-reading', 'data-source': '[reading 2026-10-10; reading 2026-10-11, runs 2 and 3; probe reading 2026-10-10]' }, ['Reading']),
        ' In percentage points, with the 95 % image-bootstrap interval. Ink: the interval leaves out 0; grey: it contains 0. One seed each, so an interval holds image sampling only, and no verdict of different or equivalent is declared.']);
    }

    function draw() {
      const ep = ENDPOINTS.filter(function (e) { return e[0] === state.endpoint; })[0];
      setContent(meaning, [core.el('strong', null, [ep[1]]), ': ', ep[4], ' ', core.el('span', { class: 'mark mark-fact', 'data-source': ep[5] }, ['Fact'])]);
      if (state.view === 'values') drawValues(ep); else drawContrasts(ep);
      viewCtl.show(state.view === 'values' ? 'values' : 'contrasts');
      if (root.Boot && typeof root.Boot.refreshTerms === 'function') root.Boot.refreshTerms();
    }

    viewCtl.onChange(core.guard(body, function () { state.view = viewCtl.get(); draw(); }));
    epSelect.addEventListener('change', core.guard(body, function () { state.endpoint = epSelect.value; draw(); }));
    boxes.forEach(function (b, i) { b.input.addEventListener('change', core.guard(body, function () { state.show[CHECKPOINTS[i][0]] = b.get(); draw(); })); });
    core.on('theme-changed', core.guard(body, draw));
    draw();
  });
})(typeof window !== 'undefined' ? window : this);
