/**
 * Global chrome: the study masthead.
 *
 * One dense espresso row — study title, the facts inline, the snapshot timeline
 * and the provenance chip — sitting above the view, to the right of the
 * sidebar. It is deliberately not a hero: the reader came for the data, and the
 * vertical budget belongs to the data.
 *
 * The provenance chip is the signature component: collapsed it names the
 * snapshot, expanded it is the snapshot's whole reproducibility record.
 */

import { esc } from './utils.js';

const REPO_URL = 'https://github.com/jwildfire/open.gismo';

/** 2026-07-28T18:41:49Z → 2026-07-28 */
export function snapshotDate(iso) {
  const s = String(iso || '');
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : s;
}

/** 2026-07-28T18:41:49Z → 2026-07-28 18:41 UTC */
export function snapshotDateTime(iso) {
  const s = String(iso || '');
  const m = s.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  return m ? `${m[1]} ${m[2]} UTC` : s;
}

/** Short id for the timeline dot label: ps-002 → 002 */
export function shortSnapshotId(id) {
  const m = String(id || '').match(/(\d+)$/);
  return m ? m[1] : String(id || '');
}

/**
 * The snapshot timeline — one dot per snapshots.json entry, oldest first, laid
 * out inline in the masthead row. Each dot is a real button so it is tabbable
 * and carries a text label; the full date, input data version and current-ness
 * ride in the accessible name rather than taking horizontal room.
 */
export function buildTimeline(snapshots, currentId) {
  if (!snapshots || snapshots.length === 0) {
    return '<div class="timeline timeline-empty">Single snapshot</div>';
  }
  const latest = snapshots[snapshots.length - 1]?.snapshot_id;
  let h = '<div class="timeline" role="group" aria-label="Snapshot timeline">';
  snapshots.forEach((s, i) => {
    const active = s.snapshot_id === currentId;
    const isLatest = s.snapshot_id === latest;
    if (i > 0) h += '<span class="timeline-rule" aria-hidden="true"></span>';
    const aria = `Snapshot ${s.snapshot_id}, ${snapshotDateTime(s.created_at)}, input data ${s.input_data_version || 'unknown'}${isLatest ? ', current snapshot' : ''}`;
    h += `<button type="button" class="timeline-dot${active ? ' is-active' : ''}" `
      + `data-snapshot="${esc(s.snapshot_id)}" ${active ? 'aria-current="true" ' : ''}`
      + `aria-label="${esc(aria)}" title="${esc(aria)}">`
      + '<span class="timeline-mark" aria-hidden="true"></span>'
      + `<span class="timeline-label mono">${esc(s.snapshot_id)}</span>`
      + (isLatest ? '<span class="timeline-current">current</span>' : '')
      + '</button>';
  });
  h += '</div>';
  return h;
}

/**
 * Provenance chip — collapsed state in the masthead.
 * Green check when the pipeline run completed; amber with a text label
 * otherwise (never colour alone).
 */
export function buildProvenanceChip(snapshot, pipelineStatus) {
  const ok = String(pipelineStatus || '').toLowerCase() === 'completed';
  const id = snapshot?.snapshot_id || 'unknown snapshot';
  const date = snapshotDate(snapshot?.created_at);
  const mark = ok ? '✓' : '!';
  const state = ok ? 'Run completed, pins resolve' : `Run status: ${pipelineStatus || 'unknown'}`;
  return '<button type="button" id="provChip" class="prov-chip' + (ok ? '' : ' is-warn') + '" '
    + 'aria-expanded="false" aria-controls="provPanel" '
    + `aria-label="Provenance: ${esc(id)}, ${esc(date)}. ${esc(state)}. Show the reproducibility record">`
    + `<span class="prov-mark" aria-hidden="true">${mark}</span>`
    + `<span class="prov-id">${esc(id)}</span>`
    + '<span class="prov-sep" aria-hidden="true">·</span>'
    + `<span class="prov-date">${esc(date)}</span>`
    + '<span class="prov-caret" aria-hidden="true">▾</span>'
    + '</button>';
}

/**
 * Provenance panel — the expanded reproducibility record: snapshot identity,
 * input data version, package snapshot, and the pinned manifest rows.
 */
export function buildProvenancePanel(snapshot, manifestRows, pipelineStatus, config) {
  const rows = Array.isArray(manifestRows) ? manifestRows : [];
  const s = snapshot || {};
  let h = '<div id="provPanel" class="prov-panel" hidden>';
  h += '<div class="prov-panel-inner">';
  h += '<div class="prov-grid">';
  h += provField('Snapshot', `${s.snapshot_id || '—'}`, 'mono');
  h += provField('Created', snapshotDateTime(s.created_at) || '—', 'mono');
  h += provField('Input data', s.input_data_version || '—', 'mono');
  h += provField('Package snapshot', s.package_snapshot || '—', 'mono');
  h += provField('Pipeline run', pipelineStatus || 'unknown', '');
  h += provField('Packages', rows.length ? `${rows.length} pinned` : 'no manifest.csv', '');
  if (config?.study?.source) h += provField('Source data', config.study.source, '');
  h += '</div>';

  if (rows.length) {
    h += '<div class="table-scroll"><table class="prov-table"><caption class="visually-hidden">Package manifest for this snapshot</caption>';
    h += '<thead><tr><th scope="col">Package</th><th scope="col">Version</th><th scope="col">SHA</th></tr></thead><tbody>';
    for (const r of rows) {
      const sha = String(r.sha || '');
      const url = r.repository || '';
      const shaCell = sha
        ? (url
          ? `<a class="mono" href="${esc(url)}/commit/${esc(sha)}" target="_blank" rel="noopener">${esc(sha.slice(0, 7))}</a>`
          : `<span class="mono">${esc(sha.slice(0, 7))}</span>`)
        : '<span class="prov-nosha" title="No SHA recorded for this package">not pinned</span>';
      h += `<tr><td>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(r.package)}</a>` : esc(r.package)}</td>`
        + `<td class="mono">${esc(r.version)}</td><td>${shaCell}</td></tr>`;
    }
    h += '</tbody></table></div>';
  }

  h += `<div class="prov-foot">Every number on this site comes from this snapshot tree. `
    + `<a href="${REPO_URL}" target="_blank" rel="noopener">open.gismo on GitHub ↗</a></div>`;
  h += '</div></div>';
  return h;
}

function provField(label, value, cls) {
  return '<div class="prov-field">'
    + `<div class="prov-label">${esc(label)}</div>`
    + `<div class="prov-value ${cls}">${esc(String(value))}</div>`
    + '</div>';
}

/**
 * The inline facts strip: the synthetic-data disclaimer first (it is a claim
 * about the data, so it leads), then phase, enrolment, sites, indication.
 */
export function buildFacts(config, facts) {
  const bits = [];
  if (config?.study?.synthetic) {
    bits.push('<span class="fact-flag">Synthetic study — no real participant data</span>');
  }
  if (config?.study?.phase) bits.push(esc(config.study.phase));
  else if (facts?.phase) bits.push(esc(facts.phase));
  if (facts?.participants) {
    bits.push(facts.participantTarget
      ? `<span class="num">${esc(facts.participants)}</span> / <span class="num">${esc(facts.participantTarget)}</span> participants`
      : `<span class="num">${esc(facts.participants)}</span> participants`);
  }
  if (facts?.sites) bits.push(`<span class="num">${esc(facts.sites)}</span> sites`);
  if (facts?.indication) bits.push(esc(facts.indication));
  return bits.join('<span class="dot-sep" aria-hidden="true">·</span>');
}

/**
 * Full masthead markup: one row, plus the provenance panel it can open.
 * @param {object} o { config, facts, snapshots, currentId, snapshot, manifestRows, pipelineStatus }
 */
export function buildMasthead(o) {
  const title = o.config?.study?.label || o.config?.identity?.title || 'Study';
  let h = '<div class="masthead-inner">';
  h += '<div class="masthead-row">';
  h += `<h1 class="study-title">${esc(title)}</h1>`;
  const facts = buildFacts(o.config, o.facts);
  if (facts) h += `<div class="study-facts">${facts}</div>`;
  h += '<div class="masthead-aside">';
  h += buildTimeline(o.snapshots, o.currentId);
  h += buildProvenanceChip(o.snapshot, o.pipelineStatus);
  h += '</div>';
  h += '</div>';
  h += '</div>';
  h += buildProvenancePanel(o.snapshot, o.manifestRows, o.pipelineStatus, o.config);
  return h;
}

/**
 * Wire the masthead: timeline dots switch the snapshot context, the provenance
 * chip toggles its panel (click, Enter/Space via native button, Escape closes).
 *
 * @param {HTMLElement} root masthead element
 * @param {(id:string)=>void} onSnapshot
 */
export function wireMasthead(root, onSnapshot) {
  root.querySelectorAll('.timeline-dot').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.snapshot;
      if (id) onSnapshot(id);
    });
  });

  const chip = root.querySelector('#provChip');
  const panel = root.querySelector('#provPanel');
  if (!chip || !panel) return;

  const setOpen = (open) => {
    chip.setAttribute('aria-expanded', String(open));
    panel.hidden = !open;
    chip.classList.toggle('is-open', open);
  };
  chip.addEventListener('click', () => setOpen(chip.getAttribute('aria-expanded') !== 'true'));
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { setOpen(false); chip.focus(); }
  });
  chip.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setOpen(false);
  });
}
