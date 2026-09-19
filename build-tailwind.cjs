#!/usr/bin/env node
/** Tailwind 静态构建（移植自 RpgCombat build-tailwind.cjs：替代 Play CDN 运行时 JIT——
 *  MutationObserver 全文档监听 × 高频 DOM 变动的持续编译税 + 楼层 iframe 外链依赖，
 *  改为构建期一次编译、产物内联回单文件）。
 *  用法：node build-tailwind.cjs（build_regex.mjs 会先自动跑本脚本，改类名无需单独执行）
 *  - 首次运行：移除 OpeningSetup.html 的 Play CDN <script>，编译产物以标记块插入 </head> 前
 *    （与 Play CDN 实测注入位置一致：标准模式 head 末尾、自定义 <style> 之后，级联顺序不变）
 *  - 后续运行：只替换标记块内容
 *  注意：改动 OpeningSetup.html 里的 Tailwind 类名后必须重跑本脚本（或 build_regex.mjs），
 *        新类名才有样式。 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = __dirname;
const HTML = path.join(ROOT, 'OpeningSetup.html');
const OUT = path.join(ROOT, '.tmp-tw-out.css');
const TW_VERSION = '3.4.17'; // v3 末版，与 Play CDN 同大版本（dvh/任意值语法一致）

const START_MARK = '<!-- TAILWIND-CSS-START 由 build-tailwind.cjs 生成，勿手改：改类名后运行 node build_regex.mjs -->';
const END_MARK = '<!-- TAILWIND-CSS-END -->';
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function fail(msg) { console.error('[build-tailwind] 失败：' + msg); process.exit(1); }

// 1. 编译（CLI 全文扫描 OpeningSetup.html：HTML 标记 + JS 模板字符串里的字面量类名都能提取）
console.log('[build-tailwind] 编译 tailwindcss@' + TW_VERSION + ' …');
try {
  execSync(`npx -y tailwindcss@${TW_VERSION} -c tailwind.config.cjs -i tailwind-in.css -o "${OUT}" --minify`,
    { cwd: ROOT, stdio: 'pipe', maxBuffer: 32 * 1024 * 1024 });
} catch (e) {
  fail('Tailwind CLI 执行失败：' + (e.stderr ? e.stderr.toString().slice(0, 500) : e.message));
}
const css = fs.readFileSync(OUT, 'utf8').trim();
fs.unlinkSync(OUT);

// 2. 产物健全性检查
if (css.length < 20000) fail('编译产物过小（' + css.length + ' 字节），疑似 content 扫描失败');
for (const sentinel of ['.flex{', '.min-h-screen{', '.sm\\:grid-cols-2{']) {
  if (!css.includes(sentinel)) fail('编译产物缺少哨兵类 ' + sentinel + '（safelist 或扫描异常）');
}
if (css.includes('```')) fail('编译产物含三连反引号，会破坏组件围栏纪律');
if (/<\/style/i.test(css)) fail('编译产物含 </style，会提前截断 style 块');
if (css.includes('\r')) fail('编译产物含 CR，行尾风格异常');

// 3. 写回 OpeningSetup.html（全程保留 CRLF）
let html = fs.readFileSync(HTML, 'utf8');
const block = START_MARK + '\r\n<style>\r\n' + css + '\r\n</style>\r\n' + END_MARK;
const blockRe = new RegExp(esc(START_MARK) + '[\\s\\S]*?' + esc(END_MARK));
const styleCountBefore = (html.match(/<style>/g) || []).length;
const isReplace = blockRe.test(html);

if (isReplace) {
  html = html.replace(blockRe, block);
  console.log('[build-tailwind] 替换既有标记块');
} else {
  const cdnRe = /[ \t]*<script src="https:\/\/cdn\.tailwindcss\.com"><\/script>\r?\n/;
  if (!cdnRe.test(html)) fail('既无标记块也找不到 Play CDN script 行，无法确定插入方式');
  html = html.replace(cdnRe, '');
  html = html.replace(/\r?\n<\/head>/, (m) => '\r\n' + block + '\r\n</head>');
  console.log('[build-tailwind] 首次构建：已移除 Play CDN script，标记块插入 </head> 前');
}
fs.writeFileSync(HTML, html);

// 4. 写回后结构自检（替换路径块数不变；首次插入路径 +1）
const final = fs.readFileSync(HTML, 'utf8');
const styleCountAfter = (final.match(/<style>/g) || []).length;
const expectCount = isReplace ? styleCountBefore : styleCountBefore + 1;
if (final.includes('cdn.tailwindcss.com')) fail('写回后仍残留 cdn.tailwindcss.com 引用');
if (!blockRe.test(final) || final.match(new RegExp(esc(START_MARK), 'g')).length !== 1) {
  fail('标记块数量异常（应为 1）');
}
if (styleCountAfter !== expectCount) {
  fail('写回后 <style> 块数 ' + styleCountAfter + ' ≠ 预期 ' + expectCount + '（' + (isReplace ? '替换路径应不变' : '插入路径应 +1') + '）');
}
console.log('[build-tailwind] 完成：产物 ' + css.length + ' 字节，OpeningSetup.html ' + final.split('\n').length + ' 行');
