/**
 * @file village-renderer.ts
 * @description Among Us 風格 2D 俯視狼人村莊場景渲染器：結合網路開源精靈圖集 (Wesnoth Sprites) 與可走入式室內透視小屋
 */

import { Cottage, VillageMap, WheatPatch } from '../core/map-data';
import { GamePhase, PlayerState } from '../core/types';
import { spriteAtlas } from './sprite-atlas';

export class VillageRenderer {
  private elapsedTime: number = 0;
  private groundCache: HTMLCanvasElement | null = null;
  private groundCacheBuiltWithSprites: number = -1;

  // 各間木屋對應的網路建築外觀精靈與專屬室內配置
  private readonly cottageThemes = [
    {
      houseSprite: 'house_human1',
      rugColor: '#b45309',
      bedColor: '#d97706',
      props: ['wheat_sheaf', 'barrel', 'chest']
    },
    {
      houseSprite: 'house_elven',
      rugColor: '#1d4ed8',
      bedColor: '#2563eb',
      props: ['potion_blue', 'potion_red', 'book1']
    },
    {
      houseSprite: 'house_cabin1',
      rugColor: '#78350f',
      bedColor: '#92400e',
      props: ['archery_target', 'box', 'barrel']
    },
    {
      houseSprite: 'house_human2',
      rugColor: '#6b21a8',
      bedColor: '#7e22ce',
      props: ['crystal_ball', 'book2', 'altar']
    },
    {
      houseSprite: 'house_cabin2',
      rugColor: '#15803d',
      bedColor: '#166534',
      props: ['anvil', 'torch', 'chest']
    },
    {
      houseSprite: 'house_human3',
      rugColor: '#991b1b',
      bedColor: '#b91c1c',
      props: ['chest_open', 'potion_green', 'book1']
    }
  ];

  /**
   * 第一階段渲染 (在繪製角色之前)：地面、道路、農田、肉架、營火廣場與木屋室內家具地板
   */
  public renderEnvironment(
    ctx: CanvasRenderingContext2D,
    map: VillageMap,
    localPlayer: PlayerState,
    _phase: GamePhase,
    deltaSec: number
  ): void {
    this.elapsedTime += deltaSec;

    // 1. 繪製靜態地形快取層 (草地磚、碎石道路、廣場地磚、外圍柵欄與地標基底)
    this.renderStaticGround(ctx, map);

    // 2. 西側農莊：風車穀倉、稻草人、草捆與隨風搖曳的小麥田
    this.renderWheatFields(ctx, map.wheatPatches);

    // 3. 北側預言家觀星聖殿與魔法陣
    this.renderNorthSanctuary(ctx);

    // 4. 東側狼人屠宰場與鮮肉掛架
    this.renderMeatRacks(ctx, map);

    // 5. 中央營火廣場、8 幀動態烈焰、石井與 6 個會議木樁座
    this.renderBonfirePlaza(ctx, map.bonfire.x, map.bonfire.y, map.bonfire.radius);

    // 6. 6 間村民木屋的【室內地板、地毯、家具、壁爐火焰與厚牆】
    this.renderCottageInteriors(ctx, map.cottages, localPlayer);
  }

  /**
   * 第二階段渲染 (在繪製角色之後)：木屋屋頂遮罩 (Among Us 進屋自動透視)、樹冠與日夜氛圍光
   */
  public renderForegroundAndAtmosphere(
    ctx: CanvasRenderingContext2D,
    map: VillageMap,
    localPlayer: PlayerState,
    phase: GamePhase
  ): void {
    // 1. 若玩家不在屋內，蓋上木屋屋頂與網路房屋精靈；若在屋內則半透明褪去屋頂並暗化屋外環境
    this.renderCottageRoofs(ctx, map.cottages, localPlayer);

    // 2. 森林樹冠與高聳松木前景
    this.renderPerimeterTrees(ctx);

    // 3. 日夜四時段全域環境光濾鏡
    this.renderPhaseAtmosphere(ctx, map.width, map.height, phase);
  }

  /**
   * 建立並繪製靜態高解析度地面快取 (當網路精靈載入進度更新時自動重繪)
   */
  private renderStaticGround(ctx: CanvasRenderingContext2D, map: VillageMap): void {
    if (
      !this.groundCache ||
      (this.groundCacheBuiltWithSprites < spriteAtlas.loadedCount &&
        (spriteAtlas.loadedCount === spriteAtlas.totalCount ||
          spriteAtlas.loadedCount - this.groundCacheBuiltWithSprites >= 10))
    ) {
      this.buildGroundCache(map);
    }

    if (this.groundCache) {
      ctx.drawImage(this.groundCache, 0, 0);
    }
  }

  private buildGroundCache(map: VillageMap): void {
    if (!this.groundCache) {
      this.groundCache = document.createElement('canvas');
      this.groundCache.width = map.width;
      this.groundCache.height = map.height;
    }
    const gctx = this.groundCache.getContext('2d');
    if (!gctx) return;

    this.groundCacheBuiltWithSprites = spriteAtlas.loadedCount;

    // 1. 基底草地鋪磚 (使用 grass1 / grass2 / grass3 網路精靈交錯鋪設)
    gctx.fillStyle = '#243b1c';
    gctx.fillRect(0, 0, map.width, map.height);

    const grassPat = spriteAtlas.getPattern(gctx, 'grass1');
    if (grassPat) {
      gctx.fillStyle = grassPat;
      gctx.fillRect(0, 0, map.width, map.height);
    }

    // 交錯疊加 grass2 與 grass3 增添自然草地層次
    const grass2 = spriteAtlas.get('grass2');
    const grass3 = spriteAtlas.get('grass3');
    if (grass2 || grass3) {
      for (let gx = 0; gx < map.width; gx += 72) {
        for (let gy = 0; gy < map.height; gy += 72) {
          const hash = (gx * 31 + gy * 17) % 7;
          if (hash === 0 && grass2) {
            gctx.globalAlpha = 0.65;
            gctx.drawImage(grass2, gx, gy, 72, 72);
          } else if (hash === 1 && grass3) {
            gctx.globalAlpha = 0.55;
            gctx.drawImage(grass3, gx, gy, 72, 72);
          }
        }
      }
      gctx.globalAlpha = 1;
    }

    // 2. 村莊道路網 (使用 dirt 與 stone_path 材質)
    const roadPaths: Array<[number, number, number, number, number]> = [
      // 東西橫貫主幹道 (連接西側農莊 -> 中央火堆 -> 東側肉架)
      [140, 500, 1240, 500, 46],
      // 南北主幹道
      [700, 195, 700, 805, 44],
      // 通往北排 1, 2, 3 號木屋門口的石板小徑
      [270, 500, 270, 195, 34],
      [1130, 500, 1130, 195, 34],
      // 通往南排 4, 5, 6 號木屋門口的石板小徑
      [270, 500, 270, 805, 34],
      [1130, 500, 1130, 805, 34],
      // 北側橫向聯絡道 & 南側橫向聯絡道
      [270, 255, 1130, 255, 28],
      [270, 745, 1130, 745, 28],
      // 通往北側觀星瞭望塔的小徑
      [536, 255, 536, 100, 26]
    ];

    // 泥土路緣外框
    gctx.lineCap = 'round';
    gctx.lineJoin = 'round';
    for (const [x1, y1, x2, y2, w] of roadPaths) {
      gctx.strokeStyle = '#3b2b1d';
      gctx.lineWidth = w + 8;
      gctx.beginPath();
      gctx.moveTo(x1, y1);
      gctx.lineTo(x2, y2);
      gctx.stroke();
    }

    // 道路主體紋理
    const roadPat = spriteAtlas.getPattern(gctx, 'road') || spriteAtlas.getPattern(gctx, 'dirt');
    for (const [x1, y1, x2, y2, w] of roadPaths) {
      gctx.strokeStyle = roadPat || '#6b533b';
      gctx.lineWidth = w;
      gctx.beginPath();
      gctx.moveTo(x1, y1);
      gctx.lineTo(x2, y2);
      gctx.stroke();
    }

    // 石板路心紋理
    const stonePathPat = spriteAtlas.getPattern(gctx, 'stone_path');
    if (stonePathPat) {
      for (const [x1, y1, x2, y2, w] of roadPaths) {
        gctx.strokeStyle = stonePathPat;
        gctx.lineWidth = w * 0.55;
        gctx.beginPath();
        gctx.moveTo(x1, y1);
        gctx.lineTo(x2, y2);
        gctx.stroke();
      }
    }

    // 3. 中央火堆圓形石板大廣場基底
    const stoneFloorPat = spriteAtlas.getPattern(gctx, 'stone_floor');
    gctx.save();
    gctx.beginPath();
    gctx.arc(map.bonfire.x, map.bonfire.y, 118, 0, Math.PI * 2);
    gctx.fillStyle = stoneFloorPat || '#475569';
    gctx.fill();
    gctx.lineWidth = 5;
    gctx.strokeStyle = '#334155';
    gctx.stroke();
    gctx.restore();

    // 4. 點綴野花、蘑菇與岩石精靈 (Scenery & Terrain Details)
    const decorItems: Array<{ key: string; x: number; y: number; size: number }> = [
      { key: 'flowers1', x: 420, y: 170, size: 48 },
      { key: 'flowers2', x: 860, y: 175, size: 48 },
      { key: 'flowers1', x: 430, y: 830, size: 48 },
      { key: 'flowers2', x: 870, y: 825, size: 48 },
      { key: 'flowers1', x: 470, y: 410, size: 44 },
      { key: 'flowers2', x: 920, y: 590, size: 44 },
      { key: 'mushrooms', x: 1020, y: 310, size: 42 },
      { key: 'mushrooms', x: 1040, y: 690, size: 42 },
      { key: 'mushrooms', x: 145, y: 235, size: 42 },
      { key: 'rock1', x: 480, y: 115, size: 48 },
      { key: 'rock2', x: 950, y: 130, size: 48 },
      { key: 'rock1', x: 460, y: 890, size: 48 },
      { key: 'rock2', x: 970, y: 880, size: 48 },
      { key: 'rock_cairn', x: 375, y: 455, size: 52 },
      { key: 'signpost', x: 585, y: 450, size: 54 },
      { key: 'well', x: 815, y: 440, size: 62 }
    ];

    for (const d of decorItems) {
      spriteAtlas.drawCentered(gctx, d.key, d.x, d.y, d.size, d.size);
    }

    // 5. 村莊外圍邊界木製圍欄
    gctx.fillStyle = '#4a2c11';
    gctx.strokeStyle = '#291707';
    gctx.lineWidth = 2;
    // 上下邊界圍欄與木樁
    gctx.fillRect(0, 0, map.width, 16);
    gctx.fillRect(0, map.height - 16, map.width, 16);
    gctx.fillRect(0, 0, 16, map.height);
    gctx.fillRect(map.width - 16, 0, 16, map.height);

    for (let fx = 16; fx < map.width; fx += 36) {
      gctx.fillStyle = '#78350f';
      gctx.fillRect(fx - 4, 2, 8, 14);
      gctx.fillRect(fx - 4, map.height - 16, 8, 14);
    }
    for (let fy = 16; fy < map.height; fy += 36) {
      gctx.fillStyle = '#78350f';
      gctx.fillRect(2, fy - 4, 14, 8);
      gctx.fillRect(map.width - 16, fy - 4, 14, 8);
    }
  }

  /**
   * 繪製西側農莊：風車大穀倉、稻草人、草捆與金黃小麥田
   */
  private renderWheatFields(ctx: CanvasRenderingContext2D, patches: WheatPatch[]): void {
    const sway = Math.sin(this.elapsedTime * 2.8) * 3.5;
    const dirtDarkPat = spriteAtlas.getPattern(ctx, 'dirt_dark');
    const cropPat = spriteAtlas.getPattern(ctx, 'farm_crop');

    for (const patch of patches) {
      const { x, y, width, height } = patch.rect;

      // 1. 農田深褐沃土與木造田埂邊框
      ctx.save();
      ctx.fillStyle = dirtDarkPat || '#3b2514';
      ctx.fillRect(x, y, width, height);

      if (cropPat) {
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = cropPat;
        ctx.fillRect(x + 4, y + 4, width - 8, height - 8);
        ctx.globalAlpha = 1;
      }

      // 犁溝橫紋
      ctx.strokeStyle = 'rgba(28, 16, 8, 0.55)';
      ctx.lineWidth = 3;
      for (let ry = y + 18; ry < y + height - 8; ry += 26) {
        ctx.beginPath();
        ctx.moveTo(x + 8, ry);
        ctx.lineTo(x + width - 8, ry);
        ctx.stroke();
      }

      ctx.strokeStyle = '#654321';
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, width, height);

      // 2. 依據剩餘小麥數量繪製 wheat_sheaf 網路精靈
      const cols = 5;
      const rows = 2;
      const stepX = (width - 24) / cols;
      const stepY = (height - 16) / rows;
      let drawnCount = 0;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const wx = x + 12 + c * stepX + stepX / 2;
          const wy = y + 8 + r * stepY + stepY / 2;
          const hasWheat = drawnCount < patch.currentWheat;
          drawnCount++;

          if (hasWheat) {
            const ok = spriteAtlas.drawCentered(
              ctx,
              'wheat_sheaf',
              wx + sway * 0.6,
              wy,
              42,
              42,
              (r + c) % 2 === 0,
              sway * 0.02
            );
            if (!ok) {
              ctx.fillStyle = '#eab308';
              ctx.beginPath();
              ctx.arc(wx + sway, wy, 8, 0, Math.PI * 2);
              ctx.fill();
            }
          } else {
            // 已收割的麥茬
            ctx.fillStyle = 'rgba(133, 77, 14, 0.55)';
            ctx.beginPath();
            ctx.ellipse(wx, wy + 6, 9, 4, 0, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // 農田互動浮動標籤
      this.drawWorldBadge(
        ctx,
        `🌾 金黃麥田 (${patch.currentWheat}/${patch.maxWheat})`,
        x + width / 2,
        y + 14,
        patch.currentWheat > 0 ? '#fef08a' : '#94a3b8',
        'rgba(28, 25, 23, 0.82)'
      );
      ctx.restore();
    }

    // 3. 西側農莊大穀倉 / 風車磨坊 (對應碰撞箱 x: 24, y: 428, w: 112, h: 108)
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(80, 522, 54, 22, 0, 0, Math.PI * 2);
    ctx.fill();

    if (!spriteAtlas.drawCentered(ctx, 'windmill', 80, 476, 126, 126)) {
      ctx.fillStyle = '#7c2d12';
      ctx.fillRect(24, 428, 112, 108);
    }
    this.drawWorldBadge(ctx, '🏚️ 農莊風車穀倉', 80, 412, '#fed7aa', 'rgba(67, 20, 7, 0.85)');

    // 農田旁的稻草人與乾草捆精靈
    spriteAtlas.drawCentered(ctx, 'scarecrow', 330, 360, 58, 58);
    spriteAtlas.drawCentered(ctx, 'straw_bale1', 55, 275, 48, 48);
    spriteAtlas.drawCentered(ctx, 'straw_bale2', 105, 272, 48, 48);
    spriteAtlas.drawCentered(ctx, 'straw_bale1', 62, 735, 48, 48);
    spriteAtlas.drawCentered(ctx, 'barrel', 112, 735, 42, 42);
    ctx.restore();
  }

  /**
   * 繪製北側預言家觀星瞭望塔與神秘符文陣 (對應碰撞箱 x: 518, y: 64, w: 36, h: 36)
   */
  private renderNorthSanctuary(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    // 神秘發光魔法陣
    const pulse = 0.75 + Math.sin(this.elapsedTime * 3) * 0.2;
    ctx.globalAlpha = pulse;
    spriteAtlas.drawCentered(ctx, 'magic_circle', 536, 98, 110, 88);
    ctx.globalAlpha = 1;

    // 兩側古老符文石碑
    spriteAtlas.drawCentered(ctx, 'monolith1', 482, 92, 56, 56);
    spriteAtlas.drawCentered(ctx, 'monolith2', 590, 92, 56, 56);

    // 觀星聖殿塔樓本體
    if (!spriteAtlas.drawCentered(ctx, 'temple', 536, 78, 92, 92)) {
      ctx.fillStyle = '#475569';
      ctx.fillRect(518, 64, 36, 36);
    }
    spriteAtlas.drawCentered(ctx, 'crystal_ball', 536, 122, 34, 34);
    this.drawWorldBadge(ctx, '🔮 觀星聖殿塔', 536, 32, '#e9d5ff', 'rgba(59, 7, 100, 0.85)');
    ctx.restore();
  }

  /**
   * 繪製東側狼人屠宰場、邪惡祭壇與鮮肉掛架
   */
  private renderMeatRacks(ctx: CanvasRenderingContext2D, map: VillageMap): void {
    const dirtDarkPat = spriteAtlas.getPattern(ctx, 'dirt_dark');

    for (let idx = 0; idx < map.meatRacks.length; idx++) {
      const rack = map.meatRacks[idx];
      const { x, y, width, height } = rack.rect;

      ctx.save();
      // 陰森暗色凍土基底
      ctx.fillStyle = dirtDarkPat || '#271912';
      ctx.fillRect(x, y, width, height);
      ctx.fillStyle = 'rgba(69, 10, 10, 0.28)';
      ctx.fillRect(x, y, width, height);

      ctx.strokeStyle = '#451a03';
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, width, height);

      // 屠宰營帳與骸骨裝飾精靈
      if (idx === 0) {
        spriteAtlas.drawCentered(ctx, 'tent_weapons', x + width - 48, y + 48, 78, 78);
        spriteAtlas.drawCentered(ctx, 'bones', x + 36, y + height - 26, 44, 44);
        spriteAtlas.drawCentered(ctx, 'barrel', x + width - 32, y + height - 28, 42, 42);
      } else {
        spriteAtlas.drawCentered(ctx, 'altar_evil', x + width - 48, y + 54, 72, 72);
        spriteAtlas.drawCentered(ctx, 'bonestack', x + 38, y + height - 30, 50, 50);
      }

      // 雙柱木造掛肉橫樑
      const beamX = x + 18;
      const beamY = y + 36;
      const beamW = width - 92;

      // 左右木柱陰影與立柱
      ctx.fillStyle = '#291509';
      ctx.fillRect(beamX, beamY - 4, 8, 52);
      ctx.fillRect(beamX + beamW - 8, beamY - 4, 8, 52);

      // 橫樑與鐵鉤
      ctx.fillStyle = '#5c2d0c';
      ctx.fillRect(beamX - 4, beamY, beamW + 8, 8);

      // 懸掛之生鮮帶骨肉塊
      const meats = Math.min(8, rack.meatAvailable);
      for (let i = 0; i < meats; i++) {
        const mx = beamX + 16 + i * ((beamW - 28) / Math.max(1, meats - 1 || 1));
        const my = beamY + 8;

        // 鐵鉤
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(mx, my);
        ctx.lineTo(mx, my + 7);
        ctx.stroke();

        // 白色腿骨
        ctx.fillStyle = '#f1f5f9';
        ctx.fillRect(mx - 2, my + 6, 4, 24);

        // 鮮紅帶油花肉塊
        ctx.fillStyle = '#991b1b';
        ctx.beginPath();
        ctx.ellipse(mx, my + 19, 8, 12, 0.08, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fecaca';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }

      this.drawWorldBadge(
        ctx,
        `🥩 狩獵鮮肉架 (${rack.meatAvailable}塊)`,
        x + width / 2,
        y + 14,
        '#fca5a5',
        'rgba(69, 10, 10, 0.88)'
      );
      ctx.restore();
    }
  }

  /**
   * 繪製中央火堆廣場：石圈、8 幀動態火焰精靈、火盆與 6 張會議木樁椅
   */
  private renderBonfirePlaza(ctx: CanvasRenderingContext2D, bx: number, by: number, radius: number): void {
    ctx.save();

    // 1. 營火外圍動態溫暖橘紅光暈
    const flicker = Math.sin(this.elapsedTime * 9) * 5;
    const glowRadius = radius * 2.6 + flicker;
    const fireGlow = ctx.createRadialGradient(bx, by, 8, bx, by, glowRadius);
    fireGlow.addColorStop(0, 'rgba(251, 146, 60, 0.65)');
    fireGlow.addColorStop(0.45, 'rgba(239, 68, 68, 0.28)');
    fireGlow.addColorStop(1, 'rgba(239, 68, 68, 0)');
    ctx.fillStyle = fireGlow;
    ctx.beginPath();
    ctx.arc(bx, by, glowRadius, 0, Math.PI * 2);
    ctx.fill();

    // 2. 圓形石砌火坑基座
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(bx, by, radius * 0.78, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 石塊環繞細節
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI * 2) / 12;
      const sx = bx + Math.cos(a) * (radius * 0.76);
      const sy = by + Math.sin(a) * (radius * 0.76);
      ctx.fillStyle = i % 2 === 0 ? '#64748b' : '#475569';
      ctx.beginPath();
      ctx.arc(sx, sy, 7, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. 8 幀網路開源營火動畫精靈 (fire1 ~ fire8)
    const frameIndex = (Math.floor(this.elapsedTime * 10) % 8) + 1;
    const drawnFire = spriteAtlas.drawCentered(ctx, `fire${frameIndex}`, bx, by - 8, 76, 76);
    if (!drawnFire) {
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.arc(bx, by, 22, 0, Math.PI * 2);
      ctx.fill();
    }

    // 4. 圍坐原木樁座 (6 名村民早晨投票座位)
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI * 2) / 6;
      const seatDist = radius + 34;
      const sx = bx + Math.cos(angle) * seatDist;
      const sy = by + Math.sin(angle) * seatDist;

      // 陰影
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.beginPath();
      ctx.ellipse(sx, sy + 5, 14, 9, 0, 0, Math.PI * 2);
      ctx.fill();

      // 原木樹皮外圈
      ctx.fillStyle = '#5c2d0c';
      ctx.beginPath();
      ctx.arc(sx, sy, 13, 0, Math.PI * 2);
      ctx.fill();

      // 原木切面與年輪
      ctx.fillStyle = '#d97706';
      ctx.beginPath();
      ctx.arc(sx, sy - 2, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#92400e';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(sx, sy - 2, 5, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 廣場四周石火盆精靈 (brazier1 / brazier2)
    const brazierKey = Math.floor(this.elapsedTime * 6) % 2 === 0 ? 'brazier1' : 'brazier2';
    spriteAtlas.drawCentered(ctx, brazierKey, bx - 95, by - 95, 48, 48);
    spriteAtlas.drawCentered(ctx, brazierKey, bx + 95, by - 95, 48, 48);
    spriteAtlas.drawCentered(ctx, brazierKey, bx - 95, by + 95, 48, 48);
    spriteAtlas.drawCentered(ctx, brazierKey, bx + 95, by + 95, 48, 48);

    this.drawWorldBadge(ctx, '🔥 中央營火審判廣場', bx, by + radius + 58, '#fdba74', 'rgba(30, 41, 59, 0.85)');
    ctx.restore();
  }

  /**
   * 繪製 6 間村民木屋的【室內結構、木地板、地毯、床鋪、石砌壁爐、專屬精靈道具與厚牆】
   * 完全對齊 map-data.ts 中的 createCottageCollisionBoxes 碰撞箱座標！
   */
  private renderCottageInteriors(
    ctx: CanvasRenderingContext2D,
    cottages: Cottage[],
    _localPlayer: PlayerState
  ): void {
    const woodFloorPat = spriteAtlas.getPattern(ctx, 'wood_floor') || spriteAtlas.getPattern(ctx, 'wood_tan');
    const fireFrame = (Math.floor(this.elapsedTime * 9) % 8) + 1;

    for (let i = 0; i < cottages.length; i++) {
      const cottage = cottages[i];
      const { x, y, width, height } = cottage.rect;
      const isNorthRow = y < 500; // 北排木屋大門朝南，南排木屋大門朝北
      const theme = this.cottageThemes[i % this.cottageThemes.length];

      ctx.save();

      // 0. 建築外部落地陰影
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.fillRect(x - 4, y + 6, width + 8, height + 6);

      // 1. 室內溫潤木板地磚基底
      ctx.fillStyle = woodFloorPat || '#5c3a21';
      ctx.fillRect(x + 8, y + 8, width - 16, height - 16);

      // 木地板拼接線條
      ctx.strokeStyle = 'rgba(42, 24, 12, 0.45)';
      ctx.lineWidth = 1;
      for (let py = y + 20; py < y + height - 10; py += 14) {
        ctx.beginPath();
        ctx.moveTo(x + 10, py);
        ctx.lineTo(x + width - 10, py);
        ctx.stroke();
      }

      // 2. 中央編織迎賓地毯 (保留 56px 寬敞中央走道不擋路)
      const rugX = x + 46;
      const rugY = isNorthRow ? y + 34 : y + 26;
      const rugW = 48;
      const rugH = 60;
      ctx.fillStyle = theme.rugColor;
      ctx.fillRect(rugX, rugY, rugW, rugH);
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 2;
      ctx.strokeRect(rugX + 3, rugY + 3, rugW - 6, rugH - 6);

      // 3. 繪製室內三大核心家具 (座標嚴格對應 createCottageCollisionBoxes)
      const bedY = isNorthRow ? y + 12 : y + height - 38;
      const hearthY = isNorthRow ? y + 10 : y + height - 26;
      const tableY = isNorthRow ? y + 12 : y + height - 36;

      // (A) 左側角落：溫馨實木單人床 ({ x: x + 12, width: 34, height: 26 })
      ctx.fillStyle = '#3b2314';
      ctx.fillRect(x + 12, bedY, 34, 26);
      ctx.fillStyle = theme.bedColor;
      ctx.fillRect(x + 14, bedY + 2, 30, 22);
      // 潔白枕頭
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(x + 16, isNorthRow ? bedY + 3 : bedY + 15, 12, 8);
      // 摺疊棉被紋
      ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.fillRect(x + 28, bedY + 3, 14, 20);

      // (B) 後牆中央：石砌壁爐與動態爐火 ({ x: x + 56, width: 28, height: 16 })
      ctx.fillStyle = '#475569';
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 2;
      ctx.fillRect(x + 56, hearthY, 28, 16);
      ctx.strokeRect(x + 56, hearthY, 28, 16);
      // 壁爐溫暖火光
      const hearthGlow = ctx.createRadialGradient(x + 70, hearthY + 8, 2, x + 70, hearthY + 8, 46);
      hearthGlow.addColorStop(0, 'rgba(251, 146, 60, 0.55)');
      hearthGlow.addColorStop(1, 'rgba(251, 146, 60, 0)');
      ctx.fillStyle = hearthGlow;
      ctx.beginPath();
      ctx.arc(x + 70, hearthY + 8, 46, 0, Math.PI * 2);
      ctx.fill();
      spriteAtlas.drawCentered(ctx, `fire${fireFrame}`, x + 70, hearthY + 8, 26, 26);

      // (C) 右側角落：橡木工作桌與職業專屬精靈道具 ({ x: x + 94, width: 34, height: 24 })
      ctx.fillStyle = '#78350f';
      ctx.strokeStyle = '#451a03';
      ctx.lineWidth = 2;
      ctx.fillRect(x + 94, tableY, 34, 24);
      ctx.strokeRect(x + 94, tableY, 34, 24);

      // 桌上與桌旁擺放網路精靈道具 (藥水、水晶球、古籍、寶箱、木桶等)
      spriteAtlas.drawCentered(ctx, theme.props[0], x + 104, tableY + 12, 24, 24);
      spriteAtlas.drawCentered(ctx, theme.props[1], x + 120, tableY + 12, 22, 22);
      spriteAtlas.drawCentered(
        ctx,
        theme.props[2],
        x + 118,
        isNorthRow ? y + 52 : y + height - 52,
        28,
        28
      );

      // 門口牆邊火把精靈
      const torchY = isNorthRow ? y + height - 18 : y + 18;
      spriteAtlas.drawCentered(ctx, 'torch', x + 28, torchY, 24, 24);
      spriteAtlas.drawCentered(ctx, 'torch', x + width - 28, torchY, 24, 24);

      // 4. 繪製 Among Us 風格厚實立體切面牆體 (留出 56px 寬敞大門通道)
      const wallThick = 10;
      const sideWallW = 42;
      ctx.fillStyle = '#3b2314';
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 1.5;

      if (isNorthRow) {
        // 北後牆、西牆、東牆、南左牆、南右牆
        this.drawWallBlock(ctx, x, y, width, wallThick);
        this.drawWallBlock(ctx, x, y, wallThick, height);
        this.drawWallBlock(ctx, x + width - wallThick, y, wallThick, height);
        this.drawWallBlock(ctx, x, y + height - wallThick, sideWallW, wallThick);
        this.drawWallBlock(ctx, x + width - sideWallW, y + height - wallThick, sideWallW, wallThick);
      } else {
        // 南後牆、西牆、東牆、北左牆、北右牆
        this.drawWallBlock(ctx, x, y + height - wallThick, width, wallThick);
        this.drawWallBlock(ctx, x, y, wallThick, height);
        this.drawWallBlock(ctx, x + width - wallThick, y, wallThick, height);
        this.drawWallBlock(ctx, x, y, sideWallW, wallThick);
        this.drawWallBlock(ctx, x + width - sideWallW, y, sideWallW, wallThick);
      }

      // 5. 大門踏墊與可開關門扇 (上鎖時門扇緊閉加掛鐵鎖，敞開時門扇側推)
      const doorX = x + sideWallW;
      const doorY = isNorthRow ? y + height - wallThick : y;
      const doorW = 56;

      // 門檻踏墊
      ctx.fillStyle = '#78350f';
      ctx.fillRect(doorX, doorY - 2, doorW, wallThick + 4);

      if (cottage.isLocked) {
        // 緊閉上鎖的強化鐵箍木門
        ctx.fillStyle = '#451a03';
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2.5;
        ctx.fillRect(doorX, doorY, doorW, wallThick);
        ctx.strokeRect(doorX, doorY, doorW, wallThick);
        // 鐵鎖橫栓
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(doorX + 10, doorY + 2, doorW - 20, 6);
      } else {
        // 敞開的木門扇 (向內側推開，不阻擋通道)
        ctx.fillStyle = '#92400e';
        ctx.strokeStyle = '#451a03';
        ctx.lineWidth = 1.5;
        const swingY = isNorthRow ? doorY - 18 : doorY + wallThick;
        ctx.fillRect(doorX, swingY, 8, 18);
        ctx.strokeRect(doorX, swingY, 8, 18);
        ctx.fillRect(doorX + doorW - 8, swingY, 8, 18);
        ctx.strokeRect(doorX + doorW - 8, swingY, 8, 18);
      }

      ctx.restore();
    }
  }

  private drawWallBlock(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    ctx.fillStyle = '#2e1a0f';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#5c3a21';
    ctx.fillRect(x + 2, y + 2, Math.max(1, w - 4), Math.max(1, h - 4));
  }

  /**
   * 繪製木屋屋頂遮罩與網路房屋精靈：
   * - 當本地玩家在該木屋內時：屋頂自動褪為極淡半透明 (alpha = 0.07)，完整呈現室內家具與人物 (Among Us 房間透視效果)！
   * - 當本地玩家在屋外時：室內蓋上隱私迷霧並顯示精緻茅草木瓦屋頂與網路房屋外觀精靈，外部玩家無法偷看屋內誰躲在裡面！
   */
  private renderCottageRoofs(
    ctx: CanvasRenderingContext2D,
    cottages: Cottage[],
    localPlayer: PlayerState
  ): void {
    for (let i = 0; i < cottages.length; i++) {
      const cottage = cottages[i];
      const { x, y, width, height } = cottage.rect;
      const isNorthRow = y < 500;
      const isPlayerInside = localPlayer.insideCottageId === cottage.id;
      const theme = this.cottageThemes[i % this.cottageThemes.length];

      ctx.save();

      if (!isPlayerInside) {
        // 1. 屋外視角：遮蔽室內視野 (Among Us 房間隱私遮罩) + 繪製屋頂與網路房屋精靈
        ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
        ctx.fillRect(x + 6, y + 6, width - 12, height - 12);

        // 斜頂木瓦屋頂底板
        const roofGrad = ctx.createLinearGradient(x, y, x, y + height);
        roofGrad.addColorStop(0, '#78350f');
        roofGrad.addColorStop(0.5, '#92400e');
        roofGrad.addColorStop(1, '#451a03');
        ctx.fillStyle = roofGrad;
        ctx.fillRect(x - 2, y - 2, width + 4, height + 4);

        // 屋瓦橫紋與中央屋脊樑
        ctx.strokeStyle = 'rgba(28, 25, 23, 0.45)';
        ctx.lineWidth = 2;
        for (let ry = y + 14; ry < y + height; ry += 16) {
          ctx.beginPath();
          ctx.moveTo(x, ry);
          ctx.lineTo(x + width, ry);
          ctx.stroke();
        }
        ctx.fillStyle = '#451a03';
        ctx.fillRect(x - 4, y + height / 2 - 4, width + 8, 8);

        // 疊加網路開源中古世紀房屋精靈 (house_human1..3, house_cabin1..2, house_elven)
        spriteAtlas.drawCentered(
          ctx,
          theme.houseSprite,
          x + width / 2,
          y + height / 2 - 4,
          112,
          104
        );

        // 屋簷外框
        ctx.strokeStyle = '#291509';
        ctx.lineWidth = 3;
        ctx.strokeRect(x - 2, y - 2, width + 4, height + 4);
      } else {
        // 2. 屋內視角：屋頂僅留極淡邊緣輪廓線，讓室內空間一目了然
        ctx.strokeStyle = 'rgba(250, 204, 21, 0.65)';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(x - 1, y - 1, width + 2, height + 2);
      }

      // 3. 門口鎖頭狀態徽章與木屋門牌
      const doorCenterX = cottage.doorRect.x + cottage.doorRect.width / 2;
      const doorBadgeY = isNorthRow ? y + height + 14 : y - 10;
      const lockLabel = cottage.isLocked ? '🔒 已反鎖' : '🔓 敞開';
      const lockColor = cottage.isLocked ? '#fca5a5' : '#86efac';
      this.drawWorldBadge(ctx, lockLabel, doorCenterX, doorBadgeY, lockColor, 'rgba(15, 23, 42, 0.88)');

      // 木屋名稱標籤
      const titleY = isNorthRow ? y - 10 : y + height + 18;
      const titleText = cottage.name + (isPlayerInside ? ' · [你在屋內]' : '');
      this.drawWorldBadge(
        ctx,
        titleText,
        x + width / 2,
        titleY,
        isPlayerInside ? '#38bdf8' : '#fef08a',
        'rgba(15, 23, 42, 0.85)'
      );

      ctx.restore();
    }
  }

  /**
   * 繪製村莊外圍森林精靈 (pine1, pine2, tree_summer, tree_fall, tree_great, tree_dead)
   */
  private renderPerimeterTrees(ctx: CanvasRenderingContext2D): void {
    const trees: Array<{ key: string; x: number; y: number; size: number }> = [
      // 北側森林邊界
      { key: 'pine_tall1', x: 55, y: 65, size: 84 },
      { key: 'tree_summer', x: 135, y: 55, size: 78 },
      { key: 'pine1', x: 395, y: 58, size: 76 },
      { key: 'tree_fall', x: 455, y: 52, size: 76 },
      { key: 'pine2', x: 830, y: 56, size: 76 },
      { key: 'tree_great', x: 955, y: 58, size: 88 },
      { key: 'pine_tall2', x: 1265, y: 65, size: 84 },
      { key: 'tree_dead', x: 1340, y: 80, size: 78 },

      // 南側森林邊界
      { key: 'pine_tall2', x: 58, y: 930, size: 84 },
      { key: 'tree_fall', x: 140, y: 940, size: 78 },
      { key: 'pine2', x: 400, y: 938, size: 76 },
      { key: 'tree_summer', x: 465, y: 942, size: 78 },
      { key: 'tree_great', x: 555, y: 935, size: 86 },
      { key: 'pine1', x: 840, y: 938, size: 76 },
      { key: 'oak_leaning', x: 960, y: 935, size: 84 },
      { key: 'tree_dead', x: 1265, y: 935, size: 78 },
      { key: 'pine_tall1', x: 1340, y: 925, size: 84 },

      // 東側陰森狼林
      { key: 'tree_dead', x: 1345, y: 240, size: 78 },
      { key: 'pine_tall1', x: 1352, y: 340, size: 84 },
      { key: 'tree_dead', x: 1350, y: 470, size: 80 },
      { key: 'pine_tall2', x: 1352, y: 610, size: 84 },
      { key: 'tree_dead', x: 1345, y: 745, size: 78 },

      // 西側農莊林緣
      { key: 'tree_summer', x: 42, y: 185, size: 74 },
      { key: 'tree_fall', x: 42, y: 815, size: 74 }
    ];

    for (const t of trees) {
      // 樹底陰影
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.beginPath();
      ctx.ellipse(t.x, t.y + t.size * 0.28, t.size * 0.32, t.size * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();

      const ok = spriteAtlas.drawCentered(ctx, t.key, t.x, t.y, t.size, t.size);
      if (!ok) {
        ctx.fillStyle = '#14532d';
        ctx.beginPath();
        ctx.arc(t.x, t.y, 20, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /**
   * 繪製日夜四時段全域環境光濾鏡
   */
  private renderPhaseAtmosphere(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    phase: GamePhase
  ): void {
    switch (phase) {
      case GamePhase.MORNING:
        // 早晨：溫暖晨曦金橘光
        ctx.fillStyle = 'rgba(251, 146, 60, 0.10)';
        ctx.fillRect(0, 0, w, h);
        break;

      case GamePhase.AFTERNOON:
        // 下午：明亮清澈日光
        ctx.fillStyle = 'rgba(254, 240, 138, 0.04)';
        ctx.fillRect(0, 0, w, h);
        break;

      case GamePhase.DUSK:
        // 黃昏：唯美紫紅暮色
        ctx.fillStyle = 'rgba(147, 51, 234, 0.20)';
        ctx.fillRect(0, 0, w, h);
        break;

      case GamePhase.NIGHT:
        // 夜晚：深邃藍黑夜幕 (搭配 FogOfWar 動態手電筒火把視野)
        ctx.fillStyle = 'rgba(10, 15, 30, 0.45)';
        ctx.fillRect(0, 0, w, h);
        break;
    }
  }

  /**
   * 繪製清晰高對比的世界浮動膠囊標籤
   */
  private drawWorldBadge(
    ctx: CanvasRenderingContext2D,
    text: string,
    cx: number,
    cy: number,
    textColor: string,
    bgColor: string
  ): void {
    ctx.save();
    ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    const metrics = ctx.measureText(text);
    const padX = 8;
    const boxW = metrics.width + padX * 2;
    const boxH = 18;

    ctx.fillStyle = bgColor;
    ctx.beginPath();
    ctx.roundRect(cx - boxW / 2, cy - boxH / 2, boxW, boxH, 9);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, cx, cy);
    ctx.restore();
  }
}
