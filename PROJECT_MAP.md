# PROJECT MAP: 幽影微語 (Whisper of Shadows)
> **設計宗旨**：高內聚、低耦合、拒絕程式碼肥大、Token 友善（AI Context-Lean Specification）。
> 任何 AI 代理在接手任務時，僅需閱讀本檔案與對應模組的 `.d.ts` 或 `types.ts`，即可完全理解上下文。

---

## 1. 核心架構分層 (Architectural Layers)

```
whisper-game/
├── .ai-context.md          # AI 協同開發規則與 Token 節約指引
├── PROJECT_MAP.md          # 系統全域架構地圖與模組職責（本檔）
├── REFERENCES.md           # CC 授權、開源素材與外部資產溯源清單
├── index.html              # 單頁極簡 Entry，零多餘 DOM 負擔
├── package.json            # 依賴精簡（拒絕肥大函式庫）
├── tsconfig.json           # 嚴格型別檢查 (Strict Mode)
├── vite.config.ts          # 快速現代化打包
└── src/
    ├── core/               # 【核心邏輯層】純 TypeScript，零外部依賴、零 DOM 依賴
    │   ├── types.ts        # 全域資料型別、角色、狀態定義
    │   ├── state-machine.ts# 遊戲核心狀態機 (Lobby -> Day -> Night -> Meeting -> End)
    │   ├── roles.ts        # 微創新非對稱角色機制與技能判定
    │   └── engine.ts       # 遊戲邏輯循環 (Tick, 倒數, 投票與結算)
    ├── net/                # 【網路同步層】WebRTC / PeerJS 抽象層 (可隨時抽換)
    │   ├── protocol.ts     # 網路通訊協定與封包介面 (Packet Types)
    │   ├── p2p-host.ts     # 開房者 (權威狀態伺服器 Host Engine)
    │   ├── p2p-client.ts   # 加入者 (客戶端輸入傳遞與狀態插值)
    │   └── peer-manager.ts # PeerJS 連線生命週期管理
    ├── render/             # 【視覺渲染層】Canvas 2D 俯視小人與地圖渲染
    │   ├── canvas-view.ts  # 主 Canvas 迴圈與雙緩衝
    │   ├── camera.ts       # 視角跟隨與視野迷霧 (Fog of War)
    │   ├── map-renderer.ts # 輕量瓦片/區域與環境繪製
    │   └── entity-sprite.ts# 玩家俯視角色、走動動畫、朝向與標記
    ├── input/              # 【操作控制層】鍵盤/搖桿輸入監聽與座標標準化
    │   └── input-controller.ts
    └── ui/                 # 【介面互動層】輕量 HUD、聊天、技能按鈕與投票面板
        ├── hud.ts          # 角色身分卡、技能冷卻、剩餘時間
        ├── meeting-modal.ts# 緊急會議/圓桌投票介面
        └── room-lobby.ts   # 房間代碼複製、玩家列表、角色配置
```

---

## 2. 模組解耦契約 (Contracts & Boundaries)

1. **`core/` 絕對禁止引用 `render/` 或 `ui/`**：
   - 核心邏輯必須可跑在純 Node/Web Worker 或無畫面測試環境。
   - 所有遊戲狀態變更僅透過純事件 (Actions) 驅動。
2. **`net/` 僅負責傳遞序列化封包**：
   - Host 接收 Client 的 `InputPacket`，經由 `core/` 判定後向全員廣播 `GameStateSnapshot`。
   - 拒絕 Client 端私自計算結果，嚴防 P2P 作弊。
3. **`render/` 僅作為消費端 (Consumer)**：
   - 只讀取當前 State 或快照進行內插渲染，不包含任何傷害判定或身分結算邏輯。

---

## 3. 開發里程碑 (Milestones)

- [x] **M1 (基礎骨架與協定)**：建立 Vite + TS、Core Types、Net Protocol 封包定義。
- [x] **M2 (狀態機與微創新角色)**：6 人非對稱角色技能 (幽影/守秘人/狂徒等)、核心狀態機、破盾與處決判定已 100% 單元驗證通過。
- [x] **M3 (2D Canvas 俯視視野與移動)**：玩家移動碰撞、雙緩衝渲染、地圖祭壇與警鐘互動。
- [x] **M4 (P2P WebRTC 連線與同步)**：Host/Client 封包互傳、房間代碼連線生成與複製、狀態廣播與大廳等待室。
- [x] **M5 (動態迷霧視野 Fog of War 與音效回饋)**：動態多邊形光線投射與長廊視線遮蔽 (Raycasting LOS)、CC0 44.1kHz 高音質音效庫 (鐘鳴/石板腳步/心跳/破盾/暗殺)。
- [ ] **M6 (祭壇破譯任務解謎與全場結算畫面)**：祭壇長按儀式充能微遊戲、勝利榮譽卡牌、全方位代碼審查與瑕疵修復。
