// src/calculator.js
// ─────────────────────────────────────────────────────────────
//  Pure calculator functions with input validation.
//  All functions return { result, expression } on success or
//  throw a descriptive Error on invalid input.
// ─────────────────────────────────────────────────────────────

/**
 * Validate that a value is a finite number.
 * @param {unknown} value
 * @param {string} name  — label used in error messages
 * @returns {number}
 */
function validateNumber(value, name) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(`"${name}" must be a finite number, got: ${value}`);
  }
  return n;
}

// ── Operations ────────────────────────────────────────────────

/**
 * Add two numbers.
 * @param {number} a
 * @param {number} b
 * @returns {{ result: number, expression: string }}
 */
export function add(a, b) {
  a = validateNumber(a, "a");
  b = validateNumber(b, "b");
  return {
    result: a + b,
    expression: `${a} + ${b} = ${a + b}`,
  };
}

/**
 * Subtract b from a.
 * @param {number} a
 * @param {number} b
 * @returns {{ result: number, expression: string }}
 */
export function subtract(a, b) {
  a = validateNumber(a, "a");
  b = validateNumber(b, "b");
  return {
    result: a - b,
    expression: `${a} - ${b} = ${a - b}`,
  };
}

/**
 * Multiply two numbers.
 * @param {number} a
 * @param {number} b
 * @returns {{ result: number, expression: string }}
 */
export function multiply(a, b) {
  a = validateNumber(a, "a");
  b = validateNumber(b, "b");
  return {
    result: a * b,
    expression: `${a} × ${b} = ${a * b}`,
  };
}

/**
 * Divide a by b.  Throws if b === 0.
 * @param {number} a
 * @param {number} b
 * @returns {{ result: number, expression: string }}
 */
export function divide(a, b) {
  a = validateNumber(a, "a");
  b = validateNumber(b, "b");
  if (b === 0) {
    throw new Error("Division by zero is not allowed.");
  }
  return {
    result: a / b,
    expression: `${a} ÷ ${b} = ${a / b}`,
  };
}
