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
            internalType: "bool",
            name: "performanceFeeRecipientCanReceiveShares",
            type: "bool",
          },
          {
            internalType: "bool",
            name: "managementFeeRecipientCanReceiveShares",
            type: "bool",
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
  "0x60808060405234601557613ca4908161001a8239f35b5f80fdfe60806040526004361015610011575f80fd5b5f3560e01c630f0d54d814610024575f80fd5b34610acf57610100366003190112610acf576004356001600160a01b0381169003610acf576024356001600160a01b0381168103610acf576044356001600160a01b0381169003610acf576064356001600160a01b0381169003610acf576084356001600160a01b0381169003610acf5760a4356001600160a01b0381169003610acf5760c4356001600160a01b0381169003610acf5760e4356001600160a01b0381169003610acf576103206040526040516100e081611a5c565b5f8082526060602083018190526040830181905280830182905260809290925260a081905260c081905260e08190526101008190526101208190526101408190526101608190526101808290526101a08190526101c0919091526101e08190526102008190526102208190526102408190526102608190526102808190526102a08190526102c052610170611c74565b6102e052606061030052604051635edec50d60e01b81526001600160a01b03600480358216908301526020908290602490829086165afa908115610adb575f91611421575b50156113f9576040516338d52e0f60e01b815260208160048181356001600160a01b03165afa908115610adb575f916113bf575b506040516395d89b4160e01b81525f8160048181356001600160a01b03165afa908115610adb575f916113a5575b506040516306fdde0360e01b8152905f8260048181356001600160a01b03165afa918215610adb575f92611381575b5060405163313ce56760e01b81529160208360048181356001600160a01b03165afa918215610adb5760ff935f93611350575b506040519461028786611a5c565b60018060a01b03168552602085015260408401521660608201526080526040516338d52e0f60e01b815260208160048160018060a01b038235165afa908115610adb575f91611316575b506001600160a01b0390811660a05260405163ce04bebb60e01b815290602090829060049082908235165afa8015610adb575f906112d6575b6001600160801b031660c052506040516318160ddd60e01b815260208160048181356001600160a01b03165afa908115610adb575f916112a4575b5060e0526040516331c6651b60e21b815260208160048181356001600160a01b03165afa908115610adb575f91611272575b506101005260405163ece1d6e560e01b815260208160048181356001600160a01b03165afa8015610adb575f90611232575b6001600160401b0316610120525060405163c046371160e01b815260208160048181356001600160a01b03165afa8015610adb575f906111f2575b6001600160401b0316610140525060405163ad468d1160e01b815260208160048181356001600160a01b03165afa908115610adb575f916111b8575b506001600160a01b03908116610160526040516305c0524560e31b8152905f90829060049082908235165afa908115610adb575f91611168575b50610180526040516343bc43c160e11b815260208160048181356001600160a01b03165afa8015610adb576001600160601b03915f91611149575b50166101e05260405163537bfaeb60e11b815260208160048181356001600160a01b03165afa8015610adb576001600160601b03915f9161111a575b50166102005260405163ed27f7c960e01b815260208160048181356001600160a01b03165afa908115610adb575f916110e0575b506001600160a01b03908116610220526040516306d9a30160e41b815290602090829060049082908235165afa908115610adb575f916110a6575b506001600160a01b0390811661024052610220516040516326326d2760e21b81529082166004808301919091529091602091839160249183919035165afa908115610adb575f9161106c575b50151561026052610240516040516326326d2760e21b81526001600160a01b039182166004808301919091529091602091839160249183919035165afa908115610adb575f91611032575b5015156102805260a0516040516370a0823160e01b81526001600160a01b0360048035821690830152909160209183916024918391165afa908115610adb575f91611000575b506102a0526044356001600160a01b0316151580610f7f575b6084356001600160a01b031615159081610efc575b8080610eef575b610ecc57808115610ec5575b15156101a05215610d0c575060408051906106798183611afe565b600182525f5b601f1982018110610cc95750506101406080015261071360018060a01b0360e0608001511660405160208101916040835260046060830152637468697360e01b60808301526040820152608081526106d860a082611afe565b519020604051906106e882611a5c565b81525f60208201525f60408201525f6060820152610140608001519061070d82611e0f565b52611e0f565b505b6101c051515f5b818110610b6357610160516001600160a01b031680610b2f575b50604051630b54457960e31b815260208160048181356001600160a01b03165afa908115610adb575f91610afd575b5061076f81611df8565b61077c6040519182611afe565b818152601f1961078b83611df8565b015f5b818110610ae6575050610300525f5b818110610a1657604051602081528061088d6080516102a0602084015260018060a01b038151166102c084015260606108026107ea602084015160806102e088015261034087019061145b565b60408401518682036102bf190161030088015261145b565b91015161032084015260a080516001600160a01b03908116604086015260c080516001600160801b0316606087015260e08051608088015261010080519488019490945261012080516001600160401b03908116938901939093526101405190921690870152610160519091169185019190915261018051848303601f19019185019190915261145b565b6101a05115156101408301526101c051828203601f19016101608401528051808352602092830192909101905f5b8181106109dc57505050610972906001600160601b0361016060800151166101808401526001600160601b0361018060800151166101a084015260018060a01b036101a060800151166101c084015260018060a01b036101c060800151166101e08401526101e06080015115156102008401526102006080015115156102208401526102206080015161024084015261024060800151151561026084015261026060800151601f1984830301610280850152611572565b61030051601f19838303016102a084015280518083526020600582901b8401810193928101925f918101905b8383106109ab5786860387f35b9193955091936020806109ca600193601f198682030187528951611572565b9701930193019092869594929361099e565b91935091602060806001926060875180518352848101518584015260408101516040840152015160608201520194019101918493926108bb565b604051906313bd406b60e21b825280600483015260208260248160018060a01b03600435165afa918215610adb575f92610a92575b50610a8b81610a7660019460e4359060c4359060a43590608435906064359060443590600435611fda565b6103005190610a858383611e30565b52611e30565b500161079d565b91506020823d8211610ad3575b81610aac60209383611afe565b81010312610acf57610a8b81610a76610ac6600195611cf1565b94505050610a4b565b5f80fd5b3d9150610a9f565b6040513d5f823e3d90fd5b602090610af1611c74565b8282860101520161078e565b90506020813d602011610b27575b81610b1860209383611afe565b81010312610acf575181610765565b3d9150610b0b565b60016102c052610b599060e4359060c4359060a43590608435906064359060443590600435611fda565b6102e05280610736565b610b738161014060800151611e30565b5190815160405190632f0374dd60e21b8252600482015260208160248160018060a01b03600435165afa908115610adb575f91610c98575b50602083015281516040519063a68bafa360e01b8252600482015260208160248160018060a01b03600435165afa908115610adb575f91610c67575b5060408301528151916040519263c69507dd60e01b8452600484015260208360248160018060a01b03600435165afa928315610adb575f93610c33575b5091606060019301520161071c565b92506020833d8211610c5f575b81610c4d60209383611afe565b81010312610acf579151916060610c24565b3d9150610c40565b90506020813d8211610c90575b81610c8160209383611afe565b81010312610acf575184610be7565b3d9150610c74565b90506020813d8211610cc1575b81610cb260209383611afe565b81010312610acf575184610bab565b3d9150610ca5565b602090604051610cd881611a5c565b5f81525f838201525f60408201525f60608201528282860101520161067f565b634e487b7160e01b5f52604160045260245ffd5b1561071557610d2a6101006080015160208082518301019101611e44565b6101605160405163cc3802bf60e01b8152915f91839160a49183916001600160a01b0390911690610d5f9060048401906114b2565b5afa908115610adb575f91610e35575b508051610d7b81611df8565b90610d896040519283611afe565b808252610d98601f1991611df8565b015f5b818110610e065750506101c0525f5b8151811015610dff5780610df881610dc460019486611e30565b5160405190610dd282611a5c565b81525f60208201525f60408201525f60608201526101406080015190610a858383611e30565b5001610daa565b5050610715565b602090604051610e1581611a5c565b5f81525f838201525f60408201525f606082015282828601015201610d9b565b90503d805f833e610e468183611afe565b810190602081830312610acf578051906001600160401b038211610acf57019080601f83011215610acf578151610e7c81611df8565b92610e8a6040519485611afe565b81845260208085019260051b820101928311610acf57602001905b828210610eb55750505081610d6f565b8151815260209182019101610ea5565b508161065e565b61016051636364223f60e01b5f9081526001600160a01b03909116600452602490fd5b5061018051511515610652565b610160516040516335abafe560e21b81526001600160a01b03918216600482015291925060209082906024908290608435165afa908115610adb575f91610f45575b509061064b565b90506020813d602011610f77575b81610f6060209383611afe565b81010312610acf57610f7190611ce4565b82610f3e565b3d9150610f53565b5061016051604051632c77566560e01b81526001600160a01b0391821660048201529060209082906024908290604435165afa908115610adb575f91610fc6575b50610636565b90506020813d602011610ff8575b81610fe160209383611afe565b81010312610acf57610ff290611ce4565b81610fc0565b3d9150610fd4565b90506020813d60201161102a575b8161101b60209383611afe565b81010312610acf57518161061d565b3d915061100e565b90506020813d602011611064575b8161104d60209383611afe565b81010312610acf5761105e90611ce4565b816105d7565b3d9150611040565b90506020813d60201161109e575b8161108760209383611afe565b81010312610acf5761109890611ce4565b8161058c565b3d915061107a565b90506020813d6020116110d8575b816110c160209383611afe565b81010312610acf576110d290611cf1565b81610540565b3d91506110b4565b90506020813d602011611112575b816110fb60209383611afe565b81010312610acf5761110c90611cf1565b81610505565b3d91506110ee565b61113c915060203d602011611142575b6111348183611afe565b810190611dd9565b826104d1565b503d61112a565b611162915060203d602011611142576111348183611afe565b82610495565b90503d805f833e6111798183611afe565b810190602081830312610acf578051906001600160401b038211610acf57019080601f83011215610acf5781516111b292602001611d20565b8161045a565b90506020813d6020116111ea575b816111d360209383611afe565b81010312610acf576111e490611cf1565b81610420565b3d91506111c6565b506020813d60201161122a575b8161120c60209383611afe565b81010312610acf576112256001600160401b0391611dc5565b6103e4565b3d91506111ff565b506020813d60201161126a575b8161124c60209383611afe565b81010312610acf576112656001600160401b0391611dc5565b6103a9565b3d915061123f565b90506020813d60201161129c575b8161128d60209383611afe565b81010312610acf575181610377565b3d9150611280565b90506020813d6020116112ce575b816112bf60209383611afe565b81010312610acf575181610345565b3d91506112b2565b506020813d60201161130e575b816112f060209383611afe565b81010312610acf576113096001600160801b0391611db1565b61030a565b3d91506112e3565b90506020813d602011611348575b8161133160209383611afe565b81010312610acf5761134290611cf1565b816102d1565b3d9150611324565b61137391935060203d60201161137a575b61136b8183611afe565b810190611d98565b9185610279565b503d611361565b61139e9192503d805f833e6113968183611afe565b810190611d73565b9083610246565b6113b991503d805f833e6113968183611afe565b82610217565b90506020813d6020116113f1575b816113da60209383611afe565b81010312610acf576113eb90611cf1565b816101e9565b3d91506113cd565b63634ba39d60e11b5f9081526001600160a01b03918216600490815235909116602452604490fd5b90506020813d602011611453575b8161143c60209383611afe565b81010312610acf5761144d90611ce4565b5f6101b5565b3d915061142f565b805180835260209291819084018484015e5f828201840152601f01601f1916010190565b90602080835192838152019201905f5b81811061149c5750505090565b825184526020938401939092019160010161148f565b80516001600160a01b03908116835260208083015182169084015260408083015182169084015260608083015190911690830152608090810151910152565b60806101a0916115028482516114b2565b6001600160801b0360a0602083015182815116828801528260208201511660c08801528260408201511660e0880152826060820151166101008801528285820151166101208801520151166101408501526040810151151561016085015260608101516101808501520151910152565b60018060a01b03815116825260ff602082015116602083015260018060a01b03604082015116604083015260018060a01b0360608201511660608301526080810151608083015260018060a01b0360a08201511660a083015260c08101519061018060c084015281516102e061018085015260018060a01b0381511661046085015260a061162c611614602084015160c061048089015261052088019061145b565b604084015187820361045f19016104a089015261145b565b9160608101516104c087015260808101516104e0870152015161045f198583030161050086015260ff60f81b815116825260c061168d61167b602084015160e0602087015260e086019061145b565b6040840151858203604087015261145b565b916060810151606085015260018060a01b03608082015116608085015260a081015160a085015201519160c0818303910152602080835192838152019201905f5b818110611a46575050506020838101516001600160a01b039081166101a087015260408581015182166101c088015260608601519091166101e0870152608085015161020087015260a085015180516001600160c01b0316610220880152909101516001600160401b0316610240868101919091529091611812906117f99060c087015180516001600160a01b039081166102608b01526020909101516001600160401b03166102808a015260e088015181166102a08a01526101008801516102c08a015261012088015181166102e08a0152610140880151166103008901526101608701516103208901526101808701516103408901526101a087015115156103608901526101c08701516103808901526101e087015161017f19898303016103a08a015261147f565b61020086015187820361017f19016103c089015261147f565b9361022081015115156103e0870152015160018060a01b038151166104008601526020810151610420860152015161044084015260e08101519183810360e0850152602080845192838152019301905f5b81811061197c5750505061010081015161010084015261012081015191838103610120850152602080845192838152019301905f5b818110611917575050506101609060018060a01b0361014082015116610140850152015191610160818303910152602080835192838152019201905f5b8181106118e25750505090565b909192602061020060019261190c60408851805184528581015186850152015160408301906114f1565b0194019291016118d5565b90919360206102c0600192611971604089516119348482516114b2565b6119648682015160a08601906001600160801b036040809280518552826020820151166020860152015116910152565b01516101008301906114f1565b019501929101611898565b90919360206103006001926001600160801b0360e0895180518452858101511515868501526001600160401b0360408201511660408501526119e1606082015160608601906001600160401b036020809260018060c01b038151168552015116910152565b611a12608082015160a08601906001600160801b036040809280518552826020820151166020860152015116910152565b611a2560a08201516101008601906114f1565b60c081015183166102c08501520151166102e0820152019501929101611863565b82518452602093840193909201916001016116ce565b608081019081106001600160401b03821117610cf857604052565b60e081019081106001600160401b03821117610cf857604052565b604081019081106001600160401b03821117610cf857604052565b606081019081106001600160401b03821117610cf857604052565b60c081019081106001600160401b03821117610cf857604052565b60a081019081106001600160401b03821117610cf857604052565b90601f801991011681019081106001600160401b03821117610cf857604052565b60405190611b2c82611a77565b606060c0835f81528260208201528260408201525f838201525f60808201525f60a08201520152565b60405190611b6282611aad565b5f6040838281528260208201520152565b6040519061026082018281106001600160401b03821117610cf85760405281604051611b9e81611ac8565b5f815260606020820152606060408201525f60608201525f6080820152611bc3611b1f565b60a082015281525f60208201525f60408201525f60608201525f6080820152604051611bee81611a92565b5f81525f602082015260a0820152604051611c0881611a92565b5f81525f602082015260c08201525f60e08201525f6101008201525f6101208201525f6101408201525f6101608201525f6101808201525f6101a08201525f6101c082015260606101e082015260606102008201525f610220820152610240611c6f611b55565b910152565b6040519061018082018281106001600160401b03821117610cf8576040526060610160835f81525f60208201525f60408201525f838201525f60808201525f60a0820152611cc0611b73565b60c08201528260e08201525f610100820152826101208201525f6101408201520152565b51908115158203610acf57565b51906001600160a01b0382168203610acf57565b6001600160401b038111610cf857601f01601f191660200190565b929192611d2c82611d05565b91611d3a6040519384611afe565b829481845281830111610acf578281602093845f96015e010152565b9080601f83011215610acf578151611d7092602001611d20565b90565b90602082820312610acf5781516001600160401b038111610acf57611d709201611d56565b90816020910312610acf575160ff81168103610acf5790565b51906001600160801b0382168203610acf57565b51906001600160401b0382168203610acf57565b90816020910312610acf57516001600160601b0381168103610acf5790565b6001600160401b038111610cf85760051b60200190565b805115611e1c5760200190565b634e487b7160e01b5f52603260045260245ffd5b8051821015611e1c5760209160051b010190565b908160a0910312610acf57608060405191611e5e83611ae3565b611e6781611cf1565b8352611e7560208201611cf1565b6020840152611e8660408201611cf1565b6040840152611e9760608201611cf1565b60608401520151608082015290565b60405190611eb382611ae3565b5f6080838281528260208201528260408201528260608201520152565b60405190611edd82611ae3565b5f608083611ee9611ea6565b8152604051611ef781611ac8565b83815283602082015283604082015283606082015283838201528360a082015260208201528260408201528260608201520152565b90816060910312610acf57611f636040805192611f4884611aad565b80518452611f5860208201611db1565b602085015201611db1565b604082015290565b6040519061010082018281106001600160401b03821117610cf8576040525f60e083828152826020820152826040820152604051611fa881611a92565b8381528360208201526060820152611fbe611b55565b6080820152611fcb611ed0565b60a08201528260c08201520152565b95939091979692611fe9611c74565b6001600160a01b038481168083526040516399e9918360e01b815260048101829052929b909990929160209183916024918391165afa908115610adb575f91613963575b5060808b01526001600160a01b031680151590816138f4575b50156131a257505050600160208701526040516307f1b29b60e11b8152602081600481885afa908115610adb575f91613168575b506001600160a01b03166040878101919091525163388af5b560e01b8152602081600481885afa908115610adb575f9161312e575b506001600160a01b0316606087015260405163e4baaddf60e01b815292602084600481885afa938415610adb575f946130f2575b506001600160a01b0390931660a087018181529390612100611b73565b916040516338d52e0f60e01b8152602081600481865afa908115610adb575f916130b8575b506040516395d89b4160e01b81525f81600481875afa908115610adb575f9161309e575b506040516306fdde0360e01b81525f81600481885afa908115610adb575f91613084575b5060405163313ce56760e01b815290602082600481895afa918215610adb575f92613063575b50604051632ba9c2b360e21b8152926020846004818a5afa938415610adb575f94613042575b506121c2611b1f565b505f8060405160208101906342580cb760e11b8252600481526121e6602482611afe565b51908a5afa6121f3613c0d565b901561300757805181019060e08160208401930312610acf5760208101516001600160f81b0319811690819003610acf5760408201516001600160401b038111610acf5783602061224692850101611d56565b60608301516001600160401b038111610acf5784602061226892860101611d56565b608084015160a08501516001600160a01b0381169491939190859003610acf5760c08601519560e0810151906001600160401b038211610acf57019680603f89011215610acf5760208801516122bd81611df8565b986122cb6040519a8b611afe565b818a52602080808c019360051b83010101928311610acf57604001905b828210612ff7575050509261230e9a98959260ff9a9794928b9996936040519d8e611a77565b8d5260208d015260408c015260608b015260808a015260a089015260c08801526040519761233b89611ac8565b60018060a01b031688526020880152604087015216606085015216608083015260a08201528352604051638da5cb5b60e01b8152602081600481865afa908115610adb575f91612fbd575b506001600160a01b031660208481019190915260405163e66f53b760e01b81529081600481865afa908115610adb575f91612f83575b506001600160a01b031660408481019190915251630229549960e51b8152602081600481865afa908115610adb575f91612f49575b506001600160a01b031660608401526040516334cc866d60e21b8152602081600481865afa908115610adb575f91612f17575b50608084015260408051637cc4d9a160e01b81529081600481865afa908115610adb575f91612ef8575b5060a084015260408051633b1618dd60e11b81529081600481865afa908115610adb575f91612e9f575b5060c0840152604051631c61872f60e31b8152602081600481865afa908115610adb575f91612e65575b506001600160a01b031660e084015260405163ddca3f4360e01b8152602081600481865afa8015610adb576001600160601b03915f91612e46575b501661010084015260405163011a412160e61b8152602081600481865afa908115610adb575f91612e0c575b506001600160a01b031661012084015260405163388af5b560e01b8152602081600481865afa908115610adb575f91612dd2575b506001600160a01b03166101408401526040516318160ddd60e01b8152602081600481865afa908115610adb575f91612da0575b5061016084015260405163568efc0760e01b8152602081600481865afa908115610adb575f91612d6e575b506101808401525f806040516020810190630872d2c560e21b8252600481526125c6602482611afe565b5190855afa6125d3613c0d565b9080612d62575b612d39575b50604051630a17b31360e41b8152602081600481865afa908115610adb575f91612d07575b5061260e81613c3c565b6101e085019081525f5b828110612c945750506040516333f91ebb60e01b8152949050602085600481865afa948515610adb575f95612c60575b5061265285613c3c565b9461020085019586525f5b818110612bed5750506001600160a01b0316801515949092908580612b81575b612a27575b60c08b0194855251519461269586611df8565b946126a36040519687611afe565b868652601f196126b288611df8565b015f5b818110612a1057505060e08c019586525f5b87811061274d57505096516040516370a0823160e01b8152600481019990995260209750889650602495508694506001600160a01b0316925050505afa908115610adb575f9161271b575b50610100830152565b90506020813d602011612745575b8161273660209383611afe565b81010312610acf57515f612712565b3d9150612729565b61275d8161020084510151611e30565b5190612767611f6b565b91604051636638c7bb60e11b81528160048201526060816024818a5afa908115610adb575f91612993575b5080516001600160b81b031684526020808201511515908501526040908101516001600160401b031684820152805163518df2eb60e11b81526004810183905290816024818a5afa908115610adb575f91612965575b506060848101919091526040516349e2903160e11b8152600481018390526001600160a01b03881660248201529081806044810103816001600160a01b038c165afa908115610adb575f91612937575b5060808401528461284a8c838a613995565b60a0850152612870575b50612869816001938a5190610a858383611e30565b50016126c7565b9160405192639dbcd5b960e01b845286600485015260248401526040836044818b5afa928315610adb575f936128ca575b5082516001600160801b0390811660c083015260209093015190921660e0830152612869612854565b92506040833d821161292f575b816128e460409383611afe565b81010312610acf5781612869916001600160801b036020600196612920826040519261290f84611a92565b61291881611db1565b845201611db1565b828201529650505091506128a1565b3d91506128d7565b612958915060603d811161295e575b6129508183611afe565b810190611f2c565b5f612838565b503d612946565b612986915060403d811161298c575b61297e8183611afe565b810190613bcd565b5f6127e8565b503d612974565b90506060813d8211612a08575b816129ad60609383611afe565b81010312610acf576040516129c181611aad565b8151906001600160b81b0382168203610acf576129fd60406001600160401b0394819484526129f260208201611ce4565b602085015201611dc5565b828201529150612792565b3d91506129a0565b602090612a1b611f6b565b82828b010152016126b5565b6001610220860152604051630c7508df60e31b815260048101839052602081602481885afa908115610adb575f91612b47575b50604051636fcca69b60e01b815260048101849052602081602481895afa908115610adb575f91612b15575b506040516348d88a5960e11b815260048101859052906020826024818a5afa918215610adb575f92612ae1575b5060405192612ac184611aad565b6001600160a01b0316835260208301526040820152610240860152612682565b9091506020813d602011612b0d575b81612afd60209383611afe565b81010312610acf5751905f612ab3565b3d9150612af0565b90506020813d602011612b3f575b81612b3060209383611afe565b81010312610acf57515f612a86565b3d9150612b23565b90506020813d602011612b79575b81612b6260209383611afe565b81010312610acf57612b7390611cf1565b5f612a5a565b3d9150612b55565b506040516326f6f90760e11b815260048101859052602081602481865afa908115610adb575f91612bb3575b5061267d565b90506020813d602011612be5575b81612bce60209383611afe565b81010312610acf57612bdf90611ce4565b5f612bad565b3d9150612bc1565b6040516362518ddf60e01b81526004810182905290602082602481895afa8015610adb575f90612c2e575b60019250612c27828a51611e30565b520161265d565b506020823d8211612c58575b81612c4760209383611afe565b81010312610acf5760019151612c18565b3d9150612c3a565b9094506020813d602011612c8c575b81612c7c60209383611afe565b81010312610acf5751935f612648565b3d9150612c6f565b60405163f7d1852160e01b81526004810182905290602082602481895afa8015610adb575f90612cd5575b60019250612cce828551611e30565b5201612618565b506020823d8211612cff575b81612cee60209383611afe565b81010312610acf5760019151612cbf565b3d9150612ce1565b90506020813d602011612d31575b81612d2260209383611afe565b81010312610acf57515f612604565b3d9150612d15565b60016101a085015260208151918180820193849201010312610acf57516101c08401525f6125df565b506020815110156125da565b90506020813d602011612d98575b81612d8960209383611afe565b81010312610acf57515f61259c565b3d9150612d7c565b90506020813d602011612dca575b81612dbb60209383611afe565b81010312610acf57515f612571565b3d9150612dae565b90506020813d602011612e04575b81612ded60209383611afe565b81010312610acf57612dfe90611cf1565b5f61253d565b3d9150612de0565b90506020813d602011612e3e575b81612e2760209383611afe565b81010312610acf57612e3890611cf1565b5f612509565b3d9150612e1a565b612e5f915060203d602011611142576111348183611afe565b5f6124dd565b90506020813d602011612e97575b81612e8060209383611afe565b81010312610acf57612e9190611cf1565b5f6124a2565b3d9150612e73565b90506040813d604011612ef0575b81612eba60409383611afe565b81010312610acf57612ee5602060405192612ed484611a92565b612edd81611cf1565b845201611dc5565b60208201525f612478565b3d9150612ead565b612f11915060403d60401161298c5761297e8183611afe565b5f61244e565b90506020813d602011612f41575b81612f3260209383611afe565b81010312610acf57515f612424565b3d9150612f25565b90506020813d602011612f7b575b81612f6460209383611afe565b81010312610acf57612f7590611cf1565b5f6123f1565b3d9150612f57565b90506020813d602011612fb5575b81612f9e60209383611afe565b81010312610acf57612faf90611cf1565b5f6123bc565b3d9150612f91565b90506020813d602011612fef575b81612fd860209383611afe565b81010312610acf57612fe990611cf1565b5f612386565b3d9150612fcb565b81518152602091820191016122e8565b60405162461bcd60e51b8152602060048201526013602482015272195a5c0dcc4c911bdb585a5b8819985a5b1959606a1b6044820152606490fd5b61305c91945060203d60201161137a5761136b8183611afe565b925f6121b9565b61307d91925060203d60201161137a5761136b8183611afe565b905f612193565b61309891503d805f833e6113968183611afe565b5f61216d565b6130b291503d805f833e6113968183611afe565b5f612149565b90506020813d6020116130ea575b816130d360209383611afe565b81010312610acf576130e490611cf1565b5f612125565b3d91506130c6565b9093506020813d602011613126575b8161310e60209383611afe565b81010312610acf5761311f90611cf1565b925f6120e3565b3d9150613101565b90506020813d602011613160575b8161314960209383611afe565b81010312610acf5761315a90611cf1565b5f6120af565b3d915061313c565b90506020813d60201161319a575b8161318360209383611afe565b81010312610acf5761319490611cf1565b5f61207a565b3d9150613176565b939591949193919250906001600160a01b03168015159081613885575b50156134b75750600260208701526040516307f1b29b60e11b8152602081600481865afa908115610adb575f9161347d575b506001600160a01b03166040878101919091525163388af5b560e01b8152602081600481865afa908115610adb575f91613443575b506001600160a01b0316606087015260405163b045ff5b60e01b815292602084600481865afa938415610adb575f9461340f575b5061326484611df8565b926132726040519485611afe565b848452601f1961328186611df8565b015f5b8181106133d157505061012088019384525f5b8581106132a75750505050505050565b604051631f1a892160e11b8152600481018290529060a082602481865afa918215610adb575f926133a1575b5060405160208101906132e682856114b2565b60a081526132f560c082611afe565b51902091613304828851611e30565b51526040516349e2903160e11b8152600481018390526001600160a01b0385166024820152606081806044810103816001600160a01b038a165afa908115610adb5760019361336d928b925f91613383575b506020613364868c51611e30565b51015287613995565b604061337a838951611e30565b51015201613297565b61339b915060603d811161295e576129508183611afe565b5f613356565b6133c391925060a03d81116133ca575b6133bb8183611afe565b810190611e44565b905f6132d3565b503d6133b1565b6020906040516133e081611aad565b6133e8611ea6565b81526133f2611b55565b838201526133fe611ed0565b604082015282828901015201613284565b9093506020813d60201161343b575b8161342b60209383611afe565b81010312610acf5751925f61325a565b3d915061341e565b90506020813d602011613475575b8161345e60209383611afe565b81010312610acf5761346f90611cf1565b5f613226565b3d9150613451565b90506020813d6020116134af575b8161349860209383611afe565b81010312610acf576134a990611cf1565b5f6131f1565b3d915061348b565b91939250906001600160a01b03168015159081613816575b501561380357600360208601526040516307f1b29b60e11b8152602081600481875afa908115610adb575f916137c9575b506001600160a01b03166040868101919091525163388af5b560e01b8152602081600481875afa908115610adb575f9161378f575b506001600160a01b03166060860152604051630399e3a560e41b8152602081600481875afa908115610adb575f91613755575b506001600160a01b031661014086015260405163ace48b4560e01b815291602083600481875afa928315610adb575f93613721575b506135a783611df8565b916135b56040519384611afe565b838352601f196135c485611df8565b015f5b8181106136f157505061016087019283525f5b8481106135e957505050505050565b60405163779a968360e01b815260048101829052906020826024818a5afa918215610adb575f926136be575b5081613622828751611e30565b5152604051630dd5aa9b60e31b815260048101839052916020836024818b5afa8015610adb5785935f91613686575b5092613670916001946020613667868b51611e30565b51015285613995565b604061367d838851611e30565b510152016135da565b9350506020833d82116136b6575b816136a160209383611afe565b81010312610acf579151849290613670613651565b3d9150613694565b9091506020813d82116136e9575b816136d960209383611afe565b81010312610acf5751905f613615565b3d91506136cc565b60209060405161370081611aad565b5f81525f83820152613710611ed0565b6040820152828288010152016135c7565b9092506020813d60201161374d575b8161373d60209383611afe565b81010312610acf5751915f61359d565b3d9150613730565b90506020813d602011613787575b8161377060209383611afe565b81010312610acf5761378190611cf1565b5f613568565b3d9150613763565b90506020813d6020116137c1575b816137aa60209383611afe565b81010312610acf576137bb90611cf1565b5f613535565b3d915061379d565b90506020813d6020116137fb575b816137e460209383611afe565b81010312610acf576137f590611cf1565b5f613500565b3d91506137d7565b82636364223f60e01b5f5260045260245ffd5b60249150602090604051928380926335abafe560e21b82528860048301525afa908115610adb575f9161384b575b505f6134cf565b90506020813d60201161387d575b8161386660209383611afe565b81010312610acf5761387790611ce4565b5f613844565b3d9150613859565b602491506020906040519283809263230dbab560e01b82528860048301525afa908115610adb575f916138ba575b505f6131bf565b90506020813d6020116138ec575b816138d560209383611afe565b81010312610acf576138e690611ce4565b5f6138b3565b3d91506138c8565b6024915060209060405192838092632c77566560e01b82528c60048301525afa908115610adb575f91613929575b505f612046565b90506020813d60201161395b575b8161394460209383611afe565b81010312610acf5761395590611ce4565b5f613922565b3d9150613937565b90506020813d60201161398d575b8161397e60209383611afe565b81010312610acf57515f61202d565b3d9150613971565b9291906139a0611ed0565b604051632c3c915760e01b81526004810183905290946001600160a01b03169060a081602481855afa918215610adb5760249260c0925f91613bae575b50875260405192838092632e3071cd60e11b82528660048301525afa908115610adb575f91613b11575b5060208501528351604001516001600160a01b031680613aa5575b508351606001516001600160a01b0392831692168214613a40575050565b6020906024604051809481936301977b5760e01b835260048301525afa908115610adb575f91613a73575b506080830152565b90506020813d602011613a9d575b81613a8e60209383611afe565b81010312610acf57515f613a6b565b3d9150613a81565b60206004916040519283809263501ad8ff60e11b82525afa5f9181613add575b5015613a22576001604086015260608501525f613a22565b9091506020813d602011613b09575b81613af960209383611afe565b81010312610acf5751905f613ac5565b3d9150613aec565b905060c0813d60c011613ba6575b81613b2c60c09383611afe565b81010312610acf57613b9b60a060405192613b4684611ac8565b613b4f81611db1565b8452613b5d60208201611db1565b6020850152613b6e60408201611db1565b6040850152613b7f60608201611db1565b6060850152613b9060808201611db1565b608085015201611db1565b60a08201525f613a07565b3d9150613b1f565b613bc7915060a03d60a0116133ca576133bb8183611afe565b5f6139dd565b90816040910312610acf5760405190613be582611a92565b80516001600160c01b0381168103610acf578252613c0590602001611dc5565b602082015290565b3d15613c37573d90613c1e82611d05565b91613c2c6040519384611afe565b82523d5f602084013e565b606090565b90613c4682611df8565b613c536040519182611afe565b8281528092613c64601f1991611df8565b019060203691013756fea26469706673582212201428e8244a06db004c0dea1f548b572064fe03f66219d6c89ad56730ca7b0f2164736f6c63430008230033";
