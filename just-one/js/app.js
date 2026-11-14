/* Interface de Just One — Mobile (projet fan, non officiel). */
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
      btn.innerHTML = '▶ Continuer la partie <small>Carte ' + E.cardNumber(saved) + '/13 · score ' + saved.score + '</small>';
    } else {
      btn.style.display = 'none';
    }
    const b = best();
    $('#best-line').textContent = b > 0 ? '🏅 Meilleur score : ' + b + '/13' : '';
    show('screen-home');
  }

  /* ---------- configuration ---------- */
  function renderSetup() {
    $('#setup-title').textContent = setupMode === 'solo' ? 'Partie solo' : 'Entre amis';
    const body = $('#setup-body');
    body.innerHTML = '';
    if (setupMode === 'solo') {
      body.innerHTML =
        '<p class="setup-note">🤖 Tu es <strong>toujours le devineur</strong> : à chaque carte, 3 robots écrivent chacun un indice d’un seul mot (les doublons sont annulés, comme dans le vrai jeu). À toi de trouver le mot mystère en <strong>une seule tentative</strong> !</p>' +
        '<div><div class="setup-label">Ton pseudo</div>' +
        '<div class="field"><input id="solo-name" maxlength="14" value="Toi" autocomplete="off"></div></div>' +
        '<button class="btn btn-primary btn-big" id="btn-start">🃏 C’est parti !</button>';
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
        '<p class="setup-note">👥 Chacun joue à tour de rôle sur <strong>ce même appareil</strong> : l’appli te dira quand passer le téléphone. Le devineur ferme les yeux pendant que les autres écrivent leurs indices.</p>' +
        '<div><div class="setup-label">Nombre de joueurs (2 à 7)</div>' +
        '<div class="stepper">' +
        '<button id="step-down" aria-label="moins">−</button>' +
        '<span class="stepper-value" id="step-val">' + setupCount + '</span>' +
        '<button id="step-up" aria-label="plus">+</button>' +
        '</div></div>' +
        '<div><div class="setup-label">Pseudos</div><div class="name-grid" id="name-grid"></div></div>' +
        '<button class="btn btn-primary btn-big" id="btn-start">🃏 C’est parti !</button>';
      const grid = $('#name-grid');
      for (let i = 0; i < setupCount; i++) {
        const d = document.createElement('div');
        d.className = 'field';
        d.innerHTML = '<input class="name-input" maxlength="14" value="Joueur ' + (i + 1) + '" autocomplete="off">';
        grid.appendChild(d);
      }
      function refresh() {
        $('#step-val').textContent = setupCount;
        const inputs = grid.querySelectorAll('.name-input');
        while (inputs.length < setupCount) {
          const d = document.createElement('div');
          d.className = 'field';
          d.innerHTML = '<input class="name-input" maxlength="14" value="Joueur ' + (inputs.length + 1) + '" autocomplete="off">';
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
    const chips = $('#players-chips');
    chips.innerHTML = '';
    G.players.forEach(function (p, i) {
      const c = document.createElement('span');
      c.className = 'chip' + (i === G.guesserIndex ? ' guesser' : '');
      c.textContent = (i === G.guesserIndex ? '👑 ' : (p.bot ? '🤖 ' : '')) + p.name;
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
        ? 'Tu es le devineur : <b>ouvre les yeux</b>, les indices t’attendent.'
        : 'Tu seras le <b>devineur</b> : ferme les yeux, <b>ne regarde pas le mot mystère</b> !') + '</p>' +
      '<button class="btn btn-primary btn-big" id="btn-pass">' + (see ? '👀 Je suis ' + esc(g.name) + ', j’ouvre les yeux' : '🙈 Je suis ' + esc(g.name) + ', je ferme les yeux') + '</button>'
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
      '<p>Écris <b>un seul mot</b> pour aider <b>' + esc(E.guesser(G).name) + '</b> à deviner.<br>Pas de concertation, et évite l’indice trop évident… les doublons sont annulés !</p>' +
      '<input class="clue-input" id="clue-input" maxlength="30" placeholder="ton indice" autocomplete="off" autocapitalize="off">' +
      '<div class="field-error" id="clue-error"></div>' +
      '<button class="btn btn-primary btn-big" id="btn-clue">✓ J’ai noté mon indice</button>'
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
      '<h2>Tous les indices sont écrits !</h2>' +
      '<p>Les indices identiques ont été <b>annulés</b> (barrés ci-dessous).</p>'
    );
    const list = document.createElement('div');
    list.className = 'clue-list';
    G.clues.forEach(function (c, i) { list.appendChild(clueItem(c, i)); });
    p.appendChild(list);
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary btn-big';
    btn.id = 'btn-reveal';
    btn.textContent = '📋 Passer à ' + g.name + ' (devineur)';
    p.appendChild(btn);
    body.appendChild(p);
    btn.addEventListener('click', function () { ui.phase = 'pass-see'; renderGame(); });
  }

  function renderSoloReady(body) {
    body.appendChild(panel(
      '<div class="eyes">🤖</div>' +
      '<h2>Carte n°' + E.cardNumber(G) + '</h2>' +
      '<p>Les 3 robots écrivent leurs indices en secret…<br>Prêt·e à deviner le mot mystère ?</p>' +
      '<button class="btn btn-primary btn-big" id="btn-ready">🃏 Oui, montre-moi les indices !</button>'
    ));
    $('#btn-ready', body).addEventListener('click', function () {
      const card = E.currentCard(G);
      const botCount = G.players.length - 1;
      const clues = E.botClues(card, botCount, Math.random);
      for (let i = 0; i < clues.length; i++) E.addClue(G, i + 1, clues[i]);
      ui.reveal = E.revealClues(G);
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
      '<div class="progress">Carte ' + E.cardNumber(G) + '/' + E.TOTAL_CARDS + ' · devineur : <b>' + esc(g.name) + '</b></div>' +
      '<h2>Quels indices restent-ils ?</h2>'
    );
    const chips = document.createElement('div');
    chips.className = 'clue-chips';
    if (rev.kept.length === 0) {
      chips.innerHTML = '<span class="clue-chip" style="background:var(--bad);color:#fff">😱 Aucun !</span>';
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
      const line = document.createElement('p');
      line.className = 'removed-line';
      line.innerHTML = 'Annulés (doublons) : ' + rev.removed.map(function (c) { return '<s>' + esc(c.text) + '</s>'; }).join(', ');
      p.appendChild(line);
    }
    p.insertAdjacentHTML('beforeend',
      '<p style="margin-top:14px"><b>Une seule tentative</b> pour trouver le mot mystère :</p>' +
      '<input class="guess-input" id="guess-input" maxlength="40" placeholder="ta réponse" autocomplete="off" autocapitalize="off">' +
      '<div class="field-error" id="guess-error"></div>');
    const row = document.createElement('div');
    row.className = 'btn-row';
    row.innerHTML = '<button class="btn btn-ghost" id="btn-pass-round">🤐 Passer</button><button class="btn btn-primary" id="btn-guess">🎯 Deviner !</button>';
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
      '<div class="result-word">« ' + esc(e.word) + ' »</div>' +
      '<p class="result-detail">' + detail + '</p>' +
      '<p class="result-detail">Score : <b style="color:var(--accent)">' + G.score + ' / ' + E.TOTAL_CARDS + '</b> · cartes restantes : ' + G.deck.length + '</p>'
    );
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary btn-big';
    btn.id = 'btn-next';
    btn.textContent = G.over ? '🏁 Voir le score final' : '➜ Carte suivante';
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
        '<span class="h-word">' + esc(h.word || '—') + '</span>' +
        '<span class="h-clues">' + kept + '/' + h.clues.length + ' indices</span></div>';
    }).join('');
    $('#end-body').innerHTML =
      '<div class="end-score-card">' +
      '<div style="font-size:15px;color:var(--muted);font-weight:700;letter-spacing:1px;text-transform:uppercase">Score final</div>' +
      '<div class="end-score">' + G.score + '<small> / ' + E.TOTAL_CARDS + '</small></div>' +
      '<div class="end-rating">' + rating.emoji + ' ' + rating.label + '</div>' +
      '<div class="end-best">🏅 Record : ' + best() + '/' + E.TOTAL_CARDS + '</div>' +
      '</div>' +
      '<div class="history"><div class="history-title">Détail des ' + G.history.length + ' manches</div>' + rows + '</div>' +
      '<div class="btn-row"><button class="btn btn-ghost" id="btn-home">🏠 Accueil</button>' +
      '<button class="btn btn-primary" id="btn-replay">🔁 Rejouer</button></div>';
    show('screen-end');
    $('#btn-home').addEventListener('click', function () { G = null; renderHome(); });
    $('#btn-replay').addEventListener('click', function () { startGame(G.mode, G.players); });
  }

  /* ---------- wiring ---------- */
  $('#btn-solo').addEventListener('click', function () { setupMode = 'solo'; renderSetup(); });
  $('#btn-multi').addEventListener('click', function () { setupMode = 'multi'; renderSetup(); });
  $('#btn-setup-back').addEventListener('click', renderHome);
  $('#btn-continue').addEventListener('click', function () {
    const saved = loadSave();
    if (saved) resumeGame(saved); else renderHome();
  });
  $('#btn-quit').addEventListener('click', function () {
    if (confirm('Abandonner la partie en cours ?')) { clearSave(); G = null; ui = null; renderHome(); }
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
