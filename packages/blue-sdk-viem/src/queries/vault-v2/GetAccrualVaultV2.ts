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
  "0x60808060405234601557613b69908161001a8239f35b5f80fdfe60806040526004361015610011575f80fd5b5f3560e01c630f0d54d814610024575f80fd5b346109fd576101003660031901126109fd576004356001600160a01b03811690036109fd576024356001600160a01b03811681036109fd576044356001600160a01b03811690036109fd576064356001600160a01b03811690036109fd576084356001600160a01b03811690036109fd5760a4356001600160a01b03811690036109fd5760c4356001600160a01b03811690036109fd5760e4356001600160a01b03811690036109fd576100d86080611916565b6040516100e481611932565b5f8082526060602083018190526040830181905280830182905260809290925260a081905260c081905260e08190526101008190526101208190526101408190526101608190526101808290526101a08190526101c0919091526101e081905261020081905261022081905261024081905261026081905261028052610168611b39565b6102a05260606102c052604051635edec50d60e01b81526001600160a01b03600480358216908301526020908290602490829086165afa908115610a09575f916112db575b50156112b3576040516338d52e0f60e01b815260208160048181356001600160a01b03165afa908115610a09575f91611279575b506040516395d89b4160e01b81525f8160048181356001600160a01b03165afa908115610a09575f9161125f575b506040516306fdde0360e01b8152905f8260048181356001600160a01b03165afa918215610a09575f9261123b575b5060405163313ce56760e01b81529160208360048181356001600160a01b03165afa918215610a095760ff935f9361120a575b506040519461027f86611932565b60018060a01b03168552602085015260408401521660608201526080526040516338d52e0f60e01b815260208160048160018060a01b038235165afa908115610a09575f916111d0575b506001600160a01b0390811660a05260405163ce04bebb60e01b815290602090829060049082908235165afa8015610a09575f90611190575b6001600160801b031660c052506040516318160ddd60e01b815260208160048181356001600160a01b03165afa908115610a09575f9161115e575b5060e0526040516331c6651b60e21b815260208160048181356001600160a01b03165afa908115610a09575f9161112c575b506101005260405163ece1d6e560e01b815260208160048181356001600160a01b03165afa8015610a09575f906110ec575b6001600160401b0316610120525060405163c046371160e01b815260208160048181356001600160a01b03165afa8015610a09575f906110ac575b6001600160401b0316610140525060405163ad468d1160e01b815260208160048181356001600160a01b03165afa908115610a09575f91611072575b506001600160a01b03908116610160526040516305c0524560e31b8152905f90829060049082908235165afa908115610a09575f91611022575b50610180526040516343bc43c160e11b815260208160048181356001600160a01b03165afa8015610a09576001600160601b03915f91611003575b50166101e05260405163537bfaeb60e11b815260208160048181356001600160a01b03165afa8015610a09576001600160601b03915f91610fd4575b50166102005260405163ed27f7c960e01b815260208160048181356001600160a01b03165afa908115610a09575f91610f9a575b506001600160a01b03908116610220526040516306d9a30160e41b815290602090829060049082908235165afa908115610a09575f91610f60575b506001600160a01b039081166102405260a0516040516370a0823160e01b8152600480358416908201529160209183916024918391165afa908115610a09575f91610f2e575b50610260526044356001600160a01b0316151580610ead575b6084356001600160a01b031615159081610e2a575b8080610e1d575b610dfa57808115610df3575b15156101a05215610c3a575060408051906105da81836119d4565b600182525f5b601f1982018110610bf75750506101406080015261067460018060a01b0360e0608001511660405160208101916040835260046060830152637468697360e01b608083015260408201526080815261063960a0826119d4565b5190206040519061064982611932565b81525f60208201525f60408201525f6060820152610140608001519061066e82611cd4565b52611cd4565b505b6101c051515f5b818110610a9157610160516001600160a01b031680610a5d575b50604051630b54457960e31b815260208160048181356001600160a01b03165afa908115610a09575f91610a2b575b506106d081611cbd565b6106dd60405191826119d4565b818152601f196106ec83611cbd565b015f5b818110610a145750506102c0525f5b8181106109445760405160208152806107ee608051610260602084015260018060a01b03815116610280840152606061076361074b602084015160806102a0880152610300870190611315565b604084015186820361027f19016102c0880152611315565b9101516102e084015260a080516001600160a01b03908116604086015260c080516001600160801b0316606087015260e08051608088015261010080519488019490945261012080516001600160401b03908116938901939093526101405190921690870152610160519091169185019190915261018051848303601f190191850191909152611315565b6101a05115156101408301526101c051828203601f19016101608401528051808352602092830192909101905f5b81811061090a5750506101e080516001600160601b0390811661018086015261020080519091166101a086015261022080516001600160a01b039081166101c08801526102408051909116938701939093526102605191860191909152610280511515908501526102a051848403601f1901918501919091526108a092915061142c565b6102c051601f198383030161026084015280518083526020600582901b8401810193928101925f918101905b8383106108d95786860387f35b9193955091936020806108f8600193601f19868203018752895161142c565b970193019301909286959492936108cc565b919350916020608060019260608751805183528481015185840152604081015160408401520151606082015201940191019184939261081c565b604051906313bd406b60e21b825280600483015260208260248160018060a01b03600435165afa918215610a09575f926109c0575b506109b9816109a460019460e4359060c4359060a43590608435906064359060443590600435611e9f565b6102c051906109b38383611cf5565b52611cf5565b50016106fe565b91506020823d8211610a01575b816109da602093836119d4565b810103126109fd576109b9816109a46109f4600195611bb6565b94505050610979565b5f80fd5b3d91506109cd565b6040513d5f823e3d90fd5b602090610a1f611b39565b828286010152016106ef565b90506020813d602011610a55575b81610a46602093836119d4565b810103126109fd5751816106c6565b3d9150610a39565b600161028052610a879060e4359060c4359060a43590608435906064359060443590600435611e9f565b6102a05280610697565b610aa18161014060800151611cf5565b5190815160405190632f0374dd60e21b8252600482015260208160248160018060a01b03600435165afa908115610a09575f91610bc6575b50602083015281516040519063a68bafa360e01b8252600482015260208160248160018060a01b03600435165afa908115610a09575f91610b95575b5060408301528151916040519263c69507dd60e01b8452600484015260208360248160018060a01b03600435165afa928315610a09575f93610b61575b5091606060019301520161067d565b92506020833d8211610b8d575b81610b7b602093836119d4565b810103126109fd579151916060610b52565b3d9150610b6e565b90506020813d8211610bbe575b81610baf602093836119d4565b810103126109fd575184610b15565b3d9150610ba2565b90506020813d8211610bef575b81610be0602093836119d4565b810103126109fd575184610ad9565b3d9150610bd3565b602090604051610c0681611932565b5f81525f838201525f60408201525f6060820152828286010152016105e0565b634e487b7160e01b5f52604160045260245ffd5b1561067657610c586101006080015160208082518301019101611d09565b6101605160405163cc3802bf60e01b8152915f91839160a49183916001600160a01b0390911690610c8d90600484019061136c565b5afa908115610a09575f91610d63575b508051610ca981611cbd565b90610cb760405192836119d4565b808252610cc6601f1991611cbd565b015f5b818110610d345750506101c0525f5b8151811015610d2d5780610d2681610cf260019486611cf5565b5160405190610d0082611932565b81525f60208201525f60408201525f606082015261014060800151906109b38383611cf5565b5001610cd8565b5050610676565b602090604051610d4381611932565b5f81525f838201525f60408201525f606082015282828601015201610cc9565b90503d805f833e610d7481836119d4565b8101906020818303126109fd578051906001600160401b0382116109fd57019080601f830112156109fd578151610daa81611cbd565b92610db860405194856119d4565b81845260208085019260051b8201019283116109fd57602001905b828210610de35750505081610c9d565b8151815260209182019101610dd3565b50816105bf565b61016051636364223f60e01b5f9081526001600160a01b03909116600452602490fd5b50610180515115156105b3565b610160516040516335abafe560e21b81526001600160a01b03918216600482015291925060209082906024908290608435165afa908115610a09575f91610e73575b50906105ac565b90506020813d602011610ea5575b81610e8e602093836119d4565b810103126109fd57610e9f90611ba9565b82610e6c565b3d9150610e81565b5061016051604051632c77566560e01b81526001600160a01b0391821660048201529060209082906024908290604435165afa908115610a09575f91610ef4575b50610597565b90506020813d602011610f26575b81610f0f602093836119d4565b810103126109fd57610f2090611ba9565b81610eee565b3d9150610f02565b90506020813d602011610f58575b81610f49602093836119d4565b810103126109fd57518161057e565b3d9150610f3c565b90506020813d602011610f92575b81610f7b602093836119d4565b810103126109fd57610f8c90611bb6565b81610538565b3d9150610f6e565b90506020813d602011610fcc575b81610fb5602093836119d4565b810103126109fd57610fc690611bb6565b816104fd565b3d9150610fa8565b610ff6915060203d602011610ffc575b610fee81836119d4565b810190611c9e565b826104c9565b503d610fe4565b61101c915060203d602011610ffc57610fee81836119d4565b8261048d565b90503d805f833e61103381836119d4565b8101906020818303126109fd578051906001600160401b0382116109fd57019080601f830112156109fd57815161106c92602001611be5565b81610452565b90506020813d6020116110a4575b8161108d602093836119d4565b810103126109fd5761109e90611bb6565b81610418565b3d9150611080565b506020813d6020116110e4575b816110c6602093836119d4565b810103126109fd576110df6001600160401b0391611c8a565b6103dc565b3d91506110b9565b506020813d602011611124575b81611106602093836119d4565b810103126109fd5761111f6001600160401b0391611c8a565b6103a1565b3d91506110f9565b90506020813d602011611156575b81611147602093836119d4565b810103126109fd57518161036f565b3d915061113a565b90506020813d602011611188575b81611179602093836119d4565b810103126109fd57518161033d565b3d915061116c565b506020813d6020116111c8575b816111aa602093836119d4565b810103126109fd576111c36001600160801b0391611c76565b610302565b3d915061119d565b90506020813d602011611202575b816111eb602093836119d4565b810103126109fd576111fc90611bb6565b816102c9565b3d91506111de565b61122d91935060203d602011611234575b61122581836119d4565b810190611c5d565b9185610271565b503d61121b565b6112589192503d805f833e61125081836119d4565b810190611c38565b908361023e565b61127391503d805f833e61125081836119d4565b8261020f565b90506020813d6020116112ab575b81611294602093836119d4565b810103126109fd576112a590611bb6565b816101e1565b3d9150611287565b63634ba39d60e11b5f9081526001600160a01b03918216600490815235909116602452604490fd5b90506020813d60201161130d575b816112f6602093836119d4565b810103126109fd5761130790611ba9565b5f6101ad565b3d91506112e9565b805180835260209291819084018484015e5f828201840152601f01601f1916010190565b90602080835192838152019201905f5b8181106113565750505090565b8251845260209384019390920191600101611349565b80516001600160a01b03908116835260208083015182169084015260408083015182169084015260608083015190911690830152608090810151910152565b60806101a0916113bc84825161136c565b6001600160801b0360a0602083015182815116828801528260208201511660c08801528260408201511660e0880152826060820151166101008801528285820151166101208801520151166101408501526040810151151561016085015260608101516101808501520151910152565b60018060a01b03815116825260ff602082015116602083015260018060a01b03604082015116604083015260018060a01b0360608201511660608301526080810151608083015260018060a01b0360a08201511660a083015260c08101519061018060c084015281516102e061018085015260018060a01b0381511661046085015260a06114e66114ce602084015160c0610480890152610520880190611315565b604084015187820361045f19016104a0890152611315565b9160608101516104c087015260808101516104e0870152015161045f198583030161050086015260ff60f81b815116825260c0611547611535602084015160e0602087015260e0860190611315565b60408401518582036040870152611315565b916060810151606085015260018060a01b03608082015116608085015260a081015160a085015201519160c0818303910152602080835192838152019201905f5b818110611900575050506020838101516001600160a01b039081166101a087015260408581015182166101c088015260608601519091166101e0870152608085015161020087015260a085015180516001600160c01b0316610220880152909101516001600160401b03166102408681019190915290916116cc906116b39060c087015180516001600160a01b039081166102608b01526020909101516001600160401b03166102808a015260e088015181166102a08a01526101008801516102c08a015261012088015181166102e08a0152610140880151166103008901526101608701516103208901526101808701516103408901526101a087015115156103608901526101c08701516103808901526101e087015161017f19898303016103a08a0152611339565b61020086015187820361017f19016103c0890152611339565b9361022081015115156103e0870152015160018060a01b038151166104008601526020810151610420860152015161044084015260e08101519183810360e0850152602080845192838152019301905f5b8181106118365750505061010081015161010084015261012081015191838103610120850152602080845192838152019301905f5b8181106117d1575050506101609060018060a01b0361014082015116610140850152015191610160818303910152602080835192838152019201905f5b81811061179c5750505090565b90919260206102006001926117c660408851805184528581015186850152015160408301906113ab565b01940192910161178f565b90919360206102c060019261182b604089516117ee84825161136c565b61181e8682015160a08601906001600160801b036040809280518552826020820151166020860152015116910152565b01516101008301906113ab565b019501929101611752565b90919360206103006001926001600160801b0360e0895180518452858101511515868501526001600160401b03604082015116604085015261189b606082015160608601906001600160401b036020809260018060c01b038151168552015116910152565b6118cc608082015160a08601906001600160801b036040809280518552826020820151166020860152015116910152565b6118df60a08201516101008601906113ab565b60c081015183166102c08501520151166102e082015201950192910161171d565b8251845260209384019390920191600101611588565b61026081019081106001600160401b03821117610c2657604052565b608081019081106001600160401b03821117610c2657604052565b60e081019081106001600160401b03821117610c2657604052565b604081019081106001600160401b03821117610c2657604052565b606081019081106001600160401b03821117610c2657604052565b60c081019081106001600160401b03821117610c2657604052565b60a081019081106001600160401b03821117610c2657604052565b90601f801991011681019081106001600160401b03821117610c2657604052565b60405190611a028261194d565b606060c0835f81528260208201528260408201525f838201525f60808201525f60a08201520152565b60405190611a3882611983565b5f6040838281528260208201520152565b60405190611a5682611916565b81604051611a638161199e565b5f815260606020820152606060408201525f60608201525f6080820152611a886119f5565b60a082015281525f60208201525f60408201525f60608201525f6080820152604051611ab381611968565b5f81525f602082015260a0820152604051611acd81611968565b5f81525f602082015260c08201525f60e08201525f6101008201525f6101208201525f6101408201525f6101608201525f6101808201525f6101a08201525f6101c082015260606101e082015260606102008201525f610220820152610240611b34611a2b565b910152565b6040519061018082018281106001600160401b03821117610c26576040526060610160835f81525f60208201525f60408201525f838201525f60808201525f60a0820152611b85611a49565b60c08201528260e08201525f610100820152826101208201525f6101408201520152565b519081151582036109fd57565b51906001600160a01b03821682036109fd57565b6001600160401b038111610c2657601f01601f191660200190565b929192611bf182611bca565b91611bff60405193846119d4565b8294818452818301116109fd578281602093845f96015e010152565b9080601f830112156109fd578151611c3592602001611be5565b90565b906020828203126109fd5781516001600160401b0381116109fd57611c359201611c1b565b908160209103126109fd575160ff811681036109fd5790565b51906001600160801b03821682036109fd57565b51906001600160401b03821682036109fd57565b908160209103126109fd57516001600160601b03811681036109fd5790565b6001600160401b038111610c265760051b60200190565b805115611ce15760200190565b634e487b7160e01b5f52603260045260245ffd5b8051821015611ce15760209160051b010190565b908160a09103126109fd57608060405191611d23836119b9565b611d2c81611bb6565b8352611d3a60208201611bb6565b6020840152611d4b60408201611bb6565b6040840152611d5c60608201611bb6565b60608401520151608082015290565b60405190611d78826119b9565b5f6080838281528260208201528260408201528260608201520152565b60405190611da2826119b9565b5f608083611dae611d6b565b8152604051611dbc8161199e565b83815283602082015283604082015283606082015283838201528360a082015260208201528260408201528260608201520152565b908160609103126109fd57611e286040805192611e0d84611983565b80518452611e1d60208201611c76565b602085015201611c76565b604082015290565b6040519061010082018281106001600160401b03821117610c26576040525f60e083828152826020820152826040820152604051611e6d81611968565b8381528360208201526060820152611e83611a2b565b6080820152611e90611d95565b60a08201528260c08201520152565b95939091979692611eae611b39565b6001600160a01b038481168083526040516399e9918360e01b815260048101829052929b909990929160209183916024918391165afa908115610a09575f91613828575b5060808b01526001600160a01b031680151590816137b9575b501561306757505050600160208701526040516307f1b29b60e11b8152602081600481885afa908115610a09575f9161302d575b506001600160a01b03166040878101919091525163388af5b560e01b8152602081600481885afa908115610a09575f91612ff3575b506001600160a01b0316606087015260405163e4baaddf60e01b815292602084600481885afa938415610a09575f94612fb7575b506001600160a01b0390931660a087018181529390611fc5611a49565b916040516338d52e0f60e01b8152602081600481865afa908115610a09575f91612f7d575b506040516395d89b4160e01b81525f81600481875afa908115610a09575f91612f63575b506040516306fdde0360e01b81525f81600481885afa908115610a09575f91612f49575b5060405163313ce56760e01b815290602082600481895afa918215610a09575f92612f28575b50604051632ba9c2b360e21b8152926020846004818a5afa938415610a09575f94612f07575b506120876119f5565b505f8060405160208101906342580cb760e11b8252600481526120ab6024826119d4565b51908a5afa6120b8613ad2565b9015612ecc57805181019060e081602084019303126109fd5760208101516001600160f81b03198116908190036109fd5760408201516001600160401b0381116109fd5783602061210b92850101611c1b565b60608301516001600160401b0381116109fd5784602061212d92860101611c1b565b608084015160a08501516001600160a01b03811694919391908590036109fd5760c08601519560e0810151906001600160401b0382116109fd57019680603f890112156109fd57602088015161218281611cbd565b986121906040519a8b6119d4565b818a52602080808c019360051b830101019283116109fd57604001905b828210612ebc57505050926121d39a98959260ff9a9794928b9996936040519d8e61194d565b8d5260208d015260408c015260608b015260808a015260a089015260c0880152604051976122008961199e565b60018060a01b031688526020880152604087015216606085015216608083015260a08201528352604051638da5cb5b60e01b8152602081600481865afa908115610a09575f91612e82575b506001600160a01b031660208481019190915260405163e66f53b760e01b81529081600481865afa908115610a09575f91612e48575b506001600160a01b031660408481019190915251630229549960e51b8152602081600481865afa908115610a09575f91612e0e575b506001600160a01b031660608401526040516334cc866d60e21b8152602081600481865afa908115610a09575f91612ddc575b50608084015260408051637cc4d9a160e01b81529081600481865afa908115610a09575f91612dbd575b5060a084015260408051633b1618dd60e11b81529081600481865afa908115610a09575f91612d64575b5060c0840152604051631c61872f60e31b8152602081600481865afa908115610a09575f91612d2a575b506001600160a01b031660e084015260405163ddca3f4360e01b8152602081600481865afa8015610a09576001600160601b03915f91612d0b575b501661010084015260405163011a412160e61b8152602081600481865afa908115610a09575f91612cd1575b506001600160a01b031661012084015260405163388af5b560e01b8152602081600481865afa908115610a09575f91612c97575b506001600160a01b03166101408401526040516318160ddd60e01b8152602081600481865afa908115610a09575f91612c65575b5061016084015260405163568efc0760e01b8152602081600481865afa908115610a09575f91612c33575b506101808401525f806040516020810190630872d2c560e21b82526004815261248b6024826119d4565b5190855afa612498613ad2565b9080612c27575b612bfe575b50604051630a17b31360e41b8152602081600481865afa908115610a09575f91612bcc575b506124d381613b01565b6101e085019081525f5b828110612b595750506040516333f91ebb60e01b8152949050602085600481865afa948515610a09575f95612b25575b5061251785613b01565b9461020085019586525f5b818110612ab25750506001600160a01b0316801515949092908580612a46575b6128ec575b60c08b0194855251519461255a86611cbd565b9461256860405196876119d4565b868652601f1961257788611cbd565b015f5b8181106128d557505060e08c019586525f5b87811061261257505096516040516370a0823160e01b8152600481019990995260209750889650602495508694506001600160a01b0316925050505afa908115610a09575f916125e0575b50610100830152565b90506020813d60201161260a575b816125fb602093836119d4565b810103126109fd57515f6125d7565b3d91506125ee565b6126228161020084510151611cf5565b519061262c611e30565b91604051636638c7bb60e11b81528160048201526060816024818a5afa908115610a09575f91612858575b5080516001600160b81b031684526020808201511515908501526040908101516001600160401b031684820152805163518df2eb60e11b81526004810183905290816024818a5afa908115610a09575f9161282a575b506060848101919091526040516349e2903160e11b8152600481018390526001600160a01b03881660248201529081806044810103816001600160a01b038c165afa908115610a09575f916127fc575b5060808401528461270f8c838a61385a565b60a0850152612735575b5061272e816001938a51906109b38383611cf5565b500161258c565b9160405192639dbcd5b960e01b845286600485015260248401526040836044818b5afa928315610a09575f9361278f575b5082516001600160801b0390811660c083015260209093015190921660e083015261272e612719565b92506040833d82116127f4575b816127a9604093836119d4565b810103126109fd578161272e916001600160801b0360206001966127e582604051926127d484611968565b6127dd81611c76565b845201611c76565b82820152965050509150612766565b3d915061279c565b61281d915060603d8111612823575b61281581836119d4565b810190611df1565b5f6126fd565b503d61280b565b61284b915060403d8111612851575b61284381836119d4565b810190613a92565b5f6126ad565b503d612839565b90506060813d82116128cd575b81612872606093836119d4565b810103126109fd5760405161288681611983565b8151906001600160b81b03821682036109fd576128c260406001600160401b0394819484526128b760208201611ba9565b602085015201611c8a565b828201529150612657565b3d9150612865565b6020906128e0611e30565b82828b0101520161257a565b6001610220860152604051630c7508df60e31b815260048101839052602081602481885afa908115610a09575f91612a0c575b50604051636fcca69b60e01b815260048101849052602081602481895afa908115610a09575f916129da575b506040516348d88a5960e11b815260048101859052906020826024818a5afa918215610a09575f926129a6575b506040519261298684611983565b6001600160a01b0316835260208301526040820152610240860152612547565b9091506020813d6020116129d2575b816129c2602093836119d4565b810103126109fd5751905f612978565b3d91506129b5565b90506020813d602011612a04575b816129f5602093836119d4565b810103126109fd57515f61294b565b3d91506129e8565b90506020813d602011612a3e575b81612a27602093836119d4565b810103126109fd57612a3890611bb6565b5f61291f565b3d9150612a1a565b506040516326f6f90760e11b815260048101859052602081602481865afa908115610a09575f91612a78575b50612542565b90506020813d602011612aaa575b81612a93602093836119d4565b810103126109fd57612aa490611ba9565b5f612a72565b3d9150612a86565b6040516362518ddf60e01b81526004810182905290602082602481895afa8015610a09575f90612af3575b60019250612aec828a51611cf5565b5201612522565b506020823d8211612b1d575b81612b0c602093836119d4565b810103126109fd5760019151612add565b3d9150612aff565b9094506020813d602011612b51575b81612b41602093836119d4565b810103126109fd5751935f61250d565b3d9150612b34565b60405163f7d1852160e01b81526004810182905290602082602481895afa8015610a09575f90612b9a575b60019250612b93828551611cf5565b52016124dd565b506020823d8211612bc4575b81612bb3602093836119d4565b810103126109fd5760019151612b84565b3d9150612ba6565b90506020813d602011612bf6575b81612be7602093836119d4565b810103126109fd57515f6124c9565b3d9150612bda565b60016101a0850152602081519181808201938492010103126109fd57516101c08401525f6124a4565b5060208151101561249f565b90506020813d602011612c5d575b81612c4e602093836119d4565b810103126109fd57515f612461565b3d9150612c41565b90506020813d602011612c8f575b81612c80602093836119d4565b810103126109fd57515f612436565b3d9150612c73565b90506020813d602011612cc9575b81612cb2602093836119d4565b810103126109fd57612cc390611bb6565b5f612402565b3d9150612ca5565b90506020813d602011612d03575b81612cec602093836119d4565b810103126109fd57612cfd90611bb6565b5f6123ce565b3d9150612cdf565b612d24915060203d602011610ffc57610fee81836119d4565b5f6123a2565b90506020813d602011612d5c575b81612d45602093836119d4565b810103126109fd57612d5690611bb6565b5f612367565b3d9150612d38565b90506040813d604011612db5575b81612d7f604093836119d4565b810103126109fd57612daa602060405192612d9984611968565b612da281611bb6565b845201611c8a565b60208201525f61233d565b3d9150612d72565b612dd6915060403d6040116128515761284381836119d4565b5f612313565b90506020813d602011612e06575b81612df7602093836119d4565b810103126109fd57515f6122e9565b3d9150612dea565b90506020813d602011612e40575b81612e29602093836119d4565b810103126109fd57612e3a90611bb6565b5f6122b6565b3d9150612e1c565b90506020813d602011612e7a575b81612e63602093836119d4565b810103126109fd57612e7490611bb6565b5f612281565b3d9150612e56565b90506020813d602011612eb4575b81612e9d602093836119d4565b810103126109fd57612eae90611bb6565b5f61224b565b3d9150612e90565b81518152602091820191016121ad565b60405162461bcd60e51b8152602060048201526013602482015272195a5c0dcc4c911bdb585a5b8819985a5b1959606a1b6044820152606490fd5b612f2191945060203d6020116112345761122581836119d4565b925f61207e565b612f4291925060203d6020116112345761122581836119d4565b905f612058565b612f5d91503d805f833e61125081836119d4565b5f612032565b612f7791503d805f833e61125081836119d4565b5f61200e565b90506020813d602011612faf575b81612f98602093836119d4565b810103126109fd57612fa990611bb6565b5f611fea565b3d9150612f8b565b9093506020813d602011612feb575b81612fd3602093836119d4565b810103126109fd57612fe490611bb6565b925f611fa8565b3d9150612fc6565b90506020813d602011613025575b8161300e602093836119d4565b810103126109fd5761301f90611bb6565b5f611f74565b3d9150613001565b90506020813d60201161305f575b81613048602093836119d4565b810103126109fd5761305990611bb6565b5f611f3f565b3d915061303b565b939591949193919250906001600160a01b0316801515908161374a575b501561337c5750600260208701526040516307f1b29b60e11b8152602081600481865afa908115610a09575f91613342575b506001600160a01b03166040878101919091525163388af5b560e01b8152602081600481865afa908115610a09575f91613308575b506001600160a01b0316606087015260405163b045ff5b60e01b815292602084600481865afa938415610a09575f946132d4575b5061312984611cbd565b9261313760405194856119d4565b848452601f1961314686611cbd565b015f5b81811061329657505061012088019384525f5b85811061316c5750505050505050565b604051631f1a892160e11b8152600481018290529060a082602481865afa918215610a09575f92613266575b5060405160208101906131ab828561136c565b60a081526131ba60c0826119d4565b519020916131c9828851611cf5565b51526040516349e2903160e11b8152600481018390526001600160a01b0385166024820152606081806044810103816001600160a01b038a165afa908115610a0957600193613232928b925f91613248575b506020613229868c51611cf5565b5101528761385a565b604061323f838951611cf5565b5101520161315c565b613260915060603d81116128235761281581836119d4565b5f61321b565b61328891925060a03d811161328f575b61328081836119d4565b810190611d09565b905f613198565b503d613276565b6020906040516132a581611983565b6132ad611d6b565b81526132b7611a2b565b838201526132c3611d95565b604082015282828901015201613149565b9093506020813d602011613300575b816132f0602093836119d4565b810103126109fd5751925f61311f565b3d91506132e3565b90506020813d60201161333a575b81613323602093836119d4565b810103126109fd5761333490611bb6565b5f6130eb565b3d9150613316565b90506020813d602011613374575b8161335d602093836119d4565b810103126109fd5761336e90611bb6565b5f6130b6565b3d9150613350565b91939250906001600160a01b031680151590816136db575b50156136c857600360208601526040516307f1b29b60e11b8152602081600481875afa908115610a09575f9161368e575b506001600160a01b03166040868101919091525163388af5b560e01b8152602081600481875afa908115610a09575f91613654575b506001600160a01b03166060860152604051630399e3a560e41b8152602081600481875afa908115610a09575f9161361a575b506001600160a01b031661014086015260405163ace48b4560e01b815291602083600481875afa928315610a09575f936135e6575b5061346c83611cbd565b9161347a60405193846119d4565b838352601f1961348985611cbd565b015f5b8181106135b657505061016087019283525f5b8481106134ae57505050505050565b60405163779a968360e01b815260048101829052906020826024818a5afa918215610a09575f92613583575b50816134e7828751611cf5565b5152604051630dd5aa9b60e31b815260048101839052916020836024818b5afa8015610a095785935f9161354b575b509261353591600194602061352c868b51611cf5565b5101528561385a565b6040613542838851611cf5565b5101520161349f565b9350506020833d821161357b575b81613566602093836119d4565b810103126109fd579151849290613535613516565b3d9150613559565b9091506020813d82116135ae575b8161359e602093836119d4565b810103126109fd5751905f6134da565b3d9150613591565b6020906040516135c581611983565b5f81525f838201526135d5611d95565b60408201528282880101520161348c565b9092506020813d602011613612575b81613602602093836119d4565b810103126109fd5751915f613462565b3d91506135f5565b90506020813d60201161364c575b81613635602093836119d4565b810103126109fd5761364690611bb6565b5f61342d565b3d9150613628565b90506020813d602011613686575b8161366f602093836119d4565b810103126109fd5761368090611bb6565b5f6133fa565b3d9150613662565b90506020813d6020116136c0575b816136a9602093836119d4565b810103126109fd576136ba90611bb6565b5f6133c5565b3d915061369c565b82636364223f60e01b5f5260045260245ffd5b60249150602090604051928380926335abafe560e21b82528860048301525afa908115610a09575f91613710575b505f613394565b90506020813d602011613742575b8161372b602093836119d4565b810103126109fd5761373c90611ba9565b5f613709565b3d915061371e565b602491506020906040519283809263230dbab560e01b82528860048301525afa908115610a09575f9161377f575b505f613084565b90506020813d6020116137b1575b8161379a602093836119d4565b810103126109fd576137ab90611ba9565b5f613778565b3d915061378d565b6024915060209060405192838092632c77566560e01b82528c60048301525afa908115610a09575f916137ee575b505f611f0b565b90506020813d602011613820575b81613809602093836119d4565b810103126109fd5761381a90611ba9565b5f6137e7565b3d91506137fc565b90506020813d602011613852575b81613843602093836119d4565b810103126109fd57515f611ef2565b3d9150613836565b929190613865611d95565b604051632c3c915760e01b81526004810183905290946001600160a01b03169060a081602481855afa918215610a095760249260c0925f91613a73575b50875260405192838092632e3071cd60e11b82528660048301525afa908115610a09575f916139d6575b5060208501528351604001516001600160a01b03168061396a575b508351606001516001600160a01b0392831692168214613905575050565b6020906024604051809481936301977b5760e01b835260048301525afa908115610a09575f91613938575b506080830152565b90506020813d602011613962575b81613953602093836119d4565b810103126109fd57515f613930565b3d9150613946565b60206004916040519283809263501ad8ff60e11b82525afa5f91816139a2575b50156138e7576001604086015260608501525f6138e7565b9091506020813d6020116139ce575b816139be602093836119d4565b810103126109fd5751905f61398a565b3d91506139b1565b905060c0813d60c011613a6b575b816139f160c093836119d4565b810103126109fd57613a6060a060405192613a0b8461199e565b613a1481611c76565b8452613a2260208201611c76565b6020850152613a3360408201611c76565b6040850152613a4460608201611c76565b6060850152613a5560808201611c76565b608085015201611c76565b60a08201525f6138cc565b3d91506139e4565b613a8c915060a03d60a01161328f5761328081836119d4565b5f6138a2565b908160409103126109fd5760405190613aaa82611968565b80516001600160c01b03811681036109fd578252613aca90602001611c8a565b602082015290565b3d15613afc573d90613ae382611bca565b91613af160405193846119d4565b82523d5f602084013e565b606090565b90613b0b82611cbd565b613b1860405191826119d4565b8281528092613b29601f1991611cbd565b019060203691013756fea26469706673582212203b389202e5b1e80c800679cea21dc102af1d8cdb5bb1c2ec5bab19a99e99774064736f6c63430008230033";
