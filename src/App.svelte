<script>
  import { extractArchive } from './lib/archive.js';
  import { scanFile, DEFAULT_OPTIONS } from './lib/scanner.js';
  import Sidebar from './components/Sidebar.svelte';
  import FileView from './components/FileView.svelte';

  let archiveName = $state('');
  let rawFiles = $state([]); // {path, bytes}
  let results = $state([]);
  let activePath = $state(null);
  let options = $state(structuredClone(DEFAULT_OPTIONS));
  let severityFilter = $state({ high: true, medium: true, low: true });
  let openSet = $state(new Set());
  let catFilter = $state('all');
  let error = $state('');
  let notice = $state('');
  let scanning = $state(false);
  let dragOver = $state(false);
  let fileInput = $state(null);
  let loaded = $state(false);

  const activeResult = $derived(results.find(r => r.path === activePath) ?? null);

  const counts = $derived.by(() => {
    const bySeverity = { high: 0, medium: 0, low: 0 };
    const byCategory = {};
    let filesWithFindings = 0;
    for (const r of results) {
      if (r.findings.length) filesWithFindings++;
      for (const f of r.findings) {
        if (!severityFilter[f.severity]) continue;
        if (!options.categories[f.category]) continue;
        bySeverity[f.severity]++;
        byCategory[f.category] = (byCategory[f.category] ?? 0) + 1;
      }
    }
    return {
      total: bySeverity.high + bySeverity.medium + bySeverity.low,
      bySeverity,
      byCategory,
      filesWithFindings,
      scanned: results.filter(r => !r.binary).length,
      binary: results.filter(r => r.binary).length,
    };
  });

  function runScan(files, name) {
    const scanned = files.map(f => {
      const r = scanFile(f.path, f.bytes, options);
      r._bytes = f.bytes;
      return r;
    });
    rawFiles = files;
    results = scanned;
    archiveName = name;
    loaded = true;
    openSet = new Set();
    catFilter = 'all';
    const firstDirty = scanned.find(r => r.findings.length);
    activePath = (firstDirty ?? scanned[0])?.path ?? null;
  }

  // 选项变化 → 用缓存的原始字节重新扫描（显式调用，避免 effect 自激）
  function rescan() {
    if (!loaded) return;
    const prevActive = activePath;
    const scanned = rawFiles.map(f => {
      const r = scanFile(f.path, f.bytes, options);
      r._bytes = f.bytes;
      return r;
    });
    results = scanned;
    if (prevActive && scanned.some(r => r.path === prevActive)) activePath = prevActive;
  }

  async function handleFiles(fileList) {
    const file = fileList?.[0];
    if (!file) return;
    error = ''; notice = ''; scanning = true;
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      const files = extractArchive(file.name, buf);
      runScan(files, file.name);
      notice = `已在浏览器本地完成解压与扫描，共 ${files.length} 个文件，未上传任何数据。`;
    } catch (e) {
      error = e.message ?? String(e);
      archiveName = ''; loaded = false; results = [];
    } finally {
      scanning = false;
    }
  }

  function onDrop(e) {
    e.preventDefault();
    dragOver = false;
    handleFiles(e.dataTransfer.files);
  }

  function onToggle(offset, cat) {
    if (offset === '__cat__') { catFilter = cat; return; }
    const next = new Set(openSet);
    if (next.has(offset)) next.delete(offset); else next.add(offset);
    openSet = next;
  }

  function exportReport() {
    const report = {
      archive: archiveName,
      generatedBy: 'InvisiScan',
      options,
      summary: {
        files: results.length,
        filesWithFindings: counts.filesWithFindings,
        totalFindings: counts.total,
        bySeverity: counts.bySeverity,
        byCategory: counts.byCategory,
      },
      files: results
        .filter(r => r.findings.length)
        .map(r => ({
          path: r.path,
          lang: r.lang,
          findings: r.findings.map(f => ({
            line: f.line + 1,
            column: f.col + 1,
            offset: f.offset,
            codepoint: f.hex,
            abbreviation: f.abbr,
            unicodeName: f.name,
            category: f.category,
            severity: f.severity,
            region: f.region,
            ...(f.lookalike ? { lookalike: f.lookalike } : {}),
            ...(f.identifier ? { identifier: f.identifier } : {}),
          })),
        })),
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'invisiscan-report.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function loadSample() {
    error = ''; notice = ''; scanning = true;
    try {
      const resp = await fetch('./sample-repo.zip');
      if (!resp.ok) throw new Error('内置样例加载失败（HTTP ' + resp.status + '）');
      const buf = new Uint8Array(await resp.arrayBuffer());
      const files = extractArchive('sample-repo.zip', buf);
      runScan(files, 'sample-repo.zip');
      notice = '已载入内置投毒样例仓库，所有处理均在浏览器本地完成。';
    } catch (e) {
      error = e.message ?? String(e);
    } finally {
      scanning = false;
    }
  }
</script>

<div class="app-shell">
  <header class="app-header">
    <h1>🕵️ InvisiScan 隐形字符扫描台</h1>
    <span class="sub">
      双向控制符 · 零宽字符 · 形近/混写标识符 —— 浏览器本地解压扫描，代码不出本机
    </span>
  </header>

  <div class="card">
    <div
      class="dropzone {dragOver ? 'dragover' : ''}"
      role="button"
      tabindex="0"
      onclick={() => fileInput?.click()}
      ondragover={(e) => { e.preventDefault(); dragOver = true; }}
      ondragleave={() => (dragOver = false)}
      ondrop={onDrop}
      onkeydown={(e) => { if (e.key === 'Enter') fileInput?.click(); }}
    >
      <div class="big">
        {#if scanning}
          <span class="spinner"></span> 正在解压并扫描…
        {:else}
          把代码仓库的 <strong>.zip</strong> 拖到这里，或点击选择文件
        {/if}
      </div>
      <div class="hint">
        支持 zip / jar；在浏览器内用 fflate 解压，逐码点分析，全程无网络上传
      </div>
      <input
        type="file"
        accept=".zip,.jar"
        bind:this={fileInput}
        onchange={(e) => handleFiles(e.target.files)}
      />
      <div class="actions">
        <button class="primary" onclick={(e) => { e.stopPropagation(); loadSample(); }} disabled={scanning}>
          载入内置投毒样例仓库
        </button>
      </div>
    </div>
    {#if error}
      <div class="error-box" style="margin-top:12px">⚠ {error}</div>
    {/if}
    {#if notice}
      <div class="notice-box" style="margin-top:12px">ℹ {notice}</div>
    {/if}
  </div>

  {#if results.length}
    <div class="stats-row">
      <div class="stat {counts.total > 0 ? 'high' : 'ok'}">
        <div class="num">{counts.total}</div>
        <div class="lbl">可疑命中（当前过滤）</div>
      </div>
      <div class="stat high"><div class="num">{counts.bySeverity.high}</div><div class="lbl">高危</div></div>
      <div class="stat medium"><div class="num">{counts.bySeverity.medium}</div><div class="lbl">中危</div></div>
      <div class="stat low"><div class="num">{counts.bySeverity.low}</div><div class="lbl">低危</div></div>
      <div class="stat"><div class="num">{counts.filesWithFindings}/{results.length}</div><div class="lbl">含问题文件 / 总文件</div></div>
      <div class="stat ok"><div class="num">{counts.binary}</div><div class="lbl">二进制已跳过</div></div>
      <div style="flex:1"></div>
      <div class="stat" style="display:flex;align-items:center;min-width:0;border:none;background:transparent;padding:0">
        <button onclick={exportReport} title="把当前过滤后的扫描结果导出为 JSON 报告">
          ⬇ 导出 JSON 报告
        </button>
      </div>
    </div>

    <div class="layout">
      <Sidebar
        {options}
        onOptionsChange={(v) => { options = v; rescan(); }}
        {results}
        {activePath}
        onSelectFile={(p) => (activePath = p)}
        {severityFilter}
        onSeverityChange={(v) => (severityFilter = v)}
        {counts}
      />
      <main>
        {#if activeResult}
          <FileView
            scanResult={activeResult}
            {options}
            {severityFilter}
            catFilter={catFilter}
            {openSet}
            onToggle={onToggle}
          />
        {/if}
      </main>
    </div>
  {:else if !scanning && !error}
    <div class="card">
      <div class="section-title" style="font-size:12px;color:var(--fg-dim);text-transform:uppercase;letter-spacing:.6px;margin-bottom:10px">
        扫描覆盖的可疑字符（判定标准）
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px;font-size:12.5px;color:var(--fg-dim)">
        <div><span class="sev-dot high"></span><strong style="color:var(--fg)">双向控制符</strong>：LRM/RLM、LRE/RLE/PDF、LRO/RLO、LRI/RLI/FSI/PDI —— Trojan Source 类攻击的核心，可让注释与代码的视觉顺序颠倒。</div>
        <div><span class="sev-dot high"></span><strong style="color:var(--fg)">零宽/不可见</strong>：ZWSP、ZWNJ、ZWJ、BOM、软连字符 SHY、WORD JOINER 等，可拼出肉眼相同但语义不同的标识符。</div>
        <div><span class="sev-dot high"></span><strong style="color:var(--fg)">形近/混写</strong>：西里尔 а/е/о/р/с、希腊 ο/α、全角拉丁等与 ASCII 同形的码点，以及同一标识符内混用多种文字。</div>
        <div><span class="sev-dot medium"></span><strong style="color:var(--fg)">格式与控制符</strong>：U+2061-2064 隐形运算符、U+2028/2029 行列分隔符、Tags 隐藏块（U+E0000 段）、C0/C1 控制字符。</div>
        <div><span class="sev-dot low"></span><strong style="color:var(--fg)">非常规空白</strong>：NBSP、窄 NBSP、各种 EN/EM/THIN SPACE、表意文字空格等缩进投毒。</div>
        <div><span class="sev-dot low"></span><strong style="color:var(--fg)">变体选择符</strong>：默认关闭，需要时手动启用。</div>
      </div>
    </div>
  {/if}
</div>
