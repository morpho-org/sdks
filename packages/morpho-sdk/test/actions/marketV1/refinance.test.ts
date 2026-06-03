import { MarketParams } from "@morpho-org/blue-sdk";
import { parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import {
  isRequirementAuthorization,
  MAX_SLIPPAGE_TOLERANCE,
  MorphoClient,
  type VaultReallocation,
} from "../../../src/index.js";
import {
  CbbtcUsdcMarketV1,
  CbbtcUsdcMarketV1Alt,
} from "../../fixtures/marketV1.js";
import { YearnUsdcVaultV1 } from "../../fixtures/vaultV1.js";
import { testInvariants } from "../../helpers/invariants.js";
import {
  borrow,
  supplyCollateral,
  supplyLoan,
} from "../../helpers/marketV1.js";
import { test } from "../../setup.js";

// Two real wstETH/wNative markets sharing the loan + collateral pair but differing oracles, at the pinned fork.
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
          // Widest tolerance so share-price guards don't fail just because the fork is older than wall-clock.
          slippageTolerance: MAX_SLIPPAGE_TOLERANCE,
        });

        // Tolerate either a clean wallet (one auth requirement) or a pre-authorized one (none).
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
    // testInvariants already asserts every bundler3 component ends with 0 balance — nothing left behind.
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
        // Collat-only still needs GA1 authorized: the callback's withdrawCollateral runs onBehalf=user.
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

  // TODO: same-token refinance (loanToken === collateralToken). None exist on mainnet to pin a
  // fork against; needs a custom 1:1-oracle market to exercise the repay-before-withdraw ordering.

  test("assets-mode: targetReallocations supplies liquidity into the target market", async ({
    client,
  }) => {
    const collateralAmount = parseUnits("1", 8); // cbBTC (8 decimals)
    const borrowAmount = parseUnits("1000", 6); // USDC (6 decimals)
    const migrateCollateral = parseUnits("0.4", 8);
    const migrateBorrow = parseUnits("400", 6);
    const reallocationAmount = parseUnits("2000", 6);

    await supplyLoan({
      client,
      chainId: mainnet.id,
      market: CbbtcUsdcMarketV1,
      supplyAmount: borrowAmount * 4n,
    });
    await supplyCollateral({
      client,
      chainId: mainnet.id,
      market: CbbtcUsdcMarketV1,
      collateralAmount,
    });
    await borrow({
      client,
      chainId: mainnet.id,
      market: CbbtcUsdcMarketV1,
      borrowAmount,
    });

    const reallocations: readonly VaultReallocation[] = [
      {
        vault: YearnUsdcVaultV1.address,
        fee: 0n,
        withdrawals: [
          {
            marketParams: CbbtcUsdcMarketV1,
            amount: reallocationAmount,
          },
        ],
      },
    ];

    const {
      markets: {
        target: { initialState: targetInitial, finalState: targetFinal },
      },
    } = await testInvariants({
      client,
      params: {
        markets: {
          source: CbbtcUsdcMarketV1,
          target: CbbtcUsdcMarketV1Alt,
        },
      },
      actionFn: async () => {
        const morphoClient = new MorphoClient(client);
        const sourceEntity = morphoClient.marketV1(
          CbbtcUsdcMarketV1,
          mainnet.id,
        );
        const sourcePosition = await sourceEntity.getPositionData(
          client.account.address,
        );
        const targetEntity = morphoClient.marketV1(
          CbbtcUsdcMarketV1Alt,
          mainnet.id,
        );
        const targetPosition = await targetEntity.getPositionData(
          client.account.address,
        );

        const refi = sourceEntity.refinance({
          userAddress: client.account.address,
          positionData: sourcePosition,
          target: {
            marketParams: CbbtcUsdcMarketV1Alt,
            positionData: targetPosition,
          },
          collateralAmount: migrateCollateral,
          borrowAssets: migrateBorrow,
          slippageTolerance: MAX_SLIPPAGE_TOLERANCE,
          targetReallocations: reallocations,
        });

        const requirements = await refi.getRequirements();
        expect(requirements.length).toBeLessThanOrEqual(1);
        for (const requirement of requirements) {
          if (!isRequirementAuthorization(requirement)) {
            throw new Error("Unexpected non-authorization requirement");
          }
          await client.sendTransaction(requirement);
        }

        const tx = refi.buildTx();
        expect(tx.value).toBe(0n);
        expect(tx.action.args.reallocationFee).toBe(0n);

        await client.sendTransaction(tx);
      },
    });

    // The PA reallocation supplies reallocationAmount into the target; accrual only inflates the delta.
    expect(
      targetFinal.position.market.totalSupplyAssets -
        targetInitial.position.market.totalSupplyAssets,
    ).toBeGreaterThanOrEqual(reallocationAmount);

    expect(targetFinal.position.collateral).toBe(
      targetInitial.position.collateral + migrateCollateral,
    );
    expect(targetFinal.position.borrowShares).toBeGreaterThan(0n);
  });
});
