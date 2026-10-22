/**
 * @file sprite-atlas.ts
 * @description 2D 網路開源像素/手繪精靈圖集載入器 (Battle for Wesnoth CC-BY-SA / GPL 開源精靈資產)
 */

export const SPRITE_MANIFEST: Record<string, string> = {
  // 角色與怪物精靈 (Units)
  peasant: '/assets/sprites/units/peasant.png',
  peasant_idle1: '/assets/sprites/units/peasant_idle1.png',
  peasant_atk1: '/assets/sprites/units/peasant_atk1.png',
  peasant_atk2: '/assets/sprites/units/peasant_atk2.png',

  doctor: '/assets/sprites/units/doctor.png',
  doctor_act1: '/assets/sprites/units/doctor_act1.png',
  doctor_act2: '/assets/sprites/units/doctor_act2.png',

  hunter: '/assets/sprites/units/hunter.png',
  hunter_act1: '/assets/sprites/units/hunter_act1.png',
  hunter_act2: '/assets/sprites/units/hunter_act2.png',

  seer: '/assets/sprites/units/seer.png',
  seer_act1: '/assets/sprites/units/seer_act1.png',
  seer_act2: '/assets/sprites/units/seer_act2.png',

  trickster: '/assets/sprites/units/trickster.png',
  trickster_act1: '/assets/sprites/units/trickster_act1.png',
  trickster_act2: '/assets/sprites/units/trickster_act2.png',

  lord: '/assets/sprites/units/lord.png',
  lord_act1: '/assets/sprites/units/lord_act1.png',
  lord_act2: '/assets/sprites/units/lord_act2.png',

  direwolf: '/assets/sprites/units/direwolf.png',
  direwolf_move: '/assets/sprites/units/direwolf_move.png',
  direwolf_atk: '/assets/sprites/units/direwolf_atk.png',

  // 地形與植被 (Terrain)
  grass1: '/assets/sprites/terrain/grass1.png',
  grass2: '/assets/sprites/terrain/grass2.png',
  grass3: '/assets/sprites/terrain/grass3.png',
  dirt: '/assets/sprites/terrain/dirt.png',
  dirt_dark: '/assets/sprites/terrain/dirt_dark.png',
  road: '/assets/sprites/terrain/road.png',
  stone_path: '/assets/sprites/terrain/stone_path.png',
  wood_floor: '/assets/sprites/terrain/wood_floor.png',
  wood_tan: '/assets/sprites/terrain/wood_tan.png',
  stone_floor: '/assets/sprites/terrain/stone_floor.png',
  farm_crop: '/assets/sprites/terrain/farm_crop.png',
  flowers1: '/assets/sprites/terrain/flowers1.png',
  flowers2: '/assets/sprites/terrain/flowers2.png',
  mushrooms: '/assets/sprites/terrain/mushrooms.png',
  pine1: '/assets/sprites/terrain/pine1.png',
  pine2: '/assets/sprites/terrain/pine2.png',
  tree_summer: '/assets/sprites/terrain/tree_summer.png',
  tree_fall: '/assets/sprites/terrain/tree_fall.png',
  tree_great: '/assets/sprites/terrain/tree_great.png',
  tree_dead: '/assets/sprites/terrain/tree_dead.png',
  house_human1: '/assets/sprites/terrain/house_human1.png',
  house_human2: '/assets/sprites/terrain/house_human2.png',
  house_human3: '/assets/sprites/terrain/house_human3.png',
  house_cabin1: '/assets/sprites/terrain/house_cabin1.png',
  house_cabin2: '/assets/sprites/terrain/house_cabin2.png',
  house_elven: '/assets/sprites/terrain/house_elven.png',

  // 建築與大型場景物件 (Scenery)
  fire1: '/assets/sprites/scenery/fire1.png',
  fire2: '/assets/sprites/scenery/fire2.png',
  fire3: '/assets/sprites/scenery/fire3.png',
  fire4: '/assets/sprites/scenery/fire4.png',
  fire5: '/assets/sprites/scenery/fire5.png',
  fire6: '/assets/sprites/scenery/fire6.png',
  fire7: '/assets/sprites/scenery/fire7.png',
  fire8: '/assets/sprites/scenery/fire8.png',
  windmill: '/assets/sprites/scenery/windmill.png',
  temple: '/assets/sprites/scenery/temple.png',
  well: '/assets/sprites/scenery/well.png',
  signpost: '/assets/sprites/scenery/signpost.png',
  monolith1: '/assets/sprites/scenery/monolith1.png',
  monolith2: '/assets/sprites/scenery/monolith2.png',
  magic_circle: '/assets/sprites/scenery/magic_circle.png',
  oak_leaning: '/assets/sprites/scenery/oak_leaning.png',
  pine_tall1: '/assets/sprites/scenery/pine_tall1.png',
  pine_tall2: '/assets/sprites/scenery/pine_tall2.png',
  rock1: '/assets/sprites/scenery/rock1.png',
  rock2: '/assets/sprites/scenery/rock2.png',
  rock_cairn: '/assets/sprites/scenery/rock_cairn.png',
  tent_weapons: '/assets/sprites/scenery/tent_weapons.png',
  door_closed: '/assets/sprites/scenery/door_closed.png',

  // 室內外互動道具與家具 (Items)
  wheat_sheaf: '/assets/sprites/items/wheat_sheaf.png',
  straw_bale1: '/assets/sprites/items/straw_bale1.png',
  straw_bale2: '/assets/sprites/items/straw_bale2.png',
  scarecrow: '/assets/sprites/items/scarecrow.png',
  barrel: '/assets/sprites/items/barrel.png',
  box: '/assets/sprites/items/box.png',
  chest: '/assets/sprites/items/chest.png',
  chest_open: '/assets/sprites/items/chest_open.png',
  altar: '/assets/sprites/items/altar.png',
  altar_evil: '/assets/sprites/items/altar_evil.png',
  book1: '/assets/sprites/items/book1.png',
  book2: '/assets/sprites/items/book2.png',
  potion_red: '/assets/sprites/items/potion_red.png',
  potion_blue: '/assets/sprites/items/potion_blue.png',
  potion_green: '/assets/sprites/items/potion_green.png',
  crystal_ball: '/assets/sprites/items/crystal_ball.png',
  torch: '/assets/sprites/items/torch.png',
  brazier1: '/assets/sprites/items/brazier1.png',
  brazier2: '/assets/sprites/items/brazier2.png',
  bones: '/assets/sprites/items/bones.png',
  bonestack: '/assets/sprites/items/bonestack.png',
  archery_target: '/assets/sprites/items/archery_target.png',
  anvil: '/assets/sprites/items/anvil.png'
};

export class SpriteAtlas {
  private images: Map<string, HTMLImageElement> = new Map();
  private loaded: Map<string, boolean> = new Map();
  private patterns: Map<string, CanvasPattern> = new Map();
  public loadedCount: number = 0;
  public totalCount: number = Object.keys(SPRITE_MANIFEST).length;

  constructor() {
    this.preloadAll();
  }

  private preloadAll(): void {
    for (const [key, url] of Object.entries(SPRITE_MANIFEST)) {
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
      this.images.set(key, img);
    }
  }

  public get(key: string): HTMLImageElement | null {
    if (!this.loaded.get(key)) return null;
    return this.images.get(key) || null;
  }

  public isAllLoaded(): boolean {
    return this.loadedCount >= this.totalCount * 0.85;
  }

  public getPattern(ctx: CanvasRenderingContext2D, key: string): CanvasPattern | null {
    if (this.patterns.has(key)) {
      return this.patterns.get(key)!;
    }
    const img = this.get(key);
    if (!img) return null;
    const pat = ctx.createPattern(img, 'repeat');
    if (pat) {
      this.patterns.set(key, pat);
    }
    return pat;
  }

  /**
   * 繪製精靈圖片（自動以中心點 (cx, cy) 對齊，若圖片尚未載入則返回 false 供呼叫端繪製備援圖形）
   */
  public drawCentered(
    ctx: CanvasRenderingContext2D,
    key: string,
    cx: number,
    cy: number,
    width?: number,
    height?: number,
    flipX: boolean = false,
    rotation: number = 0
  ): boolean {
    const img = this.get(key);
    if (!img) return false;

    const w = width ?? img.naturalWidth;
    const h = height ?? img.naturalHeight;

    ctx.save();
    ctx.translate(cx, cy);
    if (rotation !== 0) ctx.rotate(rotation);
    if (flipX) ctx.scale(-1, 1);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
    return true;
  }
}

export const spriteAtlas = new SpriteAtlas();
