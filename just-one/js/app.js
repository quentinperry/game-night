/* Interface de Just One mobile (projet de fan non officiel). */
/* global JUST_ONE_WORDS, JustOneEngine */
(function () {
  'use strict';

  const E = window.JustOneEngine;
  const WORDS = window.JUST_ONE_WORDS;
  const SAVE_KEY = 'justone.save.v1';
  const BEST_KEY = 'justone.best.v1';

  const $ = function (sel, root) { return (root || document).querySelector(sel); };
  const esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  let G = null;   // état du moteur
  let ui = null;  // état d'interface de la manche en cours
  let setupMode = 'multi';
  let setupCount = 4;

  /* ---------- persistance ---------- */
  function save() { if (G) { try { localStorage.setItem(SAVE_KEY, E.serialize(G)); } catch (e) {} } }
  function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} }
  function loadSave() {
    try {
      const s = localStorage.getItem(SAVE_KEY);
      if (!s) return null;
      const g = E.deserialize(s, WORDS);
      return g && g.deck && g.deck.length ? g : null;
    } catch (e) { return null; }
  }
  function best() { try { return Number(localStorage.getItem(BEST_KEY) || 0); } catch (e) { return 0; } }
  function setBest(n) { if (n > best()) { try { localStorage.setItem(BEST_KEY, String(n)); } catch (e) {} } }

  function show(id) {
    document.querySelectorAll('.screen').forEach(function (s) { s.classList.toggle('active', s.id === id); });
    window.scrollTo(0, 0);
  }

  /* ---------- accueil ---------- */
  function renderHome() {
    const saved = loadSave();
    const btn = $('#btn-continue');
    if (saved && !saved.over) {
      btn.style.display = '';
      btn.innerHTML = 'Continuer la partie <small>Carte ' + E.cardNumber(saved) + '/13 · score ' + saved.score + '</small>';
    } else {
      btn.style.display = 'none';
    }
    const b = best();
    $('#best-line').textContent = b > 0 ? 'Meilleur score : ' + b + '/13' : '';
    show('screen-home');
  }

  /* ---------- configuration ---------- */
  function renderSetup() {
    $('#setup-title').textContent = setupMode === 'solo' ? 'Partie solo' : 'Entre amis';
    const body = $('#setup-body');
    body.innerHTML = '';
    if (setupMode === 'online') {
      body.innerHTML =
        '<p class="setup-note">Chacun joue sur <strong>son appareil</strong>. L’hôte crée un salon et partage le <strong>code</strong>, les autres le rejoignent. Connexion directe entre appareils, sans compte ni serveur de jeu.</p>' +
        '<div><div class="setup-label">Ton pseudo</div>' +
        '<div class="field"><input id="online-name" maxlength="14" value="Joueur" autocomplete="off"></div></div>' +
        '<button class="btn btn-primary btn-big" id="btn-create">Créer une partie</button>' +
        '<div style="height:8px"></div>' +
        '<div><div class="setup-label">Rejoindre avec un code</div>' +
        '<div class="field"><input id="online-code" maxlength="8" placeholder="CODE" autocomplete="off" style="text-transform:uppercase;text-align:center;letter-spacing:5px;font-weight:800"></div></div>' +
        '<button class="btn btn-secondary btn-big" id="btn-join">Rejoindre</button>';
      $('#btn-create').addEventListener('click', function () {
        const name = ($('#online-name').value || 'Joueur').trim() || 'Joueur';
        startOnlineHost(name);
      });
      $('#btn-join').addEventListener('click', function () {
        const name = ($('#online-name').value || 'Joueur').trim() || 'Joueur';
        const code = ($('#online-code').value || '').trim().toUpperCase();
        if (!/^[A-Z2-9]{6,8}$/.test(code)) { alert('Entre le code de la partie (6 à 8 caractères).'); return; }
        startOnlineJoin(code, name);
      });
    } else if (setupMode === 'solo') {
      body.innerHTML =
        '<p class="setup-note">Tu es <strong>toujours le devineur</strong>. À chaque carte, 3 robots écrivent un indice. Trouve le mot mystère en <strong>une seule tentative</strong>.</p>' +
        '<div><div class="setup-label">Ton pseudo</div>' +
        '<div class="field"><input id="solo-name" maxlength="14" value="Toi" autocomplete="off"></div></div>' +
        '<button class="btn btn-primary btn-big" id="btn-start">C’est parti !</button>';
      $('#btn-start').addEventListener('click', function () {
        const name = ($('#solo-name').value || 'Toi').trim() || 'Toi';
        startGame('solo', [
          { name: name, bot: false },
          { name: 'Robot 1', bot: true },
          { name: 'Robot 2', bot: true },
          { name: 'Robot 3', bot: true }
        ]);
      });
    } else {
      body.innerHTML =
        '<p class="setup-note">Tout le monde joue sur <strong>le même appareil</strong>. L’appli indique quand le passer. Le devineur ferme les yeux pendant que les autres écrivent.</p>' +
        '<div><div class="setup-label">Nombre de joueurs (2 à 7)</div>' +
        '<div class="stepper">' +
        '<button id="step-down" aria-label="moins">−</button>' +
        '<span class="stepper-value" id="step-val">' + setupCount + '</span>' +
        '<button id="step-up" aria-label="plus">+</button>' +
        '</div></div>' +
        '<div><div class="setup-label">Pseudos</div><div class="name-grid" id="name-grid"></div></div>' +
        '<button class="btn btn-primary btn-big" id="btn-start">C’est parti !</button>';
      const grid = $('#name-grid');
      for (let i = 0; i < setupCount; i++) {
        const d = document.createElement('div');
        d.className = 'field';
        d.innerHTML = '<input class="name-input" maxlength="14" value="Joueur ' + (i + 1) + '" autocomplete="off">';
        grid.appendChild(d);
      }
      function refresh() {
        $('#step-val').textContent = setupCount;
        while (grid.children.length < setupCount) {
          const d = document.createElement('div');
          d.className = 'field';
          d.innerHTML = '<input class="name-input" maxlength="14" value="Joueur ' + (grid.children.length + 1) + '" autocomplete="off">';
          grid.appendChild(d);
        }
        while (grid.children.length > setupCount) grid.removeChild(grid.lastChild);
      }
      $('#step-down').addEventListener('click', function () { setupCount = Math.max(2, setupCount - 1); refresh(); });
      $('#step-up').addEventListener('click', function () { setupCount = Math.min(7, setupCount + 1); refresh(); });
      $('#btn-start').addEventListener('click', function () {
        const players = Array.prototype.map.call(grid.querySelectorAll('.name-input'), function (inp, i) {
          return { name: (inp.value || '').trim() || 'Joueur ' + (i + 1), bot: false };
        });
        startGame('multi', players);
      });
    }
    show('screen-setup');
  }

  /* ---------- partie ---------- */
  function startGame(mode, players) {
    leaveOnline();
    G = E.createGame({ mode: mode, players: players, words: WORDS });
    clearSave();
    save();
    ui = newRoundUi();
    show('screen-game');
    renderGame();
  }

  function resumeGame(saved) {
    G = saved;
    G.clues = []; // la carte en cours reprend à zéro (indices non révélés)
    ui = newRoundUi();
    show('screen-game');
    renderGame();
  }

  function newRoundUi() {
    const u = { phase: G.mode === 'solo' ? 'solo-ready' : 'pass-guesser', queue: [], pos: 0, reveal: null, result: null };
    if (G.mode === 'multi') {
      for (let i = 0; i < G.players.length; i++) {
        if (i === G.guesserIndex) continue;
        for (let k = 0; k < G.cluesPerGiver; k++) u.queue.push(i);
      }
    }
    return u;
  }

  function renderGame() {
    if (!G) { renderHome(); return; }
    $('#stat-card').textContent = 'Carte ' + E.cardNumber(G) + '/' + E.TOTAL_CARDS;
    $('#stat-score').textContent = 'Score ' + G.score;
    renderTrack(G.history, E.TOTAL_CARDS, false);
    const chips = $('#players-chips');
    chips.innerHTML = '';
    G.players.forEach(function (p, i) {
      const c = document.createElement('span');
      c.className = 'chip' + (i === G.guesserIndex ? ' guesser' : '');
      c.style.setProperty('--pc', 'var(--p' + (i % 7) + ')');
      c.textContent = (i === G.guesserIndex ? '👑 ' : '') + p.name;
      chips.appendChild(c);
    });
    const body = $('#game-body');
    body.innerHTML = '';
    const phase = ui.phase;
    if (phase === 'pass-guesser') return renderPass(body, 'guess-start');
    if (phase === 'clue') return renderClue(body);
    if (phase === 'reveal') return renderReveal(body);
    if (phase === 'pass-see') return renderPass(body, 'guess-see');
    if (phase === 'guess' || phase === 'solo-guess') return renderGuess(body);
    if (phase === 'solo-ready') return renderSoloReady(body);
    if (phase === 'result') return renderResult(body);
  }

  /* Piste des 13 cartes : résultat de chaque carte jouée + carte en cours. */
  function renderTrack(history, total, hidden) {
    const el = $('#card-track');
    if (!el) return;
    el.hidden = !!hidden;
    if (hidden) return;
    const cells = [];
    (history || []).forEach(function (h) {
      cells.push(h.result);
      for (let k = 1; k < (h.cardsOut || 1); k++) cells.push('lost');
    });
    let html = '';
    for (let i = 0; i < total; i++) {
      const r = cells[i];
      html += '<i class="' + (r ? 't-' + r : (i === cells.length ? 't-current' : '')) + '"></i>';
    }
    el.innerHTML = html;
  }

  function panel(html) {
    const d = document.createElement('div');
    d.className = 'panel';
    d.innerHTML = html;
    return d;
  }

  function renderPass(body, kind) {
    const g = E.guesser(G);
    const see = kind === 'guess-see';
    body.appendChild(panel(
      '<div class="eyes">' + (see ? '👀' : '🙈') + '</div>' +
      '<h2>Passe l’appareil à <span class="big-name">' + esc(g.name) + '</span></h2>' +
      '<p>' + (see
        ? 'Tu es le devineur : <b>ouvre les yeux</b>.'
        : 'Tu es le <b>devineur</b> : ferme les yeux et <b>ne regarde pas le mot</b>.') + '</p>' +
      '<button class="btn btn-primary btn-big" id="btn-pass">' + (see ? 'Je suis ' + esc(g.name) + ', j’ouvre les yeux' : 'Je suis ' + esc(g.name) + ', je ferme les yeux') + '</button>'
    ));
    $('#btn-pass', body).addEventListener('click', function () {
      ui.phase = see ? 'guess' : 'clue';
      ui.pos = 0;
      renderGame();
    });
  }

  function renderClue(body) {
    const giverIdx = ui.queue[ui.pos];
    const giver = G.players[giverIdx];
    const total = ui.queue.length;
    const p = panel(
      '<div class="progress">Indice ' + (ui.pos + 1) + ' / ' + total + '</div>' +
      '<div class="eyes">✍️</div>' +
      '<h2>Passe l’appareil à <span class="big-name">' + esc(giver.name) + '</span></h2>' +
      '<div class="result-word"><span>' + esc(E.currentCard(G).w) + '</span></div>' +
      '<p class="result-detail">Ne le montre pas à ' + esc(E.guesser(G).name) + '.</p>' +
      '<p>Écris <b>un seul mot</b> pour aider <b>' + esc(E.guesser(G).name) + '</b>. Évite l’indice trop évident : les doublons sont annulés.</p>' +
      '<input class="clue-input" id="clue-input" maxlength="30" placeholder="ton indice" autocomplete="off" autocapitalize="off">' +
      '<div class="field-error" id="clue-error"></div>' +
      '<button class="btn btn-primary btn-big" id="btn-clue">Valider mon indice</button>'
    );
    body.appendChild(p);
    const input = $('#clue-input', p);
    const err = $('#clue-error', p);
    input.focus();
    function submit() {
      const r = E.addClue(G, giverIdx, input.value);
      if (!r.ok) {
        err.textContent = r.error;
        p.classList.remove('shake'); void p.offsetWidth; p.classList.add('shake');
        return;
      }
      save();
      ui.pos++;
      if (ui.pos >= total) {
        ui.reveal = E.revealClues(G);
        ui.phase = 'reveal';
      }
      renderGame();
    }
    $('#btn-clue', p).addEventListener('click', submit);
    input.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); submit(); } });
  }

  function clueItem(c, i) {
    const d = document.createElement('div');
    d.className = 'clue-item' + (c.removed ? ' removed' : '');
    d.style.animationDelay = (i * 0.07) + 's';
    d.innerHTML =
      '<div style="flex:1"><div class="clue-word">' + esc(c.text) + '</div>' +
      '<div class="clue-author">' + esc(G.players[c.player].name) + '</div></div>' +
      (c.removed ? '<span class="clue-tag">doublon annulé</span>' : '');
    return d;
  }

  function renderReveal(body) {
    const g = E.guesser(G);
    const p = panel(
      '<div class="eyes">🃏</div>' +
      '<div class="result-word"><span>' + esc(E.currentCard(G).w) + '</span></div>' +
      '<h2>Indices écrits</h2>' +
      '<p>Les doublons sont <b>annulés</b> et barrés.</p>'
    );
    const list = document.createElement('div');
    list.className = 'clue-list';
    G.clues.forEach(function (c, i) { list.appendChild(clueItem(c, i)); });
    p.appendChild(list);
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary btn-big';
    btn.id = 'btn-reveal';
    btn.textContent = 'Passer à ' + g.name;
    p.appendChild(btn);
    body.appendChild(p);
    btn.addEventListener('click', function () { ui.phase = 'pass-see'; renderGame(); });
  }

  function renderSoloReady(body) {
    body.appendChild(panel(
      '<div class="eyes">🤖</div>' +
      '<h2>Carte n°' + E.cardNumber(G) + '</h2>' +
      '<p>Les robots écrivent leurs indices.</p>' +
      '<button class="btn btn-primary btn-big" id="btn-ready">Voir les indices</button>'
    ));
    $('#btn-ready', body).addEventListener('click', function () {
      const card = E.currentCard(G);
      const botCount = G.players.length - 1;
      const clues = E.botClues(card, botCount, Math.random, { forceDuplicate: false });
      for (let i = 0; i < clues.length; i++) E.addClue(G, i + 1, clues[i]);
      ui.reveal = E.revealClues(G, { cancelDuplicates: false }); // en solo, pas d'annulation
      ui.phase = 'solo-guess';
      save();
      renderGame();
    });
  }

  function renderGuess(body) {
    const g = E.guesser(G);
    const rev = ui.reveal || E.revealClues(G);
    ui.reveal = rev;
    const p = panel(
      '<h2>Les indices</h2>'
    );
    const chips = document.createElement('div');
    chips.className = 'clue-chips';
    if (rev.kept.length === 0) {
      chips.innerHTML = '<span class="clue-chip clue-none">Aucun indice</span>';
    } else {
      rev.kept.forEach(function (c) {
        const s = document.createElement('span');
        s.className = 'clue-chip';
        s.textContent = c.text;
        chips.appendChild(s);
      });
    }
    p.appendChild(chips);
    if (rev.removed.length) {
      const n = rev.removed.length;
      const s = n > 1 ? 's' : '';
      const line = document.createElement('p');
      line.className = 'removed-line';
      line.textContent = n + ' doublon' + s + ' retiré' + s + '.';
      p.appendChild(line);
    }
    p.insertAdjacentHTML('beforeend',
      '<p style="margin-top:14px"><b>Une seule tentative.</b></p>' +
      '<input class="guess-input" id="guess-input" maxlength="40" placeholder="ta réponse" autocomplete="off" autocapitalize="off">' +
      '<div class="field-error" id="guess-error"></div>');
    const row = document.createElement('div');
    row.className = 'btn-row';
    row.innerHTML = '<button class="btn btn-ghost" id="btn-pass-round">Passer</button><button class="btn btn-primary" id="btn-guess">Deviner</button>';
    p.appendChild(row);
    body.appendChild(p);
    const input = $('#guess-input', p);
    const err = $('#guess-error', p);
    if (ui.phase === 'solo-guess' || ui.phase === 'guess') setTimeout(function () { input.focus(); }, 60);
    function submitGuess() {
      const r = E.guess(G, input.value);
      if (!r.ok) { err.textContent = r.error; return; }
      ui.result = r;
      ui.phase = 'result';
      save();
      if (G.over) setBest(G.score);
      renderGame();
    }
    function submitPass() {
      const r = E.pass(G);
      if (!r.ok) { err.textContent = r.error; return; }
      ui.result = r;
      ui.phase = 'result';
      save();
      if (G.over) setBest(G.score);
      renderGame();
    }
    $('#btn-guess', p).addEventListener('click', submitGuess);
    $('#btn-pass-round', p).addEventListener('click', submitPass);
    input.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); submitGuess(); } });
  }

  function renderResult(body) {
    const r = ui.result;
    const e = r.entry;
    let bannerCls, emoji, title, detail;
    if (e.result === 'ok') {
      bannerCls = 'ok'; emoji = '✅'; title = 'Bravo !';
      detail = '+1 point pour l’équipe.';
    } else if (e.result === 'wrong') {
      bannerCls = 'wrong'; emoji = '❌'; title = 'Raté !';
      detail = e.cardsOut >= 2
        ? 'La carte en cours <b>et la suivante</b> sont perdues.'
        : 'Dernière carte : seule celle-ci est perdue.';
    } else {
      bannerCls = 'pass'; emoji = '🤐'; title = 'Passé';
      detail = 'Seule la carte en cours est perdue.';
    }
    const p = panel(
      '<div class="result-banner ' + bannerCls + '">' +
      '<div class="emoji">' + emoji + '</div><h2>' + title + '</h2>' +
      '<p>' + (e.result === 'wrong' && e.guess ? 'Ta réponse : « ' + esc(e.guess) + ' »' : '') + '</p>' +
      '</div>' +
      '<div class="result-word"><span>' + esc(e.word) + '</span></div>' +
      '<p class="result-detail">' + detail + '</p>'
    );
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary btn-big';
    btn.id = 'btn-next';
    btn.textContent = G.over ? 'Voir le score final' : 'Carte suivante';
    p.appendChild(btn);
    body.appendChild(p);
    btn.addEventListener('click', function () {
      if (G.over) { clearSave(); renderEnd(); }
      else { ui = newRoundUi(); save(); renderGame(); }
    });
  }

  /* ---------- fin ---------- */
  function renderEnd() {
    const rating = E.ratingFor(G.score);
    setBest(G.score);
    const rows = G.history.map(function (h) {
      const icon = h.result === 'ok' ? '✅' : (h.result === 'wrong' ? '❌' : '🤐');
      const kept = h.clues.filter(function (c) { return !c.removed; }).length;
      return '<div class="history-row"><span class="h-icon">' + icon + '</span>' +
        '<span class="h-word">' + esc(h.word || '?') + '</span>' +
        '<span class="h-clues">' + kept + '/' + h.clues.length + ' indices</span></div>';
    }).join('');
    $('#end-body').innerHTML =
      '<div class="end-score-card">' +
      '<div class="end-kicker">Score final</div>' +
      '<div class="end-ring" style="--p:' + (G.score / E.TOTAL_CARDS) + '"><div class="end-score">' + G.score + '<small>/' + E.TOTAL_CARDS + '</small></div></div>' +
      '<div class="end-rating">' + rating.label + '</div>' +
      '<div class="end-best">Record : ' + best() + '/' + E.TOTAL_CARDS + '</div>' +
      '</div>' +
      '<div class="history"><div class="history-title">Détail des ' + G.history.length + ' manches</div>' + rows + '</div>' +
      '<div class="btn-row"><button class="btn btn-ghost" id="btn-home">Accueil</button>' +
      '<button class="btn btn-primary" id="btn-replay">Rejouer</button></div>';
    show('screen-end');
    $('#btn-home').addEventListener('click', function () { G = null; renderHome(); });
    $('#btn-replay').addEventListener('click', function () { startGame(G.mode, G.players); });
  }

  /* ---------- mode en ligne (WebRTC + code de partie) ---------- */
  let net = null;
  let hostState = null;
  let myView = null;

  function sendAction(msg) {
    if (!net) return;
    if (net.isHost) hostAction('host', msg);
    else net.send(msg);
  }

  function leaveOnline() {
    if (net) { try { net.close(); } catch (e) {} }
    net = null; hostState = null; myView = null;
  }

  function abortOnline(reason) {
    if (net) net.send({ t: 'aborted', reason: reason });
    setTimeout(function () { leaveOnline(); alert(reason); renderHome(); }, 300);
  }

  function lobbyView(isHost, code, players, hostName) {
    return {
      phase: 'lobby', code: code, isHost: isHost, you: 0,
      players: players.map(function (p) { return { name: p.name }; }),
      hostName: hostName || '', score: 0, cardNumber: 1, totalCards: E.TOTAL_CARDS,
      deckCount: E.TOTAL_CARDS, guesserIndex: 0, clues: [], removedCount: 0,
      history: [], over: false, result: null, myPending: 0, submittedCount: 0, giversTotal: 0
    };
  }

  function startOnlineHost(name) {
    leaveOnline();
    const code = E.makeRoomCode();
    hostState = { players: [{ id: 'host', name: name, dc: null }], G: null, phase: 'lobby', pending: {} };
    net = new window.JustOneNet.GameNet({
      code: code, name: name, isHost: true,
      onView: function (v) { myView = v; renderOnline(); },
      onAction: function (peerId, msg) { hostAction(peerId, msg); },
      onPeerJoin: function (peerId, pname) {
        const hs = hostState;
        if (!hs) return;
        if (hs.phase !== 'lobby') {
          const dc = net.dcs[peerId];
          if (dc && dc.readyState === 'open') dc.send(JSON.stringify({ t: 'aborted', reason: 'Partie déjà en cours.' }));
          net._dropPeer(peerId);
          return;
        }
        hs.players.push({ id: peerId, name: pname, dc: net.dcs[peerId] || null });
        hostBroadcast();
      },
      onPeerLeave: function (peerId) {
        const hs = hostState;
        if (!hs) return;
        hs.players = hs.players.filter(function (p) { return p.id !== peerId; });
        if (hs.phase === 'lobby' || !hs.G) hostBroadcast();
        else abortOnline('Un joueur a quitté la partie.');
      },
      onAborted: function () {},
      onError: function (m) { alert(m); }
    });
    myView = lobbyView(true, code, hostState.players, name);
    show('screen-game');
    renderOnline();
  }

  function startOnlineJoin(code, name) {
    leaveOnline();
    net = new window.JustOneNet.GameNet({
      code: code, name: name, isHost: false,
      onView: function (v) { myView = v; show('screen-game'); renderOnline(); },
      onAction: function () {},
      onPeerJoin: function () {},
      onPeerLeave: function () {},
      onAborted: function (reason) { leaveOnline(); alert(reason); renderHome(); },
      onError: function (m) { leaveOnline(); alert(m); renderHome(); }
    });
    myView = lobbyView(false, code, [{ name: name }], '');
    show('screen-game');
    renderOnline();
  }

  function giversTotal() {
    const hs = hostState;
    if (!hs || !hs.G) return 0;
    let n = 0;
    for (let i = 0; i < hs.G.players.length; i++) if (i !== hs.G.guesserIndex) n += hs.G.cluesPerGiver;
    return n;
  }

  function submittedCount() {
    const hs = hostState;
    if (!hs || !hs.G) return 0;
    let n = 0;
    for (let i = 0; i < hs.G.players.length; i++) if (i !== hs.G.guesserIndex) n += hs.G.cluesPerGiver - (hs.pending[i] || 0);
    return n;
  }

  function resetPending() {
    const hs = hostState;
    hs.pending = {};
    for (let i = 0; i < hs.G.players.length; i++) if (i !== hs.G.guesserIndex) hs.pending[i] = hs.G.cluesPerGiver;
  }

  function hostStart() {
    const hs = hostState;
    if (!hs || hs.phase !== 'lobby' || hs.players.length < 2) return;
    hs.G = E.createGame({ mode: 'multi', players: hs.players.map(function (p) { return { name: p.name }; }), words: WORDS });
    hs.phase = 'clues';
    resetPending();
    hostBroadcast();
  }

  function hostBroadcast() {
    const hs = hostState;
    if (!hs || !net) return;
    const g = hs.G;
    hs.players.forEach(function (p, i) {
      let view;
      if (!g) {
        view = lobbyView(i === 0, net.code, hs.players, hs.players[0].name);
        view.you = i;
      } else {
        view = E.publicState(g, hs.phase, i, {
          myPending: hs.pending[i] || 0,
          submittedCount: submittedCount(),
          giversTotal: giversTotal(),
          isHost: i === 0,
          hostName: hs.players[0].name,
          code: net.code
        });
      }
      if (p.dc && p.dc.readyState === 'open') {
        try { p.dc.send(JSON.stringify({ t: 'view', view: view })); } catch (e) {}
      }
      if (i === 0) myView = view;
    });
    renderOnline();
  }

  function hostAction(peerId, msg) {
    const hs = hostState;
    if (!hs || !hs.G || !msg) return;
    const idx = hs.players.findIndex(function (p) { return p.id === peerId; });
    if (idx < 0) return;
    const g = hs.G;
    if (msg.t === 'clue' && hs.phase === 'clues' && (hs.pending[idx] || 0) > 0) {
      const r = E.addClue(g, idx, msg.text);
      if (!r.ok) {
        const p = hs.players[idx];
        if (p.dc && p.dc.readyState === 'open') p.dc.send(JSON.stringify({ t: 'error', message: r.error }));
        return;
      }
      hs.pending[idx]--;
      if (submittedCount() >= giversTotal()) { E.revealClues(g); hs.phase = 'guess'; }
      hostBroadcast();
    } else if (msg.t === 'guess' && hs.phase === 'guess' && idx === g.guesserIndex) {
      E.guess(g, msg.text);
      hs.phase = 'result';
      hostBroadcast();
    } else if (msg.t === 'pass' && hs.phase === 'guess' && idx === g.guesserIndex) {
      E.pass(g);
      hs.phase = 'result';
      hostBroadcast();
    } else if (msg.t === 'next' && hs.phase === 'result') {
      if (g.over) hs.phase = 'end';
      else { hs.phase = 'clues'; resetPending(); }
      hostBroadcast();
    } else if (msg.t === 'replay' && hs.phase === 'end') {
      hostStart();
    }
  }

  function renderOnline() {
    const v = myView;
    if (!v) return;
    show('screen-game');
    const inLobby = v.phase === 'lobby';
    $('#stat-card').textContent = inLobby ? 'Salon ' + (v.code || '') : 'Carte ' + v.cardNumber + '/' + v.totalCards;
    $('#stat-score').textContent = 'Score ' + v.score;
    renderTrack(v.history, v.totalCards, inLobby);
    const chips = $('#players-chips');
    chips.innerHTML = '';
    v.players.forEach(function (p, i) {
      const c = document.createElement('span');
      c.className = 'chip' + (!inLobby && i === v.guesserIndex ? ' guesser' : '');
      c.style.setProperty('--pc', 'var(--p' + (i % 7) + ')');
      c.textContent = (i === v.you ? '● ' : '') + (!inLobby && i === v.guesserIndex ? '👑 ' : '') + p.name;
      chips.appendChild(c);
    });
    const body = $('#game-body');
    body.innerHTML = '';
    if (v.phase === 'lobby') return renderOnlineLobby(body, v);
    if (v.phase === 'clues') return renderOnlineClues(body, v);
    if (v.phase === 'guess') return renderOnlineGuess(body, v);
    if (v.phase === 'result') return renderOnlineResult(body, v);
    if (v.phase === 'end') return renderOnlineEnd(body, v);
  }

  function renderOnlineLobby(body, v) {
    const p = panel(
      '<div class="eyes">🌐</div><h2>Salon en ligne</h2>' +
      '<p>Partage ce code :</p>' +
      '<div class="room-code">' + esc(v.code) + '</div>'
    );
    const copy = document.createElement('button');
    copy.className = 'btn btn-ghost btn-small';
    copy.textContent = 'Copier le code';
    copy.style.margin = '0 auto 14px';
    copy.addEventListener('click', function () {
      const done = function () { copy.textContent = 'Copié'; setTimeout(function () { copy.textContent = 'Copier le code'; }, 1500); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(v.code).then(done, done);
      else done();
    });
    p.appendChild(copy);
    const list = document.createElement('div');
    list.className = 'clue-list';
    v.players.forEach(function (pl, i) {
      const d = document.createElement('div');
      d.className = 'clue-item';
      d.innerHTML = '<div style="flex:1"><div class="clue-word" style="font-size:18px">' + esc(pl.name) + (i === v.you ? ' (toi)' : '') + (i === 0 ? ' (hôte)' : '') + '</div></div>';
      list.appendChild(d);
    });
    p.appendChild(list);
    const note = document.createElement('p');
    note.textContent = v.players.length < 2 ? 'En attente d’autres joueurs (2 à 7).' : '';
    p.appendChild(note);
    if (v.isHost) {
      const b = document.createElement('button');
      b.className = 'btn btn-primary btn-big';
      b.id = 'btn-online-start';
      b.textContent = 'Lancer la partie';
      b.disabled = v.players.length < 2;
      b.addEventListener('click', hostStart);
      p.appendChild(b);
    } else {
      const w = document.createElement('p');
      w.textContent = 'L’hôte va lancer la partie.';
      p.appendChild(w);
    }
    body.appendChild(p);
  }

  function renderOnlineClues(body, v) {
    if (v.myPending > 0) {
      const p = panel(
        '<div class="progress">Indices écrits : ' + v.submittedCount + ' / ' + v.giversTotal + '</div>' +
        '<div class="eyes">✍️</div>' +
        '<h2>À toi, ' + esc(v.players[v.you].name) + ' !</h2>' +
        '<div class="result-word"><span>' + esc(v.word || '') + '</span></div>' +
        '<p>Écris <b>un seul mot</b> pour aider <b>' + esc(v.players[v.guesserIndex].name) + '</b>. Les doublons sont annulés.</p>' +
        '<input class="clue-input" id="online-clue" maxlength="30" placeholder="ton indice" autocomplete="off" autocapitalize="off">' +
        '<div class="field-error" id="online-clue-error"></div>'
      );
      const b = document.createElement('button');
      b.className = 'btn btn-primary btn-big';
      b.textContent = 'Envoyer mon indice';
      p.appendChild(b);
      body.appendChild(p);
      const input = $('#online-clue', p);
      setTimeout(function () { input.focus(); }, 60);
      function submit() {
        const chk = E.validateClue(input.value);
        if (!chk.ok) {
          $('#online-clue-error', p).textContent = chk.error;
          p.classList.remove('shake'); void p.offsetWidth; p.classList.add('shake');
          return;
        }
        sendAction({ t: 'clue', text: chk.value });
      }
      b.addEventListener('click', submit);
      input.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); submit(); } });
    } else {
      body.appendChild(panel(
        '<div class="eyes">⏳</div>' +
        '<div class="result-word"><span>' + esc(v.word || '') + '</span></div>' +
        '<h2>En attente des indices</h2>' +
        '<p>' + v.submittedCount + ' / ' + v.giversTotal + ' écrits. Devineur : <b>' + esc(v.players[v.guesserIndex].name) + '</b>.</p>'
      ));
    }
  }

  function renderOnlineGuess(body, v) {
    const isGuesser = v.you === v.guesserIndex;
    if (!isGuesser) {
      const p = panel(
        '<div class="eyes">🃏</div>' +
        '<div class="result-word"><span>' + esc(v.word || '') + '</span></div>' +
        '<h2>Les indices écrits</h2>' +
        '<p><b>' + esc(v.players[v.guesserIndex].name) + '</b> réfléchit.</p>'
      );
      const list = document.createElement('div');
      list.className = 'clue-list';
      v.clues.forEach(function (c) {
        const d = document.createElement('div');
        d.className = 'clue-item' + (c.removed ? ' removed' : '');
        d.innerHTML = '<div style="flex:1"><div class="clue-word">' + esc(c.text) + '</div>' +
          '<div class="clue-author">' + esc(v.players[c.player].name) + '</div></div>' +
          (c.removed ? '<span class="clue-tag">doublon annulé</span>' : '');
        list.appendChild(d);
      });
      p.appendChild(list);
      body.appendChild(p);
      return;
    }
    const p = panel(
            '<h2>Les indices</h2>'
    );
    const chips = document.createElement('div');
    chips.className = 'clue-chips';
    if (!v.clues.length) {
      chips.innerHTML = '<span class="clue-chip clue-none">Aucun indice</span>';
    } else {
      v.clues.forEach(function (c) {
        const s = document.createElement('span');
        s.className = 'clue-chip';
        s.textContent = c.text;
        chips.appendChild(s);
      });
    }
    p.appendChild(chips);
    if (v.removedCount > 0) {
      const line = document.createElement('p');
      line.className = 'removed-line';
      const s = v.removedCount > 1 ? 's' : '';
      line.textContent = v.removedCount + ' doublon' + s + ' retiré' + s + '.';
      p.appendChild(line);
    }
    p.insertAdjacentHTML('beforeend',
      '<p style="margin-top:14px"><b>Une seule tentative.</b></p>' +
      '<input class="guess-input" id="online-guess" maxlength="40" placeholder="ta réponse" autocomplete="off" autocapitalize="off">' +
      '<div class="field-error" id="online-guess-error"></div>');
    const row = document.createElement('div');
    row.className = 'btn-row';
    row.innerHTML = '<button class="btn btn-ghost" id="online-pass">Passer</button><button class="btn btn-primary" id="online-guess-btn">Deviner</button>';
    p.appendChild(row);
    body.appendChild(p);
    const input = $('#online-guess', p);
    setTimeout(function () { input.focus(); }, 60);
    function submitGuess() {
      const val = input.value.trim();
      if (!val) { $('#online-guess-error', p).textContent = 'Écris ta réponse.'; return; }
      sendAction({ t: 'guess', text: val });
    }
    $('#online-guess-btn', p).addEventListener('click', submitGuess);
    $('#online-pass', p).addEventListener('click', function () { sendAction({ t: 'pass' }); });
    input.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); submitGuess(); } });
  }

  function renderOnlineResult(body, v) {
    const r = v.result || {};
    let cls, emoji, title, detail;
    if (r.result === 'ok') { cls = 'ok'; emoji = '✅'; title = 'Bravo !'; detail = '+1 point pour l’équipe.'; }
    else if (r.result === 'wrong') { cls = 'wrong'; emoji = '❌'; title = 'Raté !'; detail = r.cardsOut >= 2 ? 'La carte en cours <b>et la suivante</b> sont perdues.' : 'Dernière carte : seule celle-ci est perdue.'; }
    else { cls = 'pass'; emoji = '🤐'; title = 'Passé'; detail = 'Seule la carte en cours est perdue.'; }
    const p = panel(
      '<div class="result-banner ' + cls + '"><div class="emoji">' + emoji + '</div><h2>' + title + '</h2>' +
      (r.guess ? '<p>Réponse : « ' + esc(r.guess) + ' »</p>' : '') + '</div>' +
      '<div class="result-word"><span>' + esc(r.word || '') + '</span></div>' +
      '<p class="result-detail">' + detail + '</p>'
    );
    const b = document.createElement('button');
    b.className = 'btn btn-primary btn-big';
    b.textContent = v.over ? 'Voir le score final' : 'Carte suivante';
    b.addEventListener('click', function () { sendAction({ t: 'next' }); });
    p.appendChild(b);
    body.appendChild(p);
  }

  function renderOnlineEnd(body, v) {
    const rating = E.ratingFor(v.score);
    const rows = v.history.map(function (h) {
      const icon = h.result === 'ok' ? '✅' : (h.result === 'wrong' ? '❌' : '🤐');
      return '<div class="history-row"><span class="h-icon">' + icon + '</span>' +
        '<span class="h-word">' + esc(h.word || '?') + '</span>' +
        '<span class="h-clues">' + h.kept + '/' + h.total + ' indices</span></div>';
    }).join('');
    const d = document.createElement('div');
    d.innerHTML =
      '<div class="end-score-card">' +
      '<div class="end-kicker">Score final</div>' +
      '<div class="end-ring" style="--p:' + (v.score / v.totalCards) + '"><div class="end-score">' + v.score + '<small>/' + v.totalCards + '</small></div></div>' +
      '<div class="end-rating">' + rating.label + '</div></div>' +
      '<div class="history"><div class="history-title">Détail des ' + v.history.length + ' manches</div>' + rows + '</div>' +
      '<div class="btn-row"><button class="btn btn-ghost" id="online-home">Accueil</button>' +
      '<button class="btn btn-primary" id="online-replay">Rejouer</button></div>';
    body.appendChild(d);
    $('#online-home', d).addEventListener('click', function () { leaveOnline(); renderHome(); });
    $('#online-replay', d).addEventListener('click', function () { sendAction({ t: 'replay' }); });
  }

  /* ---------- wiring ---------- */
  $('#btn-solo').addEventListener('click', function () { setupMode = 'solo'; renderSetup(); });
  $('#btn-online').addEventListener('click', function () { setupMode = 'online'; renderSetup(); });
  $('#btn-multi').addEventListener('click', function () { setupMode = 'multi'; renderSetup(); });
  $('#btn-setup-back').addEventListener('click', renderHome);
  $('#btn-continue').addEventListener('click', function () {
    const saved = loadSave();
    if (saved) resumeGame(saved); else renderHome();
  });
  $('#btn-quit').addEventListener('click', function () {
    if (confirm('Abandonner la partie en cours ?')) { clearSave(); G = null; ui = null; leaveOnline(); renderHome(); }
  });
  $('#btn-rules').addEventListener('click', function () { $('#rules-overlay').hidden = false; });
  $('#btn-rules-close').addEventListener('click', function () { $('#rules-overlay').hidden = true; });
  $('#rules-overlay').addEventListener('click', function (ev) { if (ev.target === this) this.hidden = true; });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }

  renderHome();
})();
