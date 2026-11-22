/* ═══════════════════════════════════════════════════════════════
   live-rtc.js — real peer-to-peer voice for Group Study Live
   ═══════════════════════════════════════════════════════════════
   Why: the old Live sent 2-second audio chunks through the backend on a
   shared 70-requests-per-minute budget, so two phones starved each other and
   the mic dropped. This does what WhatsApp does: the phone's own audio engine
   (WebRTC + Opus) sends voice straight to the other phone. Nothing is
   downloaded, no SDK, no heavy library — RTCPeerConnection ships in the
   phone's browser/WebView already.

   Voice settings chosen to match calling apps:
     · echo cancellation, noise suppression, auto gain (mic cleanup)
     · 24 kbps ceiling with DTX (silence costs nothing)
     · 20 ms Opus frames, jitter buffer tuned for conversation

   Signalling rides the existing liveHub (offer/answer/ICE only, a handful of
   messages once per connection). Audio never touches the server after that.
   If ICE cannot connect within 12s the caller is told so and the app keeps
   using the chunk path — this layer only ever adds, never replaces blindly.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var ICE = {
    iceServers: [
      { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }
    ],
    iceCandidatePoolSize: 2
  };

  var S = {
    on: false, room: null, me: null, send: null, onStatus: null,
    stream: null, peers: {}, lastAt: 0, sigTimer: null, pingTimer: null,
    muted: false, micWanted: true, startedAt: 0, fallbackTimer: null
  };

  function emit(status, detail) {
    try { if (S.onStatus) S.onStatus(status, detail || null); } catch (e) {}
  }
  function say(kind, to, data) {
    if (!S.send) return Promise.resolve();
    try { return Promise.resolve(S.send('signal', { to: to, kind: kind, data: data || {} })); }
    catch (e) { return Promise.resolve(); }
  }

  function micConstraints() {
    return {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1
      },
      video: false
    };
  }

  function getMic() {
    if (S.stream) return Promise.resolve(S.stream);
    // Reuse the stream the Live screen already opened, so the phone does not
    // grab the microphone twice (that caused echo and a second permission box).
    try {
      if (window.GS_LIVE && window.GS_LIVE.micStream) { S.stream = window.GS_LIVE.micStream; return Promise.resolve(S.stream); }
    } catch (e) {}
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.reject(new Error('no mic api'));
    return navigator.mediaDevices.getUserMedia(micConstraints()).then(function (st) { S.stream = st; return st; });
  }

  function anyConnected() {
    for (var k in S.peers) if (S.peers[k] && S.peers[k].connected) return true;
    return false;
  }

  function tune(pc) {
    // Voice profile: small bitrate, silence suppressed, low latency.
    try {
      pc.getSenders().forEach(function (s) {
        if (!s.track || s.track.kind !== 'audio') return;
        try {
          var p = s.getParameters();
          if (!p.encodings || !p.encodings.length) p.encodings = [{}];
          p.encodings[0].maxBitrate = 24000;
          p.encodings[0].dtx = 'enabled';
          s.setParameters(p);
        } catch (e) {}
      });
    } catch (e) {}
    try {
      pc.getReceivers().forEach(function (r) {
        if ('jitterBufferTarget' in r) r.jitterBufferTarget = 200;
        else if ('playoutDelayHint' in r) r.playoutDelayHint = 0.1;
      });
    } catch (e) {}
  }

  function newPeer(name) {
    if (S.peers[name]) return S.peers[name];
    var pc = new RTCPeerConnection(ICE);
    var p = { name: name, pc: pc, el: null, pending: [], connected: false, at: Date.now() };
    S.peers[name] = p;

    if (S.stream && S.micWanted) {
      S.stream.getAudioTracks().forEach(function (t) { pc.addTrack(t, S.stream); });
    } else {
      try { pc.addTransceiver('audio', { direction: 'recvonly' }); } catch (e) {}
    }

    pc.onicecandidate = function (e) {
      if (e.candidate) say('ice', name, { c: e.candidate.toJSON ? e.candidate.toJSON() : e.candidate });
    };
    pc.ontrack = function (e) {
      var stream = (e.streams && e.streams[0]) ? e.streams[0] : null;
      if (!p.el) {
        p.el = new Audio();
        p.el.autoplay = true;
        p.el.setAttribute('playsinline', '');
        p.el.volume = 1;
      }
      if (stream) p.el.srcObject = stream;
      var pr = p.el.play();
      if (pr && pr.catch) pr.catch(function () {});
    };
    pc.onconnectionstatechange = function () {
      var st = pc.connectionState;
      if (st === 'connected') {
        p.connected = true;
        tune(pc);
        emit('connected', name);
      } else if (st === 'failed') {
        p.connected = false;
        emit('reconnecting', name);
        drop(name, true);
      } else if (st === 'disconnected') {
        p.connected = false;
        emit('reconnecting', name);
        setTimeout(function () {
          if (S.peers[name] && S.peers[name].pc === pc && pc.connectionState !== 'connected') drop(name, true);
        }, 4000);
      }
    };
    return p;
  }

  function flushIce(p) {
    var list = p.pending.splice(0, p.pending.length);
    list.forEach(function (c) { try { p.pc.addIceCandidate(c); } catch (e) {} });
  }

  function drop(name, retry) {
    var p = S.peers[name];
    if (!p) return;
    try { p.pc.close(); } catch (e) {}
    if (p.el) { try { p.el.srcObject = null; } catch (e) {} }
    delete S.peers[name];
    if (retry && S.on && S.me && name && S.me < name) {
      setTimeout(function () {
        if (!S.on || S.peers[name]) return;
        offer(name);
      }, 1500);
    }
  }

  function offer(name) {
    var p = newPeer(name);
    return p.pc.createOffer().then(function (o) {
      return p.pc.setLocalDescription(o).then(function () {
        return say('offer', name, { sdp: o.sdp });
      });
    }).catch(function () { drop(name, false); });
  }

  function onSignal(m) {
    var data = {};
    try { data = JSON.parse(m.data || '{}'); } catch (e) {}
    var from = m.from;
    if (!from || from === S.me) return Promise.resolve();

    if (m.kind === 'join' || m.kind === 'ping') {
      if (S.peers[from]) return Promise.resolve();
      // Deterministic: the lexicographically smaller name offers, so two
      // phones never both offer at once (that used to deadlock the handshake).
      if (S.me < from) return offer(from);
      newPeer(from);
      return Promise.resolve();
    }
    if (m.kind === 'offer') {
      var p = newPeer(from);
      return p.pc.setRemoteDescription({ type: 'offer', sdp: data.sdp })
        .then(function () { flushIce(p); return p.pc.createAnswer(); })
        .then(function (a) { return p.pc.setLocalDescription(a).then(function () { return say('answer', from, { sdp: a.sdp }); }); })
        .catch(function () { drop(from, false); });
    }
    if (m.kind === 'answer') {
      var pa = S.peers[from];
      if (!pa) return Promise.resolve();
      return pa.pc.setRemoteDescription({ type: 'answer', sdp: data.sdp })
        .then(function () { flushIce(pa); }).catch(function () {});
    }
    if (m.kind === 'ice') {
      var pi = S.peers[from];
      if (!pi) return Promise.resolve();
      if (pi.pc.remoteDescription && pi.pc.remoteDescription.type) {
        return Promise.resolve(pi.pc.addIceCandidate(data.c)).catch(function () {});
      }
      pi.pending.push(data.c);
      return Promise.resolve();
    }
    if (m.kind === 'bye') { drop(from, false); return Promise.resolve(); }
    return Promise.resolve();
  }

  function poll() {
    if (!S.on) return;
    var d = S.send('signals', { sinceMs: S.lastAt });
    Promise.resolve(d).then(function (res) {
      if (res && res.ok) {
        if (res.lastAt && res.lastAt > S.lastAt) S.lastAt = res.lastAt;
        var list = res.signals || [];
        var chain = Promise.resolve();
        list.forEach(function (m) { chain = chain.then(function () { return onSignal(m); }); });
        return chain;
      }
    }).catch(function () {}).then(function () {
      if (!S.on) return;
      // Fast while a call is being set up, slow once audio is flowing.
      var wait = anyConnected() ? 5000 : 1200;
      S.sigTimer = setTimeout(poll, wait);
    });
  }

  function enableMic() {
    S.micWanted = true;
    return getMic().then(function (st) {
      st.getAudioTracks().forEach(function (t) { t.enabled = !S.muted; });
      Object.keys(S.peers).forEach(function (n) {
        var p = S.peers[n];
        var has = p.pc.getSenders().some(function (s) { return s.track && s.track.kind === 'audio'; });
        if (!has) {
          st.getAudioTracks().forEach(function (t) { try { p.pc.addTrack(t, st); } catch (e) {} });
          offer(n);
        }
      });
      return true;
    }).catch(function () { return false; });
  }

  function setMuted(m) {
    S.muted = !!m;
    if (S.stream) S.stream.getAudioTracks().forEach(function (t) { t.enabled = !S.muted; });
    return S.muted;
  }

  function start(opts) {
    if (S.on) return Promise.resolve(true);
    // Wire the callback FIRST, so even an unsupported device reaches the UI.
    S.room = opts.room; S.me = opts.user; S.send = opts.send; S.onStatus = opts.onStatus;
    S.micWanted = opts.mic !== false;
    if (!window.RTCPeerConnection) { emit('unsupported'); return Promise.resolve(false); }
    S.startedAt = Date.now();
    S.peers = {}; S.lastAt = Date.now(); S.on = true;

    var ready = S.micWanted ? getMic().catch(function () { return null; }) : Promise.resolve(null);
    return ready.then(function () {
      emit('joining');
      return say('join', '*', {});
    }).then(function () {
      poll();
      S.pingTimer = setInterval(function () { if (S.on) say('ping', '*', {}); }, 8000);
      // If nothing connects, say so plainly instead of pretending it works.
      S.fallbackTimer = setTimeout(function () {
        if (S.on && !anyConnected()) emit('failed');
      }, 12000);
      return true;
    });
  }

  function stop() {
    if (!S.on) return;
    S.on = false;
    clearTimeout(S.sigTimer); clearInterval(S.pingTimer); clearTimeout(S.fallbackTimer);
    say('bye', '*', {});
    Object.keys(S.peers).forEach(function (n) { drop(n, false); });
    S.peers = {};
    emit('stopped');
  }

  window.GsLiveRTC = {
    start: start,
    stop: stop,
    enableMic: enableMic,
    setMuted: setMuted,
    isOn: function () { return S.on; },
    isConnected: anyConnected,
    peerCount: function () { return Object.keys(S.peers).length; }
  };
})();
