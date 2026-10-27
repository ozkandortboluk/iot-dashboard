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

  it('treats the plaintext .env file as optional in the backup fallback', () => {
    const backupMatch = updaterScript.match(/create_standalone_backup\(\)\s*\{([\s\S]*?)\n\}/);
    const validationMatch = updaterScript.match(/backup_and_validate\(\)\s*\{([\s\S]*?)\n\}/);
    expect(backupMatch?.[1]).toBeTruthy();
    expect(validationMatch?.[1]).toBeTruthy();

    const backupBody = backupMatch?.[1] || '';
    const validationBody = validationMatch?.[1] || '';
    expect(backupBody).toContain('[[ -f .env ]] && manifest_files+=(config/.env)');
    expect(backupBody).toContain('sha256sum "${manifest_files[@]}" > manifest.sha256');
    expect(validationBody).toContain('if [[ -e "$latest/config/.env" ]]');
    expect(validationBody).toContain("if [[ -f \"$latest/config/.env\" ]]");
  });
});
