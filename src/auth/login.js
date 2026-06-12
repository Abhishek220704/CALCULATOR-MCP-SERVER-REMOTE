import bcrypt from "bcrypt";
import db from "./db.js";
import { v4 as uuid } from "uuid";

export async function seedUser() {
  const exists = db
    .prepare("SELECT * FROM users WHERE email=?")
    .get("admin@example.com");

  if (!exists) {
    const hash = await bcrypt.hash("password123", 10);

    db.prepare(`
      INSERT INTO users(id,email,password_hash)
      VALUES(?,?,?)
    `).run(uuid(), "admin@example.com", hash);

    console.log("Test user created");
  }
}