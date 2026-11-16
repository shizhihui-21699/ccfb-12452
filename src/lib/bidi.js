// 简化版 Unicode 双向算法（UAX #9 连贯模型），用于还原编辑器里看到的视觉顺序。
// 输入一行的码点数组，输出每个码点的层级、bidi 类型，以及视觉顺序（逻辑索引数组）。
// 注意：这是教学级近似实现，覆盖显式嵌套/覆盖/隔离与隐式规则，不追求 UBA 全部分支。

import { BIDI_EXPLICIT } from './chars.js';

// ---- 粗粒度 bidi 类型判定（规则 P0..P3 所需）-----------------------------------
function bidiType(cp) {
  if (BIDI_EXPLICIT.has(cp)) return 'BN';
  if (cp === 0x200e || cp === 0x200f) return cp === 0x200e ? 'L' : 'R';
  // R: 希伯来文
  if ((cp >= 0x0590 && cp <= 0x05ff) || (cp >= 0xfb1d && cp <= 0xfb4f)) return 'R';
  // AL: 阿拉伯文 / Nko 等
  if ((cp >= 0x0600 && cp <= 0x07bf) || (cp >= 0x08a0 && cp <= 0x08ff) ||
      (cp >= 0xfb50 && cp <= 0xfdff) || (cp >= 0xfe70 && cp <= 0xfeff)) return 'AL';
  // AN: 阿拉伯数字
  if ((cp >= 0x0660 && cp <= 0x0669) || (cp >= 0x06f0 && cp <= 0x06f9)) return 'AN';
  // EN: 通用数字
  if ((cp >= 0x30 && cp <= 0x39) || (cp >= 0xb2 && cp <= 0xb3) || cp === 0xb9 ||
      (cp >= 0xbc && cp <= 0xbe)) return 'EN';
  if (cp === 0x2c) return 'CS';
  if (cp === 0x2e) return 'CS';
  if (cp === 0x26) return 'ET';
  if (cp === 0x23 || cp === 0x24 || cp === 0x25) return 'ET';
  if (cp === 0x09 || cp === 0x0b || cp === 0x0c || cp === 0x20 || cp === 0xa0) return 'WS';
  if (cp === 0x0a || cp === 0x0d) return 'B';
  if (cp === 0x28 || cp === 0x29 || cp === 0x5b || cp === 0x5d ||
      cp === 0x7b || cp === 0x7d || cp === 0xab || cp === 0xbb) return 'ON';
  if (cp <= 0x1f || cp === 0x7f) return 'BN';
  return 'L';
}

const STRONG = new Set(['R', 'L', 'AL']);

// 段落基准方向：第一个强字符（P2/P3），缺省 L
function paragraphBase(cps) {
  for (const cp of cps) {
    const t = bidiType(cp);
    if (t === 'L') return 0;
    if (t === 'R' || t === 'AL') return 1;
  }
  return 0;
}

// ---- 显式控制（规则 X1..X8）------------------------------------------------------
function explicitLevels(cps, baseLevel) {
  const stack = []; // { level, override: 'L'|'R'|null, isolate: boolean }
  let level = baseLevel;
  let override = null;
  const out = [];
  let isolateCount = 0;

  const push = (lv, ov, iso) => {
    stack.push({ level, override, isolate: isolateCount > 0 });
    level = lv; override = ov;
    if (iso) isolateCount++;
  };
  const popFmt = () => {
    if (stack.length && !stack[stack.length - 1].isolate) {
      const s = stack.pop();
      level = s.level; override = s.override;
      return true;
    }
    return false;
  };
  const popIso = () => {
    if (stack.length) {
      const s = stack.pop();
      level = s.level; override = s.override;
      isolateCount = Math.max(0, isolateCount - 1);
    }
  };

  for (const cp of cps) {
    let type = bidiType(cp);
    switch (cp) {
      case 0x202a: push(level + 2 - (level % 2), null, false); out.push({ cp, type: 'BN', level }); continue;
      case 0x202b: push(level + 1 + (level % 2), null, false); out.push({ cp, type: 'BN', level }); continue;
      case 0x202d: push(level + 2 - (level % 2), 'L', false); out.push({ cp, type: 'BN', level }); continue;
      case 0x202e: push(level + 1 + (level % 2), 'R', false); out.push({ cp, type: 'BN', level }); continue;
      case 0x202c: popFmt(); out.push({ cp, type: 'BN', level }); continue;
      case 0x2066: push(level + 2 - (level % 2), null, true); out.push({ cp, type: 'BN', level }); continue;
      case 0x2067: push(level + 1 + (level % 2), null, true); out.push({ cp, type: 'BN', level }); continue;
      case 0x2068: { // FSI：按后续第一个强字符决定 LRI/RLI
        let dir = baseLevel;
        for (const q of cps.slice(out.length + 1)) {
          const t = bidiType(q);
          if (STRONG.has(t)) { dir = (t === 'L' ? 0 : 1); break; }
        }
        push(dir === 0 ? level + 2 - (level % 2) : level + 1 + (level % 2), null, true);
        out.push({ cp, type: 'BN', level }); continue;
      }
      case 0x2069: popIso(); out.push({ cp, type: 'BN', level }); continue;
      case 0x200e: out.push({ cp, type: 'L', level }); continue;
      case 0x200f: out.push({ cp, type: 'R', level }); continue;
      default: {
        if (override && type !== 'BN') type = override;
        out.push({ cp, type, level });
      }
    }
  }
  return out;
}

// ---- 隐式规则（简化版 N1/W1..W7 近似）-------------------------------------------
function implicitLevels(items, baseLevel) {
  const types = items.map(it => it.type);
  const n = items.length;

  // 中性字符按两侧强字符定方向
  for (let i = 0; i < n; i++) {
    const t = types[i];
    if (t === 'ON' || t === 'WS' || t === 'B' || t === 'S' || t === 'EN' || t === 'AN' ||
        t === 'CS' || t === 'ET' || t === 'NSM') {
      // 找前一个强字符
      let prev = null, next = null;
      for (let j = i - 1; j >= 0; j--) {
        if (STRONG.has(types[j])) { prev = types[j]; break; }
      }
      for (let j = i + 1; j < n; j++) {
        if (STRONG.has(types[j])) { next = types[j]; break; }
      }
      if (t === 'ON' || t === 'WS' || t === 'B' || t === 'S') {
        if (prev && next && (prev === 'R' || prev === 'AL') && (next === 'R' || next === 'AL')) {
          types[i] = 'R';
        } else if (prev && next && prev === 'L' && next === 'L') {
          types[i] = 'L';
        } else {
          types[i] = baseLevel === 0 ? 'L' : 'R';
        }
      }
    }
  }

  return items.map((it, i) => {
    let lvl = it.level;
    const t = types[i];
    if (t === 'L') {
      if (lvl % 2 === 1) lvl++;
    } else if (t === 'R' || t === 'AL' || t === 'AN' || t === 'EN') {
      if (lvl % 2 === 0) lvl++;
    } else {
      // 中性/弱：沿用当前嵌入层奇偶
      lvl = it.level;
    }
    return { ...it, resolvedType: t, resolvedLevel: lvl };
  });
}

// ---- L2：按层级从高到低反转连续段 ------------------------------------------------
function reorder(resolved) {
  const order = resolved.map((_, i) => i);
  const maxLevel = resolved.reduce((m, r) => Math.max(m, r.resolvedLevel), 0);
  for (let l = maxLevel; l >= 1; l--) {
    let i = 0;
    while (i < order.length) {
      if (resolved[order[i]].resolvedLevel >= l) {
        let j = i;
        while (j < order.length && resolved[order[j]].resolvedLevel >= l) j++;
        const seg = order.slice(i, j).reverse();
        order.splice(i, j - i, ...seg);
        i = j;
      } else i++;
    }
  }
  return order;
}

export function analyzeLine(codePoints) {
  const base = paragraphBase(codePoints);
  const explicit = explicitLevels(codePoints, base);
  const resolved = implicitLevels(explicit, base);
  const visualOrder = reorder(resolved);
  return {
    baseLevel: base,
    levels: resolved.map(r => r.resolvedLevel),
    types: resolved.map(r => r.resolvedType),
    visualOrder,
  };
}
