/*
 * scenes.js: the scenes engine of the course "Pixels to Islands" (plan decision 7, spec section 8): a film of stops
 * that the reader plays, pauses, steps and scrubs, for the pipeline lab of Part 7 and any lab that tells a story in
 * stops. Only this file animates (spec section 11). Plain ES2019, no library; nothing happens at load time.
 *
 *   Scenes.create(root, {stops, state, speed, reducedMotion, label}) -> film
 *
 * root is the lab's .lab-body. The engine appends one .scene to it, drawn with the classes of README.md section 6
 * (styled in styles.css section 10): .scene-controls holds .scene-buttons (button.scene-btn: play or pause, back,
 * forward), .scene-speed (a .segmented radio group: 0.5, 1, 2), ol.scene-scrub (one li > button.scene-square per stop,
 * aria-current="step" on the current one, .is-done on the passed ones) and p.scene-status (the stop's number and
 * name); .scene-body holds .scene-stage (where the stop draws) and .scene-explain (h4.scene-title, then the stop's copy).
 *
 * A stop is {id, title, duration, explain, still(stage, state), draw(stage, state, t)}:
 *   duration  seconds at speed 1 (4 when left out);
 *   explain   an HTML string of the course's copy, its marks included (boot.js wires them after each stop change);
 *   still     draws the stop's resting frame: at mount, after goTo and step, and as the only frame with reduced motion;
 *   draw      draws the frame at t, from 0 to 1, called at the browser's frame rate while the film plays, t growing by
 *             the elapsed seconds times the speed over the duration; a stop without draw shows its still while it plays.
 * The stage is emptied when the film moves to another stop. Within a stop, still and every draw paint over what the
 * stop left in the stage, so a stop keeps one canvas or SVG there and redraws it (Scenes.surface finds or makes it).
 * state is one object handed to every call. Errors in a stop are caught: the film pauses and the stage says so.
 *
 * With reduced motion (the reader's prefers-reduced-motion, unless options.reducedMotion says otherwise), play shows
 * each stop's still and moves on every duration / speed seconds, with no frame in between.
 *
 * The film answers: play(), pause(), toggle(), step(+1 or -1), goTo(i), setSpeed(0.5 | 1 | 2), onChange(fn), which
 * returns a function that stops the calls, index(), isPlaying(), progress() (t), destroy(), element (the .scene) and
 * stage. onChange calls fn({index, id, title, count, playing, ended, speed, t, reason}) after every move ('goto',
 * 'advance'), 'play', 'pause', 'speed' and 'end'. Keys, with the focus anywhere in the film except the speed choice:
 * ArrowRight and ArrowLeft step, Home and End go to the first and the last stop. play() at the end starts again at the
 * first stop. The .scene carries data-scene-state: paused, playing or ended.
 */
(function (root) {
  'use strict';

  if (root.Scenes && typeof root.Scenes.create === 'function' && !root.Scenes.placeholder) return;

  const SPEEDS = Object.freeze([0.5, 1, 2]);
  const DEFAULT_DURATION = 4;
  const TIMES = String.fromCharCode(0xD7); // the multiplication sign of '0.5x', '1x', '2x'
  let filmCount = 0;

  // now(): the time in milliseconds, from performance.now when the page has it.
  function now() {
    try {
      if (root.performance && typeof root.performance.now === 'function') return root.performance.now();
    } catch (e) { /* fall through */ }
    return Date.now();
  }

  // report(what, err): log a problem to the console; never throws.
  function report(what, err) {
    try {
      if (root.console && typeof root.console.error === 'function') root.console.error('[scenes] ' + what, err);
    } catch (e) { /* nothing more can be done */ }
  }

  // describe(err): a short readable message for any thrown value.
  function describe(err) {
    if (err && typeof err.message === 'string' && err.message) return err.message;
    try { return String(err); } catch (e) { return 'unknown error'; }
  }

  // prefersReducedMotion(): whether the reader asks the system for reduced motion (false when the page cannot tell).
  function prefersReducedMotion() {
    try {
      return !!(typeof root.matchMedia === 'function' && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) {
      return false;
    }
  }

  // make(doc, tag, attrs, text): a new element with the given attributes and text.
  function make(doc, tag, attrs, text) {
    const node = doc.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        if (attrs[key] !== null && attrs[key] !== undefined) node.setAttribute(key, String(attrs[key]));
      });
    }
    if (text !== undefined) node.textContent = String(text);
    return node;
  }

  // emptyNode(node): take every child out of node.
  function emptyNode(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  // appendHtml(node, html): add the stop's copy (a trusted HTML string from the page's own script) at the end of node.
  function appendHtml(node, html) {
    if (!html) return;
    if (typeof node.insertAdjacentHTML === 'function') {
      node.insertAdjacentHTML('beforeend', html);
      return;
    }
    const holder = node.ownerDocument.createElement('div');
    holder.innerHTML = html;
    node.appendChild(holder);
  }

  // refreshMarks(): ask boot.js to wire the glossary terms and the marks that a stop's copy brought into the page.
  function refreshMarks() {
    try {
      if (root.Boot && typeof root.Boot.refreshTerms === 'function') root.Boot.refreshTerms();
    } catch (err) {
      report('wiring the marks of a stop', err);
    }
  }

  // checkStops(stops): the stops with their defaults filled in, or a TypeError or RangeError that names the stop.
  function checkStops(stops) {
    if (!Array.isArray(stops) || !stops.length) throw new TypeError('Scenes.create needs a list of stops');
    return stops.map(function (s, i) {
      const name = 'stop ' + (i + 1);
      if (!s || typeof s !== 'object') throw new TypeError(name + ' is not an object');
      if (typeof s.still !== 'function') throw new TypeError(name + ' has no still(stage, state)');
      if (s.draw !== undefined && s.draw !== null && typeof s.draw !== 'function') throw new TypeError(name + ': draw is not a function');
      const duration = s.duration === undefined ? DEFAULT_DURATION : Number(s.duration);
      if (!(duration > 0 && isFinite(duration))) throw new RangeError(name + ' needs a duration above 0 seconds');
      return {
        id: s.id === undefined ? 'stop-' + (i + 1) : String(s.id),
        title: s.title === undefined ? 'Stop ' + (i + 1) : String(s.title),
        duration: duration,
        explain: s.explain === undefined || s.explain === null ? '' : String(s.explain),
        still: s.still,
        draw: typeof s.draw === 'function' ? s.draw : null
      };
    });
  }

  // surface(stage, tag='canvas', attrs): the stage's first child of this tag, made and appended when there is none, so
  // that a stop's still and draw share one drawing surface (an SVG is made with Core.el, which knows its namespace).
  function surface(stage, tag, attrs) {
    const name = String(tag || 'canvas').toLowerCase();
    const kids = stage.children || [];
    for (let i = 0; i < kids.length; i++) {
      if (String(kids[i].tagName).toLowerCase() === name) return kids[i];
    }
    const doc = stage.ownerDocument || root.document;
    const node = root.Core && typeof root.Core.el === 'function' ? root.Core.el(name, attrs || {}) : make(doc, name, attrs);
    stage.appendChild(node);
    return node;
  }

  // create(host, options): build a film inside host and show the resting frame of its first stop (see the top of the file).
  function create(host, options) {
    if (!host || typeof host.appendChild !== 'function') throw new TypeError('Scenes.create needs the element to draw into');
    const o = options || {};
    const stops = checkStops(o.stops);
    const state = o.state && typeof o.state === 'object' ? o.state : {};
    const reduced = o.reducedMotion === undefined ? prefersReducedMotion() : !!o.reducedMotion;
    const doc = host.ownerDocument || root.document;
    const uid = 'scene-' + (++filmCount);
    const last = stops.length - 1;
    const listeners = [];
    let speed = SPEEDS.indexOf(Number(o.speed)) >= 0 ? Number(o.speed) : 1;
    let index = 0, t = 0, playing = false, ended = false, destroyed = false;
    let frameId = null, frameByTimer = false, timerId = null, lastTime = null;

    // the film's elements
    const el = make(doc, 'div', {
      'class': 'scene', role: 'group', tabindex: '0', 'data-scene-state': 'paused',
      'aria-label': o.label ? String(o.label) : 'A film in ' + stops.length + ' stops'
    });
    const controls = make(doc, 'div', { 'class': 'scene-controls' });
    const buttons = make(doc, 'div', { 'class': 'scene-buttons' });
    const playButton = make(doc, 'button', { type: 'button', 'class': 'scene-btn', 'data-action': 'play' }, 'Play');
    const backButton = make(doc, 'button', { type: 'button', 'class': 'scene-btn', 'data-action': 'back', 'aria-label': 'Previous stop' }, 'Back');
    const forwardButton = make(doc, 'button', { type: 'button', 'class': 'scene-btn', 'data-action': 'forward', 'aria-label': 'Next stop' }, 'Next');
    buttons.appendChild(playButton);
    buttons.appendChild(backButton);
    buttons.appendChild(forwardButton);
    const speedBox = make(doc, 'div', { 'class': 'scene-speed' });
    speedBox.appendChild(make(doc, 'span', { 'class': 'scene-speed-label', id: uid + '-speed' }, 'Speed'));
    const group = make(doc, 'div', { 'class': 'segmented', role: 'radiogroup', 'aria-labelledby': uid + '-speed' });
    const radios = SPEEDS.map(function (s) {
      const label = make(doc, 'label');
      const input = make(doc, 'input', { type: 'radio', name: uid + '-speed-choice', value: String(s) });
      input.checked = s === speed;
      input.addEventListener('change', function () { if (input.checked) setSpeed(s); });
      label.appendChild(input);
      label.appendChild(make(doc, 'span', null, String(s) + TIMES));
      group.appendChild(label);
      return input;
    });
    speedBox.appendChild(group);
    const scrub = make(doc, 'ol', { 'class': 'scene-scrub', 'aria-label': 'Stops' });
    const squares = stops.map(function (s, i) {
      const item = make(doc, 'li');
      const square = make(doc, 'button', {
        type: 'button', 'class': 'scene-square', 'data-stop': String(i), title: s.title,
        'aria-label': 'Stop ' + (i + 1) + ' of ' + stops.length + ': ' + s.title
      }, String(i + 1));
      square.addEventListener('click', function () { goTo(i); });
      item.appendChild(square);
      scrub.appendChild(item);
      return square;
    });
    const statusLine = make(doc, 'p', { 'class': 'scene-status', 'aria-live': 'polite' });
    controls.appendChild(buttons);
    controls.appendChild(speedBox);
    controls.appendChild(scrub);
    controls.appendChild(statusLine);
    const body = make(doc, 'div', { 'class': 'scene-body' });
    const stage = make(doc, 'div', { 'class': 'scene-stage' });
    const explain = make(doc, 'div', { 'class': 'scene-explain' });
    const titleNode = make(doc, 'h4', { 'class': 'scene-title' });
    body.appendChild(stage);
    body.appendChild(explain);
    el.appendChild(controls);
    el.appendChild(body);
    host.appendChild(el);

    // emit(reason): tell every onChange listener what the film now shows.
    function emit(reason) {
      const stop = stops[index];
      const info = { index: index, id: stop.id, title: stop.title, count: stops.length, playing: playing, ended: ended, speed: speed, t: t, reason: reason };
      listeners.slice().forEach(function (fn) {
        try { fn(info); } catch (err) { report('an onChange listener', err); }
      });
    }

    // render(): the controls, the scrubber and the status line for the current stop and state.
    function render() {
      const stop = stops[index];
      squares.forEach(function (square, i) {
        if (i === index) square.setAttribute('aria-current', 'step'); else square.removeAttribute('aria-current');
        if (i < index) square.classList.add('is-done'); else square.classList.remove('is-done');
      });
      backButton.disabled = index === 0;
      forwardButton.disabled = index === last;
      playButton.textContent = playing ? 'Pause' : 'Play';
      playButton.setAttribute('aria-label', playing ? 'Pause the film' : (ended ? 'Play the film again from the first stop' : 'Play the film'));
      el.setAttribute('data-scene-state', playing ? 'playing' : (ended ? 'ended' : 'paused'));
      statusLine.textContent = 'Stop ' + (index + 1) + ' of ' + stops.length + ': ' + stop.title +
        (playing ? ' (playing)' : (ended ? ' (the end of the film)' : ''));
    }

    // enter(i): make stop i the current one: its title and copy in the explain panel, an empty stage, t back to 0.
    function enter(i) {
      index = i;
      t = 0;
      const stop = stops[i];
      explain.textContent = '';
      titleNode.textContent = stop.title;
      explain.appendChild(titleNode);
      appendHtml(explain, stop.explain);
      refreshMarks();
      emptyNode(stage);
    }

    // fail(what, err): a stop broke: pause the film and say so in the stage.
    function fail(what, err) {
      report(what, err);
      stopTiming();
      playing = false;
      const note = make(doc, 'p', { 'class': 'lab-error scene-error', role: 'alert' }, 'This stop could not be drawn: ' + describe(err));
      stage.appendChild(note);
      render();
    }

    // paintStill(): the current stop's resting frame.
    function paintStill() {
      try { stops[index].still(stage, state); } catch (err) { fail('the resting frame of stop ' + (index + 1), err); }
    }

    // paintFrame(at): the current stop's frame at t = at (its still for a stop without draw, once, at t = 0).
    function paintFrame(at) {
      const stop = stops[index];
      try {
        if (stop.draw) stop.draw(stage, state, at);
        else if (at === 0) stop.still(stage, state);
      } catch (err) {
        fail('frame ' + at.toFixed(3) + ' of stop ' + (index + 1), err);
      }
    }

    // requestFrame(): ask for the next animation frame (a 16 ms timer where the page has no requestAnimationFrame).
    function requestFrame() {
      if (typeof root.requestAnimationFrame === 'function') {
        frameByTimer = false;
        frameId = root.requestAnimationFrame(onFrame);
      } else {
        frameByTimer = true;
        frameId = root.setTimeout(function () { onFrame(now()); }, 16);
      }
    }

    // stopTiming(): cancel the frame or the timer the film waits for.
    function stopTiming() {
      if (frameId !== null) {
        if (frameByTimer) root.clearTimeout(frameId);
        else if (typeof root.cancelAnimationFrame === 'function') root.cancelAnimationFrame(frameId);
        frameId = null;
      }
      if (timerId !== null) {
        root.clearTimeout(timerId);
        timerId = null;
      }
    }

    // finish(): the last stop has run its course.
    function finish() {
      stopTiming();
      playing = false;
      ended = true;
      t = 1;
      render();
      emit('end');
    }

    // advance(): during play, move on to the next stop and paint its first frame.
    function advance() {
      enter(index + 1);
      if (reduced) paintStill(); else paintFrame(0);
      render();
      emit('advance');
    }

    // onFrame(time): one animation frame of the playing stop.
    function onFrame(time) {
      frameId = null;
      if (!playing || destroyed) return;
      const at = typeof time === 'number' && isFinite(time) ? time : now();
      if (lastTime === null) lastTime = at;
      const stop = stops[index];
      t = Math.min(1, t + Math.max(0, at - lastTime) * speed / (stop.duration * 1000));
      lastTime = at;
      paintFrame(t);
      if (!playing) return;
      if (t >= 1) {
        if (index >= last) { finish(); return; }
        advance();
        if (!playing) return;
      }
      requestFrame();
    }

    // wait(): with reduced motion, move on after the current stop's duration at the current speed.
    function wait() {
      timerId = root.setTimeout(function () {
        timerId = null;
        if (!playing || destroyed) return;
        if (index >= last) { finish(); return; }
        advance();
        if (playing) wait();
      }, stops[index].duration * 1000 / speed);
    }

    // play(): run the film from where it stands (from the first stop when it has ended).
    function play() {
      if (destroyed || playing) return;
      if (ended) {
        ended = false;
        enter(0);
        paintStill();
      }
      playing = true;
      lastTime = null;
      render();
      emit('play');
      if (!playing) return;
      if (reduced) wait(); else requestFrame();
    }

    // pause(): hold the film on the frame it shows.
    function pause() {
      if (!playing) return;
      playing = false;
      stopTiming();
      render();
      emit('pause');
    }

    // toggle(): play when paused, pause when playing.
    function toggle() {
      if (playing) pause(); else play();
    }

    // goTo(i): stop playing and show the resting frame of stop i (clamped to the film); answers the stop's index.
    function goTo(i) {
      if (destroyed) return index;
      const target = Math.max(0, Math.min(last, Math.round(Number(i)) || 0));
      if (playing) {
        playing = false;
        stopTiming();
      }
      ended = false;
      enter(target);
      paintStill();
      render();
      emit('goto');
      return index;
    }

    // step(direction): goTo the next stop (+1) or the previous one (-1).
    function step(direction) {
      return goTo(index + (Number(direction) < 0 ? -1 : 1));
    }

    // setSpeed(s): play at 0.5, 1 or 2 times the stops' durations; a waiting reduced-motion timer starts again.
    function setSpeed(s) {
      const value = Number(s);
      if (SPEEDS.indexOf(value) < 0) throw new RangeError('the speed must be 0.5, 1 or 2, not ' + s);
      speed = value;
      radios.forEach(function (input, i) { input.checked = SPEEDS[i] === value; });
      if (playing && reduced && timerId !== null) {
        root.clearTimeout(timerId);
        timerId = null;
        wait();
      }
      emit('speed');
      return speed;
    }

    // onChange(fn): call fn after every change of the film; answers the function that stops the calls.
    function onChange(fn) {
      if (typeof fn !== 'function') throw new TypeError('onChange needs a function');
      listeners.push(fn);
      return function () {
        const i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
      };
    }

    // destroy(): stop the film and take it out of the page.
    function destroy() {
      if (destroyed) return;
      playing = false;
      stopTiming();
      destroyed = true;
      listeners.length = 0;
      if (el.parentNode) el.parentNode.removeChild(el);
    }

    playButton.addEventListener('click', function () { toggle(); });
    backButton.addEventListener('click', function () { step(-1); });
    forwardButton.addEventListener('click', function () { step(1); });
    el.addEventListener('keydown', function (event) {
      const target = event && event.target;
      const tag = target && target.tagName ? String(target.tagName).toLowerCase() : '';
      if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
      let handled = true;
      if (event.key === 'ArrowRight') step(1);
      else if (event.key === 'ArrowLeft') step(-1);
      else if (event.key === 'Home') goTo(0);
      else if (event.key === 'End') goTo(last);
      else handled = false;
      if (handled && typeof event.preventDefault === 'function') event.preventDefault();
    });

    enter(0);
    paintStill();
    render();

    return {
      play: play, pause: pause, toggle: toggle, step: step, goTo: goTo, setSpeed: setSpeed, onChange: onChange,
      index: function () { return index; },
      isPlaying: function () { return playing; },
      progress: function () { return t; },
      reducedMotion: reduced,
      destroy: destroy,
      element: el,
      stage: stage
    };
  }

  root.Scenes = Object.freeze({ create: create, surface: surface, speeds: SPEEDS, version: '2026-10-13.1' });
})(typeof window !== 'undefined' ? window : this);
