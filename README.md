# OpeningSetup · 开场初始化前端

仿「regex-修仙开局」的**一次性开场向导**：1920 年代悬疑推理风（动态背景视频 + 半透明玻璃拟态 UI）。
玩家在向导中了解故事背景、选购初始技能与物品、更换立绘；确认时一次性把数据写入
**MiniMapStatus**（状态栏）与**前端战斗 v11+**（RpgCombat）两个插件，并以
**AI 助手角色身份**把开场白作为楼层消息注入聊天流（不填输入栏、不触发 AI 重新生成）。

## 项目形态

单 HTML 源码 + 构建脚本 → 酒馆正则 JSON（酒馆助手 iframe 项目）：

| 文件 | 说明 |
|---|---|
| `OpeningSetup.html` | 唯一源码：UI 向导 + OPENING_DATA 配置区 + 写入链路 |
| `build_regex.mjs` | 构建：内嵌 HTML → 正则 JSON（围栏纪律 & 实体免疫断言） |
| `regex-开局初始化.json` | 产物：AI 消息中 `【开局引导】` → 整页向导 iframe |
| `regex-开局引导清理[上下文].json` | 产物：promptOnly 剥离占位符（防 AI 模仿输出 + 省 token） |
| `integration-test/harness.html` | 回归：mock 酒馆助手接口跑断言（不进真酒馆） |

## 使用流程

1. **导入**：SillyTavern → 扩展 → 正则（Regex）→ 依次导入两个产物 JSON（固定 UUID，更新时重复导入即覆盖）。
2. **触发**：新开聊天，让角色卡开场白（或任意 AI 消息）包含 `【开局引导】`，该楼层即渲染为向导界面。
3. **走完向导**：标题 → 故事背景 → 身份登记 → 技能选购 → 物品选购 → 立绘选择 → 签署委托书。
4. **幂等**：完成后再打开同一聊天的向导楼层，只显示「归档摘要」，不会重复写入。
   重开新档 = 新开聊天，或删除聊天变量 `$opening_setup_done` 后刷新。

## 写入链路（确认时一次性执行，每步幂等可安全重试）

| 步骤 | 目标 | 变量 / 接口 |
|---|---|---|
| 立绘选择 | MiniMapStatus | 聊天变量 `$mms_portrait_choice` |
| 战斗档案 | RpgCombat | 聊天变量 `rpg_combat_roster`（`{version:1, heroes:[…]}`，与战斗前端存档同构） |
| 开场白 | 聊天流 | `createChatMessages([{role:'assistant', message}], {insert_before:'end'})`；旧版酒馆助手降级 `triggerSlash('/sendas …')` |
| 幂等标记 | 本组件 | 聊天变量 `$opening_setup_done` |

开场白消息 = 叙事正文 + `【立绘 立绘键】` + `<Status_block>` 初始 YAML。
状态栏正则吃同一标签：会在这条楼渲染状态栏并把 `stat_data` 持久化到楼层消息变量，
前端战斗又从 `stat_data` 读初始数值——两个插件的既有同步链路自然打通。

## 配置（全部在 `OpeningSetup.html` 的 OPENING_DATA 配置区）

- **BGM**：`bgm.url` 填《I Don't Want to Set the World on Fire》(The Ink Spots) 音频直链；
  留空时标题页提示未配置，声音开关只控制背景视频。
- **背景视频**：`bgVideo.url` 填动态视频直链（同修仙开局的 `<video>` 方案）；留空走 CSS 雾夜动画兜底。
- **故事背景**：`story.pages`（分页文案）、`story.title`。
- **初始人物**：`identity`（默认名/职业/属性串/穿着/内心/`baseConfig` 初始面板）。
- **预算**：`shop.skillPoints` / `shop.itemPoints`。
- **技能 / 物品**：`skills` / `items` 数组。`shopCost`/`desc` 是向导展示字段；
  `data` 是 RpgCombat 持久化字段（`_serializeSkillForRoster` / 物品序列化同构）。
  **占位数值是示意**：`type`/`power`/`fxTag`/`classType` 等语义请按战斗前端编辑器的实际定义调整。
- **立绘**：`portraits[].key` 必须与 MiniMapStatus 图片表的立绘键（`PORTRAIT_MAP`）一致才能被识别；
  `url` 仅用于向导内预览。占位键为空 URL 时显示剪影。
- **开场白**：`openingTemplate`（`{名字}{技能清单}{物品清单}` 占位）、`status`（日期/地点/行动选项）。

改完源码后**必须重新构建并重新导入**（酒馆渲染的是 JSON 里内嵌的副本）：

```
node build_regex.mjs
```

## 回归测试（不进真酒馆）

```
node -e "<harness 技能内置静态服务器脚本>"   # 8123 起自动递增
# 打开 http://127.0.0.1:<port>/OpeningSetup/integration-test/harness.html → 运行全部断言
```

覆盖：端到端主流程（四步写入 shape 与顺序）/ 幂等（重复 boot 不二次写入、双击防抖、重试防重复落楼）/
边界（点数预算拒绝）/ 失败路径（接口抛错出错误面板可重试）/ 开关回退（done 标记存在时进摘要模式）。
