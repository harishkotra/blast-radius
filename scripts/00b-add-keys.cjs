// Append the agent's classical private key to .env.local — it is published on
// the public page on purpose, that is the entire argument of the project.
const fs = require("node:fs");
const { identities } = require("./lib/chain.cjs");

(async () => {
  const ids = await identities();
  const p = require("node:path").join(process.cwd(), ".env.local");
  let s = fs.readFileSync(p, "utf8");
  if (s.includes("AGENT_PRIVATE_KEY")) {
    console.log("already present");
    return;
  }
  s += `AGENT_PRIVATE_KEY=${ids.AGENT.privateKey}\nOWNER_PRIVATE_KEY=${ids.OWNER.privateKey}\n`;
  fs.writeFileSync(p, s, { mode: 0o600 });
  console.log("added AGENT_PRIVATE_KEY / OWNER_PRIVATE_KEY to .env.local");
})();
