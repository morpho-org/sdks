/** @internal Test-only `BluePublicAllocatorWriteFixture` contract ABI. */
export const abi = [
  {
    inputs: [
      {
        internalType: "address",
        name: "vault",
        type: "address",
      },
      {
        internalType: "bytes32",
        name: "id",
        type: "bytes32",
      },
    ],
    name: "absoluteCap",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "vault",
        type: "address",
      },
      {
        internalType: "address",
        name: "adapter",
        type: "address",
      },
      {
        components: [
          {
            internalType: "address",
            name: "loanToken",
            type: "address",
          },
          {
            internalType: "address",
            name: "collateralToken",
            type: "address",
          },
          {
            internalType: "address",
            name: "oracle",
            type: "address",
          },
          {
            internalType: "address",
            name: "irm",
            type: "address",
          },
          {
            internalType: "uint256",
            name: "lltv",
            type: "uint256",
          },
        ],
        internalType: "struct MarketParams",
        name: "marketParams",
        type: "tuple",
      },
      {
        internalType: "uint128",
        name: "assets",
        type: "uint128",
      },
      {
        internalType: "uint64",
        name: "penalty",
        type: "uint64",
      },
    ],
    name: "allocateFromIdle",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "vault",
        type: "address",
      },
      {
        internalType: "bytes32",
        name: "id",
        type: "bytes32",
      },
    ],
    name: "canPullFromMarket",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "vault",
        type: "address",
      },
      {
        internalType: "address",
        name: "adapter",
        type: "address",
      },
    ],
    name: "isActiveAdapter",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "vault",
        type: "address",
      },
      {
        internalType: "address",
        name: "deallocateAdapter",
        type: "address",
      },
      {
        components: [
          {
            internalType: "address",
            name: "loanToken",
            type: "address",
          },
          {
            internalType: "address",
            name: "collateralToken",
            type: "address",
          },
          {
            internalType: "address",
            name: "oracle",
            type: "address",
          },
          {
            internalType: "address",
            name: "irm",
            type: "address",
          },
          {
            internalType: "uint256",
            name: "lltv",
            type: "uint256",
          },
        ],
        internalType: "struct MarketParams",
        name: "deallocateMarketParams",
        type: "tuple",
      },
      {
        internalType: "address",
        name: "allocateAdapter",
        type: "address",
      },
      {
        components: [
          {
            internalType: "address",
            name: "loanToken",
            type: "address",
          },
          {
            internalType: "address",
            name: "collateralToken",
            type: "address",
          },
          {
            internalType: "address",
            name: "oracle",
            type: "address",
          },
          {
            internalType: "address",
            name: "irm",
            type: "address",
          },
          {
            internalType: "uint256",
            name: "lltv",
            type: "uint256",
          },
        ],
        internalType: "struct MarketParams",
        name: "allocateMarketParams",
        type: "tuple",
      },
      {
        internalType: "uint128",
        name: "assets",
        type: "uint128",
      },
      {
        internalType: "uint64",
        name: "penalty",
        type: "uint64",
      },
    ],
    name: "reallocate",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "vault",
        type: "address",
      },
      {
        internalType: "address",
        name: "adapter",
        type: "address",
      },
      {
        components: [
          {
            internalType: "address",
            name: "loanToken",
            type: "address",
          },
          {
            internalType: "address",
            name: "collateralToken",
            type: "address",
          },
          {
            internalType: "address",
            name: "oracle",
            type: "address",
          },
          {
            internalType: "address",
            name: "irm",
            type: "address",
          },
          {
            internalType: "uint256",
            name: "lltv",
            type: "uint256",
          },
        ],
        internalType: "struct MarketParams",
        name: "marketParams",
        type: "tuple",
      },
      {
        internalType: "uint256",
        name: "value",
        type: "uint256",
      },
    ],
    name: "setAbsoluteCap",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "vault",
        type: "address",
      },
      {
        internalType: "bool",
        name: "value",
        type: "bool",
      },
    ],
    name: "setCanPullFromIdle",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "vault",
        type: "address",
      },
      {
        internalType: "address",
        name: "adapter",
        type: "address",
      },
      {
        components: [
          {
            internalType: "address",
            name: "loanToken",
            type: "address",
          },
          {
            internalType: "address",
            name: "collateralToken",
            type: "address",
          },
          {
            internalType: "address",
            name: "oracle",
            type: "address",
          },
          {
            internalType: "address",
            name: "irm",
            type: "address",
          },
          {
            internalType: "uint256",
            name: "lltv",
            type: "uint256",
          },
        ],
        internalType: "struct MarketParams",
        name: "marketParams",
        type: "tuple",
      },
      {
        internalType: "bool",
        name: "value",
        type: "bool",
      },
    ],
    name: "setCanPullFromMarket",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "vault",
        type: "address",
      },
      {
        internalType: "address",
        name: "adapter",
        type: "address",
      },
      {
        internalType: "bool",
        name: "value",
        type: "bool",
      },
    ],
    name: "setIsActiveAdapter",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "vault",
        type: "address",
      },
      {
        internalType: "uint64",
        name: "value",
        type: "uint64",
      },
    ],
    name: "setPenalty",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "vault",
        type: "address",
      },
    ],
    name: "vaultData",
    outputs: [
      {
        internalType: "bool",
        name: "canPullFromIdle",
        type: "bool",
      },
      {
        internalType: "uint64",
        name: "penalty",
        type: "uint64",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

/** @internal Test-only `BluePublicAllocatorWriteFixture` contract bytecode. */
export const code =
  "0x6080806040523460155761104e908161001a8239f35b5f80fdfe6080806040526004361015610012575f80fd5b5f905f3560e01c90816308f804d814610b4a575080635e0deb5414610a9e57806366faa83914610a4757806369f1e26b146109fe57806377b0aab1146109165780638aeed1d1146108565780638fdaa1a7146104d85780639a8a6795146104465780639a8b594414610391578063d72ff79a146103415763df31d68814610097575f80fd5b3461033e5761012036600319011261033e576100b1610b88565b6100b9610b9e565b9060a03660431901126102ac5760e4356001600160801b0381169182820361033c576101043567ffffffffffffffff8116809103610338576001600160a01b038216808752600360205260408720549094906101239060081c67ffffffffffffffff168314610c51565b604435926001600160a01b038416840361033457610142933390610ec6565b81845260026020526040842060018060a01b0384165f5260205260ff60405f205416156102fc57818452600360205260ff604085205416156102bf57839061018984610e3e565b9383835282602052604083208584526020526101aa60408420541515610c91565b6040516101b960208201610cd1565b60a081526101c860c082610bc8565b843b156102bb5783916101ef6040519485938493635c9ce04d60e01b855260048501610dae565b038183875af180156102b057610297575b505060405163c69507dd60e01b81526004810183905291602083602481855afa91821561028c578492610252575b61024f93508452836020526040842090845260205260408320541015610dfa565b80f35b91506020833d602011610284575b8161026d60209383610bc8565b810103126102805761024f92519161022e565b5f80fd5b3d9150610260565b6040513d86823e3d90fd5b816102a191610bc8565b6102ac57825f610200565b8280fd5b6040513d84823e3d90fd5b8380fd5b60405162461bcd60e51b815260206004820152601560248201527463616e6e6f742070756c6c2066726f6d2069646c6560581b6044820152606490fd5b60405162461bcd60e51b815260206004820152601060248201526f34b730b1ba34bb329030b230b83a32b960811b6044820152606490fd5b8780fd5b8580fd5b845b80fd5b503461033e57602036600319011261033e5760409081906001600160a01b03610368610b88565b1681526003602052205467ffffffffffffffff82519160ff81161515835260081c166020820152f35b503461033e57604036600319011261033e576103ab610b88565b6024359081151582036102ac576040516326f6f90760e11b815233600482015291906001600160a01b0316602083602481845afa92831561028c5761024f936103fb918691610417575b50610c16565b83526003602052604083209060ff801983541691151516179055565b610439915060203d60201161043f575b6104318183610bc8565b810190610bfe565b5f6103f5565b503d610427565b503461033e5761010036600319011261033e57610461610b88565b610469610b9e565b9060a03660431901126102ac576040516326f6f90760e11b81523360048201526001600160a01b039190911690602081602481855afa801561028c576104b59185916104175750610c16565b8252816020526104c86040832091610e3e565b825260205260e435604082205580f35b5034610280576101e0366003190112610280576104f3610b88565b6104fb610b9e565b9060a03660431901126102805760e4356001600160a01b038116908181036102805760a036610103190112610280576101a435916001600160801b038316808403610280576101c4359167ffffffffffffffff83168093036102805760018060a01b03861695865f5260036020526105858467ffffffffffffffff60405f205460081c1614610c51565b61010435936001600160a01b03851693848603610280576105a7923387610ec6565b855f52600260205260405f2060018060a01b0388165f5260205260ff60405f2054161561081157855f52600260205260405f20815f5260205260ff60405f205416156107cc576105f687610e3e565b865f52600160205260405f20905f5260205260ff60405f2054161561078757604051602081019160e08352601161010083015270746869732f6d61726b6574506172616d7360781b610120830152604082015261065860608201610104610d40565b610120815261066961014082610bc8565b51902095855f525f60205260405f20875f5260205261068d60405f20541515610c91565b6040519061069d60208301610cd1565b60a082526106ac60c083610bc8565b863b1561028057604051632590ce8b60e11b8152915f91839182916106d6918a9160048501610dae565b0381838a5af1801561077c57610761575b5060405160208101919091528693929150610124356001600160a01b0381169081900361033c576040820152610144356001600160a01b0381169081900361033c576060820152610164356001600160a01b0381169081900361033c5760808201526101843560a082015260a081526101c860c082610bc8565b6107719194939297505f90610bc8565b5f959091925f6106e7565b6040513d5f823e3d90fd5b60405162461bcd60e51b815260206004820152601760248201527f63616e6e6f742070756c6c2066726f6d206d61726b65740000000000000000006044820152606490fd5b60405162461bcd60e51b815260206004820152601760248201527f696e6163746976652074617267657420616461707465720000000000000000006044820152606490fd5b60405162461bcd60e51b815260206004820152601760248201527f696e61637469766520736f7572636520616461707465720000000000000000006044820152606490fd5b346102805760603660031901126102805761086f610b88565b610877610b9e565b90604435908115158203610280576040516326f6f90760e11b815233600482015292906001600160a01b0316602084602481845afa93841561077c576108f5946108c7915f916108f75750610c16565b5f52600260205260405f209060018060a01b03165f5260205260405f209060ff801983541691151516179055565b005b610910915060203d60201161043f576104318183610bc8565b866103f5565b346102805760403660031901126102805761092f610b88565b6024359067ffffffffffffffff821690818303610280576040516326f6f90760e11b81523360048201526001600160a01b039190911691602082602481865afa91821561077c57670de0b6b3a764000092610990915f916108f75750610c16565b116109c6575f52600360205260405f209068ffffffffffffffff0082549160081b169068ffffffffffffffff0019161790555f80f35b60405162461bcd60e51b815260206004820152601060248201526f0e0cadcc2d8e8f240e8dede40d0d2ced60831b6044820152606490fd5b34610280576040366003190112610280576001600160a01b03610a1f610b88565b165f52600160205260405f206024355f52602052602060ff60405f2054166040519015158152f35b3461028057604036600319011261028057610a60610b88565b610a68610b9e565b9060018060a01b03165f52600260205260405f209060018060a01b03165f52602052602060ff60405f2054166040519015158152f35b346102805761010036600319011261028057610ab8610b88565b610ac0610b9e565b9060a03660431901126102805760e435908115158203610280576040516326f6f90760e11b815233600482015292906001600160a01b0316602084602481845afa93841561077c576108f594610b1c915f916108f75750610c16565b5f526001602052610b3060405f2091610e3e565b5f5260205260405f209060ff801983541691151516179055565b34610280576040366003190112610280576020906001600160a01b03610b6e610b88565b165f525f825260405f206024355f52825260405f20548152f35b600435906001600160a01b038216820361028057565b602435906001600160a01b038216820361028057565b35906001600160a01b038216820361028057565b90601f8019910116810190811067ffffffffffffffff821117610bea57604052565b634e487b7160e01b5f52604160045260245ffd5b90816020910312610280575180151581036102805790565b15610c1d57565b60405162461bcd60e51b815260206004820152600c60248201526b1d5b985d5d1a1bdc9a5e995960a21b6044820152606490fd5b15610c5857565b60405162461bcd60e51b8152602060048201526011602482015270696e636f72726563742070656e616c747960781b6044820152606490fd5b15610c9857565b60405162461bcd60e51b815260206004820152601160248201527007a65726f206162736f6c7574652063617607c1b6044820152606490fd5b6044356001600160a01b038116908190036102805781526064356001600160a01b038116908190036102805760208201526084356001600160a01b0381169081900361028057604082015260a4356001600160a01b03811690819003610280576060820152608060c435910152565b60809081906001600160a01b03610d5682610bb4565b1684526001600160a01b03610d6d60208301610bb4565b1660208501526001600160a01b03610d8760408301610bb4565b1660408501526001600160a01b03610da160608301610bb4565b1660608501520135910152565b91608060206001600160801b039260409497969760018060a01b031686526060828701528051918291826060890152018387015e5f828287010152601f80199101168401019416910152565b15610e0157565b60405162461bcd60e51b815260206004820152601560248201527418589cdbdb1d5d194818d85c08195e18d959591959605a1b6044820152606490fd5b604051602081019160e08352601161010083015270746869732f6d61726b6574506172616d7360781b61012083015260018060a01b03166040820152610e88606082016044610d40565b6101208152610e9961014082610bc8565b51902090565b81810292918115918404141715610eb257565b634e487b7160e01b5f52601160045260245ffd5b91929093610ed48183610e9f565b610fe85750505f925b8315610fe2576040516323b872dd60e01b602082019081526001600160a01b0392831660248301529190931660448401526064808401949094529282525f9283928390610f2b608482610bc8565b51925af13d15610fdb573d67ffffffffffffffff8111610bea5760405190610f5d601f8201601f191660200183610bc8565b81523d5f602083013e5b81610fac575b5015610f7557565b60405162461bcd60e51b815260206004820152600f60248201526e1d1c985b9cd9995c8819985a5b1959608a1b6044820152606490fd5b8051801592508215610fc1575b50505f610f6d565b610fd49250602080918301019101610bfe565b5f80610fb9565b6060610f67565b50505050565b610ff191610e9f565b5f198101908111610eb257670de0b6b3a7640000900460018101809111610eb25792610edd56fea264697066735822122070f851fe2a72e5c001f93dd70c5380fb09d85e34c5bf026e9cbd8e46d85451e864736f6c63430008240033";
