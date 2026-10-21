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
| **LowPoly_Farm_02.blend** | 3D Low-Poly 農莊村莊模型庫 (本機萃取) | 使用者授權素材 (CC / Royalty-Free) | `c:\Users\reyliou\Downloads\LowPoly_Farm_02.blend` | 透過 Blender 5.2 背景導出為 `house_01.glb`, `bonfire.glb`, `wheat_crop.glb`, `bench.glb`, `tree_01.glb` 等 |
| **Kenney Fantasy Town Kit** | 3D Low-Poly 模組化村莊與小屋 (glTF/GLB) | CC0 1.0 Universal (Public Domain) | Kenney (https://kenney.nl/assets/fantasy-town-kit) | 160+ 個中世紀房屋、屋頂、門窗、農作物與圍欄 |
| **Quaternius Medieval Village MegaKit** | 3D Low-Poly 村莊室內外建築 (glTF/FBX) | CC0 1.0 Universal (Public Domain) | Quaternius (https://quaternius.itch.io/medieval-village-megakit) | 300+ 模組化建築物件，支援室內外無縫穿透 |
| **KayKit Medieval Hexagon & Village** | 3D Low-Poly 中世紀道具與自然景觀 | CC0 1.0 Universal (Public Domain) | Kay Lousberg (https://kaylousberg.itch.io) | 樹木、營火、木箱、木桶與小麥 |
| **Procedural Vector Sprites** | 角色俯視圖形 (2D 備援) | MIT / CC0 (自繪) | 專案內建代碼生成 | 使用 Canvas Path 程序化繪製 |

---

## 3. 音效與環境音樂 (Audio Assets - CC0 1.0 Universal)

| 資產檔案 | 用途 | 授權協議 | 作者 / 出處 | 取樣規格 |
| :--- | :--- | :--- | :--- | :--- |
| **`public/assets/audio/bell.wav`** | 古堡銅鐘長鳴（緊急會議敲鐘） | CC0 1.0 Universal | 專案專用高保真聲學物理合成器生成 | 16-bit 44.1kHz Mono PCM |
| **`public/assets/audio/footstep.wav`** | 石板走動腳步回饋 | CC0 1.0 Universal | 專案專用高保真聲學物理合成器生成 | 16-bit 44.1kHz Mono PCM |
| **`public/assets/audio/heartbeat.wav`** | 壓抑雙心跳（幽影靠近 / Sanity 緊縮） | CC0 1.0 Universal | 專案專用高保真聲學物理合成器生成 | 16-bit 44.1kHz Mono PCM |
| **`public/assets/audio/shield.wav`** | 庇護聖光破裂（防禦抵擋成功） | CC0 1.0 Universal | 專案專用高保真聲學物理合成器生成 | 16-bit 44.1kHz Mono PCM |
| **`public/assets/audio/kill.wav`** | 幽影暗殺背刺（突襲處決打擊） | CC0 1.0 Universal | 專案專用高保真聲學物理合成器生成 | 16-bit 44.1kHz Mono PCM |

---

## 4. 規則與機制參考 (Inspirations)

- **Among Us / Goose Goose Duck**：空間走動、迷霧視野與緊急召集會議機制。
- **傳統狼人殺 (Mafia / Werewolf)**：社交推理、日夜流轉與投票處決。
- **克蘇魯/幽影微創新機制**：非對稱心智值 (Sanity) 與微暗殺機制。
