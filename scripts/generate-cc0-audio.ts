/**
 * @file generate-cc0-audio.ts
 * @description 生成專案專用 CC0 1.0 Universal 授權高取樣率音效檔 (16-bit 44.1kHz PCM WAV)
 */

import * as fs from 'fs';
import * as path from 'path';

function createWavBuffer(sampleRate: number, duration: number, sampleGenerator: (t: number) => number): Buffer {
  const numSamples = Math.floor(sampleRate * duration);
  const blockAlign = 2; // 16-bit mono = 2 bytes
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // fmt subchunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  buffer.writeUInt16LE(1, 20);  // AudioFormat (1 for PCM)
  buffer.writeUInt16LE(1, 22);  // NumChannels (1 = Mono)
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34); // BitsPerSample

  // data subchunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const sample = Math.max(-1, Math.min(1, sampleGenerator(t)));
    const intSample = Math.floor(sample < 0 ? sample * 32768 : sample * 32767);
    buffer.writeInt16LE(intSample, 44 + i * 2);
  }

  return buffer;
}

const outDir = path.resolve('public/assets/audio');
fs.mkdirSync(outDir, { recursive: true });

// 1. 古堡警鐘 (Bell Toll) - 沉重銅鐘泛音與長延音衰減 (2.5 秒)
const bellWav = createWavBuffer(44100, 2.5, (t) => {
  const env = Math.exp(-t * 2.2);
  const f1 = Math.sin(2 * Math.PI * 220 * t);
  const f2 = 0.5 * Math.sin(2 * Math.PI * 440 * t);
  const f3 = 0.25 * Math.sin(2 * Math.PI * 660 * t);
  const f4 = 0.15 * Math.sin(2 * Math.PI * 940 * t);
  return (f1 + f2 + f3 + f4) * env * 0.8;
});
fs.writeFileSync(path.join(outDir, 'bell.wav'), bellWav);

// 2. 石板腳步 (Footstep) - 短促低頻敲擊 (0.12 秒)
const footstepWav = createWavBuffer(44100, 0.12, (t) => {
  const env = Math.exp(-t * 35);
  const noise = (Math.random() * 2 - 1) * 0.4;
  const thud = Math.sin(2 * Math.PI * 90 * (1 - t * 4) * t);
  return (thud + noise) * env * 0.6;
});
fs.writeFileSync(path.join(outDir, 'footstep.wav'), footstepWav);

// 3. 壓抑心跳 (Heartbeat) - 雙重低頻心室收縮 (0.8 秒)
const heartbeatWav = createWavBuffer(44100, 0.8, (t) => {
  // Lub-Dub: 第一聲 t=0~0.25, 第二聲 t=0.28~0.5
  let amp = 0;
  if (t < 0.25) {
    const p = t / 0.25;
    amp = Math.sin(Math.PI * p) * Math.sin(2 * Math.PI * 55 * t);
  } else if (t >= 0.28 && t < 0.55) {
    const p = (t - 0.28) / 0.27;
    amp = Math.sin(Math.PI * p) * Math.sin(2 * Math.PI * 50 * (t - 0.28)) * 0.75;
  }
  return amp * 0.9;
});
fs.writeFileSync(path.join(outDir, 'heartbeat.wav'), heartbeatWav);

// 4. 庇護聖光破碎 (Shield Shatter) - 金屬與晶體破裂 (0.45 秒)
const shieldWav = createWavBuffer(44100, 0.45, (t) => {
  const env = Math.exp(-t * 9);
  const chime = Math.sin(2 * Math.PI * 1320 * t) * 0.5 + Math.sin(2 * Math.PI * 1760 * t) * 0.3;
  const shatter = (Math.random() * 2 - 1) * 0.5;
  return (chime + shatter) * env * 0.7;
});
fs.writeFileSync(path.join(outDir, 'shield.wav'), shieldWav);

// 5. 幽影暗殺背刺 (Kill / Strike) - 低頻衝擊與金屬割裂 (0.5 秒)
const killWav = createWavBuffer(44100, 0.5, (t) => {
  const env = Math.exp(-t * 8);
  const slash = (Math.random() * 2 - 1) * 0.7 * Math.exp(-t * 15);
  const impact = Math.sin(2 * Math.PI * 75 * t) * 0.6;
  return (slash + impact) * env * 0.85;
});
fs.writeFileSync(path.join(outDir, 'kill.wav'), killWav);

console.log('✅ 5 份 CC0 16-bit 44.1kHz 音效已成功生成至 public/assets/audio/');
