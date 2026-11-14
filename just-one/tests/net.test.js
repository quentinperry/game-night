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

function game(seed) {
  return E.createGame({
    mode: 'multi',
    players: [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }],
    words: WORDS,
    rng: mulberry32(seed || 3)
  });
}

test('makeRoomCode : 8 caractères par défaut, alphabet sans ambiguïté', () => {
  const rng = mulberry32(1);
  const code = E.makeRoomCode(rng);
  assert.equal(code.length, 8);
  assert.match(code, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
  const codes = new Set();
  for (let i = 0; i < 200; i++) codes.add(E.makeRoomCode(mulberry32(i)));
  assert.equal(codes.size, 200);
});

test('publicState : le devineur ne reçoit jamais le mot, les autres oui', () => {
  const g = game(5);
  const secret = E.currentCard(g).w;
  const guesserView = E.publicState(g, 'clues', g.guesserIndex, {});
  assert.equal(guesserView.word, null);
  assert.ok(!JSON.stringify(guesserView).includes(secret), 'le devineur ne doit rien voir du mot en cours');
  for (const c of g.deck.slice(1)) {
    assert.ok(!JSON.stringify(guesserView).includes(c.w), 'aucune carte de la pioche ne fuite');
  }
  const otherView = E.publicState(g, 'clues', 1, {});
  assert.equal(otherView.word, secret, 'les donneurs d’indices voient le mot à faire deviner');
  for (const c of g.deck.slice(1)) {
    assert.ok(!JSON.stringify(otherView).includes(c.w), 'seul le mot en cours est visible, pas la pioche');
  }
  assert.equal(otherView.deckCount, g.deck.length);
  assert.equal(otherView.clues.length, 0, 'pas d’indices visibles pendant la phase d’écriture');
});

test('publicState en phase guess : le mot reste visible pour les non-devineurs, caché au devineur', () => {
  const g = game(9);
  E.addClue(g, 1, 'indice');
  E.revealClues(g);
  const secret = E.currentCard(g).w;
  assert.equal(E.publicState(g, 'guess', g.guesserIndex, {}).word, null);
  assert.equal(E.publicState(g, 'guess', 2, {}).word, secret);
});

test('publicState en phase guess : le devineur ne voit pas les doublons', () => {
  const g = game(6);
  E.addClue(g, 1, 'animal');
  E.addClue(g, 2, 'Animal');
  E.addClue(g, 3, 'aboie');
  E.revealClues(g);
  const guesserView = E.publicState(g, 'guess', 0, {});
  assert.equal(guesserView.clues.length, 1);
  assert.equal(guesserView.clues[0].text, 'aboie');
  assert.equal(guesserView.removedCount, 2);
  const otherView = E.publicState(g, 'guess', 1, {});
  assert.equal(otherView.clues.length, 3);
  assert.equal(otherView.clues.filter(c => c.removed).length, 2);
});

test('publicState en phase result : le mot de la manche est révélé', () => {
  const g = game(7);
  const w = E.currentCard(g).w;
  E.guess(g, w);
  const view = E.publicState(g, 'result', 0, {});
  assert.equal(view.result.word, w);
  assert.equal(view.result.result, 'ok');
  assert.equal(view.score, 1);
  assert.equal(view.history.length, 1);
});

test('publicState : infos de salon et de progression présentes', () => {
  const g = game(8);
  const view = E.publicState(g, 'clues', 2, { myPending: 1, submittedCount: 2, giversTotal: 3, isHost: false, hostName: 'A', code: 'ABCDEFGH' });
  assert.equal(view.code, 'ABCDEFGH');
  assert.equal(view.hostName, 'A');
  assert.equal(view.you, 2);
  assert.equal(view.myPending, 1);
  assert.equal(view.submittedCount, 2);
  assert.equal(view.giversTotal, 3);
  assert.equal(view.players.length, 4);
  assert.equal(view.totalCards, 13);
});
