'use strict';
/* 소리를 만드는 곳. 샘플 파일이 하나도 없다 — 드럼도 신스도 전부 코드로 합성한다.
   덕분에 저장소가 가볍고 오프라인에서 100% 동작한다.

   중요: 이 파일의 모든 함수는 AudioContext 를 인자로 받는다.
   실시간 재생은 AudioContext, wav 내보내기는 OfflineAudioContext 가 들어온다.
   같은 코드가 양쪽을 돌려야 "들은 것과 저장된 것"이 같아진다. */

(function (global) {

  const M = global.Music || (typeof require !== 'undefined' ? require('./music.js') : null);

  /* ── 재료 ───────────────────────────────────────────────────────── */

  /* 컨텍스트당 한 번만 만들어 재사용한다. 노이즈 버퍼는 드럼 전부가 쓴다. */
  const cache = new WeakMap();
  function bank(ctx) {
    let b = cache.get(ctx);
    if (!b) { b = {}; cache.set(ctx, b); }
    return b;
  }

  function noiseBuffer(ctx) {
    const b = bank(ctx);
    if (b.noise) return b.noise;
    const len = Math.floor(ctx.sampleRate * 2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    b.noise = buf;
    return buf;
  }

  /* 리버브용 임펄스 응답을 노이즈에 감쇠 곡선을 씌워 만든다.
     녹음된 공간은 아니지만 "넓어지는" 느낌은 충분히 난다. */
  function impulse(ctx, seconds, decay) {
    const b = bank(ctx);
    const key = 'ir' + seconds.toFixed(2) + '_' + decay.toFixed(2);
    if (b[key]) return b[key];
    const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        /* 앞부분을 살짝 눌러서 초기 반사음이 딱딱하게 튀지 않게 한다. */
        const early = Math.min(1, t * 60);
        d[i] = (Math.random() * 2 - 1) * early * Math.pow(1 - t, decay);
      }
    }
    b[key] = buf;
    return buf;
  }

  /* 디스토션 곡선. amount 0 이면 직선(= 원음 그대로)이라 항상 물려둬도 안전하다. */
  function driveCurve(amount) {
    const n = 1024;
    const curve = new Float32Array(n);
    const k = amount * 40;
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = k < 0.001 ? x : Math.tanh(x * (1 + k)) / Math.tanh(1 + k);
    }
    return curve;
  }

  const MIN = 0.0001; /* exponentialRamp 는 0 을 못 받는다. */

  function env(param, t, peak, attack, decay, sustain, release, hold) {
    const p = Math.max(MIN, peak);
    param.setValueAtTime(MIN, t);
    param.exponentialRampToValueAtTime(p, t + attack);
    param.exponentialRampToValueAtTime(Math.max(MIN, p * sustain), t + attack + decay);
    const off = t + Math.max(hold, attack + decay);
    param.setValueAtTime(Math.max(MIN, p * sustain), off);
    param.exponentialRampToValueAtTime(MIN, off + release);
    return off + release;
  }

  function noise(ctx, time) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx);
    src.loop = true;
    /* 매번 다른 지점에서 읽어야 같은 소리가 반복되며 기계처럼 들리지 않는다. */
    src.start(time, Math.random() * 1.5);
    return src;
  }

  /* ── 악기 ───────────────────────────────────────────────────────── */
  /* 각 trigger 는 스스로 노드를 만들고 stop 예약까지 끝낸다. 호출자는 정리할 게 없다. */

  const INSTRUMENTS = {
    kick: {
      label: '킥', kind: 'drum', color: '#ff6b6b',
      trigger(ctx, dest, t, vel) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(150, t);
        osc.frequency.exponentialRampToValueAtTime(45, t + 0.11);
        env(g.gain, t, vel, 0.002, 0.09, 0.25, 0.22, 0.02);
        osc.connect(g).connect(dest);
        osc.start(t); osc.stop(t + 0.6);

        /* 어택. 이게 없으면 폰 스피커에서 킥이 아예 안 들린다. */
        const n = noise(ctx, t);
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass'; hp.frequency.value = 1200;
        const ng = ctx.createGain();
        env(ng.gain, t, vel * 0.28, 0.001, 0.012, 0.001, 0.01, 0.001);
        n.connect(hp).connect(ng).connect(dest);
        n.stop(t + 0.08);
      }
    },
    snare: {
      label: '스네어', kind: 'drum', color: '#ffd93d',
      trigger(ctx, dest, t, vel) {
        const n = noise(ctx, t);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 0.8;
        const ng = ctx.createGain();
        env(ng.gain, t, vel * 0.7, 0.001, 0.10, 0.05, 0.08, 0.005);
        n.connect(bp).connect(ng).connect(dest);
        n.stop(t + 0.35);

        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(185, t);
        osc.frequency.exponentialRampToValueAtTime(120, t + 0.08);
        env(g.gain, t, vel * 0.5, 0.001, 0.05, 0.01, 0.04, 0.005);
        osc.connect(g).connect(dest);
        osc.start(t); osc.stop(t + 0.25);
      }
    },
    hat: {
      label: '하이햇', kind: 'drum', color: '#6bcB77',
      trigger(ctx, dest, t, vel) {
        const n = noise(ctx, t);
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass'; hp.frequency.value = 7500;
        const g = ctx.createGain();
        /* 세게 친 하이햇은 오픈 햇처럼 길게 남는다 — 악센트 하나로 두 소리를 낸다. */
        const len = vel > 0.85 ? 0.26 : 0.045;
        env(g.gain, t, vel * 0.35, 0.001, len, 0.02, len * 0.5, 0.002);
        n.connect(hp).connect(g).connect(dest);
        n.stop(t + len + 0.3);
      }
    },
    clap: {
      label: '클랩', kind: 'drum', color: '#f78fb3',
      trigger(ctx, dest, t, vel) {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 0.6;
        bp.connect(dest);
        /* 손뼉은 한 번에 안 맞는다. 짧은 노이즈 세 번 + 꼬리 한 번. */
        [0, 0.011, 0.023].forEach((off, i) => {
          const n = noise(ctx, t + off);
          const g = ctx.createGain();
          env(g.gain, t + off, vel * (1.6 - i * 0.25), 0.001, 0.012, 0.01, 0.01, 0.001);
          n.connect(g).connect(bp);
          n.stop(t + off + 0.06);
        });
        const tail = noise(ctx, t + 0.033);
        const tg = ctx.createGain();
        env(tg.gain, t + 0.033, vel * 1.1, 0.002, 0.13, 0.02, 0.1, 0.005);
        tail.connect(tg).connect(bp);
        tail.stop(t + 0.4);
      }
    },
    tom: {
      label: '톰', kind: 'drum', color: '#c48fff',
      trigger(ctx, dest, t, vel) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(220, t);
        osc.frequency.exponentialRampToValueAtTime(90, t + 0.22);
        env(g.gain, t, vel * 0.8, 0.002, 0.18, 0.1, 0.15, 0.02);
        osc.connect(g).connect(dest);
        osc.start(t); osc.stop(t + 0.6);
      }
    },

    bass: {
      label: '베이스', kind: 'synth', color: '#4d96ff', octave: -2,
      trigger(ctx, dest, t, vel, freq, dur) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, t);
        const sub = ctx.createOscillator();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(freq / 2, t);

        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.Q.value = 6;
        /* 필터를 열었다 닫으면 "뚱-" 하고 튕기는 느낌이 난다. 베이스의 성격. */
        lp.frequency.setValueAtTime(Math.min(9000, freq * 14), t);
        lp.frequency.exponentialRampToValueAtTime(Math.max(90, freq * 2.2), t + 0.16);

        const g = ctx.createGain();
        const end = env(g.gain, t, vel * 0.36, 0.004, 0.07, 0.55, 0.06, dur);
        osc.connect(lp); sub.connect(lp);
        lp.connect(g).connect(dest);
        osc.start(t); sub.start(t);
        osc.stop(end + 0.02); sub.stop(end + 0.02);
      }
    },
    lead: {
      label: '리드', kind: 'synth', color: '#ffa94d', octave: 0,
      trigger(ctx, dest, t, vel, freq, dur) {
        const g = ctx.createGain();
        const end = env(g.gain, t, vel * 0.3, 0.006, 0.09, 0.6, 0.12, dur);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = Math.min(12000, freq * 8); lp.Q.value = 1;
        lp.connect(g).connect(dest);
        /* 살짝 어긋난 두 오실레이터가 겹쳐야 얇지 않게 들린다. */
        [-6, 6].forEach(cents => {
          const osc = ctx.createOscillator();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(freq, t);
          osc.detune.setValueAtTime(cents, t);
          osc.connect(lp);
          osc.start(t); osc.stop(end + 0.02);
        });
      }
    },
    pluck: {
      label: '플럭', kind: 'synth', color: '#38d9a9', octave: 0,
      trigger(ctx, dest, t, vel, freq, dur) {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(Math.min(14000, freq * 10), t);
        lp.frequency.exponentialRampToValueAtTime(Math.max(200, freq * 1.5), t + 0.25);
        const g = ctx.createGain();
        const end = env(g.gain, t, vel * 0.4, 0.002, 0.25, 0.02, 0.12, Math.min(dur, 0.05));
        osc.connect(lp).connect(g).connect(dest);
        osc.start(t); osc.stop(end + 0.02);
      }
    },
    pad: {
      label: '패드', kind: 'synth', color: '#a0c4ff', octave: 0,
      trigger(ctx, dest, t, vel, freq, dur) {
        const g = ctx.createGain();
        /* 천천히 들어오고 길게 빠진다. 화음을 깔아두는 역할이라 스텝 하나보다 길게 유지. */
        const end = env(g.gain, t, vel * 0.22, 0.12, 0.3, 0.7, 0.5, Math.max(dur, 0.3));
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 3200;
        lp.connect(g).connect(dest);
        [-9, 0, 9].forEach(cents => {
          const osc = ctx.createOscillator();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(freq, t);
          osc.detune.setValueAtTime(cents, t);
          osc.connect(lp);
          osc.start(t); osc.stop(end + 0.05);
        });
      }
    }
  };

  const INSTRUMENT_KEYS = Object.keys(INSTRUMENTS);

  /* ── 믹서 ───────────────────────────────────────────────────────── */
  /* 이펙트를 트랙마다 하나씩 두면 아이폰이 버거워한다(특히 리버브).
     그래서 에코와 리버브는 전체에 하나씩만 두고 트랙은 "얼마나 보낼지"만 정한다.
     실제 믹싱 콘솔이 쓰는 방식이고, 소리도 더 자연스럽게 붙는다. */

  function pannerOrGain(ctx) {
    return ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
  }

  function buildMixer(ctx, project) {
    const master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.12;
    const out = ctx.createGain();
    master.connect(comp).connect(out).connect(ctx.destination);

    /* 에코 버스: 딜레이가 자기 출력을 다시 먹으며 반복된다.
       되먹임 경로에 로우패스를 넣어야 반복될수록 어두워지며 자연스럽게 사라진다. */
    const delayIn = ctx.createGain();
    const delayNode = ctx.createDelay(4);
    const delayDamp = ctx.createBiquadFilter();
    delayDamp.type = 'lowpass'; delayDamp.frequency.value = 3200;
    const delayFb = ctx.createGain();
    delayIn.connect(delayNode);
    delayNode.connect(delayDamp).connect(delayFb).connect(delayNode);
    delayNode.connect(master);

    /* 리버브 버스. */
    const reverbIn = ctx.createGain();
    const convolver = ctx.createConvolver();
    reverbIn.connect(convolver).connect(master);

    const tracks = project.tracks.map(() => {
      const input = ctx.createGain();

      const shaper = ctx.createWaveShaper();
      const post = ctx.createGain(); /* 드라이브로 커진 만큼 되돌린다 */

      const filter = ctx.createBiquadFilter();

      /* 코러스: 아주 짧은 딜레이를 LFO 로 흔들어 원음과 섞는다. */
      const chorusDelay = ctx.createDelay(0.06);
      chorusDelay.delayTime.value = 0.019;
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.55;
      const lfoDepth = ctx.createGain();
      lfoDepth.gain.value = 0.0045;
      lfo.connect(lfoDepth).connect(chorusDelay.delayTime);
      lfo.start(0);
      const chorusWet = ctx.createGain();
      chorusWet.gain.value = 0;

      const pan = pannerOrGain(ctx);
      const gain = ctx.createGain();
      const delaySend = ctx.createGain();
      const reverbSend = ctx.createGain();

      input.connect(shaper).connect(post).connect(filter);
      filter.connect(pan);                                   /* 원음 */
      filter.connect(chorusDelay).connect(chorusWet).connect(pan); /* 코러스 */
      pan.connect(gain);
      gain.connect(master);
      gain.connect(delaySend).connect(delayIn);
      gain.connect(reverbSend).connect(reverbIn);

      return { input, shaper, post, filter, chorusWet, pan, gain, delaySend, reverbSend };
    });

    const mixer = {
      ctx, master, out, tracks,
      delayNode, delayFb, reverbIn, convolver,
      applyTrack(i, track, muted) {
        const n = tracks[i];
        if (!n) return;
        n.shaper.curve = driveCurve(track.drive);
        n.post.gain.value = 1 / (1 + track.drive * 1.6);
        n.filter.type = track.filterType;
        /* 슬라이더 0~1 을 주파수로 펼 때 선형으로 하면 위쪽 절반이 다 똑같이 들린다.
           귀는 로그로 듣기 때문에 지수로 매핑한다. */
        n.filter.frequency.value = 60 * Math.pow(300, track.cutoff);
        n.filter.Q.value = 0.7 + track.resonance * 14;
        n.chorusWet.gain.value = track.chorus * 0.7;
        if (n.pan.pan) n.pan.pan.value = track.pan;
        n.gain.gain.value = muted ? 0 : track.volume;
        n.delaySend.gain.value = track.delaySend;
        n.reverbSend.gain.value = track.reverbSend;
      },
      applyGlobal(fx, bpm) {
        delayNode.delayTime.value = M.delayTime(bpm, fx.delayDivision);
        delayFb.gain.value = Math.min(0.85, fx.delayFeedback);
        reverbIn.gain.value = 1;
        const seconds = 0.35 + fx.reverbSize * 3.2;
        convolver.buffer = impulse(ctx, seconds, 2.2 + fx.reverbSize * 2);
        out.gain.value = fx.masterVolume;
      }
    };
    return mixer;
  }

  function syncMixer(mixer, project) {
    const soloed = project.tracks.some(t => t.solo);
    project.tracks.forEach((t, i) => {
      mixer.applyTrack(i, t, t.mute || (soloed && !t.solo));
    });
    mixer.applyGlobal(project.fx, project.bpm);
  }

  /* ── 스텝 실행 ──────────────────────────────────────────────────── */

  /* 패턴의 한 스텝을 time 시각에 울린다. 실시간이든 렌더링이든 여기를 거친다. */
  function playStep(ctx, mixer, project, patternIndex, stepIndex, time) {
    const pattern = project.patterns[patternIndex];
    if (!pattern) return;
    const stepDur = M.stepDuration(project.bpm);
    project.tracks.forEach((track, i) => {
      const cell = pattern.cells[i] && pattern.cells[i][stepIndex];
      if (!cell) return;
      const inst = INSTRUMENTS[track.instrument];
      if (!inst) return;
      const dest = mixer.tracks[i].input;
      if (inst.kind === 'drum') {
        inst.trigger(ctx, dest, time, cell.vel);
      } else {
        const midi = M.degreeToMidi(project.rootMidi + (inst.octave || 0) * 12, project.scale, cell.degree);
        inst.trigger(ctx, dest, time, cell.vel, M.midiToFreq(midi), stepDur * (cell.len || 1));
      }
    });
  }

  /* 곡 배열의 n번째 스텝이 어느 패턴의 몇 번째인지. 배열이 비면 현재 패턴을 계속 돈다. */
  function resolveSongStep(project, absoluteStep, fallbackPattern) {
    const per = project.steps;
    if (!project.arrangement.length) {
      return { pattern: fallbackPattern, step: absoluteStep % per };
    }
    const total = project.arrangement.length * per;
    const wrapped = ((absoluteStep % total) + total) % total;
    return {
      pattern: project.arrangement[Math.floor(wrapped / per)],
      step: wrapped % per
    };
  }

  /* ── 실시간 재생 ────────────────────────────────────────────────── */
  /* setInterval 로 소리를 내면 안 된다 — 타이머는 수십 ms 씩 흔들려서 박자가 무너진다.
     타이머는 "앞으로 0.1초 안에 울릴 것들"을 찾아 오디오 시계에 예약만 하고 빠진다. */

  const LOOKAHEAD_MS = 25;
  const SCHEDULE_AHEAD = 0.12;

  function createTransport(ctx, getProject, opts) {
    opts = opts || {};
    let mixer = null;
    let timer = null;
    let nextStep = 0;
    let nextTime = 0;
    let startedAt = 0;
    const scheduled = [];

    function ensureMixer() {
      const project = getProject();
      if (!mixer || mixer.tracks.length !== project.tracks.length) {
        mixer = buildMixer(ctx, project);
      }
      syncMixer(mixer, project);
      return mixer;
    }

    function tick() {
      const project = getProject();
      const dur = M.stepDuration(project.bpm);
      while (nextTime < ctx.currentTime + SCHEDULE_AHEAD) {
        const at = resolveSongStep(project, nextStep, opts.currentPattern ? opts.currentPattern() : 0);
        const swung = nextTime + (nextStep % 2 ? dur * (project.swing || 0) * 0.5 : 0);
        playStep(ctx, mixer, project, at.pattern, at.step, swung);
        scheduled.push({ step: nextStep, time: swung, pattern: at.pattern, index: at.step });
        nextTime += dur;
        nextStep += 1;
      }
      /* 이미 지나간 예약은 버린다 — 안 버리면 계속 쌓인다. */
      while (scheduled.length > 1 && scheduled[1].time <= ctx.currentTime) scheduled.shift();
    }

    return {
      get playing() { return timer !== null; },
      start() {
        if (timer) return;
        ensureMixer();
        nextStep = 0;
        nextTime = ctx.currentTime + 0.08;
        startedAt = nextTime;
        scheduled.length = 0;
        tick();
        timer = setInterval(tick, LOOKAHEAD_MS);
      },
      stop() {
        if (timer) { clearInterval(timer); timer = null; }
        scheduled.length = 0;
        /* 울리던 소리는 마스터를 잠깐 내려서 툭 끊기지 않게 한다. */
        if (mixer) {
          const g = mixer.out.gain;
          const now = ctx.currentTime;
          g.cancelScheduledValues(now);
          g.setValueAtTime(g.value, now);
          g.linearRampToValueAtTime(0, now + 0.05);
          setTimeout(() => { if (!timer && mixer) syncMixer(mixer, getProject()); }, 120);
        }
      },
      sync() { if (mixer) syncMixer(mixer, getProject()); },
      /* 화면의 재생 헤드용. 지금 울리고 있는 스텝을 돌려준다. */
      position() {
        if (!timer) return null;
        const now = ctx.currentTime;
        let cur = null;
        for (const s of scheduled) { if (s.time <= now) cur = s; else break; }
        return cur;
      },
      elapsed() { return timer ? ctx.currentTime - startedAt : 0; },
      /* 한 칸 미리듣기 — 칸을 찍을 때 바로 소리가 나야 뭘 찍었는지 안다. */
      audition(project, patternIndex, trackIndex, cell) {
        const mx = ensureMixer();
        const t = ctx.currentTime + 0.01;
        const inst = INSTRUMENTS[project.tracks[trackIndex].instrument];
        if (!inst) return;
        const dest = mx.tracks[trackIndex].input;
        if (inst.kind === 'drum') inst.trigger(ctx, dest, t, cell.vel);
        else {
          const midi = M.degreeToMidi(project.rootMidi + (inst.octave || 0) * 12, project.scale, cell.degree);
          inst.trigger(ctx, dest, t, cell.vel, M.midiToFreq(midi), M.stepDuration(project.bpm));
        }
      }
    };
  }

  /* ── 파일로 내보내기 ────────────────────────────────────────────── */
  /* 실시간으로 녹음하지 않는다. OfflineAudioContext 가 곡 전체를 계산해서
     한 번에 뱉는다 — 3분 곡도 몇 초면 끝나고, 중간에 끊길 일이 없다. */

  function renderSong(project, fallbackPattern) {
    const steps = project.arrangement.length
      ? project.arrangement.length * project.steps
      : project.steps;
    const stepDur = M.stepDuration(project.bpm);
    const total = steps * stepDur + M.tailSeconds(project);
    const rate = 44100;
    const OC = global.OfflineAudioContext || global.webkitOfflineAudioContext;
    const ctx = new OC(2, Math.ceil(total * rate), rate);

    const mixer = buildMixer(ctx, project);
    syncMixer(mixer, project);

    const start = 0.02;
    for (let i = 0; i < steps; i++) {
      const at = resolveSongStep(project, i, fallbackPattern);
      const swung = start + i * stepDur + (i % 2 ? stepDur * (project.swing || 0) * 0.5 : 0);
      playStep(ctx, mixer, project, at.pattern, at.step, swung);
    }
    return ctx.startRendering();
  }

  global.Audio1 = {
    INSTRUMENTS, INSTRUMENT_KEYS,
    buildMixer, syncMixer, playStep, resolveSongStep,
    createTransport, renderSong, driveCurve, impulse
  };

  if (typeof module !== 'undefined') module.exports = global.Audio1;

})(typeof globalThis !== 'undefined' ? globalThis : this);
