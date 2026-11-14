'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const WORDS = require('../js/words.js');
const E = require('../js/engine.js');

test('la banque contient assez de mots pour une partie (13+)', () => {
  assert.ok(WORDS.length >= 13, 'minimum 13 mots, trouvé ' + WORDS.length);
});

test('mots uniques, en un seul morceau, avec indices valides', () => {
  const seen = new Set();
  for (const entry of WORDS) {
    assert.ok(entry.w && typeof entry.w === 'string', 'mot présent');
    assert.ok(!/\s/.test(entry.w), 'le mot "' + entry.w + '" contient un espace');
    assert.ok(!seen.has(entry.w), 'doublon de mot : ' + entry.w);
    seen.add(entry.w);
    assert.ok(Array.isArray(entry.c) && entry.c.length >= 3, 'au moins 3 indices pour ' + entry.w);
    for (const clue of entry.c) {
      assert.ok(!/\s/.test(clue), 'indice avec espace pour ' + entry.w + ' : ' + clue);
      assert.notEqual(E.normalize(clue), E.normalize(entry.w), 'indice identique au mot : ' + entry.w);
    }
  }
});

test('chaque mot a assez d’indices distincts pour les robots', () => {
  for (const entry of WORDS) {
    const uniq = new Set(entry.c.map(E.normalize));
    assert.ok(uniq.size >= 3, entry.w + ' n’a que ' + uniq.size + ' indices distincts');
  }
});
