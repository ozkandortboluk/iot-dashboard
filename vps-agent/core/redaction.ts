const sensitivePatterns = [
  /\b(?:bot\d{5,}:[A-Za-z0-9_-]{20,})\b/g,
  /\b(?:Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi,
  /\b(?:password|token|secret|api[_-]?key|authorization)\s*[:=]\s*[^\s,;]+/gi,
];

export function redactText(value: string): string {
  return sensitivePatterns.reduce((text, pattern) => text.replace(pattern, '[REDACTED]'), value).slice(0, 500);
}

export function safeErrorCode(error: unknown): string {
  if (error instanceof Error && error.name === 'AbortError') return 'timeout';
  if (error instanceof Error && error.name === 'TimeoutError') return 'timeout';
  if (error instanceof TypeError) return 'network_error';
  return 'check_failed';
}
