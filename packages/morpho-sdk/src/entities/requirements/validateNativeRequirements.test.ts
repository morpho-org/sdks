import { createMockClient } from "@morpho-org/test/mock";
import { BaseError } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test, vi } from "vitest";
import { createChainCheck } from "../../actions/requirements/chainCheck.js";
import {
  ChainIdMismatchError,
  MissingContractCodeError,
} from "../../types/index.js";
import { assertRegistryTargetsHaveCode } from "./assertContractCode.js";
import { validateNativeRequirements } from "./validateNativeRequirements.js";

describe("validateNativeRequirements", () => {
  test.each(["0x1", "0x2105"])(
    "error: reuses the invocation chain check for missing code on %s",
    async (servedChain) => {
      const handle = createMockClient(mainnet);
      handle.request.mockImplementation(async ({ method }) => {
        if (method === "eth_chainId") return servedChain;
        if (method === "eth_getCode") return "0x";
        throw new Error(`unexpected ${method}`);
      });
      const chainCheck = createChainCheck(handle.client, mainnet.id);
      await expect(
        validateNativeRequirements(handle.client, {
          chainId: mainnet.id,
          chainCheck,
          assertWriteTargets: () =>
            assertRegistryTargetsHaveCode(
              handle.client,
              mainnet.id,
              [{ role: "blue", address: mainnet.contracts.multicall3.address }],
              chainCheck,
            ),
        }),
      ).rejects.toBeInstanceOf(
        servedChain === "0x1" ? MissingContractCodeError : ChainIdMismatchError,
      );
      expect(
        handle.request.mock.calls.filter(
          ([call]) => call.method === "eth_chainId",
        ),
      ).toHaveLength(1);
    },
  );

  test("default: starts code validation while the chain request is pending", async () => {
    const handle = createMockClient(mainnet);
    let resolveChain!: (chain: string) => void;
    handle.request.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          resolveChain = resolve;
        }),
    );
    const assertTargets = vi.fn(async () => {});
    const pending = validateNativeRequirements(handle.client, {
      chainId: mainnet.id,
      assertWriteTargets: assertTargets,
    });
    expect(assertTargets).toHaveBeenCalledOnce();
    resolveChain("0x1");
    await expect(pending).resolves.toBeUndefined();
    expect(handle.request).toHaveBeenCalledTimes(1);
  });

  test.each(["0x1", "0x2105"])(
    "error: chain result %s determines target-error precedence",
    async (chain) => {
      const handle = createMockClient(mainnet);
      let resolveChain!: (chain: string) => void;
      handle.request.mockImplementation(
        () =>
          new Promise<string>((resolve) => {
            resolveChain = resolve;
          }),
      );
      const targetError = new MissingContractCodeError(
        "0x0000000000000000000000000000000000000001",
        mainnet.id,
        "bundles.blueBundlesV1",
      );
      const pending = validateNativeRequirements(handle.client, {
        chainId: mainnet.id,
        assertWriteTargets: async () => {
          throw targetError;
        },
      });
      const assertion = expect(pending).rejects.toBeInstanceOf(
        chain === "0x1" ? MissingContractCodeError : ChainIdMismatchError,
      );
      resolveChain(chain);
      await assertion;
    },
  );

  test("error: preserves a chain transport failure", async () => {
    const handle = createMockClient(mainnet);
    const error = new Error("RPC unavailable");
    handle.request.mockRejectedValue(error);
    await expect(
      validateNativeRequirements(handle.client, {
        chainId: mainnet.id,
        assertWriteTargets: async () => {},
      }),
    ).rejects.toBeInstanceOf(BaseError);
  });

  test("error: keeps a missing-code error when the chain request fails", async () => {
    const handle = createMockClient(mainnet);
    handle.request.mockRejectedValue(new Error("RPC unavailable"));
    const targetError = new MissingContractCodeError(
      "0x0000000000000000000000000000000000000001",
      mainnet.id,
      "bundles.blueBundlesV1",
    );
    await expect(
      validateNativeRequirements(handle.client, {
        chainId: mainnet.id,
        assertWriteTargets: async () => {
          throw targetError;
        },
      }),
    ).rejects.toBe(targetError);
  });
});
