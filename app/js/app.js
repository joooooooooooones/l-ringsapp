'use strict';

(function () {
  const { WORDS, LETTERS, SPELL_LEVELS, MATH_LEVELS, PATTERN_LEVELS, PATTERN_THEMES, COUNT_ITEMS, PRAISE, STICKERS } = window.DATA;
  const L = window.LOGIC;
  const STORE_KEY = 'stav-og-regn-v1';
  const LEVELS = { spell: SPELL_LEVELS, math: MATH_LEVELS, pattern: PATTERN_LEVELS };
  const LEVEL_COUNTS = { spell: SPELL_LEVELS.length, math: MATH_LEVELS.length, pattern: PATTERN_LEVELS.length };

  // ---------- Gemt tilstand (kun på enheden, ingen server) ----------

  function load() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) { /* tom eller ødelagt lagring: start forfra */ }
    return L.normalizeState(saved, LEVEL_COUNTS);
  }

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignorer */ }
  }

  let state = load();

  // ---------- Hjælpere ----------

  const $ = (sel) => document.querySelector(sel);
  const rng = () => Math.random();
  const rand = (min, max) => L.rand(rng, min, max);
  const pick = (arr) => L.pick(rng, arr);

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
  let round = null; // den igangværende runde på 10 opgaver
  let nextTimer = null;
  let lookTimer = null; // Ugens ord: skjuler ordet efter 6 sekunder
  let peekTimer = null; // Ugens ord: "Kig igen"

  function clearTaskTimers() {
    clearTimeout(nextTimer);
    clearTimeout(lookTimer);
    clearTimeout(peekTimer);
  }

  // Nyt indhold under fingeren må ikke fange resten af et dobbelttryk.
  function armTask() {
    const root = $('#task');
    root.classList.add('arming');
    setTimeout(() => root.classList.remove('arming'), 400);
  }

  function show(name) {
    document.querySelectorAll('.screen').forEach((s) => { s.hidden = s.id !== 'screen-' + name; });
    if (name === 'play' && area) document.body.dataset.area = area;
    else delete document.body.dataset.area;
    if (name !== 'play') {
      clearTaskTimers();
      stopSpeech();
    }
    if (name === 'home') {
      renderHome();
      if (typeof reloadIfHome === 'function') setTimeout(reloadIfHome, 0);
    }
    if (name === 'home' || name === 'parent') updateInstallUi();
    if (name === 'parent') renderParent();
    if (name === 'album') renderAlbum();
  }

  // Android-tilbageknappen skal føre hjem i stedet for at lukke appen.
  function open(name) {
    show(name);
    history.pushState({ screen: name }, '');
  }
  // leaving forhindrer, at et dobbelttryk på Hjem går to skridt tilbage og lukker appen.
  let leaving = false;
  function goHome() {
    if (leaving) return;
    if (history.state && history.state.screen) {
      leaving = true;
      history.back();
    } else show('home');
  }
  window.addEventListener('popstate', () => {
    leaving = false;
    show('home');
  });
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
    for (const a of Object.keys(LEVELS)) {
      $(`#${a}-level-label`).textContent = levelLabel(a);
      // Én prik pr. niveau; de nåede niveauer er fyldt ud.
      const pips = $(`#${a}-pips`);
      pips.replaceChildren(...LEVELS[a].map((_, i) => el('span', i < state[a].level ? 'pip on' : 'pip')));
    }
    $('#parent-hint').hidden = true;
    updateStars();
    $('#album-count').textContent = state.stickers.length;
    const n = state.customWords.length;
    $('#go-words').hidden = n === 0;
    $('#words-level-label').textContent = `${n} ord at øve`;
    $('#album-new').hidden = !(state.stickersSeen < state.stickers.length);
  }

  $('#go-spell').addEventListener('click', () => startArea('spell'));
  $('#go-math').addEventListener('click', () => startArea('math'));
  $('#go-pattern').addEventListener('click', () => startArea('pattern'));
  $('#go-album').addEventListener('click', () => open('album'));
  $('#go-words').addEventListener('click', () => startArea('words'));

  function startArea(a) {
    area = a;
    round = L.newRound(a);
    open('play');
    nextTask();
  }

  // ---------- Fælles for opgaver ----------

  function nextTask() {
    clearTaskTimers();
    $('#feedback').textContent = '';
    renderRound();
    if (area === 'spell') spellTask();
    else if (area === 'math') mathTask();
    else if (area === 'words') wordsTask();
    else patternTask();
    armTask();
  }

  // Fremdriftslinje øverst: ét felt pr. opgave i runden.
  function renderRound() {
    const bar = $('#round');
    const done = round.done >= L.ROUND_LENGTH;
    bar.replaceChildren(
      ...Array.from({ length: L.ROUND_LENGTH }, (_, i) => el('span', i < round.done ? 'seg on' : i === round.done ? 'seg now' : 'seg')),
      el('span', done ? 'round-goal on' : 'round-goal', '🏆'),
    );
    bar.setAttribute('aria-label', `Opgave ${Math.min(round.done + 1, L.ROUND_LENGTH)} af ${L.ROUND_LENGTH}`);
  }

  // spoken: det der skal siges før rosen, f.eks. ordet der lige er stavet.
  function finishTask(spoken) {
    const done = task;
    done.done = true;
    // Alt gemmes her og nu – også runde og klistermærker, hvis det var den 10. opgave.
    const { change, roundDone, won } = L.completeTask(state, {
      area,
      round,
      word: area === 'spell' || area === 'words' ? done.word : null,
      firstTry: done.mistakes === 0,
      levelCount: LEVEL_COUNTS[area] || 0,
      date: L.localDate(new Date()),
      rng,
      catalog: STICKERS,
    });
    save();
    updateStars();
    renderRound();
    let msg, praise;
    if (change > 0) {
      praise = P.newLevel;
      msg = 'Nyt niveau!';
      sfx('level');
      celebrate(30);
    } else {
      praise = pick(PRAISE);
      const name = state.settings.name;
      msg = name && Math.random() < 0.4 ? `${praise.replace(/!$/, '')}, ${name}!` : praise;
      sfx('good');
      celebrate(12);
    }
    showFeedback(msg, change > 0);
    // Vent til oplæsningen er færdig, før næste opgave kommer.
    const minWait = change > 0 ? 2800 : 1900;
    say(...spoken, praise).then((secs) => {
      if (task !== done || $('#screen-play').hidden) return;
      nextTimer = setTimeout(roundDone ? () => showRoundEnd(won) : nextTask, Math.max(minWait, secs * 1000 + 600));
    });
  }

  // Afslutning på en runde: ros, hvad der er lavet, og to tydelige valg.
  // Runden og klistermærkerne er allerede gemt i finishTask; her vises de bare.
  function showRoundEnd(wonIds) {
    const r = round;
    const won = wonIds.map((id) => STICKERS.find((st) => st.id === id));
    $('#feedback').textContent = '';
    const name = state.settings.name;
    const box = el('div', 'round-end');
    const stars = el('div', 'round-stars');
    stars.setAttribute('aria-label', `${r.done} stjerner`);
    for (let i = 0; i < r.done; i++) stars.append(el('span', 'round-star', '⭐'));
    const again = el('button', `big-action ${r.area}`, '🔁 Én runde mere');
    again.addEventListener('click', () => {
      round = L.newRound(r.area);
      nextTask();
    });
    const home = el('button', 'small-btn round-home', '🏠 Hjem');
    home.addEventListener('click', goHome);
    const actions = el('div', 'round-actions');
    actions.append(again, home);
    const praiseCol = el('div', 'round-col');
    const rewardCol = el('div', 'round-col');
    praiseCol.append(
      el('div', 'round-trophy', '🏆'),
      el('h2', 'round-title', name ? `Flot klaret, ${name}!` : 'Flot klaret!'),
      stars,
      el('p', 'round-sub', `${r.done} opgaver · ${r.firstTry} rigtige i første forsøg`),
    );
    box.append(praiseCol, rewardCol);
    if (won.length) {
      const reveal = el('button', 'sticker-reveal');
      reveal.setAttribute('aria-label', 'Se albummet');
      const row = el('div', 'sticker-reveal-row');
      won.forEach((st) => {
        const item = el('div', 'sticker-reveal-item');
        item.append(el('span', 'sticker-big', st.e), el('span', 'sticker-name', st.name));
        row.append(item);
      });
      reveal.append(el('span', 'sticker-reveal-title', won.length > 1 ? 'Perfekt runde! 2 nye klistermærker' : 'Nyt klistermærke!'), row);
      reveal.addEventListener('click', () => open('album'));
      rewardCol.append(reveal);
    }
    rewardCol.append(actions);
    $('#task').replaceChildren(box);
    armTask();
    sfx('level');
    celebrate(40);
    say(P.roundDone, ...(won.length ? [P.newSticker, ...won.map((st) => st.name)] : []));
    again.focus();
  }

  // Ros som et banner med flueben under opgaven.
  function showFeedback(msg, level) {
    const pill = el('span', level ? 'feedback-pill level' : 'feedback-pill');
    pill.append(el('span', 'feedback-check', level ? '★' : '✓'), el('span', null, msg));
    $('#feedback').replaceChildren(pill);
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

  function spellTask() {
    const lvl = SPELL_LEVELS[state.spell.level - 1];
    const w = L.pickWord(rng, lvl.pool.flatMap((p) => WORDS[p]), recentWords, state.wordStats);
    const t = L.spellTask(rng, lvl, w, LETTERS);
    const letters = t.letters;
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
    // Kort, synlig instruktion – til forælderen der læser med, og når lyden er slået fra.
    const prompt = el('p', 'task-prompt', lvl.mode === 'first' ? P.firstLetter : P.spell);
    root.append(pictureRow, prompt, slots, tiles);

    if (lvl.mode === 'first') {
      slots.children[0].textContent = '?';
      slots.children[0].classList.add('current');
      for (let i = 1; i < letters.length; i++) {
        slots.children[i].textContent = fmt(letters[i]);
        slots.children[i].classList.add('given');
      }
      t.tiles.forEach((l) => {
        const tile = el('button', 'tile', fmt(l));
        tile.addEventListener('click', () => onFirstLetter(tile, l, slots));
        tiles.append(tile);
      });
      say(w.word, P.firstLetter);
    } else {
      slots.children[0].classList.add('current');
      t.tiles.forEach((l) => {
        const tile = el('button', 'tile', fmt(l));
        tile.dataset.letter = l;
        tile.addEventListener('click', () => onBuildLetter(tile, l, slots, tiles));
        tiles.append(tile);
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
      slot.classList.remove('peeking');
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

  // ---------- Ugens ord: se, husk, stav ----------

  const recentCustom = [];

  function wordsTask() {
    if (!state.customWords.length) return goHome();
    const w = L.pickWord(rng, state.customWords, recentCustom, state.wordStats);
    const t = L.spellTask(rng, { mode: 'build', extra: 3 }, w, LETTERS);
    task = { word: w.word, letters: t.letters, mistakes: 0, pos: 0, wrongHere: 0, done: false };

    const root = $('#task');
    root.replaceChildren();

    // 1. Se: ordet vises stort, indtil barnet er klar (eller efter 6 sekunder).
    const look = el('div', 'look-card');
    const shown = el('div', 'look-word', t.letters.map(fmt).join(''));
    const ready = el('button', 'big-action words', 'Klar! 🙈');
    look.append(el('p', 'look-title', 'Kig godt på ordet'), shown, ready);
    root.append(look);
    say(P.lookAtWord, w.word);
    const myTask = task;
    const start = () => {
      if (task !== myTask || myTask.started || myTask.done || $('#screen-play').hidden) return;
      myTask.started = true;
      clearTimeout(lookTimer);
      buildFromMemory(t);
      armTask();
    };
    lookTimer = setTimeout(start, 6000);
    ready.addEventListener('click', start);
    ready.focus();
  }

  // 2.-3. Husk og stav: ordet er skjult; "Kig igen" viser det kort (tæller som hjælp).
  function buildFromMemory(t) {
    const root = $('#task');
    root.replaceChildren();
    const peek = el('button', 'small-btn peek', '👀 Kig igen');
    const slots = el('div', 'slots');
    t.letters.forEach(() => slots.append(el('div', 'slot')));
    slots.children[0].classList.add('current');
    const tiles = el('div', 'tiles');
    t.tiles.forEach((l) => {
      const tile = el('button', 'tile', fmt(l));
      tile.dataset.letter = l;
      tile.addEventListener('click', () => onBuildLetter(tile, l, slots, tiles));
      tiles.append(tile);
    });
    peek.addEventListener('click', () => {
      if (task.done) return;
      task.mistakes++; // hjælp tæller ikke som rigtig i første forsøg
      clearTimeout(peekTimer);
      t.letters.forEach((l, i) => {
        const s = slots.children[i];
        if (!s.classList.contains('filled')) {
          s.textContent = fmt(l);
          s.classList.add('peeking');
        }
      });
      peekTimer = setTimeout(() => {
        Array.from(slots.children).forEach((s) => {
          if (s.classList.contains('peeking')) {
            s.textContent = '';
            s.classList.remove('peeking');
          }
        });
      }, 1800);
    });
    root.append(el('p', 'look-title', P.spellFromMemory), slots, tiles, peek);
    say(P.spellFromMemory);
    tiles.firstChild.focus();
  }

  // ---------- Regne ----------

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
    const m = L.mathTask(rng, lvl, COUNT_ITEMS);
    const { type, item, a, b, answer } = m;
    const counter = { n: 0 };
    let question, spoken, visual = null;

    if (type === 'count') {
      question = 'Hvor mange?';
      spoken = [`Hvor mange ${item.pl}?`];
      visual = group(item.e, answer, Infinity, counter);
    } else if (type === 'add') {
      question = `${a} + ${b} = ?`;
      spoken = [P.whatIs, sayNumber(a), P.plus, sayNumber(b)];
      if (m.pictures) {
        visual = el('div', 'visual-row');
        visual.append(group(item.e, a, Infinity, counter), el('span', 'op', '+'), group(item.e, b, Infinity, counter));
      }
    } else {
      question = `${a} − ${b} = ?`;
      spoken = [P.whatIs, sayNumber(a), P.minus, sayNumber(b)];
      if (m.pictures) visual = group(item.e, a, a - b, counter);
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
    qRow.append(el('div', type === 'count' ? 'question question-small' : 'question', question), speakerButton(...spoken));
    root.append(qRow);

    const choices = el('div', 'choices');
    m.choices.forEach((v) => {
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

  function patternTask() {
    const lvl = PATTERN_LEVELS[state.pattern.level - 1];
    const p = L.patternTask(rng, lvl, PATTERN_THEMES);
    const isNumber = p.isNumber;
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

  // ---------- Album ----------

  function renderAlbum() {
    const box = $('#album');
    box.replaceChildren();
    const owned = new Set(state.stickers);
    const fresh = new Set(state.stickers.slice(state.stickersSeen || 0));
    $('#album-total').textContent = `${owned.size} af ${STICKERS.length}`;
    if (!owned.size) {
      const empty = el('div', 'album-empty');
      empty.append(el('div', 'album-empty-icon', '📒'), el('p', null, 'Albummet er tomt. Lav en runde på 10 opgaver, så får du dit første klistermærke!'));
      box.append(empty);
    }
    const themes = Array.from(new Set(STICKERS.map((st) => st.theme)));
    for (const theme of themes) {
      const list = STICKERS.filter((st) => st.theme === theme);
      const got = list.filter((st) => owned.has(st.id)).length;
      const section = el('section', 'album-theme');
      section.append(el('h3', null, `${theme} · ${got}/${list.length}`));
      const grid = el('div', 'album-grid');
      for (const st of list) {
        const has = owned.has(st.id);
        const cell = el('button', 'sticker' + (has ? '' : ' missing') + (fresh.has(st.id) ? ' fresh' : ''));
        cell.append(el('span', 'sticker-emoji', st.e), el('span', 'sticker-label', has ? st.name : '?'));
        cell.setAttribute('aria-label', has ? st.name : 'Ikke fundet endnu');
        if (has) {
          cell.addEventListener('click', () => {
            cell.classList.remove('pop');
            void cell.offsetWidth;
            cell.classList.add('pop');
            say(st.name);
          });
        } else {
          cell.disabled = true;
        }
        grid.append(cell);
      }
      section.append(grid);
      box.append(section);
    }
    // Nye klistermærker er nu set.
    state.stickersSeen = state.stickers.length;
    save();
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
    renderWeek();
    renderCustomWords();
    $('#stats').textContent =
      `I alt: ${state.stars} stjerner · ${state.spell.done} staveopgaver · ${state.math.done} regneopgaver · ${state.pattern.done} mønstre · ${state.stickers.length} klistermærker`;
    // Kun ord der kan komme lige nu (stave-niveauets ordliste + ugens ord), så listen passer med teksten.
    const practicable = new Set([
      ...SPELL_LEVELS[state.spell.level - 1].pool.flatMap((p) => WORDS[p]).map((w) => w.word),
      ...state.customWords.map((w) => w.word),
    ]);
    const hard = L.hardWords(state, practicable);
    const chips = $('#hard-words');
    chips.replaceChildren(...hard.slice(0, 24).map((h) => {
      const c = el('span', 'chip');
      c.append(el('strong', null, h.word), el('span', 'chip-count', `${h.misses}× fejl/hjælp`));
      return c;
    }));
    if (!hard.length) chips.append(el('p', 'note', 'Ingen svære ord lige nu. 🎉'));
    $('#voice-status').textContent = `${audio.available.size} lydklip installeret.`;
  }

  const AREA_NAMES = { spell: 'Stave', math: 'Regne', pattern: 'Mønstre', words: 'Ugens ord' };
  const DAY_NAMES = ['søn', 'man', 'tir', 'ons', 'tor', 'fre', 'lør'];

  // Søjler for runder pr. dag de sidste 7 dage + rigtige i første forsøg pr. område.
  function renderWeek() {
    const today = new Date();
    const w = L.weekSummary(state.history, today);
    const max = Math.max(1, ...w.days.map((d) => d.rounds));
    const week = $('#week');
    week.setAttribute('aria-label', 'Runder pr. dag: ' + w.days.map((d) => `${d.date} ${d.rounds}`).join(', '));
    week.replaceChildren(...w.days.map((d, i) => {
      const col = el('div', 'week-day' + (i === 6 ? ' today' : ''));
      const bar = el('div', 'week-bar');
      bar.style.height = `${Math.round((d.rounds / max) * 100)}%`;
      const [y, m, day] = d.date.split('-').map(Number);
      const label = i === 6 ? 'i dag' : DAY_NAMES[new Date(y, m - 1, day).getDay()];
      col.append(el('span', 'week-count', d.rounds ? String(d.rounds) : ''), el('div', 'week-track'), el('span', 'week-label', label));
      col.querySelector('.week-track').append(bar);
      return col;
    }));
    const stats = $('#area-stats');
    const rows = Object.entries(w.areas);
    stats.replaceChildren(...rows.map(([a, s]) => {
      const pct = Math.round((s.firstTry / s.tasks) * 100);
      const row = el('div', `area-stat ${a}`);
      const meter = el('div', 'meter');
      const fill = el('div', 'meter-fill');
      fill.style.width = `${pct}%`;
      meter.append(fill);
      row.append(
        el('span', 'area-stat-name', AREA_NAMES[a] || a),
        el('span', 'area-stat-rounds', `${s.rounds} ${s.rounds === 1 ? 'runde' : 'runder'}`),
        meter,
        el('span', 'area-stat-pct', `${pct} %`),
      );
      return row;
    }));
    if (!rows.length) stats.append(el('p', 'note', 'Ingen afsluttede runder de sidste 7 dage. En runde er 10 opgaver.'));
    else stats.prepend(el('p', 'note area-stat-head', 'Rigtige i første forsøg'));
  }

  function renderCustomWords() {
    const list = $('#custom-words');
    list.replaceChildren(...state.customWords.map(({ word }) => {
      const c = el('span', 'chip words-chip');
      const remove = el('button', 'chip-remove', '×');
      remove.setAttribute('aria-label', `Fjern ${word}`);
      remove.addEventListener('click', () => {
        L.removeCustomWord(state, word);
        forgetCustomStats([word]);
        save();
        renderCustomWords();
      });
      c.append(el('strong', null, word), remove);
      return c;
    }));
    const n = state.customWords.length;
    $('#words-note').textContent = n
      ? `${n} ord. De øves under "Ugens ord" på forsiden: ordet vises, skjules og staves med brikker. Egne ord bliver ikke læst op, så læs gerne ordet højt sammen med barnet.`
      : 'Skriv ugens ord fra skolen, så kan de øves under "Ugens ord" på forsiden.';
    $('#clear-words').hidden = n === 0;
  }

  $('#word-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('#word-input');
    const r = L.addCustomWord(state, input.value);
    const err = $('#word-error');
    if (!r.ok) {
      err.textContent = r.error;
      err.hidden = false;
      input.setAttribute('aria-invalid', 'true');
      return;
    }
    err.hidden = true;
    input.removeAttribute('aria-invalid');
    input.value = '';
    input.focus();
    save();
    renderCustomWords();
  });
  $('#word-input').addEventListener('input', () => {
    $('#word-error').hidden = true;
    $('#word-input').removeAttribute('aria-invalid');
  });

  // Ugens ord der ikke også står i de faste ordlister, mister deres statistik, når de fjernes.
  const FIXED_WORDS = new Set(Object.values(WORDS).flat().map((w) => w.word));
  function forgetCustomStats(words) {
    for (const w of words) if (!FIXED_WORDS.has(w)) delete state.wordStats[w];
  }

  // Knap der kræver to tryk inden for 4 sekunder, så den ikke rammes ved et uheld.
  function twoTapButton(btn, confirmLabel, action) {
    const label = btn.textContent;
    let armed = null;
    btn.addEventListener('click', () => {
      if (!armed) {
        btn.textContent = confirmLabel;
        armed = setTimeout(() => {
          armed = null;
          btn.textContent = label;
        }, 4000);
        return;
      }
      clearTimeout(armed);
      armed = null;
      btn.textContent = label;
      action();
    });
  }

  twoTapButton($('#clear-words'), 'Tryk igen for at rydde listen', () => {
    forgetCustomStats(state.customWords.map((w) => w.word));
    state.customWords = [];
    save();
    renderCustomWords();
  });

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
  twoTapButton($('#reset'), 'Tryk igen for at nulstille', () => {
    state = { ...L.defaultState(), settings: state.settings, customWords: state.customWords };
    save();
    renderParent();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopSpeech();
  });

  // ---------- Installér appen ----------
  //
  // Chrome/Edge på Android sender beforeinstallprompt: så åbner knappen browserens egen dialog.
  // Andre browsere (Samsung Internet, Firefox, iPad) får en kort vejledning til netop dem.

  const INSTALL_HIDE_KEY = 'stav-og-regn-install-skjult';
  let deferredInstall = null;

  const isInstalled = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  function installHidden() {
    try { return localStorage.getItem(INSTALL_HIDE_KEY) === '1'; } catch (e) { return false; }
  }

  function updateInstallUi() {
    const installed = isInstalled();
    const label = deferredInstall ? '📲 Installér appen' : '📲 Sådan installerer du appen';
    $('#install-bar').hidden = installed || installHidden();
    $('#install-btn').textContent = label;
    const parentBtn = $('#install-btn-parent');
    parentBtn.hidden = installed;
    parentBtn.textContent = label;
    $('#install-status').textContent = installed
      ? 'Appen er installeret og kører fra startskærmen. 👍'
      : deferredInstall
        ? 'Browseren er klar til at installere appen.'
        : 'Lægges på startskærmen via browserens menu – se vejledningen.';
  }

  async function installApp() {
    if (deferredInstall) {
      const prompt = deferredInstall;
      deferredInstall = null;
      prompt.prompt();
      try { await prompt.userChoice; } catch (e) { /* dialogen blev lukket */ }
      updateInstallUi();
      return;
    }
    const guide = L.installGuide(navigator.userAgent);
    $('#install-browser').textContent = `Sådan gør du i ${guide.browser}:`;
    $('#install-steps').replaceChildren(...guide.steps.map((step) => el('li', null, step)));
    const dlg = $('#install-help');
    if (dlg.showModal) dlg.showModal();
    else dlg.setAttribute('open', '');
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // vi viser vores egen knap i stedet for browserens banner
    deferredInstall = e;
    updateInstallUi();
  });
  window.addEventListener('appinstalled', () => {
    deferredInstall = null;
    updateInstallUi();
  });
  $('#install-btn').addEventListener('click', installApp);
  $('#install-btn-parent').addEventListener('click', installApp);
  $('#install-later').addEventListener('click', () => {
    try { localStorage.setItem(INSTALL_HIDE_KEY, '1'); } catch (e) { /* ignorer */ }
    updateInstallUi();
  });
  $('#install-help-close').addEventListener('click', () => {
    const dlg = $('#install-help');
    if (dlg.close) dlg.close();
    else dlg.removeAttribute('open');
  });

  // ---------- Start ----------

  setAudioUi(false);
  show('home');

  // Ny version: når en ny service worker har overtaget, genindlæses appen, så snart barnet
  // er på forsiden (aldrig midt i en opgave). Ellers ville en installeret app blive på den
  // gamle version, til den blev lukket helt.
  let updateReady = false;
  function reloadIfHome() {
    if (updateReady && !$('#screen-home').hidden) location.reload();
  }

  if ('serviceWorker' in navigator) {
    const hadController = !!navigator.serviceWorker.controller; // false ved allerførste besøg
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController) return;
      updateReady = true;
      reloadIfHome();
    });
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
