# 美术管线 SOP — 两段式：imgen 定调 → 批量 API 铺量

- **日期**：2026-06-02
- **状态**：生效（轻量美术管线的操作规范）
- **上游设计**：总设计 `docs/superpowers/specs/2026-06-01-sengoku-redo-monorepo-design.md` §8（轻量美术/音频管线）
- **适用阶段**：R3 起接入美术占位；本 SOP 现在即可用于「定调」探索

---

## 1. 为什么两段式

| 环节 | 工具 | 角色 | 产出 |
|---|---|---|---|
| **定调（上游）** | `imgen`（Codex 图片 CLI，质量更高） | 视觉锚点生成器 | 少量 high-quality 概念图，锁定风格参数 |
| **铺量（下游）** | agnes-ai `image-2.1-flash`（~$0.003/张，便宜） | 批量苦力 | 按锚点风格批量生成事件插画/立绘/图标 |

**核心逻辑**：先用 imgen 生成 1~N 张高质量「视觉锚点」，从中提炼可复述的**风格参数**（色温 / 媒介 / 构图）；批量 API 在 prompt 里复述这组参数 + 换主体，从而风格对齐。不让便宜 API 自己「猜风格」。

---

## 2. 风格锚点登记

> 每生成一张定调锚点，在此登记：文件、它确立的风格参数、原始 prompt。批量 API 必须复述「风格参数」列。

### 锚点 A — 朝议厅主视觉（court-audience-bg）

- **文件**：`design/art/concept/court-audience-bg.png`（1536×1024, high）
- **用途**：web 主界面 / 评定（朝议）场景背景
- **确立的风格参数**（批量复述用）：
  1. **色温**：烛光暖橘 + 深暗部（`warm candle/lantern light, moody dark background`）
  2. **媒介**：水墨 + 写实绘画混合（`ink-wash painting aesthetic mixed with painterly realism`）
  3. **构图法则**：中央偏下大面积留白，供叠加 UI 面板与文字（`empty negative space in center-lower area`）
  4. **题材锁**：日本战国，金箔屏风、榻榻米、裃/具足（`Sengoku-era, gold-leaf fusuma, tatami, kamishimo/armor`）
  5. **铁律**：`no text, no letters`（游戏内文字一律前端渲染）
- **原始 prompt**：
  ```
  Japanese Sengoku-era daimyo war council scene inside a castle audience hall,
  viewed as an atmospheric game UI background. Tatami floor, sliding fusuma
  screens with subtle gold-leaf clouds, a low dais where the lord sits, kneeling
  retainers in muted earth-tone armor and kamishimo, warm candle and lantern
  light, ink-wash painting aesthetic mixed with subtle painterly realism, moody
  dark background suitable for overlaying UI panels and text, empty negative
  space in the center-lower area, no text, no letters, cinematic, refined, historical
  ```

---

## 3. imgen 速查（定调用）

```bash
# 文生图（定调锚点，用 high 质量）
imgen "<英文 prompt>" -s 1536x1024 -q high -o design/art/concept/<name>.png

# 图生图（基于锚点微调，保持构图）
imgen "<想怎么改>, keep composition and style" -i design/art/concept/<name>.png -o <out>.png

# 透明背景（做图标/贴纸）
imgen "<icon desc>, bold clean outline" -b transparent -o <icon>.png
```

- 尺寸：横版背景 `1536x1024`；竖版立绘 `1024x1536`；图标 `1024x1024`；最长边 ≤ 3840。
- 约 15–30 秒/张，Bash `timeout` 设 180000。
- 失败码：401/403=未登录，429=限流，400=参数（如尺寸超限）。

---

## 4. prompt 规范（两段共用）

1. **英文**（响应质量更好），中文需求先转译，保留构图/风格细节。
2. **必带** `no text, no letters`——游戏内文字一律前端渲染，不让图像模型写字。
3. **背景类**必带中央/下方留白描述，供叠加 UI。
4. **批量铺量**时，prompt 必须复述对应锚点的「风格参数」三件套（色温/媒介/构图）+ 换主体。
5. **题材锁**：所有图保持日本战国语境（与 `content/` period-bible 一致）。

---

## 5. 目录约定

| 目录 | 内容 | 入库 |
|---|---|---|
| `design/art/concept/` | imgen 定调锚点（少量、高质量、人工筛选） | ✅ 入库（设计资产） |
| `design/art/` | 本 SOP + art bible（如有） | ✅ |
| `apps/web/public/assets/` | 最终成品（批量生成 → 人工精修后落库） | ✅ 入库（运行时资源） |

> 批量 API 返回的 URL 是临时 bucket（不可直链），必须**立即下载落库**（见总设计 §8）。

---

## 6. 优先级（与总设计 §8 一致）

事件插画 / UI 背景 / 概念图 > 立绘（图生图 + 精修）> 图标。
运行时零图像 API 调用——全部静态资源。

---

## 7. 角色归属

- 定调判断、锚点 prompt、风格参数提炼：`art-director`（休眠角色，按需启用）/ 由主控代行
- 批量管线脚本（限流/退避/落库）：`cloudflare-devops` / `tools-programmer`
- web 端资源接入：`frontend-engineer`
