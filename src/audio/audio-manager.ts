/**
 * @file audio-manager.ts
 * @description 音訊管理器（CC0 高音質緩衝加載 + 原生 Web Audio 震盪器備援）
 */

export class AudioManager {
  private ctx: AudioContext | null = null;
  private audioBuffers: Map<string, AudioBuffer> = new Map();
  private isMuted: boolean = false;
  private lastFootstepTime: number = 0;
  private heartbeatSource: AudioBufferSourceNode | null = null;
  private isHeartbeatPlaying: boolean = false;

  constructor() {
    // 延遲初始化 AudioContext 直到使用者首次觸發點擊或按鍵
  }

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  public async preloadAll(): Promise<void> {
    const soundFiles: Record<string, string> = {
      bell: '/assets/audio/bell.ogg',
      night: '/assets/audio/night.ogg',
      campfire: '/assets/audio/campfire.ogg',
      heartbeat: '/assets/audio/heartbeat.ogg',
      footstep: '/assets/audio/footstep.wav',
      door: '/assets/audio/door.wav',
      shield: '/assets/audio/shield.wav',
      wolf: '/assets/audio/wolf.ogg',
      kill: '/assets/audio/kill.ogg'
    };
    const ctx = this.ensureContext();

    for (const [key, url] of Object.entries(soundFiles)) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const arrayBuffer = await res.arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        this.audioBuffers.set(key, audioBuffer);
      } catch (err) {
        console.warn(`[AudioManager] 無法預載 ${url}:`, err);
      }
    }
    console.log(`[AudioManager] 網路真實開源音效預加載完成 (${this.audioBuffers.size} 項已快取)`);
  }

  private playBuffer(name: string, volume: number = 1.0): void {
    if (this.isMuted) return;
    const ctx = this.ensureContext();
    const buffer = this.audioBuffers.get(name);

    if (buffer) {
      const source = ctx.createBufferSource();
      const gainNode = ctx.createGain();
      source.buffer = buffer;
      gainNode.gain.value = volume;
      source.connect(gainNode);
      gainNode.connect(ctx.destination);
      source.start();
    } else {
      // 備援：即時合成震盪音
      this.playSynthesizedFallback(name, volume);
    }
  }

  private playSynthesizedFallback(name: string, volume: number): void {
    const ctx = this.ensureContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;

    if (name === 'bell') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220, now);
      gain.gain.setValueAtTime(volume * 0.8, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 2.0);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 2.0);
    } else if (name === 'footstep') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(90, now);
      gain.gain.setValueAtTime(volume * 0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.1);
    }
  }

  public playFootstep(): void {
    const now = performance.now();
    if (now - this.lastFootstepTime > 320) {
      this.lastFootstepTime = now;
      this.playBuffer('footstep', 0.25);
    }
  }

  public playBell(): void {
    this.playBuffer('bell', 0.75);
  }

  public playDoor(): void {
    this.playBuffer('door', 0.85);
  }

  public playWolfGrowl(): void {
    this.playBuffer('wolf', 0.9);
  }

  public playShieldShatter(): void {
    this.playBuffer('shield', 0.8);
  }

  public playKillStrike(): void {
    this.playBuffer('kill', 0.95);
  }

  public setHeartbeatActive(active: boolean): void {
    if (active === this.isHeartbeatPlaying) return;
    const ctx = this.ensureContext();

    if (active) {
      const buffer = this.audioBuffers.get('heartbeat');
      if (buffer) {
        const source = ctx.createBufferSource();
        const gainNode = ctx.createGain();
        source.buffer = buffer;
        source.loop = true;
        gainNode.gain.value = 0.7;
        source.connect(gainNode);
        gainNode.connect(ctx.destination);
        source.start();
        this.heartbeatSource = source;
        this.isHeartbeatPlaying = true;
      }
    } else {
      if (this.heartbeatSource) {
        try {
          this.heartbeatSource.stop();
          this.heartbeatSource.disconnect();
        } catch {
          // ignore
        }
        this.heartbeatSource = null;
      }
      this.isHeartbeatPlaying = false;
    }
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.isMuted && this.heartbeatSource) {
      this.setHeartbeatActive(false);
    }
    return this.isMuted;
  }
}

export const soundManager = new AudioManager();
