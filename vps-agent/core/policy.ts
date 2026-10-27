export type RequestedAction = 'read_health' | 'read_system_metrics' | 'read_docker_status' | 'read_backup_metadata' | 'read_allowed_logs' | 'send_telegram' | 'analyze_with_ai' | 'analyze_with_codex' | 'write_code' | 'run_shell' | 'database_write' | 'backup_create' | 'backup_restore' | 'service_restart' | 'install_service' | 'git_push' | 'git_merge' | 'deploy';

export interface PolicyDecision { allowed: boolean; reason: string; }

const observeActions = new Set<RequestedAction>([
  'read_health', 'read_system_metrics', 'read_docker_status', 'read_backup_metadata', 'read_allowed_logs',
]);

export function authorizeAction(mode: string, action: RequestedAction, approvals: { realTelegramApproved?: boolean; aiAnalysisApproved?: boolean } = {}): PolicyDecision {
  if (observeActions.has(action) && mode === 'observe_only') return { allowed: true, reason: 'read_only_observation' };
  if (action === 'send_telegram' && approvals.realTelegramApproved === true && mode === 'observe_only') {
    return { allowed: true, reason: 'explicit_external_send_approval' };
  }
  if (action === 'analyze_with_ai' && approvals.aiAnalysisApproved === true && mode === 'observe_only') {
    return { allowed: true, reason: 'explicit_external_analysis_approval' };
  }
  if (action === 'analyze_with_codex') return { allowed: false, reason: 'codex_cli_adapter_not_implemented' };
  return { allowed: false, reason: 'action_not_authorized_by_pr_policy' };
}

export function assertReadOnlyMode(mode: string): void {
  if (mode !== 'observe_only') throw new Error('This implementation supports observe_only mode only.');
}
