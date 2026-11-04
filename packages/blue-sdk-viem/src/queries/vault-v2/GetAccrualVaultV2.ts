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
                  {
                    internalType: "uint256",
                    name: "deadShares",
                    type: "uint256",
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
                      {
                        internalType: "uint256",
                        name: "deadSupplyShares",
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
                internalType: "uint256",
                name: "adapterAbsoluteCap",
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
                      {
                        internalType: "uint256",
                        name: "deadSupplyShares",
                        type: "uint256",
                      },
                    ],
                    internalType: "struct MarketResponse",
                    name: "market",
                    type: "tuple",
                  },
                  {
                    internalType: "uint256",
                    name: "absoluteCap",
                    type: "uint256",
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
                      {
                        internalType: "uint256",
                        name: "deadSupplyShares",
                        type: "uint256",
                      },
                    ],
                    internalType: "struct MarketResponse",
                    name: "market",
                    type: "tuple",
                  },
                  {
                    internalType: "uint256",
                    name: "absoluteCap",
                    type: "uint256",
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
                  {
                    internalType: "uint256",
                    name: "deadShares",
                    type: "uint256",
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
                      {
                        internalType: "uint256",
                        name: "deadSupplyShares",
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
                internalType: "uint256",
                name: "adapterAbsoluteCap",
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
                      {
                        internalType: "uint256",
                        name: "deadSupplyShares",
                        type: "uint256",
                      },
                    ],
                    internalType: "struct MarketResponse",
                    name: "market",
                    type: "tuple",
                  },
                  {
                    internalType: "uint256",
                    name: "absoluteCap",
                    type: "uint256",
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
                      {
                        internalType: "uint256",
                        name: "deadSupplyShares",
                        type: "uint256",
                      },
                    ],
                    internalType: "struct MarketResponse",
                    name: "market",
                    type: "tuple",
                  },
                  {
                    internalType: "uint256",
                    name: "absoluteCap",
                    type: "uint256",
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
          {
            internalType: "uint256",
            name: "deadShares",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "deadAssets",
            type: "uint256",
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
  "0x60808060405234601557614bf5908161001a8239f35b5f80fdfe60806040526004361015610011575f80fd5b5f3560e01c630f0d54d814610024575f80fd5b34610b9057610100366003190112610b90576004356001600160a01b0381169003610b90576024356001600160a01b0381168103610b90576044356001600160a01b0381169003610b90576064356001600160a01b0381169003610b90576084356001600160a01b0381169003610b905760a4356001600160a01b0381169003610b905760c4356001600160a01b0381169003610b905760e4356001600160a01b0381169003610b90576103606040526040516100e081611e52565b5f8082526060602083018190526040830181905280830182905260809290925260a081905260c081905260e08190526101008190526101208190526101408190526101608190526101808290526101a08190526101c0919091526101e08190526102008190526102208190526102408190526102608190526102808190526102a08190526102c0526101706120a9565b6102e0526060610300525f61032081905261034052604051635edec50d60e01b81526001600160a01b03600480358216908301526020908290602490829086165afa908115610b9c575f916116ae575b5015611686576040516338d52e0f60e01b815260208160048181356001600160a01b03165afa908115610b9c575f9161164c575b506040516395d89b4160e01b81525f8160048181356001600160a01b03165afa908115610b9c575f91611632575b506040516306fdde0360e01b8152905f8260048181356001600160a01b03165afa918215610b9c575f9261160e575b5060405163313ce56760e01b81529160208360048181356001600160a01b03165afa918215610b9c575f926115d2575b60ff93506040519461029286611e52565b60018060a01b03168552602085015260408401521660608201526080526040516338d52e0f60e01b815260208160048160018060a01b038235165afa908115610b9c575f91611598575b506001600160a01b0390811660a05260405163ce04bebb60e01b815290602090829060049082908235165afa8015610b9c575f90611558575b6001600160801b031660c052506040516318160ddd60e01b815260208160048181356001600160a01b03165afa908115610b9c575f91611526575b5060e0526040516331c6651b60e21b815260208160048181356001600160a01b03165afa908115610b9c575f916114f4575b506101005260405163ece1d6e560e01b815260208160048181356001600160a01b03165afa8015610b9c575f906114b4575b6001600160401b0316610120525060405163c046371160e01b815260208160048181356001600160a01b03165afa8015610b9c575f90611474575b6001600160401b0316610140525060405163ad468d1160e01b815260208160048181356001600160a01b03165afa908115610b9c575f9161143a575b506001600160a01b03908116610160526040516305c0524560e31b8152905f90829060049082908235165afa908115610b9c575f916113e2575b50610180526040516343bc43c160e11b815260208160048181356001600160a01b03165afa8015610b9c576001600160601b03915f916113c3575b50166101e05260405163537bfaeb60e11b815260208160048181356001600160a01b03165afa8015610b9c576001600160601b03915f91611394575b50166102005260405163ed27f7c960e01b815260208160048181356001600160a01b03165afa908115610b9c575f9161135a575b506001600160a01b03908116610220526040516306d9a30160e41b815290602090829060049082908235165afa908115610b9c575f91611320575b506001600160a01b0316610240526101e0516001600160601b03161561131957610220516040516326326d2760e21b81526001600160a01b039182166004808301919091529091602091839160249183919035165afa908115610b9c575f916112df575b505b151561026052610200516001600160601b0316156112d857610240516040516326326d2760e21b81526001600160a01b039182166004808301919091529091602091839160249183919035165afa908115610b9c575f9161129e575b505b15156102805260a0516040516370a0823160e01b81526001600160a01b0360048035821690830152909160209183916024918391165afa908115610b9c575f9161126c575b506102a0526040516370a0823160e01b815261dead60048083019190915260209082906024908290356001600160a01b03165afa908115610b9c575f9161123a575b50806102a060800152604051906303d1689d60e11b8252600482015260208160248160018060a01b03600435165afa908115610b9c575f91611208575b50610340526044356001600160a01b0316151580611187575b6084356001600160a01b0316151580611106575b61016051610719906001600160a01b031660a435612382565b9180806110f9575b6110d6578081156110cf575b80156110c8575b15156101a05215610ee55750506107496122e0565b6101c052610160516040516107c091602082019190610785908290610777906001600160a01b031685612242565b03601f198101835282611ef4565b5190206040519061079582611e52565b81525f60208201525f60408201525f606082015261014060800151906107ba82612287565b52612287565b505b6101c051515f5b818110610d7f57610160516001600160a01b031680610bf0575b50604051630b54457960e31b815260208160048181356001600160a01b03165afa908115610b9c575f91610bbe575b5061081c81612270565b6108296040519182611ef4565b818152601f1961083883612270565b015f5b818110610ba7575050610300525f5b818110610ad757604051602081528061093a6080516102e0602084015260018060a01b0381511661030084015260606108af610897602084015160806103208801526103808701906116fc565b60408401518682036102ff19016103408801526116fc565b91015161036084015260a080516001600160a01b03908116604086015260c080516001600160801b0316606087015260e08051608088015261010080519488019490945261012080516001600160401b03908116938901939093526101405190921690870152610160519091169185019190915261018051848303601f1901918501919091526116fc565b6101a05115156101408301526101c051828203601f19016101608401528051808352602092830192909101905f5b818110610a9d57505050610a1f906001600160601b0361016060800151166101808401526001600160601b0361018060800151166101a084015260018060a01b036101a060800151166101c084015260018060a01b036101c060800151166101e08401526101e06080015115156102008401526102006080015115156102208401526102206080015161024084015261024060800151151561026084015261026060800151601f198483030161028085015261181e565b61030051601f19838303016102a084015280518083526020600582901b8401810193928101925f918101905b838310610a6c57610320516102c0880152610340516102e088015286860387f35b919395509193602080610a8b600193601f19868203018752895161181e565b97019301930190928695949293610a4b565b9193509160206080600192606087518051835284810151858401526040810151604084015201516060820152019401910191849392610968565b604051906313bd406b60e21b825280600483015260208260248160018060a01b03600435165afa918215610b9c575f92610b53575b50610b4c81610b3760019460e4359060c4359060a43590608435906064359060443590600435612551565b6103005190610b4683836122a8565b526122a8565b500161084a565b91506020823d8211610b94575b81610b6d60209383611ef4565b81010312610b9057610b4c81610b37610b87600195612146565b94505050610b0c565b5f80fd5b3d9150610b60565b6040513d5f823e3d90fd5b602090610bb26120a9565b8282860101520161083b565b90506020813d602011610be8575b81610bd960209383611ef4565b81010312610b90575181610812565b3d9150610bcc565b60016102c0526040516368c18beb60e01b81526004808201929092529060209082906024908290356001600160a01b03165afa908115610b9c575f91610d45575b5080610d26575b15610cf25761016080516102e080516001600160a01b03928316905251600460209182015291516040519283019291610c78918391610777911685612242565b51902060405190632f0374dd60e21b8252600482015260208160248160018060a01b03600435165afa908115610b9c575f91610cc0575b506102e05161014001525b806107e3565b90506020813d602011610cea575b81610cdb60209383611ef4565b81010312610b90575181610caf565b3d9150610cce565b610d1d60e43560c43560a43560843560643560443560018060a01b0360e06080015116600435612551565b6102e052610cba565b5061016051610d40906001600160a01b031660a435612382565b610c38565b90506020813d602011610d77575b81610d6060209383611ef4565b81010312610b9057610d7190612139565b81610c31565b3d9150610d53565b610d8f81610140608001516122a8565b5190815160405190632f0374dd60e21b8252600482015260208160248160018060a01b03600435165afa908115610b9c575f91610eb4575b50602083015281516040519063a68bafa360e01b8252600482015260208160248160018060a01b03600435165afa908115610b9c575f91610e83575b5060408301528151916040519263c69507dd60e01b8452600484015260208360248160018060a01b03600435165afa928315610b9c575f93610e4f575b509160606001930152016107c9565b92506020833d8211610e7b575b81610e6960209383611ef4565b81010312610b90579151916060610e40565b3d9150610e5c565b90506020813d8211610eac575b81610e9d60209383611ef4565b81010312610b90575184610e03565b3d9150610e90565b90506020813d8211610edd575b81610ece60209383611ef4565b81010312610b90575184610dc7565b3d9150610ec1565b156110875750610f046101006080015160208082518301019101612320565b6101605160405163cc3802bf60e01b8152915f91839160a49183916001600160a01b0390911690610f39906004840190611753565b5afa908115610b9c575f91610ff7575b508051610f5581612270565b90610f636040519283611ef4565b808252610f72601f1991612270565b015f5b818110610fe05750506101c0525f5b8151811015610fd95780610fd281610f9e600194866122a8565b5160405190610fac82611e52565b81525f60208201525f60408201525f60608201526101406080015190610b4683836122a8565b5001610f84565b50506107c2565b602090610feb6122bc565b82828601015201610f75565b90503d805f833e6110088183611ef4565b810190602081830312610b90578051906001600160401b038211610b9057019080601f83011215610b9057815161103e81612270565b9261104c6040519485611ef4565b81845260208085019260051b820101928311610b9057602001905b8282106110775750505081610f49565b8151815260209182019101611067565b156107c2576110946122e0565b6101c052610160516040516110c291602082019190610785908290610777906001600160a01b031685612242565b506107c2565b5082610734565b508161072d565b61016051636364223f60e01b5f9081526001600160a01b03909116600452602490fd5b5061018051511515610721565b50610160516040516335abafe560e21b81526001600160a01b0391821660048201529060209082906024908290608435165afa908115610b9c575f9161114d575b50610700565b90506020813d60201161117f575b8161116860209383611ef4565b81010312610b905761117990612139565b82611147565b3d915061115b565b5061016051604051632c77566560e01b81526001600160a01b0391821660048201529060209082906024908290604435165afa908115610b9c575f916111ce575b506106ec565b90506020813d602011611200575b816111e960209383611ef4565b81010312610b90576111fa90612139565b816111c8565b3d91506111dc565b90506020813d602011611232575b8161122360209383611ef4565b81010312610b905751816106d3565b3d9150611216565b90506020813d602011611264575b8161125560209383611ef4565b81010312610b90575181610696565b3d9150611248565b90506020813d602011611296575b8161128760209383611ef4565b81010312610b90575181610654565b3d915061127a565b90506020813d6020116112d0575b816112b960209383611ef4565b81010312610b90576112ca90612139565b8161060d565b3d91506112ac565b600161060f565b90506020813d602011611311575b816112fa60209383611ef4565b81010312610b905761130b90612139565b816105af565b3d91506112ed565b60016105b1565b90506020813d602011611352575b8161133b60209383611ef4565b81010312610b905761134c90612146565b8161054b565b3d915061132e565b90506020813d60201161138c575b8161137560209383611ef4565b81010312610b905761138690612146565b81610510565b3d9150611368565b6113b6915060203d6020116113bc575b6113ae8183611ef4565b810190612223565b826104dc565b503d6113a4565b6113dc915060203d6020116113bc576113ae8183611ef4565b826104a0565b3d9150815f823e6113f38282611ef4565b6020818381010312610b90578051906001600160401b038211610b9057828101601f838301011215610b905760206114349382019280830151920101612175565b81610465565b90506020813d60201161146c575b8161145560209383611ef4565b81010312610b905761146690612146565b8161042b565b3d9150611448565b506020813d6020116114ac575b8161148e60209383611ef4565b81010312610b90576114a76001600160401b039161220f565b6103ef565b3d9150611481565b506020813d6020116114ec575b816114ce60209383611ef4565b81010312610b90576114e76001600160401b039161220f565b6103b4565b3d91506114c1565b90506020813d60201161151e575b8161150f60209383611ef4565b81010312610b90575181610382565b3d9150611502565b90506020813d602011611550575b8161154160209383611ef4565b81010312610b90575181610350565b3d9150611534565b506020813d602011611590575b8161157260209383611ef4565b81010312610b905761158b6001600160801b03916121fb565b610315565b3d9150611565565b90506020813d6020116115ca575b816115b360209383611ef4565b81010312610b90576115c490612146565b816102dc565b3d91506115a6565b91506020833d602011611606575b816115ed60209383611ef4565b81010312610b905761160060ff936121ed565b91610281565b3d91506115e0565b61162b9192503d805f833e6116238183611ef4565b8101906121c8565b9083610251565b61164691503d805f833e6116238183611ef4565b82610222565b90506020813d60201161167e575b8161166760209383611ef4565b81010312610b905761167890612146565b816101f4565b3d915061165a565b63634ba39d60e11b5f9081526001600160a01b03918216600490815235909116602452604490fd5b90506020813d6020116116e0575b816116c960209383611ef4565b81010312610b90576116da90612139565b5f6101c0565b3d91506116bc565b634e487b7160e01b5f52604160045260245ffd5b805180835260209291819084018484015e5f828201840152601f01601f1916010190565b90602080835192838152019201905f5b81811061173d5750505090565b8251845260209384019390920191600101611730565b80516001600160a01b03908116835260208083015182169084015260408083015182169084015260608083015190911690830152608090810151910152565b60a06101c0916117a3848251611753565b6001600160801b0382602083015182815116828801528260208201511660c08801528260408201511660e0880152826060820151166101008801528260808201511661012088015201511661014085015260408101511515610160850152606081015161018085015260808101516101a08501520151910152565b60018060a01b03815116825260ff602082015116602083015260018060a01b03604082015116604083015260018060a01b0360608201511660608301526080810151608083015260018060a01b0360a08201511660a083015260c0810151906101e060c0840152610220611aa2611a8961197d85516102806101e089015260018060a01b0381511661046089015260a06118e46118cc602084015160c06104808d01526105208c01906116fc565b60408401518b820361045f19016104a08d01526116fc565b9160608101516104c08b015260808101516104e08b015201519061045f19898203016105008a015260ff60f81b825116815260c0611946611934602085015160e0602086015260e08501906116fc565b604085015184820360408601526116fc565b926060810151606084015260018060a01b03608082015116608084015260a081015160a084015201519060c0818403910152611720565b6020868101516001600160a01b039081166102008a015260408801518116868a0152606088015116610240890152608087015161026089015260a087015180516001600160c01b03166102808a015201516001600160401b03166102a088015260c086015180516001600160a01b039081166102c08a01526020909101516001600160401b03166102e089015260e087015181166103008901526101008701516103208901526101208701518116610340890152610140870151166103608801526101608601516103808801526101808601516103a08801526101a086015115156103c08801526101c08601516103e08801526101e08601516101df1988830301610400890152611720565b6102008501518682036101df1901610420880152611720565b92015161044084015260e08101519183810360e0850152602080845192838152019301905f5b818110611daa5750505061010081015161010084015261012081015161012084015261014081015161014084015261016081015191838103610160850152602080845192838152019301905f5b818110611d3a5750505060018060a01b03610180820151166101808401526101a0810151918381036101a0850152602080845192838152019301905f5b818110611cfa575050506101c00151916101c081830391015260018060a01b03825116815260018060a01b03602083015116602082015260018060a01b03604083015116604082015260018060a01b03606083015116606082015263ffffffff60808301511660808201526001600160401b0360a08301511660a082015260c0820151151560c082015260e0820151151560e0820152611c1c611c08610100840151610180610100850152610180840190611720565b610120840151838203610120850152611720565b9161014081015192828103610140840152602080855192838152019401905f5b818110611c53575050506101608091015191015290565b90919460206101606001926001600160801b0360608a518051845260808682015184815116888701526001600160401b038882015116604087015265ffffffffffff6040820151168487015260ff8482015116828701520151151560a0850152828260408301518281511660c088015282898201511660e0880152826040820151166101008801520151166101208501520151166101408201520196019101919091611c3c565b909193602061024060019260608851805183528481015185840152611d2760408201516040850190611792565b0151610220820152019501929101611b52565b909193602061030060019260608851611d54838251611753565b611d848582015160a08501906001600160801b036040809280518552826020820151166020860152015116910152565b611d976040820151610100850190611792565b01516102e0820152019501929101611b15565b90919360206102e0600192611e4760a0895180518452858101511515868501526001600160401b036040820151166040850152611e0a606082015160608601906001600160401b036020809260018060c01b038151168552015116910152565b611e3a6080820151838601906001600160801b036040809280518552826020820151166020860152015116910152565b0151610100830190611792565b019501929101611ac8565b608081019081106001600160401b038211176116e857604052565b60e081019081106001600160401b038211176116e857604052565b604081019081106001600160401b038211176116e857604052565b60c081019081106001600160401b038211176116e857604052565b60a081019081106001600160401b038211176116e857604052565b606081019081106001600160401b038211176116e857604052565b90601f801991011681019081106001600160401b038211176116e857604052565b60405190611f2282611e6d565b606060c0835f81528260208201528260408201525f838201525f60808201525f60a08201520152565b6040519061024082018281106001600160401b038211176116e8576040525f61022083604051611f7a81611ea3565b8381526060602082015260606040820152836060820152836080820152611f9f611f15565b60a08201528152826020820152826040820152826060820152826080820152604051611fca81611e88565b83815283602082015260a0820152604051611fe481611e88565b83815283602082015260c08201528260e08201528261010082015282610120820152826101408201528261016082015282610180820152826101a0820152826101c082015260606101e082015260606102008201520152565b6040519061018082018281106001600160401b038211176116e8576040525f610160838281528260208201528260408201528260608201528260808201528260a08201528260c08201528260e08201526060610100820152606061012082015260606101408201520152565b604051906101e082018281106001600160401b038211176116e857604052815f81525f60208201525f60408201525f60608201525f60808201525f60a08201526120f1611f4b565b60c0820152606060e08201525f6101008201525f6101208201525f61014082015260606101608201525f61018082015260606101a08201526101c061213461203d565b910152565b51908115158203610b9057565b51906001600160a01b0382168203610b9057565b6001600160401b0381116116e857601f01601f191660200190565b9291926121818261215a565b9161218f6040519384611ef4565b829481845281830111610b90578281602093845f96015e010152565b9080601f83011215610b905781516121c592602001612175565b90565b90602082820312610b905781516001600160401b038111610b90576121c592016121ab565b519060ff82168203610b9057565b51906001600160801b0382168203610b9057565b51906001600160401b0382168203610b9057565b90816020910312610b9057516001600160601b0381168103610b905790565b6040808252600490820152637468697360e01b60608201526001600160a01b03909116602082015260800190565b6001600160401b0381116116e85760051b60200190565b8051156122945760200190565b634e487b7160e01b5f52603260045260245ffd5b80518210156122945760209160051b010190565b604051906122c982611e52565b5f6060838281528260208201528260408201520152565b604080519091906122f18382611ef4565b6001815291601f1901825f5b82811061230957505050565b6020906123146122bc565b828285010152016122fd565b908160a0910312610b905760806040519161233a83611ebe565b61234381612146565b835261235160208201612146565b602084015261236260408201612146565b604084015261237360608201612146565b60608401520151608082015290565b6001600160a01b0316801515918261240f575b8261239f57505090565b60405163810e893360e01b81526001600160a01b0390911660048201529150602090829060249082905afa908115610b9c575f916123db575090565b90506020813d602011612407575b816123f660209383611ef4565b81010312610b90576121c590612139565b3d91506123e9565b813b15159250612395565b6040519061242782611ebe565b5f6080838281528260208201528260408201528260608201520152565b6040519061245182611ea3565b5f60a08361245d61241a565b815260405161246b81611ea3565b838152836020820152836040820152836060820152836080820152838382015260208201528260408201528260608201528260808201520152565b604051906124b382611ed9565b5f6040838281528260208201520152565b90816060910312610b90576124fb60408051926124e084611ed9565b805184526124f0602082016121fb565b6020850152016121fb565b604082015290565b6040519061251082611ea3565b815f81525f60208201525f604082015260405161252c81611e88565b5f81525f602082015260608201526125426124a6565b608082015260a0612134612444565b95949091929796936125616120a9565b6001600160a01b038481168083526040516399e9918360e01b815260048101829052929b90999091169590916020816024818a5afa908115610b9c575f91614751575b5060808c015260405160208101906125c0816107778985612242565b51902060405190632f0374dd60e21b825260048201526020816024818a5afa908115610b9c575f9161471f575b506101408c01526001600160a01b031680151590816146b0575b501561354e575050505050600160208601526040516307f1b29b60e11b8152602081600481875afa908115610b9c575f91613514575b506001600160a01b03166040868101919091525163388af5b560e01b8152602081600481875afa908115610b9c575f916134da575b506001600160a01b0316606086015260405163e4baaddf60e01b815291602083600481875afa928315610b9c575f9361349e575b506001600160a01b0390921660a08601818152926126c2611f4b565b926040516338d52e0f60e01b8152602081600481875afa908115610b9c575f91613464575b506040516395d89b4160e01b81525f81600481885afa908115610b9c575f9161344a575b506040516306fdde0360e01b81525f81600481895afa908115610b9c575f91613430575b5060405163313ce56760e01b81526020816004818a5afa908115610b9c575f916133f6575b50604051632ba9c2b360e21b8152906020826004818b5afa918215610b9c575f926133ba575b50612783611f15565b505f8060405160208101906342580cb760e11b8252600481526127a7602482611ef4565b51908b5afa906127b5614b5e565b911561337f57815182019360e08360208701960312610b905760208301516001600160f81b031981169690879003610b905760408401516001600160401b038111610b9057866020612809928701016121ab565b9660608501516001600160401b038111610b905787602061282c928801016121ab565b608086015160a08701516001600160a01b0381169190829003610b905760c08801519260e08901519b6001600160401b038d11610b905761287860ff9c60206128839f8f9d0101614794565b956040519d8e611e6d565b8d5260208d015260408c015260608b015260808a015260a089015260c0880152604051976128b089611ea3565b60018060a01b031688526020880152604087015216606085015216608083015260a08201528452604051638da5cb5b60e01b8152602081600481875afa908115610b9c575f91613345575b506001600160a01b031660208581019190915260405163e66f53b760e01b81529081600481875afa908115610b9c575f9161330b575b506001600160a01b031660408581019190915251630229549960e51b8152602081600481875afa908115610b9c575f916132d1575b506001600160a01b031660608501526040516334cc866d60e21b8152602081600481875afa908115610b9c575f9161329f575b50608085015260408051637cc4d9a160e01b81529081600481875afa908115610b9c575f91613280575b5060a085015260408051633b1618dd60e11b81529081600481875afa908115610b9c575f91613227575b5060c0850152604051631c61872f60e31b8152602081600481875afa908115610b9c575f916131ed575b506001600160a01b031660e085015260405163ddca3f4360e01b8152602081600481875afa8015610b9c576001600160601b03915f916131ce575b501661010085015260405163011a412160e61b8152602081600481875afa908115610b9c575f91613194575b506001600160a01b031661012085015260405163388af5b560e01b8152602081600481875afa908115610b9c575f9161315a575b506001600160a01b03166101408501526040516318160ddd60e01b8152602081600481875afa908115610b9c575f91613128575b5061016085015260405163568efc0760e01b8152602081600481875afa908115610b9c575f916130f6575b506101808501526040516370a0823160e01b815261dead6004820152602081602481875afa908115610b9c575f916130c4575b506102208501525f806040516020810190630872d2c560e21b825260048152612b6e602482611ef4565b5190865afa612b7b614b5e565b90806130b8575b61308f575b50604051630a17b31360e41b8152602081600481875afa908115610b9c575f9161305d575b50612bb681614b8d565b6101e086019081525f5b828110612fea5750506040516333f91ebb60e01b81529050602081600481875afa908115610b9c575f91612fb8575b50612bf981614b8d565b9061020086019182525f5b818110612f4557505060c08901948552515192612c2084612270565b94612c2e6040519687611ef4565b848652601f19612c3d86612270565b015f5b818110612f2e57505060e08a019586525f5b858110612d3757505094516040516370a0823160e01b815260048101889052955060209450859350602492508391506001600160a01b03165afa908115610b9c575f91612d04575b50610100840152604051634450bdef60e11b815290602090829060049082905afa908115610b9c575f91612cd2575b50610120830152565b90506020813d602011612cfc575b81612ced60209383611ef4565b81010312610b9057515f612cc9565b3d9150612ce0565b90506020813d602011612d2f575b81612d1f60209383611ef4565b81010312610b9057516004612c9a565b3d9150612d12565b612d4781610200845101516122a8565b5190612d51612503565b91604051636638c7bb60e11b8152816004820152606081602481895afa908115610b9c575f91612eb1575b5080516001600160b81b031684526020808201511515908501526040908101516001600160401b031684820152805163518df2eb60e11b8152600481018390529081602481895afa908115610b9c575f91612e83575b506060848101919091526040516349e2903160e11b8152600481018390526001600160a01b0387166024820152919082806044810103816001600160a01b038c165afa938415610b9c57612e3c888593600197612e4e965f91612e55575b5060808501528b614825565b60a08201528a5190610b4683836122a8565b5001612c52565b612e76915060603d8111612e7c575b612e6e8183611ef4565b8101906124c4565b5f612e30565b503d612e64565b612ea4915060403d8111612eaa575b612e9c8183611ef4565b810190614b1e565b5f612dd2565b503d612e92565b90506060813d8211612f26575b81612ecb60609383611ef4565b81010312610b9057604051612edf81611ed9565b8151906001600160b81b0382168203610b9057612f1b60406001600160401b039481948452612f1060208201612139565b60208501520161220f565b828201529150612d7c565b3d9150612ebe565b602090612f39612503565b82828b01015201612c40565b6040516362518ddf60e01b815260048101829052906020826024818a5afa8015610b9c575f90612f86575b60019250612f7f8286516122a8565b5201612c04565b506020823d8211612fb0575b81612f9f60209383611ef4565b81010312610b905760019151612f70565b3d9150612f92565b90506020813d602011612fe2575b81612fd360209383611ef4565b81010312610b9057515f612bef565b3d9150612fc6565b60405163f7d1852160e01b815260048101829052906020826024818a5afa8015610b9c575f9061302b575b600192506130248285516122a8565b5201612bc0565b506020823d8211613055575b8161304460209383611ef4565b81010312610b905760019151613015565b3d9150613037565b90506020813d602011613087575b8161307860209383611ef4565b81010312610b9057515f612bac565b3d915061306b565b60016101a086015260208151918180820193849201010312610b9057516101c08501525f612b87565b50602081511015612b82565b90506020813d6020116130ee575b816130df60209383611ef4565b81010312610b9057515f612b44565b3d91506130d2565b90506020813d602011613120575b8161311160209383611ef4565b81010312610b9057515f612b11565b3d9150613104565b90506020813d602011613152575b8161314360209383611ef4565b81010312610b9057515f612ae6565b3d9150613136565b90506020813d60201161318c575b8161317560209383611ef4565b81010312610b905761318690612146565b5f612ab2565b3d9150613168565b90506020813d6020116131c6575b816131af60209383611ef4565b81010312610b90576131c090612146565b5f612a7e565b3d91506131a2565b6131e7915060203d6020116113bc576113ae8183611ef4565b5f612a52565b90506020813d60201161321f575b8161320860209383611ef4565b81010312610b905761321990612146565b5f612a17565b3d91506131fb565b90506040813d604011613278575b8161324260409383611ef4565b81010312610b905761326d60206040519261325c84611e88565b61326581612146565b84520161220f565b60208201525f6129ed565b3d9150613235565b613299915060403d604011612eaa57612e9c8183611ef4565b5f6129c3565b90506020813d6020116132c9575b816132ba60209383611ef4565b81010312610b9057515f612999565b3d91506132ad565b90506020813d602011613303575b816132ec60209383611ef4565b81010312610b90576132fd90612146565b5f612966565b3d91506132df565b90506020813d60201161333d575b8161332660209383611ef4565b81010312610b905761333790612146565b5f612931565b3d9150613319565b90506020813d602011613377575b8161336060209383611ef4565b81010312610b905761337190612146565b5f6128fb565b3d9150613353565b60405162461bcd60e51b8152602060048201526013602482015272195a5c0dcc4c911bdb585a5b8819985a5b1959606a1b6044820152606490fd5b9091506020813d6020116133ee575b816133d660209383611ef4565b81010312610b90576133e7906121ed565b905f61277a565b3d91506133c9565b90506020813d602011613428575b8161341160209383611ef4565b81010312610b9057613422906121ed565b5f612754565b3d9150613404565b61344491503d805f833e6116238183611ef4565b5f61272f565b61345e91503d805f833e6116238183611ef4565b5f61270b565b90506020813d602011613496575b8161347f60209383611ef4565b81010312610b905761349090612146565b5f6126e7565b3d9150613472565b9092506020813d6020116134d2575b816134ba60209383611ef4565b81010312610b90576134cb90612146565b915f6126a6565b3d91506134ad565b90506020813d60201161350c575b816134f560209383611ef4565b81010312610b905761350690612146565b5f612672565b3d91506134e8565b90506020813d602011613546575b8161352f60209383611ef4565b81010312610b905761354090612146565b5f61263d565b3d9150613522565b93969295929492936001600160a01b03168015159081614641575b50156138eb575050600260208801526040516307f1b29b60e11b8152602081600481875afa908115610b9c575f916138b1575b506001600160a01b03166040888101919091525163388af5b560e01b8152602081600481875afa908115610b9c575f91613877575b506001600160a01b0316606088015260405163b045ff5b60e01b815293602085600481875afa948515610b9c575f95613843575b5061360f85612270565b9361361d6040519586611ef4565b858552601f1961362c87612270565b015f5b8181106137ff57505061016089019485525f5b868110613653575050505050505050565b604051631f1a892160e11b81526004810182905260a081602481865afa908115610b9c575f916137d1575b5060405160208101906136918284611753565b60a081526136a060c082611ef4565b51902090806136b0848a516122a8565b51526040516349e2903160e11b8152600481018390526001600160a01b0386166024820152606081806044810103816001600160a01b038c165afa908115610b9c576137329361371c92868c8b945f936137a8575b5060209161371391516122a8565b51015289614825565b6040613729858b516122a8565b51015284614abc565b9060405191632f0374dd60e21b835260048301526020826024818c5afa8015610b9c575f90613776575b60019250606061376d838a516122a8565b51015201613642565b506020823d82116137a0575b8161378f60209383611ef4565b81010312610b90576001915161375c565b3d9150613782565b613713919350916137c860209360603d8111612e7c57612e6e8183611ef4565b93915091613705565b6137f2915060a03d81116137f8575b6137ea8183611ef4565b810190612320565b5f61367e565b503d6137e0565b60209060405161380e81611e52565b61381661241a565b81526138206124a6565b8382015261382c612444565b60408201525f606082015282828a0101520161362f565b9094506020813d60201161386f575b8161385f60209383611ef4565b81010312610b905751935f613605565b3d9150613852565b90506020813d6020116138a9575b8161389260209383611ef4565b81010312610b90576138a390612146565b5f6135d1565b3d9150613885565b90506020813d6020116138e3575b816138cc60209383611ef4565b81010312610b90576138dd90612146565b5f61359c565b3d91506138bf565b9194929392916001600160a01b031680151590816145d2575b5015613cc25750600360208801526040516307f1b29b60e11b8152602081600481865afa908115610b9c575f91613c88575b506001600160a01b03166040888101919091525163388af5b560e01b8152602081600481865afa908115610b9c575f91613c4e575b506001600160a01b03166060880152604051630399e3a560e41b8152602081600481865afa908115610b9c575f91613c14575b506001600160a01b031661018088015260405163ace48b4560e01b815293602085600481865afa948515610b9c575f95613be0575b506139dd85612270565b936139eb6040519586611ef4565b858552601f196139fa87612270565b015f5b818110613baa5750506101a089019485525f5b868110613a21575050505050505050565b60405163779a968360e01b815260048101829052602081602481895afa908115610b9c575f91613b79575b5080613a598389516122a8565b5152604051630dd5aa9b60e31b8152600481018290526020816024818a5afa8015610b9c5785915f91613b43575b5091613aa3926020613a9a868c516122a8565b51015284614825565b6040613ab08389516122a8565b510152613acd6040613ac38389516122a8565b5101515185614abc565b9060405191632f0374dd60e21b835260048301526020826024818c5afa8015610b9c575f90613b11575b600192506060613b08838a516122a8565b51015201613a10565b506020823d8211613b3b575b81613b2a60209383611ef4565b81010312610b905760019151613af7565b3d9150613b1d565b9150506020813d8211613b71575b81613b5e60209383611ef4565b81010312610b9057518490613aa3613a87565b3d9150613b51565b90506020813d8211613ba2575b81613b9360209383611ef4565b81010312610b9057515f613a4c565b3d9150613b86565b602090604051613bb981611e52565b5f81525f83820152613bc9612444565b60408201525f606082015282828a010152016139fd565b9094506020813d602011613c0c575b81613bfc60209383611ef4565b81010312610b905751935f6139d3565b3d9150613bef565b90506020813d602011613c46575b81613c2f60209383611ef4565b81010312610b9057613c4090612146565b5f61399e565b3d9150613c22565b90506020813d602011613c80575b81613c6960209383611ef4565b81010312610b9057613c7a90612146565b5f61396b565b3d9150613c5c565b90506020813d602011613cba575b81613ca360209383611ef4565b81010312610b9057613cb490612146565b5f613936565b3d9150613c96565b9194509150613cd19250612382565b156145c05760046020840152613ce561203d565b6040516307f1b29b60e11b8152602081600481865afa908115610b9c575f91614586575b506001600160a01b031681526040516338d52e0f60e01b8152602081600481865afa908115610b9c575f9161454c575b506001600160a01b031660208281019190915260405163388af5b560e01b8152929083600481845afa928315610b9c575f93614510575b506001600160a01b039092166040828101918252516339b900a760e11b8152909290602081600481855afa908115610b9c575f916144d6575b506001600160a01b031660608301908152604051634844f97b60e01b8152602081600481865afa8015610b9c575f90614499575b63ffffffff16608085015250604051630cb6044360e01b8152602081600481865afa8015610b9c575f90614459575b6001600160401b031660a0850152506040516372696e2360e01b8152602081600481865afa908115610b9c575f9161441f575b50151560c0840152604051631b362c2760e31b8152602081600481865afa908115610b9c575f916143e5575b50151560e0840152604051634a41d89d60e01b81525f81600481865afa908115610b9c575f916143cb575b50806101008501525160405190630102263b60e11b825260048201525f81602481865afa908115610b9c575f916143a9575b5061012084015260405163ace48b4560e01b815290602082600481865afa918215610b9c575f92614375575b50613efe82612270565b90613f0c6040519283611ef4565b828252601f19613f1b84612270565b015f5b8181106143385750506101408501918252516001600160a01b03165f5b838110613f71575050426101608501525050506101c08401819052516001600160a01b0390811660408501529051166060830152565b60405163779a968360e01b81526004810182905290602082602481895afa918215610b9c575f92614305575b50613fa661241a565b91604051636972bc9160e01b815281600482015260a0816024818b5afa8015610b9c575f905f925f915f915f91614268575b501515608088015260ff16606087015265ffffffffffff1660408601526001600160401b039190911660208501526001600160801b031683526140196122bc565b6040516349e2903160e11b815282600482015288602482015260c081604481895afa8015610b9c575f905f905f935f916141d8575b50906001600160801b0380948180941660608801521660408601521660208401521681526040519363ead29b0b60e01b85528260048601526101a085602481895afa948515610b9c575f956140e4575b50916001600160801b0360019585936140dd95604051946140be86611e52565b855260208501526040840152166060820152865190610b4683836122a8565b5001613f3b565b9450916101a0853d82116141d0575b816141016101a09383611ef4565b81010312610b90576001600160801b036140dd938593876141236001996121fb565b506141c3610180614136602084016121fb565b92614143604082016121fb565b50614150606082016121fb565b5061415d60808201614816565b5061416a60a08201614816565b5061417760c08201614816565b5061418460e08201614816565b506141926101008201614816565b506141a06101208201614816565b506141ae6101408201614816565b506141bc6101608201614783565b50016121ed565b509750935091935061409e565b3d91506140f3565b935050505060c0813d8211614260575b816141f560c09383611ef4565b81010312610b9057806001600160801b0361421081936121fb565b8161421d602085016121fb565b938161422b604083016121fb565b9361425160a061423d606086016121fb565b9461424a608082016121fb565b50016121fb565b5095939193945050945061404e565b3d91506141e8565b94505050505060a0813d82116142fd575b8161428660a09383611ef4565b81010312610b9057614297816121fb565b906142a46020820161220f565b90604081015165ffffffffffff81168103610b905765ffffffffffff8260ff6001600160801b03966142ec60806142e560606001600160401b0399016121ed565b9401612139565b909694929093509396505092613fd8565b3d9150614279565b9091506020813d8211614330575b8161432060209383611ef4565b81010312610b905751905f613f9d565b3d9150614313565b60209060405161434781611e52565b5f815261435261241a565b8382015261435e6122bc565b60408201525f606082015282828701015201613f1e565b9091506020813d6020116143a1575b8161439160209383611ef4565b81010312610b905751905f613ef4565b3d9150614384565b6143c591503d805f833e6143bd8183611ef4565b8101906147f1565b5f613ec8565b6143df91503d805f833e6143bd8183611ef4565b5f613e96565b90506020813d602011614417575b8161440060209383611ef4565b81010312610b905761441190612139565b5f613e6b565b3d91506143f3565b90506020813d602011614451575b8161443a60209383611ef4565b81010312610b905761444b90612139565b5f613e3f565b3d915061442d565b506020813d602011614491575b8161447360209383611ef4565b81010312610b905761448c6001600160401b039161220f565b613e0c565b3d9150614466565b506020813d6020116144ce575b816144b360209383611ef4565b81010312610b90576144c963ffffffff91614783565b613ddd565b3d91506144a6565b90506020813d602011614508575b816144f160209383611ef4565b81010312610b905761450290612146565b5f613da9565b3d91506144e4565b9092506020813d602011614544575b8161452c60209383611ef4565b81010312610b905761453d90612146565b915f613d70565b3d915061451f565b90506020813d60201161457e575b8161456760209383611ef4565b81010312610b905761457890612146565b5f613d39565b3d915061455a565b90506020813d6020116145b8575b816145a160209383611ef4565b81010312610b90576145b290612146565b5f613d09565b3d9150614594565b636364223f60e01b5f5260045260245ffd5b60249150602090604051928380926335abafe560e21b82528860048301525afa908115610b9c575f91614607575b505f613904565b90506020813d602011614639575b8161462260209383611ef4565b81010312610b905761463390612139565b5f614600565b3d9150614615565b602491506020906040519283809263230dbab560e01b82528a60048301525afa908115610b9c575f91614676575b505f613569565b90506020813d6020116146a8575b8161469160209383611ef4565b81010312610b90576146a290612139565b5f61466f565b3d9150614684565b6024915060209060405192838092632c77566560e01b82528d60048301525afa908115610b9c575f916146e5575b505f612607565b90506020813d602011614717575b8161470060209383611ef4565b81010312610b905761471190612139565b5f6146de565b3d91506146f3565b90506020813d602011614749575b8161473a60209383611ef4565b81010312610b9057515f6125ed565b3d915061472d565b90506020813d60201161477b575b8161476c60209383611ef4565b81010312610b9057515f6125a4565b3d915061475f565b519063ffffffff82168203610b9057565b9080601f83011215610b905781516147ab81612270565b926147b96040519485611ef4565b81845260208085019260051b820101928311610b9057602001905b8282106147e15750505090565b81518152602091820191016147d4565b90602082820312610b905781516001600160401b038111610b90576121c59201614794565b519061ffff82168203610b9057565b929190614830612444565b604051632c3c915760e01b81526004810183905290946001600160a01b03169060a081602481855afa908115610b9c575f91614a9d575b508552604051632e3071cd60e11b81526004810183905260c081602481855afa908115610b9c575f916149fa575b506044916060916020880152604051928380926349e2903160e11b825286600483015261dead60248301525afa908115610b9c575f916149db575b505160a08501528351604001516001600160a01b03168061496f575b508351606001516001600160a01b039283169216821461490a575050565b6020906024604051809481936301977b5760e01b835260048301525afa908115610b9c575f9161493d575b506080830152565b90506020813d602011614967575b8161495860209383611ef4565b81010312610b9057515f614935565b3d915061494b565b60206004916040519283809263501ad8ff60e11b82525afa5f91816149a7575b50156148ec576001604086015260608501525f6148ec565b9091506020813d6020116149d3575b816149c360209383611ef4565b81010312610b905751905f61498f565b3d91506149b6565b6149f4915060603d606011612e7c57612e6e8183611ef4565b5f6148d0565b905060c0813d60c011614a95575b81614a1560c09383611ef4565b81010312610b9057604491606091614a8860a060405192614a3584611ea3565b614a3e816121fb565b8452614a4c602082016121fb565b6020850152614a5d604082016121fb565b6040850152614a6d8682016121fb565b86850152614a7d608082016121fb565b6080850152016121fb565b60a0820152915091614895565b3d9150614a08565b614ab6915060a03d60a0116137f8576137ea8183611ef4565b5f614867565b90614b0760405191602083019360e08552601161010085015270746869732f6d61726b6574506172616d7360781b61012085015260018060a01b031660408401526060830190611753565b6101208152614b1861014082611ef4565b51902090565b90816040910312610b905760405190614b3682611e88565b80516001600160c01b0381168103610b90578252614b569060200161220f565b602082015290565b3d15614b88573d90614b6f8261215a565b91614b7d6040519384611ef4565b82523d5f602084013e565b606090565b90614b9782612270565b614ba46040519182611ef4565b8281528092614bb5601f1991612270565b019060203691013756fea26469706673582212202c31102ea3f8b5d6750573b3a06b096adaaf7e3f1d10c5e859fc88dc400a424e64736f6c63430008240033";
