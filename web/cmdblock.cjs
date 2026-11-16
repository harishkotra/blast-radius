// The "try it yourself" command block, built line by line so a shell
// continuation is a real backslash followed by a newline — copy-safe.
const BS = String.fromCharCode(92);
const NL = String.fromCharCode(10);

function codeBlock({ vault, agentEvm, agentKey }) {
  const v = vault || "0xVAULT";
  const a = agentEvm || "0xAGENT";
  const k = agentKey || "0xKEY";
  const rows = [
    ["cm", "export RPC=https://evm-testnet.qore.host"],
    ["cm", "export V=" + v],
    ["cm", "export K=" + k],
    ["cm", ""],
    ["cm", "# what is a thief allowed to do right now?"],
    ["", "cast call $V " + BS],
    ["", '  "blastRadius(address)(uint256,uint256,uint256,uint64,bool,bool)" ' + BS],
    ["", "  " + a + " --rpc-url $RPC"],
    ["cm", ""],
    ["cm", "# take the key above and try to drain it"],
    ["", 'cast send $V "request(address,uint256,bytes32)" ' + BS],
    ["", "  0x000000000000000000000000000000000000dEaD " + BS],
    ["", "  1000000000000000000 " + BS],
    ["", "  0x1111111111111111111111111111111111111111111111111111111111111111 " + BS],
    ["", "  --private-key $K --rpc-url $RPC"],
  ];
  const body = rows
    .map(([cls, text]) => (cls === "cm" ? '<span class="cm">' + text + "</span>" : text))
    .join(NL);
  return '<pre id="cmds">' + body + "</pre>";
}

module.exports = { codeBlock };
