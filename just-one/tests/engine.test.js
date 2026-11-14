'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../js/engine.js');
const WORDS = require('../js/words.js');

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function game(seed, opts) {
  const o = opts || {};
  return E.createGame({
    mode: o.mode || 'multi',
    players: o.players || [
      { name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }
    ],
    words: WORDS,
    rng: mulberry32(seed)
  });
}

test('normalize ignore casse et accents', () => {
  assert.equal(E.normalize('  ChènE '), 'chene');
  assert.equal(E.normalize('ÉCOLE'), 'ecole');
  assert.equal(E.normalize('œuf'), 'oeuf');
});

test('validateClue accepte un seul mot, refuse les espaces et symboles', () => {
  assert.equal(E.validateClue('chien').ok, true);
  assert.equal(E.validateClue('l’orage').ok, true);
  assert.equal(E.validateClue('arc-en-ciel').ok, true);
  assert.equal(E.validateClue('deux mots').ok, false);
  assert.equal(E.validateClue('').ok, false);
  assert.equal(E.validateClue('mot!').ok, false);
});

test('createGame tire 13 cartes et fait tourner le devineur', () => {
  const g = game(42);
  assert.equal(g.deck.length, 13);
  assert.equal(g.guesserIndex, 0);
  assert.equal(g.score, 0);
  assert.equal(g.cluesPerGiver, 1); // 4 joueurs -> 1 indice
  E.guess(g, E.currentCard(g).w); // bonne réponse
  assert.equal(g.guesserIndex, 1);
});

test('cluesPerGiver : 2 indices à 2 ou 3 joueurs', () => {
  assert.equal(E.cluesPerGiver(2), 2);
  assert.equal(E.cluesPerGiver(3), 2);
  assert.equal(E.cluesPerGiver(4), 1);
  assert.equal(E.cluesPerGiver(7), 1);
});

test('les doublons exacts sont tous annulés à la révélation', () => {
  const g = game(7);
  E.addClue(g, 1, 'animal');
  E.addClue(g, 2, 'Animal');   // même mot, casse différente
  E.addClue(g, 3, 'aboie');
  const r = E.revealClues(g);
  assert.equal(r.kept.length, 1);
  assert.equal(r.kept[0].text, 'aboie');
  assert.equal(r.removed.length, 2);
});

test('bonne réponse : +1 point, une seule carte retirée', () => {
  const g = game(1);
  const w = E.currentCard(g).w;
  const r = E.guess(g, w.toUpperCase()); // insensible à la casse
  assert.equal(r.match, true);
  assert.equal(g.score, 1);
  assert.equal(g.deck.length, 12);
});

test('mauvaise réponse : la carte en cours ET la suivante sont perdues', () => {
  const g = game(2);
  const r = E.guess(g, 'zzzz-inconnu');
  assert.equal(r.match, false);
  assert.equal(g.score, 0);
  assert.equal(g.deck.length, 11);
  assert.equal(g.history[0].cardsOut, 2);
});

test('mauvaise réponse sur la dernière carte : une seule carte perdue', () => {
  const g = game(3);
  while (g.deck.length > 1) E.pass(g);
  assert.equal(g.deck.length, 1);
  const r = E.guess(g, 'zzzz');
  assert.equal(r.match, false);
  assert.equal(g.deck.length, 0);
  assert.equal(g.over, true);
  assert.equal(g.history[g.history.length - 1].cardsOut, 1);
});

test('passer ne fait perdre que la carte en cours', () => {
  const g = game(4);
  E.pass(g);
  assert.equal(g.deck.length, 12);
  assert.equal(g.score, 0);
  assert.equal(g.history[0].result, 'pass');
});

test('partie complète : 13 bonnes réponses = score 13 et fin', () => {
  const g = game(9);
  while (!g.over) {
    const w = E.currentCard(g).w;
    E.guess(g, w);
  }
  assert.equal(g.score, 13);
  assert.equal(g.history.length, 13);
  assert.equal(g.over, true);
});

test('partie complète avec ratés : la pioche s’épuise plus vite', () => {
  const g = game(11);
  E.guess(g, 'non');            // -2 cartes
  while (!g.over) E.pass(g);    // -1 carte chacune
  assert.equal(g.over, true);
  assert.equal(g.history.length, 12); // 2 + 11
  assert.equal(g.score, 0);
});

test('barème officiel sur 13', () => {
  assert.equal(E.ratingFor(13).label, 'Score parfait !');
  assert.equal(E.ratingFor(12).label, 'Incroyable !');
  assert.equal(E.ratingFor(11).label, 'Excellent !');
  assert.equal(E.ratingFor(10).label, 'Très beau score !');
  assert.equal(E.ratingFor(9).label, 'Très beau score !');
  assert.equal(E.ratingFor(8).label, 'Dans la moyenne');
  assert.equal(E.ratingFor(7).label, 'Dans la moyenne');
  assert.equal(E.ratingFor(6).label, 'Bon début');
  assert.equal(E.ratingFor(4).label, 'Bon début');
  assert.equal(E.ratingFor(3).label, 'À retenter !');
  assert.equal(E.ratingFor(0).label, 'À retenter !');
});

test('mode solo : le devineur ne tourne pas (toujours le joueur 0)', () => {
  const g = game(5, { mode: 'solo', players: [{ name: 'Moi' }, { name: 'R1', bot: true }, { name: 'R2', bot: true }, { name: 'R3', bot: true }] });
  assert.equal(g.mode, 'solo');
  E.guess(g, E.currentCard(g).w);
  assert.equal(g.guesserIndex, 0);
});

test('botClues renvoie des indices de la banque, parfois en double', () => {
  const card = { w: 'chien', c: ['animal', 'aboie', 'fidèle', 'laisse', 'os'] };
  let dupSeen = 0;
  for (let i = 0; i < 200; i++) {
    const clues = E.botClues(card, 3, mulberry32(i));
    assert.equal(clues.length, 3);
    clues.forEach(c => assert.ok(card.c.includes(c)));
    const norm = clues.map(E.normalize);
    if (new Set(norm).size < norm.length) dupSeen++;
  }
  assert.ok(dupSeen > 0, 'des doublons devraient parfois être forcés');
});

test('sérialisation : aller-retour sans perte', () => {
  const g = game(21);
  E.addClue(g, 1, 'test');
  E.guess(g, 'mauvaise-réponse');
  const back = E.deserialize(E.serialize(g), WORDS);
  assert.equal(back.deck.length, g.deck.length);
  assert.equal(back.score, g.score);
  assert.equal(back.guesserIndex, g.guesserIndex);
  assert.equal(back.history.length, 1);
  assert.equal(back.deck[0].w, g.deck[0].w);
  assert.deepEqual(back.deck[0].c, g.deck[0].c);
});

test('réponses : accents ignorés, espaces normalisés', () => {
  assert.equal(E.answersMatch('  ecole ', 'École'), true);
  assert.equal(E.answersMatch('ecoles', 'école'), false);
  assert.equal(E.answersMatch('', 'école'), false);
});
