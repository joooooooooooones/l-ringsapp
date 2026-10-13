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
  const DAILY_GOAL_MAX = 5; // dagens mål: 0 (slået fra) til 5 runder

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
      settings: { uppercase: true, sound: true, name: '', dailyGoal: 2 },
      spell: { level: 1, streak: 0, misses: 0, done: 0 },
      math: { level: 1, streak: 0, misses: 0, done: 0 },
      pattern: { level: 1, streak: 0, misses: 0, done: 0 },
      history: [], // afsluttede runder: { date: 'ÅÅÅÅ-MM-DD', area, total, firstTry }
      stickers: [], // id'er på klistermærker i albummet, i den rækkefølge de er vundet
      stickersSeen: 0, // så mange af stickers er set i albummet (resten vises som nye)
      wordStats: {}, // pr. ord: { seen, misses, okInRow } – bruges til at øve de svære ord igen
      customWords: [], // ugens ord fra skolen, skrevet ind af en voksen: [{ word }]
    };
  }

  // Hele tal ≥ 0; alt andet (tekst, NaN, negative tal) giver fallback.
  const count = (v, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : fallback);
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  // Fletter gemte data ind i standardværdierne, så ældre gemte data stadig kan åbnes.
  // Alle værdier typekontrolleres, så også en importeret fil med fejl giver en gyldig tilstand.
  function normalizeState(saved, levelCounts) {
    const d = defaultState();
    const s = saved && typeof saved === 'object' ? saved : {};
    const set = s.settings && typeof s.settings === 'object' ? s.settings : {};
    const state = { ...d, ...s };
    state.stars = count(s.stars);
    state.settings = { ...d.settings };
    for (const [k, v] of Object.entries(d.settings)) if (typeof set[k] === typeof v) state.settings[k] = set[k];
    const goal = state.settings.dailyGoal;
    state.settings.dailyGoal = Number.isInteger(goal) && goal >= 0 ? Math.min(goal, DAILY_GOAL_MAX) : d.settings.dailyGoal;
    state.stickers = Array.isArray(s.stickers) ? Array.from(new Set(s.stickers.filter((x) => typeof x === 'string'))) : [];
    state.stickersSeen = Math.min(count(s.stickersSeen, state.stickers.length), state.stickers.length);
    state.wordStats = {};
    if (s.wordStats && typeof s.wordStats === 'object') {
      for (const [w, v] of Object.entries(s.wordStats)) {
        if (v && typeof v === 'object') state.wordStats[w] = { seen: count(v.seen), misses: count(v.misses), okInRow: count(v.okInRow) };
      }
    }
    state.customWords = [];
    for (const w of Array.isArray(s.customWords) ? s.customWords : []) {
      const r = w && typeof w.word === 'string' ? parseCustomWord(w.word) : { ok: false };
      if (r.ok && state.customWords.length < CUSTOM_WORD_MAX && !state.customWords.some((x) => x.word === r.word)) state.customWords.push({ word: r.word });
    }
    state.history = Array.isArray(s.history)
      ? s.history
        .filter((r) => r && typeof r.date === 'string' && DATE_RE.test(r.date) && typeof r.area === 'string')
        .map((r) => ({ date: r.date, area: r.area, total: count(Number(r.total)), firstTry: count(Number(r.firstTry)) }))
      : [];
    for (const area of AREAS) {
      const p = s[area] && typeof s[area] === 'object' ? s[area] : {};
      const max = levelCounts ? levelCounts[area] : Infinity;
      state[area] = {
        level: Math.min(Math.max(1, count(p.level, 1)), max),
        streak: count(p.streak),
        misses: count(p.misses),
        done: count(p.done),
      };
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

  // Dagens mål: afsluttede runder i dag (date = ÅÅÅÅ-MM-DD) mod målet. goal 0 = slået fra.
  function dailyProgress(history, date, goal) {
    const done = history.filter((r) => r.date === date).length;
    return { done, goal, reached: goal > 0 && done >= goal };
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

  // Egen-egenskab, så et ord som "constructor" ikke rammer Object.prototype.
  const statOf = (stats, word) => (stats && Object.prototype.hasOwnProperty.call(stats, word) ? stats[word] : undefined);

  function recordWord(state, word, firstTry) {
    let st = statOf(state.wordStats, word);
    if (!st) st = state.wordStats[word] = { seen: 0, misses: 0, okInRow: 0 };
    st.seen++;
    if (firstTry) st.okInRow++;
    else {
      st.misses++;
      st.okInRow = 0;
    }
  }

  const isHard = (st) => !!st && st.misses > 0 && st.okInRow < HARD_UNTIL_OK;

  // De svære ord, flest fejl først. practicable (valgfri): kun ord der faktisk kan komme lige nu.
  function hardWords(state, practicable) {
    return Object.entries(state.wordStats)
      .filter(([word, st]) => isHard(st) && (!practicable || practicable.has(word)))
      .sort((a, b) => b[1].misses - a[1].misses || a[0].localeCompare(b[0], 'da'))
      .map(([word, st]) => ({ word, ...st }));
  }

  // ---------- Afslut en opgave ----------

  // Alt der skal ske, når en opgave er løst – samlet ét sted og gemt med det samme,
  // så intet går tabt, hvis barnet forlader skærmen lige bagefter.
  // Returnerer { change (niveauskift), roundDone, won (nye klistermærke-id'er) }.
  function completeTask(state, { area, round, word, firstTry, levelCount, date, rng, catalog }) {
    state.stars++;
    if (word) recordWord(state, word, firstTry);
    const change = levelCount ? recordResult(state[area], levelCount, firstTry) : 0;
    const roundDone = roundStep(round, firstTry);
    let won = [];
    if (roundDone) {
      saveRound(state, round, date);
      won = awardStickers(rng, state, round, catalog);
    }
    return { change, roundDone, won };
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

  // ---------- Ugens ord ----------

  const CUSTOM_WORD_MAX = 30;
  const WORD_RE = /^[a-zæøåéü]{2,14}$/;

  // Kontrollerer et ord skrevet af en voksen. Returnerer { ok, word } eller { ok: false, error }.
  function parseCustomWord(text) {
    const word = String(text).trim().toLocaleLowerCase('da');
    if (!word) return { ok: false, error: 'Skriv et ord først.' };
    if (/\s/.test(word)) return { ok: false, error: 'Skriv ét ord ad gangen (uden mellemrum).' };
    if (!/^[a-zæøåéü]+$/.test(word)) return { ok: false, error: 'Brug kun bogstaver (a-å), ingen tal eller tegn.' };
    if (!WORD_RE.test(word)) return { ok: false, error: 'Ordet skal have 2-14 bogstaver.' };
    return { ok: true, word };
  }

  function addCustomWord(state, text) {
    const r = parseCustomWord(text);
    if (!r.ok) return r;
    if (state.customWords.some((w) => w.word === r.word)) return { ok: false, error: `"${r.word}" er allerede på listen.` };
    if (state.customWords.length >= CUSTOM_WORD_MAX) return { ok: false, error: `Der kan højst være ${CUSTOM_WORD_MAX} ord på listen.` };
    state.customWords.push({ word: r.word });
    return r;
  }

  // Tilføjer en hel liste, f.eks. "hund, kat mor" (adskilt af mellemrum, komma, semikolon eller linjeskift).
  // Returnerer { added: [ord], rejected: [{ text, error }] } i samme rækkefølge som skrevet.
  function addCustomWords(state, text) {
    const parts = String(text).split(/[\s,;]+/).filter(Boolean);
    if (!parts.length) return { added: [], rejected: [{ text: '', error: parseCustomWord('').error }] };
    const added = [];
    const rejected = [];
    for (const part of parts) {
      const r = addCustomWord(state, part);
      if (r.ok) added.push(r.word);
      else rejected.push({ text: part, error: r.error });
    }
    return { added, rejected };
  }

  function removeCustomWord(state, word) {
    state.customWords = state.customWords.filter((w) => w.word !== word);
  }

  // ---------- Optag ugens ord ----------

  // Formater i prioriteret rækkefølge: Chrome/Firefox optager webm/ogg (opus), Safari mp4.
  const RECORDING_TYPES = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'];
  function pickRecordingType(isSupported) {
    return RECORDING_TYPES.find((t) => isSupported(t)) || ''; // '' = browserens standard
  }

  // Finder ordet i en optagelse: fra første til sidste sample over threshold, plus pad sekunders luft.
  // Returnerer { start, end } (samples, end eksklusiv) eller null, hvis optagelsen er tavs.
  function trimSilence(samples, sampleRate, { threshold = 0.02, pad = 0.08 } = {}) {
    let first = -1;
    let last = -1;
    for (let i = 0; i < samples.length; i++) {
      if (Math.abs(samples[i]) >= threshold) {
        if (first < 0) first = i;
        last = i;
      }
    }
    if (first < 0) return null;
    const p = Math.round(pad * sampleRate);
    return { start: Math.max(0, first - p), end: Math.min(samples.length, last + 1 + p) };
  }

  // Forstærkning så en stille optagelse når 0,9 i top (som de indbyggede lydklip), højst 4 gange.
  function recordingGain(peak) {
    if (!(peak > 0) || peak >= 0.9) return 1;
    return Math.min(4, 0.9 / peak);
  }

  // Optagelser til ord, der ikke længere er på listen (ryddes op, så de ikke fylder).
  function orphanRecordings(recordedWords, customWords) {
    const keep = new Set(customWords.map((w) => w.word));
    return recordedWords.filter((w) => !keep.has(w));
  }

  // ---------- Sikkerhedskopi ----------
  //
  // Hele fremskridtet (og forælderens optagelser) som én JSON-fil, der kan gemmes og gendannes,
  // f.eks. ved skift af telefon. Intet sendes nogen steder hen; filen gemmes af brugeren selv.

  const BACKUP_APP = 'stav-og-regn';
  const BACKUP_FORMAT = 1;
  const RECORDING_MAX_BYTES = 2 * 1024 * 1024;

  function bytesToBase64(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  function base64ToBytes(text) {
    const bin = atob(text); // kaster ved ugyldig base64
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  // recordings: [{ word, type, bytes (Uint8Array) }]
  function makeBackup(state, recordings, exportedIso) {
    return {
      app: BACKUP_APP,
      format: BACKUP_FORMAT,
      exported: exportedIso,
      state,
      recordings: recordings.map((r) => ({ word: r.word, type: r.type, data: bytesToBase64(r.bytes) })),
    };
  }

  // Returnerer { ok, state, recordings, summary } eller { ok: false, error }.
  function parseBackup(text, levelCounts) {
    let b;
    try { b = JSON.parse(text); } catch (e) { return { ok: false, error: 'Filen kunne ikke læses. Vælg en sikkerhedskopi gemt fra Stav og Regn (.json).' }; }
    if (!b || typeof b !== 'object' || b.app !== BACKUP_APP || !b.state || typeof b.state !== 'object') {
      return { ok: false, error: 'Filen er ikke en sikkerhedskopi fra Stav og Regn.' };
    }
    if (!Number.isInteger(b.format) || b.format < 1) return { ok: false, error: 'Filen er ikke en sikkerhedskopi fra Stav og Regn.' };
    if (b.format > BACKUP_FORMAT) return { ok: false, error: 'Sikkerhedskopien er fra en nyere version af appen. Opdatér appen, og prøv igen.' };
    const state = normalizeState(b.state, levelCounts);
    const words = new Set(state.customWords.map((w) => w.word));
    const recordings = [];
    for (const r of Array.isArray(b.recordings) ? b.recordings : []) {
      if (!r || !words.has(r.word) || typeof r.type !== 'string' || typeof r.data !== 'string') continue;
      if (r.data.length > (RECORDING_MAX_BYTES * 4) / 3 + 4) continue;
      try {
        recordings.push({ word: r.word, type: r.type, bytes: base64ToBytes(r.data) });
      } catch (e) { /* ødelagt optagelse springes over */ }
    }
    const exported = typeof b.exported === 'string' ? b.exported : '';
    return {
      ok: true,
      state,
      recordings,
      summary: {
        exported,
        name: state.settings.name,
        stars: state.stars,
        stickers: state.stickers.length,
        rounds: state.history.length,
        words: state.customWords.length,
        recordings: recordings.length,
      },
    };
  }

  function backupFileName(name, date) {
    const slug = String(name || '').toLocaleLowerCase('da')
      .replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return `${BACKUP_APP}-${slug ? slug + '-' : ''}${date}.json`;
  }

  // ---------- Brug uden internet ----------

  // Tekst til voksensiden ud fra service workerens svar: { total, missing, filling, done, todo } eller { error }.
  // level: 'ok' (alt gemt), 'busy' (henter), 'warn' (mangler noget, eller browseren kan ikke).
  function offlineStatusText(s, { supported, online }) {
    if (!supported) return { level: 'warn', text: 'Denne browser kan ikke gemme appen til brug uden internet. Brug Chrome på Android eller Safari på iPad.' };
    if (!s) return { level: 'busy', text: 'Appen gøres klar til brug uden internet … Hold den åben et øjeblik.' };
    if (s.error) return { level: 'warn', text: 'Det kunne ikke tjekkes, om appen er gemt på enheden. Prøv igen.' };
    if (s.filling) return { level: 'busy', text: `Henter til brug uden internet … ${s.done} af ${s.todo} filer. Hold appen åben imens.` };
    if (!s.missing) return { level: 'ok', text: `✓ Klar til brug uden internet. Appen og alle lydklip er gemt på enheden (${s.total} filer).` };
    return online
      ? { level: 'warn', text: `${s.missing} af ${s.total} filer kunne ikke hentes. Tryk "Hent det, der mangler", eller prøv senere.` }
      : { level: 'warn', text: `${s.missing} af ${s.total} filer mangler (mest lydklip). Forbind enheden til internettet, og åbn appen et øjeblik.` };
  }

  // ---------- Installation ----------

  // Vejledning til at lægge appen på startskærmen, ud fra browserens user agent.
  // Bruges når browseren ikke selv tilbyder en installér-dialog (beforeinstallprompt).
  function installGuide(ua) {
    const s = String(ua || '');
    const ios = /iPhone|iPad|iPod/i.test(s) || (/Macintosh/i.test(s) && /Mobile/i.test(s));
    if (ios) {
      return { browser: 'iPad/iPhone', steps: ['Åbn siden i Safari.', 'Tryk på Del-knappen (firkant med pil op).', 'Vælg "Føj til hjemmeskærm" og tryk "Tilføj".'] };
    }
    if (/SamsungBrowser/i.test(s)) {
      return { browser: 'Samsung Internet', steps: ['Tryk på menuen ☰ (de tre streger).', 'Vælg "Tilføj side til".', 'Vælg "Startskærm" og tryk "Tilføj".'] };
    }
    if (/Firefox|FxiOS/i.test(s)) {
      return { browser: 'Firefox', steps: ['Tryk på menuen ⋮ (de tre prikker).', 'Vælg "Installér" eller "Føj til startskærm".'] };
    }
    if (/Android/i.test(s)) {
      const name = /EdgA/i.test(s) ? 'Edge' : 'Chrome';
      return { browser: name, steps: ['Tryk på menuen ⋮ (de tre prikker) øverst til højre.', 'Vælg "Installér app" eller "Føj til startskærm".', 'Tryk "Installér".'] };
    }
    return { browser: 'computer', steps: ['Klik på installér-ikonet i adresselinjen (en skærm med en pil).', 'Eller åbn browserens menu og vælg "Installér Stav og Regn".'] };
  }

  // ---------- Stave ----------

  // recent: de senest viste ord (ændres), så det samme ord ikke kommer igen med det samme.
  // stats (valgfri): ordstatistik; svære ord vælges oftere, så de bliver øvet igen.
  function pickWord(rng, words, recent, stats) {
    let candidates = words.filter((w) => !recent.includes(w.word));
    // Få ord (f.eks. ugens ord): undgå i det mindste at vise samme ord to gange i træk.
    if (!candidates.length) candidates = words.filter((w) => w.word !== recent[recent.length - 1]);
    if (!candidates.length) candidates = words;
    const hard = stats ? candidates.filter((w) => isHard(statOf(stats, w.word))) : [];
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
    LEVEL_UP_AFTER, LEVEL_DOWN_AFTER, AREAS, ROUND_LENGTH, HISTORY_MAX, DAILY_GOAL_MAX, dailyProgress,
    newRound, roundStep, saveRound, localDate, awardStickers,
    HARD_WORD_CHANCE, HARD_UNTIL_OK, recordWord, hardWords, weekSummary, completeTask,
    CUSTOM_WORD_MAX, parseCustomWord, addCustomWord, addCustomWords, removeCustomWord,
    pickRecordingType, trimSilence, recordingGain, orphanRecordings,
    makeBackup, parseBackup, backupFileName, offlineStatusText, installGuide,
    rand, pick, shuffle,
    defaultState, normalizeState, recordResult,
    pickWord, spellTask, makeChoices, mathTask, patternTask,
  };
});
