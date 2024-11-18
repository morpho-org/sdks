export const abi = [
  {
    inputs: [
      {
        components: [
          { internalType: "address", name: "token", type: "address" },
          { internalType: "uint256", name: "amount", type: "uint256" },
        ],
        internalType: "struct TokenAmount",
        name: "input",
        type: "tuple",
      },
      {
        components: [
          { internalType: "address", name: "token", type: "address" },
          { internalType: "uint256", name: "amount", type: "uint256" },
        ],
        internalType: "struct TokenAmount",
        name: "output",
        type: "tuple",
      },
    ],
    name: "swap",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

export const bytecode =
  "0x60808060405234601557610197908161001a8239f35b5f80fdfe6080806040526004361015610012575f80fd5b5f3560e01c63432c1a8f14610025575f80fd5b34610121573660031901608081126101215760401361012157604036604319011261012157600435906001600160a01b03821682036101215760645f918284602095506323b872dd60e01b835233600484015230602484015260243560448401525af13d15601f3d1160015f511416171615610125576044356001600160a01b03811681036101215760405163a9059cbb60e01b815233600482015260643560248201526020915f9160449183905af13d15601f3d1160015f5114161716156100ea57005b60405162461bcd60e51b815260206004820152600f60248201526e1514905394d1915497d19052531151608a1b6044820152606490fd5b5f80fd5b60405162461bcd60e51b81526020600482015260146024820152731514905394d1915497d19493d357d1905253115160621b6044820152606490fdfea2646970667358221220d540fd4d1eb630bbf1be4847ebc37159e01387d164f9f9dd157e25ff60e49ec264736f6c634300081b0033";