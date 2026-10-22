/**
 * @file input-controller.ts
 * @description 2D Among Us 風格鍵盤與滑鼠控制器：支援 8 向流暢移動、角色朝向記憶、互動 [E]、技能 [Space] 與鏡頭縮放切換 [V]
 */

export class InputController {
  private keys: Record<string, boolean> = {};
  public mouseX: number = 0;
  public mouseY: number = 0;

  // 記錄角色最後朝向，放開按鍵後維持朝向不重置
  private lastRotation: number = 0;

  // 鏡頭縮放模式：預設 true 為 Among Us 近景跟隨視角，false 為全村俯瞰視角
  public isCloseupView: boolean = true;

  private onSkillTrigger?: () => void;
  private onInteractTrigger?: () => void;
  private onCameraToggle?: (isCloseup: boolean) => void;

  constructor(canvas: HTMLCanvasElement) {
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
      // 按 [V] 鍵快速切換 Among Us 近景跟隨視角 / 全村俯瞰視角
      if (e.code === 'KeyV' || e.key.toLowerCase() === 'v') {
        this.toggleCameraView();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      if (e.key) {
        this.keys[e.key.toLowerCase()] = false;
      }
    });

    window.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      this.mouseX = e.clientX - rect.left;
      this.mouseY = e.clientY - rect.top;
    });
  }

  public toggleCameraView(forceState?: boolean): boolean {
    this.isCloseupView = forceState !== undefined ? forceState : !this.isCloseupView;
    this.onCameraToggle?.(this.isCloseupView);
    return this.isCloseupView;
  }

  public registerSkillHandler(fn: () => void): void {
    this.onSkillTrigger = fn;
  }

  public registerInteractHandler(fn: () => void): void {
    this.onInteractTrigger = fn;
  }

  public registerCameraToggleHandler(fn: (isCloseup: boolean) => void): void {
    this.onCameraToggle = fn;
  }

  /**
   * 取得當前 2D 移動方向向量與朝向角度 (8 向自由移動並記憶最後朝向)
   */
  public getMovement(_currentX: number, _currentY: number): { dx: number; dy: number; rotation: number } {
    let dx = 0;
    let dy = 0;

    if (this.keys['KeyW'] || this.keys['w'] || this.keys['ArrowUp'] || this.keys['arrowup']) dy -= 1;
    if (this.keys['KeyS'] || this.keys['s'] || this.keys['ArrowDown'] || this.keys['arrowdown']) dy += 1;
    if (this.keys['KeyA'] || this.keys['a'] || this.keys['ArrowLeft'] || this.keys['arrowleft']) dx -= 1;
    if (this.keys['KeyD'] || this.keys['d'] || this.keys['ArrowRight'] || this.keys['arrowright']) dx += 1;

    if (dx !== 0 || dy !== 0) {
      this.lastRotation = Math.atan2(dy, dx);
    }

    return { dx, dy, rotation: this.lastRotation };
  }
}
