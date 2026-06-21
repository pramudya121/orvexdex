export const domainRegistryAbi = [
  { inputs: [{ name: "node", type: "bytes32" }, { name: "owner", type: "address" }], name: "setOwner", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "node", type: "bytes32" }, { name: "resolver", type: "address" }], name: "setResolver", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "parent", type: "bytes32" }, { name: "label", type: "bytes32" }, { name: "owner", type: "address" }], name: "setSubnodeOwner", outputs: [{ name: "subnode", type: "bytes32" }], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "node", type: "bytes32" }, { name: "ttl", type: "uint64" }], name: "setTTL", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "node", type: "bytes32" }], name: "owner", outputs: [{ type: "address" }], stateMutability: "view", type: "function" },
  { inputs: [{ name: "node", type: "bytes32" }], name: "resolver", outputs: [{ type: "address" }], stateMutability: "view", type: "function" },
  { inputs: [{ name: "node", type: "bytes32" }], name: "ttl", outputs: [{ type: "uint64" }], stateMutability: "view", type: "function" },
] as const;
