'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DATA, LOGIC: L, seeded } = require('./helpers');
const { generate } = require('./golden');

const GOLDEN = path.join(__dirname, 'golden', 'logic.json');

test('golden master: opgaver er uændrede (UPDATE_GOLDEN=1 for at opdatere efter en erklæret ændring)', () => {
  const now = generate();
  if (process.env.UPDATE_GOLDEN) fs.writeFileSync(GOLDEN, JSON.stringify(now, null, 1) + '\n');
  assert.ok(fs.existsSync(GOLDEN), 'golden-filen mangler – kør med UPDATE_GOLDEN=1 efter en erklæret ændring');
  assert.deepEqual(now, JSON.parse(fs.readFileSync(GOLDEN, 'utf8')));
});

test('regne: svaret er rigtigt, og svarmulighederne er gyldige', () => {
  DATA.MATH_LEVELS.forEach((lvl) => {
    const rng = seeded(42);
    for (let i = 0; i < 500; i++) {
      const m = L.mathTask(rng, lvl, DATA.COUNT_ITEMS);
      if (m.type === 'add') assert.equal(m.answer, m.a + m.b);
      if (m.type === 'sub') assert.equal(m.answer, m.a - m.b);
      if (m.type === 'count') assert.ok(m.answer >= 1 && m.answer <= lvl.max);
      if (m.type !== 'count') assert.ok(m.a >= 1 && m.b >= 1, 'ingen nul-led');
      assert.ok(m.answer >= 0 && m.answer <= lvl.max, `svar ${m.answer} inden for 0..${lvl.max}`);
      assert.equal(m.choices.length, lvl.choices);
      assert.ok(m.choices.includes(m.answer));
      assert.equal(new Set(m.choices).size, m.choices.length, 'ingen dubletter');
      assert.deepEqual(m.choices, [...m.choices].sort((a, b) => a - b));
      assert.ok(m.choices.every((c) => c >= (m.type === 'count' ? 1 : 0) && c <= lvl.max));
    }
  });
});

test('regne: håndregnede eksempler', () => {
  // Faste "tilfældige" tal styrer valgene: rng() = 0 vælger altid det mindste.
  const zero = () => 0;
  const plus = L.mathTask(zero, { type: 'add', max: 10, choices: 3 }, DATA.COUNT_ITEMS);
  assert.deepEqual([plus.a, plus.b, plus.answer], [1, 1, 2]); // 1 + 1 = 2
  const minus = L.mathTask(zero, { type: 'sub', max: 10, choices: 3 }, DATA.COUNT_ITEMS);
  assert.deepEqual([minus.a, minus.b, minus.answer], [2, 1, 1]); // 2 − 1 = 1
  const almostOne = () => 0.999999;
  const big = L.mathTask(almostOne, { type: 'add', max: 20, choices: 4 }, DATA.COUNT_ITEMS);
  assert.deepEqual([big.a, big.b, big.answer], [19, 1, 20]); // 19 + 1 = 20
});

test('mønstre: rækken følger reglen, og svaret er blandt valgene', () => {
  DATA.PATTERN_LEVELS.forEach((lvl) => {
    const rng = seeded(7);
    for (let i = 0; i < 500; i++) {
      const p = L.patternTask(rng, lvl, DATA.PATTERN_THEMES);
      assert.equal(p.answer, p.seq[p.missing]);
      assert.ok(p.choices.includes(p.answer));
      assert.equal(new Set(p.choices).size, p.choices.length);
      if (p.isNumber) {
        for (let j = 1; j < p.seq.length; j++) assert.equal(p.seq[j] - p.seq[j - 1], p.step);
        const max = Math.abs(p.step) === 10 ? 100 : 20;
        assert.ok(p.seq.every((v) => v >= 0 && v <= max), `inden for 0..${max}: ${p.seq}`);
        assert.ok(p.seq.length >= 4, 'mindst 3 synlige tal før svaret');
      } else {
        for (let j = p.unitLength; j < p.seq.length; j++) assert.equal(p.seq[j], p.seq[j - p.unitLength]);
        assert.ok(p.seq.length - 1 >= p.unitLength * 2, 'mindst to hele gentagelser vises');
      }
    }
  });
});

test('stave: brikkerne kan danne ordet, og ekstra brikker er ikke i ordet', () => {
  DATA.SPELL_LEVELS.forEach((lvl) => {
    const rng = seeded(9);
    const recent = [];
    const words = lvl.pool.flatMap((p) => DATA.WORDS[p]);
    for (let i = 0; i < 300; i++) {
      const t = L.spellTask(rng, lvl, L.pickWord(rng, words, recent), DATA.LETTERS);
      if (lvl.mode === 'first') {
        assert.equal(t.tiles.length, lvl.choices);
        assert.equal(t.tiles.filter((l) => l === t.letters[0]).length, 1);
      } else {
        const rest = [...t.tiles];
        for (const ch of t.letters) {
          const k = rest.indexOf(ch);
          assert.ok(k >= 0, `${t.word}: mangler brik ${ch}`);
          rest.splice(k, 1);
        }
        assert.equal(rest.length, lvl.extra);
        assert.ok(rest.every((l) => !t.letters.includes(l)));
      }
    }
  });
});

test('stave: samme ord kommer ikke igen blandt de seneste', () => {
  const rng = seeded(3);
  const recent = [];
  const words = DATA.WORDS.short;
  const seen = [];
  for (let i = 0; i < 100; i++) seen.push(L.pickWord(rng, words, recent).word);
  for (let i = 1; i < seen.length; i++) assert.ok(!seen.slice(Math.max(0, i - 8), i).includes(seen[i]));
});

test('niveau: 5 rigtige i træk giver nyt niveau, 3 med fejl går ned, grænserne holder', () => {
  const p = { level: 1, streak: 0, misses: 0, done: 0 };
  for (let i = 0; i < 4; i++) assert.equal(L.recordResult(p, 3, true), 0);
  assert.equal(L.recordResult(p, 3, true), 1);
  assert.deepEqual([p.level, p.streak], [2, 0]);
  assert.equal(L.recordResult(p, 3, false), 0);
  assert.equal(L.recordResult(p, 3, false), 0);
  assert.equal(L.recordResult(p, 3, false), -1);
  assert.equal(p.level, 1);
  for (let i = 0; i < 3; i++) L.recordResult(p, 3, false);
  assert.equal(p.level, 1, 'aldrig under 1');
  const top = { level: 3, streak: 0, misses: 0, done: 0 };
  for (let i = 0; i < 10; i++) L.recordResult(top, 3, true);
  assert.equal(top.level, 3, 'aldrig over max');
  assert.equal(p.done, 11, '5 + 3 + 3 kald');
});

test('gemt tilstand: ældre data kan åbnes, og ødelagte værdier rettes', () => {
  // Data gemt før Mønstre fandtes.
  const old = { stars: 12, settings: { uppercase: false, sound: true, name: 'Oscar' }, spell: { level: 3, streak: 2, misses: 0, done: 40 }, math: { level: 2, streak: 0, misses: 1, done: 9 } };
  const counts = { spell: 4, math: 7, pattern: 6 };
  const s = L.normalizeState(old, counts);
  assert.equal(s.stars, 12);
  assert.equal(s.settings.name, 'Oscar');
  assert.equal(s.settings.uppercase, false);
  assert.equal(s.spell.level, 3);
  assert.deepEqual(s.pattern, { level: 1, streak: 0, misses: 0, done: 0 });
  assert.equal(L.normalizeState({ spell: { level: 99 } }, counts).spell.level, 4);
  assert.equal(L.normalizeState(null, counts).stars, 0);
  assert.equal(L.normalizeState('vrøvl', counts).math.level, 1);
});

test('runde: 10 opgaver, tæller rigtige i første forsøg og gemmes i historikken', () => {
  const state = L.normalizeState(null, { spell: 4, math: 7, pattern: 6 });
  const round = L.newRound('math');
  const results = [true, false, true, true, true, false, true, true, true, true];
  const finished = results.map((ok) => L.roundStep(round, ok));
  assert.deepEqual(finished, [false, false, false, false, false, false, false, false, false, true]);
  assert.equal(L.ROUND_LENGTH, 10);
  const saved = L.saveRound(state, round, '2026-10-11');
  assert.deepEqual(saved, { date: '2026-10-11', area: 'math', total: 10, firstTry: 8 });
  assert.equal(state.history.length, 1);
});

test('runde: historikken holdes under loftet, og ødelagt historik ryddes', () => {
  const state = L.normalizeState({ history: [{ date: '2026-01-01', area: 'spell', total: 10, firstTry: 5 }, null, 'x'] }, null);
  assert.equal(state.history.length, 1, 'ugyldige poster fjernes');
  for (let i = 0; i < L.HISTORY_MAX + 5; i++) L.saveRound(state, { area: 'spell', done: 10, firstTry: 10 }, '2026-10-11');
  assert.equal(state.history.length, L.HISTORY_MAX);
  assert.equal(L.normalizeState({ history: 'vrøvl' }, null).history.length, 0);
});

test('lokal dato: ÅÅÅÅ-MM-DD efter lokal tid', () => {
  assert.equal(L.localDate(new Date(2026, 0, 5, 23, 30)), '2026-01-05');
  assert.equal(L.localDate(new Date(2026, 11, 31, 0, 1)), '2026-12-31');
});

test('klistermærker: én pr. runde, to for en perfekt runde, aldrig dubletter', () => {
  const rng = seeded(5);
  const state = L.normalizeState(null, null);
  const ok = L.awardStickers(rng, state, { area: 'spell', done: 10, firstTry: 7 }, DATA.STICKERS);
  assert.equal(ok.length, 1);
  const perfect = L.awardStickers(rng, state, { area: 'spell', done: 10, firstTry: 10 }, DATA.STICKERS);
  assert.equal(perfect.length, 2);
  for (let i = 0; i < 100; i++) L.awardStickers(rng, state, { area: 'math', done: 10, firstTry: 10 }, DATA.STICKERS);
  assert.equal(state.stickers.length, DATA.STICKERS.length, 'albummet kan fyldes helt');
  assert.equal(new Set(state.stickers).size, state.stickers.length, 'ingen dubletter');
  assert.deepEqual(L.awardStickers(rng, state, { area: 'math', done: 10, firstTry: 10 }, DATA.STICKERS), [], 'fuldt album giver intet');
});

test('klistermærker: katalogets id er unikke, og gemte id overlever indlæsning', () => {
  const ids = DATA.STICKERS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  const s = L.normalizeState({ stickers: ['haj', 'haj', 7, 'drage'] }, null);
  assert.deepEqual(s.stickers, ['haj', 'drage']);
});

test('svære ord: fejl gør ordet svært, to rigtige i træk gør det let igen', () => {
  const state = L.normalizeState(null, null);
  L.recordWord(state, 'kat', true);
  assert.deepEqual(L.hardWords(state), []);
  L.recordWord(state, 'sol', false);
  L.recordWord(state, 'hus', false);
  L.recordWord(state, 'hus', false);
  assert.deepEqual(L.hardWords(state).map((h) => h.word), ['hus', 'sol'], 'flest fejl først');
  L.recordWord(state, 'hus', true);
  assert.equal(L.hardWords(state).length, 2, 'én rigtig er ikke nok');
  L.recordWord(state, 'hus', true);
  assert.deepEqual(L.hardWords(state).map((h) => h.word), ['sol']);
  assert.deepEqual(state.wordStats.hus, { seen: 4, misses: 2, okInRow: 2 });
});

test('svære ord: kommer oftere igen, men ikke kun dem', () => {
  const words = DATA.WORDS.short;
  const stats = { kat: { seen: 1, misses: 1, okInRow: 0 } };
  const rng = seeded(11);
  let kat = 0;
  const n = 4000;
  for (let i = 0; i < n; i++) if (L.pickWord(rng, words, [], stats).word === 'kat') kat++;
  const expected = L.HARD_WORD_CHANCE + (1 - L.HARD_WORD_CHANCE) / words.length; // ≈ 0,37
  assert.ok(Math.abs(kat / n - expected) < 0.03, `andel ${kat / n} ≈ ${expected}`);
  const recent = ['kat'];
  assert.notEqual(L.pickWord(seeded(1), words, recent, stats).word, 'kat', 'et netop vist ord springes stadig over');
});

test('overblik: runder de sidste 7 dage og pr. område', () => {
  const history = [
    { date: '2026-10-01', area: 'spell', total: 10, firstTry: 2 }, // for gammel
    { date: '2026-10-05', area: 'spell', total: 10, firstTry: 8 },
    { date: '2026-10-11', area: 'spell', total: 10, firstTry: 6 },
    { date: '2026-10-11', area: 'math', total: 10, firstTry: 10 },
  ];
  const w = L.weekSummary(history, new Date(2026, 9, 11, 18, 0));
  assert.deepEqual(w.days.map((d) => d.date), ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']);
  assert.deepEqual(w.days.map((d) => d.rounds), [1, 0, 0, 0, 0, 0, 2]);
  assert.deepEqual(w.areas.spell, { rounds: 2, tasks: 20, firstTry: 14 });
  assert.deepEqual(w.areas.math, { rounds: 1, tasks: 10, firstTry: 10 });
});

test('gemt tilstand: ordstatistik overlever indlæsning, ugyldige værdier ryddes', () => {
  const s = L.normalizeState({ wordStats: { kat: { seen: 3, misses: 1, okInRow: 0 }, x: null, sol: 'vrøvl' } }, null);
  assert.deepEqual(s.wordStats, { kat: { seen: 3, misses: 1, okInRow: 0 } });
});

test('ugens ord: gyldige ord tilføjes med små bogstaver, ugyldige afvises med en forklaring', () => {
  const state = L.normalizeState(null, null);
  assert.deepEqual(L.addCustomWord(state, '  Skole '), { ok: true, word: 'skole' });
  assert.equal(L.addCustomWord(state, 'SKOLE').ok, false, 'dublet');
  assert.match(L.addCustomWord(state, 'skole').error, /allerede/);
  assert.match(L.addCustomWord(state, 'to ord').error, /mellemrum/);
  assert.match(L.addCustomWord(state, 'abc1').error, /bogstaver/);
  assert.match(L.addCustomWord(state, 'a').error, /2-14/);
  assert.match(L.addCustomWord(state, '').error, /Skriv/);
  assert.equal(L.addCustomWord(state, 'Æblegrød').word, 'æblegrød');
  assert.deepEqual(state.customWords.map((w) => w.word), ['skole', 'æblegrød']);
  L.removeCustomWord(state, 'skole');
  assert.deepEqual(state.customWords.map((w) => w.word), ['æblegrød']);
});

test('ugens ord: højst 30, og ugyldige gemte ord ryddes ved indlæsning', () => {
  const state = L.normalizeState(null, null);
  for (let i = 0; i < 40; i++) L.addCustomWord(state, 'ord' + 'abcdefghijklmnopqrstuvwxyzæøå'[i % 29] + 'abcdefghijklmnopqrstuvwxyzæøå'[Math.floor(i / 29)]);
  assert.equal(state.customWords.length, L.CUSTOM_WORD_MAX);
  const s = L.normalizeState({ customWords: [{ word: 'hund' }, { word: '1x' }, null, { word: 'kat' }] }, null);
  assert.deepEqual(s.customWords, [{ word: 'hund' }, { word: 'kat' }]);
});

test('ugens ord: med få ord kommer samme ord ikke to gange i træk', () => {
  const words = [{ word: 'hund' }, { word: 'kat' }, { word: 'ko' }];
  const rng = seeded(21);
  const recent = [];
  let last = null;
  for (let i = 0; i < 200; i++) {
    const w = L.pickWord(rng, words, recent).word;
    assert.notEqual(w, last);
    last = w;
  }
  const one = [{ word: 'hund' }];
  assert.equal(L.pickWord(rng, one, ['hund']).word, 'hund', 'ét ord kan stadig vælges');
});

test('ugens ord: brikkerne kan danne ordet, også med bogstaver uden for den faste pulje', () => {
  const rng = seeded(4);
  const t = L.spellTask(rng, { mode: 'build', extra: 3 }, { word: 'zoo' }, DATA.LETTERS);
  assert.deepEqual([...t.tiles].filter((l) => 'zo'.includes(l)).sort(), ['o', 'o', 'z']);
  assert.equal(t.tiles.length, 6);
});

test('afslut opgave: den 10. opgave gemmer runde og klistermærke med det samme', () => {
  const state = L.normalizeState(null, { spell: 4, math: 7, pattern: 6 });
  const round = L.newRound('math');
  const opts = { area: 'math', round, firstTry: true, levelCount: 7, date: '2026-10-11', rng: seeded(2), catalog: DATA.STICKERS };
  for (let i = 0; i < 9; i++) assert.equal(L.completeTask(state, opts).roundDone, false);
  const last = L.completeTask(state, opts);
  assert.equal(last.roundDone, true);
  assert.equal(state.history.length, 1);
  assert.equal(last.won.length, 2, 'perfekt runde');
  assert.deepEqual(state.stickers, last.won);
  assert.equal(state.stars, 10);
  assert.equal(state.math.level, 3, 'to niveauskift efter 10 rigtige i træk');
});

test('afslut opgave: ugens ord har ingen niveauer, men tæller stjerner og ordstatistik', () => {
  const state = L.normalizeState(null, null);
  const round = L.newRound('words');
  const r = L.completeTask(state, { area: 'words', round, word: 'skole', firstTry: false, levelCount: 0, date: '2026-10-11', rng: seeded(1), catalog: DATA.STICKERS });
  assert.equal(r.change, 0);
  assert.equal(state.stars, 1);
  assert.deepEqual(state.wordStats.skole, { seen: 1, misses: 1, okInRow: 0 });
});

test('svære ord: "constructor" og andre indbyggede navne er almindelige ord', () => {
  const state = L.normalizeState(null, null);
  L.recordWord(state, 'constructor', false);
  L.recordWord(state, 'tostring', false);
  assert.deepEqual(state.wordStats.constructor, { seen: 1, misses: 1, okInRow: 0 });
  assert.equal(Object.seen, undefined, 'Object er urørt');
  assert.deepEqual(L.hardWords(state).map((h) => h.word).sort(), ['constructor', 'tostring']);
});

test('svære ord: kun ord der kan komme lige nu, når der gives en liste', () => {
  const state = L.normalizeState({ wordStats: { fisk: { seen: 1, misses: 1, okInRow: 0 }, kat: { seen: 1, misses: 1, okInRow: 0 } } }, null);
  assert.deepEqual(L.hardWords(state, new Set(['kat', 'sol'])).map((h) => h.word), ['kat']);
});

test('installation: vejledning passer til browseren', () => {
  const g = (ua) => L.installGuide(ua).browser;
  assert.equal(g('Mozilla/5.0 (Linux; Android 14; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0 Mobile Safari/537.36'), 'Samsung Internet');
  assert.equal(g('Mozilla/5.0 (Linux; Android 14; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'), 'Chrome');
  assert.equal(g('Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36 EdgA/128.0'), 'Edge');
  assert.equal(g('Mozilla/5.0 (Android 14; Mobile; rv:130.0) Gecko/130.0 Firefox/130.0'), 'Firefox');
  assert.equal(g('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'), 'iPad/iPhone');
  assert.equal(g('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36'), 'computer');
  assert.equal(g(undefined), 'computer');
  for (const ua of ['SamsungBrowser Android', 'Android Chrome', 'iPad', 'Firefox', 'Windows']) assert.ok(L.installGuide(ua).steps.length >= 2);
});

test('gemt tilstand: forkerte typer (f.eks. fra en importeret fil) bliver til gyldige tal og tekster', () => {
  const counts = { spell: 4, math: 7, pattern: 6 };
  const s = L.normalizeState({
    stars: 'mange',
    settings: { uppercase: 'ja', sound: 0, name: 42 },
    spell: { level: 'tre', streak: -2, misses: null, done: 7.6 },
    math: { level: 2.7 },
    history: [{ date: '2026-10-11', area: 'spell', total: '10', firstTry: 'x' }, { date: '11/10', area: 'spell', total: 10, firstTry: 5 }],
  }, counts);
  assert.equal(s.stars, 0);
  assert.equal(s.settings.uppercase, true, 'ugyldig værdi giver standard');
  assert.equal(s.settings.sound, true);
  assert.equal(s.settings.name, '');
  assert.deepEqual(s.spell, { level: 1, streak: 0, misses: 0, done: 7 });
  assert.equal(s.math.level, 2);
  assert.deepEqual(s.history, [{ date: '2026-10-11', area: 'spell', total: 10, firstTry: 0 }]);
  // Gyldige data er uændrede.
  const ok = L.normalizeState({ stars: 5, settings: { uppercase: false, sound: false, name: 'Ida' } }, counts);
  assert.deepEqual([ok.stars, ok.settings.uppercase, ok.settings.sound, ok.settings.name], [5, false, false, 'Ida']);
});

test('ugens ord: en hel liste kan tilføjes på én gang; de ugyldige kommer tilbage med forklaring', () => {
  const state = L.normalizeState({ customWords: [{ word: 'mor' }] }, null);
  const r = L.addCustomWords(state, 'Hund, kat;  far\nmor sk0le hund');
  assert.deepEqual(r.added, ['hund', 'kat', 'far']);
  assert.deepEqual(r.rejected.map((x) => x.text), ['mor', 'sk0le', 'hund']);
  assert.match(r.rejected[0].error, /allerede/);
  assert.match(r.rejected[1].error, /bogstaver/);
  assert.deepEqual(state.customWords.map((w) => w.word), ['mor', 'hund', 'kat', 'far']);
  assert.match(L.addCustomWords(state, '  ,  ').rejected[0].error, /Skriv/);
  // Ét ord virker som før.
  assert.deepEqual(L.addCustomWords(state, 'bror').added, ['bror']);
});

test('optagelse: vælger det første lydformat browseren kan optage, ellers browserens standard', () => {
  assert.equal(L.pickRecordingType((t) => t === 'audio/mp4'), 'audio/mp4');
  assert.equal(L.pickRecordingType((t) => t.startsWith('audio/webm')), 'audio/webm;codecs=opus');
  assert.equal(L.pickRecordingType(() => false), '');
});

test('optagelse: stilhed før og efter ordet skæres fra, og en tavs optagelse afvises', () => {
  const rate = 100; // 100 samples pr. sekund gør regnestykket nemt
  const samples = new Float32Array(300); // 3 sekunder
  for (let i = 120; i < 180; i++) samples[i] = i % 2 ? 0.5 : -0.5; // ordet: 1,2-1,8 s
  // Med 0,1 s luft på hver side: 1,1 s til 1,9 s.
  assert.deepEqual(L.trimSilence(samples, rate, { pad: 0.1 }), { start: 110, end: 190 });
  // Luften går ikke ud over kanten.
  const edge = new Float32Array(50); edge[0] = 0.9; edge[49] = 0.9;
  assert.deepEqual(L.trimSilence(edge, rate, { pad: 0.1 }), { start: 0, end: 50 });
  assert.equal(L.trimSilence(new Float32Array(300).fill(0.005), rate), null, 'kun svag støj = tavs');
});

test('optagelse: optagelser til ord, der ikke længere er på listen, findes til oprydning', () => {
  assert.deepEqual(L.orphanRecordings(['hund', 'kat', 'mor'], [{ word: 'kat' }]), ['hund', 'mor']);
  assert.deepEqual(L.orphanRecordings([], [{ word: 'kat' }]), []);
});

test('optagelse: stille optagelser forstærkes op til 0,9 i top, men højst 4 gange', () => {
  assert.equal(L.recordingGain(0.9), 1);
  assert.equal(L.recordingGain(0.45), 2);
  assert.equal(L.recordingGain(0.1), 4, 'loft, så støj ikke pustes op');
  assert.equal(L.recordingGain(1), 1, 'høje optagelser dæmpes ikke');
});
