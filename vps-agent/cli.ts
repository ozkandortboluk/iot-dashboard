import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseMonitorConfig } from './core/config.js';
import { buildReport } from './core/report.js';
import { runCheckers } from './core/runner.js';
import { createReadOnlyCheckers } from './operations/checkFactory.js';

export interface CliOptions { configPath: string; }

export function parseCliArgs(args: string[]): CliOptions {
  let configPath: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help' || argument === '-h') {
      throw new Error('usage: vps-agent --config <absolute-config-path>');
    }
    if (argument === '--config') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw new Error('missing_config_path');
      configPath = value;
      index += 1;
      continue;
    }
    throw new Error('unsupported_argument');
  }
  if (!configPath) throw new Error('missing_config_path');
  if (!path.isAbsolute(configPath)) throw new Error('config_path_must_be_absolute');
  return { configPath: path.resolve(configPath) };
}

export async function runAgent(options: CliOptions): Promise<number> {
  const raw = await readFile(options.configPath, { encoding: 'utf8' });
  const config = parseMonitorConfig(JSON.parse(raw) as unknown);
  const checkers = createReadOnlyCheckers(config);
  const results = await runCheckers(checkers, {
    timeoutMs: config.health.timeoutMs,
    retries: config.health.retries,
    retryDelayMs: 250,
  });
  const report = buildReport(results, new Date(), 'observe_only');
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.status === 'critical') return 2;
  if (report.status === 'warning' || report.status === 'unknown') return 1;
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const options = parseCliArgs(process.argv.slice(2));
    const exitCode = await runAgent(options);
    process.exitCode = exitCode;
  } catch (error) {
    const code = error instanceof Error && /^usage:/.test(error.message)
      ? error.message
      : error instanceof Error && ['missing_config_path', 'config_path_must_be_absolute', 'unsupported_argument'].includes(error.message)
        ? error.message
        : 'vps_agent_startup_failed';
    process.stderr.write(`${code}\n`);
    process.exitCode = 64;
  }
}
