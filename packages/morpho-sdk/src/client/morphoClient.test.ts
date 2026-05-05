import type { Address, Client, Hex } from "viem";
import { describe, expect, test } from "vitest";
import {
  ExtensionNameCollisionError,
  InvalidActionShapeError,
  InvalidEntityClassError,
  InvalidExtensionShapeError,
  InvalidRequirementShapeError,
  InvalidTransactionShapeError,
  type MorphoClientType,
  MorphoEntity,
} from "../types/index.js";
import { MorphoClient } from "./morphoClient.js";

// Pure extension-wiring tests: no RPC, no Anvil. The viem client is a structural stand-in.
const stubViemClient = {} as Client;

const sampleTx = (to: Address) => ({
  to,
  value: 0n,
  data: "0x" as Hex,
  action: { type: "myCustom", args: { to } },
});

class MyLending extends MorphoEntity {
  // biome-ignore lint/complexity/useMaxParams: integrator entity constructor with binding fields.
  constructor(
    client: MorphoClientType,
    public readonly vault: Address,
    public readonly chainId: number,
  ) {
    super(client);
  }

  deposit({ amount }: { amount: bigint }) {
    return {
      buildTx: () => ({
        ...sampleTx(this.vault),
        action: {
          type: "myLendingDeposit",
          args: { amount, chainId: this.chainId },
        },
      }),
    };
  }

  fetchSomething() {
    return { ok: true, vault: this.vault };
  }
}

describe("MorphoClient.extend", () => {
  test("default: registers an entity class and exposes it as a factory", () => {
    const client = new MorphoClient(stubViemClient).extend({
      myLending: MyLending,
    });
    const entity = client.myLending(
      "0x0000000000000000000000000000000000000001",
      1,
    );
    expect(entity).toBeInstanceOf(MyLending);
    expect(entity).toBeInstanceOf(MorphoEntity);

    const tx = entity.deposit({ amount: 42n }).buildTx();
    expect(tx.to).toBe("0x0000000000000000000000000000000000000001");
    expect(tx.action.type).toBe("myLendingDeposit");
  });

  test("behavior: non-action methods pass through unwrapped", () => {
    const client = new MorphoClient(stubViemClient).extend({
      myLending: MyLending,
    });
    const result = client
      .myLending("0x0000000000000000000000000000000000000002", 1)
      .fetchSomething();
    expect(result).toEqual({
      ok: true,
      vault: "0x0000000000000000000000000000000000000002",
    });
  });

  test("behavior: the original client is not mutated", () => {
    const original = new MorphoClient(stubViemClient);
    const extended = original.extend({ myLending: MyLending });
    expect("myLending" in original).toBe(false);
    expect("myLending" in extended).toBe(true);
    expect(extended).not.toBe(original);
  });

  test("behavior: chained extends accumulate", () => {
    class Other extends MorphoEntity {
      go() {
        return { buildTx: () => sampleTx("0x09") };
      }
    }
    const c1 = new MorphoClient(stubViemClient).extend({
      myLending: MyLending,
    });
    const c2 = c1.extend({ other: Other });
    expect(c2.myLending("0x01", 1).deposit({ amount: 1n }).buildTx().to).toBe(
      "0x01",
    );
    expect(c2.other().go().buildTx().to).toBe("0x09");
  });

  test("behavior: built-in entities still work after extending", () => {
    const client = new MorphoClient(stubViemClient).extend({
      myLending: MyLending,
    });
    expect(typeof client.vaultV1).toBe("function");
    expect(typeof client.vaultV2).toBe("function");
    expect(typeof client.marketV1).toBe("function");
  });

  test("behavior: extension property is non-writable", () => {
    const client = new MorphoClient(stubViemClient).extend({
      myLending: MyLending,
    });
    expect(() => {
      // biome-ignore lint/suspicious/noExplicitAny: probing runtime descriptor
      (client as any).myLending = "overwritten";
    }).toThrow();
  });

  test("behavior: client.options.metadata is not auto-injected into integrator txs", () => {
    const client = new MorphoClient(stubViemClient, {
      metadata: { origin: "0xabcd1234" },
    }).extend({ myLending: MyLending });
    const tx = client.myLending("0x03", 1).deposit({ amount: 1n }).buildTx();
    expect(tx.data).toBe("0x");
  });

  test("behavior: entity can read client.options inside actions", () => {
    class Reader extends MorphoEntity {
      check() {
        return {
          buildTx: () => ({
            ...sampleTx("0x04"),
            action: {
              type: "x",
              args: { meta: this.client.options.metadata?.origin ?? "none" },
            },
          }),
        };
      }
    }
    const client = new MorphoClient(stubViemClient, {
      metadata: { origin: "0xabcd" },
    }).extend({ reader: Reader });
    const tx = client.reader().check().buildTx();
    expect(tx.action.args).toEqual({ meta: "0xabcd" });
  });

  test("error: collision with reserved name (vaultV1)", () => {
    expect(() =>
      new MorphoClient(stubViemClient).extend({
        // biome-ignore lint/suspicious/noExplicitAny: deliberate misuse
        vaultV1: MyLending as any,
      }),
    ).toThrowError(ExtensionNameCollisionError);
  });

  test("error: collision with previously registered extension", () => {
    const c1 = new MorphoClient(stubViemClient).extend({
      myLending: MyLending,
    });
    expect(() => c1.extend({ myLending: MyLending })).toThrowError(
      ExtensionNameCollisionError,
    );
  });

  test("error: empty extension map", () => {
    expect(() => new MorphoClient(stubViemClient).extend({})).toThrowError(
      InvalidExtensionShapeError,
    );
  });

  test("error: value is not a class", () => {
    expect(() =>
      new MorphoClient(stubViemClient).extend({
        // biome-ignore lint/suspicious/noExplicitAny: deliberate misuse
        oops: "not a class" as any,
      }),
    ).toThrowError(InvalidEntityClassError);
  });

  test("error: class does not extend MorphoEntity", () => {
    class Naked {}
    expect(() =>
      new MorphoClient(stubViemClient).extend({
        // biome-ignore lint/suspicious/noExplicitAny: deliberate misuse
        oops: Naked as any,
      }),
    ).toThrowError(InvalidEntityClassError);
  });

  test("error: buildTx returns malformed tx (lazy, on call)", () => {
    class Broken extends MorphoEntity {
      a() {
        return {
          buildTx: () => ({
            to: "0x00",
            value: 0n,
            action: { type: "x", args: {} },
          }),
        };
      }
    }
    const client = new MorphoClient(stubViemClient).extend({ broken: Broken });
    expect(() => client.broken().a().buildTx()).toThrowError(
      InvalidTransactionShapeError,
    );
  });

  test("error: getRequirements is present but not a function", () => {
    class Broken extends MorphoEntity {
      a() {
        return { buildTx: () => sampleTx("0x05"), getRequirements: 42 };
      }
    }
    const client = new MorphoClient(stubViemClient).extend({ broken: Broken });
    expect(() => client.broken().a()).toThrowError(InvalidActionShapeError);
  });

  test("error: getRequirements resolves to malformed array (lazy)", async () => {
    class Broken extends MorphoEntity {
      a() {
        return {
          buildTx: () => sampleTx("0x06"),
          getRequirements: async () => [{ unrelated: 1 }],
        };
      }
    }
    const client = new MorphoClient(stubViemClient).extend({ broken: Broken });
    await expect(client.broken().a().getRequirements()).rejects.toBeInstanceOf(
      InvalidRequirementShapeError,
    );
  });
});
