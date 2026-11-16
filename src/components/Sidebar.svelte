<script>
  import { CATEGORIES } from '../lib/chars.js';

  let {
    options, onOptionsChange, results, activePath, onSelectFile,
    severityFilter, onSeverityChange, counts,
  } = $props();

  const catEntries = Object.entries(CATEGORIES);
  const sevEntries = [
    ['high', '高危'],
    ['medium', '中危'],
    ['low', '低危'],
  ];

  function toggleCat(key) {
    onOptionsChange({ ...options, categories: { ...options.categories, [key]: !options.categories[key] } });
  }
  function toggleFlag(key) {
    onOptionsChange({ ...options, [key]: !options[key] });
  }
</script>

<aside class="sidebar card">
  <div class="section-title">可疑字符类别</div>
  {#each catEntries as [key, meta] (key)}
    <label class="toggle-row">
      <input
        type="checkbox"
        checked={options.categories[key]}
        onchange={() => toggleCat(key)}
      />
      <span class="sev-dot {meta.severity}"></span>
      <span>{meta.label}</span>
    </label>
  {/each}

  <div class="section-title">合法用法忽略（按语言）</div>
  <label class="toggle-row">
    <input type="checkbox" checked={options.ignoreInString} onchange={() => toggleFlag('ignoreInString')} />
    <span>忽略字符串字面量内</span>
  </label>
  <label class="toggle-row">
    <input type="checkbox" checked={options.ignoreInComment} onchange={() => toggleFlag('ignoreInComment')} />
    <span>忽略注释内（不建议）</span>
  </label>
  <label class="toggle-row">
    <input
      type="checkbox"
      checked={options.homoglyphOnlyInIdentifiers}
      onchange={() => toggleFlag('homoglyphOnlyInIdentifiers')}
    />
    <span>形近字符仅检查标识符</span>
  </label>

  <div class="section-title">严重级别过滤</div>
  {#each sevEntries as [sev, label] (sev)}
    <label class="toggle-row">
      <input
        type="checkbox"
        checked={severityFilter[sev]}
        onchange={() => onSeverityChange({ ...severityFilter, [sev]: !severityFilter[sev] })}
      />
      <span class="sev-dot {sev}"></span>
      <span>{label}（{counts.bySeverity[sev] ?? 0}）</span>
    </label>
  {/each}

  <div class="section-title">仓库文件（{results.length}）</div>
  <div class="file-list">
    {#each results as r (r.path)}
      <div
        class="file-item {activePath === r.path ? 'active' : ''}"
        onclick={() => onSelectFile(r.path)}
        onkeydown={(e) => { if (e.key === 'Enter') onSelectFile(r.path); }}
        role="button"
        tabindex="0"
      >
        <span class="path" title={r.path}>{r.path}</span>
        {#if r.binary}
          <span class="count low" title="二进制文件已跳过">二进制</span>
        {:else if r.findings.length === 0}
          <span class="count zero">0</span>
        {:else}
          <span class="count {r.findings[0]?.severity ?? 'low'}">{r.findings.length}</span>
        {/if}
      </div>
    {/each}
  </div>
</aside>
