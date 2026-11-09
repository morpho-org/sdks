import { MarketParams } from "@morpho-org/blue-sdk";
import {
  blueWithdrawBuyCallback,
  morphoViemExtension,
} from "@morpho-org/morpho-sdk";
import {
  blueAbi,
  midnightBlueBuyCallbackFactoryAbi,
} from "@morpho-org/morpho-sdk/abis";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { type AnvilTestClient, getErpcForkUrl } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import { type Address, maxUint256, parseUnits, zeroHash } from "viem";
import { mainnet } from "viem/chains";
import { expect } from "vitest";
import {
  ConsumerLimitViolationError,
  simulate,
  toSimulationLimits,
} from "../../src/index.js";

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
const blue = getChainAddress(mainnet.id, "blue");
const marketParams = new MarketParams({
  loanToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  collateralToken: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
  oracle: "0xA6D6950c9F177F1De7f7757FB33539e3Ec60182a",
  irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
  lltv: 860_000_000_000_000_000n,
});

test("verifies callback burns and owner proceeds independently on a real Blue withdrawal", async ({
  client,
}) => {
  const owner = client.account.address;
  const factory = getChainAddress(mainnet.id, "midnightBlueBuyCallbackFactory");
  const { result: callback, request } = await client.simulateContract({
    address: factory,
    abi: midnightBlueBuyCallbackFactoryAbi,
    functionName: "createBlueBuyCallback",
    args: [owner, zeroHash],
  });
  await client.writeContract(request);
  const assets = parseUnits("1000", 6);
  await client.deal({ erc20: marketParams.loanToken, amount: assets });
  await client.approve({
    address: marketParams.loanToken,
    args: [blue, maxUint256],
  });
  await client.writeContract({
    address: blue,
    abi: blueAbi,
    functionName: "supply",
    args: [marketParams, assets, 0n, callback, "0x"],
  });
  const market = client
    .extend(morphoViemExtension())
    .morpho.blue(marketParams, mainnet.id);
  const positionData = await market.getPositionData(callback);
  const action = market.withdrawBuyCallback({
    userAddress: owner,
    callbackAddress: callback,
    positionData,
  });
  await expect(action.getRequirements()).resolves.toEqual([]);
  const tx = action.buildTx();
  const limits = toSimulationLimits(tx.action, {
    owner,
    onBehalf: callback,
    expected: { assetsReceived: positionData.supplyAssets },
  });
  const config = {
    chains: new Map([[mainnet.id, { simulateV1Url: client.transport.url! }]]),
  };
  const run = (
    transaction: { to: Address; data: `0x${string}`; value: bigint },
    selectedLimits = limits,
  ) =>
    simulate(config, {
      chainId: mainnet.id,
      mode: "final",
      transactions: [
        {
          from: owner,
          to: transaction.to,
          data: transaction.data,
          value: transaction.value,
        },
      ],
      limits: selectedLimits,
    });
  const result = await run(tx);
  expect(result.verification.operations[0]).toMatchObject({
    operation: "blueWithdraw",
    account: callback,
    receiver: owner,
    checkedLimits: {
      quote: {
        sharesBurned: positionData.supplyShares,
        assetsReceived: positionData.supplyAssets,
      },
    },
  });

  const diverted = blueWithdrawBuyCallback({
    market: { chainId: mainnet.id, marketParams },
    args: {
      callbackAddress: callback,
      userAddress: "0x00000000000000000000000000000000000000A2",
      shares: positionData.supplyShares,
    },
  });
  await expect(run(diverted)).rejects.toBeInstanceOf(
    ConsumerLimitViolationError,
  );
  const shareOnlyFailure = {
    operations: limits.operations.map((limit) => ({
      ...limit,
      quote: {
        assetsReceived: 1n,
        sharesBurned: positionData.supplyShares / 2n,
      },
    })),
  };
  await expect(run(tx, shareOnlyFailure)).rejects.toBeInstanceOf(
    ConsumerLimitViolationError,
  );
});
