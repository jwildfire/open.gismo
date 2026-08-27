import { esc } from './utils.js';
import { parseCsv } from './parsers.js';
import { withBase } from './context.js';

export function buildPackagesTable(rows, snapshotDate) {
  if (!rows.length) return '<div class="loading">No manifest.csv on this branch</div>';
  let h = '';
  if (snapshotDate) {
    h += `<div class="snapshot-date">Snapshot date: ${esc(snapshotDate)}</div>`;
  }
  h += '<table class="pkg-table"><thead><tr><th>Package</th><th>Version</th><th>Repository</th><th>SHA</th></tr></thead><tbody>';
  rows.forEach(r => {
    const url = r.repository || '', sha = r.sha || '';
    h += `<tr><td>${esc(r.package)}</td><td>${esc(r.version)}</td>`;
    h += `<td><a href="${esc(url)}" target="_blank" rel="noopener">${esc(r.org)}/${esc(r.package)}</a></td>`;
    h += `<td class="sha-cell">${sha ? `<a href="${esc(url)}/commit/${esc(sha)}" target="_blank" rel="noopener">${esc(sha.slice(0, 7))}</a>` : ''}</td></tr>`;
  });
  return h + '</tbody></table>';
}

export async function loadPackages() {
  const res = await fetch(withBase('manifest.csv'));
  if (!res.ok) throw new Error('not found');
  return parseCsv(await res.text());
}

export async function loadSnapshotDate() {
  try {
    const res = await fetch(withBase('_snapshot_date.txt'));
    if (!res.ok) return null;
    return (await res.text()).trim();
  } catch { return null; }
}
