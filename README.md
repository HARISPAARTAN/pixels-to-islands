# Pixels to Islands

A from-zero interactive course on self-supervised vision: how DINO and SelfPatch learn from images without labels, and the contrastive patch-selection rule my master's thesis studies on top of them. Nine pages, every concept introduced with a picture and a number before it is used, every equation walked with numbers you can check by hand, a "why" card for every design decision, and labs on real photographs with real model features.

Live: https://harispaartan.github.io/pixels-to-islands/ · part of https://harispaartan.github.io/

## The pages

| Part | Page | What it covers |
|---|---|---|
| 0 | Start | The thesis in one sentence, how to read the course, the four kinds of statements (Fact, Real, Toy, Reading) |
| 1 | Foundations | Numbers, vectors, a loss, a gradient step, softmax with a temperature |
| 2 | Transformer | How a crop becomes tokens, attention, the Vision Transformer |
| 3 | DINO | Student and teacher, crops, the head and its prototypes, centring and sharpening, the loss, the EMA teacher, the recipe |
| 4 | SelfPatch | Patch-level self-supervision, neighbours, the positive selection the thesis questions |
| 5 | Our rule | The contrastive rule with positives from anywhere in the crop and negatives from the least similar fifth |
| 6 | Reading | What the runs showed, read from the actual numbers |
| 7 | Pipeline | The end-to-end pipeline film: from an image to islands of agreeing patches |
| 8 | Why ledger | Every decision with its reason, the glossary, the sources |

Marks on every statement keep the kinds apart: **Fact** (from a paper or from code, with a source tag), **Real** (computed once from the real models on real images and embedded), **Toy** (the page's own simplification, computed in the browser), **Reading** (what the runs showed).

## How it is built

- Static pages generated from a source tree (copy, labs, glossary and fact sheets) by an assembler with page checks; this repository holds the built site.
- `assets/core.js`, `scenes.js`, `toy_vit.js`, `boot.js`: the shared runtime; `assets/labs_p*.js`: the labs of each part, mounted lazily as they scroll into view.
- `data/`: the real-data bundle, eight photographs from the COCO train2017 collection with per-row int8-quantised tokens and attention keys from DINO, the released SelfPatch checkpoint and the thesis's own runs.
- The page palette and typefaces follow my portfolio (`assets/theme-portfolio.css`, fonts self-hosted under the SIL Open Font License); the course's own role colours are unchanged: green student, blue teacher, orange positive, purple negative, grey ignored. No request leaves the page.

## Credits

The photographs are from the COCO dataset (Lin et al., 2014), used here for teaching; the DINO (Caron et al., 2021) and SelfPatch (Yun et al., 2022) papers are cited on the pages where their facts appear.

## Licence

Code and text: MIT, see `LICENSE`. Fonts: SIL Open Font License (`assets/fonts/LICENSES.md`).
