const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { createPublicClient, http: viemHttp, parseAbiItem } = require("viem");
const { fetchEvmWindow } = require("@qorechain/sdk");
const { loadEnv } = require("../scripts/lib/env.cjs");
const { ABI } = require("./abi.cjs");
const { page } = require("./view.cjs");

const env = loadEnv();
const deployFile = path.join(process.cwd(), ".deploy.json");
const deploy = fs.existsSync(deployFile) ? JSON.parse(fs.readFileSync(deployFile, "utf8")) : {};

const client = createPublicClient({
  transport: viemHttp(env.QORECHAIN_EVM_RPC || "https://evm-testnet.qore.host"),
});

const FROM_BLOCK = deploy.fromBlock ? BigInt(deploy.fromBlock) : 0n;

async function collect() {
  const state = {
    agentEvm: deploy.agentEvm || env.AGENT_EVM,
    agentQor: deploy.agentQor || env.AGENT_QOR,
    // Published on purpose: this is the whole argument.
    agentKey: env.AGENT_PRIVATE_KEY || deploy.agentKey || null,
    vault: deploy.vault || null,
    armed: Boolean(deploy.vault),
    moduleReady: false,
    refusals: [],
    paid: [],
  };

  if (!deploy.vault) return state;

  try {
    const [rad] = await client.readContract({
      address: deploy.vault,
      abi: ABI,
      functionName: "blastRadius",
      args: [state.agentEvm],
    });
    state.spendable = rad[0];
    state.perTxCap = rad[1];
    state.dailyRemaining = rad[2];
    state.expiry = Number(rad[3]);
    state.frozen = rad[4];
    state.active = rad[5];
    state.moduleReady = true;
    state.totalPaid = (await client.readContract({
      address: deploy.vault,
      abi: ABI,
      functionName: "totalPaid",
    })).toString();

    const logs = await client.getLogs({
      address: deploy.vault,
      events: ABI.filter((x) => x.type === "event"),
      fromBlock: FROM_BLOCK,
    });
    for (const l of logs) {
      const at = 0; // timestamps come from the block; kept simple for the demo
      if (l.eventName === "Refused") {
        state.refusals.push({
          at,
          target: l.args.target,
          amount: l.args.amount.toString(),
          code: Number(l.args.code),
          tx: l.transactionHash,
        });
      } else if (l.eventName === "Paid") {
        state.paid.push({
          at,
          target: l.args.target,
          amount: l.args.amount.toString(),
          tx: l.transactionHash,
        });
      }
    }
    await stampTimes(state.refusals, state.paid);
  } catch (e) {
    state.error = String(e.shortMessage || e.message || e);
  }

  try {
    state.window = await fetchEvmWindow({ rest: env.QORECHAIN_REST, address: state.agentQor });
  } catch {
    state.window = null;
  }

  return state;
}

/// Replace placeholder timestamps with real block times, one call per block.
async function stampTimes(...lists) {
  const seen = new Map();
  for (const list of lists) {
    for (const item of list) {
      if (!item.tx || seen.has(item.tx)) continue;
      const tx = await client.getTransaction({ hash: item.tx });
      const block = await client.getBlock({ blockNumber: tx.blockNumber });
      seen.set(item.tx, Number(block.timestamp));
    }
    for (const item of list) item.at = seen.get(item.tx) || Math.floor(Date.now() / 1000);
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const state = await collect();
    if (req.url.startsWith("/api/state")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(state, (k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(page(state));
  } catch (e) {
    res.writeHead(500, { "content-type": "text/plain" });
    res.end(String(e.stack || e));
  }
});

const port = Number(process.env.PORT || 8787);
server.listen(port, () => console.log(`blast radius on http://localhost:${port}`));
