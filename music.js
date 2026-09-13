'use strict';
/* 음악 이론 + 타이밍 계산. 순수 함수만 — Web Audio 도 DOM 도 건드리지 않는다.
   오디오 엔진과 화면이 같은 답을 쓰게 하려고 여기에 모아둔다. */

/* 음이름. 인덱스가 곧 MIDI 노트 % 12 다. */
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/* 스케일 = 루트에서 몇 반음 떨어진 음을 쓰는지. 5음계를 앞에 둔 이유는
   아무 칸이나 찍어도 안 틀리게 들리기 때문이다 — 버튼으로 찍는 앱에 맞다. */
const SCALES = {
  minor_pent: { label: '단5음',  steps: [0, 3, 5, 7, 10] },
  major_pent: { label: '장5음',  steps: [0, 2, 4, 7, 9] },
  blues:      { label: '블루스', steps: [0, 3, 5, 6, 7, 10] },
  minor:      { label: '단음계', steps: [0, 2, 3, 5, 7, 8, 10] },
  major:      { label: '장음계', steps: [0, 2, 4, 5, 7, 9, 11] },
  dorian:     { label: '도리안', steps: [0, 2, 3, 5, 7, 9, 10] }
};

const SCALE_KEYS = Object.keys(SCALES);

/* A4 = MIDI 69 = 440Hz 기준. */
function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function noteName(midi) {
  const pc = ((Math.round(midi) % 12) + 12) % 12;
  const octave = Math.floor(Math.round(midi) / 12) - 1;
  return NOTE_NAMES[pc] + octave;
}

/* 스케일의 n번째 음(degree)을 MIDI 노트로. degree 는 음수도 옥타브를 넘겨도 된다 —
   스케일 길이로 나눠서 옥타브를 올리고 내린다. */
function degreeToMidi(rootMidi, scaleKey, degree) {
  const steps = (SCALES[scaleKey] || SCALES.minor_pent).steps;
  const n = steps.length;
  const octave = Math.floor(degree / n);
  const index = ((degree % n) + n) % n;
  return rootMidi + octave * 12 + steps[index];
}

/* 16분음표 하나의 길이(초). */
function stepDuration(bpm) {
  return 60 / bpm / 4;
}

/* 스윙: 짝수 스텝은 제자리, 홀수 스텝을 뒤로 민다. 0 이면 정박, 0.6 이면 거의 셔플.
   미는 양을 스텝의 절반으로 제한해서 다음 박을 넘어서지 않게 한다. */
function stepOffset(index, bpm, swing) {
  const d = stepDuration(bpm);
  const s = Math.max(0, Math.min(1, swing || 0));
  return index * d + (index % 2 ? d * s * 0.5 : 0);
}

/* 곡 배열(arrangement)의 총 스텝 수. 배열이 비었으면 0. */
function songSteps(project) {
  const perPattern = project.steps;
  return project.arrangement.reduce((sum, idx) => {
    return sum + (project.patterns[idx] ? perPattern : 0);
  }, 0);
}

function songDuration(project) {
  return songSteps(project) * stepDuration(project.bpm);
}

/* 에코 시간을 BPM에 맞춰 초로. 박자에 안 맞는 에코는 그냥 지저분하게 들린다. */
const DELAY_DIVISIONS = [
  { label: '1/16', beats: 0.25 },
  { label: '1/8',  beats: 0.5 },
  { label: '1/8.', beats: 0.75 },
  { label: '1/4',  beats: 1 },
  { label: '1/2',  beats: 2 }
];

function delayTime(bpm, divisionIndex) {
  const div = DELAY_DIVISIONS[divisionIndex] || DELAY_DIVISIONS[1];
  return (60 / bpm) * div.beats;
}

/* 렌더링할 때 곡이 끝나자마자 자르면 에코와 리버브 꼬리가 잘려서 뚝 끊긴다.
   남은 울림이 들릴 만큼 뒤를 더 준다. */
function tailSeconds(project) {
  const echo = delayTime(project.bpm, project.fx.delayDivision);
  const echoTail = echo * (1 + project.fx.delayFeedback * 8);
  const reverbTail = 0.6 + project.fx.reverbSize * 3.5;
  return Math.min(12, Math.max(1.5, echoTail, reverbTail) + 0.4);
}

const Music = {
  NOTE_NAMES, SCALES, SCALE_KEYS, DELAY_DIVISIONS,
  midiToFreq, noteName, degreeToMidi,
  stepDuration, stepOffset, songSteps, songDuration, delayTime, tailSeconds
};

/* 일반 스크립트의 top-level const 는 window 에 안 올라간다 — 직접 붙여야
   audio.js 와 app.js 가 찾을 수 있다. node 테스트는 module.exports 로 가져간다. */
(typeof globalThis !== 'undefined' ? globalThis : this).Music = Music;
if (typeof module !== 'undefined') module.exports = Music;
