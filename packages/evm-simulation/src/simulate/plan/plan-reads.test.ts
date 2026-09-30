import type { MarketId } from "@morpho-org/blue-sdk";
import { getChainAddresses } from "@morpho-org/morpho-sdk/addresses";
import { type Address, ethAddress, getAddress, zeroAddress } from "viem";
import type { VerificationSnapshot } from "../../domain/evidence.js";
import type { DecodedBundle } from "../../domain/stages.js";
import { UnsupportedChainError } from "../../errors.js";
import { planProbeReads } from "./plan-reads.js";
import { probeId } from "./probes.js";

const addresses = getChainAddresses(1);
const OWNER: Address = getAddress("0x1111111111111111111111111111111111111111");
const TOKEN: Address = getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
const VAULT_V2: Address = getAddress(
  "0x2222222222222222222222222222222222222222",
);
const ADAPTER: Address = getAddress(
  "0x3333333333333333333333333333333333333333",
);
const MARKET_ID = `0x${"ab".repeat(32)}` as MarketId;
const ORACLE: Address = getAddress(
  "0x4444444444444444444444444444444444444444",
);

const bundle = (chainId = 1): DecodedBundle =>
  ({
    request: { chainId },
    owner: OWNER,
    operations: [],
  }) as unknown as DecodedBundle;

const snapshot = (
  overrides: Partial<VerificationSnapshot> = {},
): VerificationSnapshot => ({
  wallet: [],
  permissions: [],
  positions: [],
  vaults: [],
  markets: [],
  ...overrides,
});

describe("planProbeReads", () => {
  test("default: covers every subject in the snapshot", () => {
    const before = snapshot({
      wallet: [
        { account: OWNER, token: ethAddress, assets: 1n },
        { account: OWNER, token: TOKEN, assets: 1n },
        { account: ADAPTER, token: TOKEN, assets: 0n },
      ],
      permissions: [
        {
          type: "erc20Allowance",
          token: TOKEN,
          owner: OWNER,
          spender: addresses.bundles!.vaultBundlesV1!,
          amount: 5n,
        },
        {
          type: "permit2Nonce",
          permit2: addresses.permit2!,
          owner: OWNER,
          nonce: 300n,
          wordPosition: 1n,
          bitmap: 0n,
          consumed: false,
        },
        {
          type: "blueAuthorization",
          morpho: addresses.blue,
          authorizer: OWNER,
          authorized: OPERATOR(),
          isAuthorized: false,
        },
      ],
      positions: [
        {
          marketId: MARKET_ID,
          owner: OWNER,
          supplyAssets: 0n,
          supplyShares: 0n,
          borrowAssets: 0n,
          borrowShares: 0n,
          collateralAssets: 0n,
          ltvWad: { type: "debtFree" },
          healthFactorWad: { type: "unbounded", reason: "zeroCollateral" },
        },
      ],
      markets: [
        {
          market: {
            marketId: MARKET_ID,
            params: {
              loanToken: TOKEN,
              collateralToken: TOKEN,
              oracle: ORACLE,
              irm: addresses.adaptiveCurveIrm,
              lltv: 860_000_000_000_000_000n,
            },
          },
          totalSupplyAssets: 1n,
          totalSupplyShares: 1n,
          totalBorrowAssets: 0n,
          totalBorrowShares: 0n,
          lastUpdate: 1n,
          feeWad: 0n,
          liquidityAssets: 1n,
          utilizationWad: { type: "finite", valueWad: 0n },
          borrowApyWad: { type: "applicable", value: 0n },
          oraclePrice: {
            type: "applicable",
            value: { value: 1n, scale: 1n },
          },
          borrowRatePerSecondWad: { type: "applicable", value: 0n },
          rateAtTargetPerSecondWad: { type: "applicable", value: 0n },
          preLiquidation: { type: "notApplicable", reason: "noPreLiquidation" },
        },
      ],
      vaults: [
        {
          type: "vaultV2",
          vault: VAULT_V2,
          owner: OWNER,
          asset: TOKEN,
          totalAssets: 1n,
          totalShares: 1n,
          ownerShares: 0n,
          idleAssets: 0n,
          sharePriceE27: 0n,
          feeRecipient: OWNER,
          performanceFeeWad: 0n,
          allocations: [
            {
              adapter: ADAPTER,
              marketId: MARKET_ID,
              assets: 1n,
              shares: 1n,
              absoluteCapAssets: 1n,
              relativeCapWad: 0n,
              penaltyWad: 0n,
            },
          ],
          managementFeeWad: 0n,
          managementFeeRecipient: OWNER,
          maxRatePerSecondWad: 0n,
          lastUpdate: 0n,
          recordedTotalAssets: 1n,
          virtualShares: 0n,
          liquidityAdapter: ADAPTER,
        },
      ],
    });

    const { full, permissions } = planProbeReads(bundle(), before);
    const types = full.map((r) => r.type);
    for (const t of [
      "nativeBalance",
      "erc20Balance",
      "erc20Allowance",
      "permit2NonceBitmap",
      "blueIsAuthorized",
      "bluePosition",
      "blueMarket",
      "oraclePrice",
      "irmBorrowRateView",
      "vaultTotalAssets",
      "vaultTotalSupply",
      "vaultBalanceOf",
      "vaultIdleAssets",
      "adapterAllocation",
    ]) {
      expect(types).toContain(t);
    }
    // erc20Balance deduped across identical subjects.
    expect(new Set(full.map(probeId)).size).toBe(full.length);
    // permissions ⊆ permission-state reads only.
    expect(
      permissions.every((r) =>
        [
          "erc20Allowance",
          "blueIsAuthorized",
          "erc2612Nonce",
          "blueNonce",
          "permit2NonceBitmap",
        ].includes(r.type),
      ),
    ).toBe(true);
    expect(permissions.length).toBe(3);
  });

  test("behavior: zero-address oracle/irm skips the applicable reads", () => {
    const before = snapshot({
      markets: [
        {
          market: {
            marketId: MARKET_ID,
            params: {
              loanToken: TOKEN,
              collateralToken: TOKEN,
              oracle: zeroAddress,
              irm: zeroAddress,
              lltv: 0n,
            },
          },
          totalSupplyAssets: 0n,
          totalSupplyShares: 0n,
          totalBorrowAssets: 0n,
          totalBorrowShares: 0n,
          lastUpdate: 0n,
          feeWad: 0n,
          liquidityAssets: 0n,
          utilizationWad: { type: "unbounded", reason: "zeroLiquidity" },
          borrowApyWad: { type: "notApplicable", reason: "noIrm" },
          oraclePrice: { type: "notApplicable", reason: "noOracle" },
          borrowRatePerSecondWad: { type: "notApplicable", reason: "noIrm" },
          rateAtTargetPerSecondWad: { type: "notApplicable", reason: "noIrm" },
          preLiquidation: { type: "notApplicable", reason: "noPreLiquidation" },
        },
      ],
    });
    const { full } = planProbeReads(bundle(), before);
    expect(full.map((r) => r.type)).not.toContain("oraclePrice");
    expect(full.map((r) => r.type)).not.toContain("irmBorrowRateView");
    expect(full.map((r) => r.type)).toContain("blueMarket");
  });

  test("error: UnsupportedChainError for an unregistered chain", () => {
    expect(() => planProbeReads(bundle(999_999_999), snapshot())).toThrow(
      UnsupportedChainError,
    );
  });
});

const OPERATOR = () => getAddress("0x5555555555555555555555555555555555555555");
