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
  "0x608080604052346015576134d6908161001a8239f35b5f80fdfe60806040526004361015610011575f80fd5b5f3560e01c638509bc8914610024575f80fd5b346109e15760e03660031901126109e1576004356001600160a01b03811690036109e1576024356001600160a01b03811681036109e1576044356001600160a01b03811690036109e1576064356001600160a01b03811690036109e1576084356001600160a01b03811690036109e15760a4356001600160a01b03811690036109e15760c4356001600160a01b03811690036109e1576102e06040526040516100cc816117d4565b5f8082526060602083018190526040830181905280830182905260809290925260a081905260c081905260e08190526101008190526101208190526101408190526101608190526101808290526101a08190526101c0919091526101e081905261020081905261022081905261024081905261026081905261028052610150611955565b6102a05260606102c052604051635edec50d60e01b81526001600160a01b03600480358216908301526020908290602490829086165afa9081156109ed575f916112bb575b5015611293576040516338d52e0f60e01b815260208160048181356001600160a01b03165afa9081156109ed575f91611259575b506040516395d89b4160e01b81525f8160048181356001600160a01b03165afa9081156109ed575f9161123f575b506040516306fdde0360e01b8152905f8260048181356001600160a01b03165afa9182156109ed575f9261121b575b5060405163313ce56760e01b81529160208360048181356001600160a01b03165afa9182156109ed5760ff935f936111ea575b5060405194610267866117d4565b60018060a01b03168552602085015260408401521660608201526080526040516338d52e0f60e01b815260208160048160018060a01b038235165afa9081156109ed575f916111b0575b506001600160a01b0390811660a05260405163ce04bebb60e01b815290602090829060049082908235165afa80156109ed575f90611170575b6001600160801b031660c052506040516318160ddd60e01b815260208160048181356001600160a01b03165afa9081156109ed575f9161113e575b5060e0526040516331c6651b60e21b815260208160048181356001600160a01b03165afa9081156109ed575f9161110c575b506101005260405163ece1d6e560e01b815260208160048181356001600160a01b03165afa80156109ed575f906110cc575b6001600160401b0316610120525060405163c046371160e01b815260208160048181356001600160a01b03165afa80156109ed575f9061108c575b6001600160401b0316610140525060405163ad468d1160e01b815260208160048181356001600160a01b03165afa9081156109ed575f91611052575b506001600160a01b03908116610160526040516305c0524560e31b8152905f90829060049082908235165afa9081156109ed575f91611002575b50610180526040516343bc43c160e11b815260208160048181356001600160a01b03165afa80156109ed576001600160601b03915f91610fe3575b50166101e05260405163537bfaeb60e11b815260208160048181356001600160a01b03165afa80156109ed576001600160601b03915f91610fb4575b50166102005260405163ed27f7c960e01b815260208160048181356001600160a01b03165afa9081156109ed575f91610f7a575b506001600160a01b03908116610220526040516306d9a30160e41b815290602090829060049082908235165afa9081156109ed575f91610f40575b506001600160a01b039081166102405260a0516040516370a0823160e01b8152600480358416908201529160209183916024918391165afa9081156109ed575f91610f0e575b50610260526044356001600160a01b0316151580610e8d575b6084356001600160a01b031615159081610e0a575b8080610dfd575b610dda57808115610dd3575b15156101a05215610c1a575060408051906105c2818361185b565b600182525f5b601f1982018110610bd75750506101406080015261065c60018060a01b0360e0608001511660405160208101916040835260046060830152637468697360e01b608083015260408201526080815261062160a08261185b565b51902060405190610631826117d4565b81525f60208201525f60408201525f6060820152610140608001519061065682611ae7565b52611ae7565b505b6101c051515f5b818110610a7157610160516001600160a01b031680610a41575b50604051630b54457960e31b815260208160048181356001600160a01b03165afa9081156109ed575f91610a0f575b506106b881611ad0565b6106c5604051918261185b565b818152601f196106d483611ad0565b015f5b8181106109f85750506102c0525f5b81811061092c5760405160208152806107d6608051610260602084015260018060a01b03815116610280840152606061074b610733602084015160806102a08801526103008701906112f5565b604084015186820361027f19016102c08801526112f5565b9101516102e084015260a080516001600160a01b03908116604086015260c080516001600160801b0316606087015260e08051608088015261010080519488019490945261012080516001600160401b03908116938901939093526101405190921690870152610160519091169185019190915261018051848303601f1901918501919091526112f5565b6101a05115156101408301526101c051828203601f19016101608401528051808352602092830192909101905f5b8181106108f25750506101e080516001600160601b0390811661018086015261020080519091166101a086015261022080516001600160a01b039081166101c08801526102408051909116938701939093526102605191860191909152610280511515908501526102a051848403601f19019185019190915261088892915061140c565b6102c051601f198383030161026084015280518083526020600582901b8401810193928101925f918101905b8383106108c15786860387f35b9193955091936020806108e0600193601f19868203018752895161140c565b970193019301909286959492936108b4565b9193509160206080600192606087518051835284810151858401526040810151604084015201516060820152019401910191849392610804565b604051906313bd406b60e21b825280600483015260208260248160018060a01b03600435165afa9182156109ed575f926109a4575b5061099d8161098860019460c4359060a43590608435906064359060443590600435611ca8565b6102c051906109978383611b08565b52611b08565b50016106e6565b91506020823d82116109e5575b816109be6020938361185b565b810103126109e15761099d816109886109d86001956119d2565b94505050610961565b5f80fd5b3d91506109b1565b6040513d5f823e3d90fd5b602090610a03611955565b828286010152016106d7565b90506020813d602011610a39575b81610a2a6020938361185b565b810103126109e15751816106ae565b3d9150610a1d565b600161028052610a679060c4359060a43590608435906064359060443590600435611ca8565b6102a0528061067f565b610a818161014060800151611b08565b5190815160405190632f0374dd60e21b8252600482015260208160248160018060a01b03600435165afa9081156109ed575f91610ba6575b50602083015281516040519063a68bafa360e01b8252600482015260208160248160018060a01b03600435165afa9081156109ed575f91610b75575b5060408301528151916040519263c69507dd60e01b8452600484015260208360248160018060a01b03600435165afa9283156109ed575f93610b41575b50916060600193015201610665565b92506020833d8211610b6d575b81610b5b6020938361185b565b810103126109e1579151916060610b32565b3d9150610b4e565b90506020813d8211610b9e575b81610b8f6020938361185b565b810103126109e1575184610af5565b3d9150610b82565b90506020813d8211610bcf575b81610bc06020938361185b565b810103126109e1575184610ab9565b3d9150610bb3565b602090604051610be6816117d4565b5f81525f838201525f60408201525f6060820152828286010152016105c8565b634e487b7160e01b5f52604160045260245ffd5b1561065e57610c386101006080015160208082518301019101611b1c565b6101605160405163cc3802bf60e01b8152915f91839160a49183916001600160a01b0390911690610c6d90600484019061134c565b5afa9081156109ed575f91610d43575b508051610c8981611ad0565b90610c97604051928361185b565b808252610ca6601f1991611ad0565b015f5b818110610d145750506101c0525f5b8151811015610d0d5780610d0681610cd260019486611b08565b5160405190610ce0826117d4565b81525f60208201525f60408201525f606082015261014060800151906109978383611b08565b5001610cb8565b505061065e565b602090604051610d23816117d4565b5f81525f838201525f60408201525f606082015282828601015201610ca9565b90503d805f833e610d54818361185b565b8101906020818303126109e1578051906001600160401b0382116109e157019080601f830112156109e1578151610d8a81611ad0565b92610d98604051948561185b565b81845260208085019260051b8201019283116109e157602001905b828210610dc35750505081610c7d565b8151815260209182019101610db3565b50816105a7565b61016051636364223f60e01b5f9081526001600160a01b03909116600452602490fd5b506101805151151561059b565b610160516040516335abafe560e21b81526001600160a01b03918216600482015291925060209082906024908290608435165afa9081156109ed575f91610e53575b5090610594565b90506020813d602011610e85575b81610e6e6020938361185b565b810103126109e157610e7f906119c5565b82610e4c565b3d9150610e61565b5061016051604051632c77566560e01b81526001600160a01b0391821660048201529060209082906024908290604435165afa9081156109ed575f91610ed4575b5061057f565b90506020813d602011610f06575b81610eef6020938361185b565b810103126109e157610f00906119c5565b81610ece565b3d9150610ee2565b90506020813d602011610f38575b81610f296020938361185b565b810103126109e1575181610566565b3d9150610f1c565b90506020813d602011610f72575b81610f5b6020938361185b565b810103126109e157610f6c906119d2565b81610520565b3d9150610f4e565b90506020813d602011610fac575b81610f956020938361185b565b810103126109e157610fa6906119d2565b816104e5565b3d9150610f88565b610fd6915060203d602011610fdc575b610fce818361185b565b810190611ab1565b826104b1565b503d610fc4565b610ffc915060203d602011610fdc57610fce818361185b565b82610475565b90503d805f833e611013818361185b565b8101906020818303126109e1578051906001600160401b0382116109e157019080601f830112156109e157815161104c92602001611a01565b8161043a565b90506020813d602011611084575b8161106d6020938361185b565b810103126109e15761107e906119d2565b81610400565b3d9150611060565b506020813d6020116110c4575b816110a66020938361185b565b810103126109e1576110bf6001600160401b0391611a9d565b6103c4565b3d9150611099565b506020813d602011611104575b816110e66020938361185b565b810103126109e1576110ff6001600160401b0391611a9d565b610389565b3d91506110d9565b90506020813d602011611136575b816111276020938361185b565b810103126109e1575181610357565b3d915061111a565b90506020813d602011611168575b816111596020938361185b565b810103126109e1575181610325565b3d915061114c565b506020813d6020116111a8575b8161118a6020938361185b565b810103126109e1576111a36001600160801b0391611a89565b6102ea565b3d915061117d565b90506020813d6020116111e2575b816111cb6020938361185b565b810103126109e1576111dc906119d2565b816102b1565b3d91506111be565b61120d91935060203d602011611214575b611205818361185b565b810190611a70565b9185610259565b503d6111fb565b6112389192503d805f833e611230818361185b565b810190611a37565b9083610226565b61125391503d805f833e611230818361185b565b826101f7565b90506020813d60201161128b575b816112746020938361185b565b810103126109e157611285906119d2565b816101c9565b3d9150611267565b63634ba39d60e11b5f9081526001600160a01b03918216600490815235909116602452604490fd5b90506020813d6020116112ed575b816112d66020938361185b565b810103126109e1576112e7906119c5565b5f610195565b3d91506112c9565b805180835260209291819084018484015e5f828201840152601f01601f1916010190565b90602080835192838152019201905f5b8181106113365750505090565b8251845260209384019390920191600101611329565b80516001600160a01b03908116835260208083015182169084015260408083015182169084015260608083015190911690830152608090810151910152565b60806101a09161139c84825161134c565b6001600160801b0360a0602083015182815116828801528260208201511660c08801528260408201511660e0880152826060820151166101008801528285820151166101208801520151166101408501526040810151151561016085015260608101516101808501520151910152565b60018060a01b03815116825260ff602082015116602083015260018060a01b03604082015116604083015260018060a01b0360608201511660608301526080810151608083015260018060a01b0360a08201511660a083015261160860c082015161018060c08501526102006115f2825161026061018088015260018060a01b038151166103e088015260806114ce6114b6602084015160a06104008c01526104808b01906112f5565b60408401518a82036103df19016104208c01526112f5565b6060808401516104408b015291909201516104608901526020858101516001600160a01b039081166101a08b0152604087015181166101c08b0152918601519091166101e089015260808501518489015260a085015180516001600160c01b03166102208a015201516001600160401b031661024088015260c084015180516001600160a01b039081166102608a01526020909101516001600160401b031661028089015260e085015181166102a08901526101008501516102c089015261012085015181166102e0890152610140850151166103008801526101608401516103208801526101808401516103408801526101a084015115156103608801526101c08401516103808801526101e084015161017f19888303016103a0890152611319565b91015184820361017f19016103c0860152611319565b9060e08101519183810360e0850152602080845192838152019301905f5b81811061172c5750505061010081015161010084015261012081015191838103610120850152602080845192838152019301905f5b8181106116da575050506101609060018060a01b0361014082015116610140850152015191610160818303910152602080835192838152019201905f5b8181106116a55750505090565b90919260206102006001926116cf604088518051845285810151868501520151604083019061138b565b019401929101611698565b90919360206102206001926117218389516117158482516001600160801b036040809280518552826020820151166020860152015116910152565b0151606083019061138b565b01950192910161165b565b90919360206102c06001926117c960a0895180518452858101511515868501526001600160401b03604082015116604085015261178c606082015160608601906001600160401b036020809260018060c01b038151168552015116910152565b6117bc6080820151838601906001600160801b036040809280518552826020820151166020860152015116910152565b015161010083019061138b565b019501929101611626565b608081019081106001600160401b03821117610c0657604052565b604081019081106001600160401b03821117610c0657604052565b60a081019081106001600160401b03821117610c0657604052565b60c081019081106001600160401b03821117610c0657604052565b606081019081106001600160401b03821117610c0657604052565b90601f801991011681019081106001600160401b03821117610c0657604052565b6040519061022082018281106001600160401b03821117610c06576040526060610200836040516118ac8161180a565b5f81528360208201528360408201525f848201525f608082015281525f60208201525f60408201525f838201525f60808201526040516118eb816117ef565b5f81525f602082015260a0820152604051611905816117ef565b5f81525f602082015260c08201525f60e08201525f6101008201525f6101208201525f6101408201525f6101608201525f6101808201525f6101a08201525f6101c0820152826101e08201520152565b6040519061018082018281106001600160401b03821117610c06576040526060610160835f81525f60208201525f60408201525f838201525f60808201525f60a08201526119a161187c565b60c08201528260e08201525f610100820152826101208201525f6101408201520152565b519081151582036109e157565b51906001600160a01b03821682036109e157565b6001600160401b038111610c0657601f01601f191660200190565b929192611a0d826119e6565b91611a1b604051938461185b565b8294818452818301116109e1578281602093845f96015e010152565b6020818303126109e1578051906001600160401b0382116109e157019080601f830112156109e1578151611a6d92602001611a01565b90565b908160209103126109e1575160ff811681036109e15790565b51906001600160801b03821682036109e157565b51906001600160401b03821682036109e157565b908160209103126109e157516001600160601b03811681036109e15790565b6001600160401b038111610c065760051b60200190565b805115611af45760200190565b634e487b7160e01b5f52603260045260245ffd5b8051821015611af45760209160051b010190565b908160a09103126109e157608060405191611b368361180a565b611b3f816119d2565b8352611b4d602082016119d2565b6020840152611b5e604082016119d2565b6040840152611b6f606082016119d2565b60608401520151608082015290565b60405190611b8b8261180a565b5f608083604051611b9b8161180a565b83815283602082015283604082015283606082015283838201528152604051611bc381611825565b83815283602082015283604082015283606082015283838201528360a082015260208201528260408201528260608201520152565b60405190611c0582611840565b5f6040838281528260208201520152565b908160609103126109e157611c4d6040805192611c3284611840565b80518452611c4260208201611a89565b602085015201611a89565b604082015290565b60405190611c6282611825565b815f81525f60208201525f6040820152604051611c7e816117ef565b5f81525f60208201526060820152611c94611bf8565b608082015260a0611ca3611b7e565b910152565b94939091969592611cb7611955565b6001600160a01b038481168083526040516399e9918360e01b815260048101829052929a909890929160209183916024918391165afa9081156109ed575f916131c4575b5060808a01526001600160a01b03168015159081613155575b5015612a2957505050600160208601526040516307f1b29b60e11b8152602081600481875afa9081156109ed575f916129ef575b506001600160a01b03166040868101919091525163388af5b560e01b8152602081600481875afa9081156109ed575f916129b5575b506001600160a01b0316606086015260405163e4baaddf60e01b815291602083600481875afa9283156109ed575f93612979575b506001600160a01b0390921660a0860181815292611dcd61187c565b926040516338d52e0f60e01b8152602081600481875afa9081156109ed575f9161293f575b506040516395d89b4160e01b81525f81600481885afa9081156109ed575f91612925575b506040516306fdde0360e01b8152905f82600481895afa9182156109ed575f92612909575b5060405163313ce56760e01b8152916020836004818a5afa9283156109ed575f936128e8575b50604051632ba9c2b360e21b8152926020846004818b5afa9182156109ed5760ff945f936128c7575b5084929360405196611e9b8861180a565b60018060a01b03168752602087015260408601521660608401521660808201528452604051638da5cb5b60e01b8152602081600481875afa9081156109ed575f9161288d575b506001600160a01b031660208581019190915260405163e66f53b760e01b81529081600481875afa9081156109ed575f91612853575b506001600160a01b031660408581019190915251630229549960e51b8152602081600481875afa9081156109ed575f91612819575b506001600160a01b031660608501526040516334cc866d60e21b8152602081600481875afa9081156109ed575f916127e7575b50608085015260408051637cc4d9a160e01b81529081600481875afa9081156109ed575f916127c8575b5060a085015260408051633b1618dd60e11b81529081600481875afa9081156109ed575f9161276f575b5060c0850152604051631c61872f60e31b8152602081600481875afa9081156109ed575f91612735575b506001600160a01b031660e085015260405163ddca3f4360e01b8152602081600481875afa80156109ed576001600160601b03915f91612716575b501661010085015260405163011a412160e61b8152602081600481875afa9081156109ed575f916126dc575b506001600160a01b031661012085015260405163388af5b560e01b8152602081600481875afa9081156109ed575f916126a2575b506001600160a01b03166101408501526040516318160ddd60e01b8152602081600481875afa9081156109ed575f91612670575b5061016085015260405163568efc0760e01b8152602081600481875afa9081156109ed575f9161263e575b506101808501525f806040516020810190630872d2c560e21b82526004815261212160248261185b565b5190865afa3d15612636573d90612137826119e6565b91612145604051938461185b565b82523d5f602084013e5b8061262a575b612601575b50604051630a17b31360e41b8152602081600481875afa9081156109ed575f916125cf575b506121898161346e565b6101e086019081525f5b82811061255c5750506040516333f91ebb60e01b81529050602081600481875afa9081156109ed575f9161252a575b506121cc8161346e565b9061020086019182525f5b8181106124b757505060c089019485525151926121f384611ad0565b94612201604051968761185b565b848652601f1961221086611ad0565b015f5b8181106124a057505060e08a019586525f5b8581106122a957505094516040516370a0823160e01b8152600481019790975260209550869450602493508492506001600160a01b031690505afa9081156109ed575f91612277575b50610100830152565b90506020813d6020116122a1575b816122926020938361185b565b810103126109e157515f61226e565b3d9150612285565b6122b98161020084510151611b08565b51906122c3611c55565b91604051636638c7bb60e11b8152816004820152606081602481895afa9081156109ed575f91612423575b5080516001600160b81b031684526020808201511515908501526040908101516001600160401b031684820152805163518df2eb60e11b8152600481018390529081602481895afa9081156109ed575f916123f5575b506060848101919091526040516349e2903160e11b8152600481018390526001600160a01b0387166024820152919082806044810103816001600160a01b038c165afa9384156109ed576123ae8885936001976123c0965f916123c7575b5060808501528b6131f6565b60a08201528a51906109978383611b08565b5001612225565b6123e8915060603d81116123ee575b6123e0818361185b565b810190611c16565b5f6123a2565b503d6123d6565b612416915060403d811161241c575b61240e818361185b565b81019061342e565b5f612344565b503d612404565b90506060813d8211612498575b8161243d6060938361185b565b810103126109e15760405161245181611840565b8151906001600160b81b03821682036109e15761248d60406001600160401b039481948452612482602082016119c5565b602085015201611a9d565b8282015291506122ee565b3d9150612430565b6020906124ab611c55565b82828b01015201612213565b6040516362518ddf60e01b815260048101829052906020826024818a5afa80156109ed575f906124f8575b600192506124f1828651611b08565b52016121d7565b506020823d8211612522575b816125116020938361185b565b810103126109e157600191516124e2565b3d9150612504565b90506020813d602011612554575b816125456020938361185b565b810103126109e157515f6121c2565b3d9150612538565b60405163f7d1852160e01b815260048101829052906020826024818a5afa80156109ed575f9061259d575b60019250612596828551611b08565b5201612193565b506020823d82116125c7575b816125b66020938361185b565b810103126109e15760019151612587565b3d91506125a9565b90506020813d6020116125f9575b816125ea6020938361185b565b810103126109e157515f61217f565b3d91506125dd565b60016101a0860152602081519181808201938492010103126109e157516101c08501525f61215a565b50602081511015612155565b60609061214f565b90506020813d602011612668575b816126596020938361185b565b810103126109e157515f6120f7565b3d915061264c565b90506020813d60201161269a575b8161268b6020938361185b565b810103126109e157515f6120cc565b3d915061267e565b90506020813d6020116126d4575b816126bd6020938361185b565b810103126109e1576126ce906119d2565b5f612098565b3d91506126b0565b90506020813d60201161270e575b816126f76020938361185b565b810103126109e157612708906119d2565b5f612064565b3d91506126ea565b61272f915060203d602011610fdc57610fce818361185b565b5f612038565b90506020813d602011612767575b816127506020938361185b565b810103126109e157612761906119d2565b5f611ffd565b3d9150612743565b90506040813d6040116127c0575b8161278a6040938361185b565b810103126109e1576127b56020604051926127a4846117ef565b6127ad816119d2565b845201611a9d565b60208201525f611fd3565b3d915061277d565b6127e1915060403d60401161241c5761240e818361185b565b5f611fa9565b90506020813d602011612811575b816128026020938361185b565b810103126109e157515f611f7f565b3d91506127f5565b90506020813d60201161284b575b816128346020938361185b565b810103126109e157612845906119d2565b5f611f4c565b3d9150612827565b90506020813d602011612885575b8161286e6020938361185b565b810103126109e15761287f906119d2565b5f611f17565b3d9150612861565b90506020813d6020116128bf575b816128a86020938361185b565b810103126109e1576128b9906119d2565b5f611ee1565b3d915061289b565b8593506128e29060203d60201161121457611205818361185b565b92611e8a565b61290291935060203d60201161121457611205818361185b565b915f611e61565b61291e9192503d805f833e611230818361185b565b905f611e3b565b61293991503d805f833e611230818361185b565b5f611e16565b90506020813d602011612971575b8161295a6020938361185b565b810103126109e15761296b906119d2565b5f611df2565b3d915061294d565b9092506020813d6020116129ad575b816129956020938361185b565b810103126109e1576129a6906119d2565b915f611db1565b3d9150612988565b90506020813d6020116129e7575b816129d06020938361185b565b810103126109e1576129e1906119d2565b5f611d7d565b3d91506129c3565b90506020813d602011612a21575b81612a0a6020938361185b565b810103126109e157612a1b906119d2565b5f611d48565b3d91506129fd565b9294926001600160a01b031680151590816130e6575b5015612d185750600260208701526040516307f1b29b60e11b8152602081600481865afa9081156109ed575f91612cde575b506001600160a01b03166040878101919091525163388af5b560e01b8152602081600481865afa9081156109ed575f91612ca4575b506001600160a01b0316606087015260405163b045ff5b60e01b815292602084600481865afa9384156109ed575f94612c70575b50612ae484611ad0565b92612af2604051948561185b565b848452601f19612b0186611ad0565b015f5b818110612c3f57505061012088019384525f5b858110612b275750505050505050565b604051631f1a892160e11b81526004810182905260a081602481865afa9081156109ed575f91612c11575b50604051612b6460208201809361134c565b60a08152612b7360c08261185b565b5190206040516349e2903160e11b8152600481018290526001600160a01b0386166024820152909190606081806044810103816001600160a01b0389165afa9081156109ed57600193612bdd928b925f91612bf3575b50612bd5858b51611b08565b5152866131f6565b6020612bea838951611b08565b51015201612b17565b612c0b915060603d81116123ee576123e0818361185b565b5f612bc9565b612c32915060a03d8111612c38575b612c2a818361185b565b810190611b1c565b5f612b52565b503d612c20565b602090604051612c4e816117ef565b612c56611bf8565b8152612c60611b7e565b8382015282828901015201612b04565b9093506020813d602011612c9c575b81612c8c6020938361185b565b810103126109e15751925f612ada565b3d9150612c7f565b90506020813d602011612cd6575b81612cbf6020938361185b565b810103126109e157612cd0906119d2565b5f612aa6565b3d9150612cb2565b90506020813d602011612d10575b81612cf96020938361185b565b810103126109e157612d0a906119d2565b5f612a71565b3d9150612cec565b919392916001600160a01b0316801515915081613077575b501561306457600360208601526040516307f1b29b60e11b8152602081600481875afa9081156109ed575f9161302a575b506001600160a01b03166040868101919091525163388af5b560e01b8152602081600481875afa9081156109ed575f91612ff0575b506001600160a01b03166060860152604051630399e3a560e41b8152602081600481875afa9081156109ed575f91612fb6575b506001600160a01b031661014086015260405163ace48b4560e01b815291602083600481875afa9283156109ed575f93612f82575b50612e0883611ad0565b91612e16604051938461185b565b838352601f19612e2585611ad0565b015f5b818110612f5257505061016087019283525f5b848110612e4a57505050505050565b60405163779a968360e01b815260048101829052906020826024818a5afa9182156109ed575f92612f1f575b5081612e83828751611b08565b5152604051630dd5aa9b60e31b815260048101839052916020836024818b5afa80156109ed5785935f91612ee7575b5092612ed1916001946020612ec8868b51611b08565b510152856131f6565b6040612ede838851611b08565b51015201612e3b565b9350506020833d8211612f17575b81612f026020938361185b565b810103126109e1579151849290612ed1612eb2565b3d9150612ef5565b9091506020813d8211612f4a575b81612f3a6020938361185b565b810103126109e15751905f612e76565b3d9150612f2d565b602090604051612f6181611840565b5f81525f83820152612f71611b7e565b604082015282828801015201612e28565b9092506020813d602011612fae575b81612f9e6020938361185b565b810103126109e15751915f612dfe565b3d9150612f91565b90506020813d602011612fe8575b81612fd16020938361185b565b810103126109e157612fe2906119d2565b5f612dc9565b3d9150612fc4565b90506020813d602011613022575b8161300b6020938361185b565b810103126109e15761301c906119d2565b5f612d96565b3d9150612ffe565b90506020813d60201161305c575b816130456020938361185b565b810103126109e157613056906119d2565b5f612d61565b3d9150613038565b82636364223f60e01b5f5260045260245ffd5b60249150602090604051928380926335abafe560e21b82528860048301525afa9081156109ed575f916130ac575b505f612d30565b90506020813d6020116130de575b816130c76020938361185b565b810103126109e1576130d8906119c5565b5f6130a5565b3d91506130ba565b602491506020906040519283809263230dbab560e01b82528860048301525afa9081156109ed575f9161311b575b505f612a3f565b90506020813d60201161314d575b816131366020938361185b565b810103126109e157613147906119c5565b5f613114565b3d9150613129565b6024915060209060405192838092632c77566560e01b82528b60048301525afa9081156109ed575f9161318a575b505f611d14565b90506020813d6020116131bc575b816131a56020938361185b565b810103126109e1576131b6906119c5565b5f613183565b3d9150613198565b90506020813d6020116131ee575b816131df6020938361185b565b810103126109e157515f611cfb565b3d91506131d2565b929190613201611b7e565b604051632c3c915760e01b81526004810183905290946001600160a01b03169060a081602481855afa9182156109ed5760249260c0925f9161340f575b50875260405192838092632e3071cd60e11b82528660048301525afa9081156109ed575f91613372575b5060208501528351604001516001600160a01b031680613306575b508351606001516001600160a01b03928316921682146132a1575050565b6020906024604051809481936301977b5760e01b835260048301525afa9081156109ed575f916132d4575b506080830152565b90506020813d6020116132fe575b816132ef6020938361185b565b810103126109e157515f6132cc565b3d91506132e2565b60206004916040519283809263501ad8ff60e11b82525afa5f918161333e575b5015613283576001604086015260608501525f613283565b9091506020813d60201161336a575b8161335a6020938361185b565b810103126109e15751905f613326565b3d915061334d565b905060c0813d60c011613407575b8161338d60c0938361185b565b810103126109e1576133fc60a0604051926133a784611825565b6133b081611a89565b84526133be60208201611a89565b60208501526133cf60408201611a89565b60408501526133e060608201611a89565b60608501526133f160808201611a89565b608085015201611a89565b60a08201525f613268565b3d9150613380565b613428915060a03d60a011612c3857612c2a818361185b565b5f61323e565b908160409103126109e15760405190613446826117ef565b80516001600160c01b03811681036109e157825261346690602001611a9d565b602082015290565b9061347882611ad0565b613485604051918261185b565b8281528092613496601f1991611ad0565b019060203691013756fea26469706673582212206934034ed83a871ab879b4c92dbc7c8a0ac58840ebeee8c5291eb55dd46bf8ba64736f6c63430008230033";
