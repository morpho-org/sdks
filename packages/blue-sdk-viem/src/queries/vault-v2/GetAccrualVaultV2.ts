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
  "0x60808060405234601557613d51908161001a8239f35b5f80fdfe60806040526004361015610011575f80fd5b5f3560e01c630f0d54d814610024575f80fd5b34610afb57610100366003190112610afb576004356001600160a01b0381169003610afb576024356001600160a01b0381168103610afb576044356001600160a01b0381169003610afb576064356001600160a01b0381169003610afb576084356001600160a01b0381169003610afb5760a4356001600160a01b0381169003610afb5760c4356001600160a01b0381169003610afb5760e4356001600160a01b0381169003610afb576103206040526040516100e081611aa0565b5f8082526060602083018190526040830181905280830182905260809290925260a081905260c081905260e08190526101008190526101208190526101408190526101608190526101808290526101a08190526101c0919091526101e08190526102008190526102208190526102408190526102608190526102808190526102a08190526102c052610170611cb8565b6102e052606061030052604051635edec50d60e01b81526001600160a01b03600480358216908301526020908290602490829086165afa908115610b07575f9161145b575b5015611433576040516338d52e0f60e01b815260208160048181356001600160a01b03165afa908115610b07575f916113f9575b506040516395d89b4160e01b81525f8160048181356001600160a01b03165afa908115610b07575f916113df575b506040516306fdde0360e01b8152905f8260048181356001600160a01b03165afa918215610b07575f926113bb575b5060405163313ce56760e01b81529160208360048181356001600160a01b03165afa918215610b075760ff935f9361138a575b506040519461028786611aa0565b60018060a01b03168552602085015260408401521660608201526080526040516338d52e0f60e01b815260208160048160018060a01b038235165afa908115610b07575f91611350575b506001600160a01b0390811660a05260405163ce04bebb60e01b815290602090829060049082908235165afa8015610b07575f90611310575b6001600160801b031660c052506040516318160ddd60e01b815260208160048181356001600160a01b03165afa908115610b07575f916112de575b5060e0526040516331c6651b60e21b815260208160048181356001600160a01b03165afa908115610b07575f916112ac575b506101005260405163ece1d6e560e01b815260208160048181356001600160a01b03165afa8015610b07575f9061126c575b6001600160401b0316610120525060405163c046371160e01b815260208160048181356001600160a01b03165afa8015610b07575f9061122c575b6001600160401b0316610140525060405163ad468d1160e01b815260208160048181356001600160a01b03165afa908115610b07575f916111f2575b506001600160a01b03908116610160526040516305c0524560e31b8152905f90829060049082908235165afa908115610b07575f916111a2575b50610180526040516343bc43c160e11b815260208160048181356001600160a01b03165afa8015610b07576001600160601b03915f91611183575b50166101e05260405163537bfaeb60e11b815260208160048181356001600160a01b03165afa8015610b07576001600160601b03915f91611154575b50166102005260405163ed27f7c960e01b815260208160048181356001600160a01b03165afa908115610b07575f9161111a575b506001600160a01b03908116610220526040516306d9a30160e41b815290602090829060049082908235165afa908115610b07575f916110e0575b506001600160a01b0316610240526101e0516001600160601b0316156110d957610220516040516326326d2760e21b81526001600160a01b039182166004808301919091529091602091839160249183919035165afa908115610b07575f9161109f575b505b151561026052610200516001600160601b03161561109857610240516040516326326d2760e21b81526001600160a01b039182166004808301919091529091602091839160249183919035165afa908115610b07575f9161105e575b505b15156102805260a0516040516370a0823160e01b81526001600160a01b0360048035821690830152909160209183916024918391165afa908115610b07575f9161102c575b506102a0526044356001600160a01b0316151580610fab575b6084356001600160a01b031615159081610f28575b8080610f1b575b610ef857808115610ef1575b15156101a05215610d38575060408051906106a58183611b42565b600182525f5b601f1982018110610cf55750506101406080015261073f60018060a01b0360e0608001511660405160208101916040835260046060830152637468697360e01b608083015260408201526080815261070460a082611b42565b5190206040519061071482611aa0565b81525f60208201525f60408201525f6060820152610140608001519061073982611e5a565b52611e5a565b505b6101c051515f5b818110610b8f57610160516001600160a01b031680610b5b575b50604051630b54457960e31b815260208160048181356001600160a01b03165afa908115610b07575f91610b29575b5061079b81611e43565b6107a86040519182611b42565b818152601f196107b783611e43565b015f5b818110610b12575050610300525f5b818110610a425760405160208152806108b96080516102a0602084015260018060a01b038151166102c0840152606061082e610816602084015160806102e0880152610340870190611495565b60408401518682036102bf1901610300880152611495565b91015161032084015260a080516001600160a01b03908116604086015260c080516001600160801b0316606087015260e08051608088015261010080519488019490945261012080516001600160401b03908116938901939093526101405190921690870152610160519091169185019190915261018051848303601f190191850191909152611495565b6101a05115156101408301526101c051828203601f19016101608401528051808352602092830192909101905f5b818110610a085750505061099e906001600160601b0361016060800151166101808401526001600160601b0361018060800151166101a084015260018060a01b036101a060800151166101c084015260018060a01b036101c060800151166101e08401526101e06080015115156102008401526102006080015115156102208401526102206080015161024084015261024060800151151561026084015261026060800151601f19848303016102808501526115ac565b61030051601f19838303016102a084015280518083526020600582901b8401810193928101925f918101905b8383106109d75786860387f35b9193955091936020806109f6600193601f1986820301875289516115ac565b970193019301909286959492936109ca565b91935091602060806001926060875180518352848101518584015260408101516040840152015160608201520194019101918493926108e7565b604051906313bd406b60e21b825280600483015260208260248160018060a01b03600435165afa918215610b07575f92610abe575b50610ab781610aa260019460e4359060c4359060a43590608435906064359060443590600435612025565b6103005190610ab18383611e7b565b52611e7b565b50016107c9565b91506020823d8211610aff575b81610ad860209383611b42565b81010312610afb57610ab781610aa2610af2600195611d3c565b94505050610a77565b5f80fd5b3d9150610acb565b6040513d5f823e3d90fd5b602090610b1d611cb8565b828286010152016107ba565b90506020813d602011610b53575b81610b4460209383611b42565b81010312610afb575181610791565b3d9150610b37565b60016102c052610b859060e4359060c4359060a43590608435906064359060443590600435612025565b6102e05280610762565b610b9f8161014060800151611e7b565b5190815160405190632f0374dd60e21b8252600482015260208160248160018060a01b03600435165afa908115610b07575f91610cc4575b50602083015281516040519063a68bafa360e01b8252600482015260208160248160018060a01b03600435165afa908115610b07575f91610c93575b5060408301528151916040519263c69507dd60e01b8452600484015260208360248160018060a01b03600435165afa928315610b07575f93610c5f575b50916060600193015201610748565b92506020833d8211610c8b575b81610c7960209383611b42565b81010312610afb579151916060610c50565b3d9150610c6c565b90506020813d8211610cbc575b81610cad60209383611b42565b81010312610afb575184610c13565b3d9150610ca0565b90506020813d8211610ced575b81610cde60209383611b42565b81010312610afb575184610bd7565b3d9150610cd1565b602090604051610d0481611aa0565b5f81525f838201525f60408201525f6060820152828286010152016106ab565b634e487b7160e01b5f52604160045260245ffd5b1561074157610d566101006080015160208082518301019101611e8f565b6101605160405163cc3802bf60e01b8152915f91839160a49183916001600160a01b0390911690610d8b9060048401906114ec565b5afa908115610b07575f91610e61575b508051610da781611e43565b90610db56040519283611b42565b808252610dc4601f1991611e43565b015f5b818110610e325750506101c0525f5b8151811015610e2b5780610e2481610df060019486611e7b565b5160405190610dfe82611aa0565b81525f60208201525f60408201525f60608201526101406080015190610ab18383611e7b565b5001610dd6565b5050610741565b602090604051610e4181611aa0565b5f81525f838201525f60408201525f606082015282828601015201610dc7565b90503d805f833e610e728183611b42565b810190602081830312610afb578051906001600160401b038211610afb57019080601f83011215610afb578151610ea881611e43565b92610eb66040519485611b42565b81845260208085019260051b820101928311610afb57602001905b828210610ee15750505081610d9b565b8151815260209182019101610ed1565b508161068a565b61016051636364223f60e01b5f9081526001600160a01b03909116600452602490fd5b506101805151151561067e565b610160516040516335abafe560e21b81526001600160a01b03918216600482015291925060209082906024908290608435165afa908115610b07575f91610f71575b5090610677565b90506020813d602011610fa3575b81610f8c60209383611b42565b81010312610afb57610f9d90611d2f565b82610f6a565b3d9150610f7f565b5061016051604051632c77566560e01b81526001600160a01b0391821660048201529060209082906024908290604435165afa908115610b07575f91610ff2575b50610662565b90506020813d602011611024575b8161100d60209383611b42565b81010312610afb5761101e90611d2f565b81610fec565b3d9150611000565b90506020813d602011611056575b8161104760209383611b42565b81010312610afb575181610649565b3d915061103a565b90506020813d602011611090575b8161107960209383611b42565b81010312610afb5761108a90611d2f565b81610602565b3d915061106c565b6001610604565b90506020813d6020116110d1575b816110ba60209383611b42565b81010312610afb576110cb90611d2f565b816105a4565b3d91506110ad565b60016105a6565b90506020813d602011611112575b816110fb60209383611b42565b81010312610afb5761110c90611d3c565b81610540565b3d91506110ee565b90506020813d60201161114c575b8161113560209383611b42565b81010312610afb5761114690611d3c565b81610505565b3d9150611128565b611176915060203d60201161117c575b61116e8183611b42565b810190611e24565b826104d1565b503d611164565b61119c915060203d60201161117c5761116e8183611b42565b82610495565b90503d805f833e6111b38183611b42565b810190602081830312610afb578051906001600160401b038211610afb57019080601f83011215610afb5781516111ec92602001611d6b565b8161045a565b90506020813d602011611224575b8161120d60209383611b42565b81010312610afb5761121e90611d3c565b81610420565b3d9150611200565b506020813d602011611264575b8161124660209383611b42565b81010312610afb5761125f6001600160401b0391611e10565b6103e4565b3d9150611239565b506020813d6020116112a4575b8161128660209383611b42565b81010312610afb5761129f6001600160401b0391611e10565b6103a9565b3d9150611279565b90506020813d6020116112d6575b816112c760209383611b42565b81010312610afb575181610377565b3d91506112ba565b90506020813d602011611308575b816112f960209383611b42565b81010312610afb575181610345565b3d91506112ec565b506020813d602011611348575b8161132a60209383611b42565b81010312610afb576113436001600160801b0391611dfc565b61030a565b3d915061131d565b90506020813d602011611382575b8161136b60209383611b42565b81010312610afb5761137c90611d3c565b816102d1565b3d915061135e565b6113ad91935060203d6020116113b4575b6113a58183611b42565b810190611de3565b9185610279565b503d61139b565b6113d89192503d805f833e6113d08183611b42565b810190611dbe565b9083610246565b6113f391503d805f833e6113d08183611b42565b82610217565b90506020813d60201161142b575b8161141460209383611b42565b81010312610afb5761142590611d3c565b816101e9565b3d9150611407565b63634ba39d60e11b5f9081526001600160a01b03918216600490815235909116602452604490fd5b90506020813d60201161148d575b8161147660209383611b42565b81010312610afb5761148790611d2f565b5f6101b5565b3d9150611469565b805180835260209291819084018484015e5f828201840152601f01601f1916010190565b90602080835192838152019201905f5b8181106114d65750505090565b82518452602093840193909201916001016114c9565b80516001600160a01b03908116835260208083015182169084015260408083015182169084015260608083015190911690830152608090810151910152565b60806101a09161153c8482516114ec565b6001600160801b0360a0602083015182815116828801528260208201511660c08801528260408201511660e0880152826060820151166101008801528285820151166101208801520151166101408501526040810151151561016085015260608101516101808501520151910152565b60018060a01b03815116825260ff602082015116602083015260018060a01b03604082015116604083015260018060a01b0360608201511660608301526080810151608083015260018060a01b0360a08201511660a083015260c0810151906101a060c084015281516102e06101a085015260018060a01b0381511661048085015260a061166661164e602084015160c06104a0890152610540880190611495565b604084015187820361047f19016104c0890152611495565b9160608101516104e08701526080810151610500870152015161047f198583030161052086015260ff60f81b815116825260c06116c76116b5602084015160e0602087015260e0860190611495565b60408401518582036040870152611495565b916060810151606085015260018060a01b03608082015116608085015260a081015160a085015201519160c0818303910152602080835192838152019201905f5b818110611a8a575050506020838101516001600160a01b039081166101c087015260408581015182166101e08801526060860151909116610200870152608085015161022087015260a085015180516001600160c01b0316610240888101919091529201516001600160401b03166102608701529161184a906118319060c087015180516001600160a01b039081166102808b01526020909101516001600160401b03166102a08a015260e088015181166102c08a01526101008801516102e08a015261012088015181166103008a0152610140880151166103208901526101608701516103408901526101808701516103608901526101a087015115156103808901526101c08701516103a08901526101e087015161019f19898303016103c08a01526114b9565b61020086015187820361019f19016103e08901526114b9565b936102208101511515610400870152015160018060a01b038151166104208601526020810151610440860152015161046084015260e08101519183810360e0850152602080845192838152019301905f5b8181106119c05750505061010081015161010084015261012081015161012084015261014081015191838103610140850152602080845192838152019301905f5b81811061195b575050506101809060018060a01b0361016082015116610160850152015191610180818303910152602080835192838152019201905f5b8181106119265750505090565b9091926020610200600192611950604088518051845285810151868501520151604083019061152b565b019401929101611919565b90919360206102c06001926119b5604089516119788482516114ec565b6119a88682015160a08601906001600160801b036040809280518552826020820151166020860152015116910152565b015161010083019061152b565b0195019291016118dc565b90919360206103006001926001600160801b0360e0895180518452858101511515868501526001600160401b036040820151166040850152611a25606082015160608601906001600160401b036020809260018060c01b038151168552015116910152565b611a56608082015160a08601906001600160801b036040809280518552826020820151166020860152015116910152565b611a6960a082015161010086019061152b565b60c081015183166102c08501520151166102e082015201950192910161189b565b8251845260209384019390920191600101611708565b608081019081106001600160401b03821117610d2457604052565b60e081019081106001600160401b03821117610d2457604052565b604081019081106001600160401b03821117610d2457604052565b606081019081106001600160401b03821117610d2457604052565b60c081019081106001600160401b03821117610d2457604052565b60a081019081106001600160401b03821117610d2457604052565b90601f801991011681019081106001600160401b03821117610d2457604052565b60405190611b7082611abb565b606060c0835f81528260208201528260408201525f838201525f60808201525f60a08201520152565b60405190611ba682611af1565b5f6040838281528260208201520152565b6040519061026082018281106001600160401b03821117610d245760405281604051611be281611b0c565b5f815260606020820152606060408201525f60608201525f6080820152611c07611b63565b60a082015281525f60208201525f60408201525f60608201525f6080820152604051611c3281611ad6565b5f81525f602082015260a0820152604051611c4c81611ad6565b5f81525f602082015260c08201525f60e08201525f6101008201525f6101208201525f6101408201525f6101608201525f6101808201525f6101a08201525f6101c082015260606101e082015260606102008201525f610220820152610240611cb3611b99565b910152565b604051906101a082018281106001600160401b03821117610d24576040526060610180835f81525f60208201525f60408201525f838201525f60808201525f60a0820152611d04611bb7565b60c08201528260e08201525f6101008201525f610120820152826101408201525f6101608201520152565b51908115158203610afb57565b51906001600160a01b0382168203610afb57565b6001600160401b038111610d2457601f01601f191660200190565b929192611d7782611d50565b91611d856040519384611b42565b829481845281830111610afb578281602093845f96015e010152565b9080601f83011215610afb578151611dbb92602001611d6b565b90565b90602082820312610afb5781516001600160401b038111610afb57611dbb9201611da1565b90816020910312610afb575160ff81168103610afb5790565b51906001600160801b0382168203610afb57565b51906001600160401b0382168203610afb57565b90816020910312610afb57516001600160601b0381168103610afb5790565b6001600160401b038111610d245760051b60200190565b805115611e675760200190565b634e487b7160e01b5f52603260045260245ffd5b8051821015611e675760209160051b010190565b908160a0910312610afb57608060405191611ea983611b27565b611eb281611d3c565b8352611ec060208201611d3c565b6020840152611ed160408201611d3c565b6040840152611ee260608201611d3c565b60608401520151608082015290565b60405190611efe82611b27565b5f6080838281528260208201528260408201528260608201520152565b60405190611f2882611b27565b5f608083611f34611ef1565b8152604051611f4281611b0c565b83815283602082015283604082015283606082015283838201528360a082015260208201528260408201528260608201520152565b90816060910312610afb57611fae6040805192611f9384611af1565b80518452611fa360208201611dfc565b602085015201611dfc565b604082015290565b6040519061010082018281106001600160401b03821117610d24576040525f60e083828152826020820152826040820152604051611ff381611ad6565b8381528360208201526060820152612009611b99565b6080820152612016611f1b565b60a08201528260c08201520152565b95939091979692612034611cb8565b6001600160a01b038481168083526040516399e9918360e01b815260048101829052929b909990929160209183916024918391165afa908115610b07575f91613a10575b5060808b01526001600160a01b031680151590816139a1575b501561324f57505050600160208701526040516307f1b29b60e11b8152602081600481885afa908115610b07575f91613215575b506001600160a01b03166040878101919091525163388af5b560e01b8152602081600481885afa908115610b07575f916131db575b506001600160a01b0316606087015260405163e4baaddf60e01b815292602084600481885afa938415610b07575f9461319f575b506001600160a01b0390931660a08701818152939061214b611bb7565b916040516338d52e0f60e01b8152602081600481865afa908115610b07575f91613165575b506040516395d89b4160e01b81525f81600481875afa908115610b07575f9161314b575b506040516306fdde0360e01b81525f81600481885afa908115610b07575f91613131575b5060405163313ce56760e01b815290602082600481895afa918215610b07575f92613110575b50604051632ba9c2b360e21b8152926020846004818a5afa938415610b07575f946130ef575b5061220d611b63565b505f8060405160208101906342580cb760e11b825260048152612231602482611b42565b51908a5afa61223e613cba565b90156130b457805181019060e08160208401930312610afb5760208101516001600160f81b0319811690819003610afb5760408201516001600160401b038111610afb5783602061229192850101611da1565b60608301516001600160401b038111610afb578460206122b392860101611da1565b608084015160a08501516001600160a01b0381169491939190859003610afb5760c08601519560e0810151906001600160401b038211610afb57019680603f89011215610afb57602088015161230881611e43565b986123166040519a8b611b42565b818a52602080808c019360051b83010101928311610afb57604001905b8282106130a457505050926123599a98959260ff9a9794928b9996936040519d8e611abb565b8d5260208d015260408c015260608b015260808a015260a089015260c08801526040519761238689611b0c565b60018060a01b031688526020880152604087015216606085015216608083015260a08201528352604051638da5cb5b60e01b8152602081600481865afa908115610b07575f9161306a575b506001600160a01b031660208481019190915260405163e66f53b760e01b81529081600481865afa908115610b07575f91613030575b506001600160a01b031660408481019190915251630229549960e51b8152602081600481865afa908115610b07575f91612ff6575b506001600160a01b031660608401526040516334cc866d60e21b8152602081600481865afa908115610b07575f91612fc4575b50608084015260408051637cc4d9a160e01b81529081600481865afa908115610b07575f91612fa5575b5060a084015260408051633b1618dd60e11b81529081600481865afa908115610b07575f91612f4c575b5060c0840152604051631c61872f60e31b8152602081600481865afa908115610b07575f91612f12575b506001600160a01b031660e084015260405163ddca3f4360e01b8152602081600481865afa8015610b07576001600160601b03915f91612ef3575b501661010084015260405163011a412160e61b8152602081600481865afa908115610b07575f91612eb9575b506001600160a01b031661012084015260405163388af5b560e01b8152602081600481865afa908115610b07575f91612e7f575b506001600160a01b03166101408401526040516318160ddd60e01b8152602081600481865afa908115610b07575f91612e4d575b5061016084015260405163568efc0760e01b8152602081600481865afa908115610b07575f91612e1b575b506101808401525f806040516020810190630872d2c560e21b825260048152612611602482611b42565b5190855afa61261e613cba565b9080612e0f575b612de6575b50604051630a17b31360e41b8152602081600481865afa908115610b07575f91612db4575b5061265981613ce9565b6101e085019081525f5b828110612d415750506040516333f91ebb60e01b8152949050602085600481865afa948515610b07575f95612d0d575b5061269d85613ce9565b9461020085019586525f5b818110612c9a5750506001600160a01b0316801515949092908580612c2e575b612ad4575b60c08b019485525151946126e086611e43565b946126ee6040519687611b42565b868652601f196126fd88611e43565b015f5b818110612abd57505060e08c019586525f5b8781106127fa57505096516040516370a0823160e01b8152600481018a9052975060209650879550602494508593506001600160a01b03169150505afa908115610b07575f916127c7575b50610100840152604051634450bdef60e11b815290602090829060049082905afa908115610b07575f91612795575b50610120830152565b90506020813d6020116127bf575b816127b060209383611b42565b81010312610afb57515f61278c565b3d91506127a3565b90506020813d6020116127f2575b816127e260209383611b42565b81010312610afb5751600461275d565b3d91506127d5565b61280a8161020084510151611e7b565b5190612814611fb6565b91604051636638c7bb60e11b81528160048201526060816024818a5afa908115610b07575f91612a40575b5080516001600160b81b031684526020808201511515908501526040908101516001600160401b031684820152805163518df2eb60e11b81526004810183905290816024818a5afa908115610b07575f91612a12575b506060848101919091526040516349e2903160e11b8152600481018390526001600160a01b03881660248201529081806044810103816001600160a01b038c165afa908115610b07575f916129e4575b506080840152846128f78c838a613a42565b60a085015261291d575b50612916816001938a5190610ab18383611e7b565b5001612712565b9160405192639dbcd5b960e01b845286600485015260248401526040836044818b5afa928315610b07575f93612977575b5082516001600160801b0390811660c083015260209093015190921660e0830152612916612901565b92506040833d82116129dc575b8161299160409383611b42565b81010312610afb5781612916916001600160801b0360206001966129cd82604051926129bc84611ad6565b6129c581611dfc565b845201611dfc565b8282015296505050915061294e565b3d9150612984565b612a05915060603d8111612a0b575b6129fd8183611b42565b810190611f77565b5f6128e5565b503d6129f3565b612a33915060403d8111612a39575b612a2b8183611b42565b810190613c7a565b5f612895565b503d612a21565b90506060813d8211612ab5575b81612a5a60609383611b42565b81010312610afb57604051612a6e81611af1565b8151906001600160b81b0382168203610afb57612aaa60406001600160401b039481948452612a9f60208201611d2f565b602085015201611e10565b82820152915061283f565b3d9150612a4d565b602090612ac8611fb6565b82828b01015201612700565b6001610220860152604051630c7508df60e31b815260048101839052602081602481885afa908115610b07575f91612bf4575b50604051636fcca69b60e01b815260048101849052602081602481895afa908115610b07575f91612bc2575b506040516348d88a5960e11b815260048101859052906020826024818a5afa918215610b07575f92612b8e575b5060405192612b6e84611af1565b6001600160a01b03168352602083015260408201526102408601526126cd565b9091506020813d602011612bba575b81612baa60209383611b42565b81010312610afb5751905f612b60565b3d9150612b9d565b90506020813d602011612bec575b81612bdd60209383611b42565b81010312610afb57515f612b33565b3d9150612bd0565b90506020813d602011612c26575b81612c0f60209383611b42565b81010312610afb57612c2090611d3c565b5f612b07565b3d9150612c02565b506040516326f6f90760e11b815260048101859052602081602481865afa908115610b07575f91612c60575b506126c8565b90506020813d602011612c92575b81612c7b60209383611b42565b81010312610afb57612c8c90611d2f565b5f612c5a565b3d9150612c6e565b6040516362518ddf60e01b81526004810182905290602082602481895afa8015610b07575f90612cdb575b60019250612cd4828a51611e7b565b52016126a8565b506020823d8211612d05575b81612cf460209383611b42565b81010312610afb5760019151612cc5565b3d9150612ce7565b9094506020813d602011612d39575b81612d2960209383611b42565b81010312610afb5751935f612693565b3d9150612d1c565b60405163f7d1852160e01b81526004810182905290602082602481895afa8015610b07575f90612d82575b60019250612d7b828551611e7b565b5201612663565b506020823d8211612dac575b81612d9b60209383611b42565b81010312610afb5760019151612d6c565b3d9150612d8e565b90506020813d602011612dde575b81612dcf60209383611b42565b81010312610afb57515f61264f565b3d9150612dc2565b60016101a085015260208151918180820193849201010312610afb57516101c08401525f61262a565b50602081511015612625565b90506020813d602011612e45575b81612e3660209383611b42565b81010312610afb57515f6125e7565b3d9150612e29565b90506020813d602011612e77575b81612e6860209383611b42565b81010312610afb57515f6125bc565b3d9150612e5b565b90506020813d602011612eb1575b81612e9a60209383611b42565b81010312610afb57612eab90611d3c565b5f612588565b3d9150612e8d565b90506020813d602011612eeb575b81612ed460209383611b42565b81010312610afb57612ee590611d3c565b5f612554565b3d9150612ec7565b612f0c915060203d60201161117c5761116e8183611b42565b5f612528565b90506020813d602011612f44575b81612f2d60209383611b42565b81010312610afb57612f3e90611d3c565b5f6124ed565b3d9150612f20565b90506040813d604011612f9d575b81612f6760409383611b42565b81010312610afb57612f92602060405192612f8184611ad6565b612f8a81611d3c565b845201611e10565b60208201525f6124c3565b3d9150612f5a565b612fbe915060403d604011612a3957612a2b8183611b42565b5f612499565b90506020813d602011612fee575b81612fdf60209383611b42565b81010312610afb57515f61246f565b3d9150612fd2565b90506020813d602011613028575b8161301160209383611b42565b81010312610afb5761302290611d3c565b5f61243c565b3d9150613004565b90506020813d602011613062575b8161304b60209383611b42565b81010312610afb5761305c90611d3c565b5f612407565b3d915061303e565b90506020813d60201161309c575b8161308560209383611b42565b81010312610afb5761309690611d3c565b5f6123d1565b3d9150613078565b8151815260209182019101612333565b60405162461bcd60e51b8152602060048201526013602482015272195a5c0dcc4c911bdb585a5b8819985a5b1959606a1b6044820152606490fd5b61310991945060203d6020116113b4576113a58183611b42565b925f612204565b61312a91925060203d6020116113b4576113a58183611b42565b905f6121de565b61314591503d805f833e6113d08183611b42565b5f6121b8565b61315f91503d805f833e6113d08183611b42565b5f612194565b90506020813d602011613197575b8161318060209383611b42565b81010312610afb5761319190611d3c565b5f612170565b3d9150613173565b9093506020813d6020116131d3575b816131bb60209383611b42565b81010312610afb576131cc90611d3c565b925f61212e565b3d91506131ae565b90506020813d60201161320d575b816131f660209383611b42565b81010312610afb5761320790611d3c565b5f6120fa565b3d91506131e9565b90506020813d602011613247575b8161323060209383611b42565b81010312610afb5761324190611d3c565b5f6120c5565b3d9150613223565b939591949193919250906001600160a01b03168015159081613932575b50156135645750600260208701526040516307f1b29b60e11b8152602081600481865afa908115610b07575f9161352a575b506001600160a01b03166040878101919091525163388af5b560e01b8152602081600481865afa908115610b07575f916134f0575b506001600160a01b0316606087015260405163b045ff5b60e01b815292602084600481865afa938415610b07575f946134bc575b5061331184611e43565b9261331f6040519485611b42565b848452601f1961332e86611e43565b015f5b81811061347e57505061014088019384525f5b8581106133545750505050505050565b604051631f1a892160e11b8152600481018290529060a082602481865afa918215610b07575f9261344e575b50604051602081019061339382856114ec565b60a081526133a260c082611b42565b519020916133b1828851611e7b565b51526040516349e2903160e11b8152600481018390526001600160a01b0385166024820152606081806044810103816001600160a01b038a165afa908115610b075760019361341a928b925f91613430575b506020613411868c51611e7b565b51015287613a42565b6040613427838951611e7b565b51015201613344565b613448915060603d8111612a0b576129fd8183611b42565b5f613403565b61347091925060a03d8111613477575b6134688183611b42565b810190611e8f565b905f613380565b503d61345e565b60209060405161348d81611af1565b613495611ef1565b815261349f611b99565b838201526134ab611f1b565b604082015282828901015201613331565b9093506020813d6020116134e8575b816134d860209383611b42565b81010312610afb5751925f613307565b3d91506134cb565b90506020813d602011613522575b8161350b60209383611b42565b81010312610afb5761351c90611d3c565b5f6132d3565b3d91506134fe565b90506020813d60201161355c575b8161354560209383611b42565b81010312610afb5761355690611d3c565b5f61329e565b3d9150613538565b91939250906001600160a01b031680151590816138c3575b50156138b057600360208601526040516307f1b29b60e11b8152602081600481875afa908115610b07575f91613876575b506001600160a01b03166040868101919091525163388af5b560e01b8152602081600481875afa908115610b07575f9161383c575b506001600160a01b03166060860152604051630399e3a560e41b8152602081600481875afa908115610b07575f91613802575b506001600160a01b031661016086015260405163ace48b4560e01b815291602083600481875afa928315610b07575f936137ce575b5061365483611e43565b916136626040519384611b42565b838352601f1961367185611e43565b015f5b81811061379e57505061018087019283525f5b84811061369657505050505050565b60405163779a968360e01b815260048101829052906020826024818a5afa918215610b07575f9261376b575b50816136cf828751611e7b565b5152604051630dd5aa9b60e31b815260048101839052916020836024818b5afa8015610b075785935f91613733575b509261371d916001946020613714868b51611e7b565b51015285613a42565b604061372a838851611e7b565b51015201613687565b9350506020833d8211613763575b8161374e60209383611b42565b81010312610afb57915184929061371d6136fe565b3d9150613741565b9091506020813d8211613796575b8161378660209383611b42565b81010312610afb5751905f6136c2565b3d9150613779565b6020906040516137ad81611af1565b5f81525f838201526137bd611f1b565b604082015282828801015201613674565b9092506020813d6020116137fa575b816137ea60209383611b42565b81010312610afb5751915f61364a565b3d91506137dd565b90506020813d602011613834575b8161381d60209383611b42565b81010312610afb5761382e90611d3c565b5f613615565b3d9150613810565b90506020813d60201161386e575b8161385760209383611b42565b81010312610afb5761386890611d3c565b5f6135e2565b3d915061384a565b90506020813d6020116138a8575b8161389160209383611b42565b81010312610afb576138a290611d3c565b5f6135ad565b3d9150613884565b82636364223f60e01b5f5260045260245ffd5b60249150602090604051928380926335abafe560e21b82528860048301525afa908115610b07575f916138f8575b505f61357c565b90506020813d60201161392a575b8161391360209383611b42565b81010312610afb5761392490611d2f565b5f6138f1565b3d9150613906565b602491506020906040519283809263230dbab560e01b82528860048301525afa908115610b07575f91613967575b505f61326c565b90506020813d602011613999575b8161398260209383611b42565b81010312610afb5761399390611d2f565b5f613960565b3d9150613975565b6024915060209060405192838092632c77566560e01b82528c60048301525afa908115610b07575f916139d6575b505f612091565b90506020813d602011613a08575b816139f160209383611b42565b81010312610afb57613a0290611d2f565b5f6139cf565b3d91506139e4565b90506020813d602011613a3a575b81613a2b60209383611b42565b81010312610afb57515f612078565b3d9150613a1e565b929190613a4d611f1b565b604051632c3c915760e01b81526004810183905290946001600160a01b03169060a081602481855afa918215610b075760249260c0925f91613c5b575b50875260405192838092632e3071cd60e11b82528660048301525afa908115610b07575f91613bbe575b5060208501528351604001516001600160a01b031680613b52575b508351606001516001600160a01b0392831692168214613aed575050565b6020906024604051809481936301977b5760e01b835260048301525afa908115610b07575f91613b20575b506080830152565b90506020813d602011613b4a575b81613b3b60209383611b42565b81010312610afb57515f613b18565b3d9150613b2e565b60206004916040519283809263501ad8ff60e11b82525afa5f9181613b8a575b5015613acf576001604086015260608501525f613acf565b9091506020813d602011613bb6575b81613ba660209383611b42565b81010312610afb5751905f613b72565b3d9150613b99565b905060c0813d60c011613c53575b81613bd960c09383611b42565b81010312610afb57613c4860a060405192613bf384611b0c565b613bfc81611dfc565b8452613c0a60208201611dfc565b6020850152613c1b60408201611dfc565b6040850152613c2c60608201611dfc565b6060850152613c3d60808201611dfc565b608085015201611dfc565b60a08201525f613ab4565b3d9150613bcc565b613c74915060a03d60a011613477576134688183611b42565b5f613a8a565b90816040910312610afb5760405190613c9282611ad6565b80516001600160c01b0381168103610afb578252613cb290602001611e10565b602082015290565b3d15613ce4573d90613ccb82611d50565b91613cd96040519384611b42565b82523d5f602084013e565b606090565b90613cf382611e43565b613d006040519182611b42565b8281528092613d11601f1991611e43565b019060203691013756fea2646970667358221220987532e8de6d027e35d21181f1c0859e46a0d2b1fd4032f2743170cc844d01f564736f6c63430008240033";
