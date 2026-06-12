// Phishing / impersonation blocklist. EXTEND THIS FREELY — it is plain data.
// The scanner (scan.ts) consumes these lists. Keep entries lowercase.
//
// How matching works (see scan.ts):
//   - BRAND_KEYWORDS: if the page text contains a brand/scam keyword AND also
//     collects a password, it is flagged. Brand words alone are not enough
//     (lots of legit pages mention "PayPal"); the password form is the signal.
//   - SCAM_PHRASES: high-signal phishing phrases that are flagged on their own.
//   - A password field inside a <form> that posts to an off-site domain is
//     always flagged regardless of keywords.

/** Brand / institution names commonly impersonated in credential phishing. */
export const BRAND_KEYWORDS: string[] = [
  "paypal",
  "apple id",
  "icloud",
  "microsoft account",
  "office365",
  "outlook",
  "google account",
  "gmail",
  "amazon",
  "netflix",
  "coinbase",
  "binance",
  "metamask",
  "wallet seed",
  "bank of america",
  "wells fargo",
  "chase bank",
  "hsbc",
  "barclays",
  "santander",
  "revolut",
  "wise",
  "irs",
  "hmrc",
  "usps",
  "dhl",
  "fedex",
];

/** High-signal scam phrases — flagged on their own (no password form needed). */
export const SCAM_PHRASES: string[] = [
  "verify your account",
  "confirm your password",
  "your account has been suspended",
  "unusual sign-in activity",
  "update your payment information",
  "confirm your identity to avoid",
  "enter your seed phrase",
  "enter your recovery phrase",
  "validate your wallet",
  "your account will be closed",
  "re-enter your credentials",
];
