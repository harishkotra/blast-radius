const ABI = [
  {
    type: "function",
    name: "blastRadius",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [
      { name: "spendableNow", type: "uint256" },
      { name: "perTxCap", type: "uint256" },
      { name: "dailyRemaining", type: "uint256" },
      { name: "expiry", type: "uint64" },
      { name: "isFrozen", type: "bool" },
      { name: "active", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "policyOf",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [
      { name: "perTxCap", type: "uint96" },
      { name: "dailyCap", type: "uint96" },
      { name: "expiry", type: "uint64" },
      { name: "maxCallsPerDay", type: "uint8" },
      { name: "active", type: "bool" },
      { name: "heartbeat", type: "uint32" },
      { name: "lastBeat", type: "uint64" },
      { name: "rotatedOut", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "authorityLeft",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "canSpend",
    stateMutability: "view",
    inputs: [
      { name: "agent", type: "address" },
      { name: "target", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [
      { name: "ok", type: "bool" },
      { name: "code", type: "uint8" },
    ],
  },
  {
    type: "function",
    name: "refusalCount",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "totalPaid",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "event",
    name: "Refused",
    inputs: [
      { name: "agent", type: "address", indexed: true },
      { name: "target", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "code", type: "uint8", indexed: false },
      { name: "invoiceId", type: "bytes32", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Rotated",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "digest", type: "bytes32", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Beat",
    inputs: [
      { name: "agent", type: "address", indexed: true },
      { name: "at", type: "uint64", indexed: false },
      { name: "digest", type: "bytes32", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Paid",
    inputs: [
      { name: "agent", type: "address", indexed: true },
      { name: "target", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "invoiceId", type: "bytes32", indexed: false },
    ],
  },
];

const REFUSAL_CODES = [
  "none",
  "no policy",
  "frozen",
  "expired",
  "target not allowlisted",
  "over per-tx cap",
  "over daily cap",
  "call budget exhausted",
  "no possession proof",
  "insufficient balance",
  "heartbeat lapsed",
  "key rotated out",
];

// Which layer did the refusing. First two are the chain's own authority state,
// the rest are the policy's scope and budget. Nobody else can show this split,
// because nobody else runs two independent layers.
const REFUSAL_LAYER = {
  1: "authority",
  2: "authority",
  3: "authority",
  10: "authority",
  11: "authority",
  4: "scope",
  8: "scope",
  5: "budget",
  6: "budget",
  7: "budget",
  9: "budget",
};

module.exports = { ABI, REFUSAL_CODES, REFUSAL_LAYER };
