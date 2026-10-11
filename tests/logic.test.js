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
  if (process.env.UPDATE_GOLDEN || !fs.existsSync(GOLDEN)) fs.writeFileSync(GOLDEN, JSON.stringify(now, null, 1) + '\n');
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
