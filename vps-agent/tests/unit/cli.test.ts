import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCliArgs } from '../../cli.js';

describe('VPS Agent CLI arguments', () => {
  it('requires an absolute config path', () => {
    expect(() => parseCliArgs([])).toThrow('missing_config_path');
    expect(() => parseCliArgs(['--config', 'monitor.json'])).toThrow('config_path_must_be_absolute');
  });

  it('accepts only known flags and keeps external actions disabled by default', () => {
    const absoluteConfig = path.resolve('monitor.json');
    expect(parseCliArgs(['--config', absoluteConfig])).toEqual({
      configPath: absoluteConfig,
      allowTelegramSend: false,
      allowAiAnalysis: false,
    });
    expect(parseCliArgs(['--config', absoluteConfig, '--allow-telegram-send', '--allow-ai-analysis'])).toEqual({
      configPath: absoluteConfig,
      allowTelegramSend: true,
      allowAiAnalysis: true,
    });
    expect(() => parseCliArgs(['--unsafe'])).toThrow('unsupported_argument');
  });
});
