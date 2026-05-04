import { ChainId } from "@morpho-org/blue-sdk";
import type { SimulationResult } from "@morpho-org/simulation-sdk";
import type { Address, Hex } from "viem";
import { describe, expect, test } from "vitest";
import { ActionBundle, ActionBundleRequirements } from "./ActionBundle.js";
import type {
  Action,
  SignatureRequirement,
  TransactionRequirement,
} from "./types/index.js";

const ADDR = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address;
const TX_DATA = "0xdeadbeef" as Hex;

describe("ActionBundleRequirements", () => {
  test("defaults to empty txs and signatures arrays", () => {
    const r = new ActionBundleRequirements();
    expect(r.txs).toEqual([]);
    expect(r.signatures).toEqual([]);
  });

  test("preserves provided txs and signatures", () => {
    // Use a nativeTransfer action which has well-typed args (no signature
    // placeholder needed, unlike permit). The `action` field is opaque to
    // ActionBundleRequirements — it just stores it.
    const sigAction: Action = {
      type: "nativeTransfer",
      args: [ADDR, ADDR, 1n],
    };
    const tx: TransactionRequirement = {
      type: "erc20Approve",
      args: [ADDR, ADDR, 1n],
      tx: { to: ADDR, data: TX_DATA },
    };
    const sig: SignatureRequirement = {
      action: sigAction,
      sign: async () => "0x" as Hex,
    };
    const r = new ActionBundleRequirements([tx], [sig]);
    expect(r.txs).toEqual([tx]);
    expect(r.signatures).toEqual([sig]);
  });

  test("sign aggregates async signatures from each requirement", async () => {
    const sigAction: Action = {
      type: "nativeTransfer",
      args: [ADDR, ADDR, 1n],
    };
    const sig1: SignatureRequirement = {
      action: sigAction,
      sign: async () => "0x01" as Hex,
    };
    const sig2: SignatureRequirement = {
      action: sigAction,
      sign: async () => "0x02" as Hex,
    };
    const r = new ActionBundleRequirements([], [sig1, sig2]);
    // ActionBundleRequirements.sign passes the client through verbatim to
    // each requirement.sign — both stubs ignore the client, so a mocked
    // transport-only handle from createMockClient is sufficient.
    const { createMockClient } = await import("@morpho-org/test/mock");
    const { mainnet } = await import("viem/chains");
    const { client } = createMockClient(mainnet);
    const sigs = await r.sign(client);
    expect(sigs).toEqual(["0x01", "0x02"]);
  });
});

describe("ActionBundle", () => {
  test("uses chainId arg when constructed with a number", () => {
    const b = new ActionBundle(ChainId.EthMainnet);
    expect(b.chainId).toBe(ChainId.EthMainnet);
    expect(b.actions).toEqual([]);
    expect(b.steps).toBeUndefined();
  });

  test("derives chainId from steps[0] when constructed with a SimulationResult", () => {
    const steps = [
      { chainId: ChainId.BaseMainnet },
    ] as unknown as SimulationResult;
    const b = new ActionBundle(steps);
    expect(b.chainId).toBe(ChainId.BaseMainnet);
    expect(b.steps).toBe(steps);
  });

  test("preserves provided actions and requirements", () => {
    const action: Action = {
      type: "nativeTransfer",
      args: [ADDR, ADDR, 100n],
    };
    const reqs = new ActionBundleRequirements();
    const b = new ActionBundle(ChainId.EthMainnet, [action], reqs);
    expect(b.actions).toEqual([action]);
    expect(b.requirements).toBe(reqs);
  });

  test("tx() returns a transaction object built from the bundled actions", () => {
    // Empty action list still produces a valid call to bundler3
    const b = new ActionBundle(ChainId.EthMainnet);
    const tx = b.tx();
    expect(tx).toMatchObject({
      to: expect.any(String),
      data: expect.stringMatching(/^0x/),
    });
  });

  test("txs() concatenates pre-requirement txs with the bundle tx", () => {
    const requirementTx: TransactionRequirement = {
      type: "erc20Approve",
      args: [ADDR, ADDR, 1n],
      tx: { to: ADDR, data: TX_DATA },
    };
    const reqs = new ActionBundleRequirements([requirementTx], []);
    const b = new ActionBundle(ChainId.EthMainnet, [], reqs);
    const txs = b.txs();
    expect(txs.length).toBe(2);
    expect(txs[0]).toEqual(requirementTx.tx);
  });
});
