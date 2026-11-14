/* Moteur de Just One (projet de fan non officiel) : logique pure, sans DOM.
   Fonctionne dans le navigateur (window.JustOneEngine) et sous Node (module.exports). */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.JustOneEngine = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  const TOTAL_CARDS = 13;

  const RATINGS = [
    { min: 13, emoji: '🏆', label: 'Score parfait !' },
    { min: 12, emoji: '🤩', label: 'Incroyable !' },
    { min: 11, emoji: '🌟', label: 'Excellent !' },
    { min: 9,  emoji: '😄', label: 'Très beau score !' },
    { min: 7,  emoji: '🙂', label: 'Dans la moyenne' },
    { min: 4,  emoji: '👍', label: 'Bon début' },
    { min: 0,  emoji: '💪', label: 'À retenter !' }
  ];

  function ratingFor(score) {
    for (const r of RATINGS) if (score >= r.min) return { score, emoji: r.emoji, label: r.label };
    return { score, emoji: '💪', label: 'À retenter !' };
  }

  function normalize(s) {
    return String(s == null ? '' : s)
      .replace(/œ/g, 'oe')
      .replace(/æ/g, 'ae')
      .replace(/Œ/g, 'OE')
      .replace(/Æ/g, 'AE')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '') // accents combinants U+0300-U+036F
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ');
  }

  const CLUE_RE = /^[a-z0-9àâäéèêëîïôöùûüçœæ'’-]+$/i;

  function validateClue(raw) {
    const cleaned = String(raw == null ? '' : raw).trim().replace(/\s+/g, ' ');
    if (!cleaned) return { ok: false, error: 'Écris un indice.' };
    if (/\s/.test(cleaned)) return { ok: false, error: 'Un seul mot, sans espace.' };
    if (!CLUE_RE.test(cleaned)) return { ok: false, error: 'Lettres, tiret ou apostrophe uniquement.' };
    return { ok: true, value: cleaned, normalized: normalize(cleaned) };
  }

  function shuffle(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function cluesPerGiver(playerCount) {
    return playerCount <= 3 ? 2 : 1;
  }

  function buildDeck(words, rng, count) {
    const n = Math.min(count || TOTAL_CARDS, words.length);
    return shuffle(words, rng).slice(0, n);
  }

  function createGame(options) {
    const opts = options || {};
    const rng = opts.rng || Math.random;
    const words = opts.words;
    if (!Array.isArray(words) || words.length < TOTAL_CARDS) {
      throw new Error('Banque de mots insuffisante (minimum ' + TOTAL_CARDS + ' mots requis).');
    }
    const players = (opts.players || []).map(function (p, i) {
      return { name: p.name || 'Joueur ' + (i + 1), bot: !!p.bot };
    });
    if (players.length < 2) throw new Error('Il faut au moins 2 joueurs.');
    const mode = opts.mode === 'solo' ? 'solo' : 'multi';
    return {
      mode: mode,
      players: players,
      deck: buildDeck(words, rng, TOTAL_CARDS).map(function (w) { return { w: w.w, c: (w.c || []).slice() }; }),
      guesserIndex: 0,
      cluesPerGiver: mode === 'solo' ? 1 : cluesPerGiver(players.length),
      score: 0,
      clues: [],
      history: [],
      over: false
    };
  }

  function currentCard(state) {
    return state.deck[0] || null;
  }

  function cardNumber(state) {
    if (state.over) return TOTAL_CARDS;
    return TOTAL_CARDS - state.deck.length + 1;
  }

  function guesser(state) {
    return state.players[state.guesserIndex];
  }

  function addClue(state, playerIndex, raw) {
    if (state.over) return { ok: false, error: 'La partie est terminée.' };
    const v = validateClue(raw);
    if (!v.ok) return v;
    const clue = { player: playerIndex, text: v.value, normalized: v.normalized, removed: false };
    state.clues.push(clue);
    return { ok: true, clue: clue };
  }

  function revealClues(state, opts) {
    const cancel = !opts || opts.cancelDuplicates !== false;
    const counts = {};
    state.clues.forEach(function (c) { counts[c.normalized] = (counts[c.normalized] || 0) + 1; });
    const kept = [];
    const removed = [];
    state.clues.forEach(function (c) {
      if (cancel && counts[c.normalized] > 1) { c.removed = true; removed.push(c); }
      else { c.removed = false; kept.push(c); }
    });
    return { kept: kept, removed: removed };
  }

  function answersMatch(answerRaw, word) {
    const a = normalize(answerRaw);
    return !!a && a === normalize(word);
  }

  function endRound(state, result, guessText) {
    const card = currentCard(state);
    let cardsOut;
    if (result === 'ok') {
      state.score += 1;
      cardsOut = 1;
      state.deck.shift();
    } else if (result === 'wrong') {
      cardsOut = Math.min(2, state.deck.length);
      state.deck.splice(0, cardsOut);
    } else {
      cardsOut = 1;
      state.deck.shift();
    }
    const entry = {
      word: card ? card.w : null,
      result: result,
      guess: guessText || null,
      cardsOut: cardsOut,
      clues: state.clues.map(function (c) { return { text: c.text, removed: c.removed, player: c.player }; })
    };
    state.history.push(entry);
    state.clues = [];
    if (state.deck.length === 0) {
      state.over = true;
    } else if (state.mode !== 'solo') {
      state.guesserIndex = (state.guesserIndex + 1) % state.players.length;
    }
    return entry;
  }

  function guess(state, answerRaw) {
    if (state.over || !currentCard(state)) return { ok: false, error: 'Pas de carte en cours.' };
    const a = String(answerRaw == null ? '' : answerRaw).trim();
    if (!a) return { ok: false, error: 'Écris ta réponse.' };
    const match = answersMatch(a, currentCard(state).w);
    const entry = endRound(state, match ? 'ok' : 'wrong', normalize(a));
    return { ok: true, match: match, entry: entry };
  }

  function pass(state) {
    if (state.over || !currentCard(state)) return { ok: false, error: 'Pas de carte en cours.' };
    const entry = endRound(state, 'pass');
    return { ok: true, entry: entry };
  }

  function botClues(card, count, rng, opts) {
    rng = rng || Math.random;
    if (!card || !Array.isArray(card.c) || card.c.length === 0) return [];
    const bank = shuffle(card.c, rng);
    const out = [];
    for (let i = 0; i < count && i < bank.length; i++) out.push(bank[i]);
    const forceDup = !opts || opts.forceDuplicate !== false;
    if (forceDup && out.length > 1 && rng() < 0.35) {
      const src = Math.floor(rng() * out.length);
      const dst = Math.floor(rng() * out.length);
      out[dst] = out[src];
    }
    return shuffle(out, rng);
  }

  const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

  function makeRoomCode(rng, len) {
    rng = rng || Math.random;
    len = len || 8;
    let s = '';
    for (let i = 0; i < len; i++) s += CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)];
    return s;
  }

  /* Vue "publique" de l'état envoyée à un joueur en ligne.
     - ne contient jamais les mots de la pioche (deck), seulement leur nombre
     - en phase 'guess', le devineur ne reçoit que les indices conservés
     - en phase 'result', le mot de la manche écoulée est révélé (historique) */
  function publicState(state, phase, forPlayerIndex, opts) {
    opts = opts || {};
    const isGuesser = forPlayerIndex === state.guesserIndex;
    let clues = [];
    let removedCount = 0;
    if (phase === 'guess' && Array.isArray(state.clues)) {
      const all = state.clues;
      removedCount = all.filter(function (c) { return c.removed; }).length;
      const visible = isGuesser ? all.filter(function (c) { return !c.removed; }) : all;
      clues = visible.map(function (c) { return { text: c.text, removed: !!c.removed, player: c.player }; });
    }
    const last = state.history[state.history.length - 1] || null;
    const card = currentCard(state);
    return {
      phase: phase,
      word: (card && !isGuesser && phase !== 'result') ? card.w : null,
      code: opts.code || '',
      players: state.players.map(function (p) { return { name: p.name }; }),
      you: forPlayerIndex,
      isHost: !!opts.isHost,
      hostName: opts.hostName || '',
      guesserIndex: state.guesserIndex,
      score: state.score,
      cardNumber: cardNumber(state),
      totalCards: TOTAL_CARDS,
      deckCount: state.deck.length,
      over: state.over,
      clues: clues,
      removedCount: removedCount,
      myPending: opts.myPending || 0,
      submittedCount: opts.submittedCount || 0,
      giversTotal: opts.giversTotal || 0,
      history: state.history.map(function (h) {
        return {
          word: h.word, result: h.result, guess: h.guess, cardsOut: h.cardsOut,
          kept: h.clues.filter(function (c) { return !c.removed; }).length, total: h.clues.length
        };
      }),
      result: (phase === 'result' && last) ? { word: last.word, result: last.result, guess: last.guess, cardsOut: last.cardsOut } : null
    };
  }

  function serialize(state) {
    return JSON.stringify({
      mode: state.mode,
      players: state.players,
      deck: state.deck.map(function (c) { return c.w; }),
      guesserIndex: state.guesserIndex,
      cluesPerGiver: state.cluesPerGiver,
      score: state.score,
      clues: state.clues,
      history: state.history,
      over: state.over
    });
  }

  function deserialize(json, words) {
    const data = typeof json === 'string' ? JSON.parse(json) : json;
    const byWord = {};
    (words || []).forEach(function (w) { byWord[w.w] = w; });
    return {
      mode: data.mode,
      players: data.players,
      deck: (data.deck || []).map(function (w) {
        const full = byWord[w];
        return { w: w, c: full && full.c ? full.c.slice() : [] };
      }),
      guesserIndex: data.guesserIndex || 0,
      cluesPerGiver: data.cluesPerGiver || 1,
      score: data.score || 0,
      clues: data.clues || [],
      history: data.history || [],
      over: !!data.over
    };
  }

  return {
    TOTAL_CARDS: TOTAL_CARDS,
    RATINGS: RATINGS,
    ratingFor: ratingFor,
    normalize: normalize,
    validateClue: validateClue,
    shuffle: shuffle,
    cluesPerGiver: cluesPerGiver,
    buildDeck: buildDeck,
    createGame: createGame,
    currentCard: currentCard,
    cardNumber: cardNumber,
    guesser: guesser,
    addClue: addClue,
    revealClues: revealClues,
    answersMatch: answersMatch,
    guess: guess,
    pass: pass,
    botClues: botClues,
    makeRoomCode: makeRoomCode,
    CODE_ALPHABET: CODE_ALPHABET,
    publicState: publicState,
    serialize: serialize,
    deserialize: deserialize
  };
});
