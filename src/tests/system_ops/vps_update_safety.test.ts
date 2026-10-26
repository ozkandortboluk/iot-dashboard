import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '../../..');
const updaterScript = fs.readFileSync(path.join(repoRoot, 'vps-update.sh'), 'utf8');

describe('VPS updater reboot confirmation safety', () => {
  it('requires explicit interactive approval even when --yes is supplied', () => {
    const match = updaterScript.match(/confirm_reboot\(\)\s*\{([\s\S]*?)\n\}/);
    expect(match?.[1]).toBeTruthy();

    const rebootConfirmation = match?.[1] || '';
    expect(rebootConfirmation).not.toMatch(/FORCE_YES|CLEAN_YES/);
    expect(rebootConfirmation).toContain('! -r /dev/tty');
    expect(rebootConfirmation).toContain('! -w /dev/tty');
    expect(updaterScript).toMatch(/if confirm_reboot 'VPS simdi yeniden baslatilsin mi\?/);
    expect(updaterScript).not.toMatch(/if confirm 'VPS simdi yeniden baslatilsin mi\?/);
  });
});
