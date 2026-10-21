import { createMockClient } from "@morpho-org/test/mock";
import { type Address, numberToHex } from "viem";
import { base, mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import {
  InvalidChainIdError,
  RpcTransportError,
  SimulationRevertedError,
  SimulationValidationError,
  SlippageCheckUnavailableError,
} from "../../errors.js";
import { makeBalanceRead } from "../../test-helpers/make-balance-read.js";
import { planExecution } from "../plan/plan-execution.js";
import { parseRequest } from "../request/index.js";
import { parseSimulationResponse } from "./parse-response.js";
import { toServedChainError } from "./served-chain.js";

const nodeError = new Error("header not found");
const OWNER: Address = "0x1111111111111111111111111111111111111111";
const TARGET: Address = "0x2222222222222222222222222222222222222222";
const TOKEN: Address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const STATE_BLOCK = 24_000_000n;
const STATE_BLOCK_HASH: `0x${string}` = `0x${"ab".repeat(32)}`;
const STATE_BLOCK_TIMESTAMP = 1_700_000_000n;
const outage = () =>
  new RpcTransportError("eth_getBlock error: header not found", {
    cause: nodeError,
  });

describe("toServedChainError", () => {
  test("error: InvalidChainIdError when the endpoint serves another chain", async () => {
    const { client } = createMockClient(base);
    const error = outage();

    const relabeled = await toServedChainError({
      client,
      chainId: mainnet.id,
      error,
    });

    expect(relabeled).toBeInstanceOf(InvalidChainIdError);
    expect(relabeled).not.toBeInstanceOf(RpcTransportError);
    expect((relabeled as Error).cause).toBe(nodeError);
  });

  test("error: InvalidChainIdError when quoted-asset evidence is missing on another chain", async () => {
    const { client } = createMockClient(base);
    const error = new SlippageCheckUnavailableError("market not found", {
      cause: nodeError,
    });

    const relabeled = await toServedChainError({
      client,
      chainId: mainnet.id,
      error,
    });

    expect(relabeled).toBeInstanceOf(InvalidChainIdError);
    expect(relabeled).not.toBeInstanceOf(SlippageCheckUnavailableError);
    expect((relabeled as InvalidChainIdError).cause).toBe(error);
  });

  test("error: InvalidChainIdError when a planned state read fails on another chain", async () => {
    const request = parseRequest({
      limits: "none",
      chainId: mainnet.id,
      transactions: [{ from: OWNER, to: TARGET, data: "0x12345678" }],
    });
    const plan = planExecution({
      request,
      owner: OWNER,
      preparations: [],
      reads: [makeBalanceRead(TOKEN, OWNER)],
    });
    const failedReadIndex = plan.calls.findIndex(
      (call) => call.type === "stateRead",
    );
    expect(failedReadIndex).toBeGreaterThanOrEqual(0);
    let missingEvidence: unknown;
    try {
      parseSimulationResponse({
        plan,
        blocks: [
          {
            number: numberToHex(STATE_BLOCK + 1n),
            timestamp: numberToHex(STATE_BLOCK_TIMESTAMP),
            hash: `0x${"cd".repeat(32)}`,
            parentHash: STATE_BLOCK_HASH,
            calls: plan.calls.map((_, index) => ({
              status:
                index === failedReadIndex ? ("0x0" as const) : ("0x1" as const),
              returnData: "0x" as const,
              gasUsed: numberToHex(256n),
              logs: [],
              ...(index === failedReadIndex
                ? { error: { message: "state read failed" } }
                : {}),
            })),
          },
        ],
        stateBlockNumber: STATE_BLOCK,
        stateBlockHash: STATE_BLOCK_HASH,
        stateBlockTimestamp: STATE_BLOCK_TIMESTAMP,
        parentHashCheck: true,
      });
    } catch (error) {
      missingEvidence = error;
    }
    expect(missingEvidence).toBeInstanceOf(SlippageCheckUnavailableError);

    const { client, request: mockRequest } = createMockClient(base);
    const relabeled = await toServedChainError({
      client,
      chainId: mainnet.id,
      error: missingEvidence,
    });

    expect(relabeled).toBeInstanceOf(InvalidChainIdError);
    expect((relabeled as InvalidChainIdError).cause).toBe(missingEvidence);
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({ method: "eth_chainId" }),
      undefined,
    );
  });

  test("error: InvalidChainIdError keeps the contract-code error as cause on another chain", async () => {
    const { client } = createMockClient(base);
    const error = new SimulationValidationError("no contract code");

    const relabeled = await toServedChainError({
      client,
      chainId: mainnet.id,
      error,
    });

    expect(relabeled).toBeInstanceOf(InvalidChainIdError);
    expect((relabeled as Error).cause).toBe(error);
  });

  test("behavior: keeps the contract-code error when the endpoint serves the right chain", async () => {
    const { client } = createMockClient(mainnet);
    const error = new SimulationValidationError("no contract code");

    await expect(
      toServedChainError({ client, chainId: mainnet.id, error }),
    ).resolves.toBe(error);
  });

  test("behavior: keeps missing evidence when the endpoint serves the right chain", async () => {
    const { client } = createMockClient(mainnet);
    const error = new SlippageCheckUnavailableError("market not found");

    await expect(
      toServedChainError({ client, chainId: mainnet.id, error }),
    ).resolves.toBe(error);
  });

  test("behavior: keeps the outage when the endpoint serves the right chain", async () => {
    const { client } = createMockClient(mainnet);
    const error = outage();

    await expect(
      toServedChainError({ client, chainId: mainnet.id, error }),
    ).resolves.toBe(error);
  });

  test("behavior: keeps the outage when the chain probe fails", async () => {
    const handle = createMockClient(base);
    handle.request.mockRejectedValue(new Error("connection refused"));
    const error = outage();

    await expect(
      toServedChainError({ client: handle.client, chainId: mainnet.id, error }),
    ).resolves.toBe(error);
  });

  test("behavior: never probes for a non-bypassable error", async () => {
    const handle = createMockClient(base);
    const error = new SimulationRevertedError("reverted");

    await expect(
      toServedChainError({ client: handle.client, chainId: mainnet.id, error }),
    ).resolves.toBe(error);
    expect(handle.request).not.toHaveBeenCalled();
  });
});
