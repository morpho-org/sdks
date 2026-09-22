import type { Abi } from "viem";

export { marketParamsAbi as blueMarketParamsAbi } from "@morpho-org/blue-sdk";
export {
  adaptiveCurveIrmAbi as blueAdaptiveCurveIrmAbi,
  blueAbi,
  blueOracleAbi,
  erc2612Abi,
  erc5267Abi,
  metaMorphoAbi,
  metaMorphoFactoryAbi,
  morphoMarketV1AdapterAbi,
  morphoMarketV1AdapterFactoryAbi,
  morphoMarketV1AdapterV2Abi,
  morphoMarketV1AdapterV2FactoryAbi,
  morphoVaultV1AdapterAbi,
  morphoVaultV1AdapterFactoryAbi,
  permissionedErc20WrapperAbi,
  permit2Abi,
  /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
  preLiquidationAbi as bluePreLiquidationAbi,
  /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
  preLiquidationFactoryAbi as bluePreLiquidationFactoryAbi,
  vaultV2Abi,
  vaultV2BluePublicAllocatorAbi,
  vaultV2FactoryAbi,
  whitelistControllerAggregatorV2Abi,
  wrappedBackedTokenAbi,
  wstEthAbi,
} from "@morpho-org/blue-sdk-viem";
export {
  ecrecoverRatifierAbi as midnightEcrecoverRatifierAbi,
  midnightAbi,
  midnightBundlesAbi,
  setterRatifierAbi as midnightSetterRatifierAbi,
} from "@morpho-org/midnight-sdk";

/** ABI for the VaultExitBundlesV1 periphery contract. */
export const vaultExitBundlesV1Abi = [
  {
    type: "constructor",
    inputs: [{ name: "_blue", type: "address", internalType: "address" }],
    stateMutability: "nonpayable",
  },
  { type: "error", name: "AdapterNotPartOfVault", inputs: [] },
  { type: "error", name: "AlreadyInitiated", inputs: [] },
  { type: "error", name: "ApproveReturnedFalse", inputs: [] },
  { type: "error", name: "DeadlinePassed", inputs: [] },
  { type: "error", name: "InvalidAdaptersLength", inputs: [] },
  { type: "error", name: "MorphoMismatch", inputs: [] },
  { type: "error", name: "NoCode", inputs: [] },
  { type: "error", name: "PctExceeded", inputs: [] },
  { type: "error", name: "SlippageExceeded", inputs: [] },
  { type: "error", name: "TransferReturnedFalse", inputs: [] },
  { type: "error", name: "UnauthorizedCallback", inputs: [] },
  {
    type: "function",
    name: "BLUE",
    inputs: [],
    outputs: [{ name: "", type: "address", internalType: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "initiator",
    inputs: [],
    outputs: [{ name: "", type: "address", internalType: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "onMorphoFlashLoan",
    inputs: [
      { name: "exitAssets", type: "uint256", internalType: "uint256" },
      { name: "data", type: "bytes", internalType: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "onMorphoSupply",
    inputs: [
      { name: "assets", type: "uint256", internalType: "uint256" },
      { name: "data", type: "bytes", internalType: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "vaultExitBundlesV1ForceWithdrawVaultV2",
    inputs: [
      { name: "vault", type: "address", internalType: "address" },
      { name: "adapter", type: "address", internalType: "address" },
      { name: "exitAssets", type: "uint256", internalType: "uint256" },
      { name: "minSharePriceE27", type: "uint256", internalType: "uint256" },
      {
        name: "sharesPermit",
        type: "tuple",
        internalType: "struct Permit",
        components: [
          { name: "value", type: "uint256", internalType: "uint256" },
          { name: "nonce", type: "uint256", internalType: "uint256" },
          { name: "deadline", type: "uint256", internalType: "uint256" },
          { name: "v", type: "uint8", internalType: "uint8" },
          { name: "r", type: "bytes32", internalType: "bytes32" },
          { name: "s", type: "bytes32", internalType: "bytes32" },
        ],
      },
      { name: "referralFeePct", type: "uint256", internalType: "uint256" },
      {
        name: "referralFeeRecipient",
        type: "address",
        internalType: "address",
      },
      { name: "deadline", type: "uint256", internalType: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "vaultExitBundlesV1InKindRedemptionVaultV1",
    inputs: [
      { name: "vault", type: "address", internalType: "address" },
      {
        name: "marketParamsList",
        type: "tuple[]",
        internalType: "struct MarketParams[]",
        components: [
          { name: "loanToken", type: "address", internalType: "address" },
          {
            name: "collateralToken",
            type: "address",
            internalType: "address",
          },
          { name: "oracle", type: "address", internalType: "address" },
          { name: "irm", type: "address", internalType: "address" },
          { name: "lltv", type: "uint256", internalType: "uint256" },
        ],
      },
      { name: "exitAssets", type: "uint256", internalType: "uint256" },
      {
        name: "sharesPermit",
        type: "tuple",
        internalType: "struct Permit",
        components: [
          { name: "value", type: "uint256", internalType: "uint256" },
          { name: "nonce", type: "uint256", internalType: "uint256" },
          { name: "deadline", type: "uint256", internalType: "uint256" },
          { name: "v", type: "uint8", internalType: "uint8" },
          { name: "r", type: "bytes32", internalType: "bytes32" },
          { name: "s", type: "bytes32", internalType: "bytes32" },
        ],
      },
      { name: "deadline", type: "uint256", internalType: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "vaultExitBundlesV1InKindRedemptionVaultV2",
    inputs: [
      { name: "vault", type: "address", internalType: "address" },
      { name: "adapter", type: "address", internalType: "address" },
      {
        name: "marketParamsList",
        type: "tuple[]",
        internalType: "struct MarketParams[]",
        components: [
          { name: "loanToken", type: "address", internalType: "address" },
          {
            name: "collateralToken",
            type: "address",
            internalType: "address",
          },
          { name: "oracle", type: "address", internalType: "address" },
          { name: "irm", type: "address", internalType: "address" },
          { name: "lltv", type: "uint256", internalType: "uint256" },
        ],
      },
      { name: "exitAssets", type: "uint256", internalType: "uint256" },
      {
        name: "sharesPermit",
        type: "tuple",
        internalType: "struct Permit",
        components: [
          { name: "value", type: "uint256", internalType: "uint256" },
          { name: "nonce", type: "uint256", internalType: "uint256" },
          { name: "deadline", type: "uint256", internalType: "uint256" },
          { name: "v", type: "uint8", internalType: "uint8" },
          { name: "r", type: "bytes32", internalType: "bytes32" },
          { name: "s", type: "bytes32", internalType: "bytes32" },
        ],
      },
      { name: "deadline", type: "uint256", internalType: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const satisfies Abi;

/**
 * Pinned ABI for the VaultBundlesV1 entrypoints used by Vault V1 and Vault V2 actions.
 *
 * Sourced from `morpho-org/bundles` commit
 * `f27e7bcf744310303e24faa522b71d702e696686`.
 */
export const vaultBundlesV1Abi = [
  { type: "error", name: "AlreadyInitiated", inputs: [] },
  { type: "error", name: "DeadlinePassed", inputs: [] },
  { type: "error", name: "InconsistentAssets", inputs: [] },
  { type: "error", name: "NotExactlyOneZero", inputs: [] },
  { type: "error", name: "PctExceeded", inputs: [] },
  { type: "error", name: "SlippageExceeded", inputs: [] },
  {
    type: "function",
    name: "initiator",
    inputs: [],
    outputs: [{ name: "", type: "address", internalType: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "vaultBundlesV1Deposit",
    inputs: [
      { name: "vault", type: "address", internalType: "address" },
      { name: "assets", type: "uint256", internalType: "uint256" },
      {
        name: "maxSharePriceE27",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "assetPermit",
        type: "tuple",
        internalType: "struct TokenPermit",
        components: [
          { name: "kind", type: "uint8", internalType: "enum PermitKind" },
          { name: "data", type: "bytes", internalType: "bytes" },
        ],
      },
      {
        name: "referralFeePct",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "referralFeeRecipient",
        type: "address",
        internalType: "address",
      },
      { name: "deadline", type: "uint256", internalType: "uint256" },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "vaultBundlesV1Withdraw",
    inputs: [
      { name: "vault", type: "address", internalType: "address" },
      { name: "assets", type: "uint256", internalType: "uint256" },
      { name: "shares", type: "uint256", internalType: "uint256" },
      {
        name: "sharesPermit",
        type: "tuple",
        internalType: "struct Permit",
        components: [
          { name: "value", type: "uint256", internalType: "uint256" },
          { name: "nonce", type: "uint256", internalType: "uint256" },
          { name: "deadline", type: "uint256", internalType: "uint256" },
          { name: "v", type: "uint8", internalType: "uint8" },
          { name: "r", type: "bytes32", internalType: "bytes32" },
          { name: "s", type: "bytes32", internalType: "bytes32" },
        ],
      },
      {
        name: "referralFeePct",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "referralFeeRecipient",
        type: "address",
        internalType: "address",
      },
      { name: "deadline", type: "uint256", internalType: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "vaultBundlesV1Migrate",
    inputs: [
      { name: "sourceVault", type: "address", internalType: "address" },
      { name: "destVault", type: "address", internalType: "address" },
      {
        name: "assetsWithdrawn",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "sharesRedeemed",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "destMaxSharePriceE27",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "sharesPermit",
        type: "tuple",
        internalType: "struct Permit",
        components: [
          { name: "value", type: "uint256", internalType: "uint256" },
          { name: "nonce", type: "uint256", internalType: "uint256" },
          { name: "deadline", type: "uint256", internalType: "uint256" },
          { name: "v", type: "uint8", internalType: "uint8" },
          { name: "r", type: "bytes32", internalType: "bytes32" },
          { name: "s", type: "bytes32", internalType: "bytes32" },
        ],
      },
      {
        name: "referralFeePct",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "referralFeeRecipient",
        type: "address",
        internalType: "address",
      },
      { name: "deadline", type: "uint256", internalType: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const satisfies Abi;

/**
 * Pinned ABI JSON for the five BlueBundlesV1 entrypoints used by high-level Morpho Blue writes.
 *
 * Source: `morpho-org/bundles` commit `dceb05da1c730424e6b36caf445dff808a2d5007`,
 * `src/blue/interfaces/IBlueBundlesV1.sol`, with `Signature` pinned by that commit's
 * `morpho-blue` submodule at `1478e9cfe1b4d514f80682b3b60e4e12ff3ee45a` (`v` is `uint8`).
 *
 * @see https://github.com/morpho-org/bundles/blob/dceb05da1c730424e6b36caf445dff808a2d5007/src/blue/interfaces/IBlueBundlesV1.sol
 * @example
 * ```ts
 * import { blueBundlesV1Abi } from "@morpho-org/morpho-sdk/abis";
 *
 * console.log(blueBundlesV1Abi.length);
 * ```
 */
export const blueBundlesV1Abi = [
  {
    type: "function",
    name: "blueBundlesV1SupplyCollateralAndBorrow",
    stateMutability: "payable",
    inputs: [
      {
        name: "marketParams",
        type: "tuple",
        components: [
          {
            name: "loanToken",
            type: "address",
          },
          {
            name: "collateralToken",
            type: "address",
          },
          {
            name: "oracle",
            type: "address",
          },
          {
            name: "irm",
            type: "address",
          },
          {
            name: "lltv",
            type: "uint256",
          },
        ],
      },
      {
        name: "collateralAssets",
        type: "uint256",
      },
      {
        name: "borrowAssets",
        type: "uint256",
      },
      {
        name: "maxLtv",
        type: "uint256",
      },
      {
        name: "collateralPermit",
        type: "tuple",
        components: [
          {
            name: "kind",
            type: "uint8",
          },
          {
            name: "data",
            type: "bytes",
          },
        ],
      },
      {
        name: "signedAuthorization",
        type: "tuple",
        components: [
          {
            name: "signature",
            type: "tuple",
            components: [
              {
                name: "v",
                type: "uint8",
              },
              {
                name: "r",
                type: "bytes32",
              },
              {
                name: "s",
                type: "bytes32",
              },
            ],
          },
          {
            name: "nonce",
            type: "uint256",
          },
          {
            name: "deadline",
            type: "uint256",
          },
        ],
      },
      {
        name: "reallocations",
        type: "tuple[]",
        components: [
          {
            name: "vault",
            type: "address",
          },
          {
            name: "adapter",
            type: "address",
          },
          {
            name: "marketParams",
            type: "tuple",
            components: [
              {
                name: "loanToken",
                type: "address",
              },
              {
                name: "collateralToken",
                type: "address",
              },
              {
                name: "oracle",
                type: "address",
              },
              {
                name: "irm",
                type: "address",
              },
              {
                name: "lltv",
                type: "uint256",
              },
            ],
          },
          {
            name: "fromIdle",
            type: "bool",
          },
          {
            name: "sourceAdapter",
            type: "address",
          },
          {
            name: "sourceMarketParams",
            type: "tuple",
            components: [
              {
                name: "loanToken",
                type: "address",
              },
              {
                name: "collateralToken",
                type: "address",
              },
              {
                name: "oracle",
                type: "address",
              },
              {
                name: "irm",
                type: "address",
              },
              {
                name: "lltv",
                type: "uint256",
              },
            ],
          },
          {
            name: "assets",
            type: "uint128",
          },
          {
            name: "penalty",
            type: "uint64",
          },
        ],
      },
      {
        name: "referralFeePct",
        type: "uint256",
      },
      {
        name: "referralFeeRecipient",
        type: "address",
      },
      {
        name: "deadline",
        type: "uint256",
      },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "blueBundlesV1RepayAndWithdrawCollateral",
    stateMutability: "payable",
    inputs: [
      {
        name: "marketParams",
        type: "tuple",
        components: [
          {
            name: "loanToken",
            type: "address",
          },
          {
            name: "collateralToken",
            type: "address",
          },
          {
            name: "oracle",
            type: "address",
          },
          {
            name: "irm",
            type: "address",
          },
          {
            name: "lltv",
            type: "uint256",
          },
        ],
      },
      {
        name: "repayAssets",
        type: "uint256",
      },
      {
        name: "repayShares",
        type: "uint256",
      },
      {
        name: "maxRepayAssets",
        type: "uint256",
      },
      {
        name: "collateralAssets",
        type: "uint256",
      },
      {
        name: "maxLtv",
        type: "uint256",
      },
      {
        name: "loanTokenPermit",
        type: "tuple",
        components: [
          {
            name: "kind",
            type: "uint8",
          },
          {
            name: "data",
            type: "bytes",
          },
        ],
      },
      {
        name: "signedAuthorization",
        type: "tuple",
        components: [
          {
            name: "signature",
            type: "tuple",
            components: [
              {
                name: "v",
                type: "uint8",
              },
              {
                name: "r",
                type: "bytes32",
              },
              {
                name: "s",
                type: "bytes32",
              },
            ],
          },
          {
            name: "nonce",
            type: "uint256",
          },
          {
            name: "deadline",
            type: "uint256",
          },
        ],
      },
      {
        name: "referralFeePct",
        type: "uint256",
      },
      {
        name: "referralFeeRecipient",
        type: "address",
      },
      {
        name: "deadline",
        type: "uint256",
      },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "blueBundlesV1Supply",
    stateMutability: "payable",
    inputs: [
      {
        name: "marketParams",
        type: "tuple",
        components: [
          {
            name: "loanToken",
            type: "address",
          },
          {
            name: "collateralToken",
            type: "address",
          },
          {
            name: "oracle",
            type: "address",
          },
          {
            name: "irm",
            type: "address",
          },
          {
            name: "lltv",
            type: "uint256",
          },
        ],
      },
      {
        name: "assets",
        type: "uint256",
      },
      {
        name: "loanTokenPermit",
        type: "tuple",
        components: [
          {
            name: "kind",
            type: "uint8",
          },
          {
            name: "data",
            type: "bytes",
          },
        ],
      },
      {
        name: "referralFeePct",
        type: "uint256",
      },
      {
        name: "referralFeeRecipient",
        type: "address",
      },
      {
        name: "deadline",
        type: "uint256",
      },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "blueBundlesV1Withdraw",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "marketParams",
        type: "tuple",
        components: [
          {
            name: "loanToken",
            type: "address",
          },
          {
            name: "collateralToken",
            type: "address",
          },
          {
            name: "oracle",
            type: "address",
          },
          {
            name: "irm",
            type: "address",
          },
          {
            name: "lltv",
            type: "uint256",
          },
        ],
      },
      {
        name: "withdrawAssets",
        type: "uint256",
      },
      {
        name: "withdrawShares",
        type: "uint256",
      },
      {
        name: "signedAuthorization",
        type: "tuple",
        components: [
          {
            name: "signature",
            type: "tuple",
            components: [
              {
                name: "v",
                type: "uint8",
              },
              {
                name: "r",
                type: "bytes32",
              },
              {
                name: "s",
                type: "bytes32",
              },
            ],
          },
          {
            name: "nonce",
            type: "uint256",
          },
          {
            name: "deadline",
            type: "uint256",
          },
        ],
      },
      {
        name: "reallocations",
        type: "tuple[]",
        components: [
          {
            name: "vault",
            type: "address",
          },
          {
            name: "adapter",
            type: "address",
          },
          {
            name: "marketParams",
            type: "tuple",
            components: [
              {
                name: "loanToken",
                type: "address",
              },
              {
                name: "collateralToken",
                type: "address",
              },
              {
                name: "oracle",
                type: "address",
              },
              {
                name: "irm",
                type: "address",
              },
              {
                name: "lltv",
                type: "uint256",
              },
            ],
          },
          {
            name: "fromIdle",
            type: "bool",
          },
          {
            name: "sourceAdapter",
            type: "address",
          },
          {
            name: "sourceMarketParams",
            type: "tuple",
            components: [
              {
                name: "loanToken",
                type: "address",
              },
              {
                name: "collateralToken",
                type: "address",
              },
              {
                name: "oracle",
                type: "address",
              },
              {
                name: "irm",
                type: "address",
              },
              {
                name: "lltv",
                type: "uint256",
              },
            ],
          },
          {
            name: "assets",
            type: "uint128",
          },
          {
            name: "penalty",
            type: "uint64",
          },
        ],
      },
      {
        name: "referralFeePct",
        type: "uint256",
      },
      {
        name: "referralFeeRecipient",
        type: "address",
      },
      {
        name: "deadline",
        type: "uint256",
      },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "blueBundlesV1MigrateBorrowPosition",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "sourceMarketParams",
        type: "tuple",
        components: [
          {
            name: "loanToken",
            type: "address",
          },
          {
            name: "collateralToken",
            type: "address",
          },
          {
            name: "oracle",
            type: "address",
          },
          {
            name: "irm",
            type: "address",
          },
          {
            name: "lltv",
            type: "uint256",
          },
        ],
      },
      {
        name: "destMarketParams",
        type: "tuple",
        components: [
          {
            name: "loanToken",
            type: "address",
          },
          {
            name: "collateralToken",
            type: "address",
          },
          {
            name: "oracle",
            type: "address",
          },
          {
            name: "irm",
            type: "address",
          },
          {
            name: "lltv",
            type: "uint256",
          },
        ],
      },
      {
        name: "maxLtv",
        type: "uint256",
      },
      {
        name: "signedAuthorization",
        type: "tuple",
        components: [
          {
            name: "signature",
            type: "tuple",
            components: [
              {
                name: "v",
                type: "uint8",
              },
              {
                name: "r",
                type: "bytes32",
              },
              {
                name: "s",
                type: "bytes32",
              },
            ],
          },
          {
            name: "nonce",
            type: "uint256",
          },
          {
            name: "deadline",
            type: "uint256",
          },
        ],
      },
      {
        name: "reallocations",
        type: "tuple[]",
        components: [
          {
            name: "vault",
            type: "address",
          },
          {
            name: "adapter",
            type: "address",
          },
          {
            name: "marketParams",
            type: "tuple",
            components: [
              {
                name: "loanToken",
                type: "address",
              },
              {
                name: "collateralToken",
                type: "address",
              },
              {
                name: "oracle",
                type: "address",
              },
              {
                name: "irm",
                type: "address",
              },
              {
                name: "lltv",
                type: "uint256",
              },
            ],
          },
          {
            name: "fromIdle",
            type: "bool",
          },
          {
            name: "sourceAdapter",
            type: "address",
          },
          {
            name: "sourceMarketParams",
            type: "tuple",
            components: [
              {
                name: "loanToken",
                type: "address",
              },
              {
                name: "collateralToken",
                type: "address",
              },
              {
                name: "oracle",
                type: "address",
              },
              {
                name: "irm",
                type: "address",
              },
              {
                name: "lltv",
                type: "uint256",
              },
            ],
          },
          {
            name: "assets",
            type: "uint128",
          },
          {
            name: "penalty",
            type: "uint64",
          },
        ],
      },
      {
        name: "referralFeePct",
        type: "uint256",
      },
      {
        name: "referralFeeRecipient",
        type: "address",
      },
      {
        name: "deadline",
        type: "uint256",
      },
    ],
    outputs: [],
  },
] as const satisfies Abi;
