/*
 * boot.js: page wiring for "Pixels to Islands" (all nine pages).
 *
 * Loaded last, after core.js, scenes.js, toy_vit.js and the page's own labs script. Ported from the first
 * explainer's boot.js. On DOMContentLoaded it:
 *   1. makes sure the content sits in the one .page wrapper,
 *   2. mounts every registered lab: a lab without data-needs through Labs.mountAll(Core); a lab with
 *      data-needs="a.json,b.json" once Core.bundle.load has fetched those files (when it comes near the screen),
 *      as mount(root, core, bundles). A lab that cannot start shows a visible message instead,
 *   3. wires the sticky top bar (the assembler writes its nine links) and the progress line of the page,
 *   4. turns every <dfn data-term> into a glossary popover and every .mark, .fact[data-source] and cite.src
 *      into a source popover,
 *   5. relays theme changes (the system setting, the host's data-theme attribute, and the web fonts arriving)
 *      as Core.emit('theme-changed'),
 *   6. runs the hook of the page, if it has one (the ledger filter of p8-ledger).
 * Before that, when the file runs, it installs Core.imageChooser(options) and Core.bundleImagePicker(options):
 * the shared "sample scene / your own image / a photograph of the course" control, and the picker of the eight
 * photographs of the real-data bundle. The same functions are on window.Boot.
 * Everything here stays in the page: nothing is saved and no dialog opens. The only fetches are the photographs
 * the reader picks, by relative URL under data/images/.
 */
(function () {
  'use strict';

  var doc = document;
  var docEl = doc.documentElement;
  var ELLIPSIS = '\u2026';
  var TIMES = '\u00D7';

  /* The eight photographs of the real-data bundle (spec section 9), by COCO file name without the extension. They
     are the only dataset images the course shows; a page loads one from data/images/<id>.jpg. */
  var DEFAULT_BUNDLE_IMAGE = '000000114269';
  var BUNDLE_IMAGES = [
    { id: '000000114269', label: 'A dog and a cat by a door' },
    { id: '000000255714', label: 'A bus' },
    { id: '000000106525', label: 'A man with a dog and a parrot' },
    { id: '000000205668', label: 'A sailboat' },
    { id: '000000372768', label: 'A person eating' },
    { id: '000000288848', label: 'A train' },
    { id: '000000455480', label: 'A boat at a dock' },
    { id: '000000151777', label: 'Children on a pitch' }
  ];

  /* The four marks and what each tells the reader (the popover of a mark shows this, then the source). */
  var MARK_KINDS = {
    fact: {
      word: 'Fact',
      what: 'Copied from a paper or from our own code, protocols or reports. The source is named below.'
    },
    real: {
      word: 'Real',
      what: 'Computed once from the real models on real images, and stored in this course\u2019s data files. The file and the member are named below.'
    },
    toy: {
      word: 'Toy',
      what: 'This page\u2019s own simplification, computed in your browser. It shows how an idea works. It is not the real model.'
    },
    reading: {
      word: 'Reading',
      what: 'What we ran and what it showed, quoted from the note named below. It claims nothing beyond those numbers.'
    }
  };

  /* ---- small helpers ------------------------------------------------ */

  var raf = typeof window.requestAnimationFrame === 'function'
    ? function (fn) { return window.requestAnimationFrame(fn); }
    : function (fn) { return window.setTimeout(fn, 16); };

  /* Run fn once, on the next animation frame or after a short timer,
     whichever comes first. Frames stop in hidden tabs and in some previews;
     a queued theme change must still reach the canvases. */
  function soon(fn) {
    var done = false;
    function run() {
      if (done) return;
      done = true;
      fn();
    }
    raf(run);
    window.setTimeout(run, 120);
  }

  function media(query) {
    try {
      return typeof window.matchMedia === 'function' ? window.matchMedia(query) : null;
    } catch (e) {
      return null;
    }
  }

  var reducedMotionQuery = media('(prefers-reduced-motion: reduce)');
  var darkQuery = media('(prefers-color-scheme: dark)');

  function prefersReducedMotion() {
    return !!(reducedMotionQuery && reducedMotionQuery.matches);
  }

  function onMediaChange(query, fn) {
    if (!query) return;
    if (typeof query.addEventListener === 'function') query.addEventListener('change', fn);
    else if (typeof query.addListener === 'function') query.addListener(fn);
  }

  function getCore() { return window.Core || null; }
  function toArray(list) { return Array.prototype.slice.call(list || []); }
  function isElement(node) { return !!node && node.nodeType === 1; }

  function report(what, err) {
    if (window.console && typeof console.error === 'function') console.error('[boot] ' + what, err);
  }

  function warn(message) {
    if (window.console && typeof console.warn === 'function') console.warn('[boot] ' + message);
  }

  function safely(what, fn) {
    try {
      return fn();
    } catch (err) {
      report(what + ' failed', err);
      return undefined;
    }
  }

  function closest(node, selector) {
    var el = isElement(node) ? node : (node && node.parentElement) || null;
    return el && typeof el.closest === 'function' ? el.closest(selector) : null;
  }

  function uniqueId(base) {
    var id = base;
    var n = 2;
    while (doc.getElementById(id)) {
      id = base + '-' + n;
      n += 1;
    }
    return id;
  }

  /* Build an element through Core.el when it exists, then make sure every
     attribute and child really is present, whatever Core.el does with them.
     attrs: plain string values; true means an empty attribute; null,
     undefined and false are skipped. children: nodes and strings. */
  function make(tag, attrs, children) {
    var clean = {};
    Object.keys(attrs || {}).forEach(function (name) {
      var value = attrs[name];
      if (value === null || value === undefined || value === false) return;
      clean[name] = value === true ? '' : String(value);
    });
    var core = getCore();
    var node = null;
    if (core && typeof core.el === 'function') {
      try { node = core.el(tag, clean, []); } catch (e) { node = null; }
    }
    if (!isElement(node) || node.tagName.toLowerCase() !== String(tag).toLowerCase()) {
      node = doc.createElement(tag);
    }
    Object.keys(clean).forEach(function (name) {
      if (node.getAttribute(name) !== clean[name]) node.setAttribute(name, clean[name]);
    });
    return append(node, children);
  }

  function append(node, children) {
    if (children === null || children === undefined) return node;
    (Array.isArray(children) ? children : [children]).forEach(function (child) {
      if (child === null || child === undefined || child === false) return;
      node.appendChild(child.nodeType ? child : doc.createTextNode(String(child)));
    });
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  /* One polite live region for the whole page, so a message is read once
     even when several labs show the same image chooser. */
  var liveRegion = null;

  function ensureLiveRegion() {
    if (liveRegion || !doc.body) return liveRegion;
    liveRegion = make('div', { 'class': 'visually-hidden', id: 'boot-announcer', role: 'status', 'aria-live': 'polite' });
    doc.body.appendChild(liveRegion);
    return liveRegion;
  }

  function announce(text) {
    if (!ensureLiveRegion()) return;
    var message = String(text || '');
    liveRegion.textContent = '';
    if (message) window.setTimeout(function () { liveRegion.textContent = message; }, 60);
  }

  /* ---- 1. the .page wrapper ------------------------------------------- */

  /* The stylesheet gives the 16 px gutter, the reading column and the lab
     breakout to one wrapper, .page. The assembler should write it; if it
     is missing, a <main> gets the class, or one is wrapped around the
     content (scripts, styles and a top bar stay where they are). */
  function ensurePageWrapper() {
    if (doc.querySelector('.page') || !doc.body) return;
    var main = doc.querySelector('main');
    if (main) {
      main.classList.add('page');
      warn('no .page wrapper was written; the <main> element was given the class');
      return;
    }
    var wrapper = doc.createElement('main');
    wrapper.className = 'page';
    var stay = /^(SCRIPT|STYLE|LINK|TITLE|META|TEMPLATE|NOSCRIPT)$/;
    toArray(doc.body.childNodes).forEach(function (node) {
      if (isElement(node) && (stay.test(node.tagName) || node.classList.contains('topbar'))) return;
      wrapper.appendChild(node);
    });
    var bar = doc.querySelector('body > .topbar');
    doc.body.insertBefore(wrapper, bar ? bar.nextSibling : doc.body.firstChild);
    warn('no .page wrapper was written; one was added around the content');
  }

  /* ---- 2. labs -------------------------------------------------------- */

  function labSection(target) {
    if (!isElement(target)) return null;
    if (target.classList.contains('lab')) return target;
    return closest(target, '.lab');
  }

  /* Replace a lab's body with a visible message. target: the lab section,
     its .lab-body, or any element inside it. Returns the message element. */
  function showLabError(target, error) {
    var section = labSection(target);
    var body = null;
    if (section) {
      body = section.querySelector('.lab-body');
      if (!body) {
        body = make('div', { 'class': 'lab-body' });
        section.appendChild(body);
      }
      var existing = body.querySelector('.lab-error');
      if (existing) return existing;
      clear(body);
      section.setAttribute('data-lab-state', 'failed');
    } else if (isElement(target)) {
      body = target;
    } else {
      return null;
    }
    var id = section ? section.getAttribute('data-lab') || '' : '';
    var detail = error && error.message
      ? (error.name || 'Error') + ': ' + error.message
      : String(error || 'unknown error');
    var box = make('div', { 'class': 'lab-error' }, [
      make('p', { 'class': 'lab-error-title' }, ['This lab could not start.']),
      make('p', null, ['The text around it still explains the idea, and the other labs are not affected. Reloading the page may help.']),
      make('details', null, [
        make('summary', null, ['Technical detail']),
        make('code', null, [(id ? id + ': ' : '') + detail])
      ])
    ]);
    body.appendChild(box);
    return box;
  }

  /* True when nothing was drawn for this lab: an empty .lab-body and no
     widget content added straight into the section either. */
  function labLooksEmpty(section) {
    var body = section.querySelector('.lab-body');
    if (body && (body.children.length > 0 || body.textContent.trim() !== '')) return false;
    return !toArray(section.children).some(function (child) {
      if (child === body || /^(HEADER|FOOTER)$/.test(child.tagName)) return false;
      var cls = ' ' + (child.getAttribute('class') || '') + ' ';
      return !/ (lab-head|lab-caption|lab-note|lab-foot) /.test(cls);
    });
  }

  /* Resolves once every lab has been tried, when core.js mounts them one
     per task (Labs.mountAll with stagger); null otherwise. */
  var labsDone = null;

  /* The element the address's #fragment names, if any: the labs before it
     mount at once, so the page above it does not grow after the scroll. */
  function hashTargetElement() {
    var hash = window.location && window.location.hash ? window.location.hash : '';
    if (!/^#[A-Za-z0-9._~-]+$/.test(hash)) return null;
    return doc.getElementById(hash.slice(1));
  }

  /* data-needs="followed.json, images.json": the data files a lab waits for. */
  function parseNeeds(value) {
    var seen = Object.create(null);
    var out = [];
    String(value || '').split(',').forEach(function (part) {
      var name = part.replace(/^\s+|\s+$/g, '');
      if (name && !seen[name]) {
        seen[name] = true;
        out.push(name);
      }
    });
    return out;
  }

  /* Core.bundle.load takes the name without the extension: it fetches data/<name>.json. */
  function bundleKey(file) {
    return String(file).replace(/\.json$/i, '');
  }

  /* The labs that wait for data, and those whose load has begun. */
  var needy = [];
  var needyStarted = [];

  /* Promise of {name: Bundle}: every file under its name without .json and under its file name too. */
  function loadBundles(files) {
    var core = getCore();
    if (!files.length) return Promise.resolve({});
    if (!core || !core.bundle || typeof core.bundle.load !== 'function') {
      return Promise.reject(new Error('the reader of the real-data bundle (Core.bundle.load) is not available'));
    }
    return Promise.all(files.map(function (file) {
      return Promise.resolve(core.bundle.load(bundleKey(file)));
    })).then(function (list) {
      var bundles = {};
      files.forEach(function (file, i) {
        bundles[bundleKey(file)] = list[i];
        bundles[file] = list[i];
      });
      return bundles;
    });
  }

  function registered(id) {
    var labs = window.Labs;
    return !!labs && (typeof labs.has !== 'function' || labs.has(id));
  }

  /* The line a lab shows when its real numbers did not load. */
  function showLoadError(section, files, err) {
    var body = section.querySelector('.lab-body');
    if (!body) {
      body = make('div', { 'class': 'lab-body' });
      section.appendChild(body);
    }
    clear(body);
    section.setAttribute('data-lab-state', 'failed');
    var detail = err && err.message ? (err.name || 'Error') + ': ' + err.message : String(err || 'unknown error');
    body.appendChild(make('div', { 'class': 'lab-error', role: 'alert' }, [
      make('p', { 'class': 'lab-error-title' }, ['The real numbers for this lab did not load.']),
      make('p', null, ['Files: ' + files.join(', ') + '. The text around the lab still explains the idea, and the other labs are not affected. Reloading the page may help.']),
      make('details', null, [
        make('summary', null, ['Technical detail']),
        make('code', null, [detail])
      ])
    ]));
  }

  /* Mount one lab once its bundles are here. The lab gets a view of Core that carries them as core.bundles, and
     they are also the third argument, mount(body, view, bundles): core.js hands the widget over through Labs.get(id)
     (tests/run_node_checks.js fails when a later core.js drops it). A registry without Labs.get, such as the first
     explainer's, only has mountAll, which calls mount(body, core) with two arguments: then the section's pending
     mark is cleared and mountAll mounts it with the view, so core.bundles is how a widget reads them there. */
  function mountWithBundles(section, id, bundles) {
    var core = getCore();
    var labs = window.Labs;
    var body = section.querySelector('.lab-body');
    var view = Object.create(core);
    view.bundles = bundles;
    if (typeof labs.get === 'function') {
      var mount = labs.get(id);
      if (typeof mount !== 'function') {
        showLabError(section, new Error('no widget is registered as "' + id + '"'));
        return;
      }
      try {
        var result = mount(body, view, bundles);
        section.setAttribute('data-lab-state', 'mounted');
        if (result && typeof result.then === 'function') {
          result.then(null, function (err) {
            report('lab ' + id + ' rejected', err);
            showLabError(section, err);
          });
        }
      } catch (err) {
        report('lab ' + id + ' threw', err);
        showLabError(section, err);
      }
    } else {
      section.removeAttribute('data-lab-state');
      try {
        labs.mountAll(view, {});
      } catch (err) {
        report('Labs.mountAll threw for ' + id, err);
        showLabError(section, err);
      }
    }
    safely('preparing glossary terms of the lab', prepareTerms);
    safely('preparing fact sources of the lab', prepareFacts);
    safely('preparing the marks of the lab', prepareMarks);
    queueLayout();
  }

  function mountNeedy(section) {
    var id = section.getAttribute('data-lab') || '';
    var files = parseNeeds(section.getAttribute('data-needs'));
    if (!registered(id)) {
      showLabError(section, new Error('no widget is registered as "' + id + '"'));
      return;
    }
    loadBundles(files).then(function (bundles) {
      mountWithBundles(section, id, bundles);
    }, function (err) {
      report('the real numbers for ' + id + ' did not load', err);
      showLoadError(section, files, err);
    });
  }

  function startNeedy(section) {
    if (needyStarted.indexOf(section) >= 0) return;
    needyStarted.push(section);
    safely('starting a lab that needs data', function () { mountNeedy(section); });
  }

  /* Whether section comes before target in the page (the labs above a deep link load at once, so the page above
     it does not grow after the browser has scrolled there). */
  function precedes(section, target) {
    try {
      return !!(target && (section.compareDocumentPosition(target) & 4) && !section.contains(target));
    } catch (e) {
      return false;
    }
  }

  /* Data is fetched when a lab is within about a screen of the viewport, not before. */
  function scheduleNeedy() {
    if (!needy.length) return;
    var target = hashTargetElement();
    var observer = null;
    needy.forEach(function (section) {
      if (precedes(section, target) || typeof window.IntersectionObserver !== 'function') {
        startNeedy(section);
        return;
      }
      if (!observer) {
        observer = new window.IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            observer.unobserve(entry.target);
            startNeedy(entry.target);
          });
        }, { rootMargin: '1200px 0px 1200px 0px' });
      }
      observer.observe(section);
    });
  }

  function mountLabs() {
    var sections = toArray(doc.querySelectorAll('.lab[data-lab]'));
    var core = getCore();
    var labs = window.Labs;
    if (!core || !labs || typeof labs.mountAll !== 'function') {
      var reason = !core
        ? 'The shared runtime (window.Core) did not load.'
        : 'The lab registry (window.Labs.mountAll) did not load.';
      sections.forEach(function (section) { showLabError(section, new Error(reason)); });
      return sections;
    }
    /* Lab bodies are empty in the static page, and the registry records
       each mount in data-lab-state. Either sign means something mounted the
       labs before boot.js; mounting again could draw a lab twice. (Other
       static elements an author puts in a lab section do not count.) */
    var alreadyMounted = sections.some(function (section) {
      var body = section.querySelector('.lab-body');
      return section.hasAttribute('data-lab-state') || !!(body && body.children.length > 0);
    });
    if (alreadyMounted) {
      warn('labs were already mounted before boot.js ran; Labs.mountAll was not called again');
      return sections;
    }
    /* A lab that waits for data is marked pending first: the registry's mountAll skips pending sections, and the
       sweep for empty labs leaves them alone. */
    needy = sections.filter(function (section) { return section.hasAttribute('data-needs'); });
    needy.forEach(function (section) { section.setAttribute('data-lab-state', 'pending'); });
    try {
      var mounted = labs.mountAll(core, { stagger: true, before: hashTargetElement() });
      labsDone = mounted && mounted.done && typeof mounted.done.then === 'function' ? mounted.done : null;
    } catch (err) {
      report('Labs.mountAll threw', err);
      var stopped = new Error('Labs.mountAll stopped before this lab drew anything (' +
        (err && err.message ? err.message : String(err)) + ')');
      sections.forEach(function (section) {
        if (!section.hasAttribute('data-needs') && labLooksEmpty(section)) showLabError(section, stopped);
      });
    }
    safely('scheduling the labs that wait for data', scheduleNeedy);
    return sections;
  }

  /* After the page has loaded, any lab that still drew nothing gets the
     same visible message, so a silent failure never looks like a blank. */
  function sweepEmptyLabs(sections) {
    sections.forEach(function (section) {
      var state = section.getAttribute('data-lab-state');
      /* a lab that waits for its data, or for its turn, is not a blank */
      if (state === 'failed' || state === 'pending' || !labLooksEmpty(section)) return;
      var id = section.getAttribute('data-lab') || '(no id)';
      showLabError(section, new Error('Nothing was drawn for "' + id + '". Check that the page\u2019s labs script registers this id with Labs.register.'));
    });
  }

  /* ---- 3. top bar and progress line ------------------------------------ */

  /* The assembler writes the top bar: nine links, one per page, and a progress line. This only measures the bar
     (scroll-padding-top needs its height) and moves the progress line as the page scrolls. */
  var topbar = null;
  var progressBar = null;

  function setupTopbar() {
    topbar = doc.querySelector('.topbar');
    if (!topbar) {
      warn('this page has no .topbar; the assembler writes one');
      return;
    }
    progressBar = topbar.querySelector('.progress-bar');
    if (!progressBar) {
      progressBar = make('span', { 'class': 'progress-bar' });
      topbar.appendChild(make('div', { 'class': 'progress', 'aria-hidden': 'true' }, [progressBar]));
    }
    measureTopbar();
  }

  /* The sticky bar's real height feeds scroll-padding-top, so a jump never
     hides a heading under the bar. */
  function measureTopbar() {
    if (!topbar) return;
    var height = topbar.getBoundingClientRect().height;
    if (height > 0) docEl.style.setProperty('--topbar-h', Math.round(height) + 'px');
  }

  function focusAfterJump(target) {
    var spot = target.matches('h1, h2, h3, h4, dt')
      ? target
      : target.querySelector('h1, h2, h3, h4') || target;
    if (!spot.hasAttribute('tabindex') && !/^(A|BUTTON|INPUT|SELECT|TEXTAREA|SUMMARY)$/.test(spot.tagName)) {
      spot.setAttribute('tabindex', '-1');
      spot.setAttribute('data-boot-focus', '');
    }
    try { spot.focus({ preventScroll: true }); } catch (e) { /* focus is a convenience here */ }
  }

  /* Scroll to an element (smoothly unless the reader asked for reduced
     motion) and move keyboard focus to its heading. */
  /* A closed <details> that holds the target opens, so a jump never lands on hidden text. */
  function openAncestors(target) {
    var node = target.parentElement;
    while (node) {
      if (node.tagName === 'DETAILS' && !node.open) node.open = true;
      node = node.parentElement;
    }
  }

  function goTo(target) {
    if (!isElement(target)) return;
    openAncestors(target);
    var behavior = prefersReducedMotion() ? 'auto' : 'smooth';
    try {
      target.scrollIntoView({ behavior: behavior, block: 'start' });
    } catch (e) {
      target.scrollIntoView(true);
    }
    focusAfterJump(target);
    queueProgress(); /* an instant jump may not deliver a scroll event */
  }

  function goToTop() {
    var behavior = prefersReducedMotion() ? 'auto' : 'smooth';
    try {
      window.scrollTo({ top: 0, left: 0, behavior: behavior });
    } catch (e) {
      window.scrollTo(0, 0);
    }
    var title = doc.querySelector('.page-title') || doc.querySelector('.page h1');
    if (title) focusAfterJump(title);
    queueProgress();
  }

  var progressQueued = false;

  function queueProgress() {
    if (progressQueued) return;
    progressQueued = true;
    soon(updateProgress);
  }

  function updateProgress() {
    progressQueued = false;
    var viewport = window.innerHeight || docEl.clientHeight || 0;
    var scrollTop = window.pageYOffset || docEl.scrollTop || 0;
    var room = Math.max(0, docEl.scrollHeight - viewport);
    var fraction = room > 0 ? Math.min(1, Math.max(0, scrollTop / room)) : 1;
    if (progressBar) progressBar.style.transform = 'scaleX(' + fraction.toFixed(4) + ')';

  }

  /* A box that really scrolls sideways joins the tab order, so keyboard
     readers can scroll it too. */
  function refreshScrollables() {
    toArray(doc.querySelectorAll('.scroll-x, .lab-stage, .eq, pre, .walk-formula, .scene-stage')).forEach(function (box) {
      var scrolls = box.scrollWidth > box.clientWidth + 1;
      if (scrolls && !box.hasAttribute('tabindex')) {
        box.setAttribute('tabindex', '0');
        box.setAttribute('data-boot-scroll', '');
      } else if (!scrolls && box.hasAttribute('data-boot-scroll')) {
        box.removeAttribute('tabindex');
        box.removeAttribute('data-boot-scroll');
      }
    });
  }

  var layoutQueued = false;

  function queueLayout() {
    if (layoutQueued) return;
    layoutQueued = true;
    soon(function () {
      layoutQueued = false;
      safely('measuring the top bar', measureTopbar);
      safely('checking scroll boxes', refreshScrollables);
      safely('placing the popover', placePopover);
      safely('updating the progress line', updateProgress);
    });
  }

  /* ---- 5. theme changes ------------------------------------------------ */

  /* One 'theme-changed' per frame, whatever triggered it. Payload:
     { source: 'system' | 'data-theme' | 'fonts', theme: Core.theme() }. */
  var themeQueued = false;
  var themeSource = 'system';

  function relayTheme(source) {
    themeSource = source || 'system';
    if (themeQueued) return;
    themeQueued = true;
    soon(function () {
      themeQueued = false;
      var core = getCore();
      if (!core || typeof core.emit !== 'function') return;
      var palette = null;
      try {
        palette = typeof core.theme === 'function' ? core.theme() : null;
      } catch (e) {
        palette = null;
      }
      try {
        core.emit('theme-changed', { source: themeSource, theme: palette });
      } catch (err) {
        report('a theme-changed listener threw', err);
      }
    });
  }

  /* A change of device pixel ratio (browser zoom, moving to another
     screen) relays 'theme-changed' with source 'resolution', so every
     canvas redraws at the new resolution; the query is re-armed each time. */
  function watchResolution() {
    if (typeof window.matchMedia !== 'function') return;
    var query = null;
    try {
      query = window.matchMedia('(resolution: ' + (window.devicePixelRatio || 1) + 'dppx)');
    } catch (e) {
      return;
    }
    if (!query) return;
    var fired = false;
    function onChange() {
      if (fired) return;
      fired = true;
      if (typeof query.removeEventListener === 'function') query.removeEventListener('change', onChange);
      else if (typeof query.removeListener === 'function') query.removeListener(onChange);
      relayTheme('resolution');
      watchResolution();
    }
    onMediaChange(query, onChange);
  }

  function watchTheme() {
    onMediaChange(darkQuery, function () { relayTheme('system'); });
    watchResolution();
    if (typeof window.MutationObserver === 'function') {
      var lastTheme = docEl.getAttribute('data-theme');
      new window.MutationObserver(function (records) {
        for (var i = 0; i < records.length; i += 1) {
          if (records[i].attributeName === 'data-theme') {
            /* Only a real change redraws the labs: the host may write the same value again. */
            var theme = docEl.getAttribute('data-theme');
            if (theme === lastTheme) return;
            lastTheme = theme;
            relayTheme('data-theme');
            return;
          }
        }
      }).observe(docEl, { attributes: true, attributeFilter: ['data-theme'] });
    }
    /* Canvases that drew text before the web fonts arrived redraw once
       the fonts are here. */
    var fonts = doc.fonts;
    if (fonts) {
      if (fonts.ready && typeof fonts.ready.then === 'function') {
        fonts.ready.then(function () { relayTheme('fonts'); }, function () {});
      }
      if (typeof fonts.addEventListener === 'function') {
        fonts.addEventListener('loadingdone', function () { relayTheme('fonts'); });
      }
    }
  }

  /* ---- 4. glossary terms and fact sources ------------------------------ */

  /* The glossary is <dl id="glossary"> with <dt>term</dt><dd>gloss</dd>
     pairs (a dt may carry data-term="key"), or a list whose items carry
     data-term. A <dfn data-term="key"> anywhere else opens that entry.
     Keys match without case, and a simple plural finds its singular. */
  var glossaryIndex = null;
  var popover = null;
  var popoverAnchor = null;

  function normTerm(text) {
    return String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function slug(text) {
    return normTerm(text).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'term';
  }

  function inGlossary(node) { return !!closest(node, '#glossary'); }

  function buildGlossaryIndex() {
    var index = Object.create(null);
    var list = doc.getElementById('glossary');
    if (!list) return index;
    toArray(list.querySelectorAll('dt')).forEach(function (dt) {
      var inner = dt.querySelector('[data-term]');
      var key = normTerm(dt.getAttribute('data-term') || (inner && inner.getAttribute('data-term')) || dt.textContent);
      if (!key || index[key]) return;
      var nodes = [];
      var next = dt.nextElementSibling;
      while (next && next.tagName === 'DD') {
        nodes.push(next);
        next = next.nextElementSibling;
      }
      if (!dt.id) dt.id = uniqueId('gloss-' + slug(key));
      index[key] = { term: dt.textContent.replace(/\s+/g, ' ').trim(), anchor: dt, nodes: nodes };
    });
    toArray(list.querySelectorAll('[data-term]')).forEach(function (item) {
      if (/^(DT|DD|DFN)$/.test(item.tagName) || closest(item, 'dt, dd')) return;
      var key = normTerm(item.getAttribute('data-term'));
      if (!key || index[key]) return;
      if (!item.id) item.id = uniqueId('gloss-' + slug(key));
      var label = item.querySelector('b, strong, dfn');
      index[key] = {
        term: label ? label.textContent.trim() : item.getAttribute('data-term'),
        anchor: item,
        nodes: [item]
      };
    });
    return index;
  }

  function lookup(raw) {
    if (!glossaryIndex) glossaryIndex = buildGlossaryIndex();
    var key = normTerm(raw);
    if (!key) return null;
    var tries = [key];
    if (/ies$/.test(key)) tries.push(key.slice(0, -3) + 'y');
    if (/es$/.test(key)) tries.push(key.slice(0, -2));
    if (/s$/.test(key)) tries.push(key.slice(0, -1));
    tries.push(key + 's');
    for (var i = 0; i < tries.length; i += 1) {
      if (glossaryIndex[tries[i]]) return glossaryIndex[tries[i]];
    }
    return null;
  }

  function termKey(dfn) {
    return dfn.getAttribute('data-term') || dfn.textContent || '';
  }

  /* Every term becomes a keyboard-reachable button; a term without an
     entry gets a wavy underline and a console warning for the reviewers. */
  function prepareTerms() {
    var missing = [];
    toArray(doc.querySelectorAll('dfn[data-term]')).forEach(function (term) {
      if (inGlossary(term)) return;
      if (!term.hasAttribute('tabindex')) term.setAttribute('tabindex', '0');
      if (!term.hasAttribute('role')) term.setAttribute('role', 'button');
      term.setAttribute('aria-haspopup', 'dialog');
      term.setAttribute('aria-expanded', 'false');
      term.setAttribute('aria-controls', 'gloss-pop');
      if (!lookup(termKey(term))) {
        term.classList.add('gloss-missing');
        missing.push(normTerm(termKey(term)));
      }
    });
    if (missing.length) warn('glossary entries are missing for: ' + missing.join(', '));
  }

  /* cite.src element -> the .fact[data-source] elements of its statement;
     facts already listed under a source tag. */
  var citeFacts = typeof WeakMap === 'function' ? new WeakMap() : null;
  var coveredFacts = typeof WeakSet === 'function' ? new WeakSet() : null;
  var STATEMENT = 'li, p, figcaption, dd, dt, caption, blockquote, td, th, h3, h4, h5, summary';

  function prepareFacts() {
    var facts = toArray(doc.querySelectorAll('.fact[data-source]'));
    facts.forEach(function (fact) {
      if (!fact.hasAttribute('title')) fact.setAttribute('title', 'Source: ' + fact.getAttribute('data-source'));
    });
    if (!citeFacts || !coveredFacts) return;
    /* A source tag lists the facts before it in its statement (its table
       row, paragraph, list item or caption) that no earlier tag listed. */
    toArray(doc.querySelectorAll('cite.src')).forEach(function (cite) {
      if (citeFacts.has(cite) || inGlossary(cite) || (popover && popover.contains(cite))) return;
      var box = closest(cite, 'tr') || closest(cite, STATEMENT);
      if (!box) return;
      var list = toArray(box.querySelectorAll('.fact[data-source]')).filter(function (fact) {
        return !coveredFacts.has(fact) && (fact.compareDocumentPosition(cite) & 4) !== 0;
      });
      if (!list.length) return;
      list.forEach(function (fact) { coveredFacts.add(fact); });
      citeFacts.set(cite, list);
      cite.setAttribute('tabindex', '0');
      cite.setAttribute('role', 'button');
      cite.setAttribute('aria-haspopup', 'dialog');
      cite.setAttribute('aria-expanded', 'false');
      cite.setAttribute('aria-controls', 'gloss-pop');
      cite.setAttribute('aria-label', 'Sources of this statement: ' + (cite.textContent || '').replace(/\s+/g, ' ').trim());
    });
    facts.forEach(function (fact) {
      if (coveredFacts.has(fact) || inGlossary(fact) || fact.hasAttribute('tabindex') || (popover && popover.contains(fact))) return;
      if (closest(fact, 'svg')) return;
      fact.setAttribute('tabindex', '0');
      fact.setAttribute('role', 'button');
      fact.setAttribute('aria-haspopup', 'dialog');
      fact.setAttribute('aria-expanded', 'false');
      fact.setAttribute('aria-controls', 'gloss-pop');
    });
  }

  /* ---- 4b. the marks ---------------------------------------------------- */

  /* A mark is <span class="mark mark-fact|mark-real|mark-toy|mark-reading" data-source="..." or
     data-bundle="file.json#member">Fact|Real|Toy|Reading</span>. Each becomes a keyboard button whose popover says
     what the kind means and names the source. */
  function markKind(mark) {
    var kinds = Object.keys(MARK_KINDS);
    for (var i = 0; i < kinds.length; i += 1) {
      if (mark.classList.contains('mark-' + kinds[i])) return kinds[i];
    }
    return '';
  }

  function markWhere(mark) {
    var bundle = mark.getAttribute('data-bundle') || '';
    var source = mark.getAttribute('data-source') || '';
    if (bundle) return 'data ' + bundle;
    return source;
  }

  function prepareMarks() {
    toArray(doc.querySelectorAll('.mark')).forEach(function (mark) {
      if (popover && popover.contains(mark)) return;
      var kind = markKind(mark);
      if (!kind) return;
      var where = markWhere(mark);
      var label = MARK_KINDS[kind].word + (where ? ' (' + where + ')' : '');
      mark.setAttribute('title', label);
      mark.setAttribute('aria-label', label);
      if (!mark.hasAttribute('tabindex')) mark.setAttribute('tabindex', '0');
      mark.setAttribute('role', 'button');
      mark.setAttribute('aria-haspopup', 'dialog');
      mark.setAttribute('aria-expanded', 'false');
      mark.setAttribute('aria-controls', 'gloss-pop');
    });
  }

  /* The place the popover's last line sends the reader: section 0.2 of the start page. */
  function marksHelpHref() {
    var page = doc.querySelector('.page');
    var id = page ? page.getAttribute('data-page') : '';
    return id === 'index' ? '#s0-2' : 'index.html#s0-2';
  }

  function openMark(mark, moveFocus) {
    if (!ensurePopover()) return;
    var kind = markKind(mark);
    var info = MARK_KINDS[kind];
    if (!info) return;
    var body = [make('p', null, [info.what])];
    var source = mark.getAttribute('data-source') || '';
    var bundle = mark.getAttribute('data-bundle') || '';
    if (source) body.push(make('p', null, [make('strong', null, [kind === 'reading' ? 'Note: ' : 'Source: ']), source]));
    if (bundle) {
      var parts = bundle.split('#');
      var line = [make('strong', null, ['Data: ']), make('code', null, [parts[0]])];
      if (parts[1]) line.push(' member ', make('code', null, [parts[1]]));
      body.push(make('p', null, line));
    }
    var help = make('a', { href: marksHelpHref(), 'class': 'gloss-pop-link' }, ['How to read the marks']);
    help.addEventListener('click', function () { closePopover(false); });
    fillPopover('Mark', info.word, body, [help]);
    showPopover(mark, !!moveFocus);
  }

  function isCiteButton(node) {
    return isElement(node) && !!citeFacts && citeFacts.has(node);
  }

  function ensurePopover() {
    if (popover || !doc.body) return popover;
    popover = make('div', {
      'class': 'gloss-pop',
      id: 'gloss-pop',
      role: 'dialog',
      'aria-modal': 'false',
      'aria-labelledby': 'gloss-pop-term',
      'aria-describedby': 'gloss-pop-body',
      hidden: true
    });
    popover.addEventListener('keydown', onPopoverKeydown);
    doc.body.appendChild(popover);
    return popover;
  }

  function fillPopover(kind, heading, bodyNodes, footNodes) {
    clear(popover);
    var close = make('button', { type: 'button', 'class': 'gloss-pop-close', 'aria-label': 'Close' }, [TIMES]);
    close.addEventListener('click', function () { closePopover(true); });
    popover.appendChild(close);
    popover.appendChild(make('p', { 'class': 'gloss-pop-kind' }, [kind]));
    popover.appendChild(make('p', { 'class': 'gloss-pop-term', id: 'gloss-pop-term' }, [heading]));
    popover.appendChild(make('div', { 'class': 'gloss-pop-body', id: 'gloss-pop-body' }, bodyNodes));
    if (footNodes && footNodes.length) popover.appendChild(make('p', { 'class': 'gloss-pop-foot' }, footNodes));
  }

  /* A copy of the definition without ids, so nothing is duplicated. */
  function copyDefinition(entry) {
    return entry.nodes.map(function (node) {
      var copy = node.cloneNode(true);
      if (isElement(copy)) {
        copy.removeAttribute('id');
        toArray(copy.querySelectorAll('[id]')).forEach(function (n) { n.removeAttribute('id'); });
      }
      var holder = make('div', { 'class': 'gloss-pop-def' });
      while (copy.firstChild) holder.appendChild(copy.firstChild);
      return holder;
    });
  }

  /* term: the dfn whose entry is shown; anchor: where the popover sits
     (the same dfn, or the original term when a term inside the popover
     is followed). */
  function openTerm(term, moveFocus, anchor) {
    if (!ensurePopover()) return;
    var raw = termKey(term);
    var entry = lookup(raw);
    if (entry) {
      var link = make('a', { href: '#' + entry.anchor.id, 'class': 'gloss-pop-link' }, ['See it in the glossary']);
      link.addEventListener('click', function (ev) {
        ev.preventDefault();
        closePopover(false);
        goTo(entry.anchor);
      });
      fillPopover('Glossary', entry.term || raw.trim(), copyDefinition(entry), [link]);
    } else {
      fillPopover('Glossary', raw.trim(), [make('p', null, ['This term has no glossary entry yet.'])], null);
    }
    showPopover(anchor || term, moveFocus);
  }

  function openFact(fact, moveFocus) {
    if (!ensurePopover()) return;
    var source = fact.getAttribute('data-source') || '';
    var factId = fact.getAttribute('data-fact') || '';
    var heading = (fact.textContent || '').replace(/\s+/g, ' ').trim();
    if (heading.length > 90) heading = heading.slice(0, 88) + ELLIPSIS;
    var foot = factId ? ['Fact sheet entry ', make('code', null, [factId])] : null;
    fillPopover('Source', heading || 'Fact', [make('p', null, [source])], foot);
    showPopover(fact, !!moveFocus);
  }

  /* The sources of every fact a source tag closes: one item per fact-sheet
     entry, with the numbers the statement shows from it. */
  function openCite(cite, moveFocus) {
    if (!ensurePopover()) return;
    var groups = [];
    var byKey = Object.create(null);
    (citeFacts.get(cite) || []).forEach(function (fact) {
      var id = fact.getAttribute('data-fact') || '';
      var source = fact.getAttribute('data-source') || '';
      var key = id + '\n' + source;
      var shown = (fact.textContent || '').replace(/\s+/g, ' ').trim();
      if (!byKey[key]) {
        byKey[key] = { id: id, source: source, shown: [] };
        groups.push(byKey[key]);
      }
      if (shown && byKey[key].shown.indexOf(shown) < 0) byKey[key].shown.push(shown);
    });
    var items = groups.map(function (g) {
      var head = g.shown.join(', ');
      if (head.length > 90) head = head.slice(0, 88) + ELLIPSIS;
      var kids = [make('strong', null, [head || 'Fact']), ': ' + g.source];
      if (g.id) kids.push(' ', make('code', null, [g.id]));
      return make('li', null, kids);
    });
    var tag = (cite.textContent || '').replace(/\s+/g, ' ').trim();
    fillPopover('Sources', tag || 'Sources', [make('ul', { 'class': 'gloss-pop-list' }, items)],
      ['Every source is a file and line in the thesis repository, or a place in a paper.']);
    showPopover(cite, !!moveFocus);
  }

  function setOpen(anchor, open) {
    if (!isElement(anchor)) return;
    if (anchor.matches('dfn[data-term]') || anchor.getAttribute('aria-haspopup') === 'dialog') anchor.setAttribute('aria-expanded', open ? 'true' : 'false');
    anchor.classList.toggle('is-open', open);
  }

  function showPopover(anchor, moveFocus) {
    if (popoverAnchor && popoverAnchor !== anchor) setOpen(popoverAnchor, false);
    popoverAnchor = anchor;
    setOpen(anchor, true);
    popover.hidden = false;
    placePopover();
    if (moveFocus) {
      var first = popover.querySelector('.gloss-pop-close');
      if (first) {
        try { first.focus({ preventScroll: true }); } catch (e) { first.focus(); }
      }
    }
  }

  function closePopover(returnFocus) {
    if (!popover || popover.hidden) return;
    popover.hidden = true;
    var anchor = popoverAnchor;
    popoverAnchor = null;
    setOpen(anchor, false);
    if (returnFocus && isElement(anchor) && anchor.hasAttribute('tabindex')) {
      try { anchor.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }
  }

  /* Below the anchor when it fits, above it otherwise; always 16 px clear
     of the page edges. Page coordinates, so it scrolls with the text. */
  function placePopover() {
    if (!popover || popover.hidden || !popoverAnchor) return;
    var rects = popoverAnchor.isConnected ? popoverAnchor.getClientRects() : [];
    if (!rects.length) {
      closePopover(false);
      return;
    }
    var anchor = rects[0];
    var gutter = 16;
    var viewWidth = docEl.clientWidth || window.innerWidth;
    var viewHeight = window.innerHeight || docEl.clientHeight;
    popover.style.left = '0px';
    popover.style.top = '0px';
    var width = popover.offsetWidth;
    var height = popover.offsetHeight;
    var barBottom = topbar ? Math.max(0, topbar.getBoundingClientRect().bottom) : 0;
    var left = Math.max(gutter, Math.min(anchor.left, viewWidth - gutter - width));
    var top = anchor.bottom + 8;
    if (top + height > viewHeight - 8 && anchor.top - 8 - height >= barBottom + 8) {
      top = anchor.top - 8 - height;
    }
    popover.style.left = Math.round(left + (window.pageXOffset || 0)) + 'px';
    popover.style.top = Math.round(top + (window.pageYOffset || 0)) + 'px';
  }

  function toggleFor(trigger, moveFocus) {
    if (popover && !popover.hidden && popoverAnchor === trigger) {
      closePopover(moveFocus);
      return;
    }
    if (trigger.matches('dfn[data-term]')) openTerm(trigger, moveFocus);
    else if (isCiteButton(trigger)) openCite(trigger, moveFocus);
    else if (trigger.matches('.mark')) openMark(trigger, moveFocus);
    else openFact(trigger, moveFocus);
  }

  /* Tab past either end of the popover closes it and returns to the term. */
  function onPopoverKeydown(ev) {
    if (ev.key !== 'Tab') return;
    var stops = toArray(popover.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'));
    if (!stops.length) return;
    var first = stops[0];
    var last = stops[stops.length - 1];
    if ((ev.shiftKey && doc.activeElement === first) || (!ev.shiftKey && doc.activeElement === last)) {
      ev.preventDefault();
      closePopover(true);
    }
  }

  function onKeydown(ev) {
    if (ev.key === 'Escape' || ev.key === 'Esc') {
      if (popover && !popover.hidden) {
        ev.preventDefault();
        closePopover(true);
      }
      return;
    }
    if (ev.key !== 'Enter' && ev.key !== ' ' && ev.key !== 'Spacebar') return;
    var target = isElement(ev.target) ? ev.target : null;
    if (target && (isCiteButton(target) || (target.matches('.fact[data-source], .mark') && target.getAttribute('role') === 'button'))) {
      ev.preventDefault();
      toggleFor(target, true);
      return;
    }
    var term = target && target.matches('dfn[data-term]') ? target : null;
    if (!term || inGlossary(term)) return;
    ev.preventDefault();
    if (popover && popover.contains(term)) openTerm(term, true, popoverAnchor);
    else toggleFor(term, true);
  }

  var INTERACTIVE = 'a, button, input, select, textarea, label, summary';

  function selectionIsEmpty() {
    try {
      var selection = window.getSelection ? window.getSelection() : null;
      return !selection || selection.isCollapsed;
    } catch (e) {
      return true;
    }
  }

  function onClick(ev) {
    var target = ev.target;
    if (popover && !popover.hidden && popover.contains(target)) {
      var inner = closest(target, 'dfn[data-term]');
      if (inner) openTerm(inner, false, popoverAnchor);
      return;
    }
    var term = closest(target, 'dfn[data-term]');
    if (term && !inGlossary(term)) {
      /* A term inside a <label> (Lab M's stochastic-depth toggle): the click opens
         the definition and must not also switch the label's control. */
      if (closest(term, 'label')) ev.preventDefault();
      toggleFor(term, false);
      return;
    }
    var cite = closest(target, 'cite.src');
    if (isCiteButton(cite) && ev.detail < 2 && selectionIsEmpty()) {
      toggleFor(cite, false);
      return;
    }
    var mark = closest(target, '.mark[role="button"]');
    if (mark && ev.detail < 2 && selectionIsEmpty()) {
      /* a mark inside a <label>: the click opens the source and must not also switch the label's control */
      if (closest(mark, 'label')) ev.preventDefault();
      toggleFor(mark, false);
      return;
    }
    var fact = closest(target, '.fact[data-source]');
    if (fact && !closest(target, INTERACTIVE) && ev.detail < 2 && selectionIsEmpty()) {
      toggleFor(fact, false);
      return;
    }
    if (popover && !popover.hidden) closePopover(false);
  }

  /* Links to places on this page scroll there (smoothly unless reduced
     motion is asked for) and move focus, inside the sandboxed frame too. */
  function onInternalLink(ev) {
    if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    var link = closest(ev.target, 'a[href^="#"]');
    if (!link) return;
    var id = link.getAttribute('href').slice(1);
    if (!id) return;
    var target = doc.getElementById(id);
    if (!target && id === 'top') {
      ev.preventDefault();
      goToTop();
      return;
    }
    if (!target) return;
    ev.preventDefault();
    goTo(target);
  }

  function restoreHashTarget() {
    var hash = window.location && window.location.hash ? window.location.hash : '';
    if (!/^#[A-Za-z0-9._~-]+$/.test(hash)) return;
    var target = doc.getElementById(hash.slice(1));
    if (!target) return;
    soon(function () {
      try { target.scrollIntoView({ block: 'start' }); } catch (e) { /* ignore */ }
    });
  }

  /* ---- the image chooser ------------------------------------------------ */

  /* One shared state: every chooser on the page shows the same picture, because every lab reads the same
     Core.currentImage(). The picture is the sample scene, the reader's own file, or one of the eight photographs of
     the real-data bundle. The id of the last bundle photograph chosen (the followed image until then) is what the
     labs that run on real numbers read, from Boot.bundleImage(). */
  var chooser = {
    source: 'sample',   /* 'sample' | 'upload' | 'bundle' */
    uploadName: '',
    sampleName: null,   /* Core.currentImage().name at load */
    bundleId: DEFAULT_BUNDLE_IMAGE,
    pending: false,
    message: '',
    isError: false,
    views: [],
    count: 0,
    listening: false
  };

  /* { name, source } of the shared picture; source is 'sample' or 'upload'
     when core.js reports it, else ''. */
  function currentImageInfo() {
    var core = getCore();
    try {
      var info = core && typeof core.currentImage === 'function' ? core.currentImage() : null;
      return {
        name: info && info.name ? String(info.name) : '',
        source: info && info.source ? String(info.source) : ''
      };
    } catch (e) {
      return { name: '', source: '' };
    }
  }

  function isSampleInfo(info) {
    if (info.source) return info.source === 'sample';
    if (chooser.sampleName) return info.name === chooser.sampleName;
    return true;
  }

  function renderChoosers() {
    chooser.views.forEach(function (view) { safely('drawing an image chooser', view); });
  }

  function setChooserMessage(text, isError) {
    chooser.message = text || '';
    chooser.isError = !!isError;
    renderChoosers();
    if (text) announce(text);
  }

  function bundleEntry(id) {
    for (var i = 0; i < BUNDLE_IMAGES.length; i += 1) {
      if (BUNDLE_IMAGES[i].id === id) return BUNDLE_IMAGES[i];
    }
    return null;
  }

  function describeImage() {
    if (chooser.source === 'sample') return 'Showing the sample scene, drawn by this page.';
    if (chooser.source === 'bundle') {
      var entry = bundleEntry(chooser.bundleId);
      return 'Showing the course photograph \u201C' + (entry ? entry.label : chooser.bundleId) +
        '\u201D, cropped to a centre square.';
    }
    return 'Showing your image' + (chooser.uploadName ? ' (' + chooser.uploadName + ')' : '') +
      ', cropped to a centre square.';
  }

  function uploadFile(file) {
    var core = getCore();
    if (!file) return;
    if (file.type && !/^image\//i.test(file.type)) {
      setChooserMessage('That file is not a picture. Choose a JPEG, PNG, GIF or WebP file.', true);
      return;
    }
    if (!core || typeof core.setUploadedImage !== 'function') {
      setChooserMessage('Pictures cannot be opened here because the page runtime did not load.', true);
      return;
    }
    chooser.pending = true;
    setChooserMessage('Reading your image' + ELLIPSIS, false);
    var result;
    try {
      result = core.setUploadedImage(file);
    } catch (err) {
      finishUpload(err, file);
      return;
    }
    Promise.resolve(result).then(
      function () { finishUpload(null, file); },
      function (err) { finishUpload(err || new Error('the picture could not be read'), file); }
    );
  }

  function finishUpload(err, file) {
    chooser.pending = false;
    if (err) {
      report('Core.setUploadedImage failed', err);
      var reason = err && err.message ? String(err.message).replace(/\.$/, '') : 'it could not be read';
      setChooserMessage('That picture could not be used: ' + reason + '. Choose another JPEG or PNG file.', true);
      return;
    }
    chooser.source = 'upload';
    chooser.uploadName = file && file.name ? String(file.name) : currentImageInfo().name;
    chooser.message = '';
    chooser.isError = false;
    renderChoosers();
    announce('Your image is loaded. Every lab on this page now uses it.');
  }

  /* Back to the sample: the first of these Core functions that exists
     (useSampleImage, resetImage, clearUploadedImage), else
     Core.setUploadedImage(null). */
  function restoreSample() {
    var core = getCore();
    var method = null;
    ['useSampleImage', 'resetImage', 'clearUploadedImage'].some(function (name) {
      if (core && typeof core[name] === 'function') {
        method = function () { return core[name](); };
        return true;
      }
      return false;
    });
    if (!method && core && typeof core.setUploadedImage === 'function') {
      method = function () { return core.setUploadedImage(null); };
    }
    if (!method) {
      setChooserMessage('The sample scene cannot be restored here. Reload the page to see it again.', true);
      return;
    }
    chooser.pending = true;
    setChooserMessage('Restoring the sample scene' + ELLIPSIS, false);
    var result;
    try {
      result = method();
    } catch (err) {
      finishRestore(err);
      return;
    }
    Promise.resolve(result).then(
      function () { finishRestore(null); },
      function (err) { finishRestore(err || new Error('the sample could not be restored')); }
    );
  }

  function finishRestore(err) {
    chooser.pending = false;
    var now = currentImageInfo();
    if (!err && !isSampleInfo(now)) {
      err = new Error('the runtime still reports the picture "' + now.name + '"');
    }
    if (err) {
      report('restoring the sample scene failed', err);
      setChooserMessage('The sample scene cannot be restored here. Reload the page to see it again.', true);
      return;
    }
    chooser.source = 'sample';
    chooser.uploadName = '';
    chooser.message = '';
    chooser.isError = false;
    renderChoosers();
    announce('The sample scene is back in every lab.');
  }

  /* An 'image-changed' this file did not start (another control called
     Core.setUploadedImage) still updates every chooser. */
  function listenForImageChanges() {
    var core = getCore();
    if (chooser.listening || !core || typeof core.on !== 'function') return;
    chooser.listening = true;
    try {
      core.on('image-changed', function (payload) {
        if (chooser.pending) return;
        var info = currentImageInfo();
        if (payload && payload.source) info.source = String(payload.source);
        if (payload && payload.name) info.name = String(payload.name);
        var sample = isSampleInfo(info);
        chooser.source = sample ? 'sample' : 'upload';
        chooser.uploadName = sample ? '' : info.name;
        chooser.message = '';
        chooser.isError = false;
        renderChoosers();
      });
    } catch (err) {
      report('could not listen for image changes', err);
    }
  }

  /* ---- the bundle photographs ----------------------------------------------- */

  function bundlePhotoUrl(id) {
    return 'data/images/' + id + '.jpg';
  }

  function emitBundleChange(id) {
    var core = getCore();
    var entry = bundleEntry(id);
    if (!core || typeof core.emit !== 'function') return;
    try {
      core.emit('bundle-image-changed', { id: id, label: entry ? entry.label : '' });
    } catch (err) {
      report('a bundle-image-changed listener threw', err);
    }
  }

  function fetchBundlePhoto(id) {
    if (typeof window.fetch !== 'function' || typeof window.File !== 'function') {
      return Promise.reject(new Error('this browser cannot read the photograph'));
    }
    return window.fetch(bundlePhotoUrl(id)).then(function (response) {
      if (!response.ok) throw new Error('the photograph ' + id + ' was not found (HTTP ' + response.status + ')');
      return response.blob();
    }).then(function (blob) {
      return new window.File([blob], id + '.jpg', { type: blob.type || 'image/jpeg' });
    });
  }

  function finishBundle(err, entry) {
    chooser.pending = false;
    if (err) {
      report('loading a bundle photograph failed', err);
      var reason = err && err.message ? String(err.message).replace(/\.$/, '') : 'it could not be read';
      setChooserMessage('That photograph could not be loaded: ' + reason + '.', true);
      return;
    }
    chooser.source = 'bundle';
    chooser.uploadName = entry.id + '.jpg';
    chooser.message = '';
    chooser.isError = false;
    renderChoosers();
    announce('The photograph \u201C' + entry.label + '\u201D is loaded. Every lab on this page now uses it.');
  }

  /* Choose a bundle photograph. The labs that run on real numbers follow the id at once (the event
     'bundle-image-changed' carries {id, label}); the shared picture, which the toy labs draw, becomes the
     photograph as soon as the page has read it. */
  function chooseBundle(id) {
    var entry = bundleEntry(id);
    var core = getCore();
    if (!entry || chooser.pending) {
      renderChoosers();
      return;
    }
    var changed = chooser.bundleId !== id;
    chooser.bundleId = id;
    if (changed) emitBundleChange(id);
    if (!core || typeof core.setUploadedImage !== 'function') {
      renderChoosers();
      return;
    }
    chooser.pending = true;
    setChooserMessage('Loading the photograph' + ELLIPSIS, false);
    fetchBundlePhoto(id).then(function (file) {
      return core.setUploadedImage(file);
    }).then(
      function () { finishBundle(null, entry); },
      function (err) { finishBundle(err || new Error('the photograph could not be read'), entry); }
    );
  }

  function pageHasBundleImages() {
    return !!doc.querySelector('.page[data-bundle-images]');
  }

  /* A labelled <select> of the eight photographs. With options.blank it starts on a prompt until a photograph is
     the shared picture; without it, it always shows the bundle id the real-number labs are using. */
  function bundleSelect(prefix, options) {
    var id = prefix + '-photo';
    var select = make('select', { id: id });
    if (options.blank) select.appendChild(make('option', { value: '' }, ['Choose a photograph' + ELLIPSIS]));
    BUNDLE_IMAGES.forEach(function (image) {
      select.appendChild(make('option', { value: image.id }, [image.label]));
    });
    select.addEventListener('change', function () {
      if (select.value) chooseBundle(select.value);
    });
    var root = make('div', { 'class': 'bundle-pick' }, [make('label', { 'for': id }, [options.label]), select]);
    function render() {
      select.value = options.blank && chooser.source !== 'bundle' ? '' : chooser.bundleId;
      select.disabled = chooser.pending;
    }
    chooser.views.push(render);
    render();
    return root;
  }

  /* Core.bundleImagePicker(options) -> HTMLElement for a lab's control strip: the eight photographs, always on
     the bundle id the real-number labs are using. options.id: a stable prefix (the lab id); options.label. */
  function bundleImagePicker(options) {
    options = options || {};
    chooser.count += 1;
    var prefix = options.id ? String(options.id).replace(/[^A-Za-z0-9_-]/g, '-') : 'picker-' + chooser.count;
    var base = uniqueId(prefix + '-bundle');
    listenForImageChanges();
    return bundleSelect(base, { blank: false, label: options.label || 'Photograph' });
  }

  /* Core.imageChooser(options) -> HTMLElement for a lab's control strip.
     options.id: a stable prefix, usually the lab id (form controls need
     stable ids); options.label: the group's accessible name. On a page
     that lists the bundle images (main.page[data-bundle-images]) it also
     offers the eight photographs. */
  function imageChooser(options) {
    options = options || {};
    chooser.count += 1;
    var prefix = options.id ? String(options.id).replace(/[^A-Za-z0-9_-]/g, '-') : 'chooser-' + chooser.count;
    var base = uniqueId(prefix + '-image');
    if (chooser.sampleName === null) chooser.sampleName = currentImageInfo().name;

    var sampleButton = make('button', { type: 'button', 'class': 'btn', id: base + '-sample', 'aria-pressed': 'true' }, ['Sample scene']);
    var fileInput = make('input', { type: 'file', accept: 'image/*', id: base + '-file' });
    var fileButton = make('label', { 'class': 'btn file-btn' }, [fileInput, 'Use your own image']);
    var status = make('p', { 'class': 'chooser-status', id: base + '-status' });
    var note = make('p', { 'class': 'chooser-note' }, [
      'Your image never leaves this page. Your browser reads and resizes it here, and nothing is sent anywhere.'
    ]);
    var parts = [make('div', { 'class': 'image-chooser-buttons' }, [sampleButton, fileButton])];
    if (pageHasBundleImages()) parts.push(bundleSelect(base, { blank: true, label: 'Or a photograph of the course' }));
    parts.push(status, note);
    var root = make('div', {
      'class': 'image-chooser',
      id: base,
      role: 'group',
      'aria-label': options.label || 'Picture used by this lab',
      'aria-describedby': base + '-status'
    }, parts);

    sampleButton.addEventListener('click', function () {
      if (chooser.pending || chooser.source === 'sample') return;
      restoreSample();
    });
    fileInput.addEventListener('change', function () {
      var file = fileInput.files && fileInput.files[0];
      fileInput.value = ''; /* choosing the same file again fires change again */
      if (file) uploadFile(file);
    });

    function render() {
      var isSample = chooser.source === 'sample';
      sampleButton.setAttribute('aria-pressed', isSample ? 'true' : 'false');
      fileButton.classList.toggle('is-active', chooser.source === 'upload');
      sampleButton.disabled = chooser.pending;
      fileInput.disabled = chooser.pending;
      root.setAttribute('aria-busy', chooser.pending ? 'true' : 'false');
      status.textContent = chooser.message || describeImage();
      status.classList.toggle('is-error', !!(chooser.message && chooser.isError));
    }

    chooser.views.push(render);
    listenForImageChanges();
    render();
    return root;
  }

  /* ---- page hooks ------------------------------------------------------------ */

  /* p8-ledger: a text filter over the why cards. The page holds <input type="search" id="ledger-filter">, an
     optional <p id="ledger-count" aria-live="polite">, and <div id="ledger"> that the assembler fills with
     .ledger-group sections of aside.why cards. Every word typed must occur in a card for it to stay. */
  function setupLedgerFilter() {
    var input = doc.getElementById('ledger-filter');
    var ledger = doc.getElementById('ledger');
    if (!input || !ledger) return;
    var count = doc.getElementById('ledger-count');
    var cards = toArray(ledger.querySelectorAll('aside.why'));
    var groups = toArray(ledger.querySelectorAll('.ledger-group'));
    var haystacks = cards.map(function (card) { return normTerm(card.textContent); });

    function apply() {
      var words = normTerm(input.value).split(' ').filter(function (word) { return word; });
      var shown = 0;
      cards.forEach(function (card, i) {
        var match = words.every(function (word) { return haystacks[i].indexOf(word) >= 0; });
        card.hidden = !match;
        if (match) shown += 1;
      });
      groups.forEach(function (group) {
        group.hidden = !toArray(group.querySelectorAll('aside.why')).some(function (card) { return !card.hidden; });
      });
      if (count) count.textContent = shown + ' of ' + cards.length + ' cards shown';
    }

    input.addEventListener('input', apply);
    apply();
  }

  var PAGE_HOOKS = { 'p8-ledger': setupLedgerFilter };

  function runPageHook() {
    var page = doc.querySelector('.page');
    var id = page ? page.getAttribute('data-page') : '';
    var hook = id && PAGE_HOOKS[id];
    if (hook) safely('setting up the page ' + id, hook);
  }

  /* ---- public API and start --------------------------------------------- */

  window.Boot = {
    imageChooser: imageChooser,
    bundleImagePicker: bundleImagePicker,
    /* the id of the bundle photograph the real-number labs use: the last one chosen, else the followed image */
    bundleImage: function () { return chooser.bundleId; },
    bundleImages: function () {
      return BUNDLE_IMAGES.map(function (image) { return { id: image.id, label: image.label }; });
    },
    showLabError: showLabError,
    announce: announce,
    goTo: goTo,
    prefersReducedMotion: prefersReducedMotion,
    relayTheme: relayTheme,
    /* the helpers that read data-needs and mount a lab that waits for data, for the node checks */
    parseNeeds: parseNeeds,
    bundleKey: bundleKey,
    loadBundles: loadBundles,
    mountWithBundles: mountWithBundles,
    /* for a lab that adds dfn[data-term], .fact[data-source] or .mark after mounting */
    refreshTerms: function () {
      safely('preparing glossary terms', prepareTerms);
      safely('preparing fact sources', prepareFacts);
      safely('preparing the marks', prepareMarks);
    }
  };

  /* Installed now, while the scripts run, so a lab's mount function can
     call core.imageChooser(...) when boot.js mounts it. */
  (function installOnCore() {
    var core = getCore();
    if (!core) return;
    [['imageChooser', imageChooser], ['bundleImagePicker', bundleImagePicker]].forEach(function (pair) {
      if (typeof core[pair[0]] === 'function') return;
      try {
        core[pair[0]] = pair[1];
      } catch (e) {
        /* a frozen Core keeps window.Boot's copy */
      }
    });
  })();

  var started = false;

  function start() {
    if (started) return;
    started = true;
    safely('checking the page wrapper', ensurePageWrapper);
    safely('creating the live region', ensureLiveRegion);
    var sections = safely('mounting the labs', mountLabs) || [];
    safely('setting up the top bar', setupTopbar);
    safely('creating the popover', ensurePopover);
    safely('preparing glossary terms', prepareTerms);
    safely('preparing fact sources', prepareFacts);
    safely('preparing the marks', prepareMarks);
    safely('watching the theme', watchTheme);
    safely('setting up the page', runPageHook);

    doc.addEventListener('click', onInternalLink);
    doc.addEventListener('click', onClick);
    doc.addEventListener('keydown', onKeydown);
    window.addEventListener('scroll', queueProgress, { passive: true });
    window.addEventListener('resize', queueLayout);
    queueLayout();
    safely('returning to the linked section', restoreHashTarget);

    /* The page-height watcher starts after the labs have mounted, so in a
       round of resize notifications it runs after the labs' own watchers.
       A lab that lays itself out again for a new width then changes the
       page height before this watcher reads it, and the browser has no
       notification left over to report as "ResizeObserver loop completed
       with undelivered notifications". */
    function watchPageHeight() {
      if (typeof window.ResizeObserver === 'function' && doc.body) {
        safely('watching the page height', function () {
          new window.ResizeObserver(function () { queueLayout(); }).observe(doc.body);
        });
      }
    }

    /* Labs that mount one per task add their terms and facts after the
       first preparation, so prepare them again once all have mounted. */
    var labsReady = labsDone ? labsDone.then(function () {
      safely('preparing glossary terms of the labs', prepareTerms);
      safely('preparing fact sources of the labs', prepareFacts);
      safely('preparing the marks of the labs', prepareMarks);
      watchPageHeight();
      queueLayout();
    }, function () { watchPageHeight(); }) : null;
    if (!labsReady) watchPageHeight();

    function afterLoad() {
      queueLayout();
      var sweep = function () {
        window.setTimeout(function () {
          safely('checking for empty labs', function () { sweepEmptyLabs(sections); });
        }, 1500);
      };
      if (labsReady) labsReady.then(sweep, sweep);
      else sweep();
    }
    if (doc.readyState === 'complete') afterLoad();
    else window.addEventListener('load', afterLoad);
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start);
  else start();
})();
