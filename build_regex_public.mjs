#!/usr/bin/env node
/**
 * build_regex_public.mjs — 从 OpeningSetup-公开版.html 自动生成 SillyTavern 公开版正则脚本 JSON
 *
 * 用法：node build_regex_public.mjs
 *
 * 产物：
 *   1. regex-开局初始化[公开版].json
 *   2. regex-开局引导清理[上下文][公开版].json
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, 'OpeningSetup-公开版.html');
const OUT_DISPLAY = join(__dirname, 'regex-开局初始化[公开版].json');
const OUT_STRIP = join(__dirname, 'regex-开局引导清理[上下文][公开版].json');

const MARKER = '【开局引导】';
// 公开版固定 id
const DISPLAY_ID = '7c1f2a34-5d6e-4f90-8a1b-2c3d4e5f6a7c';
const STRIP_ID = '8d2f3b45-6e7f-4a01-9b2c-3d4e5f6a7b8d';

function fail(msg) {
  throw new Error('[build_regex_public] ' + msg);
}

let html = readFileSync(SRC, 'utf8');
// 剥离源文件首尾可能残留的 markdown 围栏，避免破坏外层代码块
html = html.replace(/^```[^\n]*\n/, '').replace(/\n```\s*$/, '');
if (!/<\/html>/i.test(html)) fail('源码内容异常：未找到 </html>');
if (html.includes('```')) fail('源码含裸三反引号，违反围栏纪律');

// 流式高度防回归
{
  const htmlNoTw = html.replace(/<!-- TAILWIND-CSS-START[\s\S]*?<!-- TAILWIND-CSS-END -->/g, '');
  const bad = htmlNoTw.match(/(?<!min-)h-screen|100vh|[0-9.]+vh\]/g) || [];
  if (bad.length) fail('源码含流式 vh/screen 高度（会与酒馆 iframe 自适应高度形成无限延伸循环）: ' + bad.join(', '));
}

// 实体免疫：统一把产物内所有 & 改写为 &amp;
const immune = html.replace(/&/g, '&amp;');
if (/&(?!amp;)/.test(immune)) fail('全量 & 转义后仍存在非 &amp; 形式的 & 序列');
if (immune.replace(/&amp;/g, '&') !== html) fail('&amp; 还原一致性校验失败');

const replaceString = '```\n' + immune + '\n```';
if ((replaceString.match(/```/g) || []).length !== 2) fail('产物围栏数应为 2，实际异常');

const displayScript = {
  id: DISPLAY_ID,
  scriptName: '开局初始化[开场引导][公开版]',
  findRegex: MARKER,
  replaceString,
  trimStrings: [],
  placement: [2], // 仅 AI 输出
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
  scriptName: '开局引导清理[上下文][公开版]',
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
console.log('[build_regex_public] 已生成: ' + OUT_DISPLAY);
console.log('[build_regex_public] 已生成: ' + OUT_STRIP);
console.log('  触发标记: ' + MARKER);
console.log('  嵌入HTML大小: ' + replaceString.length + ' 字符');
