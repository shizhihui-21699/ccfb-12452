// 扫描主引擎：解压后的每个文件在这里过一遍，产出 findings 与行级双向视图。
import { classify, hex, CATEGORIES, CONFUSABLES, scriptOf, BIDI_EXPLICIT } from './chars.js';
import { profileFor, buildRegions, isIdentChar } from './langs.js';
import { analyzeLine } from './bidi.js';

const INVISIBLE = new Set(['bidi', 'zerowidth', 'format', 'tags', 'control', 'variation']);

// 把码点数组按 \n 切成行，返回每行 {start, end, cps}
function splitLines(cps) {
  const lines = [];
  let start = 0;
  for (let i = 0; i < cps.length; i++) {
    if (cps[i] === 0x0a) {
      lines.push({ start, end: i, cps: cps.slice(start, i) });
      start = i + 1;
    }
  }
  if (start < cps.length) lines.push({ start, end: cps.length, cps: cps.slice(start) });
  return lines;
}

// 行的“逻辑顺序 / 视觉顺序”视图，供 UI 并排渲染
export function buildLineView(lineCps) {
  if (!lineCps.length) return { logical: [], visual: [], baseLevel: 0 };
  const { visualOrder, levels, types, baseLevel } = analyzeLine(lineCps);
  const mkCell = (i) => {
    const cp = lineCps[i];
    const c = classify(cp);
    return {
      cp,
      ch: String.fromCodePoint(cp),
      abbr: c?.info.abbr ?? null,
      category: c?.category ?? null,
      level: levels[i],
      type: types[i],
      invisible: c ? INVISIBLE.has(c.category) : false,
      bidi: BIDI_EXPLICIT.has(cp) || cp === 0x200e || cp === 0x200f,
    };
  };
  return {
    baseLevel,
    visualOrder,
    logical: lineCps.map((_, i) => mkCell(i)),
    visual: visualOrder.map(i => mkCell(i)),
  };
}

// 扫描单个文件。data 为 Uint8Array；options 见 DEFAULT_OPTIONS。
export function scanFile(path, data, options) {
  const result = {
    path, lang: 'text', binary: false, error: null,
    findings: [], lineCount: 0,
  };

  // 二进制探测：含 NUL 或高比例非文本字节则跳过
  let nonText = 0;
  const probe = data.slice(0, Math.min(data.length, 8192));
  for (const b of probe) {
    if (b === 0) { result.binary = true; break; }
    if (b < 9 || (b > 13 && b < 32)) nonText++;
  }
  if (result.binary || nonText / Math.max(1, probe.length) > 0.3) {
    result.binary = true;
    return result;
  }

  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: false }).decode(data);
  } catch (e) {
    result.error = String(e);
    return result;
  }

  // 转码点数组
  const cps = Array.from(text, ch => ch.codePointAt(0));
  const { name: lang, profile } = profileFor(path);
  result.lang = lang;
  const regions = buildRegions(cps, profile);
  const lines = splitLines(cps);
  result.lineCount = lines.length;
  result.text = text;
  result.codePoints = cps;

  const emitted = new Set();
  const pushFinding = (f) => {
    if (emitted.has(f.offset)) return;
    emitted.add(f.offset);
    result.findings.push(f);
  };

  const catOn = (cat) => options.categories[cat];
  const zoneIgnored = (i, cat) => {
    const r = regions[i];
    if (r === 'string' && options.ignoreInString) return true;
    if (r === 'comment' && options.ignoreInComment) return true;
    return false;
  };

  // 行号/列号定位
  const lineOf = (offset) => {
    let lo = 0, hi = lines.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lines[mid].start <= offset) lo = mid; else hi = mid - 1;
    }
    return lo;
  };

  // ---- 1. 逐码点分类 ----------------------------------------------------------
  for (let i = 0; i < cps.length; i++) {
    const cp = cps[i];
    const c = classify(cp);
    if (!c) continue;
    if (!catOn(c.category)) continue;
    if (zoneIgnored(i, c.category)) continue;
    if (options.homoglyphOnlyInIdentifiers && c.category === 'homoglyph' && regions[i] !== 'code') continue;

    const li = lineOf(i);
    pushFinding({
      offset: i,
      line: li,
      col: i - lines[li].start,
      cp,
      hex: hex(cp),
      category: c.category,
      severity: CATEGORIES[c.category].severity,
      abbr: c.info.abbr,
      name: c.info.name,
      region: regions[i],
      lookalike: c.category === 'homoglyph' ? CONFUSABLES.get(cp) : null,
      inIdentifier: false,
      identifier: null,
    });
  }

  // ---- 2. 标识符混写检测（只看 code 区域）--------------------------------------
  if (catOn('homoglyph')) {
    let i = 0;
    while (i < cps.length) {
      if (regions[i] !== 'code' || !isIdentChar(cps[i])) { i++; continue; }
      let j = i;
      while (j < cps.length && regions[j] === 'code' && isIdentChar(cps[j])) j++;
      const token = cps.slice(i, j);
      const hasAscii = token.some(cp => cp < 0x80);
      const scripts = new Set();
      for (const cp of token) {
        const s = scriptOf(cp);
        if (s) scripts.add(s);
      }
      const mixed = (hasAscii && scripts.size >= 1) || scripts.size >= 2;
      if (mixed) {
        const idText = String.fromCodePoint(...token);
        for (let k = 0; k < token.length; k++) {
          const cp = token[k];
          const sc = scriptOf(cp);
          if (!sc) continue;
          const off = i + k;
          const li = lineOf(off);
          if (emitted.has(off)) {
            const f = result.findings.find(x => x.offset === off);
            if (f) { f.inIdentifier = true; f.identifier = idText; }
          } else {
            pushFinding({
              offset: off,
              line: li,
              col: off - lines[li].start,
              cp,
              hex: hex(cp),
              category: 'homoglyph',
              severity: CATEGORIES.homoglyph.severity,
              abbr: 'MIX',
              name: `MIXED-SCRIPT IDENTIFIER (${sc} inside "${idText}")`,
              region: 'code',
              lookalike: CONFUSABLES.get(cp) ?? null,
              inIdentifier: true,
              identifier: idText,
            });
          }
        }
      }
      i = j;
    }
  }

  result.findings.sort((a, b) => a.offset - b.offset);
  return result;
}

export const DEFAULT_OPTIONS = {
  categories: Object.fromEntries(Object.entries(CATEGORIES).map(([k, v]) => [k, v.defaultOn])),
  ignoreInString: true,
  ignoreInComment: false, // 注释正是 Trojan Source 的藏身之处，默认不放过
  homoglyphOnlyInIdentifiers: true,
};
