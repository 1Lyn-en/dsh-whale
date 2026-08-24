import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));

describe('package build contract', () => {
  it('cleans generated output before compiling', () => {
    expect(packageJson.scripts.build).toContain('npm run clean');
    expect(packageJson.scripts.clean).toContain("rmSync('lib'");
  });

  it('does not export generated files without a source entry', () => {
    expect(packageJson.exports['./cyberui-theme']).toBeUndefined();
    expect(packageJson.exports['.']).toBe('./lib/index.js');
    expect(packageJson.exports['./client']).toBe('./lib/client.js');
  });

  it('publishes only runtime CyberUI assets, not README screenshots', () => {
    expect(packageJson.files).toContain('assets/cyberui/DeepSeek_cyberpunk_floating.svg');
    expect(packageJson.files).toContain('assets/cyberui/DeepSeek_cyberpunk.webp');
    expect(packageJson.files).not.toContain('assets/cyberui');
  });
});
