export function explainConnectionError(error: unknown): string {
  const record = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const code = typeof record.code === 'string' ? record.code : '';
  const detail = typeof record.message === 'string' ? record.message : typeof error === 'string' ? error : '';
  const text = `${code} ${detail}`;
  let help = '';
  if (/INVALID_API_KEY|TOKEN_(INVALID|EXPIRED)|unauthori[sz]ed|\b401\b/i.test(text)) {
    help = 'Decart rejected this API key. Open Connection settings and enter an active Decart API key.';
  } else if (/credit|balance|payment|billing|\b402\b/i.test(text)) {
    help = 'Decart requires available API credits. Check the balance for this key at platform.decart.ai.';
  } else if (/UNSUPPORTED_PLATFORM_FEATURE|not supported|not implemented|encoded.transform/i.test(text)) {
    help = 'This browser may not support the required live-video features. Open http://127.0.0.1:5173 in Google Chrome or Edge and try again.';
  } else if (/MODEL_NOT_FOUND|model.*(access|permission|available)|\b403\b/i.test(text)) {
    help = 'Check that your Decart account has access to the Lucy VTON real-time model.';
  } else if (/websocket|network|ICE|timeout|timed out|signaling/i.test(text)) {
    help = 'The live connection to Decart failed. Try Chrome, check your internet connection, and check whether a VPN or firewall is blocking WebRTC.';
  }
  const original = detail || code;
  if (help) return `${help}${original ? ` Provider details: ${original}` : ''}`;
  return original || 'The AI session could not start. Try again in Chrome and check your Decart API access and credits.';
}
