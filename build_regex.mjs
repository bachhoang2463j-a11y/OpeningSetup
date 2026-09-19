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
import { execSync } from 'node:child_process';

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

// 前置：Tailwind 静态编译（幂等；改了类名无需单独跑 build-tailwind，本脚本先跑它）
console.log('[build_regex] 前置：node build-tailwind.cjs');
try {
  execSync('node build-tailwind.cjs', { cwd: __dirname, stdio: 'inherit' });
} catch (e) { fail('build-tailwind.cjs 失败，中止'); }

let html = readFileSync(SRC, 'utf8');
// 剥离源文件首尾可能残留的 markdown 围栏，避免破坏外层代码块
html = html.replace(/^```[^\n]*\n/, '').replace(/\n```\s*$/, '');
if (!/<\/html>/i.test(html)) fail('源码内容异常：未找到 </html>');
if (html.includes('```')) fail('源码含裸三反引号，违反围栏纪律');

// 流式高度防回归：酒馆助手 iframe 按内容高度自适应，流式内容里的 100vh/h-screen
// 会形成「内容贴 iframe 高度 → iframe 被撑高 → vh 跟涨」的无限延伸循环（真机实测事故）。
// 仅 fixed 装饰层（如 CSS 雾夜背景）允许 vh。断言禁：裸 h-screen / 100vh / Tailwind 任意值 vh。
// 豁免 min-h-screen（7466034 起阶段外壳用它做任意视口垂直居中）：文档流内仅剩 #app
// 单根容器、min-h-screen 外壳是唯一在流元素且内边距都在 border-box 内，doc 高 =
// max(自然高, 100vh) 有平衡点不追逐；当年循环根源（流内 chrome 与 vh 元素并列叠高）
// 已随 dock 拆除全部转 fixed，此豁免经结构核验后放行。
{
  // Tailwind 编译块是构建生成的静态 <style>（.min-h-screen{min-height:100vh} 等工具类文本），
  // 不属于流内 vh 元素；断言前先摘除，块内容质量由 build-tailwind.cjs 自查。
  const htmlNoTw = html.replace(/<!-- TAILWIND-CSS-START[\s\S]*?<!-- TAILWIND-CSS-END -->/g, '');
  const bad = htmlNoTw.match(/(?<!min-)h-screen|100vh|[0-9.]+vh\]/g) || [];
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
