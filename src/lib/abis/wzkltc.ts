export const wzkltcAbi = [
  { constant: false, inputs: [{ name: "guy", type: "address" }, { name: "wad", type: "uint256" }], name: "approve", outputs: [{ name: "", type: "bool" }], stateMutability: "nonpayable", type: "function" },
  { constant: false, inputs: [], name: "deposit", outputs: [], stateMutability: "payable", type: "function" },
  { constant: false, inputs: [{ name: "dst", type: "address" }, { name: "wad", type: "uint256" }], name: "transfer", outputs: [{ name: "", type: "bool" }], stateMutability: "nonpayable", type: "function" },
  { constant: false, inputs: [{ name: "src", type: "address" }, { name: "dst", type: "address" }, { name: "wad", type: "uint256" }], name: "transferFrom", outputs: [{ name: "", type: "bool" }], stateMutability: "nonpayable", type: "function" },
  { constant: false, inputs: [{ name: "wad", type: "uint256" }], name: "withdraw", outputs: [], stateMutability: "nonpayable", type: "function" },
  { constant: true, inputs: [{ name: "", type: "address" }, { name: "", type: "address" }], name: "allowance", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { constant: true, inputs: [{ name: "", type: "address" }], name: "balanceOf", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { constant: true, inputs: [], name: "decimals", outputs: [{ name: "", type: "uint8" }], stateMutability: "view", type: "function" },
  { constant: true, inputs: [], name: "name", outputs: [{ name: "", type: "string" }], stateMutability: "view", type: "function" },
  { constant: true, inputs: [], name: "symbol", outputs: [{ name: "", type: "string" }], stateMutability: "view", type: "function" },
  { constant: true, inputs: [], name: "totalSupply", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
] as const;

export const erc20Abi = wzkltcAbi;
