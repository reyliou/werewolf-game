/**
 * @file village-renderer.ts
 * @description 基於 Pixel Crawler 素材包的 2D 狼人村莊渲染器
 * 嚴格以 16x16 / 32x32 像素規格組合地磚、牆體、屋頂、室內家具與動態工作站，具備 Among Us 進屋透視機制。
 */

import { Cottage, VillageMap, WheatPatch } from '../core/map-data';
import { GamePhase, PlayerState } from '../core/types';
import { spriteAtlas } from './sprite-atlas';

interface CottageTheme {
  floorPattern: string;
  roofKey: string;
  rugKey: string;
  bedKey: string;
  hearthKey: string;
  rightStationKey: string;
  extraPropKey: string;
  wallTrophyKey: string;
}

export class VillageRenderer {
  private elapsedTime: number = 0;
  private groundCache: HTMLCanvasElement | null = null;
  private groundCacheBuiltWithCount: number = -1;

  // 6 間木屋各自擁有對應職業風格的 Pixel Crawler 室內裝潢與屋頂配色
  private readonly cottageThemes: CottageTheme[] = [
    {
      // 1號木屋 (農夫屋)
      floorPattern: 'wood_floor_1',
      roofKey: 'roof_wood_gable',
      rugKey: 'rug_beige',
      bedKey: 'bed_single',
      hearthKey: 'hearth_brick_lit',
      rightStationKey: 'table_square',
      extraPropKey: 'barrel_wood',
      wallTrophyKey: 'painting_small'
    },
    {
      // 2號木屋 (煉金藥劑師屋)
      floorPattern: 'parquet_floor_3',
      roofKey: 'roof_teal_gable',
      rugKey: 'rug_green',
      bedKey: 'bed_single',
      hearthKey: 'hearth_stone_lit',
      rightStationKey: 'bookcase',
      extraPropKey: 'plant_pot_2',
      wallTrophyKey: 'window_interior_wood'
    },
    {
      // 3號木屋 (老獵人屋)
      floorPattern: 'oak_floor_4',
      roofKey: 'roof_wood_gable',
      rugKey: 'rug_dark',
      bedKey: 'bed_double',
      hearthKey: 'hearth_brick_lit',
      rightStationKey: 'workbench_med',
      extraPropKey: 'chest_iron',
      wallTrophyKey: 'trophy_bear'
    },
    {
      // 4號木屋 (占星預言家屋)
      floorPattern: 'stone_floor_2',
      roofKey: 'roof_teal_gable',
      rugKey: 'rug_dark',
      bedKey: 'bed_single',
      hearthKey: 'hearth_stone_lit',
      rightStationKey: 'bookcase',
      extraPropKey: 'esoteric_books',
      wallTrophyKey: 'window_interior_stone'
    },
    {
      // 5號木屋 (哨站鐵匠屋)
      floorPattern: 'wood_floor_1',
      roofKey: 'roof_wood_gable',
      rugKey: 'rug_beige',
      bedKey: 'bed_single',
      hearthKey: 'hearth_stone_lit',
      rightStationKey: 'anvil_full',
      extraPropKey: 'chest_wood',
      wallTrophyKey: 'trophy_bear'
    },
    {
      // 6號木屋 (領主狂徒屋)
      floorPattern: 'parquet_floor_3',
      roofKey: 'roof_teal_gable',
      rugKey: 'rug_green',
      bedKey: 'bed_double',
      hearthKey: 'hearth_brick_lit',
      rightStationKey: 'table_cloth',
      extraPropKey: 'chest_iron',
      wallTrophyKey: 'trophy_wolf'
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
    ctx.imageSmoothingEnabled = false;

    // 1. 靜態像素地形快取層 (草地磚、鵝卵石道路、石板廣場、岩石與灌木花草)
    this.renderStaticGround(ctx, map);

    // 2. 西側農莊：鋸木大穀倉、稻草人、收穫木箱與金黃穀物田
    this.renderWheatFields(ctx, map.wheatPatches);

    // 3. 北側預言家鍊金觀星台
    this.renderNorthSanctuary(ctx);

    // 4. 東側狼人屠宰工作站與鮮肉烤架
    this.renderMeatRacks(ctx, map);

    // 5. 中央營火廣場、4 幀像素烈焰動畫與 6 張原木座位
    this.renderBonfirePlaza(ctx, map.bonfire.x, map.bonfire.y, map.bonfire.radius);

    // 6. 6 間木屋的【室內木地板、編織地毯、床鋪、壁爐、書櫃工作桌與厚牆】
    this.renderCottageInteriors(ctx, map.cottages, localPlayer);
  }

  /**
   * 第二階段渲染 (在繪製角色之後)：木屋屋頂遮罩 (Among Us 進屋自動透視)、外圍森林樹冠與日夜氛圍光
   */
  public renderForegroundAndAtmosphere(
    ctx: CanvasRenderingContext2D,
    map: VillageMap,
    localPlayer: PlayerState,
    phase: GamePhase
  ): void {
    ctx.imageSmoothingEnabled = false;

    // 1. 屋外蓋上 Pixel Crawler 斜屋頂與煙囪門窗；進屋時自動透明褪去屋頂
    this.renderCottageRoofs(ctx, map.cottages, localPlayer);

    // 2. 外圍森林高聳橡樹與松木樹冠
    this.renderPerimeterTrees(ctx);

    // 3. 日夜四時段全域環境光濾鏡
    this.renderPhaseAtmosphere(ctx, map.width, map.height, phase);
  }

  private renderStaticGround(ctx: CanvasRenderingContext2D, map: VillageMap): void {
    if (
      !this.groundCache ||
      (this.groundCacheBuiltWithCount < spriteAtlas.loadedCount &&
        (spriteAtlas.loadedCount === spriteAtlas.totalCount ||
          spriteAtlas.loadedCount - this.groundCacheBuiltWithCount >= 6))
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

    gctx.imageSmoothingEnabled = false;
    this.groundCacheBuiltWithCount = spriteAtlas.loadedCount;

    // 1. 鋪設 Pixel Crawler 無縫翠綠草地磚 (擷取自 Floors_Tiles.png 實心區塊)
    gctx.fillStyle = '#336a1e';
    gctx.fillRect(0, 0, map.width, map.height);

    const grassPat = spriteAtlas.getTilePattern(gctx, 'grass_tile', 2);
    if (grassPat) {
      gctx.fillStyle = grassPat;
      gctx.fillRect(0, 0, map.width, map.height);
    }

    // 2. 村莊道路網 (使用 Floors_Tiles.png 的泥土與鵝卵石無縫圖樣)
    const roadPaths: Array<[number, number, number, number, number]> = [
      [140, 500, 1240, 500, 44],
      [700, 195, 700, 805, 42],
      [270, 500, 270, 195, 34],
      [1130, 500, 1130, 195, 34],
      [270, 500, 270, 805, 34],
      [1130, 500, 1130, 805, 34],
      [270, 255, 1130, 255, 28],
      [270, 745, 1130, 745, 28],
      [536, 255, 536, 100, 26]
    ];

    gctx.lineCap = 'round';
    gctx.lineJoin = 'round';

    // 深色泥土路緣
    for (const [x1, y1, x2, y2, w] of roadPaths) {
      gctx.strokeStyle = '#472d18';
      gctx.lineWidth = w + 6;
      gctx.beginPath();
      gctx.moveTo(x1, y1);
      gctx.lineTo(x2, y2);
      gctx.stroke();
    }

    // 泥土路基底
    const dirtPat = spriteAtlas.getTilePattern(gctx, 'dirt_tile', 2);
    for (const [x1, y1, x2, y2, w] of roadPaths) {
      gctx.strokeStyle = dirtPat || '#8b5a2b';
      gctx.lineWidth = w;
      gctx.beginPath();
      gctx.moveTo(x1, y1);
      gctx.lineTo(x2, y2);
      gctx.stroke();
    }

    // 鵝卵石路面中心
    const cobblePat = spriteAtlas.getTilePattern(gctx, 'cobble_tile', 2);
    if (cobblePat) {
      for (const [x1, y1, x2, y2, w] of roadPaths) {
        gctx.strokeStyle = cobblePat;
        gctx.lineWidth = w * 0.62;
        gctx.beginPath();
        gctx.moveTo(x1, y1);
        gctx.lineTo(x2, y2);
        gctx.stroke();
      }
    }

    // 3. 中央火堆石磚圓形大廣場 (擷取自 Floors_Tiles.png 石磚區塊)
    const plazaPat = spriteAtlas.getTilePattern(gctx, 'stone_plaza_tile', 2);
    gctx.save();
    gctx.beginPath();
    gctx.arc(map.bonfire.x, map.bonfire.y, 116, 0, Math.PI * 2);
    gctx.fillStyle = plazaPat || '#57534e';
    gctx.fill();
    gctx.lineWidth = 4;
    gctx.strokeStyle = '#292524';
    gctx.stroke();
    gctx.restore();

    // 4. 點綴精確裁切之灌木、魯冰花、紅藍蘑菇、樹樁、長椅與岩石
    const groundProps: Array<{ key: string; x: number; y: number; scale?: number }> = [
      { key: 'bush_green_sm', x: 410, y: 175 },
      { key: 'bush_green_lg', x: 865, y: 165 },
      { key: 'bush_autumn_sm', x: 425, y: 825 },
      { key: 'bush_green_sm', x: 880, y: 830 },
      { key: 'flower_lupine', x: 445, y: 182 },
      { key: 'flower_lupine', x: 830, y: 175 },
      { key: 'flower_lupine', x: 460, y: 820 },
      { key: 'flower_lupine', x: 845, y: 825 },
      { key: 'mushroom_red', x: 1025, y: 315 },
      { key: 'mushroom_blue', x: 1042, y: 322 },
      { key: 'mushroom_red', x: 1035, y: 685 },
      { key: 'rock_tall_brown', x: 385, y: 445 },
      { key: 'rock_med_brown', x: 412, y: 458 },
      { key: 'rock_tall_grey', x: 960, y: 135 },
      { key: 'rock_med_grey', x: 465, y: 885 },
      { key: 'tree_stump', x: 162, y: 265 },
      { key: 'tree_stump', x: 1015, y: 735 },
      { key: 'ext_bench', x: 700, y: 368 },
      { key: 'ext_bench', x: 700, y: 632 }
    ];

    for (const p of groundProps) {
      spriteAtlas.drawRegionCentered(gctx, p.key, p.x, p.y);
    }

    // 5. 外圍像素木柵欄邊界
    gctx.fillStyle = '#3b210e';
    gctx.fillRect(0, 0, map.width, 16);
    gctx.fillRect(0, map.height - 16, map.width, 16);
    gctx.fillRect(0, 0, 16, map.height);
    gctx.fillRect(map.width - 16, 0, 16, map.height);

    for (let fx = 20; fx < map.width; fx += 32) {
      gctx.fillStyle = '#6e421f';
      gctx.fillRect(fx - 4, 2, 8, 12);
      gctx.fillRect(fx - 4, map.height - 14, 8, 12);
    }
    for (let fy = 20; fy < map.height; fy += 32) {
      gctx.fillStyle = '#6e421f';
      gctx.fillRect(2, fy - 4, 12, 8);
      gctx.fillRect(map.width - 14, fy - 4, 12, 8);
    }
  }

  /**
   * 繪製西側農莊：Pixel Crawler 鋸木大穀倉、稻草人、收穫木箱與可收割農田
   */
  private renderWheatFields(ctx: CanvasRenderingContext2D, patches: WheatPatch[]): void {
    const sway = Math.sin(this.elapsedTime * 2.8) * 2.5;
    const dirtPat = spriteAtlas.getTilePattern(ctx, 'dirt_tile', 2);

    for (const patch of patches) {
      const { x, y, width, height } = patch.rect;

      ctx.save();
      // 翻整農田底土與木框田埂
      ctx.fillStyle = dirtPat || '#5c3a21';
      ctx.fillRect(x, y, width, height);
      ctx.fillStyle = 'rgba(28, 15, 6, 0.35)';
      ctx.fillRect(x, y, width, height);

      // 像素木造种植槽外框
      ctx.strokeStyle = '#3b210e';
      ctx.lineWidth = 4;
      ctx.strokeRect(x, y, width, height);
      ctx.strokeStyle = '#784721';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 2, y + 2, width - 4, height - 4);

      // 犁溝條紋
      ctx.fillStyle = 'rgba(38, 20, 8, 0.55)';
      for (let ry = y + 18; ry < y + height - 10; ry += 28) {
        ctx.fillRect(x + 8, ry, width - 16, 4);
      }

      // 依 currentWheat 繪製 Farm.png 中的成熟高稈穀物或嫩芽
      const cols = 5;
      const rows = 2;
      const stepX = (width - 24) / cols;
      const stepY = (height - 16) / rows;
      let index = 0;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const wx = x + 12 + c * stepX + stepX / 2;
          const wy = y + 8 + r * stepY + stepY / 2;
          const isReady = index < patch.currentWheat;
          index++;

          if (isReady) {
            // 飽滿可收割作物 (隨風輕微搖擺)
            spriteAtlas.drawRegionCentered(ctx, 'crop_golden_head', wx, wy + 8, 32, 28);
            spriteAtlas.drawRegionCentered(ctx, 'crop_tall_grain', wx + sway, wy - 4, 22, 46);
          } else {
            // 已收割後的重新發芽狀態
            spriteAtlas.drawRegionCentered(ctx, 'crop_sprout', wx, wy + 6, 28, 24);
          }
        }
      }

      this.drawWorldBadge(
        ctx,
        `🌾 農莊麥田 (${patch.currentWheat}/${patch.maxWheat})`,
        x + width / 2,
        y + 14,
        patch.currentWheat > 0 ? '#fef08a' : '#94a3b8',
        'rgba(28, 25, 23, 0.85)'
      );
      ctx.restore();
    }

    // 西側農莊大穀倉 / 鋸木工坊 (對應碰撞箱 x: 24, y: 428, w: 112, h: 108)
    spriteAtlas.drawRegionCentered(ctx, 'sawmill_barn', 80, 480, 148, 100);
    spriteAtlas.drawRegionCentered(ctx, 'chop_stump', 52, 548, 46, 38);
    spriteAtlas.drawRegionCentered(ctx, 'scarecrow', 332, 362, 44, 84);
    spriteAtlas.drawRegionCentered(ctx, 'harvest_crate_grain', 62, 282, 32, 56);
    spriteAtlas.drawRegionCentered(ctx, 'harvest_crate_carrot', 96, 282, 32, 56);
    spriteAtlas.drawRegionCentered(ctx, 'seed_sack_gold', 126, 286, 28, 48);
    spriteAtlas.drawRegionCentered(ctx, 'farm_boxes', 85, 735, 76, 48);

    this.drawWorldBadge(ctx, '🏚️ 農莊工坊穀倉', 80, 418, '#fed7aa', 'rgba(67, 20, 7, 0.88)');
  }

  /**
   * 繪製北側預言家觀星鍊金聖殿 (對應碰撞箱 x: 518, y: 64, w: 36, h: 36)
   */
  private renderNorthSanctuary(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    const plazaPat = spriteAtlas.getTilePattern(ctx, 'stone_plaza_tile', 2);
    ctx.fillStyle = plazaPat || '#334155';
    ctx.beginPath();
    ctx.arc(536, 92, 54, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#7e22ce';
    ctx.lineWidth = 3;
    ctx.stroke();

    // 兩側古老巨石柱與神祕古籍
    spriteAtlas.drawRegionCentered(ctx, 'rock_tall_grey', 476, 88, 42, 64);
    spriteAtlas.drawRegionCentered(ctx, 'rock_tall_grey', 596, 88, 42, 64);
    spriteAtlas.drawRegionCentered(ctx, 'esoteric_books', 536, 134, 48, 42);

    // 動態鍊金觀星實驗台 (Alchemy_Table_03-Sheet.png 單格 80x80 序列幀)
    const alchFrame = Math.floor(this.elapsedTime * 7) % 20;
    spriteAtlas.drawAlchemyStation(ctx, alchFrame, 536, 82, 112, 112);

    this.drawWorldBadge(ctx, '🔮 觀星鍊金聖壇', 536, 26, '#e9d5ff', 'rgba(59, 7, 100, 0.88)');
    ctx.restore();
  }

  /**
   * 繪製東側狼人屠宰工作站與鮮肉掛架 (Cooking Station.png + Meat.png + Grill_01-Sheet.png)
   */
  private renderMeatRacks(ctx: CanvasRenderingContext2D, map: VillageMap): void {
    const dirtPat = spriteAtlas.getTilePattern(ctx, 'dirt_tile', 2);
    const grillFrame = Math.floor(this.elapsedTime * 8) % 4;

    for (let idx = 0; idx < map.meatRacks.length; idx++) {
      const rack = map.meatRacks[idx];
      const { x, y, width, height } = rack.rect;

      ctx.save();
      ctx.fillStyle = dirtPat || '#3b210e';
      ctx.fillRect(x, y, width, height);
      ctx.fillStyle = 'rgba(69, 10, 10, 0.32)';
      ctx.fillRect(x, y, width, height);

      ctx.strokeStyle = '#451a03';
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, width, height);

      if (idx === 0) {
        // 北區肉架：木造掛肉烤架 + 剁肉砧板 + 屠宰桌
        spriteAtlas.drawRegionCentered(ctx, 'meat_rack_crank_2', x + 56, y + 62, 74, 78);
        spriteAtlas.drawRegionCentered(ctx, 'butcher_table_1', x + 154, y + 66, 82, 82);
        spriteAtlas.drawRegionCentered(ctx, 'butcher_cleaver_block', x + 56, y + 122, 54, 48);
      } else {
        // 南區肉架：大型炭火烤肉網 (動態煙火) + 豐盛屠宰肉檯 + 三腳大釜
        spriteAtlas.drawAnimFrameCentered(ctx, 'grill_anim', grillFrame, x + 64, y + 64, 104, 104);
        spriteAtlas.drawRegionCentered(ctx, 'butcher_table_2', x + 154, y + 78, 96, 90);
        spriteAtlas.drawRegionCentered(ctx, 'cauldron_tripod', x + 58, y + 124, 64, 76);
      }

      // 根據剩餘鮮肉數量 (rack.meatAvailable) 在檯面前方擺放鮮肉塊精靈
      const meats = Math.min(8, rack.meatAvailable);
      for (let i = 0; i < meats; i++) {
        const mx = x + 98 + (i % 4) * 24;
        const my = y + 118 + Math.floor(i / 4) * 20;
        const meatKey = i % 3 === 0 ? 'meat_ham' : i % 3 === 1 ? 'meat_ribs' : 'meat_steak';
        spriteAtlas.drawRegionCentered(ctx, meatKey, mx, my, 28, 22);
      }

      this.drawWorldBadge(
        ctx,
        `🥩 鮮肉屠宰架 (${rack.meatAvailable}塊)`,
        x + width / 2,
        y + 14,
        '#fca5a5',
        'rgba(69, 10, 10, 0.88)'
      );
      ctx.restore();
    }
  }

  /**
   * 繪製中央營火審判廣場：石砌火坑、4 幀像素烈焰與煙霧動畫、6 張原木座椅
   */
  private renderBonfirePlaza(ctx: CanvasRenderingContext2D, bx: number, by: number, radius: number): void {
    ctx.save();

    // 1. 營火溫暖動態光暈
    const flicker = Math.sin(this.elapsedTime * 9) * 5;
    const glowRadius = radius * 2.5 + flicker;
    const fireGlow = ctx.createRadialGradient(bx, by, 8, bx, by, glowRadius);
    fireGlow.addColorStop(0, 'rgba(251, 146, 60, 0.62)');
    fireGlow.addColorStop(0.5, 'rgba(239, 68, 68, 0.25)');
    fireGlow.addColorStop(1, 'rgba(239, 68, 68, 0)');
    ctx.fillStyle = fireGlow;
    ctx.beginPath();
    ctx.arc(bx, by, glowRadius, 0, Math.PI * 2);
    ctx.fill();

    // 2. Pixel Crawler 石砌火坑與柴火基座 (Bonfire.png)
    spriteAtlas.drawRegionCentered(ctx, 'bonfire_ring', bx, by + 2, 68, 68);
    spriteAtlas.drawRegionCentered(ctx, 'bonfire_pit', bx, by + 4, 62, 46);

    // 3. 4 幀像素烈焰動畫 (Fire_01-Sheet.png) 與炊煙動畫 (Smoke-Sheet.png)
    const fireFrame = Math.floor(this.elapsedTime * 10) % 4;
    const smokeFrame = Math.floor(this.elapsedTime * 6) % 4;
    spriteAtlas.drawAnimFrameCentered(ctx, 'smoke_anim', smokeFrame, bx, by - 36, 64, 96);
    spriteAtlas.drawAnimFrameCentered(ctx, 'fire_anim', fireFrame, bx, by - 14, 64, 96);

    // 4. 6 張圍坐原木座椅 (Bonfire.png 中的 log_stool_v 與 log_bench_h)
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI * 2) / 6;
      const seatDist = radius + 34;
      const sx = bx + Math.cos(angle) * seatDist;
      const sy = by + Math.sin(angle) * seatDist;
      spriteAtlas.drawRegionCentered(ctx, 'log_stool_v', sx, sy, 30, 36);
    }

    this.drawWorldBadge(ctx, '🔥 中央營火審判廣場', bx, by + radius + 58, '#fdba74', 'rgba(30, 41, 59, 0.88)');
    ctx.restore();
  }

  /**
   * 繪製 6 間村民木屋的室內結構與家具 (嚴格對齊 map-data.ts 中的 createCottageCollisionBoxes 碰撞箱)
   */
  private renderCottageInteriors(
    ctx: CanvasRenderingContext2D,
    cottages: Cottage[],
    _localPlayer: PlayerState
  ): void {
    for (let i = 0; i < cottages.length; i++) {
      const cottage = cottages[i];
      const { x, y, width, height } = cottage.rect;
      const isNorthRow = y < 500;
      const theme = this.cottageThemes[i % this.cottageThemes.length];

      ctx.save();

      // 0. 建築外部落地陰影
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.fillRect(x - 4, y + 6, width + 8, height + 6);

      // 1. 室內無縫像素木地板/石磚地板 (擷取自 Interior_Walls_01.png 底部 4 款材質)
      const floorPat = spriteAtlas.getTilePattern(ctx, theme.floorPattern, 2);
      ctx.fillStyle = floorPat || '#6e472b';
      ctx.fillRect(x + 8, y + 8, width - 16, height - 16);

      // 2. 中央編織地毯 (擷取自 Interior_Props_01.png，不阻擋中央 56px 走道)
      const rugY = isNorthRow ? y + 64 : y + 56;
      spriteAtlas.drawRegionCentered(ctx, theme.rugKey, x + width / 2, rugY, 56, 56);

      // 3. 室內三大核心家具 (座標嚴格對應 createCottageCollisionBoxes)
      const bedCY = isNorthRow ? y + 28 : y + height - 28;
      const hearthCY = isNorthRow ? y + 18 : y + height - 18;
      const tableCY = isNorthRow ? y + 24 : y + height - 24;

      // (A) 左側角落：Pixel Crawler 像素床鋪 ({ x: x + 12, width: 34, height: 26 })
      spriteAtlas.drawRegionCentered(ctx, theme.bedKey, x + 29, bedCY, 34, 46);

      // (B) 後牆中央：石砌/紅磚壁爐 ({ x: x + 56, width: 28, height: 16 }) + 溫暖爐火光暈
      const hearthGlow = ctx.createRadialGradient(x + 70, hearthCY, 2, x + 70, hearthCY, 44);
      hearthGlow.addColorStop(0, 'rgba(251, 146, 60, 0.48)');
      hearthGlow.addColorStop(1, 'rgba(251, 146, 60, 0)');
      ctx.fillStyle = hearthGlow;
      ctx.beginPath();
      ctx.arc(x + 70, hearthCY, 44, 0, Math.PI * 2);
      ctx.fill();
      spriteAtlas.drawRegionCentered(ctx, theme.hearthKey, x + 70, hearthCY, 32, 38);

      // 後牆掛飾 (狼頭/熊頭標本或木窗)
      spriteAtlas.drawRegionCentered(
        ctx,
        theme.wallTrophyKey,
        x + 48,
        isNorthRow ? y + 12 : y + height - 12,
        20,
        20
      );

      // (C) 右側角落：職業專屬工作站/書櫃/鐵砧 ({ x: x + 94, width: 34, height: 24 })
      spriteAtlas.drawRegionCentered(ctx, theme.rightStationKey, x + 111, tableCY, 36, 32);

      // 側牆附屬儲物木桶/寶箱/盆栽
      spriteAtlas.drawRegionCentered(
        ctx,
        theme.extraPropKey,
        x + 116,
        isNorthRow ? y + 58 : y + height - 58,
        26,
        28
      );
      spriteAtlas.drawRegionCentered(
        ctx,
        'plant_pot_1',
        x + 22,
        isNorthRow ? y + height - 24 : y + 24,
        18,
        32
      );

      // 4. 繪製 Tavern.png 風格雙層像素立體木牆邊框 (留出中央 56px 大門通道)
      const wallThick = 10;
      const sideWallW = 42;
      if (isNorthRow) {
        this.drawPixelWall(ctx, x, y, width, wallThick);
        this.drawPixelWall(ctx, x, y, wallThick, height);
        this.drawPixelWall(ctx, x + width - wallThick, y, wallThick, height);
        this.drawPixelWall(ctx, x, y + height - wallThick, sideWallW, wallThick);
        this.drawPixelWall(ctx, x + width - sideWallW, y + height - wallThick, sideWallW, wallThick);
      } else {
        this.drawPixelWall(ctx, x, y + height - wallThick, width, wallThick);
        this.drawPixelWall(ctx, x, y, wallThick, height);
        this.drawPixelWall(ctx, x + width - wallThick, y, wallThick, height);
        this.drawPixelWall(ctx, x, y, sideWallW, wallThick);
        this.drawPixelWall(ctx, x + width - sideWallW, y, sideWallW, wallThick);
      }

      // 5. 大門通道與可上鎖像素木門 (Interior_Props_01.png)
      const doorX = x + sideWallW;
      const doorY = isNorthRow ? y + height - wallThick : y;
      const doorW = 56;

      // 門檻木踏板
      ctx.fillStyle = '#472814';
      ctx.fillRect(doorX, doorY - 1, doorW, wallThick + 2);

      if (cottage.isLocked) {
        // 已上鎖：橫置強化鐵條木門阻擋門口並顯示紅框警示
        ctx.fillStyle = '#3b1d0e';
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.fillRect(doorX, doorY - 2, doorW, wallThick + 4);
        ctx.strokeRect(doorX, doorY - 2, doorW, wallThick + 4);
        spriteAtlas.drawRegionCentered(
          ctx,
          'door_interior_locked',
          doorX + doorW / 2,
          doorY + wallThick / 2,
          36,
          16
        );
      } else {
        // 敞開狀態：門扇推向門框內側
        const openDoorY = isNorthRow ? doorY - 10 : doorY + wallThick + 10;
        spriteAtlas.drawRegionCentered(ctx, 'door_interior_wood', doorX + 6, openDoorY, 14, 22);
      }

      ctx.restore();
    }
  }

  private drawPixelWall(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    ctx.fillStyle = '#1f1209';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#6e421f';
    ctx.fillRect(x + 2, y + 2, Math.max(1, w - 4), Math.max(1, h - 4));
    ctx.fillStyle = '#9c6334';
    ctx.fillRect(x + 3, y + 3, Math.max(1, w - 6), Math.max(1, Math.min(3, h - 6)));
  }

  /**
   * 繪製木屋屋頂遮罩與建築外觀組件 (Roofs.png + Props.png)：
   * - 屋外視角：遮蔽室內隱私，蓋上 Pixel Crawler 原生斜屋頂、石煙囪與百葉木窗。
   * - 屋內視角：屋頂完全透明褪去，呈現完整 Tavern 風格像素室內空間！
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
        // 1. 遮蔽室內隱私 (Among Us 房間黑霧隔離)
        ctx.fillStyle = '#141824';
        ctx.fillRect(x + 4, y + 4, width - 8, height - 8);

        // 2. 繪製建築正面木牆立面與窗戶
        ctx.fillStyle = '#5c381c';
        ctx.fillRect(x, y, width, height);
        ctx.strokeStyle = '#261509';
        ctx.lineWidth = 3;
        ctx.strokeRect(x, y, width, height);

        // 繪製 Pixel Crawler 斜屋頂 (Roofs.png: roof_wood_gable / roof_teal_gable)
        spriteAtlas.drawRegionCentered(
          ctx,
          theme.roofKey,
          x + width / 2,
          y + height / 2 - 8,
          width + 18,
          height + 8
        );

        // 屋頂石砌煙囪与外牆百葉窗、大門 (Buildings/Props.png)
        spriteAtlas.drawRegionCentered(ctx, 'ext_chimney', x + 28, y + 12, 28, 56);
        const facadeY = isNorthRow ? y + height - 22 : y + 22;
        spriteAtlas.drawRegionCentered(ctx, 'ext_window_shutter', x + 26, facadeY, 32, 26);
        spriteAtlas.drawRegionCentered(ctx, 'ext_window_shutter', x + width - 26, facadeY, 32, 26);
        spriteAtlas.drawRegionCentered(
          ctx,
          cottage.isLocked ? 'ext_door_iron' : 'ext_door_wood',
          x + width / 2,
          facadeY + 2,
          28,
          32
        );
      } else {
        // 屋內視角：僅顯示金色高亮房間外框，屋頂完全退去
        ctx.strokeStyle = 'rgba(250, 204, 21, 0.75)';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(x - 1, y - 1, width + 2, height + 2);
      }

      // 3. 門口鎖頭狀態與門牌
      const doorCenterX = cottage.doorRect.x + cottage.doorRect.width / 2;
      const doorBadgeY = isNorthRow ? y + height + 14 : y - 10;
      const lockLabel = cottage.isLocked ? '🔒 已反鎖' : '🔓 敞開';
      const lockColor = cottage.isLocked ? '#fca5a5' : '#86efac';
      this.drawWorldBadge(ctx, lockLabel, doorCenterX, doorBadgeY, lockColor, 'rgba(15, 23, 42, 0.9)');

      const titleY = isNorthRow ? y - 12 : y + height + 18;
      const titleText = cottage.name + (isPlayerInside ? ' · [你在屋內]' : '');
      this.drawWorldBadge(
        ctx,
        titleText,
        x + width / 2,
        titleY,
        isPlayerInside ? '#38bdf8' : '#fef08a',
        'rgba(15, 23, 42, 0.88)'
      );

      ctx.restore();
    }
  }

  /**
   * 繪製外圍森林樹冠 (精確裁切自 Trees/Model_01~03 的單顆樹木精靈)
   */
  private renderPerimeterTrees(ctx: CanvasRenderingContext2D): void {
    const trees: Array<{ key: string; x: number; y: number; w: number; h: number }> = [
      // 北側森林邊界
      { key: 'tree_oak_green', x: 58, y: 62, w: 72, h: 128 },
      { key: 'pine_lush', x: 135, y: 56, w: 58, h: 112 },
      { key: 'tree_oak_gold', x: 395, y: 58, w: 72, h: 128 },
      { key: 'pine_teal', x: 455, y: 54, w: 58, h: 112 },
      { key: 'pine_forest', x: 830, y: 56, w: 58, h: 112 },
      { key: 'tree_oak_orange', x: 955, y: 58, w: 72, h: 128 },
      { key: 'pine_teal', x: 1265, y: 62, w: 58, h: 112 },
      { key: 'tree_oak_dead', x: 1340, y: 74, w: 72, h: 128 },

      // 南側森林邊界
      { key: 'pine_forest', x: 58, y: 928, w: 58, h: 112 },
      { key: 'tree_oak_amber', x: 140, y: 934, w: 72, h: 128 },
      { key: 'pine_lush', x: 400, y: 932, w: 58, h: 112 },
      { key: 'tree_oak_green', x: 468, y: 936, w: 72, h: 128 },
      { key: 'tree_oak_gold', x: 555, y: 932, w: 72, h: 128 },
      { key: 'pine_teal', x: 840, y: 932, w: 58, h: 112 },
      { key: 'tree_oak_orange', x: 960, y: 932, w: 72, h: 128 },
      { key: 'pine_dead', x: 1265, y: 932, w: 60, h: 110 },
      { key: 'tree_oak_dead', x: 1340, y: 922, w: 72, h: 128 },

      // 東側陰森枯木狼林
      { key: 'tree_oak_dead', x: 1348, y: 235, w: 72, h: 128 },
      { key: 'pine_dead', x: 1352, y: 345, w: 60, h: 110 },
      { key: 'pine_tall_dead', x: 1350, y: 475, w: 64, h: 140 },
      { key: 'pine_dead', x: 1352, y: 610, w: 60, h: 110 },
      { key: 'tree_oak_dead', x: 1348, y: 745, w: 72, h: 128 },

      // 西側農莊林緣
      { key: 'tree_oak_green', x: 42, y: 185, w: 68, h: 120 },
      { key: 'tree_oak_amber', x: 42, y: 815, w: 68, h: 120 }
    ];

    for (const t of trees) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.beginPath();
      ctx.ellipse(t.x, t.y + t.h * 0.36, t.w * 0.36, 11, 0, 0, Math.PI * 2);
      ctx.fill();

      spriteAtlas.drawRegionCentered(ctx, t.key, t.x, t.y, t.w, t.h);
    }
  }

  private renderPhaseAtmosphere(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    phase: GamePhase
  ): void {
    switch (phase) {
      case GamePhase.MORNING:
        ctx.fillStyle = 'rgba(251, 146, 60, 0.10)';
        ctx.fillRect(0, 0, w, h);
        break;
      case GamePhase.AFTERNOON:
        ctx.fillStyle = 'rgba(254, 240, 138, 0.04)';
        ctx.fillRect(0, 0, w, h);
        break;
      case GamePhase.DUSK:
        ctx.fillStyle = 'rgba(147, 51, 234, 0.20)';
        ctx.fillRect(0, 0, w, h);
        break;
      case GamePhase.NIGHT:
        ctx.fillStyle = 'rgba(10, 15, 30, 0.45)';
        ctx.fillRect(0, 0, w, h);
        break;
    }
  }

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
