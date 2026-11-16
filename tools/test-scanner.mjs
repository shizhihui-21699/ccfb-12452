// 引擎单测 + 样例仓库端到端校验。运行：node tools/test-scanner.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { scanFile, DEFAULT_OPTIONS } from '../src/lib/scanner.js';
import { analyzeLine } from '../src/lib/bidi.js';
import { classify } from '../src/lib/chars.js';
import { buildRegions, profileFor } from '../src/lib/langs.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
let passed = 0, failed = 0;

function assert(cond, msg) {
  if (cond) { passed++; console.log('  ✓', msg); }
  else { failed++; console.error('  ✗', msg); }
}

// ---------- 1. 双向算法：经典 RLO 攻击行 ----------------------------------------
console.log('\n[1] bidi 视觉顺序');
{
  // if (x) RLO } /* ... 模拟 Trojan Source：视觉上像注释，逻辑上是代码
  const line = Array.from(`if (x) ${String.fromCodePoint(0x202e)}/* hi */${String.fromCodePoint(0x202c)} y`, c => c.codePointAt(0));
  const { visualOrder, levels } = analyzeLine(line);
  assert(visualOrder.length === line.length, '视觉序列长度与逻辑序列一致');
  const rloIdx = line.indexOf(0x202e);
  const pdfIdx = line.indexOf(0x202c);
  assert(levels[rloIdx] >= 1, 'RLO 之后的嵌入层级升高为奇数（RTL）');
  // RLO..PDF 区间内的字符在视觉序列里应被反转
  // RLO..PDF 之间的内容（BN 控制符本身不参与 L2 重排）在视觉序列里应被反转
  const contentIndices = [];
  for (let i = rloIdx + 1; i < pdfIdx; i++) contentIndices.push(i);
  const contentVisualPos = visualOrder.filter(i => i > rloIdx && i < pdfIdx);
  assert(
    contentVisualPos.length === contentIndices.length &&
    JSON.stringify(contentVisualPos) === JSON.stringify([...contentIndices].reverse()),
    'RLO 覆盖区间的内容在视觉序列中发生反转'
  );
  assert(contentVisualPos[0] === pdfIdx - 1 && contentVisualPos.at(-1) === rloIdx + 1,
    '反转后区间首尾位置正确（末尾字符出现在最前）');
  // 纯 LTR 普通行顺序不变
  const plain = Array.from('hello world', c => c.codePointAt(0));
  const p = analyzeLine(plain);
  assert(JSON.stringify(p.visualOrder) === JSON.stringify(plain.map((_, i) => i)), '纯英文行视觉顺序与逻辑顺序相同');
}

// ---------- 2. 分类器 ------------------------------------------------------------
console.log('\n[2] 字符分类');
{
  assert(classify(0x202e).category === 'bidi', 'U+202E RLO 归类为 bidi');
  assert(classify(0x200b).category === 'zerowidth', 'U+200B ZWSP 归类为 zerowidth');
  assert(classify(0x0430).category === 'homoglyph', '西里尔 а 归类为 homoglyph');
  assert(classify(0xe0041).category === 'tags', 'Tags 区字符归类为 tags');
  assert(classify(0x00a0).category === 'whitespace', 'NBSP 归类为 whitespace');
  assert(classify(0x0041) === null, 'ASCII A 不报警');
  assert(classify(0x4e2d) === null, 'CJK 汉字“中”不报警（避免中文误报）');
  assert(classify(0x0645) === null, '阿拉伯字母本身不报警（显式 bidi 控制符才报）');
}

// ---------- 3. 区域识别 ----------------------------------------------------------
console.log('\n[3] 字符串/注释区域');
{
  const src = `const a = "zwsp​"; // cmt‮\nlet b = 1;`;
  const cps = Array.from(src, c => c.codePointAt(0));
  const { profile } = profileFor('x.js');
  const region = buildRegions(cps, profile);
  const strIdx = cps.indexOf(0x200b);
  const rloIdx = cps.indexOf(0x202e);
  assert(region[strIdx] === 'string', '字符串内的 ZWSP 被标为 string 区域');
  assert(region[rloIdx] === 'comment', '注释内的 RLO 被标为 comment 区域');
  const codeB = cps.lastIndexOf(0x62); // b
  assert(region[codeB] === 'code', '第二行变量处于 code 区域');
}

// ---------- 4. 样例仓库端到端 ----------------------------------------------------
console.log('\n[4] sample-repo 端到端');
const zip = readFileSync(join(root, 'public', 'sample-repo.zip'));
const entries = unzipSync(zip);
const allFindings = [];
for (const [path, bytes] of Object.entries(entries)) {
  const name = path.replace('sample-repo/', '');
  const r = scanFile(name, bytes, DEFAULT_OPTIONS);
  const cats = {};
  for (const f of r.findings) { cats[f.category] = (cats[f.category] ?? 0) + 1; }
  console.log(`  ${name}: ${r.findings.length} 命中`, JSON.stringify(cats), r.binary ? '[binary]' : '');
  allFindings.push(...r.findings.map(f => ({ ...f, file: name })));
}

const byFile = (f) => allFindings.filter(x => x.file === f);
assert(byFile('clean.go').length === 0, 'clean.go 零误报');
assert(byFile('README.md').length === 0, 'README.md（中文+全角标点）零误报');
assert(byFile('auth.js').some(f => f.category === 'bidi'), 'auth.js 检出 bidi 控制符');
assert(byFile('kernel_patch.c').some(f => f.category === 'bidi'), 'kernel_patch.c 检出 RLO 攻击');
assert(byFile('payment.py').some(f => f.category === 'zerowidth'), 'payment.py 检出零宽字符');
assert(byFile('payment.py').some(f => f.cp === 0xfeff), 'payment.py 检出中段 BOM');
assert(byFile('access_control.go').some(f => f.category === 'homoglyph' && f.inIdentifier),
  'access_control.go 检出标识符内西里尔混写');
assert(byFile('access_control.go').some(f => f.cp === 0x03bf), 'access_control.go 检出希腊 omicron 冒充 o');
assert(byFile('access_control.go').some(f => f.cp === 0xff21), 'access_control.go 检出全角 A');
assert(byFile('page.html').some(f => f.category === 'tags'), 'page.html 检出 Tags 隐藏字符');
assert(byFile('kernel_patch.c').some(f => f.cp === 0x2028), 'kernel_patch.c 检出 U+2028 行分隔符');
assert(byFile('kernel_patch.c').some(f => f.cp === 0x00a0), 'kernel_patch.c 检出 NBSP');

// ---------- 5. 忽略开关 ----------------------------------------------------------
console.log('\n[5] 忽略选项');
{
  const r = scanFile('legitimate.js', entries['sample-repo/legitimate.js'], {
    ...DEFAULT_OPTIONS, ignoreInString: true, ignoreInComment: true,
  });
  assert(r.findings.length === 0, '字符串+注释忽略开启后 legitimate.js 零命中');
  const r2 = scanFile('legitimate.js', entries['sample-repo/legitimate.js'], {
    ...DEFAULT_OPTIONS, ignoreInString: false, ignoreInComment: false,
  });
  assert(r2.findings.length >= 2, '关闭忽略后 legitimate.js 能检出字符串/注释里的隐形字符');
  // 注释忽略默认关闭 → 默认配置下注释里的 RLO 必须被抓到
  const r3 = scanFile('legitimate.js', entries['sample-repo/legitimate.js'], DEFAULT_OPTIONS);
  assert(r3.findings.some(f => f.cp === 0x202e), '默认配置不放过注释中的 RLO');
}

// ---------- 6. 二进制跳过 ---------------------------------------------------------
console.log('\n[6] 二进制探测');
{
  const bin = new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x00, 0x00]);
  const r = scanFile('a.out', bin, DEFAULT_OPTIONS);
  assert(r.binary === true, 'ELF 二进制被识别并跳过');
}

console.log(`\n结果：${passed} 通过，${failed} 失败`);
process.exit(failed ? 1 : 0);
