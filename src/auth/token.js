// src/auth/token.js
// OAuth 2.0 Token Endpoint — authorization_code grant with PKCE verification

import crypto from "crypto";
import db from "./db.js";
import { v4 as uuid } from "uuid";

// Verify PKCE code_verifier against stored code_challenge (S256 method)
function verifyPkce(codeVerifier, codeChallenge, method) {
  if (!codeChallenge) return true;   // no challenge stored → skip (legacy)
  if (!codeVerifier)  return false;  // challenge present but no verifier → fail

  if ((method || "S256") === "S256") {
    const digest = crypto
      .createHash("sha256")
      .update(codeVerifier)
      .digest("base64url");
    return digest === codeChallenge;
  }

  // plain (not recommended, but handle it)
  return codeVerifier === codeChallenge;
}

export function registerTokenRoutes(app) {

  app.post("/oauth/token", (req, res) => {
    const {
      grant_type,
      code,
      redirect_uri,
      client_id,
      code_verifier,
    } = req.body;

    if (grant_type !== "authorization_code") {
      return res.status(400).json({
        error:             "unsupported_grant_type",
        error_description: "Only authorization_code is supported",
      });
    }

    if (!code) {
      return res.status(400).json({ error: "invalid_request", error_description: "code is required" });
    }

    // Fetch auth code
    const authCode = db
      .prepare("SELECT * FROM auth_codes WHERE code = ?")
      .get(code);

    if (!authCode) {
      return res.status(400).json({ error: "invalid_grant", error_description: "Unknown or already-used code" });
    }

    // Check expiry
    if (Date.now() > authCode.expires_at) {
      db.prepare("DELETE FROM auth_codes WHERE code = ?").run(code);
      return res.status(400).json({ error: "invalid_grant", error_description: "Authorization code expired" });
    }

    // Validate client_id matches
    if (client_id && authCode.client_id !== client_id) {
      return res.status(400).json({ error: "invalid_grant", error_description: "client_id mismatch" });
    }

    // Validate redirect_uri matches (if supplied)
    if (redirect_uri && authCode.redirect_uri && authCode.redirect_uri !== redirect_uri) {
      return res.status(400).json({ error: "invalid_grant", error_description: "redirect_uri mismatch" });
    }

    // Verify PKCE
    if (!verifyPkce(code_verifier, authCode.code_challenge, authCode.code_challenge_method)) {
      return res.status(400).json({ error: "invalid_grant", error_description: "PKCE verification failed" });
    }

    // Consume the code (one-time use)
    db.prepare("DELETE FROM auth_codes WHERE code = ?").run(code);

    // Issue access token (valid 1 hour)
    const accessToken = uuid();
    const expiresAt   = Date.now() + 3600 * 1000;

    db.prepare(`
      INSERT INTO access_tokens(token, client_id, user_id, expires_at)
      VALUES (?, ?, ?, ?)
    `).run(accessToken, authCode.client_id, authCode.user_id, expiresAt);

    console.log(`[token] issued for client ${authCode.client_id}`);

    res.json({
      access_token: accessToken,
      token_type:   "Bearer",
      expires_in:   3600,
    });
  });
}
