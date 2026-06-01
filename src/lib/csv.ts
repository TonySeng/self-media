/**
 * CSV 编码工具
 *
 * 字段中包含逗号、双引号或换行符时需要用双引号包裹，并把内部双引号替换为两个双引号。
 */
function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s = typeof value === 'string' ? value : String(value);
  if (/[",\n\r]/.test(s)) {
    s = `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsv(
  rows: Record<string, unknown>[],
  headers: { key: string; label: string }[],
): string {
  const lines: string[] = [];
  lines.push(headers.map((h) => escapeCsvField(h.label)).join(','));
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCsvField(row[h.key])).join(','));
  }
  // 加 BOM 让 Excel 识别 UTF-8
  return '﻿' + lines.join('\n');
}

export function csvResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
    },
  });
}
