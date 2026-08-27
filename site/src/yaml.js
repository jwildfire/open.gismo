/**
 * Minimal YAML reader for the study config the app consumes.
 *
 * Decision (hub#134 stage 5): hand-rolled, no js-yaml dependency. The app ships
 * as a single self-contained HTML file (vite-plugin-singlefile) served from a
 * static branch, so every dependency is inlined into the bundle. The only YAML
 * the app parses is `config/study-config.yaml` — a known, small shape (nested
 * maps, scalars, flow and block sequences). A ~90-line recursive-descent reader
 * is a smaller and more auditable cost than a general-purpose YAML engine, and
 * the repo already carries two hand-rolled workflow-YAML readers in parsers.js.
 *
 * Supported: comments, indentation-nested maps, `key: value` scalars, quoted
 * strings, flow sequences (`[a, b]`), block sequences of scalars, block
 * sequences of maps, and true/false/null/number coercion.
 * Not supported: anchors/aliases, multi-line scalars, multi-document files.
 * Unsupported constructs are skipped, never thrown — a malformed config
 * degrades to a partial object rather than a blank app.
 */

/** Strip an unquoted trailing comment. */
export function stripComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) {
      return line.slice(0, i);
    }
  }
  return line;
}

/** Coerce a scalar token to string / number / boolean / null / flow array. */
export function coerceScalar(raw) {
  const v = String(raw == null ? '' : raw).trim();
  if (v === '') return '';
  if (v.length > 1 &&
      ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
    return v.slice(1, -1);
  }
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null' || v === '~') return null;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  if (v.startsWith('[') && v.endsWith(']')) {
    const inner = v.slice(1, -1).trim();
    return inner === '' ? [] : inner.split(',').map((x) => coerceScalar(x));
  }
  return v;
}

function tokenize(text) {
  return String(text == null ? '' : text)
    .split('\n')
    .map((raw) => stripComment(raw))
    .map((line) => ({ indent: line.length - line.trimStart().length, body: line.trim() }))
    .filter((l) => l.body !== '');
}

function splitKey(body) {
  const m = body.match(/^((?:"[^"]*")|(?:'[^']*')|(?:[^:]+)):(?:\s+(.*))?$/);
  if (!m) return null;
  return { key: coerceScalar(m[1]), rest: (m[2] || '').trim() };
}

/**
 * Parse a block starting at lines[i] whose members sit at `indent`.
 * @returns {[any, number]} value and the index of the first unconsumed line
 */
function parseBlock(lines, i, indent) {
  if (i >= lines.length) return [null, i];
  if (lines[i].body.startsWith('- ') || lines[i].body === '-') {
    const arr = [];
    while (i < lines.length && lines[i].indent === indent &&
           (lines[i].body.startsWith('- ') || lines[i].body === '-')) {
      const item = lines[i].body === '-' ? '' : lines[i].body.slice(2).trim();
      const kv = item ? splitKey(item) : null;
      if (kv) {
        // Sequence of maps: the first pair is inline with the dash.
        const obj = {};
        if (kv.rest === '') {
          const [val, next] = parseBlock(lines, i + 1, nextIndent(lines, i + 1, indent));
          obj[kv.key] = val;
          i = next;
        } else {
          obj[kv.key] = coerceScalar(kv.rest);
          i += 1;
        }
        // Remaining keys of this map sit deeper than the dash.
        while (i < lines.length && lines[i].indent > indent &&
               !lines[i].body.startsWith('- ')) {
          const inner = splitKey(lines[i].body);
          if (!inner) { i += 1; continue; }
          if (inner.rest === '') {
            const childIndent = nextIndent(lines, i + 1, lines[i].indent);
            const [val, next] = parseBlock(lines, i + 1, childIndent);
            obj[inner.key] = val;
            i = next;
          } else {
            obj[inner.key] = coerceScalar(inner.rest);
            i += 1;
          }
        }
        arr.push(obj);
      } else {
        arr.push(coerceScalar(item));
        i += 1;
      }
    }
    return [arr, i];
  }

  const obj = {};
  while (i < lines.length && lines[i].indent === indent) {
    const kv = splitKey(lines[i].body);
    if (!kv) { i += 1; continue; }
    if (kv.rest === '') {
      const childIndent = nextIndent(lines, i + 1, indent);
      if (childIndent === null) { obj[kv.key] = null; i += 1; continue; }
      const [val, next] = parseBlock(lines, i + 1, childIndent);
      obj[kv.key] = val;
      i = next;
    } else {
      obj[kv.key] = coerceScalar(kv.rest);
      i += 1;
    }
  }
  return [obj, i];
}

function nextIndent(lines, i, parentIndent) {
  if (i >= lines.length) return null;
  // A block sequence may sit at the parent's own indentation.
  if (lines[i].indent < parentIndent) return null;
  if (lines[i].indent === parentIndent && !lines[i].body.startsWith('-')) return null;
  return lines[i].indent;
}

/**
 * Parse a small YAML document into a plain object.
 * @param {string} text
 * @returns {object}
 */
export function parseYaml(text) {
  const lines = tokenize(text);
  if (!lines.length) return {};
  const [value] = parseBlock(lines, 0, lines[0].indent);
  return (value && typeof value === 'object') ? value : {};
}

/**
 * Read `config/study-config.yaml` into the shape the app chrome needs:
 * study identity plus the ordered domain registry (D-APP7 / D-FW7).
 *
 * @param {string} text raw YAML
 * @returns {{identity: object, study: object, domains: Array<object>, raw: object}}
 */
export function parseStudyConfig(text) {
  const raw = parseYaml(text);
  const study = (raw.study && typeof raw.study === 'object' && !Array.isArray(raw.study))
    ? raw.study : {};
  const identity = {
    id: raw.StudyID || study.id || '',
    name: raw.StudyName || study.id || '',
    title: raw.StudyTitle || study.label || raw.StudyName || '',
  };
  const domainsRaw = (raw.domains && typeof raw.domains === 'object' && !Array.isArray(raw.domains))
    ? raw.domains : {};
  const domains = Object.entries(domainsRaw)
    .filter(([, v]) => v && typeof v === 'object' && !Array.isArray(v))
    .map(([key, v]) => ({
      key,
      label: v.label || key,
      charts: v.charts || '',
      workflows: Array.isArray(v.workflows)
        ? v.workflows.map(String)
        : (v.workflows ? [String(v.workflows)] : []),
    }));
  return {
    identity,
    study: {
      id: study.id || identity.id,
      label: study.label || identity.title || identity.id || 'Study',
      phase: study.phase || '',
      synthetic: study.synthetic === true,
      source: study.source || '',
    },
    domains,
    raw,
  };
}

/**
 * Fallback config used when config/study-config.yaml is missing or unreadable —
 * the app still renders with the two launch domains.
 */
export function defaultStudyConfig() {
  return {
    identity: { id: '', name: '', title: 'Study' },
    study: { id: '', label: 'Study', phase: '', synthetic: false, source: '' },
    domains: [
      { key: 'safety', label: 'Safety', charts: 'safety.viz', workflows: ['1_mappings', '3_reports'] },
      { key: 'rbqm', label: 'RBQM', charts: 'gsm.viz', workflows: ['1_mappings', '2_metrics', '3_reporting', '4_modules'] },
    ],
    raw: {},
  };
}
