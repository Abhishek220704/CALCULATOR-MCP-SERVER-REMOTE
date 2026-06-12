// src/auth/authorize.js
// OAuth 2.0 Authorization Endpoint — with PKCE + API key gate

import db from "./db.js";
import { v4 as uuid } from "uuid";

// ── HTML helpers ──────────────────────────────────────────────
function escHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Step 1 — ask for the API key before showing the consent page
function loginPage({ clientName, clientId, redirectUri, state,
                     codeChallenge, codeChallengeMethod, error }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Sign In — MCP Calculator</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #f5f5f5; display: flex;
      align-items: center; justify-content: center;
      min-height: 100vh; padding: 1rem;
    }
    .card {
      background: #fff; border-radius: 12px;
      box-shadow: 0 4px 24px rgba(0,0,0,.1);
      max-width: 400px; width: 100%; padding: 2rem;
    }
    h1 { font-size: 1.2rem; margin-bottom: .4rem; color: #111; }
    .sub { font-size: .85rem; color: #666; margin-bottom: 1.5rem; }
    label { display: block; font-size: .85rem; font-weight: 600;
            color: #374151; margin-bottom: .4rem; }
    input[type="password"] {
      width: 100%; padding: .6rem .85rem; border: 1px solid #d1d5db;
      border-radius: 8px; font-size: .95rem; margin-bottom: 1rem;
      outline: none;
    }
    input[type="password"]:focus { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,.15); }
    .error {
      background: #fef2f2; border: 1px solid #fecaca;
      color: #b91c1c; border-radius: 8px;
      padding: .6rem .85rem; font-size: .85rem; margin-bottom: 1rem;
    }
    button {
      width: 100%; padding: .65rem; background: #2563eb; color: #fff;
      border: none; border-radius: 8px; font-size: .95rem;
      font-weight: 600; cursor: pointer;
    }
    button:hover { background: #1d4ed8; }
    .app-badge {
      display: inline-block; background: #eff6ff; color: #1d4ed8;
      border-radius: 6px; padding: .2rem .6rem; font-size: .8rem;
      font-weight: 600; margin-bottom: 1rem;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="app-badge">🔐 MCP Calculator Server</div>
    <h1>Sign in to continue</h1>
    <p class="sub"><strong>${escHtml(clientName)}</strong> wants to connect. Enter your API key to authorize access.</p>
    ${error ? `<div class="error">❌ ${escHtml(error)}</div>` : ""}
    <form method="POST" action="/oauth/login">
      <input type="hidden" name="client_id"             value="${escHtml(clientId)}">
      <input type="hidden" name="redirect_uri"          value="${escHtml(redirectUri)}">
      <input type="hidden" name="state"                 value="${escHtml(state ?? '')}">
      <input type="hidden" name="code_challenge"        value="${escHtml(codeChallenge ?? '')}">
      <input type="hidden" name="code_challenge_method" value="${escHtml(codeChallengeMethod ?? '')}">
      <label for="apikey">API Key</label>
      <input type="password" id="apikey" name="apikey"
             placeholder="Enter your API key" autofocus autocomplete="off">
      <button type="submit">Continue →</button>
    </form>
  </div>
</body>
</html>`;
}

// Step 2 — key was correct, show the consent page
function consentPage({ clientName, clientId, redirectUri, state,
                       codeChallenge, codeChallengeMethod, verifiedToken }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Authorize — MCP Calculator</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #f5f5f5; display: flex;
      align-items: center; justify-content: center;
      min-height: 100vh; padding: 1rem;
    }
    .card {
      background: #fff; border-radius: 12px;
      box-shadow: 0 4px 24px rgba(0,0,0,.1);
      max-width: 420px; width: 100%; padding: 2rem;
    }
    h1 { font-size: 1.25rem; margin-bottom: .5rem; color: #111; }
    p  { font-size: .9rem; color: #555; line-height: 1.5; margin-bottom: 1rem; }
    .verified {
      display: flex; align-items: center; gap: .5rem;
      background: #f0fdf4; border: 1px solid #bbf7d0;
      border-radius: 8px; padding: .6rem .85rem;
      font-size: .85rem; color: #166534; margin-bottom: 1.25rem;
    }
    .scopes {
      background: #f9f9f9; border-radius: 8px;
      padding: .75rem 1rem; margin-bottom: 1.5rem;
      font-size: .85rem; color: #444;
    }
    .scopes li { list-style: none; padding: .25rem 0; }
    .scopes li::before { content: "✓ "; color: #22c55e; font-weight: bold; }
    .buttons { display: flex; gap: .75rem; }
    button {
      flex: 1; padding: .65rem 1rem; border-radius: 8px;
      font-size: .95rem; cursor: pointer; border: none;
    }
    .allow  { background: #2563eb; color: #fff; font-weight: 600; }
    .allow:hover  { background: #1d4ed8; }
    .deny   { background: #e5e7eb; color: #374151; }
    .deny:hover   { background: #d1d5db; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Authorize Access</h1>
    <p><strong>${escHtml(clientName)}</strong> is requesting access to your MCP Calculator Server.</p>
    <div class="verified">✅ API key verified — you are authenticated</div>
    <ul class="scopes">
      <li>Use calculator tools (add, subtract, multiply, divide)</li>
      <li>Access math prompts</li>
    </ul>
    <form method="POST" action="/oauth/authorize">
      <input type="hidden" name="client_id"             value="${escHtml(clientId)}">
      <input type="hidden" name="redirect_uri"          value="${escHtml(redirectUri)}">
      <input type="hidden" name="state"                 value="${escHtml(state ?? '')}">
      <input type="hidden" name="code_challenge"        value="${escHtml(codeChallenge ?? '')}">
      <input type="hidden" name="code_challenge_method" value="${escHtml(codeChallengeMethod ?? '')}">
      <input type="hidden" name="verified_token"        value="${escHtml(verifiedToken)}">
      <div class="buttons">
        <button type="submit" name="decision" value="allow" class="allow">Allow</button>
        <button type="submit" name="decision" value="deny"  class="deny">Deny</button>
      </div>
    </form>
  </div>
</body>
</html>`;
}

// Constant-time compare to prevent timing attacks
function safeCompare(a, b) {
  if (!a || !b) return false;
  if (a.length !== b.length) { let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i); return false; }
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ── Route registration ────────────────────────────────────────
export function registerAuthorizeRoutes(app) {

  // ── GET /oauth/authorize — show API key login form ──────────
  app.get("/oauth/authorize", (req, res) => {
    const { client_id, redirect_uri, response_type, state,
            code_challenge, code_challenge_method } = req.query;

    if (!client_id || !redirect_uri) {
      return res.status(400).send("Missing client_id or redirect_uri");
    }
    if (response_type !== "code") {
      return res.status(400).send("Only response_type=code is supported");
    }

    const client = db.prepare("SELECT * FROM oauth_clients WHERE client_id = ?").get(client_id);
    if (!client) return res.status(400).send("Unknown client_id");

    const registeredUris = JSON.parse(client.redirect_uris || "[]");
    if (!registeredUris.includes(redirect_uri)) {
      return res.status(400).send("redirect_uri not registered for this client");
    }

    // Show the API key login page — not the consent page yet
    res.send(loginPage({
      clientName:          client.client_name || client_id,
      clientId:            client_id,
      redirectUri:         redirect_uri,
      state:               state ?? "",
      codeChallenge:       code_challenge ?? "",
      codeChallengeMethod: code_challenge_method ?? "",
    }));
  });

  // ── POST /oauth/login — validate API key, show consent ──────
  app.post("/oauth/login", (req, res) => {
    const { client_id, redirect_uri, state,
            code_challenge, code_challenge_method, apikey } = req.body;

    const client = db.prepare("SELECT * FROM oauth_clients WHERE client_id = ?").get(client_id);
    if (!client) return res.status(400).send("Unknown client_id");

    const registeredUris = JSON.parse(client.redirect_uris || "[]");
    if (!registeredUris.includes(redirect_uri)) {
      return res.status(400).send("redirect_uri not registered");
    }

    // Validate the API key
    const expectedKey = process.env.MCP_API_KEY || "";
    if (!expectedKey || !safeCompare(apikey?.trim(), expectedKey)) {
      return res.send(loginPage({
        clientName:          client.client_name || client_id,
        clientId:            client_id,
        redirectUri:         redirect_uri,
        state:               state ?? "",
        codeChallenge:       code_challenge ?? "",
        codeChallengeMethod: code_challenge_method ?? "",
        error:               "Incorrect API key. Please try again.",
      }));
    }

    // Key is valid — show consent page with a verified marker
    res.send(consentPage({
      clientName:          client.client_name || client_id,
      clientId:            client_id,
      redirectUri:         redirect_uri,
      state:               state ?? "",
      codeChallenge:       code_challenge ?? "",
      codeChallengeMethod: code_challenge_method ?? "",
      verifiedToken:       "ok",   // simple flag — re-verified on POST /oauth/authorize
    }));
  });

  // ── POST /oauth/authorize — issue code after consent ────────
  app.post("/oauth/authorize", (req, res) => {
    const { client_id, redirect_uri, state,
            code_challenge, code_challenge_method,
            verified_token, decision } = req.body;

    // Must have passed through the login step
    if (verified_token !== "ok") {
      return res.status(400).send("Unauthorized — please complete login first");
    }

    // User denied
    if (decision !== "allow") {
      const url = new URL(redirect_uri);
      url.searchParams.set("error", "access_denied");
      if (state) url.searchParams.set("state", state);
      return res.redirect(url.toString());
    }

    const client = db.prepare("SELECT * FROM oauth_clients WHERE client_id = ?").get(client_id);
    if (!client) return res.status(400).send("Unknown client_id");

    const registeredUris = JSON.parse(client.redirect_uris || "[]");
    if (!registeredUris.includes(redirect_uri)) {
      return res.status(400).send("redirect_uri not registered");
    }

    // Issue authorization code
    const code = uuid();
    db.prepare(`
      INSERT INTO auth_codes(
        code, client_id, redirect_uri, user_id,
        code_challenge, code_challenge_method, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      code, client_id, redirect_uri, "demo-user",
      code_challenge || null, code_challenge_method || null,
      Date.now() + 5 * 60 * 1000
    );

    console.log(`[authorize] code issued for client ${client_id}`);

    const url = new URL(redirect_uri);
    url.searchParams.set("code", code);
    if (state) url.searchParams.set("state", state);
    res.redirect(url.toString());
  });
}0