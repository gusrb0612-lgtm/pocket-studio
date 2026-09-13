'use strict';
/* AudioBuffer → .wav 파일 바이트. 브라우저에는 오디오를 파일로 쓰는 기능이 없어서
   RIFF 헤더를 직접 만든다. 16비트 PCM — 아이폰 어느 앱에서나 열린다. */

(function (global) {

  /* 소수 샘플(-1~1)을 16비트 정수로. 범위를 넘으면 잘라낸다(클리핑).
     안 자르면 정수가 한 바퀴 돌아 치직거리는 잡음이 된다. */
  function toInt16(sample) {
    const s = Math.max(-1, Math.min(1, sample));
    return s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  /* channels: Float32Array 배열(모노 1개, 스테레오 2개). 길이는 모두 같아야 한다. */
  function encodeWav(channels, sampleRate) {
    const numChannels = channels.length;
    if (!numChannels) throw new Error('채널이 없다');
    const frames = channels[0].length;
    const bytesPerSample = 2;
    const blockAlign = numChannels * bytesPerSample;
    const dataBytes = frames * blockAlign;
    const buffer = new ArrayBuffer(44 + dataBytes);
    const view = new DataView(buffer);

    let p = 0;
    const str = s => { for (let i = 0; i < s.length; i++) view.setUint8(p++, s.charCodeAt(i)); };
    const u32 = v => { view.setUint32(p, v, true); p += 4; };
    const u16 = v => { view.setUint16(p, v, true); p += 2; };

    str('RIFF');
    u32(36 + dataBytes);   /* 이 뒤로 남은 바이트 수 */
    str('WAVE');
    str('fmt ');
    u32(16);               /* fmt 청크 길이 */
    u16(1);                /* 1 = 무압축 PCM */
    u16(numChannels);
    u32(sampleRate);
    u32(sampleRate * blockAlign);  /* 초당 바이트 */
    u16(blockAlign);
    u16(bytesPerSample * 8);
    str('data');
    u32(dataBytes);

    /* 샘플은 채널을 번갈아 쓴다: L R L R ... */
    for (let i = 0; i < frames; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        view.setInt16(p, toInt16(channels[ch][i]), true);
        p += 2;
      }
    }
    return buffer;
  }

  function fromAudioBuffer(audioBuffer) {
    const channels = [];
    for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
      channels.push(audioBuffer.getChannelData(ch));
    }
    return encodeWav(channels, audioBuffer.sampleRate);
  }

  function toBlob(audioBuffer) {
    return new Blob([fromAudioBuffer(audioBuffer)], { type: 'audio/wav' });
  }

  /* 헤더만 읽어 되돌린다 — 테스트에서 "제대로 된 wav 인가"를 확인하는 용도. */
  function readHeader(arrayBuffer) {
    const view = new DataView(arrayBuffer);
    const tag = o => String.fromCharCode(view.getUint8(o), view.getUint8(o + 1), view.getUint8(o + 2), view.getUint8(o + 3));
    return {
      riff: tag(0),
      wave: tag(8),
      fmt: tag(12),
      format: view.getUint16(20, true),
      channels: view.getUint16(22, true),
      sampleRate: view.getUint32(24, true),
      byteRate: view.getUint32(28, true),
      blockAlign: view.getUint16(32, true),
      bitsPerSample: view.getUint16(34, true),
      data: tag(36),
      dataBytes: view.getUint32(40, true),
      declaredSize: view.getUint32(4, true),
      totalBytes: arrayBuffer.byteLength
    };
  }

  global.Wav = { encodeWav, fromAudioBuffer, toBlob, readHeader, toInt16 };
  if (typeof module !== 'undefined') module.exports = global.Wav;

})(typeof globalThis !== 'undefined' ? globalThis : this);
