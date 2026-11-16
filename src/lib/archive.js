// 浏览器端解压：目前支持 zip（含 fflate 能处理的 deflate/store 等）。
// tar / tar.gz 里的 tar 结构没有浏览器端标准库，先给明确报错而不是静默漏报。
import { unzipSync } from 'fflate';

const MAX_FILES = 2000;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;

export function extractArchive(fileName, bytes) {
  const lower = fileName.toLowerCase();
  let entries;
  try {
    if (lower.endsWith('.zip') || lower.endsWith('.jar') || lower.endsWith('.docx')) {
      entries = unzipSync(bytes, { filter: (f) => !f.name.endsWith('/') });
    } else if (lower.endsWith('.gz')) {
      throw new Error('tar.gz 暂不支持，请打包为 .zip 后再导入');
    } else {
      throw new Error(`不支持的压缩格式：${fileName}（请使用 .zip）`);
    }
  } catch (e) {
    if (e.message && e.message.startsWith('tar.gz')) throw e;
    if (e.message && e.message.startsWith('不支持')) throw e;
    throw new Error('解压失败：压缩包已损坏或格式不受支持（' + e.message + '）');
  }

  const files = [];
  let total = 0;
  for (const [path, data] of Object.entries(entries)) {
    // 跳过 macOS / 系统元数据
    if (path.startsWith('__MACOSX/') || path.includes('/__MACOSX/') ||
        path.split('/').pop().startsWith('._') || path.includes('.DS_Store')) continue;
    total += data.length;
    if (total > MAX_TOTAL_BYTES) throw new Error('压缩包解压后超过 20MB 上限');
    files.push({ path: path.replace(/^\.\//, ''), bytes: data });
    if (files.length >= MAX_FILES) throw new Error('文件数超过 2000 上限');
  }
  if (!files.length) throw new Error('压缩包里没有可扫描的文件');
  return files;
}
