// 生成“被投毒”的测试仓库并打成 zip。
// 运行：node tools/make-test-repo.mjs
// 产物：testrepo-src/（解压后的明文，方便人工核对）与 public/sample-repo.zip
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync, strToU8 } from 'fflate';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const outDir = join(root, 'testrepo-src');
const PREFIX = 'sample-repo/';

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

// 便捷码点
const cp = (n) => String.fromCodePoint(n);
const RLO = cp(0x202e), PDF = cp(0x202c), RLI = cp(0x2067), PDI = cp(0x2069);
const LRO = cp(0x202d), LRI = cp(0x2066);
const ZWSP = cp(0x200b), ZWJ = cp(0x200d), ZWNJ = cp(0x200c), SHY = cp(0x00ad);
const BOM = cp(0xfeff), NBSP = cp(0x00a0), LSEP = cp(0x2028);
const TAG_A = cp(0xe0041); // Tags 块里的 'a'
const CYR_a = cp(0x0430), CYR_e = cp(0x0435), CYR_o = cp(0x043e), CYR_p = cp(0x0440);
const CYR_c = cp(0x0441), CYR_s = cp(0x0455);
const GREEK_o = cp(0x03bf), GREEK_a = cp(0x03b1);
const FULLWIDTH_A = cp(0xff21);

const files = {};

// 1) 经典 Trojan Source：RLO 让 if 条件在编辑器里“看起来被注释掉了”
files['auth.js'] = [
  '// 登录鉴权逻辑',
  'function isAdmin(user) {',
  '  // 下面这行在编辑器里看似被注释，实际条件仍会执行：',
  `  if (user.role === "admin") ${RLO}/* /*${PDF} {`,
  '    grantRootAccess(user);',
  '  }',
  `  // 隔离版攻击：${RLI}/* end-users only ${PDI}`,
  '  logAccess(user);',
  '  return user;',
  '}',
  '',
].join('\n');

// 2) 零宽字符藏在变量名里（两个肉眼相同、实际不同的函数名）
files['payment.py'] = [
  'def charge_user(amount):',
  '    # 第二个函数名里混了 ZWSP，肉眼无法区分，却是另一个函数',
  `def charge${ZWSP}user(amount):`,
  '    # 软连字符藏在金额字段里',
  `    amount${SHY}total = amount * 100`,
  '    # ZWJ 拼接的“隐形”标识符',
  `    rec${ZWJ}eipt = record_payment(amount${SHY}total)`,
  '    return receipt if False else rec_eipt',
  '',
  'def record_payment(value):',
  '    # BOM 出现在文件中间而非文件头，属于可疑用法',
  `    marker = ${BOM}"ok"`,
  '    return {"value": value, "marker": marker}',
  '',
].join('\n');

// 3) 西里尔/希腊形近字符 + 全角字符混写
files['access_control.go'] = [
  'package main',
  '',
  '// 西里尔 а(0x0430) 与拉丁 a 同形，整个标识符肉眼无法分辨',
  `func vаlidateRole(role string) bool {`,       // validate 中的 a 是西里尔 а
  '    switch role {',
  `    case "admin":`,
  `        return true`,
  '    }',
  '    return false',
  '}',
  '',
  '// 希腊 omicron ο 冒充拉丁 o',
  `var secretTοken = "do-not-ship"`,             // Token 的 o 是希腊 ο
  '',
  '// 全角拉丁 A 混进常量名',
  `const ${FULLWIDTH_A}PI_KEY = "sk-xxxx"`,
  '',
  '// 混写更密集的例子：Cyrillic e / p / c / s',
  `func chеck${CYR_p}ermission() bool { return fals${CYR_e} }`,
  '',
].join('\n');

// 4) C 语言版：注释反转 + 非常规空白 + 行分隔符
files['kernel_patch.c'] = [
  '// 内核热补丁（测试样例）',
  '#include <stdio.h>',
  '',
  'int check_capability(int cap) {',
  `    if (cap == 0) ${RLO}/* ${LRO}bypass${PDF} */${PDF}`,
  '        return 1; /* 提权路径 */',
  '    return 0;',
  '}',
  '',
  '// NBSP 混在缩进里，diff 工具很难发现',
  'int' + NBSP + 'legacy_field = 0;',
  '',
].join('\n') + LSEP + '\n// 上一行末尾藏了 U+2028 行分隔符\n';

// 5) 合法用法对照组：字符串与注释里的隐形字符应可被忽略
files['legitimate.js'] = [
  '// 对照组：下面的隐形字符都在字符串/注释里，开启忽略后不应报出',
  'const arabicPhrase = "مرحبا"; // 阿拉伯语本身触发 R 方向，但没有显式 bidi 控制符',
  `const zeroWidthDemo = "a${ZWSP}b"; // 字符串里的 ZWSP`,
  `// 注释里的 RLO 演示 ${RLO}reversed${PDF}`,
  'const normal = "plain ascii string";',
  'function regularName() { return 42; }',
  '',
].join('\n');

// 6) 干净文件：零命中，验证误报率
files['clean.go'] = [
  'package main',
  '',
  'import "fmt"',
  '',
  'func CleanSum(xs []int) int {',
  '    total := 0',
  '    for _, x := range xs {',
  '        total += x',
  '    }',
  '    fmt.Println("all ascii, no tricks")',
  '    return total',
  '}',
  '',
].join('\n');

// 7) Tags 隐藏文本 + HTML 注释场景
files['page.html'] = [
  '<!doctype html>',
  '<html>',
  '  <!-- 页面模板 -->',
  `  <h1>Hello</h1>`,
  `  <!-- 隐藏标记字符：${TAG_A}${cp(0xe0042)} -->`,
  '  <script>',
  `    var api${ZWNJ}Url = "https://example.invalid";`,
  '  </script>',
  '</html>',
  '',
].join('\n');

// 8) README：说明这是测试仓库（text profile，默认没有字符串/注释概念）
files['README.md'] = [
  '# sample-repo',
  '',
  '这是 InvisiScan 的测试仓库，刻意植入了以下问题：',
  '',
  '1. auth.js / kernel_patch.c —— RLO/PDF 双向控制符（CVE-2021-42574 类）',
  '2. payment.py —— ZWSP/ZWJ/ZWNJ/软连字符/BOM',
  '3. access_control.go —— 西里尔、希腊、全角形近字符混写',
  '4. legitimate.js —— 合法用法对照（字符串/注释内）',
  '5. clean.go —— 干净对照',
  '6. page.html —— Tags 隐藏字符',
  '',
  '注意：本目录为不可信测试数据，请勿直接运行其中的代码。',
  '',
].join('\n');

// 写明文副本
for (const [name, content] of Object.entries(files)) {
  const p = join(outDir, name);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content, 'utf8');
}

// 打 zip（带统一顶层目录）
const zipped = zipSync(Object.fromEntries(
  Object.entries(files).map(([name, content]) => [PREFIX + name, strToU8(content)])
));
mkdirSync(join(root, 'public'), { recursive: true });
writeFileSync(join(root, 'public', 'sample-repo.zip'), zipped);

// 简单统计
const total = Object.values(files).reduce((n, s) => n + Array.from(s).length, 0);
console.log(`generated ${Object.keys(files).length} files, ${total} code points -> public/sample-repo.zip`);
for (const [name, s] of Object.entries(files)) {
  const suspicious = Array.from(s).filter(ch => {
    const cpv = ch.codePointAt(0);
    return cpv > 0x7f;
  }).length;
  console.log(`  ${name}: ${suspicious} non-ASCII code points`);
}
