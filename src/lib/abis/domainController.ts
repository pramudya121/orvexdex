export const domainControllerAbi = [
  { inputs: [{ name: "commitment", type: "bytes32" }, { name: "name", type: "string" }], name: "commit", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [
    { name: "name", type: "string" },
    { name: "registrant", type: "address" },
    { name: "duration", type: "uint256" },
    { name: "secret", type: "bytes32" },
  ], name: "register", outputs: [], stateMutability: "payable", type: "function" },
  { inputs: [{ name: "name", type: "string" }, { name: "duration", type: "uint256" }], name: "renew", outputs: [], stateMutability: "payable", type: "function" },
  { inputs: [{ name: "to", type: "address" }], name: "withdraw", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "newOwner", type: "address" }], name: "transferOwnership", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [], name: "collectedFees", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "COMMIT_REVEAL_DELAY", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "COMMIT_REVEAL_EXPIRY", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "GRACE_PERIOD", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "MIN_REGISTRATION_DURATION", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "owner", outputs: [{ type: "address" }], stateMutability: "view", type: "function" },
  { inputs: [{ name: "", type: "bytes32" }], name: "commitments", outputs: [
    { name: "timestamp", type: "uint256" },
    { name: "nameHash", type: "bytes32" },
    { name: "committer", type: "address" },
  ], stateMutability: "view", type: "function" },
  { inputs: [{ name: "name", type: "string" }], name: "domainInfo", outputs: [
    { type: "address" }, { type: "uint256" }, { type: "bool" },
  ], stateMutability: "view", type: "function" },
  { inputs: [{ name: "", type: "string" }], name: "domains", outputs: [
    { name: "owner", type: "address" },
    { name: "expires", type: "uint256" },
  ], stateMutability: "view", type: "function" },
  { inputs: [{ name: "name", type: "string" }], name: "isAvailable", outputs: [{ type: "bool" }], stateMutability: "view", type: "function" },
  { inputs: [
    { name: "name", type: "string" },
    { name: "registrant", type: "address" },
    { name: "secret", type: "bytes32" },
  ], name: "makeCommitment", outputs: [{ type: "bytes32" }], stateMutability: "pure", type: "function" },
  { inputs: [{ name: "name", type: "string" }, { name: "duration", type: "uint256" }], name: "price", outputs: [{ type: "uint256" }], stateMutability: "pure", type: "function" },
  { anonymous: false, inputs: [
    { indexed: true, name: "name", type: "string" },
    { indexed: true, name: "owner", type: "address" },
    { indexed: false, name: "expires", type: "uint256" },
    { indexed: false, name: "price", type: "uint256" },
  ], name: "DomainRegistered", type: "event" },
  { anonymous: false, inputs: [
    { indexed: true, name: "name", type: "string" },
    { indexed: false, name: "newExpiry", type: "uint256" },
    { indexed: false, name: "price", type: "uint256" },
  ], name: "DomainRenewed", type: "event" },
] as const;
