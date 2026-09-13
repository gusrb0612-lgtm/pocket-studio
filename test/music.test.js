'use strict';
const M = require('../music.js');
const { is, ok, section } = require('./harness.js');

section('음높이 변환');
is('A4 = 440Hz', M.midiToFreq(69), 440);
is('한 옥타브 위', M.midiToFreq(81), 880);
is('MIDI 60 이름', M.noteName(60), 'C4');
is('MIDI 57 이름', M.noteName(57), 'A3');

section('스케일 — 단5음(A3 = 57)');
/* 단5음 = [0,3,5,7,10]. 5개를 다 쓰면 다음은 한 옥타브 위로 넘어가야 한다. */
is('0번째 음', M.degreeToMidi(57, 'minor_pent', 0), 57);
is('1번째 음', M.degreeToMidi(57, 'minor_pent', 1), 60);
is('4번째 음', M.degreeToMidi(57, 'minor_pent', 4), 67);
is('5번째 = 옥타브 위 루트', M.degreeToMidi(57, 'minor_pent', 5), 69);
is('음수는 아래 옥타브로', M.degreeToMidi(57, 'minor_pent', -1), 55);
is('두 옥타브 아래', M.degreeToMidi(57, 'minor_pent', -5), 45);
is('장음계 7번째', M.degreeToMidi(60, 'major', 7), 72);
ok('모든 스케일이 루트에서 시작', M.SCALE_KEYS.every(k => M.SCALES[k].steps[0] === 0));
ok('모든 스케일이 한 옥타브 안', M.SCALE_KEYS.every(k => M.SCALES[k].steps.every(s => s >= 0 && s < 12)));

section('타이밍');
is('120BPM 16분음표', M.stepDuration(120), 0.125);
is('60BPM 16분음표', M.stepDuration(60), 0.25);
is('스윙 0 — 짝수 스텝', M.stepOffset(2, 120, 0), 0.25);
is('스윙 0 — 홀수 스텝', M.stepOffset(1, 120, 0), 0.125);
is('스윙 0.5 — 홀수 스텝만 밀린다', M.stepOffset(1, 120, 0.5), 0.15625);
is('스윙 0.5 — 짝수는 제자리', M.stepOffset(2, 120, 0.5), 0.25);
/* 스윙이 최대여도 다음 박을 넘어서면 안 된다 — 넘으면 순서가 뒤집힌다. */
ok('스윙 최대에도 순서가 유지된다',
  M.stepOffset(1, 120, 1) < M.stepOffset(2, 120, 1));

section('곡 길이');
const project = {
  bpm: 120, steps: 16,
  patterns: [{}, {}, {}, {}],
  arrangement: [0, 0, 1, 0],
  fx: { delayDivision: 1, delayFeedback: 0.3, reverbSize: 0.5 }
};
is('4마디 = 64스텝', M.songSteps(project), 64);
is('4마디 길이(초)', M.songDuration(project), 8);
is('빈 배열은 0', M.songSteps(Object.assign({}, project, { arrangement: [] })), 0);
is('없는 패턴은 건너뛴다', M.songSteps(Object.assign({}, project, { arrangement: [0, 9] })), 16);

section('에코 간격 — BPM 에 맞아야 한다');
is('120BPM 1/8', M.delayTime(120, 1), 0.25);
is('120BPM 1/4', M.delayTime(120, 3), 0.5);
is('60BPM 1/4', M.delayTime(60, 3), 1);
is('점8분음표는 8분의 1.5배', M.delayTime(120, 2), 0.375);

section('꼬리 — 에코와 리버브가 잘리면 안 된다');
ok('최소 1.5초는 준다', M.tailSeconds(project) >= 1.5);
ok('피드백이 크면 꼬리도 길어진다',
  M.tailSeconds(Object.assign({}, project, { fx: { delayDivision: 4, delayFeedback: 0.8, reverbSize: 0.5 } }))
  > M.tailSeconds(project));
ok('그래도 12초를 넘지 않는다',
  M.tailSeconds({ bpm: 50, fx: { delayDivision: 4, delayFeedback: 0.85, reverbSize: 1 } }) <= 12);

module.exports = true;
