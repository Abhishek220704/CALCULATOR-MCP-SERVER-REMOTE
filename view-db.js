import Database from "better-sqlite3";

const db = new Database("oauth.db");

const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table'")
  .all();

console.log("Tables:");
console.table(tables);

for (const table of tables) {
  console.log(`\n===== ${table.name} =====`);

  try {
    const rows = db.prepare(`SELECT * FROM ${table.name}`).all();
    console.table(rows);
  } catch (err) {
    console.error(err.message);
  }
}