import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildMasthead, buildTimeline, buildProvenanceChip, buildProvenancePanel,
  wireMasthead, snapshotDate, snapshotDateTime, shortSnapshotId, buildFacts, buildSubtitle,
} from './masthead.js';

const SNAPS = [
  { snapshot_id: 'ps-001', created_at: '2026-07-28T18:31:14Z', input_data_version: 'cut-1', package_snapshot: 'local-2026-07-28' },
  { snapshot_id: 'ps-002', created_at: '2026-07-28T18:41:49Z', input_data_version: 'cut-2', package_snapshot: 'local-2026-07-28' },
];

const CONFIG = {
  identity: { id: 'DEMO-301', title: 'DEMO-301 — Safety Review' },
  study: { id: 'DEMO-301', label: 'DEMO-301 — Safety Review', phase: 'Phase 2', synthetic: true, source: 'gsm.core example source' },
  domains: [],
};

const FACTS = { participants: '765', participantTarget: '1000', sites: '148' };
const MANIFEST = [
  { org: 'Gilead-BioStats', package: 'gsm.core', version: '1.2.0', repository: 'https://github.com/Gilead-BioStats/gsm.core', sha: '7f3bd8b55961de29d70aaff1d61f09ee1a44b1d4' },
  { org: 'Gilead-BioStats', package: 'gsm.kri', version: '1.5.0', repository: 'https://github.com/Gilead-BioStats/gsm.kri', sha: '' },
];

function mount(html) {
  const el = document.createElement('header');
  el.innerHTML = html;
  document.body.appendChild(el);
  return el;
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('date helpers', () => {
  it('formats snapshot timestamps', () => {
    expect(snapshotDate('2026-07-28T18:41:49Z')).toBe('2026-07-28');
    expect(snapshotDateTime('2026-07-28T18:41:49Z')).toBe('2026-07-28 18:41 UTC');
    expect(snapshotDate('')).toBe('');
    expect(shortSnapshotId('ps-002')).toBe('002');
  });
});

describe('buildTimeline', () => {
  it('renders one focusable dot per snapshot, oldest first', () => {
    const el = mount(buildTimeline(SNAPS, 'ps-002'));
    const dots = el.querySelectorAll('.timeline-dot');
    expect(dots).toHaveLength(2);
    expect(dots[0].dataset.snapshot).toBe('ps-001');
    expect(dots[0].tagName).toBe('BUTTON');
  });

  it('marks the current snapshot with aria-current', () => {
    const el = mount(buildTimeline(SNAPS, 'ps-001'));
    const dots = el.querySelectorAll('.timeline-dot');
    expect(dots[0].getAttribute('aria-current')).toBe('true');
    expect(dots[1].hasAttribute('aria-current')).toBe(false);
    expect(dots[0].classList.contains('is-active')).toBe(true);
  });

  it('labels the newest snapshot as current and carries a text label per dot', () => {
    const el = mount(buildTimeline(SNAPS, 'ps-002'));
    const labels = [...el.querySelectorAll('.timeline-label')].map((n) => n.textContent);
    expect(labels[1]).toContain('current');
    expect(labels[0]).toBe('2026-07-28');
    const aria = el.querySelectorAll('.timeline-dot')[0].getAttribute('aria-label');
    expect(aria).toContain('ps-001');
    expect(aria).toContain('cut-1');
  });

  it('degrades to a note when there is no snapshot history', () => {
    const el = mount(buildTimeline([], null));
    expect(el.querySelectorAll('.timeline-dot')).toHaveLength(0);
    expect(el.textContent).toContain('Single snapshot');
  });
});

describe('buildProvenanceChip', () => {
  it('collapses to snapshot id and date, expandable via aria', () => {
    const el = mount(buildProvenanceChip(SNAPS[1], 'completed'));
    const chip = el.querySelector('#provChip');
    expect(chip.getAttribute('aria-expanded')).toBe('false');
    expect(chip.getAttribute('aria-controls')).toBe('provPanel');
    expect(el.querySelector('.prov-id').textContent).toBe('ps-002');
    expect(el.querySelector('.prov-date').textContent).toBe('2026-07-28');
  });

  it('never signals state by colour alone', () => {
    const ok = mount(buildProvenanceChip(SNAPS[1], 'completed'));
    expect(ok.querySelector('.prov-chip').getAttribute('aria-label')).toContain('Run completed');
    document.body.innerHTML = '';
    const bad = mount(buildProvenanceChip(SNAPS[1], 'failed'));
    expect(bad.querySelector('.prov-chip').classList.contains('is-warn')).toBe(true);
    expect(bad.querySelector('.prov-chip').getAttribute('aria-label')).toContain('Run status: failed');
  });
});

describe('buildProvenancePanel', () => {
  it('renders the reproducibility record hidden by default', () => {
    const el = mount(buildProvenancePanel(SNAPS[1], MANIFEST, 'completed'));
    const panel = el.querySelector('#provPanel');
    expect(panel.hidden).toBe(true);
    expect(el.textContent).toContain('cut-2');
    expect(el.textContent).toContain('local-2026-07-28');
    expect(el.textContent).toContain('2 pinned');
  });

  it('lists manifest rows with short SHAs linking to the commit', () => {
    const el = mount(buildProvenancePanel(SNAPS[1], MANIFEST, 'completed'));
    const links = [...el.querySelectorAll('.prov-table a')].map((a) => a.getAttribute('href'));
    expect(links).toContain('https://github.com/Gilead-BioStats/gsm.core/commit/7f3bd8b55961de29d70aaff1d61f09ee1a44b1d4');
    expect(el.querySelector('.prov-table').textContent).toContain('7f3bd8b');
  });

  it('says so, in words, when a package has no SHA', () => {
    const el = mount(buildProvenancePanel(SNAPS[1], MANIFEST, 'completed'));
    expect(el.textContent).toContain('not pinned');
  });

  it('renders without a manifest', () => {
    const el = mount(buildProvenancePanel(SNAPS[1], [], 'completed'));
    expect(el.textContent).toContain('no manifest.csv');
    expect(el.querySelector('.prov-table')).toBe(null);
  });
});

describe('buildMasthead', () => {
  const html = () => buildMasthead({
    config: CONFIG, facts: FACTS, snapshots: SNAPS, currentId: 'ps-002',
    snapshot: SNAPS[1], manifestRows: MANIFEST, pipelineStatus: 'completed',
  });

  it('leads with the study title from the config', () => {
    const el = mount(html());
    expect(el.querySelector('.study-title').textContent).toBe('DEMO-301 — Safety Review');
  });

  it('carries the synthetic-data disclaimer', () => {
    const el = mount(html());
    expect(el.querySelector('.masthead-note').textContent).toContain('Synthetic study');
  });

  it('shows study facts with tabular numbers', () => {
    const el = mount(html());
    const facts = el.querySelector('.study-facts').textContent;
    expect(facts).toContain('Phase 2');
    expect(facts).toContain('765');
    expect(facts).toContain('1000');
    expect(facts).toContain('148 sites');
  });

  it('hosts the timeline and the provenance chip + panel', () => {
    const el = mount(html());
    expect(el.querySelectorAll('.timeline-dot')).toHaveLength(2);
    expect(el.querySelector('#provChip')).toBeTruthy();
    expect(el.querySelector('#provPanel')).toBeTruthy();
  });

  it('degrades when the study has no facts', () => {
    const el = mount(buildMasthead({
      config: { study: { label: 'Study' } }, facts: {}, snapshots: [], currentId: null,
      snapshot: null, manifestRows: [], pipelineStatus: 'unknown',
    }));
    expect(el.querySelector('.study-title').textContent).toBe('Study');
    expect(el.querySelector('.study-facts')).toBe(null);
  });
});

describe('buildFacts / buildSubtitle', () => {
  it('omits the participant chip when counts are missing', () => {
    expect(buildFacts(CONFIG, {})).toBe('Phase 2');
  });

  it('always mentions the static publication path', () => {
    expect(buildSubtitle(CONFIG, {})).toContain('static files');
  });
});

describe('wireMasthead', () => {
  it('fires the snapshot callback with the dot id', () => {
    const el = mount(buildMasthead({
      config: CONFIG, facts: FACTS, snapshots: SNAPS, currentId: 'ps-002',
      snapshot: SNAPS[1], manifestRows: MANIFEST, pipelineStatus: 'completed',
    }));
    const seen = [];
    wireMasthead(el, (id) => seen.push(id));
    el.querySelectorAll('.timeline-dot')[0].click();
    expect(seen).toEqual(['ps-001']);
  });

  it('toggles the provenance panel and keeps aria-expanded in sync', () => {
    const el = mount(buildMasthead({
      config: CONFIG, facts: FACTS, snapshots: SNAPS, currentId: 'ps-002',
      snapshot: SNAPS[1], manifestRows: MANIFEST, pipelineStatus: 'completed',
    }));
    wireMasthead(el, () => {});
    const chip = el.querySelector('#provChip');
    const panel = el.querySelector('#provPanel');
    expect(panel.hidden).toBe(true);
    chip.click();
    expect(panel.hidden).toBe(false);
    expect(chip.getAttribute('aria-expanded')).toBe('true');
    chip.click();
    expect(panel.hidden).toBe(true);
    expect(chip.getAttribute('aria-expanded')).toBe('false');
  });

  it('closes the panel on Escape', () => {
    const el = mount(buildMasthead({
      config: CONFIG, facts: FACTS, snapshots: SNAPS, currentId: 'ps-002',
      snapshot: SNAPS[1], manifestRows: MANIFEST, pipelineStatus: 'completed',
    }));
    wireMasthead(el, () => {});
    const chip = el.querySelector('#provChip');
    const panel = el.querySelector('#provPanel');
    chip.click();
    chip.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(panel.hidden).toBe(true);
  });
});
