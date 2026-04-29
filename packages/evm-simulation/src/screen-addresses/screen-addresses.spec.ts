import { type Address, type Hex, getAddress } from "viem";
import { vi } from "vitest";

import { AddressScreeningError } from "../errors.js";
import { parseTransfers } from "../simulate/parsing/transfers.js";
import { makeTransferLog } from "../test-helpers/index.js";
import { sanctionedAddresses } from "./sanctioned-addresses.js";
import { screenAddresses } from "./screen-addresses.js";

const USER: Address = "0x1111111111111111111111111111111111111111";
const VAULT: Address = "0x2222222222222222222222222222222222222222";

type MockFetch = (
  url: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
) => Promise<unknown>;

function installFetchMock(fetchMock: MockFetch) {
  globalThis.fetch = fetchMock as unknown as typeof fetch;
}

describe.sequential("screenAddresses", () => {
  // Mock global fetch for Chainalysis tests
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("throws AddressScreeningError when transfer recipient is in sanctioned list", async () => {
    // Pick the first sanctioned address
    const sanctionedAddr = getAddress([...sanctionedAddresses][0]!) as Address;

    const logs = [
      makeTransferLog({
        token: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address,
        from: USER,
        to: sanctionedAddr,
        amount: 1000000n,
      }),
    ];

    await expect(
      screenAddresses({
        simulationTxs: [{ from: USER, to: VAULT, data: "0x" as Hex }],
        transfers: parseTransfers(logs),
      }),
    ).rejects.toThrow(AddressScreeningError);
  });

  it("throws AddressScreeningError when tx.to is in sanctioned list (native-value flow)", async () => {
    const sanctionedAddr = getAddress([...sanctionedAddresses][0]!) as Address;

    await expect(
      screenAddresses({
        simulationTxs: [{ from: USER, to: sanctionedAddr, data: "0x" as Hex }],
        transfers: [], // No Transfer events (native value transfer)
      }),
    ).rejects.toThrow(AddressScreeningError);
  });

  it("does not throw for clean addresses", async () => {
    const logs = [
      makeTransferLog({
        token: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address,
        from: USER,
        to: VAULT,
        amount: 1000000n,
      }),
    ];

    await expect(
      screenAddresses({
        simulationTxs: [{ from: USER, to: VAULT, data: "0x" as Hex }],
        transfers: parseTransfers(logs),
      }),
    ).resolves.not.toThrow();
  });

  it("does NOT call fetch when no chainalysisApiKey is provided", async () => {
    const fetchMock = vi.fn<MockFetch>();
    installFetchMock(fetchMock);

    const logs = [
      makeTransferLog({
        token: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address,
        from: USER,
        to: VAULT,
        amount: 1000000n,
      }),
    ];

    await expect(
      screenAddresses({
        simulationTxs: [{ from: USER, to: VAULT, data: "0x" as Hex }],
        transfers: parseTransfers(logs),
        // chainalysisApiKey intentionally omitted
      }),
    ).resolves.not.toThrow();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("treats an unknown Chainalysis risk tier as Severe (fail-closed on schema drift)", async () => {
    installFetchMock(
      vi.fn<MockFetch>().mockImplementation((url) => {
        if (String(url).includes("/entities/")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ risk: "Critical" }), // hypothetical future tier
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        });
      }),
    );

    const logs = [
      makeTransferLog({
        token: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address,
        from: USER,
        to: VAULT,
        amount: 1000000n,
      }),
    ];

    await expect(
      screenAddresses({
        simulationTxs: [{ from: USER, to: VAULT, data: "0x" as Hex }],
        transfers: parseTransfers(logs),
        chainalysisApiKey: "test-key",
      }),
    ).rejects.toThrow(AddressScreeningError);
  });

  it("treats a post-registration lookup failure as Severe (fail-closed on partial registration)", async () => {
    // Registration POST succeeds; entity GET returns non-ok. Address was
    // persisted on Chainalysis side but we can't complete the check — fail
    // closed rather than silently passing.
    installFetchMock(
      vi.fn<MockFetch>().mockImplementation((url) => {
        if (String(url).includes("/entities/")) {
          // This is the GET lookup (has /entities/<addr>)
          if (String(url).match(/\/entities\/0x[0-9a-f]+/i)) {
            return Promise.resolve({
              ok: false,
              status: 500,
              statusText: "Internal",
            });
          }
        }
        // Registration POST
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }),
    );

    const logs = [
      makeTransferLog({
        token: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address,
        from: USER,
        to: VAULT,
        amount: 1000000n,
      }),
    ];

    await expect(
      screenAddresses({
        simulationTxs: [{ from: USER, to: VAULT, data: "0x" as Hex }],
        transfers: parseTransfers(logs),
        chainalysisApiKey: "test-key",
      }),
    ).rejects.toThrow(AddressScreeningError);
  });

  it("deduplicates addresses before screening", async () => {
    const logs = [
      makeTransferLog({
        token: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address,
        from: USER,
        to: VAULT,
        amount: 1000000n,
      }),
      makeTransferLog({
        token: "0x6B175474E89094C44Da98b954EedeAC495271d0F" as Address,
        from: USER,
        to: VAULT,
        amount: 2000000n,
      }),
    ];

    // Should not throw — VAULT is clean
    await expect(
      screenAddresses({
        simulationTxs: [{ from: USER, to: VAULT, data: "0x" as Hex }],
        transfers: parseTransfers(logs),
      }),
    ).resolves.not.toThrow();
  });

  it("throws AddressScreeningError when Chainalysis returns Severe", async () => {
    installFetchMock(
      vi.fn<MockFetch>().mockImplementation((url) => {
        if (String(url).includes("/entities/")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ risk: "Severe" }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }),
    );

    const logs = [
      makeTransferLog({
        token: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address,
        from: USER,
        to: VAULT,
        amount: 1000000n,
      }),
    ];

    await expect(
      screenAddresses({
        simulationTxs: [{ from: USER, to: VAULT, data: "0x" as Hex }],
        transfers: parseTransfers(logs),
        chainalysisApiKey: "test-key",
      }),
    ).rejects.toThrow(AddressScreeningError);
  });

  it("does not throw when Chainalysis returns High/Medium/Low", async () => {
    installFetchMock(
      vi.fn<MockFetch>().mockImplementation((url) => {
        if (String(url).includes("/entities/")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ risk: "High" }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }),
    );

    const logs = [
      makeTransferLog({
        token: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address,
        from: USER,
        to: VAULT,
        amount: 1000000n,
      }),
    ];

    await expect(
      screenAddresses({
        simulationTxs: [{ from: USER, to: VAULT, data: "0x" as Hex }],
        transfers: parseTransfers(logs),
        chainalysisApiKey: "test-key",
      }),
    ).resolves.not.toThrow();
  });

  it("fails open when Chainalysis API errors", async () => {
    installFetchMock(
      vi.fn<MockFetch>().mockRejectedValue(new Error("Network error")),
    );

    const logs = [
      makeTransferLog({
        token: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address,
        from: USER,
        to: VAULT,
        amount: 1000000n,
      }),
    ];

    await expect(
      screenAddresses({
        simulationTxs: [{ from: USER, to: VAULT, data: "0x" as Hex }],
        transfers: parseTransfers(logs),
        chainalysisApiKey: "test-key",
      }),
    ).resolves.not.toThrow();
  });

  it("fails open when Chainalysis API times out", async () => {
    installFetchMock(
      vi
        .fn<MockFetch>()
        .mockImplementation(
          () =>
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("timeout")), 10),
            ),
        ),
    );

    const logs = [
      makeTransferLog({
        token: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address,
        from: USER,
        to: VAULT,
        amount: 1000000n,
      }),
    ];

    await expect(
      screenAddresses({
        simulationTxs: [{ from: USER, to: VAULT, data: "0x" as Hex }],
        transfers: parseTransfers(logs),
        chainalysisApiKey: "test-key",
      }),
    ).resolves.not.toThrow();
  });
});
