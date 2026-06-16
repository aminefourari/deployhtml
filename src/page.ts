// Shared page helpers — dark-theme HTML wrapper + HTML escaping.
// The CSS is kept in sync with the <style> block in report.ts.

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!),
  );
}

export function page(title: string, body: string): Response {
  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · Deployhtml</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; display:grid; place-items:center;
    font:16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background:#0b0d12; color:#e6e8ee; padding:24px; }
  .card { width:100%; max-width:460px; }
  h1 { font-size:22px; margin:0 0 12px; }
  p { color:#9aa3b2; }
  label { display:block; margin:14px 0 6px; font-size:14px; color:#c7cdda; }
  input, textarea { width:100%; padding:10px 12px; border-radius:10px;
    border:1px solid #2c3445; background:#11151d; color:#e6e8ee; font:inherit; }
  button, .btn { margin-top:16px; display:inline-block; padding:10px 18px;
    border-radius:10px; border:1px solid #2c3445; background:#7aa2ff; color:#0b0d12;
    font-weight:600; cursor:pointer; text-decoration:none; }
  .btn { background:#1c2230; color:#e6e8ee; }
  code { background:#11151d; padding:2px 6px; border-radius:6px; }
</style>
</head><body><div class="card"><h1>${escapeHtml(title)}</h1>${body}</div></body></html>`;
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}
