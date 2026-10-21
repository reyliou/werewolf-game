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
      this.keys[e.key.toLowerCase()] = true;
      if (e.code === 'Space') {
        e.preventDefault();
        this.onSkillTrigger?.();
      }
      if (e.key.toLowerCase() === 'e') {
        this.onInteractTrigger?.();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.key.toLowerCase()] = false;
    });

    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
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
   * 取得當前方向向量與朝向角度
   */
  public getMovement(currentX: number, currentY: number): { dx: number; dy: number; rotation: number } {
    let dx = 0;
    let dy = 0;

    if (this.keys['w'] || this.keys['arrowup']) dy -= 1;
    if (this.keys['s'] || this.keys['arrowdown']) dy += 1;
    if (this.keys['a'] || this.keys['arrowleft']) dx -= 1;
    if (this.keys['d'] || this.keys['arrowright']) dx += 1;

    const rotation = Math.atan2(this.mouseY - currentY, this.mouseX - currentX);
    return { dx, dy, rotation };
  }
}
