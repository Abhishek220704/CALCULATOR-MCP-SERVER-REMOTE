// src/auth/middleware.js
// Shared auth middleware — validates API key OR OAuth Bearer token

import db from "./db.js";

function extractToken(req) {
  const xApiKey = req.headers["x-api-key"];
  if (xApiKey) return String(xApiKey).trim();

  const auth = req.headers["authorization"];
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();

  if (req.query?.apiKey) return String(req.query.apiKey).trim();

  return undefined;
}

// Constant-time comparison — prevents timing attacks
function safeCompare(a, b) {
  if (!a || !b) return false;
  if (a.length !== b.length) {
    // Run through a dummy loop so timing stays constant
    let d = 0;
    for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i);
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Returns an Express middleware that requires a valid credential.
 *
 * Accepted credentials (in order):
 *   1. Static API key from MCP_API_KEY env var   (X-API-Key / Bearer / ?apiKey=)
 *   2. A valid, non-expired OAuth access token stored in the DB
 *
 * On failure, responds 401 with a WWW-Authenticate header pointing Claude
 * to the OAuth discovery metadata so it can start the auth flow.
 */
export function requireAuth() {
  const staticKey  = process.env.MCP_API_KEY || "";
  const authEnabled = staticKey.length > 0;

  return function authMiddleware(req, res, next) {
    // Skip auth entirely if MCP_API_KEY is not configured
    if (!authEnabled) return next();

    // Always let preflight through
    if (req.method === "OPTIONS") return next();

    const provided = extractToken(req);

    if (!provided) {
      return send401(req, res);
    }

    // 1. Static API key check
    if (safeCompare(provided, staticKey)) {
      return next();
    }

    // 2. OAuth access token check (with expiry)
    try {
      const token = db
        .prepare("SELECT * FROM access_tokens WHERE token = ?")
        .get(provided);

      if (token && Date.now() < token.expires_at) {
        return next();
      }

      // Clean up expired token if found
      if (token) {
        db.prepare("DELETE FROM access_tokens WHERE token = ?").run(provided);
      }
    } catch (err) {
      console.error("[auth] token lookup error:", err);
    }

    return send401(req, res, true);
  };
}

function send401(req, res, invalidToken = false) {
  const host = req.get("host");
  const proto = req.protocol || "https";

  if (invalidToken) {
    res.setHeader("WWW-Authenticate", 'Bearer error="invalid_token"');
    return res.status(401).json({ error: "invalid_token" });
  }

  res.setHeader(
    "WWW-Authenticate",
    `Bearer resource_metadata="${proto}://${host}/.well-known/oauth-protected-resource"`
  );
  return res.status(401).json({ error: "unauthorized" });
}
