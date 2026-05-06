import type { Address, Hex } from "viem";
import { describe, expect, test } from "vitest";
import {
  ExtensionNameCollisionError,
  InvalidActionShapeError,
  InvalidEntityClassError,
  InvalidExtensionNameError,
  InvalidExtensionShapeError,
  InvalidRequirementShapeError,
  InvalidTransactionShapeError,
  MorphoEntity,
} from "../types/index.js";
import {
  validateExtensionMap,
  wrapEntityInstance,
} from "./validateExtension.js";

// Stand-in client carrying the names the real MorphoClient surfaces. Tests use this to assert
// the validator's `name in client` lookup without depending on the full client construction.
const stubClientWithReserved = {
  viemClient: undefined,
  options: undefined,
  vaultV1: () => undefined,
  vaultV2: () => undefined,
  marketV1: () => undefined,
  extend: () => undefined,
};

const validTx = () => ({
  to: "0x0000000000000000000000000000000000000000" as Address,
  value: 0n,
  data: "0x" as Hex,
  action: { type: "custom", args: { foo: 1 } },
});

class GoodEntity extends MorphoEntity {
  doThing() {
    return { buildTx: () => validTx() };
  }
  doThingWithReqs() {
    return {
      buildTx: () => validTx(),
      getRequirements: async () => [validTx()],
    };
  }
  fetchSomething() {
    return { ok: true };
  }
}

class BadEntity {
  // Does NOT extend MorphoEntity.
}

describe("validateExtensionMap", () => {
  test("default", () => {
    expect(() =>
      validateExtensionMap({ myEntity: GoodEntity }, []),
    ).not.toThrow();
  });

  test("error: not an object", () => {
    expect(() => validateExtensionMap(null, {})).toThrowError(
      InvalidExtensionShapeError,
    );
    expect(() => validateExtensionMap("oops", {})).toThrowError(
      InvalidExtensionShapeError,
    );
  });

  test("error: empty object", () => {
    expect(() => validateExtensionMap({}, {})).toThrowError(
      InvalidExtensionShapeError,
    );
  });

  test("error: invalid name", () => {
    expect(() =>
      validateExtensionMap({ "Bad-Name": GoodEntity }, {}),
    ).toThrowError(InvalidExtensionNameError);
    expect(() =>
      validateExtensionMap({ _hidden: GoodEntity }, {}),
    ).toThrowError(InvalidExtensionNameError);
  });

  test("error: collision with built-in client member (vaultV1)", () => {
    expect(() =>
      validateExtensionMap({ vaultV1: GoodEntity }, stubClientWithReserved),
    ).toThrowError(ExtensionNameCollisionError);
  });

  test("error: collision with previously registered extension", () => {
    const client = { ...stubClientWithReserved, analytics: () => undefined };
    expect(() =>
      validateExtensionMap({ analytics: GoodEntity }, client),
    ).toThrowError(ExtensionNameCollisionError);
  });

  test("error: collision with Object.prototype member (toString)", () => {
    expect(() =>
      validateExtensionMap({ toString: GoodEntity }, {}),
    ).toThrowError(ExtensionNameCollisionError);
  });

  test("error: collision with Promise trap (then) — thenable hijack guard", () => {
    expect(() =>
      // biome-ignore lint/suspicious/noThenProperty: deliberate — this is the test that pins the validator's rejection of the `then` thenable trap.
      validateExtensionMap({ then: GoodEntity }, {}),
    ).toThrowError(ExtensionNameCollisionError);
  });

  test("error: value is not a constructor", () => {
    expect(() =>
      validateExtensionMap({ myEntity: "not a class" }, {}),
    ).toThrowError(InvalidEntityClassError);
  });

  test("error: class does not extend MorphoEntity", () => {
    expect(() =>
      validateExtensionMap({ myEntity: BadEntity }, {}),
    ).toThrowError(InvalidEntityClassError);
  });

  test("error: passing MorphoEntity itself is rejected", () => {
    expect(() =>
      validateExtensionMap({ myEntity: MorphoEntity }, {}),
    ).toThrowError(InvalidEntityClassError);
  });
});

// biome-ignore lint/suspicious/noExplicitAny: client is a stand-in stub for these pure tests.
const stubClient = {} as any;

describe("wrapEntityInstance", () => {
  test("default: validates buildTx output", () => {
    const wrapped = wrapEntityInstance("e", new GoodEntity(stubClient));
    expect(wrapped.doThing().buildTx()).toMatchObject({ to: validTx().to });
  });

  test("default: validates getRequirements output", async () => {
    const wrapped = wrapEntityInstance("e", new GoodEntity(stubClient));
    const reqs = await wrapped.doThingWithReqs().getRequirements();
    expect(reqs).toHaveLength(1);
  });

  test("behavior: non-action methods pass through", () => {
    const wrapped = wrapEntityInstance("e", new GoodEntity(stubClient));
    expect(wrapped.fetchSomething()).toEqual({ ok: true });
  });

  test("behavior: instanceof preserved through Proxy", () => {
    const wrapped = wrapEntityInstance("e", new GoodEntity(stubClient));
    expect(wrapped).toBeInstanceOf(GoodEntity);
    expect(wrapped).toBeInstanceOf(MorphoEntity);
  });

  test("behavior: integrator-applied freeze is preserved", () => {
    const frozen = Object.freeze(validTx());
    class Frozen extends MorphoEntity {
      doThing() {
        return { buildTx: () => frozen };
      }
    }
    const wrapped = wrapEntityInstance("e", new Frozen(stubClient));
    const tx = wrapped.doThing().buildTx();
    expect(Object.isFrozen(tx)).toBe(true);
    expect(tx).toBe(frozen);
  });

  test("error: buildTx returns malformed tx (missing data)", () => {
    class Broken extends MorphoEntity {
      doThing() {
        return {
          buildTx: () => ({
            to: "0x00",
            value: 0n,
            action: { type: "x", args: {} },
          }),
        };
      }
    }
    const wrapped = wrapEntityInstance("e", new Broken(stubClient));
    expect(() => wrapped.doThing().buildTx()).toThrowError(
      InvalidTransactionShapeError,
    );
  });

  test("error: getRequirements is present but not a function", () => {
    class Broken extends MorphoEntity {
      doThing() {
        return {
          buildTx: () => validTx(),
          getRequirements: 42,
        };
      }
    }
    const wrapped = wrapEntityInstance("e", new Broken(stubClient));
    expect(() => wrapped.doThing()).toThrowError(InvalidActionShapeError);
  });

  test("error: getRequirements resolves to non-array", async () => {
    class Broken extends MorphoEntity {
      doThing() {
        return {
          buildTx: () => validTx(),
          getRequirements: async () => "not an array",
        };
      }
    }
    const wrapped = wrapEntityInstance("e", new Broken(stubClient));
    await expect(wrapped.doThing().getRequirements()).rejects.toBeInstanceOf(
      InvalidRequirementShapeError,
    );
  });

  test("error: getRequirements item neither tx nor requirement", async () => {
    class Broken extends MorphoEntity {
      doThing() {
        return {
          buildTx: () => validTx(),
          getRequirements: async () => [{ random: 1 }],
        };
      }
    }
    const wrapped = wrapEntityInstance("e", new Broken(stubClient));
    await expect(wrapped.doThing().getRequirements()).rejects.toBeInstanceOf(
      InvalidRequirementShapeError,
    );
  });

  test("behavior: symbol-keyed properties pass through raw (Proxy bypasses wrapping)", () => {
    const sym = Symbol("custom");
    class WithSymbol extends MorphoEntity {
      [sym] = { buildTx: () => validTx() };
    }
    const wrapped: Record<symbol, { buildTx: () => unknown }> =
      wrapEntityInstance("e", new WithSymbol(stubClient));
    // Symbol-keyed read returns the raw value (no Proxy wrapping). The contained `buildTx` is
    // therefore NOT validated through `wrapAction`.
    expect(wrapped[sym].buildTx()).toMatchObject({ to: validTx().to });
  });

  test("behavior: getter returning an action-like object is wrapped & validated", () => {
    class WithGetter extends MorphoEntity {
      get instantAction() {
        return { buildTx: () => validTx() };
      }
    }
    const wrapped = wrapEntityInstance("e", new WithGetter(stubClient));
    expect(wrapped.instantAction.buildTx()).toMatchObject({ to: validTx().to });
  });

  test("error: getter returning malformed action (non-function buildTx) throws", () => {
    class BrokenGetter extends MorphoEntity {
      get instantAction() {
        return { buildTx: 42 };
      }
    }
    const wrapped = wrapEntityInstance("e", new BrokenGetter(stubClient));
    expect(() => wrapped.instantAction).toThrowError(InvalidActionShapeError);
  });

  test("behavior: method returning null/undefined passes through (no throw)", () => {
    class NullReturner extends MorphoEntity {
      noop(): null {
        return null;
      }
      voidish(): undefined {
        return undefined;
      }
    }
    const wrapped = wrapEntityInstance("e", new NullReturner(stubClient));
    expect(wrapped.noop()).toBeNull();
    expect(wrapped.voidish()).toBeUndefined();
  });

  test("error: action with `buildTx` as a non-function throws InvalidActionShapeError", () => {
    class Malformed extends MorphoEntity {
      doThing() {
        return { buildTx: 42 };
      }
    }
    const wrapped = wrapEntityInstance("e", new Malformed(stubClient));
    expect(() => wrapped.doThing()).toThrowError(InvalidActionShapeError);
  });

  test("default: getRequirements accepts integrator-defined Requirement shape", async () => {
    const customReq = {
      sign: async () => ({ args: {}, action: { type: "x", args: {} } }),
      action: { type: "customPermit", args: {} },
    };
    class Custom extends MorphoEntity {
      doThing() {
        return {
          buildTx: () => validTx(),
          getRequirements: async () => [customReq],
        };
      }
    }
    const wrapped = wrapEntityInstance("e", new Custom(stubClient));
    const reqs = await wrapped.doThing().getRequirements();
    expect(reqs).toHaveLength(1);
  });
});
