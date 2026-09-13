'use strict';
/* 화면과 상태. 소리는 audio.js 가, 계산은 music.js 가 한다 — 여기는 그리고 받아치기만. */

(function () {

  const M = window.Music;
  const A = window.Audio1;
  const W = window.Wav;

  const MAX_TRACKS = 8;
  const PATTERN_NAMES = ['A', 'B', 'C', 'D'];

  /* ── 상태 ───────────────────────────────────────────────────────── */

  function makeTrack(instrument) {
    return {
      instrument,
      volume: 0.9, pan: 0,
      drive: 0, cutoff: 1, resonance: 0, filterType: 'lowpass',
      chorus: 0, delaySend: 0, reverbSend: 0.08,
      mute: false, solo: false
    };
  }

  function emptyCells(trackCount, steps) {
    return Array.from({ length: trackCount }, () => new Array(steps).fill(null));
  }

  function defaultProject() {
    const tracks = ['kick', 'snare', 'hat', 'bass', 'lead', 'pad'].map(makeTrack);
    const steps = 16;
    const project = {
      bpm: 96, swing: 0.12, steps,
      scale: 'minor_pent', rootMidi: 57, /* A3 */
      tracks,
      patterns: PATTERN_NAMES.map(name => ({ name, cells: emptyCells(tracks.length, steps) })),
      arrangement: [],
      fx: { delayDivision: 2, delayFeedback: 0.34, reverbSize: 0.45, masterVolume: 0.85 }
    };

    /* 빈 격자로 열면 재생을 눌러도 아무 소리가 안 나서 고장난 줄 안다.
       열자마자 굴러가는 기본 그루브를 하나 깔아 둔다. */
    const P = project.patterns[0].cells;
    [0, 6, 10].forEach(s => P[0][s] = { vel: 1, degree: 0 });
    [4, 12].forEach(s => P[1][s] = { vel: 1, degree: 0 });
    for (let s = 0; s < 16; s += 2) P[2][s] = { vel: s % 4 === 0 ? 0.95 : 0.6, degree: 0 };
    [[0, 0], [3, 0], [6, 2], [8, 0], [11, 4], [14, 3]].forEach(([s, d]) => P[3][s] = { vel: 0.95, degree: d });
    [[2, 7], [5, 9], [10, 7], [13, 11]].forEach(([s, d]) => P[4][s] = { vel: 0.8, degree: d });
    [[0, 0], [8, 4]].forEach(([s, d]) => P[5][s] = { vel: 0.7, degree: d, len: 8 });

    project.tracks[3].cutoff = 0.62;
    project.tracks[4].delaySend = 0.3;
    project.tracks[4].reverbSend = 0.25;
    project.tracks[5].reverbSend = 0.5;
    project.tracks[5].chorus = 0.4;
    return project;
  }

  const project = defaultProject();

  const ui = {
    pattern: 0,
    track: 0,
    degree: 0,     /* 멜로디 칸을 찍을 때 넣을 음 */
    octave: 0,
    lastBlob: null
  };

  /* ── 오디오 (첫 터치 뒤에 만든다 — 사파리는 그 전엔 소리를 막는다) ── */

  let ctx = null;
  let transport = null;

  function ensureAudio() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      transport = A.createTransport(ctx, () => project, { currentPattern: () => ui.pattern });
    }
    if (ctx.state === 'suspended') ctx.resume();
    return transport;
  }

  const $ = sel => document.querySelector(sel);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  /* ── 조절 항목 ──────────────────────────────────────────────────── */

  const pct = v => Math.round(v * 100) + '%';

  const TRACK_KNOBS = [
    { key: 'volume',     label: '볼륨',      min: 0,  max: 1.4, step: 0.01, fmt: pct },
    { key: 'pan',        label: '좌우',      min: -1, max: 1,   step: 0.02,
      fmt: v => Math.abs(v) < 0.03 ? '가운데' : (v < 0 ? '왼쪽 ' : '오른쪽 ') + Math.round(Math.abs(v) * 100) + '%' },
    { key: 'drive',      label: '드라이브',  min: 0, max: 1, step: 0.01, fmt: pct },
    { key: 'cutoff',     label: '필터',      min: 0.05, max: 1, step: 0.01,
      fmt: v => Math.round(60 * Math.pow(300, v)) + 'Hz' },
    { key: 'resonance',  label: '레조넌스',  min: 0, max: 1, step: 0.01, fmt: pct },
    { key: 'chorus',     label: '코러스',    min: 0, max: 1, step: 0.01, fmt: pct },
    { key: 'delaySend',  label: '에코',      min: 0, max: 1, step: 0.01, fmt: pct },
    { key: 'reverbSend', label: '리버브',    min: 0, max: 1, step: 0.01, fmt: pct }
  ];

  const GLOBAL_KNOBS = [
    { path: 'swing',            label: '스윙',        min: 0, max: 0.7, step: 0.01, fmt: pct },
    { path: 'fx.delayFeedback', label: '에코 반복',   min: 0, max: 0.85, step: 0.01, fmt: pct },
    { path: 'fx.reverbSize',    label: '리버브 크기', min: 0, max: 1, step: 0.01, fmt: pct },
    { path: 'fx.masterVolume',  label: '전체 볼륨',   min: 0, max: 1.2, step: 0.01, fmt: pct }
  ];

  function getPath(obj, path) {
    return path.split('.').reduce((o, k) => o[k], obj);
  }
  function setPath(obj, path, value) {
    const keys = path.split('.');
    const last = keys.pop();
    keys.reduce((o, k) => o[k], obj)[last] = value;
  }

  function makeKnob(label, value, spec, onInput) {
    const wrap = el('label', 'knob');
    const head = el('div', 'knob-head');
    head.appendChild(el('span', 'knob-label', label));
    const read = el('span', 'knob-value', spec.fmt(value));
    head.appendChild(read);
    const range = el('input', 'knob-range');
    range.type = 'range';
    range.min = spec.min; range.max = spec.max; range.step = spec.step;
    range.value = value;
    range.addEventListener('input', () => {
      const v = parseFloat(range.value);
      read.textContent = spec.fmt(v);
      onInput(v);
    });
    wrap.appendChild(head);
    wrap.appendChild(range);
    return wrap;
  }

  function chip(text, active, onTap, extraClass) {
    const b = el('button', 'chip' + (active ? ' on' : '') + (extraClass ? ' ' + extraClass : ''), text);
    b.addEventListener('click', onTap);
    return b;
  }

  function fill(node, children) {
    node.textContent = '';
    children.forEach(c => node.appendChild(c));
  }

  /* ── 격자 ───────────────────────────────────────────────────────── */

  const gridEl = $('#grid');
  const rulerEl = $('#ruler');

  function scaleLength() {
    return M.SCALES[project.scale].steps.length;
  }

  function currentCells() {
    return project.patterns[ui.pattern].cells;
  }

  function buildRuler() {
    const nodes = [el('div', 'ruler-gap')];
    for (let s = 0; s < project.steps; s++) {
      const d = el('div', 'ruler-tick' + (s % 4 === 0 ? ' beat' : ''), s % 4 === 0 ? String(s / 4 + 1) : '');
      d.dataset.step = s;
      nodes.push(d);
    }
    fill(rulerEl, nodes);
  }

  function buildGrid() {
    document.documentElement.style.setProperty('--steps', project.steps);
    const nodes = [];
    project.tracks.forEach((track, t) => {
      const name = el('button', 'track-name', A.INSTRUMENTS[track.instrument].label);
      name.style.setProperty('--c', A.INSTRUMENTS[track.instrument].color);
      name.dataset.track = t;
      name.classList.toggle('sel', t === ui.track);
      nodes.push(name);
      for (let s = 0; s < project.steps; s++) {
        const c = el('button', 'cell');
        c.dataset.track = t;
        c.dataset.step = s;
        c.style.setProperty('--c', A.INSTRUMENTS[track.instrument].color);
        nodes.push(c);
      }
    });
    fill(gridEl, nodes);
    paintAll();
  }

  function paintCell(t, s) {
    const node = gridEl.querySelector(`.cell[data-track="${t}"][data-step="${s}"]`);
    if (!node) return;
    const cell = currentCells()[t][s];
    const inst = A.INSTRUMENTS[project.tracks[t].instrument];
    node.classList.toggle('on', !!cell);
    node.classList.toggle('accent', !!cell && cell.vel > 0.85);
    node.classList.toggle('beat', s % 4 === 0);
    if (cell && inst.kind === 'synth') {
      const n = scaleLength();
      const oct = Math.floor(cell.degree / n);
      node.textContent = String(((cell.degree % n) + n) % n + 1);
      node.dataset.oct = oct > 0 ? 'up' : oct < 0 ? 'down' : 'mid';
    } else {
      node.textContent = '';
      delete node.dataset.oct;
    }
  }

  function paintAll() {
    project.tracks.forEach((_, t) => {
      for (let s = 0; s < project.steps; s++) paintCell(t, s);
    });
  }

  /* 칸을 찍었을 때.
     드럼은 꺼짐 → 보통 → 세게 → 꺼짐 으로 돈다(버튼 하나로 악센트까지).
     멜로디는 위에서 고른 음을 칠한다 — 같은 음을 다시 찍으면 지운다. */
  function toggleCell(t, s) {
    const cells = currentCells();
    const cur = cells[t][s];
    const inst = A.INSTRUMENTS[project.tracks[t].instrument];
    let next;
    if (inst.kind === 'drum') {
      next = !cur ? { vel: 0.75, degree: 0 } : (cur.vel <= 0.85 ? { vel: 1, degree: 0 } : null);
    } else {
      const degree = ui.degree + ui.octave * scaleLength();
      next = (cur && cur.degree === degree) ? null : { vel: 0.9, degree, len: 1 };
    }
    cells[t][s] = next;
    paintCell(t, s);
    if (next) {
      const tr = ensureAudio();
      tr.audition(project, ui.pattern, t, next);
    }
  }

  gridEl.addEventListener('click', e => {
    const cell = e.target.closest('.cell');
    if (cell) {
      const t = +cell.dataset.track, s = +cell.dataset.step;
      if (t !== ui.track) { ui.track = t; renderTrackPanel(); markSelectedTrack(); }
      toggleCell(t, s);
      return;
    }
    const name = e.target.closest('.track-name');
    if (name) {
      ui.track = +name.dataset.track;
      renderTrackPanel();
      markSelectedTrack();
    }
  });

  function markSelectedTrack() {
    gridEl.querySelectorAll('.track-name').forEach(n => {
      n.classList.toggle('sel', +n.dataset.track === ui.track);
    });
  }

  /* ── 재생 헤드 ──────────────────────────────────────────────────── */

  let rafId = null;
  let litStep = -1;

  function followPlayhead() {
    const pos = transport && transport.position();
    if (pos) {
      if (pos.pattern !== ui.pattern && project.arrangement.length) {
        ui.pattern = pos.pattern;
        renderPatternTabs();
        paintAll();
      }
      if (pos.index !== litStep) {
        litStep = pos.index;
        gridEl.querySelectorAll('.cell.now').forEach(n => n.classList.remove('now'));
        gridEl.querySelectorAll(`.cell[data-step="${litStep}"]`).forEach(n => n.classList.add('now'));
        rulerEl.querySelectorAll('.ruler-tick').forEach(n =>
          n.classList.toggle('now', +n.dataset.step === litStep));
      }
    }
    rafId = requestAnimationFrame(followPlayhead);
  }

  function clearPlayhead() {
    litStep = -1;
    gridEl.querySelectorAll('.cell.now').forEach(n => n.classList.remove('now'));
    rulerEl.querySelectorAll('.ruler-tick.now').forEach(n => n.classList.remove('now'));
  }

  const playBtn = $('#playBtn');

  function togglePlay() {
    const tr = ensureAudio();
    if (tr.playing) {
      tr.stop();
      playBtn.textContent = '▶';
      playBtn.classList.remove('on');
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      clearPlayhead();
    } else {
      tr.start();
      playBtn.textContent = '■';
      playBtn.classList.add('on');
      if (!rafId) rafId = requestAnimationFrame(followPlayhead);
    }
  }

  playBtn.addEventListener('click', togglePlay);

  /* ── 템포 ───────────────────────────────────────────────────────── */

  document.querySelectorAll('[data-bpm]').forEach(b => {
    b.addEventListener('click', () => {
      project.bpm = Math.max(50, Math.min(200, project.bpm + +b.dataset.bpm));
      $('#bpmValue').textContent = project.bpm;
      if (transport) transport.sync();
    });
  });

  /* ── 패턴 ───────────────────────────────────────────────────────── */

  const patternTabs = $('#patternTabs');

  function renderPatternTabs() {
    fill(patternTabs, project.patterns.map((p, i) =>
      chip(p.name, i === ui.pattern, () => {
        ui.pattern = i;
        renderPatternTabs();
        paintAll();
      })));
  }

  $('#patCopyBtn').addEventListener('click', () => {
    /* 지금 패턴을 비어 있는 다음 패턴으로 복사 — 변주를 만들 때 바닥부터 안 찍어도 된다. */
    const src = project.patterns[ui.pattern];
    const emptyIdx = project.patterns.findIndex((p, i) =>
      i !== ui.pattern && p.cells.every(row => row.every(c => !c)));
    const target = emptyIdx >= 0 ? emptyIdx : (ui.pattern + 1) % project.patterns.length;
    project.patterns[target].cells = src.cells.map(row => row.map(c => c ? Object.assign({}, c) : null));
    ui.pattern = target;
    renderPatternTabs();
    paintAll();
  });

  $('#patClearBtn').addEventListener('click', () => {
    project.patterns[ui.pattern].cells = emptyCells(project.tracks.length, project.steps);
    paintAll();
  });

  /* ── 음높이 ─────────────────────────────────────────────────────── */

  const pitchStrip = $('#pitchStrip');
  const pitchChips = $('#pitchChips');

  function renderPitch() {
    const inst = A.INSTRUMENTS[project.tracks[ui.track].instrument];
    pitchStrip.hidden = inst.kind !== 'synth';
    if (pitchStrip.hidden) return;
    const n = scaleLength();
    const base = project.rootMidi + (inst.octave || 0) * 12;
    fill(pitchChips, Array.from({ length: n }, (_, d) => {
      const c = chip(String(d + 1), d === ui.degree, () => {
        ui.degree = d;
        renderPitch();
      }, 'pitch-chip');
      /* 칸에 음이름까지 넣을 자리는 없다 — 길게 눌렀을 때만 뜨게 둔다. */
      c.title = M.noteName(M.degreeToMidi(base, project.scale, d + ui.octave * n));
      return c;
    }));
  }

  document.querySelectorAll('[data-octave]').forEach(b => {
    b.addEventListener('click', () => {
      ui.octave = Math.max(-2, Math.min(2, ui.octave + +b.dataset.octave));
      renderPitch();
    });
  });

  /* ── 트랙 패널 ──────────────────────────────────────────────────── */

  const instChips = $('#instChips');
  const trackKnobs = $('#trackKnobs');
  const filterTypeChips = $('#filterTypeChips');

  function renderTrackPanel() {
    const track = project.tracks[ui.track];
    const inst = A.INSTRUMENTS[track.instrument];
    $('#trackTitle').textContent = inst.label;
    $('#trackTitle').style.color = inst.color;

    fill(instChips, A.INSTRUMENT_KEYS.map(key =>
      chip(A.INSTRUMENTS[key].label, key === track.instrument, () => {
        track.instrument = key;
        buildGrid();
        renderTrackPanel();
        if (transport) transport.sync();
      })));

    /* 트랙 추가/삭제 */
    const addBtn = el('button', 'chip add', '＋ 트랙');
    addBtn.disabled = project.tracks.length >= MAX_TRACKS;
    addBtn.addEventListener('click', () => {
      project.tracks.push(makeTrack('clap'));
      project.patterns.forEach(p => p.cells.push(new Array(project.steps).fill(null)));
      ui.track = project.tracks.length - 1;
      buildGrid(); renderTrackPanel();
      if (transport) transport.sync();
    });
    instChips.appendChild(addBtn);

    if (project.tracks.length > 1) {
      const delBtn = el('button', 'chip danger', '트랙 삭제');
      delBtn.addEventListener('click', () => {
        project.tracks.splice(ui.track, 1);
        project.patterns.forEach(p => p.cells.splice(ui.track, 1));
        ui.track = Math.max(0, ui.track - 1);
        buildGrid(); renderTrackPanel();
        if (transport) transport.sync();
      });
      instChips.appendChild(delBtn);
    }

    fill(trackKnobs, TRACK_KNOBS.map(spec =>
      makeKnob(spec.label, track[spec.key], spec, v => {
        track[spec.key] = v;
        if (transport) transport.sync();
      })));

    fill(filterTypeChips, [['lowpass', '높은 음 깎기'], ['highpass', '낮은 음 깎기'], ['bandpass', '가운데만']]
      .map(([type, label]) => chip(label, track.filterType === type, () => {
        track.filterType = type;
        renderTrackPanel();
        if (transport) transport.sync();
      })));

    $('#muteBtn').classList.toggle('on', track.mute);
    $('#soloBtn').classList.toggle('on', track.solo);
    renderPitch();
  }

  $('#muteBtn').addEventListener('click', () => {
    const t = project.tracks[ui.track];
    t.mute = !t.mute;
    renderTrackPanel();
    if (transport) transport.sync();
  });
  $('#soloBtn').addEventListener('click', () => {
    const t = project.tracks[ui.track];
    t.solo = !t.solo;
    renderTrackPanel();
    if (transport) transport.sync();
  });

  /* ── 곡 구성 ────────────────────────────────────────────────────── */

  const arrangementEl = $('#arrangement');
  const arrAddChips = $('#arrAddChips');

  function renderArrangement() {
    const hint = $('#arrHint');
    if (!project.arrangement.length) {
      hint.textContent = '비어 있으면 지금 보고 있는 패턴만 계속 반복한다. 패턴을 뒤에 붙이면 곡이 된다.';
    } else {
      const secs = M.songDuration(project);
      hint.textContent = `${project.arrangement.length}마디 · ${secs.toFixed(1)}초 — 칸을 누르면 뺀다.`;
    }
    fill(arrangementEl, project.arrangement.map((p, i) =>
      chip(project.patterns[p].name, false, () => {
        project.arrangement.splice(i, 1);
        renderArrangement();
      }, 'arr-chip')));
    fill(arrAddChips, project.patterns.map((p, i) =>
      chip(p.name, false, () => {
        project.arrangement.push(i);
        renderArrangement();
      })));
  }

  $('#arrClearBtn').addEventListener('click', () => {
    project.arrangement = [];
    renderArrangement();
  });

  /* ── 전체 설정 ──────────────────────────────────────────────────── */

  function renderGlobals() {
    fill($('#scaleChips'), M.SCALE_KEYS.map(key =>
      chip(M.SCALES[key].label, key === project.scale, () => {
        project.scale = key;
        ui.degree = Math.min(ui.degree, M.SCALES[key].steps.length - 1);
        renderGlobals(); renderPitch(); paintAll();
      })));

    /* 기준음은 한 옥타브만 — 더 낮게/높게는 트랙 악기가 알아서 옮긴다. */
    fill($('#rootChips'), M.NOTE_NAMES.map((name, i) => {
      const midi = 57 + i; /* A3 부터 */
      return chip(name, project.rootMidi === midi, () => {
        project.rootMidi = midi;
        renderGlobals(); renderPitch();
        if (transport) transport.sync();
      });
    }));

    fill($('#delayDivChips'), M.DELAY_DIVISIONS.map((d, i) =>
      chip(d.label, project.fx.delayDivision === i, () => {
        project.fx.delayDivision = i;
        renderGlobals();
        if (transport) transport.sync();
      })));

    fill($('#globalKnobs'), GLOBAL_KNOBS.map(spec =>
      makeKnob(spec.label, getPath(project, spec.path), spec, v => {
        setPath(project, spec.path, v);
        if (transport) transport.sync();
      })));
  }

  /* ── 내보내기 ───────────────────────────────────────────────────── */

  const sheet = $('#exportSheet');
  const statusEl = $('#exportStatus');
  const previewEl = $('#exportPreview');
  const saveBtn = $('#saveFileBtn');
  const hintEl = $('#exportHint');
  let previewUrl = null;

  function stamp() {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  }

  function fileName() {
    return `pocket-studio-${stamp()}.wav`;
  }

  function openSheet() {
    sheet.hidden = false;
    saveBtn.disabled = true;
    previewEl.hidden = true;
    hintEl.textContent = '';
    if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
    ui.lastBlob = null;

    const bars = project.arrangement.length || 1;
    statusEl.textContent = `${bars}마디 계산 중…`;

    /* 렌더링은 실시간보다 빠르지만 그동안 화면이 잠깐 멈춘다.
       위 문구가 먼저 그려지도록 한 박자 쉬고 시작한다.
       requestAnimationFrame 을 쓰면 안 된다 — 화면이 가려진 탭에서는
       rAF 가 아예 안 불려서 내보내기가 시작조차 안 된다. */
    setTimeout(runRender, 30);
  }

  function runRender() {
    const started = Date.now();
    A.renderSong(project, ui.pattern).then(buffer => {
      const blob = W.toBlob(buffer);
      ui.lastBlob = blob;
      previewUrl = URL.createObjectURL(blob);
      previewEl.src = previewUrl;
      previewEl.hidden = false;
      saveBtn.disabled = false;
      const mb = blob.size / 1048576;
      statusEl.textContent =
        `${buffer.duration.toFixed(1)}초 · ${mb.toFixed(1)}MB · 44.1kHz 스테레오 (${((Date.now() - started) / 1000).toFixed(1)}초 걸림)`;
      hintEl.textContent = canShareFiles()
        ? '저장을 누르면 공유 시트가 열린다 — "파일에 저장"으로 원하는 폴더를 고르면 된다.'
        : '저장을 누르면 파일이 내려받아진다.';
    }).catch(err => {
      statusEl.textContent = '렌더링 실패: ' + (err && err.message ? err.message : err);
      hintEl.textContent = '';
    });
  }

  function canShareFiles() {
    try {
      return !!(navigator.canShare && navigator.share &&
        navigator.canShare({ files: [new File([new Blob(['x'])], 'x.wav', { type: 'audio/wav' })] }));
    } catch (e) { return false; }
  }

  $('#exportBtn').addEventListener('click', openSheet);
  $('#exportCloseBtn').addEventListener('click', () => {
    sheet.hidden = true;
    previewEl.pause();
  });

  /* 공유 시트는 반드시 사용자가 누른 그 순간에 열려야 한다.
     그래서 렌더링을 먼저 끝내 두고, 저장은 별도의 탭으로 받는다. */
  saveBtn.addEventListener('click', () => {
    if (!ui.lastBlob) return;
    const name = fileName();
    const file = new File([ui.lastBlob], name, { type: 'audio/wav' });
    if (canShareFiles()) {
      navigator.share({ files: [file], title: name })
        .then(() => { hintEl.textContent = '저장했다.'; })
        .catch(err => {
          if (err && err.name === 'AbortError') return;
          downloadFallback(name);
        });
    } else {
      downloadFallback(name);
    }
  });

  function downloadFallback(name) {
    const a = document.createElement('a');
    a.href = previewUrl;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    hintEl.textContent = '내려받기를 시작했다.';
  }

  /* ── 시작 ───────────────────────────────────────────────────────── */

  $('#bpmValue').textContent = project.bpm;
  buildRuler();
  buildGrid();
  renderPatternTabs();
  renderTrackPanel();
  renderArrangement();
  renderGlobals();

  /* 스페이스바로 재생/정지 — 맥에서 만질 때 편하다. */
  document.addEventListener('keydown', e => {
    if (e.code === 'Space' && e.target.tagName !== 'INPUT') {
      e.preventDefault();
      togglePlay();
    }
  });

  /* 첫 터치에 오디오를 깨운다. 사파리는 사용자 동작 없이는 소리를 내주지 않는다. */
  const wake = () => { ensureAudio(); document.removeEventListener('touchstart', wake); };
  document.addEventListener('touchstart', wake, { passive: true });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

})();
