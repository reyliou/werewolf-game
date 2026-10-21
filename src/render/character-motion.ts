/**
 * @file character-motion.ts
 * @description 3D 人型骨骼動作系統 (Humanoid Skeletal Locomotion & Action System)
 * 支援 41 骨骼 Rigged GLB 模型的待機呼吸 (Idle)、四肢邁步擺臂 (Walk/Run) 與揮砍採集動作 (Action/Slash)
 */

import * as THREE from 'three';

interface BoneRig {
  bones: Map<string, THREE.Bone>;
  restQuats: Map<string, THREE.Quaternion>;
  walkWeight: number;
  walkPhase: number;
  actionTimer: number; // > 0 時播放右手揮動/採集/攻擊動作
}

const KEY_BONE_NAMES = [
  'Pelvis',
  'Spine_01',
  'Spine_02',
  'Neck_01',
  'Head',
  'Upperarm_L',
  'Lowerarm_L',
  'Upperarm_R',
  'Lowerarm_R',
  'Thigh_L',
  'Calf_L',
  'Foot_L',
  'Thigh_R',
  'Calf_R',
  'Foot_R'
];

export class CharacterMotionSystem {
  private rigs: Map<string, BoneRig> = new Map();
  private readonly tmpEuler = new THREE.Euler();
  private readonly tmpQuat = new THREE.Quaternion();

  /**
   * 綁定單一玩家角色的骨骼樹並快取初始自然站姿 (Rest Pose Quaternions)
   */
  public registerCharacter(playerId: string, rootGroup: THREE.Object3D): void {
    const bones = new Map<string, THREE.Bone>();
    const restQuats = new Map<string, THREE.Quaternion>();

    rootGroup.traverse((node) => {
      if ((node as THREE.Bone).isBone && KEY_BONE_NAMES.includes(node.name)) {
        const bone = node as THREE.Bone;
        bones.set(bone.name, bone);
        restQuats.set(bone.name, bone.quaternion.clone());
      }
      // 防止 SkinnedMesh 在骨骼擺動或第一人稱近距離時被錯誤視錐剔除
      if ((node as THREE.SkinnedMesh).isSkinnedMesh) {
        node.frustumCulled = false;
      }
    });

    this.rigs.set(playerId, {
      bones,
      restQuats,
      walkWeight: 0,
      walkPhase: Math.random() * Math.PI * 2,
      actionTimer: 0
    });
  }

  public unregisterCharacter(playerId: string): void {
    this.rigs.delete(playerId);
  }

  public clearAll(): void {
    this.rigs.clear();
  }

  /**
   * 觸發角色單次手臂揮動動作 (割麥 / 吃肉 / 開鎖 / 攻擊)
   */
  public triggerAction(playerId: string): void {
    const rig = this.rigs.get(playerId);
    if (rig) {
      rig.actionTimer = 0.55;
    }
  }

  /**
   * 每幀更新角色骨骼動畫 (平滑混合 Idle 與 Walk/Run 及單次揮臂動作)
   */
  public updateCharacter(
    playerId: string,
    isMoving: boolean,
    isRunning: boolean,
    deltaSec: number,
    globalTime: number
  ): void {
    const rig = this.rigs.get(playerId);
    if (!rig || rig.bones.size === 0) return;

    // 1. 平滑過渡移動權重 (Idle <-> Walk)
    const targetWeight = isMoving ? 1.0 : 0.0;
    rig.walkWeight = THREE.MathUtils.lerp(rig.walkWeight, targetWeight, Math.min(1, deltaSec * 12));

    // 2. 推進邁步相位
    const speedMultiplier = isRunning ? 15.5 : 11.0;
    if (rig.walkWeight > 0.01) {
      rig.walkPhase += deltaSec * speedMultiplier;
    }

    // 3. 遞減互動/揮刀計時器
    if (rig.actionTimer > 0) {
      rig.actionTimer = Math.max(0, rig.actionTimer - deltaSec);
    }

    const w = rig.walkWeight;
    const p = rig.walkPhase;
    const stride = Math.sin(p);
    const cosStride = Math.cos(p);

    // --- A. 大腿與小腿邁步循環 (Thigh_L/R & Calf_L/R) ---
    const maxThighAngle = isRunning ? 0.72 : 0.54;
    const thighLAngle = stride * maxThighAngle * w;
    const thighRAngle = -stride * maxThighAngle * w;

    // 小腿僅在抬腿向後時自然彎曲膝蓋 (正 X 軸為向後彎曲膝蓋)
    const calfLAngle = Math.max(0, cosStride * 0.65 + 0.2) * w;
    const calfRAngle = Math.max(0, -cosStride * 0.65 + 0.2) * w;

    this.applyLocalRotation(rig, 'Thigh_L', thighLAngle, 0, 0);
    this.applyLocalRotation(rig, 'Thigh_R', thighRAngle, 0, 0);
    this.applyLocalRotation(rig, 'Calf_L', calfLAngle, 0, 0);
    this.applyLocalRotation(rig, 'Calf_R', calfRAngle, 0, 0);

    // --- B. 雙臂擺動與待機呼吸微擺 (Upperarm_L/R & Lowerarm_L/R) ---
    const idleBreath = Math.sin(globalTime * 2.4 + (playerId.charCodeAt(0) || 0)) * 0.04;
    const armSwingL = -stride * (isRunning ? 0.58 : 0.42) * w + idleBreath * (1 - w);
    let armSwingR = stride * (isRunning ? 0.58 : 0.42) * w - idleBreath * (1 - w);

    const elbowL = (-0.18 - Math.max(0, -stride) * 0.35 * w);
    let elbowR = (-0.18 - Math.max(0, stride) * 0.35 * w);

    // 若正在觸發 [E] 割麥/互動或 [Space] 揮擊動作，疊加右手揮砍曲線
    let spineTwistY = stride * 0.08 * w;
    if (rig.actionTimer > 0) {
      const progress = 1.0 - rig.actionTimer / 0.55; // 0 -> 1
      const swingCurve = Math.sin(progress * Math.PI);
      armSwingR = -1.15 * swingCurve + Math.cos(progress * Math.PI * 2) * 0.35;
      elbowR = -0.55 * swingCurve;
      spineTwistY += Math.sin(progress * Math.PI * 2) * 0.28;
    }

    this.applyLocalRotation(rig, 'Upperarm_L', armSwingL, 0, 0);
    this.applyLocalRotation(rig, 'Upperarm_R', armSwingR, 0, 0);
    this.applyLocalRotation(rig, 'Lowerarm_L', elbowL, 0, 0);
    this.applyLocalRotation(rig, 'Lowerarm_R', elbowR, 0, 0);

    // --- C. 軀幹呼吸前傾與頭部環顧 (Spine_01/02 & Head) ---
    const forwardLean = (isRunning ? -0.14 : -0.07) * w + idleBreath * 0.6;
    this.applyLocalRotation(rig, 'Spine_01', forwardLean * 0.5, spineTwistY * 0.5, 0);
    this.applyLocalRotation(rig, 'Spine_02', forwardLean * 0.5, spineTwistY * 0.5, 0);

    const headLookY = Math.sin(globalTime * 1.3 + (playerId.charCodeAt(0) || 0)) * 0.12 * (1 - w);
    this.applyLocalRotation(rig, 'Head', 0, headLookY, 0);
  }

  private applyLocalRotation(rig: BoneRig, boneName: string, rx: number, ry: number, rz: number): void {
    const bone = rig.bones.get(boneName);
    const rest = rig.restQuats.get(boneName);
    if (!bone || !rest) return;

    this.tmpEuler.set(rx, ry, rz, 'XYZ');
    this.tmpQuat.setFromEuler(this.tmpEuler);
    bone.quaternion.copy(rest).multiply(this.tmpQuat);
  }
}
