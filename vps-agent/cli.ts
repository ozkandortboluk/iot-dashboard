import { lstat, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { OpenAIDiagnoser } from './analysis/openAiAnalyzer.js';
import { parseMonitorConfig } from './core/config.js';
import { withInstanceLock } from './core/lock.js';
import { authorizeAction } from './core/policy.js';
import { buildReport } from './core/report.js';
import { readRuntimeCheckpoint, writeRuntimeCheckpoint, type RuntimeCheckpoint } from './core/runtimeState.js';
import { runCheckers } from './core/runner.js';
import { createReadOnlyCheckers } from './operations/checkFactory.js';
import { EventDeduplicator } from './notifications/dedup.js';
import { deliverNotifications } from './notifications/delivery.js';
import { readTelegramCredentials, TelegramHttpSender } from './notifications/telegram.js';

export interface CliOptions {
  configPath: string;
  allowTelegramSend: boolean;
  allowAiAnalysis: boolean;
}

export function parseCliArgs(args: string[]): CliOptions {
  let configPath: string | undefined;
  let allowTelegramSend = false;
  let allowAiAnalysis = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help' || argument === '-h') {
      throw new Error('usage: vps-agent --config <absolute-config-path> [--allow-telegram-send] [--allow-ai-analysis]');
    }
    if (argument === '--allow-telegram-send') { allowTelegramSend = true; continue; }
    if (argument === '--allow-ai-analysis') { allowAiAnalysis = true; continue; }
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
  return { configPath: path.resolve(configPath), allowTelegramSend, allowAiAnalysis };
}

async function executeRun(options: CliOptions, config: ReturnType<typeof parseMonitorConfig>): Promise<number> {
  const checkers = createReadOnlyCheckers(config);
  if (checkers.length === 0) throw new Error('no_checks_enabled');

  const statePath = config.runtime.statePath;
  let state: RuntimeCheckpoint = statePath
    ? (await readRuntimeCheckpoint(statePath) ?? { schemaVersion: 1 })
    : { schemaVersion: 1 };

  const results = await runCheckers(checkers, {
    timeoutMs: config.health.timeoutMs,
    retries: config.health.retries,
    retryDelayMs: 250,
  });
  const report = buildReport(results, new Date(), 'observe_only');

  let notifications: Record<string, unknown> = { status: 'disabled' };
  let nextState: RuntimeCheckpoint = {
    ...state,
    lastRunAt: report.generatedAt,
    lastCompletedCheck: results[results.length - 1]?.id,
    lastResultStatus: report.status,
  };

  if (config.telegram.enabled) {
    const credentials = readTelegramCredentials(process.env, config.telegram.tokenEnv, config.telegram.chatIdEnv);
    if (!credentials) {
      notifications = { status: 'failed', sent: 0, deduplicated: 0, failed: 1, blocked: 1, reason: 'telegram_credentials_missing' };
    } else {
      const sender = new TelegramHttpSender(credentials);
      const deduplicator = new EventDeduplicator(24 * 60 * 60 * 1000, 200, state.notificationHistory ?? []);
      const delivery = await deliverNotifications(report, sender, deduplicator, {
        now: new Date(report.generatedAt),
        timeZone: config.timezone,
        summaryHour: config.telegram.dailySummaryHour,
        dailyState: state.dailySummarySentLocalDate ? { lastSentLocalDate: state.dailySummarySentLocalDate } : {},
        realTelegramApproved: options.allowTelegramSend,
      });
      notifications = {
        status: delivery.failed ? 'failed' : delivery.blocked ? 'blocked' : 'ready',
        sent: delivery.sent,
        deduplicated: delivery.deduplicated,
        failed: delivery.failed,
        blocked: delivery.blocked,
        statePersisted: Boolean(statePath),
      };
      nextState = {
        ...nextState,
        ...(delivery.dailySummaryState.lastSentLocalDate ? { dailySummarySentLocalDate: delivery.dailySummaryState.lastSentLocalDate } : {}),
        notificationHistory: deduplicator.exportState(new Date(report.generatedAt).getTime()),
      };
    }
  }

  let analysis: Record<string, unknown> = { status: 'disabled', summaryCode: 'ai_disabled' };
  if (config.ai.enabled) {
    const findings = report.results
      .filter((result) => result.status === 'warning' || result.status === 'critical' || result.status === 'unknown')
      .slice(0, 12)
      .map((result) => ({
        checkId: result.id,
        status: result.status as 'warning' | 'critical' | 'unknown',
        summaryCode: result.summary,
        metrics: Object.fromEntries(Object.entries(result.metrics ?? {})
          .filter(([, value]) => typeof value === 'number' || typeof value === 'boolean' || value === null)
          .slice(0, 20)),
      }));
    if (report.status === 'ok') {
      analysis = { status: 'skipped', summaryCode: 'no_meaningful_findings' };
    } else if (!authorizeAction(config.mode, 'analyze_with_ai', { aiAnalysisApproved: options.allowAiAnalysis }).allowed) {
      analysis = { status: 'blocked', summaryCode: 'explicit_ai_approval_flag_required' };
    } else if (!process.env[config.ai.apiKeyEnv]) {
      analysis = { status: 'skipped', summaryCode: 'ai_api_key_missing' };
    } else {
      const result = await new OpenAIDiagnoser({
        apiKey: process.env[config.ai.apiKeyEnv]!,
        model: config.ai.model,
        maxOutputTokens: config.ai.maxOutputTokens,
      }).diagnose(findings);
      analysis = result;
    }
  }

  if (statePath) await writeRuntimeCheckpoint(statePath, nextState);

  const integrationFailed = Number(notifications.failed ?? 0) > 0
    || notifications.status === 'blocked'
    || analysis.status === 'failed'
    || analysis.status === 'blocked';
  const output = {
    ...report,
    notifications,
    analysis,
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);

  if (report.status === 'critical') return 2;
  if (report.status === 'warning' || report.status === 'unknown' || integrationFailed) return 1;
  return 0;
}

export async function runAgent(options: CliOptions): Promise<number> {
  const raw = await readFile(options.configPath, { encoding: 'utf8' });
  const config = parseMonitorConfig(JSON.parse(raw) as unknown);
  if (config.telegram.enabled && !config.runtime.statePath) throw new Error('runtime_state_path_required_for_telegram');
  if (config.runtime.statePath) {
    // Validate the path before creating the directory or lock file.
    await readRuntimeCheckpoint(config.runtime.statePath);
    const directory = path.dirname(config.runtime.statePath);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const info = await lstat(directory);
    if (info.isSymbolicLink() || !info.isDirectory() || (process.platform !== 'win32' && (info.mode & 0o077) !== 0)) {
      throw new Error('runtime_directory_permissions_unsafe');
    }
    return withInstanceLock(`${config.runtime.statePath}.lock`, () => executeRun(options, config));
  }
  return executeRun(options, config);
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
    if (code.startsWith('usage:')) {
      process.stdout.write(`${code}\n`);
      process.exitCode = 0;
    } else {
      process.stderr.write(`${code}\n`);
      process.exitCode = 64;
    }
  }
}
