import { MarketParams, SharesMath } from "@morpho-org/blue-sdk";
import { morphoViemExtension } from "@morpho-org/morpho-sdk";
import { type AnvilTestClient, getErpcForkUrl } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import { type Address, parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { expect } from "vitest";
import { simulate, toSimulationLimits } from "../../src/index.js";

/**
 * Pinned after the bundles contracts (BlueBundlesV1, VaultBundlesV1,
 * VaultExitBundlesV1) were deployed on mainnet, matching
 * `pipeline.integration.test.ts`.
 */
const test = createViemTest(mainnet, {
  forkUrl: getErpcForkUrl(mainnet.id, process.env.ERPC_SECRET),
  chainId: mainnet.id,
  forkBlockNumber: 25_832_676n,
}).extend<{ client: AnvilTestClient<typeof mainnet> }>({
  client: async ({ client }, use) => {
    await client.setCode({ address: client.account.address, bytecode: "0x" });
    await use(client);
  },
});

const configFor = (client: { transport: { url?: string } }) => ({
  chains: new Map([[mainnet.id, { simulateV1Url: client.transport.url! }]]),
});

const USDC: Address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const CBBTC: Address = "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf";
// A distinct recipient keeps the fee out of the measured wallet delta.
const FEE_RECIPIENT: Address = "0x000000000000000000000000000000000000dEaD";

const CbbtcUsdcBlue = new MarketParams({
  collateralToken: CBBTC,
  loanToken: USDC,
  oracle: "0xA6D6950c9F177F1De7f7757FB33539e3Ec60182a",
  irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
  lltv: 860_000_000_000_000_000n,
});

const executeRequirements = async (
  client: AnvilTestClient<typeof mainnet>,
  action: { getRequirements: () => Promise<readonly unknown[]> },
) => {
  for (const requirement of await action.getRequirements()) {
    if (
      typeof requirement !== "object" ||
      requirement === null ||
      !("to" in requirement)
    )
      continue;
    const tx = requirement as {
      to: Address;
      data: `0x${string}`;
      value?: bigint;
    };
    await client.sendTransaction({
      account: client.account,
      to: tx.to,
      data: tx.data,
      value: tx.value,
    });
  }
};

describe.sequential("toSimulationLimits — real builder round-trips", () => {
  test("referral-fee blueWithdraw, supplyCollateralBorrow and repayWithdrawCollateral pass their derived limits", async ({
    client,
  }) => {
    const morpho = client.extend(
      morphoViemExtension({ supportSignature: false }),
    ).morpho;
    const market = morpho.blue(CbbtcUsdcBlue, mainnet.id);
    const user = client.account.address;
    const deadline = BigInt(Math.floor(Date.now() / 1_000)) + 3_600n;

    // Open a supply position and a collateralized borrow on-chain so each
    // leg's builder has a live position to normalize.
    const supplyAssets = parseUnits("5", 6);
    const collateralAssets = parseUnits("0.05", 8);
    const borrowAssets = parseUnits("3", 6);
    await client.deal({
      erc20: USDC,
      amount: supplyAssets + borrowAssets * 3n,
    });
    await client.deal({ erc20: CBBTC, amount: collateralAssets });

    const open = market.supplyCollateralBorrow({
      userAddress: user,
      positionData: await market.getPositionData(user),
      collateralAssets,
      borrowAssets,
      deadline,
    });
    await executeRequirements(client, open);
    const openTx = open.buildTx();
    await client.sendTransaction({
      account: client.account,
      to: openTx.to,
      data: openTx.data,
      value: openTx.value,
    });

    const supply = market.supply({
      userAddress: user,
      assets: supplyAssets,
      deadline,
    });
    await executeRequirements(client, supply);
    const supplyTx = supply.buildTx();
    await client.sendTransaction({
      account: client.account,
      to: supplyTx.to,
      data: supplyTx.data,
      value: supplyTx.value,
    });

    // Referral-fee partial withdraw by assets: the helper derives the payout
    // floor net of the fee, while the share cap comes from `expected` —
    // assets mode cannot derive `sharesBurned`. A half withdraw burns well
    // under the position's `supplyShares`.
    const supplyPosition = await market.getPositionData(user);
    const withdraw = market.withdraw({
      userAddress: user,
      positionData: supplyPosition,
      assets: supplyAssets / 2n,
      referralFeePct: 10_000_000_000_000_000n,
      referralFeeRecipient: FEE_RECIPIENT,
      deadline,
    });
    const withdrawTx = withdraw.buildTx();
    const withdrawResult = await simulate(configFor(client), {
      chainId: mainnet.id,
      limits: toSimulationLimits(withdrawTx.action, {
        owner: user,
        expected: { sharesBurned: supplyPosition.supplyShares },
      }),
      transactions: [
        {
          from: user,
          to: withdrawTx.to,
          data: withdrawTx.data,
          value: withdrawTx.value,
        },
      ],
    });
    expect(withdrawResult.verification.operations[0]?.operation).toBe(
      "blueWithdraw",
    );

    // A fresh referral-fee borrow-only combined use: the helper emits the 1n
    // caps on the inactive supply/pay-in legs, derives the payout floor net
    // of the fee, and the debt-share cap comes from `expected`.
    const borrow = market.supplyCollateralBorrow({
      userAddress: user,
      positionData: await market.getPositionData(user),
      collateralAssets: 0n,
      borrowAssets,
      referralFeePct: 10_000_000_000_000_000n,
      referralFeeRecipient: FEE_RECIPIENT,
      deadline,
    });
    const borrowTx = borrow.buildTx();
    const borrowResult = await simulate(configFor(client), {
      chainId: mainnet.id,
      limits: toSimulationLimits(borrowTx.action, {
        owner: user,
        expected: {
          sharesMinted: SharesMath.toShares(borrowAssets, 0n, 0n, "Up") * 2n,
        },
      }),
      transactions: [
        {
          from: user,
          to: borrowTx.to,
          data: borrowTx.data,
          value: borrowTx.value,
        },
      ],
    });
    expect(borrowResult.verification.operations[0]?.operation).toBe(
      "blueSupplyCollateralBorrow",
    );

    // Exact-share repay + collateral withdraw: both legs are active, so the
    // wallet-proceeds floor is underivable and comes from `expected` — on
    // this different-token market the net gain in the received (collateral)
    // token is the withdrawn amount.
    const repayPosition = await market.getPositionData(user);
    const repay = market.repayWithdrawCollateral({
      userAddress: user,
      positionData: repayPosition,
      repayShares: repayPosition.borrowShares,
      collateralAssets: collateralAssets / 4n,
      deadline,
    });
    await executeRequirements(client, repay);
    const repayTx = repay.buildTx();
    const repayResult = await simulate(configFor(client), {
      chainId: mainnet.id,
      limits: toSimulationLimits(repayTx.action, {
        owner: user,
        expected: { assetsReceived: collateralAssets / 4n },
      }),
      transactions: [
        {
          from: user,
          to: repayTx.to,
          data: repayTx.data,
          value: repayTx.value,
        },
      ],
    });
    expect(repayResult.verification.operations[0]?.operation).toBe(
      "blueRepayWithdrawCollateral",
    );
  }, 240_000);
});
