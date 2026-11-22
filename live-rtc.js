/* ═══════════════════════════════════════════════════════════════
   live-rtc.js — direct voice for Group Study Live  (v2, hardened)
   ═══════════════════════════════════════════════════════════════
   What this does: the phone's own audio engine (WebRTC + Opus) sends
   voice straight to the other phones. Nothing is downloaded, no SDK.
   Signalling rides the existing liveHub (offer/answer/ICE only).

   v2 changes (all inside the group voice layer):
     · Cloudflare + Google STUN (better NAT coverage than Google alone)
     · TURN injection: window.GS_TURN or GET /api/turn, used automatically
       the moment a relay exists — no code change needed
     · Opus tuned for speech: in-band FEC, DTX, 24 kbps ceiling, mono
     · placeholder send/recv transceiver so Mic ON/OFF never renegotiates
     · ICE restart with backoff — a dropped link rebuilds itself instead
       of dying (the old code gave up after one attempt, and only on one
       side of the pair)
     · mic re-acquired automatically if a phone call steals it
     · per-peer audio graph torn down properly (no stuck/leaking nodes)
     · mesh capped, so 10 phones cannot melt the uplink
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var MAX_PEERS = 8;          /* beyond this a phone mesh cannot stay smooth */
  var SETUP_POLL = 900;       /* ms while a link is being built */
  var LIVE_POLL = 6000;       /* ms once audio flows (saves the request budget) */
  var HIDDEN_POLL = 15000;    /* ms while the app is in the background */

  var STUN = [
    { urls: ['stun:stun.cloudflare.com:3478'] },
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }
  ];

  var TURN = (window.GS_TURN && window.GS_TURN.length) ? window.GS_TURN : null;

  var ICE = {
    iceServers: STUN.concat(TURN || []),
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
    iceCandidatePoolSize: 4
  };

  var S = {
    on: false, room: null, me: null, send: null, onStatus: null,
    stream: null, peers: {}, retry: {}, lastAt: 0, sigTimer: null, pingTimer: null,
    muted: false, micWanted: true, startedAt: 0, fallbackTimer: null, playCtx: null
  };

  function emit(status, detail) {
    try { if (S.onStatus) S.onStatus(status, detail || null); } catch (e) {}
  }
  function say(kind, to, data) {
    if (!S.send) return Promise.resolve();
    try { return Promise.resolve(S.send('signal', { to: to, kind: kind, data: data || {} })); }
    catch (e) { return Promise.resolve(); }
  }

  /* ── relay credentials (no-op until a TURN server is configured) ── */
  function loadTurn() {
    if (TURN || !window.fetch) return Promise.resolve();
    return fetch('/api/turn', { method: 'GET' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (d && d.iceServers && d.iceServers.length) {
          TURN = d.iceServers;
          ICE.iceServers = STUN.concat(TURN);
        }
      })
      .catch(function () {});
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
    try {
      if (window.GS_LIVE && window.GS_LIVE.micStream) { S.stream = window.GS_LIVE.micStream; return Promise.resolve(S.stream); }
    } catch (e) {}
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.reject(new Error('no mic api'));
    return navigator.mediaDevices.getUserMedia(micConstraints()).then(function (st) {
      S.stream = st;
      st.getAudioTracks().forEach(function (t) {
        t.onended = function () {            /* a call or another app grabbed the mic */
          S.stream = null;
          if (S.on && S.micWanted) {
            getMic().then(function (ns) {
              var track = ns.getAudioTracks()[0];
              Object.keys(S.peers).forEach(function (n) {
                var p = S.peers[n];
                if (p && p.tr && p.tr.sender) { try { p.tr.sender.replaceTrack(track); } catch (e) {} }
              });
              emit('mic-restored');
            }).catch(function () {});
          }
        };
      });
      return st;
    });
  }

  function audioCtx() {
    if (!S.playCtx) {
      try { S.playCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { S.playCtx = null; }
    }
    if (S.playCtx && S.playCtx.state === 'suspended') { try { S.playCtx.resume(); } catch (e) {} }
    return S.playCtx;
  }

  /* Remote voice goes through a limiter so a loud or glitching stream can
     never blast the speaker. Falls back to a plain audio element. */
  function playRemote(p, stream) {
    var ctx = audioCtx();
    if (ctx) {
      try {
        if (p.srcNode) { try { p.srcNode.disconnect(); } catch (e) {} }
        var src = ctx.createMediaStreamSource(stream);
        var comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -20; comp.knee.value = 12; comp.ratio.value = 12;
        comp.attack.value = 0.003; comp.release.value = 0.25;
        var g = ctx.createGain(); g.gain.value = 0.9;
        src.connect(comp); comp.connect(g); g.connect(ctx.destination);
        p.srcNode = src; p.comp = comp; p.gain = g;
        return;
      } catch (e) {}
    }
    try {
      if (!p.el) {
        p.el = new Audio();
        p.el.autoplay = true;
        p.el.setAttribute('playsinline', '');
      }
      p.el.volume = 0.9;
      p.el.srcObject = stream;
      var pr = p.el.play();
      if (pr && pr.catch) pr.catch(function () {});
    } catch (e2) {}
  }

  function anyConnected() {
    for (var k in S.peers) if (S.peers[k] && S.peers[k].connected) return true;
    return false;
  }
  function peerCount() { return Object.keys(S.peers).length; }

  /* Opus for speech: put it first, then FEC + DTX + a 24 kbps ceiling.
     FEC is what keeps words intact when a packet is lost on mobile data. */
  function preferOpus(pc) {
    try {
      if (!window.RTCRtpSender || !RTCRtpSender.getCapabilities) return;
      var caps = RTCRtpSender.getCapabilities('audio');
      if (!caps || !caps.codecs) return;
      var opus = [], rest = [];
      caps.codecs.forEach(function (c) { (/opus/i.test(c.mimeType) ? opus : rest).push(c); });
      if (!opus.length) return;
      pc.getTransceivers().forEach(function (t) {
        try { if (t.setCodecPreferences) t.setCodecPreferences(opus.concat(rest)); } catch (e) {}
      });
    } catch (e) {}
  }

  function mungeSdp(sdp) {
    if (!sdp) return sdp;
    /* opus is announced on the rtpmap line; the fmtp line carries the knobs.
       Find the payload type first, then rewrite (or insert) its fmtp line. */
    var m = /a=rtpmap:(\d+)\s+opus\/48000\/2/i.exec(sdp);
    if (!m) return sdp;
    var pt = m[1];
    var params = 'useinbandfec=1;usedtx=1;maxaveragebitrate=24000;stereo=0;sprop-stereo=0';
    var fmtp = new RegExp('a=fmtp:' + pt + '\\s+([^\\r\\n]*)');
    if (fmtp.test(sdp)) {
      return sdp.replace(fmtp, function (line, rest) {
        var clean = rest
          .replace(/useinbandfec=\d+/gi, '')
          .replace(/usedtx=\d+/gi, '')
          .replace(/maxaveragebitrate=\d+/gi, '')
          .replace(/stereo=\d+/gi, '')
          .replace(/sprop-stereo=\d+/gi, '')
          .replace(/;{2,}/g, ';')
          .replace(/^[;\s]+|[;\s]+$/g, '');
        return 'a=fmtp:' + pt + ' ' + (clean ? clean + ';' : '') + params;
      });
    }
    return sdp.replace(
      new RegExp('(a=rtpmap:' + pt + '\\s+opus/48000/2[^\\r\\n]*)', 'i'),
      '$1\r\na=fmtp:' + pt + ' ' + params
    );
  }

  function tune(pc) {
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
    if (peerCount() >= MAX_PEERS) {
      emit('room-full', name);
      return null;
    }
    var pc = new RTCPeerConnection(ICE);
    var p = { name: name, pc: pc, el: null, srcNode: null, pending: [], connected: false, at: Date.now(), tr: null };

    /* A send/recv transceiver exists from the start, so turning the mic on
       later is just replaceTrack — no renegotiation, no handshake storm. */
    try {
      p.tr = pc.addTransceiver('audio', { direction: 'sendrecv' });
      if (S.stream && S.micWanted) {
        var t0 = S.stream.getAudioTracks()[0];
        if (t0) { try { p.tr.sender.replaceTrack(t0); } catch (e) {} }
      }
    } catch (e) {}

    preferOpus(pc);
    S.peers[name] = p;

    pc.onicecandidate = function (e) {
      if (e.candidate) say('ice', name, { c: e.candidate.toJSON ? e.candidate.toJSON() : e.candidate });
    };
    pc.ontrack = function (e) {
      var stream = (e.streams && e.streams[0]) ? e.streams[0] : null;
      if (stream) playRemote(p, stream);
    };
    pc.onconnectionstatechange = function () {
      var st = pc.connectionState;
      if (st === 'connected') {
        p.connected = true;
        S.retry[name] = 0;
        tune(pc);
        emit('connected', name);
      } else if (st === 'failed') {
        p.connected = false;
        emit('reconnecting', name);
        recover(name);
      } else if (st === 'disconnected') {
        p.connected = false;
        emit('reconnecting', name);
        setTimeout(function () {
          if (S.peers[name] && S.peers[name].pc === pc && pc.connectionState !== 'connected') recover(name);
        }, 3000);
      }
    };
    return p;
  }

  function flushIce(p) {
    var list = p.pending.splice(0, p.pending.length);
    list.forEach(function (c) { try { p.pc.addIceCandidate(c); } catch (e) {} });
  }

  function teardown(p) {
    try { if (p.srcNode) p.srcNode.disconnect(); } catch (e) {}
    try { if (p.gain) p.gain.disconnect(); } catch (e) {}
    try { if (p.comp) p.comp.disconnect(); } catch (e) {}
    p.srcNode = p.comp = p.gain = null;
    if (p.el) { try { p.el.srcObject = null; } catch (e) {} }
    try { p.pc.close(); } catch (e) {}
  }

  function drop(name) {
    var p = S.peers[name];
    if (!p) return;
    teardown(p);
    delete S.peers[name];
  }

  /* A failed link is rebuilt instead of abandoned: ICE restart, then a fresh
     offer from the impolite side (S.me < name) with growing backoff. */
  function recover(name) {
    if (!S.on) return;
    var n = (S.retry[name] = (S.retry[name] || 0) + 1);
    if (n > 6) { emit('peer-lost', name); return; }
    var delay = Math.min(30000, 1500 * Math.pow(1.8, n - 1));
    setTimeout(function () {
      if (!S.on) return;
      var p = S.peers[name];
      if (!p || p.pc.connectionState === 'connected') return;
      try { if (p.pc.restartIce) p.pc.restartIce(); } catch (e) {}
      if (S.me < name) offer(name, true);
      else say('ping', name, {});
    }, delay);
  }

  function offer(name, isRestart) {
    var p = S.peers[name] || newPeer(name);
    if (!p) return Promise.resolve();
    return p.pc.createOffer(isRestart ? { iceRestart: true } : undefined)
      .then(function (o) {
        var sdp = mungeSdp(o.sdp);
        return p.pc.setLocalDescription({ type: 'offer', sdp: sdp }).then(function () {
          return say('offer', name, { sdp: sdp, restart: !!isRestart });
        });
      })
      .catch(function () { emit('peer-lost', name); });
  }

  function onSignal(m) {
    var data = {};
    try { data = JSON.parse(m.data || '{}'); } catch (e) {}
    var from = m.from;
    if (!from || from === S.me) return Promise.resolve();

    if (m.kind === 'join' || m.kind === 'ping') {
      if (S.peers[from]) return Promise.resolve();
      /* Deterministic: the smaller name offers, so two phones never offer
         at the same time and deadlock the handshake. */
      if (S.me < from) return offer(from, false);
      newPeer(from);
      return Promise.resolve();
    }
    if (m.kind === 'offer') {
      var p = S.peers[from] || newPeer(from);
      if (!p) return Promise.resolve();
      return p.pc.setRemoteDescription({ type: 'offer', sdp: data.sdp })
        .then(function () { flushIce(p); return p.pc.createAnswer(); })
        .then(function (a) {
          var sdp = mungeSdp(a.sdp);
          return p.pc.setLocalDescription({ type: 'answer', sdp: sdp }).then(function () {
            return say('answer', from, { sdp: sdp });
          });
        })
        .catch(function () {});
    }
    if (m.kind === 'answer') {
      var pa = S.peers[from];
      if (!pa) return Promise.resolve();
      return pa.pc.setRemoteDescription({ type: 'answer', sdp: data.sdp })
        .then(function () { flushIce(pa); tune(pa.pc); })
        .catch(function () {});
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
    if (m.kind === 'bye') { drop(from); return Promise.resolve(); }
    return Promise.resolve();
  }

  function pollWait() {
    if (typeof document !== 'undefined' && document.hidden) return HIDDEN_POLL;
    return anyConnected() ? LIVE_POLL : SETUP_POLL;
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
      S.sigTimer = setTimeout(poll, pollWait());
    });
  }

  function enableMic() {
    S.micWanted = true;
    return getMic().then(function (st) {
      var track = st.getAudioTracks()[0];
      track.enabled = !S.muted;
      Object.keys(S.peers).forEach(function (n) {
        var p = S.peers[n];
        if (p && p.tr && p.tr.sender) {
          try { p.tr.sender.replaceTrack(track); } catch (e) {}
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
    S.room = opts.room; S.me = opts.user; S.send = opts.send; S.onStatus = opts.onStatus;
    S.micWanted = opts.mic !== false;
    if (!window.RTCPeerConnection) { emit('unsupported'); return Promise.resolve(false); }
    S.startedAt = Date.now();
    S.peers = {}; S.retry = {}; S.lastAt = Date.now(); S.on = true;

    return loadTurn().then(function () {
      return S.micWanted ? getMic().catch(function () { return null; }) : Promise.resolve(null);
    }).then(function () {
      emit('joining');
      return say('join', '*', {});
    }).then(function () {
      poll();
      S.pingTimer = setInterval(function () {
        if (!S.on) return;
        say('ping', '*', {});
        /* a phone that has been alone for a while still needs a heartbeat */
        if (peerCount() && !anyConnected()) {
          Object.keys(S.peers).forEach(function (n) { if (S.me < n) offer(n, true); });
        }
      }, 8000);
      S.fallbackTimer = setTimeout(function () {
        if (S.on && !anyConnected()) emit('failed');
      }, 12000);
      return true;
    });
  }

  function stop() {
    var wasOn = S.on;
    S.on = false;
    clearTimeout(S.sigTimer); clearInterval(S.pingTimer); clearTimeout(S.fallbackTimer);
    if (wasOn) { try { say('bye', '*', {}); } catch (e) {} }
    Object.keys(S.peers).forEach(function (n) { drop(n); });
    S.peers = {}; S.retry = {};
    try { if (S.playCtx) S.playCtx.close(); } catch (e) {}
    S.playCtx = null;
    try { if (S.stream) S.stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} }); } catch (e) {}
    S.stream = null; S.micWanted = false; S.muted = false;
    if (wasOn) emit('stopped');
  }

  /* Keep audio alive when the screen locks or the app comes back. */
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('visibilitychange', function () {
      if (!S.on) return;
      if (!document.hidden) {
        audioCtx();
        Object.keys(S.peers).forEach(function (n) {
          var p = S.peers[n];
          if (p && p.pc.connectionState !== 'connected' && S.me < n) recover(n);
        });
      }
    });
  }
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('pagehide', function () { if (S.on) { try { say('bye', '*', {}); } catch (e) {} } });
  }

  window.GsLiveRTC = {
    start: start,
    stop: stop,
    enableMic: enableMic,
    setMuted: setMuted,
    isOn: function () { return S.on; },
    isConnected: anyConnected,
    peerCount: peerCount,
    stats: function () {
      var out = { peers: peerCount(), connected: 0, turn: !!(TURN && TURN.length), states: {} };
      Object.keys(S.peers).forEach(function (n) {
        var st = S.peers[n].pc.connectionState;
        out.states[n] = st;
        if (st === 'connected') out.connected++;
      });
      return out;
    }
  };
})();
