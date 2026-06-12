// Friendly 404 served for missing or expired slugs.
export function notFoundResponse(domain: string): Response {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Not found · Deployhtml</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #0b0d12; color: #e6e8ee; text-align: center; padding: 24px;
  }
  .card { max-width: 460px; }
  h1 { font-size: 64px; margin: 0 0 8px; letter-spacing: -2px; }
  p { color: #9aa3b2; margin: 4px 0; }
  a { color: #7aa2ff; text-decoration: none; }
  a:hover { text-decoration: underline; }
  .btn {
    display: inline-block; margin-top: 24px; padding: 10px 18px;
    background: #1c2230; border: 1px solid #2c3445; border-radius: 10px;
    color: #e6e8ee;
  }
</style>
</head>
<body>
  <div class="card">
    <h1>404</h1>
    <p>This link doesn't exist, or it has expired.</p>
    <p>Free links on Deployhtml expire after 7 days.</p>
    <a class="btn" href="https://${domain}/">Host your own HTML →</a>
  </div>
</body>
</html>`;
  return new Response(html, {
    status: 404,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "no-store",
    },
  });
}
