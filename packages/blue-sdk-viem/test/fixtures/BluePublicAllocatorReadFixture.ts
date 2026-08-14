/** @internal Deployless `BluePublicAllocatorReadFixture` query ABI. */
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
        internalType: "bytes32",
        name: "id",
        type: "bytes32",
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
        internalType: "bytes32",
        name: "id",
        type: "bytes32",
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
    name: "setVaultData",
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

/** @internal Deployless `BluePublicAllocatorReadFixture` query bytecode. */
export const code =
  "0x608080604052346015576103d8908161001a8239f35b5f80fdfe6080806040526004361015610012575f80fd5b5f3560e01c90816308f804d81461032957508063391a1d16146102e95780634d29c2d81461029457806366faa8391461023d57806369f1e26b146101f45780638aeed1d11461018f578063d72ff79a146101415763e156c1a814610074575f80fd5b3461013d57606036600319011261013d5761008d610367565b6024359081151580920361013d576044359067ffffffffffffffff821680920361013d57604051926040840184811067ffffffffffffffff8211176101295760405283526020830191825260018060a01b03165f52600360205261010460405f2092511515839060ff801983541691151516179055565b51815468ffffffffffffffff00191660089190911b68ffffffffffffffff0016179055005b634e487b7160e01b5f52604160045260245ffd5b5f80fd5b3461013d57602036600319011261013d576001600160a01b03610162610367565b165f5260036020526040805f205467ffffffffffffffff82519160ff81161515835260081c166020820152f35b3461013d57606036600319011261013d576101f26101ab610367565b6101b361037d565b6101bb610393565b9160018060a01b03165f52600260205260405f209060018060a01b03165f5260205260405f209060ff801983541691151516179055565b005b3461013d57604036600319011261013d576001600160a01b03610215610367565b165f52600160205260405f206024355f52602052602060ff60405f2054166040519015158152f35b3461013d57604036600319011261013d57610256610367565b61025e61037d565b9060018060a01b03165f52600260205260405f209060018060a01b03165f52602052602060ff60405f2054166040519015158152f35b3461013d57606036600319011261013d576101f26102b0610367565b6102b8610393565b9060018060a01b03165f52600160205260405f206024355f5260205260405f209060ff801983541691151516179055565b3461013d57606036600319011261013d576001600160a01b0361030a610367565b165f525f60205260405f206024355f5260205260443560405f20555f80f35b3461013d57604036600319011261013d576020906001600160a01b0361034d610367565b165f525f825260405f206024355f52825260405f20548152f35b600435906001600160a01b038216820361013d57565b602435906001600160a01b038216820361013d57565b60443590811515820361013d5756fea26469706673582212207e4c910413ca026005bc13c4f22d88556290c586ac09157584e6975b6ac52f5464736f6c63430008240033";
