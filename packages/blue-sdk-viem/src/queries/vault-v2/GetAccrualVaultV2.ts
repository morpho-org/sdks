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
  "0x60808060405234601557613cde908161001a8239f35b5f80fdfe60806040526004361015610011575f80fd5b5f3560e01c630f0d54d814610024575f80fd5b34610afb57610100366003190112610afb576004356001600160a01b0381169003610afb576024356001600160a01b0381168103610afb576044356001600160a01b0381169003610afb576064356001600160a01b0381169003610afb576084356001600160a01b0381169003610afb5760a4356001600160a01b0381169003610afb5760c4356001600160a01b0381169003610afb5760e4356001600160a01b0381169003610afb576103206040526040516100e081611a96565b5f8082526060602083018190526040830181905280830182905260809290925260a081905260c081905260e08190526101008190526101208190526101408190526101608190526101808290526101a08190526101c0919091526101e08190526102008190526102208190526102408190526102608190526102808190526102a08190526102c052610170611cae565b6102e052606061030052604051635edec50d60e01b81526001600160a01b03600480358216908301526020908290602490829086165afa908115610b07575f9161145b575b5015611433576040516338d52e0f60e01b815260208160048181356001600160a01b03165afa908115610b07575f916113f9575b506040516395d89b4160e01b81525f8160048181356001600160a01b03165afa908115610b07575f916113df575b506040516306fdde0360e01b8152905f8260048181356001600160a01b03165afa918215610b07575f926113bb575b5060405163313ce56760e01b81529160208360048181356001600160a01b03165afa918215610b075760ff935f9361138a575b506040519461028786611a96565b60018060a01b03168552602085015260408401521660608201526080526040516338d52e0f60e01b815260208160048160018060a01b038235165afa908115610b07575f91611350575b506001600160a01b0390811660a05260405163ce04bebb60e01b815290602090829060049082908235165afa8015610b07575f90611310575b6001600160801b031660c052506040516318160ddd60e01b815260208160048181356001600160a01b03165afa908115610b07575f916112de575b5060e0526040516331c6651b60e21b815260208160048181356001600160a01b03165afa908115610b07575f916112ac575b506101005260405163ece1d6e560e01b815260208160048181356001600160a01b03165afa8015610b07575f9061126c575b6001600160401b0316610120525060405163c046371160e01b815260208160048181356001600160a01b03165afa8015610b07575f9061122c575b6001600160401b0316610140525060405163ad468d1160e01b815260208160048181356001600160a01b03165afa908115610b07575f916111f2575b506001600160a01b03908116610160526040516305c0524560e31b8152905f90829060049082908235165afa908115610b07575f916111a2575b50610180526040516343bc43c160e11b815260208160048181356001600160a01b03165afa8015610b07576001600160601b03915f91611183575b50166101e05260405163537bfaeb60e11b815260208160048181356001600160a01b03165afa8015610b07576001600160601b03915f91611154575b50166102005260405163ed27f7c960e01b815260208160048181356001600160a01b03165afa908115610b07575f9161111a575b506001600160a01b03908116610220526040516306d9a30160e41b815290602090829060049082908235165afa908115610b07575f916110e0575b506001600160a01b0316610240526101e0516001600160601b0316156110d957610220516040516326326d2760e21b81526001600160a01b039182166004808301919091529091602091839160249183919035165afa908115610b07575f9161109f575b505b151561026052610200516001600160601b03161561109857610240516040516326326d2760e21b81526001600160a01b039182166004808301919091529091602091839160249183919035165afa908115610b07575f9161105e575b505b15156102805260a0516040516370a0823160e01b81526001600160a01b0360048035821690830152909160209183916024918391165afa908115610b07575f9161102c575b506102a0526044356001600160a01b0316151580610fab575b6084356001600160a01b031615159081610f28575b8080610f1b575b610ef857808115610ef1575b15156101a05215610d38575060408051906106a58183611b38565b600182525f5b601f1982018110610cf55750506101406080015261073f60018060a01b0360e0608001511660405160208101916040835260046060830152637468697360e01b608083015260408201526080815261070460a082611b38565b5190206040519061071482611a96565b81525f60208201525f60408201525f6060820152610140608001519061073982611e49565b52611e49565b505b6101c051515f5b818110610b8f57610160516001600160a01b031680610b5b575b50604051630b54457960e31b815260208160048181356001600160a01b03165afa908115610b07575f91610b29575b5061079b81611e32565b6107a86040519182611b38565b818152601f196107b783611e32565b015f5b818110610b12575050610300525f5b818110610a425760405160208152806108b96080516102a0602084015260018060a01b038151166102c0840152606061082e610816602084015160806102e0880152610340870190611495565b60408401518682036102bf1901610300880152611495565b91015161032084015260a080516001600160a01b03908116604086015260c080516001600160801b0316606087015260e08051608088015261010080519488019490945261012080516001600160401b03908116938901939093526101405190921690870152610160519091169185019190915261018051848303601f190191850191909152611495565b6101a05115156101408301526101c051828203601f19016101608401528051808352602092830192909101905f5b818110610a085750505061099e906001600160601b0361016060800151166101808401526001600160601b0361018060800151166101a084015260018060a01b036101a060800151166101c084015260018060a01b036101c060800151166101e08401526101e06080015115156102008401526102006080015115156102208401526102206080015161024084015261024060800151151561026084015261026060800151601f19848303016102808501526115ac565b61030051601f19838303016102a084015280518083526020600582901b8401810193928101925f918101905b8383106109d75786860387f35b9193955091936020806109f6600193601f1986820301875289516115ac565b970193019301909286959492936109ca565b91935091602060806001926060875180518352848101518584015260408101516040840152015160608201520194019101918493926108e7565b604051906313bd406b60e21b825280600483015260208260248160018060a01b03600435165afa918215610b07575f92610abe575b50610ab781610aa260019460e4359060c4359060a43590608435906064359060443590600435612014565b6103005190610ab18383611e6a565b52611e6a565b50016107c9565b91506020823d8211610aff575b81610ad860209383611b38565b81010312610afb57610ab781610aa2610af2600195611d2b565b94505050610a77565b5f80fd5b3d9150610acb565b6040513d5f823e3d90fd5b602090610b1d611cae565b828286010152016107ba565b90506020813d602011610b53575b81610b4460209383611b38565b81010312610afb575181610791565b3d9150610b37565b60016102c052610b859060e4359060c4359060a43590608435906064359060443590600435612014565b6102e05280610762565b610b9f8161014060800151611e6a565b5190815160405190632f0374dd60e21b8252600482015260208160248160018060a01b03600435165afa908115610b07575f91610cc4575b50602083015281516040519063a68bafa360e01b8252600482015260208160248160018060a01b03600435165afa908115610b07575f91610c93575b5060408301528151916040519263c69507dd60e01b8452600484015260208360248160018060a01b03600435165afa928315610b07575f93610c5f575b50916060600193015201610748565b92506020833d8211610c8b575b81610c7960209383611b38565b81010312610afb579151916060610c50565b3d9150610c6c565b90506020813d8211610cbc575b81610cad60209383611b38565b81010312610afb575184610c13565b3d9150610ca0565b90506020813d8211610ced575b81610cde60209383611b38565b81010312610afb575184610bd7565b3d9150610cd1565b602090604051610d0481611a96565b5f81525f838201525f60408201525f6060820152828286010152016106ab565b634e487b7160e01b5f52604160045260245ffd5b1561074157610d566101006080015160208082518301019101611e7e565b6101605160405163cc3802bf60e01b8152915f91839160a49183916001600160a01b0390911690610d8b9060048401906114ec565b5afa908115610b07575f91610e61575b508051610da781611e32565b90610db56040519283611b38565b808252610dc4601f1991611e32565b015f5b818110610e325750506101c0525f5b8151811015610e2b5780610e2481610df060019486611e6a565b5160405190610dfe82611a96565b81525f60208201525f60408201525f60608201526101406080015190610ab18383611e6a565b5001610dd6565b5050610741565b602090604051610e4181611a96565b5f81525f838201525f60408201525f606082015282828601015201610dc7565b90503d805f833e610e728183611b38565b810190602081830312610afb578051906001600160401b038211610afb57019080601f83011215610afb578151610ea881611e32565b92610eb66040519485611b38565b81845260208085019260051b820101928311610afb57602001905b828210610ee15750505081610d9b565b8151815260209182019101610ed1565b508161068a565b61016051636364223f60e01b5f9081526001600160a01b03909116600452602490fd5b506101805151151561067e565b610160516040516335abafe560e21b81526001600160a01b03918216600482015291925060209082906024908290608435165afa908115610b07575f91610f71575b5090610677565b90506020813d602011610fa3575b81610f8c60209383611b38565b81010312610afb57610f9d90611d1e565b82610f6a565b3d9150610f7f565b5061016051604051632c77566560e01b81526001600160a01b0391821660048201529060209082906024908290604435165afa908115610b07575f91610ff2575b50610662565b90506020813d602011611024575b8161100d60209383611b38565b81010312610afb5761101e90611d1e565b81610fec565b3d9150611000565b90506020813d602011611056575b8161104760209383611b38565b81010312610afb575181610649565b3d915061103a565b90506020813d602011611090575b8161107960209383611b38565b81010312610afb5761108a90611d1e565b81610602565b3d915061106c565b6001610604565b90506020813d6020116110d1575b816110ba60209383611b38565b81010312610afb576110cb90611d1e565b816105a4565b3d91506110ad565b60016105a6565b90506020813d602011611112575b816110fb60209383611b38565b81010312610afb5761110c90611d2b565b81610540565b3d91506110ee565b90506020813d60201161114c575b8161113560209383611b38565b81010312610afb5761114690611d2b565b81610505565b3d9150611128565b611176915060203d60201161117c575b61116e8183611b38565b810190611e13565b826104d1565b503d611164565b61119c915060203d60201161117c5761116e8183611b38565b82610495565b90503d805f833e6111b38183611b38565b810190602081830312610afb578051906001600160401b038211610afb57019080601f83011215610afb5781516111ec92602001611d5a565b8161045a565b90506020813d602011611224575b8161120d60209383611b38565b81010312610afb5761121e90611d2b565b81610420565b3d9150611200565b506020813d602011611264575b8161124660209383611b38565b81010312610afb5761125f6001600160401b0391611dff565b6103e4565b3d9150611239565b506020813d6020116112a4575b8161128660209383611b38565b81010312610afb5761129f6001600160401b0391611dff565b6103a9565b3d9150611279565b90506020813d6020116112d6575b816112c760209383611b38565b81010312610afb575181610377565b3d91506112ba565b90506020813d602011611308575b816112f960209383611b38565b81010312610afb575181610345565b3d91506112ec565b506020813d602011611348575b8161132a60209383611b38565b81010312610afb576113436001600160801b0391611deb565b61030a565b3d915061131d565b90506020813d602011611382575b8161136b60209383611b38565b81010312610afb5761137c90611d2b565b816102d1565b3d915061135e565b6113ad91935060203d6020116113b4575b6113a58183611b38565b810190611dd2565b9185610279565b503d61139b565b6113d89192503d805f833e6113d08183611b38565b810190611dad565b9083610246565b6113f391503d805f833e6113d08183611b38565b82610217565b90506020813d60201161142b575b8161141460209383611b38565b81010312610afb5761142590611d2b565b816101e9565b3d9150611407565b63634ba39d60e11b5f9081526001600160a01b03918216600490815235909116602452604490fd5b90506020813d60201161148d575b8161147660209383611b38565b81010312610afb5761148790611d1e565b5f6101b5565b3d9150611469565b805180835260209291819084018484015e5f828201840152601f01601f1916010190565b90602080835192838152019201905f5b8181106114d65750505090565b82518452602093840193909201916001016114c9565b80516001600160a01b03908116835260208083015182169084015260408083015182169084015260608083015190911690830152608090810151910152565b60806101a09161153c8482516114ec565b6001600160801b0360a0602083015182815116828801528260208201511660c08801528260408201511660e0880152826060820151166101008801528285820151166101208801520151166101408501526040810151151561016085015260608101516101808501520151910152565b60018060a01b03815116825260ff602082015116602083015260018060a01b03604082015116604083015260018060a01b0360608201511660608301526080810151608083015260018060a01b0360a08201511660a083015260c08101519061018060c084015281516102e061018085015260018060a01b0381511661046085015260a061166661164e602084015160c0610480890152610520880190611495565b604084015187820361045f19016104a0890152611495565b9160608101516104c087015260808101516104e0870152015161045f198583030161050086015260ff60f81b815116825260c06116c76116b5602084015160e0602087015260e0860190611495565b60408401518582036040870152611495565b916060810151606085015260018060a01b03608082015116608085015260a081015160a085015201519160c0818303910152602080835192838152019201905f5b818110611a80575050506020838101516001600160a01b039081166101a087015260408581015182166101c088015260608601519091166101e0870152608085015161020087015260a085015180516001600160c01b0316610220880152909101516001600160401b031661024086810191909152909161184c906118339060c087015180516001600160a01b039081166102608b01526020909101516001600160401b03166102808a015260e088015181166102a08a01526101008801516102c08a015261012088015181166102e08a0152610140880151166103008901526101608701516103208901526101808701516103408901526101a087015115156103608901526101c08701516103808901526101e087015161017f19898303016103a08a01526114b9565b61020086015187820361017f19016103c08901526114b9565b9361022081015115156103e0870152015160018060a01b038151166104008601526020810151610420860152015161044084015260e08101519183810360e0850152602080845192838152019301905f5b8181106119b65750505061010081015161010084015261012081015191838103610120850152602080845192838152019301905f5b818110611951575050506101609060018060a01b0361014082015116610140850152015191610160818303910152602080835192838152019201905f5b81811061191c5750505090565b9091926020610200600192611946604088518051845285810151868501520151604083019061152b565b01940192910161190f565b90919360206102c06001926119ab6040895161196e8482516114ec565b61199e8682015160a08601906001600160801b036040809280518552826020820151166020860152015116910152565b015161010083019061152b565b0195019291016118d2565b90919360206103006001926001600160801b0360e0895180518452858101511515868501526001600160401b036040820151166040850152611a1b606082015160608601906001600160401b036020809260018060c01b038151168552015116910152565b611a4c608082015160a08601906001600160801b036040809280518552826020820151166020860152015116910152565b611a5f60a082015161010086019061152b565b60c081015183166102c08501520151166102e082015201950192910161189d565b8251845260209384019390920191600101611708565b608081019081106001600160401b03821117610d2457604052565b60e081019081106001600160401b03821117610d2457604052565b604081019081106001600160401b03821117610d2457604052565b606081019081106001600160401b03821117610d2457604052565b60c081019081106001600160401b03821117610d2457604052565b60a081019081106001600160401b03821117610d2457604052565b90601f801991011681019081106001600160401b03821117610d2457604052565b60405190611b6682611ab1565b606060c0835f81528260208201528260408201525f838201525f60808201525f60a08201520152565b60405190611b9c82611ae7565b5f6040838281528260208201520152565b6040519061026082018281106001600160401b03821117610d245760405281604051611bd881611b02565b5f815260606020820152606060408201525f60608201525f6080820152611bfd611b59565b60a082015281525f60208201525f60408201525f60608201525f6080820152604051611c2881611acc565b5f81525f602082015260a0820152604051611c4281611acc565b5f81525f602082015260c08201525f60e08201525f6101008201525f6101208201525f6101408201525f6101608201525f6101808201525f6101a08201525f6101c082015260606101e082015260606102008201525f610220820152610240611ca9611b8f565b910152565b6040519061018082018281106001600160401b03821117610d24576040526060610160835f81525f60208201525f60408201525f838201525f60808201525f60a0820152611cfa611bad565b60c08201528260e08201525f610100820152826101208201525f6101408201520152565b51908115158203610afb57565b51906001600160a01b0382168203610afb57565b6001600160401b038111610d2457601f01601f191660200190565b929192611d6682611d3f565b91611d746040519384611b38565b829481845281830111610afb578281602093845f96015e010152565b9080601f83011215610afb578151611daa92602001611d5a565b90565b90602082820312610afb5781516001600160401b038111610afb57611daa9201611d90565b90816020910312610afb575160ff81168103610afb5790565b51906001600160801b0382168203610afb57565b51906001600160401b0382168203610afb57565b90816020910312610afb57516001600160601b0381168103610afb5790565b6001600160401b038111610d245760051b60200190565b805115611e565760200190565b634e487b7160e01b5f52603260045260245ffd5b8051821015611e565760209160051b010190565b908160a0910312610afb57608060405191611e9883611b1d565b611ea181611d2b565b8352611eaf60208201611d2b565b6020840152611ec060408201611d2b565b6040840152611ed160608201611d2b565b60608401520151608082015290565b60405190611eed82611b1d565b5f6080838281528260208201528260408201528260608201520152565b60405190611f1782611b1d565b5f608083611f23611ee0565b8152604051611f3181611b02565b83815283602082015283604082015283606082015283838201528360a082015260208201528260408201528260608201520152565b90816060910312610afb57611f9d6040805192611f8284611ae7565b80518452611f9260208201611deb565b602085015201611deb565b604082015290565b6040519061010082018281106001600160401b03821117610d24576040525f60e083828152826020820152826040820152604051611fe281611acc565b8381528360208201526060820152611ff8611b8f565b6080820152612005611f0a565b60a08201528260c08201520152565b95939091979692612023611cae565b6001600160a01b038481168083526040516399e9918360e01b815260048101829052929b909990929160209183916024918391165afa908115610b07575f9161399d575b5060808b01526001600160a01b0316801515908161392e575b50156131dc57505050600160208701526040516307f1b29b60e11b8152602081600481885afa908115610b07575f916131a2575b506001600160a01b03166040878101919091525163388af5b560e01b8152602081600481885afa908115610b07575f91613168575b506001600160a01b0316606087015260405163e4baaddf60e01b815292602084600481885afa938415610b07575f9461312c575b506001600160a01b0390931660a08701818152939061213a611bad565b916040516338d52e0f60e01b8152602081600481865afa908115610b07575f916130f2575b506040516395d89b4160e01b81525f81600481875afa908115610b07575f916130d8575b506040516306fdde0360e01b81525f81600481885afa908115610b07575f916130be575b5060405163313ce56760e01b815290602082600481895afa918215610b07575f9261309d575b50604051632ba9c2b360e21b8152926020846004818a5afa938415610b07575f9461307c575b506121fc611b59565b505f8060405160208101906342580cb760e11b825260048152612220602482611b38565b51908a5afa61222d613c47565b901561304157805181019060e08160208401930312610afb5760208101516001600160f81b0319811690819003610afb5760408201516001600160401b038111610afb5783602061228092850101611d90565b60608301516001600160401b038111610afb578460206122a292860101611d90565b608084015160a08501516001600160a01b0381169491939190859003610afb5760c08601519560e0810151906001600160401b038211610afb57019680603f89011215610afb5760208801516122f781611e32565b986123056040519a8b611b38565b818a52602080808c019360051b83010101928311610afb57604001905b82821061303157505050926123489a98959260ff9a9794928b9996936040519d8e611ab1565b8d5260208d015260408c015260608b015260808a015260a089015260c08801526040519761237589611b02565b60018060a01b031688526020880152604087015216606085015216608083015260a08201528352604051638da5cb5b60e01b8152602081600481865afa908115610b07575f91612ff7575b506001600160a01b031660208481019190915260405163e66f53b760e01b81529081600481865afa908115610b07575f91612fbd575b506001600160a01b031660408481019190915251630229549960e51b8152602081600481865afa908115610b07575f91612f83575b506001600160a01b031660608401526040516334cc866d60e21b8152602081600481865afa908115610b07575f91612f51575b50608084015260408051637cc4d9a160e01b81529081600481865afa908115610b07575f91612f32575b5060a084015260408051633b1618dd60e11b81529081600481865afa908115610b07575f91612ed9575b5060c0840152604051631c61872f60e31b8152602081600481865afa908115610b07575f91612e9f575b506001600160a01b031660e084015260405163ddca3f4360e01b8152602081600481865afa8015610b07576001600160601b03915f91612e80575b501661010084015260405163011a412160e61b8152602081600481865afa908115610b07575f91612e46575b506001600160a01b031661012084015260405163388af5b560e01b8152602081600481865afa908115610b07575f91612e0c575b506001600160a01b03166101408401526040516318160ddd60e01b8152602081600481865afa908115610b07575f91612dda575b5061016084015260405163568efc0760e01b8152602081600481865afa908115610b07575f91612da8575b506101808401525f806040516020810190630872d2c560e21b825260048152612600602482611b38565b5190855afa61260d613c47565b9080612d9c575b612d73575b50604051630a17b31360e41b8152602081600481865afa908115610b07575f91612d41575b5061264881613c76565b6101e085019081525f5b828110612cce5750506040516333f91ebb60e01b8152949050602085600481865afa948515610b07575f95612c9a575b5061268c85613c76565b9461020085019586525f5b818110612c275750506001600160a01b0316801515949092908580612bbb575b612a61575b60c08b019485525151946126cf86611e32565b946126dd6040519687611b38565b868652601f196126ec88611e32565b015f5b818110612a4a57505060e08c019586525f5b87811061278757505096516040516370a0823160e01b8152600481019990995260209750889650602495508694506001600160a01b0316925050505afa908115610b07575f91612755575b50610100830152565b90506020813d60201161277f575b8161277060209383611b38565b81010312610afb57515f61274c565b3d9150612763565b6127978161020084510151611e6a565b51906127a1611fa5565b91604051636638c7bb60e11b81528160048201526060816024818a5afa908115610b07575f916129cd575b5080516001600160b81b031684526020808201511515908501526040908101516001600160401b031684820152805163518df2eb60e11b81526004810183905290816024818a5afa908115610b07575f9161299f575b506060848101919091526040516349e2903160e11b8152600481018390526001600160a01b03881660248201529081806044810103816001600160a01b038c165afa908115610b07575f91612971575b506080840152846128848c838a6139cf565b60a08501526128aa575b506128a3816001938a5190610ab18383611e6a565b5001612701565b9160405192639dbcd5b960e01b845286600485015260248401526040836044818b5afa928315610b07575f93612904575b5082516001600160801b0390811660c083015260209093015190921660e08301526128a361288e565b92506040833d8211612969575b8161291e60409383611b38565b81010312610afb57816128a3916001600160801b03602060019661295a826040519261294984611acc565b61295281611deb565b845201611deb565b828201529650505091506128db565b3d9150612911565b612992915060603d8111612998575b61298a8183611b38565b810190611f66565b5f612872565b503d612980565b6129c0915060403d81116129c6575b6129b88183611b38565b810190613c07565b5f612822565b503d6129ae565b90506060813d8211612a42575b816129e760609383611b38565b81010312610afb576040516129fb81611ae7565b8151906001600160b81b0382168203610afb57612a3760406001600160401b039481948452612a2c60208201611d1e565b602085015201611dff565b8282015291506127cc565b3d91506129da565b602090612a55611fa5565b82828b010152016126ef565b6001610220860152604051630c7508df60e31b815260048101839052602081602481885afa908115610b07575f91612b81575b50604051636fcca69b60e01b815260048101849052602081602481895afa908115610b07575f91612b4f575b506040516348d88a5960e11b815260048101859052906020826024818a5afa918215610b07575f92612b1b575b5060405192612afb84611ae7565b6001600160a01b03168352602083015260408201526102408601526126bc565b9091506020813d602011612b47575b81612b3760209383611b38565b81010312610afb5751905f612aed565b3d9150612b2a565b90506020813d602011612b79575b81612b6a60209383611b38565b81010312610afb57515f612ac0565b3d9150612b5d565b90506020813d602011612bb3575b81612b9c60209383611b38565b81010312610afb57612bad90611d2b565b5f612a94565b3d9150612b8f565b506040516326f6f90760e11b815260048101859052602081602481865afa908115610b07575f91612bed575b506126b7565b90506020813d602011612c1f575b81612c0860209383611b38565b81010312610afb57612c1990611d1e565b5f612be7565b3d9150612bfb565b6040516362518ddf60e01b81526004810182905290602082602481895afa8015610b07575f90612c68575b60019250612c61828a51611e6a565b5201612697565b506020823d8211612c92575b81612c8160209383611b38565b81010312610afb5760019151612c52565b3d9150612c74565b9094506020813d602011612cc6575b81612cb660209383611b38565b81010312610afb5751935f612682565b3d9150612ca9565b60405163f7d1852160e01b81526004810182905290602082602481895afa8015610b07575f90612d0f575b60019250612d08828551611e6a565b5201612652565b506020823d8211612d39575b81612d2860209383611b38565b81010312610afb5760019151612cf9565b3d9150612d1b565b90506020813d602011612d6b575b81612d5c60209383611b38565b81010312610afb57515f61263e565b3d9150612d4f565b60016101a085015260208151918180820193849201010312610afb57516101c08401525f612619565b50602081511015612614565b90506020813d602011612dd2575b81612dc360209383611b38565b81010312610afb57515f6125d6565b3d9150612db6565b90506020813d602011612e04575b81612df560209383611b38565b81010312610afb57515f6125ab565b3d9150612de8565b90506020813d602011612e3e575b81612e2760209383611b38565b81010312610afb57612e3890611d2b565b5f612577565b3d9150612e1a565b90506020813d602011612e78575b81612e6160209383611b38565b81010312610afb57612e7290611d2b565b5f612543565b3d9150612e54565b612e99915060203d60201161117c5761116e8183611b38565b5f612517565b90506020813d602011612ed1575b81612eba60209383611b38565b81010312610afb57612ecb90611d2b565b5f6124dc565b3d9150612ead565b90506040813d604011612f2a575b81612ef460409383611b38565b81010312610afb57612f1f602060405192612f0e84611acc565b612f1781611d2b565b845201611dff565b60208201525f6124b2565b3d9150612ee7565b612f4b915060403d6040116129c6576129b88183611b38565b5f612488565b90506020813d602011612f7b575b81612f6c60209383611b38565b81010312610afb57515f61245e565b3d9150612f5f565b90506020813d602011612fb5575b81612f9e60209383611b38565b81010312610afb57612faf90611d2b565b5f61242b565b3d9150612f91565b90506020813d602011612fef575b81612fd860209383611b38565b81010312610afb57612fe990611d2b565b5f6123f6565b3d9150612fcb565b90506020813d602011613029575b8161301260209383611b38565b81010312610afb5761302390611d2b565b5f6123c0565b3d9150613005565b8151815260209182019101612322565b60405162461bcd60e51b8152602060048201526013602482015272195a5c0dcc4c911bdb585a5b8819985a5b1959606a1b6044820152606490fd5b61309691945060203d6020116113b4576113a58183611b38565b925f6121f3565b6130b791925060203d6020116113b4576113a58183611b38565b905f6121cd565b6130d291503d805f833e6113d08183611b38565b5f6121a7565b6130ec91503d805f833e6113d08183611b38565b5f612183565b90506020813d602011613124575b8161310d60209383611b38565b81010312610afb5761311e90611d2b565b5f61215f565b3d9150613100565b9093506020813d602011613160575b8161314860209383611b38565b81010312610afb5761315990611d2b565b925f61211d565b3d915061313b565b90506020813d60201161319a575b8161318360209383611b38565b81010312610afb5761319490611d2b565b5f6120e9565b3d9150613176565b90506020813d6020116131d4575b816131bd60209383611b38565b81010312610afb576131ce90611d2b565b5f6120b4565b3d91506131b0565b939591949193919250906001600160a01b031680151590816138bf575b50156134f15750600260208701526040516307f1b29b60e11b8152602081600481865afa908115610b07575f916134b7575b506001600160a01b03166040878101919091525163388af5b560e01b8152602081600481865afa908115610b07575f9161347d575b506001600160a01b0316606087015260405163b045ff5b60e01b815292602084600481865afa938415610b07575f94613449575b5061329e84611e32565b926132ac6040519485611b38565b848452601f196132bb86611e32565b015f5b81811061340b57505061012088019384525f5b8581106132e15750505050505050565b604051631f1a892160e11b8152600481018290529060a082602481865afa918215610b07575f926133db575b50604051602081019061332082856114ec565b60a0815261332f60c082611b38565b5190209161333e828851611e6a565b51526040516349e2903160e11b8152600481018390526001600160a01b0385166024820152606081806044810103816001600160a01b038a165afa908115610b07576001936133a7928b925f916133bd575b50602061339e868c51611e6a565b510152876139cf565b60406133b4838951611e6a565b510152016132d1565b6133d5915060603d81116129985761298a8183611b38565b5f613390565b6133fd91925060a03d8111613404575b6133f58183611b38565b810190611e7e565b905f61330d565b503d6133eb565b60209060405161341a81611ae7565b613422611ee0565b815261342c611b8f565b83820152613438611f0a565b6040820152828289010152016132be565b9093506020813d602011613475575b8161346560209383611b38565b81010312610afb5751925f613294565b3d9150613458565b90506020813d6020116134af575b8161349860209383611b38565b81010312610afb576134a990611d2b565b5f613260565b3d915061348b565b90506020813d6020116134e9575b816134d260209383611b38565b81010312610afb576134e390611d2b565b5f61322b565b3d91506134c5565b91939250906001600160a01b03168015159081613850575b501561383d57600360208601526040516307f1b29b60e11b8152602081600481875afa908115610b07575f91613803575b506001600160a01b03166040868101919091525163388af5b560e01b8152602081600481875afa908115610b07575f916137c9575b506001600160a01b03166060860152604051630399e3a560e41b8152602081600481875afa908115610b07575f9161378f575b506001600160a01b031661014086015260405163ace48b4560e01b815291602083600481875afa928315610b07575f9361375b575b506135e183611e32565b916135ef6040519384611b38565b838352601f196135fe85611e32565b015f5b81811061372b57505061016087019283525f5b84811061362357505050505050565b60405163779a968360e01b815260048101829052906020826024818a5afa918215610b07575f926136f8575b508161365c828751611e6a565b5152604051630dd5aa9b60e31b815260048101839052916020836024818b5afa8015610b075785935f916136c0575b50926136aa9160019460206136a1868b51611e6a565b510152856139cf565b60406136b7838851611e6a565b51015201613614565b9350506020833d82116136f0575b816136db60209383611b38565b81010312610afb5791518492906136aa61368b565b3d91506136ce565b9091506020813d8211613723575b8161371360209383611b38565b81010312610afb5751905f61364f565b3d9150613706565b60209060405161373a81611ae7565b5f81525f8382015261374a611f0a565b604082015282828801015201613601565b9092506020813d602011613787575b8161377760209383611b38565b81010312610afb5751915f6135d7565b3d915061376a565b90506020813d6020116137c1575b816137aa60209383611b38565b81010312610afb576137bb90611d2b565b5f6135a2565b3d915061379d565b90506020813d6020116137fb575b816137e460209383611b38565b81010312610afb576137f590611d2b565b5f61356f565b3d91506137d7565b90506020813d602011613835575b8161381e60209383611b38565b81010312610afb5761382f90611d2b565b5f61353a565b3d9150613811565b82636364223f60e01b5f5260045260245ffd5b60249150602090604051928380926335abafe560e21b82528860048301525afa908115610b07575f91613885575b505f613509565b90506020813d6020116138b7575b816138a060209383611b38565b81010312610afb576138b190611d1e565b5f61387e565b3d9150613893565b602491506020906040519283809263230dbab560e01b82528860048301525afa908115610b07575f916138f4575b505f6131f9565b90506020813d602011613926575b8161390f60209383611b38565b81010312610afb5761392090611d1e565b5f6138ed565b3d9150613902565b6024915060209060405192838092632c77566560e01b82528c60048301525afa908115610b07575f91613963575b505f612080565b90506020813d602011613995575b8161397e60209383611b38565b81010312610afb5761398f90611d1e565b5f61395c565b3d9150613971565b90506020813d6020116139c7575b816139b860209383611b38565b81010312610afb57515f612067565b3d91506139ab565b9291906139da611f0a565b604051632c3c915760e01b81526004810183905290946001600160a01b03169060a081602481855afa918215610b075760249260c0925f91613be8575b50875260405192838092632e3071cd60e11b82528660048301525afa908115610b07575f91613b4b575b5060208501528351604001516001600160a01b031680613adf575b508351606001516001600160a01b0392831692168214613a7a575050565b6020906024604051809481936301977b5760e01b835260048301525afa908115610b07575f91613aad575b506080830152565b90506020813d602011613ad7575b81613ac860209383611b38565b81010312610afb57515f613aa5565b3d9150613abb565b60206004916040519283809263501ad8ff60e11b82525afa5f9181613b17575b5015613a5c576001604086015260608501525f613a5c565b9091506020813d602011613b43575b81613b3360209383611b38565b81010312610afb5751905f613aff565b3d9150613b26565b905060c0813d60c011613be0575b81613b6660c09383611b38565b81010312610afb57613bd560a060405192613b8084611b02565b613b8981611deb565b8452613b9760208201611deb565b6020850152613ba860408201611deb565b6040850152613bb960608201611deb565b6060850152613bca60808201611deb565b608085015201611deb565b60a08201525f613a41565b3d9150613b59565b613c01915060a03d60a011613404576133f58183611b38565b5f613a17565b90816040910312610afb5760405190613c1f82611acc565b80516001600160c01b0381168103610afb578252613c3f90602001611dff565b602082015290565b3d15613c71573d90613c5882611d3f565b91613c666040519384611b38565b82523d5f602084013e565b606090565b90613c8082611e32565b613c8d6040519182611b38565b8281528092613c9e601f1991611e32565b019060203691013756fea2646970667358221220a6e108e7d4b1ff604e7cc99616f34f83acd5fbda44325a0aefb522a2513439a864736f6c63430008230033";
