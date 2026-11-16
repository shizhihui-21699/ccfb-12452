<script>
  import LineView from './LineView.svelte';
  import { buildLineView } from '../lib/scanner.js';
  import { CATEGORIES } from '../lib/chars.js';

  let { finding, scanResult, open, onToggle } = $props();

  // 从文件原文切出问题所在行，并构建双向视图（带逻辑 offset）
  const lineView = $derived.by(() => {
    const cps = scanResult.codePoints;
    let start = finding.offset;
    while (start > 0 && cps[start - 1] !== 0x0a) start--;
    let end = start;
    while (end < cps.length && cps[end] !== 0x0a) end++;
    const lineCps = cps.slice(start, end);
    const view = buildLineView(lineCps);
    // 注入 offset / hex / name
    const enrich = (cell, i) => ({
      ...cell,
      offset: start + i,
      hex: 'U+' + cell.cp.toString(16).toUpperCase().padStart(4, '0'),
      name: cell.category ? CATEGORIES[cell.category]?.label ?? '' : '',
    });
    return {
      baseLevel: view.baseLevel,
      logical: view.logical.map(enrich),
      visual: view.visual.map((cell, vi) => {
        // visual 里的 cell 来自 lineCps 的逻辑下标，找到其原下标
        const logicalIndex = view.visualOrder[vi];
        return enrich(cell, logicalIndex);
      }),
    };
  });

  const regionLabel = { code: '代码区', string: '字符串内', comment: '注释内' };
</script>

<div class="finding {open ? 'open' : ''}">
  <div
    class="finding-head"
    onclick={() => onToggle(finding.offset)}
    onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(finding.offset); } }}
    role="button"
    tabindex="0"
  >
    <span class="badge {finding.severity}">{finding.severity}</span>
    <span class="badge cat">{CATEGORIES[finding.category].label}</span>
    <span class="badge region">{regionLabel[finding.region]}</span>
    <span class="title">{finding.abbr} · {finding.name}</span>
    <span class="codepoint">{finding.hex}</span>
    <span class="loc">{scanResult.path}:{finding.line + 1}:{finding.col + 1}</span>
    <span class="chevron">▶</span>
  </div>

  {#if open}
    <div class="finding-body">
      {#if finding.identifier}
        <p class="desc">
          所在标识符：<code>{finding.identifier}</code>
          {#if finding.lookalike}—— 该码点在多数等宽字体下形似 ASCII “{finding.lookalike}”，但属于不同文字，编译器按不同字符处理。{/if}
        </p>
      {:else if finding.lookalike}
        <p class="desc">该码点在多数等宽字体下形似 ASCII “{finding.lookalike}”，但属于不同文字。</p>
      {:else}
        <p class="desc">该字符不可见或无常规字形，肉眼审查时容易漏过；编译器仍按真实码点逐个读取。</p>
      {/if}

      <div class="dual-panel">
        <LineView
          cells={lineView.visual}
          markedOffset={finding.offset}
          orderLabel="编辑器里看到的顺序"
          subLabel="经双向算法重排后的视觉序列（含占位标记）"
        />
        <LineView
          cells={lineView.logical}
          markedOffset={finding.offset}
          orderLabel="编译器实际读到的顺序"
          subLabel="文件中真实的码点存储序列（逻辑顺序）"
        />
      </div>

      <div class="meta-grid">
        <div class="meta-item">
          <span class="k">码点</span>
          <span class="v">{finding.hex} ({finding.abbr})</span>
        </div>
        <div class="meta-item">
          <span class="k">Unicode 名称</span>
          <span class="v">{finding.name}</span>
        </div>
        <div class="meta-item">
          <span class="k">行 / 列</span>
          <span class="v">{finding.line + 1} : {finding.col + 1}</span>
        </div>
        <div class="meta-item">
          <span class="k">所在区域</span>
          <span class="v">{regionLabel[finding.region]}</span>
        </div>
        <div class="meta-item">
          <span class="k">段落基准方向</span>
          <span class="v">{lineView.baseLevel === 0 ? 'LTR (从左到右)' : 'RTL (从右到左)'}</span>
        </div>
        <div class="meta-item">
          <span class="k">逻辑字节偏移</span>
          <span class="v">{finding.offset}</span>
        </div>
      </div>

      <div class="legend">
        <span class="lg-bidi">双向控制符</span>
        <span class="lg-invis">不可见/零宽（以缩写占位显示）</span>
        <span class="lg-homo">形近字符</span>
        <span class="lg-mark">当前问题码点</span>
      </div>
    </div>
  {/if}
</div>
