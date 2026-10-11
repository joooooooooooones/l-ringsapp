'use strict';

// Appens regler uden skærm: opgaver, svarmuligheder, niveauskift og gemt tilstand.
// Alle tilfældige valg går gennem rng (en funktion der giver et tal i [0, 1)),
// så logikken kan testes med et fast frø i Node (se tests/).
(function (root, factory) {
  const lib = factory();
  if (typeof module === 'object' && module.exports) module.exports = lib;
  else root.LOGIC = lib;
})(typeof self !== 'undefined' ? self : this, () => {
  const LEVEL_UP_AFTER = 5; // rigtige i første forsøg i træk
  const LEVEL_DOWN_AFTER = 3; // opgaver med fejl i træk
  const AREAS = ['spell', 'math', 'pattern'];
  const ROUND_LENGTH = 10; // opgaver i én runde
  const HISTORY_MAX = 300; // så mange afsluttede runder gemmes

  const rand = (rng, min, max) => Math.floor(rng() * (max - min + 1)) + min;
  const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

  function shuffle(rng, arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // ---------- Gemt tilstand ----------

  function defaultState() {
    return {
      stars: 0,
      settings: { uppercase: true, sound: true, name: '' },
      spell: { level: 1, streak: 0, misses: 0, done: 0 },
      math: { level: 1, streak: 0, misses: 0, done: 0 },
      pattern: { level: 1, streak: 0, misses: 0, done: 0 },
      history: [], // afsluttede runder: { date: 'ÅÅÅÅ-MM-DD', area, total, firstTry }
      stickers: [], // id'er på klistermærker i albummet, i den rækkefølge de er vundet
      stickersSeen: 0, // så mange af stickers er set i albummet (resten vises som nye)
      wordStats: {}, // pr. ord: { seen, misses, okInRow } – bruges til at øve de svære ord igen
    };
  }

  // Fletter gemte data ind i standardværdierne, så ældre gemte data stadig kan åbnes.
  function normalizeState(saved, levelCounts) {
    const d = defaultState();
    const s = saved && typeof saved === 'object' ? saved : {};
    const state = { ...d, ...s, settings: { ...d.settings, ...s.settings } };
    state.stickers = Array.isArray(s.stickers) ? Array.from(new Set(s.stickers.filter((x) => typeof x === 'string'))) : [];
    state.stickersSeen = Math.min(Number.isInteger(s.stickersSeen) ? s.stickersSeen : state.stickers.length, state.stickers.length);
    state.wordStats = {};
    if (s.wordStats && typeof s.wordStats === 'object') {
      for (const [w, v] of Object.entries(s.wordStats)) {
        if (v && typeof v === 'object') state.wordStats[w] = { seen: v.seen | 0, misses: v.misses | 0, okInRow: v.okInRow | 0 };
      }
    }
    state.history = Array.isArray(s.history) ? s.history.filter((r) => r && typeof r.date === 'string') : [];
    for (const area of AREAS) {
      state[area] = { ...d[area], ...s[area] };
      const max = levelCounts ? levelCounts[area] : Infinity;
      state[area].level = Math.min(Math.max(1, state[area].level), max);
    }
    return state;
  }

  // ---------- Niveauskift ----------

  // Ændrer progress og returnerer +1 ved nyt niveau, -1 ved lavere niveau, ellers 0.
  function recordResult(progress, maxLevel, firstTry) {
    const p = progress;
    p.done++;
    if (firstTry) {
      p.streak++;
      p.misses = 0;
      if (p.streak >= LEVEL_UP_AFTER && p.level < maxLevel) {
        p.level++;
        p.streak = 0;
        return 1;
      }
    } else {
      p.streak = 0;
      p.misses++;
      if (p.misses >= LEVEL_DOWN_AFTER && p.level > 1) {
        p.level--;
        p.misses = 0;
        return -1;
      }
    }
    return 0;
  }

  // ---------- Runder ----------

  function newRound(area) {
    return { area, done: 0, firstTry: 0 };
  }

  // Tæller én løst opgave med i runden. Returnerer true, når runden er færdig.
  function roundStep(round, firstTry) {
    round.done++;
    if (firstTry) round.firstTry++;
    return round.done >= ROUND_LENGTH;
  }

  // Gemmer en afsluttet runde i historikken (de nyeste HISTORY_MAX).
  function saveRound(state, round, date) {
    state.history.push({ date, area: round.area, total: round.done, firstTry: round.firstTry });
    if (state.history.length > HISTORY_MAX) state.history.splice(0, state.history.length - HISTORY_MAX);
    return state.history[state.history.length - 1];
  }

  // Lokal dato som ÅÅÅÅ-MM-DD (ikke UTC, så en runde om aftenen tæller på den rigtige dag).
  function localDate(d) {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  // ---------- Klistermærker ----------

  // Én runde giver ét nyt klistermærke; en perfekt runde (alle rigtige i første forsøg) giver to.
  // Returnerer de nye id'er (tom liste, når albummet er fuldt).
  function awardStickers(rng, state, round, catalog) {
    const count = round.firstTry >= round.done ? 2 : 1;
    const won = [];
    for (let i = 0; i < count; i++) {
      const missing = catalog.filter((st) => !state.stickers.includes(st.id));
      if (!missing.length) break;
      const st = pick(rng, missing);
      state.stickers.push(st.id);
      won.push(st.id);
    }
    return won;
  }

  // ---------- Svære ord ----------

  const HARD_WORD_CHANCE = 0.35; // så ofte vælges et svært ord, når der findes et
  const HARD_UNTIL_OK = 2; // et ord er svært, til det er stavet rigtigt så mange gange i træk

  function recordWord(state, word, firstTry) {
    const st = state.wordStats[word] || (state.wordStats[word] = { seen: 0, misses: 0, okInRow: 0 });
    st.seen++;
    if (firstTry) st.okInRow++;
    else {
      st.misses++;
      st.okInRow = 0;
    }
  }

  const isHard = (st) => !!st && st.misses > 0 && st.okInRow < HARD_UNTIL_OK;

  // De svære ord, flest fejl først.
  function hardWords(state) {
    return Object.entries(state.wordStats)
      .filter(([, st]) => isHard(st))
      .sort((a, b) => b[1].misses - a[1].misses || a[0].localeCompare(b[0], 'da'))
      .map(([word, st]) => ({ word, ...st }));
  }

  // ---------- Overblik ----------

  // De sidste 7 dage (ældste først) med antal runder pr. dag, plus tal pr. område.
  function weekSummary(history, today) {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      days.push({ date: localDate(d), rounds: 0 });
    }
    const first = days[0].date;
    const areas = {};
    for (const r of history) {
      if (r.date < first) continue;
      const day = days.find((d) => d.date === r.date);
      if (day) day.rounds++;
      const a = areas[r.area] || (areas[r.area] = { rounds: 0, tasks: 0, firstTry: 0 });
      a.rounds++;
      a.tasks += r.total;
      a.firstTry += r.firstTry;
    }
    return { days, areas };
  }

  // ---------- Stave ----------

  // recent: de senest viste ord (ændres), så det samme ord ikke kommer igen med det samme.
  // stats (valgfri): ordstatistik; svære ord vælges oftere, så de bliver øvet igen.
  function pickWord(rng, words, recent, stats) {
    let candidates = words.filter((w) => !recent.includes(w.word));
    if (!candidates.length) candidates = words;
    const hard = stats ? candidates.filter((w) => isHard(stats[w.word])) : [];
    if (hard.length && rng() < HARD_WORD_CHANCE) candidates = hard;
    const w = pick(rng, candidates);
    recent.push(w.word);
    if (recent.length > 8) recent.shift();
    return w;
  }

  // mode 'first': vælg første bogstav blandt lvl.choices. mode 'build': byg ordet af brikker.
  function spellTask(rng, lvl, word, letterPool) {
    const letters = Array.from(word.word);
    let tiles;
    if (lvl.mode === 'first') {
      const others = shuffle(rng, letterPool.filter((l) => l !== letters[0])).slice(0, lvl.choices - 1);
      tiles = shuffle(rng, [letters[0], ...others]);
    } else {
      const distractors = shuffle(rng, letterPool.filter((l) => !letters.includes(l))).slice(0, lvl.extra);
      tiles = shuffle(rng, [...letters, ...distractors]);
    }
    return { word: word.word, emoji: word.emoji, letters, mode: lvl.mode, tiles };
  }

  // ---------- Regne ----------

  // n svarmuligheder inkl. answer, tæt på svaret (±1-3 gange unit), sorteret stigende.
  function makeChoices(rng, answer, min, max, n, unit = 1) {
    const set = new Set([answer]);
    for (const o of shuffle(rng, [-1, 1, -2, 2, -3, 3])) {
      if (set.size >= n) break;
      const v = answer + o * unit;
      if (v >= min && v <= max) set.add(v);
    }
    let guard = 0;
    while (set.size < n && guard++ < 100) set.add(min + unit * rand(rng, 0, Math.floor((max - min) / unit)));
    return Array.from(set).sort((a, b) => a - b);
  }

  // type: 'count' (tæl item), 'add' (a + b) eller 'sub' (a − b).
  function mathTask(rng, lvl, items) {
    const type = lvl.type === 'mix' ? pick(rng, ['add', 'sub']) : lvl.type;
    const item = pick(rng, items);
    let a, b, answer;
    if (type === 'count') {
      answer = rand(rng, 1, lvl.max);
    } else if (type === 'add') {
      a = rand(rng, 1, lvl.max - 1);
      b = rand(rng, 1, lvl.max - a);
      answer = a + b;
    } else {
      a = rand(rng, 2, lvl.max);
      b = rand(rng, 1, a);
      answer = a - b;
    }
    const min = type === 'count' ? 1 : 0;
    const choices = makeChoices(rng, answer, min, lvl.max, lvl.choices);
    return { type, item, a, b, answer, choices, pictures: type === 'count' || !!lvl.pictures };
  }

  // ---------- Mønstre ----------

  function shapePattern(rng, lvl, themes) {
    const unit = Array.from(pick(rng, lvl.units)); // f.eks. ['A', 'A', 'B']
    const kinds = Array.from(new Set(unit));
    const symbols = shuffle(rng, pick(rng, themes)).slice(0, kinds.length + 1);
    const symbolOf = Object.fromEntries(kinds.map((k, i) => [k, symbols[i]]));
    // Mindst to hele gentagelser, så mønsteret kan ses.
    const length = unit.length * 2 + rand(rng, 0, unit.length - 1);
    const seq = Array.from({ length: length + 1 }, (_, i) => symbolOf[unit[i % unit.length]]);
    const answer = seq[length];
    const others = shuffle(rng, symbols.filter((x) => x !== answer)).slice(0, 2);
    return { isNumber: false, seq, missing: length, answer, choices: shuffle(rng, [answer, ...others]), unitLength: unit.length };
  }

  function numberPattern(rng, lvl) {
    const step = pick(rng, lvl.steps);
    const size = Math.abs(step);
    const max = size === 10 ? 100 : 20;
    const n = Math.min(lvl.shown, Math.floor(max / size) - 1);
    const span = size * n;
    // Startværdien vælges, så hele rækken holder sig mellem 0 og max.
    // Spring på 2, 5 og 10 starter i et tal, man "tæller med" (0, 2, 4 … / 5, 10 …).
    const startSlot = size === 1 ? rand(rng, 0, max - span) : size * rand(rng, 0, Math.floor((max - span) / size));
    const start = step > 0 ? startSlot : startSlot + span;
    const seq = Array.from({ length: n + 1 }, (_, i) => start + i * step);
    const missing = lvl.missingInside && rng() < 0.5 ? rand(rng, 1, n - 1) : n;
    const answer = seq[missing];
    return { isNumber: true, seq, missing, answer, choices: makeChoices(rng, answer, 0, max, 3, size >= 5 ? size : 1), step };
  }

  function patternTask(rng, lvl, themes) {
    return lvl.type === 'number' ? numberPattern(rng, lvl) : shapePattern(rng, lvl, themes);
  }

  return {
    LEVEL_UP_AFTER, LEVEL_DOWN_AFTER, AREAS, ROUND_LENGTH, HISTORY_MAX,
    newRound, roundStep, saveRound, localDate, awardStickers,
    HARD_WORD_CHANCE, HARD_UNTIL_OK, recordWord, hardWords, weekSummary,
    rand, pick, shuffle,
    defaultState, normalizeState, recordResult,
    pickWord, spellTask, makeChoices, mathTask, patternTask,
  };
});
