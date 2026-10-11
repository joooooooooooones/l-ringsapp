'use strict';
// Golden master: opgaver for alle niveauer med fast frø. Ændringer i output skal være erklærede.
const { DATA, LOGIC: L, seeded } = require('./helpers');

function generate() {
  const out = {};
  DATA.SPELL_LEVELS.forEach((lvl, i) => {
    const rng = seeded(1000 + i);
    const recent = [];
    const words = lvl.pool.flatMap((p) => DATA.WORDS[p]);
    out[`spell-${i + 1}`] = Array.from({ length: 30 }, () => {
      const t = L.spellTask(rng, lvl, L.pickWord(rng, words, recent), DATA.LETTERS);
      return `${t.word} [${t.tiles.join('')}]`;
    });
  });
  DATA.MATH_LEVELS.forEach((lvl, i) => {
    const rng = seeded(2000 + i);
    out[`math-${i + 1}`] = Array.from({ length: 30 }, () => {
      const m = L.mathTask(rng, lvl, DATA.COUNT_ITEMS);
      const q = m.type === 'count' ? `tæl ${m.answer} ${m.item.pl}` : `${m.a} ${m.type === 'add' ? '+' : '-'} ${m.b}`;
      return `${q} = ${m.answer} [${m.choices.join(' ')}]`;
    });
  });
  DATA.PATTERN_LEVELS.forEach((lvl, i) => {
    const rng = seeded(3000 + i);
    out[`pattern-${i + 1}`] = Array.from({ length: 30 }, () => {
      const p = L.patternTask(rng, lvl, DATA.PATTERN_THEMES);
      return `${p.seq.map((v, j) => (j === p.missing ? '?' : v)).join(' ')} = ${p.answer} [${p.choices.join(' ')}]`;
    });
  });
  return out;
}

module.exports = { generate };
