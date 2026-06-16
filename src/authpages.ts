import { createAuth } from "./auth";
import { Env } from "./env";
import { page, escapeHtml } from "./page";

// ---------------------------------------------------------------------------
// Session helper — defensive wrapper; any error or missing session → null.
// ---------------------------------------------------------------------------
export async function getSession(request: Request, env: Env) {
  try {
    return await createAuth(request, env).api.getSession({ headers: request.headers });
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// GET /signup — sign-up page
// ---------------------------------------------------------------------------
export function handleSignup(_request: Request, _env: Env): Response {
  return page(
    "Create account",
    `<p>Join Deployhtml — upload and share HTML pages instantly.</p>
<form id="f">
  <label>Name
    <input id="name" name="name" type="text" placeholder="Your name" required autocomplete="name">
  </label>
  <label>Email
    <input id="email" name="email" type="email" placeholder="you@example.com" required autocomplete="email">
  </label>
  <label>Password
    <input id="pw" name="password" type="password" placeholder="At least 8 characters" required autocomplete="new-password" minlength="8">
  </label>
  <button type="submit">Create account</button>
  <p style="margin-top:12px;font-size:14px;">Already have an account? <a href="/login" style="color:#7aa2ff;">Sign in</a></p>
</form>
<p id="err" style="color:#f87171;display:none;margin-top:8px;"></p>
<script>
document.getElementById('f').addEventListener('submit', async function(e) {
  e.preventDefault();
  var err = document.getElementById('err');
  err.style.display = 'none';
  var res = await fetch('/api/auth/sign-up/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: document.getElementById('name').value,
      email: document.getElementById('email').value,
      password: document.getElementById('pw').value
    })
  });
  if (res.ok) { window.location = '/account'; }
  else {
    var data = await res.json().catch(function() { return {}; });
    err.textContent = (data && data.message) ? data.message : 'Sign up failed. Please try again.';
    err.style.display = '';
  }
});
</script>`,
  );
}

// ---------------------------------------------------------------------------
// GET /login — sign-in page
// ---------------------------------------------------------------------------
export function handleLogin(_request: Request, _env: Env): Response {
  return page(
    "Sign in",
    `<p>Welcome back to Deployhtml.</p>
<form id="f">
  <label>Email
    <input id="email" name="email" type="email" placeholder="you@example.com" required autocomplete="email">
  </label>
  <label>Password
    <input id="pw" name="password" type="password" placeholder="Your password" required autocomplete="current-password">
  </label>
  <button type="submit">Sign in</button>
  <p style="margin-top:12px;font-size:14px;">No account yet? <a href="/signup" style="color:#7aa2ff;">Create one</a></p>
</form>
<p id="err" style="color:#f87171;display:none;margin-top:8px;"></p>
<script>
document.getElementById('f').addEventListener('submit', async function(e) {
  e.preventDefault();
  var err = document.getElementById('err');
  err.style.display = 'none';
  var res = await fetch('/api/auth/sign-in/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: document.getElementById('email').value,
      password: document.getElementById('pw').value
    })
  });
  if (res.ok) { window.location = '/account'; }
  else {
    var data = await res.json().catch(function() { return {}; });
    err.textContent = (data && data.message) ? data.message : 'Sign in failed. Please try again.';
    err.style.display = '';
  }
});
</script>`,
  );
}

// ---------------------------------------------------------------------------
// GET /account — shows signed-in user info or redirects to /login
// ---------------------------------------------------------------------------
export async function handleAccount(request: Request, env: Env): Promise<Response> {
  const session = await getSession(request, env);
  if (!session) {
    return Response.redirect(new URL("/login", request.url).toString(), 302);
  }
  const email = escapeHtml(session.user.email);
  const name = escapeHtml(session.user.name ?? "");
  return page(
    "My account",
    `<p>Signed in as <strong>${email}</strong>${name ? ` (${name})` : ""}.</p>
<button id="so">Sign out</button>
<script>
document.getElementById('so').addEventListener('click', async function() {
  await fetch('/api/auth/sign-out', { method: 'POST' });
  window.location = '/';
});
</script>`,
  );
}
