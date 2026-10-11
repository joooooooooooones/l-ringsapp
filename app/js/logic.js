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
    };
  }

  // Fletter gemte data ind i standardværdierne, så ældre gemte data stadig kan åbnes.
  function normalizeState(saved, levelCounts) {
    const d = defaultState();
    const s = saved && typeof saved === 'object' ? saved : {};
    const state = { ...d, ...s, settings: { ...d.settings, ...s.settings } };
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

  // ---------- Stave ----------

  // recent: de senest viste ord (ændres), så det samme ord ikke kommer igen med det samme.
  function pickWord(rng, words, recent) {
    let candidates = words.filter((w) => !recent.includes(w.word));
    if (!candidates.length) candidates = words;
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
    LEVEL_UP_AFTER, LEVEL_DOWN_AFTER, AREAS,
    rand, pick, shuffle,
    defaultState, normalizeState, recordResult,
    pickWord, spellTask, makeChoices, mathTask, patternTask,
  };
});
