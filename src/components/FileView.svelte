<script>
  import FindingCard from './FindingCard.svelte';
  import { CATEGORIES } from '../lib/chars.js';

  let { scanResult, options, severityFilter, catFilter, openSet, onToggle } = $props();

  const visibleFindings = $derived(
    scanResult.findings.filter(f =>
      severityFilter[f.severity] &&
      options.categories[f.category] &&
      (catFilter === 'all' || f.category === catFilter)
    )
  );

  // 全文按行切分，问题行加高亮
  const lines = $derived(scanResult.text.split('\n'));
  const findingLines = $derived(new Set(scanResult.findings.map(f => f.line)));

  const catCounts = $derived.by(() => {
    const m = {};
    for (const f of scanResult.findings) m[f.category] = (m[f.category] ?? 0) + 1;
    return m;
  });
</script>

<div class="card">
  <div class="findings-toolbar">
    <span style="font-weight:650;font-size:13px;font-family:var(--mono)">{scanResult.path}</span>
    <span class="badge region">语言：{scanResult.lang}</span>
    <span class="badge cat">{scanResult.lineCount} 行</span>
    <span style="flex:1"></span>
    <button
      class="chip {catFilter === 'all' ? 'on' : ''}"
      onclick={() => onToggle('__cat__', 'all')}
    >
      全部 <span class="n">{scanResult.findings.length}</span>
    </button>
    {#each Object.entries(catCounts) as [cat, n] (cat)}
      <button
        class="chip {catFilter === cat ? 'on' : ''}"
        onclick={() => onToggle('__cat__', cat)}
      >
        {CATEGORIES[cat].label} <span class="n">{n}</span>
      </button>
    {/each}
  </div>

  {#if scanResult.binary}
    <div class="empty-state">
      <div class="emoji">📦</div>
      <div>二进制文件，已跳过扫描</div>
    </div>
  {:else if visibleFindings.length === 0}
    <div class="empty-state">
      <div class="emoji">✅</div>
      <div>当前过滤条件下没有发现可疑字符</div>
    </div>
  {:else}
    {#each visibleFindings as f (f.offset)}
      <FindingCard
        finding={f}
        scanResult={scanResult}
        open={openSet.has(f.offset)}
        onToggle={(off) => onToggle(off)}
      />
    {/each}

    <div class="whole-file">
      <div class="section-title" style="font-size:12px;color:var(--fg-dim);text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px">
        文件全文（问题行高亮，隐形字符以原文保留）
      </div>
      <div>
        {#each lines as line, li (li)}
          <div class="line-row {findingLines.has(li) ? 'has-finding' : ''}">
            <span class="ln">{li + 1}</span>
            <span class="ltext">{line || ' '}</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>
