# REFERENCES & ATTRIBUTION (資產與參考來源清單)

本專案恪遵開源與創用 CC (Creative Commons) 授權規範。所有外部引入之美術、音效、字型或第三方演算法均於此清單完整記錄出處、作者與授權方式。

---

## 1. 核心相依套件 (Dependencies)

| 項目 | 用途 | 授權條款 | 來源 / 倉庫 |
| :--- | :--- | :--- | :--- |
| **Vite** | 極速前端構建與開發伺服器 | MIT License | https://github.com/vitejs/vite |
| **TypeScript** | 強型別靜態檢查 | Apache-2.0 | https://github.com/microsoft/TypeScript |
| **PeerJS** | WebRTC 抽象封裝 (P2P 連線) | MIT License | https://github.com/peers/peerjs |

---

## 2. 視覺與圖形素材 (Visual & 3D Assets)

| 資產名稱 | 類型 | 授權協議 | 作者 / 出處 | 備註 |
| :--- | :--- | :--- | :--- | :--- |
| **Medieval People 3D Character Pack (User Uploaded)** | 3D Low-Poly 中世紀村民與王族角色模型 (FBX 轉 GLB) | 使用者授權素材 (CraftPix Royalty-Free License) | https://craftpix.net/file-licenses/ | 透過 Blender 5.2 將 T-Pose 骨架調整為自然放鬆站姿、底部歸零 (`min_z=0`) 並內嵌烘焙 `people_texture_map.png` 貼圖為 14 份 `.glb` 角色模型 (`peasant_1~6`, `city_dwellers_1~2`, `rich_citizens_1~4`, `king`, `queen`) |
| **Simple Nature Pack (User Uploaded)** | 3D Low-Poly 自然環境物件 (FBX 轉 GLB) | 使用者授權素材 (Royalty-Free / CC) | 上傳壓縮包解壓縮 | 透過 Blender 5.2 移除重疊 `LOD1` 破圖網格、歸零地面高度 (`min_z=0`) 並內嵌烘焙 `SimpleNature_Texture_01.png` 貼圖為 24 份 `.glb` 自然模型 (樹木/岩石/灌木/花草/蘑菇) |
| **LowPoly_Farm_02.blend** | 3D Low-Poly 農莊村莊模型庫 (本機萃取) | 使用者授權素材 (CC / Royalty-Free) | `c:\Users\reyliou\Downloads\LowPoly_Farm_02.blend` | 透過 Blender 5.2 修復遺失的 `color_1024x1024.jpg` 調色盤、按 UV 島座標自動重建 Principled BSDF 實體材質與夜窗發光、底部對齊地面 (`min_z=0`)，導出 13 份 `.glb` (`house_01~04.glb`, `barn.glb`, `watchtower.glb`, `bonfire.glb`, `bench.glb`, `barrel.glb`, `crate.glb`, `cart.glb`, `streetlight.glb`, `wheat_crop.glb`) |
| **Kenney Fantasy Town Kit** | 3D Low-Poly 模組化村莊與小屋 (glTF/GLB) | CC0 1.0 Universal (Public Domain) | Kenney (https://kenney.nl/assets/fantasy-town-kit) | 160+ 個中世紀房屋、屋頂、門窗、農作物與圍欄 |
| **Quaternius Medieval Village MegaKit** | 3D Low-Poly 村莊室內外建築 (glTF/FBX) | CC0 1.0 Universal (Public Domain) | Quaternius (https://quaternius.itch.io/medieval-village-megakit) | 300+ 模組化建築物件，支援室內外無縫穿透 |
| **KayKit Medieval Hexagon & Village** | 3D Low-Poly 中世紀道具與自然景觀 | CC0 1.0 Universal (Public Domain) | Kay Lousberg (https://kaylousberg.itch.io) | 樹木、營火、木箱、木桶與小麥 |
| **Procedural Vector Sprites** | 角色俯視圖形 (2D 備援) | MIT / CC0 (自繪) | 專案內建代碼生成 | 使用 Canvas Path 程序化繪製 |

---

## 3. 音效與環境音樂 (Audio Assets - Open Source Medieval Sound Library)

| 資產檔案 | 用途 | 授權協議 | 作者 / 出處 | 格式規格 |
| :--- | :--- | :--- | :--- | :--- |
| **`public/assets/audio/bell.ogg`** | 晨曦鳥鳴與營火晨會環境音效 | GPLv2+ / Open Source Game Audio | *Battle for Wesnoth* (`ambient/morning.ogg`) | Ogg Vorbis |
| **`public/assets/audio/night.ogg`** | 暗夜降臨環境音效 | GPLv2+ / Open Source Game Audio | *Battle for Wesnoth* (`ambient/night.ogg`) | Ogg Vorbis |
| **`public/assets/audio/campfire.ogg`** | 村莊中央營火柴火劈啪聲 | GPLv2+ / Open Source Game Audio | *Battle for Wesnoth* (`ambient/campfire.ogg`) | Ogg Vorbis |
| **`public/assets/audio/heartbeat.ogg`** | 暗夜獵殺戰鼓壓迫循環聲 | GPLv2+ / Open Source Game Audio | *Battle for Wesnoth* (`ambient/wardrums.ogg`) | Ogg Vorbis |
| **`public/assets/audio/footstep.wav`** | 走動與揮鐮割麥音效 | GPLv2+ / Open Source Game Audio | *Battle for Wesnoth* (`dagger-swish.wav`) | WAV PCM |
| **`public/assets/audio/door.wav`** | 木屋開關門與門栓反鎖音效 | GPLv2+ / Open Source Game Audio | *Battle for Wesnoth* (`open-chest.wav`) | WAV PCM |
| **`public/assets/audio/shield.wav`** | 藥劑師庇護與治療音效 | GPLv2+ / Open Source Game Audio | *Battle for Wesnoth* (`heal.wav`) | WAV PCM |
| **`public/assets/audio/wolf.ogg`** | 狼人變身狂暴巨狼咆哮聲 | GPLv2+ / Open Source Game Audio | *Battle for Wesnoth* (`wolf-growl-1.ogg`) | Ogg Vorbis |
| **`public/assets/audio/kill.ogg`** | 狼人撕咬與吞食鮮肉音效 | GPLv2+ / Open Source Game Audio | *Battle for Wesnoth* (`bite.ogg`) | Ogg Vorbis |

---

## 4. 規則與機制參考 (Inspirations)

- **Among Us / Goose Goose Duck**：空間走動、迷霧視野與緊急召集會議機制。
- **傳統狼人殺 (Mafia / Werewolf)**：社交推理、日夜流轉與投票處決。
- **克蘇魯/幽影微創新機制**：非對稱心智值 (Sanity) 與微暗殺機制。
