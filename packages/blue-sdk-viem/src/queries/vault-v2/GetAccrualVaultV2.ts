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
  "0x608080604052346015576139dd908161001a8239f35b5f80fdfe60806040526004361015610011575f80fd5b5f3560e01c638509bc8914610024575f80fd5b34610ae35760e0366003190112610ae3576004356001600160a01b0381169003610ae3576024356001600160a01b0381168103610ae3576044356001600160a01b0381169003610ae3576064356001600160a01b0381169003610ae3576084356001600160a01b0381169003610ae35760a4356001600160a01b0381169003610ae35760c4356001600160a01b0381169003610ae3576103206040526040516100cc81611a1c565b5f8082526060602083018190526040830181905280830182905260809290925260a081905260c081905260e08190526101008190526101208190526101408190526101608190526101808290526101a08190526101c0919091526101e08190526102008190526102208190526102408190526102608190526102808190526102a08190526102c05261015c611bfb565b6102e052606061030052604051635edec50d60e01b81526001600160a01b03600480358216908301526020908290602490829086165afa908115610aef575f9161143f575b5015611417576040516338d52e0f60e01b815260208160048181356001600160a01b03165afa908115610aef575f916113dd575b506040516395d89b4160e01b81525f8160048181356001600160a01b03165afa908115610aef575f916113c3575b506040516306fdde0360e01b8152905f8260048181356001600160a01b03165afa918215610aef575f9261139f575b5060405163313ce56760e01b81529160208360048181356001600160a01b03165afa918215610aef5760ff935f9361136e575b506040519461027386611a1c565b60018060a01b03168552602085015260408401521660608201526080526040516338d52e0f60e01b815260208160048160018060a01b038235165afa908115610aef575f91611334575b506001600160a01b0390811660a05260405163ce04bebb60e01b815290602090829060049082908235165afa8015610aef575f906112f4575b6001600160801b031660c052506040516318160ddd60e01b815260208160048181356001600160a01b03165afa908115610aef575f916112c2575b5060e0526040516331c6651b60e21b815260208160048181356001600160a01b03165afa908115610aef575f91611290575b506101005260405163ece1d6e560e01b815260208160048181356001600160a01b03165afa8015610aef575f90611250575b6001600160401b0316610120525060405163c046371160e01b815260208160048181356001600160a01b03165afa8015610aef575f90611210575b6001600160401b0316610140525060405163ad468d1160e01b815260208160048181356001600160a01b03165afa908115610aef575f916111d6575b506001600160a01b03908116610160526040516305c0524560e31b8152905f90829060049082908235165afa908115610aef575f91611186575b50610180526040516343bc43c160e11b815260208160048181356001600160a01b03165afa8015610aef576001600160601b03915f91611167575b50166101e05260405163537bfaeb60e11b815260208160048181356001600160a01b03165afa8015610aef576001600160601b03915f91611138575b50166102005260405163ed27f7c960e01b815260208160048181356001600160a01b03165afa908115610aef575f916110fe575b506001600160a01b03908116610220526040516306d9a30160e41b815290602090829060049082908235165afa908115610aef575f916110c4575b506001600160a01b0316610240526101e0516001600160601b0316156110bd57610220516040516326326d2760e21b81526001600160a01b039182166004808301919091529091602091839160249183919035165afa908115610aef575f91611083575b505b151561026052610200516001600160601b03161561107c57610240516040516326326d2760e21b81526001600160a01b039182166004808301919091529091602091839160249183919035165afa908115610aef575f91611042575b505b15156102805260a0516040516370a0823160e01b81526001600160a01b0360048035821690830152909160209183916024918391165afa908115610aef575f91611010575b506102a0526044356001600160a01b0316151580610f8f575b6084356001600160a01b031615159081610f0c575b8080610eff575b610edc57808115610ed5575b15156101a05215610d1c575060408051906106918183611abe565b600182525f5b601f1982018110610cd95750506101406080015261072b60018060a01b0360e0608001511660405160208101916040835260046060830152637468697360e01b60808301526040820152608081526106f060a082611abe565b5190206040519061070082611a1c565b81525f60208201525f60408201525f6060820152610140608001519061072582611d9d565b52611d9d565b505b6101c051515f5b818110610b7357610160516001600160a01b031680610b43575b50604051630b54457960e31b815260208160048181356001600160a01b03165afa908115610aef575f91610b11575b5061078781611d86565b6107946040519182611abe565b818152601f196107a383611d86565b015f5b818110610afa575050610300525f5b818110610a2e5760405160208152806108a56080516102a0602084015260018060a01b038151166102c0840152606061081a610802602084015160806102e0880152610340870190611479565b60408401518682036102bf1901610300880152611479565b91015161032084015260a080516001600160a01b03908116604086015260c080516001600160801b0316606087015260e08051608088015261010080519488019490945261012080516001600160401b03908116938901939093526101405190921690870152610160519091169185019190915261018051848303601f190191850191909152611479565b6101a05115156101408301526101c051828203601f19016101608401528051808352602092830192909101905f5b8181106109f45750505061098a906001600160601b0361016060800151166101808401526001600160601b0361018060800151166101a084015260018060a01b036101a060800151166101c084015260018060a01b036101c060800151166101e08401526101e06080015115156102008401526102006080015115156102208401526102206080015161024084015261024060800151151561026084015261026060800151601f1984830301610280850152611590565b61030051601f19838303016102a084015280518083526020600582901b8401810193928101925f918101905b8383106109c35786860387f35b9193955091936020806109e2600193601f198682030187528951611590565b970193019301909286959492936109b6565b91935091602060806001926060875180518352848101518584015260408101516040840152015160608201520194019101918493926108d3565b604051906313bd406b60e21b825280600483015260208260248160018060a01b03600435165afa918215610aef575f92610aa6575b50610a9f81610a8a60019460c4359060a43590608435906064359060443590600435611f6a565b6103005190610a998383611dbe565b52611dbe565b50016107b5565b91506020823d8211610ae7575b81610ac060209383611abe565b81010312610ae357610a9f81610a8a610ada600195611c7f565b94505050610a63565b5f80fd5b3d9150610ab3565b6040513d5f823e3d90fd5b602090610b05611bfb565b828286010152016107a6565b90506020813d602011610b3b575b81610b2c60209383611abe565b81010312610ae357518161077d565b3d9150610b1f565b60016102c052610b699060c4359060a43590608435906064359060443590600435611f6a565b6102e0528061074e565b610b838161014060800151611dbe565b5190815160405190632f0374dd60e21b8252600482015260208160248160018060a01b03600435165afa908115610aef575f91610ca8575b50602083015281516040519063a68bafa360e01b8252600482015260208160248160018060a01b03600435165afa908115610aef575f91610c77575b5060408301528151916040519263c69507dd60e01b8452600484015260208360248160018060a01b03600435165afa928315610aef575f93610c43575b50916060600193015201610734565b92506020833d8211610c6f575b81610c5d60209383611abe565b81010312610ae3579151916060610c34565b3d9150610c50565b90506020813d8211610ca0575b81610c9160209383611abe565b81010312610ae3575184610bf7565b3d9150610c84565b90506020813d8211610cd1575b81610cc260209383611abe565b81010312610ae3575184610bbb565b3d9150610cb5565b602090604051610ce881611a1c565b5f81525f838201525f60408201525f606082015282828601015201610697565b634e487b7160e01b5f52604160045260245ffd5b1561072d57610d3a6101006080015160208082518301019101611dd2565b6101605160405163cc3802bf60e01b8152915f91839160a49183916001600160a01b0390911690610d6f9060048401906114d0565b5afa908115610aef575f91610e45575b508051610d8b81611d86565b90610d996040519283611abe565b808252610da8601f1991611d86565b015f5b818110610e165750506101c0525f5b8151811015610e0f5780610e0881610dd460019486611dbe565b5160405190610de282611a1c565b81525f60208201525f60408201525f60608201526101406080015190610a998383611dbe565b5001610dba565b505061072d565b602090604051610e2581611a1c565b5f81525f838201525f60408201525f606082015282828601015201610dab565b90503d805f833e610e568183611abe565b810190602081830312610ae3578051906001600160401b038211610ae357019080601f83011215610ae3578151610e8c81611d86565b92610e9a6040519485611abe565b81845260208085019260051b820101928311610ae357602001905b828210610ec55750505081610d7f565b8151815260209182019101610eb5565b5081610676565b61016051636364223f60e01b5f9081526001600160a01b03909116600452602490fd5b506101805151151561066a565b610160516040516335abafe560e21b81526001600160a01b03918216600482015291925060209082906024908290608435165afa908115610aef575f91610f55575b5090610663565b90506020813d602011610f87575b81610f7060209383611abe565b81010312610ae357610f8190611c72565b82610f4e565b3d9150610f63565b5061016051604051632c77566560e01b81526001600160a01b0391821660048201529060209082906024908290604435165afa908115610aef575f91610fd6575b5061064e565b90506020813d602011611008575b81610ff160209383611abe565b81010312610ae35761100290611c72565b81610fd0565b3d9150610fe4565b90506020813d60201161103a575b8161102b60209383611abe565b81010312610ae3575181610635565b3d915061101e565b90506020813d602011611074575b8161105d60209383611abe565b81010312610ae35761106e90611c72565b816105ee565b3d9150611050565b60016105f0565b90506020813d6020116110b5575b8161109e60209383611abe565b81010312610ae3576110af90611c72565b81610590565b3d9150611091565b6001610592565b90506020813d6020116110f6575b816110df60209383611abe565b81010312610ae3576110f090611c7f565b8161052c565b3d91506110d2565b90506020813d602011611130575b8161111960209383611abe565b81010312610ae35761112a90611c7f565b816104f1565b3d915061110c565b61115a915060203d602011611160575b6111528183611abe565b810190611d67565b826104bd565b503d611148565b611180915060203d602011611160576111528183611abe565b82610481565b90503d805f833e6111978183611abe565b810190602081830312610ae3578051906001600160401b038211610ae357019080601f83011215610ae35781516111d092602001611cae565b81610446565b90506020813d602011611208575b816111f160209383611abe565b81010312610ae35761120290611c7f565b8161040c565b3d91506111e4565b506020813d602011611248575b8161122a60209383611abe565b81010312610ae3576112436001600160401b0391611d53565b6103d0565b3d915061121d565b506020813d602011611288575b8161126a60209383611abe565b81010312610ae3576112836001600160401b0391611d53565b610395565b3d915061125d565b90506020813d6020116112ba575b816112ab60209383611abe565b81010312610ae3575181610363565b3d915061129e565b90506020813d6020116112ec575b816112dd60209383611abe565b81010312610ae3575181610331565b3d91506112d0565b506020813d60201161132c575b8161130e60209383611abe565b81010312610ae3576113276001600160801b0391611d3f565b6102f6565b3d9150611301565b90506020813d602011611366575b8161134f60209383611abe565b81010312610ae35761136090611c7f565b816102bd565b3d9150611342565b61139191935060203d602011611398575b6113898183611abe565b810190611d26565b9185610265565b503d61137f565b6113bc9192503d805f833e6113b48183611abe565b810190611d01565b9083610232565b6113d791503d805f833e6113b48183611abe565b82610203565b90506020813d60201161140f575b816113f860209383611abe565b81010312610ae35761140990611c7f565b816101d5565b3d91506113eb565b63634ba39d60e11b5f9081526001600160a01b03918216600490815235909116602452604490fd5b90506020813d602011611471575b8161145a60209383611abe565b81010312610ae35761146b90611c72565b5f6101a1565b3d915061144d565b805180835260209291819084018484015e5f828201840152601f01601f1916010190565b90602080835192838152019201905f5b8181106114ba5750505090565b82518452602093840193909201916001016114ad565b80516001600160a01b03908116835260208083015182169084015260408083015182169084015260608083015190911690830152608090810151910152565b60806101a0916115208482516114d0565b6001600160801b0360a0602083015182815116828801528260208201511660c08801528260408201511660e0880152826060820151166101008801528285820151166101208801520151166101408501526040810151151561016085015260608101516101808501520151910152565b60018060a01b03815116825260ff602082015116602083015260018060a01b03604082015116604083015260018060a01b0360608201511660608301526080810151608083015260018060a01b0360a08201511660a083015260c08101516101a060c084015280516102606101a085015260018060a01b0381511661040085015260a0611649611631602084015160c06104208901526104c0880190611479565b60408401518782036103ff1901610440890152611479565b916060810151610460870152608081015161048087015201516103ff19858303016104a086015260ff60f81b815116825260c06116aa611698602084015160e0602087015260e0860190611479565b60408401518582036040870152611479565b916060810151606085015260018060a01b03608082015116608085015260a081015160a085015201519160c0818303910152602080835192838152019201905f5b818110611a06575050506020808301516001600160a01b039081166101c0870152604084015181166101e087015260608401511661020086810191909152608084015161022087015260a084015180516001600160c01b0316610240880152909101516001600160401b031661026086015261182892916118129060c084015180516001600160a01b039081166102808a01526020909101516001600160401b03166102a089015260e085015181166102c08901526101008501516102e08901526101208501518116610300890152610140850151166103208801526101608401516103408801526101808401516103608801526101a084015115156103808801526101c08401516103a08801526101e084015161019f19888303016103c089015261149d565b91015184820361019f19016103e086015261149d565b9060e08101519183810360e0850152602080845192838152019301905f5b81811061196b5750505061010081015161010084015261012081015161012084015261014081015191838103610140850152602080845192838152019301905f5b818110611906575050506101809060018060a01b0361016082015116610160850152015191610180818303910152602080835192838152019201905f5b8181106118d15750505090565b90919260206102006001926118fb604088518051845285810151868501520151604083019061150f565b0194019291016118c4565b90919360206102c0600192611960604089516119238482516114d0565b6119538682015160a08601906001600160801b036040809280518552826020820151166020860152015116910152565b015161010083019061150f565b019501929101611887565b90919360206102c06001926119fb60a0895180518452858101511515868501526001600160401b0360408201511660408501526119cb606082015160608601906001600160401b036020809260018060c01b038151168552015116910152565b6119536080820151838601906001600160801b036040809280518552826020820151166020860152015116910152565b019501929101611846565b82518452602093840193909201916001016116eb565b608081019081106001600160401b03821117610d0857604052565b60e081019081106001600160401b03821117610d0857604052565b604081019081106001600160401b03821117610d0857604052565b60c081019081106001600160401b03821117610d0857604052565b60a081019081106001600160401b03821117610d0857604052565b606081019081106001600160401b03821117610d0857604052565b90601f801991011681019081106001600160401b03821117610d0857604052565b60405190611aec82611a37565b606060c0835f81528260208201528260408201525f838201525f60808201525f60a08201520152565b6040519061022082018281106001600160401b03821117610d0857604052606061020083604051611b4581611a6d565b5f81528360208201528360408201525f848201525f6080820152611b67611adf565b60a082015281525f60208201525f60408201525f838201525f6080820152604051611b9181611a52565b5f81525f602082015260a0820152604051611bab81611a52565b5f81525f602082015260c08201525f60e08201525f6101008201525f6101208201525f6101408201525f6101608201525f6101808201525f6101a08201525f6101c0820152826101e08201520152565b604051906101a082018281106001600160401b03821117610d08576040526060610180835f81525f60208201525f60408201525f838201525f60808201525f60a0820152611c47611b15565b60c08201528260e08201525f6101008201525f610120820152826101408201525f6101608201520152565b51908115158203610ae357565b51906001600160a01b0382168203610ae357565b6001600160401b038111610d0857601f01601f191660200190565b929192611cba82611c93565b91611cc86040519384611abe565b829481845281830111610ae3578281602093845f96015e010152565b9080601f83011215610ae3578151611cfe92602001611cae565b90565b90602082820312610ae35781516001600160401b038111610ae357611cfe9201611ce4565b90816020910312610ae3575160ff81168103610ae35790565b51906001600160801b0382168203610ae357565b51906001600160401b0382168203610ae357565b90816020910312610ae357516001600160601b0381168103610ae35790565b6001600160401b038111610d085760051b60200190565b805115611daa5760200190565b634e487b7160e01b5f52603260045260245ffd5b8051821015611daa5760209160051b010190565b908160a0910312610ae357608060405191611dec83611a88565b611df581611c7f565b8352611e0360208201611c7f565b6020840152611e1460408201611c7f565b6040840152611e2560608201611c7f565b60608401520151608082015290565b60405190611e4182611a88565b5f6080838281528260208201528260408201528260608201520152565b60405190611e6b82611a88565b5f608083611e77611e34565b8152604051611e8581611a6d565b83815283602082015283604082015283606082015283838201528360a082015260208201528260408201528260608201520152565b60405190611ec782611aa3565b5f6040838281528260208201520152565b90816060910312610ae357611f0f6040805192611ef484611aa3565b80518452611f0460208201611d3f565b602085015201611d3f565b604082015290565b60405190611f2482611a6d565b815f81525f60208201525f6040820152604051611f4081611a52565b5f81525f60208201526060820152611f56611eba565b608082015260a0611f65611e5e565b910152565b94939091969592611f79611bfb565b6001600160a01b038481168083526040516399e9918360e01b815260048101829052929a909890929160209183916024918391165afa908115610aef575f9161369c575b5060808a01526001600160a01b0316801515908161362d575b5015612edf57505050600160208601526040516307f1b29b60e11b8152602081600481875afa908115610aef575f91612ea5575b506001600160a01b03166040868101919091525163388af5b560e01b8152602081600481875afa908115610aef575f91612e6b575b506001600160a01b0316606086015260405163e4baaddf60e01b815291602083600481875afa928315610aef575f93612e2f575b506001600160a01b0390921660a086018181529261208f611b15565b926040516338d52e0f60e01b8152602081600481875afa908115610aef575f91612df5575b506040516395d89b4160e01b81525f81600481885afa908115610aef575f91612ddb575b506040516306fdde0360e01b81525f81600481895afa908115610aef575f91612dc1575b5060405163313ce56760e01b8152906020826004818a5afa918215610aef575f92612da0575b50604051632ba9c2b360e21b8152926020846004818b5afa938415610aef575f94612d7f575b50612151611adf565b505f8060405160208101906342580cb760e11b825260048152612175602482611abe565b51908b5afa612182613946565b9015612d4457805181019060e08160208401930312610ae35760208101516001600160f81b0319811690819003610ae35760408201516001600160401b038111610ae3578360206121d592850101611ce4565b60608301516001600160401b038111610ae3578460206121f792860101611ce4565b608084015160a08501516001600160a01b0381169491939190859003610ae35760c08601519560e0810151906001600160401b038211610ae357019680603f89011215610ae357602088015161224c81611d86565b9861225a6040519a8b611abe565b818a52602080808c019360051b83010101928311610ae357604001905b828210612d34575050509261229d9a98959260ff9a9794928b9996936040519d8e611a37565b8d5260208d015260408c015260608b015260808a015260a089015260c0880152604051976122ca89611a6d565b60018060a01b031688526020880152604087015216606085015216608083015260a08201528452604051638da5cb5b60e01b8152602081600481875afa908115610aef575f91612cfa575b506001600160a01b031660208581019190915260405163e66f53b760e01b81529081600481875afa908115610aef575f91612cc0575b506001600160a01b031660408581019190915251630229549960e51b8152602081600481875afa908115610aef575f91612c86575b506001600160a01b031660608501526040516334cc866d60e21b8152602081600481875afa908115610aef575f91612c54575b50608085015260408051637cc4d9a160e01b81529081600481875afa908115610aef575f91612c35575b5060a085015260408051633b1618dd60e11b81529081600481875afa908115610aef575f91612bdc575b5060c0850152604051631c61872f60e31b8152602081600481875afa908115610aef575f91612ba2575b506001600160a01b031660e085015260405163ddca3f4360e01b8152602081600481875afa8015610aef576001600160601b03915f91612b83575b501661010085015260405163011a412160e61b8152602081600481875afa908115610aef575f91612b49575b506001600160a01b031661012085015260405163388af5b560e01b8152602081600481875afa908115610aef575f91612b0f575b506001600160a01b03166101408501526040516318160ddd60e01b8152602081600481875afa908115610aef575f91612add575b5061016085015260405163568efc0760e01b8152602081600481875afa908115610aef575f91612aab575b506101808501525f806040516020810190630872d2c560e21b825260048152612555602482611abe565b5190865afa612562613946565b9080612a9f575b612a76575b50604051630a17b31360e41b8152602081600481875afa908115610aef575f91612a44575b5061259d81613975565b6101e086019081525f5b8281106129d15750506040516333f91ebb60e01b81529050602081600481875afa908115610aef575f9161299f575b506125e081613975565b9061020086019182525f5b81811061292c57505060c0890194855251519261260784611d86565b946126156040519687611abe565b848652601f1961262486611d86565b015f5b81811061291557505060e08a019586525f5b85811061271e57505094516040516370a0823160e01b815260048101889052955060209450859350602492508391506001600160a01b03165afa908115610aef575f916126eb575b50610100840152604051634450bdef60e11b815290602090829060049082905afa908115610aef575f916126b9575b50610120830152565b90506020813d6020116126e3575b816126d460209383611abe565b81010312610ae357515f6126b0565b3d91506126c7565b90506020813d602011612716575b8161270660209383611abe565b81010312610ae357516004612681565b3d91506126f9565b61272e8161020084510151611dbe565b5190612738611f17565b91604051636638c7bb60e11b8152816004820152606081602481895afa908115610aef575f91612898575b5080516001600160b81b031684526020808201511515908501526040908101516001600160401b031684820152805163518df2eb60e11b8152600481018390529081602481895afa908115610aef575f9161286a575b506060848101919091526040516349e2903160e11b8152600481018390526001600160a01b0387166024820152919082806044810103816001600160a01b038c165afa938415610aef57612823888593600197612835965f9161283c575b5060808501528b6136ce565b60a08201528a5190610a998383611dbe565b5001612639565b61285d915060603d8111612863575b6128558183611abe565b810190611ed8565b5f612817565b503d61284b565b61288b915060403d8111612891575b6128838183611abe565b810190613906565b5f6127b9565b503d612879565b90506060813d821161290d575b816128b260609383611abe565b81010312610ae3576040516128c681611aa3565b8151906001600160b81b0382168203610ae35761290260406001600160401b0394819484526128f760208201611c72565b602085015201611d53565b828201529150612763565b3d91506128a5565b602090612920611f17565b82828b01015201612627565b6040516362518ddf60e01b815260048101829052906020826024818a5afa8015610aef575f9061296d575b60019250612966828651611dbe565b52016125eb565b506020823d8211612997575b8161298660209383611abe565b81010312610ae35760019151612957565b3d9150612979565b90506020813d6020116129c9575b816129ba60209383611abe565b81010312610ae357515f6125d6565b3d91506129ad565b60405163f7d1852160e01b815260048101829052906020826024818a5afa8015610aef575f90612a12575b60019250612a0b828551611dbe565b52016125a7565b506020823d8211612a3c575b81612a2b60209383611abe565b81010312610ae357600191516129fc565b3d9150612a1e565b90506020813d602011612a6e575b81612a5f60209383611abe565b81010312610ae357515f612593565b3d9150612a52565b60016101a086015260208151918180820193849201010312610ae357516101c08501525f61256e565b50602081511015612569565b90506020813d602011612ad5575b81612ac660209383611abe565b81010312610ae357515f61252b565b3d9150612ab9565b90506020813d602011612b07575b81612af860209383611abe565b81010312610ae357515f612500565b3d9150612aeb565b90506020813d602011612b41575b81612b2a60209383611abe565b81010312610ae357612b3b90611c7f565b5f6124cc565b3d9150612b1d565b90506020813d602011612b7b575b81612b6460209383611abe565b81010312610ae357612b7590611c7f565b5f612498565b3d9150612b57565b612b9c915060203d602011611160576111528183611abe565b5f61246c565b90506020813d602011612bd4575b81612bbd60209383611abe565b81010312610ae357612bce90611c7f565b5f612431565b3d9150612bb0565b90506040813d604011612c2d575b81612bf760409383611abe565b81010312610ae357612c22602060405192612c1184611a52565b612c1a81611c7f565b845201611d53565b60208201525f612407565b3d9150612bea565b612c4e915060403d604011612891576128838183611abe565b5f6123dd565b90506020813d602011612c7e575b81612c6f60209383611abe565b81010312610ae357515f6123b3565b3d9150612c62565b90506020813d602011612cb8575b81612ca160209383611abe565b81010312610ae357612cb290611c7f565b5f612380565b3d9150612c94565b90506020813d602011612cf2575b81612cdb60209383611abe565b81010312610ae357612cec90611c7f565b5f61234b565b3d9150612cce565b90506020813d602011612d2c575b81612d1560209383611abe565b81010312610ae357612d2690611c7f565b5f612315565b3d9150612d08565b8151815260209182019101612277565b60405162461bcd60e51b8152602060048201526013602482015272195a5c0dcc4c911bdb585a5b8819985a5b1959606a1b6044820152606490fd5b612d9991945060203d602011611398576113898183611abe565b925f612148565b612dba91925060203d602011611398576113898183611abe565b905f612122565b612dd591503d805f833e6113b48183611abe565b5f6120fc565b612def91503d805f833e6113b48183611abe565b5f6120d8565b90506020813d602011612e27575b81612e1060209383611abe565b81010312610ae357612e2190611c7f565b5f6120b4565b3d9150612e03565b9092506020813d602011612e63575b81612e4b60209383611abe565b81010312610ae357612e5c90611c7f565b915f612073565b3d9150612e3e565b90506020813d602011612e9d575b81612e8660209383611abe565b81010312610ae357612e9790611c7f565b5f61203f565b3d9150612e79565b90506020813d602011612ed7575b81612ec060209383611abe565b81010312610ae357612ed190611c7f565b5f61200a565b3d9150612eb3565b9294919391926001600160a01b031680151590816135be575b50156131f05750600260208701526040516307f1b29b60e11b8152602081600481865afa908115610aef575f916131b6575b506001600160a01b03166040878101919091525163388af5b560e01b8152602081600481865afa908115610aef575f9161317c575b506001600160a01b0316606087015260405163b045ff5b60e01b815292602084600481865afa938415610aef575f94613148575b50612f9d84611d86565b92612fab6040519485611abe565b848452601f19612fba86611d86565b015f5b81811061310a57505061014088019384525f5b858110612fe05750505050505050565b604051631f1a892160e11b8152600481018290529060a082602481865afa918215610aef575f926130da575b50604051602081019061301f82856114d0565b60a0815261302e60c082611abe565b5190209161303d828851611dbe565b51526040516349e2903160e11b8152600481018390526001600160a01b0385166024820152606081806044810103816001600160a01b038a165afa908115610aef576001936130a6928b925f916130bc575b50602061309d868c51611dbe565b510152876136ce565b60406130b3838951611dbe565b51015201612fd0565b6130d4915060603d8111612863576128558183611abe565b5f61308f565b6130fc91925060a03d8111613103575b6130f48183611abe565b810190611dd2565b905f61300c565b503d6130ea565b60209060405161311981611aa3565b613121611e34565b815261312b611eba565b83820152613137611e5e565b604082015282828901015201612fbd565b9093506020813d602011613174575b8161316460209383611abe565b81010312610ae35751925f612f93565b3d9150613157565b90506020813d6020116131ae575b8161319760209383611abe565b81010312610ae3576131a890611c7f565b5f612f5f565b3d915061318a565b90506020813d6020116131e8575b816131d160209383611abe565b81010312610ae3576131e290611c7f565b5f612f2a565b3d91506131c4565b91939250906001600160a01b0316801515908161354f575b501561353c57600360208601526040516307f1b29b60e11b8152602081600481875afa908115610aef575f91613502575b506001600160a01b03166040868101919091525163388af5b560e01b8152602081600481875afa908115610aef575f916134c8575b506001600160a01b03166060860152604051630399e3a560e41b8152602081600481875afa908115610aef575f9161348e575b506001600160a01b031661016086015260405163ace48b4560e01b815291602083600481875afa928315610aef575f9361345a575b506132e083611d86565b916132ee6040519384611abe565b838352601f196132fd85611d86565b015f5b81811061342a57505061018087019283525f5b84811061332257505050505050565b60405163779a968360e01b815260048101829052906020826024818a5afa918215610aef575f926133f7575b508161335b828751611dbe565b5152604051630dd5aa9b60e31b815260048101839052916020836024818b5afa8015610aef5785935f916133bf575b50926133a99160019460206133a0868b51611dbe565b510152856136ce565b60406133b6838851611dbe565b51015201613313565b9350506020833d82116133ef575b816133da60209383611abe565b81010312610ae35791518492906133a961338a565b3d91506133cd565b9091506020813d8211613422575b8161341260209383611abe565b81010312610ae35751905f61334e565b3d9150613405565b60209060405161343981611aa3565b5f81525f83820152613449611e5e565b604082015282828801015201613300565b9092506020813d602011613486575b8161347660209383611abe565b81010312610ae35751915f6132d6565b3d9150613469565b90506020813d6020116134c0575b816134a960209383611abe565b81010312610ae3576134ba90611c7f565b5f6132a1565b3d915061349c565b90506020813d6020116134fa575b816134e360209383611abe565b81010312610ae3576134f490611c7f565b5f61326e565b3d91506134d6565b90506020813d602011613534575b8161351d60209383611abe565b81010312610ae35761352e90611c7f565b5f613239565b3d9150613510565b82636364223f60e01b5f5260045260245ffd5b60249150602090604051928380926335abafe560e21b82528860048301525afa908115610aef575f91613584575b505f613208565b90506020813d6020116135b6575b8161359f60209383611abe565b81010312610ae3576135b090611c72565b5f61357d565b3d9150613592565b602491506020906040519283809263230dbab560e01b82528860048301525afa908115610aef575f916135f3575b505f612ef8565b90506020813d602011613625575b8161360e60209383611abe565b81010312610ae35761361f90611c72565b5f6135ec565b3d9150613601565b6024915060209060405192838092632c77566560e01b82528b60048301525afa908115610aef575f91613662575b505f611fd6565b90506020813d602011613694575b8161367d60209383611abe565b81010312610ae35761368e90611c72565b5f61365b565b3d9150613670565b90506020813d6020116136c6575b816136b760209383611abe565b81010312610ae357515f611fbd565b3d91506136aa565b9291906136d9611e5e565b604051632c3c915760e01b81526004810183905290946001600160a01b03169060a081602481855afa918215610aef5760249260c0925f916138e7575b50875260405192838092632e3071cd60e11b82528660048301525afa908115610aef575f9161384a575b5060208501528351604001516001600160a01b0316806137de575b508351606001516001600160a01b0392831692168214613779575050565b6020906024604051809481936301977b5760e01b835260048301525afa908115610aef575f916137ac575b506080830152565b90506020813d6020116137d6575b816137c760209383611abe565b81010312610ae357515f6137a4565b3d91506137ba565b60206004916040519283809263501ad8ff60e11b82525afa5f9181613816575b501561375b576001604086015260608501525f61375b565b9091506020813d602011613842575b8161383260209383611abe565b81010312610ae35751905f6137fe565b3d9150613825565b905060c0813d60c0116138df575b8161386560c09383611abe565b81010312610ae3576138d460a06040519261387f84611a6d565b61388881611d3f565b845261389660208201611d3f565b60208501526138a760408201611d3f565b60408501526138b860608201611d3f565b60608501526138c960808201611d3f565b608085015201611d3f565b60a08201525f613740565b3d9150613858565b613900915060a03d60a011613103576130f48183611abe565b5f613716565b90816040910312610ae3576040519061391e82611a52565b80516001600160c01b0381168103610ae357825261393e90602001611d53565b602082015290565b3d15613970573d9061395782611c93565b916139656040519384611abe565b82523d5f602084013e565b606090565b9061397f82611d86565b61398c6040519182611abe565b828152809261399d601f1991611d86565b019060203691013756fea26469706673582212202ef010d40138b02cc15169dc425e16d22495c00fb1afde3ad64a25da41228be164736f6c63430008240033";
