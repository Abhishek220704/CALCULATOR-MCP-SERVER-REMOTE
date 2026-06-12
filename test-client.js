// test-client.js
// ─────────────────────────────────────────────────────────────
//  Quick smoke-test client for the MCP Calculator Server.
//  Run AFTER starting the server:
//    node src/server.js &
//    node test-client.js
// ─────────────────────────────────────────────────────────────

import "dotenv/config";

const BASE = `http://localhost:${process.env.PORT || 3000}`;
const API_KEY = process.env.MCP_API_KEY || "my-super-secret-key-change-me";
const HEADERS = {
  "Content-Type": "application/json",
  "X-API-Key": API_KEY,
  Accept: "application/json, text/event-stream",
};

let sessionId = null;
let requestId = 1;

// ── Low-level JSON-RPC helper ─────────────────────────────────
async function rpc(method, params = {}) {
  const body = {
    jsonrpc: "2.0",
    id: requestId++,
    method,
    params,
  };

  const headers = { ...HEADERS };
  if (sessionId) {
    headers["MCP-Session-Id"] = sessionId;
    headers["MCP-Protocol-Version"] = "2025-03-26";
  }

  const res = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  // Capture session ID from response headers
  const sid = res.headers.get("mcp-session-id");
  if (sid) sessionId = sid;

  const text = await res.text();

  // Streamable HTTP may return SSE lines or plain JSON
  const jsonLine = text
    .split("\n")
    .find((l) => l.startsWith("data:") || l.startsWith("{"));

  const json = jsonLine
    ? JSON.parse(jsonLine.replace(/^data:\s*/, ""))
    : JSON.parse(text);

  return json;
}

// ── Tests ─────────────────────────────────────────────────────
async function run() {
  console.log("🔗 Connecting to", BASE);

  // 1. Health check
  const health = await fetch(`${BASE}/`).then((r) => r.json());
  console.log("\n✅ Health:", health.status, "—", health.service);

  // 2. Server info
  const info = await fetch(`${BASE}/info`).then((r) => r.json());
  console.log("ℹ️  Tools:", info.tools.join(", "));

  // 3. Initialize MCP session
  console.log("\n── Initializing MCP session ──");
  const init = await rpc("initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "test-client", version: "1.0" },
  });
  console.log("Session ID :", sessionId);
  console.log("Server     :", init.result?.serverInfo);

  // 4. List tools
  const toolsList = await rpc("tools/list");
  console.log(
    "\n── Tools ──",
    toolsList.result?.tools?.map((t) => t.name)
  );

  // 5. List prompts
  const promptsList = await rpc("prompts/list");
  console.log(
    "── Prompts ──",
    promptsList.result?.prompts?.map((p) => p.name)
  );

  // 6. Call each calculator tool
  console.log("\n── Calling tools ──");

  const cases = [
    ["tools/call", { name: "add",      arguments: { a: 10,  b: 5  } }, "10 + 5"],
    ["tools/call", { name: "subtract", arguments: { a: 10,  b: 5  } }, "10 - 5"],
    ["tools/call", { name: "multiply", arguments: { a:  4,  b: 7  } }, " 4 × 7"],
    ["tools/call", { name: "divide",   arguments: { a: 20,  b: 4  } }, "20 ÷ 4"],
    ["tools/call", { name: "divide",   arguments: { a:  5,  b: 0  } }, " 5 ÷ 0 (should error)"],
  ];

  for (const [method, params, label] of cases) {
    const r = await rpc(method, params);
    const content = r.result?.content?.[0]?.text ?? JSON.stringify(r.error);
    console.log(`  ${label.padEnd(26)} →  ${content.split("\n")[0]}`);
  }

  // 7. Get a prompt
  console.log("\n── Prompt: solve_expression ──");
  const prompt = await rpc("prompts/get", {
    name: "solve_expression",
    arguments: { expression: "(8 + 2) * 3" },
  });
  const msg = prompt.result?.messages?.[0]?.content?.text;
  console.log(msg ? "  " + msg.slice(0, 120) + "…" : prompt);

  // 8. Auth rejection test
  console.log("\n── Auth rejection test ──");
  const badRes = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": "wrong-key" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 99, method: "tools/list", params: {} }),
  });
  console.log("  Status with bad key:", badRes.status, "(expected 403)");

  const noKeyRes = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 100, method: "tools/list", params: {} }),
  });
  console.log("  Status with no key :", noKeyRes.status, "(expected 401)");

  console.log("\n🎉  All tests passed!");
}

run().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
