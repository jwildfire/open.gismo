import { describe, it, expect } from 'vitest';
import { buildPackagesTable } from './packages.js';

describe('buildPackagesTable', () => {
  const sampleRows = [
    { package: 'gsm.core', version: '2.2.0', org: 'Gilead-BioStats', repository: 'https://github.com/Gilead-BioStats/gsm.core', sha: 'abc1234def5678' },
    { package: 'workr', version: '1.0.0', org: 'Gilead-BioStats', repository: 'https://github.com/Gilead-BioStats/workr', sha: 'deadbeef1234' },
  ];

  it('renders a table with package name, version, repository link, and SHA link', () => {
    const html = buildPackagesTable(sampleRows);
    expect(html).toContain('gsm.core');
    expect(html).toContain('2.2.0');
    expect(html).toContain('https://github.com/Gilead-BioStats/gsm.core');
    expect(html).toContain('abc1234'); // truncated SHA
    expect(html).toContain('workr');
    expect(html).toContain('1.0.0');
  });

  it('links each package to its repository URL', () => {
    const html = buildPackagesTable(sampleRows);
    expect(html).toContain('href="https://github.com/Gilead-BioStats/gsm.core"');
    expect(html).toContain('href="https://github.com/Gilead-BioStats/workr"');
  });

  it('links each SHA to the commit URL', () => {
    const html = buildPackagesTable(sampleRows);
    expect(html).toContain('/commit/abc1234def5678');
    expect(html).toContain('/commit/deadbeef1234');
  });

  it('displays snapshot date when provided', () => {
    const html = buildPackagesTable(sampleRows, '2025-01-15');
    expect(html).toContain('Snapshot date: 2025-01-15');
  });

  it('returns a no-manifest message for empty rows', () => {
    const html = buildPackagesTable([]);
    expect(html).toContain('No manifest.csv');
  });

  it('handles rows with missing sha gracefully', () => {
    const rows = [{ package: 'pkg', version: '1.0', org: 'org', repository: 'https://example.com', sha: '' }];
    const html = buildPackagesTable(rows);
    expect(html).toContain('pkg');
    expect(html).toContain('1.0');
    // Empty SHA should not produce a commit link
    expect(html).not.toContain('/commit/');
  });
});
