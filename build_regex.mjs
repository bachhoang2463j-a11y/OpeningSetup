#!/usr/bin/env node
/**
 * build_regex.mjs — 从 OpeningSetup.html 自动生成 SillyTavern 正则脚本 JSON
 *
 * 用法：node build_regex.mjs
 *
 * 产物（每次运行重新生成，保持与 HTML 源码同步）：
 *   1. regex-开局初始化.json
 *      显示用正则（仅格式显示）：把楼层中 AI 消息里的「【开局引导】」占位符
 *      替换为整页开场向导 HTML 代码块，由酒馆助手渲染为 iframe。
 *   2. regex-开局引导清理[上下文].json
 *      提示词用正则（仅格式提示词）：从发给 AI 的上下文中剥离占位符，
 *      防 AI 模仿输出该标记，顺带省 token。
 *
 * 嵌入纪律（沿用 MiniMapStatus 构建线）：
 *   · 源码严禁裸三反引号（围栏纪律），构建断言产物围栏数恰为 2；
 *   · 实体免疫：酒馆管线对代码块内容做 HTML 实体解码，统一把产物内所有
 *     & 改写为 &amp;，管线单遍解码后逐字符还原（构建断言一致性）；
 *   · 固定 UUID，重复导入时覆盖更新同 id 脚本。
 *
 * 导入方式：SillyTavern → 扩展 → 正则（Regex）→ 导入脚本。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, 'OpeningSetup.html');
const OUT_DISPLAY = join(__dirname, 'regex-开局初始化.json');
const OUT_STRIP = join(__dirname, 'regex-开局引导清理[上下文].json');

const MARKER = '【开局引导】';
// 固定 id：重复导入时保持同一身份，避免多副本
const DISPLAY_ID = '7c1f2a34-5d6e-4f90-8a1b-2c3d4e5f6a7b';
const STRIP_ID = '8d2f3b45-6e7f-4a01-9b2c-3d4e5f6a7b8c';

function fail(msg) {
  throw new Error('[build_regex] ' + msg);
}

let html = readFileSync(SRC, 'utf8');
// 剥离源文件首尾可能残留的 markdown 围栏，避免破坏外层代码块
html = html.replace(/^```[^\n]*\n/, '').replace(/\n```\s*$/, '');
if (!/<\/html>/i.test(html)) fail('源码内容异常：未找到 </html>');
if (html.includes('```')) fail('源码含裸三反引号，违反围栏纪律');

// 流式高度防回归：酒馆助手 iframe 按内容高度自适应，流式内容里的 100vh/min-h-screen
// 会形成「内容贴 iframe 高度 → iframe 被撑高 → vh 跟涨」的无限延伸循环（真机实测事故）。
// 仅 fixed 装饰层（如 CSS 雾夜背景）允许 vh。断言禁：h-screen / 100vh / Tailwind 任意值 vh。
{
  const bad = html.match(/h-screen|100vh|[0-9.]+vh\]/g) || [];
  if (bad.length) fail('源码含流式 vh/screen 高度（会与酒馆 iframe 自适应高度形成无限延伸循环）: ' + bad.join(', '));
}

// 实体免疫：酒馆管线对代码块内容做 HTML 实体解码，且可能涉及无分号旧式
// 实体（RpgCombat 实测事故）。统一把产物内所有 & 改写为 &amp;：管线单遍
// 解码后逐字符还原，解码结果与改写前逐字节一致（下方断言）。
const immune = html.replace(/&/g, '&amp;');
if (/&(?!amp;)/.test(immune)) fail('全量 & 转义后仍存在非 &amp; 形式的 & 序列');
if (immune.replace(/&amp;/g, '&') !== html) fail('&amp; 还原一致性校验失败');

const replaceString = '```\n' + immune + '\n```';
if ((replaceString.match(/```/g) || []).length !== 2) fail('产物围栏数应为 2，实际异常');

const displayScript = {
  id: DISPLAY_ID,
  scriptName: '开局初始化[开场引导]',
  findRegex: MARKER,
  replaceString,
  trimStrings: [],
  placement: [2], // 仅 AI 输出（角色卡开场白即 AI 消息）
  disabled: false,
  markdownOnly: true,
  promptOnly: false,
  runOnEdit: true,
  substituteRegex: 0,
  minDepth: null,
  maxDepth: null,
};

const stripScript = {
  id: STRIP_ID,
  scriptName: '开局引导清理[上下文]',
  findRegex: MARKER,
  replaceString: '',
  trimStrings: [],
  placement: [2],
  disabled: false,
  markdownOnly: false,
  promptOnly: true,
  runOnEdit: true,
  substituteRegex: 0,
  minDepth: null,
  maxDepth: null,
};

writeFileSync(OUT_DISPLAY, JSON.stringify(displayScript, null, 2), 'utf8');
writeFileSync(OUT_STRIP, JSON.stringify(stripScript, null, 2), 'utf8');
console.log('[build_regex] 已生成: ' + OUT_DISPLAY);
console.log('[build_regex] 已生成: ' + OUT_STRIP);
console.log('  触发标记: ' + MARKER);
console.log('  嵌入HTML大小: ' + replaceString.length + ' 字符');
