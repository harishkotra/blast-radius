const { REFUSAL_CODES } = require("./abi.cjs");
const { codeBlock } = require("./cmdblock.cjs");

const fmtQor = (wei) => {
  const n = Number(BigInt(wei)) / 1e18;
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
};

function page(state) {
  const {
    agentEvm,
    agentKey,
    vault,
    spendable,
    perTxCap,
    dailyRemaining,
    expiry,
    frozen,
    active,
    window,
    refusals = [],
    paid = [],
    totalPaid = "0",
    armed,
    moduleReady,
  } = state;

  const live = armed && moduleReady;
  const countdown = expiry ? Math.max(0, expiry - Math.floor(Date.now() / 1000)) : 0;
  const hours = Math.floor(countdown / 3600);
  const mins = Math.floor((countdown % 3600) / 60);

  const refusalRows = refusals
    .slice()
    .reverse()
    .slice(0, 25)
    .map(
      (r) => `<tr>
        <td class="mono dim">${new Date(r.at * 1000).toISOString().slice(11, 19)}</td>
        <td class="mono">${r.target.slice(0, 10)}…${r.target.slice(-4)}</td>
        <td class="mono">${fmtQor(r.amount)}</td>
        <td><span class="tag bad">${REFUSAL_CODES[r.code] || "code " + r.code}</span></td>
      </tr>`
    )
    .join("");

  const paidRows = paid
    .slice()
    .reverse()
    .slice(0, 10)
    .map(
      (p) => `<tr>
        <td class="mono dim">${new Date(p.at * 1000).toISOString().slice(11, 19)}</td>
        <td class="mono">${p.target.slice(0, 10)}…${p.target.slice(-4)}</td>
        <td class="mono">${fmtQor(p.amount)}</td>
        <td><span class="tag good">released</span></td>
      </tr>`
    )
    .join("");

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Blast Radius — what a stolen key can do</title>
<style>
  :root{
    --bg:#08090c; --panel:#0f1116; --line:#242833; --ink:#eceef4; --dim:#9aa2b4;
    --good:#3ddc97; --bad:#ff5c5c; --accent:#7c8cff;
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);
    font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,system-ui,sans-serif;
    -webkit-font-smoothing:antialiased}
  .mono{font-family:ui-monospace,SFMono-Regular,"SF Mono",Menlo,monospace}
  .wrap{max-width:960px;margin:0 auto;padding:28px 20px 80px}
  header{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:38px}
  .dot{width:8px;height:8px;border-radius:50%;background:${live ? "var(--good)" : "#555"};box-shadow:0 0 0 4px rgba(61,220,151,.12)}
  .brand{font-weight:650;letter-spacing:.14em;font-size:12px;text-transform:uppercase;color:var(--dim)}
  .chip{font-size:11px;color:var(--dim);border:1px solid var(--line);border-radius:999px;padding:3px 10px}
  h1{font-size:clamp(28px,5vw,44px);line-height:1.08;letter-spacing:-.02em;margin:0 0 14px;font-weight:640}
  .lede{color:var(--dim);max-width:62ch;margin:0 0 34px}
  .hero{border:1px solid var(--line);border-radius:16px;padding:26px 24px;background:linear-gradient(180deg,#101319,#0b0d11)}
  .hero .label{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--dim)}
  .hero .num{font-size:clamp(44px,10vw,86px);font-weight:680;letter-spacing:-.03em;line-height:1;margin:8px 0 6px}
  .hero .num small{font-size:.3em;font-weight:600;color:var(--dim);letter-spacing:0;margin-left:8px}
  .hero .sub{color:var(--dim);font-size:13px}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin:16px 0 34px}
  .card{border:1px solid var(--line);border-radius:12px;padding:14px 16px;background:var(--panel)}
  .card .k{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);margin-bottom:6px}
  .card .v{font-size:19px;font-weight:600}
  .card .v.small{font-size:14px;font-weight:500;word-break:break-all}
  h2{font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim);margin:38px 0 12px;font-weight:600}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{text-align:left;color:var(--dim);font-weight:500;font-size:11px;letter-spacing:.08em;text-transform:uppercase;padding:6px 8px;border-bottom:1px solid var(--line)}
  td{padding:9px 8px;border-bottom:1px solid #14171d}
  .tag{font-size:11px;border-radius:5px;padding:2px 7px;white-space:nowrap}
  .tag.bad{background:rgba(255,92,92,.12);color:var(--bad)}
  .tag.good{background:rgba(61,220,151,.12);color:var(--good)}
  .keybox{border:1px solid var(--line);border-radius:12px;background:#0b0d11;padding:16px}
  .keybox .k{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);margin-bottom:8px}
  .keyval{font-size:12.5px;word-break:break-all;color:#dfe3ee;background:#0f1116;border:1px solid var(--line);border-radius:8px;padding:10px;user-select:all}
  pre{background:#0b0d11;border:1px solid var(--line);border-radius:10px;padding:14px 16px;
    font-size:12px;line-height:1.8;color:#c9cede;white-space:pre;overflow-x:auto;margin:0}
  pre::-webkit-scrollbar{height:8px}
  pre::-webkit-scrollbar-thumb{background:#2b3040;border-radius:4px}
  pre .cm{color:#6d7488}
  code{font-family:ui-monospace,SFMono-Regular,"SF Mono",Menlo,monospace}
  .empty{border:1px dashed var(--line);border-radius:12px;padding:22px 18px;color:var(--dim);
    font-size:13px;background:#0b0d11}
  .empty b{color:var(--ink);font-weight:600}
  .pilltag{display:inline-block;font-size:11px;letter-spacing:.04em;border-radius:6px;padding:3px 8px;
    background:rgba(255,255,255,.05);color:var(--dim);border:1px solid var(--line)}
  .copy{float:right;font-size:11px;color:var(--dim);border:1px solid var(--line);border-radius:6px;
    padding:2px 8px;cursor:pointer;background:#12151c}
  .copy:hover{color:var(--ink);border-color:#39404f}
  .note{font-style:italic}
  .dim{color:var(--dim)}
  footer{margin-top:52px;color:var(--dim);font-size:12px;border-top:1px solid var(--line);padding-top:18px}
  a{color:var(--accent);text-decoration:none}
  a:hover{text-decoration:underline}
  .eject{display:inline-block;margin-top:10px;font-size:12px;color:var(--bad)}
</style></head>
<body><div class="wrap">

<header>
  <span class="dot"></span>
  <span class="brand">Blast Radius</span>
  <span class="chip">${armed ? "qorechain-diana" : "not armed yet"}</span>
  <span class="chip">${frozen ? "vault frozen" : active ? "policy active" : "no policy"}</span>
</header>

<h1>A stolen key is only worth<br>what the policy admits.</h1>
<p class="lede">This page holds an operator key that an AI agent uses to pay invoices.
The key below is public on purpose. Try to drain it. Everything you get is
everything a quantum attacker would get after recovering that key.</p>

<div class="hero">
  <div class="label">Spendable by whoever holds the key, right now</div>
  <div class="num">${renderNumber(spendable)}<small>QOR</small></div>
  <div class="sub">${live ? `policy expires in ${hours}h ${mins}m · ${refusals.length} attempts recorded on chain` : "waiting for a funded, armed deployment"}</div>
</div>

<div class="grid">
  <div class="card"><div class="k">Per-transaction cap</div><div class="v">${renderNumber(perTxCap)} QOR</div></div>
  <div class="card"><div class="k">Daily budget left</div><div class="v">${renderNumber(dailyRemaining)} QOR</div></div>
  <div class="card"><div class="k">EVM window</div><div class="v small">${window && window.live ? `${window.remainingTxs} txs · ${window.remainingBlocks} blocks` : `<span class="pilltag">closed</span>`}</div></div>
  <div class="card"><div class="k">Paid out legitimately</div><div class="v">${fmtQor(totalPaid)} QOR</div></div>
</div>

<h2>The key</h2>
<div class="keybox">
  <div class="k">Agent private key — take it, it is real <span class="copy" onclick="cp('pk',this)">copy</span></div>
  <div class="keyval mono" id="pk">${agentKey || "not generated"}</div>
  <div class="keyval" style="margin-top:8px;color:var(--dim);font-size:12px">
    <span class="mono" style="color:#dfe3ee">${agentEvm || "—"}</span>
    <span class="note">${vault ? "· vault " + vault : "· vault deploys when this account is funded"}</span></div>
</div>

<h2>Try it yourself <span class="copy" style="float:none;margin-left:8px" onclick="cp('cmds',this)">copy commands</span></h2>
${codeBlock({ vault, agentEvm, agentKey })}
<p class="dim" style="font-size:13px;margin-top:14px">The second call is signed with the key above and still cannot move a wei to an
address that is not on the allowlist. The refusal is written to the log below instead of reverting.</p>

<h2>Refused attempts</h2>
${
  refusalRows
    ? `<table><thead><tr><th>time</th><th>target</th><th>amount</th><th>verdict</th></tr></thead><tbody>${refusalRows}</tbody></table>`
    : `<div class="empty">No attempts yet. <b>Be the first</b> — send one wei anywhere and watch it land here.</div>`
}

<h2>Released payments</h2>
${
  paidRows
    ? `<table><thead><tr><th>time</th><th>vendor</th><th>amount</th><th>verdict</th></tr></thead><tbody>${paidRows}</tbody></table>`
    : `<div class="empty">Empty. The same key, used for the thing it was authorised to do, lands here.</div>`
}

<footer>
  Blast Radius · bounded authority for agent keys on QoreChain ·
  <a href="https://github.com/harishkotra/blast-radius">source</a> ·
  key status checked with <code>possessionProven</code>, policy signed with ML-DSA-87
</footer>
</div>
<script>
function cp(id, el){
  const t = document.getElementById(id).innerText;
  navigator.clipboard.writeText(t).then(()=>{el.textContent='copied'; setTimeout(()=>el.textContent=id==='pk'?'copy':'copy commands',1600)});
}
</script>
</body></html>`;
}


function renderNumber(wei) {
  if (wei === undefined || wei === null) return "0.00";
  return fmtQor(wei);
}

module.exports = { page, fmtQor };
