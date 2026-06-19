import type { Abi } from "viem";

/**
 * Pinned ABI JSON for the core Midnight contract.
 *
 * Source: `morpho-org/midnight` commit `a7c6da7e70cb216982f6c5d20b46f40b943e67e4`,
 * `src/interfaces/IMidnight.sol`, Forge artifact `out/src/interfaces/IMidnight.sol/IMidnight.json`.
 *
 * @example
 * ```ts
 * import { midnightAbi } from "@morpho-org/midnight-sdk";
 *
 * console.log(midnightAbi.length);
 * ```
 */
export const midnightAbi = [
  {
    inputs: [],
    name: "AlreadyConsumed",
    type: "error",
  },
  {
    inputs: [],
    name: "BuyerGatedFromIncreasingCredit",
    type: "error",
  },
  {
    inputs: [],
    name: "CannotIncreaseDebtPostMaturity",
    type: "error",
  },
  {
    inputs: [],
    name: "CollateralParamsNotSorted",
    type: "error",
  },
  {
    inputs: [],
    name: "ConsumedAssets",
    type: "error",
  },
  {
    inputs: [],
    name: "ConsumedUnits",
    type: "error",
  },
  {
    inputs: [],
    name: "ContinuousFeeTooHigh",
    type: "error",
  },
  {
    inputs: [],
    name: "FeeNotMultipleOfFeeCbp",
    type: "error",
  },
  {
    inputs: [],
    name: "InconsistentInput",
    type: "error",
  },
  {
    inputs: [],
    name: "InvalidFeeIndex",
    type: "error",
  },
  {
    inputs: [],
    name: "InvalidMaxLif",
    type: "error",
  },
  {
    inputs: [],
    name: "InvalidTickSpacing",
    type: "error",
  },
  {
    inputs: [],
    name: "LiquidatorGatedFromLiquidating",
    type: "error",
  },
  {
    inputs: [],
    name: "LltvNotAllowed",
    type: "error",
  },
  {
    inputs: [],
    name: "MakerCreditOrDebtIncreased",
    type: "error",
  },
  {
    inputs: [],
    name: "MarketLossFactorMaxedOut",
    type: "error",
  },
  {
    inputs: [],
    name: "MarketNotCreated",
    type: "error",
  },
  {
    inputs: [],
    name: "MaturityTooFar",
    type: "error",
  },
  {
    inputs: [],
    name: "MultipleNonZero",
    type: "error",
  },
  {
    inputs: [],
    name: "NoCollateralParams",
    type: "error",
  },
  {
    inputs: [],
    name: "NotBorrower",
    type: "error",
  },
  {
    inputs: [],
    name: "NotLiquidatable",
    type: "error",
  },
  {
    inputs: [],
    name: "OfferExpired",
    type: "error",
  },
  {
    inputs: [],
    name: "OfferNotStarted",
    type: "error",
  },
  {
    inputs: [],
    name: "OnlyFeeClaimer",
    type: "error",
  },
  {
    inputs: [],
    name: "OnlyFeeSetter",
    type: "error",
  },
  {
    inputs: [],
    name: "OnlyRoleSetter",
    type: "error",
  },
  {
    inputs: [],
    name: "OnlyTickSpacingSetter",
    type: "error",
  },
  {
    inputs: [],
    name: "RatifierFail",
    type: "error",
  },
  {
    inputs: [],
    name: "RatifierUnauthorized",
    type: "error",
  },
  {
    inputs: [],
    name: "RecoveryCloseFactorConditionsViolated",
    type: "error",
  },
  {
    inputs: [],
    name: "SelfTake",
    type: "error",
  },
  {
    inputs: [],
    name: "SellerGatedFromIncreasingDebt",
    type: "error",
  },
  {
    inputs: [],
    name: "SellerIsLiquidatable",
    type: "error",
  },
  {
    inputs: [],
    name: "SettlementFeeTooHigh",
    type: "error",
  },
  {
    inputs: [],
    name: "TakerUnauthorized",
    type: "error",
  },
  {
    inputs: [],
    name: "TickNotAccessible",
    type: "error",
  },
  {
    inputs: [],
    name: "TooManyActivatedCollaterals",
    type: "error",
  },
  {
    inputs: [],
    name: "TooManyCollateralParams",
    type: "error",
  },
  {
    inputs: [],
    name: "Unauthorized",
    type: "error",
  },
  {
    inputs: [],
    name: "UnhealthyBorrower",
    type: "error",
  },
  {
    inputs: [],
    name: "WrongBuyCallbackReturnValue",
    type: "error",
  },
  {
    inputs: [],
    name: "WrongFlashLoanCallbackReturnValue",
    type: "error",
  },
  {
    inputs: [],
    name: "WrongLiquidateCallbackReturnValue",
    type: "error",
  },
  {
    inputs: [],
    name: "WrongRepayCallbackReturnValue",
    type: "error",
  },
  {
    inputs: [],
    name: "WrongSellCallbackReturnValue",
    type: "error",
  },
  {
    inputs: [],
    name: "INITIAL_CHAIN_ID",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        components: [
          {
            internalType: "address",
            name: "loanToken",
            type: "address",
          },
          {
            components: [
              {
                internalType: "address",
                name: "token",
                type: "address",
              },
              {
                internalType: "uint256",
                name: "lltv",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "maxLif",
                type: "uint256",
              },
              {
                internalType: "address",
                name: "oracle",
                type: "address",
              },
            ],
            internalType: "struct CollateralParams[]",
            name: "collateralParams",
            type: "tuple[]",
          },
          {
            internalType: "uint256",
            name: "maturity",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "rcfThreshold",
            type: "uint256",
          },
          {
            internalType: "address",
            name: "enterGate",
            type: "address",
          },
          {
            internalType: "address",
            name: "liquidatorGate",
            type: "address",
          },
        ],
        internalType: "struct Market",
        name: "market",
        type: "tuple",
      },
      {
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
      {
        internalType: "address",
        name: "receiver",
        type: "address",
      },
    ],
    name: "claimContinuousFee",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "token",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
      {
        internalType: "address",
        name: "receiver",
        type: "address",
      },
    ],
    name: "claimSettlementFee",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "token",
        type: "address",
      },
    ],
    name: "claimableSettlementFee",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "id",
        type: "bytes32",
      },
      {
        internalType: "address",
        name: "user",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "index",
        type: "uint256",
      },
    ],
    name: "collateral",
    outputs: [
      {
        internalType: "uint128",
        name: "",
        type: "uint128",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "id",
        type: "bytes32",
      },
      {
        internalType: "address",
        name: "user",
        type: "address",
      },
    ],
    name: "collateralBitmap",
    outputs: [
      {
        internalType: "uint128",
        name: "",
        type: "uint128",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "user",
        type: "address",
      },
      {
        internalType: "bytes32",
        name: "group",
        type: "bytes32",
      },
    ],
    name: "consumed",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "id",
        type: "bytes32",
      },
    ],
    name: "continuousFee",
    outputs: [
      {
        internalType: "uint32",
        name: "",
        type: "uint32",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "id",
        type: "bytes32",
      },
    ],
    name: "continuousFeeCredit",
    outputs: [
      {
        internalType: "uint128",
        name: "",
        type: "uint128",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "id",
        type: "bytes32",
      },
      {
        internalType: "address",
        name: "user",
        type: "address",
      },
    ],
    name: "creditOf",
    outputs: [
      {
        internalType: "uint128",
        name: "",
        type: "uint128",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "id",
        type: "bytes32",
      },
      {
        internalType: "address",
        name: "user",
        type: "address",
      },
    ],
    name: "debtOf",
    outputs: [
      {
        internalType: "uint128",
        name: "",
        type: "uint128",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "loanToken",
        type: "address",
      },
    ],
    name: "defaultContinuousFee",
    outputs: [
      {
        internalType: "uint32",
        name: "",
        type: "uint32",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "loanToken",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "index",
        type: "uint256",
      },
    ],
    name: "defaultSettlementFeeCbp",
    outputs: [
      {
        internalType: "uint16",
        name: "",
        type: "uint16",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "feeClaimer",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "feeSetter",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address[]",
        name: "tokens",
        type: "address[]",
      },
      {
        internalType: "uint256[]",
        name: "assets",
        type: "uint256[]",
      },
      {
        internalType: "address",
        name: "callback",
        type: "address",
      },
      {
        internalType: "bytes",
        name: "data",
        type: "bytes",
      },
    ],
    name: "flashLoan",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "authorizer",
        type: "address",
      },
      {
        internalType: "address",
        name: "authorized",
        type: "address",
      },
    ],
    name: "isAuthorized",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        components: [
          {
            internalType: "address",
            name: "loanToken",
            type: "address",
          },
          {
            components: [
              {
                internalType: "address",
                name: "token",
                type: "address",
              },
              {
                internalType: "uint256",
                name: "lltv",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "maxLif",
                type: "uint256",
              },
              {
                internalType: "address",
                name: "oracle",
                type: "address",
              },
            ],
            internalType: "struct CollateralParams[]",
            name: "collateralParams",
            type: "tuple[]",
          },
          {
            internalType: "uint256",
            name: "maturity",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "rcfThreshold",
            type: "uint256",
          },
          {
            internalType: "address",
            name: "enterGate",
            type: "address",
          },
          {
            internalType: "address",
            name: "liquidatorGate",
            type: "address",
          },
        ],
        internalType: "struct Market",
        name: "market",
        type: "tuple",
      },
      {
        internalType: "bytes32",
        name: "id",
        type: "bytes32",
      },
      {
        internalType: "address",
        name: "borrower",
        type: "address",
      },
    ],
    name: "isHealthy",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "id",
        type: "bytes32",
      },
      {
        internalType: "address",
        name: "user",
        type: "address",
      },
    ],
    name: "lastAccrual",
    outputs: [
      {
        internalType: "uint128",
        name: "",
        type: "uint128",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "id",
        type: "bytes32",
      },
      {
        internalType: "address",
        name: "user",
        type: "address",
      },
    ],
    name: "lastLossFactor",
    outputs: [
      {
        internalType: "uint128",
        name: "",
        type: "uint128",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        components: [
          {
            internalType: "address",
            name: "loanToken",
            type: "address",
          },
          {
            components: [
              {
                internalType: "address",
                name: "token",
                type: "address",
              },
              {
                internalType: "uint256",
                name: "lltv",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "maxLif",
                type: "uint256",
              },
              {
                internalType: "address",
                name: "oracle",
                type: "address",
              },
            ],
            internalType: "struct CollateralParams[]",
            name: "collateralParams",
            type: "tuple[]",
          },
          {
            internalType: "uint256",
            name: "maturity",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "rcfThreshold",
            type: "uint256",
          },
          {
            internalType: "address",
            name: "enterGate",
            type: "address",
          },
          {
            internalType: "address",
            name: "liquidatorGate",
            type: "address",
          },
        ],
        internalType: "struct Market",
        name: "market",
        type: "tuple",
      },
      {
        internalType: "uint256",
        name: "collateralIndex",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "seizedAssets",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "repaidUnits",
        type: "uint256",
      },
      {
        internalType: "address",
        name: "borrower",
        type: "address",
      },
      {
        internalType: "bool",
        name: "postMaturityMode",
        type: "bool",
      },
      {
        internalType: "address",
        name: "receiver",
        type: "address",
      },
      {
        internalType: "address",
        name: "callback",
        type: "address",
      },
      {
        internalType: "bytes",
        name: "data",
        type: "bytes",
      },
    ],
    name: "liquidate",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "id",
        type: "bytes32",
      },
      {
        internalType: "address",
        name: "user",
        type: "address",
      },
    ],
    name: "liquidationLocked",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "id",
        type: "bytes32",
      },
    ],
    name: "lossFactor",
    outputs: [
      {
        internalType: "uint128",
        name: "",
        type: "uint128",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "id",
        type: "bytes32",
      },
    ],
    name: "marketState",
    outputs: [
      {
        internalType: "uint128",
        name: "totalUnits",
        type: "uint128",
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
      {
        internalType: "uint128",
        name: "continuousFeeCredit",
        type: "uint128",
      },
      {
        internalType: "uint16",
        name: "settlementFeeCbp0",
        type: "uint16",
      },
      {
        internalType: "uint16",
        name: "settlementFeeCbp1",
        type: "uint16",
      },
      {
        internalType: "uint16",
        name: "settlementFeeCbp2",
        type: "uint16",
      },
      {
        internalType: "uint16",
        name: "settlementFeeCbp3",
        type: "uint16",
      },
      {
        internalType: "uint16",
        name: "settlementFeeCbp4",
        type: "uint16",
      },
      {
        internalType: "uint16",
        name: "settlementFeeCbp5",
        type: "uint16",
      },
      {
        internalType: "uint16",
        name: "settlementFeeCbp6",
        type: "uint16",
      },
      {
        internalType: "uint32",
        name: "continuousFee",
        type: "uint32",
      },
      {
        internalType: "uint8",
        name: "tickSpacing",
        type: "uint8",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes[]",
        name: "calls",
        type: "bytes[]",
      },
    ],
    name: "multicall",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "id",
        type: "bytes32",
      },
      {
        internalType: "address",
        name: "user",
        type: "address",
      },
    ],
    name: "pendingFee",
    outputs: [
      {
        internalType: "uint128",
        name: "",
        type: "uint128",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "id",
        type: "bytes32",
      },
      {
        internalType: "address",
        name: "user",
        type: "address",
      },
    ],
    name: "position",
    outputs: [
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
      {
        internalType: "uint128",
        name: "debt",
        type: "uint128",
      },
      {
        internalType: "uint128",
        name: "collateralBitmap",
        type: "uint128",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        components: [
          {
            internalType: "address",
            name: "loanToken",
            type: "address",
          },
          {
            components: [
              {
                internalType: "address",
                name: "token",
                type: "address",
              },
              {
                internalType: "uint256",
                name: "lltv",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "maxLif",
                type: "uint256",
              },
              {
                internalType: "address",
                name: "oracle",
                type: "address",
              },
            ],
            internalType: "struct CollateralParams[]",
            name: "collateralParams",
            type: "tuple[]",
          },
          {
            internalType: "uint256",
            name: "maturity",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "rcfThreshold",
            type: "uint256",
          },
          {
            internalType: "address",
            name: "enterGate",
            type: "address",
          },
          {
            internalType: "address",
            name: "liquidatorGate",
            type: "address",
          },
        ],
        internalType: "struct Market",
        name: "market",
        type: "tuple",
      },
      {
        internalType: "uint256",
        name: "units",
        type: "uint256",
      },
      {
        internalType: "address",
        name: "onBehalf",
        type: "address",
      },
      {
        internalType: "address",
        name: "callback",
        type: "address",
      },
      {
        internalType: "bytes",
        name: "data",
        type: "bytes",
      },
    ],
    name: "repay",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "roleSetter",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "group",
        type: "bytes32",
      },
      {
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
      {
        internalType: "address",
        name: "onBehalf",
        type: "address",
      },
    ],
    name: "setConsumed",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "loanToken",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "newContinuousFee",
        type: "uint256",
      },
    ],
    name: "setDefaultContinuousFee",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "loanToken",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "index",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "newSettlementFee",
        type: "uint256",
      },
    ],
    name: "setDefaultSettlementFee",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "newFeeClaimer",
        type: "address",
      },
    ],
    name: "setFeeClaimer",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "newFeeSetter",
        type: "address",
      },
    ],
    name: "setFeeSetter",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "authorized",
        type: "address",
      },
      {
        internalType: "bool",
        name: "newIsAuthorized",
        type: "bool",
      },
      {
        internalType: "address",
        name: "onBehalf",
        type: "address",
      },
    ],
    name: "setIsAuthorized",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "id",
        type: "bytes32",
      },
      {
        internalType: "uint256",
        name: "newContinuousFee",
        type: "uint256",
      },
    ],
    name: "setMarketContinuousFee",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "id",
        type: "bytes32",
      },
      {
        internalType: "uint256",
        name: "index",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "newSettlementFee",
        type: "uint256",
      },
    ],
    name: "setMarketSettlementFee",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "id",
        type: "bytes32",
      },
      {
        internalType: "uint256",
        name: "newTickSpacing",
        type: "uint256",
      },
    ],
    name: "setMarketTickSpacing",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "newRoleSetter",
        type: "address",
      },
    ],
    name: "setRoleSetter",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "newTickSpacingSetter",
        type: "address",
      },
    ],
    name: "setTickSpacingSetter",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "id",
        type: "bytes32",
      },
      {
        internalType: "uint256",
        name: "timeToMaturity",
        type: "uint256",
      },
    ],
    name: "settlementFee",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "id",
        type: "bytes32",
      },
    ],
    name: "settlementFeeCbps",
    outputs: [
      {
        internalType: "uint16[7]",
        name: "",
        type: "uint16[7]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        components: [
          {
            internalType: "address",
            name: "loanToken",
            type: "address",
          },
          {
            components: [
              {
                internalType: "address",
                name: "token",
                type: "address",
              },
              {
                internalType: "uint256",
                name: "lltv",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "maxLif",
                type: "uint256",
              },
              {
                internalType: "address",
                name: "oracle",
                type: "address",
              },
            ],
            internalType: "struct CollateralParams[]",
            name: "collateralParams",
            type: "tuple[]",
          },
          {
            internalType: "uint256",
            name: "maturity",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "rcfThreshold",
            type: "uint256",
          },
          {
            internalType: "address",
            name: "enterGate",
            type: "address",
          },
          {
            internalType: "address",
            name: "liquidatorGate",
            type: "address",
          },
        ],
        internalType: "struct Market",
        name: "market",
        type: "tuple",
      },
      {
        internalType: "uint256",
        name: "collateralIndex",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "assets",
        type: "uint256",
      },
      {
        internalType: "address",
        name: "onBehalf",
        type: "address",
      },
    ],
    name: "supplyCollateral",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
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
                components: [
                  {
                    internalType: "address",
                    name: "token",
                    type: "address",
                  },
                  {
                    internalType: "uint256",
                    name: "lltv",
                    type: "uint256",
                  },
                  {
                    internalType: "uint256",
                    name: "maxLif",
                    type: "uint256",
                  },
                  {
                    internalType: "address",
                    name: "oracle",
                    type: "address",
                  },
                ],
                internalType: "struct CollateralParams[]",
                name: "collateralParams",
                type: "tuple[]",
              },
              {
                internalType: "uint256",
                name: "maturity",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "rcfThreshold",
                type: "uint256",
              },
              {
                internalType: "address",
                name: "enterGate",
                type: "address",
              },
              {
                internalType: "address",
                name: "liquidatorGate",
                type: "address",
              },
            ],
            internalType: "struct Market",
            name: "market",
            type: "tuple",
          },
          {
            internalType: "bool",
            name: "buy",
            type: "bool",
          },
          {
            internalType: "address",
            name: "maker",
            type: "address",
          },
          {
            internalType: "uint256",
            name: "start",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "expiry",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "tick",
            type: "uint256",
          },
          {
            internalType: "bytes32",
            name: "group",
            type: "bytes32",
          },
          {
            internalType: "address",
            name: "callback",
            type: "address",
          },
          {
            internalType: "bytes",
            name: "callbackData",
            type: "bytes",
          },
          {
            internalType: "address",
            name: "receiverIfMakerIsSeller",
            type: "address",
          },
          {
            internalType: "address",
            name: "ratifier",
            type: "address",
          },
          {
            internalType: "bool",
            name: "reduceOnly",
            type: "bool",
          },
          {
            internalType: "uint256",
            name: "maxUnits",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "maxAssets",
            type: "uint256",
          },
        ],
        internalType: "struct Offer",
        name: "offer",
        type: "tuple",
      },
      {
        internalType: "bytes",
        name: "ratifierData",
        type: "bytes",
      },
      {
        internalType: "uint256",
        name: "units",
        type: "uint256",
      },
      {
        internalType: "address",
        name: "taker",
        type: "address",
      },
      {
        internalType: "address",
        name: "receiverIfTakerIsSeller",
        type: "address",
      },
      {
        internalType: "address",
        name: "takerCallback",
        type: "address",
      },
      {
        internalType: "bytes",
        name: "takerCallbackData",
        type: "bytes",
      },
    ],
    name: "take",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "id",
        type: "bytes32",
      },
    ],
    name: "tickSpacing",
    outputs: [
      {
        internalType: "uint8",
        name: "",
        type: "uint8",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "tickSpacingSetter",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        components: [
          {
            internalType: "address",
            name: "loanToken",
            type: "address",
          },
          {
            components: [
              {
                internalType: "address",
                name: "token",
                type: "address",
              },
              {
                internalType: "uint256",
                name: "lltv",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "maxLif",
                type: "uint256",
              },
              {
                internalType: "address",
                name: "oracle",
                type: "address",
              },
            ],
            internalType: "struct CollateralParams[]",
            name: "collateralParams",
            type: "tuple[]",
          },
          {
            internalType: "uint256",
            name: "maturity",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "rcfThreshold",
            type: "uint256",
          },
          {
            internalType: "address",
            name: "enterGate",
            type: "address",
          },
          {
            internalType: "address",
            name: "liquidatorGate",
            type: "address",
          },
        ],
        internalType: "struct Market",
        name: "market",
        type: "tuple",
      },
    ],
    name: "toId",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "id",
        type: "bytes32",
      },
    ],
    name: "toMarket",
    outputs: [
      {
        components: [
          {
            internalType: "address",
            name: "loanToken",
            type: "address",
          },
          {
            components: [
              {
                internalType: "address",
                name: "token",
                type: "address",
              },
              {
                internalType: "uint256",
                name: "lltv",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "maxLif",
                type: "uint256",
              },
              {
                internalType: "address",
                name: "oracle",
                type: "address",
              },
            ],
            internalType: "struct CollateralParams[]",
            name: "collateralParams",
            type: "tuple[]",
          },
          {
            internalType: "uint256",
            name: "maturity",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "rcfThreshold",
            type: "uint256",
          },
          {
            internalType: "address",
            name: "enterGate",
            type: "address",
          },
          {
            internalType: "address",
            name: "liquidatorGate",
            type: "address",
          },
        ],
        internalType: "struct Market",
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "id",
        type: "bytes32",
      },
    ],
    name: "totalUnits",
    outputs: [
      {
        internalType: "uint128",
        name: "",
        type: "uint128",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        components: [
          {
            internalType: "address",
            name: "loanToken",
            type: "address",
          },
          {
            components: [
              {
                internalType: "address",
                name: "token",
                type: "address",
              },
              {
                internalType: "uint256",
                name: "lltv",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "maxLif",
                type: "uint256",
              },
              {
                internalType: "address",
                name: "oracle",
                type: "address",
              },
            ],
            internalType: "struct CollateralParams[]",
            name: "collateralParams",
            type: "tuple[]",
          },
          {
            internalType: "uint256",
            name: "maturity",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "rcfThreshold",
            type: "uint256",
          },
          {
            internalType: "address",
            name: "enterGate",
            type: "address",
          },
          {
            internalType: "address",
            name: "liquidatorGate",
            type: "address",
          },
        ],
        internalType: "struct Market",
        name: "market",
        type: "tuple",
      },
    ],
    name: "touchMarket",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        components: [
          {
            internalType: "address",
            name: "loanToken",
            type: "address",
          },
          {
            components: [
              {
                internalType: "address",
                name: "token",
                type: "address",
              },
              {
                internalType: "uint256",
                name: "lltv",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "maxLif",
                type: "uint256",
              },
              {
                internalType: "address",
                name: "oracle",
                type: "address",
              },
            ],
            internalType: "struct CollateralParams[]",
            name: "collateralParams",
            type: "tuple[]",
          },
          {
            internalType: "uint256",
            name: "maturity",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "rcfThreshold",
            type: "uint256",
          },
          {
            internalType: "address",
            name: "enterGate",
            type: "address",
          },
          {
            internalType: "address",
            name: "liquidatorGate",
            type: "address",
          },
        ],
        internalType: "struct Market",
        name: "market",
        type: "tuple",
      },
      {
        internalType: "address",
        name: "user",
        type: "address",
      },
    ],
    name: "updatePosition",
    outputs: [
      {
        internalType: "uint128",
        name: "",
        type: "uint128",
      },
      {
        internalType: "uint128",
        name: "",
        type: "uint128",
      },
      {
        internalType: "uint128",
        name: "",
        type: "uint128",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        components: [
          {
            internalType: "address",
            name: "loanToken",
            type: "address",
          },
          {
            components: [
              {
                internalType: "address",
                name: "token",
                type: "address",
              },
              {
                internalType: "uint256",
                name: "lltv",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "maxLif",
                type: "uint256",
              },
              {
                internalType: "address",
                name: "oracle",
                type: "address",
              },
            ],
            internalType: "struct CollateralParams[]",
            name: "collateralParams",
            type: "tuple[]",
          },
          {
            internalType: "uint256",
            name: "maturity",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "rcfThreshold",
            type: "uint256",
          },
          {
            internalType: "address",
            name: "enterGate",
            type: "address",
          },
          {
            internalType: "address",
            name: "liquidatorGate",
            type: "address",
          },
        ],
        internalType: "struct Market",
        name: "market",
        type: "tuple",
      },
      {
        internalType: "bytes32",
        name: "id",
        type: "bytes32",
      },
      {
        internalType: "address",
        name: "user",
        type: "address",
      },
    ],
    name: "updatePositionView",
    outputs: [
      {
        internalType: "uint128",
        name: "",
        type: "uint128",
      },
      {
        internalType: "uint128",
        name: "",
        type: "uint128",
      },
      {
        internalType: "uint128",
        name: "",
        type: "uint128",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        components: [
          {
            internalType: "address",
            name: "loanToken",
            type: "address",
          },
          {
            components: [
              {
                internalType: "address",
                name: "token",
                type: "address",
              },
              {
                internalType: "uint256",
                name: "lltv",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "maxLif",
                type: "uint256",
              },
              {
                internalType: "address",
                name: "oracle",
                type: "address",
              },
            ],
            internalType: "struct CollateralParams[]",
            name: "collateralParams",
            type: "tuple[]",
          },
          {
            internalType: "uint256",
            name: "maturity",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "rcfThreshold",
            type: "uint256",
          },
          {
            internalType: "address",
            name: "enterGate",
            type: "address",
          },
          {
            internalType: "address",
            name: "liquidatorGate",
            type: "address",
          },
        ],
        internalType: "struct Market",
        name: "market",
        type: "tuple",
      },
      {
        internalType: "uint256",
        name: "units",
        type: "uint256",
      },
      {
        internalType: "address",
        name: "onBehalf",
        type: "address",
      },
      {
        internalType: "address",
        name: "receiver",
        type: "address",
      },
    ],
    name: "withdraw",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        components: [
          {
            internalType: "address",
            name: "loanToken",
            type: "address",
          },
          {
            components: [
              {
                internalType: "address",
                name: "token",
                type: "address",
              },
              {
                internalType: "uint256",
                name: "lltv",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "maxLif",
                type: "uint256",
              },
              {
                internalType: "address",
                name: "oracle",
                type: "address",
              },
            ],
            internalType: "struct CollateralParams[]",
            name: "collateralParams",
            type: "tuple[]",
          },
          {
            internalType: "uint256",
            name: "maturity",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "rcfThreshold",
            type: "uint256",
          },
          {
            internalType: "address",
            name: "enterGate",
            type: "address",
          },
          {
            internalType: "address",
            name: "liquidatorGate",
            type: "address",
          },
        ],
        internalType: "struct Market",
        name: "market",
        type: "tuple",
      },
      {
        internalType: "uint256",
        name: "collateralIndex",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "assets",
        type: "uint256",
      },
      {
        internalType: "address",
        name: "onBehalf",
        type: "address",
      },
      {
        internalType: "address",
        name: "receiver",
        type: "address",
      },
    ],
    name: "withdrawCollateral",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "id",
        type: "bytes32",
      },
    ],
    name: "withdrawable",
    outputs: [
      {
        internalType: "uint128",
        name: "",
        type: "uint128",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const satisfies Abi;

/**
 * Pinned ABI JSON for the MidnightBundles.
 *
 * Source: `morpho-org/midnight` commit `a7c6da7e70cb216982f6c5d20b46f40b943e67e4`,
 * `src/periphery/interfaces/IMidnightBundles.sol`, Forge artifact `out/src/periphery/interfaces/IMidnightBundles.sol/IMidnightBundles.json`.
 *
 * @example
 * ```ts
 * import { midnightBundlesAbi } from "@morpho-org/midnight-sdk";
 *
 * console.log(midnightBundlesAbi.length);
 * ```
 */
export const midnightBundlesAbi = [
  {
    inputs: [],
    name: "ApproveReturnedFalse",
    type: "error",
  },
  {
    inputs: [],
    name: "InconsistentMarket",
    type: "error",
  },
  {
    inputs: [],
    name: "InconsistentSide",
    type: "error",
  },
  {
    inputs: [],
    name: "OutOfOffers",
    type: "error",
  },
  {
    inputs: [],
    name: "PctExceeded",
    type: "error",
  },
  {
    inputs: [],
    name: "SellerAssetsTooLow",
    type: "error",
  },
  {
    inputs: [],
    name: "Unauthorized",
    type: "error",
  },
  {
    inputs: [],
    name: "UnitsTooHigh",
    type: "error",
  },
  {
    inputs: [],
    name: "UnitsTooLow",
    type: "error",
  },
  {
    inputs: [],
    name: "MIDNIGHT",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "PERMIT2",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "targetBuyerAssets",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "minUnits",
        type: "uint256",
      },
      {
        internalType: "address",
        name: "taker",
        type: "address",
      },
      {
        components: [
          {
            internalType: "enum PermitKind",
            name: "kind",
            type: "uint8",
          },
          {
            internalType: "bytes",
            name: "data",
            type: "bytes",
          },
        ],
        internalType: "struct TokenPermit",
        name: "loanTokenPermit",
        type: "tuple",
      },
      {
        components: [
          {
            internalType: "uint256",
            name: "units",
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
                    components: [
                      {
                        internalType: "address",
                        name: "token",
                        type: "address",
                      },
                      {
                        internalType: "uint256",
                        name: "lltv",
                        type: "uint256",
                      },
                      {
                        internalType: "uint256",
                        name: "maxLif",
                        type: "uint256",
                      },
                      {
                        internalType: "address",
                        name: "oracle",
                        type: "address",
                      },
                    ],
                    internalType: "struct CollateralParams[]",
                    name: "collateralParams",
                    type: "tuple[]",
                  },
                  {
                    internalType: "uint256",
                    name: "maturity",
                    type: "uint256",
                  },
                  {
                    internalType: "uint256",
                    name: "rcfThreshold",
                    type: "uint256",
                  },
                  {
                    internalType: "address",
                    name: "enterGate",
                    type: "address",
                  },
                  {
                    internalType: "address",
                    name: "liquidatorGate",
                    type: "address",
                  },
                ],
                internalType: "struct Market",
                name: "market",
                type: "tuple",
              },
              {
                internalType: "bool",
                name: "buy",
                type: "bool",
              },
              {
                internalType: "address",
                name: "maker",
                type: "address",
              },
              {
                internalType: "uint256",
                name: "start",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "expiry",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "tick",
                type: "uint256",
              },
              {
                internalType: "bytes32",
                name: "group",
                type: "bytes32",
              },
              {
                internalType: "address",
                name: "callback",
                type: "address",
              },
              {
                internalType: "bytes",
                name: "callbackData",
                type: "bytes",
              },
              {
                internalType: "address",
                name: "receiverIfMakerIsSeller",
                type: "address",
              },
              {
                internalType: "address",
                name: "ratifier",
                type: "address",
              },
              {
                internalType: "bool",
                name: "reduceOnly",
                type: "bool",
              },
              {
                internalType: "uint256",
                name: "maxUnits",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "maxAssets",
                type: "uint256",
              },
            ],
            internalType: "struct Offer",
            name: "offer",
            type: "tuple",
          },
          {
            internalType: "bytes",
            name: "ratifierData",
            type: "bytes",
          },
        ],
        internalType: "struct Take[]",
        name: "takes",
        type: "tuple[]",
      },
      {
        components: [
          {
            internalType: "uint256",
            name: "collateralIndex",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "assets",
            type: "uint256",
          },
        ],
        internalType: "struct CollateralWithdrawal[]",
        name: "collateralWithdrawals",
        type: "tuple[]",
      },
      {
        internalType: "address",
        name: "collateralReceiver",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "referralFeePct",
        type: "uint256",
      },
      {
        internalType: "address",
        name: "referralFeeRecipient",
        type: "address",
      },
    ],
    name: "buyWithAssetsTargetAndWithdrawCollateral",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "targetUnits",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "maxBuyerAssets",
        type: "uint256",
      },
      {
        internalType: "address",
        name: "taker",
        type: "address",
      },
      {
        components: [
          {
            internalType: "enum PermitKind",
            name: "kind",
            type: "uint8",
          },
          {
            internalType: "bytes",
            name: "data",
            type: "bytes",
          },
        ],
        internalType: "struct TokenPermit",
        name: "loanTokenPermit",
        type: "tuple",
      },
      {
        components: [
          {
            internalType: "uint256",
            name: "units",
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
                    components: [
                      {
                        internalType: "address",
                        name: "token",
                        type: "address",
                      },
                      {
                        internalType: "uint256",
                        name: "lltv",
                        type: "uint256",
                      },
                      {
                        internalType: "uint256",
                        name: "maxLif",
                        type: "uint256",
                      },
                      {
                        internalType: "address",
                        name: "oracle",
                        type: "address",
                      },
                    ],
                    internalType: "struct CollateralParams[]",
                    name: "collateralParams",
                    type: "tuple[]",
                  },
                  {
                    internalType: "uint256",
                    name: "maturity",
                    type: "uint256",
                  },
                  {
                    internalType: "uint256",
                    name: "rcfThreshold",
                    type: "uint256",
                  },
                  {
                    internalType: "address",
                    name: "enterGate",
                    type: "address",
                  },
                  {
                    internalType: "address",
                    name: "liquidatorGate",
                    type: "address",
                  },
                ],
                internalType: "struct Market",
                name: "market",
                type: "tuple",
              },
              {
                internalType: "bool",
                name: "buy",
                type: "bool",
              },
              {
                internalType: "address",
                name: "maker",
                type: "address",
              },
              {
                internalType: "uint256",
                name: "start",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "expiry",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "tick",
                type: "uint256",
              },
              {
                internalType: "bytes32",
                name: "group",
                type: "bytes32",
              },
              {
                internalType: "address",
                name: "callback",
                type: "address",
              },
              {
                internalType: "bytes",
                name: "callbackData",
                type: "bytes",
              },
              {
                internalType: "address",
                name: "receiverIfMakerIsSeller",
                type: "address",
              },
              {
                internalType: "address",
                name: "ratifier",
                type: "address",
              },
              {
                internalType: "bool",
                name: "reduceOnly",
                type: "bool",
              },
              {
                internalType: "uint256",
                name: "maxUnits",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "maxAssets",
                type: "uint256",
              },
            ],
            internalType: "struct Offer",
            name: "offer",
            type: "tuple",
          },
          {
            internalType: "bytes",
            name: "ratifierData",
            type: "bytes",
          },
        ],
        internalType: "struct Take[]",
        name: "takes",
        type: "tuple[]",
      },
      {
        components: [
          {
            internalType: "uint256",
            name: "collateralIndex",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "assets",
            type: "uint256",
          },
        ],
        internalType: "struct CollateralWithdrawal[]",
        name: "collateralWithdrawals",
        type: "tuple[]",
      },
      {
        internalType: "address",
        name: "collateralReceiver",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "referralFeePct",
        type: "uint256",
      },
      {
        internalType: "address",
        name: "referralFeeRecipient",
        type: "address",
      },
    ],
    name: "buyWithUnitsTargetAndWithdrawCollateral",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        components: [
          {
            internalType: "address",
            name: "loanToken",
            type: "address",
          },
          {
            components: [
              {
                internalType: "address",
                name: "token",
                type: "address",
              },
              {
                internalType: "uint256",
                name: "lltv",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "maxLif",
                type: "uint256",
              },
              {
                internalType: "address",
                name: "oracle",
                type: "address",
              },
            ],
            internalType: "struct CollateralParams[]",
            name: "collateralParams",
            type: "tuple[]",
          },
          {
            internalType: "uint256",
            name: "maturity",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "rcfThreshold",
            type: "uint256",
          },
          {
            internalType: "address",
            name: "enterGate",
            type: "address",
          },
          {
            internalType: "address",
            name: "liquidatorGate",
            type: "address",
          },
        ],
        internalType: "struct Market",
        name: "market",
        type: "tuple",
      },
      {
        internalType: "uint256",
        name: "assets",
        type: "uint256",
      },
      {
        internalType: "address",
        name: "onBehalf",
        type: "address",
      },
      {
        components: [
          {
            internalType: "enum PermitKind",
            name: "kind",
            type: "uint8",
          },
          {
            internalType: "bytes",
            name: "data",
            type: "bytes",
          },
        ],
        internalType: "struct TokenPermit",
        name: "loanTokenPermit",
        type: "tuple",
      },
      {
        components: [
          {
            internalType: "uint256",
            name: "collateralIndex",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "assets",
            type: "uint256",
          },
        ],
        internalType: "struct CollateralWithdrawal[]",
        name: "collateralWithdrawals",
        type: "tuple[]",
      },
      {
        internalType: "address",
        name: "collateralReceiver",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "referralFeePct",
        type: "uint256",
      },
      {
        internalType: "address",
        name: "referralFeeRecipient",
        type: "address",
      },
    ],
    name: "repayAndWithdrawCollateral",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "targetSellerAssets",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "maxUnits",
        type: "uint256",
      },
      {
        internalType: "address",
        name: "taker",
        type: "address",
      },
      {
        internalType: "address",
        name: "receiverIfTakerIsSeller",
        type: "address",
      },
      {
        components: [
          {
            internalType: "uint256",
            name: "collateralIndex",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "assets",
            type: "uint256",
          },
          {
            components: [
              {
                internalType: "enum PermitKind",
                name: "kind",
                type: "uint8",
              },
              {
                internalType: "bytes",
                name: "data",
                type: "bytes",
              },
            ],
            internalType: "struct TokenPermit",
            name: "permit",
            type: "tuple",
          },
        ],
        internalType: "struct CollateralSupply[]",
        name: "collateralSupplies",
        type: "tuple[]",
      },
      {
        components: [
          {
            internalType: "uint256",
            name: "units",
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
                    components: [
                      {
                        internalType: "address",
                        name: "token",
                        type: "address",
                      },
                      {
                        internalType: "uint256",
                        name: "lltv",
                        type: "uint256",
                      },
                      {
                        internalType: "uint256",
                        name: "maxLif",
                        type: "uint256",
                      },
                      {
                        internalType: "address",
                        name: "oracle",
                        type: "address",
                      },
                    ],
                    internalType: "struct CollateralParams[]",
                    name: "collateralParams",
                    type: "tuple[]",
                  },
                  {
                    internalType: "uint256",
                    name: "maturity",
                    type: "uint256",
                  },
                  {
                    internalType: "uint256",
                    name: "rcfThreshold",
                    type: "uint256",
                  },
                  {
                    internalType: "address",
                    name: "enterGate",
                    type: "address",
                  },
                  {
                    internalType: "address",
                    name: "liquidatorGate",
                    type: "address",
                  },
                ],
                internalType: "struct Market",
                name: "market",
                type: "tuple",
              },
              {
                internalType: "bool",
                name: "buy",
                type: "bool",
              },
              {
                internalType: "address",
                name: "maker",
                type: "address",
              },
              {
                internalType: "uint256",
                name: "start",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "expiry",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "tick",
                type: "uint256",
              },
              {
                internalType: "bytes32",
                name: "group",
                type: "bytes32",
              },
              {
                internalType: "address",
                name: "callback",
                type: "address",
              },
              {
                internalType: "bytes",
                name: "callbackData",
                type: "bytes",
              },
              {
                internalType: "address",
                name: "receiverIfMakerIsSeller",
                type: "address",
              },
              {
                internalType: "address",
                name: "ratifier",
                type: "address",
              },
              {
                internalType: "bool",
                name: "reduceOnly",
                type: "bool",
              },
              {
                internalType: "uint256",
                name: "maxUnits",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "maxAssets",
                type: "uint256",
              },
            ],
            internalType: "struct Offer",
            name: "offer",
            type: "tuple",
          },
          {
            internalType: "bytes",
            name: "ratifierData",
            type: "bytes",
          },
        ],
        internalType: "struct Take[]",
        name: "takes",
        type: "tuple[]",
      },
      {
        internalType: "uint256",
        name: "referralFeePct",
        type: "uint256",
      },
      {
        internalType: "address",
        name: "referralFeeRecipient",
        type: "address",
      },
    ],
    name: "supplyCollateralAndSellWithAssetsTarget",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "targetUnits",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "minSellerAssets",
        type: "uint256",
      },
      {
        internalType: "address",
        name: "taker",
        type: "address",
      },
      {
        internalType: "address",
        name: "receiverIfTakerIsSeller",
        type: "address",
      },
      {
        components: [
          {
            internalType: "uint256",
            name: "collateralIndex",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "assets",
            type: "uint256",
          },
          {
            components: [
              {
                internalType: "enum PermitKind",
                name: "kind",
                type: "uint8",
              },
              {
                internalType: "bytes",
                name: "data",
                type: "bytes",
              },
            ],
            internalType: "struct TokenPermit",
            name: "permit",
            type: "tuple",
          },
        ],
        internalType: "struct CollateralSupply[]",
        name: "collateralSupplies",
        type: "tuple[]",
      },
      {
        components: [
          {
            internalType: "uint256",
            name: "units",
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
                    components: [
                      {
                        internalType: "address",
                        name: "token",
                        type: "address",
                      },
                      {
                        internalType: "uint256",
                        name: "lltv",
                        type: "uint256",
                      },
                      {
                        internalType: "uint256",
                        name: "maxLif",
                        type: "uint256",
                      },
                      {
                        internalType: "address",
                        name: "oracle",
                        type: "address",
                      },
                    ],
                    internalType: "struct CollateralParams[]",
                    name: "collateralParams",
                    type: "tuple[]",
                  },
                  {
                    internalType: "uint256",
                    name: "maturity",
                    type: "uint256",
                  },
                  {
                    internalType: "uint256",
                    name: "rcfThreshold",
                    type: "uint256",
                  },
                  {
                    internalType: "address",
                    name: "enterGate",
                    type: "address",
                  },
                  {
                    internalType: "address",
                    name: "liquidatorGate",
                    type: "address",
                  },
                ],
                internalType: "struct Market",
                name: "market",
                type: "tuple",
              },
              {
                internalType: "bool",
                name: "buy",
                type: "bool",
              },
              {
                internalType: "address",
                name: "maker",
                type: "address",
              },
              {
                internalType: "uint256",
                name: "start",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "expiry",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "tick",
                type: "uint256",
              },
              {
                internalType: "bytes32",
                name: "group",
                type: "bytes32",
              },
              {
                internalType: "address",
                name: "callback",
                type: "address",
              },
              {
                internalType: "bytes",
                name: "callbackData",
                type: "bytes",
              },
              {
                internalType: "address",
                name: "receiverIfMakerIsSeller",
                type: "address",
              },
              {
                internalType: "address",
                name: "ratifier",
                type: "address",
              },
              {
                internalType: "bool",
                name: "reduceOnly",
                type: "bool",
              },
              {
                internalType: "uint256",
                name: "maxUnits",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "maxAssets",
                type: "uint256",
              },
            ],
            internalType: "struct Offer",
            name: "offer",
            type: "tuple",
          },
          {
            internalType: "bytes",
            name: "ratifierData",
            type: "bytes",
          },
        ],
        internalType: "struct Take[]",
        name: "takes",
        type: "tuple[]",
      },
      {
        internalType: "uint256",
        name: "referralFeePct",
        type: "uint256",
      },
      {
        internalType: "address",
        name: "referralFeeRecipient",
        type: "address",
      },
    ],
    name: "supplyCollateralAndSellWithUnitsTarget",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const satisfies Abi;

/**
 * Pinned ABI JSON for the EcrecoverRatifier.
 *
 * Source: `morpho-org/midnight` commit `a7c6da7e70cb216982f6c5d20b46f40b943e67e4`,
 * `src/ratifiers/interfaces/IEcrecoverRatifier.sol`, Forge artifact `out/src/ratifiers/interfaces/IEcrecoverRatifier.sol/IEcrecoverRatifier.json`.
 *
 * @example
 * ```ts
 * import { ecrecoverRatifierAbi } from "@morpho-org/midnight-sdk";
 *
 * console.log(ecrecoverRatifierAbi.length);
 * ```
 */
export const ecrecoverRatifierAbi = [
  {
    inputs: [],
    name: "InvalidProof",
    type: "error",
  },
  {
    inputs: [],
    name: "InvalidSignature",
    type: "error",
  },
  {
    inputs: [],
    name: "NotMidnight",
    type: "error",
  },
  {
    inputs: [],
    name: "RootCanceled",
    type: "error",
  },
  {
    inputs: [],
    name: "Unauthorized",
    type: "error",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "caller",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "maker",
        type: "address",
      },
      {
        indexed: true,
        internalType: "bytes32",
        name: "root",
        type: "bytes32",
      },
    ],
    name: "CancelRoot",
    type: "event",
  },
  {
    inputs: [],
    name: "MIDNIGHT",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "maker",
        type: "address",
      },
      {
        internalType: "bytes32",
        name: "root",
        type: "bytes32",
      },
    ],
    name: "cancelRoot",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
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
                components: [
                  {
                    internalType: "address",
                    name: "token",
                    type: "address",
                  },
                  {
                    internalType: "uint256",
                    name: "lltv",
                    type: "uint256",
                  },
                  {
                    internalType: "uint256",
                    name: "maxLif",
                    type: "uint256",
                  },
                  {
                    internalType: "address",
                    name: "oracle",
                    type: "address",
                  },
                ],
                internalType: "struct CollateralParams[]",
                name: "collateralParams",
                type: "tuple[]",
              },
              {
                internalType: "uint256",
                name: "maturity",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "rcfThreshold",
                type: "uint256",
              },
              {
                internalType: "address",
                name: "enterGate",
                type: "address",
              },
              {
                internalType: "address",
                name: "liquidatorGate",
                type: "address",
              },
            ],
            internalType: "struct Market",
            name: "market",
            type: "tuple",
          },
          {
            internalType: "bool",
            name: "buy",
            type: "bool",
          },
          {
            internalType: "address",
            name: "maker",
            type: "address",
          },
          {
            internalType: "uint256",
            name: "start",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "expiry",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "tick",
            type: "uint256",
          },
          {
            internalType: "bytes32",
            name: "group",
            type: "bytes32",
          },
          {
            internalType: "address",
            name: "callback",
            type: "address",
          },
          {
            internalType: "bytes",
            name: "callbackData",
            type: "bytes",
          },
          {
            internalType: "address",
            name: "receiverIfMakerIsSeller",
            type: "address",
          },
          {
            internalType: "address",
            name: "ratifier",
            type: "address",
          },
          {
            internalType: "bool",
            name: "reduceOnly",
            type: "bool",
          },
          {
            internalType: "uint256",
            name: "maxUnits",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "maxAssets",
            type: "uint256",
          },
        ],
        internalType: "struct Offer",
        name: "offer",
        type: "tuple",
      },
      {
        internalType: "bytes",
        name: "ratifierData",
        type: "bytes",
      },
    ],
    name: "isRatified",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "maker",
        type: "address",
      },
      {
        internalType: "bytes32",
        name: "root",
        type: "bytes32",
      },
    ],
    name: "isRootCanceled",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const satisfies Abi;

/**
 * Pinned ABI JSON for the SetterRatifier.
 *
 * Source: `morpho-org/midnight` commit `a7c6da7e70cb216982f6c5d20b46f40b943e67e4`,
 * `src/ratifiers/interfaces/ISetterRatifier.sol`, Forge artifact `out/src/ratifiers/interfaces/ISetterRatifier.sol/ISetterRatifier.json`.
 *
 * @example
 * ```ts
 * import { setterRatifierAbi } from "@morpho-org/midnight-sdk";
 *
 * console.log(setterRatifierAbi.length);
 * ```
 */
export const setterRatifierAbi = [
  {
    inputs: [],
    name: "InvalidProof",
    type: "error",
  },
  {
    inputs: [],
    name: "NotMidnight",
    type: "error",
  },
  {
    inputs: [],
    name: "NotRatified",
    type: "error",
  },
  {
    inputs: [],
    name: "Unauthorized",
    type: "error",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "caller",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "maker",
        type: "address",
      },
      {
        indexed: true,
        internalType: "bytes32",
        name: "root",
        type: "bytes32",
      },
      {
        indexed: false,
        internalType: "bool",
        name: "newIsRootRatified",
        type: "bool",
      },
    ],
    name: "SetIsRootRatified",
    type: "event",
  },
  {
    inputs: [],
    name: "MIDNIGHT",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
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
                components: [
                  {
                    internalType: "address",
                    name: "token",
                    type: "address",
                  },
                  {
                    internalType: "uint256",
                    name: "lltv",
                    type: "uint256",
                  },
                  {
                    internalType: "uint256",
                    name: "maxLif",
                    type: "uint256",
                  },
                  {
                    internalType: "address",
                    name: "oracle",
                    type: "address",
                  },
                ],
                internalType: "struct CollateralParams[]",
                name: "collateralParams",
                type: "tuple[]",
              },
              {
                internalType: "uint256",
                name: "maturity",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "rcfThreshold",
                type: "uint256",
              },
              {
                internalType: "address",
                name: "enterGate",
                type: "address",
              },
              {
                internalType: "address",
                name: "liquidatorGate",
                type: "address",
              },
            ],
            internalType: "struct Market",
            name: "market",
            type: "tuple",
          },
          {
            internalType: "bool",
            name: "buy",
            type: "bool",
          },
          {
            internalType: "address",
            name: "maker",
            type: "address",
          },
          {
            internalType: "uint256",
            name: "start",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "expiry",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "tick",
            type: "uint256",
          },
          {
            internalType: "bytes32",
            name: "group",
            type: "bytes32",
          },
          {
            internalType: "address",
            name: "callback",
            type: "address",
          },
          {
            internalType: "bytes",
            name: "callbackData",
            type: "bytes",
          },
          {
            internalType: "address",
            name: "receiverIfMakerIsSeller",
            type: "address",
          },
          {
            internalType: "address",
            name: "ratifier",
            type: "address",
          },
          {
            internalType: "bool",
            name: "reduceOnly",
            type: "bool",
          },
          {
            internalType: "uint256",
            name: "maxUnits",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "maxAssets",
            type: "uint256",
          },
        ],
        internalType: "struct Offer",
        name: "offer",
        type: "tuple",
      },
      {
        internalType: "bytes",
        name: "ratifierData",
        type: "bytes",
      },
    ],
    name: "isRatified",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "maker",
        type: "address",
      },
      {
        internalType: "bytes32",
        name: "root",
        type: "bytes32",
      },
    ],
    name: "isRootRatified",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "maker",
        type: "address",
      },
      {
        internalType: "bytes32",
        name: "root",
        type: "bytes32",
      },
      {
        internalType: "bool",
        name: "newIsRootRatified",
        type: "bool",
      },
    ],
    name: "setIsRootRatified",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const satisfies Abi;
