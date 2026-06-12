import "dotenv/config";

import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

import { createMcpServer }        from "./mcpServer.js";
import { registerDiscoveryRoutes } from "./auth/discovery.js";
import { registerClientRoutes }    from "./auth/register.js";
import { registerAuthorizeRoutes } from "./auth/authorize.js";
import { registerTokenRoutes }     from "./auth/token.js";
import { requireAuth }             from "./auth/middleware.js";

// ── Config ────────────────────────────────────────────────────
const PORT        = parseInt(process.env.PORT || "3000", 10);
const API_KEY     = process.env.MCP_API_KEY || "";
const AUTH_ENABLED = API_KEY.length > 0;

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "*")
  .split(",")
  .map((s) => s.trim());

// ── Session store — sessionId → { transport, mcpServer } ─────
const sessions = new Map();

// ── Express app ───────────────────────────────────────────────
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── CORS ──────────────────────────────────────────────────────
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allow =
    ALLOWED_ORIGINS.includes("*") || ALLOWED_ORIGINS.includes(origin)
      ? origin || "*"
      : null;

  if (allow) {
    res.setHeader("Access-Control-Allow-Origin", allow);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-API-Key, MCP-Session-Id, MCP-Protocol-Version"
    );
    res.setHeader("Access-Control-Expose-Headers", "MCP-Session-Id");
  }

  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// ── Public OAuth / discovery routes (no auth required) ───────
registerDiscoveryRoutes(app);
registerClientRoutes(app);
registerAuthorizeRoutes(app);
registerTokenRoutes(app);

// ── Health check ──────────────────────────────────────────────
app.get("/", (_req, res) => {
  res.json({
    status:         "ok",
    service:        "MCP Calculator Server",
    version:        "1.0.0",
    transport:      "Streamable HTTP (MCP spec 2025-03-26)",
    authEnabled:    AUTH_ENABLED,
    activeSessions: sessions.size,
    uptime:         Math.round(process.uptime()),
  });
});

// ── Server info ───────────────────────────────────────────────
app.get("/info", (_req, res) => {
  res.json({
    name:        "calculator-mcp-server",
    version:     "1.0.0",
    description: "Remote MCP server — arithmetic tools and prompts",
    mcpEndpoint: "/mcp",
    authEnabled: AUTH_ENABLED,
    authMethod:  AUTH_ENABLED ? "API key or OAuth 2.0 Bearer token" : "none",
    tools:       ["add", "subtract", "multiply", "divide"],
    prompts:     ["solve_expression", "explain_operation", "step_by_step", "compare_operations"],
  });
});

// ── Protect all /mcp routes ───────────────────────────────────
app.use("/mcp", requireAuth());

// ── POST /mcp — client → server messages ─────────────────────
app.post("/mcp", async (req, res) => {
  try {
    const sessionId = req.headers["mcp-session-id"];

    // Route to existing session
    if (sessionId && sessions.has(sessionId)) {
      const { transport } = sessions.get(sessionId);
      await transport.handleRequest(req, res, req.body);
      return;
    }

    // New connection — first message MUST be initialize
    if (!isInitializeRequest(req.body)) {
      return res.status(400).json({
        jsonrpc: "2.0",
        error: {
          code:    -32600,
          message: "First request must be an MCP Initialize request. " +
                   "Include MCP-Session-Id header for subsequent messages.",
        },
        id: req.body?.id ?? null,
      });
    }

    // Create a fresh McpServer + transport pair for this session
    const mcpServer = createMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      onsessioninitialized: (id) => {
        sessions.set(id, { transport, mcpServer });
        console.log(`[session] created: ${id}  (active: ${sessions.size})`);
      },
    });

    transport.onclose = () => {
      const id = transport.sessionId;
      if (id && sessions.has(id)) {
        sessions.delete(id);
        console.log(`[session] closed:  ${id}  (active: ${sessions.size})`);
      }
    };

    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, req.body);

  } catch (err) {
    console.error("[POST /mcp]", err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id:    null,
      });
    }
  }
});

// ── GET /mcp — SSE stream for server-initiated messages ───────
app.get("/mcp", async (req, res) => {
  try {
    const sessionId = req.headers["mcp-session-id"];
    if (!sessionId || !sessions.has(sessionId)) {
      return res.status(400).json({
        error:   "Bad Request",
        message: "Valid MCP-Session-Id header is required.",
      });
    }
    const { transport } = sessions.get(sessionId);
    await transport.handleRequest(req, res);
  } catch (err) {
    console.error("[GET /mcp]", err);
    if (!res.headersSent) res.status(500).end();
  }
});

// ── DELETE /mcp — explicit session teardown ───────────────────
app.delete("/mcp", async (req, res) => {
  try {
    const sessionId = req.headers["mcp-session-id"];
    if (!sessionId || !sessions.has(sessionId)) {
      return res.status(404).json({
        error:   "Not Found",
        message: "No active session for the provided MCP-Session-Id.",
      });
    }
    const { transport } = sessions.get(sessionId);
    await transport.handleRequest(req, res);
    sessions.delete(sessionId);
    console.log(`[session] deleted by client: ${sessionId}`);
  } catch (err) {
    console.error("[DELETE /mcp]", err);
    if (!res.headersSent) res.status(500).end();
  }
});

// ── 404 catch-all ─────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({
    error:     "Not Found",
    available: ["GET /", "GET /info", "POST /mcp", "GET /mcp", "DELETE /mcp"],
  });
});

// ── Start ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  const key = AUTH_ENABLED
    ? `API key / OAuth 2.0 PKCE`
    : `DISABLED (MCP_API_KEY not set)`;

  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║       MCP Calculator Server — Started            ║");
  console.log("╠══════════════════════════════════════════════════╣");
  console.log(`║  URL       : http://localhost:${PORT}                 ║`);
  console.log(`║  MCP       : http://localhost:${PORT}/mcp             ║`);
  console.log(`║  Transport : Streamable HTTP                     ║`);
  console.log(`║  Auth      : ${key.padEnd(36)} ║`);
  console.log("╠══════════════════════════════════════════════════╣");
  console.log("║  Tools     : add, subtract, multiply, divide     ║");
  console.log("║  Prompts   : solve_expression, explain_operation ║");
  console.log("║              step_by_step, compare_operations    ║");
  console.log("╚══════════════════════════════════════════════════╝");
});

// ── Graceful shutdown ─────────────────────────────────────────
process.on("SIGINT", async () => {
  console.log("\n[server] shutting down…");
  for (const [id, { transport }] of sessions) {
    try { await transport.close(); } catch (_) {}
    sessions.delete(id);
  }
  process.exit(0);
});
