import { setImmediate } from "node:timers/promises";
import { createMockClient } from "@morpho-org/test/mock";
import { BaseError, zeroAddress } from "viem";
import { getBytecode } from "viem/actions";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import { createChainCheck } from "../../actions/requirements/chainCheck.js";
import {
  ChainIdMismatchError,
  MissingContractCodeError,
} from "../../types/index.js";
import {
  assertContractCode,
  assertRegistryTargetsHaveCode,
} from "./assertContractCode.js";

const TARGET = "0x38B0C12AB81976e9417D4ebfe2A34DB6DF22e6AD";

const createHandle = (bytecode = "0x6000") => {
  const handle = createMockClient(mainnet);
  const request = handle.request.getMockImplementation();
  handle.request.mockImplementation(async ({ method, params }) =>
    method === "eth_getCode" ? bytecode : request!({ method, params }),
  );
  return handle;
};

describe("assertContractCode", () => {
  test("missing-code diagnostics reuse an earlier successful invocation preflight", async () => {
    const handle = createHandle("0x");
    const check = createChainCheck(handle.client, mainnet.id);
    await check();
    await expect(
      assertRegistryTargetsHaveCode(
        handle.client,
        mainnet.id,
        [{ address: TARGET, role: "bundles.blueBundlesV1" }],
        check,
      ),
    ).rejects.toBeInstanceOf(MissingContractCodeError);
    expect(handle.request.mock.calls.map(([{ method }]) => method)).toEqual([
      "eth_chainId",
      "eth_getCode",
    ]);
  });
  test("default: resolves when the address holds code", async () => {
    const handle = createHandle();
    await expect(
      assertContractCode(handle.client, {
        address: TARGET,
        chainId: mainnet.id,
        role: "bundles.blueBundlesV1",
      }),
    ).resolves.toBeUndefined();
  });

  test.each(["0x" as const, undefined])(
    "error: MissingContractCodeError when bytecode is %s",
    async (bytecode) => {
      const handle = createMockClient(mainnet);
      handle.request.mockImplementation(async ({ method }) =>
        method === "eth_getCode" ? bytecode : "0x",
      );
      const promise = assertContractCode(handle.client, {
        address: TARGET,
        chainId: mainnet.id,
        role: "bundles.blueBundlesV1",
      });
      await expect(promise).rejects.toBeInstanceOf(MissingContractCodeError);
      const error = await promise.catch((e: unknown) => e);
      expect(error).toMatchObject({
        address: TARGET,
        chainId: mainnet.id,
        role: "bundles.blueBundlesV1",
      });
    },
  );

  test("error: propagates the transport failure unwrapped", async () => {
    const handle = createMockClient(mainnet);
    handle.request.mockRejectedValue(new Error("connection refused"));
    const promise = assertContractCode(handle.client, {
      address: TARGET,
      chainId: mainnet.id,
      role: "bundles.blueBundlesV1",
    });
    await expect(promise).rejects.toThrowError(/connection refused/);
    await expect(promise).rejects.not.toBeInstanceOf(MissingContractCodeError);
    const { classifyError } = await import("@morpho-org/test/chaos");
    await expect(promise).rejects.toSatisfy(
      (error: unknown) => classifyError(error) !== "config",
    );
  });

  test("behavior: reads code at the given address only", async () => {
    const handle = createHandle();
    await assertContractCode(handle.client, {
      address: TARGET,
      chainId: mainnet.id,
      role: "blue",
    });
    const calls = handle.request.mock.calls.filter(
      ([call]) => call.method === "eth_getCode",
    );
    expect(calls).toHaveLength(1);
    const other = await getBytecode(handle.client, { address: zeroAddress });
    expect(other).toBe("0x6000");
    expect(calls[0]?.[0]?.params?.[0]).toBe(TARGET);
  });
});

describe("assertRegistryTargetsHaveCode", () => {
  const targets = [
    { role: "bundles.blueBundlesV1", address: TARGET },
    { role: "blue", address: zeroAddress },
  ] as const;

  const createDeferredHandle = () => {
    const handle = createMockClient(mainnet);
    const responses = [
      Promise.withResolvers<string>(),
      Promise.withResolvers<string>(),
    ] as const;
    const probe = Promise.withResolvers<string>();
    // The scripted probe may reject before the code guard requests it.
    void probe.promise.catch(() => {});
    handle.request.mockImplementation(({ method, params }) => {
      if (method === "eth_chainId") return probe.promise;
      if (method === "eth_getCode") {
        return responses[params?.[0] === TARGET ? 0 : 1].promise;
      }
      throw new Error(`Unexpected RPC method: ${method}`);
    });
    return { ...handle, responses, probe };
  };

  test.each(["matching", "wrong", "failed"] as const)(
    "error: earlier missing code reports with a %s chain probe while a later read stalls",
    async (chain) => {
      const { client, request, responses, probe } = createDeferredHandle();
      const outcome = assertRegistryTargetsHaveCode(client, mainnet.id, [
        ...targets,
        { role: "permit2", address: TARGET },
      ]).catch((error: unknown) => error);
      try {
        expect(request).toHaveBeenCalledTimes(2);
        responses[0].resolve("0x");
        if (chain === "failed") {
          probe.reject(new BaseError("Probe unavailable"));
        } else {
          probe.resolve(chain === "wrong" ? "0x2105" : "0x1");
        }

        // The event-loop turn is a barrier, not a delay: all ready promise work
        // must finish without releasing the second transport response.
        const error = await Promise.race([outcome, setImmediate("pending")]);
        if (chain === "wrong") {
          expect(error).toBeInstanceOf(ChainIdMismatchError);
          expect(error).not.toBeInstanceOf(MissingContractCodeError);
        } else {
          expect(error).toBeInstanceOf(MissingContractCodeError);
          expect(error).toMatchObject({
            address: TARGET,
            role: targets[0].role,
            chainId: mainnet.id,
          });
        }
        expect(
          request.mock.calls.filter(([call]) => call.method === "eth_chainId"),
        ).toHaveLength(1);
      } finally {
        responses[1].resolve("0x6000");
        await outcome;
      }
    },
  );

  test("error: earlier transport failure propagates unchanged while a later read stalls", async () => {
    const { client, request, responses, probe } = createDeferredHandle();
    const transportFailure = new BaseError("Earlier transport unavailable");
    const outcome = assertRegistryTargetsHaveCode(
      client,
      mainnet.id,
      targets,
    ).catch((error: unknown) => error);
    try {
      responses[0].reject(transportFailure);
      expect(await Promise.race([outcome, setImmediate("pending")])).toBe(
        transportFailure,
      );
      expect(request).toHaveBeenCalledTimes(2);
      expect(
        request.mock.calls.every(([call]) => call.method === "eth_getCode"),
      ).toBe(true);
    } finally {
      responses[1].resolve("0x6000");
      probe.resolve("0x1");
      await outcome;
    }
  });

  test.each(["missing", "code", "transport"] as const)(
    "error: a later early rejection waits for the earlier %s target",
    async (first) => {
      const { client, request, responses, probe } = createDeferredHandle();
      const earlierFailure = new BaseError("Earlier transport unavailable");
      const laterFailure = new BaseError("Later transport unavailable");
      const outcome = assertRegistryTargetsHaveCode(
        client,
        mainnet.id,
        targets,
      ).catch((error: unknown) => error);
      try {
        responses[1].reject(laterFailure);
        expect(await Promise.race([outcome, setImmediate("pending")])).toBe(
          "pending",
        );
        expect(request).toHaveBeenCalledTimes(2);
        probe.resolve("0x1");
        if (first === "transport") responses[0].reject(earlierFailure);
        else responses[0].resolve(first === "missing" ? "0x" : "0x6000");

        const error = await outcome;
        if (first === "missing") {
          expect(error).toBeInstanceOf(MissingContractCodeError);
          expect(error).toMatchObject({ role: targets[0].role });
        } else {
          // viem preserves BaseError instances; the assertion must not wrap or
          // replace a transport error, or select the faster later failure.
          expect(error).toBe(first === "code" ? laterFailure : earlierFailure);
        }
        expect(
          request.mock.calls.filter(([call]) => call.method === "eth_chainId"),
        ).toHaveLength(first === "missing" ? 1 : 0);
      } finally {
        probe.resolve("0x1");
        responses[0].resolve("0x6000");
        await outcome;
      }
    },
  );

  test("behavior: later rejection is observed after an earlier missing-code return", async () => {
    const { client, responses, probe } = createDeferredHandle();
    const laterFailure = new BaseError("Late transport unavailable");
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    const outcome = assertRegistryTargetsHaveCode(
      client,
      mainnet.id,
      targets,
    ).catch((error: unknown) => error);
    try {
      responses[0].resolve("0x");
      probe.resolve("0x1");
      expect(
        await Promise.race([outcome, setImmediate("pending")]),
      ).toBeInstanceOf(MissingContractCodeError);
      responses[1].reject(laterFailure);
      // Node reports unhandled rejections by the next turn; neither this test
      // nor the caller attaches a handler to the later assertion promise.
      await setImmediate();
      expect(unhandled).toEqual([]);
    } finally {
      responses[1].resolve("0x6000");
      await outcome;
      await setImmediate();
      process.off("unhandledRejection", onUnhandled);
    }
  });

  test("behavior: empty targets perform no reads", async () => {
    const handle = createMockClient(mainnet);
    await assertRegistryTargetsHaveCode(handle.client, mainnet.id, []);
    expect(handle.request).not.toHaveBeenCalled();
  });

  test("behavior: all distinct reads start before any settles", async () => {
    const handle = createMockClient(mainnet);
    const responses = targets.map(() => Promise.withResolvers<string>());
    handle.request.mockImplementation(
      ({ params }) => responses[params?.[0] === TARGET ? 0 : 1]!.promise,
    );
    let settled = false;
    const promise = assertRegistryTargetsHaveCode(handle.client, mainnet.id, [
      ...targets,
      { role: "permit2", address: TARGET },
    ]).then(() => {
      settled = true;
    });
    expect(handle.request).toHaveBeenCalledTimes(2);
    responses[0]!.resolve("0x6000");
    await responses[0]!.promise;
    expect(settled).toBe(false);
    responses[1]!.resolve("0x6000");
    await promise;
    expect(settled).toBe(true);
  });

  test.each(
    (
      [
        ["missing", "missing", 0],
        ["missing", "missing", 1],
        ["missing", "transport", 0],
        ["missing", "transport", 1],
        ["transport", "missing", 0],
        ["transport", "missing", 1],
      ] as const
    ).map(([first, second, fastest]) => ({ first, second, fastest })),
  )(
    "error: $first then $second reports first target when target $fastest fails first",
    async ({ first, second, fastest }) => {
      const handle = createMockClient(mainnet);
      const responses = targets.map(() => Promise.withResolvers<string>());
      const finished = targets.map(() => Promise.withResolvers<void>());
      const transportError = new Error("connection refused");
      handle.request.mockImplementation(async ({ method, params }) => {
        if (method === "eth_chainId") return "0x1";
        const index = params?.[0] === TARGET ? 0 : 1;
        try {
          return await responses[index]!.promise;
        } finally {
          finished[index]!.resolve();
        }
      });
      const promise = assertRegistryTargetsHaveCode(
        handle.client,
        mainnet.id,
        targets,
      );
      const errorPromise = promise.catch((reason: unknown) => reason);
      const kinds = [first, second];
      for (const index of [fastest, 1 - fastest]) {
        if (kinds[index] === "missing") responses[index]!.resolve("0x");
        else responses[index]!.reject(transportError);
        await finished[index]!.promise;
      }
      const error = await errorPromise;
      if (first === "transport") {
        expect(error).not.toBeInstanceOf(MissingContractCodeError);
        expect(error).toMatchObject({ cause: transportError });
      } else {
        expect(error).toBeInstanceOf(MissingContractCodeError);
        expect(error).toMatchObject({ role: targets[0].role });
      }
      expect(
        handle.request.mock.calls.filter(
          ([call]) => call.method === "eth_chainId",
        ),
      ).toHaveLength(first === "missing" ? 1 : 0);
    },
  );

  test("behavior: dedupes addresses and resolves when every target holds code", async () => {
    const handle = createMockClient(mainnet);
    await assertRegistryTargetsHaveCode(handle.client, mainnet.id, [
      ...targets,
      targets[0],
    ]);
    const calls = handle.request.mock.calls.filter(
      ([call]) => call.method === "eth_getCode",
    );
    expect(calls).toHaveLength(2);
  });

  test("error: a failing eth_chainId probe keeps the MissingContractCodeError", async () => {
    const handle = createMockClient(mainnet);
    const request = handle.request.getMockImplementation();
    handle.request.mockImplementation(async ({ method, params }) => {
      if (method === "eth_getCode") return "0x";
      if (method === "eth_chainId") throw new Error("connection refused");
      return request!({ method, params });
    });
    const promise = assertRegistryTargetsHaveCode(
      handle.client,
      mainnet.id,
      targets,
    );
    await expect(promise).rejects.toBeInstanceOf(MissingContractCodeError);
    await expect(promise).rejects.toMatchObject({
      role: "bundles.blueBundlesV1",
    });
  });

  test("error: a wrong-chain endpoint surfaces ChainIdMismatchError", async () => {
    const handle = createMockClient(mainnet);
    const request = handle.request.getMockImplementation();
    handle.request.mockImplementation(async ({ method, params }) => {
      if (method === "eth_getCode") return "0x";
      if (method === "eth_chainId") return "0x2105";
      return request!({ method, params });
    });
    const promise = assertRegistryTargetsHaveCode(
      handle.client,
      mainnet.id,
      targets,
    );
    await expect(promise).rejects.toBeInstanceOf(ChainIdMismatchError);
    await expect(promise).rejects.not.toBeInstanceOf(MissingContractCodeError);
  });
});
