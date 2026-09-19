/** Tailwind v3 静态构建配置——由 build-tailwind.cjs 调用（npx tailwindcss@3.4.17）。
 *  content 扫描 OpeningSetup.html 全文（含 JS 模板字符串里的字面量类名）；
 *  safelist 兜住「运行时才知道的类名」——本项目类名全部为源码字面量，暂留空。 */
module.exports = {
  content: ['./OpeningSetup.html'],
  safelist: [],
};
