import { createPublicClient, encodeFunctionData, erc20Abi, http } from "viem";
import { monad } from "viem/chains";
import { describe, expect, test } from "vitest";
import { RpcTransportError, simulate } from "../../src/index.js";

const MONAD_RPC = "https://rpc.monad.xyz";

const paramsFor = (callGasLimit?: bigint) => ({
  config: {
    timeoutMs: 30_000,
    chains: new Map([
      [
        143,
        {
          simulateV1Url: MONAD_RPC,
          ...(callGasLimit !== undefined && { callGasLimit }),
        },
      ],
    ]),
  },
  params: {
    chainId: 143,
    limits: "none" as const,
    transactions: Array.from(
      { length: 11 },
      () =>
        ({
          from: "0x000000000000000000000000000000000000dEaD",
          to: "0x000000000000000000000000000000000000bEEF",
          data: "0x",
          value: 0n,
        }) as const,
    ),
  },
});

// Live public Monad RPC; opt in with MONAD_LIVE_RPC=1 because Anvil can't reproduce Monad's per-call gas cap.
describe.skipIf(!process.env.MONAD_LIVE_RPC)("Monad per-call gas limit", () => {
  test("caller state overrides let a contract sender use its own storage through delegation", async () => {
    const client = createPublicClient({
      chain: monad,
      transport: http(MONAD_RPC),
    });
    const sender: `0x${string}` = "0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A";
    const scratch = "0x0000000000000000000000000000000000001235";
    const block = await client.getBlock({ blockTag: "finalized" });
    const code = await client.getBytecode({
      address: sender,
      blockNumber: block.number,
    });
    expect(code).toBeDefined();
    expect(
      await client.getBytecode({ address: scratch, blockNumber: block.number }),
    ).toBeUndefined();
    const balance = await client.readContract({
      address: sender,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [sender],
      blockNumber: block.number,
    });
    const { config } = paramsFor(30_000_000n);
    const request = {
      chainId: monad.id,
      block: {
        number: block.number,
        hash: block.hash,
        timestamp: block.timestamp,
      },
      limits: "none" as const,
      transactions: [
        {
          from: sender,
          to: sender,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [sender],
          }),
        },
      ],
    };
    const error = await simulate(config, request).catch(
      (cause: unknown) => cause,
    );
    expect(error).toBeInstanceOf(RpcTransportError);
    let message = "";
    for (
      let cause: unknown = error;
      cause instanceof Error;
      cause = cause.cause
    )
      message += cause.message;
    expect(message).toContain("sender not eoa");
    const result = await simulate(config, {
      ...request,
      stateOverrides: {
        [sender]: { code: `0xef0100${scratch.slice(2)}` },
        [scratch]: { code: code! },
      },
    });
    expect(BigInt(result.calls[0]!.returnData)).toBe(balance);
  }, 60_000);

  test("without callGasLimit, Monad rejects 11 calls", async () => {
    // Monad reserves 150M gas per call when `gas` is omitted;
    // 11 calls exceed its 1.6B simulation cap.
    const { config, params } = paramsFor();
    const error = await simulate(config, params).catch(
      (cause: unknown) => cause,
    );
    expect(error).toBeInstanceOf(RpcTransportError);

    let causeMessage = "";
    for (
      let cause: unknown = error;
      cause instanceof Error;
      cause = cause.cause
    ) {
      causeMessage += cause.message;
    }
    expect(causeMessage).toContain("Gas limit for simulation exceeded");
  }, 60_000);

  test("with callGasLimit 30_000_000n, the same 11 transactions succeed", async () => {
    const { config, params } = paramsFor(30_000_000n);
    const result = await simulate(config, params);
    expect(result.simulationTxs).toHaveLength(11);
  }, 60_000);
});
