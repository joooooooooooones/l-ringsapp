'use strict';

// Alt indhold til appen samlet ét sted, så det er nemt at tilføje flere ord.
// Ordene er valgt så de er så lydrette som muligt (staves som de siges).
window.DATA = {
  WORDS: {
    // 2–3 bogstaver
    short: [
      { word: 'is', emoji: '🍦' },
      { word: 'ko', emoji: '🐄' },
      { word: 'bi', emoji: '🐝' },
      { word: 'ur', emoji: '⌚' },
      { word: 'æg', emoji: '🥚' },
      { word: 'sol', emoji: '☀️' },
      { word: 'bil', emoji: '🚗' },
      { word: 'kat', emoji: '🐱' },
      { word: 'mus', emoji: '🐭' },
      { word: 'ost', emoji: '🧀' },
      { word: 'bus', emoji: '🚌' },
      { word: 'hat', emoji: '🎩' },
      { word: 'sko', emoji: '👟' },
      { word: 'abe', emoji: '🐒' },
      { word: 'frø', emoji: '🐸' },
      { word: 'træ', emoji: '🌳' },
      { word: 'ske', emoji: '🥄' },
      { word: 'hus', emoji: '🏠' },
      { word: 'øre', emoji: '👂' },
      { word: 'ræv', emoji: '🦊' },
      { word: 'sæl', emoji: '🦭' },
      { word: 'kop', emoji: '☕' },
      { word: 'ris', emoji: '🍚' },
      { word: 'fly', emoji: '✈️' },
      { word: 'fe', emoji: '🧚' },
      { word: 'ged', emoji: '🐐' },
      { word: 'dør', emoji: '🚪' },
      { word: 'sne', emoji: '❄️' },
      { word: 'nål', emoji: '🪡' },
      { word: 'ben', emoji: '🦵' },
      { word: 'øje', emoji: '👁️' },
      { word: 'lys', emoji: '🕯️' },
    ],
    // 4 bogstaver
    medium: [
      { word: 'fisk', emoji: '🐟' },
      { word: 'hest', emoji: '🐴' },
      { word: 'gris', emoji: '🐷' },
      { word: 'stol', emoji: '🪑' },
      { word: 'skib', emoji: '🚢' },
      { word: 'kage', emoji: '🍰' },
      { word: 'ugle', emoji: '🦉' },
      { word: 'måne', emoji: '🌙' },
      { word: 'pære', emoji: '🍐' },
      { word: 'lama', emoji: '🦙' },
      { word: 'løve', emoji: '🦁' },
      { word: 'næse', emoji: '👃' },
      { word: 'seng', emoji: '🛏️' },
      { word: 'kiks', emoji: '🍪' },
      { word: 'rose', emoji: '🌹' },
      { word: 'æble', emoji: '🍎' },
      { word: 'kiwi', emoji: '🥝' },
      { word: 'hane', emoji: '🐓' },
      { word: 'sofa', emoji: '🛋️' },
      { word: 'slik', emoji: '🍬' },
      { word: 'myre', emoji: '🐜' },
      { word: 'telt', emoji: '⛺' },
      { word: 'mælk', emoji: '🥛' },
      { word: 'smør', emoji: '🧈' },
      { word: 'gave', emoji: '🎁' },
      { word: 'sæbe', emoji: '🧼' },
      { word: 'saks', emoji: '✂️' },
    ],
    // 5+ bogstaver
    long: [
      { word: 'banan', emoji: '🍌' },
      { word: 'tomat', emoji: '🍅' },
      { word: 'kanin', emoji: '🐰' },
      { word: 'robot', emoji: '🤖' },
      { word: 'raket', emoji: '🚀' },
      { word: 'tiger', emoji: '🐯' },
      { word: 'giraf', emoji: '🦒' },
      { word: 'kamel', emoji: '🐫' },
      { word: 'zebra', emoji: '🦓' },
      { word: 'bamse', emoji: '🧸' },
      { word: 'ananas', emoji: '🍍' },
      { word: 'melon', emoji: '🍈' },
      { word: 'citron', emoji: '🍋' },
      { word: 'slange', emoji: '🐍' },
      { word: 'blomst', emoji: '🌸' },
      { word: 'hamster', emoji: '🐹' },
      { word: 'elefant', emoji: '🐘' },
      { word: 'pingvin', emoji: '🐧' },
      { word: 'regnbue', emoji: '🌈' },
      { word: 'jordbær', emoji: '🍓' },
      { word: 'gulerod', emoji: '🥕' },
      { word: 'panda', emoji: '🐼' },
      { word: 'koala', emoji: '🐨' },
      { word: 'kaktus', emoji: '🌵' },
      { word: 'delfin', emoji: '🐬' },
      { word: 'ballon', emoji: '🎈' },
      { word: 'krabbe', emoji: '🦀' },
      { word: 'tromme', emoji: '🥁' },
      { word: 'blyant', emoji: '✏️' },
      { word: 'vulkan', emoji: '🌋' },
      { word: 'traktor', emoji: '🚜' },
      { word: 'tulipan', emoji: '🌷' },
      { word: 'trompet', emoji: '🎺' },
      { word: 'paraply', emoji: '☂️' },
      { word: 'appelsin', emoji: '🍊' },
      { word: 'papegøje', emoji: '🦜' },
    ],
  },

  // Bogstaver der bruges som "forkerte" valgmuligheder.
  LETTERS: Array.from('abdefghijklmnoprstuvyæøå'),

  SPELL_LEVELS: [
    { name: 'Første bogstav', mode: 'first', pool: ['short', 'medium'], choices: 3 },
    { name: 'Korte ord', mode: 'build', pool: ['short'], extra: 2 },
    { name: 'Ord med 4 bogstaver', mode: 'build', pool: ['medium'], extra: 3 },
    { name: 'Lange ord', mode: 'build', pool: ['long'], extra: 3 },
  ],

  MATH_LEVELS: [
    { name: 'Tæl til 5', type: 'count', max: 5, choices: 3 },
    { name: 'Tæl til 10', type: 'count', max: 10, choices: 3 },
    { name: 'Plus til 5', type: 'add', max: 5, pictures: true, choices: 3 },
    { name: 'Plus til 10', type: 'add', max: 10, pictures: true, choices: 3 },
    { name: 'Minus til 10', type: 'sub', max: 10, pictures: true, choices: 3 },
    { name: 'Plus til 20', type: 'add', max: 20, pictures: false, choices: 4 },
    { name: 'Plus og minus til 20', type: 'mix', max: 20, pictures: false, choices: 4 },
  ],

  // Mønstre: først figurer der gentager sig, så talrækker.
  // units: bogstaverne viser hvordan mønsteret gentager sig (AAB = 🐶🐶🐱🐶🐶🐱 …).
  PATTERN_LEVELS: [
    { name: 'Mønstre med 2 ting', type: 'shape', units: ['AB'] },
    { name: 'Sværere mønstre', type: 'shape', units: ['AAB', 'ABB', 'AABB'] },
    { name: 'Mønstre med 3 ting', type: 'shape', units: ['ABC', 'ABBC', 'AABC'] },
    { name: 'Tal der vokser', type: 'number', steps: [1], shown: 4 },
    { name: 'Tæl frem og tilbage', type: 'number', steps: [1, -1, 2], shown: 4 },
    { name: 'Spring og huller', type: 'number', steps: [2, -1, -2, 5, 10], shown: 5, missingInside: true },
  ],

  PATTERN_THEMES: [
    ['🔴', '🔵', '🟡', '🟢', '🟣'],
    ['🐶', '🐱', '🐭', '🐰', '🐸'],
    ['🍎', '🍌', '🍇', '🍓', '🍐'],
    ['🚗', '🚌', '🚲', '🚀', '🚂'],
    ['⭐', '🌙', '☀️', '☁️', '⚡'],
    ['🔺', '🟦', '🟠', '💚', '🔶'],
  ],

  COUNT_ITEMS: [
    { e: '🍎', pl: 'æbler' },
    { e: '🐟', pl: 'fisk' },
    { e: '⭐', pl: 'stjerner' },
    { e: '🍓', pl: 'jordbær' },
    { e: '🐞', pl: 'mariehøns' },
    { e: '🚗', pl: 'biler' },
    { e: '🎈', pl: 'balloner' },
    { e: '🐥', pl: 'kyllinger' },
  ],

  PRAISE: ['Godt klaret!', 'Super!', 'Flot!', 'Sejt!', 'Rigtigt!', 'Du er dygtig!', 'Hurra!'],

  // Faste sætninger, der læses op. Hver tekst får sin egen lydfil i app/audio/.
  PHRASES: {
    firstLetter: 'Hvad starter ordet med?',
    spell: 'Stav ordet.',
    whatIs: 'Hvad er',
    plus: 'plus',
    minus: 'minus',
    tryCounting: 'Prøv at tælle.',
    newLevel: 'Nyt niveau!',
    hello: 'Hej! Nu skal vi lære at stave og regne.',
    patternNext: 'Hvad kommer så?',
    patternMissing: 'Hvad mangler?',
    roundDone: 'Godt gået! Du har lavet ti opgaver.',
  },

  // Sådan siges bogstaverne på dansk.
  LETTER_NAMES: {
    a: 'a', b: 'be', c: 'se', d: 'de', e: 'e', f: 'æf', g: 'ge', h: 'hå', i: 'i',
    j: 'jåd', k: 'kå', l: 'æl', m: 'æm', n: 'æn', o: 'o', p: 'pe', r: 'ær', s: 'æs',
    t: 'te', u: 'u', v: 've', y: 'y', z: 'sæt', æ: 'æ', ø: 'ø', å: 'å',
  },

  NUMBER_WORDS: [
    'nul', 'en', 'to', 'tre', 'fire', 'fem', 'seks', 'syv', 'otte', 'ni', 'ti',
    'elleve', 'tolv', 'tretten', 'fjorten', 'femten', 'seksten', 'sytten', 'atten', 'nitten', 'tyve',
  ],
  TENS: {
    30: 'tredive', 40: 'fyrre', 50: 'halvtreds', 60: 'tres', 70: 'halvfjerds', 80: 'firs', 90: 'halvfems', 100: 'hundrede',
  },
};

// Filnavn for en sætnings lydfil, f.eks. 'Prøv at tælle.' -> 'proev-at-taelle'.
window.DATA.audioKey = function (text) {
  return text
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'oe')
    .replace(/å/g, 'aa')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

// Alle tekster appen kan finde på at læse op. Bruges af tools/make-audio.
window.DATA.allPhrases = function () {
  const d = window.DATA;
  const words = Object.values(d.WORDS).flat().map((w) => w.word);
  return Array.from(new Set([
    ...words,
    ...Object.values(d.PHRASES),
    ...Object.values(d.LETTER_NAMES),
    ...d.NUMBER_WORDS,
    ...Object.values(d.TENS),
    ...d.COUNT_ITEMS.map((it) => `Hvor mange ${it.pl}?`),
    ...d.PRAISE,
  ]));
};
