// Strip emoji variation selectors so '✅' === '✅️'.
export function normalizeEmoji(s: string | null | undefined): string {
  if (!s) return '';
  return s.replace(/︎|️/g, '').trim();
}

// Match plain confirm/cancel text plus Apple's SMS tapback fallback strings
// like: Liked "Clear this chat history? ..."
export function classifyConfirmation(text: string): 'confirm' | 'cancel' | undefined {
  const t = text.trim();
  const lower = t.toLowerCase().replace(/[.!?]+$/, '');
  if (/^(yes|y|yep|yeah|ok|okay|confirm|sure|do it|clear|✅)$/.test(lower)) {
    return 'confirm';
  }
  if (/^(no|n|nope|cancel|stop|nevermind|never mind|❌)$/.test(lower)) {
    return 'cancel';
  }
  if (/^(liked|loved|emphasized)\s+["“]/i.test(t)) return 'confirm';
  if (/^disliked\s+["“]/i.test(t)) return 'cancel';
  return undefined;
}

export const CLEAR_COMMAND_RE =
  /^\s*(\/clear|clear(?:\s+chat)?|reset|forget(?:\s+everything)?)\s*$/i;
