import { createMockClient } from "@morpho-org/test/mock";
import {
  BaseError,
  ContractFunctionRevertedError,
  ContractFunctionZeroDataError,
  createPublicClient,
  custom,
  encodeErrorResult,
  encodeFunctionData,
  encodeFunctionResult,
  HttpRequestError,
  http,
  InternalRpcError,
  InvalidParamsRpcError,
  LimitExceededRpcError,
  offchainLookupAbiItem,
  parseAbi,
  RawContractError,
  SocketClosedError,
  type StateOverride,
  TimeoutError,
} from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test, vi } from "vitest";
import {
  OVERRIDE_TIMEOUT_MS,
  OVERRIDE_TRANSPORT_BACKOFF_MS,
  OVERRIDE_UNSUPPORTED_TTL_MS,
  QUERY_ADDRESS,
  readDeploylessContract,
  shouldFallbackFromOverride,
} from "./deployless.js";

const abi = parseAbi([
  "function query() view returns (uint256)",
  "error UnknownOfFactory(address factory)",
]);
const parameters = {
  abi,
  code: "0x6000",
  deployedCode: "0x00",
  functionName: "query",
} as const;
const result = encodeFunctionResult({
  abi,
  functionName: "query",
  result: 42n,
});
const decodedRevert = new ContractFunctionRevertedError({
  abi,
  functionName: "query",
  data: encodeErrorResult({
    abi,
    errorName: "UnknownOfFactory",
    args: [QUERY_ADDRESS],
  }),
});

describe("shouldFallbackFromOverride", () => {
  test.each([
    new ContractFunctionZeroDataError({ functionName: "query" }),
    new InvalidParamsRpcError(new Error("unsupported override")),
    new TimeoutError({ url: "https://rpc.test", body: {} }),
    new HttpRequestError({ url: "https://rpc.test", status: 400 }),
    new ContractFunctionRevertedError({ abi, functionName: "query" }),
    new ContractFunctionRevertedError({
      abi,
      functionName: "query",
      message: "state overrides unsupported",
    }),
  ])("behavior: retries unsupported overrides ($name)", (error) => {
    expect(
      shouldFallbackFromOverride(
        new BaseError("read failed", { cause: error }),
      ),
    ).toBe(true);
  });

  test.each([
    decodedRevert,
    new ContractFunctionRevertedError({
      abi,
      functionName: "query",
      data: "0x12345678",
    }),
    new ContractFunctionRevertedError({
      abi,
      functionName: "query",
      data: encodeErrorResult({
        abi: parseAbi(["error Error(string)"]),
        errorName: "Error",
        args: ["invalid query"],
      }),
    }),
    new HttpRequestError({ url: "https://rpc.test", status: 429 }),
    new HttpRequestError({ url: "https://rpc.test", status: 503 }),
    new LimitExceededRpcError(new Error("rate limited")),
    new Error("programming error"),
  ])(
    "error: preserves query verdicts and transport failures ($name)",
    (error) => {
      expect(shouldFallbackFromOverride(error)).toBe(false);
    },
  );
});

describe.sequential("readDeploylessContract", () => {
  describe.each([false, true])(
    "deadline race (caller overrides=%s)",
    (caller) => {
      const readParameters = {
        ...parameters,
        stateOverride: caller
          ? [
              {
                address: "0x0000000000000000000000000000000000000001" as const,
                balance: 1n,
              },
            ]
          : undefined,
      };
      const creationResults = [
        encodeFunctionResult({ abi, functionName: "query", result: 99n }),
        new InternalRpcError(new Error("EVM error CreateContractSizeLimit")),
      ];
      function delayed(outcome: typeof result | Error, delay: number) {
        return new Promise<typeof result>((resolve, reject) => {
          setTimeout(() => {
            if (outcome instanceof Error) reject(outcome);
            else resolve(outcome);
          }, delay);
        });
      }
      function expectCreation(
        read: Promise<unknown>,
        creation: typeof result | Error,
      ) {
        return creation instanceof Error
          ? expect(read).rejects.toSatisfy(
              (error: unknown) =>
                error instanceof BaseError &&
                error.walk((cause) => cause === creation) === creation,
            )
          : expect(read).resolves.toBe(99n);
      }

      test.each(creationResults)(
        "behavior: a late override success beats pending creation (%s)",
        async (creation) => {
          vi.useFakeTimers();
          try {
            const handle = createMockClient(mainnet);
            handle.request.mockImplementationOnce(() =>
              delayed(result, OVERRIDE_TIMEOUT_MS + 1_000),
            );
            handle.request.mockImplementationOnce(() =>
              delayed(creation, 2_000),
            );
            handle.request.mockResolvedValue(result);
            const read = readDeploylessContract(handle.client, readParameters);
            await vi.advanceTimersByTimeAsync(OVERRIDE_TIMEOUT_MS);
            expect(handle.request).toHaveBeenCalledTimes(2);
            expect(
              handle.request.mock.calls[1]?.[0].params?.[0],
            ).not.toHaveProperty("to");
            if (caller) {
              expect(
                await readDeploylessContract(handle.client, parameters),
              ).toBe(42n);
              expect(
                handle.request.mock.calls[2]?.[0].params?.[0],
              ).toHaveProperty("to", QUERY_ADDRESS);
            }
            await vi.advanceTimersByTimeAsync(1_000);
            await expect(read).resolves.toBe(42n);
            await vi.advanceTimersByTimeAsync(1_000);
            expect(
              await readDeploylessContract(handle.client, parameters),
            ).toBe(42n);
            expect(
              handle.request.mock.lastCall?.[0].params?.[0],
            ).toHaveProperty("to", QUERY_ADDRESS);
          } finally {
            vi.useRealTimers();
          }
        },
      );

      test.each(
        (
          [
            "0x",
            "0x01",
            decodedRevert,
            new InternalRpcError(new Error("late failure")),
          ] as const
        ).flatMap((override) =>
          creationResults.map((creation) => ({ override, creation })),
        ),
      )(
        "behavior: a late override failure ($override) waits for creation ($creation)",
        async ({ override, creation }) => {
          vi.useFakeTimers();
          try {
            const handle = createMockClient(mainnet);
            handle.request.mockImplementationOnce(() =>
              delayed(override, OVERRIDE_TIMEOUT_MS + 1_000),
            );
            handle.request.mockImplementationOnce(() =>
              delayed(creation, 2_000),
            );
            const read = readDeploylessContract(handle.client, readParameters);
            const settled = vi.fn();
            void read.then(settled, settled);
            const outcome = expectCreation(read, creation);
            await vi.advanceTimersByTimeAsync(OVERRIDE_TIMEOUT_MS + 1_000);
            expect(settled).not.toHaveBeenCalled();
            await vi.advanceTimersByTimeAsync(1_000);
            await outcome;
          } finally {
            vi.useRealTimers();
          }
        },
      );

      test.each(creationResults)(
        "behavior: creation settling first ignores a later override result (%s)",
        async (creation) => {
          vi.useFakeTimers();
          try {
            const handle = createMockClient(mainnet);
            handle.request.mockImplementationOnce(() =>
              delayed(result, OVERRIDE_TIMEOUT_MS + 1_000),
            );
            handle.request.mockImplementationOnce(() => delayed(creation, 500));
            const read = readDeploylessContract(handle.client, readParameters);
            const outcome = expectCreation(read, creation);
            await vi.advanceTimersByTimeAsync(OVERRIDE_TIMEOUT_MS + 500);
            await outcome;
            await vi.advanceTimersByTimeAsync(500);
          } finally {
            vi.useRealTimers();
          }
        },
      );
    },
  );

  test.each([
    result,
    new InternalRpcError(new Error("EVM error CreateContractSizeLimit")),
  ])(
    "behavior: a late decoded override success clears its deadline verdict after creation returns %s",
    async (creation) => {
      vi.useFakeTimers();
      try {
        const handle = createMockClient(mainnet);
        handle.request.mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              setTimeout(() => resolve(result), OVERRIDE_TIMEOUT_MS + 1_000);
            }),
        );
        if (creation instanceof Error)
          handle.request.mockRejectedValueOnce(creation);
        else handle.request.mockResolvedValueOnce(creation);
        handle.request.mockResolvedValue(result);
        const read = readDeploylessContract(handle.client, parameters);
        const outcome =
          creation instanceof Error
            ? expect(read).rejects.toBeInstanceOf(BaseError)
            : expect(read).resolves.toBe(42n);
        await vi.advanceTimersByTimeAsync(OVERRIDE_TIMEOUT_MS);
        await outcome;
        expect(handle.request).toHaveBeenCalledTimes(2);
        expect(await readDeploylessContract(handle.client, parameters)).toBe(
          42n,
        );
        expect(
          handle.request.mock.calls[2]?.[0].params?.[0],
        ).not.toHaveProperty("to");
        await vi.advanceTimersByTimeAsync(1_000);
        expect(await readDeploylessContract(handle.client, parameters)).toBe(
          42n,
        );
        expect(handle.request).toHaveBeenCalledTimes(4);
        expect(handle.request.mock.calls[3]?.[0].params?.[0]).toHaveProperty(
          "to",
          QUERY_ADDRESS,
        );
      } finally {
        vi.useRealTimers();
      }
    },
  );

  test.each([
    "0x",
    "0x01",
    new InternalRpcError(new Error("late rejection")),
    decodedRevert,
    new TimeoutError({ url: "https://rpc.test", body: {} }),
    new BaseError("wrapped timeout", {
      cause: new TimeoutError({ url: "https://rpc.test", body: {} }),
    }),
  ] as const)(
    "error: a late empty, malformed or rejected override keeps its verdict (%s)",
    async (outcome) => {
      vi.useFakeTimers();
      const unhandledRejection = vi.fn();
      process.on("unhandledRejection", unhandledRejection);
      try {
        const handle = createMockClient(mainnet);
        handle.request.mockImplementationOnce(
          () =>
            new Promise((resolve, reject) => {
              setTimeout(() => {
                if (outcome instanceof Error) reject(outcome);
                else resolve(outcome);
              }, OVERRIDE_TIMEOUT_MS + 1_000);
            }),
        );
        handle.request.mockResolvedValue(result);
        const read = readDeploylessContract(handle.client, parameters);
        await vi.advanceTimersByTimeAsync(OVERRIDE_TIMEOUT_MS);
        await expect(read).resolves.toBe(42n);
        await vi.advanceTimersByTimeAsync(1_000);
        expect(await readDeploylessContract(handle.client, parameters)).toBe(
          42n,
        );
        expect(handle.request).toHaveBeenCalledTimes(3);
        expect(
          handle.request.mock.calls[2]?.[0].params?.[0],
        ).not.toHaveProperty("to");
        expect(unhandledRejection).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(OVERRIDE_UNSUPPORTED_TTL_MS - 1_001);
        expect(await readDeploylessContract(handle.client, parameters)).toBe(
          42n,
        );
        expect(
          handle.request.mock.calls[3]?.[0].params?.[0],
        ).not.toHaveProperty("to");
        await vi.advanceTimersByTimeAsync(1);
        expect(await readDeploylessContract(handle.client, parameters)).toBe(
          42n,
        );
        expect(handle.request.mock.calls[4]?.[0].params?.[0]).toHaveProperty(
          "to",
          QUERY_ADDRESS,
        );
      } finally {
        process.off("unhandledRejection", unhandledRejection);
        vi.useRealTimers();
      }
    },
  );

  test.each([
    new HttpRequestError({ url: "https://rpc.test", status: 429 }),
    new HttpRequestError({ url: "https://rpc.test", status: 503 }),
    new SocketClosedError({ url: "wss://rpc.test" }),
  ])(
    "behavior: a late non-timeout transport failure replaces its verdict with a short backoff (%s)",
    async (failure) => {
      vi.useFakeTimers();
      const unhandledRejection = vi.fn();
      process.on("unhandledRejection", unhandledRejection);
      try {
        const handle = createMockClient(mainnet);
        handle.request.mockImplementationOnce(
          () =>
            new Promise((_resolve, reject) => {
              setTimeout(() => reject(failure), OVERRIDE_TIMEOUT_MS + 1_000);
            }),
        );
        handle.request.mockResolvedValue(result);
        const read = readDeploylessContract(handle.client, parameters);
        await vi.advanceTimersByTimeAsync(OVERRIDE_TIMEOUT_MS);
        await expect(read).resolves.toBe(42n);
        expect(await readDeploylessContract(handle.client, parameters)).toBe(
          42n,
        );
        expect(
          handle.request.mock.calls[2]?.[0].params?.[0],
        ).not.toHaveProperty("to");
        await vi.advanceTimersByTimeAsync(1_000);
        expect(await readDeploylessContract(handle.client, parameters)).toBe(
          42n,
        );
        expect(handle.request).toHaveBeenCalledTimes(4);
        expect(
          handle.request.mock.calls[3]?.[0].params?.[0],
        ).not.toHaveProperty("to");
        await vi.advanceTimersByTimeAsync(OVERRIDE_TRANSPORT_BACKOFF_MS - 1);
        expect(await readDeploylessContract(handle.client, parameters)).toBe(
          42n,
        );
        expect(
          handle.request.mock.calls[4]?.[0].params?.[0],
        ).not.toHaveProperty("to");
        await vi.advanceTimersByTimeAsync(1);
        expect(await readDeploylessContract(handle.client, parameters)).toBe(
          42n,
        );
        expect(handle.request).toHaveBeenCalledTimes(6);
        expect(handle.request.mock.calls[5]?.[0].params?.[0]).toHaveProperty(
          "to",
          QUERY_ADDRESS,
        );
        expect(unhandledRejection).not.toHaveBeenCalled();
      } finally {
        process.off("unhandledRejection", unhandledRejection);
        vi.useRealTimers();
      }
    },
  );

  test("behavior: a late transport failure cannot renew an expired verdict", async () => {
    vi.useFakeTimers();
    try {
      const handle = createMockClient(mainnet);
      handle.request.mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            setTimeout(
              () =>
                reject(
                  new HttpRequestError({
                    url: "https://rpc.test",
                    status: 502,
                  }),
                ),
              OVERRIDE_TIMEOUT_MS + OVERRIDE_UNSUPPORTED_TTL_MS + 1,
            );
          }),
      );
      handle.request.mockResolvedValue(result);
      const read = readDeploylessContract(handle.client, parameters);
      await vi.advanceTimersByTimeAsync(OVERRIDE_TIMEOUT_MS);
      await expect(read).resolves.toBe(42n);
      await vi.advanceTimersByTimeAsync(OVERRIDE_UNSUPPORTED_TTL_MS + 1);
      expect(await readDeploylessContract(handle.client, parameters)).toBe(42n);
      expect(handle.request).toHaveBeenCalledTimes(3);
      expect(handle.request.mock.calls[2]?.[0].params?.[0]).toHaveProperty(
        "to",
        QUERY_ADDRESS,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  test.each([502, 504])(
    "behavior: repeated gateway-ended hangs suppress probes within each backoff (%i)",
    async (status) => {
      vi.useFakeTimers();
      try {
        const handle = createMockClient(mainnet);
        handle.request.mockResolvedValue(result);
        for (let cycle = 0; cycle < 2; cycle++) {
          const before = handle.request.mock.calls.length;
          handle.request.mockImplementationOnce(
            () =>
              new Promise((_resolve, reject) => {
                setTimeout(
                  () =>
                    reject(
                      new HttpRequestError({ url: "https://rpc.test", status }),
                    ),
                  OVERRIDE_TIMEOUT_MS + 1_000,
                );
              }),
          );
          const read = readDeploylessContract(handle.client, parameters);
          await vi.advanceTimersByTimeAsync(OVERRIDE_TIMEOUT_MS);
          await expect(read).resolves.toBe(42n);
          expect(
            handle.request.mock.calls[before]?.[0].params?.[0],
          ).toHaveProperty("to", QUERY_ADDRESS);
          await vi.advanceTimersByTimeAsync(1_000);
          expect(await readDeploylessContract(handle.client, parameters)).toBe(
            42n,
          );
          await vi.advanceTimersByTimeAsync(OVERRIDE_TRANSPORT_BACKOFF_MS - 1);
          expect(await readDeploylessContract(handle.client, parameters)).toBe(
            42n,
          );
          expect(handle.request).toHaveBeenCalledTimes(before + 4);
          for (const [call] of handle.request.mock.calls.slice(before + 1)) {
            expect(call.params?.[0]).not.toHaveProperty("to");
          }
          await vi.advanceTimersByTimeAsync(1);
        }
        expect(await readDeploylessContract(handle.client, parameters)).toBe(
          42n,
        );
        expect(handle.request).toHaveBeenCalledTimes(9);
        expect(handle.request.mock.calls[8]?.[0].params?.[0]).toHaveProperty(
          "to",
          QUERY_ADDRESS,
        );
      } finally {
        vi.useRealTimers();
      }
    },
  );

  test.each(
    ["deadline", "empty", "early empty"].flatMap((newer) =>
      [
        result,
        new HttpRequestError({ url: "https://rpc.test", status: 429 }),
      ].map((late) => ({ newer, late })),
    ),
  )(
    "behavior: concurrent probe settlements preserve verdict ownership ($newer, $late)",
    async ({ newer, late }) => {
      vi.useFakeTimers();
      try {
        const handle = createMockClient(mainnet);
        handle.request.mockImplementationOnce(
          () =>
            new Promise((resolve, reject) => {
              setTimeout(() => {
                if (late instanceof Error) reject(late);
                else resolve(late);
              }, OVERRIDE_TIMEOUT_MS + 1_000);
            }),
        );
        handle.request.mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              if (newer !== "deadline")
                setTimeout(
                  () => resolve("0x"),
                  newer === "early empty" ? 1_000 : OVERRIDE_TIMEOUT_MS,
                );
            }),
        );
        handle.request.mockResolvedValue(result);
        const first = readDeploylessContract(handle.client, parameters);
        const second = readDeploylessContract(handle.client, parameters);
        await vi.advanceTimersByTimeAsync(OVERRIDE_TIMEOUT_MS);
        await expect(Promise.all([first, second])).resolves.toEqual([42n, 42n]);
        expect(handle.request).toHaveBeenCalledTimes(4);
        await vi.advanceTimersByTimeAsync(1_000);
        expect(await readDeploylessContract(handle.client, parameters)).toBe(
          42n,
        );
        expect(handle.request).toHaveBeenCalledTimes(5);
        const afterLate = handle.request.mock.calls[4]?.[0].params?.[0];
        if (newer === "deadline" && !(late instanceof Error)) {
          expect(afterLate).toHaveProperty("to", QUERY_ADDRESS);
        } else {
          expect(afterLate).not.toHaveProperty("to");
        }
        await vi.advanceTimersByTimeAsync(OVERRIDE_TRANSPORT_BACKOFF_MS + 1);
        expect(await readDeploylessContract(handle.client, parameters)).toBe(
          42n,
        );
        expect(handle.request).toHaveBeenCalledTimes(6);
        const afterBackoff = handle.request.mock.calls[5]?.[0].params?.[0];
        if (newer === "deadline") {
          expect(afterBackoff).toHaveProperty("to", QUERY_ADDRESS);
        } else {
          expect(afterBackoff).not.toHaveProperty("to");
        }
      } finally {
        vi.useRealTimers();
      }
    },
  );

  test.each(
    ["provisional", "backoff", "empty", "confirmed"].flatMap((verdict) =>
      [false, true].map((caller) => ({ verdict, caller })),
    ),
  )(
    "behavior: on-time override success clears only a newer plain-probe deadline ($verdict, caller=$caller)",
    async ({ verdict, caller }) => {
      vi.useFakeTimers();
      try {
        const handle = createMockClient(mainnet);
        handle.request.mockImplementationOnce(
          () =>
            new Promise((resolve, reject) => {
              if (verdict === "backoff") {
                setTimeout(
                  () =>
                    reject(
                      new HttpRequestError({
                        url: "https://rpc.test",
                        status: 429,
                      }),
                    ),
                  OVERRIDE_TIMEOUT_MS + 500,
                );
              } else if (verdict === "empty" || verdict === "confirmed") {
                setTimeout(() => {
                  if (verdict === "empty") resolve("0x");
                  else
                    reject(
                      new InvalidParamsRpcError(
                        new Error("unsupported override"),
                      ),
                    );
                }, 3_000);
              }
            }),
        );
        const first = readDeploylessContract(handle.client, parameters);
        await vi.advanceTimersByTimeAsync(2_000);
        handle.request.mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              setTimeout(() => resolve(result), 4_000);
            }),
        );
        handle.request.mockResolvedValue(result);
        const second = readDeploylessContract(handle.client, {
          ...parameters,
          stateOverride: caller
            ? [{ address: mainnet.contracts.multicall3.address, balance: 1n }]
            : undefined,
        });
        expect(handle.request.mock.calls[1]?.[0].params?.[0]).toHaveProperty(
          "to",
          QUERY_ADDRESS,
        );
        await vi.advanceTimersByTimeAsync(OVERRIDE_TIMEOUT_MS - 2_000);
        await expect(first).resolves.toBe(42n);
        const beforeSuccess = handle.request.mock.calls.length;
        expect(await readDeploylessContract(handle.client, parameters)).toBe(
          42n,
        );
        expect(handle.request).toHaveBeenCalledTimes(beforeSuccess + 1);
        expect(
          handle.request.mock.calls[beforeSuccess]?.[0].params?.[0],
        ).not.toHaveProperty("to");
        await vi.advanceTimersByTimeAsync(1_000);
        await expect(second).resolves.toBe(42n);
        const before = handle.request.mock.calls.length;
        expect(await readDeploylessContract(handle.client, parameters)).toBe(
          42n,
        );
        expect(handle.request).toHaveBeenCalledTimes(before + 1);
        const call = handle.request.mock.calls[before]?.[0].params?.[0];
        if (!caller && (verdict === "provisional" || verdict === "backoff")) {
          expect(call).toHaveProperty("to", QUERY_ADDRESS);
        } else {
          expect(call).not.toHaveProperty("to");
        }
      } finally {
        vi.useRealTimers();
      }
    },
  );

  test.each(
    [
      { late: result, replace: false },
      { late: result, replace: true },
      { late: "0x", replace: false },
      {
        late: new HttpRequestError({ url: "https://rpc.test", status: 429 }),
        replace: false,
      },
      {
        late: new TimeoutError({ url: "https://rpc.test", body: {} }),
        replace: false,
      },
    ].flatMap((scenario) =>
      [false, true].map((ownerBackoff) => ({ ...scenario, ownerBackoff })),
    ),
  )(
    "behavior: a second timed-out probe only clears its shared deadline on success ($late, replacement=$replace, backoff=$ownerBackoff)",
    async ({ late, replace, ownerBackoff }) => {
      vi.useFakeTimers();
      try {
        const handle = createMockClient(mainnet);
        handle.request.mockImplementationOnce(
          () =>
            new Promise((_resolve, reject) => {
              if (ownerBackoff) {
                setTimeout(
                  () =>
                    reject(
                      new HttpRequestError({
                        url: "https://rpc.test",
                        status: 429,
                      }),
                    ),
                  OVERRIDE_TIMEOUT_MS + 500,
                );
              }
            }),
        );
        handle.request.mockImplementationOnce(
          () =>
            new Promise((resolve, reject) => {
              setTimeout(() => {
                if (late instanceof Error) reject(late);
                else resolve(late);
              }, OVERRIDE_TIMEOUT_MS + 1_000);
            }),
        );
        if (replace) {
          handle.request.mockImplementationOnce(
            () =>
              new Promise((resolve) => {
                setTimeout(() => resolve("0x"), OVERRIDE_TIMEOUT_MS - 500);
              }),
          );
        }
        handle.request.mockResolvedValue(result);
        const reads = [
          readDeploylessContract(handle.client, parameters),
          readDeploylessContract(handle.client, parameters),
        ];
        if (replace) {
          await vi.advanceTimersByTimeAsync(1_000);
          reads.push(readDeploylessContract(handle.client, parameters));
        }
        await vi.advanceTimersByTimeAsync(
          OVERRIDE_TIMEOUT_MS + (replace ? 0 : 1_000),
        );
        await expect(Promise.all(reads)).resolves.toEqual(reads.map(() => 42n));
        for (const delay of [0, OVERRIDE_TRANSPORT_BACKOFF_MS + 1]) {
          await vi.advanceTimersByTimeAsync(delay);
          const before = handle.request.mock.calls.length;
          expect(await readDeploylessContract(handle.client, parameters)).toBe(
            42n,
          );
          expect(handle.request).toHaveBeenCalledTimes(before + 1);
          const call = handle.request.mock.calls[before]?.[0].params?.[0];
          if (!replace && (late === result || (ownerBackoff && delay > 0))) {
            expect(call).toHaveProperty("to", QUERY_ADDRESS);
          } else {
            expect(call).not.toHaveProperty("to");
          }
        }
      } finally {
        vi.useRealTimers();
      }
    },
  );

  test.each([
    result,
    "0x",
    decodedRevert,
    new HttpRequestError({ url: "https://rpc.test", status: 429 }),
    new TimeoutError({ url: "https://rpc.test", body: {} }),
  ])(
    "behavior: a probe timing out during active backoff preserves its deadline ownership (%s)",
    async (late) => {
      vi.useFakeTimers();
      try {
        const handle = createMockClient(mainnet);
        handle.request.mockImplementationOnce(
          () =>
            new Promise((_resolve, reject) => {
              setTimeout(
                () =>
                  reject(
                    new HttpRequestError({
                      url: "https://rpc.test",
                      status: 429,
                    }),
                  ),
                OVERRIDE_TIMEOUT_MS + 500,
              );
            }),
        );
        const first = readDeploylessContract(handle.client, parameters);
        await vi.advanceTimersByTimeAsync(1_000);
        handle.request.mockImplementationOnce(
          () =>
            new Promise((resolve, reject) => {
              setTimeout(() => {
                if (late instanceof Error) reject(late);
                else resolve(late);
              }, OVERRIDE_TIMEOUT_MS + 1_000);
            }),
        );
        handle.request.mockResolvedValue(result);
        const second = readDeploylessContract(handle.client, parameters);
        expect(handle.request.mock.calls[1]?.[0].params?.[0]).toHaveProperty(
          "to",
          QUERY_ADDRESS,
        );
        await vi.advanceTimersByTimeAsync(OVERRIDE_TIMEOUT_MS - 500);
        await expect(first).resolves.toBe(42n);
        expect(handle.request).toHaveBeenCalledTimes(3);
        await vi.advanceTimersByTimeAsync(500);
        await expect(second).resolves.toBe(42n);
        expect(handle.request).toHaveBeenCalledTimes(4);
        await vi.advanceTimersByTimeAsync(1_000);
        for (const [delay, expired] of [
          [0, false],
          [OVERRIDE_TRANSPORT_BACKOFF_MS - 1_501, false],
          [1, true],
        ] as const) {
          await vi.advanceTimersByTimeAsync(delay);
          const before = handle.request.mock.calls.length;
          expect(await readDeploylessContract(handle.client, parameters)).toBe(
            42n,
          );
          expect(handle.request).toHaveBeenCalledTimes(before + 1);
          const call = handle.request.mock.calls[before]?.[0].params?.[0];
          if (late === result || expired) {
            expect(call).toHaveProperty("to", QUERY_ADDRESS);
          } else {
            expect(call).not.toHaveProperty("to");
          }
        }
      } finally {
        vi.useRealTimers();
      }
    },
  );

  test.each(
    [false, true].flatMap((creationRejects) =>
      [false, true].map((lateSuccessFirst) => ({
        creationRejects,
        lateSuccessFirst,
      })),
    ),
  )(
    "behavior: an older creation confirmation preserves a newer deadline verdict (creation rejects=$creationRejects, late success first=$lateSuccessFirst)",
    async ({ creationRejects, lateSuccessFirst }) => {
      vi.useFakeTimers();
      try {
        const handle = createMockClient(mainnet);
        handle.request.mockRejectedValueOnce(
          new InvalidParamsRpcError(new Error("unsupported override")),
        );
        handle.request.mockImplementationOnce(
          () =>
            new Promise((resolve, reject) => {
              setTimeout(
                () => {
                  if (creationRejects) reject(decodedRevert);
                  else resolve(result);
                },
                OVERRIDE_TIMEOUT_MS + (lateSuccessFirst ? 2_000 : 1_000),
              );
            }),
        );
        const first = readDeploylessContract(handle.client, parameters).then(
          (value) => value,
          (error: unknown) => error,
        );
        await vi.advanceTimersByTimeAsync(0);
        handle.request.mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              setTimeout(
                () => resolve(result),
                OVERRIDE_TIMEOUT_MS + (lateSuccessFirst ? 1_000 : 2_000),
              );
            }),
        );
        handle.request.mockResolvedValue(result);
        const second = readDeploylessContract(handle.client, parameters);
        await vi.advanceTimersByTimeAsync(OVERRIDE_TIMEOUT_MS);
        await expect(second).resolves.toBe(42n);
        await vi.advanceTimersByTimeAsync(1_000);
        expect(await readDeploylessContract(handle.client, parameters)).toBe(
          42n,
        );
        expect(handle.request).toHaveBeenCalledTimes(5);
        const intermediateCall = handle.request.mock.calls[4]?.[0].params?.[0];
        if (lateSuccessFirst) {
          expect(intermediateCall).toHaveProperty("to", QUERY_ADDRESS);
        } else {
          expect(intermediateCall).not.toHaveProperty("to");
        }
        await vi.advanceTimersByTimeAsync(1_000);
        if (creationRejects) expect(await first).toBeInstanceOf(BaseError);
        else expect(await first).toBe(42n);
        expect(await readDeploylessContract(handle.client, parameters)).toBe(
          42n,
        );
        expect(handle.request).toHaveBeenCalledTimes(6);
        expect(handle.request.mock.calls[5]?.[0].params?.[0]).toHaveProperty(
          "to",
          QUERY_ADDRESS,
        );
      } finally {
        vi.useRealTimers();
      }
    },
  );

  test("error: a late rejection is handled even after creation has rejected", async () => {
    vi.useFakeTimers();
    const unhandledRejection = vi.fn();
    process.on("unhandledRejection", unhandledRejection);
    try {
      const handle = createMockClient(mainnet);
      handle.request.mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            setTimeout(
              () => reject(new Error("late failure")),
              OVERRIDE_TIMEOUT_MS + 1_000,
            );
          }),
      );
      handle.request.mockRejectedValueOnce(decodedRevert);
      const read = expect(
        readDeploylessContract(handle.client, parameters),
      ).rejects.toBeInstanceOf(BaseError);
      await vi.advanceTimersByTimeAsync(OVERRIDE_TIMEOUT_MS);
      await read;
      await vi.advanceTimersByTimeAsync(1_000);
      expect(unhandledRejection).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandledRejection);
      vi.useRealTimers();
    }
  });

  test.each([0, 3])(
    "behavior: default HTTP retries with %i fast failures distinguish transport and SDK timeouts",
    async (fastFailures) => {
      vi.useFakeTimers();
      try {
        let remainingFastFailures = fastFailures;
        const reply: typeof fetch = async (_input, init) => {
          const call = JSON.parse(init?.body as string);
          return Response.json({ jsonrpc: "2.0", id: call.id, result });
        };
        const fetchFn = vi.fn<typeof fetch>((input, init) => {
          const call = JSON.parse(init?.body as string);
          if (!call.params[0].to) return reply(input, init);
          if (remainingFastFailures-- > 0)
            return Promise.resolve(
              new Response("unavailable", { status: 503 }),
            );
          return new Promise((_resolve, reject) => {
            init?.signal?.addEventListener(
              "abort",
              () => reject(new DOMException("aborted", "AbortError")),
              { once: true },
            );
          });
        });
        const client = createPublicClient({
          chain: mainnet,
          transport: http("https://rpc.test", { timeout: 3_000, fetchFn }),
        });
        const read = readDeploylessContract(client, parameters);
        await vi.advanceTimersByTimeAsync(
          fastFailures ? 4_050 : OVERRIDE_TIMEOUT_MS,
        );
        await expect(read).resolves.toBe(42n);
        expect(fetchFn).toHaveBeenCalledTimes(fastFailures ? 5 : 3);
        await vi.runAllTimersAsync();
        fetchFn.mockImplementation(reply);
        const before = fetchFn.mock.calls.length;
        expect(await readDeploylessContract(client, parameters)).toBe(42n);
        const next = JSON.parse(
          fetchFn.mock.calls[before]?.[1]?.body as string,
        );
        if (fastFailures)
          expect(next.params[0]).toHaveProperty("to", QUERY_ADDRESS);
        else expect(next.params[0]).not.toHaveProperty("to");
      } finally {
        vi.useRealTimers();
      }
    },
  );

  test("behavior: hanging override retries creation bytecode after five seconds", async () => {
    vi.useFakeTimers();
    try {
      const handle = createMockClient(mainnet);
      handle.request.mockImplementationOnce(() => new Promise(() => {}));
      handle.request.mockResolvedValueOnce(result);
      const read = readDeploylessContract(handle.client, parameters);
      await vi.advanceTimersByTimeAsync(OVERRIDE_TIMEOUT_MS - 1);
      expect(handle.request).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await expect(read).resolves.toBe(42n);
      expect(handle.request).toHaveBeenCalledTimes(2);
      expect(handle.request.mock.calls[1]?.[0].params?.[0]).not.toHaveProperty(
        "to",
      );
      expect(vi.getTimerCount()).toBe(0);
      handle.request.mockResolvedValueOnce(result);
      const nextRead = readDeploylessContract(handle.client, parameters);
      await vi.advanceTimersByTimeAsync(0);
      expect(handle.request).toHaveBeenCalledTimes(3);
      expect(handle.request.mock.calls[2]?.[0].params?.[0]).not.toHaveProperty(
        "to",
      );
      await expect(nextRead).resolves.toBe(42n);
    } finally {
      vi.useRealTimers();
    }
  });

  test("behavior: runtime overrides bypass deployless multicall batching", async () => {
    const handle = createMockClient(mainnet);
    const batch = { multicall: { deployless: true } } as const;
    const client = createPublicClient({
      chain: mainnet,
      batch,
      transport: custom({ request: handle.request }, { retryCount: 0 }),
    });
    handle.request.mockResolvedValue(result);
    expect(await readDeploylessContract(client, parameters)).toBe(42n);
    expect(handle.request).toHaveBeenCalledTimes(1);
    expect(handle.request.mock.calls[0]?.[0].params?.[0]).toMatchObject({
      to: QUERY_ADDRESS,
    });
    expect(handle.request.mock.calls[0]?.[0].params?.[2]).toEqual({
      [QUERY_ADDRESS]: { code: parameters.deployedCode },
    });
    expect(client.batch).toEqual(batch);
  });

  test("behavior: runtime query reverts never trigger CCIP requests", async () => {
    const handle = createMockClient(mainnet);
    const request = vi.fn(async () => "0x" as const);
    const client = createPublicClient({
      chain: mainnet,
      ccipRead: { request },
      transport: custom({ request: handle.request }, { retryCount: 0 }),
    });
    handle.request.mockRejectedValueOnce(
      new RawContractError({
        data: encodeErrorResult({
          abi: [offchainLookupAbiItem],
          errorName: "OffchainLookup",
          args: [
            QUERY_ADDRESS,
            ["https://ccip.test/{data}"],
            "0x",
            "0x00000000",
            "0x",
          ],
        }),
      }),
    );
    await expect(
      readDeploylessContract(client, {
        ...parameters,
        abi: [...abi, offchainLookupAbiItem],
      }),
    ).rejects.toBeInstanceOf(BaseError);
    expect(request).not.toHaveBeenCalled();
    expect(client.ccipRead).toEqual({ request });
    expect(handle.request).toHaveBeenCalledTimes(1);
  });

  test("default: runtime override preserves caller overrides", async () => {
    const handle = createMockClient(mainnet);
    handle.request.mockResolvedValue(result);
    const stateOverride: StateOverride = [
      { address: "0x0000000000000000000000000000000000000001", balance: 1n },
    ];
    expect(
      await readDeploylessContract(handle.client, {
        ...parameters,
        stateOverride,
      }),
    ).toBe(42n);
    expect(handle.request).toHaveBeenCalledTimes(1);
    expect(handle.request.mock.calls[0]?.[0]).toEqual({
      method: "eth_call",
      params: [
        {
          to: QUERY_ADDRESS,
          data: encodeFunctionData({ abi, functionName: "query" }),
        },
        "latest",
        {
          "0x0000000000000000000000000000000000000001": { balance: "0x1" },
          [QUERY_ADDRESS]: { code: parameters.deployedCode },
        },
      ],
    });
    expect(stateOverride).toEqual([
      { address: "0x0000000000000000000000000000000000000001", balance: 1n },
    ]);
  });

  test.each(
    [
      "0x",
      new InvalidParamsRpcError(new Error("combined override rejected")),
    ].flatMap((failure) =>
      [result, decodedRevert].map((outcome) => ({ failure, outcome })),
    ),
  )(
    "behavior: caller overrides cannot disable plain overrides ($failure, $outcome)",
    async ({ failure, outcome }) => {
      const handle = createMockClient(mainnet);
      const stateOverride: StateOverride = [
        { address: "0x0000000000000000000000000000000000000001", balance: 1n },
      ];
      if (failure instanceof Error)
        handle.request.mockRejectedValueOnce(failure);
      else handle.request.mockResolvedValueOnce(failure);
      if (outcome instanceof Error)
        handle.request.mockRejectedValueOnce(outcome);
      else handle.request.mockResolvedValueOnce(outcome);
      const read = readDeploylessContract(handle.client, {
        ...parameters,
        stateOverride,
      });
      if (outcome instanceof Error)
        await expect(read).rejects.toBeInstanceOf(BaseError);
      else await expect(read).resolves.toBe(42n);
      expect(handle.request.mock.calls[1]?.[0].params?.[0]).not.toHaveProperty(
        "to",
      );
      expect(handle.request.mock.calls[1]?.[0].params?.[2]).toEqual({
        [stateOverride[0]!.address]: { balance: "0x1" },
      });
      handle.request.mockResolvedValue(result);
      expect(await readDeploylessContract(handle.client, parameters)).toBe(42n);
      expect(handle.request).toHaveBeenCalledTimes(3);
      expect(handle.request.mock.calls[2]?.[0].params?.[0]).toHaveProperty(
        "to",
        QUERY_ADDRESS,
      );
    },
  );

  test("behavior: a caller override deadline and late transport failure do not disable plain overrides", async () => {
    vi.useFakeTimers();
    try {
      const handle = createMockClient(mainnet);
      handle.request.mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            setTimeout(
              () =>
                reject(
                  new HttpRequestError({
                    url: "https://rpc.test",
                    status: 502,
                  }),
                ),
              OVERRIDE_TIMEOUT_MS + 1_000,
            );
          }),
      );
      handle.request.mockResolvedValue(result);
      const read = readDeploylessContract(handle.client, {
        ...parameters,
        stateOverride: [
          {
            address: "0x0000000000000000000000000000000000000001",
            balance: 1n,
          },
        ],
      });
      await vi.advanceTimersByTimeAsync(OVERRIDE_TIMEOUT_MS);
      await expect(read).resolves.toBe(42n);
      expect(handle.request.mock.calls[1]?.[0].params?.[0]).not.toHaveProperty(
        "to",
      );
      expect(await readDeploylessContract(handle.client, parameters)).toBe(42n);
      expect(handle.request.mock.calls[2]?.[0].params?.[0]).toHaveProperty(
        "to",
        QUERY_ADDRESS,
      );
      await vi.advanceTimersByTimeAsync(1_000);
      expect(await readDeploylessContract(handle.client, parameters)).toBe(42n);
      expect(handle.request).toHaveBeenCalledTimes(4);
      expect(handle.request.mock.calls[3]?.[0].params?.[0]).toHaveProperty(
        "to",
        QUERY_ADDRESS,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  test.each([
    "0x",
    new InvalidParamsRpcError(new Error("unsupported override")),
    new InternalRpcError(new Error("state overrides unsupported")),
    new TimeoutError({ url: "https://rpc.test", body: {} }),
  ])(
    "behavior: creation fallback after override failure (%s)",
    async (failure) => {
      const handle = createMockClient(mainnet);
      if (failure instanceof Error)
        handle.request.mockRejectedValueOnce(failure);
      else handle.request.mockResolvedValueOnce(failure);
      handle.request.mockResolvedValueOnce(result);
      expect(await readDeploylessContract(handle.client, parameters)).toBe(42n);
      expect(handle.request).toHaveBeenCalledTimes(2);
      expect(handle.request.mock.calls[0]?.[0].params?.[0]).toMatchObject({
        to: QUERY_ADDRESS,
      });
      expect(handle.request.mock.calls[1]?.[0].params?.[0]).not.toHaveProperty(
        "to",
      );
    },
  );

  test.each([
    "0x",
    new InvalidParamsRpcError(new Error("unsupported override")),
    new InternalRpcError(new Error("state overrides unsupported")),
    new ContractFunctionZeroDataError({ functionName: "query" }),
  ])(
    "behavior: remembers unsupported overrides per client (%s)",
    async (failure) => {
      const handle = createMockClient(mainnet);
      if (failure instanceof Error)
        handle.request.mockRejectedValueOnce(failure);
      else handle.request.mockResolvedValueOnce(failure);
      handle.request.mockResolvedValue(result);
      expect(await readDeploylessContract(handle.client, parameters)).toBe(42n);
      expect(await readDeploylessContract(handle.client, parameters)).toBe(42n);
      expect(handle.request).toHaveBeenCalledTimes(3);
      expect(handle.request.mock.calls[2]?.[0].params?.[0]).not.toHaveProperty(
        "to",
      );

      const other = createMockClient(mainnet);
      other.request.mockResolvedValue(result);
      expect(await readDeploylessContract(other.client, parameters)).toBe(42n);
      expect(other.request.mock.calls[0]?.[0].params?.[0]).toHaveProperty(
        "to",
        QUERY_ADDRESS,
      );
    },
  );

  test("behavior: retries overrides when the unsupported verdict expires", async () => {
    vi.useFakeTimers();
    try {
      const handle = createMockClient(mainnet);
      handle.request.mockResolvedValueOnce("0x").mockResolvedValue(result);
      await readDeploylessContract(handle.client, parameters);
      await vi.advanceTimersByTimeAsync(OVERRIDE_UNSUPPORTED_TTL_MS - 1);
      await readDeploylessContract(handle.client, parameters);
      expect(handle.request.mock.calls[2]?.[0].params?.[0]).not.toHaveProperty(
        "to",
      );
      await vi.advanceTimersByTimeAsync(1);
      await readDeploylessContract(handle.client, parameters);
      expect(handle.request).toHaveBeenCalledTimes(4);
      expect(handle.request.mock.calls[3]?.[0].params?.[0]).toHaveProperty(
        "to",
        QUERY_ADDRESS,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  test.each([
    new RawContractError({ data: "0x" }),
    new ContractFunctionRevertedError({ abi, functionName: "query" }),
    new ContractFunctionZeroDataError({ functionName: "query" }),
    new InternalRpcError(new Error("execution reverted")),
    new InvalidParamsRpcError(new Error("same rejection")),
  ])(
    "error: matching creation failure does not disable overrides (%s)",
    async (failure) => {
      const handle = createMockClient(mainnet);
      handle.request.mockRejectedValueOnce(failure);
      handle.request.mockRejectedValueOnce(failure);
      await expect(
        readDeploylessContract(handle.client, parameters),
      ).rejects.toBeInstanceOf(BaseError);
      expect(handle.request).toHaveBeenCalledTimes(2);
      handle.request.mockResolvedValue(result);
      expect(await readDeploylessContract(handle.client, parameters)).toBe(42n);
      expect(handle.request).toHaveBeenCalledTimes(3);
      expect(handle.request.mock.calls[2]?.[0].params?.[0]).toHaveProperty(
        "to",
        QUERY_ADDRESS,
      );
    },
  );

  test.each(
    [
      new RawContractError({ data: "0x" }),
      new ContractFunctionZeroDataError({ functionName: "query" }),
    ].flatMap((failure) =>
      [
        new InternalRpcError(new Error("EVM error CreateContractSizeLimit")),
        decodedRevert,
        result,
      ].map((outcome) => ({ failure, outcome })),
    ),
  )(
    "behavior: a different creation outcome confirms unsupported overrides ($failure, $outcome)",
    async ({ failure, outcome }) => {
      const handle = createMockClient(mainnet);
      handle.request.mockRejectedValueOnce(failure);
      if (outcome instanceof Error) {
        handle.request.mockRejectedValueOnce(outcome);
        await expect(
          readDeploylessContract(handle.client, parameters),
        ).rejects.toBeInstanceOf(BaseError);
      } else {
        handle.request.mockResolvedValueOnce(outcome);
        expect(await readDeploylessContract(handle.client, parameters)).toBe(
          42n,
        );
      }
      handle.request.mockResolvedValue(result);
      expect(await readDeploylessContract(handle.client, parameters)).toBe(42n);
      expect(handle.request).toHaveBeenCalledTimes(3);
      expect(handle.request.mock.calls[2]?.[0].params?.[0]).not.toHaveProperty(
        "to",
      );
    },
  );

  test("error: a creation transport failure does not confirm unsupported overrides", async () => {
    const handle = createMockClient(mainnet);
    handle.request.mockRejectedValueOnce(new RawContractError({ data: "0x" }));
    handle.request.mockRejectedValueOnce(
      new HttpRequestError({ url: "https://rpc.test", status: 429 }),
    );
    await expect(
      readDeploylessContract(handle.client, parameters),
    ).rejects.toBeInstanceOf(BaseError);
    handle.request.mockResolvedValue(result);
    expect(await readDeploylessContract(handle.client, parameters)).toBe(42n);
    expect(handle.request.mock.calls[2]?.[0].params?.[0]).toHaveProperty(
      "to",
      QUERY_ADDRESS,
    );
  });

  test("behavior: a transport timeout retries creation without marking overrides unsupported", async () => {
    const handle = createMockClient(mainnet);
    handle.request.mockRejectedValueOnce(
      new TimeoutError({ url: "https://rpc.test", body: {} }),
    );
    handle.request.mockResolvedValue(result);
    expect(await readDeploylessContract(handle.client, parameters)).toBe(42n);
    expect(await readDeploylessContract(handle.client, parameters)).toBe(42n);
    expect(handle.request).toHaveBeenCalledTimes(3);
    expect(handle.request.mock.calls[2]?.[0].params?.[0]).toHaveProperty(
      "to",
      QUERY_ADDRESS,
    );
  });

  test.each([
    decodedRevert,
    new HttpRequestError({ url: "https://rpc.test", status: 429 }),
    new HttpRequestError({ url: "https://rpc.test", status: 503 }),
    new SocketClosedError({ url: "wss://rpc.test" }),
  ])("error: no creation retry for %s", async (error) => {
    const handle = createMockClient(mainnet);
    handle.request.mockRejectedValue(error);
    await expect(
      readDeploylessContract(handle.client, parameters),
    ).rejects.toBeInstanceOf(BaseError);
    expect(handle.request).toHaveBeenCalledTimes(1);
    handle.request.mockResolvedValue(result);
    expect(await readDeploylessContract(handle.client, parameters)).toBe(42n);
    expect(handle.request).toHaveBeenCalledTimes(2);
    expect(handle.request.mock.calls[1]?.[0].params?.[0]).toHaveProperty(
      "to",
      QUERY_ADDRESS,
    );
  });

  test("behavior: caller placement collision skips override", async () => {
    const handle = createMockClient(mainnet);
    handle.request.mockResolvedValue(result);
    const stateOverride = [{ address: QUERY_ADDRESS, balance: 1n }];
    expect(
      await readDeploylessContract(handle.client, {
        ...parameters,
        stateOverride,
      }),
    ).toBe(42n);
    expect(handle.request).toHaveBeenCalledTimes(1);
    expect(handle.request.mock.calls[0]?.[0].params?.[0]).not.toHaveProperty(
      "to",
    );
    expect(handle.request.mock.calls[0]?.[0].params?.[2]).toEqual({
      [QUERY_ADDRESS]: { balance: "0x1" },
    });
    await readDeploylessContract(handle.client, parameters);
    expect(handle.request.mock.calls[1]?.[0].params?.[0]).toHaveProperty(
      "to",
      QUERY_ADDRESS,
    );
  });

  test("error: creation failure propagates", async () => {
    const handle = createMockClient(mainnet);
    handle.request.mockResolvedValueOnce("0x");
    handle.request.mockRejectedValueOnce(decodedRevert);
    await expect(
      readDeploylessContract(handle.client, parameters),
    ).rejects.toBeInstanceOf(BaseError);
    expect(handle.request).toHaveBeenCalledTimes(2);
    handle.request.mockRejectedValueOnce(decodedRevert);
    await expect(
      readDeploylessContract(handle.client, parameters),
    ).rejects.toBeInstanceOf(BaseError);
    expect(handle.request).toHaveBeenCalledTimes(3);
    expect(handle.request.mock.calls[2]?.[0].params?.[0]).not.toHaveProperty(
      "to",
    );
  });
});
