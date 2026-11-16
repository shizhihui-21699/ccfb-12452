// 按语言识别注释与字符串区域，用于忽略其中的“合法”隐形字符用法。
// 每个 profile 是一组状态机规则；未知扩展名走 text（不忽略任何东西）。

const HASH = { line: ['#'] };
const SLASH = { line: ['//'], block: [['/*', '*/']] };
const DASH = { line: ['--'] };
const SEMI = { line: [';'] };
const BANG = { line: ['!'] };
const PERCENT = { line: ['%'] };

// 字符串引号：true 表示支持三重引号
const STR_STD = ['"', "'"];

export const LANG_PROFILES = {
  c:    { comments: SLASH, strings: STR_STD, raw: [['R"', '"']] },
  cpp:  { comments: SLASH, strings: [...STR_STD, '`'], raw: [['R"', '"']] },
  java: { comments: SLASH, strings: STR_STD, raw: [['"""', '"""']] },
  cs:   { comments: SLASH, strings: [...STR_STD, '`'], raw: [['@"', '"']] },
  js:   { comments: SLASH, strings: [...STR_STD, '`'], raw: [['`', '`']] },
  go:   { comments: SLASH, strings: STR_STD, raw: [['`', '`']] },
  rust: { comments: SLASH, strings: STR_STD, raw: [['r#"', '"#'], ['r"', '"']] },
  swift:{ comments: SLASH, strings: STR_STD },
  scala:{ comments: SLASH, strings: [...STR_STD, '`'] },
  kotlin:{ comments: SLASH, strings: [...STR_STD, '`'], raw: [['"""', '"""']] },
  php:  { comments: SLASH, strings: STR_STD, hash: true },
  cheader: { comments: SLASH, strings: STR_STD },
  python: {
    comments: HASH,
    strings: STR_STD,
    raw: [['"""', '"""'], ["'''", "'''"], ['f"""', '"""'], ["f'''", "'''"]],
  },
  ruby:   { comments: HASH, strings: STR_STD, raw: [['%w[', ']']] },
  perl:   { comments: HASH, strings: STR_STD },
  bash:   { comments: HASH, strings: STR_STD },
  sh:     { comments: HASH, strings: STR_STD },
  yaml:   { comments: HASH, strings: STR_STD },
  toml:   { comments: HASH, strings: [...STR_STD, "'''", '"""'] },
  r:      { comments: HASH, strings: STR_STD },
  lua:    { comments: { line: ['--'] }, strings: STR_STD },
  haskell:{ comments: DASH, strings: STR_STD },
  sql:    { comments: { line: ['--'], block: [['/*', '*/']] }, strings: ["'", '"'] },
  asm:    { comments: SEMI, strings: STR_STD },
  fortran:{ comments: BANG, strings: STR_STD },
  matlab: { comments: PERCENT, strings: STR_STD },
  html:   { comments: { block: [['<!--', '-->']] }, strings: STR_STD, tags: true },
  xml:    { comments: { block: [['<!--', '-->']] }, strings: STR_STD, tags: true },
  css:    { comments: SLASH, strings: STR_STD },
  text:   { comments: { line: [] }, strings: [] },
};

const EXT_MAP = {
  c: 'c', h: 'cheader', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp', hh: 'cpp',
  java: 'java', cs: 'cs', js: 'js', mjs: 'js', cjs: 'js', jsx: 'js', ts: 'js',
  mts: 'js', cts: 'js', tsx: 'js', vue: 'html', svelte: 'html',
  go: 'go', rs: 'rust', swift: 'swift', scala: 'scala', kt: 'kotlin', kts: 'kotlin',
  php: 'php', py: 'python', pyw: 'python', rb: 'ruby', pl: 'perl', pm: 'perl',
  sh: 'bash', bash: 'bash', zsh: 'bash', yml: 'yaml', yaml: 'yaml', toml: 'toml',
  r: 'r', lua: 'lua', hs: 'haskell', sql: 'sql', s: 'asm', asm: 'asm',
  f90: 'fortran', f95: 'fortran', m: 'matlab',
  html: 'html', htm: 'html', xml: 'xml', svg: 'xml', css: 'css', scss: 'css',
  md: 'text', markdown: 'text', txt: 'text', json: 'text', csv: 'text',
  lock: 'text', log: 'text',
};

export function profileFor(path) {
  const ext = path.split('.').pop().toLowerCase();
  const name = EXT_MAP[ext] ?? 'text';
  return { name, profile: LANG_PROFILES[name] };
}

// 返回与 codePoints 等长的区域数组：'code' | 'comment' | 'string'
export function buildRegions(codePoints, profile) {
  const n = codePoints.length;
  const region = new Array(n).fill('code');
  if (!profile || profile === LANG_PROFILES.text) return region;

  const lineComments = profile.comments?.line ?? [];
  const blockComments = profile.comments?.block ?? [];
  const strings = profile.strings ?? [];
  const raws = profile.raw ?? [];
  const allOpeners = [
    ...blockComments.map(([o, c]) => ({ s: o, type: 'comment', end: c })),
    ...raws.map(([o, c]) => ({ s: o, type: 'string', end: c })),
    ...strings.map(q => ({ s: q, type: 'string', end: q })),
  ].sort((a, b) => b.s.length - a.s.length);

  let i = 0;
  let state = 'code'; // code | linecomment | block | string
  let ender = null;   // 终止序列

  const at = (s) => {
    for (let k = 0; k < s.length; k++) {
      if (codePoints[i + k] !== s.charCodeAt(k)) return false;
    }
    return true;
  };

  while (i < n) {
    const cp = codePoints[i];

    if (state === 'linecomment') {
      region[i] = 'comment';
      if (cp === 0x0a) state = 'code';
      i++;
      continue;
    }
    if (state === 'block' || state === 'string') {
      region[i] = state === 'block' ? 'comment' : 'string';
      if (state === 'string' && cp === 0x5c && ender.length === 1) {
        // 转义：反斜杠与下一字符都属于字符串
        region[i] = 'string';
        if (i + 1 < n) region[i + 1] = 'string';
        i += 2;
        continue;
      }
      if (at(ender)) {
        for (let k = 0; k < ender.length; k++) region[i + k] = state === 'block' ? 'comment' : 'string';
        i += ender.length;
        state = 'code'; ender = null;
        continue;
      }
      i++;
      continue;
    }

    // code 状态
    if (cp === 0x0a) { i++; continue; }
    const lineHit = lineComments.find(c => at(c));
    if (lineHit) {
      state = 'linecomment';
      region[i] = 'comment';
      i++;
      continue;
    }
    const opener = allOpeners.find(o => at(o.s));
    if (opener) {
      for (let k = 0; k < opener.s.length; k++) region[i + k] = opener.type === 'comment' ? 'comment' : 'string';
      i += opener.s.length;
      state = opener.type === 'comment' ? 'block' : 'string';
      ender = opener.end;
      continue;
    }
    i++;
  }
  return region;
}

// 判断一个码点是否属于标识符。用显式文字区段白名单，避免把全角标点、
// CJK 标点（U+3000 段）误判成标识符字符。
export function isIdentChar(cp) {
  // ASCII 标识符字符
  if ((cp >= 0x30 && cp <= 0x39) || (cp >= 0x41 && cp <= 0x5a) ||
      (cp >= 0x61 && cp <= 0x7a) || cp === 0x5f || cp === 0x24) return true;
  // ZWJ/ZWNJ 在 UAX#31 里可作标识符字符（本身仍会被隐形字符检查单独报出）
  if (cp === 0x200c || cp === 0x200d) return true;
  // 拉丁补充 / 扩展（含带重音字母），排除 Latin-1 标点 0xA0..0xBF
  if ((cp >= 0xc0 && cp <= 0xff) || (cp >= 0x100 && cp <= 0x17f) ||
      (cp >= 0x180 && cp <= 0x24f) || (cp >= 0x1e00 && cp <= 0x1eff)) return true;
  // 西里尔
  if ((cp >= 0x400 && cp <= 0x52f) || (cp >= 0x2de0 && cp <= 0x2dff) ||
      (cp >= 0xa640 && cp <= 0xa69f)) return true;
  // 希腊
  if ((cp >= 0x370 && cp <= 0x3ff) || (cp >= 0x1f00 && cp <= 0x1fff)) return true;
  // 阿拉伯
  if ((cp >= 0x600 && cp <= 0x6ff) || (cp >= 0x750 && cp <= 0x77f) ||
      (cp >= 0xfb50 && cp <= 0xfdff) || (cp >= 0xfe70 && cp <= 0xfefc)) return true;
  // 希伯来
  if (cp >= 0x590 && cp <= 0x5ff) return true;
  // CJK 统一表意文字与假名（不含标点区段 U+3000-303F）
  if ((cp >= 0x3400 && cp <= 0x4dbf) || (cp >= 0x4e00 && cp <= 0x9fff) ||
      (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0x3040 && cp <= 0x30ff) ||
      (cp >= 0xff66 && cp <= 0xff9f)) return true;
  // 全角拉丁字母/数字（全角标点 0xFF01-0xFF20、0xFF3B-0xFF40 等排除）
  if ((cp >= 0xff10 && cp <= 0xff19) || (cp >= 0xff21 && cp <= 0xff3a) ||
      (cp >= 0xff41 && cp <= 0xff5a)) return true;
  return false;
}
