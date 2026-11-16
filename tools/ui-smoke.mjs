// 通过 CDP 驱动 headless Chrome，对真实页面做端到端冒烟测试。
const BASE = 'http://localhost:4317/';

const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const page = list.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));

let id = 0;
const pending = new Map();
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
  }
});
function send(method, params = {}) {
  const mid = ++id;
  ws.send(JSON.stringify({ id: mid, method, params }));
  return new Promise((resolve, reject) => pending.set(mid, { resolve, reject }));
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function evalJs(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('JS error: ' + JSON.stringify(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text));
  return r.result.value;
}

let pass = 0, fail = 0;
const check = (cond, msg) => { cond ? pass++ : fail++; console.log((cond ? '  ✓ ' : '  ✗ ') + msg); };

await send('Page.enable');
await send('Runtime.enable');
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: 'window.__errs=[];window.addEventListener("error",e=>window.__errs.push(String(e.message)));window.addEventListener("unhandledrejection",e=>window.__errs.push(String(e.reason)));',
});
await send('Page.navigate', { url: BASE });
await sleep(1500);

// 1. 初始渲染
check(await evalJs(`document.querySelector('h1').textContent.includes('InvisiScan')`), '标题渲染');
check(await evalJs(`document.querySelectorAll('.dropzone').length === 1`), '拖拽区渲染');

// 2. 载入样例
await evalJs(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('内置投毒样例')).click()`);
await sleep(800);
const stats = await evalJs(`[...document.querySelectorAll('.stat .num')].map(e => e.textContent)`);
console.log('  统计卡数字:', stats.join(' / '));
check(stats[0] !== '0', '载入样例后出现可疑命中统计');
check(await evalJs(`document.querySelectorAll('.file-item').length === 8`), '列出 8 个仓库文件');

// 3. finding 卡片与展开
const cardCount = await evalJs(`document.querySelectorAll('.finding').length`);
check(cardCount > 0, `当前文件渲染 ${cardCount} 张 finding 卡片`);
await evalJs(`document.querySelector('.finding-head').click()`);
await sleep(200);
check(await evalJs(`document.querySelectorAll('.dual-panel .panel').length === 2`), '展开后出现左右两个顺序面板');
check(await evalJs(`document.querySelector('.panel-head').textContent.includes('编辑器里看到的顺序')`), '左面板为编辑器视觉顺序');
check(await evalJs(`[...document.querySelectorAll('.panel-head')].some(e => e.textContent.includes('编译器实际读到的顺序'))`), '右面板为编译器逻辑顺序');
check(await evalJs(`document.querySelectorAll('.cell.bidi, .cell.invis').length > 0`), '不可见字符以占位 chip 渲染');
check(await evalJs(`document.querySelectorAll('.cell.marked').length > 0`), '当前问题码点有高亮标记');

// 4. 切到 kernel_patch.c 看 RLO
await evalJs(`[...document.querySelectorAll('.file-item .path')].find(e => e.textContent.includes('kernel_patch')).click()`);
await sleep(200);
check(await evalJs(`document.body.textContent.includes('kernel_patch.c')`), '切换到 kernel_patch.c');
const bidiCards = await evalJs(`[...document.querySelectorAll('.finding-head .badge.cat')].filter(b => b.textContent.includes('双向')).length`);
check(bidiCards >= 1, `kernel_patch.c 有 ${bidiCards} 张双向控制符卡片`);

// 5. 切到 clean.go
await evalJs(`[...document.querySelectorAll('.file-item .path')].find(e => e.textContent.includes('clean.go')).click()`);
await sleep(200);
check(await evalJs(`document.querySelector('.empty-state')?.textContent.includes('没有发现可疑字符')`), 'clean.go 显示空状态');

// 6. 关闭 bidi 类别 → 重新扫描后 bidi 命中消失
await evalJs(`(() => {
  const rows = [...document.querySelectorAll('.sidebar .toggle-row')];
  const bidiRow = rows.find(r => r.textContent.includes('双向控制符'));
  bidiRow.querySelector('input').click();
})()`);
await sleep(300);
await evalJs(`[...document.querySelectorAll('.file-item .path')].find(e => e.textContent.includes('kernel_patch')).click()`);
await sleep(200);
const remainingBidi = await evalJs(`[...document.querySelectorAll('.finding-head .badge.cat')].filter(b => b.textContent.includes('双向')).length`);
check(remainingBidi === 0, '关闭 bidi 类别后双向命中消失（重新扫描生效）');

// 7. 重新打开 bidi
await evalJs(`(() => {
  const rows = [...document.querySelectorAll('.sidebar .toggle-row')];
  rows.find(r => r.textContent.includes('双向控制符')).querySelector('input').click();
})()`);
await sleep(300);

// 8. 字符串忽略开关：legitimate.js
await evalJs(`[...document.querySelectorAll('.file-item .path')].find(e => e.textContent.includes('legitimate')).click()`);
await sleep(200);
const before = await evalJs(`document.querySelectorAll('.finding').length`);
// 打开“忽略注释内”（字符串忽略默认已开）
await evalJs(`(() => {
  const rows = [...document.querySelectorAll('.sidebar .toggle-row')];
  rows.find(r => r.textContent.includes('忽略注释内')).querySelector('input').click();
})()`);
await sleep(300);
const after = await evalJs(`document.querySelectorAll('.finding').length`);
check(before > 0 && after === 0, `注释忽略开关生效（${before} → ${after}）`);

// 9. 控制台错误检查（通过监听）
const errors = await evalJs(`window.__errs || []`);
check(errors.length === 0, '无未捕获 JS 错误');

console.log(`\nUI 冒烟：${pass} 通过，${fail} 失败`);
ws.close();
process.exit(fail ? 1 : 0);
