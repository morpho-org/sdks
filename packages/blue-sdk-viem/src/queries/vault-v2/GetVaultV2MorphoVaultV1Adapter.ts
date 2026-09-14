/** @internal Deployless `GetVaultV2MorphoVaultV1Adapter` query ABI. */
export const abi = [
  {
    inputs: [
      {
        internalType: "address",
        name: "factory",
        type: "address",
      },
      {
        internalType: "address",
        name: "adapter",
        type: "address",
      },
    ],
    name: "UnknownOfFactory",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "contract IMorphoVaultV1Adapter",
        name: "adapter",
        type: "address",
      },
      {
        internalType: "contract IMorphoVaultV1AdapterFactory",
        name: "factory",
        type: "address",
      },
    ],
    name: "query",
    outputs: [
      {
        components: [
          {
            internalType: "address",
            name: "morphoVaultV1",
            type: "address",
          },
          {
            internalType: "address",
            name: "parentVault",
            type: "address",
          },
          {
            internalType: "address",
            name: "skimRecipient",
            type: "address",
          },
          {
            internalType: "uint256",
            name: "parentAllocation",
            type: "uint256",
          },
        ],
        internalType: "struct VaultV2MorphoVaultV1AdapterResponse",
        name: "res",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

/** @internal Deployless `GetVaultV2MorphoVaultV1Adapter` query bytecode. */
export const code =
  "0x60808060405234601557610338908161001a8239f35b5f80fdfe6080806040526004361015610012575f80fd5b5f3560e01c63f6f030ce14610025575f80fd5b346101d95760403660031901126101d9576004356001600160a01b03811691908290036101d9576024356001600160a01b038116908190036101d9576080820182811067ffffffffffffffff8211176102ad576040525f8252602082015f815260408301905f825260608401925f8452604051632c77566560e01b8152866004820152602081602481855afa9081156101e5575f91610272575b501561025b575060405163e4baaddf60e01b8152602081600481895afa9081156101e5575f9161023c575b506001600160a01b031684526040516307f1b29b60e11b8152602081600481895afa9081156101e5575f9161021d575b506001600160a01b0316815260405163388af5b560e01b8152602081600481895afa9586156101e5576004966020925f916101f0575b506001600160a01b03168452604051634450bdef60e11b815296879182905afa80156101e5575f906101ae575b83526040805194516001600160a01b0390811686529151821660208601529151169083015251606082015260809150f35b506020853d6020116101dd575b816101c8602093836102c1565b810103126101d9576080945161017d565b5f80fd5b3d91506101bb565b6040513d5f823e3d90fd5b6102109150833d8511610216575b61020881836102c1565b8101906102e3565b5f610150565b503d6101fe565b610236915060203d6020116102165761020881836102c1565b5f61011a565b610255915060203d6020116102165761020881836102c1565b5f6100ea565b859063634ba39d60e11b5f5260045260245260445ffd5b90506020813d6020116102a5575b8161028d602093836102c1565b810103126101d9575180151581036101d9575f6100bf565b3d9150610280565b634e487b7160e01b5f52604160045260245ffd5b90601f8019910116810190811067ffffffffffffffff8211176102ad57604052565b908160209103126101d957516001600160a01b03811681036101d9579056fea26469706673582212201f92b30d33a4e8827eab07f5e954ae169ef98b2059f0e334c85d18dbe94d40ab64736f6c63430008240033";
