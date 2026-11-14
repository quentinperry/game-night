/* Couche réseau du mode en ligne : WebRTC (data channel) entre appareils,
   avec signalisation via le relais HTTP public ntfy.sh (aucune clé, aucun serveur perso).
   Le code de partie sert de nom de topic : "just-one-v1-<code>".
   L'hôte fait autorité sur l'état du jeu ; les clients envoient des actions. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.JustOneNet = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  const SIGNAL_BASE = 'https://ntfy.sh/';
  const APP_PREFIX = 'just-one-v1';
  const MAX_PLAYERS = 7;
  const RTC_CONFIG = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  };

  function randomId(len) {
    const A = 'abcdefghjkmnpqrstuvwxyz23456789';
    let s = '';
    for (let i = 0; i < (len || 10); i++) s += A[Math.floor(Math.random() * A.length)];
    return s;
  }

  function topicFor(code) {
    return APP_PREFIX + '-' + String(code || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  }

  function GameNet(opts) {
    this.code = opts.code;
    this.name = String(opts.name || 'Joueur').slice(0, 14);
    this.isHost = !!opts.isHost;
    this.onView = opts.onView || function () {};
    this.onAction = opts.onAction || function () {};
    this.onPeerJoin = opts.onPeerJoin || function () {};
    this.onPeerLeave = opts.onPeerLeave || function () {};
    this.onAborted = opts.onAborted || function () {};
    this.onError = opts.onError || function () {};
    this.id = randomId(10);
    this.topic = topicFor(this.code);
    this.pcs = {};
    this.dcs = {};
    this.names = {};
    this.hostDc = null;
    this.connected = false;
    this.es = null;
    this._helloTimer = null;
    this._joinTimer = null;
    this._start();
  }

  GameNet.prototype._publish = function (msg) {
    msg.from = this.id;
    return fetch(SIGNAL_BASE + this.topic, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      body: JSON.stringify(msg)
    }).catch(function () {});
  };

  GameNet.prototype._start = function () {
    const self = this;
    this.es = new EventSource(SIGNAL_BASE + this.topic + '/json');
    this.es.addEventListener('message', function (ev) {
      let m;
      try { m = JSON.parse(JSON.parse(ev.data).message); } catch (e) { return; }
      if (!m || m.from === self.id) return;
      self._onSignal(m);
    });
    if (this.isHost) {
      return;
    }
    const sendHello = function () { self._publish({ type: 'hello', name: self.name }); };
    if (this.es.readyState === 1) sendHello();
    else this.es.addEventListener('open', sendHello, { once: true });
    this._helloTimer = setInterval(function () { if (!self.connected) sendHello(); }, 3000);
    this._joinTimer = setTimeout(function () {
      if (!self.connected) {
        self.onError('Code introuvable ou salon injoignable. Vérifie le code et réessaie.');
        self.close();
      }
    }, 20000);
  };

  GameNet.prototype._onSignal = function (m) {
    const self = this;
    if (m.type === 'bye') {
      if (!this.isHost) { this.onAborted('L’hôte a quitté la partie.'); this.close(); }
      return;
    }
    if (m.type === 'hello') {
      if (!this.isHost) return;
      if (Object.keys(this.dcs).length >= MAX_PLAYERS - 1) { this._publish({ type: 'full', to: m.from }); return; }
      this.names[m.from] = String(m.name || 'Joueur').slice(0, 14);
      this._makeOffer(m.from);
      return;
    }
    if (m.type === 'full') {
      if (m.to === this.id) { this.onError('Cette partie est complète (' + MAX_PLAYERS + ' joueurs max).'); this.close(); }
      return;
    }
    if (m.type === 'offer') {
      if (this.isHost || m.to !== this.id) return;
      this._acceptOffer(m);
      return;
    }
    if (m.type === 'answer') {
      if (!this.isHost || m.to !== this.id) return;
      const pc = this.pcs[m.from];
      if (pc && !pc._answered) {
        pc._answered = true;
        pc.setRemoteDescription(new RTCSessionDescription(m.sdp)).catch(function () {});
      }
      return;
    }
    if (m.type === 'ice') {
      if (m.to !== this.id) return;
      const pc = this.pcs[m.from];
      if (pc && m.candidate) pc.addIceCandidate(new RTCIceCandidate(m.candidate)).catch(function () {});
    }
  };

  GameNet.prototype._wireIce = function (pc, otherId) {
    const self = this;
    pc.onicecandidate = function (e) {
      if (e.candidate) {
        self._publish({ type: 'ice', to: otherId, candidate: e.candidate.toJSON ? e.candidate.toJSON() : e.candidate });
      }
    };
  };

  GameNet.prototype._makeOffer = function (peerId) {
    const self = this;
    if (this.pcs[peerId]) return;
    const pc = new RTCPeerConnection(RTC_CONFIG);
    this.pcs[peerId] = pc;
    this._wireIce(pc, peerId);
    const dc = pc.createDataChannel('game');
    this.dcs[peerId] = dc;
    this._wireDc(dc, peerId);
    pc.createOffer()
      .then(function (offer) { return pc.setLocalDescription(offer); })
      .then(function () { self._publish({ type: 'offer', to: peerId, sdp: pc.localDescription }); })
      .catch(function () { self._dropPeer(peerId); });
  };

  GameNet.prototype._acceptOffer = function (m) {
    const self = this;
    if (this.pcs[m.from]) return;
    const pc = new RTCPeerConnection(RTC_CONFIG);
    this.pcs[m.from] = pc;
    this._wireIce(pc, m.from);
    pc.ondatachannel = function (e) {
      self.dcs[m.from] = e.channel;
      self._wireDc(e.channel, m.from);
    };
    pc.setRemoteDescription(new RTCSessionDescription(m.sdp))
      .then(function () { return pc.createAnswer(); })
      .then(function (answer) { return pc.setLocalDescription(answer); })
      .then(function () { self._publish({ type: 'answer', to: m.from, sdp: pc.localDescription }); })
      .catch(function () { self._dropPeer(m.from); });
  };

  GameNet.prototype._wireDc = function (dc, peerId) {
    const self = this;
    if (!this.isHost) this.hostDc = dc;
    dc.onopen = function () {
      if (self.isHost) {
        self.onPeerJoin(peerId, self.names[peerId] || 'Joueur');
      } else {
        self.connected = true;
        clearInterval(self._helloTimer);
        clearTimeout(self._joinTimer);
        dc.send(JSON.stringify({ t: 'hello', name: self.name }));
      }
    };
    dc.onmessage = function (ev) {
      let msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (msg.t === 'view') self.onView(msg.view);
      else if (msg.t === 'aborted') self.onAborted(msg.reason || 'Partie interrompue.');
      else if (msg.t === 'error') self.onError(msg.message || 'Erreur.');
      else self.onAction(peerId, msg);
    };
    dc.onclose = function () { self._dropPeer(peerId); };
  };

  GameNet.prototype._dropPeer = function (peerId) {
    const had = !!this.dcs[peerId];
    if (this.pcs[peerId]) { try { this.pcs[peerId].close(); } catch (e) {} delete this.pcs[peerId]; }
    delete this.dcs[peerId];
    delete this.names[peerId];
    if (had && this.isHost) this.onPeerLeave(peerId);
  };

  GameNet.prototype.send = function (msg) {
    const data = JSON.stringify(msg);
    if (this.isHost) {
      Object.keys(this.dcs).forEach(function (id) {
        const dc = this.dcs[id];
        if (dc.readyState === 'open') dc.send(data);
      }, this);
    } else if (this.hostDc && this.hostDc.readyState === 'open') {
      this.hostDc.send(data);
    }
  };

  GameNet.prototype.close = function () {
    if (this.isHost) this._publish({ type: 'bye' });
    clearInterval(this._helloTimer);
    clearTimeout(this._joinTimer);
    const self = this;
    Object.keys(this.pcs).forEach(function (id) { try { self.pcs[id].close(); } catch (e) {} });
    if (this.es) { try { this.es.close(); } catch (e) {} }
    this.pcs = {};
    this.dcs = {};
  };

  return {
    GameNet: GameNet,
    topicFor: topicFor,
    SIGNAL_BASE: SIGNAL_BASE,
    MAX_PLAYERS: MAX_PLAYERS
  };
});
