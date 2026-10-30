import type { Logger } from '@decartai/sdk';
export function connectionDiagnostics() {
  let reason = '';
  let original = '';
  const capture = (_message: string, data?: Record<string, unknown>) => {
    if (typeof data?.reason === 'string' && ['policy_violation', 'session_limit'].includes(data.reason)) reason = data.reason;
    if (typeof data?.error === 'string' && !/stale connect attempt|reconnect cancelled/i.test(data.error)) original ||= data.error;
  };
  const logger: Logger = {debug(){}, info(){}, warn:capture, error:capture};
  return {
    logger,
    error(fallback: unknown): unknown {
      if (reason === 'session_limit') return new Error('Decart session limit reached. End other Anywear or Decart sessions using this account, then try again.');
      if (reason === 'policy_violation') return new Error('Decart ended this session with a policy_violation response. Check your account access and the selected outfit in the Decart dashboard.');
      const detail = fallback && typeof fallback === 'object' && 'message' in fallback ? String(fallback.message) : String(fallback);
      if (/stale connect attempt/i.test(detail)) return new Error(original || 'Decart cancelled the connection during startup. Try opening this app in Chrome. If it repeats, check your Decart account’s live-model access and active-session limit.');
      return fallback;
    },
  };
}
