// ABI for the Multicall contract deployed on LitVM LiteForge.
export const multicallAbi = [
  {
    inputs: [
      {
        components: [
          { name: "target", type: "address" },
          { name: "callData", type: "bytes" },
        ],
        name: "calls",
        type: "tuple[]",
      },
    ],
    name: "aggregate",
    outputs: [
      { name: "blockNumber", type: "uint256" },
      { name: "returnData", type: "bytes[]" },
    ],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      {
        components: [
          { name: "target", type: "address" },
          { name: "allowFailure", type: "bool" },
          { name: "callData", type: "bytes" },
        ],
        name: "calls",
        type: "tuple[]",
      },
    ],
    name: "aggregate3",
    outputs: [
      {
        components: [
          { name: "success", type: "bool" },
          { name: "returnData", type: "bytes" },
        ],
        name: "returnData",
        type: "tuple[]",
      },
    ],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      {
        components: [
          { name: "target", type: "address" },
          { name: "allowFailure", type: "bool" },
          { name: "value", type: "uint256" },
          { name: "callData", type: "bytes" },
        ],
        name: "calls",
        type: "tuple[]",
      },
    ],
    name: "aggregate3Value",
    outputs: [
      {
        components: [
          { name: "success", type: "bool" },
          { name: "returnData", type: "bytes" },
        ],
        name: "returnData",
        type: "tuple[]",
      },
    ],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      {
        components: [
          { name: "target", type: "address" },
          { name: "callData", type: "bytes" },
        ],
        name: "calls",
        type: "tuple[]",
      },
    ],
    name: "blockAndAggregate",
    outputs: [
      { name: "blockNumber", type: "uint256" },
      { name: "blockHash", type: "bytes32" },
      {
        components: [
          { name: "success", type: "bool" },
          { name: "returnData", type: "bytes" },
        ],
        name: "returnData",
        type: "tuple[]",
      },
    ],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      {
        components: [
          { name: "target", type: "address" },
          { name: "allowFailure", type: "bool" },
          { name: "callData", type: "bytes" },
        ],
        name: "calls",
        type: "tuple[]",
      },
    ],
    name: "tryAggregate",
    outputs: [
      {
        components: [
          { name: "success", type: "bool" },
          { name: "returnData", type: "bytes" },
        ],
        name: "returnData",
        type: "tuple[]",
      },
    ],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { name: "requireSuccess", type: "bool" },
      {
        components: [
          { name: "target", type: "address" },
          { name: "callData", type: "bytes" },
        ],
        name: "calls",
        type: "tuple[]",
      },
    ],
    name: "tryBlockAndAggregate",
    outputs: [
      { name: "blockNumber", type: "uint256" },
      { name: "blockHash", type: "bytes32" },
      {
        components: [
          { name: "success", type: "bool" },
          { name: "returnData", type: "bytes" },
        ],
        name: "returnData",
        type: "tuple[]",
      },
    ],
    stateMutability: "payable",
    type: "function",
  },
  { inputs: [], name: "getBasefee", outputs: [{ name: "basefee", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [{ name: "blockNumber", type: "uint256" }], name: "getBlockHash", outputs: [{ name: "blockHash", type: "bytes32" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "getBlockNumber", outputs: [{ name: "blockNumber", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "getChainId", outputs: [{ name: "chainid", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "getCurrentBlockCoinbase", outputs: [{ name: "coinbase", type: "address" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "getCurrentBlockDifficulty", outputs: [{ name: "difficulty", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "getCurrentBlockGasLimit", outputs: [{ name: "gaslimit", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "getCurrentBlockTimestamp", outputs: [{ name: "timestamp", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [{ name: "addr", type: "address" }], name: "getEthBalance", outputs: [{ name: "balance", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "getLastBlockHash", outputs: [{ name: "blockHash", type: "bytes32" }], stateMutability: "view", type: "function" },
] as const;
