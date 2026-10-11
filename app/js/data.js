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
};
