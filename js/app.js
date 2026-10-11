'use strict';

(function () {
  const { WORDS, LETTERS, SPELL_LEVELS, MATH_LEVELS, PATTERN_LEVELS, PATTERN_THEMES, COUNT_ITEMS, PRAISE } = window.DATA;
  const STORE_KEY = 'stav-og-regn-v1';
  const LEVEL_UP_AFTER = 5; // rigtige i første forsøg i træk
  const LEVEL_DOWN_AFTER = 3; // opgaver med fejl i træk
  const LEVELS = { spell: SPELL_LEVELS, math: MATH_LEVELS, pattern: PATTERN_LEVELS };
  const AREAS = Object.keys(LEVELS);

  // ---------- Gemt tilstand (kun på enheden, ingen server) ----------

  function defaultState() {
    return {
      stars: 0,
      settings: { uppercase: true, sound: true, name: '' },
      spell: { level: 1, streak: 0, misses: 0, done: 0 },
      math: { level: 1, streak: 0, misses: 0, done: 0 },
      pattern: { level: 1, streak: 0, misses: 0, done: 0 },
    };
  }

  function load() {
    const d = defaultState();
    try {
      const s = JSON.parse(localStorage.getItem(STORE_KEY));
      if (s) {
        return {
          ...d,
          ...s,
          settings: { ...d.settings, ...s.settings },
          spell: { ...d.spell, ...s.spell },
          math: { ...d.math, ...s.math },
          pattern: { ...d.pattern, ...s.pattern },
        };
      }
    } catch (e) { /* tom eller ødelagt lagring: start forfra */ }
    return d;
  }

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignorer */ }
  }

  let state = load();
  for (const area of AREAS) {
    state[area].level = Math.min(Math.max(1, state[area].level), LEVELS[area].length);
  }

  // ---------- Hjælpere ----------

  const $ = (sel) => document.querySelector(sel);
  const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  const fmt = (letter) => (state.settings.uppercase ? letter.toLocaleUpperCase('da') : letter);

  // ---------- Lyd: oplæsning og lydeffekter ----------
  //
  // Al lyd er færdige lydfiler i app/audio/, lavet på forhånd med tools/make-audio
  // (OmniVoice). Mangler en fil, er der bare stille: vi bruger ikke telefonens robotstemme.

  const audio = {
    ctx: null,
    available: new Set(), // filnavne fra audio/manifest.json
    buffers: new Map(),
    playing: [],
    token: 0,
  };

  fetch('audio/manifest.json')
    .then((r) => (r.ok ? r.json() : { clips: [] }))
    .then((m) => {
      audio.available = new Set(m.clips);
      setAudioUi(audio.available.size > 0);
    })
    .catch(() => {});

  // Lydknapper og lyd-indstillinger vises kun, når der findes lydfiler.
  function setAudioUi(on) {
    document.body.classList.toggle('no-audio', !on);
    document.querySelectorAll('[data-sound-only]').forEach((x) => { x.hidden = !on; });
  }

  function audioCtx() {
    if (!audio.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      audio.ctx = new Ctx();
    }
    if (audio.ctx.state === 'suspended') audio.ctx.resume();
    return audio.ctx;
  }

  function loadClip(key) {
    if (!audio.buffers.has(key)) {
      const ctx = audioCtx();
      audio.buffers.set(key, fetch(`audio/${key}.mp3`)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(key))))
        .then((b) => ctx.decodeAudioData(b))
        .catch(() => null));
    }
    return audio.buffers.get(key);
  }

  function stopSpeech() {
    audio.token++;
    audio.playing.forEach((src) => { try { src.stop(); } catch (e) { /* allerede stoppet */ } });
    audio.playing = [];
  }

  function playBuffers(buffers, track) {
    const ctx = audio.ctx;
    let t = ctx.currentTime + 0.03;
    for (const b of buffers) {
      if (!b) continue;
      const src = ctx.createBufferSource();
      src.buffer = b;
      src.connect(ctx.destination);
      src.start(t);
      if (track) audio.playing.push(src);
      t += b.duration + 0.05;
    }
    return t - ctx.currentTime; // sekunder til det hele er sagt
  }

  // Læser en eller flere tekster op efter hinanden, f.eks. say('kat', 'Stav ordet.').
  async function say(...texts) {
    stopSpeech();
    if (!state.settings.sound || !audioCtx()) return 0;
    const my = audio.token;
    const keys = texts.filter(Boolean).map(window.DATA.audioKey).filter((k) => audio.available.has(k));
    const buffers = await Promise.all(keys.map(loadClip));
    if (my !== audio.token) return 0;
    return playBuffers(buffers, true);
  }

  // Korte lydeffekter: good, bad, level, tap. Afbryder ikke oplæsningen.
  async function sfx(name) {
    const key = 'sfx-' + name;
    if (!state.settings.sound || !audio.available.has(key) || !audioCtx()) return;
    playBuffers([await loadClip(key)], false);
  }

  const sayNumber = (n) => window.DATA.NUMBER_WORDS[n] || window.DATA.TENS[n];
  const sayLetter = (l) => window.DATA.LETTER_NAMES[l] || l;
  const P = window.DATA.PHRASES;

  // ---------- Skærme og navigation ----------

  let area = null; // 'spell' eller 'math'
  let task = null;
  let nextTimer = null;

  function show(name) {
    document.querySelectorAll('.screen').forEach((s) => { s.hidden = s.id !== 'screen-' + name; });
    if (name !== 'play') {
      clearTimeout(nextTimer);
      stopSpeech();
    }
    if (name === 'home') renderHome();
    if (name === 'parent') renderParent();
  }

  // Android-tilbageknappen skal føre hjem i stedet for at lukke appen.
  function open(name) {
    show(name);
    history.pushState({ screen: name }, '');
  }
  function goHome() {
    if (history.state && history.state.screen) history.back();
    else show('home');
  }
  window.addEventListener('popstate', () => show('home'));
  document.querySelectorAll('[data-home]').forEach((b) => b.addEventListener('click', goHome));

  function updateStars() {
    document.querySelectorAll('[data-stars]').forEach((s) => { s.textContent = state.stars; });
  }

  function levelLabel(a) {
    const lvl = state[a].level;
    return `Niveau ${lvl}: ${LEVELS[a][lvl - 1].name}`;
  }

  function renderHome() {
    $('#greeting').textContent = state.settings.name ? `Hej ${state.settings.name}!` : 'Hej!';
    $('#spell-level-label').textContent = levelLabel('spell');
    $('#math-level-label').textContent = levelLabel('math');
    $('#pattern-level-label').textContent = levelLabel('pattern');
    $('#parent-hint').hidden = true;
    updateStars();
  }

  $('#go-spell').addEventListener('click', () => startArea('spell'));
  $('#go-math').addEventListener('click', () => startArea('math'));
  $('#go-pattern').addEventListener('click', () => startArea('pattern'));

  function startArea(a) {
    area = a;
    open('play');
    nextTask();
  }

  // ---------- Fælles for opgaver ----------

  function nextTask() {
    clearTimeout(nextTimer);
    $('#feedback').textContent = '';
    renderStreak();
    if (area === 'spell') spellTask();
    else if (area === 'math') mathTask();
    else patternTask();
  }

  function renderStreak() {
    const box = $('#streak');
    box.replaceChildren();
    const p = state[area];
    const atMax = p.level >= LEVELS[area].length;
    const filled = atMax ? Math.min(p.streak, LEVEL_UP_AFTER) : p.streak;
    for (let i = 0; i < LEVEL_UP_AFTER; i++) {
      box.append(el('span', i < filled ? 'dot on' : 'dot'));
    }
  }

  // Returnerer +1 ved nyt niveau, -1 ved lavere niveau, ellers 0.
  function recordResult(a, firstTry) {
    const p = state[a];
    const max = LEVELS[a].length;
    p.done++;
    let change = 0;
    if (firstTry) {
      p.streak++;
      p.misses = 0;
      if (p.streak >= LEVEL_UP_AFTER && p.level < max) {
        p.level++;
        p.streak = 0;
        change = 1;
      }
    } else {
      p.streak = 0;
      p.misses++;
      if (p.misses >= LEVEL_DOWN_AFTER && p.level > 1) {
        p.level--;
        p.misses = 0;
        change = -1;
      }
    }
    save();
    return change;
  }

  // spoken: det der skal siges før rosen, f.eks. ordet der lige er stavet.
  function finishTask(spoken) {
    const done = task;
    done.done = true;
    state.stars++;
    const change = recordResult(area, done.mistakes === 0);
    updateStars();
    renderStreak();
    let msg, praise;
    if (change > 0) {
      praise = P.newLevel;
      msg = 'Nyt niveau! 🎉';
      sfx('level');
      celebrate(30);
    } else {
      praise = pick(PRAISE);
      const name = state.settings.name;
      msg = name && Math.random() < 0.4 ? `${praise.replace(/!$/, '')}, ${name}!` : praise;
      sfx('good');
      celebrate(12);
    }
    $('#feedback').textContent = msg;
    // Vent til oplæsningen er færdig, før næste opgave kommer.
    const minWait = change > 0 ? 2800 : 1900;
    say(...spoken, praise).then((secs) => {
      if (task !== done || $('#screen-play').hidden) return;
      nextTimer = setTimeout(nextTask, Math.max(minWait, secs * 1000 + 600));
    });
  }

  function wrong(btn) {
    task.mistakes++;
    sfx('bad');
    btn.classList.remove('shake');
    void btn.offsetWidth; // genstart animationen
    btn.classList.add('shake');
  }

  function celebrate(n) {
    const box = $('#celebrate');
    const emojis = ['⭐', '🌟', '🎉', '✨', '🎈'];
    for (let i = 0; i < n; i++) {
      const s = el('span', 'confetti', pick(emojis));
      s.style.left = rand(2, 92) + '%';
      s.style.animationDelay = (Math.random() * 0.4).toFixed(2) + 's';
      s.style.fontSize = rand(24, 46) + 'px';
      box.append(s);
      setTimeout(() => s.remove(), 2200);
    }
  }

  function speakerButton(...texts) {
    const b = el('button', 'icon-btn speak', '🔊');
    b.setAttribute('aria-label', 'Hør igen');
    b.addEventListener('click', () => say(...texts));
    return b;
  }

  // ---------- Stave ----------

  const recentWords = [];

  function pickWord(pools) {
    const all = pools.flatMap((p) => WORDS[p]);
    let candidates = all.filter((w) => !recentWords.includes(w.word));
    if (!candidates.length) candidates = all;
    const w = pick(candidates);
    recentWords.push(w.word);
    if (recentWords.length > 8) recentWords.shift();
    return w;
  }

  function spellTask() {
    const lvl = SPELL_LEVELS[state.spell.level - 1];
    const w = pickWord(lvl.pool);
    const letters = Array.from(w.word);
    task = { word: w.word, letters, mistakes: 0, pos: 0, wrongHere: 0, done: false };

    const root = $('#task');
    root.replaceChildren();

    const picture = el('button', 'picture', w.emoji);
    picture.setAttribute('aria-label', 'Hør ordet');
    picture.addEventListener('click', () => say(w.word));
    const pictureRow = el('div', 'picture-row');
    pictureRow.append(picture, speakerButton(w.word));

    const slots = el('div', 'slots');
    letters.forEach(() => slots.append(el('div', 'slot')));
    const tiles = el('div', 'tiles');
    root.append(pictureRow, slots, tiles);

    if (lvl.mode === 'first') {
      slots.children[0].textContent = '?';
      slots.children[0].classList.add('current');
      for (let i = 1; i < letters.length; i++) {
        slots.children[i].textContent = fmt(letters[i]);
        slots.children[i].classList.add('given');
      }
      const others = shuffle(LETTERS.filter((l) => l !== letters[0])).slice(0, lvl.choices - 1);
      shuffle([letters[0], ...others]).forEach((l) => {
        const t = el('button', 'tile', fmt(l));
        t.addEventListener('click', () => onFirstLetter(t, l, slots));
        tiles.append(t);
      });
      say(w.word, P.firstLetter);
    } else {
      slots.children[0].classList.add('current');
      const distractors = shuffle(LETTERS.filter((l) => !letters.includes(l))).slice(0, lvl.extra);
      shuffle([...letters, ...distractors]).forEach((l) => {
        const t = el('button', 'tile', fmt(l));
        t.dataset.letter = l;
        t.addEventListener('click', () => onBuildLetter(t, l, slots, tiles));
        tiles.append(t);
      });
      say(w.word, P.spell);
    }
  }

  function onFirstLetter(tile, letter, slots) {
    if (task.done || tile.disabled) return;
    if (letter === task.letters[0]) {
      const slot = slots.children[0];
      slot.textContent = fmt(letter);
      slot.classList.remove('current');
      slot.classList.add('filled', 'pop');
      tile.classList.add('right');
      finishTask([task.word]);
    } else {
      wrong(tile);
      tile.disabled = true;
      say(task.word);
    }
  }

  function onBuildLetter(tile, letter, slots, tiles) {
    if (task.done || tile.disabled) return;
    const need = task.letters[task.pos];
    if (letter === need) {
      tile.disabled = true;
      tile.classList.add('used');
      tiles.querySelectorAll('.hint').forEach((x) => x.classList.remove('hint'));
      const slot = slots.children[task.pos];
      slot.textContent = fmt(letter);
      slot.classList.remove('current');
      slot.classList.add('filled', 'pop');
      task.pos++;
      task.wrongHere = 0;
      if (task.pos === task.letters.length) {
        finishTask([task.word]);
      } else {
        slots.children[task.pos].classList.add('current');
        say(sayLetter(letter));
      }
    } else {
      wrong(tile);
      task.wrongHere++;
      // Efter to forkerte forsøg på samme plads viser vi det rigtige bogstav.
      if (task.wrongHere >= 2) {
        const hint = Array.from(tiles.children).find((x) => !x.disabled && x.dataset.letter === need);
        if (hint) hint.classList.add('hint');
      }
    }
  }

  // ---------- Regne ----------

  function makeChoices(answer, min, max, n, unit = 1) {
    const set = new Set([answer]);
    for (const o of shuffle([-1, 1, -2, 2, -3, 3])) {
      if (set.size >= n) break;
      const v = answer + o * unit;
      if (v >= min && v <= max) set.add(v);
    }
    let guard = 0;
    while (set.size < n && guard++ < 100) set.add(min + unit * rand(0, Math.floor((max - min) / unit)));
    return Array.from(set).sort((a, b) => a - b);
  }

  // Billeder lagt i rækker af 5 (som en tierramme), så de er nemme at tælle.
  // Barnet kan trykke på dem for at tælle højt.
  function group(emoji, n, crossedFrom, counter) {
    const g = el('div', 'group');
    for (let i = 0; i < n; i++) {
      const o = el('button', 'obj');
      o.append(el('span', null, emoji));
      o.tabIndex = -1;
      if (i >= crossedFrom) o.classList.add('crossed');
      else {
        o.addEventListener('click', () => {
          if (o.classList.contains('counted')) return;
          o.classList.add('counted');
          counter.n++;
          say(sayNumber(counter.n));
        });
      }
      g.append(o);
    }
    return g;
  }

  function mathTask() {
    const lvl = MATH_LEVELS[state.math.level - 1];
    const type = lvl.type === 'mix' ? pick(['add', 'sub']) : lvl.type;
    const item = pick(COUNT_ITEMS);
    const counter = { n: 0 };
    let answer, question, spoken, visual = null;

    if (type === 'count') {
      answer = rand(1, lvl.max);
      question = 'Hvor mange?';
      spoken = [`Hvor mange ${item.pl}?`];
      visual = group(item.e, answer, Infinity, counter);
    } else if (type === 'add') {
      const a = rand(1, lvl.max - 1);
      const b = rand(1, lvl.max - a);
      answer = a + b;
      question = `${a} + ${b} = ?`;
      spoken = [P.whatIs, sayNumber(a), P.plus, sayNumber(b)];
      if (lvl.pictures) {
        visual = el('div', 'visual-row');
        visual.append(group(item.e, a, Infinity, counter), el('span', 'op', '+'), group(item.e, b, Infinity, counter));
      }
    } else {
      const a = rand(2, lvl.max);
      const b = rand(1, a);
      answer = a - b;
      question = `${a} − ${b} = ?`;
      spoken = [P.whatIs, sayNumber(a), P.minus, sayNumber(b)];
      if (lvl.pictures) visual = group(item.e, a, a - b, counter);
    }

    task = { answer, mistakes: 0, done: false };

    const root = $('#task');
    root.replaceChildren();
    if (visual) {
      const wrap = el('div', 'visual');
      wrap.append(visual);
      root.append(wrap);
    }
    const qRow = el('div', 'question-row');
    qRow.append(el('div', 'question', question), speakerButton(...spoken));
    root.append(qRow);

    const choices = el('div', 'choices');
    const min = type === 'count' ? 1 : 0;
    makeChoices(answer, min, lvl.max, lvl.choices).forEach((v) => {
      const b = el('button', 'choice', String(v));
      b.addEventListener('click', () => {
        if (task.done || b.disabled) return;
        if (v === answer) {
          b.classList.add('right');
          finishTask([sayNumber(answer)]);
        } else {
          wrong(b);
          b.classList.add('wrong');
          b.disabled = true;
          if (visual) say(P.tryCounting);
        }
      });
      choices.append(b);
    });
    root.append(choices);
    say(...spoken);
  }

  // ---------- Mønstre ----------

  function shapePattern(lvl) {
    const unit = Array.from(pick(lvl.units)); // f.eks. ['A', 'A', 'B']
    const kinds = Array.from(new Set(unit));
    const symbols = shuffle(pick(PATTERN_THEMES)).slice(0, kinds.length + 1);
    const symbolOf = Object.fromEntries(kinds.map((k, i) => [k, symbols[i]]));
    // Mindst to hele gentagelser, så mønsteret kan ses.
    const length = unit.length * 2 + rand(0, unit.length - 1);
    const seq = Array.from({ length: length + 1 }, (_, i) => symbolOf[unit[i % unit.length]]);
    const answer = seq[length];
    const others = shuffle(symbols.filter((x) => x !== answer)).slice(0, 2);
    return { seq, missing: length, answer, choices: shuffle([answer, ...others]), unitLength: unit.length };
  }

  function numberPattern(lvl) {
    const step = pick(lvl.steps);
    const size = Math.abs(step);
    const max = size === 10 ? 100 : 20;
    const n = Math.min(lvl.shown, Math.floor(max / size) - 1);
    const span = size * n;
    // Startværdien vælges, så hele rækken holder sig mellem 0 og max.
    // Spring på 2, 5 og 10 starter i et tal, man "tæller med" (0, 2, 4 … / 5, 10 …).
    const startSlot = size === 1 ? rand(0, max - span) : size * rand(0, Math.floor((max - span) / size));
    const start = step > 0 ? startSlot : startSlot + span;
    const seq = Array.from({ length: n + 1 }, (_, i) => start + i * step);
    const missing = lvl.missingInside && Math.random() < 0.5 ? rand(1, n - 1) : n;
    const answer = seq[missing];
    return { seq, missing, answer, choices: makeChoices(answer, 0, max, 3, size >= 5 ? size : 1), step };
  }

  function patternTask() {
    const lvl = PATTERN_LEVELS[state.pattern.level - 1];
    const isNumber = lvl.type === 'number';
    const p = isNumber ? numberPattern(lvl) : shapePattern(lvl);
    task = { answer: p.answer, mistakes: 0, done: false };

    const prompt = p.missing === p.seq.length - 1 ? P.patternNext : P.patternMissing;
    const root = $('#task');
    root.replaceChildren();

    const row = el('div', 'seq' + (isNumber ? ' seq-numbers' : ''));
    let group = null;
    const cells = p.seq.map((v, i) => {
      // Figurmønstre samles i gentagelser, så rækken kun knækker mellem dem.
      if (!group || (p.unitLength && i % p.unitLength === 0)) {
        group = el('div', 'seq-group');
        row.append(group);
      }
      const c = el('div', 'seq-item', i === p.missing ? '?' : String(v));
      if (i === p.missing) c.classList.add('seq-q');
      group.append(c);
      return c;
    });
    const qRow = el('div', 'question-row');
    qRow.append(el('div', 'question question-small', prompt), speakerButton(prompt));
    root.append(row, qRow);

    const choices = el('div', 'choices');
    p.choices.forEach((v) => {
      const b = el('button', isNumber ? 'choice' : 'choice choice-emoji', String(v));
      b.addEventListener('click', () => {
        if (task.done || b.disabled) return;
        if (v === p.answer) {
          b.classList.add('right');
          const cell = cells[p.missing];
          cell.textContent = String(v);
          cell.classList.remove('seq-q');
          cell.classList.add('pop');
          finishTask(isNumber ? [sayNumber(v)] : []);
        } else {
          wrong(b);
          b.classList.add('wrong');
          b.disabled = true;
        }
      });
      choices.append(b);
    });
    root.append(choices);
    say(prompt);
  }

  // ---------- Voksen-indstillinger ----------

  const parentBtn = $('#parent-btn');
  let holdTimer = null;

  parentBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    parentBtn.classList.add('holding');
    holdTimer = setTimeout(() => {
      holdTimer = null;
      parentBtn.classList.remove('holding');
      open('parent');
    }, 1500);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => parentBtn.addEventListener(ev, () => {
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
      $('#parent-hint').hidden = false;
    }
    parentBtn.classList.remove('holding');
  }));
  parentBtn.addEventListener('contextmenu', (e) => e.preventDefault());

  function renderParent() {
    $('#set-name').value = state.settings.name;
    $('#set-upper').checked = state.settings.uppercase;
    $('#set-sound').checked = state.settings.sound;
    $('#spell-level-set').textContent = levelLabel('spell');
    $('#math-level-set').textContent = levelLabel('math');
    $('#pattern-level-set').textContent = levelLabel('pattern');
    $('#stats').textContent =
      `${state.stars} stjerner i alt · ${state.spell.done} staveopgaver · ${state.math.done} regneopgaver · ${state.pattern.done} mønstre`;
    $('#voice-status').textContent = `${audio.available.size} lydklip installeret.`;
  }

  $('#set-name').addEventListener('input', (e) => {
    state.settings.name = e.target.value.trim();
    save();
  });
  $('#set-upper').addEventListener('change', (e) => {
    state.settings.uppercase = e.target.checked;
    save();
  });
  $('#set-sound').addEventListener('change', (e) => {
    state.settings.sound = e.target.checked;
    save();
  });
  $('#test-voice').addEventListener('click', () => {
    say(P.hello);
  });
  document.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => {
    const a = b.dataset.step;
    const p = state[a];
    p.level = Math.min(Math.max(1, p.level + Number(b.dataset.dir)), LEVELS[a].length);
    p.streak = 0;
    p.misses = 0;
    save();
    renderParent();
  }));
  // To tryk for at nulstille, så det ikke sker ved et uheld.
  const resetBtn = $('#reset');
  const resetLabel = resetBtn.textContent;
  let resetArmed = null;
  resetBtn.addEventListener('click', () => {
    if (!resetArmed) {
      resetBtn.textContent = 'Tryk igen for at nulstille';
      resetArmed = setTimeout(() => {
        resetArmed = null;
        resetBtn.textContent = resetLabel;
      }, 4000);
      return;
    }
    clearTimeout(resetArmed);
    resetArmed = null;
    resetBtn.textContent = resetLabel;
    state = { ...defaultState(), settings: state.settings };
    save();
    renderParent();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopSpeech();
  });

  // ---------- Start ----------

  setAudioUi(false);
  show('home');

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
