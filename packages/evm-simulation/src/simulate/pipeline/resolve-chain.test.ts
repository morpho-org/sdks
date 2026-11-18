import { createPublicClient, custom, fallback, http, webSocket } from "viem";
import { mainnet } from "viem/chains";
import { expectTypeOf } from "vitest";
import {
  InvalidChainIdError,
  SimulationValidationError,
  UnsupportedChainError,
} from "../../errors.js";
import { createTestSimulationClient } from "../../test-helpers/create-test-simulation-client.js";
import type {
  ChainSimulationClientConfig,
  ChainSimulationConfigEntry,
  SimulationConfig,
} from "../../types.js";
import { resolveChain } from "./resolve-chain.js";

function makeConfig(
  entries: [number, ChainSimulationConfigEntry][],
): SimulationConfig {
  return { chains: new Map(entries) };
}

describe("resolveChain", () => {
  it("resolves the deprecated URL to a CCIP-Read-disabled, zero-retry client", () => {
    const { client } = resolveChain(
      makeConfig([[1, { simulateV1Url: "http://rpc.local" }]]),
      { chainId: 1 },
    );
    expect(client.ccipRead).toBe(false);
    expect(client.transport.type).toBe("http");
    expect(client.transport.retryCount).toBe(0);
    expect(client.transport.url).toBe("http://rpc.local");
  });

  it("rejects both configuration keys before any request", () => {
    const request = vi.fn();
    const entry = {
      client: createPublicClient({
        ccipRead: false,
        transport: custom({ request }, { retryCount: 0 }),
      }),
      simulateV1Url: "http://rpc.local",
    };
    expectTypeOf<
      typeof entry
    >().not.toMatchTypeOf<ChainSimulationClientConfig>();
    expect(() =>
      resolveChain(
        makeConfig([[1, entry as unknown as ChainSimulationConfigEntry]]),
        { chainId: 1 },
      ),
    ).toThrow(SimulationValidationError);
    expect(request).not.toHaveBeenCalled();
  });

  it.each(["", null, 42])(
    "rejects invalid deprecated URL %j",
    (simulateV1Url) => {
      const entry = { simulateV1Url } as unknown as ChainSimulationConfigEntry;
      expect(() =>
        resolveChain(makeConfig([[1, entry]]), { chainId: 1 }),
      ).toThrow(UnsupportedChainError);
    },
  );

  it("returns the configured client", () => {
    const cap = resolveChain(
      makeConfig([
        [1, { client: createTestSimulationClient("http://rpc.local") }],
      ]),
      { chainId: 1 },
    );
    expect(cap.client.transport.url).toBe("http://rpc.local");
  });

  it("throws UnsupportedChainError for missing chain", () => {
    expect(() =>
      resolveChain(
        makeConfig([
          [1, { client: createTestSimulationClient("http://rpc.local") }],
        ]),
        { chainId: 999999 },
      ),
    ).toThrow(UnsupportedChainError);
  });

  it("throws UnsupportedChainError when the runtime entry has no client", () => {
    const empty = {} as unknown as ChainSimulationConfigEntry;
    expect(() =>
      resolveChain(makeConfig([[1, empty]]), { chainId: 1 }),
    ).toThrow(UnsupportedChainError);
  });

  it.each([undefined, true, {}] as const)(
    "rejects CCIP-Read configuration %j",
    (ccipRead) => {
      const client = {
        ...createTestSimulationClient("http://rpc.local"),
        ccipRead,
      } as ChainSimulationClientConfig["client"];
      expect(() =>
        resolveChain(makeConfig([[1, { client }]]), { chainId: 1 }),
      ).toThrow(SimulationValidationError);
    },
  );

  it("rejects fallback transports", () => {
    const client = createPublicClient({
      ccipRead: false,
      transport: fallback([http("http://rpc.local", { retryCount: 0 })], {
        retryCount: 0,
      }),
    });
    expect(() =>
      resolveChain(makeConfig([[1, { client }]]), { chainId: 1 }),
    ).toThrow(SimulationValidationError);
  });

  it.each([undefined, 1, 3])(
    "rejects transport retryCount %s",
    (retryCount) => {
      const base = createTestSimulationClient("http://rpc.local");
      const client = { ...base, transport: { ...base.transport, retryCount } };
      expect(() =>
        resolveChain(makeConfig([[1, { client }]]), { chainId: 1 }),
      ).toThrow(SimulationValidationError);
    },
  );

  it.each([
    http("http://rpc.local", { retryCount: 0 }),
    webSocket("ws://rpc.local", { retryCount: 0 }),
    custom({ request: async () => null }, { retryCount: 0 }),
  ])("accepts a zero-retry single-provider transport", (transport) => {
    const client = createPublicClient({ ccipRead: false, transport });
    expect(
      resolveChain(makeConfig([[1, { client }]]), { chainId: 1 }).client,
    ).toBe(client);
  });

  it("rejects a mismatched client chain", () => {
    const client = createPublicClient({
      chain: mainnet,
      ccipRead: false,
      transport: http("http://rpc.local", { retryCount: 0 }),
    });
    expect(() =>
      resolveChain(makeConfig([[8453, { client }]]), { chainId: 8453 }),
    ).toThrow(InvalidChainIdError);
    expect(
      resolveChain(makeConfig([[1, { client }]]), { chainId: 1 }).client,
    ).toBe(client);
  });

  it("UnsupportedChainError carries chainId", () => {
    try {
      resolveChain(makeConfig([]), { chainId: 42 });
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(UnsupportedChainError);
      expect((e as UnsupportedChainError).chainId).toBe(42);
    }
  });

  it("accepts a positive blockOverrides.gasLimit", () => {
    const entry = {
      client: createTestSimulationClient("http://rpc.local"),
      blockOverrides: { gasLimit: 16_777_216n },
    };
    expect(resolveChain(makeConfig([[988, entry]]), { chainId: 988 })).toBe(
      entry,
    );
  });

  it.each([0n, -1n, 16_777_216])(
    "throws SimulationValidationError for gasLimit %s",
    (gasLimit) => {
      const entry = {
        client: createTestSimulationClient("http://rpc.local"),
        blockOverrides: { gasLimit },
      } as unknown as ChainSimulationConfigEntry;
      expect(() =>
        resolveChain(makeConfig([[988, entry]]), { chainId: 988 }),
      ).toThrow(SimulationValidationError);
    },
  );

  it("accepts a positive callGasLimit", () => {
    const entry = {
      client: createTestSimulationClient("http://rpc.local"),
      callGasLimit: 30_000_000n,
    };
    expect(resolveChain(makeConfig([[988, entry]]), { chainId: 988 })).toBe(
      entry,
    );
  });

  it.each([0n, -1n, 30_000_000])(
    "throws SimulationValidationError for callGasLimit %s",
    (callGasLimit) => {
      const entry = {
        client: createTestSimulationClient("http://rpc.local"),
        callGasLimit,
      } as unknown as ChainSimulationConfigEntry;
      expect(() =>
        resolveChain(makeConfig([[988, entry]]), { chainId: 988 }),
      ).toThrow(SimulationValidationError);
    },
  );

  it.each([0, "", "false"])(
    "throws SimulationValidationError for parentHashCheck %j",
    (parentHashCheck) => {
      const entry = {
        client: createTestSimulationClient("http://rpc.local"),
        parentHashCheck,
      } as unknown as ChainSimulationConfigEntry;
      expect(() =>
        resolveChain(makeConfig([[988, entry]]), { chainId: 988 }),
      ).toThrow(SimulationValidationError);
    },
  );
});
