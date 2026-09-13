# Pocket Studio

아이폰 홈 화면 앱으로 쓰는 개인용 스텝 시퀀서. 칸을 눌러 음을 찍고, 이펙트를 걸고,
wav 로 뽑는다. 사용자는 한 명(본인)뿐이고 계정도 서버도 없다.

## 절대 규칙

**빌드 도구를 도입하지 않는다.** 순수 HTML/CSS/JS. npm, 번들러, 프레임워크 없음.
파일을 고치고 새로고침하면 끝 — 이 단순함이 이 프로젝트의 존재 이유다.

**오디오 샘플 파일을 넣지 않는다.** 드럼도 신스도 전부 코드로 합성한다.
저작권이 얽히지 않고, 저장소가 가볍고, 오프라인에서 100% 동작한다.

**소리를 내는 코드는 반드시 AudioContext 를 인자로 받는다.** 실시간 재생은
`AudioContext`, 내보내기는 `OfflineAudioContext` 가 들어온다. 같은 코드가 양쪽을
돌아야 "들은 것"과 "저장된 것"이 같아진다. `audio.js` 안에서 전역 컨텍스트를
참조하는 순간 이 보장이 깨진다.

**네트워크로 나가지 않는다.** 외부 API, 애널리틱스, CDN 폰트 전부 없음.
`index.html` 의 CSP 가 이걸 강제한다 — 완화하기 전에 정말 필요한지 다시 본다.

## 구조

```
index.html   화면 전체
app.css      스타일
app.js       상태 + 그리기 + 입력. 소리는 audio.js 에, 계산은 music.js 에 맡긴다
music.js     음계·타이밍 — 순수 함수만. DOM 도 Web Audio 도 안 건드린다
audio.js     악기 합성 / 믹서 / 트랜스포트 / 오프라인 렌더
wav.js       AudioBuffer → .wav 바이트
sw.js        서비스 워커
test/        node 단위 테스트 (music.js, wav.js, 순수 로직)
```

`music.js` 와 `wav.js` 에 DOM 이나 오디오 노드가 들어가면 테스트가 죽는다.
새 계산식은 거기에 넣고 테스트를 먼저 쓴다.

## 상태

전부 `app.js` 안의 `project` 객체 하나다. 저장하지 않는다 — 새로고침하면 초기화된다.

```js
project = {
  bpm, swing, steps, scale, rootMidi,
  tracks:     [{ instrument, volume, pan, drive, cutoff, resonance,
                 filterType, chorus, delaySend, reverbSend, mute, solo }],
  patterns:   [{ name, cells: [트랙][스텝] = null | { vel, degree, len } }],
  arrangement: [패턴 인덱스, ...],
  fx: { delayDivision, delayFeedback, reverbSize, masterVolume }
}
```

`cells` 는 **트랙 먼저, 스텝 나중**이다. 트랙을 추가/삭제하면 모든 패턴의 `cells` 에
행을 같이 넣고 빼야 한다 — 한쪽만 고치면 격자와 소리가 어긋난다.

## 믹서 구조

이펙트를 트랙마다 두면 아이폰이 버거워한다(특히 리버브 = ConvolverNode).
그래서 **에코와 리버브는 전체에 하나씩**만 두고 트랙은 보내는 양만 정한다.
드라이브·필터·코러스는 트랙마다 직렬로 붙는다.

```
트랙 → 드라이브 → 필터 → (원음 + 코러스) → 팬 → 볼륨 ┬→ 마스터
                                                      ├→ 에코 보내기 → 공용 딜레이 → 마스터
                                                      └→ 리버브 보내기 → 공용 리버브 → 마스터
마스터 → 컴프레서 → 전체 볼륨 → 출력
```

## 함정

- **`requestAnimationFrame` 으로 소리나 내보내기를 걸지 않는다.** 화면이 가려진 탭에서는
  rAF 가 아예 안 불린다. 재생 헤드처럼 순수하게 시각적인 것에만 쓴다.
- **타이머로 소리를 내지 않는다.** `setInterval` 은 수십 ms 씩 흔들려 박자가 무너진다.
  타이머는 "앞으로 0.12초 안에 울릴 것"을 오디오 시계에 예약만 하고 빠진다.
- **사파리는 사용자가 화면을 건드리기 전에는 소리를 안 낸다.** AudioContext 는 첫 터치
  뒤에 만들고 `resume()` 한다.
- **공유 시트(`navigator.share`)는 사용자가 누른 그 순간에만 열린다.** 그래서 렌더링을
  먼저 끝내 두고, 저장은 별도의 탭으로 받는다. 렌더링 후에 자동으로 공유를 띄우면 막힌다.
- **일반 스크립트의 top-level `const` 는 `window` 에 안 올라간다.** 모듈 간에 쓸 값은
  `globalThis.X = ...` 로 명시적으로 붙인다.
- **`sw.js` 를 고쳤으면 `CACHE` 버전을 올린다.** 안 올리면 폰이 옛날 파일을 계속 본다.

## 검증

```sh
node test/run.js      # 커밋 전에 돌린다
```

브라우저 콘솔에 에러가 없어야 한다. 소리를 건드렸으면 **OfflineAudioContext 로 렌더해서
피크가 1.0 을 넘지 않는지** 확인한다 — 넘으면 wav 에서 치직거린다.
실제 확인은 아이폰 사파리에서 한다. 서비스 워커는 HTTPS 에서만 등록된다.
