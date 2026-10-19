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
