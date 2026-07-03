/** @internal Deployless `GetAccrualVaultV2` query ABI. */
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
        name: "vault",
        type: "address",
      },
    ],
    name: "UnknownOfFactory",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "adapter",
        type: "address",
      },
    ],
    name: "UnsupportedVaultV2Adapter",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "contract IVaultV2",
        name: "vault",
        type: "address",
      },
      {
        internalType: "contract IVaultV2Factory",
        name: "vaultV2Factory",
        type: "address",
      },
      {
        internalType: "contract IMorphoVaultV1AdapterFactory",
        name: "morphoVaultV1AdapterFactory",
        type: "address",
      },
      {
        internalType: "contract IMorphoMarketV1AdapterFactory",
        name: "morphoMarketV1AdapterFactory",
        type: "address",
      },
      {
        internalType: "contract IMorphoMarketV1AdapterV2Factory",
        name: "morphoMarketV1AdapterV2Factory",
        type: "address",
      },
      {
        internalType: "contract IMorpho",
        name: "morpho",
        type: "address",
      },
      {
        internalType: "contract IAdaptiveCurveIrm",
        name: "adaptiveCurveIrm",
        type: "address",
      },
      {
        internalType: "contract IPublicAllocator",
        name: "publicAllocator",
        type: "address",
      },
    ],
    name: "query",
    outputs: [
      {
        components: [
          {
            components: [
              {
                internalType: "address",
                name: "asset",
                type: "address",
              },
              {
                internalType: "string",
                name: "symbol",
                type: "string",
              },
              {
                internalType: "string",
                name: "name",
                type: "string",
              },
              {
                internalType: "uint256",
                name: "decimals",
                type: "uint256",
              },
            ],
            internalType: "struct Token",
            name: "token",
            type: "tuple",
          },
          {
            internalType: "address",
            name: "asset",
            type: "address",
          },
          {
            internalType: "uint128",
            name: "_totalAssets",
            type: "uint128",
          },
          {
            internalType: "uint256",
            name: "totalSupply",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "virtualShares",
            type: "uint256",
          },
          {
            internalType: "uint64",
            name: "maxRate",
            type: "uint64",
          },
          {
            internalType: "uint64",
            name: "lastUpdate",
            type: "uint64",
          },
          {
            internalType: "address",
            name: "liquidityAdapter",
            type: "address",
          },
          {
            internalType: "bytes",
            name: "liquidityData",
            type: "bytes",
          },
          {
            internalType: "bool",
            name: "isLiquidityAdapterKnown",
            type: "bool",
          },
          {
            components: [
              {
                internalType: "bytes32",
                name: "id",
                type: "bytes32",
              },
              {
                internalType: "uint256",
                name: "absoluteCap",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "relativeCap",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "allocation",
                type: "uint256",
              },
            ],
            internalType: "struct VaultV2Allocation[]",
            name: "liquidityAllocations",
            type: "tuple[]",
          },
          {
            internalType: "uint96",
            name: "performanceFee",
            type: "uint96",
          },
          {
            internalType: "uint96",
            name: "managementFee",
            type: "uint96",
          },
          {
            internalType: "address",
            name: "performanceFeeRecipient",
            type: "address",
          },
          {
            internalType: "address",
            name: "managementFeeRecipient",
            type: "address",
          },
          {
            internalType: "uint256",
            name: "assetBalance",
            type: "uint256",
          },
          {
            internalType: "bool",
            name: "hasLiquidityAdapter",
            type: "bool",
          },
          {
            components: [
              {
                internalType: "address",
                name: "adapter",
                type: "address",
              },
              {
                internalType: "uint8",
                name: "adapterType",
                type: "uint8",
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
                name: "forceDeallocatePenalty",
                type: "uint256",
              },
              {
                internalType: "address",
                name: "morphoVaultV1",
                type: "address",
              },
              {
                components: [
                  {
                    components: [
                      {
                        internalType: "address",
                        name: "asset",
                        type: "address",
                      },
                      {
                        internalType: "string",
                        name: "symbol",
                        type: "string",
                      },
                      {
                        internalType: "string",
                        name: "name",
                        type: "string",
                      },
                      {
                        internalType: "uint256",
                        name: "decimals",
                        type: "uint256",
                      },
                      {
                        internalType: "uint256",
                        name: "decimalsOffset",
                        type: "uint256",
                      },
                      {
                        components: [
                          {
                            internalType: "bytes1",
                            name: "fields",
                            type: "bytes1",
                          },
                          {
                            internalType: "string",
                            name: "name",
                            type: "string",
                          },
                          {
                            internalType: "string",
                            name: "version",
                            type: "string",
                          },
                          {
                            internalType: "uint256",
                            name: "chainId",
                            type: "uint256",
                          },
                          {
                            internalType: "address",
                            name: "verifyingContract",
                            type: "address",
                          },
                          {
                            internalType: "bytes32",
                            name: "salt",
                            type: "bytes32",
                          },
                          {
                            internalType: "uint256[]",
                            name: "extensions",
                            type: "uint256[]",
                          },
                        ],
                        internalType: "struct Eip5267Domain",
                        name: "eip5267Domain",
                        type: "tuple",
                      },
                    ],
                    internalType: "struct VaultV1Config",
                    name: "config",
                    type: "tuple",
                  },
                  {
                    internalType: "address",
                    name: "owner",
                    type: "address",
                  },
                  {
                    internalType: "address",
                    name: "curator",
                    type: "address",
                  },
                  {
                    internalType: "address",
                    name: "guardian",
                    type: "address",
                  },
                  {
                    internalType: "uint256",
                    name: "timelock",
                    type: "uint256",
                  },
                  {
                    components: [
                      {
                        internalType: "uint192",
                        name: "value",
                        type: "uint192",
                      },
                      {
                        internalType: "uint64",
                        name: "validAt",
                        type: "uint64",
                      },
                    ],
                    internalType: "struct PendingUint192",
                    name: "pendingTimelock",
                    type: "tuple",
                  },
                  {
                    components: [
                      {
                        internalType: "address",
                        name: "value",
                        type: "address",
                      },
                      {
                        internalType: "uint64",
                        name: "validAt",
                        type: "uint64",
                      },
                    ],
                    internalType: "struct PendingAddress",
                    name: "pendingGuardian",
                    type: "tuple",
                  },
                  {
                    internalType: "address",
                    name: "pendingOwner",
                    type: "address",
                  },
                  {
                    internalType: "uint256",
                    name: "fee",
                    type: "uint256",
                  },
                  {
                    internalType: "address",
                    name: "feeRecipient",
                    type: "address",
                  },
                  {
                    internalType: "address",
                    name: "skimRecipient",
                    type: "address",
                  },
                  {
                    internalType: "uint256",
                    name: "totalSupply",
                    type: "uint256",
                  },
                  {
                    internalType: "uint256",
                    name: "lastTotalAssets",
                    type: "uint256",
                  },
                  {
                    internalType: "bool",
                    name: "hasLostAssets",
                    type: "bool",
                  },
                  {
                    internalType: "uint256",
                    name: "lostAssets",
                    type: "uint256",
                  },
                  {
                    internalType: "Id[]",
                    name: "supplyQueue",
                    type: "bytes32[]",
                  },
                  {
                    internalType: "Id[]",
                    name: "withdrawQueue",
                    type: "bytes32[]",
                  },
                  {
                    internalType: "bool",
                    name: "hasPublicAllocator",
                    type: "bool",
                  },
                  {
                    components: [
                      {
                        internalType: "address",
                        name: "admin",
                        type: "address",
                      },
                      {
                        internalType: "uint256",
                        name: "fee",
                        type: "uint256",
                      },
                      {
                        internalType: "uint256",
                        name: "accruedFee",
                        type: "uint256",
                      },
                    ],
                    internalType: "struct PublicAllocatorConfig",
                    name: "publicAllocatorConfig",
                    type: "tuple",
                  },
                ],
                internalType: "struct VaultV1Response",
                name: "vaultV1",
                type: "tuple",
              },
              {
                components: [
                  {
                    internalType: "uint256",
                    name: "cap",
                    type: "uint256",
                  },
                  {
                    internalType: "bool",
                    name: "enabled",
                    type: "bool",
                  },
                  {
                    internalType: "uint64",
                    name: "removableAt",
                    type: "uint64",
                  },
                  {
                    components: [
                      {
                        internalType: "uint192",
                        name: "value",
                        type: "uint192",
                      },
                      {
                        internalType: "uint64",
                        name: "validAt",
                        type: "uint64",
                      },
                    ],
                    internalType: "struct PendingUint192",
                    name: "pendingCap",
                    type: "tuple",
                  },
                  {
                    components: [
                      {
                        internalType: "uint256",
                        name: "supplyShares",
                        type: "uint256",
                      },
                      {
                        internalType: "uint128",
                        name: "borrowShares",
                        type: "uint128",
                      },
                      {
                        internalType: "uint128",
                        name: "collateral",
                        type: "uint128",
                      },
                    ],
                    internalType: "struct Position",
                    name: "position",
                    type: "tuple",
                  },
                  {
                    components: [
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
                        components: [
                          {
                            internalType: "uint128",
                            name: "totalSupplyAssets",
                            type: "uint128",
                          },
                          {
                            internalType: "uint128",
                            name: "totalSupplyShares",
                            type: "uint128",
                          },
                          {
                            internalType: "uint128",
                            name: "totalBorrowAssets",
                            type: "uint128",
                          },
                          {
                            internalType: "uint128",
                            name: "totalBorrowShares",
                            type: "uint128",
                          },
                          {
                            internalType: "uint128",
                            name: "lastUpdate",
                            type: "uint128",
                          },
                          {
                            internalType: "uint128",
                            name: "fee",
                            type: "uint128",
                          },
                        ],
                        internalType: "struct Market",
                        name: "market",
                        type: "tuple",
                      },
                      {
                        internalType: "bool",
                        name: "hasPrice",
                        type: "bool",
                      },
                      {
                        internalType: "uint256",
                        name: "price",
                        type: "uint256",
                      },
                      {
                        internalType: "uint256",
                        name: "rateAtTarget",
                        type: "uint256",
                      },
                    ],
                    internalType: "struct MarketResponse",
                    name: "market",
                    type: "tuple",
                  },
                  {
                    internalType: "uint128",
                    name: "flowCapMaxIn",
                    type: "uint128",
                  },
                  {
                    internalType: "uint128",
                    name: "flowCapMaxOut",
                    type: "uint128",
                  },
                ],
                internalType: "struct VaultV1MarketAllocation[]",
                name: "vaultV1Allocations",
                type: "tuple[]",
              },
              {
                internalType: "uint256",
                name: "vaultV1Shares",
                type: "uint256",
              },
              {
                components: [
                  {
                    components: [
                      {
                        internalType: "uint256",
                        name: "supplyShares",
                        type: "uint256",
                      },
                      {
                        internalType: "uint128",
                        name: "borrowShares",
                        type: "uint128",
                      },
                      {
                        internalType: "uint128",
                        name: "collateral",
                        type: "uint128",
                      },
                    ],
                    internalType: "struct Position",
                    name: "position",
                    type: "tuple",
                  },
                  {
                    components: [
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
                        components: [
                          {
                            internalType: "uint128",
                            name: "totalSupplyAssets",
                            type: "uint128",
                          },
                          {
                            internalType: "uint128",
                            name: "totalSupplyShares",
                            type: "uint128",
                          },
                          {
                            internalType: "uint128",
                            name: "totalBorrowAssets",
                            type: "uint128",
                          },
                          {
                            internalType: "uint128",
                            name: "totalBorrowShares",
                            type: "uint128",
                          },
                          {
                            internalType: "uint128",
                            name: "lastUpdate",
                            type: "uint128",
                          },
                          {
                            internalType: "uint128",
                            name: "fee",
                            type: "uint128",
                          },
                        ],
                        internalType: "struct Market",
                        name: "market",
                        type: "tuple",
                      },
                      {
                        internalType: "bool",
                        name: "hasPrice",
                        type: "bool",
                      },
                      {
                        internalType: "uint256",
                        name: "price",
                        type: "uint256",
                      },
                      {
                        internalType: "uint256",
                        name: "rateAtTarget",
                        type: "uint256",
                      },
                    ],
                    internalType: "struct MarketResponse",
                    name: "market",
                    type: "tuple",
                  },
                ],
                internalType: "struct MarketV1Position[]",
                name: "marketV1Positions",
                type: "tuple[]",
              },
              {
                internalType: "address",
                name: "adaptiveCurveIrm",
                type: "address",
              },
              {
                components: [
                  {
                    internalType: "bytes32",
                    name: "marketId",
                    type: "bytes32",
                  },
                  {
                    internalType: "uint256",
                    name: "supplyShares",
                    type: "uint256",
                  },
                  {
                    components: [
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
                        components: [
                          {
                            internalType: "uint128",
                            name: "totalSupplyAssets",
                            type: "uint128",
                          },
                          {
                            internalType: "uint128",
                            name: "totalSupplyShares",
                            type: "uint128",
                          },
                          {
                            internalType: "uint128",
                            name: "totalBorrowAssets",
                            type: "uint128",
                          },
                          {
                            internalType: "uint128",
                            name: "totalBorrowShares",
                            type: "uint128",
                          },
                          {
                            internalType: "uint128",
                            name: "lastUpdate",
                            type: "uint128",
                          },
                          {
                            internalType: "uint128",
                            name: "fee",
                            type: "uint128",
                          },
                        ],
                        internalType: "struct Market",
                        name: "market",
                        type: "tuple",
                      },
                      {
                        internalType: "bool",
                        name: "hasPrice",
                        type: "bool",
                      },
                      {
                        internalType: "uint256",
                        name: "price",
                        type: "uint256",
                      },
                      {
                        internalType: "uint256",
                        name: "rateAtTarget",
                        type: "uint256",
                      },
                    ],
                    internalType: "struct MarketResponse",
                    name: "market",
                    type: "tuple",
                  },
                ],
                internalType: "struct MarketV1V2Allocation[]",
                name: "marketV1V2Allocations",
                type: "tuple[]",
              },
            ],
            internalType: "struct AdapterResponse",
            name: "liquidityAdapterInfo",
            type: "tuple",
          },
          {
            components: [
              {
                internalType: "address",
                name: "adapter",
                type: "address",
              },
              {
                internalType: "uint8",
                name: "adapterType",
                type: "uint8",
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
                name: "forceDeallocatePenalty",
                type: "uint256",
              },
              {
                internalType: "address",
                name: "morphoVaultV1",
                type: "address",
              },
              {
                components: [
                  {
                    components: [
                      {
                        internalType: "address",
                        name: "asset",
                        type: "address",
                      },
                      {
                        internalType: "string",
                        name: "symbol",
                        type: "string",
                      },
                      {
                        internalType: "string",
                        name: "name",
                        type: "string",
                      },
                      {
                        internalType: "uint256",
                        name: "decimals",
                        type: "uint256",
                      },
                      {
                        internalType: "uint256",
                        name: "decimalsOffset",
                        type: "uint256",
                      },
                      {
                        components: [
                          {
                            internalType: "bytes1",
                            name: "fields",
                            type: "bytes1",
                          },
                          {
                            internalType: "string",
                            name: "name",
                            type: "string",
                          },
                          {
                            internalType: "string",
                            name: "version",
                            type: "string",
                          },
                          {
                            internalType: "uint256",
                            name: "chainId",
                            type: "uint256",
                          },
                          {
                            internalType: "address",
                            name: "verifyingContract",
                            type: "address",
                          },
                          {
                            internalType: "bytes32",
                            name: "salt",
                            type: "bytes32",
                          },
                          {
                            internalType: "uint256[]",
                            name: "extensions",
                            type: "uint256[]",
                          },
                        ],
                        internalType: "struct Eip5267Domain",
                        name: "eip5267Domain",
                        type: "tuple",
                      },
                    ],
                    internalType: "struct VaultV1Config",
                    name: "config",
                    type: "tuple",
                  },
                  {
                    internalType: "address",
                    name: "owner",
                    type: "address",
                  },
                  {
                    internalType: "address",
                    name: "curator",
                    type: "address",
                  },
                  {
                    internalType: "address",
                    name: "guardian",
                    type: "address",
                  },
                  {
                    internalType: "uint256",
                    name: "timelock",
                    type: "uint256",
                  },
                  {
                    components: [
                      {
                        internalType: "uint192",
                        name: "value",
                        type: "uint192",
                      },
                      {
                        internalType: "uint64",
                        name: "validAt",
                        type: "uint64",
                      },
                    ],
                    internalType: "struct PendingUint192",
                    name: "pendingTimelock",
                    type: "tuple",
                  },
                  {
                    components: [
                      {
                        internalType: "address",
                        name: "value",
                        type: "address",
                      },
                      {
                        internalType: "uint64",
                        name: "validAt",
                        type: "uint64",
                      },
                    ],
                    internalType: "struct PendingAddress",
                    name: "pendingGuardian",
                    type: "tuple",
                  },
                  {
                    internalType: "address",
                    name: "pendingOwner",
                    type: "address",
                  },
                  {
                    internalType: "uint256",
                    name: "fee",
                    type: "uint256",
                  },
                  {
                    internalType: "address",
                    name: "feeRecipient",
                    type: "address",
                  },
                  {
                    internalType: "address",
                    name: "skimRecipient",
                    type: "address",
                  },
                  {
                    internalType: "uint256",
                    name: "totalSupply",
                    type: "uint256",
                  },
                  {
                    internalType: "uint256",
                    name: "lastTotalAssets",
                    type: "uint256",
                  },
                  {
                    internalType: "bool",
                    name: "hasLostAssets",
                    type: "bool",
                  },
                  {
                    internalType: "uint256",
                    name: "lostAssets",
                    type: "uint256",
                  },
                  {
                    internalType: "Id[]",
                    name: "supplyQueue",
                    type: "bytes32[]",
                  },
                  {
                    internalType: "Id[]",
                    name: "withdrawQueue",
                    type: "bytes32[]",
                  },
                  {
                    internalType: "bool",
                    name: "hasPublicAllocator",
                    type: "bool",
                  },
                  {
                    components: [
                      {
                        internalType: "address",
                        name: "admin",
                        type: "address",
                      },
                      {
                        internalType: "uint256",
                        name: "fee",
                        type: "uint256",
                      },
                      {
                        internalType: "uint256",
                        name: "accruedFee",
                        type: "uint256",
                      },
                    ],
                    internalType: "struct PublicAllocatorConfig",
                    name: "publicAllocatorConfig",
                    type: "tuple",
                  },
                ],
                internalType: "struct VaultV1Response",
                name: "vaultV1",
                type: "tuple",
              },
              {
                components: [
                  {
                    internalType: "uint256",
                    name: "cap",
                    type: "uint256",
                  },
                  {
                    internalType: "bool",
                    name: "enabled",
                    type: "bool",
                  },
                  {
                    internalType: "uint64",
                    name: "removableAt",
                    type: "uint64",
                  },
                  {
                    components: [
                      {
                        internalType: "uint192",
                        name: "value",
                        type: "uint192",
                      },
                      {
                        internalType: "uint64",
                        name: "validAt",
                        type: "uint64",
                      },
                    ],
                    internalType: "struct PendingUint192",
                    name: "pendingCap",
                    type: "tuple",
                  },
                  {
                    components: [
                      {
                        internalType: "uint256",
                        name: "supplyShares",
                        type: "uint256",
                      },
                      {
                        internalType: "uint128",
                        name: "borrowShares",
                        type: "uint128",
                      },
                      {
                        internalType: "uint128",
                        name: "collateral",
                        type: "uint128",
                      },
                    ],
                    internalType: "struct Position",
                    name: "position",
                    type: "tuple",
                  },
                  {
                    components: [
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
                        components: [
                          {
                            internalType: "uint128",
                            name: "totalSupplyAssets",
                            type: "uint128",
                          },
                          {
                            internalType: "uint128",
                            name: "totalSupplyShares",
                            type: "uint128",
                          },
                          {
                            internalType: "uint128",
                            name: "totalBorrowAssets",
                            type: "uint128",
                          },
                          {
                            internalType: "uint128",
                            name: "totalBorrowShares",
                            type: "uint128",
                          },
                          {
                            internalType: "uint128",
                            name: "lastUpdate",
                            type: "uint128",
                          },
                          {
                            internalType: "uint128",
                            name: "fee",
                            type: "uint128",
                          },
                        ],
                        internalType: "struct Market",
                        name: "market",
                        type: "tuple",
                      },
                      {
                        internalType: "bool",
                        name: "hasPrice",
                        type: "bool",
                      },
                      {
                        internalType: "uint256",
                        name: "price",
                        type: "uint256",
                      },
                      {
                        internalType: "uint256",
                        name: "rateAtTarget",
                        type: "uint256",
                      },
                    ],
                    internalType: "struct MarketResponse",
                    name: "market",
                    type: "tuple",
                  },
                  {
                    internalType: "uint128",
                    name: "flowCapMaxIn",
                    type: "uint128",
                  },
                  {
                    internalType: "uint128",
                    name: "flowCapMaxOut",
                    type: "uint128",
                  },
                ],
                internalType: "struct VaultV1MarketAllocation[]",
                name: "vaultV1Allocations",
                type: "tuple[]",
              },
              {
                internalType: "uint256",
                name: "vaultV1Shares",
                type: "uint256",
              },
              {
                components: [
                  {
                    components: [
                      {
                        internalType: "uint256",
                        name: "supplyShares",
                        type: "uint256",
                      },
                      {
                        internalType: "uint128",
                        name: "borrowShares",
                        type: "uint128",
                      },
                      {
                        internalType: "uint128",
                        name: "collateral",
                        type: "uint128",
                      },
                    ],
                    internalType: "struct Position",
                    name: "position",
                    type: "tuple",
                  },
                  {
                    components: [
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
                        components: [
                          {
                            internalType: "uint128",
                            name: "totalSupplyAssets",
                            type: "uint128",
                          },
                          {
                            internalType: "uint128",
                            name: "totalSupplyShares",
                            type: "uint128",
                          },
                          {
                            internalType: "uint128",
                            name: "totalBorrowAssets",
                            type: "uint128",
                          },
                          {
                            internalType: "uint128",
                            name: "totalBorrowShares",
                            type: "uint128",
                          },
                          {
                            internalType: "uint128",
                            name: "lastUpdate",
                            type: "uint128",
                          },
                          {
                            internalType: "uint128",
                            name: "fee",
                            type: "uint128",
                          },
                        ],
                        internalType: "struct Market",
                        name: "market",
                        type: "tuple",
                      },
                      {
                        internalType: "bool",
                        name: "hasPrice",
                        type: "bool",
                      },
                      {
                        internalType: "uint256",
                        name: "price",
                        type: "uint256",
                      },
                      {
                        internalType: "uint256",
                        name: "rateAtTarget",
                        type: "uint256",
                      },
                    ],
                    internalType: "struct MarketResponse",
                    name: "market",
                    type: "tuple",
                  },
                ],
                internalType: "struct MarketV1Position[]",
                name: "marketV1Positions",
                type: "tuple[]",
              },
              {
                internalType: "address",
                name: "adaptiveCurveIrm",
                type: "address",
              },
              {
                components: [
                  {
                    internalType: "bytes32",
                    name: "marketId",
                    type: "bytes32",
                  },
                  {
                    internalType: "uint256",
                    name: "supplyShares",
                    type: "uint256",
                  },
                  {
                    components: [
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
                        components: [
                          {
                            internalType: "uint128",
                            name: "totalSupplyAssets",
                            type: "uint128",
                          },
                          {
                            internalType: "uint128",
                            name: "totalSupplyShares",
                            type: "uint128",
                          },
                          {
                            internalType: "uint128",
                            name: "totalBorrowAssets",
                            type: "uint128",
                          },
                          {
                            internalType: "uint128",
                            name: "totalBorrowShares",
                            type: "uint128",
                          },
                          {
                            internalType: "uint128",
                            name: "lastUpdate",
                            type: "uint128",
                          },
                          {
                            internalType: "uint128",
                            name: "fee",
                            type: "uint128",
                          },
                        ],
                        internalType: "struct Market",
                        name: "market",
                        type: "tuple",
                      },
                      {
                        internalType: "bool",
                        name: "hasPrice",
                        type: "bool",
                      },
                      {
                        internalType: "uint256",
                        name: "price",
                        type: "uint256",
                      },
                      {
                        internalType: "uint256",
                        name: "rateAtTarget",
                        type: "uint256",
                      },
                    ],
                    internalType: "struct MarketResponse",
                    name: "market",
                    type: "tuple",
                  },
                ],
                internalType: "struct MarketV1V2Allocation[]",
                name: "marketV1V2Allocations",
                type: "tuple[]",
              },
            ],
            internalType: "struct AdapterResponse[]",
            name: "adapters",
            type: "tuple[]",
          },
        ],
        internalType: "struct AccrualVaultV2Response",
        name: "res",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

/** @internal Deployless `GetAccrualVaultV2` query bytecode. */
export const code =
  "0x60808060405234601557613b28908161001a8239f35b5f80fdfe60806040526004361015610011575f80fd5b5f3560e01c630f0d54d814610024575f80fd5b346109fd576101003660031901126109fd576004356001600160a01b03811690036109fd576024356001600160a01b03811681036109fd576044356001600160a01b03811690036109fd576064356001600160a01b03811690036109fd576084356001600160a01b03811690036109fd5760a4356001600160a01b03811690036109fd5760c4356001600160a01b03811690036109fd5760e4356001600160a01b03811690036109fd576100d86080611903565b6040516100e48161191f565b5f8082526060602083018190526040830181905280830182905260809290925260a081905260c081905260e08190526101008190526101208190526101408190526101608190526101808290526101a08190526101c0919091526101e081905261020081905261022081905261024081905261026081905261028052610168611b26565b6102a05260606102c052604051635edec50d60e01b81526001600160a01b03600480358216908301526020908290602490829086165afa908115610a09575f916112db575b50156112b3576040516338d52e0f60e01b815260208160048181356001600160a01b03165afa908115610a09575f91611279575b506040516395d89b4160e01b81525f8160048181356001600160a01b03165afa908115610a09575f9161125f575b506040516306fdde0360e01b8152905f8260048181356001600160a01b03165afa918215610a09575f9261123b575b5060405163313ce56760e01b81529160208360048181356001600160a01b03165afa918215610a095760ff935f9361120a575b506040519461027f8661191f565b60018060a01b03168552602085015260408401521660608201526080526040516338d52e0f60e01b815260208160048160018060a01b038235165afa908115610a09575f916111d0575b506001600160a01b0390811660a05260405163ce04bebb60e01b815290602090829060049082908235165afa8015610a09575f90611190575b6001600160801b031660c052506040516318160ddd60e01b815260208160048181356001600160a01b03165afa908115610a09575f9161115e575b5060e0526040516331c6651b60e21b815260208160048181356001600160a01b03165afa908115610a09575f9161112c575b506101005260405163ece1d6e560e01b815260208160048181356001600160a01b03165afa8015610a09575f906110ec575b6001600160401b0316610120525060405163c046371160e01b815260208160048181356001600160a01b03165afa8015610a09575f906110ac575b6001600160401b0316610140525060405163ad468d1160e01b815260208160048181356001600160a01b03165afa908115610a09575f91611072575b506001600160a01b03908116610160526040516305c0524560e31b8152905f90829060049082908235165afa908115610a09575f91611022575b50610180526040516343bc43c160e11b815260208160048181356001600160a01b03165afa8015610a09576001600160601b03915f91611003575b50166101e05260405163537bfaeb60e11b815260208160048181356001600160a01b03165afa8015610a09576001600160601b03915f91610fd4575b50166102005260405163ed27f7c960e01b815260208160048181356001600160a01b03165afa908115610a09575f91610f9a575b506001600160a01b03908116610220526040516306d9a30160e41b815290602090829060049082908235165afa908115610a09575f91610f60575b506001600160a01b039081166102405260a0516040516370a0823160e01b8152600480358416908201529160209183916024918391165afa908115610a09575f91610f2e575b50610260526044356001600160a01b0316151580610ead575b6084356001600160a01b031615159081610e2a575b8080610e1d575b610dfa57808115610df3575b15156101a05215610c3a575060408051906105da81836119c1565b600182525f5b601f1982018110610bf75750506101406080015261067460018060a01b0360e0608001511660405160208101916040835260046060830152637468697360e01b608083015260408201526080815261063960a0826119c1565b519020604051906106498261191f565b81525f60208201525f60408201525f6060820152610140608001519061066e82611cc1565b52611cc1565b505b6101c051515f5b818110610a9157610160516001600160a01b031680610a5d575b50604051630b54457960e31b815260208160048181356001600160a01b03165afa908115610a09575f91610a2b575b506106d081611caa565b6106dd60405191826119c1565b818152601f196106ec83611caa565b015f5b818110610a145750506102c0525f5b8181106109445760405160208152806107ee608051610260602084015260018060a01b03815116610280840152606061076361074b602084015160806102a0880152610300870190611315565b604084015186820361027f19016102c0880152611315565b9101516102e084015260a080516001600160a01b03908116604086015260c080516001600160801b0316606087015260e08051608088015261010080519488019490945261012080516001600160401b03908116938901939093526101405190921690870152610160519091169185019190915261018051848303601f190191850191909152611315565b6101a05115156101408301526101c051828203601f19016101608401528051808352602092830192909101905f5b81811061090a5750506101e080516001600160601b0390811661018086015261020080519091166101a086015261022080516001600160a01b039081166101c08801526102408051909116938701939093526102605191860191909152610280511515908501526102a051848403601f1901918501919091526108a092915061142c565b6102c051601f198383030161026084015280518083526020600582901b8401810193928101925f918101905b8383106108d95786860387f35b9193955091936020806108f8600193601f19868203018752895161142c565b970193019301909286959492936108cc565b919350916020608060019260608751805183528481015185840152604081015160408401520151606082015201940191019184939261081c565b604051906313bd406b60e21b825280600483015260208260248160018060a01b03600435165afa918215610a09575f926109c0575b506109b9816109a460019460e4359060c4359060a43590608435906064359060443590600435611e80565b6102c051906109b38383611ce2565b52611ce2565b50016106fe565b91506020823d8211610a01575b816109da602093836119c1565b810103126109fd576109b9816109a46109f4600195611ba3565b94505050610979565b5f80fd5b3d91506109cd565b6040513d5f823e3d90fd5b602090610a1f611b26565b828286010152016106ef565b90506020813d602011610a55575b81610a46602093836119c1565b810103126109fd5751816106c6565b3d9150610a39565b600161028052610a879060e4359060c4359060a43590608435906064359060443590600435611e80565b6102a05280610697565b610aa18161014060800151611ce2565b5190815160405190632f0374dd60e21b8252600482015260208160248160018060a01b03600435165afa908115610a09575f91610bc6575b50602083015281516040519063a68bafa360e01b8252600482015260208160248160018060a01b03600435165afa908115610a09575f91610b95575b5060408301528151916040519263c69507dd60e01b8452600484015260208360248160018060a01b03600435165afa928315610a09575f93610b61575b5091606060019301520161067d565b92506020833d8211610b8d575b81610b7b602093836119c1565b810103126109fd579151916060610b52565b3d9150610b6e565b90506020813d8211610bbe575b81610baf602093836119c1565b810103126109fd575184610b15565b3d9150610ba2565b90506020813d8211610bef575b81610be0602093836119c1565b810103126109fd575184610ad9565b3d9150610bd3565b602090604051610c068161191f565b5f81525f838201525f60408201525f6060820152828286010152016105e0565b634e487b7160e01b5f52604160045260245ffd5b1561067657610c586101006080015160208082518301019101611cf6565b6101605160405163cc3802bf60e01b8152915f91839160a49183916001600160a01b0390911690610c8d90600484019061136c565b5afa908115610a09575f91610d63575b508051610ca981611caa565b90610cb760405192836119c1565b808252610cc6601f1991611caa565b015f5b818110610d345750506101c0525f5b8151811015610d2d5780610d2681610cf260019486611ce2565b5160405190610d008261191f565b81525f60208201525f60408201525f606082015261014060800151906109b38383611ce2565b5001610cd8565b5050610676565b602090604051610d438161191f565b5f81525f838201525f60408201525f606082015282828601015201610cc9565b90503d805f833e610d7481836119c1565b8101906020818303126109fd578051906001600160401b0382116109fd57019080601f830112156109fd578151610daa81611caa565b92610db860405194856119c1565b81845260208085019260051b8201019283116109fd57602001905b828210610de35750505081610c9d565b8151815260209182019101610dd3565b50816105bf565b61016051636364223f60e01b5f9081526001600160a01b03909116600452602490fd5b50610180515115156105b3565b610160516040516335abafe560e21b81526001600160a01b03918216600482015291925060209082906024908290608435165afa908115610a09575f91610e73575b50906105ac565b90506020813d602011610ea5575b81610e8e602093836119c1565b810103126109fd57610e9f90611b96565b82610e6c565b3d9150610e81565b5061016051604051632c77566560e01b81526001600160a01b0391821660048201529060209082906024908290604435165afa908115610a09575f91610ef4575b50610597565b90506020813d602011610f26575b81610f0f602093836119c1565b810103126109fd57610f2090611b96565b81610eee565b3d9150610f02565b90506020813d602011610f58575b81610f49602093836119c1565b810103126109fd57518161057e565b3d9150610f3c565b90506020813d602011610f92575b81610f7b602093836119c1565b810103126109fd57610f8c90611ba3565b81610538565b3d9150610f6e565b90506020813d602011610fcc575b81610fb5602093836119c1565b810103126109fd57610fc690611ba3565b816104fd565b3d9150610fa8565b610ff6915060203d602011610ffc575b610fee81836119c1565b810190611c8b565b826104c9565b503d610fe4565b61101c915060203d602011610ffc57610fee81836119c1565b8261048d565b90503d805f833e61103381836119c1565b8101906020818303126109fd578051906001600160401b0382116109fd57019080601f830112156109fd57815161106c92602001611bd2565b81610452565b90506020813d6020116110a4575b8161108d602093836119c1565b810103126109fd5761109e90611ba3565b81610418565b3d9150611080565b506020813d6020116110e4575b816110c6602093836119c1565b810103126109fd576110df6001600160401b0391611c77565b6103dc565b3d91506110b9565b506020813d602011611124575b81611106602093836119c1565b810103126109fd5761111f6001600160401b0391611c77565b6103a1565b3d91506110f9565b90506020813d602011611156575b81611147602093836119c1565b810103126109fd57518161036f565b3d915061113a565b90506020813d602011611188575b81611179602093836119c1565b810103126109fd57518161033d565b3d915061116c565b506020813d6020116111c8575b816111aa602093836119c1565b810103126109fd576111c36001600160801b0391611c63565b610302565b3d915061119d565b90506020813d602011611202575b816111eb602093836119c1565b810103126109fd576111fc90611ba3565b816102c9565b3d91506111de565b61122d91935060203d602011611234575b61122581836119c1565b810190611c4a565b9185610271565b503d61121b565b6112589192503d805f833e61125081836119c1565b810190611c25565b908361023e565b61127391503d805f833e61125081836119c1565b8261020f565b90506020813d6020116112ab575b81611294602093836119c1565b810103126109fd576112a590611ba3565b816101e1565b3d9150611287565b63634ba39d60e11b5f9081526001600160a01b03918216600490815235909116602452604490fd5b90506020813d60201161130d575b816112f6602093836119c1565b810103126109fd5761130790611b96565b5f6101ad565b3d91506112e9565b805180835260209291819084018484015e5f828201840152601f01601f1916010190565b90602080835192838152019201905f5b8181106113565750505090565b8251845260209384019390920191600101611349565b80516001600160a01b03908116835260208083015182169084015260408083015182169084015260608083015190911690830152608090810151910152565b60806101a0916113bc84825161136c565b6001600160801b0360a0602083015182815116828801528260208201511660c08801528260408201511660e0880152826060820151166101008801528285820151166101208801520151166101408501526040810151151561016085015260608101516101808501520151910152565b60018060a01b03815116825260ff602082015116602083015260018060a01b03604082015116604083015260018060a01b0360608201511660608301526080810151608083015260018060a01b0360a08201511660a083015260c08101519061018060c084015281516102e061018085015260018060a01b0381511661046085015260a06114e66114ce602084015160c0610480890152610520880190611315565b604084015187820361045f19016104a0890152611315565b9160608101516104c087015260808101516104e0870152015161045f198583030161050086015260ff60f81b815116825260c0611547611535602084015160e0602087015260e0860190611315565b60408401518582036040870152611315565b916060810151606085015260018060a01b03608082015116608085015260a081015160a085015201519160c0818303910152602080835192838152019201905f5b8181106118ed575050506020838101516001600160a01b039081166101a087015260408581015182166101c088015260608601519091166101e0870152608085015161020087015260a085015180516001600160c01b0316610220880152909101516001600160401b03166102408681019190915290916116cc906116b39060c087015180516001600160a01b039081166102608b01526020909101516001600160401b03166102808a015260e088015181166102a08a01526101008801516102c08a015261012088015181166102e08a0152610140880151166103008901526101608701516103208901526101808701516103408901526101a087015115156103608901526101c08701516103808901526101e087015161017f19898303016103a08a0152611339565b61020086015187820361017f19016103c0890152611339565b9361022081015115156103e0870152015160018060a01b038151166104008601526020810151610420860152015161044084015260e08101519183810360e0850152602080845192838152019301905f5b8181106118235750505061010081015161010084015261012081015191838103610120850152602080845192838152019301905f5b8181106117d1575050506101609060018060a01b0361014082015116610140850152015191610160818303910152602080835192838152019201905f5b81811061179c5750505090565b90919260206102006001926117c660408851805184528581015186850152015160408301906113ab565b01940192910161178f565b909193602061022060019261181883895161180c8482516001600160801b036040809280518552826020820151166020860152015116910152565b015160608301906113ab565b019501929101611752565b90919360206103006001926001600160801b0360e0895180518452858101511515868501526001600160401b036040820151166040850152611888606082015160608601906001600160401b036020809260018060c01b038151168552015116910152565b6118b9608082015160a08601906001600160801b036040809280518552826020820151166020860152015116910152565b6118cc60a08201516101008601906113ab565b60c081015183166102c08501520151166102e082015201950192910161171d565b8251845260209384019390920191600101611588565b61026081019081106001600160401b03821117610c2657604052565b608081019081106001600160401b03821117610c2657604052565b60e081019081106001600160401b03821117610c2657604052565b604081019081106001600160401b03821117610c2657604052565b606081019081106001600160401b03821117610c2657604052565b60c081019081106001600160401b03821117610c2657604052565b60a081019081106001600160401b03821117610c2657604052565b90601f801991011681019081106001600160401b03821117610c2657604052565b604051906119ef8261193a565b606060c0835f81528260208201528260408201525f838201525f60808201525f60a08201520152565b60405190611a2582611970565b5f6040838281528260208201520152565b60405190611a4382611903565b81604051611a508161198b565b5f815260606020820152606060408201525f60608201525f6080820152611a756119e2565b60a082015281525f60208201525f60408201525f60608201525f6080820152604051611aa081611955565b5f81525f602082015260a0820152604051611aba81611955565b5f81525f602082015260c08201525f60e08201525f6101008201525f6101208201525f6101408201525f6101608201525f6101808201525f6101a08201525f6101c082015260606101e082015260606102008201525f610220820152610240611b21611a18565b910152565b6040519061018082018281106001600160401b03821117610c26576040526060610160835f81525f60208201525f60408201525f838201525f60808201525f60a0820152611b72611a36565b60c08201528260e08201525f610100820152826101208201525f6101408201520152565b519081151582036109fd57565b51906001600160a01b03821682036109fd57565b6001600160401b038111610c2657601f01601f191660200190565b929192611bde82611bb7565b91611bec60405193846119c1565b8294818452818301116109fd578281602093845f96015e010152565b9080601f830112156109fd578151611c2292602001611bd2565b90565b906020828203126109fd5781516001600160401b0381116109fd57611c229201611c08565b908160209103126109fd575160ff811681036109fd5790565b51906001600160801b03821682036109fd57565b51906001600160401b03821682036109fd57565b908160209103126109fd57516001600160601b03811681036109fd5790565b6001600160401b038111610c265760051b60200190565b805115611cce5760200190565b634e487b7160e01b5f52603260045260245ffd5b8051821015611cce5760209160051b010190565b908160a09103126109fd57608060405191611d10836119a6565b611d1981611ba3565b8352611d2760208201611ba3565b6020840152611d3860408201611ba3565b6040840152611d4960608201611ba3565b60608401520151608082015290565b60405190611d65826119a6565b5f608083604051611d75816119a6565b83815283602082015283604082015283606082015283838201528152604051611d9d8161198b565b83815283602082015283604082015283606082015283838201528360a082015260208201528260408201528260608201520152565b908160609103126109fd57611e096040805192611dee84611970565b80518452611dfe60208201611c63565b602085015201611c63565b604082015290565b6040519061010082018281106001600160401b03821117610c26576040525f60e083828152826020820152826040820152604051611e4e81611955565b8381528360208201526060820152611e64611a18565b6080820152611e71611d58565b60a08201528260c08201520152565b95939091979692611e8f611b26565b6001600160a01b038481168083526040516399e9918360e01b815260048101829052929b909990929160209183916024918391165afa908115610a09575f916137e7575b5060808b01526001600160a01b03168015159081613778575b501561304857505050600160208701526040516307f1b29b60e11b8152602081600481885afa908115610a09575f9161300e575b506001600160a01b03166040878101919091525163388af5b560e01b8152602081600481885afa908115610a09575f91612fd4575b506001600160a01b0316606087015260405163e4baaddf60e01b815292602084600481885afa938415610a09575f94612f98575b506001600160a01b0390931660a087018181529390611fa6611a36565b916040516338d52e0f60e01b8152602081600481865afa908115610a09575f91612f5e575b506040516395d89b4160e01b81525f81600481875afa908115610a09575f91612f44575b506040516306fdde0360e01b81525f81600481885afa908115610a09575f91612f2a575b5060405163313ce56760e01b815290602082600481895afa918215610a09575f92612f09575b50604051632ba9c2b360e21b8152926020846004818a5afa938415610a09575f94612ee8575b506120686119e2565b505f8060405160208101906342580cb760e11b82526004815261208c6024826119c1565b51908a5afa612099613a91565b9015612ead57805181019060e081602084019303126109fd5760208101516001600160f81b03198116908190036109fd5760408201516001600160401b0381116109fd578360206120ec92850101611c08565b60608301516001600160401b0381116109fd5784602061210e92860101611c08565b608084015160a08501516001600160a01b03811694919391908590036109fd5760c08601519560e0810151906001600160401b0382116109fd57019680603f890112156109fd57602088015161216381611caa565b986121716040519a8b6119c1565b818a52602080808c019360051b830101019283116109fd57604001905b828210612e9d57505050926121b49a98959260ff9a9794928b9996936040519d8e61193a565b8d5260208d015260408c015260608b015260808a015260a089015260c0880152604051976121e18961198b565b60018060a01b031688526020880152604087015216606085015216608083015260a08201528352604051638da5cb5b60e01b8152602081600481865afa908115610a09575f91612e63575b506001600160a01b031660208481019190915260405163e66f53b760e01b81529081600481865afa908115610a09575f91612e29575b506001600160a01b031660408481019190915251630229549960e51b8152602081600481865afa908115610a09575f91612def575b506001600160a01b031660608401526040516334cc866d60e21b8152602081600481865afa908115610a09575f91612dbd575b50608084015260408051637cc4d9a160e01b81529081600481865afa908115610a09575f91612d9e575b5060a084015260408051633b1618dd60e11b81529081600481865afa908115610a09575f91612d45575b5060c0840152604051631c61872f60e31b8152602081600481865afa908115610a09575f91612d0b575b506001600160a01b031660e084015260405163ddca3f4360e01b8152602081600481865afa8015610a09576001600160601b03915f91612cec575b501661010084015260405163011a412160e61b8152602081600481865afa908115610a09575f91612cb2575b506001600160a01b031661012084015260405163388af5b560e01b8152602081600481865afa908115610a09575f91612c78575b506001600160a01b03166101408401526040516318160ddd60e01b8152602081600481865afa908115610a09575f91612c46575b5061016084015260405163568efc0760e01b8152602081600481865afa908115610a09575f91612c14575b506101808401525f806040516020810190630872d2c560e21b82526004815261246c6024826119c1565b5190855afa612479613a91565b9080612c08575b612bdf575b50604051630a17b31360e41b8152602081600481865afa908115610a09575f91612bad575b506124b481613ac0565b6101e085019081525f5b828110612b3a5750506040516333f91ebb60e01b8152949050602085600481865afa948515610a09575f95612b06575b506124f885613ac0565b9461020085019586525f5b818110612a935750506001600160a01b0316801515949092908580612a27575b6128cd575b60c08b0194855251519461253b86611caa565b9461254960405196876119c1565b868652601f1961255888611caa565b015f5b8181106128b657505060e08c019586525f5b8781106125f357505096516040516370a0823160e01b8152600481019990995260209750889650602495508694506001600160a01b0316925050505afa908115610a09575f916125c1575b50610100830152565b90506020813d6020116125eb575b816125dc602093836119c1565b810103126109fd57515f6125b8565b3d91506125cf565b6126038161020084510151611ce2565b519061260d611e11565b91604051636638c7bb60e11b81528160048201526060816024818a5afa908115610a09575f91612839575b5080516001600160b81b031684526020808201511515908501526040908101516001600160401b031684820152805163518df2eb60e11b81526004810183905290816024818a5afa908115610a09575f9161280b575b506060848101919091526040516349e2903160e11b8152600481018390526001600160a01b03881660248201529081806044810103816001600160a01b038c165afa908115610a09575f916127dd575b506080840152846126f08c838a613819565b60a0850152612716575b5061270f816001938a51906109b38383611ce2565b500161256d565b9160405192639dbcd5b960e01b845286600485015260248401526040836044818b5afa928315610a09575f93612770575b5082516001600160801b0390811660c083015260209093015190921660e083015261270f6126fa565b92506040833d82116127d5575b8161278a604093836119c1565b810103126109fd578161270f916001600160801b0360206001966127c682604051926127b584611955565b6127be81611c63565b845201611c63565b82820152965050509150612747565b3d915061277d565b6127fe915060603d8111612804575b6127f681836119c1565b810190611dd2565b5f6126de565b503d6127ec565b61282c915060403d8111612832575b61282481836119c1565b810190613a51565b5f61268e565b503d61281a565b90506060813d82116128ae575b81612853606093836119c1565b810103126109fd5760405161286781611970565b8151906001600160b81b03821682036109fd576128a360406001600160401b03948194845261289860208201611b96565b602085015201611c77565b828201529150612638565b3d9150612846565b6020906128c1611e11565b82828b0101520161255b565b6001610220860152604051630c7508df60e31b815260048101839052602081602481885afa908115610a09575f916129ed575b50604051636fcca69b60e01b815260048101849052602081602481895afa908115610a09575f916129bb575b506040516348d88a5960e11b815260048101859052906020826024818a5afa918215610a09575f92612987575b506040519261296784611970565b6001600160a01b0316835260208301526040820152610240860152612528565b9091506020813d6020116129b3575b816129a3602093836119c1565b810103126109fd5751905f612959565b3d9150612996565b90506020813d6020116129e5575b816129d6602093836119c1565b810103126109fd57515f61292c565b3d91506129c9565b90506020813d602011612a1f575b81612a08602093836119c1565b810103126109fd57612a1990611ba3565b5f612900565b3d91506129fb565b506040516326f6f90760e11b815260048101859052602081602481865afa908115610a09575f91612a59575b50612523565b90506020813d602011612a8b575b81612a74602093836119c1565b810103126109fd57612a8590611b96565b5f612a53565b3d9150612a67565b6040516362518ddf60e01b81526004810182905290602082602481895afa8015610a09575f90612ad4575b60019250612acd828a51611ce2565b5201612503565b506020823d8211612afe575b81612aed602093836119c1565b810103126109fd5760019151612abe565b3d9150612ae0565b9094506020813d602011612b32575b81612b22602093836119c1565b810103126109fd5751935f6124ee565b3d9150612b15565b60405163f7d1852160e01b81526004810182905290602082602481895afa8015610a09575f90612b7b575b60019250612b74828551611ce2565b52016124be565b506020823d8211612ba5575b81612b94602093836119c1565b810103126109fd5760019151612b65565b3d9150612b87565b90506020813d602011612bd7575b81612bc8602093836119c1565b810103126109fd57515f6124aa565b3d9150612bbb565b60016101a0850152602081519181808201938492010103126109fd57516101c08401525f612485565b50602081511015612480565b90506020813d602011612c3e575b81612c2f602093836119c1565b810103126109fd57515f612442565b3d9150612c22565b90506020813d602011612c70575b81612c61602093836119c1565b810103126109fd57515f612417565b3d9150612c54565b90506020813d602011612caa575b81612c93602093836119c1565b810103126109fd57612ca490611ba3565b5f6123e3565b3d9150612c86565b90506020813d602011612ce4575b81612ccd602093836119c1565b810103126109fd57612cde90611ba3565b5f6123af565b3d9150612cc0565b612d05915060203d602011610ffc57610fee81836119c1565b5f612383565b90506020813d602011612d3d575b81612d26602093836119c1565b810103126109fd57612d3790611ba3565b5f612348565b3d9150612d19565b90506040813d604011612d96575b81612d60604093836119c1565b810103126109fd57612d8b602060405192612d7a84611955565b612d8381611ba3565b845201611c77565b60208201525f61231e565b3d9150612d53565b612db7915060403d6040116128325761282481836119c1565b5f6122f4565b90506020813d602011612de7575b81612dd8602093836119c1565b810103126109fd57515f6122ca565b3d9150612dcb565b90506020813d602011612e21575b81612e0a602093836119c1565b810103126109fd57612e1b90611ba3565b5f612297565b3d9150612dfd565b90506020813d602011612e5b575b81612e44602093836119c1565b810103126109fd57612e5590611ba3565b5f612262565b3d9150612e37565b90506020813d602011612e95575b81612e7e602093836119c1565b810103126109fd57612e8f90611ba3565b5f61222c565b3d9150612e71565b815181526020918201910161218e565b60405162461bcd60e51b8152602060048201526013602482015272195a5c0dcc4c911bdb585a5b8819985a5b1959606a1b6044820152606490fd5b612f0291945060203d6020116112345761122581836119c1565b925f61205f565b612f2391925060203d6020116112345761122581836119c1565b905f612039565b612f3e91503d805f833e61125081836119c1565b5f612013565b612f5891503d805f833e61125081836119c1565b5f611fef565b90506020813d602011612f90575b81612f79602093836119c1565b810103126109fd57612f8a90611ba3565b5f611fcb565b3d9150612f6c565b9093506020813d602011612fcc575b81612fb4602093836119c1565b810103126109fd57612fc590611ba3565b925f611f89565b3d9150612fa7565b90506020813d602011613006575b81612fef602093836119c1565b810103126109fd5761300090611ba3565b5f611f55565b3d9150612fe2565b90506020813d602011613040575b81613029602093836119c1565b810103126109fd5761303a90611ba3565b5f611f20565b3d915061301c565b939593919250906001600160a01b03168015159081613709575b501561333b5750600260208701526040516307f1b29b60e11b8152602081600481865afa908115610a09575f91613301575b506001600160a01b03166040878101919091525163388af5b560e01b8152602081600481865afa908115610a09575f916132c7575b506001600160a01b0316606087015260405163b045ff5b60e01b815292602084600481865afa938415610a09575f94613293575b5061310784611caa565b9261311560405194856119c1565b848452601f1961312486611caa565b015f5b81811061326257505061012088019384525f5b85811061314a5750505050505050565b604051631f1a892160e11b81526004810182905260a081602481865afa908115610a09575f91613234575b5060405161318760208201809361136c565b60a0815261319660c0826119c1565b5190206040516349e2903160e11b8152600481018290526001600160a01b0386166024820152909190606081806044810103816001600160a01b0389165afa908115610a0957600193613200928b925f91613216575b506131f8858b51611ce2565b515286613819565b602061320d838951611ce2565b5101520161313a565b61322e915060603d8111612804576127f681836119c1565b5f6131ec565b613255915060a03d811161325b575b61324d81836119c1565b810190611cf6565b5f613175565b503d613243565b60209060405161327181611955565b613279611a18565b8152613283611d58565b8382015282828901015201613127565b9093506020813d6020116132bf575b816132af602093836119c1565b810103126109fd5751925f6130fd565b3d91506132a2565b90506020813d6020116132f9575b816132e2602093836119c1565b810103126109fd576132f390611ba3565b5f6130c9565b3d91506132d5565b90506020813d602011613333575b8161331c602093836119c1565b810103126109fd5761332d90611ba3565b5f613094565b3d915061330f565b919392916001600160a01b031680151591508161369a575b501561368757600360208601526040516307f1b29b60e11b8152602081600481875afa908115610a09575f9161364d575b506001600160a01b03166040868101919091525163388af5b560e01b8152602081600481875afa908115610a09575f91613613575b506001600160a01b03166060860152604051630399e3a560e41b8152602081600481875afa908115610a09575f916135d9575b506001600160a01b031661014086015260405163ace48b4560e01b815291602083600481875afa928315610a09575f936135a5575b5061342b83611caa565b9161343960405193846119c1565b838352601f1961344885611caa565b015f5b81811061357557505061016087019283525f5b84811061346d57505050505050565b60405163779a968360e01b815260048101829052906020826024818a5afa918215610a09575f92613542575b50816134a6828751611ce2565b5152604051630dd5aa9b60e31b815260048101839052916020836024818b5afa8015610a095785935f9161350a575b50926134f49160019460206134eb868b51611ce2565b51015285613819565b6040613501838851611ce2565b5101520161345e565b9350506020833d821161353a575b81613525602093836119c1565b810103126109fd5791518492906134f46134d5565b3d9150613518565b9091506020813d821161356d575b8161355d602093836119c1565b810103126109fd5751905f613499565b3d9150613550565b60209060405161358481611970565b5f81525f83820152613594611d58565b60408201528282880101520161344b565b9092506020813d6020116135d1575b816135c1602093836119c1565b810103126109fd5751915f613421565b3d91506135b4565b90506020813d60201161360b575b816135f4602093836119c1565b810103126109fd5761360590611ba3565b5f6133ec565b3d91506135e7565b90506020813d602011613645575b8161362e602093836119c1565b810103126109fd5761363f90611ba3565b5f6133b9565b3d9150613621565b90506020813d60201161367f575b81613668602093836119c1565b810103126109fd5761367990611ba3565b5f613384565b3d915061365b565b82636364223f60e01b5f5260045260245ffd5b60249150602090604051928380926335abafe560e21b82528860048301525afa908115610a09575f916136cf575b505f613353565b90506020813d602011613701575b816136ea602093836119c1565b810103126109fd576136fb90611b96565b5f6136c8565b3d91506136dd565b602491506020906040519283809263230dbab560e01b82528860048301525afa908115610a09575f9161373e575b505f613062565b90506020813d602011613770575b81613759602093836119c1565b810103126109fd5761376a90611b96565b5f613737565b3d915061374c565b6024915060209060405192838092632c77566560e01b82528c60048301525afa908115610a09575f916137ad575b505f611eec565b90506020813d6020116137df575b816137c8602093836119c1565b810103126109fd576137d990611b96565b5f6137a6565b3d91506137bb565b90506020813d602011613811575b81613802602093836119c1565b810103126109fd57515f611ed3565b3d91506137f5565b929190613824611d58565b604051632c3c915760e01b81526004810183905290946001600160a01b03169060a081602481855afa918215610a095760249260c0925f91613a32575b50875260405192838092632e3071cd60e11b82528660048301525afa908115610a09575f91613995575b5060208501528351604001516001600160a01b031680613929575b508351606001516001600160a01b03928316921682146138c4575050565b6020906024604051809481936301977b5760e01b835260048301525afa908115610a09575f916138f7575b506080830152565b90506020813d602011613921575b81613912602093836119c1565b810103126109fd57515f6138ef565b3d9150613905565b60206004916040519283809263501ad8ff60e11b82525afa5f9181613961575b50156138a6576001604086015260608501525f6138a6565b9091506020813d60201161398d575b8161397d602093836119c1565b810103126109fd5751905f613949565b3d9150613970565b905060c0813d60c011613a2a575b816139b060c093836119c1565b810103126109fd57613a1f60a0604051926139ca8461198b565b6139d381611c63565b84526139e160208201611c63565b60208501526139f260408201611c63565b6040850152613a0360608201611c63565b6060850152613a1460808201611c63565b608085015201611c63565b60a08201525f61388b565b3d91506139a3565b613a4b915060a03d60a01161325b5761324d81836119c1565b5f613861565b908160409103126109fd5760405190613a6982611955565b80516001600160c01b03811681036109fd578252613a8990602001611c77565b602082015290565b3d15613abb573d90613aa282611bb7565b91613ab060405193846119c1565b82523d5f602084013e565b606090565b90613aca82611caa565b613ad760405191826119c1565b8281528092613ae8601f1991611caa565b019060203691013756fea26469706673582212209ad31a46a374116021a39fca14c2b7f469e5c6c11aade7be2c4a8539036a13d064736f6c63430008230033";
