// 可疑字符分类标准 —— 全部判定规则集中在此，便于审计与调整。
// 每个类别带 severity: high / medium / low，以及是否默认启用。

export const CATEGORIES = {
  bidi:        { label: '双向控制符 (bidi)',       severity: 'high',   defaultOn: true  },
  zerowidth:   { label: '零宽 / 不可见字符',       severity: 'high',   defaultOn: true  },
  homoglyph:   { label: '形近 / 混写标识符',       severity: 'high',   defaultOn: true  },
  format:      { label: '其他格式控制符',          severity: 'medium', defaultOn: true  },
  whitespace:  { label: '非常规空白 / 行分隔符',   severity: 'low',    defaultOn: true  },
  control:     { label: 'C0/C1 控制字符',          severity: 'medium', defaultOn: true  },
  tags:        { label: '隐藏标记字符 (Tags)',     severity: 'high',   defaultOn: true  },
  variation:   { label: '变体选择符 / 修饰',       severity: 'low',    defaultOn: false },
};

// ---- 1. 双向控制符（Trojan Source 攻击核心）------------------------------------
export const BIDI_CHARS = {
  0x200e: { abbr: 'LRM', name: 'LEFT-TO-RIGHT MARK' },
  0x200f: { abbr: 'RLM', name: 'RIGHT-TO-LEFT MARK' },
  0x202a: { abbr: 'LRE', name: 'LEFT-TO-RIGHT EMBEDDING' },
  0x202b: { abbr: 'RLE', name: 'RIGHT-TO-LEFT EMBEDDING' },
  0x202c: { abbr: 'PDF', name: 'POP DIRECTIONAL FORMATTING' },
  0x202d: { abbr: 'LRO', name: 'LEFT-TO-RIGHT OVERRIDE' },
  0x202e: { abbr: 'RLO', name: 'RIGHT-TO-LEFT OVERRIDE' },
  0x2066: { abbr: 'LRI', name: 'LEFT-TO-RIGHT ISOLATE' },
  0x2067: { abbr: 'RLI', name: 'RIGHT-TO-LEFT ISOLATE' },
  0x2068: { abbr: 'FSI', name: 'FIRST STRONG ISOLATE' },
  0x2069: { abbr: 'PDI', name: 'POP DIRECTIONAL ISOLATE' },
};
// 显式嵌套控制符（UBA 规则 X1..X8 处理的那批）
export const BIDI_EXPLICIT = new Set([
  0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069,
]);

// ---- 2. 零宽与不可见字符 --------------------------------------------------------
export const ZERO_WIDTH = {
  0x200b: { abbr: 'ZWSP',  name: 'ZERO WIDTH SPACE' },
  0x200c: { abbr: 'ZWNJ',  name: 'ZERO WIDTH NON-JOINER' },
  0x200d: { abbr: 'ZWJ',   name: 'ZERO WIDTH JOINER' },
  0xfeff: { abbr: 'BOM/ZWNBSP', name: 'BYTE ORDER MARK / ZERO WIDTH NO-BREAK SPACE' },
  0x00ad: { abbr: 'SHY',   name: 'SOFT HYPHEN' },
  0x2060: { abbr: 'WJ',    name: 'WORD JOINER' },
  0x180e: { abbr: 'MVS',   name: 'MONGOLIAN VOWEL SEPARATOR' },
};

// ---- 3. 其他格式控制符 ----------------------------------------------------------
export const FORMAT_CHARS = {
  0x2061: { abbr: 'FA',  name: 'FUNCTION APPLICATION' },
  0x2062: { abbr: 'IT',  name: 'INVISIBLE TIMES' },
  0x2063: { abbr: 'IS',  name: 'INVISIBLE SEPARATOR' },
  0x2064: { abbr: 'IOP', name: 'INVISIBLE PLUS' },
  0x115f: { abbr: 'HCM', name: 'HANGUL CHOSEONG FILLER' },
  0x1160: { abbr: 'HJF', name: 'HANGUL JUNGSEONG FILLER' },
  0x3164: { abbr: 'HSF', name: 'HANGUL FILLER' },
  0xffa0: { abbr: 'HWH', name: 'HALFWIDTH HANGUL FILLER' },
  0x061c: { abbr: 'ALM', name: 'ARABIC LETTER MARK' },
  0x2028: { abbr: 'LSEP', name: 'LINE SEPARATOR' },
  0x2029: { abbr: 'PSEP', name: 'PARAGRAPH SEPARATOR' },
};

// ---- 4. Tags 块（U+E0000..E007F，可携带隐藏文本，历史上被用于注入）---------------
export const TAGS_RANGE = [0xe0000, 0xe007f];

// ---- 5. 变体选择符 --------------------------------------------------------------
export const VARIATION_RANGES = [
  [0xfe00, 0xfe0f], // Variation Selectors 1-16
  [0xe0100, 0xe01ef], // Variation Selectors Supplement
];

// ---- 6. 非常规空白 --------------------------------------------------------------
export const UNUSUAL_SPACE = {
  0x00a0: { abbr: 'NBSP', name: 'NO-BREAK SPACE' },
  0x202f: { abbr: 'NNBSP', name: 'NARROW NO-BREAK SPACE' },
  0x205f: { abbr: 'MMSP', name: 'MEDIUM MATHEMATICAL SPACE' },
  0x2000: { abbr: 'NQSP', name: 'EN QUAD' },
  0x2001: { abbr: 'MQSP', name: 'EM QUAD' },
  0x2002: { abbr: 'ENSP', name: 'EN SPACE' },
  0x2003: { abbr: 'EMSP', name: 'EM SPACE' },
  0x2004: { abbr: '3/MSP', name: 'THREE-PER-EM SPACE' },
  0x2005: { abbr: '4/MSP', name: 'FOUR-PER-EM SPACE' },
  0x2006: { abbr: '6/MSP', name: 'SIX-PER-EM SPACE' },
  0x2007: { abbr: 'FSP', name: 'FIGURE SPACE' },
  0x2008: { abbr: 'PSP', name: 'PUNCTUATION SPACE' },
  0x2009: { abbr: 'THSP', name: 'THIN SPACE' },
  0x200a: { abbr: 'HSP', name: 'HAIR SPACE' },
  0x2028: { abbr: 'LSEP', name: 'LINE SEPARATOR' },
  0x2029: { abbr: 'PSEP', name: 'PARAGRAPH SEPARATOR' },
  0x3000: { abbr: 'IDSP', name: 'IDEOGRAPHIC SPACE' },
};

// ---- 7. 形近字符表（人工挑选的高风险映射，非全量 UTS#39）-------------------------
// 键为可疑码点，值为它在等宽字体下最像的 ASCII 字符。
export const CONFUSABLES = new Map([
  // 西里尔小写
  [0x0430, 'a'], [0x0435, 'e'], [0x043e, 'o'], [0x0440, 'p'], [0x0441, 'c'],
  [0x0443, 'y'], [0x0445, 'x'], [0x0455, 's'], [0x0456, 'i'], [0x0458, 'j'],
  [0x04bb, 'h'], [0x04cf, 'l'], [0x0451, 'e'], [0x0433, 'r'], [0x043f, 'n'],
  [0x0442, 'm'], [0x0448, 'w'], [0x0457, 'i'], [0x0453, 'g'], [0x045e, 'u'],
  [0x0491, 'f'], [0x045a, 'k'], [0x0454, 'e'],
  // 西里尔大写
  [0x0410, 'A'], [0x0412, 'B'], [0x0415, 'E'], [0x041a, 'K'], [0x041c, 'M'],
  [0x041d, 'H'], [0x041e, 'O'], [0x0420, 'P'], [0x0421, 'C'], [0x0422, 'T'],
  [0x0425, 'X'], [0x0417, 'Z'], [0x0419, 'N'], [0x0405, 'S'],
  [0x0406, 'I'], [0x0408, 'J'], [0x0423, 'Y'],
  // 希腊
  [0x03bf, 'o'], [0x03b1, 'a'], [0x03b5, 'e'], [0x03c1, 'p'], [0x03c5, 'u'],
  [0x03b9, 'i'], [0x03ba, 'k'], [0x03b7, 'n'], [0x03c7, 'x'], [0x03c2, 's'],
  [0x039f, 'O'], [0x0391, 'A'], [0x0392, 'B'], [0x0395, 'E'], [0x039a, 'K'],
  [0x039c, 'M'], [0x039d, 'N'], [0x03a1, 'P'], [0x03a4, 'T'], [0x03a5, 'Y'],
  [0x03a7, 'X'], [0x0397, 'H'], [0x0399, 'I'], [0x0396, 'Z'],
  // 全角拉丁
  ...(Array.from({ length: 26 }, (_, i) => [0xff21 + i, String.fromCharCode(65 + i)])),
  ...(Array.from({ length: 26 }, (_, i) => [0xff41 + i, String.fromCharCode(97 + i)])),
  ...(Array.from({ length: 10 }, (_, i) => [0xff10 + i, String.fromCharCode(48 + i)])),
  // 其他常见
  [0x2024, '.'], [0x02d9, '.'], [0x0387, ';'], [0x037e, ';'],
  [0x0589, ':'], [0x2236, ':'], [0x2032, "'"], [0x02b9, "'"],
  [0x02bc, "'"], [0x02be, "'"], [0x2018, "'"], [0x2019, "'"],
  [0x201b, "'"], [0x0375, "'"], [0x00b4, "'"], [0x2033, '"'],
  [0x201c, '"'], [0x201d, '"'], [0x02ba, '"'], [0xff02, '"'],
]);

// 西里尔 / 希腊码点区段，用于判定“混写”
export function scriptOf(cp) {
  if (cp >= 0x0400 && cp <= 0x04ff) return 'Cyrillic';
  if (cp >= 0x0500 && cp <= 0x052f) return 'Cyrillic';
  if (cp >= 0x2de0 && cp <= 0x2dff) return 'Cyrillic';
  if (cp >= 0xa640 && cp <= 0xa69f) return 'Cyrillic';
  if (cp >= 0x1c80 && cp <= 0x1c8f) return 'Cyrillic';
  if (cp >= 0x0370 && cp <= 0x03ff) return 'Greek';
  if (cp >= 0x1f00 && cp <= 0x1fff) return 'Greek';
  if (cp >= 0xff01 && cp <= 0xff5e) return 'Fullwidth';
  return null;
}

// ---- 统一分类入口 ---------------------------------------------------------------
export function classify(cp) {
  if (BIDI_CHARS[cp]) return { category: 'bidi', info: BIDI_CHARS[cp] };
  if (ZERO_WIDTH[cp]) return { category: 'zerowidth', info: ZERO_WIDTH[cp] };
  if (FORMAT_CHARS[cp]) return { category: 'format', info: FORMAT_CHARS[cp] };
  if (cp >= TAGS_RANGE[0] && cp <= TAGS_RANGE[1]) {
    return { category: 'tags', info: { abbr: 'TAG', name: `TAG CHARACTER U+${cp.toString(16).toUpperCase()}` } };
  }
  for (const [lo, hi] of VARIATION_RANGES) {
    if (cp >= lo && cp <= hi) {
      return { category: 'variation', info: { abbr: 'VS', name: `VARIATION SELECTOR U+${cp.toString(16).toUpperCase()}` } };
    }
  }
  if (UNUSUAL_SPACE[cp]) return { category: 'whitespace', info: UNUSUAL_SPACE[cp] };
  // C0（除常见 tab/lf/cr）与 C1 控制符
  if ((cp >= 0x00 && cp <= 0x1f && cp !== 0x09 && cp !== 0x0a && cp !== 0x0d) ||
      (cp >= 0x7f && cp <= 0x9f)) {
    return { category: 'control', info: { abbr: 'CTL', name: `CONTROL CHARACTER U+${cp.toString(16).toUpperCase().padStart(4, '0')}` } };
  }
  if (CONFUSABLES.has(cp)) {
    return { category: 'homoglyph', info: { abbr: 'HOMO', name: `LOOKALIKE OF "${CONFUSABLES.get(cp)}"` } };
  }
  return null;
}

export function hex(cp) {
  return 'U+' + cp.toString(16).toUpperCase().padStart(4, '0');
}
