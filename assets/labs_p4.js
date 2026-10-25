/*
 * labs_p4.js: the labs of Part 4 (SelfPatch, p4-selfpatch.html) of the course "Pixels to Islands".
 *   lab-4a-neighbours       the wrapped 3 x 3 window on the 14 x 14 grid, toy cosines and the top-k rule: the first
 *                           explainer's Lab G, ported (Part A below)
 *   lab-4b-one-step         one optimiser step of SelfPatch as our package runs it, in nine button-driven stages: the
 *                           first explainer's Lab H, ported (Part A)
 *   lab-4c-end-to-end       one picture followed through one training step of the toy network of toy_vit.js, in
 *                           fourteen stops: the first explainer's Lab M, copied with its id, its console prefix, its
 *                           chooser label and six section references changed (Part B), its random draws still keyed
 *                           by the first explainer's id (SEED_KEY); with it window.LabM.figure,
 *                           the paper-style drawing that the lab draws as its map
 *   lab-4d-aggregation      new: the class-attention summary of a set of positives, with scores you type or scores
 *                           made by the vectors, the query token's share and the second block (toy; Part C)
 *   lab-4e-real-neighbours  new: the real wrapped window and the real top k of any anchor of a real photograph under
 *                           the released SelfPatch weights, with the whole crop for comparison (Real; Part C)
 *   window.LabP4            workedExamples() (the numbers of the page's three equation walks, which
 *                           src/labs_defaults.json holds and tests/smoke_p4.js compares with the page), curvePoints()
 *                           (the toy curves the walks draw), factTables() (the ported labs' fact tables) and the pure
 *                           helpers of the two new labs.
 * Contract: docs/superpowers/plans/2026-10-13-explainer-v2-build.md (Task 8, plan decisions 2 to 7), the spec's
 * sections 4 (Part 4), 6 and 7, and README.md section 4 of the course. Ported from
 * docs/research/explainer_2026-09-28/src/labs_part2.js and labs_part4.js, which stay as they are (their escaped
 * characters are written here as the characters themselves, so this file is UTF-8 and not ASCII only). Vanilla ES2019,
 * no library; loaded after core.js, scenes.js and toy_vit.js and before boot.js. Nothing is fetched but the
 * bundle's tokens files (through Core.bundle.load) and its photographs (through Core.image.load); nothing is stored or
 * sent. Every default number is in src/labs_defaults.json under the five lab ids.
 */

// ================================================================== Part A: lab-4a-neighbours and lab-4b-one-step
// Ported from the first explainer's labs_part2.js (Labs G and H). Its header said: toy maths only; every picture comes
// from Core.currentImage() (the drawn sample, the viewer's own upload or, on this page, a photograph of the bundle);
// nothing is fetched, stored or sent; numbers in the text are fact-sheet values, written as span.fact with data-fact and
// data-source (the FACTS table is copied from the fact sheets, which facts/course_facts.json imported unchanged), or toy
// defaults recorded in src/labs_defaults.json. Changed in the port: the two lab ids, the console prefix, ensureFrame
// (it also finds the course's marks), the two chooser labels, two sentences of Lab H's stages (the course's parts),
// the two facts that the new sentence cites (p5_candidates_224, p5_rule_objective), and the fact table's registration
// at the end (window.LabP4.factTables). Lab H keys its random draws with the first explainer's id (SEED_KEY), so that
// it rests where the first explainer's Lab H rests; its new id names the elements only.
(function (root) {
  'use strict';

  const Labs = root.Labs;
  if (!Labs || typeof Labs.register !== 'function') {
    if (root.console && typeof root.console.error === 'function') root.console.error('[labs_p4] window.Labs is missing; core.js must load first');
    return;
  }

  // ------------------------------------------------------------------ characters (escaped, so the file stays ASCII)

  const TIMES = '×';
  const MINUS = '−';
  const RARR = '→';
  const THETA = 'θ';
  const MID = '·';

  // ------------------------------------------------------------------ facts used by these labs

  /* FACTS:BEGIN (generated from facts/dino_selfpatch_facts.json and facts/study_facts.json; each entry is [shown value, source, visible tag]) */
  const FACTS = {
    agg_excludes_anchor: ['anchor\'s own token excluded', 'docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:209; docs/research/selection_scope_2026-09-27/05_report_final_v2.md:208', '[our architecture doc §3.6]'],
    agg_global_token: ['global token from all tokens', 'research/audits/base_papers_text/yun_selfpatch_cvpr2022.txt:416-421 (Eq. (4)); docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:48; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:205', '[SelfPatch §2.2]'],
    agg_module: ['class-attention Transformer', 'research/audits/base_papers_text/yun_selfpatch_cvpr2022.txt:424-427; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:197', '[SelfPatch §2.2]'],
    centre_rule: ['c ← m · c + (1 − m) · (batch mean of teacher outputs)', 'research/audits/base_papers_text/caron_dino_iccv2021.txt:205-217 (Eq. (4)); research/audits/base_papers_text/caron_dino_iccv2021.txt:125 and research/audits/base_papers_text/caron_dino_iccv2021.txt:130 (Algorithm 1)', '[DINO §3.1]'],
    coco_train_images: ['118,287', 'cluster/README.md:7; cluster/README.md:3; docs/superpowers/specs/2026-09-26-quality-first-campaign-design.md:191; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:131', '[our code: cluster/README.md]'],
    crop_global_count: ['2', 'docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:154; cluster/selfpatch_official/main_selfpatch.py:502-516; research/audits/base_papers_text/caron_dino_iccv2021.txt:169-170', '[DINO §3.1]'],
    crop_global_scale: ['0.25 to 1.0', 'cluster/selfpatch_official/main_selfpatch.py:112-113; cluster/train.py:682; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:132; research/audits/base_sources_20260914/root/dino_vits16_args.txt:1 (global_crops_scale: [0.25, 1.0])', '[official code: main_selfpatch.py]'],
    crop_global_side: ['224', 'docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:154; cluster/selfpatch_official/main_selfpatch.py:504; cluster/selfpatch_official/main_selfpatch.py:511; research/audits/base_papers_text/caron_dino_iccv2021.txt:169-171', '[our architecture doc §3.1; DINO §3.1]'],
    crop_local_count: ['8', 'cluster/selfpatch_official/main_selfpatch.py:116; research/references/repos/SelfPatch/README.md:15 (--local_crops_number 8); cluster/train.py:682; SelfPatch supplement App. A, p. 1 (research/references/papers/base_audit_20260914_selfpatch/selfpatch_cvpr2022_supplement.pdf) (2 × 224² + 8 × 96²)', '[official code: main_selfpatch.py; SelfPatch supp. App. A]'],
    crop_local_scale: ['0.05 to 0.25', 'cluster/selfpatch_official/main_selfpatch.py:119-121; cluster/train.py:682; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:132; research/audits/base_sources_20260914/root/dino_vits16_args.txt:1 (local_crops_scale: [0.05, 0.25])', '[official code: main_selfpatch.py]'],
    crop_local_side: ['96', 'docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:154; cluster/selfpatch_official/main_selfpatch.py:520; research/audits/base_papers_text/caron_dino_iccv2021.txt:171-172', '[our architecture doc §3.1; DINO §3.1]'],
    crop_total: ['10', 'docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:154; cluster/train.py:745 (10 crops); docs/research/selection_scope_2026-09-27/architecture/10_param_counts_output.txt:55', '[our architecture doc §3.1]'],
    dino_same_architecture: ['same architecture', 'research/audits/base_papers_text/caron_dino_iccv2021.txt:175-178', '[DINO §3.1]'],
    ema_keep_462_constant: ['0.794', 'arithmetic: 0.9995^462 = 0.7937; docs/research/selection_scope_2026-09-27/05_report_final_v2.md:229; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:265', '[our report §2.4; arithmetic]'],
    ema_ours_schedule: ['0.9995 → 1', 'cluster/train.py:152; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:139; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:263', '[our code: cluster/train.py]'],
    ema_rule: ['teacher ← m × teacher + (1 − m) × student', 'research/audits/base_papers_text/caron_dino_iccv2021.txt:211-212; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:263', '[DINO §3.1]'],
    ema_window_ours_steps: ['2,000', 'docs/superpowers/specs/2026-09-26-quality-first-campaign-design.md:213 (0.9995 averages the teacher over about 4 epochs); arithmetic: 1 / (1 − 0.9995) = 2,000 and 2,000 / 462 = 4.3', '[our spec §9; arithmetic]'],
    head_prototypes_global: ['65,536', 'research/audits/base_sources_20260914/root/dino_cvf_supplement.txt:199 (default K = 65536); research/audits/base_sources_20260914/root/dino_vits16_args.txt:1 (out_dim: 65536); cluster/selfpatch_official/main_selfpatch.py:57; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:90', '[DINO supp. App. C; DINO release args]'],
    img_channels: ['3', '.venv-repro/Lib/site-packages/torchvision/transforms/transforms.py:112-113 (an H × W × C image becomes a C × H × W tensor); docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:154 (crops are 3 × 224 × 224)', '[torchvision docs]'],
    loss_cross_entropy: ['H(teacher, student) = −Σ teacher × log(student)', 'research/audits/base_papers_text/caron_dino_iccv2021.txt:139-149 (Eq. (2), H(a, b) = −a log b)', '[DINO §3.1]'],
    loss_global_pairs: ['18', 'docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:235-237; docs/research/selection_scope_2026-09-27/architecture/10_param_counts_output.txt:55 (global_terms 18); docs/research/selection_scope_2026-09-27/05_report_final_v2.md:225', '[our architecture doc §3.9]'],
    loss_stop_gradient: ['stop-gradient', 'research/audits/base_papers_text/caron_dino_iccv2021.txt:128 (t = t.detach() # stop gradient); docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:229; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:265', '[DINO Alg. 1]'],
    nbr_anchor0_224: ['1, 13, 14, 15, 27, 182, 183, 195', 'docs/research/selection_scope_2026-09-27/architecture/10_param_counts_output.txt:26; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:172', '[our parameter count]'],
    nbr_candidates: ['8', 'research/audits/base_papers_text/yun_selfpatch_cvpr2022.txt:387-389 (|N(i)| = 8); docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:172; cluster/selfpatch_official/selfpatch_vision_transformer.py:378 (k_size 3)', '[SelfPatch §2.2]'],
    nbr_links_224: ['1,568', 'docs/research/selection_scope_2026-09-27/architecture/10_param_counts_output.txt:25; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:172', '[our parameter count]'],
    nbr_links_96: ['288', 'docs/research/selection_scope_2026-09-27/architecture/10_param_counts_output.txt:27', '[our parameter count]'],
    nbr_similarity_teacher: ['cosine of teacher tokens', 'docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:174-178; docs/research/selection_scope_2026-09-27/05_report_final_v2.md:150-152; research/audits/base_papers_text/yun_selfpatch_cvpr2022.txt:394-403 (Eq. (3))', '[our architecture doc §3.4]'],
    nbr_wrap: ['wrapped window', 'docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:172; cluster/selfpatch_official/selfpatch_vision_transformer.py:425-443', '[our architecture doc §3.4]'],
    nbr_wrap_share_224: ['10.5', 'docs/research/selection_scope_2026-09-27/architecture/10_param_counts_output.txt:25; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:172; docs/research/selection_scope_2026-09-27/05_report_final_v2.md:151', '[our report §2.1]'],
    nbr_wrap_share_96: ['23.6', 'docs/research/selection_scope_2026-09-27/architecture/10_param_counts_output.txt:27; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:172; docs/research/selection_scope_2026-09-27/05_report_final_v2.md:151', '[our report §2.1]'],
    nbr_wrapped_links_224: ['164', 'docs/research/selection_scope_2026-09-27/architecture/10_param_counts_output.txt:25; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:172', '[our parameter count]'],
    nbr_wrapped_links_96: ['68', 'docs/research/selection_scope_2026-09-27/architecture/10_param_counts_output.txt:27; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:172', '[our parameter count]'],
    ours_clip: ['3.0', 'cluster/train.py:165; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:143; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:316', '[our code: cluster/train.py]'],
    ours_freeze_last_layer: ['1', 'cluster/train.py:166; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:144; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:317', '[our code: cluster/train.py]'],
    ours_global_batch: ['256', 'cluster/train.py:145; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:133; cluster/README.md:80', '[our code: cluster/train.py]'],
    ours_lr_peak: ['0.0005', 'cluster/train.py:146-147; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:137', '[our code: cluster/train.py]'],
    ours_no_label_reader: ['no annotation reader', 'cluster/README.md:3; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:407', '[our code: cluster/README.md]'],
    ours_optimiser: ['AdamW', 'docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:136', '[our architecture doc §2.5]'],
    ours_pair_same_start: ['only the rule differs', 'docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:322', '[our architecture doc §4.4]'],
    ours_steps_per_epoch: ['462', 'docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:134; cluster/README.md:80; cluster/contract.py:47-50; docs/superpowers/specs/2026-09-26-quality-first-campaign-design.md:222', '[our architecture doc §2.5]'],
    ours_warmup_epochs: ['10', 'cluster/train.py:149; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:137', '[our code: cluster/train.py]'],
    p5_candidates_224: ['195', 'docs/protocols/2026-10-08-supervisor-contrastive-run-protocol.md:79 (N is 196 at 224 px); docs/protocols/2026-10-08-supervisor-contrastive-run-protocol.md:86 (every other patch of the anchor\'s crop: N − 1 = 195 at 224 px); docs/superpowers/specs/2026-10-08-supervisor-contrastive-run-design.md:34 (195 at 224 px)', '[protocol 2026-10-08 §3.2]'],
    p5_rule_objective: ['L = L_global + λ L_con', 'docs/protocols/2026-10-08-supervisor-contrastive-run-protocol.md:83 (Objective: L = L_global + λ L_con, λ = 1.0, and SelfPatch\'s patch term is not in it); cluster/selection.py:675-677 (ContrastiveGlobalLoss.combine: c_loss + con_lambda * con_loss)', '[protocol 2026-10-08 §3.2]'],
    param_student: ['54,128,384', 'docs/research/selection_scope_2026-09-27/architecture/10_param_counts_output.txt:18; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:116', '[our parameter count]'],
    param_student_trainable: ['54,058,752', 'docs/research/selection_scope_2026-09-27/architecture/10_param_counts_output.txt:18; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:116', '[our parameter count]'],
    param_teacher: ['54,128,384', 'docs/research/selection_scope_2026-09-27/architecture/10_param_counts_output.txt:19; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:117', '[our parameter count]'],
    patch_grid_224: ['14 × 14', 'docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:158; research/audits/base_papers_text/yun_selfpatch_cvpr2022.txt:629-630', '[our architecture doc §3.2]'],
    patch_grid_96: ['6 × 6', 'docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:158', '[our architecture doc §3.2]'],
    patch_loss_average: ['10', 'docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:241; docs/research/selection_scope_2026-09-27/architecture/10_param_counts_output.txt:55 (patch_view_denominator 10)', '[our architecture doc §3.9]'],
    patch_size: ['16', 'docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:126; research/audits/base_sources_20260914/root/dino_vits16_args.txt:1 (patch_size: 16); research/audits/base_papers_text/caron_dino_iccv2021.txt:234-235', '[DINO §3.2]'],
    patch_targets_every_crop: ['every crop, same-crop comparison', 'docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:239-243; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:257; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:428', '[our architecture doc §3.9]'],
    select_rule_form: ['P(i) = {j ∈ N(i) : s_ij ≥ θ_i}', 'docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:182-186; docs/research/selection_scope_2026-09-27/05_report_final_v2.md:152', '[our report §2.1]'],
    shape_batch_per_gpu: ['256 / number of GPUs', 'docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:450', '[our architecture doc App. A]'],
    shape_global_logits: ['B × 1 × 65,536', 'docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:283; docs/research/selection_scope_2026-09-27/architecture/10_param_counts_output.txt:50; docs/research/selection_scope_2026-09-27/architecture/10_param_counts_output.txt:54', '[our architecture doc §3.12]'],
    shape_head_output_224: ['B × 197 × 384', 'docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:282; docs/research/selection_scope_2026-09-27/architecture/10_param_counts_output.txt:53', '[our architecture doc §3.12]'],
    shape_input_global: ['B × 3 × 224 × 224', 'docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:275', '[our architecture doc §3.12]'],
    shape_input_local: ['B × 3 × 96 × 96', 'docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:275', '[our architecture doc §3.12]'],
    shape_patch_logits_224: ['B × 196 × 4,096', 'docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:284; docs/research/selection_scope_2026-09-27/architecture/10_param_counts_output.txt:50', '[our architecture doc §3.12]'],
    shape_patch_logits_96: ['B × 36 × 4,096', 'docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:284; docs/research/selection_scope_2026-09-27/architecture/10_param_counts_output.txt:50', '[our architecture doc §3.12]'],
    shape_similarities_224: ['B × 196 × 8', 'docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:279; docs/research/selection_scope_2026-09-27/architecture/10_param_counts_output.txt:50', '[our architecture doc §3.12]'],
    shape_similarities_96: ['B × 36 × 8', 'docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:279; docs/research/selection_scope_2026-09-27/architecture/10_param_counts_output.txt:50', '[our architecture doc §3.12]'],
    shape_tokens_224: ['B × 196 × 384', 'docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:277; docs/research/selection_scope_2026-09-27/architecture/10_param_counts_output.txt:49', '[our architecture doc §3.12]'],
    shape_tokens_96: ['B × 36 × 384', 'docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:277; docs/research/selection_scope_2026-09-27/architecture/10_param_counts_output.txt:49', '[our architecture doc §3.12]'],
    sp_asymmetry: ['own token versus aggregated positives', 'research/audits/base_papers_text/yun_selfpatch_cvpr2022.txt:379-384; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:215', '[SelfPatch §2.2]'],
    sp_asymmetry_collapse: ['asymmetry + stop-gradient avoid collapse', 'research/audits/base_papers_text/yun_selfpatch_cvpr2022.txt:384-390', '[SelfPatch §2.2]'],
    sp_k: ['4', 'research/audits/base_papers_text/yun_selfpatch_cvpr2022.txt:404-409; cluster/selfpatch_official/main_selfpatch.py:70 (k_num 4); cluster/train.py:118 (K = 4); docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:188', '[SelfPatch §2.2]'],
    sp_lambda: ['0.1', 'research/audits/base_papers_text/yun_selfpatch_cvpr2022.txt:506 (λ = 0.1); cluster/selfpatch_official/main_selfpatch.py:456 (c_loss + p_loss*0.1); cluster/train.py:154; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:247', '[SelfPatch §4]'],
    sp_patch_prototypes: ['4,096', 'SelfPatch supplement App. A, p. 1 (research/references/papers/base_audit_20260914_selfpatch/selfpatch_cvpr2022_supplement.pdf) (K = 4096 for our projection head); cluster/selfpatch_official/main_selfpatch.py:59; research/references/repos/SelfPatch/README.md:15; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:87', '[SelfPatch supp. App. A]'],
    sp_student_final_ln: ['LN(z_i)', 'docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:215; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:441', '[our architecture doc §3.7]'],
    sp_teacher_crops: ['all 10 crops', 'docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:257; cluster/selfpatch_official/main_selfpatch.py:335; cluster/selfpatch_official/main_selfpatch.py:440-452', '[our architecture doc §3.9]'],
    step_anchors: ['174,080', 'docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:287', '[our architecture doc §3.12]'],
    step_links: ['1,392,640', 'docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:190; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:287; docs/research/selection_scope_2026-09-27/architecture/10_param_counts_output.txt:29; docs/research/selection_scope_2026-09-27/05_report_final_v2.md:155', '[our architecture doc §3.5]'],
    temp_student: ['0.1', 'research/audits/base_papers_text/caron_dino_iccv2021.txt:268 (τs is set to 0.1); cluster/selfpatch_official/main_selfpatch.py:402 (student_temp=0.1); docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:140; docs/research/selection_scope_2026-09-27/architecture/10_param_counts_output.txt:55', '[DINO §3.2]'],
    temp_teacher: ['0.04', 'cluster/selfpatch_official/main_selfpatch.py:73-80 (0.04 to 0.04 over 0 warm-up epochs); cluster/train.py:153; cluster/train.py:745; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:140; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:227; research/audits/base_papers_text/caron_dino_iccv2021.txt:218-219', '[official code: main_selfpatch.py; our code: cluster/train.py]'],
    token_width: ['384', 'docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:126; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:160; cluster/selfpatch_official/selfpatch_vision_transformer.py:352 (embed_dim=384)', '[our architecture doc §2.5]']
  };
  /* FACTS:END */

  // ------------------------------------------------------------------ small helpers shared by both labs

  // logError(where, err): write a lab problem to the console; never throws.
  function logError(where, err) {
    try {
      if (root.console && typeof root.console.error === 'function') root.console.error('[labs_p4] ' + where, err);
    } catch (e) { /* nothing more can be done */ }
  }

  // esc(s): s with the HTML special characters escaped, safe inside text and double-quoted attributes.
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // factOf(id): the [shown value, source, tag] entry of a fact; an unknown id throws, so a typo shows as a lab error.
  function factOf(id) {
    const f = Object.prototype.hasOwnProperty.call(FACTS, id) ? FACTS[id] : null;
    if (!f) throw new Error('unknown fact id ' + id);
    return f;
  }

  // fact(id): the fact's value as trusted HTML: span.fact with data-fact and data-source (boot.js adds the title and the popover).
  function fact(id) {
    const f = factOf(id);
    return '<span class="fact" data-fact="' + esc(id) + '" data-source="' + esc(f[1]) + '">' + esc(f[0]) + '</span>';
  }

  // cite(refs...): the visible source tags as HTML, each distinct tag once; a ref is a fact id or a literal tag in brackets.
  function cite() {
    const tags = [];
    for (let i = 0; i < arguments.length; i++) {
      const ref = String(arguments[i]);
      const tag = ref.charAt(0) === '[' ? ref : factOf(ref)[2];
      if (tags.indexOf(tag) < 0) tags.push(tag);
    }
    return tags.map(function (t) { return '<cite class="src">' + esc(t) + '</cite>'; }).join(' ');
  }

  // para(html): trusted HTML wrapped in one paragraph.
  function para(html) {
    return '<p>' + html + '</p>';
  }

  // sym(s): an ASCII template with ' x ' as the times sign and '->' as an arrow, turned into the typeset characters.
  function sym(s) {
    return String(s).split(' x ').join(' ' + TIMES + ' ').split('->').join(RARR);
  }

  // num(n, digits): n with fixed decimals, comma thousands separators and a true minus sign ('n/a' when not finite).
  function num(n, digits) {
    const x = Number(n);
    if (!isFinite(x)) return 'n/a';
    const parts = Math.abs(x).toFixed(digits === undefined ? 0 : digits).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const body = parts.join('.');
    return (x < 0 && /[1-9]/.test(body) ? MINUS : '') + body;
  }

  // ordinal(k): the English ordinal of a whole number: 1st, 2nd, 3rd, 4th, 11th, 21st.
  function ordinal(k) {
    const n = Math.abs(Math.round(k));
    const t = n % 100;
    const s = (t >= 11 && t <= 13) ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] || 'th');
    return n + s;
  }

  // listWords(items): 'a', 'a and b', 'a, b and c'.
  function listWords(items) {
    if (items.length <= 1) return items.join('');
    return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
  }

  // clear(node): remove every child of node.
  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  // clampInt(v, lo, hi, fallback): v as a whole number inside [lo, hi], or fallback when it is not a number.
  function clampInt(v, lo, hi, fallback) {
    const x = Math.round(Number(v));
    if (!isFinite(x)) return fallback;
    return Math.max(lo, Math.min(hi, x));
  }

  // refreshTerms(): ask boot.js to prepare glossary terms and fact spans that a lab added after mounting.
  function refreshTerms() {
    try {
      if (root.Boot && typeof root.Boot.refreshTerms === 'function') root.Boot.refreshTerms();
    } catch (e) {
      logError('refreshTerms', e);
    }
  }

  // reducedMotion(): whether the reader asked for less motion (boot.js first, else the media query).
  function reducedMotion() {
    try {
      if (root.Boot && typeof root.Boot.prefersReducedMotion === 'function') return !!root.Boot.prefersReducedMotion();
      return !!(typeof root.matchMedia === 'function' && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) {
      return false;
    }
  }

  // imageChooser(core, id, label): the shared "Sample scene / Use your own image" control, or null when boot.js is absent.
  function imageChooser(core, id, label) {
    let make = null;
    if (core && typeof core.imageChooser === 'function') make = core.imageChooser;
    else if (root.Boot && typeof root.Boot.imageChooser === 'function') make = root.Boot.imageChooser;
    if (!make) return null;
    try {
      return make({ id: id, label: label });
    } catch (e) {
      logError('imageChooser', e);
      return null;
    }
  }

  // ensureFrame(body, core, captionHtml, noteHtml): add the toy badge, the caption and the toy note when the static page has none (the course's lab header carries a mark).
  function ensureFrame(body, core, captionHtml, noteHtml) {
    const section = body && typeof body.closest === 'function' ? body.closest('section.lab') : null;
    if (!section) return;
    const head = section.querySelector('.lab-head') || section.querySelector('header');
    if (head && !head.querySelector('.mark, .badge')) {
      const badge = core.el('span', { class: 'badge toy' }, 'Toy: not the real model');
      const meta = head.querySelector('.lab-meta');
      if (meta) meta.appendChild(badge); else head.appendChild(badge);
    }
    if (!section.querySelector('.lab-caption')) body.appendChild(core.el('p', { class: 'lab-caption', html: captionHtml }));
    if (!section.querySelector('.lab-note')) body.appendChild(core.el('p', { class: 'lab-note', html: noteHtml }));
  }

  // cssToken(name, fallback): the value of a CSS custom property on the root element, or fallback.
  function cssToken(name, fallback) {
    try {
      const d = root.document;
      if (d && d.documentElement && typeof root.getComputedStyle === 'function') {
        const v = String(root.getComputedStyle(d.documentElement).getPropertyValue(name) || '').trim();
        if (v) return v;
      }
    } catch (e) { /* use the fallback */ }
    return fallback;
  }

  // onRole(t): the text colour for a filled role colour (the --on-role token), for canvases.
  function onRole(t) {
    return cssToken('--on-role', t.dark ? t.paper : '#FFFFFF');
  }

  // mono(size, weight): a canvas font string in the page's mono face.
  function mono(size, weight) {
    return (weight || 500) + ' ' + size + 'px "JetBrains Mono", ui-monospace, "Cascadia Mono", Menlo, Consolas, monospace';
  }

  // chipOn(ctx, x, y, w, h, text, fill, ink, font): a small filled label with centred text, drawn on a canvas.
  function chipOn(ctx, x, y, w, h, text, fill, ink, font) {
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = ink;
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + w / 2, y + h / 2 + 0.5);
  }

  // centreText(ctx, text, x, y, font, colour): one line of text centred on (x, y).
  function centreText(ctx, text, x, y, font, colour) {
    ctx.fillStyle = colour;
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
  }

  // hatch(ctx, x, y, w, h, colour): diagonal lines over a rectangle, the mark for "no patch here".
  function hatch(ctx, x, y, w, h, colour) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.strokeStyle = colour;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let d = -h; d < w; d += 7) {
      ctx.moveTo(x + d, y + h);
      ctx.lineTo(x + d + h, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  // mixRgb(core, a, b, t): the colour t of the way from a to b, as [r, g, b] bytes.
  function mixRgb(core, a, b, t) {
    const p = core.parseColour(a) || [0, 0, 0, 1];
    const q = core.parseColour(b) || [255, 255, 255, 1];
    const w = Math.max(0, Math.min(1, t));
    return [Math.round(p[0] + (q[0] - p[0]) * w), Math.round(p[1] + (q[1] - p[1]) * w), Math.round(p[2] + (q[2] - p[2]) * w)];
  }

  // ================================================================== Lab G: neighbours as positives

  Labs.register('lab-4a-neighbours', function mount(body, core) {
    const ID = 'lab-4a-neighbours';
    const el = core.el;
    const G = 14;
    const SIDE = 224;
    const PATCH = 16;
    const CELL = 26;
    const MARGIN = 26;
    const VIEW = G * CELL + 2 * MARGIN;
    const WIN = 72;
    const WVIEW = 3 * WIN;
    const SIDE_CELL = 250;
    const BAR = 48;
    const DEF = { anchor: 90, k: 4, wrap: true };
    const BORDER_ANCHOR = 0;
    const DIRS = ['up-left', 'up', 'up-right', 'left', 'anchor', 'right', 'down-left', 'down', 'down-right'];
    const state = { anchor: DEF.anchor, k: DEF.k, wrap: DEF.wrap, hover: -1 };
    const data = { canvas: null, feats: null, sample: true };
    let result = null;

    // ---------------------------------------------------------------- the control strip

    const kInput = el('input', { type: 'range', id: ID + '-k', min: '1', max: '8', step: '1', value: String(DEF.k), 'aria-describedby': ID + '-k-hint' });
    const kOut = el('output', { id: ID + '-k-out', for: ID + '-k' }, String(DEF.k));
    const wrapInput = el('input', { type: 'checkbox', id: ID + '-wrap', checked: true, 'aria-describedby': ID + '-wrap-hint' });
    const borderBtn = el('button', { type: 'button', class: 'btn', id: ID + '-border' }, 'Border example: anchor 0');
    const resetBtn = el('button', { type: 'button', class: 'btn', id: ID + '-reset' }, 'Back to anchor 90');

    const kHint = 'SelfPatch\'s official rule keeps k = ' + fact('sp_k') + ' ' + cite('sp_k') + '. Try 1 and 8 to see the two extremes.';
    const wrapHint = 'With wrapping, every patch has exactly ' + fact('nbr_candidates') + ' candidates ' + cite('nbr_candidates') + '. The paper does not mention it; the ' +
      fact('nbr_wrap') + ' comes from the official code ' + cite('nbr_wrap') + '. On the ' + fact('patch_grid_224') + ' grid of a ' +
      fact('crop_global_side') + '-pixel crop, ' + fact('nbr_wrapped_links_224') + ' of its ' + fact('nbr_links_224') + ' candidate links wrap (' +
      fact('nbr_wrap_share_224') + ' %); on the ' + fact('patch_grid_96') + ' grid of a ' + fact('crop_local_side') + '-pixel crop, ' +
      fact('nbr_wrapped_links_96') + ' of ' + fact('nbr_links_96') + ' do (' + fact('nbr_wrap_share_96') + ' %) ' +
      cite('nbr_wrapped_links_224', 'nbr_wrap_share_224') + '.';

    const controls = el('div', { class: 'lab-controls' }, [
      el('div', { class: 'control-group' }, [
        el('p', { class: 'control-group-title' }, 'Anchor'),
        el('p', { class: 'control-hint' }, 'Click a patch in the picture to make it the anchor. You can also focus the picture and move with the arrow keys.'),
        el('div', { class: 'button-row' }, [borderBtn, resetBtn])
      ]),
      el('div', { class: 'control role-positive' }, [
        el('label', { for: ID + '-k' }, 'Positives kept, k'),
        kOut,
        kInput,
        el('p', { class: 'control-hint', id: ID + '-k-hint', html: kHint })
      ]),
      el('div', { class: 'control-group' }, [
        el('p', { class: 'control-group-title' }, 'Border'),
        el('div', { class: 'toggle-row' }, el('label', { class: 'toggle' }, [wrapInput, ' Wrap around the border (what the official code does)'])),
        el('p', { class: 'control-hint', id: ID + '-wrap-hint', html: wrapHint })
      ])
    ]);
    const chooser = imageChooser(core, ID, 'Picture for the window lab');
    if (chooser) controls.appendChild(chooser);

    // ---------------------------------------------------------------- the stage

    const summary = el('p', { id: ID + '-summary', 'aria-live': 'polite' });
    const legend = el('ul', { class: 'legend', 'aria-label': 'Key to the picture' }, [
      el('li', null, 'anchor (thick outline)'),
      el('li', { class: 'role-positive' }, 'kept: a positive'),
      el('li', { class: 'role-ignored' }, 'candidate, not kept')
    ]);
    const gridCanvas = el('canvas', {
      id: ID + '-grid', tabindex: '0',
      'aria-label': 'The picture cut into 14 by 14 patches. Click a patch, or use the arrow keys, to choose the anchor.',
      'aria-describedby': ID + '-summary'
    });
    const winCanvas = el('canvas', { id: ID + '-window', role: 'img', 'aria-label': 'The anchor\'s 3 by 3 window, with the toy cosine of each neighbour' });
    const readout = el('dl', { class: 'readout', id: ID + '-readout' });
    const officialNote = el('p', { class: 'note', id: ID + '-official' });
    officialNote.hidden = true;
    const tableCaption = el('caption', null, 'The 8 candidates, most similar first');
    const tbody = el('tbody', { id: ID + '-ranking-body' });
    const table = el('table', { id: ID + '-ranking' }, [
      tableCaption,
      el('thead', null, el('tr', null, [
        el('th', { class: 'num', scope: 'col' }, 'Rank'),
        el('th', { scope: 'col' }, 'Patch'),
        el('th', { scope: 'col' }, 'Where'),
        el('th', { class: 'num', scope: 'col' }, 'Cosine'),
        el('th', { scope: 'col' }, 'Kept?')
      ])),
      tbody
    ]);
    const stage = el('div', { class: 'lab-stage' }, [
      summary,
      legend,
      el('div', { class: 'stage-row' }, [
        el('div', { class: 'stage-cell', style: { maxWidth: VIEW + 'px' } }, [
          gridCanvas,
          el('p', { class: 'stage-label' }, 'The picture as 14 ' + TIMES + ' 14 patches. Dashed boxes outside the frame are window positions beyond the edge.')
        ]),
        el('div', { class: 'stage-cell', style: { maxWidth: SIDE_CELL + 'px' } }, [
          winCanvas,
          el('p', { class: 'stage-label' }, 'The anchor\'s 3 ' + TIMES + ' 3 window, as the code sees it'),
          readout,
          officialNote
        ])
      ]),
      el('div', { class: 'scroll-x' }, table)
    ]);

    body.appendChild(controls);
    body.appendChild(stage);
    ensureFrame(body, core,
      '<strong>What you are looking at:</strong> the picture cut into a ' + fact('patch_grid_224') + ' grid of patches. The thick outline marks the anchor, ' +
      'the outlined cells around it are its window neighbours, and the orange ones are the k most similar, its positives. ' +
      'The table ranks the candidates from most to least similar.',
      '<strong>Real model versus this toy:</strong> SelfPatch compares the teacher\'s tokens, ' + fact('token_width') + ' numbers per patch ' + cite('token_width') +
      '. This toy compares 8 numbers per patch, computed from its mean colour, texture, position and edges, so its cosines differ from the real ones. ' +
      'The rule is the real one: keep the k largest of the 8.');

    // ---------------------------------------------------------------- computing

    // loadImage(): read the shared picture at 224 pixels and its toy features on the 14 x 14 grid.
    function loadImage() {
      const cur = core.currentImage(SIDE);
      data.canvas = core.toCanvas(cur.imageData);
      data.feats = core.toyFeatures(cur.imageData, G);
      data.sample = cur.source !== 'upload';
    }

    // objectAt(index): what the sample scene shows at the centre of a patch ('roof', 'sky', ...), or null for an upload.
    function objectAt(index) {
      if (!data.sample || typeof core.sceneObjectAt !== 'function') return null;
      const r = Math.floor(index / G), c = index % G;
      return core.sceneObjectAt((c + 0.5) / G, (r + 0.5) / G);
    }

    // compute(): the anchor's candidates (all 8 with wrapping, fewer at the border without it), their toy cosines, ranks and the kept set.
    function compute() {
      const f = data.feats;
      const a = state.anchor;
      const list = [];
      core.neighbourInfo(a, G).forEach(function (n) {
        if (!state.wrap && n.wrapped) return;
        list.push({ index: n.index, row: n.row, col: n.col, dr: n.dr, dc: n.dc, wrapped: n.wrapped, cos: core.cosine(f[a], f[n.index]), rank: 0, kept: false });
      });
      const order = core.rankRow(list.map(function (c) { return c.cos; }));
      const kept = Math.min(state.k, list.length);
      order.forEach(function (j, r) {
        list[j].rank = r + 1;
        list[j].kept = r < kept;
      });
      const threshold = kept > 0 ? list[order[kept - 1]].cos : NaN;
      const tie = kept > 0 && kept < list.length && list[order[kept]].cos === threshold;
      const wrapped = list.filter(function (c) { return c.wrapped; }).length;
      return { list: list, order: order, kept: kept, threshold: threshold, tie: tie, wrapped: wrapped };
    }

    // candidateAt(dr, dc): the candidate in window position (dr, dc), or null when that position has none.
    function candidateAt(dr, dc) {
      for (let i = 0; i < result.list.length; i++) {
        if (result.list[i].dr === dr && result.list[i].dc === dc) return result.list[i];
      }
      return null;
    }

    // where(c): a candidate's direction from the anchor, the wrapped row or column, and (for the sample) what the patch shows.
    function where(c) {
      let s = DIRS[(c.dr + 1) * 3 + (c.dc + 1)];
      if (c.wrapped) {
        const ar = Math.floor(state.anchor / G), ac = state.anchor % G;
        const bits = [];
        if (ar + c.dr < 0 || ar + c.dr >= G) bits.push('row ' + c.row);
        if (ac + c.dc < 0 || ac + c.dc >= G) bits.push('column ' + c.col);
        s += ', wrapped to ' + bits.join(', ');
      }
      const obj = objectAt(c.index);
      if (obj) s += ' ' + MID + ' ' + obj;
      return s;
    }

    // ---------------------------------------------------------------- drawing

    // cellAt(p): the patch index under a point of the grid canvas, or -1 outside the picture.
    function cellAt(p) {
      const c = Math.floor((p.x - MARGIN) / CELL), r = Math.floor((p.y - MARGIN) / CELL);
      return (r >= 0 && r < G && c >= 0 && c < G) ? r * G + c : -1;
    }

    // drawGrid(): the picture on the 14 x 14 grid with the anchor, its candidates, the kept positives and the window positions beyond the edge.
    function drawGrid() {
      const t = core.theme();
      const ink = onRole(t);
      const ctx = core.fitCanvas(gridCanvas, VIEW, VIEW);
      const span = G * CELL;
      ctx.fillStyle = t.paper;
      ctx.fillRect(0, 0, VIEW, VIEW);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(data.canvas, MARGIN, MARGIN, span, span);
      ctx.fillStyle = core.rgba(t.paper, 0.55);
      ctx.fillRect(MARGIN, MARGIN, span, span);
      [state.anchor].concat(result.list.map(function (c) { return c.index; })).forEach(function (i) {
        const r = Math.floor(i / G), c = i % G;
        ctx.drawImage(data.canvas, c * PATCH, r * PATCH, PATCH, PATCH, MARGIN + c * CELL, MARGIN + r * CELL, CELL, CELL);
      });
      ctx.strokeStyle = core.rgba(t.ink, 0.2);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i <= G; i++) {
        const p = MARGIN + i * CELL + 0.5;
        ctx.moveTo(p, MARGIN);
        ctx.lineTo(p, MARGIN + span);
        ctx.moveTo(MARGIN, p);
        ctx.lineTo(MARGIN + span, p);
      }
      ctx.stroke();
      ctx.strokeStyle = t.line;
      ctx.strokeRect(MARGIN - 0.5, MARGIN - 0.5, span + 1, span + 1);

      const ar = Math.floor(state.anchor / G), ac = state.anchor % G;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const rr = ar + dr, cc = ac + dc;
          if ((dr === 0 && dc === 0) || (rr >= 0 && rr < G && cc >= 0 && cc < G)) continue;
          const x = MARGIN + cc * CELL, y = MARGIN + rr * CELL;
          ctx.setLineDash([3, 3]);
          ctx.strokeStyle = t.muted;
          ctx.lineWidth = 1.25;
          ctx.strokeRect(x + 1.5, y + 1.5, CELL - 3, CELL - 3);
          ctx.setLineDash([]);
          const label = state.wrap ? String(((rr + G) % G) * G + ((cc + G) % G)) : 'none';
          centreText(ctx, label, x + CELL / 2, y + CELL / 2, mono(9, 600), state.wrap ? t.ink : t.muted);
        }
      }

      result.list.forEach(function (c) {
        const x = MARGIN + c.col * CELL, y = MARGIN + c.row * CELL;
        if (c.kept) {
          ctx.fillStyle = core.rgba(t.positive, 0.3);
          ctx.fillRect(x, y, CELL, CELL);
          ctx.strokeStyle = t.paper;
          ctx.lineWidth = 5;
          ctx.strokeRect(x + 2.5, y + 2.5, CELL - 5, CELL - 5);
          ctx.strokeStyle = t.positive;
          ctx.lineWidth = 3;
          ctx.strokeRect(x + 2.5, y + 2.5, CELL - 5, CELL - 5);
        } else {
          ctx.strokeStyle = t.paper;
          ctx.lineWidth = 3;
          ctx.strokeRect(x + 2, y + 2, CELL - 4, CELL - 4);
          ctx.setLineDash([4, 3]);
          ctx.strokeStyle = t.ignored;
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 2, y + 2, CELL - 4, CELL - 4);
          ctx.setLineDash([]);
        }
        chipOn(ctx, x + 1, y + 1, 12, 12, String(c.rank), c.kept ? t.positive : t.paper, c.kept ? ink : t.ink, mono(8, 700));
        if (c.wrapped) {
          ctx.fillStyle = t.ink;
          ctx.beginPath();
          ctx.moveTo(x + CELL - 1, y + CELL - 10);
          ctx.lineTo(x + CELL - 1, y + CELL - 1);
          ctx.lineTo(x + CELL - 10, y + CELL - 1);
          ctx.closePath();
          ctx.fill();
        }
      });

      const ax = MARGIN + ac * CELL, ay = MARGIN + ar * CELL;
      ctx.strokeStyle = t.paper;
      ctx.lineWidth = 6;
      ctx.strokeRect(ax + 1, ay + 1, CELL - 2, CELL - 2);
      ctx.strokeStyle = t.ink;
      ctx.lineWidth = 3.5;
      ctx.strokeRect(ax + 1, ay + 1, CELL - 2, CELL - 2);

      if (state.hover >= 0 && state.hover !== state.anchor) {
        const hr = Math.floor(state.hover / G), hc = state.hover % G;
        ctx.setLineDash([2, 2]);
        ctx.strokeStyle = t.ink;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(MARGIN + hc * CELL + 0.75, MARGIN + hr * CELL + 0.75, CELL - 1.5, CELL - 1.5);
        ctx.setLineDash([]);
      }
    }

    // drawWindow(): the anchor's 3 x 3 window as the code sees it: each position's patch, rank and toy cosine, wrapped or missing.
    function drawWindow() {
      const t = core.theme();
      const ink = onRole(t);
      const ctx = core.fitCanvas(winCanvas, WVIEW, WVIEW);
      const inset = 4, size = WIN - 2 * inset;
      ctx.fillStyle = t.paper;
      ctx.fillRect(0, 0, WVIEW, WVIEW);
      ctx.imageSmoothingEnabled = false;
      const ar = Math.floor(state.anchor / G), ac = state.anchor % G;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const x = (dc + 1) * WIN + inset, y = (dr + 1) * WIN + inset;
          const rawR = ar + dr, rawC = ac + dc;
          const off = rawR < 0 || rawR >= G || rawC < 0 || rawC >= G;
          if (off && !state.wrap) {
            ctx.strokeStyle = t.line;
            ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
            hatch(ctx, x, y, size, size, t.line);
            centreText(ctx, 'off the', x + size / 2, y + size / 2 - 7, mono(10, 600), t.muted);
            centreText(ctx, 'grid', x + size / 2, y + size / 2 + 7, mono(10, 600), t.muted);
            continue;
          }
          const rr = (rawR + G) % G, cc = (rawC + G) % G;
          ctx.drawImage(data.canvas, cc * PATCH, rr * PATCH, PATCH, PATCH, x, y, size, size);
          ctx.fillStyle = core.rgba(t.paper, 0.88);
          ctx.fillRect(x, y + size - 18, size, 18);
          if (dr === 0 && dc === 0) {
            centreText(ctx, 'anchor ' + state.anchor, x + size / 2, y + size - 9, mono(10, 700), t.ink);
            ctx.strokeStyle = t.paper;
            ctx.lineWidth = 7;
            ctx.strokeRect(x + 1.5, y + 1.5, size - 3, size - 3);
            ctx.strokeStyle = t.ink;
            ctx.lineWidth = 4;
            ctx.strokeRect(x + 1.5, y + 1.5, size - 3, size - 3);
            continue;
          }
          const c = candidateAt(dr, dc);
          if (!c) continue;
          centreText(ctx, num(c.cos, 3), x + size / 2, y + size - 9, mono(11, 600), t.ink);
          if (c.kept) {
            ctx.strokeStyle = t.positive;
            ctx.lineWidth = 4;
            ctx.strokeRect(x + 2, y + 2, size - 4, size - 4);
          } else {
            ctx.setLineDash([5, 4]);
            ctx.strokeStyle = t.ignored;
            ctx.lineWidth = 2.5;
            ctx.strokeRect(x + 1.5, y + 1.5, size - 3, size - 3);
            ctx.setLineDash([]);
          }
          chipOn(ctx, x + 4, y + 4, 16, 16, String(c.rank), c.kept ? t.positive : t.paper, c.kept ? ink : t.ink, mono(10, 700));
          if (c.wrapped) chipOn(ctx, x + size - 40, y + 5, 37, 13, 'wrapped', t.paper, t.ink, mono(8, 600));
        }
      }
    }

    // ---------------------------------------------------------------- text

    // renderSummary(): one sentence on where the anchor is and which neighbours it keeps.
    function renderSummary() {
      const a = state.anchor, r = Math.floor(a / G), c = a % G;
      const obj = objectAt(a);
      const n = result.list.length;
      const kept = result.order.slice(0, result.kept).map(function (j) { return String(result.list[j].index); });
      let s = 'Anchor ' + a + ' sits at row ' + r + ', column ' + c + (obj ? ' (' + obj + ')' : '') + '. ';
      if (result.kept >= n) s += 'It keeps all ' + n + ' of its candidates' + (n < 8 ? ', because only ' + n + ' lie inside the grid' : '') + ': ' + listWords(kept) + '.';
      else if (result.kept === 1) s += 'It keeps its most similar neighbour: ' + kept[0] + '.';
      else s += 'It keeps its ' + result.kept + ' most similar neighbours: ' + listWords(kept) + '.';
      if (state.wrap && result.wrapped > 0) s += ' ' + result.wrapped + ' of its 8 candidates wrap around the border.';
      if (!state.wrap && n < 8) s += ' Switch wrapping on to see the window reach round to the far side.';
      summary.textContent = s;
    }

    // renderReadout(): the anchor's numbers beside the window view, and the official table's list for anchor 0.
    function renderReadout() {
      clear(readout);
      const a = state.anchor, r = Math.floor(a / G), c = a % G;
      const n = result.list.length;
      const rows = [['Anchor', 'patch ' + a], ['Row, column', r + ', ' + c]];
      const obj = objectAt(a);
      if (obj) rows.push(['Shows', obj]);
      rows.push(['Candidates', n === 8 ? '8' : n + ' (' + (8 - n) + ' off the grid)']);
      rows.push(['Kept', String(result.kept)]);
      rows.push(['Threshold ' + THETA, result.kept < n ? num(result.threshold, 3) + ' (' + ordinal(result.kept) + ' largest)' : 'none, all kept']);
      rows.push(['Wrapped', state.wrap ? result.wrapped + ' of 8' : 'off']);
      rows.forEach(function (row) {
        readout.appendChild(el('dt', null, row[0]));
        readout.appendChild(el('dd', null, row[1]));
      });
      const listed = result.list.map(function (x) { return x.index; }).join(', ');
      if (a === BORDER_ANCHOR && state.wrap && listed === factOf('nbr_anchor0_224')[0]) {
        officialNote.innerHTML = 'The official table lists the same candidates for anchor 0: ' + fact('nbr_anchor0_224') + ' ' + cite('nbr_anchor0_224') + '.';
        officialNote.hidden = false;
      } else {
        officialNote.hidden = true;
      }
    }

    // renderTable(): the candidates from most to least similar, with the threshold line after the k-th.
    function renderTable() {
      clear(tbody);
      const n = result.list.length;
      tableCaption.textContent = n === 8 ? 'The 8 candidates, most similar first' : 'The ' + n + ' candidates inside the grid, most similar first';
      result.order.forEach(function (j, r) {
        const c = result.list[j];
        const bar = el('span', {
          'aria-hidden': 'true',
          style: { display: 'inline-block', width: Math.round(Math.max(0, c.cos) * BAR) + 'px', height: '0.6em', marginRight: '0.5em', background: 'var(--role)', borderRadius: '2px' }
        });
        tbody.appendChild(el('tr', { class: c.kept ? 'role-positive' : 'role-ignored' }, [
          el('td', { class: 'num' }, String(r + 1)),
          el('td', null, c.index + ' (row ' + c.row + ', column ' + c.col + ')'),
          el('td', null, where(c)),
          el('td', { class: 'num' }, [bar, num(c.cos, 3)]),
          el('td', null, el('span', { class: c.kept ? 'chip filled' : 'chip', style: { whiteSpace: 'nowrap' } }, c.kept ? 'kept' : 'not kept'))
        ]));
        if (r + 1 === result.kept && result.kept < n) {
          tbody.appendChild(el('tr', null, el('td', { colspan: '5', class: 'muted' },
            'Threshold ' + THETA + ' = ' + num(result.threshold, 3) + ', the ' + ordinal(result.kept) + ' largest value' +
            (result.tie ? '; values tie at the threshold, and this toy keeps the lower index first' : '') + '. Rows above this line are kept.')));
        }
      });
    }

    // update(): recompute the anchor's window and redraw every view; the resting state is anchor 90, k = 4, wrapping on.
    function update() {
      result = compute();
      kInput.value = String(state.k);
      kOut.value = String(state.k);
      kOut.textContent = String(state.k);
      wrapInput.checked = state.wrap;
      renderSummary();
      drawGrid();
      drawWindow();
      renderReadout();
      renderTable();
      refreshTerms();
    }

    // ---------------------------------------------------------------- events

    kInput.addEventListener('input', core.guard(body, function () {
      state.k = clampInt(kInput.value, 1, 8, DEF.k);
      update();
    }));
    wrapInput.addEventListener('change', core.guard(body, function () {
      state.wrap = !!wrapInput.checked;
      update();
    }));
    borderBtn.addEventListener('click', core.guard(body, function () {
      state.anchor = BORDER_ANCHOR;
      update();
    }));
    resetBtn.addEventListener('click', core.guard(body, function () {
      state.anchor = DEF.anchor;
      state.k = DEF.k;
      state.wrap = DEF.wrap;
      update();
    }));
    gridCanvas.addEventListener('click', core.guard(body, function (ev) {
      const i = cellAt(core.canvasPoint(gridCanvas, ev, VIEW, VIEW));
      if (i < 0) return;
      state.anchor = i;
      update();
    }));
    gridCanvas.addEventListener('pointermove', core.guard(body, function (ev) {
      const i = cellAt(core.canvasPoint(gridCanvas, ev, VIEW, VIEW));
      if (i === state.hover) return;
      state.hover = i;
      drawGrid();
    }));
    gridCanvas.addEventListener('pointerleave', core.guard(body, function () {
      if (state.hover === -1) return;
      state.hover = -1;
      drawGrid();
    }));
    gridCanvas.addEventListener('keydown', core.guard(body, function (ev) {
      let r = Math.floor(state.anchor / G), c = state.anchor % G;
      if (ev.key === 'ArrowUp') r = Math.max(0, r - 1);
      else if (ev.key === 'ArrowDown') r = Math.min(G - 1, r + 1);
      else if (ev.key === 'ArrowLeft') c = Math.max(0, c - 1);
      else if (ev.key === 'ArrowRight') c = Math.min(G - 1, c + 1);
      else return;
      ev.preventDefault();
      state.anchor = r * G + c;
      update();
    }));
    core.on('theme-changed', core.guard(body, function () {
      drawGrid();
      drawWindow();
    }));
    core.on('image-changed', core.guard(body, function () {
      loadImage();
      update();
    }));

    loadImage();
    update();
  });

  // ================================================================== Lab H: one optimiser step

  Labs.register('lab-4b-one-step', function mount(body, core) {
    const ID = 'lab-4b-one-step';
    // SEED_KEY: the first explainer's id of this lab, the key of every random draw (the prototypes, the weights, the
    // gradient, the crops and their augmentations), so that the lab rests where the first explainer's Lab H rests
    // (labs_defaults.json h.rest_global, h.rest_local and h.toy_weights); ID names the elements only.
    const SEED_KEY = 'lab-h-one-step';
    const el = core.el;
    const INTERVAL_MS = 1500;
    const SRC_SIDE = 480;
    const AUG = { flip: true, jitter: true, grey: true, blur: true, solarise: true, mode: 'recipe' };
    const FOLLOW = {
      global: { crop: 0, g: 14, n: 196, anchor: 105, name: 'Global crop 1' },
      local: { crop: 2, g: 6, n: 36, anchor: 21, name: 'Local crop 1' }
    };
    const NPROTO = 12;
    const TAU_T = 0.04;
    const TAU_S = 0.1;
    const NW = 24;
    const W_SCALE = 0.6;
    const W_STEP = 0.25;
    const CLIP = 3;
    const MOMENTUM = 0.9995;
    const EPOCH_STEPS = 462;
    const WIDE_MIN = 600;
    const STAGES = [
      { key: 'image', title: 'A batch of pictures arrives' },
      { key: 'crops', title: 'Each picture becomes ten crops' },
      { key: 'teacher forward', title: 'The teacher reads every crop' },
      { key: 'selection', title: 'Every patch picks its positives' },
      { key: 'aggregation targets', title: 'The teacher builds the targets' },
      { key: 'student forward', title: 'The student makes its guesses' },
      { key: 'losses', title: 'The losses score the guesses' },
      { key: 'update', title: 'The student is updated' },
      { key: 'EMA', title: 'The teacher follows slowly' }
    ];
    const LAST = STAGES.length - 1;
    const state = { stage: 0, follow: 'global', seed: 1, anchor: { global: FOLLOW.global.anchor, local: FOLLOW.local.anchor }, playing: false, layout: '' };
    let timer = null;
    let version = 0;
    let cache = null;
    let overview = null;
    let focusCrop = false;

    // ---------------------------------------------------------------- toy data

    // makePrototypes(): 12 fixed random directions in the 8-number toy feature space, standing in for the heads' prototypes.
    function makePrototypes() {
      const out = [];
      for (let k = 0; k < NPROTO; k++) out.push(core.randomUnit(8, SEED_KEY + '|proto|' + k));
      return out;
    }

    // toyWeights(): 24 made-up weights, a made-up gradient (clipped to length 3), one exaggerated student step and one EMA step of the teacher.
    function toyWeights() {
      const r1 = core.rng(SEED_KEY + '|weights');
      const r2 = core.rng(SEED_KEY + '|grad');
      const w0 = [], g = [];
      for (let i = 0; i < NW; i++) {
        w0.push(r1.normal() * W_SCALE);
        g.push(r2.normal());
      }
      let len = 0;
      g.forEach(function (x) { len += x * x; });
      len = Math.sqrt(len);
      const s = Math.min(1, CLIP / len);
      const w1 = w0.map(function (x, i) { return x - W_STEP * g[i] * s; });
      const t1 = core.ema(w0, w1, MOMENTUM);
      let move = 0;
      t1.forEach(function (x, i) { move = Math.max(move, Math.abs(x - w0[i])); });
      return { w0: w0, w1: w1, t1: t1, len: len, move: move };
    }

    const PROTOS = makePrototypes();
    const WEIGHTS = toyWeights();

    // crops(): the ten crops of the shared picture for the current seed, cut from its 480-pixel version as DINO's recipe does (cached).
    function crops() {
      const key = version + '|' + state.seed;
      if (cache && cache.key === key) return cache;
      const src = core.currentImage(SRC_SIDE).imageData;
      const rects = core.cropSampler(core.rng(SEED_KEY + '|crops|' + state.seed), SRC_SIDE);
      const list = rects.all.map(function (r, i) {
        return core.augment(src, r, i < 2 ? 224 : 96, AUG, core.rng(SEED_KEY + '|aug|' + state.seed + '|' + i));
      });
      cache = { key: key, src: src, srcCanvas: null, rects: rects, list: list, canvases: [], views: {} };
      return cache;
    }

    // cropCanvas(i): crop i as a canvas, made once per set of crops.
    function cropCanvas(i) {
      const c = crops();
      if (!c.canvases[i]) c.canvases[i] = core.toCanvas(c.list[i]);
      return c.canvases[i];
    }

    // sourceCanvas(): the 480-pixel picture the crops come from, as a canvas.
    function sourceCanvas() {
      const c = crops();
      if (!c.srcCanvas) c.srcCanvas = core.toCanvas(c.src);
      return c.srcCanvas;
    }

    // overviewCanvas(): the shared picture at 224 pixels, as a canvas (rebuilt when the picture changes).
    function overviewCanvas() {
      if (!overview || overview.version !== version) overview = { version: version, canvas: core.toCanvas(core.currentImage(224).imageData) };
      return overview.canvas;
    }

    // view(): the followed crop with its toy features, window cosines and row-rule selection (k = 4), cached per crop.
    function view() {
      const c = crops();
      const f = FOLLOW[state.follow];
      if (!c.views[state.follow]) {
        const crop = c.list[f.crop];
        const feats = core.toyFeatures(crop, f.g);
        const sims = core.neighbourSims(feats, f.g);
        const sel = core.selectPositives(sims, 'row', { k: 4 });
        c.views[state.follow] = { f: f, crop: crop, canvas: cropCanvas(f.crop), feats: feats, sims: sims, sel: sel, tokens: null };
      }
      return c.views[state.follow];
    }

    // tokensOf(v): the toy tokens of the crop's 16-pixel patches (Core.toyProject), made on first use.
    function tokensOf(v) {
      if (!v.tokens) v.tokens = core.patchGrid(v.crop, 16).patches.map(function (p) { return core.toyProject(p.rgb); });
      return v.tokens;
    }

    // anchor(): the patch this lab follows in the followed crop.
    function anchor() {
      return state.anchor[state.follow];
    }

    // positivesOf(v, a): the kept neighbours of anchor a under the row rule, in the window table's order.
    function positivesOf(v, a) {
      const nb = core.neighbours8(a, v.f.g);
      return nb.filter(function (j, s) { return v.sel.mask[a * 8 + s] === 1; });
    }

    // heads(v, a): the toy target and prediction for anchor a: teacher = softmax(cos(sum of the positives' features, prototypes) / 0.04), student = softmax(cos(own features, prototypes) / 0.1), and their cross-entropy.
    function heads(v, a) {
      const pos = positivesOf(v, a);
      const sum = new Float64Array(8);
      pos.forEach(function (j) { for (let d = 0; d < 8; d++) sum[d] += v.feats[j][d]; });
      const st = PROTOS.map(function (p) { return core.cosine(sum, p); });
      const ss = PROTOS.map(function (p) { return core.cosine(Float64Array.from(v.feats[a]), p); });
      const target = core.softmax(st, TAU_T);
      const pred = core.softmax(ss, TAU_S);
      return { positives: pos, target: target, pred: pred, ce: core.crossEntropy(target, pred) };
    }

    // meanToken(v, list): the average of the toy tokens of the listed patches (the toy stand-in for the aggregation module).
    function meanToken(v, list) {
      const toks = tokensOf(v);
      const out = new Float64Array(toks[0].length);
      list.forEach(function (j) { for (let d = 0; d < out.length; d++) out[d] += toks[j][d] / list.length; });
      return out;
    }

    // ---------------------------------------------------------------- the control strip

    const prevBtn = el('button', { type: 'button', class: 'btn', id: ID + '-prev', 'aria-label': 'Previous stage', 'aria-controls': ID + '-stage' }, 'Prev');
    const playBtn = el('button', { type: 'button', class: 'btn', id: ID + '-play', 'aria-pressed': 'false', 'aria-controls': ID + '-stage', 'aria-describedby': ID + '-play-hint' }, 'Play');
    const nextBtn = el('button', { type: 'button', class: 'btn btn-primary', id: ID + '-next', 'aria-controls': ID + '-stage' }, 'Next');
    const playHint = el('p', { class: 'control-hint', id: ID + '-play-hint' });
    const dots = el('ol', { class: 'step-dots', id: ID + '-dots', 'aria-label': 'The nine stages' });
    const dotItems = STAGES.map(function (s, i) {
      const b = el('button', { type: 'button', class: 'plain', id: ID + '-dot-' + (i + 1), 'aria-label': 'Stage ' + (i + 1) + ': ' + s.key, style: { width: '100%', height: '100%' } }, String(i + 1));
      const li = el('li', null, b);
      dots.appendChild(li);
      return { li: li, button: b };
    });
    const followGlobal = el('input', { type: 'radio', name: ID + '-follow', id: ID + '-follow-global', value: 'global', checked: true });
    const followLocal = el('input', { type: 'radio', name: ID + '-follow', id: ID + '-follow-local', value: 'local' });
    const newCropsBtn = el('button', { type: 'button', class: 'btn', id: ID + '-new-crops' }, 'Draw new crops');
    const navGroup = el('div', { class: 'control-group' }, [
      el('p', { class: 'control-group-title' }, 'One step, nine stages'),
      el('div', { class: 'button-row' }, [prevBtn, playBtn, nextBtn]),
      dots,
      playHint
    ]);
    const controls = el('div', { class: 'lab-controls' }, [
      navGroup,
      el('div', { class: 'control-group' }, [
        el('p', { class: 'control-group-title', id: ID + '-follow-title' }, 'Follow a crop'),
        el('div', { class: 'segmented', role: 'radiogroup', 'aria-labelledby': ID + '-follow-title' }, [
          el('label', null, [followGlobal, el('span', null, 'global, 224 px')]),
          el('label', null, [followLocal, el('span', null, 'local, 96 px')])
        ]),
        el('p', { class: 'control-hint' }, 'The pictures follow this crop, and so does N in the shapes: N is the number of patches in the crop.'),
        el('div', { class: 'button-row' }, [newCropsBtn]),
        el('p', { class: 'control-hint' }, 'Every real step draws a fresh random set of crops.')
      ])
    ]);
    const chooser = imageChooser(core, ID, 'Picture for the one-step lab');
    if (chooser) controls.appendChild(chooser);

    // ---------------------------------------------------------------- the stage

    const kicker = el('p', { class: 'stage-label', id: ID + '-kicker' });
    const titleText = el('strong', null, '');
    const titleEl = el('p', { id: ID + '-title' }, titleText);
    const narration = el('div', { id: ID + '-text' });
    const diagramBox = el('div', { id: ID + '-diagram' });
    const shapes = el('dl', { class: 'readout', id: ID + '-shapes', 'aria-labelledby': ID + '-shapes-title', style: { display: 'block' } });
    const pics = el('div', { class: 'stage-row', id: ID + '-pictures' });
    const stageEl = el('div', { class: 'lab-stage', id: ID + '-stage' }, [
      el('div', { 'aria-live': 'polite', 'aria-atomic': 'true' }, [kicker, titleEl]),
      narration,
      diagramBox,
      el('ul', { class: 'legend', 'aria-label': 'Colours in this lab' }, [
        el('li', { class: 'role-teacher' }, 'teacher: no gradient'),
        el('li', { class: 'role-student' }, 'student: learns'),
        el('li', { class: 'role-positive' }, 'positives'),
        el('li', null, 'shared input, losses and update')
      ]),
      el('p', { class: 'control-group-title', id: ID + '-shapes-title' }, 'Tensor shapes at this stage'),
      shapes,
      el('p', { class: 'control-group-title' }, 'What happens to the picture (toy)'),
      pics
    ]);

    body.appendChild(controls);
    body.appendChild(stageEl);
    ensureFrame(body, core,
      '<strong>What you are looking at:</strong> one optimiser step of SelfPatch as our package runs it, in nine stages. ' +
      'The diagram shows where the data is, the list gives the real tensor shapes, and the pictures follow one crop and one patch of the picture.',
      '<strong>Real model versus this toy:</strong> the stages, shapes, counts and settings are the real ones, from the papers and our code. ' +
      'The pictures are toys: this page cuts the crops itself, makes tokens with a fixed random projection, measures similarity on 8 simple numbers per patch, ' +
      'scores 12 toy prototypes in place of ' + fact('sp_patch_prototypes') + ', and moves 24 made-up weights. The real student has ' +
      fact('param_student') + ' parameters ' + cite('sp_patch_prototypes', 'param_student') + '.');

    // ---------------------------------------------------------------- what each stage says

    // narrate(i): the stage's explanation for a first-time reader, as trusted HTML with fact spans and source tags.
    function narrate(i) {
      switch (i) {
        case 0:
          return para('One optimiser step starts with a batch of ' + fact('ours_global_batch') + ' pictures, drawn from the ' + fact('coco_train_images') +
              ' images of COCO train2017 ' + cite('ours_global_batch', 'coco_train_images') + '.') +
            para('No labels travel with them: the training package has ' + fact('ours_no_label_reader') + ' ' + cite('ours_no_label_reader') + '.') +
            para('The step can run on several graphics cards (GPUs), and each card takes a share of the batch. In every shape in this lab, B is that share: ' +
              fact('shape_batch_per_gpu') + ' pictures ' + cite('shape_batch_per_gpu') + '. This lab follows one picture; the others take the same path side by side.');
        case 1:
          return para('The picture is cut into ' + fact('crop_total') + ' crops ' + cite('crop_total') + '. The ' + fact('crop_global_count') +
              ' global crops each cover ' + fact('crop_global_scale') + ' of its area and are resized to a square of ' + fact('crop_global_side') +
              ' pixels ' + cite('crop_global_count', 'crop_global_scale') + '. The ' + fact('crop_local_count') + ' local crops each cover ' +
              fact('crop_local_scale') + ' and are resized to ' + fact('crop_local_side') + ' pixels ' + cite('crop_local_count') + '.') +
            para('Each crop is also flipped, recoloured, blurred or turned grey at random, so the network meets the same scene in many versions ' +
              cite('[official code: main_selfpatch.py]') + '.') +
            para('Crops of one size are stacked into one block of numbers, a tensor. Its <dfn data-term="tensor shape">tensor shape</dfn> lists the size ' +
              'along each direction: B pictures, ' + fact('img_channels') + ' colour channels, then the height and the width ' + cite('img_channels') + '.');
        case 2:
          return para('The teacher runs its backbone on ' + fact('sp_teacher_crops') + ', because every crop needs patch targets ' + cite('sp_teacher_crops') + '.') +
            para('The backbone cuts each crop into squares of ' + fact('patch_size') + ' pixels, the patches: a ' + fact('patch_grid_224') +
              ' grid for a global crop and ' + fact('patch_grid_96') + ' for a local one. It turns every patch into a token, a list of ' +
              fact('token_width') + ' numbers ' + cite('patch_size', 'patch_grid_224', 'token_width') + '.') +
            para('Everything the teacher computes passes a ' + fact('loss_stop_gradient') + ': no learning signal flows back into it ' +
              cite('loss_stop_gradient') + '. Its weights change only in the last stage.');
        case 3:
          return para('Now every patch takes a turn as the anchor. The teacher compares it with its ' + fact('nbr_candidates') +
              ' window neighbours, using the ' + fact('nbr_similarity_teacher') + ' ' + cite('nbr_candidates', 'nbr_similarity_teacher') + '.') +
            para('SelfPatch\'s official rule keeps the ' + fact('sp_k') + ' most similar as positives ' + cite('sp_k') + '. The result is a ' +
              '<dfn data-term="selection mask">selection mask</dfn>: for every anchor, one yes-or-no mark per neighbour.') +
            para('At a batch of ' + fact('ours_global_batch') + ' pictures, one step makes this choice for ' + fact('step_anchors') + ' anchors and ' +
              fact('step_links') + ' candidate links ' + cite('step_anchors', 'step_links') + '.') +
            para('This is the stage the thesis works on. Every selection rule keeps the neighbours whose similarity reaches a threshold, ' +
              fact('select_rule_form') + ', and the rules differ only in how that threshold is set ' + cite('select_rule_form') + '. ' +
              'The selector study, told as history in Part 5, changed only that threshold. Our contrastive rule, the subject of Part 5, ranks all ' +
              fact('p5_candidates_224') + ' other patches of a 224-pixel crop in place of the window, and its objective is ' + fact('p5_rule_objective') +
              ', without the patch loss ' + cite('p5_candidates_224', 'p5_rule_objective') + '.') +
            para('Click a patch in the crop below to follow it through the next stages.');
        case 4:
          return para('For each anchor, the teacher\'s aggregation module, a small ' + fact('agg_module') + ', summarises the tokens of its positives ' +
              'into one token ' + cite('agg_module') + '. The anchor\'s own token stays out of that set ' + cite('agg_excludes_anchor') + '.') +
            para('The same module turns all of a crop\'s tokens into one image-level token ' + cite('agg_global_token') + '.') +
            para('Two projection heads then score the tokens against learned prototypes: ' + fact('head_prototypes_global') +
              ' scores for an image-level token and ' + fact('sp_patch_prototypes') + ' for a patch summary ' +
              cite('head_prototypes_global', 'sp_patch_prototypes') + '. The teacher centres the scores, divides them by the temperature ' +
              fact('temp_teacher') + ' and applies a softmax ' + cite('temp_teacher', 'centre_rule') + '. The resulting probabilities are the targets.') +
            para('Of ' + fact('sp_teacher_crops') + ' that the teacher reads, only the global crops supply image-level targets ' + cite('sp_teacher_crops') + '.');
        case 5:
          return para('The student has the ' + fact('dino_same_architecture') + ' as the teacher and reads every crop as well ' +
              cite('dino_same_architecture') + '.') +
            para('For a patch it skips the neighbours: it predicts the target from the patch\'s own token after one LayerNorm, a step that rescales ' +
              'the token\'s numbers, written ' + fact('sp_student_final_ln') + ' ' + cite('sp_asymmetry', 'sp_student_final_ln') + '.') +
            para('The authors found that this asymmetry, together with the stop-gradient, avoids collapse, where every patch ends up with the same output ' +
              cite('sp_asymmetry_collapse') + '.') +
            para('The student\'s image-level token still comes from its aggregation module. Its scores become probabilities at the softer temperature ' +
              fact('temp_student') + ' ' + cite('temp_student') + '.');
        case 6:
          return para('A loss is one number that shrinks as the student\'s probabilities come closer to the teacher\'s. Both losses use the cross-entropy ' +
              fact('loss_cross_entropy') + ' ' + cite('loss_cross_entropy') + '.') +
            para('The image-level loss pairs each global teacher crop with every other student crop: ' + fact('loss_global_pairs') +
              ' pairs, because a crop is never compared with itself ' + cite('loss_global_pairs') + '.') +
            para('The patch loss compares, inside each crop, every patch\'s prediction with the target built for that same patch, and averages over the ' +
              fact('patch_loss_average') + ' crops ' + cite('patch_loss_average', 'patch_targets_every_crop') + '.') +
            para('The total is L = L_global + ' + fact('sp_lambda') + ' ' + TIMES + ' L_patch ' + cite('sp_lambda') + '.');
        case 7:
          return para('The <dfn data-term="backward pass">backward pass</dfn> traces the total loss back through the student. For each of its ' +
              fact('param_student_trainable') + ' trainable parameters, its adjustable weights, it finds how the loss would change if that ' +
              'parameter moved a little: the parameter\'s gradient ' + cite('param_student_trainable') + '. The teacher receives none, because of the stop-gradient.') +
            para('<dfn data-term="gradient clipping">Gradient clipping</dfn> shrinks each tensor\'s gradient to a length of at most ' + fact('ours_clip') +
              ' ' + cite('ours_clip') + '.') +
            para('Then ' + fact('ours_optimiser') + ', the rule that turns gradients into weight changes, moves every trainable weight a small step ' +
              cite('ours_optimiser') + '. The learning rate sets the size of those steps; it rises to ' + fact('ours_lr_peak') + ' over the first ' +
              fact('ours_warmup_epochs') + ' epochs ' + cite('ours_lr_peak') + '. During the first epoch the last layer of both projection heads stays frozen ' +
              cite('ours_freeze_last_layer') + '.');
        default:
          return para('Last, every teacher weight moves a little towards the student\'s: ' + fact('ema_rule') + ' ' + cite('ema_rule') +
              '. This is the exponential moving average, the EMA, from Part 3.') +
            para('Our package raises m along a cosine curve, ' + fact('ema_ours_schedule') + ' ' + cite('ema_ours_schedule') +
              '. Near its start the teacher is roughly an average of the student over the last ' + fact('ema_window_ours_steps') + ' steps ' +
              cite('ema_window_ours_steps') + '.') +
            para('One COCO epoch is ' + fact('ours_steps_per_epoch') + ' steps ' + cite('ours_steps_per_epoch') +
              '. After those steps with m held at its starting value, the step-0 teacher still makes up ' + fact('ema_keep_462_constant') +
              ' of the teacher\'s weights ' + cite('ema_keep_462_constant') + '. Then the next step begins with a new batch.');
      }
    }

    // The shapes of each stage: [label, fact id or null, crop it belongs to ('global', 'local' or ''), text after the value or instead of it].
    const SHAPES = [
      [['Pictures per step', 'ours_global_batch', ''], ['B, pictures per GPU', 'shape_batch_per_gpu', '']],
      [['Each global crop', 'shape_input_global', 'global'], ['Each local crop', 'shape_input_local', 'local']],
      [['Teacher tokens, global crop', 'shape_tokens_224', 'global'], ['Teacher tokens, local crop', 'shape_tokens_96', 'local']],
      [['Similarities and mask, global crop', 'shape_similarities_224', 'global'],
        ['Similarities and mask, local crop', 'shape_similarities_96', 'local']],
      [['Aggregation output, global crop', 'shape_head_output_224', 'global'], ['Patch targets, global crop', 'shape_patch_logits_224', 'global'],
        ['Patch targets, local crop', 'shape_patch_logits_96', 'local'], ['Image-level scores, each crop', 'shape_global_logits', '']],
      [['Student tokens, global crop', 'shape_tokens_224', 'global'], ['Student tokens, local crop', 'shape_tokens_96', 'local'],
        ['Patch predictions, global crop', 'shape_patch_logits_224', 'global'], ['Patch predictions, local crop', 'shape_patch_logits_96', 'local'],
        ['Image-level predictions, each crop', 'shape_global_logits', '']],
      [['Image-level pairs', 'loss_global_pairs', ''], ['Patch loss averaged over', 'patch_loss_average', '', ' crops'],
        ['Weight of the patch loss', 'sp_lambda', ''], ['Each loss', null, '', 'one number']],
      [['Trainable parameters', 'param_student_trainable', ''], ['Gradient', null, '', 'one number per trainable parameter'],
        ['Longest gradient per tensor', 'ours_clip', ''], ['Teacher gradient', null, '', 'none']],
      [['Teacher parameters', 'param_teacher', '', ', changed only by averaging'], ['Momentum m', 'ema_ours_schedule', ''],
        ['Step-0 teacher left after one epoch', 'ema_keep_462_constant', '']]
    ];

    // ---------------------------------------------------------------- the diagram

    const BOX_TEXT = {
      img: ['Images', 'B pictures'],
      crops: [factOf('crop_total')[0] + ' crops', factOf('crop_global_count')[0] + ' global, ' + factOf('crop_local_count')[0] + ' local'],
      t_bb: ['Backbone', 'ViT-S/16'],
      sel: ['Neighbours', 'keep top ' + factOf('sp_k')[0] + ' of ' + factOf('nbr_candidates')[0]],
      t_agg: ['Aggregation', 'summaries'],
      t_heads: ['Heads', 'targets'],
      s_bb: ['Backbone', 'ViT-S/16'],
      s_agg: ['Aggregation', 'image token'],
      s_heads: ['Heads', 'predictions'],
      loss: ['Losses', 'compare'],
      opt: ['AdamW update', '']
    };
    const BOX_ROLE = {
      img: 'neutral', crops: 'neutral', t_bb: 'teacher', sel: 'teacher', t_agg: 'teacher', t_heads: 'teacher',
      s_bb: 'student', s_agg: 'student', s_heads: 'student', loss: 'neutral', opt: 'neutral'
    };
    const LAYOUT = {
      wide: {
        w: 820, h: 364,
        text: { crops: [factOf('crop_total')[0] + ' crops', factOf('crop_global_count')[0] + ' global', factOf('crop_local_count')[0] + ' local'] },
        boxes: {
          img: [6, 141, 84, 64], crops: [108, 141, 92, 64],
          t_bb: [226, 40, 112, 56], sel: [358, 40, 112, 56], t_agg: [490, 40, 112, 56], t_heads: [622, 40, 92, 56],
          s_bb: [226, 250, 112, 56], s_agg: [490, 266, 112, 40], s_heads: [622, 250, 92, 56],
          loss: [734, 133, 80, 80], opt: [330, 332, 140, 26]
        },
        lanes: [[226, 30, 'TEACHER ' + MID + ' no gradient', 'teacher'], [226, 326, 'STUDENT ' + MID + ' learns', 'student']],
        arrows: [
          { key: 'img_crops', role: 'neutral', parts: [[[90, 173], [108, 173]]] },
          { key: 'crops_t', role: 'teacher', parts: [[[200, 165], [213, 165], [213, 68], [226, 68]]] },
          { key: 'crops_s', role: 'student', parts: [[[200, 181], [213, 181], [213, 278], [226, 278]]] },
          { key: 't_sel', role: 'teacher', parts: [[[338, 68], [358, 68]]] },
          { key: 'sel_agg', role: 'teacher', parts: [[[470, 68], [490, 68]]] },
          { key: 'agg_heads', role: 'teacher', parts: [[[602, 68], [622, 68]]] },
          { key: 'targets', role: 'teacher', parts: [[[714, 68], [750, 68], [750, 133]]], labels: [[716, 34, 'targets']] },
          { key: 's_agg', role: 'student', parts: [[[338, 286], [490, 286]]] },
          { key: 'sagg_heads', role: 'student', parts: [[[602, 286], [622, 286]]] },
          { key: 'bypass', role: 'student', parts: [[[338, 258], [622, 258]]], labels: [[346, 252, 'own patch tokens, no aggregation']] },
          { key: 'predictions', role: 'student', parts: [[[714, 278], [750, 278], [750, 213]]], labels: [[700, 322, 'predictions']] },
          {
            key: 'grad', role: 'student', dashed: true,
            parts: [[[798, 213], [798, 345], [470, 345]], [[330, 345], [282, 345], [282, 306]], [[546, 345], [546, 306]], [[668, 345], [668, 306]]],
            labels: [[560, 360, 'gradients']]
          },
          { key: 'ema', role: 'teacher', dashed: true, parts: [[[282, 250], [282, 96]]], labels: [[290, 184, 'EMA']] }
        ],
        pills: [
          [[6, 213, 'B pictures']],
          [[6, 213, factOf('shape_input_global')[0] + ', ' + factOf('crop_global_count')[0] + ' crops'],
            [6, 235, factOf('shape_input_local')[0] + ', ' + factOf('crop_local_count')[0] + ' crops']],
          [[292, 104, 'B x {N} x ' + factOf('token_width')[0]]],
          [[358, 104, 'B x {N} x ' + factOf('nbr_candidates')[0]]],
          [[490, 104, factOf('shape_head_output_224')[0], 'global'], [612, 104, 'B x {N} x ' + factOf('sp_patch_prototypes')[0]],
            [612, 126, factOf('shape_global_logits')[0]]],
          [[292, 222, 'B x {N} x ' + factOf('token_width')[0]], [612, 200, 'B x {N} x ' + factOf('sp_patch_prototypes')[0]],
            [612, 222, factOf('shape_global_logits')[0]]],
          [[420, 150, 'L = L_global + ' + factOf('sp_lambda')[0] + ' x L_patch'], [420, 174, 'L_global: ' + factOf('loss_global_pairs')[0] + ' pairs']],
          [[400, 164, factOf('param_student_trainable')[0] + ' gradients, clip ' + factOf('ours_clip')[0]]],
          [[292, 138, 'm: ' + factOf('ema_ours_schedule')[0]]]
        ]
      },
      tall: {
        w: 340, h: 512,
        boxes: {
          img: [110, 6, 120, 40], crops: [110, 64, 120, 40],
          t_bb: [6, 140, 152, 44], s_bb: [182, 140, 152, 44],
          sel: [6, 206, 152, 44],
          t_agg: [6, 272, 152, 44], s_agg: [228, 272, 106, 44],
          t_heads: [6, 338, 152, 44], s_heads: [182, 338, 152, 44],
          loss: [96, 410, 148, 48], opt: [100, 478, 140, 26]
        },
        lanes: [[6, 132, 'TEACHER ' + MID + ' no gradient', 'teacher'], [212, 132, 'STUDENT ' + MID + ' learns', 'student']],
        arrows: [
          { key: 'img_crops', role: 'neutral', parts: [[[170, 46], [170, 64]]] },
          { key: 'crops_t', role: 'teacher', parts: [[[148, 104], [148, 140]]] },
          { key: 'crops_s', role: 'student', parts: [[[200, 104], [200, 140]]] },
          { key: 't_sel', role: 'teacher', parts: [[[82, 184], [82, 206]]] },
          { key: 'sel_agg', role: 'teacher', parts: [[[82, 250], [82, 272]]] },
          { key: 'agg_heads', role: 'teacher', parts: [[[82, 316], [82, 338]]] },
          { key: 'targets', role: 'teacher', parts: [[[82, 382], [82, 434], [96, 434]]], labels: [[20, 404, 'targets']] },
          { key: 's_agg', role: 'student', parts: [[[281, 184], [281, 272]]] },
          { key: 'sagg_heads', role: 'student', parts: [[[281, 316], [281, 338]]] },
          { key: 'bypass', role: 'student', parts: [[[200, 184], [200, 338]]], labels: [[214, 226, 'own patch'], [214, 238, 'tokens']] },
          { key: 'predictions', role: 'student', parts: [[[258, 382], [258, 434], [244, 434]]], labels: [[264, 404, 'predictions']] },
          { key: 'grad', role: 'student', dashed: true, parts: [[[170, 458], [170, 478]], [[240, 491], [326, 491], [326, 382]]], labels: [[250, 506, 'gradients']] },
          { key: 'ema', role: 'teacher', dashed: true, parts: [[[182, 162], [158, 162]]], labels: [[170, 198, 'EMA', 'middle']] }
        ],
        pills: null
      }
    };
    const ACTIVE = [
      ['img'],
      ['crops', 'a:img_crops'],
      ['t_bb', 'a:crops_t'],
      ['sel', 'a:t_sel'],
      ['t_agg', 't_heads', 'a:sel_agg', 'a:agg_heads'],
      ['s_bb', 's_agg', 's_heads', 'a:crops_s', 'a:s_agg', 'a:sagg_heads', 'a:bypass'],
      ['loss', 'a:targets', 'a:predictions'],
      ['opt', 's_bb', 's_agg', 's_heads', 'a:grad'],
      ['t_bb', 't_agg', 't_heads', 'a:ema']
    ];

    // sv(tag, attrs, children): an SVG element made with Core.el in the SVG namespace.
    function sv(tag, attrs, children) {
      return el('svg:' + tag, attrs, children);
    }

    // statusOf(key): 'now' when the element belongs to the current stage, 'done' when to an earlier one, else 'later'.
    function statusOf(key) {
      if (ACTIVE[state.stage].indexOf(key) >= 0) return 'now';
      for (let s = 0; s < state.stage; s++) if (ACTIVE[s].indexOf(key) >= 0) return 'done';
      return 'later';
    }

    // roleColour(role): the CSS colour of a lane: teacher blue, student green, shared parts ink.
    function roleColour(role) {
      if (role === 'teacher') return 'var(--teacher)';
      if (role === 'student') return 'var(--student)';
      return 'var(--ink)';
    }

    // arrowHead(p, q, size): the three corners of an arrowhead with its tip at q, pointing away from p.
    function arrowHead(p, q, size) {
      const dx = q[0] - p[0], dy = q[1] - p[1];
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const ux = dx / len, uy = dy / len;
      const bx = q[0] - ux * size, by = q[1] - uy * size;
      const w = size * 0.55;
      return [q[0] + ',' + q[1], (bx - uy * w) + ',' + (by + ux * w), (bx + uy * w) + ',' + (by - ux * w)].join(' ');
    }

    // drawArrow(svg, a): one arrow of the diagram (possibly several branches), faded when its stage is still to come.
    function drawArrow(svg, a) {
      const st = statusOf('a:' + a.key);
      const colour = roleColour(a.role);
      const g = sv('g', { opacity: st === 'later' ? '0.42' : '1' });
      a.parts.forEach(function (pts) {
        g.appendChild(sv('polyline', {
          points: pts.map(function (p) { return p[0] + ',' + p[1]; }).join(' '),
          style: 'fill: none; stroke: ' + colour + '; stroke-width: ' + (st === 'now' ? 2.5 : 1.5) + (a.dashed ? '; stroke-dasharray: 5 4' : '')
        }));
        g.appendChild(sv('polygon', { points: arrowHead(pts[pts.length - 2], pts[pts.length - 1], st === 'now' ? 9 : 7), style: 'fill: ' + colour }));
      });
      (a.labels || []).forEach(function (lab) {
        g.appendChild(sv('text', { x: lab[0], y: lab[1], 'text-anchor': lab[3] || 'start', style: 'fill: var(--muted); font-size: 10px' }, lab[2]));
      });
      svg.appendChild(g);
    }

    // drawBox(svg, key, r, L): one box of the diagram, filled in its lane's colour, outlined boldly at its own stage and faded before it; L may give the box other lines of text.
    function drawBox(svg, key, r, L) {
      const st = statusOf(key);
      const role = BOX_ROLE[key];
      const colour = roleColour(role);
      const now = st === 'now';
      let fill, fo;
      if (role === 'neutral') {
        fill = now ? 'var(--sunken)' : 'var(--surface)';
        fo = '1';
      } else {
        fill = colour;
        fo = now ? '0.18' : (st === 'done' ? '0.07' : '0.04');
      }
      const g = sv('g', { opacity: st === 'later' ? '0.45' : '1' });
      g.appendChild(sv('rect', {
        x: r[0], y: r[1], width: r[2], height: r[3], rx: key === 'opt' ? r[3] / 2 : 6,
        style: 'fill: ' + fill + '; fill-opacity: ' + fo + '; stroke: ' + colour + '; stroke-width: ' + (now ? 2.5 : 1.25)
      }));
      const txt = (L && L.text && L.text[key]) || BOX_TEXT[key];
      const cx = r[0] + r[2] / 2, cy = r[1] + r[3] / 2;
      const titleStyle = 'fill: var(--ink); font-family: var(--font-body); font-size: 13px; font-weight: ' + (now ? 700 : 600);
      const subStyle = 'fill: var(--muted); font-size: 10.5px';
      if (txt[2]) {
        g.appendChild(sv('text', { x: cx, y: cy - 9, 'text-anchor': 'middle', style: titleStyle }, txt[0]));
        g.appendChild(sv('text', { x: cx, y: cy + 6, 'text-anchor': 'middle', style: subStyle }, sym(txt[1])));
        g.appendChild(sv('text', { x: cx, y: cy + 19, 'text-anchor': 'middle', style: subStyle }, sym(txt[2])));
      } else if (txt[1]) {
        g.appendChild(sv('text', { x: cx, y: cy - 3, 'text-anchor': 'middle', style: titleStyle }, txt[0]));
        g.appendChild(sv('text', { x: cx, y: cy + 12, 'text-anchor': 'middle', style: subStyle }, sym(txt[1])));
      } else {
        g.appendChild(sv('text', { x: cx, y: cy + 4.5, 'text-anchor': 'middle', style: titleStyle }, txt[0]));
      }
      svg.appendChild(g);
    }

    // drawPill(svg, x, y, text): a tensor shape written in a small rounded box on the diagram.
    function drawPill(svg, x, y, text) {
      const w = Math.round(text.length * 6.3 + 12);
      svg.appendChild(sv('rect', { x: x, y: y, width: w, height: 18, rx: 4, style: 'fill: var(--surface); stroke: var(--control); stroke-width: 1' }));
      svg.appendChild(sv('text', { x: x + 6, y: y + 13, style: 'fill: var(--ink); font-size: 10.5px' }, text));
    }

    // renderDiagram(): redraw the step diagram for the current stage, wide when the stage has room and tall on a narrow screen.
    function renderDiagram() {
      state.layout = (diagramBox.clientWidth || 0) >= WIDE_MIN ? 'wide' : 'tall';
      const L = LAYOUT[state.layout];
      const f = FOLLOW[state.follow];
      clear(diagramBox);
      const svg = sv('svg', {
        class: 'chart', viewBox: '0 0 ' + L.w + ' ' + L.h, role: 'img', 'aria-labelledby': ID + '-diagram-title',
        style: 'display: block; width: 100%; height: auto; max-width: ' + L.w + 'px'
      });
      svg.appendChild(sv('title', { id: ID + '-diagram-title' },
        'Diagram of one optimiser step, stage ' + (state.stage + 1) + ' of ' + STAGES.length + ' highlighted: ' + STAGES[state.stage].title +
        '. Blue boxes belong to the teacher, which gets no gradient; green boxes belong to the student.'));
      L.arrows.forEach(function (a) { drawArrow(svg, a); });
      Object.keys(L.boxes).forEach(function (key) { drawBox(svg, key, L.boxes[key], L); });
      if (L.pills) {
        L.pills[state.stage].forEach(function (p) {
          if (p[3] && p[3] !== state.follow) return;
          drawPill(svg, p[0], p[1], sym(p[2].split('{N}').join(String(f.n))));
        });
      }
      L.lanes.forEach(function (lane) {
        svg.appendChild(sv('text', {
          x: lane[0], y: lane[1],
          style: 'fill: ' + roleColour(lane[3]) + '; font-size: 10.5px; font-weight: 700' + (state.layout === 'wide' ? '; letter-spacing: 0.04em' : '')
        }, lane[2]));
      });
      diagramBox.appendChild(svg);
    }

    // ---------------------------------------------------------------- pictures

    // picture(w, h, label): a new stage cell with a canvas of w x h CSS pixels and its label under it.
    function picture(w, h, label) {
      const canvas = el('canvas', { role: 'img', 'aria-label': label });
      const ctx = core.fitCanvas(canvas, w, h);
      const lab = el('p', { class: 'stage-label', style: { maxWidth: w + 'px' } }, label);
      pics.appendChild(el('div', { class: 'stage-cell' }, [canvas, lab]));
      return { canvas: canvas, ctx: ctx, w: w, h: h };
    }

    // drawCrop(ctx, size, v, mode): the followed crop with its patch grid; 'select' adds the anchor, its candidates and positives, 'targets' the positives, 'student' the anchor alone.
    function drawCrop(ctx, size, v, mode) {
      const t = core.theme();
      const g = v.f.g, cell = size / g, pw = v.crop.width / g, a = anchor();
      const nb = core.neighbours8(a, g);
      ctx.fillStyle = t.paper;
      ctx.fillRect(0, 0, size, size);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(v.canvas, 0, 0, size, size);
      if (mode !== 'grid') {
        ctx.fillStyle = core.rgba(t.paper, 0.5);
        ctx.fillRect(0, 0, size, size);
        const show = mode === 'student' ? [a] : (mode === 'targets' ? [a].concat(positivesOf(v, a)) : [a].concat(nb));
        show.forEach(function (i) {
          const r = Math.floor(i / g), c = i % g;
          ctx.drawImage(v.canvas, c * pw, r * pw, pw, pw, c * cell, r * cell, cell, cell);
        });
      }
      const lane = mode === 'student' ? t.student : t.teacher;
      ctx.strokeStyle = core.rgba(lane, 0.75);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i <= g; i++) {
        const p = Math.min(size - 0.5, Math.round(i * cell) + 0.5);
        ctx.moveTo(p, 0);
        ctx.lineTo(p, size);
        ctx.moveTo(0, p);
        ctx.lineTo(size, p);
      }
      ctx.stroke();
      if (mode === 'grid') return;
      if (mode !== 'student') {
        nb.forEach(function (j, s) {
          const kept = v.sel.mask[a * 8 + s] === 1;
          if (mode === 'targets' && !kept) return;
          const x = (j % g) * cell, y = Math.floor(j / g) * cell;
          if (kept) {
            ctx.fillStyle = core.rgba(t.positive, 0.28);
            ctx.fillRect(x, y, cell, cell);
            ctx.strokeStyle = t.positive;
            ctx.lineWidth = 2.5;
            ctx.strokeRect(x + 1.25, y + 1.25, cell - 2.5, cell - 2.5);
          } else {
            ctx.setLineDash([3, 2]);
            ctx.strokeStyle = t.ignored;
            ctx.lineWidth = 1.5;
            ctx.strokeRect(x + 1, y + 1, cell - 2, cell - 2);
            ctx.setLineDash([]);
          }
        });
      }
      const ax = (a % g) * cell, ay = Math.floor(a / g) * cell;
      ctx.strokeStyle = t.paper;
      ctx.lineWidth = 5;
      ctx.strokeRect(ax + 1, ay + 1, cell - 2, cell - 2);
      ctx.strokeStyle = mode === 'student' ? t.student : t.ink;
      ctx.lineWidth = 3;
      ctx.strokeRect(ax + 1, ay + 1, cell - 2, cell - 2);
    }

    // cropPicture(size, mode, label): the followed crop as a stage cell; outside mode 'grid' a click or an arrow key chooses the patch to follow.
    function cropPicture(size, mode, label) {
      const v = view();
      const pic = picture(size, size, label);
      drawCrop(pic.ctx, size, v, mode);
      if (mode === 'grid') return pic;
      const g = v.f.g;
      pic.canvas.setAttribute('tabindex', '0');
      pic.canvas.removeAttribute('role');
      pic.canvas.setAttribute('id', ID + '-crop');
      pic.canvas.style.cursor = 'pointer';
      pic.canvas.addEventListener('click', core.guard(body, function (ev) {
        const p = core.canvasPoint(pic.canvas, ev, size, size);
        const c = Math.floor(p.x / (size / g)), r = Math.floor(p.y / (size / g));
        if (r < 0 || r >= g || c < 0 || c >= g) return;
        state.anchor[state.follow] = r * g + c;
        renderPictures();
      }));
      pic.canvas.addEventListener('keydown', core.guard(body, function (ev) {
        const a = anchor();
        let r = Math.floor(a / g), c = a % g;
        if (ev.key === 'ArrowUp') r = Math.max(0, r - 1);
        else if (ev.key === 'ArrowDown') r = Math.min(g - 1, r + 1);
        else if (ev.key === 'ArrowLeft') c = Math.max(0, c - 1);
        else if (ev.key === 'ArrowRight') c = Math.min(g - 1, c + 1);
        else return;
        ev.preventDefault();
        ev.stopPropagation();
        state.anchor[state.follow] = r * g + c;
        focusCrop = true;
        renderPictures();
      }));
      return pic;
    }

    // drawToken(ctx, x, y, values, colour, t): a token of 384 numbers as a block of 32 x 12 small cells, darker for larger values.
    function drawToken(ctx, x, y, values, colour, t) {
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < values.length; i++) {
        if (values[i] < lo) lo = values[i];
        if (values[i] > hi) hi = values[i];
      }
      const span = hi - lo || 1;
      const cols = 32, cell = 6;
      for (let i = 0; i < values.length; i++) {
        const rgb = mixRgb(core, t.paper, colour, 0.08 + 0.92 * (values[i] - lo) / span);
        ctx.fillStyle = 'rgb(' + rgb[0] + ', ' + rgb[1] + ', ' + rgb[2] + ')';
        ctx.fillRect(x + (i % cols) * cell, y + Math.floor(i / cols) * cell, cell, cell);
      }
      ctx.strokeStyle = colour;
      ctx.lineWidth = 1;
      ctx.strokeRect(x - 0.5, y - 0.5, cols * cell + 1, Math.ceil(values.length / cols) * cell + 1);
    }

    // drawMatrix(ctx, w, h, rows, colour, t): N token rows of 384 numbers as one picture, one row per patch, stronger colour for larger values.
    function drawMatrix(ctx, w, h, rows, colour, t) {
      const n = rows.length, d = rows[0].length;
      const all = [];
      rows.forEach(function (r) { for (let i = 0; i < d; i += 7) all.push(r[i]); });
      all.sort(function (a, b) { return a - b; });
      const lo = all[Math.floor(0.02 * (all.length - 1))], hi = all[Math.floor(0.98 * (all.length - 1))];
      const span = hi - lo || 1;
      const off = el('canvas');
      off.width = d;
      off.height = n;
      const octx = off.getContext('2d');
      const img = octx.createImageData(d, n);
      const p = core.parseColour(t.paper) || [255, 255, 255, 1], q = core.parseColour(colour) || [0, 0, 0, 1];
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < d; c++) {
          const s = Math.max(0, Math.min(1, (rows[r][c] - lo) / span));
          const k = (r * d + c) * 4;
          img.data[k] = Math.round(p[0] + (q[0] - p[0]) * s);
          img.data[k + 1] = Math.round(p[1] + (q[1] - p[1]) * s);
          img.data[k + 2] = Math.round(p[2] + (q[2] - p[2]) * s);
          img.data[k + 3] = 255;
        }
      }
      octx.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = n < h;
      ctx.drawImage(off, 0, 0, w, h);
      ctx.strokeStyle = colour;
      ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
    }

    // drawBars(ctx, w, h, a, b, t, colour): probabilities over the toy prototypes as bars; with b, a is drawn as blue outlines and b as green bars beside them.
    function drawBars(ctx, w, h, a, b, t, colour) {
      const n = a.length, base = h - 14, top = 16, gap = w / n;
      ctx.fillStyle = t.paper;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = t.muted;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, base + 0.5);
      ctx.lineTo(w, base + 0.5);
      ctx.stroke();
      let best = 0;
      for (let i = 0; i < n; i++) if (a[i] > a[best]) best = i;
      for (let i = 0; i < n; i++) {
        const x = i * gap;
        const ha = a[i] * (base - top);
        if (b) {
          const hb = b[i] * (base - top);
          ctx.strokeStyle = t.teacher;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(x + 1.75, base - ha + 0.75, gap * 0.5 - 2, Math.max(0.5, ha - 0.75));
          ctx.fillStyle = t.student;
          ctx.fillRect(x + gap * 0.5, base - hb, gap * 0.5 - 2, hb);
        } else {
          ctx.fillStyle = colour;
          ctx.fillRect(x + 2, base - ha, gap - 4, ha);
        }
        centreText(ctx, String(i + 1), x + gap / 2, base + 7, mono(8, 500), t.muted);
      }
      if (!b) centreText(ctx, num(a[best], 2), best * gap + gap / 2, Math.max(8, base - a[best] * (base - top) - 7), mono(9, 700), t.ink);
    }

    // drawWeights(ctx, w, h, rows, t): toy weights as bars around a zero line; each row has a title and its series drawn as outlines, fills or dots.
    function drawWeights(ctx, w, h, rows, t) {
      let big = 0;
      rows.forEach(function (row) { row.series.forEach(function (s) { s.values.forEach(function (x) { big = Math.max(big, Math.abs(x)); }); }); });
      big = big || 1;
      ctx.fillStyle = t.paper;
      ctx.fillRect(0, 0, w, h);
      const rh = h / rows.length;
      const step = w / NW;
      rows.forEach(function (row, ri) {
        const y0 = ri * rh, mid = y0 + 14 + (rh - 18) / 2, amp = (rh - 22) / 2;
        ctx.fillStyle = t.ink;
        ctx.font = mono(9, 600);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(row.title, 0, y0 + 1);
        ctx.strokeStyle = t.line;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, mid + 0.5);
        ctx.lineTo(w, mid + 0.5);
        ctx.stroke();
        row.series.forEach(function (s) {
          s.values.forEach(function (x, i) {
            const bh = x / big * amp;
            const bx = i * step + 1.5, bw = step - 3;
            if (s.style === 'fill') {
              ctx.fillStyle = s.colour;
              ctx.fillRect(bx + 1.5, Math.min(mid, mid - bh), bw - 3, Math.abs(bh));
            } else if (s.style === 'dot') {
              ctx.fillStyle = s.colour;
              ctx.beginPath();
              ctx.arc(bx + bw / 2, mid - bh, 2.5, 0, 2 * Math.PI);
              ctx.fill();
            } else {
              ctx.strokeStyle = s.colour;
              ctx.lineWidth = 1.25;
              ctx.strokeRect(bx + 0.5, Math.min(mid, mid - bh) + 0.5, bw - 1, Math.max(0.5, Math.abs(bh) - 1));
            }
          });
        });
      });
    }

    // arrowDown(ctx, x, y1, y2, colour): a short arrow pointing down, drawn between two parts of a picture.
    function arrowDown(ctx, x, y1, y2, colour) {
      ctx.strokeStyle = colour;
      ctx.fillStyle = colour;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y1);
      ctx.lineTo(x, y2 - 5);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - 4, y2 - 6);
      ctx.lineTo(x + 4, y2 - 6);
      ctx.lineTo(x, y2);
      ctx.closePath();
      ctx.fill();
    }

    // patchThumb(ctx, v, j, x, y, size, frame, t): patch j of the followed crop drawn at (x, y), with a coloured frame.
    function patchThumb(ctx, v, j, x, y, size, frame) {
      const g = v.f.g, pw = v.crop.width / g;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(v.canvas, (j % g) * pw, Math.floor(j / g) * pw, pw, pw, x, y, size, size);
      ctx.strokeStyle = frame;
      ctx.lineWidth = 2.5;
      ctx.strokeRect(x + 1.25, y + 1.25, size - 2.5, size - 2.5);
    }

    const PICTURES = [
      // stage 1: one picture, with the rest of the batch stacked behind it
      function () {
        const t = core.theme();
        const pic = picture(200, 188, 'The picture this lab follows. The rest of the batch stacks behind it.');
        const ctx = pic.ctx;
        ctx.fillStyle = t.paper;
        ctx.fillRect(0, 0, 200, 188);
        [[28, 0], [14, 10]].forEach(function (o) {
          ctx.fillStyle = core.rgba(t.ink, 0.06);
          ctx.fillRect(o[0], o[1], 168, 168);
          ctx.strokeStyle = t.muted;
          ctx.lineWidth = 1;
          ctx.strokeRect(o[0] + 0.5, o[1] + 0.5, 167, 167);
        });
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(overviewCanvas(), 0, 20, 168, 168);
        ctx.strokeStyle = t.line;
        ctx.strokeRect(0.5, 20.5, 167, 167);
      },
      // stage 2: where the crops come from, and the ten crops
      function () {
        const t = core.theme();
        const c = crops();
        const over = picture(184, 184, 'Where the 10 crops come from. Solid frames: the 2 global crops. Dashed frames: the 8 local crops.');
        over.ctx.imageSmoothingEnabled = true;
        over.ctx.drawImage(sourceCanvas(), 0, 0, 184, 184);
        const k = 184 / SRC_SIDE;
        c.rects.all.forEach(function (r) {
          over.ctx.strokeStyle = t.paper;
          over.ctx.lineWidth = r.kind === 'global' ? 4 : 3;
          over.ctx.strokeRect(r.x * k + 1, r.y * k + 1, r.w * k - 2, r.h * k - 2);
          over.ctx.strokeStyle = t.ink;
          over.ctx.lineWidth = r.kind === 'global' ? 2 : 1.25;
          over.ctx.setLineDash(r.kind === 'global' ? [] : [4, 3]);
          over.ctx.strokeRect(r.x * k + 1, r.y * k + 1, r.w * k - 2, r.h * k - 2);
          over.ctx.setLineDash([]);
        });
        const glob = picture(200, 96, 'The 2 global crops, resized to 224 pixels (drawn smaller)');
        [0, 1].forEach(function (i) {
          glob.ctx.imageSmoothingEnabled = true;
          glob.ctx.drawImage(cropCanvas(i), i * 104, 0, 96, 96);
          glob.ctx.strokeStyle = t.line;
          glob.ctx.strokeRect(i * 104 + 0.5, 0.5, 95, 95);
        });
        const loc = picture(194, 94, 'The 8 local crops, resized to 96 pixels');
        for (let i = 0; i < 8; i++) {
          const x = (i % 4) * 50, y = Math.floor(i / 4) * 50;
          loc.ctx.imageSmoothingEnabled = true;
          loc.ctx.drawImage(cropCanvas(2 + i), x, y, 44, 44);
          loc.ctx.strokeStyle = t.line;
          loc.ctx.strokeRect(x + 0.5, y + 0.5, 43, 43);
        }
      },
      // stage 3: the followed crop as patches, and its tokens
      function () {
        const t = core.theme();
        const v = view();
        cropPicture(196, 'grid', v.f.name + ' cut into ' + v.f.g + ' ' + TIMES + ' ' + v.f.g + ' patches');
        const pic = picture(196, 196, 'Its ' + v.f.n + ' tokens, one row per patch, 384 numbers wide (toy values; stronger blue means larger)');
        drawMatrix(pic.ctx, 196, 196, tokensOf(v), t.teacher, t);
      },
      // stage 4: the anchor's candidates and positives, and the crop's selection mask
      function () {
        const t = core.theme();
        const v = view();
        const a = anchor();
        cropPicture(196, 'select', 'Click a patch to follow it. Orange: its 4 positives. Dashed: its other candidates.');
        const n = v.f.n, colW = n > 100 ? 2 : 8;
        const pic = picture(n * colW, 64, 'Selection mask of this crop: one column per anchor, one cell per candidate, orange where kept');
        const ctx = pic.ctx;
        ctx.fillStyle = t.paper;
        ctx.fillRect(0, 0, n * colW, 64);
        for (let i = 0; i < n; i++) {
          for (let s = 0; s < 8; s++) {
            ctx.fillStyle = v.sel.mask[i * 8 + s] === 1 ? t.positive : core.rgba(t.ignored, 0.3);
            ctx.fillRect(i * colW, 4 + s * 7, Math.max(1, colW - (colW > 2 ? 1 : 0)), 6);
          }
        }
        ctx.strokeStyle = t.ink;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(a * colW - 1.25, 1.75, colW + 1.5, 60.5);
      },
      // stage 5: the positives become one summary, and the summary becomes the target
      function () {
        const t = core.theme();
        const v = view();
        const a = anchor();
        const h = heads(v, a);
        cropPicture(150, 'targets', 'The patch you follow and its ' + factOf('sp_k')[0] + ' positives');
        const sum = picture(200, 150, factOf('sp_k')[0] + ' positives ' + RARR + ' 1 summary token of ' + factOf('token_width')[0] + ' numbers (toy: their average)');
        sum.ctx.fillStyle = t.paper;
        sum.ctx.fillRect(0, 0, 200, 150);
        h.positives.forEach(function (j, i) { patchThumb(sum.ctx, v, j, 8 + i * 48, 4, 40, t.positive); });
        arrowDown(sum.ctx, 100, 50, 68, t.teacher);
        drawToken(sum.ctx, 4, 74, meanToken(v, h.positives), t.teacher, t);
        const bars = picture(200, 150, 'Target: probabilities over 12 toy prototypes (the real patch head has ' + factOf('sp_patch_prototypes')[0] +
          '), sharpened with temperature ' + factOf('temp_teacher')[0]);
        drawBars(bars.ctx, 200, 150, h.target, null, t, t.teacher);
      },
      // stage 6: the student predicts from the patch's own token
      function () {
        const t = core.theme();
        const v = view();
        const a = anchor();
        const h = heads(v, a);
        cropPicture(150, 'student', 'The student looks at the patch itself');
        const own = picture(200, 150, 'Own patch ' + RARR + ' own token of ' + factOf('token_width')[0] + ' numbers (toy values)');
        own.ctx.fillStyle = t.paper;
        own.ctx.fillRect(0, 0, 200, 150);
        patchThumb(own.ctx, v, a, 80, 4, 40, t.student);
        arrowDown(own.ctx, 100, 50, 68, t.student);
        drawToken(own.ctx, 4, 74, tokensOf(v)[a], t.student, t);
        const bars = picture(200, 150, 'Prediction over the same 12 toy prototypes, temperature ' + factOf('temp_student')[0]);
        drawBars(bars.ctx, 200, 150, h.pred, null, t, t.student);
      },
      // stage 7: the 18 image-level pairs, and the patch loss for the followed patch
      function () {
        const t = core.theme();
        const v = view();
        const h = heads(v, anchor());
        const pairs = picture(236, 76, 'Image-level loss: ' + factOf('loss_global_pairs')[0] + ' pairs. Each global teacher crop meets the ' +
          (Number(factOf('crop_total')[0]) - 1) + ' other student crops, never itself.');
        const ctx = pairs.ctx;
        ctx.fillStyle = t.paper;
        ctx.fillRect(0, 0, 236, 76);
        for (let j = 0; j < 10; j++) {
          centreText(ctx, String(j + 1), 34 + j * 20 + 9, 8, mono(9, 600), t.ink);
          ctx.fillStyle = t.student;
          ctx.fillRect(34 + j * 20, 15, 18, 3);
        }
        for (let i = 0; i < 2; i++) {
          const y = 22 + i * 26;
          ctx.fillStyle = t.teacher;
          ctx.fillRect(0, y, 3, 22);
          centreText(ctx, 'T' + (i + 1), 17, y + 11, mono(9, 700), t.ink);
          for (let j = 0; j < 10; j++) {
            const x = 34 + j * 20;
            if (i === j) {
              ctx.strokeStyle = t.muted;
              ctx.lineWidth = 1;
              ctx.strokeRect(x + 0.5, y + 0.5, 17, 21);
              ctx.beginPath();
              ctx.moveTo(x + 3, y + 3);
              ctx.lineTo(x + 15, y + 19);
              ctx.moveTo(x + 15, y + 3);
              ctx.lineTo(x + 3, y + 19);
              ctx.stroke();
            } else {
              ctx.fillStyle = core.rgba(t.ink, 0.62);
              ctx.fillRect(x, y, 18, 22);
            }
          }
        }
        const cmp = picture(236, 150, 'Patch loss for the patch you follow: the teacher\'s target (blue outlines) against the student\'s prediction (green). Toy cross-entropy: ' +
          num(h.ce, 3) + ' nats.');
        drawBars(cmp.ctx, 236, 150, h.target, h.pred, t, null);
      },
      // stage 8: the student's toy weights before and after one step; the teacher's stay
      function () {
        const t = core.theme();
        const pic = picture(240, 150, 'Toy weights. Green: the student before (outlines) and after (filled) one step, exaggerated so you can see it. ' +
          'Blue: the teacher, unchanged. The toy gradient has length ' + num(WEIGHTS.len, 2) + ' and is clipped to ' + factOf('ours_clip')[0] + '.');
        drawWeights(pic.ctx, 240, 150, [
          { title: 'student', series: [{ values: WEIGHTS.w0, colour: t.student, style: 'outline' }, { values: WEIGHTS.w1, colour: t.student, style: 'fill' }] },
          { title: 'teacher (no gradient)', series: [{ values: WEIGHTS.w0, colour: t.teacher, style: 'outline' }] }
        ], t);
      },
      // stage 9: one EMA step of the teacher, and what one epoch of such steps leaves of the step-0 teacher
      function () {
        const t = core.theme();
        const pic = picture(240, 110, 'Toy weights. The teacher before (blue outlines) and after one EMA step (blue fill), and the student (green dots). ' +
          'It moves 1 ' + MINUS + ' m of the gap: at most ' + num(WEIGHTS.move, 4) + ' here.');
        drawWeights(pic.ctx, 240, 110, [
          { title: 'teacher and student', series: [
            { values: WEIGHTS.w0, colour: t.teacher, style: 'outline' },
            { values: WEIGHTS.t1, colour: t.teacher, style: 'fill' },
            { values: WEIGHTS.w1, colour: t.student, style: 'dot' }
          ] }
        ], t);
        const sp = picture(200, 110, 'Share of the step-0 teacher left over one epoch at a constant m of ' + factOf('ema_ours_schedule')[0].split(' ')[0] + ': ' +
          factOf('ema_keep_462_constant')[0] + ' after ' + factOf('ours_steps_per_epoch')[0] + ' steps');
        const ctx = sp.ctx;
        const x0 = 34, x1 = 192, y0 = 12, y1 = 88;
        const lo = 0.75;
        ctx.fillStyle = t.paper;
        ctx.fillRect(0, 0, 200, 110);
        ctx.strokeStyle = t.muted;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x0 + 0.5, y0);
        ctx.lineTo(x0 + 0.5, y1 + 0.5);
        ctx.lineTo(x1, y1 + 0.5);
        ctx.stroke();
        ctx.strokeStyle = t.teacher;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let s = 0; s <= EPOCH_STEPS; s += 6) {
          const share = core.teacherRemaining(s, { m: MOMENTUM });
          const x = x0 + (x1 - x0) * s / EPOCH_STEPS, y = y1 - (y1 - y0) * (share - lo) / (1 - lo);
          if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        const end = core.teacherRemaining(EPOCH_STEPS, { m: MOMENTUM });
        const ey = y1 - (y1 - y0) * (end - lo) / (1 - lo);
        ctx.lineTo(x1, ey);
        ctx.stroke();
        ctx.fillStyle = t.teacher;
        ctx.beginPath();
        ctx.arc(x1, ey, 3, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillStyle = t.ink;
        ctx.font = mono(9, 500);
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText('1.0', x0 - 4, y0);
        ctx.fillText(num(end, 3), x0 - 4, ey);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText('0', x0, y1 + 5);
        ctx.fillText(String(EPOCH_STEPS) + ' steps', x1 - 20, y1 + 5);
      }
    ];

    // renderPictures(): redraw the toy pictures of the current stage (and give the keyboard back to the crop when a key moved the patch).
    function renderPictures() {
      clear(pics);
      PICTURES[state.stage]();
      if (focusCrop) {
        focusCrop = false;
        const c = root.document ? root.document.getElementById(ID + '-crop') : null;
        if (c) {
          try { c.focus({ preventScroll: true }); } catch (e) { c.focus(); }
        }
      }
    }

    // ---------------------------------------------------------------- text beside the diagram

    // renderNav(): the stage counter, the title, the dots and the Prev and Next buttons.
    function renderNav() {
      const i = state.stage;
      kicker.textContent = 'Stage ' + (i + 1) + ' of ' + STAGES.length + ' ' + MID + ' ' + STAGES[i].key;
      titleText.textContent = STAGES[i].title;
      if (i === 0) prevBtn.setAttribute('aria-disabled', 'true'); else prevBtn.removeAttribute('aria-disabled');
      if (i === LAST) nextBtn.setAttribute('aria-disabled', 'true'); else nextBtn.removeAttribute('aria-disabled');
      nextBtn.classList.toggle('btn-primary', i !== LAST);
      dotItems.forEach(function (d, j) {
        d.li.classList.toggle('is-current', j === i);
        d.li.classList.toggle('is-done', j < i);
        if (j === i) d.button.setAttribute('aria-current', 'step'); else d.button.removeAttribute('aria-current');
      });
    }

    // renderShapes(): the tensor shapes and counts of the current stage, the followed crop's rows in ink and the other crop's muted.
    function renderShapes() {
      clear(shapes);
      SHAPES[state.stage].forEach(function (row) {
        const id = row[1], which = row[2], extra = row[3] || '';
        let html;
        if (id) {
          const value = fact(id);
          html = (id.indexOf('shape_') === 0 ? '<span class="shape">' + value + '</span>' : value) + esc(extra) + ' ' + cite(id);
        } else {
          html = esc(extra);
        }
        const dim = which && which !== state.follow ? 'muted' : null;
        shapes.appendChild(el('div', { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: '0.9rem', rowGap: '0.1rem', marginBottom: '0.35rem' } }, [
          el('dt', { class: dim, style: { flex: '0 1 13rem', minWidth: '0' } }, row[0]),
          el('dd', { class: dim, html: html, style: { flex: '1 1 11rem', minWidth: '0', margin: '0' } })
        ]));
      });
    }

    // syncPlay(): the Play button and its hint, switched off when the reader asked for reduced motion.
    function syncPlay() {
      if (reducedMotion()) {
        playBtn.setAttribute('aria-disabled', 'true');
        playBtn.setAttribute('aria-pressed', 'false');
        playBtn.textContent = 'Play';
        playHint.textContent = 'Your system asks for reduced motion, so Play is switched off. Prev and Next step through by hand.';
        return;
      }
      playBtn.removeAttribute('aria-disabled');
      playBtn.setAttribute('aria-pressed', state.playing ? 'true' : 'false');
      playBtn.textContent = state.playing ? 'Pause' : 'Play';
      if (state.playing) playHint.textContent = 'Playing: one stage every 1.5 seconds. Pause, Prev, Next or a stage number stops it.';
      else if (state.stage === LAST) playHint.textContent = 'This is the last stage. Play starts again from stage 1; the numbered squares jump to a stage.';
      else playHint.textContent = 'Play moves on one stage every 1.5 seconds; the numbered squares jump to a stage.';
    }

    // render(): show the current stage everywhere: counter, text, diagram, shapes and pictures.
    function render() {
      renderNav();
      narration.innerHTML = narrate(state.stage);
      renderDiagram();
      renderShapes();
      renderPictures();
      syncPlay();
      refreshTerms();
    }

    // ---------------------------------------------------------------- moving between stages

    // go(i, fromPlay): show stage i (kept inside 1 to 9); a move by hand stops Play.
    function go(i, fromPlay) {
      if (!fromPlay) stopPlay();
      state.stage = Math.max(0, Math.min(LAST, i));
      render();
    }

    // stopPlay(): stop the timer and show the Play button at rest.
    function stopPlay() {
      if (timer !== null) {
        root.clearInterval(timer);
        timer = null;
      }
      state.playing = false;
      syncPlay();
    }

    // tick(): one Play step; it stops at the last stage, when motion is reduced, or when drawing fails.
    function tick() {
      try {
        if (!state.playing) return;
        if (reducedMotion() || state.stage >= LAST) {
          stopPlay();
          return;
        }
        go(state.stage + 1, true);
        if (state.stage >= LAST) stopPlay();
      } catch (err) {
        stopPlay();
        throw err;
      }
    }

    // startPlay(): from the current stage (from stage 1 after the last), move on every 1.5 seconds unless motion is reduced.
    function startPlay() {
      if (reducedMotion()) {
        syncPlay();
        return;
      }
      if (state.stage === LAST) go(0, true);
      state.playing = true;
      if (timer !== null) root.clearInterval(timer);
      timer = root.setInterval(core.guard(body, tick), INTERVAL_MS);
      syncPlay();
    }

    // ---------------------------------------------------------------- events

    prevBtn.addEventListener('click', core.guard(body, function () {
      if (prevBtn.getAttribute('aria-disabled') === 'true') return;
      go(state.stage - 1, false);
    }));
    nextBtn.addEventListener('click', core.guard(body, function () {
      if (nextBtn.getAttribute('aria-disabled') === 'true') return;
      go(state.stage + 1, false);
    }));
    playBtn.addEventListener('click', core.guard(body, function () {
      if (playBtn.getAttribute('aria-disabled') === 'true') return;
      if (state.playing) stopPlay(); else startPlay();
    }));
    dotItems.forEach(function (d, i) {
      d.button.addEventListener('click', core.guard(body, function () { go(i, false); }));
    });
    navGroup.addEventListener('keydown', core.guard(body, function (ev) {
      if (ev.key === 'ArrowRight') {
        ev.preventDefault();
        go(state.stage + 1, false);
      } else if (ev.key === 'ArrowLeft') {
        ev.preventDefault();
        go(state.stage - 1, false);
      }
    }));
    [followGlobal, followLocal].forEach(function (input) {
      input.addEventListener('change', core.guard(body, function () {
        if (!input.checked) return;
        state.follow = input.value === 'local' ? 'local' : 'global';
        renderDiagram();
        renderShapes();
        renderPictures();
        refreshTerms();
      }));
    });
    newCropsBtn.addEventListener('click', core.guard(body, function () {
      state.seed += 1;
      renderPictures();
    }));
    core.on('theme-changed', core.guard(body, function () {
      renderPictures();
    }));
    core.on('image-changed', core.guard(body, function () {
      version += 1;
      cache = null;
      renderPictures();
    }));
    const relayout = core.guard(body, function () {
      const want = (diagramBox.clientWidth || 0) >= WIDE_MIN ? 'wide' : 'tall';
      if (want !== state.layout) renderDiagram();
    });
    if (typeof root.ResizeObserver === 'function') {
      new root.ResizeObserver(function () { relayout(); }).observe(diagramBox);
    } else if (typeof root.addEventListener === 'function') {
      root.addEventListener('resize', relayout);
    }
    try {
      const mq = typeof root.matchMedia === 'function' ? root.matchMedia('(prefers-reduced-motion: reduce)') : null;
      const onMotion = core.guard(body, function () {
        if (reducedMotion()) stopPlay(); else syncPlay();
      });
      if (mq && typeof mq.addEventListener === 'function') mq.addEventListener('change', onMotion);
      else if (mq && typeof mq.addListener === 'function') mq.addListener(onMotion);
    } catch (e) {
      logError('reduced-motion watch', e);
    }

    render();
  });

  // the fact table of Labs G and H, for window.LabP4.factTables() (tests/smoke_p4.js compares it with facts/course_facts.json)
  (function registerTable() {
    const facts = {};
    Object.keys(FACTS).forEach(function (id) { facts[id] = { shown: FACTS[id][0], source: FACTS[id][1], cite: FACTS[id][2] }; });
    const P4 = root.LabP4 = root.LabP4 || {};
    P4.tables = P4.tables || {};
    P4.tables['lab-4a-neighbours and lab-4b-one-step'] = { facts: facts, notInSheet: [] };
  })();
})(typeof window !== 'undefined' ? window : this);

// ================================================================== Part B: lab-4c-end-to-end and window.LabM.figure
// Copied from the first explainer's labs_part4.js (Lab M, "One image, end to end", and the paper-style figure), whose
// header said: one picture followed through one whole training step of the toy network of src/toy_vit.js, in fourteen
// stops (the picture as numbers, three crops, the patches, the patch embedding, the 12 blocks, the tokens that leave the
// backbone, the teacher's pass, the neighbours, the targets, the student's guesses, the losses, the gradient, the AdamW
// update and the teacher's average); LabM.figure(opts) is the two-row drawing after Figure 2 of the SelfPatch paper as
// HTML markup, which the lab draws live as its map. Toy maths only: the picture is the drawn sample, the viewer's own
// upload or a photograph of the bundle, the weights are seeded random numbers, and nothing is fetched, stored or sent.
// Changed in the copy: the lab id, the console and error prefixes, the chooser label, six section references in five
// sentences (stop 5: the first explainer's 1.9 is this course's 3.7, and the sentence that cited 2.7 for where our
// runs start now says that the real runs of this course start from trained backbones, told in Part 5; stop 7: 1.8 is
// 3.6; stop 9: 1.6 is 3.4 for the centre; stop 10: 1.6 is 1.5 for the entropy and 3.4 for the collapse), the comment
// on the character constants, and the fact table's registration at the end (window.LabP4.factTables). The random draws
// of the crops keep the first explainer's id as their key (SEED_KEY), so that crop seed 10 still cuts the first
// explainer's crops; the new id names the elements only. LabM.figure({static: true, wiring: 'contrastive'})
// is kept as it was: it needs window.LabN, which no page of this course loads beside this file, so it is never drawn
// here, and its eight run facts (nl_*) are plan entries of the first explainer that facts/course_facts.json does not
// import (the table's notInSheet list names them).
(function (root) {
  'use strict';

  // ------------------------------------------------------------------ constants (all in labs_defaults.json, "lab-4c-end-to-end")

  const ID = 'lab-4c-end-to-end';
  // SEED_KEY: the first explainer's id of this lab, the key of the crops' random draws, so that crop seed 10 cuts the
  // first explainer's crops and the static figure lists its positives (labs_defaults.json m.part4.crop_seed and
  // m.part4.resting_positives); ID names the elements only.
  const SEED_KEY = 'lab-m-end-to-end';
  const VERSION = '2026-09-29.2';
  const SIDE = 224;
  const PATCH = 16;
  const G = 14;
  const K = 4;
  const WINDOW = 8;
  const CROP_SEED = 10;
  const WEIGHT_SEED = 1;
  const FOLLOW = { row: 5, col: 7 };
  const T_STEP = { min: 1, max: 9240, value: 1000 };
  const PER_EPOCH = 462;
  const PLAY_MS = 2500;
  const BLOCK_MS = 600;
  const SLICE_MS = 30;
  const CACHE_BASES = 2;
  const CACHE_STEPS = 3;
  const START_MARGIN = '600px 0px';
  const AUG = { flip: true, jitter: true, grey: true, blur: true, solarise: true, mode: 'recipe' };
  const CROP_NAMES = ['global crop 1', 'global crop 2', 'local crop 1'];
  const PIC = { grid: 224, head: 92, heat: 150, thumb: 104, swatch: 112, local: 96 };
  const STRIP = { cell: 6, cols: 48 };
  const HIST_BINS = 16;
  const TOP = 3;
  const PICTURE_MOSAIC = 7;

  // The fourteen stops: key, title (plain text, for attributes; the stage title marks its real numbers as facts) and what
  // a stop needs: 0 the crops only, 1 the forward and backward passes, 2 also the update at the chosen step t.
  const STOPS = [
    { key: 'image', title: 'The picture is numbers', need: 0 },
    { key: 'views', title: 'Three views of it', need: 0 },
    { key: 'patches', title: 'Cut into 196 patches', need: 0 },
    { key: 'embed', title: '768 numbers become a token', need: 1 },
    { key: 'blocks', title: 'Through the 12 blocks', need: 1 },
    { key: 'tokens', title: 'What leaves the backbone', need: 1 },
    { key: 'teacher', title: 'The teacher does the same, without gradient', need: 1 },
    { key: 'neighbours', title: 'Each patch looks at its 8 neighbours', need: 1 },
    { key: 'target', title: 'The teacher merges the 4 positives into a target', need: 1 },
    { key: 'student', title: 'The student predicts from its own token', need: 1 },
    { key: 'losses', title: 'The losses score the guesses', need: 1 },
    { key: 'backward', title: 'The gradient flows back', need: 2 },
    { key: 'update', title: 'AdamW moves the weights', need: 2 },
    { key: 'ema', title: 'The teacher follows slowly', need: 2 }
  ];

  // characters (the first explainer wrote them as escapes; this copy is UTF-8)
  const TIMES = '×';
  const MINUS = '−';
  const RARR = '→';
  const HAT = '̂';
  const RSQUO = '’';
  const SQRT = '√';
  const BETA = 'β';
  const EPS = 'ε';
  const DOT = '·';
  const ELLIPSIS = '…';
  const APPROX = '≈';
  const SUB1 = '₁';
  const SUB2 = '₂';
  const MONO = '"JetBrains Mono", ui-monospace, "Cascadia Mono", Consolas, monospace';

  // The facts the lab states: the source string and the source tag of each, copied from facts/*.json when this file was built.
  const FACTS = {
      "adamw_betas_eps": {
          "cite": "[official code: main_selfpatch.py; our code: cluster/train.py; PyTorch docs]",
          "source": "cluster/selfpatch_official/main_selfpatch.py:243 (torch.optim.AdamW(params_groups), betas and eps left at their defaults); cluster/train.py:857 (torch.optim.AdamW(groups, lr=0.0, weight_decay=args.weight_decay), betas and eps left at their defaults); .venv-repro/Lib/site-packages/torch/optim/adamw.py:25-26 (betas = (0.9, 0.999), eps = 1e-8); .venv-repro/Lib/site-packages/torch/optim/adamw.py:104-108 (running averages of the gradient and its square, and eps added to the denominator)"
      },
      "adamw_update_rule": {
          "cite": "[PyTorch docs]",
          "source": ".venv-repro/Lib/site-packages/torch/optim/adamw.py:71-72 (m the first moment and v the second moment, both starting at 0); .venv-repro/Lib/site-packages/torch/optim/adamw.py:80-83 (the decay step, then m and v, then the corrected m); .venv-repro/Lib/site-packages/torch/optim/adamw.py:88-90 (the corrected v, then the weight minus the learning rate times the corrected m over the square root of the corrected v plus eps)"
      },
      "agg_blocks": {
          "cite": "[SelfPatch supp. App. A]",
          "source": "SelfPatch supplement App. A, p. 1 (research/references/papers/base_audit_20260914_selfpatch/selfpatch_cvpr2022_supplement.pdf) (two class-attention blocks without Layerscale); docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:89; cluster/selfpatch_official/selfpatch_vision_transformer.py:366-372; docs/research/selection_scope_2026-09-27/architecture/10_param_counts_output.txt:15"
      },
      "agg_excludes_anchor": {
          "cite": "[our architecture doc §3.6]",
          "source": "docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:209; docs/research/selection_scope_2026-09-27/05_report_final_v2.md:208"
      },
      "agg_global_token": {
          "cite": "[SelfPatch §2.2]",
          "source": "research/audits/base_papers_text/yun_selfpatch_cvpr2022.txt:416-421 (Eq. (4)); docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:48; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:205"
      },
      "agg_module": {
          "cite": "[SelfPatch §2.2]",
          "source": "research/audits/base_papers_text/yun_selfpatch_cvpr2022.txt:424-427; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:197"
      },
      "agg_module_structure": {
          "cite": "[our architecture doc §2.3; official code: selfpatch_vision_transformer.py]",
          "source": "docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:89; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:106-109; cluster/selfpatch_official/selfpatch_vision_transformer.py:72-139 (Class_Attention and LayerScale_Block_CA: separate q, k and v, residuals on the query token only); cluster/selfpatch_official/selfpatch_vision_transformer.py:362-374 (SelfPatchHead: the query token, 2 blocks with mlp_ratio=4.0, a final LayerNorm); cluster/official_loader.py:58 (SelfPatchHead(384, 6, k))"
      },
      "agg_query_attends": {
          "cite": "[our architecture doc §3.6]",
          "source": "docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:203"
      },
      "agg_query_share_d4": {
          "cite": "[our report §2.4]",
          "source": "docs/research/selection_scope_2026-09-27/05_report_final_v2.md:217 (0.20 at d = 4)"
      },
      "agg_query_share_formula": {
          "cite": "[our report §2.4]",
          "source": "docs/research/selection_scope_2026-09-27/05_report_final_v2.md:217; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:211"
      },
      "agg_query_token": {
          "cite": "[our architecture doc §2.3]",
          "source": "docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:89; cluster/selfpatch_official/selfpatch_vision_transformer.py:373; docs/research/selection_scope_2026-09-27/architecture/10_param_counts_output.txt:15"
      },
      "centre_momentum": {
          "cite": "[DINO code; official code: main_selfpatch.py]",
          "source": "research/references/repos/DINO/main_dino.py:366 (center_momentum=0.9); cluster/selfpatch_official/main_selfpatch.py:403; docs/research/selection_scope_2026-09-27/architecture/10_param_counts_output.txt:55; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:141; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:251"
      },
      "centre_rule": {
          "cite": "[DINO §3.1]",
          "source": "research/audits/base_papers_text/caron_dino_iccv2021.txt:205-217 (Eq. (4)); research/audits/base_papers_text/caron_dino_iccv2021.txt:125 and research/audits/base_papers_text/caron_dino_iccv2021.txt:130 (Algorithm 1)"
      },
      "crop_global_count": {
          "cite": "[DINO §3.1]",
          "source": "docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:154; cluster/selfpatch_official/main_selfpatch.py:502-516; research/audits/base_papers_text/caron_dino_iccv2021.txt:169-170"
      },
      "crop_global_scale": {
          "cite": "[official code: main_selfpatch.py]",
          "source": "cluster/selfpatch_official/main_selfpatch.py:112-113; cluster/train.py:682; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:132; research/audits/base_sources_20260914/root/dino_vits16_args.txt:1 (global_crops_scale: [0.25, 1.0])"
      },
      "crop_global_side": {
          "cite": "[our architecture doc §3.1; DINO §3.1]",
          "source": "docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:154; cluster/selfpatch_official/main_selfpatch.py:504; cluster/selfpatch_official/main_selfpatch.py:511; research/audits/base_papers_text/caron_dino_iccv2021.txt:169-171"
      },
      "crop_local_count": {
          "cite": "[official code: main_selfpatch.py; SelfPatch supp. App. A]",
          "source": "cluster/selfpatch_official/main_selfpatch.py:116; research/references/repos/SelfPatch/README.md:15 (--local_crops_number 8); cluster/train.py:682; SelfPatch supplement App. A, p. 1 (research/references/papers/base_audit_20260914_selfpatch/selfpatch_cvpr2022_supplement.pdf) (2 × 224² + 8 × 96²)"
      },
      "crop_local_scale": {
          "cite": "[official code: main_selfpatch.py]",
          "source": "cluster/selfpatch_official/main_selfpatch.py:119-121; cluster/train.py:682; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:132; research/audits/base_sources_20260914/root/dino_vits16_args.txt:1 (local_crops_scale: [0.05, 0.25])"
      },
      "crop_local_side": {
          "cite": "[our architecture doc §3.1; DINO §3.1]",
          "source": "docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:154; cluster/selfpatch_official/main_selfpatch.py:520; research/audits/base_papers_text/caron_dino_iccv2021.txt:171-172"
      },
      "crop_total": {
          "cite": "[our architecture doc §3.1]",
          "source": "docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:154; cluster/train.py:745 (10 crops); docs/research/selection_scope_2026-09-27/architecture/10_param_counts_output.txt:55"
      },
      "dino_cls_first": {
          "cite": "[DINO code]",
          "source": "research/references/repos/DINO/vision_transformer.py:201-205 (x = torch.cat((cls_tokens, x), dim=1), then the positional encoding is added)"
      },
      "dino_cls_token": {
          "cite": "[DINO §3.2]",
          "source": "research/audits/base_papers_text/caron_dino_iccv2021.txt:237-240; docs/research/selection_scope_2026-09-27/architecture/10_param_counts_output.txt:34 (cls_token (1, 1, 384))"
      },
      "dino_output_224": {
          "cite": "[DINO Tab. 1]",
          "source": "research/audits/base_papers_text/caron_dino_iccv2021.txt:196 (197 tokens, dim 384); docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:63"
      },
      "dino_pos_embed_shape": {
          "cite": "[our architecture doc §2.1]",
          "source": "docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:63 (pos_embed 1×197×384, one row per patch and one for the class token)"
      },
      "dino_same_architecture": {
          "cite": "[DINO §3.1]",
          "source": "research/audits/base_papers_text/caron_dino_iccv2021.txt:175-178"
      },
      "dino_teacher_crops": {
          "cite": "[DINO §3.1]",
          "source": "research/audits/base_papers_text/caron_dino_iccv2021.txt:156-158; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:257"
      },
      "dino_tokens_224": {
          "cite": "[DINO Tab. 1]",
          "source": "research/audits/base_papers_text/caron_dino_iccv2021.txt:196 (Table 1: ViT-S/16, 197 tokens); docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:63"
      },
      "drop_path_student": {
          "cite": "[our parameter count; our architecture doc §2.5]",
          "source": "docs/research/selection_scope_2026-09-27/architecture/10_param_counts_output.txt:21; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:130; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:164"
      },
      "drop_path_teacher": {
          "cite": "[our parameter count]",
          "source": "docs/research/selection_scope_2026-09-27/architecture/10_param_counts_output.txt:22; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:130"
      },
      "ema_ours_schedule": {
          "cite": "[our code: cluster/train.py]",
          "source": "cluster/train.py:152; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:139; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:263"
      },
      "ema_rule": {
          "cite": "[DINO §3.1]",
          "source": "research/audits/base_papers_text/caron_dino_iccv2021.txt:211-212; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:263"
      },
      "freeze_last_layer_reason": {
          "cite": "[DINO code]",
          "source": "research/references/repos/DINO/main_dino.py:93-95 (freeze_last_layer help text); cluster/selfpatch_official/main_selfpatch.py:98-100 (the same text)"
      },
      "head_hidden": {
          "cite": "[DINO §3.1]",
          "source": "research/audits/base_papers_text/caron_dino_iccv2021.txt:235-236; research/audits/base_sources_20260914/root/dino_cvf_supplement.txt:168; cluster/selfpatch_official/selfpatch_vision_transformer.py:446 (hidden_dim=2048)"
      },
      "head_l2": {
          "cite": "[DINO §3.1]",
          "source": "docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:90; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:221; research/audits/base_papers_text/caron_dino_iccv2021.txt:236"
      },
      "head_path_patch": {
          "cite": "[our architecture doc §2.3]",
          "source": "docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:90; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:113-115; cluster/selfpatch_official/selfpatch_vision_transformer.py:446"
      },
      "head_prototypes_global": {
          "cite": "[DINO supp. App. C; DINO release args]",
          "source": "research/audits/base_sources_20260914/root/dino_cvf_supplement.txt:199 (default K = 65536); research/audits/base_sources_20260914/root/dino_vits16_args.txt:1 (out_dim: 65536); cluster/selfpatch_official/main_selfpatch.py:57; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:90"
      },
      "imagenet_mean": {
          "cite": "[official code: main_selfpatch.py]",
          "source": "cluster/selfpatch_official/main_selfpatch.py:497-500; research/references/repos/DINO/main_dino.py:431; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:349"
      },
      "imagenet_std": {
          "cite": "[official code: main_selfpatch.py]",
          "source": "cluster/selfpatch_official/main_selfpatch.py:497-500; research/references/repos/DINO/main_dino.py:431; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:349"
      },
      "img_channels": {
          "cite": "[torchvision docs]",
          "source": ".venv-repro/Lib/site-packages/torchvision/transforms/transforms.py:112-113 (an H × W × C image becomes a C × H × W tensor); docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:154 (crops are 3 × 224 × 224)"
      },
      "img_pixel_range": {
          "cite": "[torchvision docs]",
          "source": ".venv-repro/Lib/site-packages/torchvision/transforms/transforms.py:112-113 (in the range [0, 255])"
      },
      "img_tensor_224": {
          "cite": "[our architecture doc §3.1]",
          "source": "docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:154; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:275"
      },
      "img_values_224": {
          "cite": "[arithmetic]",
          "source": "arithmetic: 3 × 224 × 224, with the shape from docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:154"
      },
      "loss_cross_entropy": {
          "cite": "[DINO §3.1]",
          "source": "research/audits/base_papers_text/caron_dino_iccv2021.txt:139-149 (Eq. (2), H(a, b) = −a log b)"
      },
      "loss_global_pairs": {
          "cite": "[our architecture doc §3.9]",
          "source": "docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:235-237; docs/research/selection_scope_2026-09-27/architecture/10_param_counts_output.txt:55 (global_terms 18); docs/research/selection_scope_2026-09-27/05_report_final_v2.md:225"
      },
      "loss_global_pairs_dino_release": {
          "cite": "[arithmetic]",
          "source": "arithmetic: DINO Eq. (3) at research/audits/base_papers_text/caron_dino_iccv2021.txt:160-165 with 2 + 10 crops from research/audits/base_sources_20260914/root/dino_vits16_args.txt:1"
      },
      "loss_stop_gradient": {
          "cite": "[DINO Alg. 1]",
          "source": "research/audits/base_papers_text/caron_dino_iccv2021.txt:128 (t = t.detach() # stop gradient); docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:229; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:265"
      },
      "nbr_candidates": {
          "cite": "[SelfPatch §2.2]",
          "source": "research/audits/base_papers_text/yun_selfpatch_cvpr2022.txt:387-389 (|N(i)| = 8); docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:172; cluster/selfpatch_official/selfpatch_vision_transformer.py:378 (k_size 3)"
      },
      "nbr_similarity_teacher": {
          "cite": "[our architecture doc §3.4]",
          "source": "docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:174-178; docs/research/selection_scope_2026-09-27/05_report_final_v2.md:150-152; research/audits/base_papers_text/yun_selfpatch_cvpr2022.txt:394-403 (Eq. (3))"
      },
      "nbr_wrap": {
          "cite": "[our architecture doc §3.4]",
          "source": "docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:172; cluster/selfpatch_official/selfpatch_vision_transformer.py:425-443"
      },
      "nl_eq_negatives": {
          "cite": "[our run spec]",
          "source": "docs/superpowers/specs/2026-10-08-supervisor-contrastive-run-design.md:39 (negatives N(i): pairs at or below tau_lo, capped at 48 by rank, cuts counted; a member of P(i) is never a negative)"
      },
      "nl_eq_positives_k": {
          "cite": "[our run spec §3, §10]",
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
          "cite": "[our run spec §10]",
          "source": "docs/superpowers/specs/2026-10-08-supervisor-contrastive-run-design.md:172-177 (k = 8 on the 224 px crops (195 candidates) and k = 4 on the 96 px crops (35 candidates), flags --con_k 8 and --con_k_local 4; the owner can set --con_k_local 8 before the launch commit); docs/superpowers/plans/2026-10-08-supervisor-contrastive-run-build.md:48 (--con_k 8, --con_k_local 4); docs/research/explainer_2026-09-28/design_nonlocal_2026-10-08.md:124-126 (row part: k = 8 on the 224 px crops and k = 4 on the 96 px crops)"
      },
      "nl_k_rev3": {
          "cite": "[our run spec §10]",
          "source": "docs/superpowers/specs/2026-10-08-supervisor-contrastive-run-design.md:172-173 (k = 8 on the 224 px crops (195 candidates) and k = 4 on the 96 px crops (35 candidates), flags --con_k 8 and --con_k_local 4); docs/superpowers/plans/2026-10-08-supervisor-contrastive-run-build.md:48 (--con_k 8, --con_k_local 4)"
      },
      "nl_neg_bottom_pct": {
          "cite": "[our run spec §3; our design addendum §3]",
          "source": "docs/superpowers/specs/2026-10-08-supervisor-contrastive-run-design.md:39 (negatives N(i): pairs at or below tau_lo = quantile_{0.20} of the same entries (the bottom 20 per cent of all pairs)); docs/research/explainer_2026-09-28/design_nonlocal_2026-10-08.md:127-128 (tau_lo = quantile_{0.20} of the same (the bottom 20 per cent of all pairs))"
      },
      "nl_tau": {
          "cite": "[our run spec]",
          "source": "docs/superpowers/specs/2026-10-08-supervisor-contrastive-run-design.md:51 (tau = 0.2, calibrated before launch, section 6); docs/superpowers/specs/2026-10-08-supervisor-contrastive-run-design.md:131 (the test sets tau before the protocol is committed)"
      },
      "normalise_formula": {
          "cite": "[torchvision docs]",
          "source": ".venv-repro/Lib/site-packages/torchvision/transforms/transforms.py:258 (output[channel] = (input[channel] - mean[channel]) / std[channel]); cluster/selfpatch_official/main_selfpatch.py:497-500"
      },
      "ours_clip": {
          "cite": "[our code: cluster/train.py]",
          "source": "cluster/train.py:165; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:143; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:316"
      },
      "ours_epochs_pilot": {
          "cite": "[our code: cluster/train.py]",
          "source": "cluster/train.py:144; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:135; docs/superpowers/specs/2026-09-26-quality-first-campaign-design.md:223"
      },
      "ours_freeze_last_layer": {
          "cite": "[our code: cluster/train.py]",
          "source": "cluster/train.py:166; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:144; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:317"
      },
      "ours_global_batch": {
          "cite": "[our code: cluster/train.py]",
          "source": "cluster/train.py:145; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:133; cluster/README.md:80"
      },
      "ours_lr_peak": {
          "cite": "[our code: cluster/train.py]",
          "source": "cluster/train.py:146-147; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:137"
      },
      "ours_min_lr": {
          "cite": "[our code: cluster/train.py]",
          "source": "cluster/train.py:148; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:137; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:307"
      },
      "ours_optimiser": {
          "cite": "[our architecture doc §2.5]",
          "source": "docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:136"
      },
      "ours_steps_20ep": {
          "cite": "[our spec §9]",
          "source": "docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:311; docs/superpowers/specs/2026-09-26-quality-first-campaign-design.md:222"
      },
      "ours_steps_per_epoch": {
          "cite": "[our architecture doc §2.5]",
          "source": "docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:134; cluster/README.md:80; cluster/contract.py:47-50; docs/superpowers/specs/2026-09-26-quality-first-campaign-design.md:222"
      },
      "ours_warmup_steps": {
          "cite": "[our architecture doc §4.2]",
          "source": "docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:305"
      },
      "ours_weight_decay": {
          "cite": "[our code: cluster/train.py]",
          "source": "cluster/train.py:150-151; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:138"
      },
      "ours_weight_decay_groups": {
          "cite": "[our architecture doc §2.5]",
          "source": "docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:136; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:138"
      },
      "patch_count_224": {
          "cite": "[our architecture doc §3.2]",
          "source": "docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:158; docs/research/selection_scope_2026-09-27/architecture/10_param_counts_output.txt:25"
      },
      "patch_count_96": {
          "cite": "[our architecture doc §3.2]",
          "source": "docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:158; docs/research/selection_scope_2026-09-27/architecture/10_param_counts_output.txt:27"
      },
      "patch_embed_map": {
          "cite": "[our architecture doc §2.2]",
          "source": "docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:77; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:160-164"
      },
      "patch_grid_224": {
          "cite": "[our architecture doc §3.2]",
          "source": "docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:158; research/audits/base_papers_text/yun_selfpatch_cvpr2022.txt:629-630"
      },
      "patch_grid_96": {
          "cite": "[our architecture doc §3.2]",
          "source": "docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:158"
      },
      "patch_loss_average": {
          "cite": "[our architecture doc §3.9]",
          "source": "docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:241; docs/research/selection_scope_2026-09-27/architecture/10_param_counts_output.txt:55 (patch_view_denominator 10)"
      },
      "patch_size": {
          "cite": "[DINO §3.2]",
          "source": "docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:126; research/audits/base_sources_20260914/root/dino_vits16_args.txt:1 (patch_size: 16); research/audits/base_papers_text/caron_dino_iccv2021.txt:234-235"
      },
      "patch_values": {
          "cite": "[our architecture doc §3.2]",
          "source": "docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:164"
      },
      "pos_embed_resize": {
          "cite": "[our architecture doc §3.2; DINO §3.2]",
          "source": "docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:164; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:350; research/audits/base_papers_text/caron_dino_iccv2021.txt:271-272"
      },
      "pos_embed_shape": {
          "cite": "[our architecture doc §2.2]",
          "source": "docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:69; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:104; docs/research/selection_scope_2026-09-27/architecture/10_param_counts_output.txt:14 (pos_embed 75,264 (1, 196, 384))"
      },
      "shape_input_global": {
          "cite": "[our architecture doc §3.12]",
          "source": "docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:275"
      },
      "shape_input_local": {
          "cite": "[our architecture doc §3.12]",
          "source": "docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:275"
      },
      "shape_similarities_224": {
          "cite": "[our architecture doc §3.12]",
          "source": "docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:279; docs/research/selection_scope_2026-09-27/architecture/10_param_counts_output.txt:50"
      },
      "shape_tokens_224": {
          "cite": "[our architecture doc §3.12]",
          "source": "docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:277; docs/research/selection_scope_2026-09-27/architecture/10_param_counts_output.txt:49"
      },
      "shape_tokens_96": {
          "cite": "[our architecture doc §3.12]",
          "source": "docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:277; docs/research/selection_scope_2026-09-27/architecture/10_param_counts_output.txt:49"
      },
      "sp_asymmetry": {
          "cite": "[SelfPatch §2.2]",
          "source": "research/audits/base_papers_text/yun_selfpatch_cvpr2022.txt:379-384; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:215"
      },
      "sp_asymmetry_collapse": {
          "cite": "[SelfPatch §2.2]",
          "source": "research/audits/base_papers_text/yun_selfpatch_cvpr2022.txt:384-390"
      },
      "sp_k": {
          "cite": "[SelfPatch §2.2]",
          "source": "research/audits/base_papers_text/yun_selfpatch_cvpr2022.txt:404-409; cluster/selfpatch_official/main_selfpatch.py:70 (k_num 4); cluster/train.py:118 (K = 4); docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:188"
      },
      "sp_lambda": {
          "cite": "[SelfPatch §4]",
          "source": "research/audits/base_papers_text/yun_selfpatch_cvpr2022.txt:506 (λ = 0.1); cluster/selfpatch_official/main_selfpatch.py:456 (c_loss + p_loss*0.1); cluster/train.py:154; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:247"
      },
      "sp_output_224": {
          "cite": "[our architecture doc §3.12]",
          "source": "docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:69; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:277"
      },
      "sp_patch_prototypes": {
          "cite": "[SelfPatch supp. App. A]",
          "source": "SelfPatch supplement App. A, p. 1 (research/references/papers/base_audit_20260914_selfpatch/selfpatch_cvpr2022_supplement.pdf) (K = 4096 for our projection head); cluster/selfpatch_official/main_selfpatch.py:59; research/references/repos/SelfPatch/README.md:15; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:87"
      },
      "sp_student_final_ln": {
          "cite": "[our architecture doc §3.7]",
          "source": "docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:215; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:441"
      },
      "sp_teacher_crops": {
          "cite": "[our architecture doc §3.9]",
          "source": "docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:257; cluster/selfpatch_official/main_selfpatch.py:335; cluster/selfpatch_official/main_selfpatch.py:440-452"
      },
      "teacher_copy_at_start": {
          "cite": "[DINO Alg. 1]",
          "source": "research/audits/base_papers_text/caron_dino_iccv2021.txt:113 (Algorithm 1: gt.params = gs.params); docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:94"
      },
      "temp_student": {
          "cite": "[DINO §3.2]",
          "source": "research/audits/base_papers_text/caron_dino_iccv2021.txt:268 (τs is set to 0.1); cluster/selfpatch_official/main_selfpatch.py:402 (student_temp=0.1); docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:140; docs/research/selection_scope_2026-09-27/architecture/10_param_counts_output.txt:55"
      },
      "temp_teacher": {
          "cite": "[official code: main_selfpatch.py; our code: cluster/train.py]",
          "source": "cluster/selfpatch_official/main_selfpatch.py:73-80 (0.04 to 0.04 over 0 warm-up epochs); cluster/train.py:153; cluster/train.py:745; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:140; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:227; research/audits/base_papers_text/caron_dino_iccv2021.txt:218-219"
      },
      "vit_attention_scale": {
          "cite": "[our architecture doc §3.2]",
          "source": "docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:164 (MSA with scale 64^(-1/2))"
      },
      "vit_blocks": {
          "cite": "[DINO Tab. 1]",
          "source": "docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:126; research/audits/base_papers_text/caron_dino_iccv2021.txt:196; cluster/selfpatch_official/selfpatch_vision_transformer.py:352 (depth=12)"
      },
      "vit_head_width": {
          "cite": "[our architecture doc §3.2]",
          "source": "docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:126; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:164; research/audits/base_sources_20260914/root/dino_cvf_supplement.txt:371 (6 heads, dim 384, 64 per head)"
      },
      "vit_heads": {
          "cite": "[DINO Tab. 1]",
          "source": "docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:126; research/audits/base_papers_text/caron_dino_iccv2021.txt:196; cluster/selfpatch_official/selfpatch_vision_transformer.py:352 (num_heads=6)"
      },
      "vit_layernorm_eps": {
          "cite": "[our architecture doc §2.5]",
          "source": "docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:126; cluster/selfpatch_official/selfpatch_vision_transformer.py:353 (eps=1e-6)"
      },
      "vit_mlp": {
          "cite": "[our architecture doc §3.2]",
          "source": "docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:164; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:105"
      },
      "vit_qkv": {
          "cite": "[our architecture doc §2.4]",
          "source": "docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:105; docs/research/selection_scope_2026-09-27/architecture/10_param_counts_output.txt:39 (blocks.11.attn.qkv.weight (1152, 384))"
      },
      "vit_residual": {
          "cite": "[our architecture doc §3.2]",
          "source": "docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:162"
      }
  };

  // ------------------------------------------------------------------ small helpers

  // logError(where, err): write a problem to the console; never throws.
  function logError(where, err) {
    try {
      if (root.console && typeof root.console.error === 'function') root.console.error('[labs_p4] ' + where, err);
    } catch (e) { /* nothing more can be done */ }
  }

  // now(): a clock in milliseconds (performance.now when there is one).
  function now() {
    const p = root.performance;
    return p && typeof p.now === 'function' ? p.now() : Date.now();
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
    if (!f) throw new Error('labs_p4: unknown fact id ' + id);
    return core.el('span', { class: 'fact', 'data-fact': id, 'data-source': f.source }, [String(text)]);
  }

  // cite(core, id): the visible source tag of fact `id`, such as [our code: cluster/train.py].
  function cite(core, id) {
    const f = FACTS[id];
    if (!f) throw new Error('labs_p4: unknown fact id ' + id);
    return core.el('cite', { class: 'src' }, [f.cite]);
  }

  // term(core, key, text): a glossary term (a dfn element whose data-term is key), defined in the page's glossary.
  function term(core, key, text) {
    return core.el('dfn', { 'data-term': key }, [text === undefined ? key : text]);
  }

  // refreshTerms(): ask boot.js to prepare the glossary terms and fact spans that the lab has just written.
  function refreshTerms() {
    try {
      if (root.Boot && typeof root.Boot.refreshTerms === 'function') root.Boot.refreshTerms();
    } catch (e) {
      logError('refreshTerms', e);
    }
  }

  // reducedMotion(): whether the reader asked for less motion (boot.js first, else the media query).
  function reducedMotion() {
    try {
      if (root.Boot && typeof root.Boot.prefersReducedMotion === 'function') return !!root.Boot.prefersReducedMotion();
      return !!(typeof root.matchMedia === 'function' && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) {
      return false;
    }
  }

  // chooser(core, id, label): the shared picture chooser for the control strip, or null when boot.js has not installed it.
  function chooser(core, id, label) {
    let make = null;
    if (typeof core.imageChooser === 'function') make = core.imageChooser;
    else if (root.Boot && typeof root.Boot.imageChooser === 'function') make = root.Boot.imageChooser;
    if (!make) return null;
    try {
      return make({ id: id, label: label });
    } catch (e) {
      logError('imageChooser', e);
      return null;
    }
  }

  // show(core, x, sig): a toy number for reading: 0 as 0, magnitudes from 0.001 to 99,999 with `sig` significant digits (default 4), anything else as m x 10 to a power.
  function show(core, x, sig) {
    const s = sig || 4;
    if (x === 0) return '0';
    if (typeof x !== 'number' || x !== x || !isFinite(x)) return 'not a number';
    const a = Math.abs(x);
    if (a >= 1e-3 && a < 1e5) {
      const digits = Math.max(0, Math.min(6, s - 1 - Math.floor(Math.log(a) / Math.LN10)));
      return core.fmt(x, digits);
    }
    return core.fmtSci(x, s - 1);
  }

  // rateText(x): a learning rate in the e-notation the page's text uses: 5e-4, or 3.2e-5 with one decimal (0 stays 0).
  function rateText(x) {
    if (!(x > 0) || !isFinite(x)) return '0';
    let e = Math.floor(Math.log(x) / Math.LN10);
    let m = Math.round(x / Math.pow(10, e) * 10) / 10;
    if (m >= 10) {
      m = 1;
      e += 1;
    }
    return (m === Math.round(m) ? String(m) : m.toFixed(1)) + 'e' + e;
  }

  // cellName(index, g): 'row r, column c' of a flat grid index (rows and columns counted from 0 at the top left).
  function cellName(index, g) {
    return 'row ' + Math.floor(index / g) + ', column ' + (index % g);
  }

  // cellPair(index, g): '(r, c)' of a flat grid index.
  function cellPair(index, g) {
    return '(' + Math.floor(index / g) + ', ' + (index % g) + ')';
  }

  // relWords(from, to, g): where patch `to` lies seen from patch `from` on a g x g grid, in words ('itself', '2 rows up and 1 column right').
  function relWords(from, to, g) {
    const dr = Math.floor(to / g) - Math.floor(from / g), dc = (to % g) - (from % g);
    if (dr === 0 && dc === 0) return 'itself';
    const parts = [];
    if (dr) parts.push(Math.abs(dr) + (Math.abs(dr) === 1 ? ' row ' : ' rows ') + (dr < 0 ? 'up' : 'down'));
    if (dc) parts.push(Math.abs(dc) + (Math.abs(dc) === 1 ? ' column ' : ' columns ') + (dc < 0 ? 'left' : 'right'));
    return parts.join(' and ');
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

  // windowOf(index, g): the 8 cells of the wrapped 3 x 3 window around index, in increasing flat index (the official table's order), each {index, dr, dc, wrapped}, where dr and dc are the cell's place in the window (-1, 0 or 1).
  function windowOf(index, g) {
    const r = Math.floor(index / g), c = index % g;
    const out = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const rr = r + dr, cc = c + dc;
        out.push({ index: ((rr + g) % g) * g + ((cc + g) % g), dr: dr, dc: dc, wrapped: rr < 0 || rr >= g || cc < 0 || cc >= g });
      }
    }
    return out.sort(function (a, b) { return a.index - b.index; });
  }

  // windowWords(dr, dc): a window cell's place in a few words, with an arrow ('\u2199 down left').
  function windowWords(dr, dc) {
    const arrows = { '-1,-1': '\u2196', '-1,0': '\u2191', '-1,1': '\u2197', '0,-1': '\u2190', '0,1': '\u2192', '1,-1': '\u2199', '1,0': '\u2193', '1,1': '\u2198' };
    const words = [dr < 0 ? 'up' : (dr > 0 ? 'down' : ''), dc < 0 ? 'left' : (dc > 0 ? 'right' : '')].filter(Boolean).join(' ');
    return arrows[dr + ',' + dc] + ' ' + words;
  }

  // normOf(v): the Euclidean length of the numbers in v.
  function normOf(v) {
    let s = 0;
    for (let i = 0; i < v.length; i++) s += v[i] * v[i];
    return Math.sqrt(s);
  }

  // rowOf(m, i): row i of a toy_vit matrix {rows, cols, data} as a Float64Array view.
  function rowOf(m, i) {
    return m.data.subarray(i * m.cols, (i + 1) * m.cols);
  }

  // cosineOf(a, b): the cosine of two vectors of equal length (0 when either is all zeros).
  function cosineOf(a, b) {
    let d = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) {
      d += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    return na > 0 && nb > 0 ? d / Math.sqrt(na * nb) : 0;
  }

  // topIndices(v, k): the k indices of the largest values, largest first (ties to the lower index).
  function topIndices(v, k) {
    const idx = [];
    for (let i = 0; i < v.length; i++) idx.push(i);
    idx.sort(function (a, b) { return (v[b] - v[a]) || (a - b); });
    return idx.slice(0, k);
  }

  // rangeOf(v): [smallest, largest] of the values.
  function rangeOf(v) {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < v.length; i++) {
      if (v[i] < lo) lo = v[i];
      if (v[i] > hi) hi = v[i];
    }
    return [lo, hi];
  }

  // entropyOf(p): -sum p ln p in nats.
  function entropyOf(p) {
    let h = 0;
    for (let i = 0; i < p.length; i++) if (p[i] > 0) h -= p[i] * Math.log(p[i]);
    return h;
  }

  // hex2(v): a byte as two lower-case hexadecimal digits.
  function hex2(v) {
    const b = Math.max(0, Math.min(255, Math.round(v)));
    return (b < 16 ? '0' : '') + b.toString(16);
  }

  // mosaicOf(core, imageData, g): the mean colour of every cell of a g x g grid over a square picture, as '#rrggbb' strings, row by row.
  function mosaicOf(core, imageData, g) {
    const grid = core.patchGrid(imageData, imageData.width / g);
    return grid.patches.map(function (p) { return '#' + hex2(p.mean[0]) + hex2(p.mean[1]) + hex2(p.mean[2]); });
  }

  // makeCrops(core, imageData): global crops 1 and 2 and local crop 1 of a 224-pixel picture, cut and augmented with the recipe's chances (Core.cropSampler and Core.augment, as Labs D and H do) at the lab's crop seed; each {imageData, rect, kind, index, applied}.
  function makeCrops(core, imageData) {
    const rects = core.cropSampler(core.rng(SEED_KEY + '|crops|' + CROP_SEED), imageData.width);
    return [rects.globals[0], rects.globals[1], rects.locals[0]].map(function (r, i) {
      const out = core.augment(imageData, r, i < 2 ? 224 : 96, AUG, core.rng(SEED_KEY + '|aug|' + CROP_SEED + '|' + i));
      return { imageData: out, rect: r, kind: r.kind, index: r.index, applied: out.applied || null };
    });
  }

  // ------------------------------------------------------------------ the paper-style figure (window.LabM.figure)
  //
  // Redrawn in the page's style after Figure 2 of the SelfPatch paper, not copied from it. Two rows (image level, patch
  // level) and the positive-matching panel; every box carries data-stop (the lab's stop a click opens, 1 to 14) and gets
  // the class is-lit when the lab's current stop is one of its stops. Colours come from the stylesheet's role classes
  // (the /* Lab M */ block of styles.css), so the drawing follows both themes. Two layouts are written, one wide and one
  // tall, and the stylesheet shows the one that fits the width. The drawing uses no element ids, so the static figure
  // and the lab's live map can share the page, and no number longer than two digits, so the page checker needs no
  // fact span inside it. A third wiring, 'contrastive' (static only), draws the same figure for the run of Part 4 at
  // the start of section 4.4; its section below says what changes, and the run's values it writes come from the FACTS
  // table through figFact, which tests/check_page.py checks against the fact sheets.

  // The roles of the boxes: s the student (green), t the teacher (blue), p the positives (orange), n the negatives
  // (purple, the contrastive wiring only); null is shared.
  const FIG_ROLE = { s: 'student', t: 'teacher', p: 'positive', n: 'negative' };
  const FIG_BIG = 14;
  const FIG_SMALL = 10.5;

  // The boxes: name, panel (a image level, b patch level), column, lane (0 student, 1 teacher, 0.5 both), kind, role,
  // label lines t (the tall layout uses tt when given), font sizes fs, the stop a click opens (s) and the stops that
  // light it; dino replaces the label under the DINO wiring.
  const FIG_NODES = [
    { n: 'a-pic', p: 'a', c: 0, l: 0.5, k: 'picture', r: null, t: ['picture'], s: 1, lit: [1] },
    { n: 'a-x', p: 'a', c: 1, l: 0, k: 'box', r: null, t: ['x'], s: 2, lit: [2, 3] },
    { n: 'a-xp', p: 'a', c: 1, l: 1, k: 'box', r: null, t: ['x^{+}'], s: 2, lit: [2, 3] },
    { n: 'a-f', p: 'a', c: 2, l: 0, k: 'vit', r: 's', t: ['f_{\u03B8}', 'student'], s: 5, lit: [4, 5, 6, 12, 13] },
    { n: 'a-ft', p: 'a', c: 2, l: 1, k: 'vit', r: 't', t: ['f_{\u03B8\u0303}', 'teacher'], s: 7, lit: [7, 14] },
    { n: 'a-tok', p: 'a', c: 3, l: 0, k: 'tokens', r: 's', t: [], s: 6, lit: [6] },
    { n: 'a-tokt', p: 'a', c: 3, l: 1, k: 'tokens', r: 't', t: [], s: 7, lit: [7] },
    { n: 'a-h', p: 'a', c: 4, l: 0, k: 'box', r: 's', t: ['h_{\u03B8}'], dino: ['[CLS]'], s: 10, lit: [10, 12, 13] },
    { n: 'a-ht', p: 'a', c: 4, l: 1, k: 'box', r: 't', t: ['h_{\u03B8\u0303}'], dino: ['[CLS]'], s: 9, lit: [9, 14] },
    { n: 'a-g', p: 'a', c: 5, l: 0, k: 'box', r: 's', t: ['g_{\u03B8}'], s: 10, lit: [10, 12, 13] },
    { n: 'a-gt', p: 'a', c: 5, l: 1, k: 'box', r: 't', t: ['g_{\u03B8\u0303}'], s: 9, lit: [9, 14] },
    { n: 'a-z', p: 'a', c: 6, l: 0, k: 'out', r: 's', t: ['z'], s: 10, lit: [10] },
    { n: 'a-zt', p: 'a', c: 6, l: 1, k: 'out', r: 't', t: ['z\u0303^{+}'], s: 9, lit: [9] },
    { n: 'a-loss', p: 'a', c: 7, l: 0.5, k: 'loss', r: null, t: ['D(z, sg(z\u0303^{+}))', 'image-level loss'], fs: [13, FIG_SMALL], s: 11, lit: [11, 12] },
    { n: 'b-x', p: 'b', c: 0, l: 0.5, k: 'crop', r: null, t: ['crop x'], s: 3, lit: [3] },
    { n: 'b-f', p: 'b', c: 1, l: 0, k: 'vit', r: 's', t: ['f_{\u03B8}', 'student'], s: 5, lit: [4, 5, 6, 12, 13] },
    { n: 'b-ft', p: 'b', c: 1, l: 1, k: 'vit', r: 't', t: ['f_{\u03B8\u0303}', 'teacher'], s: 7, lit: [7, 14] },
    { n: 'b-tok', p: 'b', c: 2, l: 0, k: 'tokens', r: 's', t: [], s: 6, lit: [6], query: true },
    { n: 'b-tokt', p: 'b', c: 2, l: 1, k: 'tokens', r: 't', t: [], s: 7, lit: [7] },
    { n: 'b-own', p: 'b', c: 3, l: 0, k: 'box', r: 's', t: ['f_{\u03B8}^{(i)}'], s: 10, lit: [6, 10] },
    { n: 'b-match', p: 'b', c: 3, l: 1, k: 'box', r: 't', t: ['positive', 'matching'], tt: ['positive matching'], fs: [12, 12], tfs: [12], s: 8, lit: [8] },
    { n: 'b-set', p: 'b', c: 4, l: 1, k: 'box', r: 'p', t: ['{f\u0303^{(j)}}', 'j \u2208 P(i)'], tt: ['{f\u0303^{(j)}}, j \u2208 P(i)'], fs: [FIG_BIG, 12], tfs: [13], s: 9, lit: [8, 9] },
    { n: 'b-ht', p: 'b', c: 5, l: 1, k: 'box', r: 't', t: ['h_{\u03B8\u0303}'], s: 9, lit: [9, 14] },
    { n: 'b-g', p: 'b', c: 6, l: 0, k: 'box', r: 's', t: ['g\u2032_{\u03B8}'], s: 10, lit: [10, 12, 13] },
    { n: 'b-gt', p: 'b', c: 6, l: 1, k: 'box', r: 't', t: ['g\u2032_{\u03B8\u0303}'], s: 9, lit: [9, 14] },
    { n: 'b-z', p: 'b', c: 7, l: 0, k: 'out', r: 's', t: ['z^{(i)}'], s: 10, lit: [10] },
    { n: 'b-zt', p: 'b', c: 7, l: 1, k: 'out', r: 't', t: ['z\u0303^{(i)}'], s: 9, lit: [9] },
    { n: 'b-loss', p: 'b', c: 8, l: 0.5, k: 'loss', r: null, t: ['(1/N) \u03A3_{i}', 'D(z^{(i)},', 'sg(z\u0303^{(i)}))', 'patch-level loss'],
      fs: [13, 13, 13, FIG_SMALL], tt: ['(1/N) \u03A3_{i} D(z^{(i)}, sg(z\u0303^{(i)}))', 'patch-level loss'], tfs: [13, FIG_SMALL], s: 11, lit: [11, 12] }
  ];

  // The arrows: from, to and an optional mark: 'ema' (dashed, from the student to the teacher), 'sg' (the
  // stop-gradient on the teacher's side of a loss) or a short label.
  const FIG_EDGES = [
    ['a-pic', 'a-x'], ['a-pic', 'a-xp'], ['a-x', 'a-f'], ['a-xp', 'a-ft'], ['a-f', 'a-tok'], ['a-ft', 'a-tokt'],
    ['a-tok', 'a-h'], ['a-tokt', 'a-ht'], ['a-h', 'a-g'], ['a-ht', 'a-gt'], ['a-g', 'a-z'], ['a-gt', 'a-zt'],
    ['a-z', 'a-loss'], ['a-zt', 'a-loss', 'sg'], ['a-f', 'a-ft', 'ema'],
    ['b-x', 'b-f'], ['b-x', 'b-ft'], ['b-f', 'b-tok'], ['b-ft', 'b-tokt'], ['b-tok', 'b-own'], ['b-tokt', 'b-match'],
    ['b-match', 'b-set'], ['b-set', 'b-ht'], ['b-ht', 'b-gt'], ['b-own', 'b-g', 'no h'], ['b-g', 'b-z'], ['b-gt', 'b-zt'],
    ['b-z', 'b-loss'], ['b-zt', 'b-loss', 'sg'], ['b-f', 'b-ft', 'ema']
  ];

  // The two layouts. flow 'x': the data runs left to right and the lanes are rows; flow 'y': it runs top to bottom and
  // the lanes are columns. cols are the centres of the columns along the flow, lanes the centres across it.
  const FIG_WIDE = {
    name: 'wide', flow: 'x', w: 1000, h: 448,
    a: { x: 0, y: 0, lanes: [80, 164], cols: [40, 122, 212, 290, 350, 414, 476, 646] },
    b: { x: 0, y: 212, lanes: [80, 164], cols: [40, 128, 204, 272, 374, 454, 516, 578, 696] },
    c: { x: 780, y: 0, cell: 14, mosaic: [10, 48], text: [10, 266], w: 220 },
    legend: { y: 436 }
  };
  const FIG_TALL = {
    name: 'tall', flow: 'y', w: 380, h: 1270,
    a: { x: 0, y: 0, lanes: [104, 276], cols: [70, 128, 180, 224, 262, 302, 342, 404] },
    b: { x: 0, y: 442, lanes: [104, 276], cols: [70, 128, 172, 216, 264, 308, 348, 388, 456] },
    c: { x: 0, y: 936, cell: 12, mosaic: [10, 48], text: [196, 64], w: 380 },
    legend: { y: 1184 }
  };

  const FIG_PANELS = {
    a: { title: 'Image level', sub: 'the loss DINO trains with; SelfPatch keeps it' },
    b: { title: 'Patch level', sub: 'the loss SelfPatch adds, for every patch i' },
    c: { title: 'Positive matching', sub: 'query patch i, window N(i)' }
  };

  const FIG_LABEL = 'A drawing in two rows and a side panel, redrawn after Figure 2 of the SelfPatch paper. ' +
    'Top row, image level: a picture gives two views, x and x+. The student network f-theta (green, the online network) reads x and ' +
    'the teacher network f-theta-tilde (blue, the momentum network) reads x+. Each turns its view into patch tokens; the aggregation ' +
    'module h summarises the tokens into one image-level token (in DINO the class token does this), the projection head g turns ' +
    'it into z and z-tilde-plus, and the loss D(z, sg(z-tilde-plus)) compares them, with a stop-gradient sg on the teacher' + '\u2019' +
    's side. A dashed arrow from the student to the teacher is the exponential moving average: the teacher follows the ' +
    'student slowly. Bottom row, patch level: both networks read the same crop. The teacher' + '\u2019' + 's tokens go through ' +
    'positive matching, which picks the set of positives P(i) of patch i; h and g' + '\u2032' + ' of the teacher turn that set into ' +
    'the target z-tilde-i. The student' + '\u2019' + 's own token of patch i goes through g' + '\u2032' + ' alone, without h, to z-i, and the ' +
    'loss averages D(z-i, sg(z-tilde-i)) over the N patches. Side panel, positive matching: a crop cut into 14 by 14 patches ' +
    'with the anchor i (the paper' + '\u2019' + 's query patch) outlined, the 8 patches of its window N(i) shaded, and its 4 positives outlined in orange and listed.';

  // The key along the bottom: each item's role class, its mark and its text.
  const FIG_LEGEND = [['role-student', 'line', 'student (online network)'], ['role-teacher', 'line', 'teacher (momentum network)'],
    ['role-positive', 'box', 'positives'], ['role-teacher', 'ema', 'EMA: the teacher follows'], [null, 'sg', 'sg: stop-gradient']];

  // ------------------------------------------------------------------ the contrastive wiring (section 4.4's figure)
  //
  // LabM.figure({static: true, wiring: 'contrastive'}) draws the run of Part 4 (the run spec,
  // docs/superpowers/specs/2026-10-08-supervisor-contrastive-run-design.md, sections 3, 4 and 10, and the addendum
  // design_nonlocal_2026-10-08.md, Revision 3) with the functions below. The image level is the one above. At the patch
  // level the student's own final-block token of patch i, scaled to length 1, is z^(i) itself; the teacher's tokens go
  // through the run's rule to two sets, its positives (orange) and its negatives (purple), whose tokens, scaled to
  // length 1 as well, are the targets z~^(j) and z~^(n); the heads that the patch term no longer uses (g' of both
  // networks, h of the teacher) are drawn dimmed and marked dropped, beside the paths; the loss box holds the
  // contrastive term. The side panel shows one anchor's positives and negatives on the whole crop,
  // which window.LabN.combinedSets (labs_part5.js) computes on the toy network's tokens at the run's values, so the
  // static figure needs labs_part5.js loaded when it is drawn. Every run value the drawing uses or writes passes through
  // figFact; the counts and the cells are toy numbers.

  // The run's values, each the text figFact checks against its fact: k on a 224-pixel crop (the figure's) and on a
  // 96-pixel one, the two crops' sides, the caps on the positives and the negatives, the negatives' share of the
  // crop's pairs and its quantile, the temperature, the weight lambda, and a 224-pixel crop's patches and grid.
  const FIG_RUN = {
    k: figFact('nl_k_rev3', '8'), kLocal: figFact('nl_k_local', '4'),
    crop: figFact('crop_global_side', '224'), cropLocal: figFact('crop_local_side', '96'),
    capPos: figFact('nl_eq_positives_k', '24'), capNeg: figFact('nl_eq_negatives', '48'),
    negPct: figFact('nl_neg_bottom_pct', '20'), negQ: figFact('nl_eq_tau_lo', '0.20'), tau: figFact('nl_tau', '0.2'),
    lambda: figFact('nl_eq_total', '1'), patches: figFact('patch_count_224', '196'), side: figFact('patch_grid_224', '14')
  };

  // The patch level of the contrastive wiring, in the format of FIG_NODES (the image level is FIG_NODES' panel a). Lanes:
  // 0 the student, 1 the teacher, 2 the positives' path, 3 the negatives' path, 4 the student's dropped head; drop marks
  // a dropped head, hh a fixed height, size the loss box's [wide width, wide height, tall width, tall height], and small
  // (tsmall in the tall layout) the label lines drawn in the small, muted style.
  const FIG_NODES_CON = [
    { n: 'b-x', p: 'b', c: 0, l: 0.5, k: 'crop', r: null, t: ['crop x'] },
    { n: 'b-f', p: 'b', c: 1, l: 0, k: 'vit', r: 's', t: ['f_{\u03B8}', 'student'] },
    { n: 'b-ft', p: 'b', c: 1, l: 1, k: 'vit', r: 't', t: ['f_{\u03B8\u0303}', 'teacher'] },
    { n: 'b-tok', p: 'b', c: 2, l: 0, k: 'tokens', r: 's', t: [], query: true },
    { n: 'b-tokt', p: 'b', c: 2, l: 1, k: 'tokens', r: 't', t: [] },
    { n: 'b-own', p: 'b', c: 3, l: 0, k: 'box', r: 's', t: ['f_{\u03B8}^{(i)}'] },
    { n: 'b-rule', p: 'b', c: 3, l: 1, k: 'box', r: 't', t: ['positives', 'and', 'negatives'], fs: [12, 12, 12], hh: 52,
      tt: ['positives and negatives'], tfs: [12] },
    { n: 'b-set', p: 'b', c: 4, l: 2, k: 'box', r: 'p', t: ['{f\u0303^{(j)}}', 'j \u2208 P(i)'], fs: [FIG_BIG, 12] },
    { n: 'b-neg', p: 'b', c: 4, l: 3, k: 'box', r: 'n', t: ['{f\u0303^{(n)}}', 'n \u2208 N(i)'], fs: [FIG_BIG, 12] },
    { n: 'b-ht', p: 'b', c: 5, l: 1, k: 'box', r: 't', t: ['h_{\u03B8\u0303}', 'dropped'], fs: [12, FIG_SMALL], drop: true, hh: 34 },
    { n: 'b-gt', p: 'b', c: 6, l: 1, k: 'box', r: 't', t: ['g\u2032_{\u03B8\u0303}', 'dropped'], fs: [12, FIG_SMALL], drop: true, hh: 34 },
    { n: 'b-g', p: 'b', c: 6, l: 4, k: 'box', r: 's', t: ['g\u2032_{\u03B8}', 'dropped'], fs: [12, FIG_SMALL], drop: true, hh: 34 },
    { n: 'b-z', p: 'b', c: 7, l: 0, k: 'out', r: 's', t: ['z^{(i)}'] },
    { n: 'b-zt', p: 'b', c: 7, l: 2, k: 'out', r: 't', t: ['z\u0303^{(j)}'] },
    { n: 'b-zn', p: 'b', c: 7, l: 3, k: 'out', r: 't', t: ['z\u0303^{(n)}'] },
    { n: 'b-loss', p: 'b', c: 8, l: 0.5, k: 'loss', r: null, size: [190, 170, 344, 112],
      t: ['l_{ip} = \u2212log(', 'exp(s_{ip}/\u03C4) /', '[exp(s_{ip}/\u03C4) +', '\u03A3_{n\u2208N(i)} exp(s_{in}/\u03C4)] )',
        'L_{i} = mean over P(i) of l_{ip}', 'crop: mean over its anchors', 'L_{con}: mean over the ten views',
        'L = L_{global} + \u03BB L_{con}', '\u03BB = ' + FIG_RUN.lambda + ', \u03C4 = ' + FIG_RUN.tau, 'contrastive patch term'],
      fs: [13, 13, 13, 13, FIG_SMALL, FIG_SMALL, FIG_SMALL, 12, 12, FIG_SMALL],
      small: [false, false, false, false, true, true, true, false, false, true],
      tt: ['l_{ip} = \u2212log( exp(s_{ip}/\u03C4) /', '[exp(s_{ip}/\u03C4) + \u03A3_{n\u2208N(i)} exp(s_{in}/\u03C4)] )',
        'L_{i} = mean over P(i) of l_{ip}', 'crop: mean over its anchors', 'L_{con}: mean over the ten views',
        'L = L_{global} + \u03BB L_{con}, \u03BB = ' + FIG_RUN.lambda + ', \u03C4 = ' + FIG_RUN.tau, 'contrastive patch term'],
      tfs: [13, 13, FIG_SMALL, FIG_SMALL, FIG_SMALL, 12, FIG_SMALL],
      tsmall: [false, false, true, true, true, false, true] }
  ];

  // The arrows of that patch level, in the format of FIG_EDGES; 'normalised' labels each of the three arrows into
  // z^(i), z~^(j) and z~^(n), whose tokens are scaled to length 1 on the way, and the two sets' paths pass the
  // teacher's dropped heads. An optional fourth element places a label where the arrow's middle has no room:
  // {wide: [from, dx, dy, anchor], tall: [...]}, the label's point (dx, dy) from the arrow's first point (from
  // 'start') or its tip ('end'); a layout without an entry keeps the middle.
  const FIG_LABEL_END = ['end', -10, -7, 'end'];
  const FIG_EDGES_CON = [
    ['b-x', 'b-f'], ['b-x', 'b-ft'], ['b-f', 'b-tok'], ['b-ft', 'b-tokt'], ['b-tok', 'b-own'], ['b-tokt', 'b-rule'],
    ['b-rule', 'b-set'], ['b-rule', 'b-neg'],
    ['b-set', 'b-zt', 'normalised', { wide: ['start', 6, -7, 'start'], tall: FIG_LABEL_END }],
    ['b-neg', 'b-zn', 'normalised', { wide: ['start', 6, 15, 'start'], tall: FIG_LABEL_END }],
    ['b-own', 'b-z', 'normalised', { tall: FIG_LABEL_END }],
    ['b-z', 'b-loss'], ['b-zt', 'b-loss', 'sg'], ['b-zn', 'b-loss', 'sg'], ['b-f', 'b-ft', 'ema']
  ];

  // The two layouts of the contrastive wiring: the image level where FIG_WIDE and FIG_TALL put it, a patch level with
  // the lanes above, the side panel to the right (wide) or below (tall), and the key along the bottom, in two rows when
  // it is wide (wrap: the x at which an item starts a new row). The heights leave the side panel's key, which states
  // k on both crop sizes and breaks only between clauses or before a phrase (figWrap), as much room below its last
  // line as before.
  const FIG_WIDE_CON = {
    name: 'wide', flow: 'x', w: 1040, h: 568,
    a: FIG_WIDE.a,
    b: { x: 0, y: 212, lanes: [80, 176, 146, 206, 113], cols: [40, 122, 188, 254, 370, 445, 512, 574, 724.5] },
    c: { x: 830, y: 0, cell: 14, mosaic: [10, 48], text: [10, 264], w: 210 },
    legend: { y: 466, wrap: 812 }
  };
  const FIG_TALL_CON = {
    name: 'tall', flow: 'y', w: 380, h: 1636,
    a: FIG_TALL.a,
    b: { x: 0, y: 442, lanes: [104, 281, 232, 330, 168], cols: [90, 150, 196, 242, 304, 356, 404, 456, 560] },
    c: { x: 0, y: 1080, cell: 12, mosaic: [10, 48], text: [196, 64], w: 380 },
    legend: { y: 1512 }
  };

  // The titles and the lines under them in the contrastive wiring (tall: the patch level's line in two, for the tall layout).
  const FIG_PANELS_CON = {
    a: { title: 'Image level', sub: 'the loss DINO trains with; the run keeps it' },
    b: { title: 'Patch level', sub: 'the term the run adds, for every patch i; SelfPatch' + '\u2019' + 's patch head dropped',
      tall: ['the term the run adds, for every patch i;', 'SelfPatch' + '\u2019' + 's patch head dropped'] },
    c: { title: 'Positives and negatives', sub: 'query patch i, the whole crop' }
  };

  // The key of the contrastive wiring: the negatives' purple and the dropped heads' dimmed, dashed box join it.
  const FIG_LEGEND_CON = [['role-student', 'line', 'student (online network)'], ['role-teacher', 'line', 'teacher (momentum network)'],
    ['role-positive', 'box', 'positives'], ['role-negative', 'neg', 'negatives'], ['role-teacher', 'ema', 'EMA: the teacher follows'],
    [null, 'sg', 'sg: stop-gradient'], [null, 'drop', 'dropped: not in the run' + '\u2019' + 's patch term']];

  // figFact(id, shown): the text of a run value that the contrastive drawing writes, routed through the FACTS table: the
  // id must be one of its entries, and tests/check_page.py checks each figFact literal's text against the sheet's value.
  function figFact(id, shown) {
    if (!Object.prototype.hasOwnProperty.call(FACTS, id)) throw new Error('figFact: the fact ' + id + ' is not in the FACTS table of labs_p4.js');
    return shown;
  }

  // figEsc(s): s with the characters that are special in HTML escaped, for text and double-quoted attributes.
  function figEsc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // figNum(x): a coordinate with at most one decimal, as the drawing writes it.
  function figNum(x) {
    const r = Math.round(x * 10) / 10;
    return String(r === 0 ? 0 : r);
  }

  // figLabelWidth(s, size): the width of a label in the mono face: 0.6 em per character, sub- and superscripts at 0.72 of the size, combining marks and the _{ ^{ } markup taking no room.
  function figLabelWidth(s, size) {
    let w = 0, small = false;
    for (let i = 0; i < s.length; i++) {
      const ch = s.charAt(i), code = s.charCodeAt(i);
      if ((ch === '_' || ch === '^') && s.charAt(i + 1) === '{') {
        small = true;
        i++;
        continue;
      }
      if (ch === '}' && small) {
        small = false;
        continue;
      }
      if (code >= 0x300 && code <= 0x36F) continue;
      w += 0.6 * size * (small ? 0.72 : 1);
    }
    return w;
  }

  // figSpans(s, size): SVG text content for a label: _{...} is a subscript and ^{...} a superscript, drawn at 0.72 of the size and moved with dy (baseline-shift is not supported everywhere); everything else is escaped text.
  function figSpans(s, size) {
    let out = '', cur = 0, plain = '', i = 0;
    // run(text, target, small): one run of text at the vertical offset `target` below the baseline.
    const run = function (text, target, small) {
      if (!text) return;
      const dy = target - cur;
      if (dy === 0 && !small) {
        out += figEsc(text);
        return;
      }
      out += '<tspan' + (dy !== 0 ? ' dy="' + figNum(dy) + '"' : '') + (small ? ' font-size="' + figNum(size * 0.72) + '"' : '') + '>' + figEsc(text) + '</tspan>';
      cur = target;
    };
    while (i < s.length) {
      const ch = s.charAt(i);
      const end = (ch === '_' || ch === '^') && s.charAt(i + 1) === '{' ? s.indexOf('}', i + 2) : -1;
      if (end > 0) {
        run(plain, 0, false);
        plain = '';
        run(s.slice(i + 2, end), ch === '_' ? size * 0.28 : -size * 0.42, true);
        i = end + 1;
        continue;
      }
      plain += ch;
      i++;
    }
    run(plain, 0, false);
    return out;
  }

  // figText(x, y, s, size, cls, anchor): one SVG text element with the label s.
  function figText(x, y, s, size, cls, anchor) {
    return '<text class="' + cls + '" x="' + figNum(x) + '" y="' + figNum(y) + '" font-size="' + figNum(size) + '"' +
      (anchor ? ' text-anchor="' + anchor + '"' : '') + '>' + figSpans(s, size) + '</text>';
  }

  // figLines(n, lay, o): the label lines, their font sizes and which of them are small of box n in a layout (the DINO wiring's labels where it has one; the contrastive wiring's boxes carry their own).
  function figLines(n, lay, o) {
    const tall = lay.flow === 'y';
    let lines = (tall && n.tt) ? n.tt : n.t;
    let fs = (tall && n.tt) ? (n.tfs || null) : n.fs;
    if (o.wiring === 'dino' && n.dino) {
      lines = n.dino;
      fs = null;
    }
    const sizes = lines.map(function (s, i) { return fs && fs[i] ? fs[i] : (i === 0 ? FIG_BIG : FIG_SMALL); });
    const small = (tall && n.tt) ? (n.tsmall || null) : (n.small || null);
    return { lines: lines, sizes: sizes, small: small };
  }

  // figBox(n, lay, o): where box n sits in a layout: {cx, cy, w, h, span, lines, sizes, small}; a box's own hh or size overrides the height or the size its kind gives.
  function figBox(n, lay, o) {
    const P = lay[n.p];
    const wide = lay.flow === 'x';
    const along = P.cols[n.c];
    const across = n.l === 0.5 ? (P.lanes[0] + P.lanes[1]) / 2 : P.lanes[n.l];
    const L = figLines(n, lay, o);
    let w, h;
    if (n.k === 'picture') { w = wide ? 60 : 48; h = w; }
    else if (n.k === 'crop') { w = wide ? 50 : 44; h = w; }
    else if (n.k === 'vit') { w = wide ? 90 : 128; h = wide ? 52 : 42; }
    else if (n.k === 'tokens') { w = wide ? 14 : 64; h = wide ? 52 : 14; }
    else if (n.k === 'loss') {
      w = wide ? (n.p === 'a' ? 164 : 118) : 344;
      h = wide ? 118 : (L.lines.length > 1 ? 50 : 34);
    } else {
      let widest = 0;
      L.lines.forEach(function (s, i) { widest = Math.max(widest, figLabelWidth(s, L.sizes[i])); });
      w = Math.max(n.k === 'out' ? 40 : 44, Math.ceil(widest) + 16);
      h = L.lines.length > 1 ? 42 : (n.k === 'out' ? 28 : 32);
    }
    if (n.hh) h = n.hh;
    if (n.size) {
      w = wide ? n.size[0] : n.size[2];
      h = wide ? n.size[1] : n.size[3];
    }
    return {
      cx: P.x + (wide ? along : across), cy: P.y + (wide ? across : along), w: w, h: h,
      span: n.l === 0.5, lines: L.lines, sizes: L.sizes, small: L.small
    };
  }

  // figLabel(b, cls): the label lines of a box, centred on it; the lines after the first are small, unless the box says which are.
  function figLabel(b, cls) {
    let total = 0;
    b.sizes.forEach(function (s) { total += s * 1.22; });
    let y = b.cy - total / 2;
    let out = '';
    b.lines.forEach(function (s, i) {
      y += b.sizes[i] * 1.22;
      const small = b.small ? b.small[i] : i > 0;
      out += figText(b.cx, y - b.sizes[i] * 0.3, s, b.sizes[i], small ? cls + ' lmf-small' : cls, 'middle');
    });
    return out;
  }

  // figNode(n, b, lay, o): box n as an SVG group: its role colour, whether it is lit or dropped, the stop it opens (none in the contrastive wiring, which no lab drives), its shape and its label.
  function figNode(n, b, lay, o) {
    const wide = lay.flow === 'x';
    const cls = ['lmf-node', 'lmf-' + n.k];
    if (n.r) cls.push('role-' + FIG_ROLE[n.r]);
    if (o.stop && n.lit.indexOf(o.stop) >= 0) cls.push('is-lit');
    if (n.drop) cls.push('lmf-drop');
    const L = b.cx - b.w / 2, T = b.cy - b.h / 2, R = b.cx + b.w / 2, B = b.cy + b.h / 2;
    let body = '';
    if (n.k === 'vit') {
      const d = wide
        ? 'M' + figNum(L) + ' ' + figNum(T) + 'L' + figNum(R) + ' ' + figNum(T + 8) + 'L' + figNum(R) + ' ' + figNum(B - 8) + 'L' + figNum(L) + ' ' + figNum(B) + 'Z'
        : 'M' + figNum(L) + ' ' + figNum(T) + 'L' + figNum(R) + ' ' + figNum(T) + 'L' + figNum(R - 10) + ' ' + figNum(B) + 'L' + figNum(L + 10) + ' ' + figNum(B) + 'Z';
      body += '<path class="lmf-shape" d="' + d + '"/>' + figLabel(b, 'lmf-t');
    } else if (n.k === 'tokens') {
      body += '<rect class="lmf-hit" x="' + figNum(L - 4) + '" y="' + figNum(T - 4) + '" width="' + figNum(b.w + 8) + '" height="' + figNum(b.h + 8) + '"/>';
      for (let q = 0; q < 5; q++) {
        const size = wide ? 9 : 11, gap = wide ? 1.75 : 2.25;
        const x = wide ? b.cx - size / 2 : L + q * (size + gap);
        const y = wide ? T + q * (size + gap) : b.cy - size / 2;
        let tc = 'lmf-shape lmf-tok';
        if (n.query && q === 2) tc += ' lmf-tok-q';
        if (o.wiring === 'dino' && n.p === 'a' && q === 0) tc += ' lmf-tok-cls';
        body += '<rect class="' + tc + '" x="' + figNum(x) + '" y="' + figNum(y) + '" width="' + size + '" height="' + size + '" rx="1.5"/>';
      }
    } else if (n.k === 'picture') {
      body += '<rect class="lmf-shape" x="' + figNum(L - 3) + '" y="' + figNum(T - 3) + '" width="' + figNum(b.w + 6) + '" height="' + figNum(b.h + 6) + '" rx="3"/>';
      const m = PICTURE_MOSAIC, cell = b.w / m;
      for (let r = 0; r < m; r++) {
        for (let c = 0; c < m; c++) {
          const fill = o.picture ? o.picture[r * m + c] : null;
          body += '<rect' + (fill ? ' fill="' + fill + '"' : ' class="lmf-empty"') + ' x="' + figNum(L + c * cell) + '" y="' + figNum(T + r * cell) +
            '" width="' + figNum(cell + 0.4) + '" height="' + figNum(cell + 0.4) + '"/>';
        }
      }
      body += wide ? figText(b.cx, B + 15, b.lines[0], FIG_SMALL, 'lmf-t lmf-small', 'middle')
        : figText(R + 8, b.cy + 4, b.lines[0], FIG_SMALL, 'lmf-t lmf-small', 'start');
    } else if (n.k === 'crop') {
      body += '<rect class="lmf-shape" x="' + figNum(L) + '" y="' + figNum(T) + '" width="' + figNum(b.w) + '" height="' + figNum(b.h) + '" rx="2"/>';
      let d = '';
      for (let q = 1; q < 5; q++) {
        const x = L + q * b.w / 5, y = T + q * b.h / 5;
        d += 'M' + figNum(x) + ' ' + figNum(T) + 'V' + figNum(B) + 'M' + figNum(L) + ' ' + figNum(y) + 'H' + figNum(R);
      }
      body += '<path class="lmf-cropgrid" d="' + d + '"/>';
      body += wide ? figText(b.cx, B + 15, b.lines[0], FIG_SMALL, 'lmf-t lmf-small', 'middle')
        : figText(R + 8, b.cy + 4, b.lines[0], FIG_SMALL, 'lmf-t lmf-small', 'start');
    } else {
      const rx = n.k === 'out' ? b.h / 2 : (n.k === 'loss' ? 8 : 5);
      body += '<rect class="lmf-shape" x="' + figNum(L) + '" y="' + figNum(T) + '" width="' + figNum(b.w) + '" height="' + figNum(b.h) + '" rx="' + figNum(rx) + '"/>';
      body += figLabel(b, 'lmf-t');
    }
    return '<g class="' + cls.join(' ') + '" data-node="' + n.n + '"' + (o.wiring === 'contrastive' ? '' : ' data-stop="' + n.s + '"') + '>' + body + '</g>';
  }

  // figPort(A, B, flow): the start and end points of an arrow from box A to box B along the flow, and the corner points between them when a box that spans both lanes cannot be left or entered in a straight line.
  function figPort(A, B, flow) {
    const x = flow === 'x';
    // along(b, far): the box's edge along the flow (its far side, or its near side).
    const along = function (b, far) { return x ? b.cx + (far ? 1 : -1) * b.w / 2 : b.cy + (far ? 1 : -1) * b.h / 2; };
    // centre(b): the box's centre across the flow.
    const centre = function (b) { return x ? b.cy : b.cx; };
    // half(b): half the box's size across the flow, less a margin.
    const half = function (b) { return (x ? b.h : b.w) / 2 - 4; };
    const a1 = along(A, true), a2 = along(B, false);
    let c1 = centre(A), c2 = centre(B);
    if (A.span && !B.span) c1 = Math.abs(c2 - centre(A)) <= half(A) ? c2 : centre(A);
    else if (B.span && !A.span) c2 = Math.abs(c1 - centre(B)) <= half(B) ? c1 : centre(B);
    const pts = c1 === c2 ? [[a1, c1], [a2, c2]] : [[a1, c1], [(a1 + a2) / 2, c1], [(a1 + a2) / 2, c2], [a2, c2]];
    return x ? pts : pts.map(function (p) { return [p[1], p[0]]; });
  }

  // figEdge(e, A, B, lay, roleA, roleB, o): the arrow e = [from, to, mark, place] from box A to box B as SVG markup: a line, an arrow head and, for the marks, the dashes of the EMA, the stop-gradient's double bar or a label (at the arrow's middle, or where place puts it in this layout: FIG_EDGES_CON). The EMA arrow opens stop 14 and the stop-gradient mark stop 12, so both are drawn as click targets too, except in the contrastive wiring, which no lab drives.
  function figEdge(e, A, B, lay, roleA, roleB, o) {
    const mark = e[2] || null;
    const wide = lay.flow === 'x';
    let pts;
    if (mark === 'ema') {
      pts = wide ? [[A.cx, A.cy + A.h / 2 - 4], [B.cx, B.cy - B.h / 2 + 4]] : [[A.cx + A.w / 2 - 5, A.cy], [B.cx - B.w / 2 + 5, B.cy]];
    } else {
      pts = figPort(A, B, lay.flow);
    }
    const role = mark === 'ema' ? 'teacher' : (roleA || roleB);
    const cls = 'lmf-edge' + (role ? ' role-' + role : '') + (mark === 'ema' ? ' lmf-ema' : '');
    const last = pts[pts.length - 1], prev = pts[pts.length - 2];
    const dx = last[0] - prev[0], dy = last[1] - prev[1], len = Math.sqrt(dx * dx + dy * dy) || 1;
    const ux = dx / len, uy = dy / len;
    const stop = [last[0] - ux * 6.5, last[1] - uy * 6.5];
    let d = 'M' + figNum(pts[0][0]) + ' ' + figNum(pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) d += 'L' + figNum(pts[i][0]) + ' ' + figNum(pts[i][1]);
    d += 'L' + figNum(stop[0]) + ' ' + figNum(stop[1]);
    const head = 'M' + figNum(last[0]) + ' ' + figNum(last[1]) +
      'L' + figNum(last[0] - ux * 7 - uy * 3.6) + ' ' + figNum(last[1] - uy * 7 + ux * 3.6) +
      'L' + figNum(last[0] - ux * 7 + uy * 3.6) + ' ' + figNum(last[1] - uy * 7 - ux * 3.6) + 'Z';
    let out = '<path class="' + cls + '" d="' + d + '"/><path class="lmf-head' + (role ? ' role-' + role : '') + '" d="' + head + '"/>';
    const mx = (prev[0] + last[0]) / 2, my = (prev[1] + last[1]) / 2;
    if (mark === 'sg') {
      const bar = uy === 0
        ? 'M' + figNum(mx - 4) + ' ' + figNum(my + 5) + 'L' + figNum(mx) + ' ' + figNum(my - 5) + 'M' + figNum(mx + 1) + ' ' + figNum(my + 5) + 'L' + figNum(mx + 5) + ' ' + figNum(my - 5)
        : 'M' + figNum(mx - 5) + ' ' + figNum(my - 4) + 'L' + figNum(mx + 5) + ' ' + figNum(my) + 'M' + figNum(mx - 5) + ' ' + figNum(my + 1) + 'L' + figNum(mx + 5) + ' ' + figNum(my + 5);
      out += '<path class="lmf-sg" d="' + bar + '"/>';
      out += uy === 0 ? figText(mx, my - 9, 'sg', FIG_SMALL, 'lmf-lab', 'middle') : figText(mx + 9, my + 4, 'sg', FIG_SMALL, 'lmf-lab', 'start');
    } else if (mark === 'ema') {
      out += wide ? figText(mx + 7, my + 4, 'EMA', FIG_SMALL, 'lmf-lab', 'start') : figText(mx, my - 7, 'EMA', FIG_SMALL, 'lmf-lab', 'middle');
    } else if (mark) {
      const place = e[3] ? e[3][lay.name] : null;
      if (place) {
        const from = place[0] === 'end' ? last : pts[0];
        out += figText(from[0] + place[1], from[1] + place[2], mark, FIG_SMALL, 'lmf-lab', place[3]);
      } else {
        const a = pts[0], z = last;
        const cx = (a[0] + z[0]) / 2, cy = (a[1] + z[1]) / 2;
        out += wide ? figText(cx, cy - 7, mark, FIG_SMALL, 'lmf-lab', 'middle') : figText(cx + 8, cy + 4, mark, FIG_SMALL, 'lmf-lab', 'start');
      }
    }
    if ((mark === 'ema' || mark === 'sg') && o.wiring !== 'contrastive') {
      const stop = mark === 'ema' ? 14 : 12;
      let x1 = Math.min(pts[0][0], last[0]), x2 = Math.max(pts[0][0], last[0]), y1 = Math.min(pts[0][1], last[1]), y2 = Math.max(pts[0][1], last[1]);
      if (mark === 'sg') {
        x1 = mx - 12;
        x2 = mx + 12;
        y1 = my - 18;
        y2 = my + 10;
      } else if (wide) {
        x1 -= 8;
        x2 += 36;
      } else {
        y1 -= 18;
        y2 += 8;
      }
      const hit = '<rect class="lmf-hit" x="' + figNum(x1) + '" y="' + figNum(y1) + '" width="' + figNum(x2 - x1) + '" height="' + figNum(y2 - y1) + '"/>';
      const lit = o.stop === stop ? ' is-lit' : '';
      out = '<g class="lmf-node lmf-link' + lit + '" data-node="' + e[0] + '-' + mark + '" data-stop="' + stop + '">' + hit + out + '</g>';
    }
    return out;
  }

  // figHead(p, lay, o): a panel's title and the line under it (two lines for the contrastive wiring's patch level in the tall layout).
  function figHead(p, lay, o) {
    const P = lay[p];
    if (o.wiring === 'contrastive') {
      const C = FIG_PANELS_CON[p];
      const subs = lay.flow === 'y' && C.tall ? C.tall : [C.sub];
      return figText(P.x + 10, P.y + 18, C.title, 13, 'lmf-title', null) +
        subs.map(function (s, i) { return figText(P.x + 10, P.y + 34 + 14 * i, s, FIG_SMALL, 'lmf-lab', null); }).join('');
    }
    let sub = FIG_PANELS[p].sub;
    if (o.wiring === 'dino') {
      if (p === 'a') sub = 'DINO: the class token [CLS] takes the place of h';
      else if (p === 'b') sub = 'DINO has no patch-level loss';
      else sub = 'DINO has no positives';
    }
    return figText(P.x + 10, P.y + 18, FIG_PANELS[p].title, 13, 'lmf-title', null) + figText(P.x + 10, P.y + 34, sub, FIG_SMALL, 'lmf-lab', null);
  }

  // figMosaic(P, o): the side panel's crop as a 14 x 14 mosaic of patch colours with its grid lines and frame ({markup}), and cellRect, which draws one cell of it as a rectangle.
  function figMosaic(P, o) {
    const cell = P.cell, x0 = P.x + P.mosaic[0], y0 = P.y + P.mosaic[1], side = cell * G;
    let out = '';
    for (let r = 0; r < G; r++) {
      for (let c = 0; c < G; c++) {
        const fill = o.mosaic ? o.mosaic[r * G + c] : null;
        out += '<rect' + (fill ? ' fill="' + fill + '"' : ' class="lmf-empty"') + ' x="' + figNum(x0 + c * cell) + '" y="' + figNum(y0 + r * cell) +
          '" width="' + figNum(cell + 0.3) + '" height="' + figNum(cell + 0.3) + '"/>';
      }
    }
    let grid = '';
    for (let q = 1; q < G; q++) {
      grid += 'M' + figNum(x0 + q * cell) + ' ' + figNum(y0) + 'V' + figNum(y0 + side) + 'M' + figNum(x0) + ' ' + figNum(y0 + q * cell) + 'H' + figNum(x0 + side);
    }
    out += '<path class="lmf-grid" d="' + grid + '"/>';
    out += '<rect class="lmf-frame" x="' + figNum(x0) + '" y="' + figNum(y0) + '" width="' + figNum(side) + '" height="' + figNum(side) + '"/>';
    // cellRect(index, inset, cls, attrs): one cell of the mosaic as a rectangle, inset by `inset`, with the attributes `attrs` (if any) after its class.
    const cellRect = function (index, inset, cls, attrs) {
      return '<rect class="' + cls + '"' + (attrs || '') + ' x="' + figNum(x0 + (index % G) * cell + inset) + '" y="' + figNum(y0 + Math.floor(index / G) * cell + inset) +
        '" width="' + figNum(cell - 2 * inset) + '" height="' + figNum(cell - 2 * inset) + '"/>';
    };
    return { markup: out, cellRect: cellRect };
  }

  // figMatching(lay, o): the positive-matching panel: the crop as a 14 x 14 mosaic of patch colours, the query patch outlined in ink, its wrapped window shaded, its positives outlined in orange, a legend and the list of positives.
  function figMatching(lay, o) {
    const P = lay.c;
    const m = figMosaic(P, o);
    let out = m.markup;
    const a = o.anchor;
    const cellRect = m.cellRect;
    windowOf(a, G).forEach(function (w) { out += cellRect(w.index, 0, 'lmf-nbr' + (w.wrapped ? ' lmf-wrapped' : '')); });
    const pos = o.positives && o.wiring !== 'dino' ? o.positives : [];
    pos.forEach(function (j) { out += cellRect(j, 1.4, 'lmf-pos'); });
    out += cellRect(a, 1, 'lmf-q');
    const tx = P.x + P.text[0], ty = P.y + P.text[1];
    // sw(y, cls): a legend swatch whose text baseline is y.
    const sw = function (y, cls) { return '<rect class="' + cls + '" x="' + figNum(tx) + '" y="' + figNum(y - 9) + '" width="10" height="10"/>'; };
    out += sw(ty, 'lmf-key-q') + figText(tx + 16, ty, 'anchor i ' + cellPair(a, G), FIG_SMALL, 'lmf-t lmf-small', null);
    out += sw(ty + 18, 'lmf-key-nbr') + figText(tx + 16, ty + 18, 'window N(i): 8 patches', FIG_SMALL, 'lmf-t lmf-small', null);
    out += sw(ty + 36, 'lmf-key-pos') + figText(tx + 16, ty + 36, 'positives P(i): top 4', FIG_SMALL, 'lmf-t lmf-small', null);
    let list;
    if (o.wiring === 'dino') list = ['none: DINO has no', 'patch-level loss'];
    else if (!pos.length) list = ['being computed' + ELLIPSIS];
    else list = [pos.slice(0, 2).map(function (j) { return cellPair(j, G); }).join(' '), pos.slice(2).map(function (j) { return cellPair(j, G); }).join(' ')];
    out += figText(tx, ty + 62, 'P(i), by cosine:', FIG_SMALL, 'lmf-t lmf-small', null);
    list.forEach(function (s, i) { out += figText(tx, ty + 80 + 16 * i, s, 12, 'lmf-t', null); });
    if (o.note) out += figText(tx, ty + 124, o.note, FIG_SMALL, 'lmf-lab', null);
    return out;
  }

  // The phrases figWrap never breaks: "at most" with its number, "never a positive", "k =" with its value, and a number
  // with its unit (px, %) or with "more"; the words before which a break inside a clause starts a phrase ("(", "of",
  // "at"); and the character that holds a phrase's words together while the lines are chosen.
  const FIG_KEEP = [/\bat most \S+/g, /\bnever a positive\b/g, /\bk = \S+/g, /\d+(?:\.\d+)? (?:px|%|more)(?=[\s,;)]|$)/g];
  const FIG_PHRASE = /^(?:\(|of$|at$)/;
  const FIG_GLUE = '\uE000';

  // figWrap(s, size, width): s broken at its spaces into lines no wider than width at the font size `size`, as figLabelWidth measures them (a word wider than width keeps a line of its own), never inside a phrase of FIG_KEEP. Of all the ways to break it, it takes the cheapest: a break after a word that ends a clause (", " or "; ") costs nothing, one before a word that starts a phrase (FIG_PHRASE) costs 1, any other 2; among the cheapest, the fewest lines, then the most even.
  function figWrap(s, size, width) {
    let glued = String(s);
    FIG_KEEP.forEach(function (re) { glued = glued.replace(re, function (m) { return m.split(' ').join(FIG_GLUE); }); });
    const words = glued.split(' ').filter(function (w) { return w.length > 0; });
    const n = words.length;
    // cost(j): what a break before word j costs.
    const cost = function (j) { return /[,;]$/.test(words[j - 1]) ? 0 : (FIG_PHRASE.test(words[j]) ? 1 : 2); };
    // best[i]: the cheapest setting of the first i words, as [cost, lines, unevenness of the lines before the last, where its last line starts].
    const best = [[0, 0, 0, -1]];
    for (let i = 1; i <= n; i++) {
      let pick = null;
      for (let j = i - 1; j >= 0; j--) {
        const w = figLabelWidth(words.slice(j, i).join(' '), size);
        if (w > width && i - j > 1) break;
        const slack = i < n ? width - Math.min(w, width) : 0;
        const c = [best[j][0] + (j > 0 ? cost(j) : 0), best[j][1] + 1, best[j][2] + slack * slack, j];
        if (!pick || c[0] < pick[0] || (c[0] === pick[0] && (c[1] < pick[1] || (c[1] === pick[1] && c[2] < pick[2])))) pick = c;
      }
      best.push(pick);
    }
    const lines = [];
    for (let i = n; i > 0; i = best[i][3]) lines.unshift(words.slice(best[i][3], i).join(' ').split(FIG_GLUE).join(' '));
    return lines;
  }

  // figMatchingCon(lay, o): the contrastive wiring's side panel: the same mosaic of the whole crop, the anchor outlined in ink, its positives outlined in orange, its negatives shaded purple and every other patch shaded grey (each marked cell carries data-cell, its index), a key wrapped to the panel with the toy's counts, and the positives by cosine.
  function figMatchingCon(lay, o) {
    const P = lay.c, C = o.con;
    const m = figMosaic(P, o);
    let out = m.markup;
    const a = o.anchor;
    const inP = {}, inN = {};
    C.positives.forEach(function (j) { inP[j] = true; });
    C.negatives.forEach(function (j) { inN[j] = true; });
    for (let j = 0; j < G * G; j++) {
      if (j === a || inP[j]) continue;
      out += inN[j] ? m.cellRect(j, 0, 'lmf-neg', ' data-cell="' + j + '"') : m.cellRect(j, 0, 'lmf-other');
    }
    C.positives.forEach(function (j) { out += m.cellRect(j, 1.4, 'lmf-pos', ' data-cell="' + j + '"'); });
    out += m.cellRect(a, 1, 'lmf-q', ' data-cell="' + a + '"');
    const tx = P.x + P.text[0];
    const room = P.w - P.text[0] - 22;
    let y = P.y + P.text[1];
    // item(cls, head, text): one entry of the key: its swatch beside the head line, then the text, wrapped to the panel.
    const item = function (cls, head, text) {
      out += '<rect class="' + cls + '" x="' + figNum(tx) + '" y="' + figNum(y - 9) + '" width="10" height="10"/>';
      out += figText(tx + 16, y, head, FIG_SMALL, 'lmf-t', null);
      const lines = text ? figWrap(text, FIG_SMALL, room) : [];
      lines.forEach(function (s, i) { out += figText(tx + 16, y + 14 * (i + 1), s, FIG_SMALL, 'lmf-t lmf-small', null); });
      y += 14 * lines.length + 19;
    };
    item('lmf-key-q', 'anchor i ' + cellPair(a, G), '');
    item('lmf-key-pos', 'positives P(i): ' + C.positives.length + ' here',
      'top k by cosine, k = ' + FIG_RUN.k + ' on this ' + FIG_RUN.crop + ' px crop (' + FIG_RUN.kLocal + ' on a ' + FIG_RUN.cropLocal + ' px one), ' +
      'and every pair at or above \u03C4_{hi}, at most ' + FIG_RUN.capPos);
    item('lmf-key-neg', 'negatives N(i): ' + C.negatives.length + ' here',
      'every pair at or below \u03C4_{lo}, the bottom ' + FIG_RUN.negPct + ' % of all pairs, at most ' + FIG_RUN.capNeg + ', never a positive' +
      (C.cut > 0 ? '; here the cap cut ' + C.cut + ' more' : ''));
    item('lmf-key-other', 'other patches: left alone', '');
    y += 6;
    out += figText(tx, y, 'P(i), by cosine:', FIG_SMALL, 'lmf-t lmf-small', null);
    for (let i = 0; i < C.positives.length; i += 3) {
      y += 16;
      out += figText(tx, y, C.positives.slice(i, i + 3).map(function (j) { return cellPair(j, G); }).join(' '), 12, 'lmf-t', null);
    }
    if (o.note) out += figText(tx, y + 26, o.note, FIG_SMALL, 'lmf-lab', null);
    return out;
  }

  // figLegend(lay, o): the key to the colours and marks, along the bottom of the drawing; in the contrastive wiring's wide layout it starts a new row where an item would pass lay.legend.wrap.
  function figLegend(lay, o) {
    const items = o.wiring === 'contrastive' ? FIG_LEGEND_CON : FIG_LEGEND;
    const wide = lay.flow === 'x';
    let out = '', x = 10, y = lay.legend.y;
    items.forEach(function (it, i) {
      const advance = 24 + figLabelWidth(it[2], FIG_SMALL) + (wide ? 22 : 18);
      if ((!wide && i > 0) || (wide && lay.legend.wrap && i > 0 && x + advance - 22 > lay.legend.wrap)) {
        x = 10;
        y += 18;
      }
      const role = it[0] ? ' ' + it[0] : '';
      if (it[1] === 'line') out += '<path class="lmf-edge' + role + '" d="M' + figNum(x) + ' ' + figNum(y - 4) + 'H' + figNum(x + 18) + '"/>';
      else if (it[1] === 'box') out += '<rect class="lmf-key-pos" x="' + figNum(x + 4) + '" y="' + figNum(y - 9) + '" width="10" height="10"/>';
      else if (it[1] === 'ema') out += '<path class="lmf-edge lmf-ema' + role + '" d="M' + figNum(x) + ' ' + figNum(y - 4) + 'H' + figNum(x + 18) + '"/>';
      else if (it[1] === 'neg') out += '<rect class="lmf-key-neg" x="' + figNum(x + 4) + '" y="' + figNum(y - 9) + '" width="10" height="10"/>';
      else if (it[1] === 'drop') out += '<rect class="lmf-key-drop" x="' + figNum(x) + '" y="' + figNum(y - 10) + '" width="18" height="12" rx="2"/>';
      else out += '<path class="lmf-sg" d="M' + figNum(x + 4) + ' ' + figNum(y + 1) + 'L' + figNum(x + 8) + ' ' + figNum(y - 9) + 'M' + figNum(x + 9) + ' ' + figNum(y + 1) + 'L' + figNum(x + 13) + ' ' + figNum(y - 9) + '"/>';
      out += figText(x + 24, y, it[2], FIG_SMALL, 'lmf-t lmf-small', null);
      x += advance;
    });
    return out;
  }

  // figLayout(lay, o): one whole drawing, in the wide or the tall layout, as an <svg> element's markup; the contrastive wiring takes the image level of FIG_NODES and FIG_EDGES and its own patch level and side panel.
  function figLayout(lay, o) {
    const con = o.wiring === 'contrastive';
    const list = con ? FIG_NODES.filter(function (n) { return n.p === 'a'; }).concat(FIG_NODES_CON) : FIG_NODES;
    const edges = con ? FIG_EDGES.filter(function (e) { return e[0].charAt(0) === 'a'; }).concat(FIG_EDGES_CON) : FIG_EDGES;
    const boxes = {}, nodes = {};
    list.forEach(function (n) {
      nodes[n.n] = n;
      boxes[n.n] = figBox(n, lay, o);
    });
    // panel(p): panel p's title, arrows and boxes.
    const panel = function (p) {
      let out = figHead(p, lay, o);
      edges.forEach(function (e) {
        if (nodes[e[0]].p !== p) return;
        const ra = nodes[e[0]].r ? FIG_ROLE[nodes[e[0]].r] : null, rb = nodes[e[1]].r ? FIG_ROLE[nodes[e[1]].r] : null;
        out += figEdge(e, boxes[e[0]], boxes[e[1]], lay, ra, rb, o);
      });
      list.forEach(function (n) { if (n.p === p) out += figNode(n, boxes[n.n], lay, o); });
      return out;
    };
    const off = o.wiring === 'dino' ? ' lmf-off' : '';
    const side = con ? '<g class="lmf-panel lmf-panel-c" data-panel="c">' + figHead('c', lay, o) + figMatchingCon(lay, o) + '</g>'
      : '<g class="lmf-panel lmf-panel-c' + off + '" data-panel="c" data-node="c-match" data-stop="8">' + figHead('c', lay, o) + figMatching(lay, o) + '</g>';
    return '<svg class="lmf-svg lmf-' + lay.name + '" viewBox="0 0 ' + lay.w + ' ' + lay.h + '" aria-hidden="true" focusable="false">' +
      '<g class="lmf-panel" data-panel="a">' + panel('a') + '</g>' +
      '<g class="lmf-panel' + off + '" data-panel="b">' + panel('b') + '</g>' +
      side + '<g class="lmf-legend">' + figLegend(lay, o) + '</g></svg>';
  }

  let figStatic = null;
  let figCon = null;

  // figStaticInputs(): what the static figure draws: the drawn sample (never an upload) at 224 pixels, global crop 1 at the lab's crop seed, the lab's default patch (row 5, column 7), and that patch's positives among the toy network's tokens at the lab's weight seed (at the start the teacher equals the student, so these are the teacher's), with the tokens themselves for the contrastive figure; computed once.
  function figStaticInputs() {
    if (figStatic) return figStatic;
    const C = root.Core, Toy = root.ToyViT;
    if (!C || typeof C.sampleImage !== 'function' || !Toy || typeof Toy.forwardBackbone !== 'function') {
      throw new Error('LabM.figure({static: true}) needs window.Core and window.ToyViT: load core.js and toy_vit.js first');
    }
    const img = C.sampleImage(SIDE);
    const crops = makeCrops(C, img);
    const params = Toy.init(WEIGHT_SEED, 'selfpatch');
    const e = Toy.embed(params, crops[0]);
    const bb = Toy.forwardBackbone(params, e.tokens0, { record: false });
    const sel = Toy.selectPositives(bb.tokens, G, K);
    const anchor = FOLLOW.row * G + FOLLOW.col;
    figStatic = {
      picture: mosaicOf(C, img, PICTURE_MOSAIC), mosaic: mosaicOf(C, crops[0].imageData, G), anchor: anchor,
      positives: Array.prototype.slice.call(sel.positives, anchor * K, anchor * K + K), tokens: bb.tokens
    };
    return figStatic;
  }

  // figConInputs(): what the contrastive figure adds: the run's combined rule (window.LabN.combinedSets) on the static figure's toy tokens of global crop 1, at the run's k, low quantile and caps; the anchor's positives (most similar first) and negatives (least similar first), how many more negatives the cap cut, and the crop's two thresholds; computed once.
  function figConInputs() {
    if (figCon) return figCon;
    const N = root.LabN;
    if (!N || typeof N.combinedSets !== 'function' || typeof N.cosines !== 'function') {
      throw new Error('LabM.figure({static: true, wiring: \'contrastive\'}) needs window.LabN: load labs_part5.js first');
    }
    const s = figStaticInputs();
    const T = s.tokens;
    if (T.rows !== Number(FIG_RUN.patches) || T.rows !== G * G || Number(FIG_RUN.side) !== G) {
      throw new Error('the contrastive figure needs ' + FIG_RUN.patches + ' tokens on a ' + FIG_RUN.side + ' x ' + FIG_RUN.side + ' grid, not ' + T.rows);
    }
    const rows = [];
    for (let i = 0; i < T.rows; i++) rows.push(T.row(i));
    const S = N.cosines(rows);
    const sets = N.combinedSets(S, Number(FIG_RUN.k), Number(FIG_RUN.negQ), Number(FIG_RUN.capPos), Number(FIG_RUN.capNeg));
    const a = s.anchor;
    const positives = sets.P[a].slice(), negatives = sets.N[a].slice();
    const inP = {};
    positives.forEach(function (j) { inP[j] = true; });
    let below = 0;
    for (let j = 0; j < S.length; j++) if (j !== a && !inP[j] && S[a][j] <= sets.tauLo) below++;
    figCon = { positives: positives, negatives: negatives, cut: below - negatives.length, tauHi: sets.tauHi, tauLo: sets.tauLo };
    return figCon;
  }

  // figOptions(opts): the drawing's settings: the static figure's from figStaticInputs (with figConInputs under the contrastive wiring), or the lab's live ones.
  function figOptions(opts) {
    if (opts.static) {
      const s = figStaticInputs();
      if (opts.wiring === 'contrastive') {
        return { live: false, stop: 0, wiring: 'contrastive', picture: s.picture, mosaic: s.mosaic, anchor: s.anchor, positives: null,
          con: figConInputs(), note: 'toy network, drawn sample' };
      }
      return { live: false, stop: 0, wiring: 'selfpatch', picture: s.picture, mosaic: s.mosaic, anchor: s.anchor, positives: s.positives,
        note: 'toy network, drawn sample' };
    }
    const anchor = Number.isInteger(opts.anchor) && opts.anchor >= 0 && opts.anchor < G * G ? opts.anchor : FOLLOW.row * G + FOLLOW.col;
    return {
      live: !!opts.live, stop: Number.isInteger(opts.stop) ? opts.stop : 0, wiring: opts.wiring === 'dino' ? 'dino' : 'selfpatch',
      picture: opts.picture || null, mosaic: opts.mosaic || null, anchor: anchor, positives: opts.positives || null, note: opts.note || ''
    };
  }

  // figConLabel(o): the contrastive figure's full description, in the manner of FIG_LABEL: both rows and the side panel in words, with the run's values from FIG_RUN and the toy's sets from o.con.
  function figConLabel(o) {
    const C = o.con, a = o.anchor, Q = '\u2019';
    const pairs = C.positives.map(function (j) { return 'row ' + Math.floor(j / G) + ' column ' + (j % G); }).join(', ');
    return 'A drawing in two rows and a side panel: the figure of section 2.8, itself redrawn after Figure 2 of the SelfPatch paper, drawn again for the run of Part 4. ' +
      'Top row, image level, unchanged, the loss DINO trains with, which the run keeps: a picture gives two views, x and x+. The student network f-theta (green, the online network) reads x and ' +
      'the teacher network f-theta-tilde (blue, the momentum network) reads x+. Each turns its view into patch tokens; the aggregation module h summarises the tokens into one ' +
      'image-level token, the projection head g turns it into z and z-tilde-plus, and the loss D(z, sg(z-tilde-plus)) compares them, with a stop-gradient sg on the teacher' + Q + 's side. ' +
      'A dashed arrow from the student to the teacher is the exponential moving average: the teacher follows the student slowly. ' +
      'Bottom row, patch level, the term the run adds for every patch i: both networks read the same crop. The student' + Q + 's final-block token of patch i, f-theta-i, ' +
      'scaled to length 1 on the arrow marked normalised, is z-i itself: it goes through no h and no g-prime, and the student' + Q + 's g-prime is drawn dimmed, dashed and marked dropped. ' +
      'The teacher' + Q + 's tokens go through the run' + Q + 's rule, positives and negatives, which gives two sets of the teacher' + Q + 's tokens: in orange the positives P(i), the ' +
      'k most similar patches of the whole crop, k being ' + FIG_RUN.k + ' on a ' + FIG_RUN.crop + '-pixel crop like this one and ' + FIG_RUN.kLocal + ' on a ' + FIG_RUN.cropLocal +
      '-pixel one, together with ' +
      'every pair at or above tau-high, the crop' + Q + 's quantile 1 minus k over N minus 1 of all its pairs, at most ' +
      FIG_RUN.capPos + '; and in purple the negatives N(i), every pair at or below tau-low, the crop' + Q + 's ' + FIG_RUN.negQ + ' quantile, that is the bottom ' + FIG_RUN.negPct +
      ' per cent of all its pairs, at most ' + FIG_RUN.capNeg + ' and never a positive. The teacher' + Q + 's h and g-prime are drawn dimmed, dashed and marked dropped: the run' + Q + 's patch term ' +
      'uses neither, while h still makes the image-level token of the top row. The targets z-tilde-j and z-tilde-n are the teacher' + Q + 's tokens of the positives and of the negatives, ' +
      'scaled to length 1 on arrows marked normalised as well, behind a stop-gradient. The loss box: l-i-p equals minus the log of the ratio of exp of s-i-p over tau to the sum of ' +
      'exp of s-i-p over tau and, over the negatives n in N(i), exp of s-i-n over tau, where s-i-j is the cosine of the student' + Q + 's token of i and the teacher' + Q + 's token of j, ' +
      'the dot product of z-i and z-tilde-j; L-i is the mean of l-i-p over P(i), a crop' + Q + 's ' +
      'term the mean over its anchors and L-con the mean over the ten views; L equals L-global plus lambda times L-con, with lambda ' + FIG_RUN.lambda + ' and tau ' + FIG_RUN.tau +
      ': the contrastive patch term. Side panel, positives and negatives: global crop 1 of the drawn sample, cut into ' + FIG_RUN.side + ' by ' + FIG_RUN.side + ' patches, ' +
      FIG_RUN.patches + ' in all, with the anchor i at row ' + Math.floor(a / G) + ', column ' + (a % G) + ' outlined in ink; its ' + C.positives.length + ' positives outlined in orange, ' +
      'its ' + C.negatives.length + ' negatives shaded purple' + (C.cut > 0 ? ' (the cap cut ' + C.cut + ' more)' : '') + ', and every other patch shaded grey: the term leaves it alone. ' +
      'The positives, most similar first: ' + pairs + '. These are toy numbers: Lab M' + Q + 's network with random weights at the start, when the teacher equals the student.';
  }

  // figure(opts): the paper-style drawing as HTML markup: a div (role img, with a full description) holding a wide and a tall SVG, of which the stylesheet shows the one that fits. {static: true}: the static figure of section 2.8 (the drawn sample, the lab's default patch and weights, nothing lit), the same on every call; {static: true, wiring: 'contrastive'}: section 4.4's figure of the run (needs labs_part5.js); the lab passes {live: true, stop, wiring, picture, mosaic, anchor, positives, note}.
  function figure(opts) {
    const o = figOptions(opts || {});
    const con = o.wiring === 'contrastive';
    const label = o.live
      ? 'Map of the step, after Figure 2 of the SelfPatch paper.' + (o.stop ? ' The boxes of stop ' + o.stop + ' are lit.' : '') +
        ' Click a box to open its stop; the numbered stops below do the same from the keyboard.'
      : (con ? figConLabel(o) : FIG_LABEL);
    return '<div class="lmf ' + (o.live ? 'lmf-live' : 'lmf-static') + (o.wiring === 'dino' ? ' lmf-dino' : '') + (con ? ' lmf-con' : '') + '" role="img" aria-label="' + figEsc(label) + '">\n' +
      figLayout(con ? FIG_WIDE_CON : FIG_WIDE, o) + '\n' + figLayout(con ? FIG_TALL_CON : FIG_TALL, o) + '\n</div>';
  }

  root.LabM = Object.freeze({
    version: VERSION,
    figure: figure,
    stops: Object.freeze(STOPS.map(function (s) { return s.title; })),
    defaults: Object.freeze({
      side: SIDE, cropSeed: CROP_SEED, weightSeed: WEIGHT_SEED, follow: Object.freeze({ row: FOLLOW.row, col: FOLLOW.col }), step: T_STEP.value,
      playMs: PLAY_MS, blockMs: BLOCK_MS, sliceMs: SLICE_MS, cacheBases: CACHE_BASES, cacheSteps: CACHE_STEPS,
      stops: STOPS.map(function (s) { return s.key; })
    })
  });

  // ------------------------------------------------------------------ Lab M: one image, end to end

  const Labs = root.Labs;
  if (!Labs || typeof Labs.register !== 'function') {
    logError('setup', new Error('window.Labs is missing, so core.js must load first'));
    return;
  }

  Labs.register('lab-4c-end-to-end', function mount(body, core) {
    const el = core.el;
    const Toy = root.ToyViT;
    if (!Toy || typeof Toy.trainingStep !== 'function') throw new Error('window.ToyViT is missing: toy_vit.js must load before labs_p4.js');
    const W = Toy.WIDTHS;
    const LAST = STOPS.length - 1;

    const state = {
      stop: 0, seed: WEIGHT_SEED, wiring: 'selfpatch', dropPath: false, t: T_STEP.value, follow: FOLLOW.row * G + FOLLOW.col,
      block: 1, head: 0, playing: false, blockPlaying: false, started: false, version: 0, error: null
    };
    let view = null;
    const bases = [];
    let job = null;
    let serial = 0;
    let playTimer = null;
    let blockTimer = null;
    let lastProgress = null;
    let lastMs = null;

    // ---------------------------------------------------------------- the picture, its crops and the computed steps

    // picture(): the current picture at 224 pixels, its three crops, their canvases and mosaics, made once per picture.
    function picture() {
      const cur = core.currentImage(SIDE);
      if (view && view.imageData === cur.imageData) return view;
      const crops = makeCrops(core, cur.imageData);
      view = {
        imageData: cur.imageData, source: cur.source, name: cur.name, crops: crops, canvases: {},
        picture: mosaicOf(core, cur.imageData, PICTURE_MOSAIC), mosaic: mosaicOf(core, crops[0].imageData, G)
      };
      return view;
    }

    // canvasOf(which): a canvas holding the picture ('picture') or crop 0, 1 or 2, for drawImage; made once per picture.
    function canvasOf(which) {
      const v = picture();
      if (!v.canvases[which]) v.canvases[which] = core.toCanvas(which === 'picture' ? v.imageData : v.crops[which].imageData);
      return v.canvases[which];
    }

    // baseKey(): what the forward and backward passes depend on: the picture, the weight seed, the wiring and stochastic depth.
    function baseKey() {
      return 'v' + state.version + '|seed ' + state.seed + '|' + state.wiring + '|' + (state.dropPath ? 'drop' : 'keep');
    }

    // findBase(key): the cached passes for key, or null; a hit moves to the front, so the cache drops the setting used least recently.
    function findBase(key) {
      for (let i = 0; i < bases.length; i++) {
        if (bases[i].key !== key) continue;
        if (i > 0) bases.unshift(bases.splice(i, 1)[0]);
        return bases[0];
      }
      return null;
    }

    // recordFor(need): the StepRecord the current stop draws from: for need 1 any record of the current settings (the passes do not depend on t), for need 2 the record at the current t; null while it is being computed.
    function recordFor(need) {
      const e = findBase(baseKey());
      if (!e) return null;
      if (need >= 2) return e.steps[state.t] || null;
      return e.steps[state.t] || e.base;
    }

    // ready(need): whether the current stop's record exists.
    function ready(need) {
      return need === 0 || recordFor(need) !== null;
    }

    // run(desc, iter, onDone): drive a chunked computation in slices of about 30 ms with a pause between them, so the page keeps responding; a newer run replaces it; onDone(value, ms) gets its result.
    function run(desc, iter, onDone) {
      serial += 1;
      const mine = serial;
      job = { serial: mine, kind: desc.kind, key: desc.key, t: desc.t, started: now() };
      lastProgress = null;
      state.error = null;
      syncBusy();
      const slice = core.guard(body, function () {
        if (!job || job.serial !== mine) return;
        const t0 = now();
        let r = null, last = null;
        try {
          do {
            r = iter.next();
            if (!r.done) last = r.value;
          } while (!r.done && now() - t0 < SLICE_MS);
        } catch (err) {
          job = null;
          state.error = err && err.message ? err.message : String(err);
          syncBusy();
          renderStatus();
          try {
            renderStage();
          } catch (e2) {
            logError('renderStage after a failed step', e2);
          }
          throw err;
        }
        if (!job || job.serial !== mine) return;
        if (r.done) {
          const ms = now() - job.started;
          job = null;
          lastMs = ms;
          state.error = null;
          onDone(r.value, ms);
          syncBusy();
          renderMap();
          renderStage();
          ensure();
          return;
        }
        if (last) lastProgress = last;
        renderStatus();
        root.setTimeout(slice, 0);
      });
      root.setTimeout(slice, 0);
    }

    // startBase(key): the whole step for the current settings at the current t: new weights for the seed and wiring, the teacher a copy of the student, both passes, the losses, the gradient and the update.
    function startBase(key) {
      const v = picture();
      const t = state.t, wiring = state.wiring, seed = state.seed, dropPath = state.dropPath;
      const holder = {};
      // task(): the step, with the weights made inside the first slice.
      const task = function* () {
        holder.state = { student: Toy.init(seed, wiring) };
        yield { phase: 'weights', crop: -1, unit: 0, fraction: 0 };
        holder.state.teacher = Toy.cloneParams(holder.state.student);
        return yield* Toy.trainingStep(holder.state, v.crops, { t: t, dropPath: dropPath, recordCrops: [0], chunked: true });
      };
      run({ kind: 'base', key: key, t: t }, task(), function (rec, ms) {
        const entry = { key: key, state: holder.state, crops: v.crops, base: rec, steps: {}, order: [t], ms: ms };
        entry.steps[t] = rec;
        bases.unshift(entry);
        while (bases.length > CACHE_BASES) bases.pop();
      });
    }

    // startStep(entry, t): the part of a step that t changes (the clip, the freeze, AdamW, the EMA and the student run again), reusing the entry's passes.
    function startStep(entry, t) {
      const iter = Toy.trainingStep(entry.state, entry.crops, { t: t, dropPath: state.dropPath, recordCrops: [0], from: entry.base, chunked: true });
      run({ kind: 'step', key: entry.key, t: t }, iter, function (rec) {
        entry.steps[t] = rec;
        entry.order.push(t);
        while (entry.order.length > CACHE_STEPS + 1) {
          let drop = -1;
          for (let i = 1; i < entry.order.length && drop < 0; i++) if (entry.order[i] !== t) drop = i;
          if (drop < 0) break;
          delete entry.steps[entry.order[drop]];
          entry.order.splice(drop, 1);
        }
      });
    }

    // ensure(): start whatever the current settings still need (nothing before the lab has come into view).
    function ensure() {
      if (!state.started) return;
      const key = baseKey();
      const e = findBase(key);
      if (!e) {
        if (!(job && job.kind === 'base' && job.key === key)) startBase(key);
        return;
      }
      if (e.steps[state.t]) {
        state.error = null;
        if (job) {
          job = null;
          syncBusy();
          renderStatus();
        }
        return;
      }
      if (!(job && job.kind === 'step' && job.key === key && job.t === state.t)) startStep(e, state.t);
    }

    // begin(): the lab has come into view (or the reader used it): start computing.
    function begin() {
      if (state.started) return;
      state.started = true;
      ensure();
      renderStatus();
      if (!ready(STOPS[state.stop].need)) renderStage();
    }

    // ---------------------------------------------------------------- small drawing helpers

    // canvasEl(id, w, h, label, interactive): a canvas drawn at w x h CSS pixels for the device pixel ratio, as {canvas, ctx, w, h}; an interactive one is focusable.
    function canvasEl(id, w, h, label, interactive) {
      const c = el('canvas', { id: id, class: interactive ? 'lm-pick' : null, role: interactive ? null : 'img', 'aria-label': label, tabindex: interactive ? '0' : null });
      const ctx = core.fitCanvas(c, w, h);
      return { canvas: c, ctx: ctx, w: w, h: h };
    }

    // shade(th, colour, s): the colour s of the way from the page ground to `colour` (s from 0 to 1, with a faint floor so that 0 still shows).
    function shade(th, colour, s) {
      const x = s !== s ? 0 : Math.max(0, Math.min(1, s));
      return core.mix(th.paper, colour, 0.06 + 0.94 * x);
    }

    // drawCrop(ctx, which, x, y, size, alpha): crop 0, 1 or 2 (or 'picture') drawn into a square.
    function drawCrop(ctx, which, x, y, size, alpha) {
      ctx.save();
      ctx.globalAlpha = alpha === undefined ? 1 : alpha;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(canvasOf(which), x, y, size, size);
      ctx.restore();
    }

    // gridLines(ctx, th, g, x, y, size, alpha): the lines of a g x g grid over a square.
    function gridLines(ctx, th, g, x, y, size, alpha) {
      const cell = size / g;
      ctx.save();
      ctx.strokeStyle = th.paper;
      ctx.globalAlpha = alpha === undefined ? 0.55 : alpha;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let k = 1; k < g; k++) {
        ctx.moveTo(x + Math.round(k * cell) + 0.5, y);
        ctx.lineTo(x + Math.round(k * cell) + 0.5, y + size);
        ctx.moveTo(x, y + Math.round(k * cell) + 0.5);
        ctx.lineTo(x + size, y + Math.round(k * cell) + 0.5);
      }
      ctx.stroke();
      ctx.restore();
    }

    // ring(ctx, th, index, g, x, y, size, colour, width): an outline inside one cell of a g x g grid, over a halo of the page ground.
    function ring(ctx, th, index, g, x, y, size, colour, width) {
      const cell = size / g, cx = x + (index % g) * cell, cy = y + Math.floor(index / g) * cell, inset = width / 2 + 0.5;
      ctx.save();
      ctx.lineWidth = width + 2.5;
      ctx.strokeStyle = th.paper;
      ctx.strokeRect(cx + inset, cy + inset, cell - 2 * inset, cell - 2 * inset);
      ctx.lineWidth = width;
      ctx.strokeStyle = colour;
      ctx.strokeRect(cx + inset, cy + inset, cell - 2 * inset, cell - 2 * inset);
      ctx.restore();
    }

    // heat(ctx, th, values, g, x, y, size, colour, lo, hi): a g x g heat map: each cell shaded from the ground (lo) to `colour` (hi).
    function heat(ctx, th, values, g, x, y, size, colour, lo, hi) {
      const cell = size / g, span = (hi - lo) || 1;
      for (let i = 0; i < g * g; i++) {
        ctx.fillStyle = shade(th, colour, (values[i] - lo) / span);
        ctx.fillRect(x + (i % g) * cell, y + Math.floor(i / g) * cell, Math.ceil(cell), Math.ceil(cell));
      }
    }

    // label(ctx, th, text, x, y, px, align, colour): one line of mono text with a halo of the page ground.
    function label(ctx, th, text, x, y, px, align, colour) {
      ctx.save();
      ctx.font = '600 ' + px + 'px ' + MONO;
      ctx.textAlign = align || 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 3;
      ctx.strokeStyle = th.paper;
      ctx.strokeText(text, x, y);
      ctx.fillStyle = colour || th.ink;
      ctx.fillText(text, x, y);
      ctx.restore();
    }

    // cellAt(canvas, ev, w, h, size, g, x0, y0): the cell of a g x g grid (size pixels a side at x0, y0 on a w x h canvas) under a pointer event, or -1 outside it.
    function cellAt(canvas, ev, w, h, size, g, x0, y0) {
      const p = core.canvasPoint(canvas, ev, w, h);
      const c = Math.floor((p.x - x0) / (size / g)), r = Math.floor((p.y - y0) / (size / g));
      return c >= 0 && c < g && r >= 0 && r < g ? r * g + c : -1;
    }

    // pickable(canvas, o): make a grid canvas choose the followed patch: a click on a cell, or the arrow keys when it has focus. o = {w, h, size, g, x0, y0, onPick}.
    function pickable(canvas, o) {
      canvas.addEventListener('click', userAction(function (ev) {
        const i = cellAt(canvas, ev, o.w, o.h, o.size, o.g || G, o.x0 || 0, o.y0 || 0);
        if (i >= 0) (o.onPick || follow)(i);
      }));
      canvas.addEventListener('keydown', core.guard(body, function (ev) {
        const i = moveOnGrid(state.follow, G, ev.key);
        if (i < 0) return;
        ev.preventDefault();
        userAction(function () { follow(i, true); })();
      }));
    }

    // cropGrid(o): global crop 1 on its 14 x 14 grid, drawn on a canvas, with an optional heat map, shaded cells, coloured rings, cell labels and the followed patch in ink; a click or an arrow key follows another patch. o = {id, size, label, heat: {values, colour, lo, hi, alpha}, shaded, rings: [{index, colour, width}], texts: [{index, text, colour}], noPick}
    function cropGrid(o) {
      const size = o.size || PIC.grid;
      const cv = canvasEl(o.id, size, size, o.label, !o.noPick);
      const th = core.theme(), ctx = cv.ctx;
      ctx.fillStyle = th.paper;
      ctx.fillRect(0, 0, size, size);
      drawCrop(ctx, 0, 0, 0, size, o.heat ? 0.35 : 1);
      if (o.heat) {
        ctx.save();
        ctx.globalAlpha = o.heat.alpha === undefined ? 0.85 : o.heat.alpha;
        heat(ctx, th, o.heat.values, G, 0, 0, size, o.heat.colour, o.heat.lo, o.heat.hi);
        ctx.restore();
      }
      gridLines(ctx, th, G, 0, 0, size);
      const cell = size / G;
      (o.shaded || []).forEach(function (i) {
        ctx.save();
        ctx.fillStyle = th.ignored;
        ctx.globalAlpha = 0.45;
        ctx.fillRect((i % G) * cell, Math.floor(i / G) * cell, cell, cell);
        ctx.restore();
      });
      (o.rings || []).forEach(function (r) { ring(ctx, th, r.index, G, 0, 0, size, r.colour, r.width || 2.5); });
      ring(ctx, th, state.follow, G, 0, 0, size, th.ink, 2.5);
      (o.texts || []).forEach(function (t) {
        label(ctx, th, t.text, (t.index % G + 0.5) * cell, (Math.floor(t.index / G) + 0.5) * cell, t.px || 9, 'center', t.colour);
      });
      if (!o.noPick) pickable(cv.canvas, { w: size, h: size, size: size, onPick: o.onPick });
      return cv.canvas;
    }

    // stripCanvas(o): a vector as a strip of cells, faint for its smallest number and strong for its largest, with a line under it that names the cell under the pointer; with `group` a gap after every group of cells (the heads of q, k and v). o = {id, values, colour, label, cols, cell, group, title, name(i)}
    function stripCanvas(o) {
      const n = o.values.length, cols = Math.min(o.cols || STRIP.cols, n), cell = o.cell || STRIP.cell, gap = o.group ? 3 : 0;
      const rows = Math.ceil(n / cols), groups = o.group ? Math.ceil(cols / o.group) - 1 : 0, w = cols * cell + groups * gap, h = rows * cell;
      const cv = canvasEl(o.id, w + 2, h + 2, o.label, false);
      const th = core.theme(), ctx = cv.ctx, rg = rangeOf(o.values);
      // xOf(c): the left edge of column c.
      const xOf = function (c) { return 1 + c * cell + (o.group ? Math.floor(c / o.group) * gap : 0); };
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = shade(th, o.colour, (o.values[i] - rg[0]) / ((rg[1] - rg[0]) || 1));
        ctx.fillRect(xOf(i % cols), 1 + Math.floor(i / cols) * cell, cell, cell);
      }
      ctx.strokeStyle = o.colour;
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, w + 1, h + 1);
      const summary = (o.title ? o.title + ': ' : '') + n + ' numbers from ' + show(core, rg[0], 3) + ' (faint) to ' + show(core, rg[1], 3) + ' (strong)';
      const out = el('p', { class: 'lm-hover', id: o.id + '-read' }, [summary]);
      cv.canvas.addEventListener('pointermove', core.guard(body, function (ev) {
        const p = core.canvasPoint(cv.canvas, ev, w + 2, h + 2);
        let c = -1;
        for (let k = 0; k < cols; k++) if (p.x >= xOf(k) && p.x < xOf(k) + cell) c = k;
        const i = Math.floor((p.y - 1) / cell) * cols + c;
        if (c < 0 || p.y < 1 || i < 0 || i >= n) return;
        out.textContent = (o.title ? o.title + ', ' : '') + (o.name ? o.name(i) : 'number ' + (i + 1)) + ': ' + show(core, o.values[i], 4);
      }));
      cv.canvas.addEventListener('pointerleave', core.guard(body, function () { out.textContent = summary; }));
      return el('div', { class: 'lm-strip' }, [cv.canvas, out]);
    }

    // barsCanvas(o): probabilities or other values over the toy prototypes as bars: `a` as outlines (teacher blue unless ca says otherwise) and `b` as filled bars beside them (student green unless cb), or one set in `colour`; signed values grow up and down from a zero line. o = {id, a, b, ca, cb, colour, w, h, label, signed}
    function barsCanvas(o) {
      const w = o.w || 300, h = o.h || 96, n = o.a.length;
      const cv = canvasEl(o.id, w, h, o.label, false);
      const th = core.theme(), ctx = cv.ctx;
      let big = 0;
      [o.a, o.b].forEach(function (v) { if (v) for (let i = 0; i < v.length; i++) big = Math.max(big, Math.abs(v[i])); });
      big = big || 1;
      const top = 6, bottom = h - 6, zero = o.signed ? (top + bottom) / 2 : bottom, amp = o.signed ? (bottom - top) / 2 : bottom - top;
      const gap = w / n;
      ctx.fillStyle = th.paper;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = th.muted;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, Math.round(zero) + 0.5);
      ctx.lineTo(w, Math.round(zero) + 0.5);
      ctx.stroke();
      for (let i = 0; i < n; i++) {
        const x = i * gap;
        const ha = o.a[i] / big * amp;
        if (o.b) {
          const hb = o.b[i] / big * amp;
          ctx.strokeStyle = o.ca || th.teacher;
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 0.5, Math.min(zero, zero - ha) + 0.5, Math.max(1, gap / 2 - 1), Math.max(0.5, Math.abs(ha) - 1));
          ctx.fillStyle = o.cb || th.student;
          ctx.fillRect(x + gap / 2, Math.min(zero, zero - hb), Math.max(1, gap / 2 - 0.5), Math.abs(hb));
        } else {
          ctx.fillStyle = o.colour || th.ink;
          ctx.fillRect(x + 0.5, Math.min(zero, zero - ha), Math.max(1, gap - 1), Math.abs(ha));
        }
      }
      return cv.canvas;
    }

    // svgBox(id, w, h, label): an <svg class="chart"> with viewBox 0 0 w h, drawn at w x h CSS pixels at most.
    function svgBox(id, w, h, label) {
      return el('svg', { class: 'chart lm-chart', id: id, viewBox: '0 0 ' + w + ' ' + h, width: w, height: h, role: 'img', 'aria-label': label });
    }

    // svgText(x, y, text, attrs): one SVG text element.
    function svgText(x, y, text, attrs) {
      return el('text', Object.assign({ x: x.toFixed(1), y: y.toFixed(1) }, attrs || {}), [String(text)]);
    }

    // lineChart(o): a small line chart of values against their positions, with the point `mark` enlarged. o = {id, values, w, h, label, role, mark, xLabel(i), yFormat}
    function lineChart(o) {
      const w = o.w || 300, h = o.h || 120, padL = 44, padR = 10, padT = 12, padB = 26;
      const svg = svgBox(o.id, w, h, o.label);
      const rg = rangeOf(o.values);
      const lo = Math.min(0, rg[0]), hi = rg[1] > lo ? rg[1] : lo + 1;
      const n = o.values.length;
      // X(i): the x of point i.
      const X = function (i) { return padL + (n > 1 ? i / (n - 1) : 0.5) * (w - padL - padR); };
      // Y(v): the y of value v.
      const Y = function (v) { return padT + (1 - (v - lo) / (hi - lo)) * (h - padT - padB); };
      const grid = el('g', { class: 'grid' }), axis = el('g', { class: 'axis' });
      [lo, (lo + hi) / 2, hi].forEach(function (v) {
        grid.appendChild(el('line', { x1: padL, x2: w - padR, y1: Y(v).toFixed(1), y2: Y(v).toFixed(1) }));
        svg.appendChild(svgText(padL - 5, Y(v) + 3.5, o.yFormat ? o.yFormat(v) : show(core, v, 3), { 'text-anchor': 'end' }));
      });
      axis.appendChild(el('line', { x1: padL, x2: w - padR, y1: h - padB, y2: h - padB }));
      svg.appendChild(grid);
      svg.appendChild(axis);
      const pts = o.values.map(function (v, i) { return X(i).toFixed(1) + ',' + Y(v).toFixed(1); }).join(' ');
      const g = el('g', { class: o.role ? 'role-' + o.role : null });
      g.appendChild(el('polyline', { class: 'series', points: pts }));
      o.values.forEach(function (v, i) {
        g.appendChild(el('circle', { class: 'dot', cx: X(i).toFixed(1), cy: Y(v).toFixed(1), r: i === o.mark ? 4.5 : 2.2 }));
      });
      svg.appendChild(g);
      for (let i = 0; i < n; i++) {
        const t = o.xLabel ? o.xLabel(i) : null;
        if (t !== null && t !== undefined && t !== '') svg.appendChild(svgText(X(i), h - padB + 14, t, { 'text-anchor': 'middle', class: i === o.mark ? 'title' : null }));
      }
      return svg;
    }

    // pairBars(o): grouped bars on an SVG: per group, one bar per series in its role colour, on a log or a linear scale. o = {id, groups: [{label, values: [..]}], roles: [..], w, h, label, log}
    function pairBars(o) {
      const w = o.w || 300, h = o.h || 130, padL = 44, padR = 8, padT = 10, padB = 24;
      const svg = svgBox(o.id, w, h, o.label);
      let lo = Infinity, hi = -Infinity;
      o.groups.forEach(function (gr) { gr.values.forEach(function (v) { if (v > 0) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }); });
      if (!(hi > 0)) { lo = 0.1; hi = 1; }
      const logLo = Math.floor(Math.log(lo) / Math.LN10), logHi = Math.ceil(Math.log(hi) / Math.LN10);
      const span = Math.max(1, logHi - logLo);
      // Y(v): the y of value v on the log scale (0 and below sit on the axis).
      const Y = function (v) { return v > 0 ? padT + (1 - (Math.log(v) / Math.LN10 - logLo) / span) * (h - padT - padB) : h - padB; };
      const grid = el('g', { class: 'grid' });
      for (let e = logLo; e <= logHi; e++) {
        grid.appendChild(el('line', { x1: padL, x2: w - padR, y1: Y(Math.pow(10, e)).toFixed(1), y2: Y(Math.pow(10, e)).toFixed(1) }));
        svg.appendChild(svgText(padL - 5, Y(Math.pow(10, e)) + 3.5, core.fmtSci(Math.pow(10, e), 0).replace(/^1 \S+ /, ''), { 'text-anchor': 'end' }));
      }
      svg.appendChild(grid);
      const gw = (w - padL - padR) / o.groups.length, bw = Math.max(2, (gw - 4) / o.roles.length);
      o.groups.forEach(function (gr, gi) {
        gr.values.forEach(function (v, si) {
          const x = padL + gi * gw + 2 + si * bw, y = Y(v);
          svg.appendChild(el('rect', { class: o.roles[si] ? 'bar role-' + o.roles[si] : 'bar', x: x.toFixed(1), y: y.toFixed(1), width: Math.max(1, bw - 1).toFixed(1), height: Math.max(0, h - padB - y).toFixed(1) }));
        });
        if (gr.label) svg.appendChild(svgText(padL + gi * gw + gw / 2, h - padB + 14, gr.label, { 'text-anchor': 'middle' }));
      });
      return svg;
    }

    // histogram(o): a histogram of values in `bins` bins, with the value `mark` shown as a line. o = {id, values, bins, w, h, label, mark, role}
    function histogram(o) {
      const w = o.w || 300, h = o.h || 120, padL = 30, padR = 8, padT = 10, padB = 26, bins = o.bins || HIST_BINS;
      const svg = svgBox(o.id, w, h, o.label);
      const rg = rangeOf(o.values), lo = rg[0], hi = rg[1] > rg[0] ? rg[1] : rg[0] + 1;
      const counts = new Array(bins).fill(0);
      for (let i = 0; i < o.values.length; i++) counts[Math.min(bins - 1, Math.floor((o.values[i] - lo) / (hi - lo) * bins))]++;
      const top = Math.max.apply(null, counts) || 1;
      // X(v): the x of value v.
      const X = function (v) { return padL + (v - lo) / (hi - lo) * (w - padL - padR); };
      const bw = (w - padL - padR) / bins;
      const g = el('g', { class: o.role === 'hist' ? 'lm-hist' : (o.role ? 'role-' + o.role : null) });
      counts.forEach(function (c, b) {
        const bh = c / top * (h - padT - padB);
        g.appendChild(el('rect', { class: 'bar', x: (padL + b * bw + 0.5).toFixed(1), y: (h - padB - bh).toFixed(1), width: Math.max(1, bw - 1).toFixed(1), height: bh.toFixed(1) }));
      });
      svg.appendChild(g);
      svg.appendChild(el('g', { class: 'axis' }, [el('line', { x1: padL, x2: w - padR, y1: h - padB, y2: h - padB })]));
      svg.appendChild(svgText(padL, h - padB + 14, show(core, lo, 3), { 'text-anchor': 'start' }));
      svg.appendChild(svgText(w - padR, h - padB + 14, show(core, hi, 3), { 'text-anchor': 'end' }));
      svg.appendChild(svgText(padL - 4, padT + 8, String(top), { 'text-anchor': 'end' }));
      if (o.mark !== undefined && o.mark === o.mark) {
        svg.appendChild(el('line', { class: 'lm-mark', x1: X(o.mark).toFixed(1), x2: X(o.mark).toFixed(1), y1: padT - 4, y2: h - padB }));
      }
      return svg;
    }

    // readout(rows): a <dl class="readout"> with one dt and dd per [name, content].
    function readout(rows) {
      const kids = [];
      rows.forEach(function (r) {
        if (!r) return;
        kids.push(el('dt', null, [r[0]]));
        kids.push(el('dd', null, [r[1]]));
      });
      return el('dl', { class: 'readout lm-readout' }, kids);
    }

    // dotted(name): a tensor name as text with a line-break chance after each dot, so a long name wraps between its parts.
    function dotted(name) {
      const parts = String(name).split('.'), out = [];
      for (let i = 0; i < parts.length; i++) {
        if (i) out.push(el('wbr'));
        out.push(i < parts.length - 1 ? parts[i] + '.' : parts[i]);
      }
      return out;
    }

    // para(content, cls): one paragraph of the numbers panel.
    function para(content, cls) {
      return el('p', { class: cls || null }, content);
    }

    // eq(content): a formula line in the mono face.
    function eq(content) {
      return el('p', { class: 'lm-eq' }, content);
    }

    // shownValue(x, sig): the number that show(core, x, sig) writes, as a number: what a reader who redoes a sum starts from.
    function shownValue(x, sig) {
      const s = sig || 4;
      if (x === 0 || typeof x !== 'number' || !isFinite(x)) return x;
      const a = Math.abs(x);
      if (a >= 1e-3 && a < 1e5) return Number(x.toFixed(Math.max(0, Math.min(6, s - 1 - Math.floor(Math.log(a) / Math.LN10)))));
      let e = Math.floor(Math.log10(a));
      let m = x / Math.pow(10, e);
      if (Math.abs(Number(m.toFixed(s - 1))) >= 10) {
        e += 1;
        m = x / Math.pow(10, e);
      }
      return Number(m.toFixed(s - 1)) * Math.pow(10, e);
    }

    // sigText(x, sig): x with `sig` significant digits in plain decimals, as {text, digits, value} (value: the shown number).
    function sigText(x, sig) {
      const a = Math.abs(x);
      const digits = a > 0 && isFinite(a) ? Math.max(0, Math.min(12, sig - 1 - Math.floor(Math.log(a) / Math.LN10))) : sig - 1;
      return { text: core.fmt(x, digits), digits: digits, value: Number(x.toFixed(digits)) };
    }

    // agrees(sum, shown, digits): '=' when a sum of shown parts gives the shown result to `digits` decimals, else the sign for 'about equal'.
    function agrees(sum, shown, digits) {
      return core.fmt(sum, digits) === core.fmt(shown, digits) ? '=' : APPROX;
    }

    // sup(n): a whole number in superscript digits, for a power such as beta to the step count.
    function sup(n) {
      const D = ['\u2070', '\u00B9', '\u00B2', '\u00B3', '\u2074', '\u2075', '\u2076', '\u2077', '\u2078', '\u2079'];
      return String(n).split('').map(function (c) { return c === '-' ? '\u207B' : D[Number(c)]; }).join('');
    }

    // moveWords(a, s): which way the followed weight moved at stop 13, and why, from its numbers.
    function moveWords(a, s) {
      if (a.after === a.before) return s.lr === 0 ? 'The weight did not move: the learning rate is 0 at this step.' : 'The weight did not move.';
      const up = a.after > a.before;
      if (a.g === 0) return 'Its gradient was 0, so only weight decay moved it, towards 0.';
      const against = (a.g < 0) === up;
      return 'The gradient was ' + (a.g < 0 ? 'negative' : 'positive') + ', so the weight went ' + (up ? 'up' : 'down') +
        (against ? ': AdamW moves each weight against its gradient.' : ': weight decay' + RSQUO + 's pull was larger than the step.');
    }

    // followWords(f): what the followed weight's code name means (the default: one key weight of the last block), or null.
    function followWords(f) {
      const m = /^backbone\.blocks\.(\d+)\.attn\.qkv\.weight$/.exec(f.name);
      if (!m || f.row < W.D || f.row >= 2 * W.D) return null;
      const k = f.row - W.D;
      return para(['The followed weight sits in the matrix that makes q, k and v in block ', String(Number(m[1]) + 1), ': the code counts blocks from 0, and rows ', W.D, ' to ',
        2 * W.D - 1, ' of this matrix make the keys, so row ', f.row, ' makes key number ', k % W.headDim + 1, ' of head ', Math.floor(k / W.headDim) + 1, '.']);
    }

    // cell(label, content, width): one figure of the picture panel: a mono label over the drawing.
    function cell(labelText, content, width) {
      return el('div', { class: 'stage-cell', style: width ? { maxWidth: width + 'px' } : null }, [el('p', { class: 'stage-label' }, labelText), content]);
    }

    // notice(content): a boxed remark in the numbers panel (a stop that the current wiring does not compute).
    function notice(content) {
      return el('p', { class: 'lm-notice' }, content);
    }

    // ---------------------------------------------------------------- the four areas: map, stop strip, stage, control strip

    const mapBox = el('div', { class: 'lm-map-figure', id: ID + '-map' });
    const mapDetails = el('details', { class: 'lm-map', id: ID + '-map-box', open: true }, [
      el('summary', { id: ID + '-map-summary' }, ['The map: where the current stop sits in the network (lit boxes); click a box to open its stop']),
      mapBox
    ]);

    const prevBtn = el('button', { type: 'button', class: 'btn', id: ID + '-prev', 'aria-controls': ID + '-stage' }, ['Prev']);
    const playBtn = el('button', { type: 'button', class: 'btn', id: ID + '-play', 'aria-pressed': 'false', 'aria-controls': ID + '-stage', 'aria-describedby': ID + '-play-hint' }, ['Play']);
    const nextBtn = el('button', { type: 'button', class: 'btn btn-primary', id: ID + '-next', 'aria-controls': ID + '-stage' }, ['Next']);
    const playHint = el('p', { class: 'control-hint', id: ID + '-play-hint' });
    const stopList = el('ol', { class: 'step-dots lm-stops', id: ID + '-stops', 'aria-label': 'The fourteen stops' });
    const stopButtons = STOPS.map(function (s, i) {
      const b = el('button', { type: 'button', class: 'plain', id: ID + '-stop-' + (i + 1), title: (i + 1) + '. ' + s.title,
        'aria-label': 'Stop ' + (i + 1) + ': ' + s.title, 'aria-controls': ID + '-stage' }, [String(i + 1)]);
      stopList.appendChild(el('li', null, [b]));
      return b;
    });
    const strip = el('div', { class: 'lm-strip-bar', id: ID + '-strip', role: 'group', 'aria-label': 'The stops; the arrow keys move between them' }, [
      el('div', { class: 'button-row' }, [prevBtn, playBtn, nextBtn]),
      stopList,
      playHint
    ]);

    const kicker = el('p', { class: 'stage-label', id: ID + '-kicker' });
    const titleEl = el('h5', { class: 'lm-title', id: ID + '-title' });
    const statusText = el('p', { class: 'lm-status-text', id: ID + '-status' });
    const bar = el('span', { class: 'lm-progress-bar' });
    const progress = el('div', { class: 'lm-progress', id: ID + '-progress', role: 'progressbar', 'aria-label': 'Computing the step',
      'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0' }, [bar]);
    const pic = el('div', { class: 'lm-picture', id: ID + '-picture' });
    const num = el('div', { class: 'lm-numbers', id: ID + '-numbers' });
    const stage = el('div', { class: 'lab-stage lm-stage', id: ID + '-stage' }, [
      el('div', { class: 'lm-stage-head', 'aria-live': 'polite', 'aria-atomic': 'true' }, [kicker, titleEl]),
      el('div', { class: 'lm-status' }, [statusText, progress]),
      el('div', { class: 'lm-split' }, [pic, num])
    ]);

    const seedBtn = el('button', { type: 'button', class: 'btn', id: ID + '-seed', 'aria-describedby': ID + '-seed-hint' }, ['New random weights']);
    const seedOut = el('output', { id: ID + '-seed-out', for: ID + '-seed' }, ['seed 1']);
    const wiringRadios = [['selfpatch', 'SelfPatch'], ['dino', 'DINO']].map(function (o) {
      return el('input', { type: 'radio', name: ID + '-wiring', id: ID + '-wiring-' + o[0], value: o[0], checked: o[0] === state.wiring });
    });
    const dropBox = el('input', { type: 'checkbox', id: ID + '-drop-path', checked: false, 'aria-describedby': ID + '-drop-path-hint' });
    const tInput = el('input', { type: 'range', id: ID + '-t', min: T_STEP.min, max: T_STEP.max, step: 1, value: T_STEP.value, 'aria-describedby': ID + '-t-hint' });
    const tOut = el('output', { id: ID + '-t-out', for: ID + '-t' });
    const followOut = el('output', { id: ID + '-follow-out' });
    const blockInput = el('input', { type: 'range', id: ID + '-block', min: 1, max: W.blocks, step: 1, value: state.block, 'aria-describedby': ID + '-block-hint' });
    const blockOut = el('output', { id: ID + '-block-out', for: ID + '-block' });
    const blockPlayBtn = el('button', { type: 'button', class: 'btn', id: ID + '-block-play', 'aria-pressed': 'false' }, ['Play the blocks']);
    const blockCtl = el('div', { class: 'control lm-block-control', id: ID + '-block-control' }, [el('label', { for: blockInput.id }, ['Block']), blockOut, blockInput,
      el('div', { class: 'button-row' }, [blockPlayBtn]),
      el('p', { class: 'control-hint', id: ID + '-block-hint' }, ['Play the blocks steps through all ' + W.blocks + ' blocks, one every ' + (BLOCK_MS / 1000) + ' s.'])]);

    const controls = el('div', { class: 'lab-controls lm-controls', id: ID + '-controls' }, [
      el('div', { class: 'control-group' }, [
        el('p', { class: 'control-group-title' }, ['The networks']),
        el('div', { class: 'control' }, [el('span', { class: 'control-label' }, ['Weights']), seedOut, el('div', { class: 'button-row' }, [seedBtn]),
          el('p', { class: 'control-hint', id: ID + '-seed-hint' }, ['New random numbers for every weight; the student and the teacher start equal again. The picture and its crops stay.'])]),
        el('div', { class: 'control' }, [
          el('span', { class: 'control-label', id: ID + '-wiring-label' }, ['Wiring']),
          el('div', { class: 'segmented', role: 'radiogroup', 'aria-labelledby': ID + '-wiring-label', 'aria-describedby': ID + '-wiring-hint' },
            wiringRadios.map(function (r, i) { return el('label', { for: r.id }, [r, el('span', null, [i === 0 ? 'SelfPatch' : 'DINO'])]); })),
          el('p', { class: 'control-hint', id: ID + '-wiring-hint' }, [
            'SelfPatch, as our runs use it: no class token, so a crop leaves the backbone as ', factSpan(core, 'sp_output_224', '196 \u00D7 384'), ' numbers. ',
            cite(core, 'sp_output_224'), ' DINO: a class token goes first, ', factSpan(core, 'dino_tokens_224', '197'), ' tokens, and only the image-level loss. ',
            cite(core, 'dino_tokens_224'), ' Only the wiring changes: the recipe (temperatures, momentum, learning rate) stays ours.'])
        ]),
        el('div', null, [
          el('div', { class: 'toggle-row' }, [el('label', { class: 'toggle', for: dropBox.id }, [dropBox, ' Student ', term(core, 'stochastic depth')])]),
          el('p', { class: 'control-hint', id: ID + '-drop-path-hint' }, [
            'The student skips each block', RSQUO, 's two branches at random, at a rate that rises from ', factSpan(core, 'drop_path_student', '0 to 0.1'),
            ' over the blocks; the teacher never skips (rate ', factSpan(core, 'drop_path_teacher', '0'), '). ', cite(core, 'drop_path_student'), ' Off at first.'])
        ])
      ]),
      el('div', { class: 'control-group' }, [
        el('p', { class: 'control-group-title' }, ['The step']),
        el('div', { class: 'control' }, [el('label', { for: tInput.id }, ['Step t']), tOut, tInput,
          el('p', { class: 'control-hint', id: ID + '-t-hint' }, [
            'Which optimiser step of a ', factSpan(core, 'ours_epochs_pilot', '20'), '-epoch run this is: from 1 to ', factSpan(core, 'ours_steps_20ep', '9,240'),
            ', one epoch being ', factSpan(core, 'ours_steps_per_epoch', '462'), ' steps. ', cite(core, 'ours_steps_20ep'), ' ',
            't sets the learning rate, the weight decay, the teacher', RSQUO, 's momentum and the first-epoch freeze, so it changes stops 12 to 14 only.'])])
      ]),
      el('div', { class: 'control-group' }, [
        el('p', { class: 'control-group-title' }, ['The patch you follow']),
        el('p', { class: 'lm-follow' }, [followOut]),
        el('p', { class: 'control-hint' }, ['Click a patch on a grid of the stage, or give the grid the focus and use the arrow keys.'])
      ])
    ]);
    const chooserEl = chooser(core, ID, 'Picture for the end-to-end lab');
    if (chooserEl) controls.appendChild(chooserEl);

    body.appendChild(el('div', { class: 'lm-map-wrap' }, [mapDetails]));
    body.appendChild(strip);
    body.appendChild(stage);
    body.appendChild(controls);
    body.setAttribute('data-lab-m', 'waiting');

    // ---------------------------------------------------------------- the fourteen stops
    // Each stop returns {pic, num}: the content of the picture panel and of the numbers panel. Every real number is a fact
    // span with its source tag; every other number is computed here from the toy network's StepRecord on the chosen picture.

    // stopTitle(i): the title of stop i for the stage, with its real numbers marked as facts.
    function stopTitle(i) {
      switch (i) {
        case 2: return ['Cut into ', factSpan(core, 'patch_count_224', '196'), ' patches'];
        case 3: return [factSpan(core, 'patch_values', '768'), ' numbers become a token'];
        case 4: return ['Through the ', factSpan(core, 'vit_blocks', '12'), ' blocks'];
        case 7: return ['Each patch looks at its ', factSpan(core, 'nbr_candidates', '8'), ' neighbours'];
        case 8: return ['The teacher merges the ', factSpan(core, 'sp_k', '4'), ' positives into a target'];
        default: return [STOPS[i].title];
      }
    }

    // dino(): whether the DINO wiring is chosen.
    function dino() {
      return state.wiring === 'dino';
    }

    // tokenRow(): the followed patch's row in the backbone's output (DINO puts its class token first).
    function tokenRow() {
      return dino() ? state.follow + 1 : state.follow;
    }

    // sourcePixel(): the pixel of the 224-pixel picture that lands at the centre of the followed patch of global crop 1 (the crop's rectangle and flip undone).
    function sourcePixel() {
      const c = picture().crops[0], r = c.rect;
      let u = ((state.follow % G) * PATCH + PATCH / 2) / SIDE;
      const w = (Math.floor(state.follow / G) * PATCH + PATCH / 2) / SIDE;
      if (c.applied && c.applied.flip) u = 1 - u;
      return { x: Math.max(0, Math.min(SIDE - 1, Math.floor(r.x + u * r.w))), y: Math.max(0, Math.min(SIDE - 1, Math.floor(r.y + w * r.h))) };
    }

    // pixelTable(): a table of a pixel's three bytes and each step of their normalisation, with ImageNet's means and standard deviations as facts; returns {root, show(px)}, which writes a pixel's numbers into it.
    function pixelTable() {
      const means = [factSpan(core, 'imagenet_mean', '0.485'), factSpan(core, 'imagenet_mean', '0.456'), factSpan(core, 'imagenet_mean', '0.406')];
      const stds = [factSpan(core, 'imagenet_std', '0.229'), factSpan(core, 'imagenet_std', '0.224'), factSpan(core, 'imagenet_std', '0.225')];
      const head = el('tr', null, ['colour', 'byte', 'byte / 255', 'mean', 'std', 'normalised'].map(function (h, i) { return el('th', { class: i ? 'num' : null, scope: 'col' }, [h]); }));
      const cells = [];
      const rows = ['red', 'green', 'blue'].map(function (name, c) {
        const byte = el('td', { class: 'num' }), unit = el('td', { class: 'num' }), normed = el('td', { class: 'num' });
        cells.push([byte, unit, normed]);
        return el('tr', null, [el('th', { scope: 'row' }, [name]), byte, unit, el('td', { class: 'num' }, [means[c]]), el('td', { class: 'num' }, [stds[c]]), normed]);
      });
      return {
        root: el('div', { class: 'scroll-x' }, [el('table', { class: 'lm-table' }, [el('thead', null, [head]), el('tbody', null, rows)])]),
        // show(px): write the bytes of pixel px of the picture and their normalised values into the table.
        show: function (px) {
          const d = picture().imageData.data, k = (px.y * SIDE + px.x) * 4;
          const bytes = [d[k], d[k + 1], d[k + 2]];
          const normed = core.normalisePixel(bytes[0], bytes[1], bytes[2]);
          cells.forEach(function (row, c) {
            row[0].textContent = String(bytes[c]);
            row[1].textContent = core.fmt(bytes[c] / 255, 3);
            row[2].textContent = core.fmt(normed[c], 3);
          });
        }
      };
    }

    // stopImage(): stop 1: the picture is numbers; the pixel under the pointer, or at first the one the followed patch comes from.
    function stopImage() {
      const size = PIC.grid, th = core.theme();
      const cv = canvasEl(ID + '-picture-canvas', size, size, 'The picture at 224 by 224 pixels; the ring marks the pixel that the followed patch comes from', false);
      drawCrop(cv.ctx, 'picture', 0, 0, size, 1);
      const src = sourcePixel();
      cv.ctx.save();
      cv.ctx.lineWidth = 3;
      cv.ctx.strokeStyle = th.paper;
      cv.ctx.beginPath();
      cv.ctx.arc(src.x + 0.5, src.y + 0.5, 6, 0, 2 * Math.PI);
      cv.ctx.stroke();
      cv.ctx.lineWidth = 1.75;
      cv.ctx.strokeStyle = th.ink;
      cv.ctx.stroke();
      cv.ctx.restore();
      const where = el('p', { class: 'lm-hover', id: ID + '-pixel-where' });
      const table = pixelTable();
      // showPixel(px, hovered): write the pixel's position and its numbers.
      const showPixel = function (px, hovered) {
        where.textContent = (hovered ? 'Under the pointer: ' : 'The ringed pixel, the centre of the patch you follow: ') + 'row ' + px.y + ', column ' + px.x + '.';
        table.show(px);
      };
      showPixel(src, false);
      cv.canvas.addEventListener('pointermove', core.guard(body, function (ev) {
        const p = core.canvasPoint(cv.canvas, ev, size, size);
        const px = { x: Math.max(0, Math.min(SIDE - 1, Math.floor(p.x))), y: Math.max(0, Math.min(SIDE - 1, Math.floor(p.y))) };
        showPixel(px, true);
      }));
      cv.canvas.addEventListener('pointerleave', core.guard(body, function () { showPixel(sourcePixel(), false); }));
      return {
        pic: [cell('The picture, 224 ' + TIMES + ' 224 pixels', cv.canvas, size)],
        num: [
          para(['A picture is a grid of pixels, and each pixel is ', factSpan(core, 'img_channels', '3'), ' numbers: its amounts of red, green and blue, each a whole number from ',
            factSpan(core, 'img_pixel_range', '0 to 255'), '. ', cite(core, 'img_pixel_range')]),
          para(['A crop of ', factSpan(core, 'crop_global_side', '224'), ' pixels a side enters the network as a block of ', factSpan(core, 'img_tensor_224', '3 \u00D7 224 \u00D7 224'),
            ' numbers, ', factSpan(core, 'img_values_224', '150,528'), ' in all. ', cite(core, 'img_tensor_224'), ' ', cite(core, 'img_values_224')]),
          where, table.root,
          para(['Before the network sees them, the bytes are normalised: ', factSpan(core, 'normalise_formula', '(value \u2212 mean) / std'),
            ', where value is the byte divided by 255 and mean and std are ImageNet', RSQUO, 's, one pair per colour. ', cite(core, 'normalise_formula'), ' ', cite(core, 'imagenet_mean')]),
          para(['Move the pointer over the picture to read any pixel. This lab reads the picture at 224 ', TIMES, ' 224 pixels and cuts its crops from it.'], 'lm-toy')
        ]
      };
    }

    // flagsText(applied): the augmentations a crop received, in words.
    function flagsText(applied) {
      if (!applied) return 'no augmentation';
      const out = [];
      if (applied.flip) out.push('flipped left to right');
      if (applied.jitter) {
        const gs = applied.jitter.gains.map(function (g) { return core.fmt(g, 2); }), br = applied.jitter.brightness;
        out.push('colour jitter (red, green and blue multiplied by ' + gs[0] + ', ' + gs[1] + ' and ' + gs[2] + ', then all by ' + core.fmt(br, 2) +
          (br < 1 ? ', which darkens the crop' : (br > 1 ? ', which brightens the crop' : '')) + ')');
      }
      if (applied.grey) out.push('made grey');
      if (applied.blur) out.push('blurred (radius ' + applied.blur.radius + ')');
      if (applied.solarise) out.push('solarised');
      return out.length ? out.join('; ') : 'no augmentation';
    }

    // stopViews(): stop 2: the three crops on the picture, with their share of its area and their augmentations.
    function stopViews() {
      const v = picture(), th = core.theme(), size = PIC.grid;
      const cv = canvasEl(ID + '-views-canvas', size, size, 'The picture with the rectangles of global crop 1, global crop 2 and local crop 1', false);
      drawCrop(cv.ctx, 'picture', 0, 0, size, 1);
      const styles = [[th.ink, [], 2.5], [th.ink, [6, 4], 2], [th.ink, [2, 3], 2]];
      v.crops.forEach(function (c, i) {
        const r = c.rect, k = size / (r.side || SIDE);
        cv.ctx.save();
        cv.ctx.setLineDash([]);
        cv.ctx.lineWidth = styles[i][2] + 2.5;
        cv.ctx.strokeStyle = th.paper;
        cv.ctx.strokeRect(r.x * k + 1, r.y * k + 1, r.w * k - 2, r.h * k - 2);
        cv.ctx.setLineDash(styles[i][1]);
        cv.ctx.lineWidth = styles[i][2];
        cv.ctx.strokeStyle = styles[i][0];
        cv.ctx.strokeRect(r.x * k + 1, r.y * k + 1, r.w * k - 2, r.h * k - 2);
        cv.ctx.restore();
        label(cv.ctx, th, ['G1', 'G2', 'L1'][i], r.x * k + 14, r.y * k + 10 + 12 * i, 10, 'center');
      });
      const thumbs = v.crops.map(function (c, i) {
        const s = i < 2 ? PIC.thumb : Math.round(PIC.thumb * 96 / 224 * 1.6);
        const t = canvasEl(ID + '-views-thumb-' + i, s, s, CROP_NAMES[i], false);
        drawCrop(t.ctx, i, 0, 0, s, 1);
        return cell([['G1', 'G2', 'L1'][i], ' ', c.imageData.width + ' px'], t.canvas, s + 8);
      });
      const items = v.crops.map(function (c, i) {
        const r = c.rect;
        return el('li', null, [el('strong', null, [CROP_NAMES[i] + ' (' + ['G1', 'G2', 'L1'][i] + ')']), ': ', core.fmt(r.scale * 100, 0), ' % of the picture', RSQUO,
          's area (columns ' + r.x + ' to ' + (r.x + r.w - 1) + ', rows ' + r.y + ' to ' + (r.y + r.h - 1) + '), resized to ',
          i < 2 ? factSpan(core, 'crop_global_side', '224') : factSpan(core, 'crop_local_side', '96'), ' pixels a side; ', flagsText(c.applied), '.']);
      });
      const who = dino()
        ? ['With the DINO wiring chosen, the teacher reads only global crops 1 and 2, as DINO', RSQUO, 's teacher reads only the ',
          factSpan(core, 'dino_teacher_crops', '2 global crops'), '. ', cite(core, 'dino_teacher_crops'), ' The student reads all three.']
        : ['Both networks read all three crops, as in SelfPatch, whose teacher reads ', factSpan(core, 'sp_teacher_crops', 'all 10 crops'), '. ',
          cite(core, 'sp_teacher_crops'), ' DINO', RSQUO, 's teacher reads only the ', factSpan(core, 'dino_teacher_crops', '2 global crops'), '. ', cite(core, 'dino_teacher_crops')];
      return {
        pic: [cell('Where the three crops come from', cv.canvas, size), el('div', { class: 'stage-row' }, thumbs)],
        num: [
          para(['Training shows the network crops of the picture, not the picture as it is: it cuts them at random, resizes them and changes their colours a little, so that the network must recognise the same thing in different views.']),
          el('ul', { class: 'lm-list' }, items),
          para(['The real recipe cuts ', factSpan(core, 'crop_total', '10'), ' crops per picture: ', factSpan(core, 'crop_global_count', '2'), ' global crops, each covering ',
            factSpan(core, 'crop_global_scale', '0.25 to 1.0'), ' of the area, and ', factSpan(core, 'crop_local_count', '8'), ' local crops covering ',
            factSpan(core, 'crop_local_scale', '0.05 to 0.25'), '. ', cite(core, 'crop_total'), ' ', cite(core, 'crop_global_scale'),
            ' This lab computes the first three.']),
          para(['A batch of global crops has the shape ', el('span', { class: 'shape' }, [factSpan(core, 'shape_input_global', 'B \u00D7 3 \u00D7 224 \u00D7 224')]),
            ' and a batch of local crops ', el('span', { class: 'shape' }, [factSpan(core, 'shape_input_local', 'B \u00D7 3 \u00D7 96 \u00D7 96')]), ', B being the number of pictures. ',
            cite(core, 'shape_input_global')]),
          para(who)
        ]
      };
    }

    // patchValues(i): the 768 numbers of patch i of global crop 1 in the order the real 16 x 16 convolution reads them (colour, then row, then column), normalised, with their bytes.
    function patchValues(i) {
      const img = picture().crops[0].imageData, d = img.data, side = img.width;
      const C = core.constants, mean = C.imagenetMean, std = C.imagenetStd;
      const r0 = Math.floor(i / G) * PATCH, c0 = (i % G) * PATCH;
      const values = new Float64Array(PATCH * PATCH * 3), bytes = new Uint8Array(PATCH * PATCH * 3);
      for (let ch = 0; ch < 3; ch++) {
        for (let y = 0; y < PATCH; y++) {
          for (let x = 0; x < PATCH; x++) {
            const b = d[((r0 + y) * side + c0 + x) * 4 + ch], o = ch * PATCH * PATCH + y * PATCH + x;
            bytes[o] = b;
            values[o] = (b / 255 - mean[ch]) / std[ch];
          }
        }
      }
      return { values: values, bytes: bytes };
    }

    // planesCanvas(pv): a patch's 768 numbers as three 16 x 16 planes (red, green, blue) in the order the network reads them, faint for the smallest and strong for the largest, with a line that names the number under the pointer.
    function planesCanvas(pv) {
      const th = core.theme(), cell = 5, side = PATCH * cell, gap = 10, top = 14, w = 3 * side + 2 * gap, h = top + side;
      const cv = canvasEl(ID + '-patch-planes', w, h, 'The 768 numbers of the patch you follow: three planes of 16 by 16, red, green and blue', false);
      const ctx = cv.ctx, rg = rangeOf(pv.values), names = ['red', 'green', 'blue'];
      ctx.fillStyle = th.paper;
      ctx.fillRect(0, 0, w, h);
      for (let ch = 0; ch < 3; ch++) {
        const x0 = ch * (side + gap);
        label(ctx, th, names[ch], x0 + side / 2, 6, 10, 'center', th.muted);
        for (let y = 0; y < PATCH; y++) {
          for (let x = 0; x < PATCH; x++) {
            const k = ch * PATCH * PATCH + y * PATCH + x;
            ctx.fillStyle = shade(th, th.ink, (pv.values[k] - rg[0]) / ((rg[1] - rg[0]) || 1));
            ctx.fillRect(x0 + x * cell, top + y * cell, cell, cell);
          }
        }
        ctx.strokeStyle = th.muted;
        ctx.lineWidth = 1;
        ctx.strokeRect(x0 + 0.5, top + 0.5, side - 1, side - 1);
      }
      const out = el('p', { class: 'lm-hover', id: ID + '-patch-planes-read' }, ['768 numbers from ' + show(core, rg[0], 3) + ' (faint) to ' + show(core, rg[1], 3) + ' (strong); point at one']);
      const rest = out.textContent;
      cv.canvas.addEventListener('pointermove', core.guard(body, function (ev) {
        const p = core.canvasPoint(cv.canvas, ev, w, h);
        const ch = Math.floor(p.x / (side + gap)), x = Math.floor((p.x - ch * (side + gap)) / cell), y = Math.floor((p.y - top) / cell);
        if (ch < 0 || ch > 2 || x < 0 || x >= PATCH || y < 0 || y >= PATCH) return;
        const k = ch * PATCH * PATCH + y * PATCH + x;
        out.textContent = 'number ' + (k + 1) + ': ' + names[ch] + ' of pixel (row ' + y + ', column ' + x + '), byte ' + pv.bytes[k] + ', normalised ' + show(core, pv.values[k], 3);
      }));
      cv.canvas.addEventListener('pointerleave', core.guard(body, function () { out.textContent = rest; }));
      return el('div', { class: 'lm-strip' }, [cv.canvas, out]);
    }

    // patchZoom(size): the followed patch of global crop 1 enlarged, with its 16 x 16 pixels kept sharp.
    function patchZoom(size) {
      const cv = canvasEl(ID + '-patch-zoom', size, size, 'The patch you follow, enlarged: 16 by 16 pixels', false);
      const r = Math.floor(state.follow / G) * PATCH, c = (state.follow % G) * PATCH;
      cv.ctx.imageSmoothingEnabled = false;
      cv.ctx.drawImage(canvasOf(0), c, r, PATCH, PATCH, 0, 0, size, size);
      cv.canvas.setAttribute('class', 'pixelated');
      return cv.canvas;
    }

    // stopPatches(): stop 3: global crop 1 cut into its 14 x 14 grid, the followed patch and its 768 numbers, and the local crop's 6 x 6 grid.
    function stopPatches() {
      const th = core.theme();
      const local = canvasEl(ID + '-local-grid', PIC.local, PIC.local, 'Local crop 1 cut into 6 by 6 patches', false);
      drawCrop(local.ctx, 2, 0, 0, PIC.local, 1);
      gridLines(local.ctx, th, 6, 0, 0, PIC.local, 0.7);
      const strip = planesCanvas(patchValues(state.follow));
      const idx = state.follow;
      return {
        pic: [
          cell('Global crop 1: click a patch to follow it', cropGrid({ id: ID + '-patches-grid', label: 'Global crop 1 cut into 14 by 14 patches; click a patch to follow it' }), PIC.grid),
          el('div', { class: 'stage-row' }, [cell('The patch you follow', patchZoom(PIC.swatch), PIC.swatch), cell('Local crop 1', local.canvas, PIC.local + 8)])
        ],
        num: [
          para(['The network does not read pixels one by one. It cuts the crop into square patches of ', factSpan(core, 'patch_size', '16'), ' ', TIMES, ' ',
            factSpan(core, 'patch_size', '16'), ' pixels, and each patch, with its three colours, is ', factSpan(core, 'patch_values', '768'), ' numbers. ',
            cite(core, 'patch_size'), ' ', cite(core, 'patch_values')]),
          para(['A global crop gives ', factSpan(core, 'patch_grid_224', '14 \u00D7 14'), ' = ', factSpan(core, 'patch_count_224', '196'), ' patches and the local crop ',
            factSpan(core, 'patch_grid_96', '6 \u00D7 6'), ' = ', factSpan(core, 'patch_count_96', '36'), '. ', cite(core, 'patch_grid_224')]),
          para(['You follow ', cellName(idx, G), ': patch number ', Math.floor(idx / G) + ' ' + TIMES + ' 14 + ' + (idx % G) + ' = ' + idx, ', counting row by row from 0.']),
          para(['Its numbers, normalised as at stop 1, in the order the network reads them: all the red values row by row, then the green, then the blue. They are global crop 1', RSQUO,
            's pixels, resized and changed at stop 2, so they differ from the picture', RSQUO, 's own pixels at stop 1.']),
          strip
        ]
      };
    }

    // stopEmbed(): stop 4: the patch's 768 numbers become a token of 48 (real 384) numbers, and its position row is added.
    function stopEmbed() {
      const rec = recordFor(1), th = core.theme(), c0 = rec.crops[0];
      const i = state.follow, row = tokenRow();
      const Wt = rec.stateBefore.student.byName['backbone.patch_embed.proj.weight'], Bt = rec.stateBefore.student.byName['backbone.patch_embed.proj.bias'];
      const cols = 64, cw = 4;
      const corner = canvasEl(ID + '-embed-weights', cols * cw, W.D * cw, 'A corner of the patch embedding weights: 48 rows by the first 64 of 768 columns', false);
      const block = new Float64Array(W.D * cols);
      for (let r = 0; r < W.D; r++) for (let c = 0; c < cols; c++) block[r * cols + c] = Wt.data[r * Wt.cols + c];
      const rg = rangeOf(block);
      for (let r = 0; r < W.D; r++) {
        for (let c = 0; c < cols; c++) {
          corner.ctx.fillStyle = shade(th, th.student, (block[r * cols + c] - rg[0]) / ((rg[1] - rg[0]) || 1));
          corner.ctx.fillRect(c * cw, r * cw, cw, cw);
        }
      }
      const x = rowOf(c0.patches, i), w0 = Wt.data.subarray(0, Wt.cols);
      let dot0 = 0;
      for (let k = 0; k < x.length; k++) dot0 += w0[k] * x[k];
      const projected = rowOf(c0.projected, i), pos = rowOf(c0.pos, dino() ? i + 1 : i), token = rowOf(c0.tokens0, row);
      const num = [
        para(['A patch becomes a token through one linear map: each output number is a weighted sum of the ', factSpan(core, 'patch_values', '768'),
          ' numbers plus a bias b, with its own row of the weights W. Toy 768 ', RARR, ' ', W.D, ', real ', factSpan(core, 'patch_embed_map', '768 \u2192 384'), '. ',
          cite(core, 'patch_embed_map')]),
        eq(['output 1 = (row 1 of W) ', DOT, ' patch + b = ', show(core, dot0), ' + ', show(core, Bt.data[0]), ' = ', show(core, projected[0])]),
        stripCanvas({ id: ID + '-embed-projected', values: projected, colour: th.student, label: 'The 48 outputs of the linear map' }),
        para(['The token must also say where the patch was, so the row of the position table for its place, ', cellPair(i, G), ', is added. The table is toy ',
          (dino() ? '197' : '196') + ' ' + TIMES + ' ' + W.D + ', real ', dino() ? factSpan(core, 'dino_pos_embed_shape', '197 \u00D7 384') : factSpan(core, 'pos_embed_shape', '196 \u00D7 384'), '. ',
          dino() ? cite(core, 'dino_pos_embed_shape') : cite(core, 'pos_embed_shape')]),
        stripCanvas({ id: ID + '-embed-position', values: pos, colour: th.student, label: 'The position row that is added' }),
        para(['token = W ', DOT, ' patch + b + position: ', W.D, ' numbers of length ', show(core, normOf(token)), '. Every patch of every crop gets one;',
          ' local crop 1 gets its 36 rows by ', factSpan(core, 'pos_embed_resize', 'bicubic'), ' resizing of the ', factSpan(core, 'patch_grid_224', '14 \u00D7 14'),
          ' table. ', cite(core, 'pos_embed_resize')]),
        stripCanvas({ id: ID + '-embed-token', values: token, colour: th.student, label: 'The token: the outputs plus the position row' })
      ];
      if (dino()) {
        num.push(para(['DINO puts its ', term(core, 'class token'), ' first (', factSpan(core, 'dino_cls_first', 'class token first'), '), one more learned token of toy ', W.D,
          ', real ', factSpan(core, 'dino_cls_token', '1 \u00D7 384'), ' numbers, so ', factSpan(core, 'dino_tokens_224', '197'), ' tokens enter the blocks and your patch is token ',
          String(row), '. ', cite(core, 'dino_cls_first'), ' ', cite(core, 'dino_tokens_224')]));
      }
      return {
        pic: [cell('The patch you follow', patchZoom(PIC.swatch), PIC.swatch),
          cell(['A corner of W: ', W.D, ' rows ', TIMES, ' the first ', cols, ' of 768 columns (faint: the most negative, strong: the most positive)'], corner.canvas, cols * cw)],
        num: num
      };
    }

    // headTop(mapRow, n, hasCls): the n largest attention weights of one row of a head's map, as [{index (a patch, or -1 for the class token), weight}].
    function headTop(mapRow, n, hasCls) {
      const order = topIndices(mapRow, n);
      return order.map(function (j) { return { index: hasCls ? j - 1 : j, weight: mapRow[j] }; });
    }

    // topWords(list): the largest attention weights in words.
    function topWords(list) {
      return list.map(function (t) {
        return show(core, t.weight, 3) + ' to ' + (t.index < 0 ? 'the class token' : (t.index === state.follow ? 'itself' : 'the patch ' + relWords(state.follow, t.index, G) + ' ' + cellPair(t.index, G)));
      }).join('; ');
    }

    // stopBlocks(): stop 5: the followed token through one block: LayerNorm, q, k and v, the six heads' attention, the residual additions and the MLP; the token's length across the 12 blocks.
    function stopBlocks() {
      const rec = recordFor(1), th = core.theme(), c0 = rec.crops[0];
      const b = state.block - 1, blk = c0.blocks[b], row = tokenRow(), hasCls = dino();
      const n = c0.tokens.rows, hd = W.headDim;
      const maps = el('div', { class: 'stage-row lm-heads' });
      const heads = [], spread = [];
      for (let h = 0; h < W.heads; h++) {
        const m = blk.attn[h], mapRow = rowOf(m, row);
        const vals = new Float64Array(G * G);
        for (let j = 0; j < G * G; j++) vals[j] = mapRow[hasCls ? j + 1 : j];
        const rg = rangeOf(vals);
        const size = PIC.head;
        const cv = canvasEl(ID + '-head-' + (h + 1), size, size, 'Head ' + (h + 1) + ': how much the patch you follow attends to every patch', true);
        const ctx = cv.ctx;
        ctx.fillStyle = th.paper;
        ctx.fillRect(0, 0, size, size);
        heat(ctx, th, vals, G, 0, 0, size, th.student, rg[0], rg[1]);
        ring(ctx, th, state.follow, G, 0, 0, size, th.ink, 1.5);
        if (h === state.head) {
          ctx.strokeStyle = th.ink;
          ctx.lineWidth = 3;
          ctx.strokeRect(1.5, 1.5, size - 3, size - 3);
        }
        const top = headTop(mapRow, TOP, hasCls);
        heads.push(top);
        const hh = h;
        pickable(cv.canvas, { w: size, h: size, size: size, onPick: function (j) { state.head = hh; follow(j); } });
        maps.appendChild(cell(['head ' + (h + 1) + ': top ' + show(core, top[0].weight, 3)], cv.canvas, size + 6));
        spread.push(rg);
      }
      let lowest = Infinity, highest = 0;
      spread.forEach(function (rg) { lowest = Math.min(lowest, rg[0]); highest = Math.max(highest, rg[1]); });
      const skipped = blk.skipped && (blk.skipped.attn || blk.skipped.mlp);
      const hidden = rowOf(blk.hidden, row);
      let positive = 0;
      for (let k = 0; k < hidden.length; k++) if (hidden[k] > 0) positive++;
      let moved = 0;
      for (let r = 0; r < n; r++) {
        const a = rowOf(blk.input, r), z = rowOf(blk.out, r);
        let s = 0;
        for (let k = 0; k < a.length; k++) s += (z[k] - a[k]) * (z[k] - a[k]);
        moved += Math.sqrt(s);
      }
      moved /= n;
      const lengths = [normOf(rowOf(c0.blocks[0].input, row))];
      c0.blocks.forEach(function (bk) { lengths.push(normOf(rowOf(bk.out, row))); });
      // headName(k): a number of q, k or v named by its head.
      const headName = function (k) { return 'head ' + (Math.floor(k / hd) + 1) + ', number ' + (k % hd + 1); };
      const qkv = ['q', 'k', 'v'].map(function (name) {
        return stripCanvas({ id: ID + '-block-' + name, values: rowOf(blk[name], row), colour: th.student, group: hd, cell: 5, title: name,
          label: 'The ' + name + ' of the token you follow in block ' + state.block + ', in ' + W.heads + ' heads of ' + hd, name: headName });
      });
      const steps = el('ol', { class: 'lm-steps' }, [
        el('li', null, ['In: the token of ', cellPair(state.follow, G), hasCls ? ' (token ' + row + ', after the class token)' : '', ', length ', show(core, normOf(rowOf(blk.input, row))), '.',
          stripCanvas({ id: ID + '-block-in', values: rowOf(blk.input, row), colour: th.student, cell: 5, title: 'before', label: 'The token entering block ' + state.block })]),
        el('li', null, [term(core, 'layernorm', 'LayerNorm'), ': its numbers are shifted and rescaled to mean 0 and spread 1 (', EPS, ' = ', factSpan(core, 'vit_layernorm_eps', '1e-6'), '). ',
          cite(core, 'vit_layernorm_eps')]),
        el('li', null, ['q, k and v: one linear map makes all three, toy ', W.D, ' ', RARR, ' ', 3 * W.D, ', real ', factSpan(core, 'vit_qkv', '384 \u2192 1,152'), ', cut into ',
          W.heads, ' heads of ', hd, ' numbers (real ', factSpan(core, 'vit_heads', '6'), ' heads of ', factSpan(core, 'vit_head_width', '64'), '). ', cite(core, 'vit_qkv'), ' ', cite(core, 'vit_head_width'),
          qkv]),
        el('li', null, ['Attention: in each head the patch', RSQUO, 's q meets every token', RSQUO, 's k, score = q ', DOT, ' k / ', SQRT, hd, ' (real: divided by ', SQRT, '64 = ',
          factSpan(core, 'vit_attention_scale', '8'), '), and a softmax turns the scores into weights that add up to 1. ', cite(core, 'vit_attention_scale'),
          ' Head ' + (state.head + 1) + ' (click a map to choose one): ', topWords(heads[state.head]), '.']),
        el('li', null, ['The weighted sums of v from the ', W.heads, ' heads, side by side, pass one more linear map and are added to the token: a change of length ',
          show(core, normOf(rowOf(blk.proj, row))), '.', blk.skipped && blk.skipped.attn ? ' Here the student skipped this branch (stochastic depth), so nothing was added.' : '']),
        el('li', null, ['Another LayerNorm, then the ', term(core, 'mlp', 'MLP'), ': toy ', W.D, ' ', RARR, ' ', W.mlp, ' ', RARR, ' ', W.D, ', real ',
          factSpan(core, 'vit_mlp', '384 \u2192 1,536 \u2192 384'), ', with a ', term(core, 'gelu', 'GELU'), ' between: ', positive, ' of the ', W.mlp,
          ' hidden numbers are positive. ', cite(core, 'vit_mlp')]),
        el('li', null, ['Its output is added too (length ', show(core, normOf(rowOf(blk.mlpOut, row))), '), and the token leaves block ', state.block,
          ' with length ', show(core, normOf(rowOf(blk.out, row))), '.', blk.skipped && blk.skipped.mlp ? ' The student skipped this branch here.' : '',
          stripCanvas({ id: ID + '-block-out', values: rowOf(blk.out, row), colour: th.student, cell: 5, title: 'after', label: 'The token leaving block ' + state.block })])
      ]);
      blockOut.textContent = 'block ' + state.block + ' of ' + W.blocks;
      if (Number(blockInput.value) !== state.block) blockInput.value = String(state.block);
      blockInput.setAttribute('aria-valuetext', 'block ' + state.block + ' of ' + W.blocks);
      const num = [
        blockCtl,
        para(['Block ', String(state.block), ' of ', factSpan(core, 'vit_blocks', '12'), '. Each block does the same two things, with its own weights. ', cite(core, 'vit_blocks')]),
        steps,
        eq([factSpan(core, 'vit_residual', 'U = Z + MSA(LN(Z)); Z_next = U + MLP(LN(U))'), ' ', cite(core, 'vit_residual')]),
        para(['The two additions are ', term(core, 'residual connection', 'residual connections'), ': the token keeps what it had and gains a change. Over all ', n,
          ' tokens, block ', state.block, ' changes a token by ', show(core, moved), ' on average.']),
        para(['With random weights the heads attend almost evenly: in this block the weights run from ', show(core, lowest, 3), ' to ', show(core, highest, 3),
          ', close to 1/', n, ' = ', show(core, 1 / n, 3), ' each. Each map stretches its own small range from faint to strong. Training is what makes attention pick out parts: the real runs of this course start from',
          ' trained backbones (Part 5), and a trained DINO backbone', RSQUO, 's attention already does (3.7); this toy starts from random weights.'], 'lm-toy')
      ];
      if (skipped) num.push(para(['Stochastic depth: in this block the student skipped ' + (blk.skipped.attn && blk.skipped.mlp ? 'both branches' : (blk.skipped.attn ? 'the attention branch' : 'the MLP branch')) +
        ' for this crop; its rate here is ' + core.fmt(blk.rate, 3) + '.'], 'lm-toy'));
      num.push(cell('The token' + RSQUO + 's length after each block (' + RSQUO + 'in' + RSQUO + ' before block 1)',
        lineChart({ id: ID + '-block-norms', values: lengths, w: 300, h: 120, role: 'student', mark: state.block, label: 'The length of the token of the patch you follow before block 1 and after each of the 12 blocks',
          xLabel: function (k) { return k === 0 ? 'in' : (k % 2 === 0 || k === state.block ? String(k) : ''); } }), 300));
      return {
        pic: [cell(['Where the patch you follow looks in block ', String(state.block), ': one map per head (strong: large weight)'], maps, 300)],
        num: num
      };
    }

    // tokenStats(tokens, hasCls): the length of every patch token and the cosine of each to the followed one, on the 14 x 14 grid.
    function tokenStats(tokens, hasCls) {
      const off = hasCls ? 1 : 0;
      const me = rowOf(tokens, state.follow + off);
      const norms = new Float64Array(G * G), cos = new Float64Array(G * G);
      for (let j = 0; j < G * G; j++) {
        const r = rowOf(tokens, j + off);
        norms[j] = normOf(r);
        cos[j] = cosineOf(r, me);
      }
      return { norms: norms, cos: cos };
    }

    // stopTokens(): stop 6: what leaves the backbone: 196 tokens of 48 (real 384) numbers; their lengths and their likeness to the followed one.
    function stopTokens() {
      const rec = recordFor(1), th = core.theme(), c0 = rec.crops[0], hasCls = dino();
      const st = tokenStats(c0.tokens, hasCls);
      const nr = rangeOf(st.norms), cr = rangeOf(st.cos);
      const others = [];
      for (let j = 0; j < G * G; j++) if (j !== state.follow) others.push(j);
      others.sort(function (a, b) { return st.cos[b] - st.cos[a] || a - b; });
      let meanCos = 0;
      others.forEach(function (j) { meanCos += st.cos[j]; });
      meanCos /= others.length;
      const num = [
        para(hasCls
          ? ['The backbone returns the class token and one token per patch: toy 197 ', TIMES, ' ', W.D, ', real ', factSpan(core, 'dino_output_224', '197 \u00D7 384'),
            ' numbers for one crop, and one such block per crop for a batch of B crops. ', cite(core, 'dino_output_224')]
          : ['The backbone returns one token per patch: toy 196 ', TIMES, ' ', W.D, ', real ', factSpan(core, 'sp_output_224', '196 \u00D7 384'), ' numbers for one crop, and ',
            el('span', { class: 'shape' }, [factSpan(core, 'shape_tokens_224', 'B \u00D7 196 \u00D7 384')]), ' for a batch of crops. ', cite(core, 'sp_output_224')]),
        para([hasCls && show(core, nr[0]) === show(core, nr[1])
          ? 'Every token has length ' + show(core, nr[0]) + ', about ' + SQRT + W.D + ': DINO' + RSQUO + 's final LayerNorm, its scale still 1 and its shift still 0, gives each token mean 0 and spread 1, so the length map is flat under this wiring.'
          : 'Their lengths run from ' + show(core, nr[0]) + ' to ' + show(core, nr[1]) + '.', ' The patches whose tokens are most like yours (cosine): ',
          others.slice(0, TOP).map(function (j) { return cellPair(j, G) + ' ' + core.fmt(st.cos[j], 3); }).join(', '),
          '. The mean cosine to the other ', others.length, ' is ', core.fmt(meanCos, 3), '.']),
        stripCanvas({ id: ID + '-tokens-strip', values: rowOf(c0.tokens, tokenRow()), colour: th.student, label: 'The token of the patch you follow as it leaves the backbone' })
      ];
      if (hasCls) {
        num.push(para(['With the DINO wiring a final LayerNorm follows the blocks, and the class token comes first: its length is ', show(core, normOf(rowOf(c0.tokens, 0))),
          '. This class token is what DINO', RSQUO, 's image-level loss reads.']));
      }
      return {
        pic: [
          cell('Length of each token (strong: long)', cropGrid({ id: ID + '-tokens-norms', size: PIC.heat, label: 'The length of each patch token', heat: { values: st.norms, colour: th.student, lo: nr[0], hi: nr[1] } }), PIC.heat),
          cell('Cosine to the token you follow (strong: alike)', cropGrid({ id: ID + '-tokens-cos', size: PIC.heat, label: 'The cosine of each patch token to the one you follow', heat: { values: st.cos, colour: th.student, lo: cr[0], hi: 1 } }), PIC.heat)
        ],
        num: num
      };
    }

    // stopTeacher(): stop 7: the teacher's pass: the same weights at the start, every crop read (SelfPatch) or the global crops only (DINO), no gradient.
    function stopTeacher() {
      const rec = recordFor(1), th = core.theme(), hasCls = dino();
      const diffs = rec.crops.map(function (c) {
        if (!c.teacherTokens) return null;
        let m = 0;
        const a = c.teacherTokens.data, s = c.tokens.data;
        for (let k = 0; k < a.length; k++) m = Math.max(m, Math.abs(a[k] - s[k]));
        return m;
      });
      const thumbs = rec.crops.map(function (c, i) {
        const size = i < 2 ? PIC.thumb : Math.round(PIC.thumb * 0.7);
        const cv = canvasEl(ID + '-teacher-thumb-' + i, size, size, CROP_NAMES[i] + (c.teacherTokens ? ', read by the teacher' : ', not read by the teacher'), false);
        drawCrop(cv.ctx, i, 0, 0, size, c.teacherTokens ? 1 : 0.3);
        cv.ctx.strokeStyle = c.teacherTokens ? th.teacher : th.ignored;
        cv.ctx.lineWidth = 3;
        cv.ctx.strokeRect(1.5, 1.5, size - 3, size - 3);
        return cell([['G1', 'G2', 'L1'][i], c.teacherTokens ? ': read' : ': not read'], cv.canvas, size + 8);
      });
      const read = diffs.filter(function (d) { return d !== null; });
      const biggest = Math.max.apply(null, read);
      const same = biggest === 0;
      const diffText = same
        ? ['Its tokens equal the student', RSQUO, 's exactly (largest difference 0 on every crop it read): the weights are the same and neither network skips a branch.',
          state.t > 1 ? ' This lab starts every step t from a fresh network, so the two are still equal here; in a real run at step ' + core.fmt(state.t, 0) +
            ' the teacher would be an average of the student' + RSQUO + 's past (3.6) and differ from it.' : '']
        : ['Its tokens differ from the student', RSQUO, 's by up to ', show(core, biggest), ': the student skipped branches at random (rate ', factSpan(core, 'drop_path_student', '0 to 0.1'),
          '), while the teacher never skips (rate ', factSpan(core, 'drop_path_teacher', '0'), '). ', cite(core, 'drop_path_teacher')];
      return {
        pic: [el('div', { class: 'stage-row' }, thumbs),
          cell('The teacher' + RSQUO + 's token of the patch you follow', stripCanvas({ id: ID + '-teacher-strip', values: rowOf(rec.crops[0].teacherTokens, tokenRow()), colour: th.teacher,
            label: 'The teacher token of the patch you follow' }), 300)],
        num: [
          para(['The teacher has the ', factSpan(core, 'dino_same_architecture', 'same architecture'), ' as the student, and at the start it is an exact copy (',
            factSpan(core, 'teacher_copy_at_start', 'teacher = student at step 0'), '). ', cite(core, 'dino_same_architecture'), ' ', cite(core, 'teacher_copy_at_start')]),
          para(hasCls
            ? ['With the DINO wiring it reads only the two global crops, as DINO', RSQUO, 's teacher reads the ', factSpan(core, 'dino_teacher_crops', '2 global crops'), '. ',
              cite(core, 'dino_teacher_crops'), ' Its tokens: toy 197 ', TIMES, ' ', W.D, ' for each.']
            : ['It reads all three crops here; SelfPatch', RSQUO, 's teacher reads ', factSpan(core, 'sp_teacher_crops', 'all 10 crops'), ', because every crop needs patch targets. ',
              cite(core, 'sp_teacher_crops'), ' Its tokens: toy 196 ', TIMES, ' ', W.D, ', 196 ', TIMES, ' ', W.D, ' and 36 ', TIMES, ' ', W.D, '; real ',
              el('span', { class: 'shape' }, [factSpan(core, 'shape_tokens_224', 'B \u00D7 196 \u00D7 384')]), ' and ',
              el('span', { class: 'shape' }, [factSpan(core, 'shape_tokens_96', 'B \u00D7 36 \u00D7 384')]), '. ', cite(core, 'shape_tokens_96')]),
          para(['Nothing the teacher computes is traced back for learning: its outputs are constants for the loss, the ', factSpan(core, 'loss_stop_gradient', 'stop-gradient'), '. ',
            cite(core, 'loss_stop_gradient')]),
          para(diffText)
        ]
      };
    }

    // windowCanvas(sel, i): the anchor's 3 x 3 window enlarged: each neighbour's patch, its cosine and its rank, the positives in orange; wrapped neighbours are marked.
    function windowCanvas(sel, i) {
      const th = core.theme(), cellSize = 60, size = cellSize * 3;
      const cv = canvasEl(ID + '-window', size, size, 'The 3 by 3 window around the patch you follow, with each neighbour' + RSQUO + 's cosine', false);
      const ctx = cv.ctx, r0 = Math.floor(i / G), c0 = i % G;
      ctx.fillStyle = th.paper;
      ctx.fillRect(0, 0, size, size);
      const src = canvasOf(0);
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const rr = (r0 + dr + G) % G, cc = (c0 + dc + G) % G, j = rr * G + cc;
          const x = (dc + 1) * cellSize, y = (dr + 1) * cellSize;
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(src, cc * PATCH, rr * PATCH, PATCH, PATCH, x + 2, y + 2, cellSize - 4, cellSize - 4);
          if (dr === 0 && dc === 0) {
            ring(ctx, th, 4, 3, 0, 0, size, th.ink, 3);
            continue;
          }
          let s = -1;
          for (let k = 0; k < WINDOW; k++) if (sel.candidates[i * WINDOW + k] === j) s = k;
          const kept = s >= 0 && sel.mask[i * WINDOW + s] === 1;
          if (kept) ring(ctx, th, (dr + 1) * 3 + dc + 1, 3, 0, 0, size, th.positive, 3);
          const wrapped = r0 + dr < 0 || r0 + dr >= G || c0 + dc < 0 || c0 + dc >= G;
          label(ctx, th, (s >= 0 ? core.fmt(sel.cosines[i * WINDOW + s], 2) : ''), x + cellSize / 2, y + cellSize / 2, 12, 'center');
          if (wrapped) label(ctx, th, 'wraps', x + cellSize / 2, y + cellSize - 10, 9, 'center', th.muted);
        }
      }
      return cv.canvas;
    }

    // dinoPatchNotice(): the words for a stop that the DINO wiring does not compute.
    function dinoPatchNotice() {
      return notice(['The DINO wiring has no patch-level loss, so this stop has nothing to show for patches. Choose SelfPatch under Wiring to see it.']);
    }

    // stopNeighbours(): stop 8: the followed patch's 8 window neighbours on the teacher's tokens, their cosines and ranks, the top 4 as positives.
    function stopNeighbours() {
      const rec = recordFor(1), th = core.theme();
      if (dino()) return { pic: [], num: [dinoPatchNotice()] };
      const sel = rec.crops[0].selection, i = state.follow;
      const win = windowOf(i, G);
      const pos = [];
      for (let r = 0; r < K; r++) pos.push(sel.positives[i * K + r]);
      const rows = [];
      for (let r = 0; r < WINDOW; r++) {
        const col = sel.ranking[i * WINDOW + r], j = sel.candidates[i * WINDOW + col], kept = sel.mask[i * WINDOW + col] === 1;
        const w = win[col];
        rows.push(el('tr', null, [el('td', { class: 'num' }, [String(r + 1)]), el('td', null, [cellPair(j, G)]),
          el('td', null, [windowWords(w.dr, w.dc) + (w.wrapped ? ', wraps' : '')]), el('td', { class: 'num' }, [core.fmt(sel.cosines[i * WINDOW + col], 3)]),
          el('td', null, [kept ? el('span', { class: 'chip filled role-positive' }, ['positive']) : ''])]));
      }
      const table = el('div', { class: 'scroll-x' }, [el('table', { class: 'lm-table' }, [
        el('thead', null, [el('tr', null, ['rank', 'patch', 'where', 'cosine', ''].map(function (h, k) { return el('th', { class: k === 0 || k === 3 ? 'num' : null, scope: 'col' }, [h]); }))]),
        el('tbody', null, rows)])]);
      return {
        pic: [
          cell('Global crop 1: the window (grey) and the positives (orange)', cropGrid({ id: ID + '-nbr-grid', label: 'The window of the patch you follow and its positives',
            shaded: win.map(function (w) { return w.index; }), rings: pos.map(function (j) { return { index: j, colour: th.positive, width: 2.5 }; }) }), PIC.grid),
          cell('The window enlarged, with each cosine', windowCanvas(sel, i), 180)
        ],
        num: [
          para(['Now the teacher', RSQUO, 's tokens pick, for every patch, the neighbours whose answer its prediction should match. The candidates are the ', factSpan(core, 'nbr_candidates', '8'),
            ' patches of the 3 ', TIMES, ' 3 window around it, and the window wraps round the edges (', factSpan(core, 'nbr_wrap', 'wrapped window'), '). ',
            cite(core, 'nbr_candidates'), ' ', cite(core, 'nbr_wrap')]),
          para(['Their likeness is the ', factSpan(core, 'nbr_similarity_teacher', 'cosine of teacher tokens'), '; the ', factSpan(core, 'sp_k', '4'),
            ' most alike become the positives. ', cite(core, 'nbr_similarity_teacher'), ' ', cite(core, 'sp_k')]),
          table,
          para(['Every patch of every crop does the same: toy 196 ', TIMES, ' 8 cosines for a global crop, real ',
            el('span', { class: 'shape' }, [factSpan(core, 'shape_similarities_224', 'B \u00D7 196 \u00D7 8')]), '. ', cite(core, 'shape_similarities_224')])
        ]
      };
    }

    // aggTable(attn, off): the aggregation module's attention of one anchor as a heat table: a row per block and head, a column for the query itself and for each positive (teacher blue, strong for large weights).
    function aggTable(attn, off, cols, colLabels) {
      const th = core.theme(), cw = 30, ch = 14, left = 34, top = 16;
      const rows = W.aggBlocks * W.heads, w = left + cols * cw, h = top + rows * ch + 2;
      const cv = canvasEl(ID + '-agg-table', w, h, 'The attention of the aggregation module' + RSQUO + 's query: a row per block and head, a column for the query and for each positive', false);
      const ctx = cv.ctx;
      ctx.fillStyle = th.paper;
      ctx.fillRect(0, 0, w, h);
      colLabels.forEach(function (t, c) { label(ctx, th, t, left + c * cw + cw / 2, 8, 9, 'center', th.muted); });
      for (let r = 0; r < rows; r++) {
        label(ctx, th, 'b' + (Math.floor(r / W.heads) + 1) + 'h' + (r % W.heads + 1), left - 4, top + r * ch + ch / 2, 8, 'right', th.muted);
        for (let c = 0; c < cols; c++) {
          const v = attn[off + r * cols + c];
          ctx.fillStyle = shade(th, th.teacher, v);
          ctx.fillRect(left + c * cw + 1, top + r * ch + 1, cw - 2, ch - 2);
        }
      }
      return cv.canvas;
    }

    // probsLine(p, name): the largest probability of a distribution and its entropy, in words.
    function probsLine(p, name) {
      const k = topIndices(p, 1)[0];
      return name + ': prototype ' + (k + 1) + ' gets ' + core.fmt(p[k], 3) + '; entropy ' + core.fmt(entropyOf(p), 3) + ' nats';
    }

    // imageLevelTeacher(rec): the teacher's image-level probabilities of global crop 1, with the words about how they are made.
    function imageLevelTeacher(rec) {
      const c0 = rec.crops[0], p = c0.probs.teacherImage;
      const words = dino()
        ? ['At image level the teacher', RSQUO, 's class token of global crop 1 goes straight into its image head: ', W.headHidden, ', ', W.headHidden, ', ', W.bottleneck,
          ' numbers, then ', W.kImage, ' scores (real ', factSpan(core, 'head_prototypes_global', '65,536'), '), divided by ', factSpan(core, 'temp_teacher', '0.04'), '. ',
          cite(core, 'head_prototypes_global')]
        : ['At image level the same module, run over all 196 of the crop', RSQUO, 's tokens, gives its image-level token (', factSpan(core, 'agg_global_token', 'global token from all tokens'),
          '); the image head turns it into ', W.kImage, ' scores (real ', factSpan(core, 'head_prototypes_global', '65,536'), '), divided by ', factSpan(core, 'temp_teacher', '0.04'),
          ' after the centre is taken off. ', cite(core, 'agg_global_token'), ' ', cite(core, 'head_prototypes_global')];
      return [para(words), para([probsLine(p, 'Teacher, global crop 1')])];
    }

    // stopTarget(): stop 9: the aggregation module merges the positives into the target, the patch head turns it into scores, and centring and sharpening make the teacher's probabilities.
    function stopTarget() {
      const rec = recordFor(1), th = core.theme(), c0 = rec.crops[0];
      const imgBars = barsCanvas({ id: ID + '-target-image-bars', a: c0.probs.teacherImage, colour: th.teacher, w: 300, h: 80, label: 'The teacher' + RSQUO + 's image-level probabilities over the 64 toy prototypes' });
      if (dino()) {
        return { pic: [cell('Teacher, image level: 64 probabilities', imgBars, 300)], num: [dinoPatchNotice()].concat(imageLevelTeacher(rec)) };
      }
      const i = state.follow, sel = c0.selection, per = W.aggBlocks * W.heads * (1 + K);
      const pos = Array.prototype.slice.call(sel.positives, i * K, i * K + K);
      const target = rowOf(c0.targets.vectors, i);
      const hd = Toy.head(rec.stateBefore.teacher, 'patch', target);
      const p = rowOf(c0.probs.teacherPatch, i);
      const off = i * per;
      const qShare = c0.targets.attn[off + (W.aggBlocks - 1) * W.heads * (1 + K)];
      const centre = rec.targets.centres.patch;
      const table = aggTable(c0.targets.attn, off, 1 + K, ['q'].concat(pos.map(function (j) { return cellPair(j, G).replace(/[() ]/g, ''); })));
      return {
        pic: [
          cell('The positives (orange) of the patch you follow', cropGrid({ id: ID + '-target-grid', size: PIC.heat, label: 'The patch you follow and its 4 positives',
            rings: pos.map(function (j) { return { index: j, colour: th.positive, width: 2 }; }) }), PIC.heat),
          cell('The query' + RSQUO + 's attention (rows: block, head; faint 0, strong 1)', table, 200),
          cell('Teacher, patch level: 64 probabilities', barsCanvas({ id: ID + '-target-bars', a: p, colour: th.teacher, w: 300, h: 80, label: 'The teacher' + RSQUO + 's patch-level probabilities over the 64 toy prototypes' }), 300),
          cell('Teacher, image level: 64 probabilities', imgBars, 300)
        ],
        num: [
          para(['The target comes from the ', factSpan(core, 'sp_k', '4'), ' positives only; the patch', RSQUO, 's own token is left out (',
            factSpan(core, 'agg_excludes_anchor', 'anchor\u0027s own token excluded'), '). ', cite(core, 'agg_excludes_anchor')]),
          para(['The aggregation module is a small ', factSpan(core, 'agg_module', 'class-attention Transformer'), '. A learned ', term(core, 'query token'), ' (toy ', W.D,
            ' numbers, real ', factSpan(core, 'agg_query_token', '1 \u00D7 1 \u00D7 384'), ') passes ', factSpan(core, 'agg_blocks', '2'), ' blocks of ', term(core, 'class attention'),
            ': only the query asks, over itself and the set (', factSpan(core, 'agg_query_attends', 'query attends to itself and the set'), '). ', cite(core, 'agg_module'), ' ',
            cite(core, 'agg_blocks'), ' ', cite(core, 'agg_query_attends')]),
          para(['Toy: a query token of ', W.D, ' numbers, ', W.aggBlocks, ' blocks with ', W.heads, ' heads of ', W.headDim, ' and an MLP of ', W.mlp,
            ', and a final LayerNorm; real: ', factSpan(core, 'agg_module_structure', 'query token + 2 class-attention blocks (6 heads, MLP \u00D7 4) + final LayerNorm'), '. ',
            cite(core, 'agg_module_structure')]),
          para(['In block 2, head 1 the query keeps ', core.fmt(qShare, 3), ' of the attention for itself; with equal scores it would keep ',
            factSpan(core, 'agg_query_share_formula', '1 / (d + 1)'), ' = ', factSpan(core, 'agg_query_share_d4', '0.20'), ' with d = 4 positives. ', cite(core, 'agg_query_share_d4')]),
          stripCanvas({ id: ID + '-target-strip', values: target, colour: th.teacher, cell: 5, title: 'target', label: 'The target: the module' + RSQUO + 's output for the patch you follow' }),
          para(['The target: ', W.D, ' numbers of length ', show(core, normOf(target)), '. The teacher', RSQUO, 's patch head turns it into scores: toy ', W.D, ' ', RARR, ' ', W.headHidden, ' ', RARR, ' ',
            W.headHidden, ' ', RARR, ' ', W.bottleneck, ' ', RARR, ' ', W.kPatch, ', real ', factSpan(core, 'head_path_patch', '384 \u2192 2,048 \u2192 2,048 \u2192 256 \u2192 4,096'), '. ',
            cite(core, 'head_path_patch')]),
          readout([
            ['hidden 1', W.headHidden + ' numbers, length ' + show(core, normOf(hd.hidden1))],
            ['hidden 2', W.headHidden + ' numbers, length ' + show(core, normOf(hd.hidden2))],
            ['bottleneck', W.bottleneck + ' numbers, length ' + show(core, normOf(hd.bottleneck))],
            ['normalised', [W.bottleneck + ' numbers, ', factSpan(core, 'head_l2', 'length 1')]],
            ['scores', W.kPatch + ' cosines with the prototypes, from ' + show(core, rangeOf(hd.scores)[0], 3) + ' to ' + show(core, rangeOf(hd.scores)[1], 3)]
          ]),
          para(['The lengths shrink at every layer because the toy', RSQUO, 's layers are narrow, ', W.headHidden, ' numbers where the real ones have ',
            factSpan(core, 'head_hidden', '2,048'), ', and its weights small and random: a toy effect. ', cite(core, 'head_hidden')], 'lm-toy'),
          para(['There are ', W.kPatch, ' toy prototypes (real ', factSpan(core, 'sp_patch_prototypes', '4,096'), '). ', cite(core, 'sp_patch_prototypes'), ' ',
            term(core, 'centring', 'Centring'), ' takes the patch centre off the scores (', normOf(centre) === 0 ? 'the lab starts every t from a fresh network, whose centre is 0, so nothing is taken off here; in a real run the centre holds an average of earlier outputs, 3.4' : 'its length is ' + show(core, normOf(centre)), '), and ',
            term(core, 'sharpening', 'sharpening'), ' divides them by ', factSpan(core, 'temp_teacher', '0.04'), ' before the softmax. ', cite(core, 'temp_teacher')]),
          para([probsLine(p, 'Teacher, patch level')])
        ].concat(imageLevelTeacher(rec))
      };
    }

    // stopStudent(): stop 10: the student's own token of the patch, through the module's final LayerNorm and its patch head at temperature 0.1, beside the teacher's target.
    function stopStudent() {
      const rec = recordFor(1), th = core.theme(), c0 = rec.crops[0];
      const pt2 = rec.targets.image[1], ps1 = c0.probs.studentImage;
      const imgBars = barsCanvas({ id: ID + '-student-image-bars', a: pt2, b: ps1, w: 300, h: 80, label: 'Image level: the teacher' + RSQUO + 's probabilities for global crop 2 (blue outlines) and the student' + RSQUO + 's for global crop 1 (green bars)' });
      const kT = topIndices(pt2, 1)[0];
      const imageWords = [para(['At image level the student', RSQUO, 's token of global crop 1 is scored against the teacher', RSQUO, 's of global crop 2: a crop is never compared with itself. ',
        'The teacher', RSQUO, 's favourite prototype, ', kT + 1, ', gets ', core.fmt(pt2[kT], 3), ' from the teacher and ', core.fmt(ps1[kT], 3), ' from the student.'])];
      if (dino()) {
        return { pic: [cell('Image level: teacher (blue) and student (green)', imgBars, 300)], num: [dinoPatchNotice()].concat(imageWords) };
      }
      const i = state.follow;
      const own = rowOf(c0.tokens, i), normed = rowOf(c0.studentPatchRows, i);
      const hd = Toy.head(rec.stateBefore.student, 'patch', normed);
      const pt = rowOf(c0.probs.teacherPatch, i), ps = rowOf(c0.probs.studentPatch, i);
      const k = topIndices(pt, 1)[0], ks = topIndices(ps, 1)[0];
      return {
        pic: [
          cell('The patch you follow', patchZoom(PIC.swatch * 0.75), PIC.swatch),
          cell('Patch level: teacher (blue) and student (green)', barsCanvas({ id: ID + '-student-bars', a: pt, b: ps, w: 300, h: 90,
            label: 'Patch level: the teacher' + RSQUO + 's probabilities (blue outlines) and the student' + RSQUO + 's (green bars) over the 64 toy prototypes' }), 300),
          cell('Image level: teacher G2 (blue) and student G1 (green)', imgBars, 300)
        ],
        num: [
          para(['The student predicts the target from the patch', RSQUO, 's own token, without the module: ', factSpan(core, 'sp_asymmetry', 'own token versus aggregated positives'), '. ',
            cite(core, 'sp_asymmetry'), ' In the code the token passes only the module', RSQUO, 's final LayerNorm, ', factSpan(core, 'sp_student_final_ln', 'LN(z_i)'),
            ', then the student', RSQUO, 's own patch head. ', cite(core, 'sp_student_final_ln'),
            ' The architecture document writes the token as z_i; in the figure above it is f^(i), and z^(i) is what the head puts out.']),
          stripCanvas({ id: ID + '-student-own', values: own, colour: th.student, label: 'The student' + RSQUO + 's own token of the patch you follow' }),
          readout([
            ['after LayerNorm', W.D + ' numbers, length ' + show(core, normOf(normed))],
            ['bottleneck', W.bottleneck + ' numbers, length ' + show(core, normOf(hd.bottleneck))],
            ['scores', W.kPatch + ' cosines, from ' + show(core, rangeOf(hd.scores)[0], 3) + ' to ' + show(core, rangeOf(hd.scores)[1], 3)]
          ]),
          para(['Its scores are divided by ', factSpan(core, 'temp_student', '0.1'), ', a softer temperature than the teacher', RSQUO, 's, before the softmax. ', cite(core, 'temp_student')]),
          para(['The teacher', RSQUO, 's favourite prototype, ', k + 1, ', gets ', core.fmt(pt[k], 3), ' from the teacher and ', core.fmt(ps[k], 3), ' from the student; the student', RSQUO,
            's own favourite is prototype ', ks + 1, ' at ', core.fmt(ps[ks], 3), '. The spread of each answer, its entropy (1.5): teacher ', core.fmt(entropyOf(pt), 3),
            ' nats, student ', core.fmt(entropyOf(ps), 3), ' nats.']),
          para(['The authors report that this asymmetry, with the stop-gradient, is what keeps every patch from being given the same prototype probabilities, the collapse of 3.4 (',
            factSpan(core, 'sp_asymmetry_collapse', 'asymmetry + stop-gradient avoid collapse'), '). ', cite(core, 'sp_asymmetry_collapse')])
        ].concat(imageWords)
      };
    }

    // stopLosses(): stop 11: the followed patch's cross-entropy with its arithmetic, every patch's loss, the patch loss over the crops, the image-level pairs and the total.
    function stopLosses() {
      const rec = recordFor(1), th = core.theme(), c0 = rec.crops[0], L = rec.losses;
      const pairWords = rec.pairs.map(function (pr) {
        return 'teacher ' + ['G1', 'G2', 'L1'][pr.teacher] + ' ' + RARR + ' student ' + ['G1', 'G2', 'L1'][pr.student] + ': ' + core.fmt(pr.ce, 3);
      }).join('; ');
      const globalPara = para(['Image level: ', rec.pairs.length, ' pairs here (the real recipe has ', factSpan(core, 'loss_global_pairs', '18'), '): ', pairWords,
        '. Their mean is L_global = ', core.fmt(L.L_global, 4), '. ', cite(core, 'loss_global_pairs')]);
      if (dino()) {
        return {
          pic: [],
          num: [dinoPatchNotice(), globalPara, eq(['L = L_global = ', core.fmt(L.L, 4)]),
            para(['The DINO release, with its 12 crops, averages ', factSpan(core, 'loss_global_pairs_dino_release', '22'), ' pairs. ', cite(core, 'loss_global_pairs_dino_release')])]
        };
      }
      const i = state.follow, pt = rowOf(c0.probs.teacherPatch, i), ps = rowOf(c0.probs.studentPatch, i);
      const terms = [];
      for (let k = 0; k < pt.length; k++) terms.push({ k: k, v: -pt[k] * Math.log(ps[k]) });
      terms.sort(function (a, b) { return b.v - a.v; });
      const ce = c0.ce, rg = rangeOf(ce);
      const crops = rec.crops.map(function (c, j) { return ['G1', 'G2', 'L1'][j] + ' ' + core.fmt(c.patchLoss, 4) + ' (' + c.n + ' patches)'; }).join(', ');
      const patchSign = agrees(rec.crops.reduce(function (sum, c) { return sum + Number(c.patchLoss.toFixed(4)); }, 0) / rec.crops.length, L.L_patch, 4);
      const totalSign = agrees(Number(L.L_global.toFixed(4)) + L.lambda * Number(L.L_patch.toFixed(4)), L.L, 4);
      return {
        pic: [
          cell('Every patch' + RSQUO + 's loss on global crop 1 (strong: large)', cropGrid({ id: ID + '-loss-grid', size: PIC.heat, label: 'The cross-entropy of every patch of global crop 1',
            heat: { values: ce, colour: th.ink, lo: rg[0], hi: rg[1] } }), PIC.heat),
          cell('How many patches have each loss (the line: yours)', histogram({ id: ID + '-loss-hist', values: ce, w: 300, h: 110, mark: ce[i], role: 'hist',
            label: 'A histogram of the 196 patch losses of global crop 1, with the loss of the patch you follow marked' }), 300)
        ],
        num: [
          para(['The loss for one patch is the cross-entropy ', factSpan(core, 'loss_cross_entropy', 'H(teacher, student) = \u2212\u03A3 teacher \u00D7 log(student)'),
            ', summed over the ', W.kPatch, ' toy prototypes. ', cite(core, 'loss_cross_entropy')]),
          eq(['H = ', terms.slice(0, TOP).map(function (t) { return core.fmt(pt[t.k], 3) + ' ' + TIMES + ' ' + core.fmt(-Math.log(ps[t.k]), 3); }).join(' + '),
            ' + ', ELLIPSIS, ' = ', core.fmt(ce[i], 4), ' nats']),
          para(['The three largest terms are shown, each a teacher probability times ', MINUS, 'log of the student', RSQUO, 's probability for the same prototype, a positive number; the other ', W.kPatch - TOP, ' add the rest. It is large when the student gives little probability to the prototypes the teacher prefers.']),
          para(['Patch level: each crop', RSQUO, 's patches are averaged, then the crops: ', crops, ', so L_patch ', patchSign, ' ', core.fmt(L.L_patch, 4), patchSign === APPROX ? ' (the parts are rounded)' : '',
            '. The real loss averages ', factSpan(core, 'patch_loss_average', '10'), ' crops. ', cite(core, 'patch_loss_average')]),
          globalPara,
          eq(['L = L_global + ', factSpan(core, 'sp_lambda', '0.1'), ' ', TIMES, ' L_patch = ', core.fmt(L.L_global, 4), ' + ', core.fmt(L.lambda, 1), ' ', TIMES, ' ',
            core.fmt(L.L_patch, 4), ' ', totalSign, ' ', core.fmt(L.L, 4), totalSign === APPROX ? ' (the parts are rounded)' : '', ' ', cite(core, 'sp_lambda')])
        ]
      };
    }

    // stopBackward(): stop 12: the push on the followed patch's scores, the gradient's length block by block, the followed weight's gradient, the per-tensor clip and the first-epoch freeze.
    function stopBackward() {
      const rec = recordFor(2), th = core.theme(), c0 = rec.crops[0];
      let pt, ps, where;
      if (dino()) {
        pt = rec.targets.image[1];
        ps = c0.probs.studentImage;
        where = 'global crop 1' + RSQUO + 's image-level scores (paired with the teacher' + RSQUO + 's global crop 2)';
      } else {
        pt = rowOf(c0.probs.teacherPatch, state.follow);
        ps = rowOf(c0.probs.studentPatch, state.follow);
        where = 'the ' + W.kPatch + ' patch-level scores of the patch you follow';
      }
      const push = new Float64Array(pt.length);
      for (let k = 0; k < pt.length; k++) push[k] = (pt[k] - ps[k]) / rec.targets.tempStudent;
      const clipped = rec.gradients.filter(function (g) { return g.clipped; });
      const longest = rec.gradients.reduce(function (a, g) { return g.norm !== null && (!a || g.norm > a.norm) ? g : a; }, null);
      const fname = rec.follow.name, fi = rec.follow.index;
      const raw = rec.grads[fname] ? rec.grads[fname][fi] : 0;
      const ftable = rec.gradients.filter(function (g) { return g.name === fname; })[0];
      const frozen = rec.schedule.frozenLastLayer;
      const groups = rec.gradBlocks.map(function (gb) { return { label: String(gb.block + 1), values: [gb.attn, gb.mlp] }; });
      const freezeWords = frozen
        ? ['Step t = ' + core.fmt(rec.schedule.t, 0) + ' is in the first epoch, so the last layer of both heads, the prototypes, gets no update: our trainer holds it fixed for ',
          factSpan(core, 'ours_freeze_last_layer', '1'), ' epoch, the first ', factSpan(core, 'ours_steps_per_epoch', '462'), ' steps. ', cite(core, 'ours_freeze_last_layer'),
          ' DINO', RSQUO, 's code notes that this ', factSpan(core, 'freeze_last_layer_reason', 'helps training'), '. ', cite(core, 'freeze_last_layer_reason')]
        : ['Step t = ' + core.fmt(rec.schedule.t, 0) + ' is past the first epoch, so the prototypes learn too; during the first ', factSpan(core, 'ours_steps_per_epoch', '462'),
          ' steps (', factSpan(core, 'ours_freeze_last_layer', '1'), ' epoch) our trainer holds them fixed. ', cite(core, 'ours_freeze_last_layer'), ' Move the Step t slider, among the controls, to 462 or below to see it.'];
      return {
        pic: [
          cell('The push on ' + (dino() ? 'the image-level scores' : 'the patch' + RSQUO + 's scores') + ' (up: raise, down: lower)', barsCanvas({ id: ID + '-push-bars', a: push, colour: th.student, w: 300, h: 100, signed: true,
            label: 'The push on each of the 64 scores: teacher probability minus student probability, divided by 0.1' }), 300),
          cell('Gradient length per block: attention (green) and MLP (ink), log scale', pairBars({ id: ID + '-grad-blocks', groups: groups, roles: ['student', null], w: 300, h: 130,
            label: 'The length of the gradient of each block' + RSQUO + 's attention part and MLP part' }), 300)
        ],
        num: [
          para(['The backward pass starts at the scores. For ', where, ', the loss pushes each score by (teacher p ', MINUS, ' student p) / ', factSpan(core, 'temp_student', '0.1'),
            ': up for the prototypes the teacher prefers, down for the others. ', cite(core, 'temp_student'),
            dino() ? '' : [' The loss weighs one patch by ', factSpan(core, 'sp_lambda', '0.1'), ' ', TIMES, ' 1/3 ', TIMES, ' 1/', factSpan(core, 'patch_count_224', '196'),
              ' (the patch-loss weight, the three crops here, the patches of a global crop), so its actual gradient is that push, made that much smaller, with the sign turned. ', cite(core, 'sp_lambda')]]),
          para(['From the scores the gradient runs back through the head, ' + (dino() ? 'the class token' : 'the aggregation module') + ' and the 12 blocks, and every student weight gets one: its ',
            term(core, 'gradient'), '. The chart gives each block', RSQUO, 's gradient length. Nothing reaches the teacher.']),
          readout([
            ['followed weight', dotted(rec.follow.label)],
            ['its gradient', show(core, raw)],
            ['its tensor', ftable ? 'length ' + show(core, ftable.norm) + (ftable.clipped ? ', shortened by the clip' : ', short enough') : '']
          ]),
          followWords(rec.follow),
          para([term(core, 'gradient clipping', 'Clipping'), ': before the update each tensor', RSQUO, 's gradient is shortened to length ', factSpan(core, 'ours_clip', '3.0'),
            ' at most, one tensor at a time. ', cite(core, 'ours_clip'), ' Here ', clipped.length, ' of the toy network', RSQUO, 's ', rec.gradients.length, ' tensors of weights and biases', rec.gradients.length === G * G ? ' (a count that happens to equal the ' + G * G + ' patches)' : '', ' were longer',
            longest ? ['; the longest, ', dotted(longest.name), ', had length ' + show(core, longest.norm)] : '', '. The toy', RSQUO, 's narrow heads make its head gradients long, so the clip acts on many of its tensors. ',
            dino() ? 'In these names head is the image-level head.' : 'In these names c_head is the image-level head, p_head the patch head and ca_head the aggregation module.']),
          clipped.length ? el('details', { class: 'lm-details' }, [el('summary', null, ['The ' + clipped.length + ' tensors the clip shortened']),
            el('ul', { class: 'lm-list lm-mono' }, clipped.slice().sort(function (a, b) { return b.norm - a.norm; }).map(function (g) {
              return el('li', null, [dotted(g.name), ': ' + show(core, g.norm, 3) + ' ' + RARR + ' ' + show(core, g.normClipped, 3)]);
            }))]) : para(['No tensor was longer than the limit here.']),
          para(freezeWords)
        ]
      };
    }

    // lrCurve(recipe): the learning rate at 60 points of the run, from the StepRecord's recipe (the trainer's schedule: a straight warm-up from 0 to the peak, then a cosine to the floor), for the chart.
    function lrCurve(recipe) {
      const pts = [], n = 60, total = recipe.totalSteps, warm = recipe.warmupSteps, peak = recipe.lrPeak, fin = recipe.lrMin;
      for (let q = 0; q < n; q++) {
        const s = Math.round(q / (n - 1) * (total - 1));
        pts.push(s < warm ? (s === warm - 1 ? peak : s * peak / (warm - 1)) : core.warmupCosine(s, { peak: peak, total: total, warmup: warm, final: fin }));
      }
      return pts;
    }

    // stopUpdate(): stop 13: the schedules at step t, AdamW's arithmetic for the followed weight, and the loss when the student runs again on the same crops.
    function stopUpdate() {
      const rec = recordFor(2), s = rec.schedule, a = rec.adam, L = rec.losses, A = rec.after;
      const curve = lrCurve(rec.recipe);
      const markAt = Math.round((s.t - 1) / (T_STEP.max - 1) * (curve.length - 1));
      const num = [
        para(['The optimiser is ', factSpan(core, 'ours_optimiser', 'AdamW'), '. ', cite(core, 'ours_optimiser'), ' At step t = ', core.fmt(s.t, 0), ' (epoch ', s.epoch + 1,
          ') the learning rate is ', show(core, s.lr, 3), ': it rises in a straight line from 0 to ', factSpan(core, 'ours_lr_peak', '5e-4'), ' over the first ',
          factSpan(core, 'ours_warmup_steps', '4,620'), ' steps, then follows a cosine down to ', factSpan(core, 'ours_min_lr', '1e-6'), ' at step ',
          factSpan(core, 'ours_steps_20ep', '9,240'), '. ', cite(core, 'ours_lr_peak'), ' ', cite(core, 'ours_warmup_steps')]),
        para(['Weight decay is ', show(core, s.weightDecay, 3), ', from a cosine that rises from ', factSpan(core, 'ours_weight_decay', '0.04 \u2192 0.4'),
          ' over the run, and it applies to weight tensors only (', factSpan(core, 'ours_weight_decay_groups', 'weight tensors decayed; biases not'), '). ',
          cite(core, 'ours_weight_decay'), ' ', cite(core, 'ours_weight_decay_groups')])
      ];
      if (!a || a.skipped) {
        num.push(para(['The followed weight got no gradient in this step, so AdamW leaves it as it was.']));
      } else {
        num.push(para(['AdamW keeps two running averages for every weight, its ', term(core, 'moment', 'moments'), ' m and v, and subtracts the learning rate times ',
          factSpan(core, 'adamw_update_rule', 'm / (\u221Av + \u03B5)'), ' from the weight, m and v first scaled up for their start at zero. ', cite(core, 'adamw_update_rule'),
          ' Our trainer keeps PyTorch', RSQUO, 's settings, ', BETA, SUB1, ' = ', factSpan(core, 'adamw_betas_eps', '0.9'), ', ', BETA, SUB2, ' = ',
          factSpan(core, 'adamw_betas_eps', '0.999'), ' and ', EPS, ' = ', factSpan(core, 'adamw_betas_eps', '1e-8'), ', and so does the toy. ', cite(core, 'adamw_betas_eps'),
          ' For the followed weight:']));
        const wb = sigText(a.before, 6), wa = sigText(a.after, 6);
        const wSign = agrees(wb.value - shownValue(a.step, 5) - (a.weightDecay ? shownValue(a.decayTerm) : 0), wa.value, wa.digits);
        num.push(el('div', { class: 'lm-eqs' }, [
          eq(['g = ', show(core, a.g), '   (after the clip)']),
          eq(['m = ', BETA, SUB1, ' ', TIMES, ' ', show(core, a.mBefore), ' + (1 ', MINUS, ' ', BETA, SUB1, ') ', TIMES, ' g = ', show(core, a.m)]),
          eq(['v = ', BETA, SUB2, ' ', TIMES, ' ', show(core, a.vBefore), ' + (1 ', MINUS, ' ', BETA, SUB2, ') ', TIMES, ' g', '\u00B2', ' = ', show(core, a.v)]),
          eq(['m', HAT, ' = m / (1 ', MINUS, ' ', BETA, SUB1, sup(a.count), ') = ', show(core, a.mHat), ',  v', HAT, ' = v / (1 ', MINUS, ' ', BETA, SUB2, sup(a.count), ') = ', show(core, a.vHat)]),
          eq(['step = lr ', TIMES, ' m', HAT, ' / (', SQRT, 'v', HAT, ' + ', EPS, ') = ', show(core, a.step, 5)]),
          eq(['decay = lr ', TIMES, ' wd ', TIMES, ' w = ', a.weightDecay ? show(core, a.decayTerm) : '0 (not decayed)']),
          eq(['w ', MINUS, ' step ', MINUS, ' decay = ', wb.text, ' ', MINUS, ' (', show(core, a.step, 5), ') ', MINUS, ' ', a.weightDecay ? '(' + show(core, a.decayTerm) + ')' : '0', ' ', wSign, ' ', wa.text,
            wSign === APPROX ? '   (the parts are rounded)' : ''])
        ]));
        num.push(para([moveWords(a, s)]));
        num.push(para(['Dividing by 1 ', MINUS, ' ', BETA, ' to the power of the step count is the ', term(core, 'bias correction'), '. Here every step starts AdamW afresh, with m and v at 0, so the step is close to lr ',
          TIMES, ' the sign of g. In a real run at step t, m and v carry the history of the steps before.'], 'lm-toy'));
      }
      if (s.frozenLastLayer) {
        num.push(para(['In this first epoch the last layer of each head, which holds the prototypes, gets no update (stop 12), so AdamW leaves those weights as they are.']));
      }
      if (A) {
        const d = A.L - L.L;
        let verdict;
        if (d < 0) verdict = 'The loss went down by ' + show(core, -d, 3) + ': on this batch the student moved towards the teacher.';
        else if (d > 0) verdict = 'The loss went up by ' + show(core, d, 3) + ': on this batch the step moved the student away from the teacher.';
        else verdict = s.lr === 0 ? 'The loss stayed exactly the same: at t = 1 the learning rate is 0, so no weight moved.' : 'The loss stayed exactly the same.';
        const rounded = A.L_patch !== null && (agrees(Number(L.L_global.toFixed(4)) + L.lambda * Number(L.L_patch.toFixed(4)), L.L, 4) === APPROX ||
          agrees(Number(A.L_global.toFixed(4)) + L.lambda * Number(A.L_patch.toFixed(4)), A.L, 4) === APPROX);
        num.push(para(['The student then runs again on the same three crops, against the same targets: L goes from ', core.fmt(L.L, 4), ' to ', core.fmt(A.L, 4),
          ' (L_global ', core.fmt(L.L_global, 4), ' ', RARR, ' ', core.fmt(A.L_global, 4), (A.L_patch !== null ? ', L_patch ' + core.fmt(L.L_patch, 4) + ' ' + RARR + ' ' + core.fmt(A.L_patch, 4) : ''), ').',
          rounded ? ' Each number is rounded to 4 decimals, so a total can differ in its last digit from the sum of its rounded parts.' : '']));
        num.push(para([verdict, ' One step on one batch says nothing about a run of ', factSpan(core, 'ours_steps_20ep', '9,240'), ' steps.']));
      }
      return {
        pic: [cell('The learning rate over the run (the dot: step t)', lineChart({ id: ID + '-lr-chart', values: curve, w: 300, h: 120, role: 'student', mark: markAt,
          label: 'The learning rate at every step of the 20-epoch run, with the current step marked', yFormat: rateText,
          xLabel: function (q) { return q === 0 ? '1' : (q === curve.length - 1 ? 'end' : ''); } }), 300)],
        num: num
      };
    }

    // stopEma(): stop 14: the teacher's EMA step for the followed weight at momentum m(t), the two centres, and the start of the next step.
    function stopEma() {
      const rec = recordFor(2), th = core.theme(), e = rec.ema, s = rec.schedule, cen = rec.centres;
      const m = e.momentum;
      // the weights with the digits stop 13 shows, and '=' only when the shown numbers give the shown result
      const tb = sigText(e.teacherBefore, 6), sa = sigText(e.studentAfter, 6), ta = sigText(e.teacherAfter, 6);
      const emaSign = agrees(Number(m.toFixed(6)) * tb.value + shownValue(1 - m, 3) * sa.value, ta.value, ta.digits);
      const centreWords = ['The centres move too, at rate ', factSpan(core, 'centre_momentum', '0.9'), ': ', factSpan(core, 'centre_rule', 'c \u2190 m \u00B7 c + (1 \u2212 m) \u00B7 (batch mean of teacher outputs)'),
        ', where m is the centre', RSQUO, 's own rate, not the teacher', RSQUO, 's momentum above. The image-level centre takes the mean over the teacher', RSQUO, 's ', cen.image.crops, ' crops (length ', show(core, normOf(cen.image.before)), ' ', RARR, ' ', show(core, normOf(cen.image.after)), ')'];
      if (cen.patch) centreWords.push(', the patch centre over its ', cen.patch.rows, ' patches (', show(core, normOf(cen.patch.before)), ' ', RARR, ' ', show(core, normOf(cen.patch.after)), ')');
      centreWords.push('. ', cite(core, 'centre_momentum'), ' ', cite(core, 'centre_rule'));
      return {
        pic: [cell('Image-level centre: before (' + (normOf(cen.image.before) === 0 ? 'all 0' : 'grey outlines') + ') and after (blue bars)', barsCanvas({ id: ID + '-centre-bars', a: cen.image.before, b: cen.image.after, ca: th.muted, cb: th.teacher, w: 300, h: 80, signed: true,
          label: 'The 64 numbers of the image-level centre before and after the step' }), 300)],
        num: [
          para(['The loss never trains the teacher. After the student', RSQUO, 's update every teacher weight takes a small step towards the student', RSQUO, 's: ',
            factSpan(core, 'ema_rule', 'teacher \u2190 m \u00D7 teacher + (1 \u2212 m) \u00D7 student'), '. ', cite(core, 'ema_rule')]),
          para(['At step t = ', core.fmt(s.t, 0), ' the momentum is m = ', m < 1 && core.fmt(m, 6) === '1.000000' ? '1 ' + MINUS + ' ' + show(core, 1 - m, 3) + ', just below 1' : core.fmt(m, 6),
            ', from a cosine that rises from ', factSpan(core, 'ema_ours_schedule', '0.9995 \u2192 1'),
            ' over the run. ', cite(core, 'ema_ours_schedule')]),
          eq([core.fmt(m, 6), ' ', TIMES, ' ', tb.text, ' + ', show(core, 1 - m, 3), ' ', TIMES, ' ', sa.text, ' ', emaSign, ' ', ta.text]),
          para(e.studentAfter === e.teacherBefore
            ? ['For the followed weight neither network moved', s.lr === 0 ? ': the learning rate is 0 at this step, so the student stayed where it was.' : '.']
            : ['For the followed weight the student moved by ', show(core, e.studentAfter - e.teacherBefore, 3), ' and the teacher by ', show(core, e.teacherAfter - e.teacherBefore, 3),
              ': the teacher follows slowly.']),
          para(centreWords),
          para(['The next step starts with a new batch of ', factSpan(core, 'ours_global_batch', '256'), ' pictures, new crops, this student and this teacher. ', cite(core, 'ours_global_batch')])
        ]
      };
    }

    const RENDERERS = [stopImage, stopViews, stopPatches, stopEmbed, stopBlocks, stopTokens, stopTeacher, stopNeighbours, stopTarget, stopStudent, stopLosses, stopBackward, stopUpdate, stopEma];

    // ---------------------------------------------------------------- showing the current stop

    // setPanel(node, content): replace node's children with content, keeping the first child in place when content starts with it (so a slider being dragged is never taken out of the page).
    function setPanel(node, content) {
      const flat = [];
      appendAll({ appendChild: function (c) { flat.push(c); } }, content);
      const keep = flat.length && node.firstChild === flat[0] ? flat[0] : null;
      while (node.lastChild && node.lastChild !== keep) node.removeChild(node.lastChild);
      flat.forEach(function (c, k) { if (!(k === 0 && keep)) node.appendChild(c); });
    }

    // waitingNote(need): what a stop shows while the step it needs is not there yet.
    function waitingNote(need) {
      let words;
      if (state.error) words = ['The step could not be computed: ', state.error, '.'];
      else if (!state.started) words = ['This stop needs the whole step of the toy network, which is computed once the lab is in view.'];
      else if (job) words = ['This stop needs ', need >= 2 ? 'the update at step t' : 'the whole step', ', which is being computed now; the line above shows how far it has got.'];
      else words = ['This stop is about to be computed.'];
      return notice(words);
    }

    // progressWords(): the running computation in words, with its share done.
    function progressWords() {
      const p = lastProgress;
      const pct = job && job.kind === 'step' && !p ? '' : Math.round(100 * (p && typeof p.fraction === 'number' ? p.fraction : 0)) + ' %';
      if (!p) return job && job.kind === 'step' ? 'the update at step t = ' + core.fmt(state.t, 0) : 'starting';
      const crop = p.crop >= 0 && p.crop < CROP_NAMES.length ? CROP_NAMES[p.crop] : '';
      const unit = typeof p.unit === 'number' ? p.unit + 1 : 0;
      let what;
      switch (p.phase) {
        case 'weights': what = 'making the random weights'; break;
        case 'teacher': what = 'the teacher reads ' + crop + ', block ' + unit; break;
        case 'targets': what = 'the teacher' + RSQUO + 's targets on ' + crop; break;
        case 'student': what = 'the student reads ' + crop + ', block ' + unit; break;
        case 'backward': what = 'the backward pass'; break;
        case 'update': what = 'the clip, AdamW and the EMA'; break;
        case 'after': what = 'the student reads ' + crop + ' again, block ' + unit; break;
        default: what = 'working';
      }
      return what + (pct ? ', ' + pct : '');
    }

    // renderStatus(): the line above the stage (what is being computed, or how long the step took) and the progress bar.
    function renderStatus() {
      let text, busy = !!job;
      if (state.error) {
        text = 'The step could not be computed: ' + state.error;
        body.setAttribute('data-lab-m', 'error');
      } else if (busy) {
        text = 'Computing ' + (job.kind === 'base' ? 'the step' : 'the update at t = ' + core.fmt(state.t, 0)) + ': ' + progressWords() + '.';
        body.setAttribute('data-lab-m', 'computing');
      } else if (!state.started) {
        text = 'The step is computed once the lab is in view (about two seconds).';
        body.setAttribute('data-lab-m', 'waiting');
      } else if (recordFor(2)) {
        text = 'Every value below is computed in this page from the toy network' + (lastMs !== null ? ' (the last computation took ' + core.fmt(lastMs / 1000, 1) + ' s)' : '') + '.';
        body.setAttribute('data-lab-m', 'ready');
      } else {
        text = 'Waiting for the step.';
        body.setAttribute('data-lab-m', 'waiting');
      }
      if (lastMs !== null) body.setAttribute('data-lab-m-ms', String(Math.round(lastMs)));
      statusText.textContent = text;
      const pct = busy && lastProgress && typeof lastProgress.fraction === 'number' ? Math.round(100 * lastProgress.fraction) : 0;
      progress.hidden = !busy;
      progress.setAttribute('aria-valuenow', String(pct));
      bar.style.width = pct + '%';
    }

    // setOff(control, off): switch a control off or on with aria-disabled, which, unlike disabled, leaves the keyboard focus on it; the handlers ignore a switched-off control.
    function setOff(control, off) {
      if (off) control.setAttribute('aria-disabled', 'true');
      else control.removeAttribute('aria-disabled');
    }

    // isOff(control): whether a control is switched off.
    function isOff(control) {
      return control.getAttribute('aria-disabled') === 'true';
    }

    // syncBusy(): switch off the controls that would start a new step while one is being computed, and show the status.
    function syncBusy() {
      const busy = !!(job && job.kind === 'base');
      setOff(seedBtn, busy);
      wiringRadios.forEach(function (r) { setOff(r, busy); });
      setOff(dropBox, busy);
      setOff(tInput, busy);
      stage.setAttribute('aria-busy', job ? 'true' : 'false');
      renderStatus();
    }

    // currentPositives(): the followed patch's positives from the teacher's selection, when the step exists (SelfPatch wiring only).
    function currentPositives() {
      const rec = recordFor(1);
      if (!rec || dino() || !rec.crops[0].selection) return null;
      return Array.prototype.slice.call(rec.crops[0].selection.positives, state.follow * K, state.follow * K + K);
    }

    // renderMap(): the live figure: the current stop's boxes lit, the positive-matching panel on the followed patch.
    function renderMap() {
      const v = picture();
      mapBox.innerHTML = figure({
        live: true, stop: state.stop + 1, wiring: state.wiring, picture: v.picture, mosaic: v.mosaic, anchor: state.follow, positives: currentPositives(),
        note: 'toy network, ' + (v.source === 'upload' ? 'your picture' : 'the drawn sample')
      });
    }

    // renderStrip(): the stop strip: the current stop marked, the passed ones set off, Prev and Next switched off at the ends.
    function renderStrip() {
      stopButtons.forEach(function (b, i) {
        const li = b.parentNode;
        if (i === state.stop) {
          li.setAttribute('aria-current', 'step');
          b.setAttribute('aria-current', 'step');
        } else {
          li.removeAttribute('aria-current');
          b.removeAttribute('aria-current');
        }
        li.setAttribute('class', i < state.stop ? 'is-done' : '');
      });
      setOff(prevBtn, state.stop === 0);
      setOff(nextBtn, state.stop === LAST);
      nextBtn.setAttribute('class', state.stop === LAST ? 'btn' : 'btn btn-primary');
    }

    // renderFollow(): the followed patch in the control strip.
    function renderFollow() {
      followOut.textContent = cellName(state.follow, G) + ' of global crop 1 (patch ' + state.follow + ')';
    }

    // renderStage(): the current stop: kicker, title, picture panel and numbers panel, or a note while its step is being computed.
    function renderStage() {
      const i = state.stop, s = STOPS[i];
      kicker.textContent = 'Stop ' + (i + 1) + ' of ' + STOPS.length;
      setContent(titleEl, stopTitle(i));
      if (!ready(s.need)) {
        setPanel(pic, []);
        setPanel(num, [waitingNote(s.need)]);
        body.setAttribute('data-lab-m-stop', 'waiting');
      } else {
        const out = RENDERERS[i]();
        setPanel(pic, out.pic);
        setPanel(num, out.num);
        body.setAttribute('data-lab-m-stop', s.key);
      }
      renderStrip();
      renderFollow();
      refreshTerms();
    }

    // ---------------------------------------------------------------- moving between stops, and Play

    // userAction(fn): fn as a reader's action: it pauses Play, starts the computation if it has not started, and shows an error in the lab instead of breaking the page.
    function userAction(fn) {
      return core.guard(body, function () {
        stopPlay();
        stopBlockPlay();
        begin();
        return fn.apply(this, arguments);
      });
    }

    // go(i, fromPlay): show stop i (kept inside 1 to 14); Play entering stop 5 starts at block 1.
    function go(i, fromPlay) {
      const next = Math.max(0, Math.min(LAST, i));
      if (fromPlay && next === 4 && state.stop !== 4) state.block = 1;
      state.stop = next;
      renderMap();
      renderStage();
      syncPlay();
    }

    // follow(i, keepFocus): follow patch i of global crop 1; with keepFocus the grid that had the focus gets it back after the redraw.
    function follow(i, keepFocus) {
      const d = root.document;
      const active = keepFocus && d ? d.activeElement : null;
      const focusId = active && active.id ? active.id : null;
      state.follow = i;
      renderMap();
      renderStage();
      if (focusId && d && typeof d.getElementById === 'function') {
        const again = d.getElementById(focusId);
        if (again && typeof again.focus === 'function') again.focus();
      }
    }

    // syncPlay(): the Play buttons and their hint.
    function syncPlay() {
      playBtn.setAttribute('aria-pressed', state.playing ? 'true' : 'false');
      playBtn.textContent = state.playing ? 'Pause' : 'Play';
      blockPlayBtn.setAttribute('aria-pressed', state.blockPlaying ? 'true' : 'false');
      blockPlayBtn.textContent = state.blockPlaying ? 'Pause the blocks' : 'Play the blocks';
      if (state.playing) playHint.textContent = 'Playing: a stop every ' + (PLAY_MS / 1000) + ' s, and at stop 5 a block every ' + (BLOCK_MS / 1000) + ' s. Any control pauses it.';
      else if (reducedMotion()) playHint.textContent = 'Play moves on one stop every ' + (PLAY_MS / 1000) + ' s without any animation, as your system asks. The arrow keys move between stops when the strip has the focus.';
      else playHint.textContent = 'Play tours the stops, one every ' + (PLAY_MS / 1000) + ' s; use Next to read each one at your own pace. The arrow keys move between stops when the strip has the focus.';
    }

    // schedulePlay(ms): the next Play step after ms milliseconds.
    function schedulePlay(ms) {
      if (playTimer !== null) root.clearTimeout(playTimer);
      playTimer = root.setTimeout(core.guard(body, playTick), ms);
    }

    // playTick(): one Play step: the next block at stop 5, else the next stop once its step is there; it ends at the last stop.
    function playTick() {
      playTimer = null;
      if (!state.playing) return;
      if (state.stop === 4 && state.block < W.blocks && ready(1)) {
        state.block += 1;
        renderStage();
        schedulePlay(state.block < W.blocks ? BLOCK_MS : PLAY_MS);
        return;
      }
      if (state.stop >= LAST) {
        stopPlay();
        return;
      }
      if (!ready(STOPS[state.stop + 1].need)) {
        schedulePlay(PLAY_MS / 5);
        return;
      }
      go(state.stop + 1, true);
      if (state.stop >= LAST) {
        stopPlay();
        return;
      }
      schedulePlay(state.stop === 4 ? BLOCK_MS : PLAY_MS);
    }

    // startPlay(): play from the current stop (from stop 1 after the last one).
    function startPlay() {
      stopBlockPlay();
      begin();
      if (state.stop >= LAST) go(0, true);
      state.playing = true;
      syncPlay();
      schedulePlay(state.stop === 4 ? BLOCK_MS : PLAY_MS);
    }

    // stopPlay(): stop Play.
    function stopPlay() {
      if (playTimer !== null) root.clearTimeout(playTimer);
      playTimer = null;
      if (state.playing) {
        state.playing = false;
        syncPlay();
      }
    }

    // startBlockPlay(): step the blocks of stop 5 from the current one (from block 1 after the last).
    function startBlockPlay() {
      stopPlay();
      begin();
      if (state.block >= W.blocks) {
        state.block = 1;
        renderStage();
      }
      state.blockPlaying = true;
      syncPlay();
      if (blockTimer !== null) root.clearTimeout(blockTimer);
      blockTimer = root.setTimeout(core.guard(body, blockTick), BLOCK_MS);
    }

    // blockTick(): the next block of stop 5's own Play; it ends at block 12 or when another stop is shown.
    function blockTick() {
      blockTimer = null;
      if (!state.blockPlaying) return;
      if (state.stop !== 4 || state.block >= W.blocks) {
        stopBlockPlay();
        return;
      }
      if (ready(1)) {
        state.block += 1;
        renderStage();
      }
      if (state.block >= W.blocks) stopBlockPlay();
      else blockTimer = root.setTimeout(core.guard(body, blockTick), BLOCK_MS);
    }

    // stopBlockPlay(): stop stop 5's own Play.
    function stopBlockPlay() {
      if (blockTimer !== null) root.clearTimeout(blockTimer);
      blockTimer = null;
      if (state.blockPlaying) {
        state.blockPlaying = false;
        syncPlay();
      }
    }

    // ---------------------------------------------------------------- events

    prevBtn.addEventListener('click', userAction(function () { if (!isOff(prevBtn)) go(state.stop - 1, false); }));
    nextBtn.addEventListener('click', userAction(function () { if (!isOff(nextBtn)) go(state.stop + 1, false); }));
    playBtn.addEventListener('click', core.guard(body, function () {
      stopBlockPlay();
      if (state.playing) stopPlay(); else startPlay();
    }));
    stopButtons.forEach(function (b, i) {
      b.addEventListener('click', userAction(function () { go(i, false); }));
    });
    strip.addEventListener('keydown', core.guard(body, function (ev) {
      let to = null;
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') to = state.stop + 1;
      else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') to = state.stop - 1;
      else if (ev.key === 'Home') to = 0;
      else if (ev.key === 'End') to = LAST;
      if (to === null) return;
      ev.preventDefault();
      const focused = stopButtons.indexOf(ev.target);
      const onStop = focused >= 0;
      if (onStop && (ev.key === 'ArrowRight' || ev.key === 'ArrowDown')) to = focused + 1;
      else if (onStop && (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp')) to = focused - 1;
      userAction(function () { go(to, false); })();
      if (onStop && typeof stopButtons[state.stop].focus === 'function') stopButtons[state.stop].focus();
    }));
    mapBox.addEventListener('click', userAction(function (ev) {
      let t = ev.target;
      while (t && t !== mapBox && !(typeof t.getAttribute === 'function' && t.getAttribute('data-stop'))) t = t.parentNode;
      if (!t || t === mapBox) return;
      const s = Number(t.getAttribute('data-stop'));
      if (s >= 1 && s <= STOPS.length) go(s - 1, false);
    }));
    seedBtn.addEventListener('click', userAction(function () {
      if (isOff(seedBtn)) return;
      state.seed += 1;
      seedOut.textContent = 'seed ' + state.seed;
      ensure();
      renderMap();
      renderStage();
    }));
    wiringRadios.forEach(function (r) {
      r.addEventListener('change', userAction(function () {
        if (isOff(r)) {
          wiringRadios.forEach(function (x) { x.checked = x.value === state.wiring; });
          return;
        }
        if (!r.checked) return;
        state.wiring = r.value === 'dino' ? 'dino' : 'selfpatch';
        ensure();
        renderMap();
        renderStage();
      }));
    });
    dropBox.addEventListener('change', userAction(function () {
      if (isOff(dropBox)) {
        dropBox.checked = state.dropPath;
        return;
      }
      state.dropPath = !!dropBox.checked;
      ensure();
      renderStage();
    }));
    // tText(v): the step slider's readout: t and its epoch.
    const tText = function (v) { return core.fmt(v, 0) + ', epoch ' + (Math.floor((v - 1) / PER_EPOCH) + 1); };
    tInput.addEventListener('input', core.guard(body, function () {
      stopPlay();
      if (isOff(tInput)) {
        tInput.value = String(state.t);
        tOut.textContent = tText(state.t);
        return;
      }
      const v = Math.max(T_STEP.min, Math.min(T_STEP.max, Math.round(Number(tInput.value)) || T_STEP.value));
      tOut.textContent = tText(v);
      tInput.setAttribute('aria-valuetext', 'step ' + tText(v));
    }));
    tInput.addEventListener('change', userAction(function () {
      if (isOff(tInput)) {
        tInput.value = String(state.t);
        tOut.textContent = tText(state.t);
        return;
      }
      state.t = Math.max(T_STEP.min, Math.min(T_STEP.max, Math.round(Number(tInput.value)) || T_STEP.value));
      tOut.textContent = tText(state.t);
      ensure();
      renderStage();
      renderStatus();
    }));
    blockInput.addEventListener('input', userAction(function () {
      state.block = Math.max(1, Math.min(W.blocks, Math.round(Number(blockInput.value)) || 1));
      renderStage();
    }));
    blockPlayBtn.addEventListener('click', core.guard(body, function () {
      stopPlay();
      if (state.blockPlaying) stopBlockPlay(); else startBlockPlay();
    }));
    // A new picture: forget every step computed on the old one, then rebuild in a task of its own, so that the lab adds
    // nothing to the event that every lab of the page answers at once.
    core.on('image-changed', core.guard(body, function () {
      state.version += 1;
      view = null;
      bases.length = 0;
      job = null;
      state.error = null;
      syncBusy();
      root.setTimeout(core.guard(body, function () {
        ensure();
        renderMap();
        renderStage();
      }), 0);
    }));
    core.on('theme-changed', core.guard(body, function () { renderStage(); }));
    try {
      const mq = typeof root.matchMedia === 'function' ? root.matchMedia('(prefers-reduced-motion: reduce)') : null;
      const onMotion = core.guard(body, syncPlay);
      if (mq && typeof mq.addEventListener === 'function') mq.addEventListener('change', onMotion);
      else if (mq && typeof mq.addListener === 'function') mq.addListener(onMotion);
    } catch (e) {
      logError('reduced-motion watch', e);
    }

    // ---------------------------------------------------------------- the resting state, then the computation once the lab is in view

    tOut.textContent = tText(state.t);
    tInput.setAttribute('aria-valuetext', 'step ' + tText(state.t));
    renderMap();
    renderStage();
    syncBusy();
    syncPlay();
    if (typeof root.IntersectionObserver === 'function') {
      try {
        const io = new root.IntersectionObserver(function (entries) {
          for (let k = 0; k < entries.length; k++) {
            if (entries[k].isIntersecting) {
              io.disconnect();
              core.guard(body, begin)();
              return;
            }
          }
        }, { rootMargin: START_MARGIN });
        io.observe(body);
      } catch (e) {
        logError('IntersectionObserver', e);
        root.setTimeout(core.guard(body, begin), 0);
      }
    } else {
      root.setTimeout(core.guard(body, begin), 0);
    }
  });

  // the fact table of Lab M, for window.LabP4.factTables() (tests/smoke_p4.js compares it with facts/course_facts.json); the
  // eight nl_* facts belong to the contrastive wiring of LabM.figure, which no page of this course draws
  (function registerTable() {
    const facts = {};
    Object.keys(FACTS).forEach(function (id) { facts[id] = { source: FACTS[id].source, cite: FACTS[id].cite }; });
    const P4 = root.LabP4 = root.LabP4 || {};
    P4.tables = P4.tables || {};
    P4.tables['lab-4c-end-to-end'] = {
      facts: facts,
      notInSheet: ['nl_eq_negatives', 'nl_eq_positives_k', 'nl_eq_tau_lo', 'nl_eq_total', 'nl_k_local', 'nl_k_rev3', 'nl_neg_bottom_pct', 'nl_tau']
    };
  })();
})(typeof window !== 'undefined' ? window : this);

// ================================================================== Part C: lab-4d-aggregation, lab-4e-real-neighbours and window.LabP4
// New in this course. Pure helpers first: the toy class attention of Lab 4D, the numbers of the page's three equation
// walks (window.LabP4.workedExamples(), which src/labs_defaults.json holds as the entries p4.walk_neighbours,
// p4.walk_class_attention and p4.walk_patch_loss) and the points of the walks' toy curves (window.LabP4.curvePath(key),
// which the page's static figures print). Then the two labs. Every default number is in src/labs_defaults.json under
// "lab-4d-aggregation" (ids 4d.*) and "lab-4e-real-neighbours" (ids 4e.*); tests/smoke_p4.js checks the labs and these
// helpers against numbers it computes itself. Lab 4E reads the released SelfPatch model's real tokens through
// Core.bundle and its photographs through Core.image; nothing else is fetched, stored or sent.
(function (root) {
  'use strict';

  const Labs = root.Labs;
  const Core = root.Core;
  if (!Labs || typeof Labs.register !== 'function' || !Core) {
    if (root.console && typeof root.console.error === 'function') root.console.error('[labs_p4] window.Labs or window.Core is missing; core.js must load first');
    return;
  }

  const MINUS = '−';
  const TIMES = '×';
  const DEG = '°';
  const ELLIPSIS = '…';

  // The facts the two labs cite, with the source and the source tag of each, copied from facts/course_facts.json
  // (tests/smoke_p4.js compares them with the sheet).
  const FACTS = {
    "agg_module_structure": {
      "shown": "query token + 2 class-attention blocks (6 heads, MLP × 4) + final LayerNorm",
      "source": "docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:89; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:106-109; cluster/selfpatch_official/selfpatch_vision_transformer.py:72-139 (Class_Attention and LayerScale_Block_CA: separate q, k and v, residuals on the query token only); cluster/selfpatch_official/selfpatch_vision_transformer.py:362-374 (SelfPatchHead: the query token, 2 blocks with mlp_ratio=4.0, a final LayerNorm); cluster/official_loader.py:58 (SelfPatchHead(384, 6, k))",
      "cite": "[our architecture doc §2.3; official code: selfpatch_vision_transformer.py]"
    },
    "agg_query_share_formula": {
      "shown": "1 / (d + 1)",
      "source": "docs/research/selection_scope_2026-09-27/05_report_final_v2.md:217; docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:211",
      "cite": "[our report §2.4]"
    },
    "sp_k": {
      "shown": "4",
      "source": "research/audits/base_papers_text/yun_selfpatch_cvpr2022.txt:404-409; cluster/selfpatch_official/main_selfpatch.py:70 (k_num 4); cluster/train.py:118 (K = 4); docs/research/selection_scope_2026-09-27/architecture/10_architecture_current_v2.md:188",
      "cite": "[SelfPatch §2.2]"
    },
    "why_rule_outside_window": {
      "shown": "43.6 % of the top 8 inside the 3 × 3 window, at a mean distance of 2.65",
      "source": "research/audits/contrastive_premise_20261008/v2/premise.md:18 (the k curve's header: top-k inside the 3 x 3 window, top-k Chebyshev distance); research/audits/contrastive_premise_20261008/v2/premise.md:21 (k = 8, whole 224 px: top-k inside the 3 x 3 window 43.6%, Chebyshev distance 2.65)",
      "cite": "[second premise test]"
    }
  };

  // ------------------------------------------------------------------ defaults (src/labs_defaults.json)

  // Lab 4D: the toy positives (unit vectors in two dimensions; the first four are the walk's), the toy query token,
  // the controls' ranges and the drawing's size.
  const D4 = Object.freeze({
    d: { min: 1, max: 8, value: 4 },
    logit: { min: -8, max: 8, step: 0.5, value: 0 },
    scale: { min: 1, max: 10, step: 0.5, value: 5 },
    turn: { min: 0, max: 359, step: 1, value: 217 },
    positives: [[1, 0], [0.8, 0.6], [0.6, 0.8], [-0.8, -0.6], [0.96, 0.28], [0.28, 0.96], [0, 1], [0.6, -0.8]],
    query: [0, 0],
    plot: { side: 260, radius: 100 },
    bars: { width: 380, rowHeight: 112 }
  });

  // Lab 4E: the 14 x 14 grid of a 224-pixel view, the drawing sizes, the followed anchor (data/anchor.json: patch 34,
  // the dog's nose) and the k slider.
  const D4E = Object.freeze({
    grid: 14, patch: 16, side: 224,
    cell: 26, margin: 4,
    windowCell: 64,
    mapCell: 13,
    anchor: 34,
    k: { min: 1, max: 8, value: 4 },
    cropTop: 8,
    digits: 3
  });

  // ------------------------------------------------------------------ small pure helpers

  // roundTo(x, n): x rounded to n decimals as a plain number, never minus zero (the precision the page prints).
  function roundTo(x, n) {
    const v = Number(Number(x).toFixed(n));
    return v === 0 ? 0 : v;
  }
  function r4(x) { return roundTo(x, 4); }
  function r2(x) { return roundTo(x, 2); }

  // dot(a, b), lengthOf(a): the dot product and the length of plain vectors.
  function dot(a, b) {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;
  }
  function lengthOf(a) { return Math.sqrt(dot(a, a)); }

  // meanOf(list): the average of a list of vectors.
  function meanOf(list) {
    const out = list[0].map(function () { return 0; });
    list.forEach(function (v) { v.forEach(function (x, i) { out[i] += x / list.length; }); });
    return out;
  }

  // angleOf(v): the direction of a two-number vector in degrees, from -180 to 180.
  function angleOf(v) { return Math.atan2(v[1], v[0]) * 180 / Math.PI; }

  // softmaxList(logits, T): Core.softmax as a plain array.
  function softmaxList(logits, T) { return Array.from(Core.softmax(logits, T === undefined ? 1 : T)); }

  // ------------------------------------------------------------------ the toy class attention (Lab 4D and the second walk)

  // classAttention(query, positives, scale): one toy class-attention block with one head, no learned projections, no
  // LayerNorm and no MLP. The query token scores itself and every positive, score = scale x (query . token); a softmax
  // turns the scores into shares; the block returns the query plus the share-weighted sum of the tokens (the residual).
  function classAttention(query, positives, scale) {
    const seq = [query].concat(positives);
    const logits = seq.map(function (t) { return scale * dot(query, t); });
    const shares = softmaxList(logits, 1);
    const out = query.map(function (q, i) {
      let s = q;
      seq.forEach(function (t, j) { s += shares[j] * t[i]; });
      return s;
    });
    return { logits: logits, shares: shares, out: out };
  }

  // aggregate(query, positives, scale): two such blocks, the second asked by the first one's output, as the real module
  // stacks two; with the plain average of the positives for comparison.
  function aggregate(query, positives, scale) {
    const b1 = classAttention(query, positives, scale);
    const b2 = classAttention(b1.out, positives, scale);
    return { block1: b1, block2: b2, mean: meanOf(positives) };
  }

  // summaryOf(query, positives, shares): the query plus the share-weighted sum of [query, positives...], for shares
  // made from scores that the reader typed.
  function summaryOf(query, positives, shares) {
    const seq = [query].concat(positives);
    return query.map(function (q, i) {
      let s = q;
      seq.forEach(function (t, j) { s += shares[j] * t[i]; });
      return s;
    });
  }

  // ------------------------------------------------------------------ the three equation walks of the page

  // The neighbour walk: an anchor token and its 8 window neighbours, in reading order (up-left to down-right). Every
  // vector has length 3, so each cosine is the dot product over 9.
  const NEIGHBOUR_WALK = Object.freeze({
    anchor: [1, 2, 2],
    places: ['up-left', 'up', 'up-right', 'left', 'right', 'down-left', 'down', 'down-right'],
    tokens: [[2, 1, 2], [0, 0, 3], [3, 0, 0], [-1, 2, 2], [2, -1, 2], [1, -2, 2], [2, 1, -2], [-3, 0, 0]],
    k: 4
  });

  // neighbourWalk(): each neighbour's dot product with the anchor, its length, its cosine, the ranking (largest first,
  // ties to the earlier place), the kept places and the threshold, the k-th largest cosine.
  function neighbourWalk() {
    const W = NEIGHBOUR_WALK;
    const la = lengthOf(W.anchor);
    const dots = W.tokens.map(function (t) { return dot(W.anchor, t); });
    const lengths = W.tokens.map(lengthOf);
    const cos = W.tokens.map(function (t, j) { return dots[j] / (la * lengths[j]); });
    const order = Core.rankRow(cos);
    const kept = order.slice(0, W.k).sort(function (a, b) { return a - b; });
    return {
      anchor_length: r4(la),
      dots: dots,
      lengths: lengths.map(r4),
      cosines: cos.map(r4),
      ranking: order.slice(),
      kept: kept,
      threshold: r4(cos[order[W.k - 1]])
    };
  }

  // The class-attention walk: four positives in two dimensions (three that agree and one that points away), the toy
  // query token at zero and a score scale of 5.
  const CA_WALK = Object.freeze({ query: [0, 0], positives: [[1, 0], [0.8, 0.6], [0.6, 0.8], [-0.8, -0.6]], scale: 5 });

  // classAttentionWalk(): both blocks of the toy module on the walk's set with every intermediate number, and the
  // directions of the summary, of the plain average and of the three agreeing positives' average.
  function classAttentionWalk() {
    const W = CA_WALK;
    const g = aggregate(W.query, W.positives, W.scale);
    const majority = meanOf(W.positives.slice(0, 3));
    function pack(b) {
      return {
        logits: b.logits.map(r4),
        exps: b.logits.map(function (l) { return r4(Math.exp(l)); }),
        sum: r4(b.logits.reduce(function (s, l) { return s + Math.exp(l); }, 0)),
        shares: b.shares.map(r4),
        out: b.out.map(r4)
      };
    }
    return {
      block1: pack(g.block1),
      block2: pack(g.block2),
      dots2: [g.block1.out].concat(W.positives).map(function (t) { return r4(dot(g.block1.out, t)); }),
      mean: g.mean.map(r4),
      majority: majority.map(r4),
      angles: {
        block2: r2(angleOf(g.block2.out)),
        mean: r2(angleOf(g.mean)),
        majority: r2(angleOf(majority)),
        odd: r2(angleOf(W.positives[3]) + 360)
      }
    };
  }

  // The patch-loss walk: one anchor, four toy prototypes in place of 4,096, the teacher's and the student's scores, the
  // real temperatures and weight, a toy image-level loss of 3, and the toy learning rate and steps of its curve.
  const PL_WALK = Object.freeze({
    teacher: [0.1, 0.04, 0, -0.02], student: [0.2, 0.1, 0, 0.1],
    tauT: 0.04, tauS: 0.1, lambda: 0.1, global: 3, rate: 0.005, steps: 40
  });

  // patchLossWalk(): the target and the prediction with every intermediate number, the cross-entropy, the teacher's
  // entropy and the KL divergence, the gradient on the student's scores, and the total with the toy image-level loss.
  function patchLossWalk() {
    const W = PL_WALK;
    const zt = W.teacher.map(function (v) { return v / W.tauT; });
    const zs = W.student.map(function (v) { return v / W.tauS; });
    const pt = softmaxList(W.teacher, W.tauT);
    const ps = softmaxList(W.student, W.tauS);
    const ce = Core.crossEntropy(pt, ps);
    const h = Core.entropy(pt);
    const lse = Math.log(zs.reduce(function (s, z) { return s + Math.exp(z); }, 0));
    return {
      teacher_scores: W.teacher.slice(),
      student_scores: W.student.slice(),
      teacher_logits: zt.map(r4),
      teacher_exps: zt.map(function (z) { return r4(Math.exp(z)); }),
      teacher_sum: r4(zt.reduce(function (s, z) { return s + Math.exp(z); }, 0)),
      teacher_probs: pt.map(r4),
      student_logits: zs.map(r4),
      student_exps: zs.map(function (z) { return r4(Math.exp(z)); }),
      student_sum: r4(zs.reduce(function (s, z) { return s + Math.exp(z); }, 0)),
      student_probs: ps.map(r4),
      student_logs: zs.map(function (z) { return r4(z - lse); }),
      terms: pt.map(function (p, k) { return r4(-p * (zs[k] - lse)); }),
      cross_entropy: r4(ce),
      teacher_entropy: r4(h),
      kl: r4(ce - h),
      gradient: ps.map(function (p, k) { return r4((p - pt[k]) / W.tauS); }),
      patch_term: r4(W.lambda * ce),
      total: r4(W.global + W.lambda * ce)
    };
  }


  // ------------------------------------------------------------------ the toy curves of the walks ("Over training")

  const CURVES = Object.freeze({
    // a disc-shaped object on the 14 x 14 grid; tokens = strength x the object's direction + noise of length about 1
    neighbours: { g: 14, centre: 6.5, radius: 4.5, dim: 16, seeds: [1, 2, 3, 4, 5, 6, 7, 8], step: 0.125, top: 2, k: 4 },
    // the fourth positive turned from the three others' mean direction, every 15 degrees
    class_attention: { step: 15, top: 360 },
    // gradient descent on the student's scores against the fixed toy target of the walk
    patch_loss: {}
  });

  // The frame every curve figure of the page uses: viewBox 0 0 440 210, the plot between x 56 and 424, y 14 and 166.
  const FRAME = Object.freeze({ left: 56, right: 424, top: 14, bottom: 166 });
  const AXES = Object.freeze({
    neighbours: { xmin: 0, xmax: 2, ymin: 0.6, ymax: 1 },
    class_attention: { xmin: 0, xmax: 360, ymin: 0, ymax: 0.3 },
    patch_loss: { xmin: 0, xmax: 40, ymin: 0.8, ymax: 0.96 }
  });

  // neighbourCurve(): for each strength s, the share of a boundary anchor's top 4 that lie on its own object, averaged
  // over the anchors whose window holds both objects and over the seeds; with the chance level (the share of same-object
  // cells among the 8) and the ceiling (at most min(same, 4) of 4 can be right).
  function neighbourCurve() {
    const C = CURVES.neighbours;
    const g = C.g, n = g * g;
    const obj = new Uint8Array(n);
    for (let r = 0; r < g; r++) {
      for (let c = 0; c < g; c++) obj[r * g + c] = (r - C.centre) * (r - C.centre) + (c - C.centre) * (c - C.centre) <= C.radius * C.radius ? 1 : 0;
    }
    const boundary = [];
    for (let i = 0; i < n; i++) {
      const nb = Core.neighbours8(i, g);
      const same = nb.filter(function (j) { return obj[j] === obj[i]; }).length;
      if (same < 8) boundary.push({ i: i, nb: nb, same: same });
    }
    const chance = boundary.reduce(function (s, b) { return s + b.same / 8; }, 0) / boundary.length;
    const ceiling = boundary.reduce(function (s, b) { return s + Math.min(b.same, C.k) / C.k; }, 0) / boundary.length;
    const points = [];
    for (let m = 0; m * C.step <= C.top + 1e-9; m++) {
      const s = m * C.step;
      let total = 0, count = 0;
      C.seeds.forEach(function (seed) {
        const rand = Core.rng(seed);
        const tokens = [];
        for (let i = 0; i < n; i++) {
          const t = new Float64Array(C.dim);
          for (let d = 0; d < C.dim; d++) t[d] = rand.normal() / Math.sqrt(C.dim);
          t[obj[i] ? 0 : 1] += s;
          tokens.push(t);
        }
        boundary.forEach(function (b) {
          const cos = b.nb.map(function (j) { return Core.cosine(tokens[b.i], tokens[j]); });
          const order = Core.rankRow(cos);
          let right = 0;
          for (let r = 0; r < C.k; r++) if (obj[b.nb[order[r]]] === obj[b.i]) right++;
          total += right / C.k;
          count++;
        });
      });
      points.push([s, r4(total / count)]);
    }
    return {
      points: points, chance: r4(chance), ceiling: r4(ceiling), anchors: boundary.length, cells: obj.reduce(function (s, x) { return s + x; }, 0),
      axis: { x: [0, 0.5, 1, 1.5, 2], y: [0.6, 0.7, 0.8, 0.9, 1] }
    };
  }

  // classAttentionCurve(): the fourth positive's share in the second block as it turns away from the three others'
  // mean direction (block 1 always gives it 1/5 = 0.2, because the toy query starts at zero).
  function classAttentionCurve() {
    const W = CA_WALK;
    const three = W.positives.slice(0, 3);
    const base = angleOf(meanOf(three));
    const points = [];
    for (let turn = 0; turn <= CURVES.class_attention.top; turn += CURVES.class_attention.step) {
      const a = (base + turn) * Math.PI / 180;
      const g = aggregate(W.query, three.concat([[Math.cos(a), Math.sin(a)]]), W.scale);
      points.push([turn, r4(g.block2.shares[4])]);
    }
    const walk = aggregate(W.query, W.positives, W.scale);
    return {
      points: points, walk: [r2(angleOf(W.positives[3]) + 360 - base), r4(walk.block2.shares[4])], block1: 0.2,
      axis: { x: [0, 90, 180, 270, 360], y: [0, 0.1, 0.2, 0.3] }
    };
  }

  // patchLossCurve(): the cross-entropy of the walk's anchor while gradient descent moves the student's scores against
  // the fixed toy target; it falls towards the teacher's entropy, its floor.
  function patchLossCurve() {
    const W = PL_WALK;
    const pt = softmaxList(W.teacher, W.tauT);
    let v = W.student.slice();
    const points = [];
    for (let s = 0; s <= W.steps; s++) {
      const ps = softmaxList(v, W.tauS);
      points.push([s, r4(Core.crossEntropy(pt, ps))]);
      v = v.map(function (x, k) { return x - W.rate * (ps[k] - pt[k]) / W.tauS; });
    }
    return { points: points, floor: r4(Core.entropy(pt)), rate: W.rate, steps: W.steps, axis: { x: [0, 10, 20, 30, 40], y: [0.8, 0.84, 0.88, 0.92, 0.96] } };
  }

  // curvePoints(): the three toy curves.
  function curvePoints() {
    return { neighbours: neighbourCurve(), class_attention: classAttentionCurve(), patch_loss: patchLossCurve() };
  }

  // workedExamples(): the three walks' numbers with the points of their curves, as src/labs_defaults.json holds them
  // (the entries p4.walk_neighbours, p4.walk_class_attention and p4.walk_patch_loss).
  function workedExamples() {
    const curves = curvePoints();
    const out = { neighbours: neighbourWalk(), class_attention: classAttentionWalk(), patch_loss: patchLossWalk() };
    Object.keys(out).forEach(function (key) { out[key].curve = curves[key]; });
    return out;
  }

  // curveX(key, x), curveY(key, y): a value's position in the curve frame of the page's figures.
  function curveX(key, x) {
    const A = AXES[key];
    return FRAME.left + (x - A.xmin) / (A.xmax - A.xmin) * (FRAME.right - FRAME.left);
  }
  function curveY(key, y) {
    const A = AXES[key];
    return FRAME.bottom - (y - A.ymin) / (A.ymax - A.ymin) * (FRAME.bottom - FRAME.top);
  }

  // curvePath(key): the points attribute of the curve's polyline in the page's figure, one decimal per coordinate.
  function curvePath(key) {
    const c = curvePoints()[key];
    return c.points.map(function (p) { return curveX(key, p[0]).toFixed(1) + ',' + curveY(key, p[1]).toFixed(1); }).join(' ');
  }

  // ------------------------------------------------------------------ helpers for the two labs

  function logError(where, err) {
    if (root.console && typeof root.console.error === 'function') root.console.error('[labs_p4] ' + where, err);
  }

  // esc(s): s with &, <, > and " written as entities, for attributes and text written as HTML.
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // factMark(id, ...): a Fact mark whose source names the given facts, "[cite] source", joined by "; ".
  function factMark() {
    const ids = Array.prototype.slice.call(arguments);
    const src = ids.map(function (id) {
      const f = FACTS[id];
      if (!f) throw new Error('labs_p4: unknown fact id ' + id);
      return f.cite + ' ' + f.source;
    }).join('; ');
    return ' <span class="mark mark-fact" data-source="' + esc(src) + '">Fact</span>';
  }
  function toyMark() { return ' <span class="mark mark-toy">Toy</span>'; }
  function realMark(ref) { return ' <span class="mark mark-real" data-bundle="' + esc(ref) + '">Real</span>'; }

  // refreshMarks(): ask boot.js to wire the marks and glossary terms a lab wrote after the page loaded.
  function refreshMarks() {
    try {
      if (root.Boot && typeof root.Boot.refreshTerms === 'function') root.Boot.refreshTerms();
    } catch (e) {
      logError('refreshTerms', e);
    }
  }

  // fmt(x, n): x with n decimals and a real minus sign; never "-0.000".
  function fmt(x, n) {
    let s = Number(x).toFixed(n);
    if (Number(s) === 0) s = (0).toFixed(n);
    return s.charAt(0) === '-' ? MINUS + s.slice(1) : s;
  }

  // clear(node): remove every child.
  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  // slider(core, o): a labelled range control {root, input, out, value(), show(v)}; o: id, label, min, max, step,
  // value, digits, unit, role, hint (HTML).
  function slider(core, o) {
    const el = core.el;
    const unit = o.unit || '';
    const input = el('input', { type: 'range', id: o.id, min: String(o.min), max: String(o.max), step: String(o.step), value: String(o.value), 'aria-describedby': o.hint ? o.id + '-hint' : null });
    const out = el('output', { id: o.id + '-out', for: o.id }, fmt(o.value, o.digits) + unit);
    const kids = [el('label', { for: o.id }, o.label), out, input];
    if (o.hint) kids.push(el('p', { class: 'control-hint', id: o.id + '-hint', html: o.hint }));
    const box = el('div', { class: 'control' + (o.role ? ' role-' + o.role : '') }, kids);
    return {
      root: box, input: input, out: out,
      value: function () { const v = Number(input.value); return isFinite(v) ? Math.max(o.min, Math.min(o.max, v)) : o.value; },
      show: function (v) { out.textContent = fmt(v, o.digits) + unit; }
    };
  }

  // svg(core, tag, attrs, children): an SVG element.
  function svg(core, tag, attrs, children) { return core.el('svg:' + tag, attrs, children); }

  // arrow(core, g, x1, y1, x2, y2, cls, width, dashed): a line with an arrowhead at (x2, y2), drawn into g.
  function arrow(core, g, x1, y1, x2, y2, cls, width, dashed) {
    const dx = x2 - x1, dy = y2 - y1, len = Math.sqrt(dx * dx + dy * dy);
    if (!(len > 1)) return;
    const ux = dx / len, uy = dy / len, s = 7 + width;
    g.appendChild(svg(core, 'line', { class: 'series ' + cls, x1: x1.toFixed(1), y1: y1.toFixed(1), x2: (x2 - ux * s * 0.8).toFixed(1), y2: (y2 - uy * s * 0.8).toFixed(1), style: 'stroke-width: ' + width + (dashed ? '; stroke-dasharray: 5 4' : '') }));
    const bx = x2 - ux * s, by = y2 - uy * s, w = s * 0.5;
    g.appendChild(svg(core, 'polygon', { class: 'dot ' + cls, points: x2.toFixed(1) + ',' + y2.toFixed(1) + ' ' + (bx - uy * w).toFixed(1) + ',' + (by + ux * w).toFixed(1) + ' ' + (bx + uy * w).toFixed(1) + ',' + (by - ux * w).toFixed(1) }));
  }

  // ================================================================== Lab 4D: the aggregation head

  Labs.register('lab-4d-aggregation', function mount(body, core) {
    const ID = 'lab-4d-aggregation';
    const el = core.el;
    const state = { mode: 'scores', d: D4.d.value, logits: [], scale: D4.scale.value, turn: null };
    for (let j = 0; j <= D4.d.max; j++) state.logits.push(D4.logit.value);

    // ---------------------------------------------------------------- the control strip

    const modeScores = el('input', { type: 'radio', name: ID + '-mode', id: ID + '-mode-scores', value: 'scores', checked: true });
    const modeVectors = el('input', { type: 'radio', name: ID + '-mode', id: ID + '-mode-vectors', value: 'vectors' });
    const modeBox = el('div', { class: 'control-group' }, [
      el('p', { class: 'control-group-title' }, 'Where the scores come from'),
      el('div', { class: 'segmented', role: 'radiogroup', 'aria-label': 'Where the scores come from' }, [
        el('label', null, [modeScores, el('span', null, 'You type them')]),
        el('label', null, [modeVectors, el('span', null, 'The vectors make them')])
      ])
    ]);
    const dCtl = slider(core, {
      id: ID + '-d', label: 'Positives in the set, d', min: D4.d.min, max: D4.d.max, step: 1, value: D4.d.value, digits: 0, role: 'positive',
      hint: 'SelfPatch summarises an anchor\'s 4 positives, and with equal scores the query token keeps 1 / (d + 1) of the attention.' + factMark('sp_k', 'agg_query_share_formula')
    });

    const scoreRows = [];
    const scoreBody = el('tbody');
    for (let j = 0; j <= D4.d.max; j++) {
      const input = el('input', {
        type: 'number', id: ID + '-logit-' + j, min: String(D4.logit.min), max: String(D4.logit.max), step: String(D4.logit.step),
        value: String(D4.logit.value), style: { width: '5rem' }, 'aria-label': j === 0 ? 'Score of the query token' : 'Score of positive ' + j
      });
      const share = el('td', { class: 'num', id: ID + '-share-' + j });
      const row = el('tr', null, [
        el('th', { scope: 'row', class: j === 0 ? 'role-teacher' : 'role-positive' }, el('span', { class: 'chip' }, j === 0 ? 'query' : 'positive ' + j)),
        el('td', null, input),
        share
      ]);
      input.addEventListener('input', core.guard(body, function () {
        const v = Number(input.value);
        if (!isFinite(v) || String(input.value).trim() === '') return;
        state.logits[j] = Math.max(D4.logit.min, Math.min(D4.logit.max, v));
        render();
      }));
      scoreBody.appendChild(row);
      scoreRows.push({ row: row, input: input, share: share });
    }
    const equalBtn = el('button', { type: 'button', class: 'btn', id: ID + '-equal' }, 'Equal scores');
    const scoresBox = el('div', { class: 'control-group', id: ID + '-scores-box' }, [
      el('p', { class: 'control-group-title' }, 'Scores'),
      el('p', { class: 'control-hint', html: 'Type a score for any token of the set. The shares are the softmax of the scores: they are positive and add up to 1.' + toyMark() }),
      el('div', { class: 'scroll-x' }, el('table', { class: 'matrix', id: ID + '-scores' }, [
        el('caption', null, 'One score per token of the set'),
        el('thead', null, el('tr', null, [el('th', { scope: 'col' }, 'Token'), el('th', { scope: 'col' }, 'Score'), el('th', { scope: 'col', class: 'num' }, 'Share')])),
        scoreBody
      ])),
      el('div', { class: 'button-row' }, [equalBtn])
    ]);

    const scaleCtl = slider(core, {
      id: ID + '-scale', label: 'Score scale, c', min: D4.scale.min, max: D4.scale.max, step: D4.scale.step, value: D4.scale.value, digits: 1, role: 'teacher',
      hint: 'Each toy score is c ' + TIMES + ' (query ' + String.fromCharCode(183) + ' token). The real module scores with learned projections, in 6 heads.' + factMark('agg_module_structure')
    });
    const turnCtl = slider(core, {
      id: ID + '-turn', label: 'Direction of positive 4', min: D4.turn.min, max: D4.turn.max, step: D4.turn.step, value: D4.turn.value, digits: 0, unit: DEG, role: 'positive',
      hint: 'At rest positive 4 is the walk\'s (' + MINUS + '0.8, ' + MINUS + '0.6), about 217' + DEG + ', far from the other three. Move it to see when the second block stops listening to it. The slider is on while d is 4 or more; with fewer positives there is no positive 4 to turn.' + toyMark()
    });
    const resetTurnBtn = el('button', { type: 'button', class: 'btn', id: ID + '-turn-reset' }, 'Back to the walk\'s vectors');
    const vectorsBox = el('div', { class: 'control-group', id: ID + '-vectors-box' }, [
      el('p', { class: 'control-group-title' }, 'Vectors'),
      scaleCtl.root,
      turnCtl.root,
      el('div', { class: 'button-row' }, [resetTurnBtn])
    ]);
    vectorsBox.hidden = true;

    const controls = el('div', { class: 'lab-controls' }, [modeBox, dCtl.root, scoresBox, vectorsBox]);

    // ---------------------------------------------------------------- the stage

    const summaryText = el('span', { id: ID + '-summary-text' });
    const summaryP = el('p', { id: ID + '-summary', 'aria-live': 'polite' }, [summaryText]);
    summaryP.insertAdjacentHTML('beforeend', toyMark());
    const legend = el('ul', { class: 'legend', 'aria-label': 'Key to the drawings' }, [
      el('li', { class: 'role-teacher' }, 'the query token and the summaries it makes'),
      el('li', { class: 'role-positive' }, 'the positives'),
      el('li', { class: 'role-ignored' }, 'the plain average of the positives, for comparison')
    ]);
    const barsCell = el('div', { class: 'stage-cell', id: ID + '-bars' });
    const plotCell = el('div', { class: 'stage-cell', id: ID + '-plot' });
    const numbersHead = el('thead');
    const numbersBody = el('tbody');
    const numbersTable = el('table', { id: ID + '-numbers' }, [el('caption', null, 'Every number of the drawing'), numbersHead, numbersBody]);
    const stage = el('div', { class: 'lab-stage' }, [
      summaryP,
      legend,
      el('div', { class: 'stage-row' }, [barsCell, plotCell]),
      el('div', { class: 'scroll-x' }, numbersTable)
    ]);
    body.appendChild(controls);
    body.appendChild(stage);

    // ---------------------------------------------------------------- computing

    // positivesNow(): the first d toy positives, positive 4 turned when the reader moved its slider.
    function positivesNow() {
      const list = D4.positives.slice(0, state.d).map(function (p) { return p.slice(); });
      if (state.turn !== null && state.d >= 4) {
        const a = state.turn * Math.PI / 180;
        list[3] = [Math.cos(a), Math.sin(a)];
      }
      return list;
    }

    // compute(): the shares of block 1 (typed scores, or the toy scores of the vectors), block 2 in the vectors mode,
    // the summaries and the plain average.
    function compute() {
      const pos = positivesNow();
      if (state.mode === 'scores') {
        const logits = state.logits.slice(0, state.d + 1);
        const shares = softmaxList(logits, 1);
        return { pos: pos, b1: { logits: logits, shares: shares, out: summaryOf(D4.query, pos, shares) }, b2: null, mean: meanOf(pos) };
      }
      const g = aggregate(D4.query, pos, state.scale);
      return { pos: pos, b1: g.block1, b2: g.block2, mean: g.mean };
    }

    // ---------------------------------------------------------------- drawing

    // drawBars(r): one row of bars per block: the share of the query token (blue) and of each positive (orange).
    function drawBars(r) {
      clear(barsCell);
      const rows = r.b2 ? [['block 1', r.b1.shares], ['block 2', r.b2.shares]] : [['shares', r.b1.shares]];
      const W = D4.bars.width, RH = D4.bars.rowHeight, H = rows.length * RH;
      const s = svg(core, 'svg', { class: 'chart', viewBox: '0 0 ' + W + ' ' + H, width: String(W), role: 'img', 'aria-label': rows.map(function (row) { return row[0] + ': ' + row[1].map(function (x) { return fmt(x, 3); }).join(', '); }).join('; ') });
      const n = r.b1.shares.length, left = 64, gap = (W - left - 8) / n, top = 18, base = RH - 24;
      let big = 0.5;
      rows.forEach(function (row) { row[1].forEach(function (x) { big = Math.max(big, x); }); });
      rows.forEach(function (row, ri) {
        const y0 = ri * RH;
        s.appendChild(svg(core, 'text', { class: 'title', x: '0', y: String(y0 + base - 4) }, row[0]));
        s.appendChild(svg(core, 'line', { class: 'axis', x1: String(left), y1: String(y0 + base + 0.5), x2: String(W - 4), y2: String(y0 + base + 0.5), style: 'stroke: var(--muted)' }));
        row[1].forEach(function (x, j) {
          const h = x / big * (base - top), bx = left + j * gap + 3;
          s.appendChild(svg(core, 'rect', { class: 'bar ' + (j === 0 ? 'role-teacher' : 'role-positive'), x: bx.toFixed(1), y: (y0 + base - h).toFixed(1), width: (gap - 6).toFixed(1), height: Math.max(0.5, h).toFixed(1) }));
          s.appendChild(svg(core, 'text', { x: (bx + (gap - 6) / 2).toFixed(1), y: (y0 + base - h - 4).toFixed(1), 'text-anchor': 'middle' }, fmt(x, 3)));
          s.appendChild(svg(core, 'text', { x: (bx + (gap - 6) / 2).toFixed(1), y: String(y0 + base + 14), 'text-anchor': 'middle' }, j === 0 ? 'q' : String(j)));
        });
      });
      barsCell.appendChild(s);
      barsCell.appendChild(el('p', { class: 'stage-label' }, r.b2 ? 'Shares in block 1 and block 2 (q: the query token; 1 to ' + state.d + ': the positives)' : 'The shares of your scores (q: the query token; 1 to ' + state.d + ': the positives)'));
    }

    // drawPlot(r): the positives as orange arrows on the unit circle, the plain average (grey, dashed) and the
    // directions of the summaries (blue: block 1 thin, block 2 thick). The real module ends in a LayerNorm, so only
    // the directions are drawn.
    function drawPlot(r) {
      clear(plotCell);
      const S = D4.plot.side, R = D4.plot.radius, cx = S / 2, cy = S / 2;
      const s = svg(core, 'svg', { class: 'chart', viewBox: '0 0 ' + S + ' ' + S, width: String(S), role: 'img', 'aria-label': 'The positives and the summaries as directions on a circle' });
      const grid = svg(core, 'g', { class: 'grid' });
      grid.appendChild(svg(core, 'circle', { cx: String(cx), cy: String(cy), r: String(R) }));
      grid.appendChild(svg(core, 'line', { x1: String(cx - R - 8), y1: String(cy), x2: String(cx + R + 8), y2: String(cy) }));
      grid.appendChild(svg(core, 'line', { x1: String(cx), y1: String(cy - R - 8), x2: String(cx), y2: String(cy + R + 8) }));
      s.appendChild(grid);
      const g = svg(core, 'g');
      r.pos.forEach(function (p, j) {
        arrow(core, g, cx, cy, cx + p[0] * R, cy - p[1] * R, 'role-positive', 2, false);
        g.appendChild(svg(core, 'text', { class: 'title', x: (cx + p[0] * (R + 13)).toFixed(1), y: (cy - p[1] * (R + 13) + 4).toFixed(1), 'text-anchor': 'middle' }, String(j + 1)));
      });
      function direction(v, cls, width, dashed, label) {
        const L = lengthOf(v);
        if (!(L > 1e-9)) return;
        arrow(core, g, cx, cy, cx + v[0] / L * R * 0.82, cy - v[1] / L * R * 0.82, cls, width, dashed);
        if (label) g.appendChild(svg(core, 'text', { x: (cx + v[0] / L * R * 0.5).toFixed(1), y: (cy - v[1] / L * R * 0.5 - 6).toFixed(1), 'text-anchor': 'middle' }, label));
      }
      direction(r.mean, 'role-ignored', 2, true, 'average');
      direction(r.b1.out, 'role-teacher', r.b2 ? 1.5 : 3, false, r.b2 ? '' : 'summary');
      if (r.b2) direction(r.b2.out, 'role-teacher', 3.5, false, 'block 2');
      g.appendChild(svg(core, 'circle', { class: 'dot role-teacher', cx: String(cx), cy: String(cy), r: '4' }));
      s.appendChild(g);
      plotCell.appendChild(s);
      plotCell.appendChild(el('p', { class: 'stage-label' }, 'Directions in two toy dimensions; the dot is the toy query token, which starts at zero'));
    }

    // renderNumbers(r): the table of every token's vector, scores and shares.
    function renderNumbers(r) {
      clear(numbersHead);
      clear(numbersBody);
      const head = ['Token', 'Vector', r.b2 ? 'Block 1 score' : 'Score', r.b2 ? 'Block 1 share' : 'Share'];
      if (r.b2) head.push('Block 2 score', 'Block 2 share');
      numbersHead.appendChild(el('tr', null, head.map(function (h, i) { return el('th', { scope: 'col', class: i > 1 ? 'num' : null }, h); })));
      const tokens = [D4.query].concat(r.pos);
      tokens.forEach(function (t, j) {
        const cells = [
          el('th', { scope: 'row' }, j === 0 ? 'query token' : 'positive ' + j),
          el('td', null, '(' + fmt(t[0], 2) + ', ' + fmt(t[1], 2) + ')'),
          el('td', { class: 'num' }, fmt(r.b1.logits[j], 2)),
          el('td', { class: 'num' }, fmt(r.b1.shares[j], 3))
        ];
        if (r.b2) cells.push(el('td', { class: 'num' }, fmt(r.b2.logits[j], 2)), el('td', { class: 'num' }, fmt(r.b2.shares[j], 3)));
        numbersBody.appendChild(el('tr', null, cells));
      });
      const outs = r.b2 ? [['block 1 summary', r.b1.out], ['block 2 summary', r.b2.out]] : [['summary', r.b1.out]];
      outs.concat([['plain average', r.mean]]).forEach(function (o) {
        const cells = [el('th', { scope: 'row' }, o[0]), el('td', null, '(' + fmt(o[1][0], 4) + ', ' + fmt(o[1][1], 4) + ')'), el('td', { class: 'num', colspan: r.b2 ? '4' : '2' }, lengthOf(o[1]) > 1e-9 ? 'points at ' + fmt(angleOf(o[1]), 1) + DEG : 'no direction')];
        numbersBody.appendChild(el('tr', null, cells));
      });
    }

    // renderSummary(r): one paragraph that says what the drawing shows.
    function renderSummary(r) {
      const n = state.d + 1;
      const q = r.b1.shares[0];
      let text;
      if (!r.b2) {
        const equal = r.b1.logits.every(function (l) { return l === r.b1.logits[0]; });
        let best = 0;
        r.b1.shares.forEach(function (x, j) { if (x > r.b1.shares[best]) best = j; });
        text = 'The query token keeps ' + fmt(q, 3) + ' of the attention and the ' + state.d + ' positive' + (state.d === 1 ? '' : 's') + ' share ' + fmt(1 - q, 3) + '. ' +
          (equal ? 'All ' + n + ' scores are equal, so every token gets 1 / (' + state.d + ' + 1) = ' + fmt(1 / n, 3) + '.'
            : 'The largest share, ' + fmt(r.b1.shares[best], 3) + ', goes to ' + (best === 0 ? 'the query token' : 'positive ' + best) + '.');
      } else {
        text = 'Block 1: the toy query starts at zero, so all ' + n + ' scores are 0 and every token gets ' + fmt(1 / n, 3) + '. Block 2 is asked by block 1\'s summary';
        if (state.d >= 4) {
          const others = r.b2.shares.slice(1).filter(function (x, j) { return j !== 3; });
          text += ': positive 4 gets ' + fmt(r.b2.shares[4], 3) + (others.length ? ', the other positives from ' + fmt(Math.min.apply(null, others), 3) + ' to ' + fmt(Math.max.apply(null, others), 3) : '') + '. ';
        } else {
          text += ': the positives get from ' + fmt(Math.min.apply(null, r.b2.shares.slice(1)), 3) + ' to ' + fmt(Math.max.apply(null, r.b2.shares.slice(1)), 3) + '. ';
        }
        text += lengthOf(r.b2.out) > 1e-9 ? 'The summary points at ' + fmt(angleOf(r.b2.out), 1) + DEG : 'The summary has no direction';
        text += lengthOf(r.mean) > 1e-9 ? ', the plain average at ' + fmt(angleOf(r.mean), 1) + DEG : '';
        if (state.d >= 4) text += ', and the average of the other ' + (state.d - 1) + ' positives at ' + fmt(angleOf(meanOf(r.pos.filter(function (p, j) { return j !== 3; }))), 1) + DEG;
        text += '.';
      }
      summaryText.textContent = text;
    }

    // render(): recompute and redraw everything, and record the shares on the stage for tests and readers of the DOM.
    function render() {
      const r = compute();
      scoreRows.forEach(function (row, j) {
        row.row.hidden = j > state.d;
        row.share.textContent = j <= state.d && !r.b2 ? fmt(r.b1.shares[j], 3) : '';
      });
      turnCtl.input.disabled = state.d < 4;
      resetTurnBtn.disabled = state.d < 4;
      drawBars(r);
      drawPlot(r);
      renderNumbers(r);
      renderSummary(r);
      stage.setAttribute('data-mode', state.mode);
      stage.setAttribute('data-d', String(state.d));
      stage.setAttribute('data-query-share', String(r.b1.shares[0]));
      stage.setAttribute('data-shares', r.b1.shares.map(String).join(' '));
      if (r.b2) stage.setAttribute('data-block2-shares', r.b2.shares.map(String).join(' '));
      else stage.removeAttribute('data-block2-shares');
    }

    // ---------------------------------------------------------------- events

    [modeScores, modeVectors].forEach(function (input) {
      input.addEventListener('change', core.guard(body, function () {
        if (!input.checked) return;
        state.mode = input.value === 'vectors' ? 'vectors' : 'scores';
        scoresBox.hidden = state.mode !== 'scores';
        vectorsBox.hidden = state.mode !== 'vectors';
        render();
      }));
    });
    dCtl.input.addEventListener('input', core.guard(body, function () {
      state.d = Math.round(dCtl.value());
      dCtl.show(state.d);
      render();
    }));
    scaleCtl.input.addEventListener('input', core.guard(body, function () {
      state.scale = scaleCtl.value();
      scaleCtl.show(state.scale);
      render();
    }));
    turnCtl.input.addEventListener('input', core.guard(body, function () {
      state.turn = turnCtl.value();
      turnCtl.show(state.turn);
      render();
    }));
    equalBtn.addEventListener('click', core.guard(body, function () {
      for (let j = 0; j < state.logits.length; j++) {
        state.logits[j] = D4.logit.value;
        scoreRows[j].input.value = String(D4.logit.value);
      }
      render();
    }));
    resetTurnBtn.addEventListener('click', core.guard(body, function () {
      state.turn = null;
      turnCtl.input.value = String(D4.turn.value);
      turnCtl.show(D4.turn.value);
      render();
    }));

    render();
    refreshMarks();
  });

  // ================================================================== Lab 4E: the released model's real neighbours

  Labs.register('lab-4e-real-neighbours', function mount(body, core, bundles) {
    bundles = bundles || core.bundles || {};
    const ID = 'lab-4e-real-neighbours';
    const el = core.el;
    const G = D4E.grid, N = G * G, P = D4E.patch;
    const CELL = D4E.cell, MARGIN = D4E.margin, VIEW = G * CELL + 2 * MARGIN;
    const WCELL = D4E.windowCell, WVIEW = 3 * WCELL;
    const MCELL = D4E.mapCell, MVIEW = G * MCELL;
    const PLACES = { '-1,-1': 'up-left', '-1,0': 'up', '-1,1': 'up-right', '0,-1': 'left', '0,1': 'right', '1,-1': 'down-left', '1,0': 'down', '1,1': 'down-right' };
    const TOKENS_REF = '000000114269_selfpatch_tokens224.json#tokens';
    const images = bundles['images.json'] || bundles.images;
    if (!images || !Array.isArray(images.images)) throw new Error('images.json did not load');
    const st = { id: images.followed, anchor: D4E.anchor, k: D4E.k.value, map: true, data: {}, pics: {}, pending: null, message: '' };

    // entry(id): the images.json record of a photograph.
    function entry(id) {
      for (let i = 0; i < images.images.length; i++) if (images.images[i].id === id) return images.images[i];
      return null;
    }

    // rowsOf(doc): the 196 token rows of a decoded tokens file (member tokens: 196 x 384).
    function rowsOf(doc) {
      const m = doc && doc.tokens;
      if (!m || !m.array || !m.shape || m.shape[0] !== N) throw new Error('a tokens file without its 196 x 384 member');
      const rows = [];
      for (let i = 0; i < N; i++) rows.push(core.bundle.rows(m, i));
      return rows;
    }

    // the followed photograph's tokens, from the bundles that boot.js loaded for data-needs
    (function () {
      const e = entry(st.id);
      if (!e || !e.files || !e.files.tokens224) return;
      const name = e.files.tokens224.selfpatch;
      const doc = bundles[name] || bundles[String(name).replace(/[.]json$/, '')];
      if (doc) st.data[st.id] = rowsOf(doc);
    })();

    // ---------------------------------------------------------------- the control strip

    let picker = null;
    let pickerSelect = null;
    if (typeof core.bundleImagePicker === 'function') {
      picker = core.bundleImagePicker({ id: ID, label: 'Photograph' });
    } else {
      pickerSelect = el('select', { id: ID + '-photo' }, images.images.map(function (im) { return el('option', { value: im.id }, im.description || im.id); }));
      pickerSelect.value = st.id;
      picker = el('div', { class: 'bundle-pick' }, [el('label', { for: ID + '-photo' }, 'Photograph'), pickerSelect]);
    }
    const kCtl = slider(core, {
      id: ID + '-k', label: 'Positives kept, k', min: D4E.k.min, max: D4E.k.max, step: 1, value: D4E.k.value, digits: 0, role: 'positive',
      hint: 'The official rule keeps the 4 most similar of the 8.' + factMark('sp_k')
    });
    const mapInput = el('input', { type: 'checkbox', id: ID + '-show-map', checked: true });
    const resetBtn = el('button', { type: 'button', class: 'btn', id: ID + '-reset' }, 'Back to patch 34');
    const controls = el('div', { class: 'lab-controls' }, [
      el('div', { class: 'control-group' }, [el('p', { class: 'control-group-title' }, 'Photograph'), picker]),
      el('div', { class: 'control-group' }, [
        el('p', { class: 'control-group-title' }, 'Anchor'),
        el('p', { class: 'control-hint', html: 'Click a patch of the photograph, or focus it and use the arrow keys. At rest the anchor is patch 34 of the followed photograph, on the dog\'s nose.' + realMark('followed.json#anchor') }),
        el('div', { class: 'button-row' }, [resetBtn])
      ]),
      kCtl.root,
      el('div', { class: 'control-group' }, [
        el('p', { class: 'control-group-title' }, 'The whole crop'),
        el('div', { class: 'toggle-row' }, el('label', { class: 'toggle' }, [mapInput, ' Show the cosine to every patch'])),
        el('p', { class: 'control-hint', html: 'SelfPatch looks only inside the window. The map shows where the anchor\'s most similar patches lie in the whole crop.' + factMark('why_rule_outside_window') })
      ])
    ]);

    // ---------------------------------------------------------------- the stage

    const summaryText = el('span', { id: ID + '-summary-text' });
    const summaryP = el('p', { id: ID + '-summary', 'aria-live': 'polite' }, [summaryText]);
    summaryP.insertAdjacentHTML('beforeend', realMark(TOKENS_REF));
    const legend = el('ul', { class: 'legend', 'aria-label': 'Key to the pictures' }, [
      el('li', null, 'the anchor (thick outline)'),
      el('li', { class: 'role-positive' }, 'kept: a positive'),
      el('li', { class: 'role-ignored' }, 'in the window, not kept'),
      el('li', { class: 'role-teacher' }, 'cosine to the anchor in the whole crop (stronger blue: larger)')
    ]);
    const gridCanvas = el('canvas', {
      id: ID + '-grid', tabindex: '0', 'data-view': String(VIEW), 'data-cell': String(CELL), 'data-margin': String(MARGIN),
      'aria-label': 'The photograph cut into 14 by 14 patches. Click a patch, or use the arrow keys, to choose the anchor.', 'aria-describedby': ID + '-summary'
    });
    const winCanvas = el('canvas', { id: ID + '-window', role: 'img', 'aria-label': 'The anchor\'s 3 by 3 window, enlarged, with the real cosine of each neighbour' });
    const mapCanvas = el('canvas', { id: ID + '-map', 'aria-label': 'The cosine of the anchor to every patch of the crop. Click a patch to make it the anchor.' });
    const readout = el('dl', { class: 'readout', id: ID + '-readout' });
    const mapNote = el('p', { class: 'stage-label', id: ID + '-map-note' });
    const message = el('p', { class: 'control-hint', id: ID + '-message', 'aria-live': 'polite' });
    const tbody = el('tbody', { id: ID + '-ranking-body' });
    const table = el('table', { id: ID + '-ranking' }, [
      el('caption', null, 'The 8 window neighbours, most similar first'),
      el('thead', null, el('tr', null, [
        el('th', { class: 'num', scope: 'col' }, 'Rank'),
        el('th', { class: 'num', scope: 'col' }, 'Patch'),
        el('th', { scope: 'col' }, 'Row, column'),
        el('th', { scope: 'col' }, 'Place'),
        el('th', { class: 'num', scope: 'col' }, 'Cosine'),
        el('th', { scope: 'col' }, 'Kept?')
      ])),
      tbody
    ]);
    const mapCell = el('div', { class: 'stage-cell', style: { maxWidth: MVIEW + 'px' } }, [mapCanvas, mapNote]);
    const stage = el('div', { class: 'lab-stage' }, [
      summaryP,
      legend,
      el('div', { class: 'stage-row' }, [
        el('div', { class: 'stage-cell', style: { maxWidth: VIEW + 'px' } }, [gridCanvas, el('p', { class: 'stage-label' }, 'The 224-pixel view as 14 ' + TIMES + ' 14 patches, with the anchor\'s window')]),
        el('div', { class: 'stage-cell', style: { maxWidth: Math.max(WVIEW, 240) + 'px' } }, [winCanvas, el('p', { class: 'stage-label' }, 'The window enlarged: each neighbour\'s real cosine and rank'), readout]),
        mapCell
      ]),
      el('div', { class: 'scroll-x' }, table),
      message
    ]);
    body.appendChild(controls);
    body.appendChild(stage);

    // ---------------------------------------------------------------- computing

    // compute(): the window's cosines on the real tokens, the ranking (largest first, ties to the lower index), the kept
    // neighbours, and the cosine to every patch of the crop with its 8 most similar patches.
    function compute() {
      const rows = st.data[st.id];
      if (!rows) return null;
      const a = st.anchor;
      const info = core.neighbourInfo(a, G);
      const nb = info.map(function (x) { return x.index; });
      const cos = nb.map(function (j) { return core.cosine(rows[a], rows[j]); });
      const order = core.rankRow(cos);
      const keptSlots = order.slice(0, st.k);
      const kept = keptSlots.map(function (s) { return nb[s]; }).sort(function (x, y) { return x - y; });
      const all = [];
      for (let j = 0; j < N; j++) all.push(j === a ? NaN : core.cosine(rows[a], rows[j]));
      const top = core.rankRow(all).slice(0, D4E.cropTop);
      const inside = top.filter(function (j) { return nb.indexOf(j) >= 0; }).length;
      let lo = Infinity, hi = -Infinity;
      all.forEach(function (x) { if (x === x) { lo = Math.min(lo, x); hi = Math.max(hi, x); } });
      return { a: a, info: info, nb: nb, cos: cos, order: order, keptSlots: keptSlots, kept: kept, all: all, top: top, inside: inside, lo: lo, hi: hi, threshold: cos[order[st.k - 1]] };
    }

    // ---------------------------------------------------------------- drawing

    const MONO_FONT = '"JetBrains Mono", ui-monospace, "Cascadia Mono", Consolas, monospace';

    // drawGrid(r): the photograph, the 14 x 14 grid, the window (orange: kept, grey dashes: not kept, a corner mark:
    // reached by wrapping round the border) and the anchor.
    function drawGrid(r) {
      const th = core.theme();
      const ctx = core.fitCanvas(gridCanvas, VIEW, VIEW);
      ctx.fillStyle = th.paper;
      ctx.fillRect(0, 0, VIEW, VIEW);
      const pic = st.pics[st.id];
      if (pic) {
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(pic, MARGIN, MARGIN, G * CELL, G * CELL);
      } else {
        ctx.fillStyle = core.rgba(th.ink, 0.06);
        ctx.fillRect(MARGIN, MARGIN, G * CELL, G * CELL);
      }
      ctx.strokeStyle = core.rgba(th.paper, 0.6);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i <= G; i++) {
        const p = MARGIN + i * CELL + 0.5;
        ctx.moveTo(p, MARGIN);
        ctx.lineTo(p, MARGIN + G * CELL);
        ctx.moveTo(MARGIN, p);
        ctx.lineTo(MARGIN + G * CELL, p);
      }
      ctx.stroke();
      if (!r) return;
      r.info.forEach(function (x, s) {
        const px = MARGIN + x.col * CELL, py = MARGIN + x.row * CELL;
        if (r.keptSlots.indexOf(s) >= 0) {
          ctx.fillStyle = core.rgba(th.positive, 0.3);
          ctx.fillRect(px, py, CELL, CELL);
          ctx.strokeStyle = th.positive;
          ctx.lineWidth = 2.5;
          ctx.strokeRect(px + 1.25, py + 1.25, CELL - 2.5, CELL - 2.5);
        } else {
          ctx.setLineDash([3, 2]);
          ctx.strokeStyle = th.ignored;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(px + 1, py + 1, CELL - 2, CELL - 2);
          ctx.setLineDash([]);
        }
        if (x.wrapped) {
          ctx.fillStyle = th.ink;
          ctx.beginPath();
          ctx.moveTo(px + 2, py + 2);
          ctx.lineTo(px + 10, py + 2);
          ctx.lineTo(px + 2, py + 10);
          ctx.closePath();
          ctx.fill();
        }
      });
      const ax = MARGIN + (r.a % G) * CELL, ay = MARGIN + Math.floor(r.a / G) * CELL;
      ctx.strokeStyle = th.paper;
      ctx.lineWidth = 5;
      ctx.strokeRect(ax + 1, ay + 1, CELL - 2, CELL - 2);
      ctx.strokeStyle = th.ink;
      ctx.lineWidth = 3;
      ctx.strokeRect(ax + 1, ay + 1, CELL - 2, CELL - 2);
    }

    // chip(ctx, text, x, y, th): a small label on a paper-coloured box, centred at (x, y).
    function chip(ctx, text, x, y, th) {
      ctx.font = '600 11px ' + MONO_FONT;
      const w = text.length * 7 + 6;
      ctx.fillStyle = core.rgba(th.paper, 0.86);
      ctx.fillRect(x - w / 2, y - 8, w, 16);
      ctx.fillStyle = th.ink;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x, y);
    }

    // drawWindow(r): the anchor and its 8 neighbours enlarged, each where the window puts it, with its cosine and rank.
    function drawWindow(r) {
      const th = core.theme();
      const ctx = core.fitCanvas(winCanvas, WVIEW, WVIEW);
      ctx.fillStyle = th.paper;
      ctx.fillRect(0, 0, WVIEW, WVIEW);
      if (!r) return;
      const pic = st.pics[st.id];
      const cells = [{ row: Math.floor(r.a / G), col: r.a % G, dr: 0, dc: 0, slot: -1 }].concat(r.info.map(function (x, s) {
        return { row: x.row, col: x.col, dr: x.dr, dc: x.dc, slot: s, wrapped: x.wrapped };
      }));
      cells.forEach(function (c) {
        const x = (c.dc + 1) * WCELL, y = (c.dr + 1) * WCELL;
        if (pic) {
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(pic, c.col * P, c.row * P, P, P, x, y, WCELL, WCELL);
        } else {
          ctx.fillStyle = core.rgba(th.ink, 0.06);
          ctx.fillRect(x, y, WCELL, WCELL);
        }
        if (c.slot < 0) {
          ctx.strokeStyle = th.ink;
          ctx.lineWidth = 3;
          ctx.strokeRect(x + 1.5, y + 1.5, WCELL - 3, WCELL - 3);
          chip(ctx, 'anchor', x + WCELL / 2, y + WCELL - 11, th);
          return;
        }
        const kept = r.keptSlots.indexOf(c.slot) >= 0;
        if (kept) {
          ctx.strokeStyle = th.positive;
          ctx.lineWidth = 3;
          ctx.strokeRect(x + 1.5, y + 1.5, WCELL - 3, WCELL - 3);
        } else {
          ctx.setLineDash([4, 3]);
          ctx.strokeStyle = th.ignored;
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 1, y + 1, WCELL - 2, WCELL - 2);
          ctx.setLineDash([]);
        }
        chip(ctx, fmt(r.cos[c.slot], D4E.digits), x + WCELL / 2, y + WCELL - 11, th);
        chip(ctx, '#' + (r.order.indexOf(c.slot) + 1) + (c.wrapped ? ' w' : ''), x + WCELL / 2, y + 11, th);
      });
    }

    // drawMap(r): the cosine of the anchor to every patch of the crop as blue strength over the faded photograph, the
    // crop's 8 most similar patches outlined in ink dashes, the window's cells in thin ink and the anchor.
    function drawMap(r) {
      const th = core.theme();
      const ctx = core.fitCanvas(mapCanvas, MVIEW, MVIEW);
      ctx.fillStyle = th.paper;
      ctx.fillRect(0, 0, MVIEW, MVIEW);
      const pic = st.pics[st.id];
      if (pic) {
        ctx.globalAlpha = 0.35;
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(pic, 0, 0, MVIEW, MVIEW);
        ctx.globalAlpha = 1;
      }
      if (!r) return;
      const span = r.hi - r.lo || 1;
      for (let j = 0; j < N; j++) {
        if (j === r.a) continue;
        ctx.fillStyle = core.rgba(th.teacher, 0.85 * Math.max(0, Math.min(1, (r.all[j] - r.lo) / span)));
        ctx.fillRect((j % G) * MCELL, Math.floor(j / G) * MCELL, MCELL, MCELL);
      }
      ctx.strokeStyle = core.rgba(th.ink, 0.55);
      ctx.lineWidth = 1;
      r.nb.forEach(function (j) { ctx.strokeRect((j % G) * MCELL + 0.5, Math.floor(j / G) * MCELL + 0.5, MCELL - 1, MCELL - 1); });
      ctx.setLineDash([3, 2]);
      ctx.strokeStyle = th.ink;
      ctx.lineWidth = 2;
      r.top.forEach(function (j) { ctx.strokeRect((j % G) * MCELL + 1, Math.floor(j / G) * MCELL + 1, MCELL - 2, MCELL - 2); });
      ctx.setLineDash([]);
      const ax = (r.a % G) * MCELL, ay = Math.floor(r.a / G) * MCELL;
      ctx.strokeStyle = th.paper;
      ctx.lineWidth = 4;
      ctx.strokeRect(ax + 1, ay + 1, MCELL - 2, MCELL - 2);
      ctx.strokeStyle = th.ink;
      ctx.lineWidth = 2.5;
      ctx.strokeRect(ax + 1, ay + 1, MCELL - 2, MCELL - 2);
    }

    // placeOf(x): the neighbour's place in the window, and whether the window reached it by wrapping round the border.
    function placeOf(x) {
      return PLACES[x.dr + ',' + x.dc] + (x.wrapped ? ', across the border' : '');
    }

    // renderText(r): the summary, the readout and the ranking table.
    function renderText(r) {
      clear(readout);
      clear(tbody);
      if (!r) {
        summaryText.textContent = 'Loading the real tokens of this photograph' + ELLIPSIS;
        return;
      }
      const e = entry(st.id);
      const ranked = r.order.map(function (s) { return { slot: s, j: r.nb[s], c: r.cos[s], x: r.info[s] }; });
      const kept = ranked.slice(0, st.k), dropped = ranked.slice(st.k);
      const list = function (items) { return items.map(function (it) { return it.j; }).join(', '); };
      let text = 'Anchor ' + r.a + ' (row ' + Math.floor(r.a / G) + ', column ' + (r.a % G) + ') of ' + (e && e.description ? 'the photograph of ' + e.description : st.id) +
        ' keeps ' + list(kept) + ', with cosines from ' + fmt(kept[0].c, 3) + ' down to ' + fmt(kept[kept.length - 1].c, 3);
      text += dropped.length ? ', and drops ' + list(dropped) + ', from ' + fmt(dropped[0].c, 3) + ' down to ' + fmt(dropped[dropped.length - 1].c, 3) + '.' : '. With k = 8 nothing is dropped.';
      text += ' Of the 8 patches of the whole crop most similar to it, ' + r.inside + ' lie in its window.';
      summaryText.textContent = text;
      const add = function (name, value) { readout.appendChild(el('dt', null, name)); readout.appendChild(el('dd', null, value)); };
      add('Threshold, the ' + st.k + (st.k === 1 ? 'st' : st.k === 2 ? 'nd' : st.k === 3 ? 'rd' : 'th') + ' largest of the 8', fmt(r.threshold, 3));
      if (dropped.length) add('Gap to the largest one dropped', fmt(r.threshold - dropped[0].c, 3));
      add('Crop\'s 8 most similar inside the window', r.inside + ' of 8');
      mapNote.textContent = 'The whole crop: blue strength is the cosine to the anchor; dashed: its 8 most similar patches, ' + r.inside + ' of them inside the window.';
      ranked.forEach(function (it, i) {
        const isKept = i < st.k;
        tbody.appendChild(el('tr', { class: isKept ? 'role-positive' : null }, [
          el('td', { class: 'num' }, String(i + 1)),
          el('td', { class: 'num' }, String(it.j)),
          el('td', null, it.x.row + ', ' + it.x.col),
          el('td', null, placeOf(it.x)),
          el('td', { class: 'num' }, fmt(it.c, 3)),
          el('td', null, isKept ? el('span', { class: 'chip filled' }, 'kept') : 'no')
        ]));
      });
    }

    // draw(): every picture and text, and the stage's record of the anchor, the kept neighbours and the photograph.
    function draw() {
      const r = compute();
      drawGrid(r);
      drawWindow(r);
      mapCell.hidden = !st.map;
      if (st.map) drawMap(r);
      renderText(r);
      message.textContent = st.message;
      stage.setAttribute('data-image', st.id);
      stage.setAttribute('data-anchor', String(st.anchor));
      stage.setAttribute('data-k', String(st.k));
      if (r) {
        stage.setAttribute('data-kept', r.kept.join(' '));
        stage.setAttribute('data-inside', String(r.inside));
      }
    }

    // ---------------------------------------------------------------- photographs and tokens

    // loadPicture(id): the photograph's 224-pixel view as the bundle cut it, drawn by the browser (Core.image.load); null
    // when it cannot be drawn (the tokens are the bundle's own numbers either way).
    function loadPicture(id) {
      if (Object.prototype.hasOwnProperty.call(st.pics, id)) return Promise.resolve(st.pics[id]);
      const e = entry(id);
      if (!e || !core.image || typeof core.image.load !== 'function') {
        st.pics[id] = null;
        return Promise.resolve(null);
      }
      const v = e.views && e.views['224'];
      const opts = v && v.box_native ? { side: 224, box: v.box_native } : 224;
      return Promise.resolve().then(function () { return core.image.load(core.image.url(id), opts); }).then(function (img) {
        st.pics[id] = core.toCanvas(img);
        return st.pics[id];
      }, function () {
        st.pics[id] = null;
        return null;
      });
    }

    // loadTokens(id): the released SelfPatch model's tokens of a photograph, through Core.bundle.
    function loadTokens(id) {
      if (st.data[id]) return Promise.resolve(st.data[id]);
      const e = entry(id);
      if (!e) return Promise.reject(new Error('no photograph ' + id + ' in images.json'));
      return core.bundle.load(e.files.tokens224.selfpatch).then(function (doc) {
        st.data[id] = rowsOf(doc);
        return st.data[id];
      });
    }

    // show(id): switch to a photograph: its tokens first, then its picture; on a failure the previous one stays.
    function show(id) {
      if (!entry(id)) return;
      const previous = st.id;
      st.pending = id;
      st.message = st.data[id] ? '' : 'Loading the real tokens of this photograph' + ELLIPSIS;
      message.textContent = st.message;
      loadTokens(id).then(function () {
        if (st.pending !== id) return null;
        st.id = id;
        st.message = '';
        if (pickerSelect) pickerSelect.value = id;
        draw();
        return loadPicture(id).then(function () { if (st.id === id) draw(); });
      }).then(null, core.guard(body, function (err) {
        if (st.pending !== id) return;
        st.id = previous;
        st.message = 'The real tokens of this photograph did not load (' + (err && err.message ? err.message : String(err)) + '). The lab still shows the previous photograph.';
        draw();
      }));
    }

    // ---------------------------------------------------------------- events

    // setAnchor(j): make patch j the anchor and redraw.
    function setAnchor(j) {
      st.anchor = Math.max(0, Math.min(N - 1, j));
      draw();
    }

    gridCanvas.addEventListener('click', core.guard(body, function (ev) {
      const p = core.canvasPoint(gridCanvas, ev, VIEW, VIEW);
      const c = Math.floor((p.x - MARGIN) / CELL), rr = Math.floor((p.y - MARGIN) / CELL);
      if (c < 0 || c >= G || rr < 0 || rr >= G) return;
      setAnchor(rr * G + c);
    }));
    gridCanvas.addEventListener('keydown', core.guard(body, function (ev) {
      let rr = Math.floor(st.anchor / G), c = st.anchor % G;
      if (ev.key === 'ArrowUp') rr -= 1;
      else if (ev.key === 'ArrowDown') rr += 1;
      else if (ev.key === 'ArrowLeft') c -= 1;
      else if (ev.key === 'ArrowRight') c += 1;
      else return;
      ev.preventDefault();
      setAnchor(Math.max(0, Math.min(G - 1, rr)) * G + Math.max(0, Math.min(G - 1, c)));
    }));
    mapCanvas.addEventListener('click', core.guard(body, function (ev) {
      const p = core.canvasPoint(mapCanvas, ev, MVIEW, MVIEW);
      const c = Math.floor(p.x / MCELL), rr = Math.floor(p.y / MCELL);
      if (c < 0 || c >= G || rr < 0 || rr >= G) return;
      setAnchor(rr * G + c);
    }));
    kCtl.input.addEventListener('input', core.guard(body, function () {
      st.k = Math.round(kCtl.value());
      kCtl.show(st.k);
      draw();
    }));
    mapInput.addEventListener('change', core.guard(body, function () {
      st.map = !!mapInput.checked;
      draw();
    }));
    resetBtn.addEventListener('click', core.guard(body, function () { setAnchor(D4E.anchor); }));
    if (pickerSelect) pickerSelect.addEventListener('change', core.guard(body, function () { show(pickerSelect.value); }));
    core.on('bundle-image-changed', core.guard(body, function (e) { if (e && e.id) show(e.id); }));
    core.on('theme-changed', core.guard(body, draw));

    draw();
    const start = root.Boot && typeof root.Boot.bundleImage === 'function' ? root.Boot.bundleImage() : st.id;
    if (start && start !== st.id && entry(start)) show(start);
    else if (!st.data[st.id]) show(st.id);
    else loadPicture(st.id).then(core.guard(body, function () { draw(); }));
    refreshMarks();
  });

  // ------------------------------------------------------------------ window.LabP4

  (function exportP4() {
    const P4 = root.LabP4 = root.LabP4 || {};
    P4.tables = P4.tables || {};
    const facts = {};
    Object.keys(FACTS).forEach(function (id) { facts[id] = { shown: FACTS[id].shown, source: FACTS[id].source, cite: FACTS[id].cite }; });
    P4.tables['lab-4d-aggregation and lab-4e-real-neighbours'] = { facts: facts, notInSheet: [] };
    P4.workedExamples = workedExamples;
    P4.curvePoints = curvePoints;
    P4.curvePath = curvePath;
    P4.curveX = curveX;
    P4.curveY = curveY;
    P4.factTables = function () { return P4.tables; };
    P4.classAttention = classAttention;
    P4.aggregate = aggregate;
    P4.walks = { neighbours: NEIGHBOUR_WALK, class_attention: CA_WALK, patch_loss: PL_WALK };
    P4.defaults = { aggregation: D4, realNeighbours: D4E };
  })();
})(typeof window !== 'undefined' ? window : this);
