// src/auth/register.js
// RFC 7591 — OAuth 2.0 Dynamic Client Registration
// Claude.ai calls POST /register before starting the OAuth flow.

import db from "./db.js";
import { v4 as uuid } from "uuid";

export function registerClientRoutes(app) {

  app.post("/register", (req, res) => {
    const body = req.body || {};

    const redirectUris  = Array.isArray(body.redirect_uris)
      ? body.redirect_uris
      : [];

    if (redirectUris.length === 0) {
      return res.status(400).json({
        error:             "invalid_client_metadata",
        error_description: "redirect_uris is required",
      });
    }

    const clientId     = uuid();
    const clientSecret = uuid();      // kept for confidential clients; public clients ignore it
    const clientName   = body.client_name || "Unknown Client";

    db.prepare(`
      INSERT INTO oauth_clients(client_id, client_secret, redirect_uris, client_name)
      VALUES (?, ?, ?, ?)
    `).run(clientId, clientSecret, JSON.stringify(redirectUris), clientName);

    console.log(`[register] new client: ${clientId} (${clientName})`);

    // Return full RFC 7591 Client Information Response
    res.status(201).json({
      client_id:              clientId,
      client_secret:          clientSecret,
      client_name:            clientName,
      redirect_uris:          redirectUris,
      grant_types:            ["authorization_code"],
      response_types:         ["code"],
      token_endpoint_auth_method: "none",  // public client
    });
  });
}
