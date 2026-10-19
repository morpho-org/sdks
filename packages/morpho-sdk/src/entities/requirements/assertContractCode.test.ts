import { createMockClient } from "@morpho-org/test/mock";
import { zeroAddress } from "viem";
import { getBytecode } from "viem/actions";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
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
