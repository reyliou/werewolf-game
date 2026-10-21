/**
 * @file input-controller.ts
 * @description 鍵盤與滑鼠指向控制器（輸入標準化、零雜質）
 */

export class InputController {
  private keys: Record<string, boolean> = {};
  public mouseX: number = 0;
  public mouseY: number = 0;
  private onSkillTrigger?: () => void;
  private onInteractTrigger?: () => void;

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
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      if (e.key) {
        this.keys[e.key.toLowerCase()] = false;
      }
    });

    // 全視窗平滑追蹤滑鼠視線
    window.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / (rect.width || 1);
      const scaleY = canvas.height / (rect.height || 1);
      this.mouseX = (e.clientX - rect.left) * scaleX;
      this.mouseY = (e.clientY - rect.top) * scaleY;
    });
  }

  public registerSkillHandler(fn: () => void): void {
    this.onSkillTrigger = fn;
  }

  public registerInteractHandler(fn: () => void): void {
    this.onInteractTrigger = fn;
  }

  /**
   * 取得當前方向向量與朝向角度 (支援 WASD、方向鍵、輸入法中英狀態)
   */
  public getMovement(currentX: number, currentY: number): { dx: number; dy: number; rotation: number } {
    let dx = 0;
    let dy = 0;

    // 上 (W / ArrowUp / KeyW)
    if (this.keys['KeyW'] || this.keys['w'] || this.keys['ArrowUp'] || this.keys['arrowup']) dy -= 1;
    // 下 (S / ArrowDown / KeyS)
    if (this.keys['KeyS'] || this.keys['s'] || this.keys['ArrowDown'] || this.keys['arrowdown']) dy += 1;
    // 左 (A / ArrowLeft / KeyA)
    if (this.keys['KeyA'] || this.keys['a'] || this.keys['ArrowLeft'] || this.keys['arrowleft']) dx -= 1;
    // 右 (D / ArrowRight / KeyD)
    if (this.keys['KeyD'] || this.keys['d'] || this.keys['ArrowRight'] || this.keys['arrowright']) dx += 1;

    let rotation = Math.atan2(this.mouseY - currentY, this.mouseX - currentX);
    if (dx !== 0 || dy !== 0) {
      rotation = Math.atan2(dy, dx);
    }
    return { dx, dy, rotation };
  }
}
