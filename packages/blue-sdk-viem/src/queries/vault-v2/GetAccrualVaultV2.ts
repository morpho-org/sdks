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
        internalType: "contract IMidnightAdapterFactory",
        name: "midnightAdapterFactory",
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
                internalType: "uint256",
                name: "vaultV1ParentAllocation",
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
              {
                components: [
                  {
                    internalType: "address",
                    name: "parentVault",
                    type: "address",
                  },
                  {
                    internalType: "address",
                    name: "asset",
                    type: "address",
                  },
                  {
                    internalType: "address",
                    name: "skimRecipient",
                    type: "address",
                  },
                  {
                    internalType: "address",
                    name: "midnight",
                    type: "address",
                  },
                  {
                    internalType: "uint32",
                    name: "maxTtm",
                    type: "uint32",
                  },
                  {
                    internalType: "uint64",
                    name: "minRate",
                    type: "uint64",
                  },
                  {
                    internalType: "bool",
                    name: "noSalesWithShortfall",
                    type: "bool",
                  },
                  {
                    internalType: "bool",
                    name: "noSalesBelowFaceValue",
                    type: "bool",
                  },
                  {
                    internalType: "uint256[]",
                    name: "durations",
                    type: "uint256[]",
                  },
                  {
                    internalType: "uint256[]",
                    name: "durationAllocations",
                    type: "uint256[]",
                  },
                  {
                    components: [
                      {
                        internalType: "bytes32",
                        name: "id",
                        type: "bytes32",
                      },
                      {
                        components: [
                          {
                            internalType: "uint128",
                            name: "netCredit",
                            type: "uint128",
                          },
                          {
                            internalType: "uint64",
                            name: "rate",
                            type: "uint64",
                          },
                          {
                            internalType: "uint48",
                            name: "maturity",
                            type: "uint48",
                          },
                          {
                            internalType: "uint8",
                            name: "index",
                            type: "uint8",
                          },
                          {
                            internalType: "bool",
                            name: "forceSellable",
                            type: "bool",
                          },
                        ],
                        internalType: "struct MidnightAdapterMarketData",
                        name: "marketData",
                        type: "tuple",
                      },
                      {
                        components: [
                          {
                            internalType: "uint128",
                            name: "credit",
                            type: "uint128",
                          },
                          {
                            internalType: "uint128",
                            name: "pendingFee",
                            type: "uint128",
                          },
                          {
                            internalType: "uint128",
                            name: "lastLossFactor",
                            type: "uint128",
                          },
                          {
                            internalType: "uint128",
                            name: "lastAccrual",
                            type: "uint128",
                          },
                        ],
                        internalType: "struct MidnightAdapterPosition",
                        name: "position",
                        type: "tuple",
                      },
                      {
                        internalType: "uint128",
                        name: "lossFactor",
                        type: "uint128",
                      },
                    ],
                    internalType: "struct MidnightAdapterMarketResponse[]",
                    name: "markets",
                    type: "tuple[]",
                  },
                  {
                    internalType: "uint256",
                    name: "timestamp",
                    type: "uint256",
                  },
                ],
                internalType: "struct VaultV2MidnightAdapterResponse",
                name: "midnightAdapter",
                type: "tuple",
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
                internalType: "uint256",
                name: "vaultV1ParentAllocation",
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
              {
                components: [
                  {
                    internalType: "address",
                    name: "parentVault",
                    type: "address",
                  },
                  {
                    internalType: "address",
                    name: "asset",
                    type: "address",
                  },
                  {
                    internalType: "address",
                    name: "skimRecipient",
                    type: "address",
                  },
                  {
                    internalType: "address",
                    name: "midnight",
                    type: "address",
                  },
                  {
                    internalType: "uint32",
                    name: "maxTtm",
                    type: "uint32",
                  },
                  {
                    internalType: "uint64",
                    name: "minRate",
                    type: "uint64",
                  },
                  {
                    internalType: "bool",
                    name: "noSalesWithShortfall",
                    type: "bool",
                  },
                  {
                    internalType: "bool",
                    name: "noSalesBelowFaceValue",
                    type: "bool",
                  },
                  {
                    internalType: "uint256[]",
                    name: "durations",
                    type: "uint256[]",
                  },
                  {
                    internalType: "uint256[]",
                    name: "durationAllocations",
                    type: "uint256[]",
                  },
                  {
                    components: [
                      {
                        internalType: "bytes32",
                        name: "id",
                        type: "bytes32",
                      },
                      {
                        components: [
                          {
                            internalType: "uint128",
                            name: "netCredit",
                            type: "uint128",
                          },
                          {
                            internalType: "uint64",
                            name: "rate",
                            type: "uint64",
                          },
                          {
                            internalType: "uint48",
                            name: "maturity",
                            type: "uint48",
                          },
                          {
                            internalType: "uint8",
                            name: "index",
                            type: "uint8",
                          },
                          {
                            internalType: "bool",
                            name: "forceSellable",
                            type: "bool",
                          },
                        ],
                        internalType: "struct MidnightAdapterMarketData",
                        name: "marketData",
                        type: "tuple",
                      },
                      {
                        components: [
                          {
                            internalType: "uint128",
                            name: "credit",
                            type: "uint128",
                          },
                          {
                            internalType: "uint128",
                            name: "pendingFee",
                            type: "uint128",
                          },
                          {
                            internalType: "uint128",
                            name: "lastLossFactor",
                            type: "uint128",
                          },
                          {
                            internalType: "uint128",
                            name: "lastAccrual",
                            type: "uint128",
                          },
                        ],
                        internalType: "struct MidnightAdapterPosition",
                        name: "position",
                        type: "tuple",
                      },
                      {
                        internalType: "uint128",
                        name: "lossFactor",
                        type: "uint128",
                      },
                    ],
                    internalType: "struct MidnightAdapterMarketResponse[]",
                    name: "markets",
                    type: "tuple[]",
                  },
                  {
                    internalType: "uint256",
                    name: "timestamp",
                    type: "uint256",
                  },
                ],
                internalType: "struct VaultV2MidnightAdapterResponse",
                name: "midnightAdapter",
                type: "tuple",
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
  "0x60808060405234601557614746908161001a8239f35b5f80fdfe60806040526004361015610011575f80fd5b5f3560e01c630f0d54d814610024575f80fd5b34610af257610100366003190112610af2576004356001600160a01b0381169003610af2576024356001600160a01b0381168103610af2576044356001600160a01b0381169003610af2576064356001600160a01b0381169003610af2576084356001600160a01b0381169003610af25760a4356001600160a01b0381169003610af25760c4356001600160a01b0381169003610af25760e4356001600160a01b0381169003610af2576103206040526040516100e081611c74565b5f8082526060602083018190526040830181905280830182905260809290925260a081905260c081905260e08190526101008190526101208190526101408190526101608190526101808290526101a08190526101c0919091526101e08190526102008190526102208190526102408190526102608190526102808190526102a08190526102c052610170611ebf565b6102e052606061030052604051635edec50d60e01b81526001600160a01b03600480358216908301526020908290602490829086165afa908115610afe575f91611516575b50156114ee576040516338d52e0f60e01b815260208160048181356001600160a01b03165afa908115610afe575f916114b4575b506040516395d89b4160e01b81525f8160048181356001600160a01b03165afa908115610afe575f9161149a575b506040516306fdde0360e01b8152905f8260048181356001600160a01b03165afa918215610afe575f92611476575b5060405163313ce56760e01b81529160208360048181356001600160a01b03165afa918215610afe575f9261143a575b60ff93506040519461028786611c74565b60018060a01b03168552602085015260408401521660608201526080526040516338d52e0f60e01b815260208160048160018060a01b038235165afa908115610afe575f91611400575b506001600160a01b0390811660a05260405163ce04bebb60e01b815290602090829060049082908235165afa8015610afe575f906113c0575b6001600160801b031660c052506040516318160ddd60e01b815260208160048181356001600160a01b03165afa908115610afe575f9161138e575b5060e0526040516331c6651b60e21b815260208160048181356001600160a01b03165afa908115610afe575f9161135c575b506101005260405163ece1d6e560e01b815260208160048181356001600160a01b03165afa8015610afe575f9061131c575b6001600160401b0316610120525060405163c046371160e01b815260208160048181356001600160a01b03165afa8015610afe575f906112dc575b6001600160401b0316610140525060405163ad468d1160e01b815260208160048181356001600160a01b03165afa908115610afe575f916112a2575b506001600160a01b03908116610160526040516305c0524560e31b8152905f90829060049082908235165afa908115610afe575f91611252575b50610180526040516343bc43c160e11b815260208160048181356001600160a01b03165afa8015610afe576001600160601b03915f91611233575b50166101e05260405163537bfaeb60e11b815260208160048181356001600160a01b03165afa8015610afe576001600160601b03915f91611204575b50166102005260405163ed27f7c960e01b815260208160048181356001600160a01b03165afa908115610afe575f916111ca575b506001600160a01b03908116610220526040516306d9a30160e41b815290602090829060049082908235165afa908115610afe575f91611190575b506001600160a01b0316610240526101e0516001600160601b03161561118957610220516040516326326d2760e21b81526001600160a01b039182166004808301919091529091602091839160249183919035165afa908115610afe575f9161114f575b505b151561026052610200516001600160601b03161561114857610240516040516326326d2760e21b81526001600160a01b039182166004808301919091529091602091839160249183919035165afa908115610afe575f9161110e575b505b15156102805260a0516040516370a0823160e01b81526001600160a01b0360048035821690830152909160209183916024918391165afa908115610afe575f916110dc575b506102a0526044356001600160a01b031615158061105b575b6084356001600160a01b0316151580610fda575b6101605161068f906001600160a01b031660a435612191565b918080610fcd575b610faa57808115610fa3575b8015610f9c575b15156101a05215610db95750506106bf6120c1565b6101c05261016051604051610736916020820191906106fb9082906106ed906001600160a01b031685612101565b03601f198101835282611d16565b5190206040519061070b82611c74565b81525f60208201525f60408201525f6060820152610140608001519061073082612068565b52612068565b505b6101c051515f5b818110610c5357610160516001600160a01b031680610b52575b50604051630b54457960e31b815260208160048181356001600160a01b03165afa908115610afe575f91610b20575b5061079281612051565b61079f6040519182611d16565b818152601f196107ae83612051565b015f5b818110610b09575050610300525f5b818110610a395760405160208152806108b06080516102a0602084015260018060a01b038151166102c0840152606061082561080d602084015160806102e0880152610340870190611564565b60408401518682036102bf1901610300880152611564565b91015161032084015260a080516001600160a01b03908116604086015260c080516001600160801b0316606087015260e08051608088015261010080519488019490945261012080516001600160401b03908116938901939093526101405190921690870152610160519091169185019190915261018051848303601f190191850191909152611564565b6101a05115156101408301526101c051828203601f19016101608401528051808352602092830192909101905f5b8181106109ff57505050610995906001600160601b0361016060800151166101808401526001600160601b0361018060800151166101a084015260018060a01b036101a060800151166101c084015260018060a01b036101c060800151166101e08401526101e06080015115156102008401526102006080015115156102208401526102206080015161024084015261024060800151151561026084015261026060800151601f198483030161028085015261167b565b61030051601f19838303016102a084015280518083526020600582901b8401810193928101925f918101905b8383106109ce5786860387f35b9193955091936020806109ed600193601f19868203018752895161167b565b970193019301909286959492936109c1565b91935091602060806001926060875180518352848101518584015260408101516040840152015160608201520194019101918493926108de565b604051906313bd406b60e21b825280600483015260208260248160018060a01b03600435165afa918215610afe575f92610ab5575b50610aae81610a9960019460e4359060c4359060a4359060843590606435906044359060043561235a565b6103005190610aa88383612089565b52612089565b50016107c0565b91506020823d8211610af6575b81610acf60209383611d16565b81010312610af257610aae81610a99610ae9600195611f55565b94505050610a6e565b5f80fd5b3d9150610ac2565b6040513d5f823e3d90fd5b602090610b14611ebf565b828286010152016107b1565b90506020813d602011610b4a575b81610b3b60209383611d16565b81010312610af2575181610788565b3d9150610b2e565b60016102c0526040516368c18beb60e01b81526004808201929092529060209082906024908290356001600160a01b03165afa908115610afe575f91610c19575b5080610bfa575b15610bc657610160516102e080516001600160a01b039092169091525160046020909101525b80610759565b610bf160e43560c43560a43560843560643560443560018060a01b0360e0608001511660043561235a565b6102e052610bc0565b5061016051610c14906001600160a01b031660a435612191565b610b9a565b90506020813d602011610c4b575b81610c3460209383611d16565b81010312610af257610c4590611f48565b81610b93565b3d9150610c27565b610c638161014060800151612089565b5190815160405190632f0374dd60e21b8252600482015260208160248160018060a01b03600435165afa908115610afe575f91610d88575b50602083015281516040519063a68bafa360e01b8252600482015260208160248160018060a01b03600435165afa908115610afe575f91610d57575b5060408301528151916040519263c69507dd60e01b8452600484015260208360248160018060a01b03600435165afa928315610afe575f93610d23575b5091606060019301520161073f565b92506020833d8211610d4f575b81610d3d60209383611d16565b81010312610af2579151916060610d14565b3d9150610d30565b90506020813d8211610d80575b81610d7160209383611d16565b81010312610af2575184610cd7565b3d9150610d64565b90506020813d8211610db1575b81610da260209383611d16565b81010312610af2575184610c9b565b3d9150610d95565b15610f5b5750610dd8610100608001516020808251830101910161212f565b6101605160405163cc3802bf60e01b8152915f91839160a49183916001600160a01b0390911690610e0d9060048401906115bb565b5afa908115610afe575f91610ecb575b508051610e2981612051565b90610e376040519283611d16565b808252610e46601f1991612051565b015f5b818110610eb45750506101c0525f5b8151811015610ead5780610ea681610e7260019486612089565b5160405190610e8082611c74565b81525f60208201525f60408201525f60608201526101406080015190610aa88383612089565b5001610e58565b5050610738565b602090610ebf61209d565b82828601015201610e49565b90503d805f833e610edc8183611d16565b810190602081830312610af2578051906001600160401b038211610af257019080601f83011215610af2578151610f1281612051565b92610f206040519485611d16565b81845260208085019260051b820101928311610af257602001905b828210610f4b5750505081610e1d565b8151815260209182019101610f3b565b1561073857610f686120c1565b6101c05261016051604051610f96916020820191906106fb9082906106ed906001600160a01b031685612101565b50610738565b50826106aa565b50816106a3565b61016051636364223f60e01b5f9081526001600160a01b03909116600452602490fd5b5061018051511515610697565b50610160516040516335abafe560e21b81526001600160a01b0391821660048201529060209082906024908290608435165afa908115610afe575f91611021575b50610676565b90506020813d602011611053575b8161103c60209383611d16565b81010312610af25761104d90611f48565b8261101b565b3d915061102f565b5061016051604051632c77566560e01b81526001600160a01b0391821660048201529060209082906024908290604435165afa908115610afe575f916110a2575b50610662565b90506020813d6020116110d4575b816110bd60209383611d16565b81010312610af2576110ce90611f48565b8161109c565b3d91506110b0565b90506020813d602011611106575b816110f760209383611d16565b81010312610af2575181610649565b3d91506110ea565b90506020813d602011611140575b8161112960209383611d16565b81010312610af25761113a90611f48565b81610602565b3d915061111c565b6001610604565b90506020813d602011611181575b8161116a60209383611d16565b81010312610af25761117b90611f48565b816105a4565b3d915061115d565b60016105a6565b90506020813d6020116111c2575b816111ab60209383611d16565b81010312610af2576111bc90611f55565b81610540565b3d915061119e565b90506020813d6020116111fc575b816111e560209383611d16565b81010312610af2576111f690611f55565b81610505565b3d91506111d8565b611226915060203d60201161122c575b61121e8183611d16565b810190612032565b826104d1565b503d611214565b61124c915060203d60201161122c5761121e8183611d16565b82610495565b90503d805f833e6112638183611d16565b810190602081830312610af2578051906001600160401b038211610af257019080601f83011215610af257815161129c92602001611f84565b8161045a565b90506020813d6020116112d4575b816112bd60209383611d16565b81010312610af2576112ce90611f55565b81610420565b3d91506112b0565b506020813d602011611314575b816112f660209383611d16565b81010312610af25761130f6001600160401b039161201e565b6103e4565b3d91506112e9565b506020813d602011611354575b8161133660209383611d16565b81010312610af25761134f6001600160401b039161201e565b6103a9565b3d9150611329565b90506020813d602011611386575b8161137760209383611d16565b81010312610af2575181610377565b3d915061136a565b90506020813d6020116113b8575b816113a960209383611d16565b81010312610af2575181610345565b3d915061139c565b506020813d6020116113f8575b816113da60209383611d16565b81010312610af2576113f36001600160801b039161200a565b61030a565b3d91506113cd565b90506020813d602011611432575b8161141b60209383611d16565b81010312610af25761142c90611f55565b816102d1565b3d915061140e565b91506020833d60201161146e575b8161145560209383611d16565b81010312610af25761146860ff93611ffc565b91610276565b3d9150611448565b6114939192503d805f833e61148b8183611d16565b810190611fd7565b9083610246565b6114ae91503d805f833e61148b8183611d16565b82610217565b90506020813d6020116114e6575b816114cf60209383611d16565b81010312610af2576114e090611f55565b816101e9565b3d91506114c2565b63634ba39d60e11b5f9081526001600160a01b03918216600490815235909116602452604490fd5b90506020813d602011611548575b8161153160209383611d16565b81010312610af25761154290611f48565b5f6101b5565b3d9150611524565b634e487b7160e01b5f52604160045260245ffd5b805180835260209291819084018484015e5f828201840152601f01601f1916010190565b90602080835192838152019201905f5b8181106115a55750505090565b8251845260209384019390920191600101611598565b80516001600160a01b03908116835260208083015182169084015260408083015182169084015260608083015190911690830152608090810151910152565b60806101a09161160b8482516115bb565b6001600160801b0360a0602083015182815116828801528260208201511660c08801528260408201511660e0880152826060820151166101008801528285820151166101208801520151166101408501526040810151151561016085015260608101516101808501520151910152565b60018060a01b03815116825260ff602082015116602083015260018060a01b03604082015116604083015260018060a01b0360608201511660608301526080810151608083015260018060a01b0360a08201511660a08301526118fb60c08201516101c060c08501526102006118e56117d983516102606101c089015260018060a01b0381511661042089015260a0611740611728602084015160c06104408d01526104e08c0190611564565b60408401518b820361041f19016104608d0152611564565b9160608101516104808b015260808101516104a08b015201519061041f19898203016104c08a015260ff60f81b825116815260c06117a2611790602085015160e0602086015260e0850190611564565b60408501518482036040860152611564565b926060810151606084015260018060a01b03608082015116608084015260a081015160a084015201519060c0818403910152611588565b6020848101516001600160a01b039081166101e08a015260408601518116858a0152606086015116610220890152608085015161024089015260a085015180516001600160c01b03166102608a015201516001600160401b031661028088015260c084015180516001600160a01b039081166102a08a01526020909101516001600160401b03166102c089015260e085015181166102e08901526101008501516103008901526101208501518116610320890152610140850151166103408801526101608401516103608801526101808401516103808801526101a084015115156103a08801526101c08401516103c08801526101e08401516101bf19888303016103e0890152611588565b9101518482036101bf1901610400860152611588565b9060e08101519183810360e0850152602080845192838152019301905f5b818110611bd95750505061010081015161010084015261012081015161012084015261014081015191838103610140850152602080845192838152019301905f5b818110611b745750505060018060a01b036101608201511661016084015261018081015191838103610180850152602080845192838152019301905f5b818110611b3f575050506101a00151916101a081830391015260018060a01b03825116815260018060a01b03602083015116602082015260018060a01b03604083015116604082015260018060a01b03606083015116606082015263ffffffff60808301511660808201526001600160401b0360a08301511660a082015260c0820151151560c082015260e0820151151560e0820152611a61611a4d610100840151610180610100850152610180840190611588565b610120840151838203610120850152611588565b9161014081015192828103610140840152602080855192838152019401905f5b818110611a98575050506101608091015191015290565b90919460206101606001926001600160801b0360608a518051845260808682015184815116888701526001600160401b038882015116604087015265ffffffffffff6040820151168487015260ff8482015116828701520151151560a0850152828260408301518281511660c088015282898201511660e0880152826040820151166101008801520151166101208501520151166101408201520196019101919091611a81565b9091936020610200600192611b6960408951805184528581015186850152015160408301906115fa565b019501929101611997565b90919360206102c0600192611bce60408951611b918482516115bb565b611bc18682015160a08601906001600160801b036040809280518552826020820151166020860152015116910152565b01516101008301906115fa565b01950192910161195a565b90919360206102c0600192611c6960a0895180518452858101511515868501526001600160401b036040820151166040850152611c39606082015160608601906001600160401b036020809260018060c01b038151168552015116910152565b611bc16080820151838601906001600160801b036040809280518552826020820151166020860152015116910152565b019501929101611919565b608081019081106001600160401b0382111761155057604052565b60e081019081106001600160401b0382111761155057604052565b604081019081106001600160401b0382111761155057604052565b60c081019081106001600160401b0382111761155057604052565b60a081019081106001600160401b0382111761155057604052565b606081019081106001600160401b0382111761155057604052565b90601f801991011681019081106001600160401b0382111761155057604052565b60405190611d4482611c8f565b606060c0835f81528260208201528260408201525f838201525f60808201525f60a08201520152565b6040519061022082018281106001600160401b0382111761155057604052606061020083604051611d9d81611cc5565b5f81528360208201528360408201525f848201525f6080820152611dbf611d37565b60a082015281525f60208201525f60408201525f838201525f6080820152604051611de981611caa565b5f81525f602082015260a0820152604051611e0381611caa565b5f81525f602082015260c08201525f60e08201525f6101008201525f6101208201525f6101408201525f6101608201525f6101808201525f6101a08201525f6101c0820152826101e08201520152565b6040519061018082018281106001600160401b03821117611550576040525f610160838281528260208201528260408201528260608201528260808201528260a08201528260c08201528260e08201526060610100820152606061012082015260606101408201520152565b604051906101c082018281106001600160401b0382111761155057604052815f81525f60208201525f60408201525f60608201525f60808201525f60a0820152611f07611d6d565b60c0820152606060e08201525f6101008201525f61012082015260606101408201525f61016082015260606101808201526101a0611f43611e53565b910152565b51908115158203610af257565b51906001600160a01b0382168203610af257565b6001600160401b03811161155057601f01601f191660200190565b929192611f9082611f69565b91611f9e6040519384611d16565b829481845281830111610af2578281602093845f96015e010152565b9080601f83011215610af2578151611fd492602001611f84565b90565b90602082820312610af25781516001600160401b038111610af257611fd49201611fba565b519060ff82168203610af257565b51906001600160801b0382168203610af257565b51906001600160401b0382168203610af257565b90816020910312610af257516001600160601b0381168103610af25790565b6001600160401b0381116115505760051b60200190565b8051156120755760200190565b634e487b7160e01b5f52603260045260245ffd5b80518210156120755760209160051b010190565b604051906120aa82611c74565b5f6060838281528260208201528260408201520152565b604080519091906120d28382611d16565b6001815291601f1901825f5b8281106120ea57505050565b6020906120f561209d565b828285010152016120de565b6040808252600490820152637468697360e01b60608201526001600160a01b03909116602082015260800190565b908160a0910312610af25760806040519161214983611ce0565b61215281611f55565b835261216060208201611f55565b602084015261217160408201611f55565b604084015261218260608201611f55565b60608401520151608082015290565b6001600160a01b0316801515918261221e575b826121ae57505090565b60405163810e893360e01b81526001600160a01b0390911660048201529150602090829060249082905afa908115610afe575f916121ea575090565b90506020813d602011612216575b8161220560209383611d16565b81010312610af257611fd490611f48565b3d91506121f8565b813b151592506121a4565b6040519061223682611ce0565b5f6080838281528260208201528260408201528260608201520152565b6040519061226082611ce0565b5f60808361226c612229565b815260405161227a81611cc5565b83815283602082015283604082015283606082015283838201528360a082015260208201528260408201528260608201520152565b604051906122bc82611cfb565b5f6040838281528260208201520152565b90816060910312610af25761230460408051926122e984611cfb565b805184526122f96020820161200a565b60208501520161200a565b604082015290565b6040519061231982611cc5565b815f81525f60208201525f604082015260405161233581611caa565b5f81525f6020820152606082015261234b6122af565b608082015260a0611f43612253565b959491979693909261236a611ebf565b6001600160a01b038581168083526040516399e9918360e01b815260048101829052929b909990929160209183916024918391165afa908115610afe575f91614363575b5060808b01526001600160a01b031680151590816142f4575b50156132a85750505050600160208601526040516307f1b29b60e11b8152602081600481875afa908115610afe575f9161326e575b506001600160a01b03166040868101919091525163388af5b560e01b8152602081600481875afa908115610afe575f91613234575b506001600160a01b0316606086015260405163e4baaddf60e01b815291602083600481875afa928315610afe575f936131f8575b506001600160a01b0390921660a0860181815292612481611d6d565b926040516338d52e0f60e01b8152602081600481875afa908115610afe575f916131be575b506040516395d89b4160e01b81525f81600481885afa908115610afe575f916131a4575b506040516306fdde0360e01b81525f81600481895afa908115610afe575f9161318a575b5060405163313ce56760e01b81526020816004818a5afa908115610afe575f91613150575b50604051632ba9c2b360e21b8152906020826004818b5afa918215610afe575f92613114575b50612542611d37565b505f8060405160208101906342580cb760e11b825260048152612566602482611d16565b51908b5afa906125746146af565b91156130d957815182019360e08360208701960312610af25760208301516001600160f81b031981169690879003610af25760408401516001600160401b038111610af2578660206125c892870101611fba565b9660608501516001600160401b038111610af2578760206125eb92880101611fba565b608086015160a08701516001600160a01b0381169190829003610af25760c08801519260e08901519b6001600160401b038d11610af25761263760ff9c60206126429f8f9d01016143a6565b956040519d8e611c8f565b8d5260208d015260408c015260608b015260808a015260a089015260c08801526040519761266f89611cc5565b60018060a01b031688526020880152604087015216606085015216608083015260a08201528452604051638da5cb5b60e01b8152602081600481875afa908115610afe575f9161309f575b506001600160a01b031660208581019190915260405163e66f53b760e01b81529081600481875afa908115610afe575f91613065575b506001600160a01b031660408581019190915251630229549960e51b8152602081600481875afa908115610afe575f9161302b575b506001600160a01b031660608501526040516334cc866d60e21b8152602081600481875afa908115610afe575f91612ff9575b50608085015260408051637cc4d9a160e01b81529081600481875afa908115610afe575f91612fda575b5060a085015260408051633b1618dd60e11b81529081600481875afa908115610afe575f91612f81575b5060c0850152604051631c61872f60e31b8152602081600481875afa908115610afe575f91612f47575b506001600160a01b031660e085015260405163ddca3f4360e01b8152602081600481875afa8015610afe576001600160601b03915f91612f28575b501661010085015260405163011a412160e61b8152602081600481875afa908115610afe575f91612eee575b506001600160a01b031661012085015260405163388af5b560e01b8152602081600481875afa908115610afe575f91612eb4575b506001600160a01b03166101408501526040516318160ddd60e01b8152602081600481875afa908115610afe575f91612e82575b5061016085015260405163568efc0760e01b8152602081600481875afa908115610afe575f91612e50575b506101808501525f806040516020810190630872d2c560e21b8252600481526128fa602482611d16565b5190865afa6129076146af565b9080612e44575b612e1b575b50604051630a17b31360e41b8152602081600481875afa908115610afe575f91612de9575b50612942816146de565b6101e086019081525f5b828110612d765750506040516333f91ebb60e01b81529050602081600481875afa908115610afe575f91612d44575b50612985816146de565b9061020086019182525f5b818110612cd157505060c089019485525151926129ac84612051565b946129ba6040519687611d16565b848652601f196129c986612051565b015f5b818110612cba57505060e08a019586525f5b858110612ac357505094516040516370a0823160e01b815260048101889052955060209450859350602492508391506001600160a01b03165afa908115610afe575f91612a90575b50610100840152604051634450bdef60e11b815290602090829060049082905afa908115610afe575f91612a5e575b50610120830152565b90506020813d602011612a88575b81612a7960209383611d16565b81010312610af257515f612a55565b3d9150612a6c565b90506020813d602011612abb575b81612aab60209383611d16565b81010312610af257516004612a26565b3d9150612a9e565b612ad38161020084510151612089565b5190612add61230c565b91604051636638c7bb60e11b8152816004820152606081602481895afa908115610afe575f91612c3d575b5080516001600160b81b031684526020808201511515908501526040908101516001600160401b031684820152805163518df2eb60e11b8152600481018390529081602481895afa908115610afe575f91612c0f575b506060848101919091526040516349e2903160e11b8152600481018390526001600160a01b0387166024820152919082806044810103816001600160a01b038c165afa938415610afe57612bc8888593600197612bda965f91612be1575b5060808501528b614437565b60a08201528a5190610aa88383612089565b50016129de565b612c02915060603d8111612c08575b612bfa8183611d16565b8101906122cd565b5f612bbc565b503d612bf0565b612c30915060403d8111612c36575b612c288183611d16565b81019061466f565b5f612b5e565b503d612c1e565b90506060813d8211612cb2575b81612c5760609383611d16565b81010312610af257604051612c6b81611cfb565b8151906001600160b81b0382168203610af257612ca760406001600160401b039481948452612c9c60208201611f48565b60208501520161201e565b828201529150612b08565b3d9150612c4a565b602090612cc561230c565b82828b010152016129cc565b6040516362518ddf60e01b815260048101829052906020826024818a5afa8015610afe575f90612d12575b60019250612d0b828651612089565b5201612990565b506020823d8211612d3c575b81612d2b60209383611d16565b81010312610af25760019151612cfc565b3d9150612d1e565b90506020813d602011612d6e575b81612d5f60209383611d16565b81010312610af257515f61297b565b3d9150612d52565b60405163f7d1852160e01b815260048101829052906020826024818a5afa8015610afe575f90612db7575b60019250612db0828551612089565b520161294c565b506020823d8211612de1575b81612dd060209383611d16565b81010312610af25760019151612da1565b3d9150612dc3565b90506020813d602011612e13575b81612e0460209383611d16565b81010312610af257515f612938565b3d9150612df7565b60016101a086015260208151918180820193849201010312610af257516101c08501525f612913565b5060208151101561290e565b90506020813d602011612e7a575b81612e6b60209383611d16565b81010312610af257515f6128d0565b3d9150612e5e565b90506020813d602011612eac575b81612e9d60209383611d16565b81010312610af257515f6128a5565b3d9150612e90565b90506020813d602011612ee6575b81612ecf60209383611d16565b81010312610af257612ee090611f55565b5f612871565b3d9150612ec2565b90506020813d602011612f20575b81612f0960209383611d16565b81010312610af257612f1a90611f55565b5f61283d565b3d9150612efc565b612f41915060203d60201161122c5761121e8183611d16565b5f612811565b90506020813d602011612f79575b81612f6260209383611d16565b81010312610af257612f7390611f55565b5f6127d6565b3d9150612f55565b90506040813d604011612fd2575b81612f9c60409383611d16565b81010312610af257612fc7602060405192612fb684611caa565b612fbf81611f55565b84520161201e565b60208201525f6127ac565b3d9150612f8f565b612ff3915060403d604011612c3657612c288183611d16565b5f612782565b90506020813d602011613023575b8161301460209383611d16565b81010312610af257515f612758565b3d9150613007565b90506020813d60201161305d575b8161304660209383611d16565b81010312610af25761305790611f55565b5f612725565b3d9150613039565b90506020813d602011613097575b8161308060209383611d16565b81010312610af25761309190611f55565b5f6126f0565b3d9150613073565b90506020813d6020116130d1575b816130ba60209383611d16565b81010312610af2576130cb90611f55565b5f6126ba565b3d91506130ad565b60405162461bcd60e51b8152602060048201526013602482015272195a5c0dcc4c911bdb585a5b8819985a5b1959606a1b6044820152606490fd5b9091506020813d602011613148575b8161313060209383611d16565b81010312610af25761314190611ffc565b905f612539565b3d9150613123565b90506020813d602011613182575b8161316b60209383611d16565b81010312610af25761317c90611ffc565b5f612513565b3d915061315e565b61319e91503d805f833e61148b8183611d16565b5f6124ee565b6131b891503d805f833e61148b8183611d16565b5f6124ca565b90506020813d6020116131f0575b816131d960209383611d16565b81010312610af2576131ea90611f55565b5f6124a6565b3d91506131cc565b9092506020813d60201161322c575b8161321460209383611d16565b81010312610af25761322590611f55565b915f612465565b3d9150613207565b90506020813d602011613266575b8161324f60209383611d16565b81010312610af25761326090611f55565b5f612431565b3d9150613242565b90506020813d6020116132a0575b8161328960209383611d16565b81010312610af25761329a90611f55565b5f6123fc565b3d915061327c565b9395929492936001600160a01b03168015159081614285575b50156135ba575050600260208701526040516307f1b29b60e11b8152602081600481865afa908115610afe575f91613580575b506001600160a01b03166040878101919091525163388af5b560e01b8152602081600481865afa908115610afe575f91613546575b506001600160a01b0316606087015260405163b045ff5b60e01b815292602084600481865afa938415610afe575f94613512575b5061336784612051565b926133756040519485611d16565b848452601f1961338486612051565b015f5b8181106134d457505061014088019384525f5b8581106133aa5750505050505050565b604051631f1a892160e11b8152600481018290529060a082602481865afa918215610afe575f926134a4575b5060405160208101906133e982856115bb565b60a081526133f860c082611d16565b51902091613407828851612089565b51526040516349e2903160e11b8152600481018390526001600160a01b0385166024820152606081806044810103816001600160a01b038a165afa908115610afe57600193613470928b925f91613486575b506020613467868c51612089565b51015287614437565b604061347d838951612089565b5101520161339a565b61349e915060603d8111612c0857612bfa8183611d16565b5f613459565b6134c691925060a03d81116134cd575b6134be8183611d16565b81019061212f565b905f6133d6565b503d6134b4565b6020906040516134e381611cfb565b6134eb612229565b81526134f56122af565b83820152613501612253565b604082015282828901015201613387565b9093506020813d60201161353e575b8161352e60209383611d16565b81010312610af25751925f61335d565b3d9150613521565b90506020813d602011613578575b8161356160209383611d16565b81010312610af25761357290611f55565b5f613329565b3d9150613554565b90506020813d6020116135b2575b8161359b60209383611d16565b81010312610af2576135ac90611f55565b5f6132f4565b3d915061358e565b92949391926001600160a01b03168015159081614216575b5015613908575050600360208601526040516307f1b29b60e11b8152602081600481875afa908115610afe575f916138ce575b506001600160a01b03166040868101919091525163388af5b560e01b8152602081600481875afa908115610afe575f91613894575b506001600160a01b03166060860152604051630399e3a560e41b8152602081600481875afa908115610afe575f9161385a575b506001600160a01b031661016086015260405163ace48b4560e01b815291602083600481875afa928315610afe575f93613826575b506136ac83612051565b916136ba6040519384611d16565b838352601f196136c985612051565b015f5b8181106137f657505061018087019283525f5b8481106136ee57505050505050565b60405163779a968360e01b815260048101829052906020826024818a5afa918215610afe575f926137c3575b5081613727828751612089565b5152604051630dd5aa9b60e31b815260048101839052916020836024818b5afa8015610afe5785935f9161378b575b509261377591600194602061376c868b51612089565b51015285614437565b6040613782838851612089565b510152016136df565b9350506020833d82116137bb575b816137a660209383611d16565b81010312610af2579151849290613775613756565b3d9150613799565b9091506020813d82116137ee575b816137de60209383611d16565b81010312610af25751905f61371a565b3d91506137d1565b60209060405161380581611cfb565b5f81525f83820152613815612253565b6040820152828288010152016136cc565b9092506020813d602011613852575b8161384260209383611d16565b81010312610af25751915f6136a2565b3d9150613835565b90506020813d60201161388c575b8161387560209383611d16565b81010312610af25761388690611f55565b5f61366d565b3d9150613868565b90506020813d6020116138c6575b816138af60209383611d16565b81010312610af2576138c090611f55565b5f61363a565b3d91506138a2565b90506020813d602011613900575b816138e960209383611d16565b81010312610af2576138fa90611f55565b5f613605565b3d91506138dc565b9091506139159250612191565b156142045760046020840152613929611e53565b6040516307f1b29b60e11b8152602081600481865afa908115610afe575f916141ca575b506001600160a01b031681526040516338d52e0f60e01b8152602081600481865afa908115610afe575f91614190575b506001600160a01b031660208281019190915260405163388af5b560e01b8152929083600481845afa928315610afe575f93614154575b506001600160a01b039092166040828101918252516339b900a760e11b8152909290602081600481855afa908115610afe575f9161411a575b506001600160a01b031660608301908152604051634844f97b60e01b8152602081600481865afa8015610afe575f906140dd575b63ffffffff16608085015250604051630cb6044360e01b8152602081600481865afa8015610afe575f9061409d575b6001600160401b031660a0850152506040516372696e2360e01b8152602081600481865afa908115610afe575f91614063575b50151560c0840152604051631b362c2760e31b8152602081600481865afa908115610afe575f91614029575b50151560e0840152604051634a41d89d60e01b81525f81600481865afa908115610afe575f9161400f575b50806101008501525160405190630102263b60e11b825260048201525f81602481865afa908115610afe575f91613fed575b5061012084015260405163ace48b4560e01b815290602082600481865afa918215610afe575f92613fb9575b50613b4282612051565b90613b506040519283611d16565b828252601f19613b5f84612051565b015f5b818110613f7c5750506101408501918252516001600160a01b03165f5b838110613bb5575050426101608501525050506101a08401819052516001600160a01b0390811660408501529051166060830152565b60405163779a968360e01b81526004810182905290602082602481895afa918215610afe575f92613f49575b50613bea612229565b91604051636972bc9160e01b815281600482015260a0816024818b5afa8015610afe575f905f925f915f915f91613eac575b501515608088015260ff16606087015265ffffffffffff1660408601526001600160401b039190911660208501526001600160801b03168352613c5d61209d565b6040516349e2903160e11b815282600482015288602482015260c081604481895afa8015610afe575f905f905f935f91613e1c575b50906001600160801b0380948180941660608801521660408601521660208401521681526040519363ead29b0b60e01b85528260048601526101a085602481895afa948515610afe575f95613d28575b50916001600160801b036001958593613d219560405194613d0286611c74565b855260208501526040840152166060820152865190610aa88383612089565b5001613b7f565b9450916101a0853d8211613e14575b81613d456101a09383611d16565b81010312610af2576001600160801b03613d2193859387613d6760019961200a565b50613e07610180613d7a6020840161200a565b92613d876040820161200a565b50613d946060820161200a565b50613da160808201614428565b50613dae60a08201614428565b50613dbb60c08201614428565b50613dc860e08201614428565b50613dd66101008201614428565b50613de46101208201614428565b50613df26101408201614428565b50613e006101608201614395565b5001611ffc565b5097509350919350613ce2565b3d9150613d37565b935050505060c0813d8211613ea4575b81613e3960c09383611d16565b81010312610af257806001600160801b03613e54819361200a565b81613e616020850161200a565b9381613e6f6040830161200a565b93613e9560a0613e816060860161200a565b94613e8e6080820161200a565b500161200a565b50959391939450509450613c92565b3d9150613e2c565b94505050505060a0813d8211613f41575b81613eca60a09383611d16565b81010312610af257613edb8161200a565b90613ee86020820161201e565b90604081015165ffffffffffff81168103610af25765ffffffffffff8260ff6001600160801b0396613f306080613f2960606001600160401b039901611ffc565b9401611f48565b909694929093509396505092613c1c565b3d9150613ebd565b9091506020813d8211613f74575b81613f6460209383611d16565b81010312610af25751905f613be1565b3d9150613f57565b602090604051613f8b81611c74565b5f8152613f96612229565b83820152613fa261209d565b60408201525f606082015282828701015201613b62565b9091506020813d602011613fe5575b81613fd560209383611d16565b81010312610af25751905f613b38565b3d9150613fc8565b61400991503d805f833e6140018183611d16565b810190614403565b5f613b0c565b61402391503d805f833e6140018183611d16565b5f613ada565b90506020813d60201161405b575b8161404460209383611d16565b81010312610af25761405590611f48565b5f613aaf565b3d9150614037565b90506020813d602011614095575b8161407e60209383611d16565b81010312610af25761408f90611f48565b5f613a83565b3d9150614071565b506020813d6020116140d5575b816140b760209383611d16565b81010312610af2576140d06001600160401b039161201e565b613a50565b3d91506140aa565b506020813d602011614112575b816140f760209383611d16565b81010312610af25761410d63ffffffff91614395565b613a21565b3d91506140ea565b90506020813d60201161414c575b8161413560209383611d16565b81010312610af25761414690611f55565b5f6139ed565b3d9150614128565b9092506020813d602011614188575b8161417060209383611d16565b81010312610af25761418190611f55565b915f6139b4565b3d9150614163565b90506020813d6020116141c2575b816141ab60209383611d16565b81010312610af2576141bc90611f55565b5f61397d565b3d915061419e565b90506020813d6020116141fc575b816141e560209383611d16565b81010312610af2576141f690611f55565b5f61394d565b3d91506141d8565b636364223f60e01b5f5260045260245ffd5b60249150602090604051928380926335abafe560e21b82528a60048301525afa908115610afe575f9161424b575b505f6135d2565b90506020813d60201161427d575b8161426660209383611d16565b81010312610af25761427790611f48565b5f614244565b3d9150614259565b602491506020906040519283809263230dbab560e01b82528960048301525afa908115610afe575f916142ba575b505f6132c1565b90506020813d6020116142ec575b816142d560209383611d16565b81010312610af2576142e690611f48565b5f6142b3565b3d91506142c8565b6024915060209060405192838092632c77566560e01b82528c60048301525afa908115610afe575f91614329575b505f6123c7565b90506020813d60201161435b575b8161434460209383611d16565b81010312610af25761435590611f48565b5f614322565b3d9150614337565b90506020813d60201161438d575b8161437e60209383611d16565b81010312610af257515f6123ae565b3d9150614371565b519063ffffffff82168203610af257565b9080601f83011215610af25781516143bd81612051565b926143cb6040519485611d16565b81845260208085019260051b820101928311610af257602001905b8282106143f35750505090565b81518152602091820191016143e6565b90602082820312610af25781516001600160401b038111610af257611fd492016143a6565b519061ffff82168203610af257565b929190614442612253565b604051632c3c915760e01b81526004810183905290946001600160a01b03169060a081602481855afa918215610afe5760249260c0925f91614650575b50875260405192838092632e3071cd60e11b82528660048301525afa908115610afe575f916145b3575b5060208501528351604001516001600160a01b031680614547575b508351606001516001600160a01b03928316921682146144e2575050565b6020906024604051809481936301977b5760e01b835260048301525afa908115610afe575f91614515575b506080830152565b90506020813d60201161453f575b8161453060209383611d16565b81010312610af257515f61450d565b3d9150614523565b60206004916040519283809263501ad8ff60e11b82525afa5f918161457f575b50156144c4576001604086015260608501525f6144c4565b9091506020813d6020116145ab575b8161459b60209383611d16565b81010312610af25751905f614567565b3d915061458e565b905060c0813d60c011614648575b816145ce60c09383611d16565b81010312610af25761463d60a0604051926145e884611cc5565b6145f18161200a565b84526145ff6020820161200a565b60208501526146106040820161200a565b60408501526146216060820161200a565b60608501526146326080820161200a565b60808501520161200a565b60a08201525f6144a9565b3d91506145c1565b614669915060a03d60a0116134cd576134be8183611d16565b5f61447f565b90816040910312610af2576040519061468782611caa565b80516001600160c01b0381168103610af25782526146a79060200161201e565b602082015290565b3d156146d9573d906146c082611f69565b916146ce6040519384611d16565b82523d5f602084013e565b606090565b906146e882612051565b6146f56040519182611d16565b8281528092614706601f1991612051565b019060203691013756fea2646970667358221220b2a957146c15c3ba04891ef0fece1eb110115e897dc79b4a363eb4472b38382264736f6c63430008240033";
