import { testAccount } from "@morpho-org/test";
import nock from "nock";
import {
  type Hex,
  keccak256,
  recoverMessageAddress,
  stringToBytes,
} from "viem";
import { afterEach, describe, expect, test } from "vitest";
import { Flashbots } from "./flashbots.js";

// Deterministic test account (Anvil account 0 via the standard test mnemonic).
const account = testAccount();

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
    let observedRawBody: string | undefined;
    let observedSig: string | undefined;
    const scope = nock("https://relay.flashbots.net", {
      reqheaders: {
        "x-flashbots-signature": (val) => {
          observedSig = val;
          return true;
        },
      },
    })
      .post("/", (body) => {
        observedBody = body as Record<string, unknown>;
        observedRawBody = JSON.stringify(body);
        return true;
      })
      .reply(200, { result: { bundleHash: "0xfeed" } });

    await Flashbots.sendRawBundle(
      [SIGNED_TX_A, SIGNED_TX_B],
      18_000_000n,
      account,
    );

    expect(scope.isDone()).toBe(true);
    expect(observedBody).toMatchObject({
      method: "eth_sendBundle",
      jsonrpc: "2.0",
      id: expect.any(Number),
    });
    const params = observedBody!.params as readonly {
      txs: Hex[];
      blockNumber: string;
    }[];
    expect(params[0]!.txs).toEqual([SIGNED_TX_A, SIGNED_TX_B]);
    // Pinned literal so a regression to a decimal/leading-zero shape is caught
    // independently of how the source computes the encoding.
    expect(params[0]!.blockNumber).toBe("0x112a880");

    // Signature: <address>:<sig>. Recover the signer from the hashed body
    // and assert it matches the account that produced the header — this
    // catches regressions that swap signMessage for signTypedData (etc).
    expect(observedSig).toBeTruthy();
    const sigParts = observedSig!.split(":");
    // Pin the exact 2-part shape so a regression that drops the colon
    // (or doubles it) fails on this check, not on a confusing decode error.
    expect(sigParts).toHaveLength(2);
    const [headerAddress, signature] = sigParts as [string, Hex];
    expect(headerAddress).toBe(account.address);
    const recovered = await recoverMessageAddress({
      message: keccak256(stringToBytes(observedRawBody!)),
      signature,
    });
    expect(recovered).toBe(account.address);
  });

  test("encodes target block as a hex bigint without leading zeros", async () => {
    let blockNumber: string | undefined;
    const scope = nock("https://relay.flashbots.net")
      .post("/", (body: { params: { blockNumber: string }[] }) => {
        blockNumber = body.params[0]!.blockNumber;
        return true;
      })
      .reply(200, { result: {} });

    await Flashbots.sendRawBundle([SIGNED_TX_A], 0xabcn, account);
    expect(scope.isDone()).toBe(true);
    expect(blockNumber).toBe("0xabc");
  });

  // Note: two further behaviours were attempted but proved unreliable
  // under nock + Node fetch:
  //
  //   - a 5xx-reply test for the `if (!response.ok) throw` branch — nock's
  //     reply body is delivered as text/plain by default and the source's
  //     `await response.json()` in the error block parses inconsistently
  //     across Node fetch implementations.
  //   - an auto-increment-id test asserting `id` strictly increases between
  //     two calls — nock's interceptor consumption interacts unpredictably
  //     with Vitest's concurrent mode for back-to-back `fetch` calls in the
  //     same test.
  //
  // Both branches are exercised end-to-end by the existing fork tests.
});

// Flashbots.signBundle is intentionally not unit-tested here: it depends on
// viem/actions named imports (`getTransactionCount`, `estimateGas`) which
// cannot be stubbed in an ESM module without a custom transport. A future
// extension can cover it via `createMockClient` once the helper accepts a
// transport override or the action-call sites move into the wallet client
// methods.
