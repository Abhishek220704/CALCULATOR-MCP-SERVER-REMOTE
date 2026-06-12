// src/mcpServer.js
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { add, subtract, multiply, divide } from "./calculator.js";

const operandsSchema = {
  a: z.number().describe("The first operand (left-hand side)"),
  b: z.number().describe("The second operand (right-hand side)"),
};

function okText(text) {
  return { content: [{ type: "text", text: String(text) }] };
}
function errText(message) {
  return { content: [{ type: "text", text: `❌ Error: ${message}` }], isError: true };
}

export function createMcpServer() {
  const server = new McpServer({ name: "calculator-mcp-server", version: "1.0.0" });

  // ── Tools ──────────────────────────────────────────────────

  server.tool("add", "Add two numbers together and return the sum.", operandsSchema,
    async ({ a, b }) => {
      try { const { result, expression } = add(a, b); return okText(`${expression}\nResult: ${result}`); }
      catch (err) { return errText(err.message); }
    }
  );

  server.tool("subtract", "Subtract b from a and return the difference.", operandsSchema,
    async ({ a, b }) => {
      try { const { result, expression } = subtract(a, b); return okText(`${expression}\nResult: ${result}`); }
      catch (err) { return errText(err.message); }
    }
  );

  server.tool("multiply", "Multiply two numbers together and return the product.", operandsSchema,
    async ({ a, b }) => {
      try { const { result, expression } = multiply(a, b); return okText(`${expression}\nResult: ${result}`); }
      catch (err) { return errText(err.message); }
    }
  );

  server.tool("divide", "Divide a by b and return the quotient. Returns an error if b is 0.", operandsSchema,
    async ({ a, b }) => {
      try { const { result, expression } = divide(a, b); return okText(`${expression}\nResult: ${result}`); }
      catch (err) { return errText(err.message); }
    }
  );

  // ── Prompts ────────────────────────────────────────────────

  // Works fine — string arg, UI can handle it
  server.prompt(
    "solve_expression",
    "Ask Claude to solve a mathematical expression step by step using the calculator tools.",
    { expression: z.string().describe("The math expression to solve, e.g. '(5 + 3) * 2'") },
    ({ expression }) => ({
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `Please solve the following mathematical expression step by step using the available calculator tools (add, subtract, multiply, divide):\n\n  ${expression}\n\nBreak it into individual operations, call the appropriate tool for each step, and show all intermediate results before giving the final answer.`,
        },
      }],
    })
  );

  // FIX: operation changed from required z.enum → optional z.string with default
  // The UI fails to attach prompts that have required enum/number args
  server.prompt(
    "explain_operation",
    "Ask Claude to explain a math operation (add, subtract, multiply, or divide) with examples using the calculator tools.",
    {
      operation: z
        .string()
        .optional()
        .describe("The operation to explain: add, subtract, multiply, or divide. If omitted, Claude will ask you."),
      examples: z
        .string()
        .optional()
        .describe("Optional comma-separated example pairs, e.g. '3,4 | 10,2'"),
    },
    ({ operation, examples }) => {
      const op = operation?.trim() || null;
      const exampleText = examples
        ? `\n\nPlease use these example pairs: ${examples}`
        : "\n\nPlease come up with 3 illustrative examples.";

      const text = op
        ? `Explain the "${op}" operation in simple terms, describe when it is useful, and demonstrate it by calling the "${op}" tool with concrete numbers.${exampleText}`
        : `I'd like you to explain one of the four arithmetic operations (add, subtract, multiply, divide). Which operation would you like me to explain? Once you tell me, I'll demonstrate it using the calculator tools.${exampleText}`;

      return {
        messages: [{ role: "user", content: { type: "text", text } }],
      };
    }
  );

  // Works fine — string arg
  server.prompt(
    "step_by_step",
    "Ask Claude to solve a word problem step by step using the calculator tools.",
    { problem: z.string().describe("A word problem or scenario that requires arithmetic") },
    ({ problem }) => ({
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `Solve the following word problem. For every arithmetic operation needed, call the appropriate calculator tool (add, subtract, multiply, divide). Show your reasoning at each step.\n\nProblem:\n${problem}`,
        },
      }],
    })
  );

  // FIX: a and b changed from required z.number → optional z.string with default
  server.prompt(
    "compare_operations",
    "Ask Claude to apply all four arithmetic operations on a pair of numbers and compare the results.",
    {
      a: z
        .string()
        .optional()
        .describe("First number (e.g. '12'). If omitted, Claude will pick example numbers."),
      b: z
        .string()
        .optional()
        .describe("Second number (e.g. '4'). If omitted, Claude will pick example numbers."),
    },
    ({ a, b }) => {
      const numA = a ? parseFloat(a) : null;
      const numB = b ? parseFloat(b) : null;
      const hasNumbers = numA !== null && numB !== null && !isNaN(numA) && !isNaN(numB);

      const text = hasNumbers
        ? `For the numbers ${numA} and ${numB}, apply all four arithmetic operations (add, subtract, multiply, divide) using the calculator tools. Present the results in a clear comparison table and briefly explain what each result tells us about the relationship between the two numbers.`
        : `Pick any two interesting numbers, then apply all four arithmetic operations (add, subtract, multiply, divide) to them using the calculator tools. Present the results in a clear comparison table and briefly explain what each result tells us about the relationship between the two numbers.`;

      return {
        messages: [{ role: "user", content: { type: "text", text } }],
      };
    }
  );

  return server;
}