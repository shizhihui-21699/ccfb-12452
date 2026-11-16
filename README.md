# InvisiScan — 源码隐形字符扫描台

针对 Trojan Source（CVE-2021-42574）类攻击的浏览器端扫描工具：导入代码仓库的
zip 压缩包，在浏览器本地解压并逐码点分析，揪出代码审查中肉眼无法发现的隐形字符
与形近字符。**所有处理均在浏览器内完成，源码不会离开本机。**

## 它查什么

| 类别 | 码点示例 | 风险 |
| --- | --- | --- |
| 双向控制符 | RLO `U+202E`、RLI `U+2067`、FSI `U+2068`、PDF/PDI 等 | 让注释与代码在编辑器中的视觉顺序颠倒，代码看着像注释 |
| 零宽/不可见 | ZWSP `U+200B`、ZWNJ `U+200C`、ZWJ `U+200D`、BOM `U+FEFF`、软连字符 `U+00AD` | 拼出肉眼相同但语义不同的标识符 |
| 形近/混写 | 西里尔 `а`/`е`/`о`、希腊 `ο`/`α`、全角拉丁 `Ａ` | 标识符中混入同形异码字符，绕过人工审查与 grep |
| 格式控制符 | 隐形运算符 `U+2061-2064`、行/段分隔符 `U+2028/2029` | 隐藏逻辑、破坏 JS 解析器 |
| Tags 隐藏块 | `U+E0000..E007F` | 携带不可见的隐藏文本 |
| C0/C1 控制符 | 除 tab/LF/CR 外的控制字符 | 终端注入、日志伪造 |
| 非常规空白 | NBSP、窄 NBSP、EN/EM/THIN SPACE、表意空格 | 缩进投毒，diff 中不可见 |
| 变体选择符 | VS1-16（默认关闭） | 改变前一字符字形，按需启用 |

每处问题并排展示两个序列：

- **编辑器里看到的顺序**：经简化 UAX #9 双向算法重排后的视觉序列，隐形字符以
  缩写占位（如 `RLO`、`ZWSP`）显示；
- **编译器实际读到的顺序**：文件中真实的码点存储序列（逻辑顺序）。

## 按语言忽略合法用法

内置 30+ 语言的字符串/注释状态机（C 系、Python、Rust、Go、JVM 系、Web 系、
SQL、Fortran、汇编等）。可分别开关：

- 忽略字符串字面量内的隐形字符（默认开）；
- 忽略注释内的隐形字符（**默认关**——注释正是 Trojan Source 的主要藏身点）；
- 形近字符仅在标识符内检查（默认开）。

## 快速开始

```bash
npm install
npm run dev          # 开发服务器
npm run build        # 产出 dist/，可直接静态托管
npm run make-repo    # 重新生成内置投毒样例仓库 public/sample-repo.zip
node tools/test-scanner.mjs   # 引擎单测（32 项）
node tools/ui-smoke.mjs       # 需先 npm run build && npm run preview，无头浏览器冒烟（16 项）
```

打开页面后点「载入内置投毒样例仓库」即可看到全部检测能力的演示。

## 测试仓库说明

`tools/make-test-repo.mjs` 生成 8 个文件的投毒样例（明文输出在 `testrepo-src/`，
打包产物在 `public/sample-repo.zip`），包含：

- `auth.js` / `kernel_patch.c` —— RLO/PDF、RLI/PDI 双向攻击；
- `payment.py` —— ZWSP/ZWJ/ZWNJ、软连字符、中段 BOM；
- `access_control.go` —— 西里尔/希腊/全角形近字符混写；
- `page.html` —— Tags 隐藏块；
- `legitimate.js` —— 合法用法对照组（字符串/注释内）；
- `clean.go` / `README.md` —— 零误报对照组（含中文与全角标点）。

> `testrepo-src/` 是不可信测试数据，请勿直接运行其中代码。

## 架构

```
src/lib/
  chars.js     可疑字符分类标准与形近字符表（审计判定规则只看这一个文件）
  langs.js     语言 profile、字符串/注释区域状态机、标识符判定
  bidi.js      简化 UAX #9：显式嵌套/覆盖/隔离 + 隐式层级 + L2 反转
  scanner.js   逐码点扫描、混写标识符检测、行级双向视图
  archive.js   fflate 解压、容量与元数据过滤
src/components/ Svelte 5 组件（LineView 为双顺序对照渲染）
```

## 边界与取舍

- 双向算法是教学级简化实现，覆盖显式控制符与常见隐式场景，不追求 UBA 全部分支
  （如 N0-N4 编号规则、镜像字符）；判定问题是否存在不依赖它，它只负责可视化。
- 形近字符表是人工挑选的高风险集合，不是 UTS#39 全量 confusables 表，刻意控制误报。
- 仅支持 zip/jar；tar.gz 会给出明确报错而非静默跳过。
- 单仓库上限 2000 文件 / 解压后 20MB，防止内存耗尽。
