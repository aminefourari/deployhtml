import { BRAND_KEYWORDS, SCAM_PHRASES } from "./blocklist";

export interface ScanResult {
  blocked: boolean;
  reason?: string;
}

// Heuristic phishing scan. Intentionally conservative: it aims to catch the
// obvious credential-harvesting pages described in the spec, not to be a
// perfect classifier. Tune the lists in blocklist.ts to extend coverage.
export function scanContent(html: string, ownDomain: string): ScanResult {
  const text = html.toLowerCase();

  // 1) High-signal scam phrases are blocked outright.
  for (const phrase of SCAM_PHRASES) {
    if (text.includes(phrase)) {
      return { blocked: true, reason: `matched scam phrase "${phrase}"` };
    }
  }

  // 2) A password field whose enclosing <form> posts to an off-site domain is
  //    the classic credential-harvest pattern.
  const hasPasswordField = /<input[^>]*type\s*=\s*["']?password["']?/i.test(html);
  if (hasPasswordField) {
    const offsite = formsPostOffsite(html, ownDomain);
    if (offsite) {
      return { blocked: true, reason: `password form posts to external domain "${offsite}"` };
    }

    // 3) A password field combined with an impersonated brand name is flagged.
    for (const brand of BRAND_KEYWORDS) {
      if (text.includes(brand)) {
        return { blocked: true, reason: `password form impersonating "${brand}"` };
      }
    }
  }

  return { blocked: false };
}

// Returns the external host a <form action> points to, or null if all form
// actions are relative / same-origin. Bare-bones HTML parsing via regex is
// adequate here because we only need a strong heuristic signal.
function formsPostOffsite(html: string, ownDomain: string): string | null {
  const formRe = /<form\b[^>]*\baction\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = formRe.exec(html)) !== null) {
    const action = m[1].trim();
    if (/^https?:\/\//i.test(action) || action.startsWith("//")) {
      try {
        const host = new URL(action.startsWith("//") ? "https:" + action : action).hostname.toLowerCase();
        if (host !== ownDomain && !host.endsWith(`.${ownDomain}`)) {
          return host;
        }
      } catch {
        // Unparseable action URL — treat as suspicious external target.
        return action;
      }
    }
  }
  return null;
}
