import {
  type Address,
  decodeFunctionData,
  encodeFunctionData,
  encodeFunctionResult,
  erc20Abi,
  erc4626Abi,
  type Hex,
  isAddressEqual,
  numberToHex,
} from "viem";
import { arc, hyperEvm, mainnet } from "viem/chains";
import { describe, expect, test, vi } from "vitest";
import { simulate } from "../index.js";
import { encodeUint256, simulationClientFor } from "../test-helpers/index.js";
import arcUsdc from "../test-helpers/paired-emitter-arc-usdc.json" with {
  type: "json",
};
import eure from "../test-helpers/paired-emitter-eure.json" with {
  type: "json",
};
import wstHype from "../test-helpers/paired-emitter-wsthype.json" with {
  type: "json",
};

describe.each([
  { fixture: eure, chain: mainnet },
  { fixture: wstHype, chain: hyperEvm },
  { fixture: arcUsdc, chain: arc },
])("simulate recorded paired logs: $fixture.name", ({ fixture, chain }) => {
  test.each([false, true])(
    "declared vault deposit (wrong chain=%s)",
    async (wrongChain) => {
      const primary = fixture.primary as Address;
      const owner = fixture.source.holder as Address;
      const primaryLog = fixture.logs.find((log) =>
        isAddressEqual(log.address as Address, primary),
      )!;
      const vault = `0x${primaryLog.topics[2]!.slice(-40)}` as Address;
      const assets = BigInt(primaryLog.data);
      const deposit = encodeFunctionData({
        abi: erc4626Abi,
        functionName: "deposit",
        args: [assets, owner],
      });
      const blockHash: Hex = `0x${"ab".repeat(32)}`;
      const timestamp = 1_700_000_000n;
      const fetch = vi.fn<typeof globalThis.fetch>(async (_input, init) => {
        const { id, method, params } = JSON.parse(String(init?.body));
        let result: unknown;
        if (method === "eth_getBlockByHash") {
          expect(params).toEqual([blockHash, false]);
          result = {
            number: numberToHex(fixture.source.stateBlock),
            hash: blockHash,
            timestamp: numberToHex(timestamp),
          };
        } else if (method === "eth_getCode") result = "0x6000";
        else if (method === "eth_call") {
          expect(isAddressEqual(params[0].to, vault)).toBe(true);
          expect(params[0]).toMatchObject({
            data: encodeFunctionData({
              abi: erc4626Abi,
              functionName: "asset",
            }),
          });
          result = encodeFunctionResult({
            abi: erc4626Abi,
            functionName: "asset",
            result: primary,
          });
        } else if (method === "eth_simulateV1") {
          const calls = params[0].blockStateCalls[0].calls as {
            to: Address;
            data: Hex;
          }[];
          let deposited = false;
          result = [
            {
              number: numberToHex(fixture.source.simulatedBlock),
              parentHash: blockHash,
              hash: `0x${"cd".repeat(32)}`,
              timestamp: numberToHex(timestamp + 1n),
              calls: calls.map((call) => {
                const transaction = call.data === deposit;
                if (transaction) deposited = true;
                const { functionName, args } = transaction
                  ? { functionName: undefined, args: undefined }
                  : decodeFunctionData({ abi: erc20Abi, data: call.data });
                const retentionRead =
                  functionName === "balanceOf" &&
                  !isAddressEqual(args[0], owner);
                if (!transaction) {
                  expect(functionName).toBe("balanceOf");
                  expect([primary, vault]).toContain(call.to.toLowerCase());
                }
                return {
                  status: "0x1",
                  gasUsed: "0x5208",
                  returnData: transaction
                    ? encodeUint256(1n)
                    : retentionRead
                      ? encodeUint256(0n)
                      : encodeUint256(
                          isAddressEqual(call.to, primary)
                            ? deposited
                              ? assets
                              : assets * 2n
                            : deposited
                              ? 1n
                              : 0n,
                        ),
                  logs: transaction ? fixture.logs : [],
                };
              }),
            },
          ];
        } else throw new Error(`Unexpected RPC method ${method}`);
        return Response.json({ jsonrpc: "2.0", id, result });
      });
      const report = await simulate(
        simulationClientFor(
          "https://rpc.example",
          wrongChain ? (chain.id === 1 ? hyperEvm : mainnet) : chain,
          30_000,
          fetch,
        ),
        {
          block: {
            number: BigInt(fixture.source.stateBlock),
            hash: blockHash,
            timestamp,
          },
          transactions: [{ from: owner, to: vault, data: deposit }],
          limits: {
            operations: [
              {
                type: "vaultV2Deposit",
                vault,
                quote: { assetsPaid: assets, sharesMinted: 1n },
                slippageTolerance: 0n,
              },
            ],
          },
        },
      );
      expect(report.ok).toBe(true);
      expect(report.warnings).toEqual(
        wrongChain
          ? [
              expect.objectContaining({
                code: "UNEXPECTED_TOKEN_TRANSFER",
                token: expect.stringMatching(new RegExp(fixture.paired, "i")),
              }),
            ]
          : [],
      );
      expect(Object.isFrozen(report.warnings)).toBe(true);
      expect(report.verification).toEqual({ retention: "checked" });
      expect(
        fetch.mock.calls.filter(
          ([, init]) =>
            JSON.parse(String(init?.body)).method === "eth_simulateV1",
        ),
      ).toHaveLength(1);
      if (report.ok) {
        expect(
          report.result.transfers.map(({ token }) => token.toLowerCase()),
        ).toEqual(expect.arrayContaining([fixture.primary, fixture.paired]));
        expect(report.result.verification.operations).toHaveLength(1);
        expect(report.result.verification.operations[0]).toMatchObject({
          operation: "vaultV2Deposit",
          checkedLimits: { quote: { assetsPaid: assets, sharesMinted: 1n } },
        });
      }
      const senderWarnings = report.warnings.filter(
        (warning) => warning.code === "UNEXPECTED_TOKEN_TRANSFER",
      );
      expect(senderWarnings).toHaveLength(wrongChain ? 1 : 0);
      if (wrongChain) {
        expect(senderWarnings[0]).toMatchObject({
          code: "UNEXPECTED_TOKEN_TRANSFER",
          severity: "warn",
          token: expect.stringMatching(new RegExp(fixture.paired, "i")),
        });
      }
    },
  );
});
