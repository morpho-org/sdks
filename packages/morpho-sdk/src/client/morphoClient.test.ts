import type { Address, Client } from "viem";
import { describe, expect, test } from "vitest";
import {
  ExtensionNameCollisionError,
  InvalidActionShapeError,
  InvalidExtensionShapeError,
  InvalidRequirementShapeError,
  InvalidTransactionShapeError,
} from "../types/index.js";
import { defineEntity } from "./defineEntity.js";
import { MorphoClient } from "./morphoClient.js";

// Pure extension-wiring tests: no RPC, no Anvil. The viem client is a structural stand-in.
const stubViemClient = {} as Client;

const sampleTx = (to: Address) => ({
  to,
  value: 0n,
  data: "0x" as const,
  action: { type: "myCustom", args: { to } },
});

describe("MorphoClient.extend", () => {
  test("default: registers an entity and exposes it as a method", () => {
    const client = new MorphoClient(stubViemClient).extend(() => ({
      myLending: (vault: Address) => ({
        deposit: ({ amount }: { amount: bigint }) => ({
          buildTx: () => ({
            ...sampleTx(vault),
            action: { type: "x", args: { amount } },
          }),
        }),
      }),
    }));

    const tx = client
      .myLending("0x0000000000000000000000000000000000000001")
      .deposit({ amount: 42n })
      .buildTx();
    expect(tx.to).toBe("0x0000000000000000000000000000000000000001");
    expect(tx.action.type).toBe("x");
  });

  test("behavior: the original client is not mutated", () => {
    const original = new MorphoClient(stubViemClient);
    const extended = original.extend(() => ({
      foo: () => ({ doIt: () => ({ buildTx: () => sampleTx("0x00") }) }),
    }));
    expect("foo" in original).toBe(false);
    expect("foo" in extended).toBe(true);
    expect(extended).not.toBe(original);
  });

  test("behavior: chained extends accumulate; second sees the first via `c`", () => {
    const c1 = new MorphoClient(stubViemClient).extend(() => ({
      first: () => ({ go: () => ({ buildTx: () => sampleTx("0x01") }) }),
    }));
    const c2 = c1.extend((c) => ({
      second: () => ({
        chain: () => ({
          buildTx: () => c.first().go().buildTx(),
        }),
      }),
    }));
    expect(c2.first().go().buildTx().to).toBe("0x01");
    expect(c2.second().chain().buildTx().to).toBe("0x01");
  });

  test("behavior: integrator-applied freeze is preserved (validator does not refreeze)", () => {
    const frozen = Object.freeze(sampleTx("0x02"));
    const client = new MorphoClient(stubViemClient).extend(() => ({
      e: () => ({ a: () => ({ buildTx: () => frozen }) }),
    }));
    const tx = client.e().a().buildTx();
    expect(Object.isFrozen(tx)).toBe(true);
    expect(tx).toBe(frozen);
  });

  test("behavior: client.options.metadata is not auto-injected into integrator txs", () => {
    const client = new MorphoClient(stubViemClient, {
      metadata: { origin: "0xabcd1234" },
    }).extend(() => ({
      e: () => ({ a: () => ({ buildTx: () => sampleTx("0x03") }) }),
    }));
    const tx = client.e().a().buildTx();
    expect(tx.data).toBe("0x");
  });

  test("behavior: getRequirements pass-through preserves async result", async () => {
    const client = new MorphoClient(stubViemClient).extend(() => ({
      e: () => ({
        a: () => ({
          buildTx: () => sampleTx("0x04"),
          getRequirements: async () => [sampleTx("0x05")],
        }),
      }),
    }));
    const reqs = await client.e().a().getRequirements?.();
    expect(reqs).toHaveLength(1);
    expect(reqs?.[0]?.to).toBe("0x05");
  });

  test("error: collision with reserved name (vaultV1)", () => {
    expect(() =>
      new MorphoClient(stubViemClient).extend(() => ({
        // biome-ignore lint/suspicious/noExplicitAny: deliberate misuse — collides with built-in
        vaultV1: (() => ({})) as any,
      })),
    ).toThrowError(ExtensionNameCollisionError);
  });

  test("error: collision with previously registered extension", () => {
    const c1 = new MorphoClient(stubViemClient).extend(() => ({
      foo: () => ({ a: () => ({ buildTx: () => sampleTx("0x06") }) }),
    }));
    expect(() =>
      c1.extend(() => ({
        foo: () => ({ b: () => ({ buildTx: () => sampleTx("0x07") }) }),
      })),
    ).toThrowError(ExtensionNameCollisionError);
  });

  test("error: empty extension map", () => {
    expect(() =>
      new MorphoClient(stubViemClient).extend(() => ({})),
    ).toThrowError(InvalidExtensionShapeError);
  });

  test("error: action without buildTx (lazy, on call)", () => {
    const client = new MorphoClient(stubViemClient).extend(() => ({
      broken: () => ({
        // biome-ignore lint/suspicious/noExplicitAny: deliberate misuse — missing `buildTx`
        a: () => ({}) as any,
      }),
    }));
    expect(() => client.broken().a()).toThrowError(InvalidActionShapeError);
  });

  test("error: buildTx returns malformed tx (lazy, on call)", () => {
    const client = new MorphoClient(stubViemClient).extend(() => ({
      broken: () => ({
        a: () => ({
          // biome-ignore lint/suspicious/noExplicitAny: deliberate misuse — missing `data`
          buildTx: (() => ({
            to: "0x00",
            value: 0n,
            action: { type: "x", args: {} },
          })) as any,
        }),
      }),
    }));
    expect(() => client.broken().a().buildTx()).toThrowError(
      InvalidTransactionShapeError,
    );
  });

  test("error: getRequirements resolves to malformed array", async () => {
    const client = new MorphoClient(stubViemClient).extend(() => ({
      broken: () => ({
        a: () => ({
          buildTx: () => sampleTx("0x08"),
          // biome-ignore lint/suspicious/noExplicitAny: deliberate misuse
          getRequirements: (async () => [{ unrelated: 1 }]) as any,
        }),
      }),
    }));
    await expect(
      client.broken().a().getRequirements?.(),
    ).rejects.toBeInstanceOf(InvalidRequirementShapeError);
  });

  test("behavior: defineEntity is a runtime identity helper", () => {
    const factory = (vault: Address) => ({
      a: () => ({ buildTx: () => sampleTx(vault) }),
    });
    expect(defineEntity(factory)).toBe(factory);
  });

  test("behavior: extension property is non-writable", () => {
    const client = new MorphoClient(stubViemClient).extend(() => ({
      foo: () => ({ a: () => ({ buildTx: () => sampleTx("0x09") }) }),
    }));
    expect(() => {
      // biome-ignore lint/suspicious/noExplicitAny: probing runtime descriptor
      (client as any).foo = "overwritten";
    }).toThrow();
  });

  test("behavior: built-in entities still work after extending", () => {
    const client = new MorphoClient(stubViemClient).extend(() => ({
      foo: () => ({ a: () => ({ buildTx: () => sampleTx("0x0a") }) }),
    }));
    expect(typeof client.vaultV1).toBe("function");
    expect(typeof client.vaultV2).toBe("function");
    expect(typeof client.marketV1).toBe("function");
  });
});
