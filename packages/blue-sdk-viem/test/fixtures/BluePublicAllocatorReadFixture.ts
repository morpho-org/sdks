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
    name: "canDeallocate",
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
    name: "setCanDeallocate",
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
        name: "canAllocateFromIdle",
        type: "bool",
      },
      {
        internalType: "uint120",
        name: "nativePenalty",
        type: "uint120",
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
        name: "canAllocateFromIdle",
        type: "bool",
      },
      {
        internalType: "uint120",
        name: "nativePenalty",
        type: "uint120",
      },
      {
        internalType: "uint120",
        name: "accruedNativePenalty",
        type: "uint120",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

/** @internal Deployless `BluePublicAllocatorReadFixture` query bytecode. */
export const code =
  "0x60808060405234601557610410908161001a8239f35b5f80fdfe6080806040526004361015610012575f80fd5b5f3560e01c908163065b6543146102af5750806308f804d81461026c578063391a1d161461022c5780634b12d3b2146101e357806366faa8391461018c5780638aeed1d114610129578063c4b956c3146100d25763d72ff79a14610074575f80fd5b346100ce5760203660031901126100ce576001600160a01b0361009561039f565b165f526003602052606060405f20546001600160781b036040519160ff811615158352818160081c16602084015260801c166040820152f35b5f80fd5b346100ce5760603660031901126100ce576101276100ee61039f565b6100f66103cb565b9060018060a01b03165f52600160205260405f206024355f5260205260405f209060ff801983541691151516179055565b005b346100ce5760603660031901126100ce5761012761014561039f565b61014d6103b5565b6101556103cb565b9160018060a01b03165f52600260205260405f209060018060a01b03165f5260205260405f209060ff801983541691151516179055565b346100ce5760403660031901126100ce576101a561039f565b6101ad6103b5565b9060018060a01b03165f52600260205260405f209060018060a01b03165f52602052602060ff60405f2054166040519015158152f35b346100ce5760403660031901126100ce576001600160a01b0361020461039f565b165f52600160205260405f206024355f52602052602060ff60405f2054166040519015158152f35b346100ce5760603660031901126100ce576001600160a01b0361024d61039f565b165f525f60205260405f206024355f5260205260443560405f20555f80f35b346100ce5760403660031901126100ce576001600160a01b0361028d61039f565b165f525f60205260405f206024355f52602052602060405f2054604051908152f35b346100ce5760603660031901126100ce576102c861039f565b6024358015158091036100ce57604435906001600160781b0382168092036100ce576060840184811067ffffffffffffffff82111761038b5760405283526020830190815260408301915f835260018060a01b03165f52600360205261034160405f2093511515849060ff801983541691151516179055565b5182549151610100600160f81b031990921660089190911b6fffffffffffffffffffffffffffffff00161760809190911b6effffffffffffffffffffffffffffff60801b16179055005b634e487b7160e01b5f52604160045260245ffd5b600435906001600160a01b03821682036100ce57565b602435906001600160a01b03821682036100ce57565b6044359081151582036100ce5756fea2646970667358221220dd8548f38071fa9b1f6ac957439322ff1f394071a4122a5efa4668a8d925d21564736f6c63430008240033";
