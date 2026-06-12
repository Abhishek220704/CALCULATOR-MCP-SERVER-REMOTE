// src/auth.js

import db from "./auth/db.js";

/**
 * Extract API key or bearer token
 */
function extractKey(req) {
  const xApiKey = req.headers["x-api-key"];
  if (xApiKey) return String(xApiKey).trim();

  const authHeader = req.headers["authorization"];
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }

  if (req.query?.apiKey) {
    return String(req.query.apiKey).trim();
  }

  return undefined;
}

export function requireApiKey() {
  const expectedKey = process.env.MCP_API_KEY;

  if (!expectedKey) {
    throw new Error("MCP_API_KEY environment variable is not set.");
  }

  return function apiKeyMiddleware(req, res, next) {
    if (req.method === "OPTIONS") {
      return next();
    }

    const providedKey = extractKey(req);

    if (providedKey) {
      // Regular API key
      if (safeCompare(providedKey, expectedKey)) {
        return next();
      }

      // OAuth access token
      try {
        const token = db
          .prepare(
            `SELECT token FROM access_tokens WHERE token = ?`
          )
          .get(providedKey);

        if (token) {
          return next();
        }
      } catch (err) {
        console.error("OAuth token lookup failed:", err);
      }
    }

    // Tell Claude where OAuth metadata lives
    res.setHeader(
      "WWW-Authenticate",
      `Bearer resource_metadata="https://${req.get(
        "host"
      )}/.well-known/oauth-protected-resource"`
    );

    return res.status(401).json({
      error: "unauthorized",
    });
  };
}

function safeCompare(a, b) {
  if (!a || !b) return false;

  if (a.length !== b.length) {
    let dummy = 0;
    for (let i = 0; i < a.length; i++) {
      dummy |= a.charCodeAt(i);
    }
    return false;
  }

  let diff = 0;

  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return diff === 0;
}