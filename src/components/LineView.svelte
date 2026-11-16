<script>
  // 并排展示一行的“视觉顺序（编辑器）”与“逻辑顺序（编译器）”。
  let { cells, markedOffset, orderLabel, subLabel } = $props();

  function render(cell, i) {
    let cls = 'cell';
    let label = null;
    if (cell.invisible) cls += cell.bidi ? ' bidi' : ' invis';
    if (cell.category === 'homoglyph') cls += ' homoglyph';
    if (cell.offset === markedOffset) cls += ' marked';
    if (cell.invisible) {
      label = cell.abbr;
    } else if (cell.cp === 0x20) {
      label = '␠'; cls += ' ws';
    } else if (cell.cp === 0x09) {
      label = '⇥'; cls += ' ws';
    }
    return { cls, label };
  }
</script>

<div class="panel">
  <div class="panel-head">
    <span>{orderLabel}</span>
    <span class="role">{subLabel}</span>
  </div>
  <div class="panel-body">
    {#each cells as cell, i (i)}
      {@const r = render(cell, i)}
      <span
        class={r.cls}
        title="{cell.hex} · 嵌套层级={cell.level} · bidi类型={cell.type}"
      >
        <span class="idx">{i}</span>
        {r.label ?? cell.ch}
      </span>
    {/each}
  </div>
</div>
