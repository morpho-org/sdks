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
  "0x60808060405234601557613e12908161001a8239f35b5f80fdfe60806040526004361015610011575f80fd5b5f3560e01c638509bc8914610024575f80fd5b34610b715760e0366003190112610b71576004356001600160a01b0381169003610b71576024356001600160a01b0381168103610b71576044356001600160a01b0381169003610b71576064356001600160a01b0381169003610b71576084356001600160a01b0381169003610b715760a4356001600160a01b0381169003610b715760c4356001600160a01b0381169003610b71576103606040526040516100cc81611b54565b5f8082526060602083018190526040830181905280830182905260809290925260a081905260c081905260e08190526101008190526101208190526101408190526101608190526101808290526101a08190526101c0919091526101e08190526102008190526102208190526102408190526102608190526102808190526102a08190526102c05261015c611d3f565b6102e0526060610300525f61032081905261034052604051635edec50d60e01b81526001600160a01b03600480358216908301526020908290602490829086165afa908115610b7d575f91611531575b5015611509576040516338d52e0f60e01b815260208160048181356001600160a01b03165afa908115610b7d575f916114cf575b506040516395d89b4160e01b81525f8160048181356001600160a01b03165afa908115610b7d575f916114b5575b506040516306fdde0360e01b8152905f8260048181356001600160a01b03165afa918215610b7d575f92611491575b5060405163313ce56760e01b81529160208360048181356001600160a01b03165afa918215610b7d5760ff935f93611460575b506040519461027e86611b54565b60018060a01b03168552602085015260408401521660608201526080526040516338d52e0f60e01b815260208160048160018060a01b038235165afa908115610b7d575f91611426575b506001600160a01b0390811660a05260405163ce04bebb60e01b815290602090829060049082908235165afa8015610b7d575f906113e6575b6001600160801b031660c052506040516318160ddd60e01b815260208160048181356001600160a01b03165afa908115610b7d575f916113b4575b5060e0526040516331c6651b60e21b815260208160048181356001600160a01b03165afa908115610b7d575f91611382575b506101005260405163ece1d6e560e01b815260208160048181356001600160a01b03165afa8015610b7d575f90611342575b6001600160401b0316610120525060405163c046371160e01b815260208160048181356001600160a01b03165afa8015610b7d575f90611302575b6001600160401b0316610140525060405163ad468d1160e01b815260208160048181356001600160a01b03165afa908115610b7d575f916112c8575b506001600160a01b03908116610160526040516305c0524560e31b8152905f90829060049082908235165afa908115610b7d575f91611278575b50610180526040516343bc43c160e11b815260208160048181356001600160a01b03165afa8015610b7d576001600160601b03915f91611259575b50166101e05260405163537bfaeb60e11b815260208160048181356001600160a01b03165afa8015610b7d576001600160601b03915f9161122a575b50166102005260405163ed27f7c960e01b815260208160048181356001600160a01b03165afa908115610b7d575f916111f0575b506001600160a01b03908116610220526040516306d9a30160e41b815290602090829060049082908235165afa908115610b7d575f916111b6575b506001600160a01b0316610240526101e0516001600160601b0316156111af57610220516040516326326d2760e21b81526001600160a01b039182166004808301919091529091602091839160249183919035165afa908115610b7d575f91611175575b505b151561026052610200516001600160601b03161561116e57610240516040516326326d2760e21b81526001600160a01b039182166004808301919091529091602091839160249183919035165afa908115610b7d575f91611134575b505b15156102805260a0516040516370a0823160e01b81526001600160a01b0360048035821690830152909160209183916024918391165afa908115610b7d575f91611102575b506102a0526040516370a0823160e01b815261dead60048083019190915260209082906024908290356001600160a01b03165afa908115610b7d575f916110d0575b50806102a060800152604051906303d1689d60e11b8252600482015260208160248160018060a01b03600435165afa908115610b7d575f9161109e575b50610340526044356001600160a01b031615158061101d575b6084356001600160a01b031615159081610f9a575b8080610f8d575b610f6a57808115610f63575b15156101a05215610daa5750604080519061071b8183611bf6565b600182525f5b601f1982018110610d675750506101c052610160516040516107a59160208201919061076a90829061075c906001600160a01b031685611f7f565b03601f198101835282611bf6565b5190206040519061077a82611b54565b81525f60208201525f60408201525f6060820152610140608001519061079f82611ee8565b52611ee8565b505b6101c051515f5b818110610c0157610160516001600160a01b031680610bd1575b50604051630b54457960e31b815260208160048181356001600160a01b03165afa908115610b7d575f91610b9f575b5061080181611ed1565b61080e6040519182611bf6565b818152601f1961081d83611ed1565b015f5b818110610b88575050610300525f5b818110610abc57604051602081528061091f6080516102e0602084015260018060a01b03815116610300840152606061089461087c6020840151608061032088015261038087019061156b565b60408401518682036102ff190161034088015261156b565b91015161036084015260a080516001600160a01b03908116604086015260c080516001600160801b0316606087015260e08051608088015261010080519488019490945261012080516001600160401b03908116938901939093526101405190921690870152610160519091169185019190915261018051848303601f19019185019190915261156b565b6101a05115156101408301526101c051828203601f19016101608401528051808352602092830192909101905f5b818110610a8257505050610a04906001600160601b0361016060800151166101808401526001600160601b0361018060800151166101a084015260018060a01b036101a060800151166101c084015260018060a01b036101c060800151166101e08401526101e06080015115156102008401526102006080015115156102208401526102206080015161024084015261024060800151151561026084015261026060800151601f198483030161028085015261168d565b61030051601f19838303016102a084015280518083526020600582901b8401810193928101925f918101905b838310610a5157610320516102c0880152610340516102e088015286860387f35b919395509193602080610a70600193601f19868203018752895161168d565b97019301930190928695949293610a30565b919350916020608060019260608751805183528481015185840152604081015160408401520151606082015201940191019184939261094d565b604051906313bd406b60e21b825280600483015260208260248160018060a01b03600435165afa918215610b7d575f92610b34575b50610b2d81610b1860019460c4359060a435906084359060643590604435906004356120e9565b6103005190610b278383611f09565b52611f09565b500161082f565b91506020823d8211610b75575b81610b4e60209383611bf6565b81010312610b7157610b2d81610b18610b68600195611dca565b94505050610af1565b5f80fd5b3d9150610b41565b6040513d5f823e3d90fd5b602090610b93611d3f565b82828601015201610820565b90506020813d602011610bc9575b81610bba60209383611bf6565b81010312610b715751816107f7565b3d9150610bad565b60016102c052610bf79060c4359060a435906084359060643590604435906004356120e9565b6102e052806107c8565b610c118161014060800151611f09565b5190815160405190632f0374dd60e21b8252600482015260208160248160018060a01b03600435165afa908115610b7d575f91610d36575b50602083015281516040519063a68bafa360e01b8252600482015260208160248160018060a01b03600435165afa908115610b7d575f91610d05575b5060408301528151916040519263c69507dd60e01b8452600484015260208360248160018060a01b03600435165afa928315610b7d575f93610cd1575b509160606001930152016107ae565b92506020833d8211610cfd575b81610ceb60209383611bf6565b81010312610b71579151916060610cc2565b3d9150610cde565b90506020813d8211610d2e575b81610d1f60209383611bf6565b81010312610b71575184610c85565b3d9150610d12565b90506020813d8211610d5f575b81610d5060209383611bf6565b81010312610b71575184610c49565b3d9150610d43565b602090604051610d7681611b54565b5f81525f838201525f60408201525f606082015282828601015201610721565b634e487b7160e01b5f52604160045260245ffd5b156107a757610dc86101006080015160208082518301019101611f1d565b6101605160405163cc3802bf60e01b8152915f91839160a49183916001600160a01b0390911690610dfd9060048401906115c2565b5afa908115610b7d575f91610ed3575b508051610e1981611ed1565b90610e276040519283611bf6565b808252610e36601f1991611ed1565b015f5b818110610ea45750506101c0525f5b8151811015610e9d5780610e9681610e6260019486611f09565b5160405190610e7082611b54565b81525f60208201525f60408201525f60608201526101406080015190610b278383611f09565b5001610e48565b50506107a7565b602090604051610eb381611b54565b5f81525f838201525f60408201525f606082015282828601015201610e39565b90503d805f833e610ee48183611bf6565b810190602081830312610b71578051906001600160401b038211610b7157019080601f83011215610b71578151610f1a81611ed1565b92610f286040519485611bf6565b81845260208085019260051b820101928311610b7157602001905b828210610f535750505081610e0d565b8151815260209182019101610f43565b5081610700565b61016051636364223f60e01b5f9081526001600160a01b03909116600452602490fd5b50610180515115156106f4565b610160516040516335abafe560e21b81526001600160a01b03918216600482015291925060209082906024908290608435165afa908115610b7d575f91610fe3575b50906106ed565b90506020813d602011611015575b81610ffe60209383611bf6565b81010312610b715761100f90611dbd565b82610fdc565b3d9150610ff1565b5061016051604051632c77566560e01b81526001600160a01b0391821660048201529060209082906024908290604435165afa908115610b7d575f91611064575b506106d8565b90506020813d602011611096575b8161107f60209383611bf6565b81010312610b715761109090611dbd565b8161105e565b3d9150611072565b90506020813d6020116110c8575b816110b960209383611bf6565b81010312610b715751816106bf565b3d91506110ac565b90506020813d6020116110fa575b816110eb60209383611bf6565b81010312610b71575181610682565b3d91506110de565b90506020813d60201161112c575b8161111d60209383611bf6565b81010312610b71575181610640565b3d9150611110565b90506020813d602011611166575b8161114f60209383611bf6565b81010312610b715761116090611dbd565b816105f9565b3d9150611142565b60016105fb565b90506020813d6020116111a7575b8161119060209383611bf6565b81010312610b71576111a190611dbd565b8161059b565b3d9150611183565b600161059d565b90506020813d6020116111e8575b816111d160209383611bf6565b81010312610b71576111e290611dca565b81610537565b3d91506111c4565b90506020813d602011611222575b8161120b60209383611bf6565b81010312610b715761121c90611dca565b816104fc565b3d91506111fe565b61124c915060203d602011611252575b6112448183611bf6565b810190611eb2565b826104c8565b503d61123a565b611272915060203d602011611252576112448183611bf6565b8261048c565b90503d805f833e6112898183611bf6565b810190602081830312610b71578051906001600160401b038211610b7157019080601f83011215610b715781516112c292602001611df9565b81610451565b90506020813d6020116112fa575b816112e360209383611bf6565b81010312610b71576112f490611dca565b81610417565b3d91506112d6565b506020813d60201161133a575b8161131c60209383611bf6565b81010312610b71576113356001600160401b0391611e9e565b6103db565b3d915061130f565b506020813d60201161137a575b8161135c60209383611bf6565b81010312610b71576113756001600160401b0391611e9e565b6103a0565b3d915061134f565b90506020813d6020116113ac575b8161139d60209383611bf6565b81010312610b7157518161036e565b3d9150611390565b90506020813d6020116113de575b816113cf60209383611bf6565b81010312610b7157518161033c565b3d91506113c2565b506020813d60201161141e575b8161140060209383611bf6565b81010312610b71576114196001600160801b0391611e8a565b610301565b3d91506113f3565b90506020813d602011611458575b8161144160209383611bf6565b81010312610b715761145290611dca565b816102c8565b3d9150611434565b61148391935060203d60201161148a575b61147b8183611bf6565b810190611e71565b9185610270565b503d611471565b6114ae9192503d805f833e6114a68183611bf6565b810190611e4c565b908361023d565b6114c991503d805f833e6114a68183611bf6565b8261020e565b90506020813d602011611501575b816114ea60209383611bf6565b81010312610b71576114fb90611dca565b816101e0565b3d91506114dd565b63634ba39d60e11b5f9081526001600160a01b03918216600490815235909116602452604490fd5b90506020813d602011611563575b8161154c60209383611bf6565b81010312610b715761155d90611dbd565b5f6101ac565b3d915061153f565b805180835260209291819084018484015e5f828201840152601f01601f1916010190565b90602080835192838152019201905f5b8181106115ac5750505090565b825184526020938401939092019160010161159f565b80516001600160a01b03908116835260208083015182169084015260408083015182169084015260608083015190911690830152608090810151910152565b60a06101c0916116128482516115c2565b6001600160801b0382602083015182815116828801528260208201511660c08801528260408201511660e0880152826060820151166101008801528260808201511661012088015201511661014085015260408101511515610160850152606081015161018085015260808101516101a08501520151910152565b60018060a01b03815116825260ff602082015116602083015260018060a01b03604082015116604083015260018060a01b0360608201511660608301526080810151608083015260018060a01b0360a08201511660a083015260c0810151906101c060c084015281516102806101c085015260018060a01b0381511661044085015260a061174761172f602084015160c061046089015261050088019061156b565b604084015187820361043f190161048089015261156b565b9160608101516104a087015260808101516104c0870152015161043f19858303016104e086015260ff60f81b815116825260c06117a8611796602084015160e0602087015260e086019061156b565b6040840151858203604087015261156b565b916060810151606085015260018060a01b03608082015116608085015260a081015160a085015201519160c0818303910152602080835192838152019201905f5b818110611b3e575050506020838101516001600160a01b039081166101e08701526040850151811661020087015260608501511661022086810191909152608085015161024087015260a085015180516001600160c01b0316610260880152909101516001600160401b031661028086015290611929906119109060c086015180516001600160a01b039081166102a08a01526020909101516001600160401b03166102c089015260e087015181166102e08901526101008701516103008901526101208701518116610320890152610140870151166103408801526101608601516103608801526101808601516103808801526101a086015115156103a08801526101c08601516103c08801526101e08601516101bf19888303016103e089015261158f565b6102008501518682036101bf190161040088015261158f565b92015161042084015260e08101519183810360e0850152602080845192838152019301905f5b818110611a965750505061010081015161010084015261012081015161012084015261014081015161014084015261016081015191838103610160850152602080845192838152019301905f5b818110611a26575050506101a09060018060a01b03610180820151166101808501520151916101a0818303910152602080835192838152019201905f5b8181106119e65750505090565b909192602061024060019260608751805183528481015185840152611a1360408201516040850190611601565b01516102208201520194019291016119d9565b909193602061030060019260608851611a408382516115c2565b611a708582015160a08501906001600160801b036040809280518552826020820151166020860152015116910152565b611a836040820151610100850190611601565b01516102e082015201950192910161199c565b90919360206102e0600192611b3360a0895180518452858101511515868501526001600160401b036040820151166040850152611af6606082015160608601906001600160401b036020809260018060c01b038151168552015116910152565b611b266080820151838601906001600160801b036040809280518552826020820151166020860152015116910152565b0151610100830190611601565b01950192910161194f565b82518452602093840193909201916001016117e9565b608081019081106001600160401b03821117610d9657604052565b60e081019081106001600160401b03821117610d9657604052565b604081019081106001600160401b03821117610d9657604052565b60c081019081106001600160401b03821117610d9657604052565b60a081019081106001600160401b03821117610d9657604052565b606081019081106001600160401b03821117610d9657604052565b90601f801991011681019081106001600160401b03821117610d9657604052565b60405190611c2482611b6f565b606060c0835f81528260208201528260408201525f838201525f60808201525f60a08201520152565b6040519061024082018281106001600160401b03821117610d96576040525f61022083604051611c7c81611ba5565b8381526060602082015260606040820152836060820152836080820152611ca1611c17565b60a08201528152826020820152826040820152826060820152826080820152604051611ccc81611b8a565b83815283602082015260a0820152604051611ce681611b8a565b83815283602082015260c08201528260e08201528261010082015282610120820152826101408201528261016082015282610180820152826101a0820152826101c082015260606101e082015260606102008201520152565b604051906101c082018281106001600160401b03821117610d965760405260606101a0835f81525f60208201525f60408201525f838201525f60808201525f60a0820152611d8b611c4d565b60c08201528260e08201525f6101008201525f6101208201525f610140820152826101608201525f6101808201520152565b51908115158203610b7157565b51906001600160a01b0382168203610b7157565b6001600160401b038111610d9657601f01601f191660200190565b929192611e0582611dde565b91611e136040519384611bf6565b829481845281830111610b71578281602093845f96015e010152565b9080601f83011215610b71578151611e4992602001611df9565b90565b90602082820312610b715781516001600160401b038111610b7157611e499201611e2f565b90816020910312610b71575160ff81168103610b715790565b51906001600160801b0382168203610b7157565b51906001600160401b0382168203610b7157565b90816020910312610b7157516001600160601b0381168103610b715790565b6001600160401b038111610d965760051b60200190565b805115611ef55760200190565b634e487b7160e01b5f52603260045260245ffd5b8051821015611ef55760209160051b010190565b908160a0910312610b7157608060405191611f3783611bc0565b611f4081611dca565b8352611f4e60208201611dca565b6020840152611f5f60408201611dca565b6040840152611f7060608201611dca565b60608401520151608082015290565b6040808252600490820152637468697360e01b60608201526001600160a01b03909116602082015260800190565b60405190611fba82611bc0565b5f6080838281528260208201528260408201528260608201520152565b60405190611fe482611ba5565b5f60a083611ff0611fad565b8152604051611ffe81611ba5565b838152836020820152836040820152836060820152836080820152838382015260208201528260408201528260608201528260808201520152565b6040519061204682611bdb565b5f6040838281528260208201520152565b90816060910312610b715761208e604080519261207384611bdb565b8051845261208360208201611e8a565b602085015201611e8a565b604082015290565b604051906120a382611ba5565b815f81525f60208201525f60408201526040516120bf81611b8a565b5f81525f602082015260608201526120d5612039565b608082015260a06120e4611fd7565b910152565b9493969592966120f7611d3f565b6001600160a01b038381168083526040516399e9918360e01b815260048101829052929a9098909116949091602081602481895afa908115610b7d575f91613a10575b5060808b015260405160208101906121568161075c8885611f7f565b51902060405190632f0374dd60e21b82526004820152602081602481895afa908115610b7d575f916139de575b506101408b01526001600160a01b0316801515908161396f575b501561310c5750505050600160208601526040516307f1b29b60e11b8152602081600481875afa908115610b7d575f916130d2575b506001600160a01b03166040868101919091525163388af5b560e01b8152602081600481875afa908115610b7d575f91613098575b506001600160a01b0316606086015260405163e4baaddf60e01b815291602083600481875afa928315610b7d575f9361305c575b506001600160a01b0390921660a0860181815292612257611c4d565b926040516338d52e0f60e01b8152602081600481875afa908115610b7d575f91613022575b506040516395d89b4160e01b81525f81600481885afa908115610b7d575f91613008575b506040516306fdde0360e01b81525f81600481895afa908115610b7d575f91612fee575b5060405163313ce56760e01b8152906020826004818a5afa918215610b7d575f92612fcd575b50604051632ba9c2b360e21b8152926020846004818b5afa938415610b7d575f94612fac575b50612319611c17565b505f8060405160208101906342580cb760e11b82526004815261233d602482611bf6565b51908b5afa61234a613d7b565b9015612f7157805181019060e08160208401930312610b715760208101516001600160f81b0319811690819003610b715760408201516001600160401b038111610b715783602061239d92850101611e2f565b60608301516001600160401b038111610b71578460206123bf92860101611e2f565b608084015160a08501516001600160a01b0381169491939190859003610b715760c08601519560e0810151906001600160401b038211610b7157019680603f89011215610b7157602088015161241481611ed1565b986124226040519a8b611bf6565b818a52602080808c019360051b83010101928311610b7157604001905b828210612f6157505050926124659a98959260ff9a9794928b9996936040519d8e611b6f565b8d5260208d015260408c015260608b015260808a015260a089015260c08801526040519761249289611ba5565b60018060a01b031688526020880152604087015216606085015216608083015260a08201528452604051638da5cb5b60e01b8152602081600481875afa908115610b7d575f91612f27575b506001600160a01b031660208581019190915260405163e66f53b760e01b81529081600481875afa908115610b7d575f91612eed575b506001600160a01b031660408581019190915251630229549960e51b8152602081600481875afa908115610b7d575f91612eb3575b506001600160a01b031660608501526040516334cc866d60e21b8152602081600481875afa908115610b7d575f91612e81575b50608085015260408051637cc4d9a160e01b81529081600481875afa908115610b7d575f91612e62575b5060a085015260408051633b1618dd60e11b81529081600481875afa908115610b7d575f91612e09575b5060c0850152604051631c61872f60e31b8152602081600481875afa908115610b7d575f91612dcf575b506001600160a01b031660e085015260405163ddca3f4360e01b8152602081600481875afa8015610b7d576001600160601b03915f91612db0575b501661010085015260405163011a412160e61b8152602081600481875afa908115610b7d575f91612d76575b506001600160a01b031661012085015260405163388af5b560e01b8152602081600481875afa908115610b7d575f91612d3c575b506001600160a01b03166101408501526040516318160ddd60e01b8152602081600481875afa908115610b7d575f91612d0a575b5061016085015260405163568efc0760e01b8152602081600481875afa908115610b7d575f91612cd8575b506101808501526040516370a0823160e01b815261dead6004820152602081602481875afa908115610b7d575f91612ca6575b506102208501525f806040516020810190630872d2c560e21b825260048152612750602482611bf6565b5190865afa61275d613d7b565b9080612c9a575b612c71575b50604051630a17b31360e41b8152602081600481875afa908115610b7d575f91612c3f575b5061279881613daa565b6101e086019081525f5b828110612bcc5750506040516333f91ebb60e01b81529050602081600481875afa908115610b7d575f91612b9a575b506127db81613daa565b9061020086019182525f5b818110612b2757505060c0890194855251519261280284611ed1565b946128106040519687611bf6565b848652601f1961281f86611ed1565b015f5b818110612b1057505060e08a019586525f5b85811061291957505094516040516370a0823160e01b815260048101889052955060209450859350602492508391506001600160a01b03165afa908115610b7d575f916128e6575b50610100840152604051634450bdef60e11b815290602090829060049082905afa908115610b7d575f916128b4575b50610120830152565b90506020813d6020116128de575b816128cf60209383611bf6565b81010312610b7157515f6128ab565b3d91506128c2565b90506020813d602011612911575b8161290160209383611bf6565b81010312610b715751600461287c565b3d91506128f4565b6129298161020084510151611f09565b5190612933612096565b91604051636638c7bb60e11b8152816004820152606081602481895afa908115610b7d575f91612a93575b5080516001600160b81b031684526020808201511515908501526040908101516001600160401b031684820152805163518df2eb60e11b8152600481018390529081602481895afa908115610b7d575f91612a65575b506060848101919091526040516349e2903160e11b8152600481018390526001600160a01b0387166024820152919082806044810103816001600160a01b038c165afa938415610b7d57612a1e888593600197612a30965f91612a37575b5060808501528b613a42565b60a08201528a5190610b278383611f09565b5001612834565b612a58915060603d8111612a5e575b612a508183611bf6565b810190612057565b5f612a12565b503d612a46565b612a86915060403d8111612a8c575b612a7e8183611bf6565b810190613d3b565b5f6129b4565b503d612a74565b90506060813d8211612b08575b81612aad60609383611bf6565b81010312610b7157604051612ac181611bdb565b8151906001600160b81b0382168203610b7157612afd60406001600160401b039481948452612af260208201611dbd565b602085015201611e9e565b82820152915061295e565b3d9150612aa0565b602090612b1b612096565b82828b01015201612822565b6040516362518ddf60e01b815260048101829052906020826024818a5afa8015610b7d575f90612b68575b60019250612b61828651611f09565b52016127e6565b506020823d8211612b92575b81612b8160209383611bf6565b81010312610b715760019151612b52565b3d9150612b74565b90506020813d602011612bc4575b81612bb560209383611bf6565b81010312610b7157515f6127d1565b3d9150612ba8565b60405163f7d1852160e01b815260048101829052906020826024818a5afa8015610b7d575f90612c0d575b60019250612c06828551611f09565b52016127a2565b506020823d8211612c37575b81612c2660209383611bf6565b81010312610b715760019151612bf7565b3d9150612c19565b90506020813d602011612c69575b81612c5a60209383611bf6565b81010312610b7157515f61278e565b3d9150612c4d565b60016101a086015260208151918180820193849201010312610b7157516101c08501525f612769565b50602081511015612764565b90506020813d602011612cd0575b81612cc160209383611bf6565b81010312610b7157515f612726565b3d9150612cb4565b90506020813d602011612d02575b81612cf360209383611bf6565b81010312610b7157515f6126f3565b3d9150612ce6565b90506020813d602011612d34575b81612d2560209383611bf6565b81010312610b7157515f6126c8565b3d9150612d18565b90506020813d602011612d6e575b81612d5760209383611bf6565b81010312610b7157612d6890611dca565b5f612694565b3d9150612d4a565b90506020813d602011612da8575b81612d9160209383611bf6565b81010312610b7157612da290611dca565b5f612660565b3d9150612d84565b612dc9915060203d602011611252576112448183611bf6565b5f612634565b90506020813d602011612e01575b81612dea60209383611bf6565b81010312610b7157612dfb90611dca565b5f6125f9565b3d9150612ddd565b90506040813d604011612e5a575b81612e2460409383611bf6565b81010312610b7157612e4f602060405192612e3e84611b8a565b612e4781611dca565b845201611e9e565b60208201525f6125cf565b3d9150612e17565b612e7b915060403d604011612a8c57612a7e8183611bf6565b5f6125a5565b90506020813d602011612eab575b81612e9c60209383611bf6565b81010312610b7157515f61257b565b3d9150612e8f565b90506020813d602011612ee5575b81612ece60209383611bf6565b81010312610b7157612edf90611dca565b5f612548565b3d9150612ec1565b90506020813d602011612f1f575b81612f0860209383611bf6565b81010312610b7157612f1990611dca565b5f612513565b3d9150612efb565b90506020813d602011612f59575b81612f4260209383611bf6565b81010312610b7157612f5390611dca565b5f6124dd565b3d9150612f35565b815181526020918201910161243f565b60405162461bcd60e51b8152602060048201526013602482015272195a5c0dcc4c911bdb585a5b8819985a5b1959606a1b6044820152606490fd5b612fc691945060203d60201161148a5761147b8183611bf6565b925f612310565b612fe791925060203d60201161148a5761147b8183611bf6565b905f6122ea565b61300291503d805f833e6114a68183611bf6565b5f6122c4565b61301c91503d805f833e6114a68183611bf6565b5f6122a0565b90506020813d602011613054575b8161303d60209383611bf6565b81010312610b715761304e90611dca565b5f61227c565b3d9150613030565b9092506020813d602011613090575b8161307860209383611bf6565b81010312610b715761308990611dca565b915f61223b565b3d915061306b565b90506020813d6020116130ca575b816130b360209383611bf6565b81010312610b71576130c490611dca565b5f612207565b3d91506130a6565b90506020813d602011613104575b816130ed60209383611bf6565b81010312610b71576130fe90611dca565b5f6121d2565b3d91506130e0565b92959194919391926001600160a01b03168015159081613900575b50156134a85750600260208801526040516307f1b29b60e11b8152602081600481875afa908115610b7d575f9161346e575b506001600160a01b03166040888101919091525163388af5b560e01b8152602081600481875afa908115610b7d575f91613434575b506001600160a01b0316606088015260405163b045ff5b60e01b815293602085600481875afa948515610b7d575f95613400575b506131cc85611ed1565b936131da6040519586611bf6565b858552601f196131e987611ed1565b015f5b8181106133bc57505061016089019485525f5b868110613210575050505050505050565b604051631f1a892160e11b81526004810182905260a081602481865afa908115610b7d575f9161338e575b50604051602081019061324e82846115c2565b60a0815261325d60c082611bf6565b519020908061326d848a51611f09565b51526040516349e2903160e11b8152600481018390526001600160a01b0386166024820152606081806044810103816001600160a01b038c165afa908115610b7d576132ef936132d992868c8b945f93613365575b506020916132d09151611f09565b51015289613a42565b60406132e6858b51611f09565b51015284613cd9565b9060405191632f0374dd60e21b835260048301526020826024818c5afa8015610b7d575f90613333575b60019250606061332a838a51611f09565b510152016131ff565b506020823d821161335d575b8161334c60209383611bf6565b81010312610b715760019151613319565b3d915061333f565b6132d09193509161338560209360603d8111612a5e57612a508183611bf6565b939150916132c2565b6133af915060a03d81116133b5575b6133a78183611bf6565b810190611f1d565b5f61323b565b503d61339d565b6020906040516133cb81611b54565b6133d3611fad565b81526133dd612039565b838201526133e9611fd7565b60408201525f606082015282828a010152016131ec565b9094506020813d60201161342c575b8161341c60209383611bf6565b81010312610b715751935f6131c2565b3d915061340f565b90506020813d602011613466575b8161344f60209383611bf6565b81010312610b715761346090611dca565b5f61318e565b3d9150613442565b90506020813d6020116134a0575b8161348960209383611bf6565b81010312610b715761349a90611dca565b5f613159565b3d915061347c565b9093919291906001600160a01b03168015159081613891575b501561387e57600360208801526040516307f1b29b60e11b8152602081600481865afa908115610b7d575f91613844575b506001600160a01b03166040888101919091525163388af5b560e01b8152602081600481865afa908115610b7d575f9161380a575b506001600160a01b03166060880152604051630399e3a560e41b8152602081600481865afa908115610b7d575f916137d0575b506001600160a01b031661018088015260405163ace48b4560e01b815293602085600481865afa948515610b7d575f9561379c575b5061359985611ed1565b936135a76040519586611bf6565b858552601f196135b687611ed1565b015f5b8181106137665750506101a089019485525f5b8681106135dd575050505050505050565b60405163779a968360e01b815260048101829052602081602481895afa908115610b7d575f91613735575b5080613615838951611f09565b5152604051630dd5aa9b60e31b8152600481018290526020816024818a5afa8015610b7d5785915f916136ff575b509161365f926020613656868c51611f09565b51015284613a42565b604061366c838951611f09565b510152613689604061367f838951611f09565b5101515185613cd9565b9060405191632f0374dd60e21b835260048301526020826024818c5afa8015610b7d575f906136cd575b6001925060606136c4838a51611f09565b510152016135cc565b506020823d82116136f7575b816136e660209383611bf6565b81010312610b7157600191516136b3565b3d91506136d9565b9150506020813d821161372d575b8161371a60209383611bf6565b81010312610b715751849061365f613643565b3d915061370d565b90506020813d821161375e575b8161374f60209383611bf6565b81010312610b7157515f613608565b3d9150613742565b60209060405161377581611b54565b5f81525f83820152613785611fd7565b60408201525f606082015282828a010152016135b9565b9094506020813d6020116137c8575b816137b860209383611bf6565b81010312610b715751935f61358f565b3d91506137ab565b90506020813d602011613802575b816137eb60209383611bf6565b81010312610b71576137fc90611dca565b5f61355a565b3d91506137de565b90506020813d60201161383c575b8161382560209383611bf6565b81010312610b715761383690611dca565b5f613527565b3d9150613818565b90506020813d602011613876575b8161385f60209383611bf6565b81010312610b715761387090611dca565b5f6134f2565b3d9150613852565b50636364223f60e01b5f5260045260245ffd5b60249150602090604051928380926335abafe560e21b82528760048301525afa908115610b7d575f916138c6575b505f6134c1565b90506020813d6020116138f8575b816138e160209383611bf6565b81010312610b71576138f290611dbd565b5f6138bf565b3d91506138d4565b602491506020906040519283809263230dbab560e01b82528960048301525afa908115610b7d575f91613935575b505f613127565b90506020813d602011613967575b8161395060209383611bf6565b81010312610b715761396190611dbd565b5f61392e565b3d9150613943565b6024915060209060405192838092632c77566560e01b82528c60048301525afa908115610b7d575f916139a4575b505f61219d565b90506020813d6020116139d6575b816139bf60209383611bf6565b81010312610b71576139d090611dbd565b5f61399d565b3d91506139b2565b90506020813d602011613a08575b816139f960209383611bf6565b81010312610b7157515f612183565b3d91506139ec565b90506020813d602011613a3a575b81613a2b60209383611bf6565b81010312610b7157515f61213a565b3d9150613a1e565b929190613a4d611fd7565b604051632c3c915760e01b81526004810183905290946001600160a01b03169060a081602481855afa908115610b7d575f91613cba575b508552604051632e3071cd60e11b81526004810183905260c081602481855afa908115610b7d575f91613c17575b506044916060916020880152604051928380926349e2903160e11b825286600483015261dead60248301525afa908115610b7d575f91613bf8575b505160a08501528351604001516001600160a01b031680613b8c575b508351606001516001600160a01b0392831692168214613b27575050565b6020906024604051809481936301977b5760e01b835260048301525afa908115610b7d575f91613b5a575b506080830152565b90506020813d602011613b84575b81613b7560209383611bf6565b81010312610b7157515f613b52565b3d9150613b68565b60206004916040519283809263501ad8ff60e11b82525afa5f9181613bc4575b5015613b09576001604086015260608501525f613b09565b9091506020813d602011613bf0575b81613be060209383611bf6565b81010312610b715751905f613bac565b3d9150613bd3565b613c11915060603d606011612a5e57612a508183611bf6565b5f613aed565b905060c0813d60c011613cb2575b81613c3260c09383611bf6565b81010312610b7157604491606091613ca560a060405192613c5284611ba5565b613c5b81611e8a565b8452613c6960208201611e8a565b6020850152613c7a60408201611e8a565b6040850152613c8a868201611e8a565b86850152613c9a60808201611e8a565b608085015201611e8a565b60a0820152915091613ab2565b3d9150613c25565b613cd3915060a03d60a0116133b5576133a78183611bf6565b5f613a84565b90613d2460405191602083019360e08552601161010085015270746869732f6d61726b6574506172616d7360781b61012085015260018060a01b0316604084015260608301906115c2565b6101208152613d3561014082611bf6565b51902090565b90816040910312610b715760405190613d5382611b8a565b80516001600160c01b0381168103610b71578252613d7390602001611e9e565b602082015290565b3d15613da5573d90613d8c82611dde565b91613d9a6040519384611bf6565b82523d5f602084013e565b606090565b90613db482611ed1565b613dc16040519182611bf6565b8281528092613dd2601f1991611ed1565b019060203691013756fea26469706673582212200b62ad2c75c7b2129d7b5fce6431d887a994f0b79568ef3cd776f49aa90824e164736f6c63430008240033";
