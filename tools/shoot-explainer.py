"""Screenshots of the course pages, the social image and the portfolio thumbnail.

Serves this repository over local HTTP, drives a headless Chromium through Playwright for Node (no Python
Playwright is needed), and writes:
  - viewport screenshots of index.html and p3-dino.html at 1440x900 and 390x844 in the dark theme, index.html at
    1440x900 in the light theme, and one full-page shot of index.html at 1440 wide, to OUT_DIR;
  - assets/og.png (1200x630), rendered from a small template on the portfolio's tokens;
  - the thumbnail of the start page for the portfolio's course card, at the pixel size of the file it replaces.
Exit code 1 when any page throws an uncaught error or logs a console error.

Playwright is looked for, in this order: $PLAYWRIGHT_NODE_MODULES, tools/node_modules, node_modules/playwright
under E:/GITGUB/* and E:/CGPTCLONED/*, the npx cache. Only a copy whose Chromium revision is in the browser cache
(%LOCALAPPDATA%/ms-playwright) is used; nothing is installed or downloaded.
"""
import glob
import json
import os
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
OUT_DIR = Path("E:/GITGUB/.superpowers/sdd/pti-skin")
THUMB = Path("E:/GITGUB/HARISPAARTAN.github.io/assets/img/pixels-to-islands.png")
OG = REPO / "assets/og.png"
NAV_TIMEOUT_MS = 60000
SETTLE_MS = 1500
OG_TITLE = "Pixels to Islands"
OG_EYEBROW = "// research · master's thesis explainer"
OG_LEAD = "An interactive course on DINO, SelfPatch and a contrastive patch-selection rule"
OG_FOOT = "harispaartan.github.io/pixels-to-islands"

# page, width, height, theme, full page
SHOTS = [("index.html", 1440, 900, "dark", False), ("index.html", 1440, 900, "dark", True),
         ("index.html", 390, 844, "dark", False), ("p3-dino.html", 1440, 900, "dark", False),
         ("p3-dino.html", 390, 844, "dark", False), ("index.html", 1440, 900, "light", False)]


def browsers_dir():
    return Path(os.environ.get("PLAYWRIGHT_BROWSERS_PATH") or Path(os.environ.get("LOCALAPPDATA", "")) / "ms-playwright")


def usable(pw_dir):
    """True when this playwright copy's Chromium revision is in the browser cache."""
    try:
        data = json.loads((pw_dir.parent / "playwright-core" / "browsers.json").read_text(encoding="utf-8"))
        rev = next(b["revision"] for b in data["browsers"] if b["name"] == "chromium")
    except Exception:
        return False
    cache = browsers_dir()
    return (cache / f"chromium-{rev}").is_dir() or (cache / f"chromium_headless_shell-{rev}").is_dir()


def find_playwright():
    cands = []
    if os.environ.get("PLAYWRIGHT_NODE_MODULES"):
        cands.append(Path(os.environ["PLAYWRIGHT_NODE_MODULES"]) / "playwright")
    cands.append(REPO / "tools/node_modules/playwright")
    for pat in ("E:/GITGUB/*/node_modules/playwright", "E:/CGPTCLONED/*/node_modules/playwright"):
        cands += [Path(p) for p in glob.glob(pat)]
    npx = Path(os.environ.get("LOCALAPPDATA", "")) / "npm-cache/_npx"
    found = sorted(npx.glob("*/node_modules/playwright"), key=lambda p: p.stat().st_mtime, reverse=True)
    cands += found
    for c in cands:
        if c.is_dir() and usable(c):
            return c.parent
    sys.exit("no usable Playwright for Node found; install it into tools/ (npm i -D playwright) and use a cached browser")


WORKER = r"""
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const cfg = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const browser = await chromium.launch({ headless: true });
  const results = [];
  for (const s of cfg.shots) {
    const ctx = await browser.newContext({ viewport: { width: s.width, height: s.height }, deviceScaleFactor: 1 });
    if (s.theme === 'light') await ctx.addInitScript(() => { try { localStorage.setItem('hh-theme', 'light'); } catch (e) {} });
    const page = await ctx.newPage();
    const errors = [], failed = [];
    page.on('pageerror', e => errors.push('pageerror: ' + String(e && e.message || e).slice(0, 300)));
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 300)); });
    page.on('requestfailed', r => failed.push(r.url()));
    const t0 = Date.now();
    let navMs = null, note = '';
    try {
      await page.goto(cfg.base + s.page, { waitUntil: 'networkidle', timeout: cfg.navTimeout });
      navMs = Date.now() - t0;
    } catch (e) { note = 'goto: ' + String(e.message).split('\n')[0]; navMs = Date.now() - t0; }
    await page.waitForTimeout(cfg.settle);
    let firstShotMs = null;
    try {
      await page.screenshot({ path: s.file, fullPage: s.full, timeout: cfg.navTimeout });
      firstShotMs = Date.now() - t0;
    } catch (e) { note += ' screenshot: ' + String(e.message).split('\n')[0]; }
    const info = await page.evaluate(() => {
      const h = document.querySelector('.site-header');
      const tb = getComputedStyle(document.documentElement).getPropertyValue('--topbar-h');
      const pb = document.querySelector('.progress-bar');
      return { headerH: h ? Math.round(h.getBoundingClientRect().height) : null, topbarH: tb.trim(),
               progress: pb ? pb.style.transform : null, scrollW: document.documentElement.scrollWidth,
               clientW: document.documentElement.clientWidth, theme: document.documentElement.getAttribute('data-theme') };
    }).catch(() => ({}));
    results.push({ page: s.page, width: s.width, theme: s.theme, full: s.full, file: s.file, navMs, firstShotMs, errors, failed, note, info });
    await ctx.close();
  }
  if (cfg.og) {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.route('**/__og.html', r => r.fulfill({ status: 200, contentType: 'text/html', body: cfg.og.html }));
    await page.goto(cfg.base + '__og.html', { waitUntil: 'networkidle', timeout: cfg.navTimeout });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    await page.screenshot({ path: cfg.og.file, timeout: cfg.navTimeout });
    await ctx.close();
  }
  if (cfg.thumb) {
    const ctx = await browser.newContext({ viewport: { width: cfg.thumb.width, height: cfg.thumb.height }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.goto(cfg.base + 'index.html', { waitUntil: 'networkidle', timeout: cfg.navTimeout });
    await page.waitForTimeout(cfg.settle);
    await page.screenshot({ path: cfg.thumb.file, timeout: cfg.navTimeout });
    await ctx.close();
  }
  await browser.close();
  console.log('RESULT' + JSON.stringify(results));
})().catch(e => { console.error('WORKER FAILED', e); process.exit(2); });
"""


def og_html():
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<link rel="stylesheet" href="assets/css/site.css">
<style>
html, body {{ margin: 0; width: 1200px; height: 630px; overflow: hidden; }}
body {{ display: flex; flex-direction: column; justify-content: center; padding: 0 84px; box-sizing: border-box; position: relative; }}
.eyebrow {{ font-size: 28px; margin: 0 0 22px; }}
h1 {{ font-size: 112px; line-height: 1.02; }}
.lead {{ font-size: 34px; max-width: 880px; margin-top: 28px; }}
.foot {{ position: absolute; left: 84px; bottom: 52px; font-family: var(--font-mono); font-size: 24px; color: var(--muted); }}
.bar {{ position: absolute; left: 0; top: 0; width: 100%; height: 8px; background: var(--accent); }}
</style></head><body><div class="bar"></div>
<p class="eyebrow">{OG_EYEBROW}</p><h1>{OG_TITLE}</h1><p class="lead">{OG_LEAD}</p><div class="foot">{OG_FOOT}</div>
</body></html>"""


def thumb_size():
    from PIL import Image
    with Image.open(THUMB) as im:
        return im.size


def main():
    nm = find_playwright()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    w, h = thumb_size()
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
    server = subprocess.Popen([sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1", "--directory", str(REPO)],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        time.sleep(1.0)
        shots = []
        for page, width, height, theme, full in SHOTS:
            name = f"{page[:-5]}-{width}-{theme}{'-full' if full else ''}.png"
            shots.append({"page": page, "width": width, "height": height, "theme": theme, "full": full,
                          "file": str(OUT_DIR / name)})
        cfg = {"base": f"http://127.0.0.1:{port}/", "navTimeout": NAV_TIMEOUT_MS, "settle": SETTLE_MS, "shots": shots,
               "og": {"html": og_html(), "file": str(OG)}, "thumb": {"width": w, "height": h, "file": str(THUMB)}}
        with tempfile.TemporaryDirectory() as td:
            (Path(td) / "cfg.json").write_text(json.dumps(cfg), encoding="utf-8")
            (Path(td) / "worker.js").write_text(WORKER, encoding="utf-8")
            env = dict(os.environ, NODE_PATH=str(nm))
            proc = subprocess.run(["node", str(Path(td) / "worker.js"), str(Path(td) / "cfg.json")], env=env,
                                  capture_output=True, text=True, encoding="utf-8", timeout=900)
        if proc.returncode != 0:
            print(proc.stdout[-2000:], proc.stderr[-2000:])
            sys.exit("worker failed")
        line = next(l for l in proc.stdout.splitlines() if l.startswith("RESULT"))
        results = json.loads(line[6:])
    finally:
        server.terminate()
    bad = 0
    print(f"playwright: {nm / 'playwright'}")
    for r in results:
        tag = f"{r['page']} {r['width']} {r['theme']}{' full' if r['full'] else ''}"
        print(f"{tag:34s} networkidle {r['navMs']} ms, first screenshot {r['firstShotMs']} ms, info {r['info']} -> {r['file']}")
        for e in r["errors"]:
            bad += 1
            print("   ERROR", e)
        for f in r["failed"]:
            print("   request failed:", f)
        if r["note"]:
            bad += 1
            print("   NOTE", r["note"])
    print("og image:", OG)
    print(f"thumbnail ({w}x{h}):", THUMB)
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
