// src/auth/discovery.js
// OAuth 2.0 discovery endpoints (RFC 8414 + RFC 9728)
// Claude.ai reads these to learn how to authenticate before connecting.

export function registerDiscoveryRoutes(app) {

  // RFC 9728 — OAuth 2.0 Protected Resource Metadata
  // Tells Claude *which* authorization server protects this resource.
  app.get("/.well-known/oauth-protected-resource", (req, res) => {
    const base = `${req.protocol}://${req.get("host")}`;
    res.json({
      resource:             `${base}/mcp`,
      authorization_servers: [base],
    });
  });

  // RFC 8414 — OAuth 2.0 Authorization Server Metadata
  // Tells Claude all the endpoints it needs to drive the OAuth flow.
  app.get("/.well-known/oauth-authorization-server", (req, res) => {
    const base = `${req.protocol}://${req.get("host")}`;
    res.json({
      issuer:                base,
      authorization_endpoint:  `${base}/oauth/authorize`,
      token_endpoint:          `${base}/oauth/token`,
      registration_endpoint:   `${base}/register`,
      response_types_supported:          ["code"],
      grant_types_supported:             ["authorization_code"],
      code_challenge_methods_supported:  ["S256"],    // PKCE — Claude requires this
      token_endpoint_auth_methods_supported: ["none"], // public clients (no secret)
    });
  });
}
