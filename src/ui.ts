// Shared flat design system for the app's authenticated/marketing pages.
// Ported from the "Frosted Glass UI" handoff design (the user landed on a
// flat, violet look — Outfit + Space Grotesk, white surfaces, #6D4AE0 accent).
//
// Server-rendered pages compose: shell({ topbar, body, scripts }). The design's
// prototype was a single-file client-routed SPA; here each screen is its own
// real route, so we drop the `go()` router and render the right topbar per page.
//
// page.ts (the dark shell) is intentionally left for /report and 404, which are
// out of scope for this redesign.

import { escapeHtml } from "./page";
export { escapeHtml };

// Google Fonts used across every page.
const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet">`;

// The full design stylesheet (verbatim from the design's <style> block, minus
// the SPA `.screen` rules which multi-page rendering doesn't use). Every page
// links the same sheet so any component class is available everywhere.
export const UI_CSS = `
  :root {
    color-scheme: light;
    --bg: #FBFBFD;
    --surface: #FFFFFF;
    --ink: #1C1A22;
    --muted: #6B6776;
    --faint: #9A96A6;
    --accent: #6D4AE0;
    --accent-deep: #5A38C9;
    --accent-soft: #F1ECFD;
    --green: #2E9E63;
    --amber: #B8860B;
    --err: #D4452E;
    --border: #E8E6EE;
    --border-strong: #DAD7E2;
    --shadow: 0 1px 2px rgba(28, 26, 34, .04), 0 4px 12px rgba(28, 26, 34, .05);
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    margin: 0;
    font: 16px/1.5 "Outfit", "Helvetica Neue", sans-serif;
    background: var(--bg);
    color: var(--ink);
    min-height: 100%;
    overflow-x: hidden;
  }

  /* ---- top bar ---- */
  .topbar {
    position: sticky; top: 0; z-index: 5;
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 28px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
  }
  .logo { display: inline-flex; align-items: center; gap: 10px; font-weight: 600; font-size: 17px; letter-spacing: -0.01em; cursor: pointer; color: var(--ink); text-decoration: none; }
  .logo .mark {
    width: 26px; height: 26px; border-radius: 8px;
    background: var(--accent);
    display: grid; place-items: center; color: #fff; font-weight: 700; font-size: 13px;
    font-family: "Space Grotesk", sans-serif;
  }
  .topnav { display: flex; align-items: center; gap: 4px; }
  .topnav a {
    font-size: 14px; color: var(--muted); text-decoration: none;
    padding: 8px 14px; border-radius: 8px; cursor: pointer;
    transition: background .15s, color .15s;
  }
  .topnav a:hover { color: var(--ink); background: var(--bg); }
  .topnav a.active { color: var(--accent-deep); background: var(--accent-soft); font-weight: 500; }
  .avatar {
    width: 34px; height: 34px; border-radius: 50%; cursor: pointer; margin-left: 4px;
    background: var(--accent);
    display: grid; place-items: center; color: #fff; font-weight: 600; font-size: 14px;
    text-decoration: none;
  }
  .btn-ghost {
    font: 500 14px "Outfit", sans-serif; color: var(--ink);
    border: 1px solid var(--border-strong); background: var(--surface);
    padding: 8px 16px; border-radius: 9px; cursor: pointer;
    transition: background .15s, border-color .15s;
    text-decoration: none; display: inline-block;
  }
  .btn-ghost:hover { background: var(--bg); border-color: var(--faint); }

  /* ====== LANDING ====== */
  .land { max-width: 760px; margin: 0 auto; padding: 80px 24px 56px; text-align: center; }
  .land .eyebrow {
    display: inline-block; font-size: 13px; font-weight: 500; color: var(--accent-deep);
    background: var(--accent-soft); padding: 5px 14px; border-radius: 999px; margin-bottom: 22px;
  }
  .land h1 {
    font-family: "Space Grotesk", sans-serif; font-weight: 600;
    font-size: clamp(34px, 6vw, 52px); line-height: 1.08; letter-spacing: -0.025em;
    margin: 0 0 18px; text-wrap: balance;
  }
  .land .lede { font-size: clamp(16px, 2.5vw, 19px); color: var(--muted); margin: 0 auto 36px; max-width: 540px; text-wrap: pretty; }
  .cta-row { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
  .btn-primary {
    border: 0; border-radius: 11px; padding: 14px 26px; cursor: pointer;
    background: var(--accent); color: #fff; font: 600 15.5px "Outfit", sans-serif;
    transition: background .15s, transform .12s;
    text-decoration: none; display: inline-block;
  }
  .btn-primary:hover { background: var(--accent-deep); transform: translateY(-1px); }
  .btn-primary:active { transform: none; }
  .btn-lg { padding: 15px 30px; font-size: 16px; }

  .dropzone {
    margin: 48px auto 0; max-width: 560px;
    border: 1.5px dashed var(--border-strong); border-radius: 16px;
    background: var(--surface); padding: 40px 28px; cursor: pointer;
    display: flex; flex-direction: column; align-items: center; gap: 12px;
    transition: border-color .15s, background .15s;
  }
  .dropzone:hover { border-color: var(--accent); background: var(--accent-soft); }
  .dropzone .up { width: 48px; height: 48px; border-radius: 12px; background: var(--accent-soft); color: var(--accent); display: grid; place-items: center; font-size: 22px; font-weight: 700; }
  .dropzone strong { font-size: 16px; font-weight: 600; }
  .dropzone .or { color: var(--faint); font-size: 13.5px; }

  .feat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; max-width: 900px; margin: 64px auto 0; padding: 0 24px; }
  @media (max-width: 720px) { .feat-grid { grid-template-columns: 1fr; } }
  .feat {
    background: var(--surface); border: 1px solid var(--border); border-radius: 14px;
    padding: 24px; text-align: left; box-shadow: var(--shadow);
  }
  .feat .fi { width: 38px; height: 38px; border-radius: 10px; background: var(--accent-soft); color: var(--accent); display: grid; place-items: center; margin-bottom: 14px; }
  .feat .fi svg { width: 20px; height: 20px; }
  .feat h3 { font-family: "Space Grotesk", sans-serif; font-size: 16px; font-weight: 600; margin: 0 0 6px; }
  .feat p { color: var(--muted); font-size: 14px; margin: 0; line-height: 1.5; }

  /* ====== AUTH SCREENS ====== */
  .auth-wrap { min-height: calc(100vh - 63px); display: grid; place-items: center; padding: 40px 18px; }
  .auth-card {
    width: min(420px, 100%);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 16px;
    box-shadow: var(--shadow);
    padding: 36px 34px 30px;
  }
  .auth-mark {
    width: 44px; height: 44px; border-radius: 12px; margin: 0 auto 18px;
    background: var(--accent);
    display: grid; place-items: center; color: #fff; font-weight: 700; font-size: 19px;
    font-family: "Space Grotesk", sans-serif;
  }
  .auth-card h1 {
    font-family: "Space Grotesk", sans-serif; font-weight: 600;
    font-size: 24px; letter-spacing: -0.01em; text-align: center; margin: 0 0 6px;
  }
  .auth-card .sub { text-align: center; color: var(--muted); font-size: 14.5px; margin: 0 0 26px; }

  .field { margin-bottom: 16px; }
  .field label { display: block; font-size: 13px; color: var(--muted); margin-bottom: 7px; font-weight: 500; }
  .field input {
    width: 100%; padding: 12px 14px; border-radius: 10px;
    border: 1px solid var(--border-strong); background: var(--surface);
    color: var(--ink); font: 15px "Outfit", sans-serif;
    transition: border-color .15s, box-shadow .15s;
  }
  .field input::placeholder { color: var(--faint); }
  .field input:focus {
    outline: none; border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
  .field-row { display: flex; justify-content: space-between; align-items: baseline; }
  .field-row a { font-size: 12.5px; color: var(--accent-deep); text-decoration: none; cursor: pointer; }
  .field-row a:hover { text-decoration: underline; text-underline-offset: 2px; }

  .auth-card .btn-primary { width: 100%; margin-top: 6px; }

  .divider { display: flex; align-items: center; gap: 12px; margin: 22px 0; color: var(--faint); font-size: 12.5px; }
  .divider::before, .divider::after { content: ""; flex: 1; height: 1px; background: var(--border); }

  .oauth { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .oauth button {
    display: flex; align-items: center; justify-content: center; gap: 8px;
    padding: 11px; border-radius: 10px; cursor: pointer;
    border: 1px solid var(--border-strong); background: var(--surface);
    font: 500 14px "Outfit", sans-serif; color: var(--ink);
    transition: background .15s, border-color .15s;
  }
  .oauth button:hover { background: var(--bg); border-color: var(--faint); }
  .oauth .ic { width: 17px; height: 17px; }

  .switch-line { text-align: center; margin: 22px 0 0; font-size: 14px; color: var(--muted); }
  .switch-line a { color: var(--accent-deep); font-weight: 600; text-decoration: none; cursor: pointer; }
  .switch-line a:hover { text-decoration: underline; text-underline-offset: 2px; }

  .form-err { color: var(--err); font-size: 13.5px; margin: 14px 0 0; text-align: center; min-height: 18px; }

  .strength { display: flex; gap: 5px; margin-top: 9px; }
  .strength span { flex: 1; height: 4px; border-radius: 2px; background: var(--border); transition: background .2s; }
  .strength.s1 span:nth-child(1) { background: var(--err); }
  .strength.s2 span:nth-child(-n+2) { background: var(--amber); }
  .strength.s3 span:nth-child(-n+3) { background: var(--green); }
  .strength.s4 span { background: var(--green); }

  /* ====== DASHBOARD ====== */
  .dash { max-width: 1080px; margin: 0 auto; padding: 36px 24px 64px; }
  .dash-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; flex-wrap: wrap; margin-bottom: 26px; }
  .dash-head h1 { font-family: "Space Grotesk", sans-serif; font-weight: 600; font-size: 28px; letter-spacing: -0.02em; margin: 0 0 4px; }
  .dash-head p { color: var(--muted); margin: 0; font-size: 14.5px; }

  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 28px; }
  @media (max-width: 720px) { .stats { grid-template-columns: repeat(2, 1fr); } }
  .stat {
    background: var(--surface); border: 1px solid var(--border); border-radius: 14px;
    padding: 20px 22px; box-shadow: var(--shadow);
  }
  .stat .k { font-size: 12.5px; color: var(--muted); display: flex; align-items: center; gap: 7px; margin-bottom: 10px; font-weight: 500; }
  .stat .k .pip { width: 8px; height: 8px; border-radius: 50%; }
  .stat .v { font-family: "Space Grotesk", sans-serif; font-weight: 600; font-size: 28px; letter-spacing: -0.01em; }
  .stat .d { font-size: 12px; color: var(--green); margin-top: 3px; font-weight: 500; }

  .panel {
    background: var(--surface); border: 1px solid var(--border); border-radius: 16px;
    box-shadow: var(--shadow); overflow: hidden;
  }
  .panel-head {
    display: flex; align-items: center; justify-content: space-between; gap: 14px;
    padding: 18px 22px; border-bottom: 1px solid var(--border); flex-wrap: wrap;
  }
  .panel-head h2 { font-family: "Space Grotesk", sans-serif; font-weight: 600; font-size: 18px; margin: 0; }
  .seg { display: flex; gap: 4px; background: var(--bg); border-radius: 9px; padding: 4px; border: 1px solid var(--border); }
  .seg button {
    border: 0; background: none; cursor: pointer; padding: 6px 14px; border-radius: 6px;
    font: 500 13px "Outfit", sans-serif; color: var(--muted); transition: background .15s, color .15s;
  }
  .seg button.active { background: var(--surface); color: var(--ink); box-shadow: var(--shadow); }

  .deploys { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1px; background: var(--border); }
  @media (max-width: 760px) { .deploys { grid-template-columns: 1fr; } }
  .deploy {
    background: var(--surface); padding: 18px 22px; display: flex; gap: 15px; align-items: center;
    transition: background .15s; cursor: pointer;
  }
  .deploy:hover { background: var(--bg); }
  .deploy .thumb {
    width: 50px; height: 50px; border-radius: 11px; flex-shrink: 0;
    display: grid; place-items: center; font-size: 20px; font-weight: 700;
    font-family: "Space Grotesk", sans-serif; color: #fff;
  }
  .deploy .meta { min-width: 0; flex: 1; }
  .deploy .name { font-weight: 600; font-size: 15px; letter-spacing: -0.01em; margin-bottom: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .deploy .url { font: 12.5px "Space Grotesk", monospace; color: var(--accent-deep); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .deploy .row2 { display: flex; gap: 14px; margin-top: 6px; font-size: 12px; color: var(--muted); flex-wrap: wrap; }
  .deploy .acts { display: flex; gap: 6px; }
  .icon-btn {
    width: 32px; height: 32px; border-radius: 8px; cursor: pointer; display: grid; place-items: center;
    border: 1px solid var(--border-strong); background: var(--surface); color: var(--muted);
    transition: color .15s, border-color .15s;
  }
  .icon-btn:hover { color: var(--ink); border-color: var(--faint); }
  .icon-btn.danger:hover { color: var(--err); border-color: var(--err); }
  .icon-btn svg { width: 15px; height: 15px; }

  .badge {
    display: inline-flex; align-items: center; gap: 5px; padding: 2px 9px; border-radius: 999px;
    font-size: 11px; font-weight: 500;
  }
  .badge.live { background: #E7F4EC; color: #1E7A48; }
  .badge.exp  { background: #FBF1DD; color: #97700A; }
  .badge .pip { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }

  .empty { padding: 48px 22px; text-align: center; color: var(--muted); font-size: 14.5px; background: var(--surface); }

  .upload-cta {
    background: var(--surface);
    border: 1.5px dashed var(--border-strong); border-radius: 14px;
    padding: 18px 22px; display: flex; align-items: center; gap: 16px; cursor: pointer;
    margin-top: 18px; transition: border-color .15s, background .15s;
    text-decoration: none; color: var(--ink);
  }
  .upload-cta:hover { border-color: var(--accent); background: var(--accent-soft); }
  .upload-cta .plus {
    width: 42px; height: 42px; border-radius: 11px; flex-shrink: 0;
    background: var(--accent); color: #fff;
    display: grid; place-items: center; font-size: 24px; font-weight: 300;
  }
  .upload-cta .ct-t { font-weight: 600; font-size: 15px; }
  .upload-cta .ct-s { color: var(--muted); font-size: 13px; }

  /* ====== ACCOUNT ====== */
  .acct { max-width: 720px; margin: 0 auto; padding: 36px 24px 64px; }
  .acct h1 { font-family: "Space Grotesk", sans-serif; font-weight: 600; font-size: 28px; letter-spacing: -0.02em; margin: 0 0 24px; }
  .acct-card {
    background: var(--surface); border: 1px solid var(--border); border-radius: 16px;
    box-shadow: var(--shadow); padding: 26px; margin-bottom: 20px;
  }
  .acct-top { display: flex; align-items: center; gap: 18px; }
  .acct-top .big-av {
    width: 60px; height: 60px; border-radius: 16px;
    background: var(--accent);
    display: grid; place-items: center; color: #fff; font-weight: 600; font-size: 24px;
    font-family: "Space Grotesk", sans-serif;
  }
  .acct-top .who .nm { font-family: "Space Grotesk", sans-serif; font-weight: 600; font-size: 19px; }
  .acct-top .who .em { color: var(--muted); font-size: 14px; }
  .plan-pill { margin-left: auto; padding: 6px 14px; border-radius: 999px; font-size: 12.5px; font-weight: 600;
    background: var(--accent-soft); color: var(--accent-deep); }

  .acct-rows { margin-top: 14px; }
  .acct-row { display: flex; align-items: center; justify-content: space-between; padding: 16px 0; border-top: 1px solid var(--border); gap: 16px; }
  .acct-row .l .t { font-weight: 500; font-size: 14.5px; }
  .acct-row .l .s { color: var(--muted); font-size: 13px; margin-top: 2px; }
  .toggle { width: 46px; height: 27px; border-radius: 999px; background: var(--border-strong); position: relative; cursor: pointer; transition: background .2s; flex-shrink: 0; }
  .toggle::after { content: ""; position: absolute; top: 3px; left: 3px; width: 21px; height: 21px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.2); transition: transform .2s; }
  .toggle.on { background: var(--accent); }
  .toggle.on::after { transform: translateX(19px); }

  .acct-foot { display: flex; gap: 12px; }
  .btn-danger { border: 1px solid var(--err); background: transparent; color: var(--err);
    padding: 11px 20px; border-radius: 10px; font: 500 14px "Outfit", sans-serif; cursor: pointer; transition: background .15s; }
  .btn-danger:hover { background: #FBEDEA; }

  /* ---- landing footer ---- */
  .land-footer {
    border-top: 1px solid var(--border);
    margin-top: 64px; padding: 22px 24px;
    display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap;
    max-width: 1080px; margin-left: auto; margin-right: auto;
  }
  .land-footer .fl { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: var(--muted); }
  .land-footer .fl .mark { width: 18px; height: 18px; border-radius: 5px; background: var(--accent); display: grid; place-items: center; color: #fff; font: 700 9px "Space Grotesk", sans-serif; }
  .land-footer .fr { display: flex; gap: 18px; }
  .land-footer .fr a { font-size: 13px; color: var(--muted); text-decoration: none; cursor: pointer; }
  .land-footer .fr a:hover { color: var(--ink); }

  /* ====== PAGE EDITOR ====== */
  .editor { max-width: 1200px; margin: 0 auto; padding: 22px 24px 48px; }
  .ed-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 16px; }
  .crumb { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .crumb .back {
    width: 36px; height: 36px; border-radius: 9px; flex-shrink: 0; cursor: pointer;
    border: 1px solid var(--border-strong); background: var(--surface); color: var(--muted);
    display: grid; place-items: center; transition: background .15s, color .15s;
    text-decoration: none;
  }
  .crumb .back:hover { background: var(--bg); color: var(--ink); }
  .crumb .back svg { width: 17px; height: 17px; }
  .crumb .ct { min-width: 0; }
  .crumb .ct .title { font-family: "Space Grotesk", sans-serif; font-weight: 600; font-size: 20px; letter-spacing: -0.01em; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .crumb .ct .urlpill {
    display: inline-flex; align-items: center; gap: 6px; margin-top: 3px; cursor: pointer;
    font: 12.5px "Space Grotesk", monospace; color: var(--accent-deep);
    background: var(--accent-soft); padding: 3px 10px; border-radius: 999px; border: 0;
  }
  .crumb .ct .urlpill:hover { filter: brightness(.97); }
  .crumb .ct .urlpill svg { width: 12px; height: 12px; }
  .ed-actions { display: flex; gap: 10px; }
  .ed-actions button { white-space: nowrap; }

  .ed-tabs { display: flex; gap: 4px; margin-bottom: 16px; }
  .ed-tab {
    border: 1px solid var(--border-strong); background: var(--surface); cursor: pointer;
    padding: 8px 16px; border-radius: 9px; font: 500 13.5px "Outfit", sans-serif; color: var(--muted);
    transition: background .15s, color .15s, border-color .15s;
  }
  .ed-tab.active { background: var(--accent-soft); color: var(--accent-deep); border-color: transparent; font-weight: 600; }

  .ed-view { display: none; }
  .ed-view.active { display: block; }

  .ed-grid {
    display: grid; grid-template-columns: 188px 1fr 1fr; gap: 1px;
    background: var(--border); border: 1px solid var(--border); border-radius: 14px;
    overflow: hidden; height: min(580px, 70vh);
  }
  @media (max-width: 920px) { .ed-grid { grid-template-columns: 1fr; height: auto; } .ed-grid > div { min-height: 280px; } }

  .files-pane { background: var(--surface); padding: 12px 10px; overflow: auto; }
  .files-pane .ph, .pane-bar {
    font: 11px "Space Grotesk", monospace; text-transform: uppercase; letter-spacing: .06em;
    color: var(--faint); padding: 2px 8px 10px;
  }
  .file-item {
    display: flex; align-items: center; gap: 9px; padding: 8px 10px; border-radius: 8px; cursor: pointer;
    font: 13px "Space Grotesk", monospace; color: var(--muted); transition: background .12s, color .12s;
  }
  .file-item:hover { background: var(--bg); color: var(--ink); }
  .file-item.active { background: var(--accent-soft); color: var(--accent-deep); }
  .file-item svg { width: 14px; height: 14px; flex-shrink: 0; opacity: .8; }
  .file-item .ro { margin-left: auto; font-size: 9.5px; letter-spacing: .04em; color: var(--faint); }
  .file-add {
    display: flex; align-items: center; gap: 8px; padding: 8px 10px; margin-top: 4px; border-radius: 8px; cursor: pointer;
    font: 12.5px "Outfit", sans-serif; color: var(--faint); border: 1px dashed var(--border-strong); justify-content: center;
  }
  .file-add:hover { color: var(--accent-deep); border-color: var(--accent); }

  .code-pane, .preview-pane { background: #fff; display: flex; flex-direction: column; min-width: 0; }
  .code-bar, .pv-bar {
    display: flex; align-items: center; justify-content: space-between; gap: 10px;
    padding: 9px 14px; border-bottom: 1px solid var(--border); background: var(--bg);
    font: 12px "Space Grotesk", monospace; color: var(--muted); flex-shrink: 0;
  }
  .pv-bar .dots { display: flex; gap: 5px; }
  .pv-bar .dots i { width: 9px; height: 9px; border-radius: 50%; background: var(--border-strong); }
  .pv-bar .addr { flex: 1; text-align: center; color: var(--accent-deep); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pv-bar .reload { cursor: pointer; color: var(--muted); display: grid; place-items: center; background: none; border: 0; }
  .pv-bar .reload:hover { color: var(--ink); }
  .pv-bar .reload svg { width: 14px; height: 14px; }
  .code-pane textarea {
    flex: 1; border: 0; outline: 0; resize: none; padding: 14px 16px; tab-size: 2;
    font: 13px/1.65 "Space Grotesk", ui-monospace, "SF Mono", Menlo, monospace;
    color: var(--ink); background: #fff;
  }
  .code-pane textarea[readonly] { background: var(--bg); color: var(--muted); }
  .preview-pane iframe { flex: 1; border: 0; width: 100%; background: #fff; }
  .code-bar .saved { color: var(--green); display: inline-flex; align-items: center; gap: 5px; }
  .code-bar .saved::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: var(--green); }
  .code-bar .dirty { color: var(--amber); }
  .code-bar .dirty::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: var(--amber); display: inline-block; margin-right: 5px; vertical-align: middle; }

  /* editor settings reuse acct-card look */
  .ed-settings { display: grid; gap: 18px; max-width: 720px; }

  /* ---- slug edit modal ---- */
  .modal-overlay {
    position: fixed; inset: 0; z-index: 60; display: none;
    background: rgba(28, 26, 34, .32); backdrop-filter: blur(2px);
    align-items: center; justify-content: center; padding: 18px;
  }
  .modal-overlay.open { display: flex; }
  .modal {
    width: min(440px, 100%); background: var(--surface);
    border: 1px solid var(--border); border-radius: 16px;
    box-shadow: 0 20px 50px rgba(28, 26, 34, .22); padding: 26px;
  }
  .modal h3 { font-family: "Space Grotesk", sans-serif; font-weight: 600; font-size: 19px; margin: 0 0 4px; }
  .modal .ms { color: var(--muted); font-size: 13.5px; margin: 0 0 20px; }
  .slug-field { display: flex; align-items: stretch; border: 1px solid var(--border-strong); border-radius: 10px; overflow: hidden; transition: border-color .15s, box-shadow .15s; }
  .slug-field.focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
  .slug-field.invalid { border-color: var(--err); box-shadow: 0 0 0 3px #FBEDEA; }
  .slug-field input { flex: 1; min-width: 0; border: 0; outline: none; padding: 12px 14px; font: 15px "Space Grotesk", monospace; color: var(--ink); background: transparent; }
  .slug-field .suffix { display: grid; place-items: center; padding: 0 14px; background: var(--bg); border-left: 1px solid var(--border); color: var(--muted); font: 13px "Space Grotesk", monospace; white-space: nowrap; }
  .slug-note { font-size: 12.5px; margin: 9px 2px 0; min-height: 18px; color: var(--muted); display: flex; align-items: center; gap: 6px; }
  .slug-note.ok { color: var(--green); }
  .slug-note.bad { color: var(--err); }
  .modal-foot { display: flex; justify-content: flex-end; gap: 10px; margin-top: 22px; }

  .toast {
    position: fixed; bottom: 26px; left: 50%; transform: translateX(-50%) translateY(20px);
    background: var(--ink); color: #fff; padding: 12px 22px; border-radius: 11px;
    font-size: 14px; font-weight: 500; z-index: 50; opacity: 0; pointer-events: none;
    transition: opacity .25s, transform .25s;
    box-shadow: 0 10px 28px rgba(0,0,0,.2);
  }
  .toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
`;

// ---------------------------------------------------------------------------
// Page shell
// ---------------------------------------------------------------------------
export interface ShellOpts {
  title: string;
  /** Pre-rendered topbar HTML (use appTopbar / authTopbar). */
  topbar?: string;
  /** Body HTML (everything between the topbar and the scripts). */
  body: string;
  /** Extra <head> markup. */
  head?: string;
  /** Extra JS appended (inside its own <script>) before </body>. */
  scripts?: string;
}

export function shell(opts: ShellOpts): Response {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(opts.title)} · Deployhtml</title>
${FONTS}
<style>${UI_CSS}</style>
${opts.head ?? ""}
</head>
<body>
${opts.topbar ?? ""}
${opts.body}
${opts.scripts ? `<script>${opts.scripts}</script>` : ""}
</body>
</html>`;
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}

// Logged-in app topbar (Home / Dashboard / Account + avatar).
export function appTopbar(active: "dashboard" | "account" | "editor" | "", initials: string): string {
  const cls = (k: string) => (active === k ? " class=\"active\"" : "");
  return `<div class="topbar">
  <a class="logo" href="/"><span class="mark">d</span>deployhtml</a>
  <div class="topnav">
    <a href="/"${active === "" ? " class=\"active\"" : ""}>Home</a>
    <a href="/dashboard"${cls("dashboard")}>Dashboard</a>
    <a href="/account"${cls("account")}>Account</a>
    <a class="avatar" href="/account" title="Account">${escapeHtml(initials)}</a>
  </div>
</div>`;
}

// Minimal topbar for the auth screens (just the logo).
export function authTopbar(): string {
  return `<div class="topbar">
  <a class="logo" href="/"><span class="mark">d</span>deployhtml</a>
</div>`;
}

// Initials for an avatar from a display name (falling back to email).
export function avatarInitials(name?: string | null, email?: string | null): string {
  const src = (name && name.trim()) || (email && email.split("@")[0]) || "?";
  const parts = src.trim().split(/[\s._-]+/).filter(Boolean);
  const letters = parts.length >= 2
    ? parts[0][0] + parts[1][0]
    : src.slice(0, 2);
  return letters.toUpperCase();
}

// CSRF defense-in-depth for cookie-authenticated state-changing routes (atop the
// session cookie's SameSite=Lax). Browsers always attach Origin (or at least
// Referer) on cross-site POSTs, so a mismatch is a forged request. Non-browser
// clients (curl, API scripts) send neither and are allowed through.
export function sameOrigin(request: Request): boolean {
  const host = new URL(request.url).host;
  const origin = request.headers.get("Origin");
  if (origin) {
    try { return new URL(origin).host === host; } catch { return false; }
  }
  const referer = request.headers.get("Referer");
  if (referer) {
    try { return new URL(referer).host === host; } catch { return false; }
  }
  return true;
}

// JSON for safe embedding inside a server-rendered <script> on the trusted apex.
// Neutralizes </script>, HTML-comment, and line-separator break-out sequences.
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

// ---------------------------------------------------------------------------
// Shared client widgets (toast + the editable-URL modal)
// ---------------------------------------------------------------------------
export function toastHtml(): string {
  return `<div class="toast" id="toast"></div>`;
}

export const TOAST_JS = `
var __toastTimer;
function toast(msg){
  var t=document.getElementById('toast');
  if(!t) return;
  t.textContent=msg; t.classList.add('show');
  clearTimeout(__toastTimer);
  __toastTimer=setTimeout(function(){t.classList.remove('show');},1900);
}`;

// Editable-URL modal markup. `domain` fills the read-only suffix.
export function slugModalHtml(domain: string): string {
  return `<div class="modal-overlay" id="slugModal">
  <div class="modal">
    <h3>Edit page URL</h3>
    <p class="ms">Choose a custom slug. It must be unique across deployhtml.</p>
    <div class="slug-field" id="slugField">
      <input id="slugInput" type="text" spellcheck="false" autocomplete="off" oninput="validateSlug()">
      <span class="suffix">.${escapeHtml(domain)}</span>
    </div>
    <div class="slug-note" id="slugNote"></div>
    <div class="modal-foot">
      <button class="btn-ghost" type="button" onclick="closeSlugModal()">Cancel</button>
      <button class="btn-primary" id="slugSave" style="padding:11px 22px;font-size:14.5px;" onclick="saveSlug()">Save URL</button>
    </div>
  </div>
</div>`;
}

// Client logic for the editable-URL modal. Talks to:
//   GET  /dashboard/slug-available?slug=<s>  -> { available: bool, reason?: str }
//   POST /dashboard/rename  {oldSlug, slug}  -> { ok: bool, slug?, error? }
// The host page MUST define window.onSlugRenamed(newSlug) (e.g. reload, or
// navigate to the new slug's editor).
export const SLUG_MODAL_JS = `
var __slugCurrent='', __slugCheckTimer, __slugOk=false;
function openSlugModal(slug){
  __slugCurrent=slug;
  var input=document.getElementById('slugInput');
  input.value=slug;
  document.getElementById('slugModal').classList.add('open');
  validateSlug();
  setTimeout(function(){ input.focus(); input.select(); },30);
}
function closeSlugModal(){
  document.getElementById('slugModal').classList.remove('open');
  clearTimeout(__slugCheckTimer);
}
function __slugFormat(raw){
  var v=raw.trim().toLowerCase();
  if(!v) return {ok:false,msg:'URL can\\u2019t be empty'};
  if(!/^[a-z0-9-]+$/.test(v)) return {ok:false,msg:'Use lowercase letters, numbers and hyphens only'};
  if(/^-|-$/.test(v)) return {ok:false,msg:'Can\\u2019t start or end with a hyphen'};
  if(v.length<4) return {ok:false,msg:'Must be at least 4 characters'};
  if(v===__slugCurrent) return {ok:true,same:true,msg:'This is your current URL'};
  return {ok:true,msg:''};
}
function __slugRender(st,checking){
  var field=document.getElementById('slugField');
  var note=document.getElementById('slugNote');
  var save=document.getElementById('slugSave');
  field.classList.toggle('invalid', !st.ok);
  note.className='slug-note '+(st.ok?'ok':'bad');
  var icon = checking ? '' : (st.ok ? (st.same?'':'\\u2713 ') : '\\u2715 ');
  note.textContent = (checking?'Checking\\u2026':icon+st.msg);
  __slugOk = st.ok && !st.same && !checking;
  save.disabled = !__slugOk;
  save.style.opacity = save.disabled ? '.5' : '1';
  save.style.cursor = save.disabled ? 'not-allowed' : 'pointer';
}
function validateSlug(){
  clearTimeout(__slugCheckTimer);
  var raw=document.getElementById('slugInput').value;
  var st=__slugFormat(raw);
  if(!st.ok || st.same){ __slugRender(st,false); return; }
  // format ok + changed -> ask the server whether it's taken
  __slugRender(st,true);
  var v=raw.trim().toLowerCase();
  __slugCheckTimer=setTimeout(function(){
    fetch('/dashboard/slug-available?slug='+encodeURIComponent(v))
      .then(function(r){return r.json();})
      .then(function(d){
        if(document.getElementById('slugInput').value.trim().toLowerCase()!==v) return;
        if(d.available){ __slugRender({ok:true,msg:'Available'},false); }
        else { __slugRender({ok:false,msg:d.reason||'That URL is already taken \\u2014 try another'},false); }
      })
      .catch(function(){ __slugRender({ok:false,msg:'Could not check availability'},false); });
  },300);
}
function saveSlug(){
  if(!__slugOk) return;
  var v=document.getElementById('slugInput').value.trim().toLowerCase();
  var save=document.getElementById('slugSave');
  save.disabled=true;
  fetch('/dashboard/rename',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({oldSlug:__slugCurrent,slug:v})})
    .then(function(r){return r.json().then(function(d){return {ok:r.ok,d:d};});})
    .then(function(res){
      if(res.ok && res.d.ok){ if(window.onSlugRenamed) window.onSlugRenamed(res.d.slug||v); }
      else { __slugRender({ok:false,msg:(res.d&&res.d.error)||'Rename failed'},false); save.disabled=false; }
    })
    .catch(function(){ __slugRender({ok:false,msg:'Network error'},false); save.disabled=false; });
}
document.addEventListener('DOMContentLoaded',function(){
  var f=document.getElementById('slugField');
  if(f){
    f.addEventListener('focusin',function(){f.classList.add('focus');});
    f.addEventListener('focusout',function(){f.classList.remove('focus');});
  }
  var m=document.getElementById('slugModal');
  if(m) m.addEventListener('click',function(e){ if(e.target.id==='slugModal') closeSlugModal(); });
});`;
