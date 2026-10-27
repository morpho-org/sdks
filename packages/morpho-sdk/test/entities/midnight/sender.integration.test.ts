import { Market, MarketParams, midnightAbi } from "@morpho-org/midnight-sdk";
import { ChainId, getChainAddress } from "@morpho-org/morpho-ts";
import { getErpcForkUrl } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import {
  type Address,
  BaseError,
  decodeErrorResult,
  encodeErrorResult,
  erc20Abi,
  type Hex,
  maxUint256,
  parseEther,
  zeroAddress,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { describe, expect } from "vitest";
import { midnightRedeem, morphoViemExtension } from "../../../src/index.js";

const test = createViemTest(base, {
  forkUrl: getErpcForkUrl(base.id, process.env.ERPC_SECRET),
  forkBlockNumber: 52_252_000n,
  stepsTracing: false,
});

const usdc = getChainAddress(ChainId.BaseMainnet, "usdc");
const wNative = getChainAddress(ChainId.BaseMainnet, "wNative");
const midnight = getChainAddress(ChainId.BaseMainnet, "midnight");
const marketData = new Market({
  params: new MarketParams({
    chainId: base.id,
    midnight,
    loanToken: usdc,
    collateralParams: [
      {
        token: wNative,
        lltv: 770000000000000000n,
        liquidationCursor: 300000000000000000n,
        oracle: "0x0000000000000000000000000000000000080000" as Address,
      },
    ],
    maturity: 2_000_000_000n,
    rcfThreshold: 0n,
    enterGate: zeroAddress,
    liquidatorGate: zeroAddress,
  }),
  totalUnits: 1_000_000n,
  lossFactor: 0n,
  withdrawable: 1_000_000n,
  continuousFeeCredit: 0n,
  settlementFeeCbps: [0, 0, 0, 0, 0, 0, 0],
  continuousFee: 0,
  tickSpacing: 1,
});
const collateralAssets = parseEther("2");

const midnightRevertName = (error: unknown) => {
  expect(error).toBeInstanceOf(BaseError);
  const revert = (error as BaseError).walk(
    (e) => typeof (e as { data?: unknown }).data === "string",
  ) as { data: Hex } | null;
  return (
    revert &&
    decodeErrorResult({ abi: midnightAbi, data: revert.data }).errorName
  );
};

const unauthorizedRevert = encodeErrorResult({
  abi: midnightAbi,
  errorName: "Unauthorized",
});

// Control: the same call sent by accountAddress must not revert Unauthorized; any other
// outcome (success or another revert, possibly without data) is fine.
const isUnauthorizedRevert = async (call: Promise<unknown>) => {
  const error = await call.then(
    () => undefined,
    (cause: unknown) => cause,
  );
  if (!(error instanceof BaseError)) return false;
  const revert = error.walk(
    (e) => typeof (e as { data?: unknown }).data === "string",
  ) as { data: Hex } | null;
  return revert?.data === unauthorizedRevert;
};

describe("Midnight transaction sender", () => {
  test("behavior: supplyCollateral sent by another account reverts Unauthorized", async ({
    client,
  }) => {
    const accountAddress = client.account.address;
    const other = privateKeyToAccount(generatePrivateKey()).address;
    await client.setBalance({ address: other, value: parseEther("1") });
    for (const account of [accountAddress, other]) {
      await client.deal({ erc20: wNative, amount: collateralAssets, account });
      await client.writeContract({
        account,
        address: wNative,
        abi: erc20Abi,
        functionName: "approve",
        args: [midnight, maxUint256],
      });
    }
    const output = client
      .extend(morphoViemExtension())
      .morpho.midnight(base.id)
      .supplyCollateral({
        marketData,
        accountAddress,
        collateralAssets,
      });

    // Midnight pulls the collateral from msg.sender and only lets accountAddress or its
    // operators supply for it, so another sender reverts even with its own allowance.
    const tx = output.buildTx();
    const error = await client
      .call({ ...tx, account: other })
      .catch((cause: unknown) => cause);

    expect(midnightRevertName(error)).toBe("Unauthorized");
    expect(
      await isUnauthorizedRevert(
        client.call({ ...tx, account: accountAddress }),
      ),
    ).toBe(false);
  });

  test("behavior: redeem sent by another account reverts Unauthorized", async ({
    client,
  }) => {
    const other = privateKeyToAccount(generatePrivateKey()).address;
    const tx = midnightRedeem({
      chainId: base.id,
      market: marketData.params,
      units: 1n,
      onBehalf: client.account.address,
    });

    const error = await client
      .call({ ...tx, account: other })
      .catch((cause: unknown) => cause);

    expect(midnightRevertName(error)).toBe("Unauthorized");
    expect(
      await isUnauthorizedRevert(
        client.call({ ...tx, account: client.account.address }),
      ),
    ).toBe(false);
  });
});
