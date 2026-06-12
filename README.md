# MCP Calculator Server

A **remote MCP server** built with Node.js that exposes arithmetic tools and prompts over **Streamable HTTP transport** (MCP spec 2025-03-26) with **API key authorization**.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  MCP Client (Claude, custom client, etc.)               │
│   POST /mcp  →  JSON-RPC messages                       │
│   GET  /mcp  →  SSE stream (server-initiated messages)  │
│   DELETE /mcp → session teardown                        │
└──────────────────┬──────────────────────────────────────┘
                   │  X-API-Key header
┌──────────────────▼──────────────────────────────────────┐
│  Express App (src/server.js)                            │
│   ├─ CORS middleware                                    │
│   ├─ requireApiKey() middleware  (src/auth.js)          │
│   └─ StreamableHTTPServerTransport  (per session)       │
│        └─ McpServer  (src/mcpServer.js)                 │
│             ├─ Tools   → add, subtract, multiply, divide│
│             └─ Prompts → solve_expression, explain_     │
│                          operation, step_by_step,       │
│                          compare_operations             │
└─────────────────────────────────────────────────────────┘
```

**Session model:** each client initialization creates an independent `McpServer` + `StreamableHTTPServerTransport` pair, stored in a `Map<sessionId, {transport, mcpServer}>`. All subsequent requests from that client carry the `MCP-Session-Id` header to route to the correct instance.

---

## Prerequisites

| Requirement | Version |
|-------------|---------|
| Node.js | ≥ 18.0.0 |
| npm | ≥ 9.0.0 |

---

## Installation

```bash
# 1. Clone / copy the project
cd mcp-calculator-server

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
#   → open .env and set MCP_API_KEY to a strong secret
```

---

## Dependencies

| Package | Purpose |
|---------|---------|
| `@modelcontextprotocol/sdk` | Official MCP TypeScript/JS SDK. Provides `McpServer`, `StreamableHTTPServerTransport`, `isInitializeRequest`, Zod-based tool/prompt registration |
| `express` | HTTP server framework. Handles routing, CORS, JSON body parsing |
| `dotenv` | Loads `.env` file into `process.env` at startup |
| `zod` | Schema validation for tool and prompt arguments |

---

## Configuration (`.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP port to listen on |
| `MCP_API_KEY` | *(required)* | Secret key clients must send |
| `ALLOWED_ORIGINS` | `*` | Comma-separated CORS origins |

---

## Running the Server

```bash
# Production
npm start

# Development (auto-restart on file changes, Node ≥ 18)
npm run dev
```

Expected output:
```
╔══════════════════════════════════════════════════╗
║       MCP Calculator Server — Started            ║
╠══════════════════════════════════════════════════╣
║  URL       : http://localhost:3000               ║
║  MCP       : http://localhost:3000/mcp           ║
║  Transport : Streamable HTTP                     ║
║  Auth      : API key (X-API-Key header)          ║
╠══════════════════════════════════════════════════╣
║  Tools     : add, subtract, multiply, divide     ║
║  Prompts   : solve_expression, explain_operation ║
║             step_by_step, compare_operations     ║
╚══════════════════════════════════════════════════╝
```

---

## Running the Test Client

```bash
# Make sure the server is running first, then:
node test-client.js
```

---

## HTTP Endpoints

### `GET /`  — Health check (no auth)
```json
{ "status": "ok", "service": "MCP Calculator Server", "activeSessions": 0 }
```

### `GET /info`  — Server capabilities (no auth)
Lists available tools and prompts without starting an MCP session.

### `POST /mcp`  — MCP JSON-RPC  *(requires API key)*
Send MCP JSON-RPC requests. First request must be `initialize`.

### `GET /mcp`  — SSE stream  *(requires API key)*
Open a Server-Sent Events stream for server-initiated messages.  
Requires `MCP-Session-Id` header.

### `DELETE /mcp`  — Teardown session  *(requires API key)*
Gracefully close and remove an active session.

---

## Authorization

All `/mcp` routes require an API key in **one** of these locations (checked in order):

```
# Option 1 — dedicated header (recommended)
X-API-Key: your-secret-key

# Option 2 — Bearer token
Authorization: Bearer your-secret-key

# Option 3 — query parameter (least secure)
POST /mcp?apiKey=your-secret-key
```

| Bad key | `403 Forbidden` |
|---------|-----------------|
| Missing key | `401 Unauthorized` |
| Correct key | request proceeds |

The comparison uses a constant-time algorithm to prevent timing attacks.

---

## Tools

All tools accept two `number` arguments: **`a`** and **`b`**.

| Tool | Operation | Error case |
|------|-----------|------------|
| `add` | `a + b` | — |
| `subtract` | `a - b` | — |
| `multiply` | `a × b` | — |
| `divide` | `a ÷ b` | `b === 0` → error |

Example tool call (raw JSON-RPC):
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "divide",
    "arguments": { "a": 22, "b": 7 }
  }
}
```

---

## Prompts

| Prompt | Arguments | Purpose |
|--------|-----------|---------|
| `solve_expression` | `expression: string` | Guides the model to solve a math expression step-by-step using the tools |
| `explain_operation` | `operation: enum`, `examples?: string` | Explains an operation and demonstrates it |
| `step_by_step` | `problem: string` | Solves a word problem calling tools for each step |
| `compare_operations` | `a: number`, `b: number` | Applies all four operations to a pair and compares results |

---

## Connecting to Claude

Add this server as a **remote MCP connector** in Claude:

1. Go to **Settings → Integrations → Add MCP Server**
2. Enter the server URL: `http://your-host:3000/mcp`
3. Enter your API key when prompted

Claude will then be able to call `add`, `subtract`, `multiply`, and `divide`, and use the registered prompts.

---

## File Structure

```
mcp-calculator-server/
├── src/
│   ├── server.js       # Express app + Streamable HTTP transport + session management
│   ├── mcpServer.js    # McpServer with tools and prompts
│   ├── calculator.js   # Pure arithmetic functions with validation
│   └── auth.js         # API key middleware (constant-time comparison)
├── test-client.js      # Smoke-test script
├── package.json
├── .env.example
└── README.md
```

---

## Security Notes

- Always set `MCP_API_KEY` to a **random 32+ character secret** in production.
- Use HTTPS in production (put the server behind nginx or a cloud load balancer).
- Restrict `ALLOWED_ORIGINS` to your actual client origins instead of `*`.
- The API key comparison uses a constant-time algorithm to prevent timing-based enumeration.
