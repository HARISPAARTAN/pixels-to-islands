"""Checks the nine course pages against the rules of the skin (spec 2026-10-25, section 9). Standard library only.

    python tools/check-explainer.py          # prints a page x rule table, exit 0 when every rule holds

The course build and the portfolio are read from their usual places (see RAW and HUB); a rule that needs one of them
fails with a message when it is not there.
"""
import re
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
RAW = Path("E:/CGPTCLONED/docs/research/explainer_v2_2026-10-13/web")
HUB = Path("E:/GITGUB/HARISPAARTAN.github.io")
PAGES = ["index.html", "p1-foundations.html", "p2-vit.html", "p3-dino.html", "p4-selfpatch.html", "p5-rule.html",
         "p6-reading.html", "p7-pipeline.html", "p8-ledger.html"]
TEXT_EXT = {".html", ".css", ".js", ".md", ".json", ".txt", ".svg", ".py", ".yml", ".yaml", ".gitignore"}
FORBIDDEN_WORDS = ("cla" + "ude", "anth" + "ropic")
ROLE_DARK = {"--student": "#43B18D", "--teacher": "#579FDB", "--positive": "#F17855", "--negative": "#B47DD4",
             "--ignored": "#6A7581", "--on-role": "#0B0F14"}
ROLE_LIGHT = {"--student": "#2A7F62", "--teacher": "#1F6FB2", "--positive": "#E4572E", "--negative": "#7A3E9D",
              "--ignored": "#9AA5B1", "--on-role": "#FFFFFF"}


def read(p):
    return Path(p).read_bytes().decode("utf-8")


def main_of(t):
    m = re.search(r"<main\b[^>]*>.*</main>", t, re.S)
    return m.group(0) if m else ""


def script_srcs(t):
    return re.findall(r'<script\b[^>]*\bsrc="(assets/[^"]+)"', t)


def labs_of(t):
    """The outer HTML of every <section class="lab" ...>, found by counting <section ...> and </section> tags."""
    out = []
    for m in re.finditer(r'<section class="lab"', t):
        depth = 0
        for tag in re.finditer(r"<(/?)section\b", t[m.start():]):
            depth += -1 if tag.group(1) else 1
            if depth == 0:
                out.append(t[m.start():m.start() + tag.end() + 1])
                break
    return out


def local_refs(text):
    refs = re.findall(r'(?:href|src)="([^"]+)"', text)
    refs += re.findall(r"url\(\s*['\"]?([^'\")]+)['\"]?\s*\)", text)
    return [r for r in refs if not re.match(r"(https?:|mailto:|#|data:|//)", r)]


def resolves(base_dir, ref):
    ref = ref.split("#")[0].split("?")[0]
    return not ref or (base_dir / ref).exists()


def page_rules(page):
    t = read(REPO / page)
    raw = read(RAW / page)
    raw_main, out_main = main_of(raw), main_of(t)
    res = {}
    res["doctype"] = t.lstrip().lower().startswith("<!doctype html>")
    res["header+footer"] = len(re.findall(r'class="site-header(?: [^"]*)?"', t)) == 1 and t.count('class="wrap site-footer"') == 1
    nav = re.search(r'<ul id="nav-links"[^>]*>(.*?)</ul>', t, re.S)
    anchors = re.findall(r"<a\b([^>]*)>", nav.group(1)) if nav else []
    cur = [a for a in anchors if 'aria-current="page"' in a]
    res["nav"] = (len(anchors) == 9 and len(cur) == 1 and f'href="{page}"' in cur[0]
                  and t.count('aria-current="page"') == 1)
    res["no old chrome"] = not any(s in t for s in ("topbar-parts", "pf-bar", "fonts.googleapis", "theme-portfolio.css"))
    res["links resolve"] = all(resolves(REPO, r) for r in local_refs(t))
    res["scripts"] = script_srcs(t) == script_srcs(raw) + ["assets/js/site.js"]
    ids_raw = set(re.findall(r'\bid="([^"]+)"', raw_main))
    ids_out = set(re.findall(r'\bid="([^"]+)"', out_main))
    res["ids"] = bool(ids_raw) and ids_raw <= ids_out
    res["counts"] = all(raw_main.count(k) == out_main.count(k) for k in ("<section", "<figure", 'class="lab'))
    lr, lo = labs_of(raw_main), labs_of(out_main)
    res["labs identical"] = bool(lr) == bool(lo) and lr == lo
    return res


def global_rules():
    res = {}
    msgs = {}
    for name, a, b in (("site.css = portfolio", REPO / "assets/css/site.css", HUB / "assets/css/site.css"),
                       ("site.js = portfolio", REPO / "assets/js/site.js", HUB / "assets/js/site.js")):
        # compared without carriage returns: git's autocrlf may give either checkout CRLF line endings
        res[name] = a.exists() and b.exists() and a.read_bytes().replace(b"\r", b"") == b.read_bytes().replace(b"\r", b"")
    bad = []
    for css in sorted((REPO / "assets").glob("*.css")) + [REPO / "assets/css/site.css"]:
        for r in local_refs(read(css)):
            if not resolves(css.parent, r):
                bad.append(f"{css.name}: {r}")
    res["css urls resolve"] = not bad
    msgs["css urls resolve"] = "; ".join(bad)
    bridge = read(REPO / "assets/bridge.css")
    site = read(HUB / "assets/css/site.css")
    ok = True
    why = []
    for theme, sel, roles in (("dark", r":root:not\(\[data-theme=\"light\"\]\),\s*:root\[data-theme=\"dark\"\]\s*\{(.*?)\}", ROLE_DARK),
                              ("light", r":root\[data-theme=\"light\"\]\s*\{(.*?)\}", ROLE_LIGHT)):
        m = re.search(sel, bridge, re.S)
        block = m.group(1) if m else ""
        for k, v in roles.items():
            if not re.search(re.escape(k) + r":\s*" + re.escape(v) + r"\b", block, re.I):
                ok = False
                why.append(f"{theme} {k}")
    res["role colours"] = ok
    msgs["role colours"] = ", ".join(why)
    # tokens that the course stylesheet redefines and the bridge restates must equal the portfolio's
    mirror = []
    for theme, bsel, ssel in (("dark", r":root:not\(\[data-theme=\"light\"\]\),\s*:root\[data-theme=\"dark\"\]\s*\{(.*?)\}", r"^:root\s*\{(.*?)\}"),
                              ("light", r":root\[data-theme=\"light\"\]\s*\{(.*?)\}", r"^\[data-theme=\"light\"\]\s*\{(.*?)\}")):
        bm = re.search(bsel, bridge, re.S)
        sm = re.search(ssel, site, re.S | re.M)
        for tok in ("--surface", "--muted"):
            bv = re.search(re.escape(tok) + r":\s*([^;]+);", bm.group(1)) if bm else None
            sv = re.search(re.escape(tok) + r":\s*([^;]+);", sm.group(1)) if sm else None
            if not (bv and sv and bv.group(1).strip().lower() == sv.group(1).strip().lower()):
                mirror.append(f"{theme} {tok}")
    res["tokens mirror site.css"] = not mirror
    msgs["tokens mirror site.css"] = ", ".join(mirror)
    # the words that must not be in any tracked text file
    files = subprocess.run(["git", "ls-files", "--cached", "--others", "--exclude-standard"], cwd=REPO, capture_output=True,
                           text=True, encoding="utf-8").stdout.split("\n")
    hits = []
    for f in files:
        p = REPO / f
        if f and p.is_file() and (p.suffix.lower() in TEXT_EXT or p.name in TEXT_EXT):
            low = p.read_bytes().decode("utf-8", "replace").lower()
            hits += [f"{f}: {w}" for w in FORBIDDEN_WORDS if w in low]
    res["no forbidden words"] = not hits
    msgs["no forbidden words"] = "; ".join(hits)
    return res, msgs


def main():
    failed = 0
    rows = {}
    for page in PAGES:
        try:
            rows[page] = page_rules(page)
        except Exception as e:  # a missing file is a failed rule, not a crash
            rows[page] = {"error": False}
            print(f"{page}: {e}")
    rules = list(next(r for r in rows.values() if len(r) > 1).keys())
    w = max(len(p) for p in PAGES)
    print("page".ljust(w), *[str(i + 1).rjust(2) for i in range(len(rules))])
    for page, r in rows.items():
        cells = []
        for k in rules:
            ok = r.get(k, False)
            failed += 0 if ok else 1
            cells.append(" OK" if ok else "XX")
        print(page.ljust(w), *cells)
    print("\nrules: " + "; ".join(f"{i + 1} {k}" for i, k in enumerate(rules)))
    g, msgs = global_rules()
    print()
    for k, ok in g.items():
        failed += 0 if ok else 1
        print(f"{'OK  ' if ok else 'FAIL'} {k}" + (f"  ({msgs[k]})" if not ok and msgs.get(k) else ""))
    print("\nresult:", "all rules pass" if not failed else f"{failed} failing")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
