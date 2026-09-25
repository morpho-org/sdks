import { MarketParams, MarketUtils } from "@morpho-org/blue-sdk";
import {
  type AuthorizationRequirementSignature,
  blueBorrow,
  blueRefinance,
  blueRepay,
  blueRepayWithdrawCollateral,
  blueSupply,
  blueSupplyCollateral,
  blueSupplyCollateralBorrow,
  blueWithdraw,
  blueWithdrawCollateral,
  type Erc2612RequirementSignature,
  type Permit2SignatureTransferRequirementSignature,
  vaultV1Deposit,
  vaultV1InKindRedeem,
  vaultV1MigrateToV2,
  vaultV1Withdraw,
  vaultV2Deposit,
  vaultV2ForceRedeem,
  vaultV2ForceWithdraw,
  vaultV2InKindRedeem,
  vaultV2Redeem,
} from "@morpho-org/morpho-sdk";
import {
  blueAbi,
  blueBundlesV1Abi,
  blueMarketParamsAbi,
  vaultV2Abi,
} from "@morpho-org/morpho-sdk/abis";
import { getChainAddresses } from "@morpho-org/morpho-sdk/addresses";
import fc from "fast-check";
import {
  type Address,
  encodeAbiParameters,
  encodeFunctionData,
  getAddress,
  type Hex,
  maxUint256,
  zeroAddress,
  zeroHash,
} from "viem";
import { describe, expect, test } from "vitest";
import {
  ProtocolBindingMismatchError,
  SimulationValidationError,
  UnsupportedChainError,
  UnsupportedOperationError,
} from "../errors.js";
import type { SimulationTransaction } from "../types.js";
import { decodeOperations, type VaultBinding } from "./operations.js";

const chainId = 1;
const owner = getAddress("0x10000000000000000000000000000000000000aa");
const addresses = getChainAddresses(chainId);
const bundles = addresses.bundles;
if (bundles?.blueBundlesV1 == null || bundles.vaultBundlesV1 == null) {
  throw new Error("test registry requires bundles addresses");
}
const blueBundlesV1 = bundles.blueBundlesV1;
const vaultBundlesV1 = bundles.vaultBundlesV1;
const wNative = addresses.wNative as Address;
const morpho = addresses.blue as Address;

const adaptiveCurveIrm = addresses.adaptiveCurveIrm as Address;

const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address;
const ORACLE = getAddress("0xd48ae1c530183bcebc59a25924f09829fbd27bb1");
const VAULT_V1 = getAddress("0x1111111111111111111111111111111111111111");
const VAULT_V2 = getAddress("0x2222222222222222222222222222222222222222");
const ADAPTER = getAddress("0x3333333333333333333333333333333333333333");
const PRELIQ = getAddress("0x4444444444444444444444444444444444444444");
const DEADLINE = 1_900_000_000n;
const ZERO_FEE = { rateWad: 0n, recipient: zeroAddress } as const;

const marketParams = {
  loanToken: USDC,
  collateralToken: wNative,
  oracle: ORACLE,
  irm: adaptiveCurveIrm,
  lltv: 860_000000000000000n,
};
const market = {
  marketId: MarketUtils.getMarketId(marketParams),
  params: marketParams,
};
const marketB = {
  ...marketParams,
  lltv: 940_000000000000000n,
};
const bindingB = {
  marketId: MarketUtils.getMarketId(marketB),
  params: marketB,
};

// Builders read `marketParams.id`, so they take MarketParams class instances while the
// decoder returns the plain InputMarketParams shape asserted in expectations.
const marketParamsClass = new MarketParams(marketParams);
const marketBClass = new MarketParams(marketB);

const vaults = [
  { address: VAULT_V1, kind: "vaultV1", asset: USDC },
  { address: VAULT_V2, kind: "vaultV2", asset: USDC },
] as const;

const signature = `0x${"11".repeat(32)}${"22".repeat(32)}1b` as Hex;

const toTx = (tx: {
  to: Address;
  data: Hex;
  value?: bigint;
}): SimulationTransaction => ({
  from: owner,
  to: tx.to,
  data: tx.data,
  value: tx.value ?? 0n,
});

const decode = (
  transactions: SimulationTransaction[],
  extra?: {
    mode?: "preview" | "final";
    vaults?: readonly VaultBinding[];
    preLiquidations?: readonly {
      address: Address;
      market: {
        marketId: ReturnType<typeof MarketUtils.getMarketId>;
        params: typeof marketParams;
      };
    }[];
    chainId?: number;
  },
) =>
  decodeOperations({
    chainId: extra?.chainId ?? chainId,
    mode: extra?.mode ?? "final",
    transactions,
    vaults: extra?.vaults ?? vaults,
    preLiquidations: extra?.preLiquidations,
  });

const base = {
  chainId,
  owner,
  callPath: [] as const,
};

describe("decodeOperations", () => {
  test("default: blueSupply with erc20 funding", () => {
    const assets = 1_000_000n;
    const tx = blueSupply({
      market: { chainId, marketParams: marketParamsClass },
      args: { userAddress: owner, assets, deadline: DEADLINE },
    });
    expect(decode([toTx(tx)])).toStrictEqual({
      owner,
      operations: [
        {
          ...base,
          transactionIndex: 0,
          type: "blueSupply",
          route: "blueBundlesV1",
          deployment: blueBundlesV1,
          market,
          onBehalf: owner,
          receiver: owner,
          assets,
          funding: { type: "erc20", token: USDC, assets },
          tokenSignature: { type: "none" },
          authorizationSignature: { type: "none" },
          deadline: DEADLINE,
          referralFee: ZERO_FEE,
        },
      ],
    });
  });

  test("behavior: blueSupply with native funding on wNative loan token", () => {
    const nativeMarket = { ...marketParams, loanToken: wNative };
    const assets = 5n * 10n ** 17n;
    const tx = blueSupply({
      market: { chainId, marketParams: new MarketParams(nativeMarket) },
      args: {
        userAddress: owner,
        assets,
        nativeAmount: assets,
        deadline: DEADLINE,
      },
    });
    const nativeMarketBinding = {
      marketId: MarketUtils.getMarketId(nativeMarket),
      params: nativeMarket,
    };
    expect(decode([toTx(tx)]).operations[0]).toStrictEqual({
      ...base,
      transactionIndex: 0,
      type: "blueSupply",
      route: "blueBundlesV1",
      deployment: blueBundlesV1,
      market: nativeMarketBinding,
      onBehalf: owner,
      receiver: owner,
      assets,
      funding: { type: "native", wrappedToken: wNative, assets },
      tokenSignature: { type: "none" },
      authorizationSignature: { type: "none" },
      deadline: DEADLINE,
      referralFee: ZERO_FEE,
    });
  });

  test("behavior: blueSupply with ERC-2612 permit signature", () => {
    const assets = 1_000_000n;
    const deadline = DEADLINE;
    const requirementSignature: Erc2612RequirementSignature = {
      args: {
        owner,
        nonce: 3n,
        asset: USDC,
        signature,
        amount: assets,
        deadline,
      },
      action: {
        type: "permit",
        args: { spender: blueBundlesV1, amount: assets, deadline },
      },
    };
    const tx = blueSupply({
      market: { chainId, marketParams: marketParamsClass },
      args: { userAddress: owner, assets, deadline, requirementSignature },
    });
    expect(decode([toTx(tx)]).operations[0]).toStrictEqual(
      expect.objectContaining({
        tokenSignature: { type: "erc2612Permit", deadline },
      }),
    );
  });

  test("behavior: blueSupply with Permit2 signature", () => {
    const assets = 1_000_000n;
    const requirementSignature: Permit2SignatureTransferRequirementSignature = {
      args: {
        owner,
        nonce: 7n,
        asset: USDC,
        signature,
        amount: assets,
        deadline: DEADLINE,
      },
      action: {
        type: "permit2SignatureTransfer",
        args: {
          spender: blueBundlesV1,
          amount: assets,
          nonce: 7n,
          deadline: DEADLINE,
        },
      },
    };
    const tx = blueSupply({
      market: { chainId, marketParams: marketParamsClass },
      args: {
        userAddress: owner,
        assets,
        deadline: DEADLINE,
        requirementSignature,
      },
    });
    expect(decode([toTx(tx)]).operations[0]).toStrictEqual(
      expect.objectContaining({
        tokenSignature: {
          type: "permit2SignatureTransfer",
          nonce: 7n,
          deadline: DEADLINE,
        },
      }),
    );
  });

  test("behavior: blueWithdraw by assets and shares", () => {
    const txAssets = blueWithdraw({
      market: { chainId, marketParams: marketParamsClass },
      args: {
        userAddress: owner,
        withdrawAssets: 5_000n,
        withdrawShares: 0n,
        deadline: DEADLINE,
      },
    });
    const txShares = blueWithdraw({
      market: { chainId, marketParams: marketParamsClass },
      args: {
        userAddress: owner,
        withdrawAssets: 0n,
        withdrawShares: 700n,
        deadline: DEADLINE,
      },
    });
    const common = {
      ...base,
      type: "blueWithdraw",
      route: "blueBundlesV1",
      deployment: blueBundlesV1,
      market,
      onBehalf: owner,
      receiver: owner,
      tokenSignature: { type: "none" },
      reallocations: [],
      deadline: DEADLINE,
      referralFee: ZERO_FEE,
    };
    expect(decode([toTx(txAssets), toTx(txShares)]).operations).toStrictEqual([
      {
        ...common,
        transactionIndex: 0,
        amount: { type: "assets", assets: 5_000n },
        fullClose: false,
        authorizationSignature: { type: "none" },
      },
      {
        ...common,
        transactionIndex: 1,
        amount: { type: "shares", shares: 700n },
        fullClose: false,
        authorizationSignature: { type: "none" },
      },
    ]);
  });

  test("error: UnsupportedOperationError when withdrawShares is maxUint256", () => {
    const data = encodeFunctionData({
      abi: blueBundlesV1Abi,
      functionName: "blueBundlesV1Withdraw",
      args: [
        {
          loanToken: marketParams.loanToken,
          collateralToken: marketParams.collateralToken,
          oracle: marketParams.oracle,
          irm: marketParams.irm,
          lltv: marketParams.lltv,
        },
        0n,
        maxUint256,
        {
          signature: { v: 0, r: zeroHash, s: zeroHash },
          nonce: 0n,
          deadline: 0n,
        },
        [],
        0n,
        zeroAddress,
        DEADLINE,
      ],
    });
    expect(() => decode([toTx({ to: blueBundlesV1, data })])).toThrow(
      UnsupportedOperationError,
    );
  });

  test("behavior: blueWithdraw with signed authorization", () => {
    const authorizationSignature: AuthorizationRequirementSignature = {
      args: {
        owner,
        authorized: blueBundlesV1,
        isAuthorized: true,
        nonce: 2n,
        deadline: DEADLINE,
        signature,
      },
      action: {
        type: "authorization",
        args: {
          authorized: blueBundlesV1,
          isAuthorized: true,
          deadline: DEADLINE,
        },
      },
    };
    const tx = blueWithdraw({
      market: { chainId, marketParams: marketParamsClass },
      args: {
        userAddress: owner,
        withdrawAssets: 5_000n,
        withdrawShares: 0n,
        deadline: DEADLINE,
        authorizationSignature,
      },
    });
    expect(decode([toTx(tx)]).operations[0]).toStrictEqual(
      expect.objectContaining({
        authorizationSignature: {
          type: "blueAuthorizationSignature",
          nonce: 2n,
          deadline: DEADLINE,
        },
      }),
    );
  });

  test("behavior: supplyCollateral / borrow / supplyCollateralBorrow leg split", () => {
    const collateralAssets = 2n * 10n ** 18n;
    const scOnly = blueSupplyCollateral({
      market: { chainId, marketParams: marketParamsClass },
      args: { userAddress: owner, collateralAssets, deadline: DEADLINE },
    });
    const borrowOnly = blueBorrow({
      market: { chainId, marketParams: marketParamsClass },
      args: {
        userAddress: owner,
        borrowAssets: 400_000n,
        maxLtv: 800_000000000000000n,
        deadline: DEADLINE,
      },
    });
    const both = blueSupplyCollateralBorrow({
      market: { chainId, marketParams: marketParamsClass },
      args: {
        userAddress: owner,
        collateralAssets,
        borrowAssets: 400_000n,
        maxLtv: 800_000000000000000n,
        deadline: DEADLINE,
      },
    });
    const [sc, bo, sb] = decode([
      toTx(scOnly),
      toTx(borrowOnly),
      toTx(both),
    ]).operations;
    expect(sc).toStrictEqual(
      expect.objectContaining({
        type: "blueSupplyCollateral",
        collateralAssets,
        funding: {
          type: "erc20",
          token: marketParams.collateralToken,
          assets: collateralAssets,
        },
      }),
    );
    expect(bo).toStrictEqual(
      expect.objectContaining({
        type: "blueBorrow",
        borrowAssets: 400_000n,
        maxLtvWad: 800_000000000000000n,
      }),
    );
    expect(sb).toStrictEqual(
      expect.objectContaining({
        type: "blueSupplyCollateralBorrow",
        collateralAssets,
        borrowAssets: 400_000n,
        maxLtvWad: 800_000000000000000n,
        funding: {
          type: "erc20",
          token: marketParams.collateralToken,
          assets: collateralAssets,
        },
      }),
    );
  });

  test("behavior: blueSupplyCollateralBorrow maps one market reallocation", () => {
    const reallocations = [
      {
        vault: VAULT_V2,
        from: {
          type: "market" as const,
          adapter: ADAPTER,
          marketParams: marketBClass,
        },
        to: { adapter: ADAPTER },
        assets: 100_000n,
        penalty: 10_0000000000000000n,
      },
    ];
    const tx = blueSupplyCollateralBorrow({
      market: { chainId, marketParams: marketParamsClass },
      args: {
        userAddress: owner,
        collateralAssets: 0n,
        borrowAssets: 400_000n,
        maxLtv: 800_000000000000000n,
        reallocations,
        deadline: DEADLINE,
      },
    });
    expect(decode([toTx(tx)]).operations[0]).toStrictEqual(
      expect.objectContaining({
        type: "blueBorrow",
        reallocations: [
          {
            vault: VAULT_V2,
            from: {
              type: "market",
              adapter: ADAPTER,
              market: bindingB,
            },
            to: { adapter: ADAPTER, market },
            assets: 100_000n,
            penaltyWad: 10_0000000000000000n,
          },
        ],
      }),
    );
  });

  test("behavior: repay / withdrawCollateral / repayWithdrawCollateral leg split", () => {
    const repay = blueRepay({
      market: { chainId, marketParams: marketParamsClass },
      args: {
        userAddress: owner,
        repayAssets: 600_000n,
        repayShares: 0n,
        maxRepayAssets: 600_000n,
        deadline: DEADLINE,
      },
    });
    const repayFull = blueRepay({
      market: { chainId, marketParams: marketParamsClass },
      args: {
        userAddress: owner,
        repayAssets: 0n,
        repayShares: maxUint256,
        maxRepayAssets: 600_000n,
        deadline: DEADLINE,
      },
    });
    const wc = blueWithdrawCollateral({
      market: { chainId, marketParams: marketParamsClass },
      args: {
        userAddress: owner,
        collateralAssets: 10n ** 18n,
        maxLtv: maxUint256,
        deadline: DEADLINE,
      },
    });
    const rwc = blueRepayWithdrawCollateral({
      market: { chainId, marketParams: marketParamsClass },
      args: {
        userAddress: owner,
        repayAssets: 600_000n,
        repayShares: 0n,
        maxRepayAssets: 600_000n,
        collateralAssets: 10n ** 18n,
        maxLtv: 800_000000000000000n,
        deadline: DEADLINE,
      },
    });
    const [r, rf, w, rw] = decode(
      [repay, repayFull, wc, rwc].map(toTx),
    ).operations;
    expect(r).toStrictEqual(
      expect.objectContaining({
        type: "blueRepay",
        repay: { type: "assets", assets: 600_000n },
        maxRepayAssets: 600_000n,
        fullClose: false,
        funding: { type: "erc20", token: USDC, assets: 600_000n },
      }),
    );
    expect(rf).toStrictEqual(
      expect.objectContaining({
        type: "blueRepay",
        repay: { type: "shares", shares: maxUint256 },
        fullClose: true,
      }),
    );
    expect(w).toStrictEqual(
      expect.objectContaining({
        type: "blueWithdrawCollateral",
        collateralAssets: 10n ** 18n,
        maxLtvWad: maxUint256,
      }),
    );
    expect(rw).toStrictEqual(
      expect.objectContaining({
        type: "blueRepayWithdrawCollateral",
        repay: { type: "assets", assets: 600_000n },
        collateralAssets: 10n ** 18n,
        maxLtvWad: 800_000000000000000n,
        fullClose: false,
      }),
    );
  });

  test("behavior: blueRepay with native funding equals maxRepayAssets", () => {
    const nativeMarket = { ...marketParams, loanToken: wNative };
    const maxRepayAssets = 5n * 10n ** 17n;
    const tx = blueRepay({
      market: { chainId, marketParams: new MarketParams(nativeMarket) },
      args: {
        userAddress: owner,
        repayAssets: 4n * 10n ** 17n,
        repayShares: 0n,
        maxRepayAssets,
        nativeAmount: maxRepayAssets,
        deadline: DEADLINE,
      },
    });
    expect(decode([toTx(tx)]).operations[0]).toStrictEqual(
      expect.objectContaining({
        type: "blueRepay",
        maxRepayAssets,
        funding: {
          type: "native",
          wrappedToken: wNative,
          assets: maxRepayAssets,
        },
      }),
    );
  });

  test("error: ProtocolBindingMismatchError when native repay value differs from maxRepayAssets", () => {
    const nativeMarket = { ...marketParams, loanToken: wNative };
    const tx = blueRepay({
      market: { chainId, marketParams: new MarketParams(nativeMarket) },
      args: {
        userAddress: owner,
        repayAssets: 4n * 10n ** 17n,
        repayShares: 0n,
        maxRepayAssets: 5n * 10n ** 17n,
        nativeAmount: 5n * 10n ** 17n,
        deadline: DEADLINE,
      },
    });
    expect(() => decode([{ ...toTx(tx), value: 1n }])).toThrow(
      ProtocolBindingMismatchError,
    );
  });

  test("error: SimulationValidationError on empty transactions", () => {
    expect(() => decode([])).toThrow(SimulationValidationError);
  });

  test("behavior: blueRefinance maps source and target markets", () => {
    const tx = blueRefinance({
      market: {
        chainId,
        sourceMarketParams: marketParamsClass,
        destinationMarketParams: marketBClass,
      },
      args: { userAddress: owner, maxLtv: maxUint256, deadline: DEADLINE },
    });
    expect(decode([toTx(tx)]).operations[0]).toStrictEqual({
      ...base,
      transactionIndex: 0,
      type: "blueRefinance",
      route: "blueBundlesV1",
      deployment: blueBundlesV1,
      sourceMarket: market,
      targetMarket: bindingB,
      onBehalf: owner,
      maxLtvWad: maxUint256,
      reallocations: [],
      sourceFullClose: true,
      authorizationSignature: { type: "none" },
      deadline: DEADLINE,
      referralFee: ZERO_FEE,
    });
  });

  test("behavior: vaultV1Deposit erc20 and vaultV2Deposit native", () => {
    const maxSharePrice = 2n * 10n ** 27n;
    const v1 = vaultV1Deposit({
      vault: { chainId, address: VAULT_V1, asset: USDC },
      args: {
        amount: 1_000_000n,
        maxSharePrice,
        userAddress: owner,
        deadline: DEADLINE,
      },
    });
    const v2 = vaultV2Deposit({
      vault: { chainId, address: VAULT_V2, asset: wNative },
      args: {
        nativeAmount: 10n ** 18n,
        maxSharePrice,
        userAddress: owner,
        deadline: DEADLINE,
      },
    });
    const [d1, d2] = decode([v1, v2].map(toTx), {
      vaults: [
        { address: VAULT_V1, kind: "vaultV1", asset: USDC },
        { address: VAULT_V2, kind: "vaultV2", asset: wNative },
      ],
    }).operations;
    expect(d1).toStrictEqual(
      expect.objectContaining({
        type: "vaultV1Deposit",
        route: "vaultBundlesV1",
        vault: VAULT_V1,
        asset: USDC,
        receiver: owner,
        funding: { type: "erc20", token: USDC, assets: 1_000_000n },
        maxSharePriceE27: maxSharePrice,
        tokenSignature: { type: "none" },
      }),
    );
    expect(d2).toStrictEqual(
      expect.objectContaining({
        type: "vaultV2Deposit",
        funding: { type: "native", wrappedToken: wNative, assets: 10n ** 18n },
        maxSharePriceE27: maxSharePrice,
      }),
    );
  });

  test("behavior: vaultV1Withdraw / vaultV2Redeem / vaultV1Redeem with shares permit", () => {
    const w = vaultV1Withdraw({
      vault: { chainId, address: VAULT_V1 },
      args: { amount: 1_000_000n, userAddress: owner, deadline: DEADLINE },
    });
    const redeemShares = 700n;
    const permit: Erc2612RequirementSignature = {
      args: {
        owner,
        nonce: 9n,
        asset: VAULT_V2,
        signature,
        amount: redeemShares,
        deadline: DEADLINE,
      },
      action: {
        type: "permit",
        args: {
          spender: vaultBundlesV1,
          amount: redeemShares,
          deadline: DEADLINE,
        },
      },
    };
    const r = vaultV2Redeem({
      vault: { chainId, address: VAULT_V2 },
      args: {
        shares: redeemShares,
        userAddress: owner,
        deadline: DEADLINE,
        requirementSignature: permit,
      },
    });
    const [wo, ro] = decode([w, r].map(toTx)).operations;
    expect(wo).toStrictEqual(
      expect.objectContaining({
        type: "vaultV1Withdraw",
        route: "vaultBundlesV1",
        vault: VAULT_V1,
        asset: USDC,
        assets: 1_000_000n,
        tokenSignature: { type: "none" },
      }),
    );
    expect(ro).toStrictEqual(
      expect.objectContaining({
        type: "vaultV2Redeem",
        shares: redeemShares,
        tokenSignature: {
          type: "erc2612Permit",
          nonce: 9n,
          deadline: DEADLINE,
        },
      }),
    );
  });

  test("behavior: vaultV1MigrateToV2 binds source/destination vaults", () => {
    const tx = vaultV1MigrateToV2({
      vault: { chainId, address: VAULT_V1, asset: USDC },
      args: {
        assets: 1_000_000n,
        targetVault: VAULT_V2,
        targetAsset: USDC,
        maxSharePriceVaultV2: 2n * 10n ** 27n,
        userAddress: owner,
        deadline: DEADLINE,
      },
    });
    expect(decode([toTx(tx)]).operations[0]).toStrictEqual(
      expect.objectContaining({
        type: "vaultV1MigrateToV2",
        route: "vaultBundlesV1",
        sourceVault: VAULT_V1,
        targetVault: VAULT_V2,
        asset: USDC,
        amount: { type: "assets", assets: 1_000_000n },
        receiver: owner,
        maxTargetSharePriceE27: 2n * 10n ** 27n,
        tokenSignature: { type: "none" },
      }),
    );
  });

  test("behavior: vaultV2ForceWithdraw via VaultExitBundlesV1", () => {
    const tx = vaultV2ForceWithdraw({
      vault: { chainId, address: VAULT_V2 },
      args: {
        adapter: ADAPTER,
        exitAssets: 900_000n,
        minSharePriceE27: 10n ** 27n,
        userAddress: owner,
        deadline: DEADLINE,
      },
    });
    expect(decode([toTx(tx)]).operations[0]).toStrictEqual(
      expect.objectContaining({
        type: "vaultV2ForceWithdraw",
        route: "vaultExitBundlesV1",
        vault: VAULT_V2,
        asset: USDC,
        adapter: ADAPTER,
        exitAssets: 900_000n,
        minSharePriceE27: 10n ** 27n,
        onBehalf: owner,
        receiver: owner,
        tokenSignature: { type: "none" },
      }),
    );
  });

  test("behavior: vaultV2ForceRedeem multicall with two deallocations", () => {
    const tx = vaultV2ForceRedeem({
      vault: { address: VAULT_V2 },
      args: {
        deallocations: [
          {
            adapter: ADAPTER,
            marketParams: marketParamsClass,
            amount: 600_000n,
          },
          { adapter: ADAPTER, amount: 200_000n },
        ],
        redeem: { shares: 5_000n, recipient: owner },
        onBehalf: owner,
      },
    });
    const data = encodeAbiParameters([blueMarketParamsAbi], [marketParams]);
    expect(decode([toTx(tx)]).operations[0]).toStrictEqual({
      ...base,
      transactionIndex: 0,
      type: "vaultV2ForceRedeem",
      route: "vaultV2Multicall",
      deployment: VAULT_V2,
      vault: VAULT_V2,
      asset: USDC,
      onBehalf: owner,
      receiver: owner,
      shares: 5_000n,
      deallocations: [
        {
          adapter: ADAPTER,
          marketId: market.marketId,
          amount: 600_000n,
          data,
        },
        { adapter: ADAPTER, amount: 200_000n, data: "0x" },
      ],
    });
  });

  test("behavior: vaultV1 and vaultV2 in-kind redemptions", () => {
    const v1 = vaultV1InKindRedeem({
      vault: { chainId, address: VAULT_V1 },
      args: {
        amount: 300_000n,
        marketParamsList: [marketParams],
        userAddress: owner,
        deadline: DEADLINE,
      },
    });
    const v2 = vaultV2InKindRedeem({
      vault: { chainId, address: VAULT_V2 },
      args: {
        adapter: ADAPTER,
        amount: 300_000n,
        marketParamsList: [marketParams],
        userAddress: owner,
        deadline: DEADLINE,
      },
    });
    const [r1, r2] = decode([v1, v2].map(toTx)).operations;
    expect(r1).toStrictEqual(
      expect.objectContaining({
        type: "vaultV1InKindRedeem",
        route: "vaultExitBundlesV1",
        vault: VAULT_V1,
        asset: USDC,
        assets: 300_000n,
        markets: [market],
        onBehalf: owner,
        deadline: DEADLINE,
        tokenSignature: { type: "none" },
      }),
    );
    expect(r2).toStrictEqual(
      expect.objectContaining({
        type: "vaultV2InKindRedeem",
        adapter: ADAPTER,
        markets: [market],
      }),
    );
  });

  test("behavior: direct Morpho setAuthorization resolves bundles and preLiquidation operators", () => {
    const setAuth = (authorized: Address) =>
      toTx({
        to: morpho,
        data: encodeFunctionData({
          abi: blueAbi,
          functionName: "setAuthorization",
          args: [authorized, true],
        }),
      });
    const [bundlesAuth] = decode([setAuth(blueBundlesV1)]).operations;
    expect(bundlesAuth).toStrictEqual(
      expect.objectContaining({
        type: "blueAuthorization",
        route: "morpho",
        authorizer: owner,
        authorized: blueBundlesV1,
        isAuthorized: true,
        operator: { type: "bundles" },
        signature: { type: "none" },
      }),
    );
    const [preliq] = decode([setAuth(PRELIQ)], {
      preLiquidations: [{ address: PRELIQ, market }],
    }).operations;
    expect(preliq).toStrictEqual(
      expect.objectContaining({
        operator: { type: "preLiquidation", market },
      }),
    );
  });

  test("error: UnsupportedOperationError on unbound operator authorization", () => {
    expect(() =>
      decode([
        toTx({
          to: morpho,
          data: encodeFunctionData({
            abi: blueAbi,
            functionName: "setAuthorization",
            args: [PRELIQ, true],
          }),
        }),
      ]),
    ).toThrow(ProtocolBindingMismatchError);
  });

  test("error: UnsupportedOperationError in preview when calldata consumes a signature", () => {
    const assets = 1_000_000n;
    const requirementSignature: Erc2612RequirementSignature = {
      args: {
        owner,
        nonce: 3n,
        asset: USDC,
        signature,
        amount: assets,
        deadline: DEADLINE,
      },
      action: {
        type: "permit",
        args: { spender: blueBundlesV1, amount: assets, deadline: DEADLINE },
      },
    };
    const tx = blueSupply({
      market: { chainId, marketParams: marketParamsClass },
      args: {
        userAddress: owner,
        assets,
        deadline: DEADLINE,
        requirementSignature,
      },
    });
    expect(() => decode([toTx(tx)], { mode: "preview" })).toThrow(
      UnsupportedOperationError,
    );
  });

  test("error: preview rejects a signed authorization", () => {
    const authorizationSignature: AuthorizationRequirementSignature = {
      args: {
        owner,
        authorized: blueBundlesV1,
        isAuthorized: true,
        nonce: 2n,
        deadline: DEADLINE,
        signature,
      },
      action: {
        type: "authorization",
        args: {
          authorized: blueBundlesV1,
          isAuthorized: true,
          deadline: DEADLINE,
        },
      },
    };
    const tx = blueWithdraw({
      market: { chainId, marketParams: marketParamsClass },
      args: {
        userAddress: owner,
        withdrawAssets: 5_000n,
        withdrawShares: 0n,
        deadline: DEADLINE,
        authorizationSignature,
      },
    });
    expect(() => decode([toTx(tx)], { mode: "preview" })).toThrow(
      UnsupportedOperationError,
    );
  });

  test("error: ProtocolBindingMismatchError on mixed senders", () => {
    const tx = blueSupply({
      market: { chainId, marketParams: marketParamsClass },
      args: { userAddress: owner, assets: 1_000n, deadline: DEADLINE },
    });
    expect(() =>
      decode([
        toTx(tx),
        { ...toTx(tx), from: "0x9999999999999999999999999999999999999999" },
      ]),
    ).toThrow(ProtocolBindingMismatchError);
  });

  test("error: UnsupportedChainError on unregistered chain", () => {
    const tx = blueSupply({
      market: { chainId, marketParams: marketParamsClass },
      args: { userAddress: owner, assets: 1_000n, deadline: DEADLINE },
    });
    expect(() => decode([toTx(tx)], { chainId: 999_999 })).toThrow(
      UnsupportedChainError,
    );
  });

  test("error: ProtocolBindingMismatchError on unbound vault", () => {
    const tx = vaultV1Deposit({
      vault: { chainId, address: VAULT_V1, asset: USDC },
      args: {
        amount: 1_000_000n,
        maxSharePrice: 2n * 10n ** 27n,
        userAddress: owner,
        deadline: DEADLINE,
      },
    });
    expect(() => decode([toTx(tx)], { vaults: [] })).toThrow(
      ProtocolBindingMismatchError,
    );
  });

  test("error: ProtocolBindingMismatchError on migrate asset mismatch", () => {
    const tx = vaultV1MigrateToV2({
      vault: { chainId, address: VAULT_V1, asset: USDC },
      args: {
        assets: 1_000_000n,
        targetVault: VAULT_V2,
        targetAsset: USDC,
        maxSharePriceVaultV2: 2n * 10n ** 27n,
        userAddress: owner,
        deadline: DEADLINE,
      },
    });
    expect(() =>
      decode([toTx(tx)], {
        vaults: [
          { address: VAULT_V1, kind: "vaultV1", asset: USDC },
          { address: VAULT_V2, kind: "vaultV2", asset: wNative },
        ],
      }),
    ).toThrow(ProtocolBindingMismatchError);
  });

  test("error: ProtocolBindingMismatchError on native funding of non-wNative token", () => {
    const tx = blueSupply({
      market: { chainId, marketParams: marketParamsClass },
      args: { userAddress: owner, assets: 1_000n, deadline: DEADLINE },
    });
    expect(() => decode([{ ...toTx(tx), value: 1_000n }])).toThrow(
      ProtocolBindingMismatchError,
    );
  });

  test("error: ProtocolBindingMismatchError on value sent to withdraw", () => {
    const tx = blueWithdraw({
      market: { chainId, marketParams: marketParamsClass },
      args: {
        userAddress: owner,
        withdrawAssets: 5_000n,
        withdrawShares: 0n,
        deadline: DEADLINE,
      },
    });
    expect(() => decode([{ ...toTx(tx), value: 1n }])).toThrow(
      ProtocolBindingMismatchError,
    );
  });

  test("behavior: fast-check blueSupply round-trip over random markets and amounts", () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc
            .uint8Array({ minLength: 20, maxLength: 20 })
            .map((b) => `0x${Buffer.from(b).toString("hex")}` as Address),
          fc
            .uint8Array({ minLength: 20, maxLength: 20 })
            .map((b) => `0x${Buffer.from(b).toString("hex")}` as Address),
          fc.bigInt({ min: 1n, max: 10n ** 30n }),
          fc.bigInt({ min: 1n, max: 2n ** 32n }),
        ),
        ([loanToken, oracle, assets, deadline]) => {
          const params = {
            loanToken: getAddress(loanToken),
            collateralToken: wNative,
            oracle: getAddress(oracle),
            irm: adaptiveCurveIrm,
            lltv: 860_000000000000000n,
          };
          const tx = blueSupply({
            market: { chainId, marketParams: new MarketParams(params) },
            args: { userAddress: owner, assets, deadline },
          });
          const op = decode([toTx(tx)]).operations[0]!;
          expect(op).toStrictEqual(
            expect.objectContaining({
              type: "blueSupply",
              assets,
              deadline,
              market: {
                marketId: MarketUtils.getMarketId(params),
                params,
              },
              funding: {
                type: "erc20",
                token: params.loanToken,
                assets,
              },
            }),
          );
        },
      ),
      { numRuns: 30 },
    );
  });

  test("behavior: fast-check index invariant over random transaction permutations", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        fc.bigInt({ min: 1n, max: 10n ** 12n }),
        (count, seed) => {
          const txs = Array.from({ length: count }, (_, i) =>
            toTx(
              blueSupply({
                market: { chainId, marketParams: marketParamsClass },
                args: {
                  userAddress: owner,
                  assets: 1_000n + (seed % 100n) + BigInt(i),
                  deadline: DEADLINE,
                },
              }),
            ),
          );
          const decoded = decode(txs);
          decoded.operations.forEach((op, i) => {
            expect(op.transactionIndex).toBe(i);
            expect(op.callPath).toStrictEqual([]);
          });
        },
      ),
      { numRuns: 20 },
    );
  });

  test("error: UnsupportedOperationError / ProtocolBindingMismatchError on malformed token permits", () => {
    const supply = (permit: { kind: number; data: `0x${string}` }) =>
      toTx({
        to: blueBundlesV1,
        data: encodeFunctionData({
          abi: blueBundlesV1Abi,
          functionName: "blueBundlesV1Supply",
          args: [marketParams, 1_000_000n, permit, 0n, zeroAddress, DEADLINE],
        }),
      });

    // kind 0 must carry empty data
    expect(() => decode([supply({ kind: 0, data: "0x1234" })])).toThrow(
      ProtocolBindingMismatchError,
    );
    // kind 1/2 must carry their payloads
    expect(() => decode([supply({ kind: 1, data: "0x" })])).toThrow(
      ProtocolBindingMismatchError,
    );
    expect(() => decode([supply({ kind: 2, data: "0x" })])).toThrow(
      ProtocolBindingMismatchError,
    );
    // kind 1 payload must decode to (deadline, v, r, s)
    expect(() => decode([supply({ kind: 1, data: "0x1234" })])).toThrow(
      ProtocolBindingMismatchError,
    );
    // unknown kind
    expect(() => decode([supply({ kind: 3, data: "0x1234" })])).toThrow(
      UnsupportedOperationError,
    );
  });

  test("error: UnsupportedOperationError on garbage calldata to bundles deployments", () => {
    expect(() =>
      decode([toTx({ to: blueBundlesV1, data: "0xdeadbeef" })]),
    ).toThrow(UnsupportedOperationError);
    expect(() =>
      decode([toTx({ to: vaultBundlesV1, data: "0xdeadbeef" })]),
    ).toThrow(UnsupportedOperationError);
  });

  test("error: ProtocolBindingMismatchError on reallocation targeting another market", () => {
    const data = encodeFunctionData({
      abi: blueBundlesV1Abi,
      functionName: "blueBundlesV1SupplyCollateralAndBorrow",
      args: [
        marketParams,
        0n,
        400_000n,
        maxUint256,
        { kind: 0, data: "0x" },
        {
          signature: { v: 0, r: zeroHash, s: zeroHash },
          nonce: 0n,
          deadline: 0n,
        },
        [
          {
            vault: VAULT_V2,
            adapter: ADAPTER,
            marketParams: marketB,
            fromIdle: false,
            sourceAdapter: ADAPTER,
            sourceMarketParams: marketB,
            assets: 100_000n,
            penalty: 0n,
          },
        ],
        0n,
        zeroAddress,
        DEADLINE,
      ],
    });
    expect(() => decode([toTx({ to: blueBundlesV1, data })])).toThrow(
      ProtocolBindingMismatchError,
    );
  });

  test("error: UnsupportedOperationError on reallocations without a borrow leg", () => {
    const data = encodeFunctionData({
      abi: blueBundlesV1Abi,
      functionName: "blueBundlesV1SupplyCollateralAndBorrow",
      args: [
        marketParams,
        10n ** 18n,
        0n,
        maxUint256,
        { kind: 0, data: "0x" },
        {
          signature: { v: 0, r: zeroHash, s: zeroHash },
          nonce: 0n,
          deadline: 0n,
        },
        [
          {
            vault: VAULT_V2,
            adapter: ADAPTER,
            marketParams,
            fromIdle: true,
            sourceAdapter: zeroAddress,
            sourceMarketParams: marketParams,
            assets: 100_000n,
            penalty: 0n,
          },
        ],
        0n,
        zeroAddress,
        DEADLINE,
      ],
    });
    expect(() => decode([toTx({ to: blueBundlesV1, data })])).toThrow(
      UnsupportedOperationError,
    );
  });

  test("error: ProtocolBindingMismatchError on refinance to the same market", () => {
    const data = encodeFunctionData({
      abi: blueBundlesV1Abi,
      functionName: "blueBundlesV1MigrateBorrowPosition",
      args: [
        marketParams,
        marketParams,
        maxUint256,
        {
          signature: { v: 0, r: zeroHash, s: zeroHash },
          nonce: 0n,
          deadline: 0n,
        },
        [],
        0n,
        zeroAddress,
        DEADLINE,
      ],
    });
    expect(() => decode([toTx({ to: blueBundlesV1, data })])).toThrow(
      ProtocolBindingMismatchError,
    );
  });

  test("error: UnsupportedOperationError on repay with both assets and shares", () => {
    const data = encodeFunctionData({
      abi: blueBundlesV1Abi,
      functionName: "blueBundlesV1RepayAndWithdrawCollateral",
      args: [
        marketParams,
        600_000n,
        700n,
        600_000n,
        0n,
        maxUint256,
        { kind: 0, data: "0x" },
        {
          signature: { v: 0, r: zeroHash, s: zeroHash },
          nonce: 0n,
          deadline: 0n,
        },
        0n,
        zeroAddress,
        DEADLINE,
      ],
    });
    expect(() => decode([toTx({ to: blueBundlesV1, data })])).toThrow(
      UnsupportedOperationError,
    );
  });

  test("error: VaultV2 multicall guards carry inner callPath", () => {
    const multicall = (calls: `0x${string}`[]) =>
      toTx({
        to: VAULT_V2,
        data: encodeFunctionData({
          abi: vaultV2Abi,
          functionName: "multicall",
          args: [calls],
        }),
      });
    const deallocate = (onBehalf: Address, data = "0x" as `0x${string}`) =>
      encodeFunctionData({
        abi: vaultV2Abi,
        functionName: "forceDeallocate",
        args: [ADAPTER, data, 1n, onBehalf],
      });
    const redeem = (receiver: Address, onBehalf: Address) =>
      encodeFunctionData({
        abi: vaultV2Abi,
        functionName: "redeem",
        args: [1n, receiver, onBehalf],
      });
    const other = getAddress("0x9999999999999999999999999999999999999999");

    const expectCallPath = (spec: {
      readonly call: () => unknown;
      readonly error: new (...args: never[]) => Error;
      readonly callPath: readonly number[];
    }) => {
      const { call, error, callPath } = spec;
      try {
        call();
      } catch (caught) {
        expect(caught).toBeInstanceOf(error);
        expect(
          (caught as { context: { location: { callPath: readonly number[] } } })
            .context.location.callPath,
        ).toStrictEqual(callPath);
        return;
      }
      throw new Error("expected decodeOperations to throw");
    };

    expectCallPath({
      call: () =>
        decode([multicall([deallocate(other), redeem(owner, owner)])]),
      error: ProtocolBindingMismatchError,
      callPath: [0],
    });
    expectCallPath({
      call: () =>
        decode([multicall([deallocate(owner), redeem(other, owner)])]),
      error: ProtocolBindingMismatchError,
      callPath: [1],
    });
    expectCallPath({
      call: () =>
        decode([multicall([deallocate(owner), redeem(owner, other)])]),
      error: ProtocolBindingMismatchError,
      callPath: [1],
    });
    expectCallPath({
      call: () => decode([multicall([])]),
      error: UnsupportedOperationError,
      callPath: [],
    });
    // A lone redeem without any forceDeallocate leg is not a forceRedeem.
    expectCallPath({
      call: () => decode([multicall([redeem(owner, owner)])]),
      error: UnsupportedOperationError,
      callPath: [],
    });
    expectCallPath({
      call: () => decode([multicall(["0xdeadbeef", redeem(owner, owner)])]),
      error: UnsupportedOperationError,
      callPath: [0],
    });
    expectCallPath({
      call: () =>
        decode([
          multicall([deallocate(owner, "0x1234"), redeem(owner, owner)]),
        ]),
      error: ProtocolBindingMismatchError,
      callPath: [0],
    });
    // A vault bound as V1 cannot receive a VaultV2 multicall.
    expect(() =>
      decode([multicall([redeem(owner, owner)])], {
        vaults: [{ address: VAULT_V2, kind: "vaultV1", asset: USDC }],
      }),
    ).toThrow(UnsupportedOperationError);
  });

  test("error: preview rejects a non-empty shares permit on vault redeem", () => {
    const redeemShares = 700n;
    const permit: Erc2612RequirementSignature = {
      args: {
        owner,
        nonce: 9n,
        asset: VAULT_V2,
        signature,
        amount: redeemShares,
        deadline: DEADLINE,
      },
      action: {
        type: "permit",
        args: {
          spender: vaultBundlesV1,
          amount: redeemShares,
          deadline: DEADLINE,
        },
      },
    };
    const tx = vaultV2Redeem({
      vault: { chainId, address: VAULT_V2 },
      args: {
        shares: redeemShares,
        userAddress: owner,
        deadline: DEADLINE,
        requirementSignature: permit,
      },
    });
    expect(() => decode([toTx(tx)], { mode: "preview" })).toThrow(
      UnsupportedOperationError,
    );
  });

  test("behavior: fast-check vaultV2Deposit round-trips funding, bound, and deadline", () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.bigInt({ min: 1n, max: 10n ** 30n }),
          fc.bigInt({ min: 1n, max: 10n ** 30n }),
          fc.bigInt({ min: 1n, max: 2n ** 32n }),
        ),
        ([assets, maxSharePrice, deadline]) => {
          const tx = vaultV2Deposit({
            vault: { chainId, address: VAULT_V2, asset: USDC },
            args: {
              amount: assets,
              maxSharePrice,
              userAddress: owner,
              deadline,
            },
          });
          expect(decode([toTx(tx)]).operations[0]).toStrictEqual(
            expect.objectContaining({
              type: "vaultV2Deposit",
              route: "vaultBundlesV1",
              vault: VAULT_V2,
              asset: USDC,
              funding: { type: "erc20", token: USDC, assets },
              maxSharePriceE27: maxSharePrice,
              deadline,
              tokenSignature: { type: "none" },
            }),
          );
        },
      ),
      { numRuns: 30 },
    );
  });
});
