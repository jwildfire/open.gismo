export function parseYamlMeta(text) {
  const meta = {};
  const lines = text.split('\n');
  let inMeta = false;
  for (const line of lines) {
    if (line.match(/^meta\s*:/)) { inMeta = true; continue; }
    if (inMeta) {
      if (line.match(/^\S/) && !line.match(/^\s*$/)) break;
      const m = line.match(/^\s{2}(\w[\w\s]*?):\s*"?([^"]*)"?\s*$/);
      if (m) meta[m[1].trim()] = m[2].trim();
    }
  }
  return meta;
}

export function parseWorkflow(text) {
  const meta = parseYamlMeta(text);
  const steps = [];
  const spec = {};
  const lines = text.split('\n');
  let section = null, stepIdx = -1, specName = null, colName = null;

  for (const line of lines) {
    // Top-level sections
    if (line.match(/^steps\s*:/)) { section = 'steps'; continue; }
    if (line.match(/^spec\s*:/)) { section = 'spec'; continue; }
    if (line.match(/^meta\s*:/)) { section = 'meta'; continue; }
    if (line.match(/^\S/) && !line.match(/^\s*$/)) { section = null; continue; }

    if (section === 'steps') {
      // New step: "  - output: ..."
      const stepStart = line.match(/^\s{2}-\s+output:\s*(.+)/);
      if (stepStart) { stepIdx++; steps.push({ output: stepStart[1].trim(), name: '', params: {} }); continue; }
      if (stepIdx < 0) continue;
      const nameMatch = line.match(/^\s{4}name:\s*(.+)/);
      if (nameMatch) { steps[stepIdx].name = nameMatch[1].trim(); continue; }
      if (line.match(/^\s{4}params:\s*$/)) continue;
      const paramMatch = line.match(/^\s{6}(\w+):\s*(.+)/);
      if (paramMatch) { steps[stepIdx].params[paramMatch[1]] = paramMatch[2].trim(); }
    }

    if (section === 'spec') {
      // Dataset name (2-space indent, no dash)
      const dsMatch = line.match(/^\s{1,2}(\w[\w_]*):\s*$/);
      if (dsMatch) { specName = dsMatch[1]; spec[specName] = {}; colName = null; continue; }
      if (!specName) continue;
      // Column name (4-space indent)
      const colMatch = line.match(/^\s{3,4}(\w[\w_]*):\s*$/);
      if (colMatch) { colName = colMatch[1]; spec[specName][colName] = {}; continue; }
      // Column property (6-space indent)
      if (colName) {
        const propMatch = line.match(/^\s{5,6}(\w+):\s*(.+)/);
        if (propMatch) { spec[specName][colName][propMatch[1]] = propMatch[2].trim(); }
      }
    }
  }
  return { meta, spec, steps };
}

/**
 * Split CSV text into records of fields, honouring RFC-4180 quoting: a quoted
 * field may contain commas, newlines, and doubled quotes ("").
 *
 * The gsm reporting tables need this — Reporting_Metrics carries threshold
 * vectors like "-2,-1,2,3" in a quoted field, and a naive split on commas
 * shifts every later column (including MetricID) by three positions.
 */
export function splitCsvRecords(text) {
  const records = [];
  let field = '';
  let record = [];
  let inQuotes = false;
  const src = String(text || '');

  const endField = () => { record.push(field.trim()); field = ''; };
  const endRecord = () => { endField(); records.push(record); record = []; };

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 1; }
        else inQuotes = false;
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') { inQuotes = true; continue; }
    if (c === ',') { endField(); continue; }
    if (c === '\r') continue;
    if (c === '\n') { endRecord(); continue; }
    field += c;
  }
  if (field !== '' || record.length) endRecord();
  return records.filter((r) => !(r.length === 1 && r[0] === ''));
}

export function parseCsv(text) {
  const records = splitCsvRecords(text);
  if (records.length < 2) return [];
  const headers = records[0];
  return records.slice(1).map((vals) => {
    const row = Object.create(null);
    headers.forEach((h, i) => {
      row[h] = vals[i] === undefined ? '' : vals[i];
    });
    return row;
  });
}
