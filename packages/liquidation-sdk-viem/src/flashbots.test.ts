import nock from "nock";
import type { Hex, LocalAccount } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { afterEach, describe, expect, test } from "vitest";
import { Flashbots } from "./flashbots.js";

// Deterministic test key (Anvil account 0).
const PRIV_KEY: Hex =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const account = privateKeyToAccount(PRIV_KEY);

const SIGNED_TX_A: Hex =
  "0x02f86c0180841dcd650084773594008252089400000000000000000000000000000000000000010180c001a0aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa01111111111111111111111111111111111111111111111111111111111111111";
const SIGNED_TX_B: Hex = `${SIGNED_TX_A.slice(0, -64)}${"2".repeat(64)}` as Hex;

describe("Flashbots constants", () => {
  test("FLASHBOTS_RELAY is the canonical relay URL", () => {
    expect(Flashbots.FLASHBOTS_RELAY).toBe("https://relay.flashbots.net");
  });
});

describe("Flashbots.sendRawBundle", () => {
  afterEach(() => {
    nock.cleanAll();
  });

  test("posts a signed eth_sendBundle to the Flashbots relay", async () => {
    let observedBody: Record<string, unknown> | null = null;
    let observedSig: string | undefined;
    nock("https://relay.flashbots.net", {
      reqheaders: {
        "x-flashbots-signature": (val) => {
          observedSig = val;
          return true;
        },
      },
    })
      .post("/", (body) => {
        observedBody = body as Record<string, unknown>;
        return true;
      })
      .reply(200, { result: { bundleHash: "0xfeed" } });

    await Flashbots.sendRawBundle(
      [SIGNED_TX_A, SIGNED_TX_B],
      18_000_000n,
      account as unknown as LocalAccount,
    );

    expect(observedBody).toBeTruthy();
    expect(observedBody!.method).toBe("eth_sendBundle");
    expect(observedBody!.jsonrpc).toBe("2.0");
    expect(typeof observedBody!.id).toBe("number");
    const params = observedBody!.params as readonly {
      txs: Hex[];
      blockNumber: string;
    }[];
    expect(params[0]!.txs).toEqual([SIGNED_TX_A, SIGNED_TX_B]);
    // 18_000_000 in hex
    expect(params[0]!.blockNumber).toBe(`0x${(18_000_000n).toString(16)}`);
    // Signature format: <address>:0x<hex>
    expect(observedSig?.startsWith(`${account.address}:0x`)).toBe(true);
  });

  test("encodes target block as a hex bigint", async () => {
    let blockNumber: string | undefined;
    nock("https://relay.flashbots.net")
      .post("/", (body: { params: { blockNumber: string }[] }) => {
        blockNumber = body.params[0]!.blockNumber;
        return true;
      })
      .reply(200, { result: {} });

    await Flashbots.sendRawBundle(
      [SIGNED_TX_A],
      0xabcn,
      account as unknown as LocalAccount,
    );
    expect(blockNumber).toBe("0xabc");
  });
});

// Flashbots.signBundle is intentionally not unit-tested here: it depends on
// viem/actions named imports (`getTransactionCount`, `estimateGas`) which
// cannot be stubbed in an ESM module without a custom transport. A future
// extension can cover it via `createMockClient` once the helper accepts a
// transport override or the action-call sites move into the wallet client
// methods.
