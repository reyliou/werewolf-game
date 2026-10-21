/**
 * @file input-controller.ts
 * @description 鍵盤與滑鼠指向控制器：支援第三人稱 8 向移動轉向記憶 + 第一人稱 (FPV) 滑鼠環視與相對方向移動
 */

export class InputController {
  private keys: Record<string, boolean> = {};
  public mouseX: number = 0;
  public mouseY: number = 0;

  // 記錄角色最後朝向，徹底解決放開按鍵後角色朝向被鎖定重置的問題
  private lastRotation: number = Math.PI / 2;

  // 第一人稱視角 (First-Person View) 狀態與視線歐拉角
  public isFirstPerson: boolean = false;
  public fpvYaw: number = Math.PI / 2; // 水平朝向角 (對應 2D 平面 atan2(dy, dx))
  public fpvPitch: number = -0.08;     // 垂直仰俯角 (-1.1 ~ +1.0 rad)
  private isMouseDragging: boolean = false;

  private onSkillTrigger?: () => void;
  private onInteractTrigger?: () => void;
  private onCameraToggle?: (isFirstPerson: boolean) => void;
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    window.addEventListener('keydown', (e) => {
      // 避免在文字輸入框中打字時觸發人物移動
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
        return;
      }

      // 支援實體鍵盤代碼 (code: 免疫微軟注音/拼音等輸入法攔截)
      this.keys[e.code] = true;
      if (e.key) {
        this.keys[e.key.toLowerCase()] = true;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        this.onSkillTrigger?.();
      }
      if (e.code === 'KeyE' || e.key.toLowerCase() === 'e') {
        this.onInteractTrigger?.();
      }
      // 按 [V] 鍵快速切換第一人稱 / 第三人稱俯視視角
      if (e.code === 'KeyV' || e.key.toLowerCase() === 'v') {
        this.toggleFirstPerson();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      if (e.key) {
        this.keys[e.key.toLowerCase()] = false;
      }
    });

    // 點擊畫布時若處於第一人稱模式，自動請求 PointerLock 實現無邊界 360 度滑鼠轉頭
    canvas.addEventListener('mousedown', (e) => {
      this.isMouseDragging = true;
      if (this.isFirstPerson && document.pointerLockElement !== canvas && e.button === 0) {
        canvas.requestPointerLock?.();
      }
    });

    window.addEventListener('mouseup', () => {
      this.isMouseDragging = false;
    });

    // 全視窗平滑追蹤滑鼠視線與第一人稱轉頭
    window.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      this.mouseX = e.clientX - rect.left;
      this.mouseY = e.clientY - rect.top;

      if (this.isFirstPerson) {
        // 支援 PointerLock 或直接滑動滑鼠旋轉第一人稱視角
        if (document.pointerLockElement === canvas || this.isMouseDragging) {
          const sensitivity = 0.0032;
          this.fpvYaw += e.movementX * sensitivity;
          this.fpvPitch = Math.max(-1.05, Math.min(0.95, this.fpvPitch - e.movementY * sensitivity));
          this.lastRotation = this.fpvYaw;
        }
      }
    });
  }

  public toggleFirstPerson(forceState?: boolean): boolean {
    this.isFirstPerson = forceState !== undefined ? forceState : !this.isFirstPerson;
    if (this.isFirstPerson) {
      this.fpvYaw = this.lastRotation;
      this.fpvPitch = -0.05;
    } else if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock?.();
    }
    this.onCameraToggle?.(this.isFirstPerson);
    return this.isFirstPerson;
  }

  public registerSkillHandler(fn: () => void): void {
    this.onSkillTrigger = fn;
  }

  public registerInteractHandler(fn: () => void): void {
    this.onInteractTrigger = fn;
  }

  public registerCameraToggleHandler(fn: (isFirstPerson: boolean) => void): void {
    this.onCameraToggle = fn;
  }

  /**
   * 取得當前方向向量與朝向角度 (支援第三人稱 8 向自由轉身 & 第一人稱前後進退與左右平移)
   */
  public getMovement(_currentX: number, _currentY: number): { dx: number; dy: number; rotation: number } {
    let forward = 0;
    let strafe = 0;

    // 上 / 前進 (W / ArrowUp / KeyW)
    if (this.keys['KeyW'] || this.keys['w'] || this.keys['ArrowUp'] || this.keys['arrowup']) forward += 1;
    // 下 / 後退 (S / ArrowDown / KeyS)
    if (this.keys['KeyS'] || this.keys['s'] || this.keys['ArrowDown'] || this.keys['arrowdown']) forward -= 1;

    // 第一人稱支援 Q / E 或左右方向鍵輔助轉頭
    if (this.isFirstPerson) {
      if (this.keys['KeyQ'] || this.keys['q'] || this.keys['ArrowLeft'] || this.keys['arrowleft']) {
        this.fpvYaw -= 0.04;
      }
      if (this.keys['ArrowRight'] || this.keys['arrowright']) {
        this.fpvYaw += 0.04;
      }
      if (this.keys['KeyA'] || this.keys['a']) strafe -= 1;
      if (this.keys['KeyD'] || this.keys['d']) strafe += 1;

      const forwardX = Math.cos(this.fpvYaw);
      const forwardY = Math.sin(this.fpvYaw);
      const rightX = -Math.sin(this.fpvYaw);
      const rightY = Math.cos(this.fpvYaw);

      const dx = forward * forwardX + strafe * rightX;
      const dy = forward * forwardY + strafe * rightY;
      this.lastRotation = this.fpvYaw;
      return { dx, dy, rotation: this.fpvYaw };
    }

    // 第三人稱俯視模式：WASD 與方向鍵 8 向移動，角色自動轉向移動方向並記憶朝向
    let dx = 0;
    let dy = -forward; // W (forward=1) -> dy = -1 (往北)
    if (this.keys['KeyA'] || this.keys['a'] || this.keys['ArrowLeft'] || this.keys['arrowleft']) dx -= 1;
    if (this.keys['KeyD'] || this.keys['d'] || this.keys['ArrowRight'] || this.keys['arrowright']) dx += 1;

    if (dx !== 0 || dy !== 0) {
      this.lastRotation = Math.atan2(dy, dx);
    }

    return { dx, dy, rotation: this.lastRotation };
  }
}
