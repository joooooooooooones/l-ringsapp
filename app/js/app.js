'use strict';

(function () {
  const { WORDS, LETTERS, SPELL_LEVELS, MATH_LEVELS, COUNT_ITEMS, PRAISE } = window.DATA;
  const STORE_KEY = 'stav-og-regn-v1';
  const LEVEL_UP_AFTER = 5; // rigtige i første forsøg i træk
  const LEVEL_DOWN_AFTER = 3; // opgaver med fejl i træk
  const LEVELS = { spell: SPELL_LEVELS, math: MATH_LEVELS };

  // ---------- Gemt tilstand (kun på enheden, ingen server) ----------

  function defaultState() {
    return {
      stars: 0,
      settings: { uppercase: true, sound: true, name: '' },
      spell: { level: 1, streak: 0, misses: 0, done: 0 },
      math: { level: 1, streak: 0, misses: 0, done: 0 },
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
        };
      }
    } catch (e) { /* tom eller ødelagt lagring: start forfra */ }
    return d;
  }

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignorer */ }
  }

  let state = load();
  for (const area of ['spell', 'math']) {
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

  // ---------- Lyd: oplæsning og små lydeffekter ----------

  const hasSpeech = 'speechSynthesis' in window;
  let danishVoice = null;

  function pickVoice() {
    if (!hasSpeech) return;
    danishVoice = speechSynthesis.getVoices().find((v) => (v.lang || '').toLowerCase().startsWith('da')) || null;
  }
  if (hasSpeech) {
    pickVoice();
    speechSynthesis.onvoiceschanged = pickVoice;
  }

  function say(text) {
    if (!state.settings.sound || !hasSpeech) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'da-DK';
    if (danishVoice) u.voice = danishVoice;
    u.rate = 0.85;
    speechSynthesis.speak(u);
  }

  let audioCtx = null;
  function beep(kind) {
    if (!state.settings.sound) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const notes = { good: [660, 880], level: [523, 659, 784, 1047], bad: [200] }[kind];
      notes.forEach((freq, i) => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = kind === 'bad' ? 'triangle' : 'sine';
        o.frequency.value = freq;
        const t = audioCtx.currentTime + i * 0.12;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.2, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
        o.connect(g).connect(audioCtx.destination);
        o.start(t);
        o.stop(t + 0.3);
      });
    } catch (e) { /* ingen lyd tilgængelig */ }
  }

  // ---------- Skærme og navigation ----------

  let area = null; // 'spell' eller 'math'
  let task = null;
  let nextTimer = null;

  function show(name) {
    document.querySelectorAll('.screen').forEach((s) => { s.hidden = s.id !== 'screen-' + name; });
    if (name !== 'play') {
      clearTimeout(nextTimer);
      if (hasSpeech) speechSynthesis.cancel();
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
    $('#parent-hint').hidden = true;
    updateStars();
  }

  $('#go-spell').addEventListener('click', () => startArea('spell'));
  $('#go-math').addEventListener('click', () => startArea('math'));

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
    else mathTask();
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

  function praise() {
    const p = pick(PRAISE);
    const name = state.settings.name;
    return name && Math.random() < 0.4 ? `${p.replace(/!$/, '')}, ${name}!` : p;
  }

  function finishTask(spokenPrefix) {
    task.done = true;
    state.stars++;
    const change = recordResult(area, task.mistakes === 0);
    updateStars();
    renderStreak();
    let msg;
    if (change > 0) {
      msg = 'Nyt niveau! 🎉';
      beep('level');
      celebrate(30);
      say((spokenPrefix ? spokenPrefix + '. ' : '') + 'Nyt niveau!');
    } else {
      msg = praise();
      beep('good');
      celebrate(12);
      say((spokenPrefix ? spokenPrefix + '. ' : '') + msg);
    }
    $('#feedback').textContent = msg;
    nextTimer = setTimeout(nextTask, change > 0 ? 2800 : 1900);
  }

  function wrong(btn) {
    task.mistakes++;
    beep('bad');
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

  function speakerButton(text) {
    const b = el('button', 'icon-btn speak', '🔊');
    b.setAttribute('aria-label', 'Hør igen');
    b.addEventListener('click', () => say(text));
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
      say(`Hvad starter ${w.word} med?`);
    } else {
      slots.children[0].classList.add('current');
      const distractors = shuffle(LETTERS.filter((l) => !letters.includes(l))).slice(0, lvl.extra);
      shuffle([...letters, ...distractors]).forEach((l) => {
        const t = el('button', 'tile', fmt(l));
        t.dataset.letter = l;
        t.addEventListener('click', () => onBuildLetter(t, l, slots, tiles));
        tiles.append(t);
      });
      say(`Stav til ${w.word}`);
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
      finishTask(task.word);
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
        finishTask(task.word);
      } else {
        slots.children[task.pos].classList.add('current');
        say(letter);
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

  function makeChoices(answer, min, max, n) {
    const set = new Set([answer]);
    for (const o of shuffle([-1, 1, -2, 2, -3, 3])) {
      if (set.size >= n) break;
      const v = answer + o;
      if (v >= min && v <= max) set.add(v);
    }
    let guard = 0;
    while (set.size < n && guard++ < 100) set.add(rand(min, max));
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
          say(String(counter.n));
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
    let answer, question, spoken, solved, visual = null;

    if (type === 'count') {
      answer = rand(1, lvl.max);
      question = 'Hvor mange?';
      spoken = `Hvor mange ${item.pl}?`;
      solved = `${answer} ${item.pl}`;
      visual = group(item.e, answer, Infinity, counter);
    } else if (type === 'add') {
      const a = rand(1, lvl.max - 1);
      const b = rand(1, lvl.max - a);
      answer = a + b;
      question = `${a} + ${b} = ?`;
      spoken = `Hvad er ${a} plus ${b}?`;
      solved = `${a} plus ${b} er ${answer}`;
      if (lvl.pictures) {
        visual = el('div', 'visual-row');
        visual.append(group(item.e, a, Infinity, counter), el('span', 'op', '+'), group(item.e, b, Infinity, counter));
      }
    } else {
      const a = rand(2, lvl.max);
      const b = rand(1, a);
      answer = a - b;
      question = `${a} − ${b} = ?`;
      spoken = `Hvad er ${a} minus ${b}?`;
      solved = `${a} minus ${b} er ${answer}`;
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
    qRow.append(el('div', 'question', question), speakerButton(spoken));
    root.append(qRow);

    const choices = el('div', 'choices');
    const min = type === 'count' ? 1 : 0;
    makeChoices(answer, min, lvl.max, lvl.choices).forEach((v) => {
      const b = el('button', 'choice', String(v));
      b.addEventListener('click', () => {
        if (task.done || b.disabled) return;
        if (v === answer) {
          b.classList.add('right');
          finishTask(solved);
        } else {
          wrong(b);
          b.classList.add('wrong');
          b.disabled = true;
          if (visual) say('Prøv at tælle');
        }
      });
      choices.append(b);
    });
    root.append(choices);
    say(spoken);
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
    $('#stats').textContent =
      `${state.stars} stjerner i alt · ${state.spell.done} staveopgaver · ${state.math.done} regneopgaver`;
    pickVoice();
    $('#voice-status').textContent = !hasSpeech
      ? 'Denne browser kan ikke læse op.'
      : danishVoice
        ? `Dansk stemme fundet (${danishVoice.name}).`
        : 'Ingen dansk stemme fundet endnu. Tryk "Test stemmen". Hvis den taler forkert sprog: Android-indstillinger → Tekst-til-tale → Google → installér dansk.';
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
    say(`Hej ${state.settings.name || 'med dig'}! Nu skal vi lære at stave og regne.`);
    setTimeout(renderParent, 500);
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
  $('#reset').addEventListener('click', () => {
    if (!confirm('Vil du nulstille alle stjerner og niveauer?')) return;
    state = { ...defaultState(), settings: state.settings };
    save();
    renderParent();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && hasSpeech) speechSynthesis.cancel();
  });

  // ---------- Start ----------

  show('home');

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
