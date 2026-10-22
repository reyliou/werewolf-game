/**
 * @file sprite-atlas.ts
 * @description Pixel Crawler 素材包精準圖集切片與動畫幀管理器
 * 嚴格按照每個 Tileset / Sprite Sheet 的實際像素座標 (sx, sy, sw, sh) 與動畫幀格進行裁切，絕不整張貼圖盲貼。
 */

export interface SpriteRegion {
  sheet: string;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

export interface AnimStripDef {
  sheet: string;
  frames: number;
  cellW: number;
  cellH: number;
  cropX: number;
  cropY: number;
  cropW: number;
  cropH: number;
}

const BASE = '/assets/pixel-crawler';

export const SHEET_URLS: Record<string, string> = {
  // 地形與建築結構 Tilesets
  floors_tiles: `${BASE}/Environment/Tilesets/Floors_Tiles.png`,
  wall_tiles: `${BASE}/Environment/Tilesets/Wall_Tiles.png`,
  water_tiles: `${BASE}/Environment/Tilesets/Water_tiles.png`,
  building_walls: `${BASE}/Environment/Structures/Buildings/Walls.png`,
  building_roofs: `${BASE}/Environment/Structures/Buildings/Roofs.png`,
  building_props: `${BASE}/Environment/Structures/Buildings/Props.png`,
  interior_walls: `${BASE}/Environment/Structures/Buildings/Interior/Interior_Walls_01.png`,
  interior_props: `${BASE}/Environment/Structures/Buildings/Interior/Interior_Props_01.png`,

  // 靜態環境與道具圖集
  farm_props: `${BASE}/Environment/Props/Static/Farm.png`,
  meat_props: `${BASE}/Environment/Props/Static/Meat.png`,
  furniture_props: `${BASE}/Environment/Props/Static/Furniture.png`,
  vegetation_props: `${BASE}/Environment/Props/Static/Vegetation.png`,
  rocks_props: `${BASE}/Environment/Props/Static/Rocks.png`,
  esoteric_props: `${BASE}/Environment/Props/Static/Esoteric.png`,
  resources_props: `${BASE}/Environment/Props/Static/Resources.png`,
  weapons_wood: `${BASE}/Weapons/Wood/Wood.png`,
  weapons_bone: `${BASE}/Weapons/Bone/Bone.png`,

  // 樹木多尺寸圖集
  trees_m1: `${BASE}/Environment/Props/Static/Trees/Model_01/Size_03.png`,
  trees_m2: `${BASE}/Environment/Props/Static/Trees/Model_02/Size_03.png`,
  trees_m3: `${BASE}/Environment/Props/Static/Trees/Model_03/Size_03.png`,

  // 互動工作站與營火圖集
  bonfire_static: `${BASE}/Environment/Structures/Stations/Bonfire/Bonfire.png`,
  bonfire_fire: `${BASE}/Environment/Structures/Stations/Bonfire/Fire_01-Sheet.png`,
  bonfire_smoke: `${BASE}/Environment/Structures/Stations/Bonfire/Smoke-Sheet.png`,
  cooking_station: `${BASE}/Environment/Structures/Stations/Cooking Station/Cooking Station.png`,
  grill_anim: `${BASE}/Environment/Structures/Stations/Cooking Station/Grill/Grill_01-Sheet.png`,
  alchemy_anim: `${BASE}/Environment/Structures/Stations/Alchemy/Alchemy_Table_03-Sheet.png`,
  anvil_static: `${BASE}/Environment/Structures/Stations/Anvil/Anvil.png`,
  furnace_static: `${BASE}/Environment/Structures/Stations/Furnace/Furnace.png`,
  sawmill_base: `${BASE}/Environment/Structures/Stations/Sawmill/Base.png`,
  workbench_static: `${BASE}/Environment/Structures/Stations/Workbench/Workbench.png`,

  // 角色與怪物動畫條 (Entities)
  peasant_idle: `${BASE}/Entities/Npc's/Citizen_F/Peasant_A/Idle/Idle-Sheet.png`,
  peasant_walk: `${BASE}/Entities/Npc's/Citizen_F/Peasant_A/Walk/Walk-Sheet.png`,
  tavernA_idle: `${BASE}/Entities/Npc's/Citizen_F/Tavern_A/Idle_Hold/Idle_Side-Sheet.png`,
  tavernA_walk: `${BASE}/Entities/Npc's/Citizen_F/Tavern_A/Walk_Hold/Walk_Side-Sheet.png`,
  tavernB_idle: `${BASE}/Entities/Npc's/Citizen_F/Tavern_B/Idle/Idle_Side-Sheet.png`,
  tavernB_walk: `${BASE}/Entities/Npc's/Citizen_F/Tavern_B/Walk/Walk_Side-Sheet.png`,
  knight_idle: `${BASE}/Entities/Npc's/Knight/Idle/Idle-Sheet.png`,
  knight_run: `${BASE}/Entities/Npc's/Knight/Run/Run-Sheet.png`,
  wizzard_idle: `${BASE}/Entities/Npc's/Wizzard/Idle/Idle-Sheet.png`,
  wizzard_run: `${BASE}/Entities/Npc's/Wizzard/Run/Run-Sheet.png`,
  rogue_idle: `${BASE}/Entities/Npc's/Rogue/Idle/Idle-Sheet.png`,
  rogue_run: `${BASE}/Entities/Npc's/Rogue/Run/Run-Sheet.png`,
  orc_war_idle: `${BASE}/Entities/Mobs/Orc Crew/Orc - Warrior/Idle/Idle-Sheet.png`,
  orc_war_run: `${BASE}/Entities/Mobs/Orc Crew/Orc - Warrior/Run/Run-Sheet.png`,
  orc_sha_idle: `${BASE}/Entities/Mobs/Orc Crew/Orc - Shaman/Idle/Idle-Sheet.png`,
  orc_sha_run: `${BASE}/Entities/Mobs/Orc Crew/Orc - Shaman/Run/Run-Sheet.png`,
  skel_death: `${BASE}/Entities/Mobs/Skeleton Crew/Skeleton - Base/Death/Death-Sheet.png`
};

/**
 * 經過像素邊界驗證之單一物件精確裁切座標表 (絕不包含 PALETTE 標題或鄰近雜物)
 */
export const SPRITE_REGIONS: Record<string, SpriteRegion> = {
  // 1. 屋頂與建築外觀組件 (Roofs.png, Walls.png, Props.png)
  roof_wood_gable: { sheet: 'building_roofs', sx: 0, sy: 6, sw: 128, sh: 89 },
  roof_teal_gable: { sheet: 'building_roofs', sx: 128, sy: 6, sw: 128, sh: 89 },
  roof_wood_steep: { sheet: 'building_roofs', sx: 0, sy: 80, sw: 128, sh: 130 },
  roof_teal_steep: { sheet: 'building_roofs', sx: 144, sy: 80, sw: 96, sh: 130 },
  roof_wood_flat: { sheet: 'building_roofs', sx: 32, sy: 160, sw: 64, sh: 48 },
  roof_teal_flat: { sheet: 'building_roofs', sx: 160, sy: 160, sw: 64, sh: 48 },
  ext_chimney: { sheet: 'building_props', sx: 4, sy: 32, sw: 24, sh: 58 },
  ext_door_wood: { sheet: 'building_props', sx: 101, sy: 14, sw: 22, sh: 28 },
  ext_door_iron: { sheet: 'building_props', sx: 132, sy: 14, sw: 24, sh: 28 },
  ext_window_wood: { sheet: 'building_props', sx: 101, sy: 44, sw: 22, sh: 26 },
  ext_window_shutter: { sheet: 'building_props', sx: 128, sy: 44, sw: 32, sh: 26 },
  ext_bench: { sheet: 'building_props', sx: 83, sy: 160, sw: 58, sh: 32 },

  // 2. 室內家具與擺設 (Interior_Props_01.png, Furnace.png, Workbench.png, Anvil.png)
  bed_single: { sheet: 'interior_props', sx: 1, sy: 293, sw: 30, sh: 54 },
  bed_double: { sheet: 'interior_props', sx: 33, sy: 293, sw: 46, sh: 54 },
  bed_bench: { sheet: 'interior_props', sx: 80, sy: 301, sw: 45, sh: 19 },
  painting_small: { sheet: 'interior_props', sx: 80, sy: 320, sw: 16, sh: 16 },
  rug_green: { sheet: 'interior_props', sx: 336, sy: 336, sw: 48, sh: 48 },
  rug_dark: { sheet: 'interior_props', sx: 384, sy: 336, sw: 48, sh: 48 },
  rug_beige: { sheet: 'interior_props', sx: 448, sy: 320, sw: 48, sh: 48 },
  table_round: { sheet: 'interior_props', sx: 80, sy: 7, sw: 32, sh: 35 },
  table_cloth: { sheet: 'interior_props', sx: 231, sy: 1, sw: 34, sh: 31 },
  table_square: { sheet: 'interior_props', sx: 231, sy: 33, sw: 39, sh: 30 },
  bookcase: { sheet: 'interior_props', sx: 48, sy: 96, sw: 48, sh: 52 },
  chest_wood: { sheet: 'interior_props', sx: 147, sy: 76, sw: 26, sh: 20 },
  chest_iron: { sheet: 'interior_props', sx: 178, sy: 75, sw: 26, sh: 22 },
  barrel_wood: { sheet: 'interior_props', sx: 224, sy: 118, sw: 18, sh: 26 },
  door_interior_wood: { sheet: 'interior_props', sx: 134, sy: 178, sw: 36, sh: 46 },
  door_interior_heavy: { sheet: 'interior_props', sx: 180, sy: 178, sw: 40, sh: 46 },
  door_interior_locked: { sheet: 'interior_props', sx: 229, sy: 178, sw: 38, sh: 46 },
  window_interior_wood: { sheet: 'interior_props', sx: 64, sy: 176, sw: 28, sh: 32 },
  window_interior_stone: { sheet: 'interior_props', sx: 98, sy: 176, sw: 28, sh: 32 },
  trophy_wolf: { sheet: 'interior_props', sx: 552, sy: 8, sw: 16, sh: 17 },
  trophy_bear: { sheet: 'interior_props', sx: 584, sy: 7, sw: 16, sh: 17 },
  plant_pot_1: { sheet: 'interior_props', sx: 17, sy: 352, sw: 14, sh: 32 },
  plant_pot_2: { sheet: 'interior_props', sx: 48, sy: 354, sw: 32, sh: 30 },
  broom_prop: { sheet: 'interior_props', sx: 592, sy: 336, sw: 16, sh: 30 },

  hearth_brick_lit: { sheet: 'furnace_static', sx: 0, sy: 87, sw: 32, sh: 41 },
  hearth_stone_lit: { sheet: 'furnace_static', sx: 0, sy: 147, sw: 32, sh: 45 },
  furnace_large_lit: { sheet: 'furnace_static', sx: 52, sy: 71, sw: 38, sh: 57 },
  workbench_small: { sheet: 'workbench_static', sx: 0, sy: 84, sw: 32, sh: 28 },
  workbench_med: { sheet: 'workbench_static', sx: 48, sy: 72, sw: 48, sh: 40 },
  workbench_large: { sheet: 'workbench_static', sx: 103, sy: 64, sw: 73, sh: 48 },
  anvil_small: { sheet: 'anvil_static', sx: 24, sy: 137, sw: 32, sh: 23 },
  anvil_full: { sheet: 'anvil_static', sx: 6, sy: 37, sw: 53, sh: 34 },
  esoteric_books: { sheet: 'esoteric_props', sx: 0, sy: 160, sw: 32, sh: 28 },

  // 3. 中央營火廣場組件 (Bonfire.png)
  bonfire_pit: { sheet: 'bonfire_static', sx: 2, sy: 72, sw: 28, sh: 21 },
  bonfire_ring: { sheet: 'bonfire_static', sx: 4, sy: 22, sw: 26, sh: 26 },
  log_stool_v: { sheet: 'bonfire_static', sx: 9, sy: 171, sw: 14, sh: 17 },
  log_bench_h: { sheet: 'bonfire_static', sx: 1, sy: 123, sw: 30, sh: 11 },

  // 4. 西側農莊與鋸木穀倉 (Farm.png, Sawmill/Base.png)
  sawmill_barn: { sheet: 'sawmill_base', sx: 144, sy: 1, sw: 112, sh: 75 },
  sawmill_shed: { sheet: 'sawmill_base', sx: 48, sy: 3, sw: 80, sh: 54 },
  chop_stump: { sheet: 'sawmill_base', sx: 0, sy: 22, sw: 31, sh: 26 },
  scarecrow: { sheet: 'farm_props', sx: 244, sy: 33, sw: 24, sh: 47 },
  crop_trellis: { sheet: 'farm_props', sx: 288, sy: 87, sw: 45, sh: 89 },
  crop_tall_grain: { sheet: 'farm_props', sx: 84, sy: 201, sw: 10, sh: 23 },
  crop_golden_head: { sheet: 'farm_props', sx: 80, sy: 178, sw: 16, sh: 14 },
  crop_cabbage: { sheet: 'farm_props', sx: 80, sy: 80, sw: 16, sh: 16 },
  crop_sprout: { sheet: 'farm_props', sx: 32, sy: 178, sw: 16, sh: 14 },
  harvest_crate_grain: { sheet: 'farm_props', sx: 160, sy: 192, sw: 16, sh: 32 },
  harvest_crate_carrot: { sheet: 'farm_props', sx: 160, sy: 0, sw: 16, sh: 32 },
  seed_sack_gold: { sheet: 'farm_props', sx: 0, sy: 194, sw: 16, sh: 30 },
  farm_boxes: { sheet: 'farm_props', sx: 273, sy: 18, sw: 48, sh: 30 },

  // 5. 東側肉架與屠宰工作站 (Cooking Station.png, Meat.png)
  meat_rack_fire_1: { sheet: 'cooking_station', sx: 13, sy: 20, sw: 49, sh: 35 },
  meat_rack_crank_2: { sheet: 'cooking_station', sx: 77, sy: 20, sw: 41, sh: 43 },
  meat_rack_spit_3: { sheet: 'cooking_station', sx: 144, sy: 20, sw: 56, sh: 40 },
  meat_grill_large: { sheet: 'cooking_station', sx: 212, sy: 17, sw: 70, sh: 45 },
  cauldron_tripod: { sheet: 'cooking_station', sx: 11, sy: 67, sw: 42, sh: 52 },
  butcher_cleaver_block: { sheet: 'cooking_station', sx: 80, sy: 179, sw: 32, sh: 29 },
  butcher_table_1: { sheet: 'cooking_station', sx: 144, sy: 160, sw: 48, sh: 48 },
  butcher_table_2: { sheet: 'cooking_station', sx: 208, sy: 160, sw: 69, sh: 64 },
  meat_ham: { sheet: 'meat_props', sx: 32, sy: 65, sw: 23, sh: 14 },
  meat_ribs: { sheet: 'meat_props', sx: 1, sy: 66, sw: 14, sh: 13 },
  meat_steak: { sheet: 'meat_props', sx: 18, sy: 82, sw: 13, sh: 13 },

  // 6. 樹木、灌木、花草、蘑菇與岩石 (Trees, Vegetation.png, Rocks.png)
  tree_oak_green: { sheet: 'trees_m1', sx: 0, sy: 0, sw: 48, sh: 96 },
  tree_oak_gold: { sheet: 'trees_m1', sx: 48, sy: 0, sw: 48, sh: 96 },
  tree_oak_dead: { sheet: 'trees_m1', sx: 96, sy: 0, sw: 48, sh: 96 },
  tree_oak_orange: { sheet: 'trees_m1', sx: 0, sy: 96, sw: 48, sh: 96 },
  tree_oak_amber: { sheet: 'trees_m1', sx: 48, sy: 96, sw: 48, sh: 96 },
  tree_stump: { sheet: 'trees_m1', sx: 192, sy: 10, sw: 16, sh: 22 },

  pine_teal: { sheet: 'trees_m2', sx: 4, sy: 4, sw: 37, sh: 76 },
  pine_forest: { sheet: 'trees_m2', sx: 52, sy: 4, sw: 37, sh: 76 },
  pine_dead: { sheet: 'trees_m2', sx: 99, sy: 6, sw: 40, sh: 74 },
  pine_lush: { sheet: 'trees_m2', sx: 4, sy: 84, sw: 37, sh: 76 },

  pine_tall_green: { sheet: 'trees_m3', sx: 0, sy: 1, sw: 64, sh: 143 },
  pine_tall_dead: { sheet: 'trees_m3', sx: 137, sy: 7, sw: 47, sh: 137 },

  bush_green_sm: { sheet: 'vegetation_props', sx: 2, sy: 5, sw: 29, sh: 27 },
  bush_green_lg: { sheet: 'vegetation_props', sx: 2, sy: 99, sw: 43, sh: 43 },
  bush_autumn_sm: { sheet: 'vegetation_props', sx: 98, sy: 5, sw: 29, sh: 27 },
  flower_lupine: { sheet: 'vegetation_props', sx: 196, sy: 148, sw: 12, sh: 30 },
  mushroom_red: { sheet: 'vegetation_props', sx: 3, sy: 328, sw: 10, sh: 14 },
  mushroom_blue: { sheet: 'vegetation_props', sx: 19, sy: 328, sw: 10, sh: 14 },

  rock_tall_brown: { sheet: 'rocks_props', sx: 2, sy: 19, sw: 28, sh: 43 },
  rock_med_brown: { sheet: 'rocks_props', sx: 35, sy: 19, sw: 26, sh: 27 },
  rock_tall_grey: { sheet: 'rocks_props', sx: 98, sy: 19, sw: 28, sh: 43 },
  rock_med_grey: { sheet: 'rocks_props', sx: 131, sy: 19, sw: 26, sh: 27 },

  // 7. 陣亡骷髏遺體 (取自 Skeleton Death Sheet 最終倒地幀)
  corpse_skeleton: { sheet: 'skel_death', sx: 11 * 64 + 24, sy: 32, sw: 32, sh: 32 }
};

/**
 * 經過像素對齊校正之角色與場景動畫條定義 (所有角色統一對齊至 32x32 內容框，切換 Idle/Walk 絕不跳動縮放)
 */
export const ANIM_STRIPS: Record<string, AnimStripDef> = {
  // 場景動態物件
  fire_anim: { sheet: 'bonfire_fire', frames: 4, cellW: 32, cellH: 48, cropX: 0, cropY: 0, cropW: 32, cropH: 48 },
  smoke_anim: { sheet: 'bonfire_smoke', frames: 4, cellW: 32, cellH: 48, cropX: 0, cropY: 0, cropW: 32, cropH: 48 },
  grill_anim: { sheet: 'grill_anim', frames: 4, cellW: 64, cellH: 64, cropX: 0, cropY: 0, cropW: 64, cropH: 64 },

  // 6 大職業角色與變身巨獸動畫條 (統一對齊腳底與 32x32 角色比例)
  peasant_idle: { sheet: 'peasant_idle', frames: 4, cellW: 64, cellH: 64, cropX: 16, cropY: 16, cropW: 32, cropH: 32 },
  peasant_walk: { sheet: 'peasant_walk', frames: 6, cellW: 64, cellH: 64, cropX: 16, cropY: 16, cropW: 32, cropH: 32 },

  doctor_idle: { sheet: 'tavernA_idle', frames: 4, cellW: 64, cellH: 64, cropX: 16, cropY: 16, cropW: 32, cropH: 32 },
  doctor_walk: { sheet: 'tavernA_walk', frames: 6, cellW: 64, cellH: 64, cropX: 16, cropY: 16, cropW: 32, cropH: 32 },

  hunter_idle: { sheet: 'knight_idle', frames: 4, cellW: 32, cellH: 32, cropX: 0, cropY: 0, cropW: 32, cropH: 32 },
  hunter_walk: { sheet: 'knight_run', frames: 6, cellW: 64, cellH: 64, cropX: 16, cropY: 32, cropW: 32, cropH: 32 },

  seer_idle: { sheet: 'wizzard_idle', frames: 4, cellW: 32, cellH: 32, cropX: 0, cropY: 0, cropW: 32, cropH: 32 },
  seer_walk: { sheet: 'wizzard_run', frames: 6, cellW: 64, cellH: 64, cropX: 16, cropY: 32, cropW: 32, cropH: 32 },

  trickster_idle: { sheet: 'rogue_idle', frames: 4, cellW: 32, cellH: 32, cropX: 0, cropY: 0, cropW: 32, cropH: 32 },
  trickster_walk: { sheet: 'rogue_run', frames: 6, cellW: 64, cellH: 64, cropX: 16, cropY: 32, cropW: 32, cropH: 32 },

  disguise_idle: { sheet: 'tavernB_idle', frames: 4, cellW: 64, cellH: 64, cropX: 16, cropY: 16, cropW: 32, cropH: 32 },
  disguise_walk: { sheet: 'tavernB_walk', frames: 6, cellW: 64, cellH: 64, cropX: 16, cropY: 16, cropW: 32, cropH: 32 },

  beast_idle: { sheet: 'orc_war_idle', frames: 4, cellW: 32, cellH: 32, cropX: 0, cropY: 0, cropW: 32, cropH: 32 },
  beast_walk: { sheet: 'orc_war_run', frames: 6, cellW: 64, cellH: 64, cropX: 16, cropY: 32, cropW: 32, cropH: 32 }
};

/**
 * 地磚無縫拼接區塊定義 (從 Tileset 中擷取實心無縫 48x32 或 48x48 區域，放大 2 倍建立無縫 Pattern)
 */
const TILE_PATTERNS: Record<string, SpriteRegion> = {
  grass_tile: { sheet: 'floors_tiles', sx: 16, sy: 144, sw: 48, sh: 32 },
  cobble_tile: { sheet: 'floors_tiles', sx: 96, sy: 144, sw: 48, sh: 32 },
  dirt_tile: { sheet: 'floors_tiles', sx: 176, sy: 144, sw: 48, sh: 32 },
  stone_plaza_tile: { sheet: 'floors_tiles', sx: 256, sy: 16, sw: 48, sh: 48 },
  sand_tile: { sheet: 'floors_tiles', sx: 80, sy: 352, sw: 80, sh: 32 },
  wood_floor_1: { sheet: 'interior_walls', sx: 16, sy: 336, sw: 48, sh: 48 },
  stone_floor_2: { sheet: 'interior_walls', sx: 96, sy: 336, sw: 48, sh: 48 },
  parquet_floor_3: { sheet: 'interior_walls', sx: 176, sy: 336, sw: 48, sh: 48 },
  oak_floor_4: { sheet: 'interior_walls', sx: 256, sy: 336, sw: 48, sh: 48 }
};

export class SpriteAtlas {
  private sheets: Map<string, HTMLImageElement> = new Map();
  private loaded: Map<string, boolean> = new Map();
  private patternCache: Map<string, CanvasPattern> = new Map();
  public loadedCount: number = 0;
  public totalCount: number = Object.keys(SHEET_URLS).length;

  constructor() {
    this.preloadAll();
  }

  private preloadAll(): void {
    for (const [key, url] of Object.entries(SHEET_URLS)) {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        this.loaded.set(key, true);
        this.loadedCount++;
      };
      img.onerror = () => {
        this.loaded.set(key, false);
      };
      img.src = url;
      this.sheets.set(key, img);
    }
  }

  public getSheet(sheetKey: string): HTMLImageElement | null {
    if (!this.loaded.get(sheetKey)) return null;
    return this.sheets.get(sheetKey) || null;
  }

  /**
   * 從 Tileset 圖集中擷取指定無縫地磚區塊，放大 2x 並建立清晰像素 CanvasPattern
   */
  public getTilePattern(ctx: CanvasRenderingContext2D, patternKey: string, scale: number = 2): CanvasPattern | null {
    const cacheKey = `${patternKey}@${scale}`;
    if (this.patternCache.has(cacheKey)) {
      return this.patternCache.get(cacheKey)!;
    }

    const def = TILE_PATTERNS[patternKey];
    if (!def) return null;
    const img = this.getSheet(def.sheet);
    if (!img) return null;

    const tileCanvas = document.createElement('canvas');
    tileCanvas.width = def.sw * scale;
    tileCanvas.height = def.sh * scale;
    const tctx = tileCanvas.getContext('2d');
    if (!tctx) return null;

    tctx.imageSmoothingEnabled = false;
    tctx.drawImage(img, def.sx, def.sy, def.sw, def.sh, 0, 0, tileCanvas.width, tileCanvas.height);

    const pat = ctx.createPattern(tileCanvas, 'repeat');
    if (pat) {
      this.patternCache.set(cacheKey, pat);
    }
    return pat;
  }

  /**
   * 繪製 SPRITE_REGIONS 中定義的單一精確裁切物件 (以中心點 cx, cy 對齊，保持銳利像素畫質)
   */
  public drawRegionCentered(
    ctx: CanvasRenderingContext2D,
    regionKey: string,
    cx: number,
    cy: number,
    destW?: number,
    destH?: number,
    flipX: boolean = false,
    rotation: number = 0
  ): boolean {
    const reg = SPRITE_REGIONS[regionKey];
    if (!reg) return false;
    const img = this.getSheet(reg.sheet);
    if (!img) return false;

    const w = destW ?? reg.sw * 2;
    const h = destH ?? reg.sh * 2;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(Math.round(cx), Math.round(cy));
    if (rotation !== 0) ctx.rotate(rotation);
    if (flipX) ctx.scale(-1, 1);
    ctx.drawImage(img, reg.sx, reg.sy, reg.sw, reg.sh, -w / 2, -h / 2, w, h);
    ctx.restore();
    return true;
  }

  /**
   * 繪製 ANIM_STRIPS 中定義的序列幀動畫 (自動依 frameIndex 裁切單一影格)
   */
  public drawAnimFrameCentered(
    ctx: CanvasRenderingContext2D,
    stripKey: string,
    frameIndex: number,
    cx: number,
    cy: number,
    destW: number,
    destH: number,
    flipX: boolean = false,
    rotation: number = 0
  ): boolean {
    const strip = ANIM_STRIPS[stripKey];
    if (!strip) return false;
    const img = this.getSheet(strip.sheet);
    if (!img) return false;

    const f = ((frameIndex % strip.frames) + strip.frames) % strip.frames;
    const sx = f * strip.cellW + strip.cropX;
    const sy = strip.cropY;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(Math.round(cx), Math.round(cy));
    if (rotation !== 0) ctx.rotate(rotation);
    if (flipX) ctx.scale(-1, 1);
    ctx.drawImage(img, sx, sy, strip.cropW, strip.cropH, -destW / 2, -destH / 2, destW, destH);
    ctx.restore();
    return true;
  }

  /**
   * 繪製 Alchemy_Table_03-Sheet.png (5x5 網格動畫，每格 80x80)
   */
  public drawAlchemyStation(
    ctx: CanvasRenderingContext2D,
    frameIndex: number,
    cx: number,
    cy: number,
    destW: number,
    destH: number
  ): boolean {
    const img = this.getSheet('alchemy_anim');
    if (!img) return false;
    const f = ((frameIndex % 22) + 22) % 22;
    const col = f % 5;
    const row = Math.floor(f / 5);

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, col * 80, row * 80, 80, 80, Math.round(cx - destW / 2), Math.round(cy - destH / 2), destW, destH);
    ctx.restore();
    return true;
  }
}

export const spriteAtlas = new SpriteAtlas();
