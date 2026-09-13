'use strict';
const W = require('../wav.js');
const A = (() => { global.Music = require('../music.js'); return require('../audio.js'); })();
const { is, ok, section } = require('./harness.js');

section('16비트 변환');
is('0 은 0', W.toInt16(0), 0);
is('최대값', Math.round(W.toInt16(1)), 32767);
is('최소값', Math.round(W.toInt16(-1)), -32768);
/* 범위를 안 자르면 정수가 한 바퀴 돌아 최대 소리가 최소 소리로 뒤집힌다 — 치직거리는 잡음. */
is('1 을 넘으면 잘린다', Math.round(W.toInt16(2.5)), 32767);
is('-1 밑도 잘린다', Math.round(W.toInt16(-3)), -32768);

section('WAV 헤더');
const frames = 100;
const left = new Float32Array(frames);
const right = new Float32Array(frames);
for (let i = 0; i < frames; i++) { left[i] = Math.sin(i / 5); right[i] = -left[i]; }
const buf = W.encodeWav([left, right], 44100);
const h = W.readHeader(buf);

is('RIFF', h.riff, 'RIFF');
is('WAVE', h.wave, 'WAVE');
is('fmt 청크', h.fmt, 'fmt ');
is('무압축 PCM', h.format, 1);
is('스테레오', h.channels, 2);
is('샘플레이트', h.sampleRate, 44100);
is('비트수', h.bitsPerSample, 16);
is('블록 정렬 = 채널 × 2바이트', h.blockAlign, 4);
is('초당 바이트', h.byteRate, 44100 * 4);
is('data 청크', h.data, 'data');
is('데이터 길이', h.dataBytes, frames * 4);
is('전체 길이 = 헤더 44 + 데이터', h.totalBytes, 44 + frames * 4);
/* RIFF 크기 필드가 틀리면 어떤 플레이어는 파일을 아예 안 연다. */
is('RIFF 크기 필드', h.declaredSize, h.totalBytes - 8);

section('샘플이 제자리에 들어갔나');
const view = new DataView(buf);
is('첫 왼쪽 샘플', view.getInt16(44, true), Math.round(W.toInt16(left[0])), 1);
is('첫 오른쪽 샘플', view.getInt16(46, true), Math.round(W.toInt16(right[0])), 1);
is('두번째 왼쪽 샘플', view.getInt16(48, true), Math.round(W.toInt16(left[1])), 1);

section('모노도 된다');
const mono = W.readHeader(W.encodeWav([left], 22050));
is('채널 1', mono.channels, 1);
is('블록 정렬', mono.blockAlign, 2);
is('샘플레이트', mono.sampleRate, 22050);

section('곡 배열 → 패턴 위치');
const p = { steps: 16, arrangement: [0, 2, 1], patterns: [{}, {}, {}] };
is('0번 스텝', A.resolveSongStep(p, 0, 0), { pattern: 0, step: 0 });
is('15번 스텝', A.resolveSongStep(p, 15, 0), { pattern: 0, step: 15 });
is('16번 = 두번째 마디 시작', A.resolveSongStep(p, 16, 0), { pattern: 2, step: 0 });
is('35번 = 세번째 마디', A.resolveSongStep(p, 35, 0), { pattern: 1, step: 3 });
is('끝나면 처음으로 돈다', A.resolveSongStep(p, 48, 0), { pattern: 0, step: 0 });
is('배열이 비면 지금 패턴을 반복',
  A.resolveSongStep({ steps: 16, arrangement: [], patterns: [{}] }, 20, 3), { pattern: 3, step: 4 });

section('악기');
ok('악기가 9개', A.INSTRUMENT_KEYS.length === 9);
ok('전부 label/kind/color 를 가진다', A.INSTRUMENT_KEYS.every(k => {
  const i = A.INSTRUMENTS[k];
  return i.label && (i.kind === 'drum' || i.kind === 'synth') && /^#/.test(i.color);
}));
ok('드라이브 0 은 원음 그대로(직선)', (() => {
  const c = A.driveCurve(0);
  return Math.abs(c[0] + 1) < 1e-6 && Math.abs(c[1023] - 1) < 1e-6 && Math.abs(c[512]) < 0.01;
})());
ok('드라이브를 올리면 작은 소리가 커진다', A.driveCurve(1)[640] > A.driveCurve(0)[640]);

module.exports = true;
