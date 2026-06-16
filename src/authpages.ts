import { createAuth } from "./auth";
import { Env } from "./env";
import {
  shell,
  authTopbar,
  appTopbar,
  avatarInitials,
  escapeHtml,
  toastHtml,
  TOAST_JS,
} from "./ui";

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

// OAuth provider button SVGs (copied verbatim from the design handoff).
const GITHUB_SVG =
  `<svg class="ic" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .5C5.7.5.5 5.7.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.3.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1.1-.7 0-.7 0-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.7 1.3 3.4 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17 4.6 18 4.9 18 4.9c.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6 4.6-1.5 7.9-5.8 7.9-10.9C23.5 5.7 18.3.5 12 .5z"/></svg>`;
const GOOGLE_SVG =
  `<svg class="ic" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.5 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-2 3.2-4.9 3.2-7.8z"/><path fill="#34A853" d="M12 23c2.9 0 5.4-1 7.2-2.6l-3.6-2.7c-1 .7-2.3 1.1-3.6 1.1-2.8 0-5.1-1.9-6-4.4H2.3v2.8A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M6 14.4a6.6 6.6 0 0 1 0-4.2V7.4H2.3a11 11 0 0 0 0 9.8L6 14.4z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3 .5 4.1 1.6l3.1-3.1A11 11 0 0 0 12 1a11 11 0 0 0-9.7 6l3.7 2.8c.9-2.6 3.2-4.4 6-4.4z"/></svg>`;

// Shared OAuth row — both buttons defer to a "coming soon" toast.
const OAUTH_ROW = `<div class="oauth">
          <button type="button" onclick="toast('Social login is coming soon')">
            ${GITHUB_SVG}
            GitHub
          </button>
          <button type="button" onclick="toast('Social login is coming soon')">
            ${GOOGLE_SVG}
            Google
          </button>
        </div>`;

// ---------------------------------------------------------------------------
// GET /login — sign-in page
// ---------------------------------------------------------------------------
export function handleLogin(_request: Request, _env: Env): Response {
  const body = `<div class="auth-wrap">
  <form class="auth-card" id="f">
    <div class="auth-mark">d</div>
    <h1>Welcome back</h1>
    <p class="sub">Sign in to manage your deployed pages</p>

    <div class="field">
      <label>Email</label>
      <input id="email" name="email" type="email" placeholder="you@example.com" autocomplete="email" required>
    </div>
    <div class="field">
      <div class="field-row">
        <label>Password</label>
        <a onclick="toast('Password reset coming soon')">Forgot?</a>
      </div>
      <input id="pw" name="password" type="password" placeholder="Your password" autocomplete="current-password" required>
    </div>
    <button class="btn-primary" type="submit">Sign in</button>

    <div class="divider">or continue with</div>
    ${OAUTH_ROW}

    <p class="form-err" id="err"></p>
    <p class="switch-line">New here? <a href="/signup">Create an account</a></p>
  </form>
</div>
${toastHtml()}`;

  const scripts = `${TOAST_JS}
document.getElementById('f').addEventListener('submit', async function(e){
  e.preventDefault();
  var err = document.getElementById('err');
  err.textContent = '';
  var res = await fetch('/api/auth/sign-in/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: document.getElementById('email').value,
      password: document.getElementById('pw').value
    })
  });
  if (res.ok) { window.location = '/dashboard'; }
  else {
    var data = await res.json().catch(function(){ return {}; });
    err.textContent = (data && data.message) ? data.message : 'Sign in failed. Please try again.';
  }
});`;

  return shell({ title: "Sign in", topbar: authTopbar(), body, scripts });
}

// ---------------------------------------------------------------------------
// GET /signup — sign-up page
// ---------------------------------------------------------------------------
export function handleSignup(_request: Request, _env: Env): Response {
  const body = `<div class="auth-wrap">
  <form class="auth-card" id="f">
    <div class="auth-mark">d</div>
    <h1>Create your account</h1>
    <p class="sub">Permanent links &amp; multi-file sites, free</p>

    <div class="field">
      <label>Name</label>
      <input id="name" name="name" type="text" placeholder="Ada Lovelace" autocomplete="name" required>
    </div>
    <div class="field">
      <label>Email</label>
      <input id="email" name="email" type="email" placeholder="you@example.com" autocomplete="email" required>
    </div>
    <div class="field">
      <label>Password</label>
      <input id="pw" name="password" type="password" placeholder="At least 8 characters" autocomplete="new-password" minlength="8" required oninput="strength(this.value)">
      <div class="strength" id="strength"><span></span><span></span><span></span><span></span></div>
    </div>
    <button class="btn-primary" type="submit">Create account</button>

    <div class="divider">or sign up with</div>
    ${OAUTH_ROW}

    <p class="form-err" id="err"></p>
    <p class="switch-line">Already have an account? <a href="/login">Sign in</a></p>
  </form>
</div>
${toastHtml()}`;

  const scripts = `${TOAST_JS}
function strength(v) {
  var el = document.getElementById('strength');
  var s = 0;
  if (v.length >= 8) s++;
  if (/[A-Z]/.test(v) && /[a-z]/.test(v)) s++;
  if (/\\d/.test(v)) s++;
  if (/[^A-Za-z0-9]/.test(v)) s++;
  el.className = 'strength s' + s;
}
document.getElementById('f').addEventListener('submit', async function(e){
  e.preventDefault();
  var err = document.getElementById('err');
  err.textContent = '';
  var res = await fetch('/api/auth/sign-up/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: document.getElementById('name').value,
      email: document.getElementById('email').value,
      password: document.getElementById('pw').value
    })
  });
  if (res.ok) { window.location = '/dashboard'; }
  else {
    var data = await res.json().catch(function(){ return {}; });
    err.textContent = (data && data.message) ? data.message : 'Sign up failed. Please try again.';
  }
});`;

  return shell({ title: "Create account", topbar: authTopbar(), body, scripts });
}

// ---------------------------------------------------------------------------
// GET /account — shows signed-in user info or redirects to /login
// ---------------------------------------------------------------------------
export async function handleAccount(request: Request, env: Env): Promise<Response> {
  const session = await getSession(request, env);
  if (!session) {
    return Response.redirect(new URL("/login", request.url).toString(), 302);
  }

  const rawName = session.user.name ?? "";
  const rawEmail = session.user.email;
  const name = escapeHtml(rawName);
  const email = escapeHtml(rawEmail);
  const initials = avatarInitials(rawName, rawEmail);
  const displayName = name || email;

  const body = `<div class="acct">
  <h1>Account</h1>
  <div class="acct-card">
    <div class="acct-top">
      <div class="big-av">${escapeHtml(initials)}</div>
      <div class="who">
        <div class="nm">${displayName}</div>
        <div class="em">${email}</div>
      </div>
      <div class="plan-pill">Free plan</div>
    </div>
    <div class="acct-rows">
      <div class="acct-row">
        <div class="l">
          <div class="t">Display name</div>
          <div class="s">Shown on your dashboard</div>
        </div>
        <button class="btn-ghost" type="button" onclick="toast('Editing your name is coming soon')">Edit</button>
      </div>
      <div class="acct-row">
        <div class="l">
          <div class="t">Email address</div>
          <div class="s">${email} · verified</div>
        </div>
        <button class="btn-ghost" type="button" onclick="toast('Changing your email is coming soon')">Change</button>
      </div>
      <div class="acct-row">
        <div class="l">
          <div class="t">Password</div>
          <div class="s">Keep your account secure</div>
        </div>
        <button class="btn-ghost" type="button" onclick="toast('Updating your password is coming soon')">Update</button>
      </div>
    </div>
  </div>

  <div class="acct-card">
    <div class="acct-rows" style="margin-top:0">
      <div class="acct-row" style="border-top:0; padding-top:0">
        <div class="l">
          <div class="t">Email me on new abuse reports</div>
          <div class="s">Get notified if one of your pages is reported</div>
        </div>
        <div class="toggle on" onclick="this.classList.toggle('on'); toast('Saved')"></div>
      </div>
      <div class="acct-row">
        <div class="l">
          <div class="t">Weekly digest</div>
          <div class="s">A summary of views across your pages</div>
        </div>
        <div class="toggle on" onclick="this.classList.toggle('on'); toast('Saved')"></div>
      </div>
    </div>
  </div>

  <div class="acct-foot">
    <button class="btn-ghost" id="so" type="button" style="font-weight:600;">Sign out</button>
    <button class="btn-danger" type="button" onclick="toast('Account deletion is coming soon')">Delete account</button>
  </div>
</div>
${toastHtml()}`;

  const scripts = `${TOAST_JS}
document.getElementById('so').addEventListener('click', async function(){
  await fetch('/api/auth/sign-out', { method: 'POST' });
  window.location = '/';
});`;

  return shell({
    title: "My account",
    topbar: appTopbar("account", initials),
    body,
    scripts,
  });
}
