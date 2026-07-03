import {
  type AccrualVaultV2,
  addressesRegistry,
  type IAccrualVaultV2Adapter,
  MarketParams,
  MathLib,
} from "@morpho-org/blue-sdk";
import type { AnvilTestClient } from "@morpho-org/test";
import { parseUnits } from "viem";
import { describe, expect } from "vitest";
import {
  fetchAccrualVaultV2,
  fetchAccrualVaultV2Deployless,
} from "../src/index.js";
import { vaultV2Test } from "./setup.js";
import { deployMorphoMarketV1Adapter, deployVaultV2 } from "./utils.js";

// Far-future timestamp (> the Base fork block) used for deterministic interest accrual.
const ACCRUAL_TIMESTAMP = 2_000_000_000n;

// VaultV2 whose liquidity adapter wraps a MetaMorpho V1 vault (deepest adapter branch).
const vaultV2VaultV1 = "0xfDE48B9B8568189f629Bc5209bf5FA826336557a";
// VaultV2 whose liquidity adapter is a MorphoMarketV1AdapterV2 (real caps and allocations).
const vaultV2MarketV1V2 = "0x4C7b69b4a82e9E5D8ec60E96516f7A0E17CBC55C";

const marketParams = new MarketParams({
  collateralToken: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
  irm: "0x46415998764C29aB2a25CbeA6254146D50D22687",
  lltv: 860000000000000000n,
  loanToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  oracle: "0x663BECd10daE6C4A3Dcd89F1d76c1174199639B9",
});

function adapterIdentity(adapter: IAccrualVaultV2Adapter) {
  return {
    address: adapter.address,
    type: adapter.type,
    adapterId: adapter.adapterId,
    parentVault: adapter.parentVault,
    skimRecipient: adapter.skimRecipient,
  };
}

/**
 * Asserts that the value or thrown error class of two calls match. Used for `maxDeposit`, which
 * throws `VaultV2Errors.UnsupportedLiquidityAdapter` for a MorphoMarketV1 liquidity adapter in both
 * fetch paths.
 */
function expectSameOutcome<T>(actualFn: () => T, expectedFn: () => T) {
  let actualValue: T | undefined;
  let actualError: unknown;
  try {
    actualValue = actualFn();
  } catch (error) {
    actualError = error;
  }

  let expectedValue: T | undefined;
  let expectedError: unknown;
  try {
    expectedValue = expectedFn();
  } catch (error) {
    expectedError = error;
  }

  if (actualError !== undefined || expectedError !== undefined) {
    expect((actualError as Error)?.constructor).toBe(
      (expectedError as Error)?.constructor,
    );
    return;
  }

  expect(actualValue).toStrictEqual(expectedValue);
}

/**
 * Asserts the deployless one-call reader is behaviourally identical to the multicall
 * (`deployless: false`) reader. Deep object equality is avoided because the deployless nested
 * MetaMorpho V1 vault intentionally omits `eip5267Domain` and `publicAllocatorConfig` (which the
 * multicall path does read); every accounting and capacity output is compared instead.
 */
function expectEquivalent(actual: AccrualVaultV2, expected: AccrualVaultV2) {
  expect(actual.address).toBe(expected.address);
  expect(actual._totalAssets).toBe(expected._totalAssets);
  expect(actual.totalSupply).toBe(expected.totalSupply);
  expect(actual.virtualShares).toBe(expected.virtualShares);
  expect(actual.maxRate).toBe(expected.maxRate);
  expect(actual.lastUpdate).toBe(expected.lastUpdate);
  expect(actual.assetBalance).toBe(expected.assetBalance);
  expect(actual.liquidityAdapter).toBe(expected.liquidityAdapter);
  expect(actual.liquidityData).toBe(expected.liquidityData);
  expect(actual.liquidityAllocations).toStrictEqual(
    expected.liquidityAllocations,
  );
  expect(actual.performanceFee).toBe(expected.performanceFee);
  expect(actual.managementFee).toBe(expected.managementFee);
  expect(actual.performanceFeeRecipient).toBe(expected.performanceFeeRecipient);
  expect(actual.managementFeeRecipient).toBe(expected.managementFeeRecipient);
  expect(actual.forceDeallocatePenalties).toStrictEqual(
    expected.forceDeallocatePenalties,
  );

  expect(actual.accrualAdapters.map(adapterIdentity)).toStrictEqual(
    expected.accrualAdapters.map(adapterIdentity),
  );
  actual.accrualAdapters.forEach((adapter, i) => {
    expect(adapter.realAssets(ACCRUAL_TIMESTAMP)).toBe(
      expected.accrualAdapters[i]?.realAssets(ACCRUAL_TIMESTAMP),
    );
  });

  expect(
    actual.accrualLiquidityAdapter &&
      adapterIdentity(actual.accrualLiquidityAdapter),
  ).toStrictEqual(
    expected.accrualLiquidityAdapter &&
      adapterIdentity(expected.accrualLiquidityAdapter),
  );
  if (actual.accrualLiquidityAdapter && expected.accrualLiquidityAdapter)
    expect(actual.accrualLiquidityAdapter.realAssets(ACCRUAL_TIMESTAMP)).toBe(
      expected.accrualLiquidityAdapter.realAssets(ACCRUAL_TIMESTAMP),
    );

  for (const assets of [
    parseUnits("1", 6),
    parseUnits("1000000", 6),
    MathLib.MAX_UINT_256,
  ]) {
    expectSameOutcome(
      () => actual.maxDeposit(assets),
      () => expected.maxDeposit(assets),
    );
  }
  for (const shares of [parseUnits("1", 18), parseUnits("1000000", 18)]) {
    expectSameOutcome(
      () => actual.maxWithdraw(shares),
      () => expected.maxWithdraw(shares),
    );
  }

  const actualAccrual = actual.accrueInterest(ACCRUAL_TIMESTAMP);
  const expectedAccrual = expected.accrueInterest(ACCRUAL_TIMESTAMP);
  expect(actualAccrual.vault._totalAssets).toBe(
    expectedAccrual.vault._totalAssets,
  );
  expect(actualAccrual.vault.totalSupply).toBe(
    expectedAccrual.vault.totalSupply,
  );
  expect(actualAccrual.performanceFeeShares).toBe(
    expectedAccrual.performanceFeeShares,
  );
  expect(actualAccrual.managementFeeShares).toBe(
    expectedAccrual.managementFeeShares,
  );
}

describe("fetchAccrualVaultV2Deployless", () => {
  vaultV2Test(
    "matches fetchAccrualVaultV2 for a MorphoVaultV1 liquidity adapter",
    async ({ client }) => {
      const [deployless, multicall] = await Promise.all([
        fetchAccrualVaultV2Deployless(vaultV2VaultV1, client),
        fetchAccrualVaultV2(vaultV2VaultV1, client, { deployless: false }),
      ]);

      expect(deployless.accrualLiquidityAdapter?.type).toBe(
        "VaultV2MorphoVaultV1Adapter",
      );
      expectEquivalent(deployless, multicall);
    },
  );

  vaultV2Test(
    "matches fetchAccrualVaultV2 for a MorphoMarketV1 liquidity adapter",
    async ({ client }) => {
      const { usdc } = addressesRegistry[client.chain.id];
      const vaultAddress = await deployVaultV2(client as AnvilTestClient, usdc);
      await deployMorphoMarketV1Adapter(
        client as AnvilTestClient,
        vaultAddress,
        "1",
        { marketParams, deposit: parseUnits("1000", 6) },
      );

      const [deployless, multicall] = await Promise.all([
        fetchAccrualVaultV2Deployless(vaultAddress, client),
        fetchAccrualVaultV2(vaultAddress, client, { deployless: false }),
      ]);

      expect(deployless.accrualLiquidityAdapter?.type).toBe(
        "VaultV2MorphoMarketV1Adapter",
      );
      expectEquivalent(deployless, multicall);
    },
  );

  vaultV2Test(
    "matches fetchAccrualVaultV2 for a MorphoMarketV1AdapterV2 liquidity adapter",
    async ({ client }) => {
      const [deployless, multicall] = await Promise.all([
        fetchAccrualVaultV2Deployless(vaultV2MarketV1V2, client),
        fetchAccrualVaultV2(vaultV2MarketV1V2, client, { deployless: false }),
      ]);

      expect(deployless.accrualLiquidityAdapter?.type).toBe(
        "VaultV2MorphoMarketV1AdapterV2",
      );
      expectEquivalent(deployless, multicall);
    },
  );
});
