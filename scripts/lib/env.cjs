// Minimal .env.local loader (no dependency on dotenv).
const fs = require("node:fs");
const path = require("node:path");

function loadEnv(file = path.join(process.cwd(), ".env.local")) {
  if (!fs.existsSync(file)) {
    throw new Error(`missing ${file} — run: npm run accounts`);
  }
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

module.exports = { loadEnv };
