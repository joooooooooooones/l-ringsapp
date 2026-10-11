'use strict';
// Indlæser appens data og logik i Node.
global.window = global.window || {};
require('../app/js/data.js');
const LOGIC = require('../app/js/logic.js');

// Lille deterministisk tilfældighedskilde (samme LCG som i skærmtestene).
function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

module.exports = { DATA: global.window.DATA, LOGIC, seeded };
