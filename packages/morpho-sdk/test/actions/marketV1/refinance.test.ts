import { MarketParams } from "@morpho-org/blue-sdk";
import { parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import {
  isRequirementAuthorization,
  MAX_SLIPPAGE_TOLERANCE,
  MorphoClient,
} from "../../../src/index.js";
import { testInvariants } from "../../helpers/invariants.js";
import {
  borrow,
  supplyCollateral,
  supplyLoan,
} from "../../helpers/marketV1.js";
import { test } from "../../setup.js";

// wstETH / wNative — two real Morpho Blue markets sharing the same loan + collateral
// pair but differing oracles. Both exist on mainnet at the fork block configured in
// `test/setup.ts`, so we can use them directly without a `createMarket` hop.
const wstEthWeth_v1 = new MarketParams({
  loanToken: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH (wNative)
  collateralToken: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0", // wstETH
  oracle: "0x2a01EB9496094dA03c4E364Def50f5aD1280AD72",
  irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
  lltv: parseUnits("0.945", 18),
});
const wstEthWeth_v2 = new MarketParams({
  loanToken: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  collateralToken: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0",
  oracle: "0xbD60A6770b27E084E8617335ddE769241B0e71D8",
  irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
  lltv: parseUnits("0.945", 18),
});

describe("RefinanceMarketV1 (fork)", () => {
  test("assets-mode: partial migration ends with zero bundler3 balances", async ({
    client,
  }) => {
    const collateralAmount = parseUnits("5", 18);
    const borrowAmount = parseUnits("1", 18);
    const migrateCollateral = parseUnits("2", 18);
    const migrateBorrow = parseUnits("0.4", 18); // < migrated source debt to keep residual safe

    // Pre-fund both markets with loan-token liquidity so source borrow + target borrow succeed.
    await supplyLoan({
      client,
      chainId: mainnet.id,
      market: wstEthWeth_v2,
      supplyAmount: borrowAmount * 4n,
    });
    await supplyLoan({
      client,
      chainId: mainnet.id,
      market: wstEthWeth_v1,
      supplyAmount: borrowAmount * 4n,
    });

    // Open a source borrow position: supply collateral + borrow.
    await supplyCollateral({
      client,
      chainId: mainnet.id,
      market: wstEthWeth_v2,
      collateralAmount,
    });
    await borrow({
      client,
      chainId: mainnet.id,
      market: wstEthWeth_v2,
      borrowAmount,
    });

    await testInvariants({
      client,
      params: { markets: { source: wstEthWeth_v2, target: wstEthWeth_v1 } },
      actionFn: async () => {
        const morphoClient = new MorphoClient(client);
        const sourceEntity = morphoClient.marketV1(wstEthWeth_v2, mainnet.id);
        const sourcePosition = await sourceEntity.getPositionData(
          client.account.address,
        );
        const targetEntity = morphoClient.marketV1(wstEthWeth_v1, mainnet.id);
        const targetPosition = await targetEntity.getPositionData(
          client.account.address,
        );

        const refi = sourceEntity.refinance({
          userAddress: client.account.address,
          positionData: sourcePosition,
          target: {
            marketParams: wstEthWeth_v1,
            positionData: targetPosition,
          },
          collateralAmount: migrateCollateral,
          borrowAssets: migrateBorrow,
          // The fork is pinned while wall-clock `Time.timestamp()` keeps moving; use the widest
          // SDK-accepted tolerance so share-price guards do not fail only because the pinned fork
          // is older than the test runner.
          slippageTolerance: MAX_SLIPPAGE_TOLERANCE,
        });

        // The `borrow()` setup helper already authorizes GA1. Keep this path tolerant to either
        // a clean wallet (one auth requirement) or a pre-authorized wallet (no requirements).
        const requirements = await refi.getRequirements();
        expect(requirements.length).toBeLessThanOrEqual(1);
        for (const requirement of requirements) {
          if (!isRequirementAuthorization(requirement)) {
            throw new Error("Unexpected non-authorization requirement");
          }
          await client.sendTransaction(requirement);
        }

        await client.sendTransaction(refi.buildTx());
      },
    });
    // testInvariants already asserts every bundler3 component (including GA1) preserves its
    // initial 0 balance for both loan and collateral tokens — i.e. nothing is left behind.
  });

  test("shares-mode: full close overshoot is fully swept, zero bundler3 balances", async ({
    client,
  }) => {
    const collateralAmount = parseUnits("5", 18);
    const borrowAmount = parseUnits("1", 18);

    await supplyLoan({
      client,
      chainId: mainnet.id,
      market: wstEthWeth_v2,
      supplyAmount: borrowAmount * 4n,
    });
    await supplyLoan({
      client,
      chainId: mainnet.id,
      market: wstEthWeth_v1,
      supplyAmount: borrowAmount * 4n,
    });
    await supplyCollateral({
      client,
      chainId: mainnet.id,
      market: wstEthWeth_v2,
      collateralAmount,
    });
    await borrow({
      client,
      chainId: mainnet.id,
      market: wstEthWeth_v2,
      borrowAmount,
    });

    // Mine a few blocks to accrue source interest — shares-mode must overshoot to cover it.
    await client.mine({ blocks: 200 });

    const {
      markets: {
        source: { finalState: sourceFinal },
        target: { finalState: targetFinal, initialState: targetInitial },
      },
    } = await testInvariants({
      client,
      params: { markets: { source: wstEthWeth_v2, target: wstEthWeth_v1 } },
      actionFn: async () => {
        const morphoClient = new MorphoClient(client);
        const sourceEntity = morphoClient.marketV1(wstEthWeth_v2, mainnet.id);
        const sourcePosition = await sourceEntity.getPositionData(
          client.account.address,
        );
        const targetEntity = morphoClient.marketV1(wstEthWeth_v1, mainnet.id);
        const targetPosition = await targetEntity.getPositionData(
          client.account.address,
        );

        const refi = sourceEntity.refinance({
          userAddress: client.account.address,
          positionData: sourcePosition,
          target: {
            marketParams: wstEthWeth_v1,
            positionData: targetPosition,
          },
          collateralAmount,
          borrowShares: sourcePosition.borrowShares, // full close
          // Keep the pinned fork deterministic as wall-clock time moves past its block timestamp.
          slippageTolerance: MAX_SLIPPAGE_TOLERANCE,
        });

        const requirements = await refi.getRequirements();
        expect(requirements.length).toBeLessThanOrEqual(1);
        for (const requirement of requirements) {
          if (!isRequirementAuthorization(requirement)) {
            throw new Error("Unexpected non-authorization requirement");
          }
          await client.sendTransaction(requirement);
        }
        await client.sendTransaction(refi.buildTx());
      },
    });

    // Source position fully closed.
    expect(sourceFinal.position.borrowShares).toBe(0n);
    expect(sourceFinal.position.collateral).toBe(0n);
    // Target now carries the migrated collateral and the migrated debt.
    expect(targetFinal.position.collateral).toBe(
      targetInitial.position.collateral + collateralAmount,
    );
    expect(targetFinal.position.borrowShares).toBeGreaterThan(0n);
  });

  test("collat-only: collateral-only migration ends with zero bundler3 balances", async ({
    client,
  }) => {
    const collateralAmount = parseUnits("3", 18);

    // No source borrow — collat-only refinance is a pure collateral move.
    await supplyCollateral({
      client,
      chainId: mainnet.id,
      market: wstEthWeth_v2,
      collateralAmount,
    });

    const {
      markets: {
        source: { finalState: sourceFinal },
        target: { finalState: targetFinal, initialState: targetInitial },
      },
    } = await testInvariants({
      client,
      params: { markets: { source: wstEthWeth_v2, target: wstEthWeth_v1 } },
      actionFn: async () => {
        const morphoClient = new MorphoClient(client);
        const sourceEntity = morphoClient.marketV1(wstEthWeth_v2, mainnet.id);
        const sourcePosition = await sourceEntity.getPositionData(
          client.account.address,
        );
        const targetEntity = morphoClient.marketV1(wstEthWeth_v1, mainnet.id);
        const targetPosition = await targetEntity.getPositionData(
          client.account.address,
        );

        const refi = sourceEntity.refinance({
          userAddress: client.account.address,
          positionData: sourcePosition,
          target: {
            marketParams: wstEthWeth_v1,
            positionData: targetPosition,
          },
          collateralAmount,
        });

        const requirements = await refi.getRequirements();
        // Collat-only refinance still flash-borrows via target.supplyCollateral with a
        // callback that withdraws source collateral, which requires GA1 to be authorized
        // on Morpho (the WithdrawCollateral leg in the callback runs `onBehalf=user`).
        expect(requirements).toHaveLength(1);
        const auth = requirements[0]!;
        if (!isRequirementAuthorization(auth)) {
          throw new Error("Authorization requirement not found");
        }
        await client.sendTransaction(auth);
        await client.sendTransaction(refi.buildTx());
      },
    });

    expect(sourceFinal.position.collateral).toBe(0n);
    expect(sourceFinal.position.borrowShares).toBe(0n);
    expect(targetFinal.position.collateral).toBe(
      targetInitial.position.collateral + collateralAmount,
    );
    expect(targetFinal.position.borrowShares).toBe(0n);
  });

  // TODO: same-token refinance (loanToken === collateralToken). Morpho permits such
  // markets but they're degenerate (no LLTV semantics) and none exist on mainnet to
  // pin a fork against. Covering this case requires deploying a custom market with a
  // 1:1 oracle on the fork; tracked as a follow-up so the encoded skim ordering
  // (loan-leg repay BEFORE collateral withdraw) is exercised end-to-end.

  // TODO: fork test for `targetReallocations` non-empty path. The encoding contract
  // (top-level `reallocateTo` prepended before `morphoSupplyCollateral`, fee
  // accumulated into `tx.value`) is covered by `src/actions/marketV1/refinance.test.ts`
  // and `src/entities/marketV1/marketV1.refinance.test.ts`. A fork e2e requires a
  // refinance-eligible market pair (same loan + collat tokens, different
  // oracle/IRM/LLTV) whose target is publicly allocated by a vault that has source
  // markets to withdraw from at the pinned block — see `reallocations.test.ts` for
  // an analogous setup on the borrow path (`CbbtcUsdcMarketV1` + `SteakhouseUsdcVaultV1`).
});
