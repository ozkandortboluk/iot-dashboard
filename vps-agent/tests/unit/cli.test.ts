import { describe, expect, it } from 'vitest';
import { parseCliArgs } from '../../cli.js';

describe('VPS Agent CLI arguments', () => {
  it('requires an absolute config path', () => {
    expect(() => parseCliArgs([])).toThrow('missing_config_path');
    expect(() => parseCliArgs(['--config', 'monitor.json'])).toThrow('config_path_must_be_absolute');
  });

  it('accepts only an explicit config path and rejects unknown arguments', () => {
    expect(parseCliArgs(['--config', '/etc/vps-agent/monitor.json'])).toEqual({ configPath: '/etc/vps-agent/monitor.json' });
    expect(() => parseCliArgs(['--unsafe'])).toThrow('unsupported_argument');
  });
});
