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
                    internalType: "address",
                    name: "enterGateFactory",
                    type: "address",
                  },
                  {
                    internalType: "uint128",
                    name: "maxTtm",
                    type: "uint128",
                  },
                  {
                    internalType: "uint128",
                    name: "minNetBuyRate",
                    type: "uint128",
                  },
                  {
                    internalType: "uint128",
                    name: "maxNetSellRate",
                    type: "uint128",
                  },
                  {
                    internalType: "uint128",
                    name: "shortfallAllowance",
                    type: "uint128",
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
                            name: "netRate",
                            type: "uint64",
                          },
                          {
                            internalType: "uint40",
                            name: "maturity",
                            type: "uint40",
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
                          {
                            internalType: "bool",
                            name: "forceRemoved",
                            type: "bool",
                          },
                          {
                            internalType: "uint256",
                            name: "minForceSellPrice",
                            type: "uint256",
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
                      {
                        internalType: "uint128",
                        name: "withdrawable",
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
                    internalType: "address",
                    name: "enterGateFactory",
                    type: "address",
                  },
                  {
                    internalType: "uint128",
                    name: "maxTtm",
                    type: "uint128",
                  },
                  {
                    internalType: "uint128",
                    name: "minNetBuyRate",
                    type: "uint128",
                  },
                  {
                    internalType: "uint128",
                    name: "maxNetSellRate",
                    type: "uint128",
                  },
                  {
                    internalType: "uint128",
                    name: "shortfallAllowance",
                    type: "uint128",
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
                            name: "netRate",
                            type: "uint64",
                          },
                          {
                            internalType: "uint40",
                            name: "maturity",
                            type: "uint40",
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
                          {
                            internalType: "bool",
                            name: "forceRemoved",
                            type: "bool",
                          },
                          {
                            internalType: "uint256",
                            name: "minForceSellPrice",
                            type: "uint256",
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
                      {
                        internalType: "uint128",
                        name: "withdrawable",
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
  "0x60808060405234601557614d3e908161001a8239f35b5f80fdfe60806040526004361015610011575f80fd5b5f3560e01c630f0d54d814610024575f80fd5b34610b9057610100366003190112610b90576004356001600160a01b0381169003610b90576024356001600160a01b0381168103610b90576044356001600160a01b0381169003610b90576064356001600160a01b0381169003610b90576084356001600160a01b0381169003610b905760a4356001600160a01b0381169003610b905760c4356001600160a01b0381169003610b905760e4356001600160a01b0381169003610b90576103606040526040516100e081611e9c565b5f8082526060602083018190526040830181905280830182905260809290925260a081905260c081905260e08190526101008190526101208190526101408190526101608190526101808290526101a08190526101c0919091526101e08190526102008190526102208190526102408190526102608190526102808190526102a08190526102c0526101706120fa565b6102e0526060610300525f61032081905261034052604051635edec50d60e01b81526001600160a01b03600480358216908301526020908290602490829086165afa908115610b9c575f916116ae575b5015611686576040516338d52e0f60e01b815260208160048181356001600160a01b03165afa908115610b9c575f9161164c575b506040516395d89b4160e01b81525f8160048181356001600160a01b03165afa908115610b9c575f91611632575b506040516306fdde0360e01b8152905f8260048181356001600160a01b03165afa918215610b9c575f9261160e575b5060405163313ce56760e01b81529160208360048181356001600160a01b03165afa918215610b9c575f926115d2575b60ff93506040519461029286611e9c565b60018060a01b03168552602085015260408401521660608201526080526040516338d52e0f60e01b815260208160048160018060a01b038235165afa908115610b9c575f91611598575b506001600160a01b0390811660a05260405163ce04bebb60e01b815290602090829060049082908235165afa8015610b9c575f90611558575b6001600160801b031660c052506040516318160ddd60e01b815260208160048181356001600160a01b03165afa908115610b9c575f91611526575b5060e0526040516331c6651b60e21b815260208160048181356001600160a01b03165afa908115610b9c575f916114f4575b506101005260405163ece1d6e560e01b815260208160048181356001600160a01b03165afa8015610b9c575f906114b4575b6001600160401b0316610120525060405163c046371160e01b815260208160048181356001600160a01b03165afa8015610b9c575f90611474575b6001600160401b0316610140525060405163ad468d1160e01b815260208160048181356001600160a01b03165afa908115610b9c575f9161143a575b506001600160a01b03908116610160526040516305c0524560e31b8152905f90829060049082908235165afa908115610b9c575f916113e2575b50610180526040516343bc43c160e11b815260208160048181356001600160a01b03165afa8015610b9c576001600160601b03915f916113c3575b50166101e05260405163537bfaeb60e11b815260208160048181356001600160a01b03165afa8015610b9c576001600160601b03915f91611394575b50166102005260405163ed27f7c960e01b815260208160048181356001600160a01b03165afa908115610b9c575f9161135a575b506001600160a01b03908116610220526040516306d9a30160e41b815290602090829060049082908235165afa908115610b9c575f91611320575b506001600160a01b0316610240526101e0516001600160601b03161561131957610220516040516326326d2760e21b81526001600160a01b039182166004808301919091529091602091839160249183919035165afa908115610b9c575f916112df575b505b151561026052610200516001600160601b0316156112d857610240516040516326326d2760e21b81526001600160a01b039182166004808301919091529091602091839160249183919035165afa908115610b9c575f9161129e575b505b15156102805260a0516040516370a0823160e01b81526001600160a01b0360048035821690830152909160209183916024918391165afa908115610b9c575f9161126c575b506102a0526040516370a0823160e01b815261dead60048083019190915260209082906024908290356001600160a01b03165afa908115610b9c575f9161123a575b50806102a060800152604051906303d1689d60e11b8252600482015260208160248160018060a01b03600435165afa908115610b9c575f91611208575b50610340526044356001600160a01b0316151580611187575b6084356001600160a01b0316151580611106575b61016051610719906001600160a01b031660a4356123d3565b9180806110f9575b6110d6578081156110cf575b80156110c8575b15156101a05215610ee5575050610749612331565b6101c052610160516040516107c091602082019190610785908290610777906001600160a01b031685612293565b03601f198101835282611f3e565b5190206040519061079582611e9c565b81525f60208201525f60408201525f606082015261014060800151906107ba826122d8565b526122d8565b505b6101c051515f5b818110610d7f57610160516001600160a01b031680610bf0575b50604051630b54457960e31b815260208160048181356001600160a01b03165afa908115610b9c575f91610bbe575b5061081c816122c1565b6108296040519182611f3e565b818152601f19610838836122c1565b015f5b818110610ba7575050610300525f5b818110610ad757604051602081528061093a6080516102e0602084015260018060a01b0381511661030084015260606108af610897602084015160806103208801526103808701906116fc565b60408401518682036102ff19016103408801526116fc565b91015161036084015260a080516001600160a01b03908116604086015260c080516001600160801b0316606087015260e08051608088015261010080519488019490945261012080516001600160401b03908116938901939093526101405190921690870152610160519091169185019190915261018051848303601f1901918501919091526116fc565b6101a05115156101408301526101c051828203601f19016101608401528051808352602092830192909101905f5b818110610a9d57505050610a1f906001600160601b0361016060800151166101808401526001600160601b0361018060800151166101a084015260018060a01b036101a060800151166101c084015260018060a01b036101c060800151166101e08401526101e06080015115156102008401526102006080015115156102208401526102206080015161024084015261024060800151151561026084015261026060800151601f198483030161028085015261181e565b61030051601f19838303016102a084015280518083526020600582901b8401810193928101925f918101905b838310610a6c57610320516102c0880152610340516102e088015286860387f35b919395509193602080610a8b600193601f19868203018752895161181e565b97019301930190928695949293610a4b565b9193509160206080600192606087518051835284810151858401526040810151604084015201516060820152019401910191849392610968565b604051906313bd406b60e21b825280600483015260208260248160018060a01b03600435165afa918215610b9c575f92610b53575b50610b4c81610b3760019460e4359060c4359060a435906084359060643590604435906004356125a8565b6103005190610b4683836122f9565b526122f9565b500161084a565b91506020823d8211610b94575b81610b6d60209383611f3e565b81010312610b9057610b4c81610b37610b87600195612197565b94505050610b0c565b5f80fd5b3d9150610b60565b6040513d5f823e3d90fd5b602090610bb26120fa565b8282860101520161083b565b90506020813d602011610be8575b81610bd960209383611f3e565b81010312610b90575181610812565b3d9150610bcc565b60016102c0526040516368c18beb60e01b81526004808201929092529060209082906024908290356001600160a01b03165afa908115610b9c575f91610d45575b5080610d26575b15610cf25761016080516102e080516001600160a01b03928316905251600460209182015291516040519283019291610c78918391610777911685612293565b51902060405190632f0374dd60e21b8252600482015260208160248160018060a01b03600435165afa908115610b9c575f91610cc0575b506102e05161014001525b806107e3565b90506020813d602011610cea575b81610cdb60209383611f3e565b81010312610b90575181610caf565b3d9150610cce565b610d1d60e43560c43560a43560843560643560443560018060a01b0360e060800151166004356125a8565b6102e052610cba565b5061016051610d40906001600160a01b031660a4356123d3565b610c38565b90506020813d602011610d77575b81610d6060209383611f3e565b81010312610b9057610d719061218a565b81610c31565b3d9150610d53565b610d8f81610140608001516122f9565b5190815160405190632f0374dd60e21b8252600482015260208160248160018060a01b03600435165afa908115610b9c575f91610eb4575b50602083015281516040519063a68bafa360e01b8252600482015260208160248160018060a01b03600435165afa908115610b9c575f91610e83575b5060408301528151916040519263c69507dd60e01b8452600484015260208360248160018060a01b03600435165afa928315610b9c575f93610e4f575b509160606001930152016107c9565b92506020833d8211610e7b575b81610e6960209383611f3e565b81010312610b90579151916060610e40565b3d9150610e5c565b90506020813d8211610eac575b81610e9d60209383611f3e565b81010312610b90575184610e03565b3d9150610e90565b90506020813d8211610edd575b81610ece60209383611f3e565b81010312610b90575184610dc7565b3d9150610ec1565b156110875750610f046101006080015160208082518301019101612371565b6101605160405163cc3802bf60e01b8152915f91839160a49183916001600160a01b0390911690610f39906004840190611753565b5afa908115610b9c575f91610ff7575b508051610f55816122c1565b90610f636040519283611f3e565b808252610f72601f19916122c1565b015f5b818110610fe05750506101c0525f5b8151811015610fd95780610fd281610f9e600194866122f9565b5160405190610fac82611e9c565b81525f60208201525f60408201525f60608201526101406080015190610b4683836122f9565b5001610f84565b50506107c2565b602090610feb61230d565b82828601015201610f75565b90503d805f833e6110088183611f3e565b810190602081830312610b90578051906001600160401b038211610b9057019080601f83011215610b9057815161103e816122c1565b9261104c6040519485611f3e565b81845260208085019260051b820101928311610b9057602001905b8282106110775750505081610f49565b8151815260209182019101611067565b156107c257611094612331565b6101c052610160516040516110c291602082019190610785908290610777906001600160a01b031685612293565b506107c2565b5082610734565b508161072d565b61016051636364223f60e01b5f9081526001600160a01b03909116600452602490fd5b5061018051511515610721565b50610160516040516335abafe560e21b81526001600160a01b0391821660048201529060209082906024908290608435165afa908115610b9c575f9161114d575b50610700565b90506020813d60201161117f575b8161116860209383611f3e565b81010312610b90576111799061218a565b82611147565b3d915061115b565b5061016051604051632c77566560e01b81526001600160a01b0391821660048201529060209082906024908290604435165afa908115610b9c575f916111ce575b506106ec565b90506020813d602011611200575b816111e960209383611f3e565b81010312610b90576111fa9061218a565b816111c8565b3d91506111dc565b90506020813d602011611232575b8161122360209383611f3e565b81010312610b905751816106d3565b3d9150611216565b90506020813d602011611264575b8161125560209383611f3e565b81010312610b90575181610696565b3d9150611248565b90506020813d602011611296575b8161128760209383611f3e565b81010312610b90575181610654565b3d915061127a565b90506020813d6020116112d0575b816112b960209383611f3e565b81010312610b90576112ca9061218a565b8161060d565b3d91506112ac565b600161060f565b90506020813d602011611311575b816112fa60209383611f3e565b81010312610b905761130b9061218a565b816105af565b3d91506112ed565b60016105b1565b90506020813d602011611352575b8161133b60209383611f3e565b81010312610b905761134c90612197565b8161054b565b3d915061132e565b90506020813d60201161138c575b8161137560209383611f3e565b81010312610b905761138690612197565b81610510565b3d9150611368565b6113b6915060203d6020116113bc575b6113ae8183611f3e565b810190612274565b826104dc565b503d6113a4565b6113dc915060203d6020116113bc576113ae8183611f3e565b826104a0565b3d9150815f823e6113f38282611f3e565b6020818381010312610b90578051906001600160401b038211610b9057828101601f838301011215610b9057602061143493820192808301519201016121c6565b81610465565b90506020813d60201161146c575b8161145560209383611f3e565b81010312610b905761146690612197565b8161042b565b3d9150611448565b506020813d6020116114ac575b8161148e60209383611f3e565b81010312610b90576114a76001600160401b0391612260565b6103ef565b3d9150611481565b506020813d6020116114ec575b816114ce60209383611f3e565b81010312610b90576114e76001600160401b0391612260565b6103b4565b3d91506114c1565b90506020813d60201161151e575b8161150f60209383611f3e565b81010312610b90575181610382565b3d9150611502565b90506020813d602011611550575b8161154160209383611f3e565b81010312610b90575181610350565b3d9150611534565b506020813d602011611590575b8161157260209383611f3e565b81010312610b905761158b6001600160801b039161224c565b610315565b3d9150611565565b90506020813d6020116115ca575b816115b360209383611f3e565b81010312610b90576115c490612197565b816102dc565b3d91506115a6565b91506020833d602011611606575b816115ed60209383611f3e565b81010312610b905761160060ff9361223e565b91610281565b3d91506115e0565b61162b9192503d805f833e6116238183611f3e565b810190612219565b9083610251565b61164691503d805f833e6116238183611f3e565b82610222565b90506020813d60201161167e575b8161166760209383611f3e565b81010312610b905761167890612197565b816101f4565b3d915061165a565b63634ba39d60e11b5f9081526001600160a01b03918216600490815235909116602452604490fd5b90506020813d6020116116e0575b816116c960209383611f3e565b81010312610b90576116da9061218a565b5f6101c0565b3d91506116bc565b634e487b7160e01b5f52604160045260245ffd5b805180835260209291819084018484015e5f828201840152601f01601f1916010190565b90602080835192838152019201905f5b81811061173d5750505090565b8251845260209384019390920191600101611730565b80516001600160a01b03908116835260208083015182169084015260408083015182169084015260608083015190911690830152608090810151910152565b60a06101c0916117a3848251611753565b6001600160801b0382602083015182815116828801528260208201511660c08801528260408201511660e0880152826060820151166101008801528260808201511661012088015201511661014085015260408101511515610160850152606081015161018085015260808101516101a08501520151910152565b60018060a01b03815116825260ff602082015116602083015260018060a01b03604082015116604083015260018060a01b0360608201511660608301526080810151608083015260018060a01b0360a08201511660a083015260c0810151906101e060c0840152610220611aa2611a8961197d85516102806101e089015260018060a01b0381511661046089015260a06118e46118cc602084015160c06104808d01526105208c01906116fc565b60408401518b820361045f19016104a08d01526116fc565b9160608101516104c08b015260808101516104e08b015201519061045f19898203016105008a015260ff60f81b825116815260c0611946611934602085015160e0602086015260e08501906116fc565b604085015184820360408601526116fc565b926060810151606084015260018060a01b03608082015116608084015260a081015160a084015201519060c0818403910152611720565b6020868101516001600160a01b039081166102008a015260408801518116868a0152606088015116610240890152608087015161026089015260a087015180516001600160c01b03166102808a015201516001600160401b03166102a088015260c086015180516001600160a01b039081166102c08a01526020909101516001600160401b03166102e089015260e087015181166103008901526101008701516103208901526101208701518116610340890152610140870151166103608801526101608601516103808801526101808601516103a08801526101a086015115156103c08801526101c08601516103e08801526101e08601516101df1988830301610400890152611720565b6102008501518682036101df1901610420880152611720565b92015161044084015260e08101519183810360e0850152602080845192838152019301905f5b818110611df45750505061010081015161010084015261012081015161012084015261014081015161014084015261016081015191838103610160850152602080845192838152019301905f5b818110611d845750505060018060a01b03610180820151166101808401526101a0810151918381036101a0850152602080845192838152019301905f5b818110611d44575050506101c00151916101c081830391015260018060a01b03825116815260018060a01b03602083015116602082015260018060a01b03604083015116604082015260018060a01b03606083015116606082015260018060a01b0360808301511660808201526001600160801b0360a08301511660a08201526001600160801b0360c08301511660c08201526001600160801b0360e08301511660e08201526001600160801b0361010083015116610100820152611c41611c2d6101208401516101a06101208501526101a0840190611720565b610140840151838203610140850152611720565b9161016081015192828103610160840152602080855192838152019401905f5b818110611c78575050506101808091015191015290565b90919460206101c06001926001600160801b0360808a518051845260c08682015184815116888701526001600160401b038882015116604087015264ffffffffff604082015116606087015260ff6060820151168487015283810151151560a087015260a0810151151582870152015160e085015282606060408301518281511661010088015282898201511661012088015282604082015116610140880152015116610160850152826060820151166101808501520151166101a08201520196019101919091611c61565b909193602061024060019260608851805183528481015185840152611d7160408201516040850190611792565b0151610220820152019501929101611b52565b909193602061030060019260608851611d9e838251611753565b611dce8582015160a08501906001600160801b036040809280518552826020820151166020860152015116910152565b611de16040820151610100850190611792565b01516102e0820152019501929101611b15565b90919360206102e0600192611e9160a0895180518452858101511515868501526001600160401b036040820151166040850152611e54606082015160608601906001600160401b036020809260018060c01b038151168552015116910152565b611e846080820151838601906001600160801b036040809280518552826020820151166020860152015116910152565b0151610100830190611792565b019501929101611ac8565b608081019081106001600160401b038211176116e857604052565b60e081019081106001600160401b038211176116e857604052565b604081019081106001600160401b038211176116e857604052565b60c081019081106001600160401b038211176116e857604052565b60a081019081106001600160401b038211176116e857604052565b606081019081106001600160401b038211176116e857604052565b90601f801991011681019081106001600160401b038211176116e857604052565b60405190611f6c82611eb7565b606060c0835f81528260208201528260408201525f838201525f60808201525f60a08201520152565b6040519061024082018281106001600160401b038211176116e8576040525f61022083604051611fc481611eed565b8381526060602082015260606040820152836060820152836080820152611fe9611f5f565b60a0820152815282602082015282604082015282606082015282608082015260405161201481611ed2565b83815283602082015260a082015260405161202e81611ed2565b83815283602082015260c08201528260e08201528261010082015282610120820152826101408201528261016082015282610180820152826101a0820152826101c082015260606101e082015260606102008201520152565b604051906101a082018281106001600160401b038211176116e8576040525f610180838281528260208201528260408201528260608201528260808201528260a08201528260c08201528260e0820152826101008201526060610120820152606061014082015260606101608201520152565b604051906101e082018281106001600160401b038211176116e857604052815f81525f60208201525f60408201525f60608201525f60808201525f60a0820152612142611f95565b60c0820152606060e08201525f6101008201525f6101208201525f61014082015260606101608201525f61018082015260606101a08201526101c0612185612087565b910152565b51908115158203610b9057565b51906001600160a01b0382168203610b9057565b6001600160401b0381116116e857601f01601f191660200190565b9291926121d2826121ab565b916121e06040519384611f3e565b829481845281830111610b90578281602093845f96015e010152565b9080601f83011215610b90578151612216926020016121c6565b90565b90602082820312610b905781516001600160401b038111610b905761221692016121fc565b519060ff82168203610b9057565b51906001600160801b0382168203610b9057565b51906001600160401b0382168203610b9057565b90816020910312610b9057516001600160601b0381168103610b905790565b6040808252600490820152637468697360e01b60608201526001600160a01b03909116602082015260800190565b6001600160401b0381116116e85760051b60200190565b8051156122e55760200190565b634e487b7160e01b5f52603260045260245ffd5b80518210156122e55760209160051b010190565b6040519061231a82611e9c565b5f6060838281528260208201528260408201520152565b604080519091906123428382611f3e565b6001815291601f1901825f5b82811061235a57505050565b60209061236561230d565b8282850101520161234e565b908160a0910312610b905760806040519161238b83611f08565b61239481612197565b83526123a260208201612197565b60208401526123b360408201612197565b60408401526123c460608201612197565b60608401520151608082015290565b6001600160a01b03169081158015612468575b61246257604051637c01394b60e11b81526001600160a01b03909116600482015290602090829060249082905afa5f9181612426575b5061221657505f90565b9091506020813d60201161245a575b8161244260209383611f3e565b81010312610b90576124539061218a565b905f61241c565b3d9150612435565b50505f90565b50813b156123e6565b6040519061247e82611f08565b5f6080838281528260208201528260408201528260608201520152565b604051906124a882611eed565b5f60a0836124b4612471565b81526040516124c281611eed565b838152836020820152836040820152836060820152836080820152838382015260208201528260408201528260608201528260808201520152565b6040519061250a82611f23565b5f6040838281528260208201520152565b90816060910312610b9057612552604080519261253784611f23565b805184526125476020820161224c565b60208501520161224c565b604082015290565b6040519061256782611eed565b815f81525f60208201525f604082015260405161258381611ed2565b5f81525f602082015260608201526125996124fd565b608082015260a061218561249b565b95949091929796936125b86120fa565b6001600160a01b038481168083526040516399e9918360e01b815260048101829052929b90999091169590916020816024818a5afa908115610b9c575f91614875575b5060808c01526040516020810190612617816107778985612293565b51902060405190632f0374dd60e21b825260048201526020816024818a5afa908115610b9c575f91614843575b506101408c01526001600160a01b031680151590816147d4575b50156135a5575050505050600160208601526040516307f1b29b60e11b8152602081600481875afa908115610b9c575f9161356b575b506001600160a01b03166040868101919091525163388af5b560e01b8152602081600481875afa908115610b9c575f91613531575b506001600160a01b0316606086015260405163e4baaddf60e01b815291602083600481875afa928315610b9c575f936134f5575b506001600160a01b0390921660a0860181815292612719611f95565b926040516338d52e0f60e01b8152602081600481875afa908115610b9c575f916134bb575b506040516395d89b4160e01b81525f81600481885afa908115610b9c575f916134a1575b506040516306fdde0360e01b81525f81600481895afa908115610b9c575f91613487575b5060405163313ce56760e01b81526020816004818a5afa908115610b9c575f9161344d575b50604051632ba9c2b360e21b8152906020826004818b5afa918215610b9c575f92613411575b506127da611f5f565b505f8060405160208101906342580cb760e11b8252600481526127fe602482611f3e565b51908b5afa9061280c614ca7565b91156133d657815182019360e08360208701960312610b905760208301516001600160f81b031981169690879003610b905760408401516001600160401b038111610b9057866020612860928701016121fc565b9660608501516001600160401b038111610b9057876020612883928801016121fc565b608086015160a08701516001600160a01b0381169190829003610b905760c08801519260e08901519b6001600160401b038d11610b90576128cf60ff9c60206128da9f8f9d01016148a7565b956040519d8e611eb7565b8d5260208d015260408c015260608b015260808a015260a089015260c08801526040519761290789611eed565b60018060a01b031688526020880152604087015216606085015216608083015260a08201528452604051638da5cb5b60e01b8152602081600481875afa908115610b9c575f9161339c575b506001600160a01b031660208581019190915260405163e66f53b760e01b81529081600481875afa908115610b9c575f91613362575b506001600160a01b031660408581019190915251630229549960e51b8152602081600481875afa908115610b9c575f91613328575b506001600160a01b031660608501526040516334cc866d60e21b8152602081600481875afa908115610b9c575f916132f6575b50608085015260408051637cc4d9a160e01b81529081600481875afa908115610b9c575f916132d7575b5060a085015260408051633b1618dd60e11b81529081600481875afa908115610b9c575f9161327e575b5060c0850152604051631c61872f60e31b8152602081600481875afa908115610b9c575f91613244575b506001600160a01b031660e085015260405163ddca3f4360e01b8152602081600481875afa8015610b9c576001600160601b03915f91613225575b501661010085015260405163011a412160e61b8152602081600481875afa908115610b9c575f916131eb575b506001600160a01b031661012085015260405163388af5b560e01b8152602081600481875afa908115610b9c575f916131b1575b506001600160a01b03166101408501526040516318160ddd60e01b8152602081600481875afa908115610b9c575f9161317f575b5061016085015260405163568efc0760e01b8152602081600481875afa908115610b9c575f9161314d575b506101808501526040516370a0823160e01b815261dead6004820152602081602481875afa908115610b9c575f9161311b575b506102208501525f806040516020810190630872d2c560e21b825260048152612bc5602482611f3e565b5190865afa612bd2614ca7565b908061310f575b6130e6575b50604051630a17b31360e41b8152602081600481875afa908115610b9c575f916130b4575b50612c0d81614cd6565b6101e086019081525f5b8281106130415750506040516333f91ebb60e01b81529050602081600481875afa908115610b9c575f9161300f575b50612c5081614cd6565b9061020086019182525f5b818110612f9c57505060c08901948552515192612c77846122c1565b94612c856040519687611f3e565b848652601f19612c94866122c1565b015f5b818110612f8557505060e08a019586525f5b858110612d8e57505094516040516370a0823160e01b815260048101889052955060209450859350602492508391506001600160a01b03165afa908115610b9c575f91612d5b575b50610100840152604051634450bdef60e11b815290602090829060049082905afa908115610b9c575f91612d29575b50610120830152565b90506020813d602011612d53575b81612d4460209383611f3e565b81010312610b9057515f612d20565b3d9150612d37565b90506020813d602011612d86575b81612d7660209383611f3e565b81010312610b9057516004612cf1565b3d9150612d69565b612d9e81610200845101516122f9565b5190612da861255a565b91604051636638c7bb60e11b8152816004820152606081602481895afa908115610b9c575f91612f08575b5080516001600160b81b031684526020808201511515908501526040908101516001600160401b031684820152805163518df2eb60e11b8152600481018390529081602481895afa908115610b9c575f91612eda575b506060848101919091526040516349e2903160e11b8152600481018390526001600160a01b0387166024820152919082806044810103816001600160a01b038c165afa938415610b9c57612e93888593600197612ea5965f91612eac575b5060808501528b61496e565b60a08201528a5190610b4683836122f9565b5001612ca9565b612ecd915060603d8111612ed3575b612ec58183611f3e565b81019061251b565b5f612e87565b503d612ebb565b612efb915060403d8111612f01575b612ef38183611f3e565b810190614c67565b5f612e29565b503d612ee9565b90506060813d8211612f7d575b81612f2260609383611f3e565b81010312610b9057604051612f3681611f23565b8151906001600160b81b0382168203610b9057612f7260406001600160401b039481948452612f676020820161218a565b602085015201612260565b828201529150612dd3565b3d9150612f15565b602090612f9061255a565b82828b01015201612c97565b6040516362518ddf60e01b815260048101829052906020826024818a5afa8015610b9c575f90612fdd575b60019250612fd68286516122f9565b5201612c5b565b506020823d8211613007575b81612ff660209383611f3e565b81010312610b905760019151612fc7565b3d9150612fe9565b90506020813d602011613039575b8161302a60209383611f3e565b81010312610b9057515f612c46565b3d915061301d565b60405163f7d1852160e01b815260048101829052906020826024818a5afa8015610b9c575f90613082575b6001925061307b8285516122f9565b5201612c17565b506020823d82116130ac575b8161309b60209383611f3e565b81010312610b90576001915161306c565b3d915061308e565b90506020813d6020116130de575b816130cf60209383611f3e565b81010312610b9057515f612c03565b3d91506130c2565b60016101a086015260208151918180820193849201010312610b9057516101c08501525f612bde565b50602081511015612bd9565b90506020813d602011613145575b8161313660209383611f3e565b81010312610b9057515f612b9b565b3d9150613129565b90506020813d602011613177575b8161316860209383611f3e565b81010312610b9057515f612b68565b3d915061315b565b90506020813d6020116131a9575b8161319a60209383611f3e565b81010312610b9057515f612b3d565b3d915061318d565b90506020813d6020116131e3575b816131cc60209383611f3e565b81010312610b90576131dd90612197565b5f612b09565b3d91506131bf565b90506020813d60201161321d575b8161320660209383611f3e565b81010312610b905761321790612197565b5f612ad5565b3d91506131f9565b61323e915060203d6020116113bc576113ae8183611f3e565b5f612aa9565b90506020813d602011613276575b8161325f60209383611f3e565b81010312610b905761327090612197565b5f612a6e565b3d9150613252565b90506040813d6040116132cf575b8161329960409383611f3e565b81010312610b90576132c46020604051926132b384611ed2565b6132bc81612197565b845201612260565b60208201525f612a44565b3d915061328c565b6132f0915060403d604011612f0157612ef38183611f3e565b5f612a1a565b90506020813d602011613320575b8161331160209383611f3e565b81010312610b9057515f6129f0565b3d9150613304565b90506020813d60201161335a575b8161334360209383611f3e565b81010312610b905761335490612197565b5f6129bd565b3d9150613336565b90506020813d602011613394575b8161337d60209383611f3e565b81010312610b905761338e90612197565b5f612988565b3d9150613370565b90506020813d6020116133ce575b816133b760209383611f3e565b81010312610b90576133c890612197565b5f612952565b3d91506133aa565b60405162461bcd60e51b8152602060048201526013602482015272195a5c0dcc4c911bdb585a5b8819985a5b1959606a1b6044820152606490fd5b9091506020813d602011613445575b8161342d60209383611f3e565b81010312610b905761343e9061223e565b905f6127d1565b3d9150613420565b90506020813d60201161347f575b8161346860209383611f3e565b81010312610b90576134799061223e565b5f6127ab565b3d915061345b565b61349b91503d805f833e6116238183611f3e565b5f612786565b6134b591503d805f833e6116238183611f3e565b5f612762565b90506020813d6020116134ed575b816134d660209383611f3e565b81010312610b90576134e790612197565b5f61273e565b3d91506134c9565b9092506020813d602011613529575b8161351160209383611f3e565b81010312610b905761352290612197565b915f6126fd565b3d9150613504565b90506020813d602011613563575b8161354c60209383611f3e565b81010312610b905761355d90612197565b5f6126c9565b3d915061353f565b90506020813d60201161359d575b8161358660209383611f3e565b81010312610b905761359790612197565b5f612694565b3d9150613579565b93969295929492936001600160a01b03168015159081614765575b5015613942575050600260208801526040516307f1b29b60e11b8152602081600481875afa908115610b9c575f91613908575b506001600160a01b03166040888101919091525163388af5b560e01b8152602081600481875afa908115610b9c575f916138ce575b506001600160a01b0316606088015260405163b045ff5b60e01b815293602085600481875afa948515610b9c575f9561389a575b50613666856122c1565b936136746040519586611f3e565b858552601f19613683876122c1565b015f5b81811061385657505061016089019485525f5b8681106136aa575050505050505050565b604051631f1a892160e11b81526004810182905260a081602481865afa908115610b9c575f91613828575b5060405160208101906136e88284611753565b60a081526136f760c082611f3e565b5190209080613707848a516122f9565b51526040516349e2903160e11b8152600481018390526001600160a01b0386166024820152606081806044810103816001600160a01b038c165afa908115610b9c576137899361377392868c8b945f936137ff575b5060209161376a91516122f9565b5101528961496e565b6040613780858b516122f9565b51015284614c05565b9060405191632f0374dd60e21b835260048301526020826024818c5afa8015610b9c575f906137cd575b6001925060606137c4838a516122f9565b51015201613699565b506020823d82116137f7575b816137e660209383611f3e565b81010312610b9057600191516137b3565b3d91506137d9565b61376a9193509161381f60209360603d8111612ed357612ec58183611f3e565b9391509161375c565b613849915060a03d811161384f575b6138418183611f3e565b810190612371565b5f6136d5565b503d613837565b60209060405161386581611e9c565b61386d612471565b81526138776124fd565b8382015261388361249b565b60408201525f606082015282828a01015201613686565b9094506020813d6020116138c6575b816138b660209383611f3e565b81010312610b905751935f61365c565b3d91506138a9565b90506020813d602011613900575b816138e960209383611f3e565b81010312610b90576138fa90612197565b5f613628565b3d91506138dc565b90506020813d60201161393a575b8161392360209383611f3e565b81010312610b905761393490612197565b5f6135f3565b3d9150613916565b9194929392916001600160a01b031680151590816146f6575b5015613d195750600360208801526040516307f1b29b60e11b8152602081600481865afa908115610b9c575f91613cdf575b506001600160a01b03166040888101919091525163388af5b560e01b8152602081600481865afa908115610b9c575f91613ca5575b506001600160a01b03166060880152604051630399e3a560e41b8152602081600481865afa908115610b9c575f91613c6b575b506001600160a01b031661018088015260405163ace48b4560e01b815293602085600481865afa948515610b9c575f95613c37575b50613a34856122c1565b93613a426040519586611f3e565b858552601f19613a51876122c1565b015f5b818110613c015750506101a089019485525f5b868110613a78575050505050505050565b60405163779a968360e01b815260048101829052602081602481895afa908115610b9c575f91613bd0575b5080613ab08389516122f9565b5152604051630dd5aa9b60e31b8152600481018290526020816024818a5afa8015610b9c5785915f91613b9a575b5091613afa926020613af1868c516122f9565b5101528461496e565b6040613b078389516122f9565b510152613b246040613b1a8389516122f9565b5101515185614c05565b9060405191632f0374dd60e21b835260048301526020826024818c5afa8015610b9c575f90613b68575b600192506060613b5f838a516122f9565b51015201613a67565b506020823d8211613b92575b81613b8160209383611f3e565b81010312610b905760019151613b4e565b3d9150613b74565b9150506020813d8211613bc8575b81613bb560209383611f3e565b81010312610b9057518490613afa613ade565b3d9150613ba8565b90506020813d8211613bf9575b81613bea60209383611f3e565b81010312610b9057515f613aa3565b3d9150613bdd565b602090604051613c1081611e9c565b5f81525f83820152613c2061249b565b60408201525f606082015282828a01015201613a54565b9094506020813d602011613c63575b81613c5360209383611f3e565b81010312610b905751935f613a2a565b3d9150613c46565b90506020813d602011613c9d575b81613c8660209383611f3e565b81010312610b9057613c9790612197565b5f6139f5565b3d9150613c79565b90506020813d602011613cd7575b81613cc060209383611f3e565b81010312610b9057613cd190612197565b5f6139c2565b3d9150613cb3565b90506020813d602011613d11575b81613cfa60209383611f3e565b81010312610b9057613d0b90612197565b5f61398d565b3d9150613ced565b9194509150613d2892506123d3565b156146e45760046020840152613d3c612087565b6040516307f1b29b60e11b8152602081600481865afa908115610b9c575f916146aa575b506001600160a01b031681526040516338d52e0f60e01b8152602081600481865afa908115610b9c575f91614670575b506001600160a01b031660208281019190915260405163388af5b560e01b8152929083600481845afa928315610b9c575f93614634575b506001600160a01b039092166040828101918252516339b900a760e11b8152909290602081600481855afa908115610b9c575f916145fa575b506001600160a01b031660608301908152604051636d35302960e11b8152602081600481865afa908115610b9c575f916145c0575b506001600160a01b03166080840152604051634844f97b60e01b8152602081600481865afa8015610b9c575f90614580575b6001600160801b031660a08501525060405163d978fcf960e01b8152602081600481865afa8015610b9c575f90614540575b6001600160801b031660c0850152506040516354b542cd60e01b8152602081600481865afa8015610b9c575f90614500575b6001600160801b031660e085015250604051633ee02e4b60e21b8152602081600481865afa8015610b9c575f906144c0575b6001600160801b031661010085015250604051634a41d89d60e01b81525f81600481865afa908115610b9c575f916144a6575b50806101208501525160405190630102263b60e11b825260048201525f81602481865afa908115610b9c575f91614484575b5061014084015260405163ace48b4560e01b815290602082600481865afa918215610b9c575f92614450575b50613f98826122c1565b90613fa66040519283611f3e565b828252601f19613fb5846122c1565b015f5b81811061440d5750506101608501918252516001600160a01b0316905f5b83811061400c575050426101808501525050506101c08401819052516001600160a01b0390811660408501529051166060830152565b60405163779a968360e01b81526004810182905290602082602481895afa918215610b9c575f926143da575b50614041614929565b604051636972bc9160e01b81526004810184905260e0816024818b5afa8015610b9c575f905f925f915f915f915f915f91614326575b5060c0880152151560a08701521515608086015260ff16606085015264ffffffffff1660408401526001600160401b0390911660208301526001600160801b031681526140c261230d565b6040516349e2903160e11b815284600482015288602482015260c0816044818a5afa8015610b9c575f905f905f935f91614296575b50906001600160801b0380948180941660608801521660408601521660208401521681526040519063ead29b0b60e01b82528460048301526101a0826024818a5afa928315610b9c575f925f94614197575b50614190936001600160801b0386946001989482946040519661416b88611f08565b875260208701526040860152166060840152166080820152855190610b4683836122f9565b5001613fd6565b9591925092506101a0853d821161428e575b816141b76101a09383611f3e565b81010312610b90576141c88561224c565b506141d56020860161224c565b6141e16040870161224c565b936141ee6060880161224c565b506141fb6080880161495f565b5061420860a0880161495f565b5061421560c0880161495f565b5061422260e0880161495f565b50614230610100880161495f565b5061423e610120880161495f565b5061424c610140880161495f565b5061016087015163ffffffff811603610b90576001600160801b03614190958795829461427e61018060019c0161223e565b5091975094985094505090614149565b3d91506141a9565b935050505060c0813d821161431e575b816142b360c09383611f3e565b81010312610b9057806001600160801b036142ce819361224c565b816142db6020850161224c565b93816142e96040830161224c565b9361430f60a06142fb6060860161224c565b946143086080820161224c565b500161224c565b509593919394505094506140f7565b3d91506142a6565b965050505050505060e0813d82116143d2575b8161434660e09383611f3e565b81010312610b90576143578161224c565b9061436460208201612260565b90604081015164ffffffffff81168103610b905764ffffffffff8260ff6001600160801b039661439e60606001600160401b03970161223e565b926143ab6080820161218a565b9160c06143ba60a0840161218a565b92015190989694929190935093965093509396614077565b3d9150614339565b9091506020813d8211614405575b816143f560209383611f3e565b81010312610b905751905f614038565b3d91506143e8565b60209060405161441c81611f08565b5f8152614427614929565b8382015261443361230d565b60408201525f60608201525f608082015282828701015201613fb8565b9091506020813d60201161447c575b8161446c60209383611f3e565b81010312610b905751905f613f8e565b3d915061445f565b6144a091503d805f833e6144988183611f3e565b810190614904565b5f613f62565b6144ba91503d805f833e6144988183611f3e565b5f613f30565b506020813d6020116144f8575b816144da60209383611f3e565b81010312610b90576144f36001600160801b039161224c565b613efd565b3d91506144cd565b506020813d602011614538575b8161451a60209383611f3e565b81010312610b90576145336001600160801b039161224c565b613ecb565b3d915061450d565b506020813d602011614578575b8161455a60209383611f3e565b81010312610b90576145736001600160801b039161224c565b613e99565b3d915061454d565b506020813d6020116145b8575b8161459a60209383611f3e565b81010312610b90576145b36001600160801b039161224c565b613e67565b3d915061458d565b90506020813d6020116145f2575b816145db60209383611f3e565b81010312610b90576145ec90612197565b5f613e35565b3d91506145ce565b90506020813d60201161462c575b8161461560209383611f3e565b81010312610b905761462690612197565b5f613e00565b3d9150614608565b9092506020813d602011614668575b8161465060209383611f3e565b81010312610b905761466190612197565b915f613dc7565b3d9150614643565b90506020813d6020116146a2575b8161468b60209383611f3e565b81010312610b905761469c90612197565b5f613d90565b3d915061467e565b90506020813d6020116146dc575b816146c560209383611f3e565b81010312610b90576146d690612197565b5f613d60565b3d91506146b8565b636364223f60e01b5f5260045260245ffd5b60249150602090604051928380926335abafe560e21b82528860048301525afa908115610b9c575f9161472b575b505f61395b565b90506020813d60201161475d575b8161474660209383611f3e565b81010312610b90576147579061218a565b5f614724565b3d9150614739565b602491506020906040519283809263230dbab560e01b82528a60048301525afa908115610b9c575f9161479a575b505f6135c0565b90506020813d6020116147cc575b816147b560209383611f3e565b81010312610b90576147c69061218a565b5f614793565b3d91506147a8565b6024915060209060405192838092632c77566560e01b82528d60048301525afa908115610b9c575f91614809575b505f61265e565b90506020813d60201161483b575b8161482460209383611f3e565b81010312610b90576148359061218a565b5f614802565b3d9150614817565b90506020813d60201161486d575b8161485e60209383611f3e565b81010312610b9057515f612644565b3d9150614851565b90506020813d60201161489f575b8161489060209383611f3e565b81010312610b9057515f6125fb565b3d9150614883565b9080601f83011215610b905781516148be816122c1565b926148cc6040519485611f3e565b81845260208085019260051b820101928311610b9057602001905b8282106148f45750505090565b81518152602091820191016148e7565b90602082820312610b905781516001600160401b038111610b905761221692016148a7565b6040519061493682611eb7565b5f60c0838281528260208201528260408201528260608201528260808201528260a08201520152565b519061ffff82168203610b9057565b92919061497961249b565b604051632c3c915760e01b81526004810183905290946001600160a01b03169060a081602481855afa908115610b9c575f91614be6575b508552604051632e3071cd60e11b81526004810183905260c081602481855afa908115610b9c575f91614b43575b506044916060916020880152604051928380926349e2903160e11b825286600483015261dead60248301525afa908115610b9c575f91614b24575b505160a08501528351604001516001600160a01b031680614ab8575b508351606001516001600160a01b0392831692168214614a53575050565b6020906024604051809481936301977b5760e01b835260048301525afa908115610b9c575f91614a86575b506080830152565b90506020813d602011614ab0575b81614aa160209383611f3e565b81010312610b9057515f614a7e565b3d9150614a94565b60206004916040519283809263501ad8ff60e11b82525afa5f9181614af0575b5015614a35576001604086015260608501525f614a35565b9091506020813d602011614b1c575b81614b0c60209383611f3e565b81010312610b905751905f614ad8565b3d9150614aff565b614b3d915060603d606011612ed357612ec58183611f3e565b5f614a19565b905060c0813d60c011614bde575b81614b5e60c09383611f3e565b81010312610b9057604491606091614bd160a060405192614b7e84611eed565b614b878161224c565b8452614b956020820161224c565b6020850152614ba66040820161224c565b6040850152614bb686820161224c565b86850152614bc66080820161224c565b60808501520161224c565b60a08201529150916149de565b3d9150614b51565b614bff915060a03d60a01161384f576138418183611f3e565b5f6149b0565b90614c5060405191602083019360e08552601161010085015270746869732f6d61726b6574506172616d7360781b61012085015260018060a01b031660408401526060830190611753565b6101208152614c6161014082611f3e565b51902090565b90816040910312610b905760405190614c7f82611ed2565b80516001600160c01b0381168103610b90578252614c9f90602001612260565b602082015290565b3d15614cd1573d90614cb8826121ab565b91614cc66040519384611f3e565b82523d5f602084013e565b606090565b90614ce0826122c1565b614ced6040519182611f3e565b8281528092614cfe601f19916122c1565b019060203691013756fea2646970667358221220717cf3ab1fccf4b23b656b9b005735e4e772d9161585cae8032547d276c9011764736f6c63430008240033";
