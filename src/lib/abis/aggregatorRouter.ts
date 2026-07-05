// ABI for AggregatorRouter (see contracts/AggregatorRouter.sol).
// Deploy the contract, then set ADDR.aggregator to the deployed address.
export const aggregatorRouterAbi = [
  { inputs: [], name: "nextRouterId", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [{ name: "", type: "uint256" }], name: "dexRouters", outputs: [{ type: "address" }], stateMutability: "view", type: "function" },
  { inputs: [{ name: "", type: "uint256" }], name: "dexNames", outputs: [{ type: "string" }], stateMutability: "view", type: "function" },
  { inputs: [{ name: "router", type: "address" }, { name: "name", type: "string" }], name: "addRouter", outputs: [{ type: "uint256" }], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "id", type: "uint256" }, { name: "router", type: "address" }], name: "updateRouter", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "id", type: "uint256" }], name: "removeRouter", outputs: [], stateMutability: "nonpayable", type: "function" },
  {
    inputs: [
      { name: "routerId", type: "uint256" },
      { name: "amountIn", type: "uint256" },
      { name: "amountOutMin", type: "uint256" },
      { name: "path", type: "address[]" },
      { name: "to", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    name: "executeSwapWithRouter",
    outputs: [{ name: "amounts", type: "uint256[]" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;
