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
  RESERVED_MORPHO_CLIENT_NAMES,
  validateExtensionMap,
  wrapEntityInstance,
} from "./validateExtension.js";

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
    expect(() => validateExtensionMap(null, [])).toThrowError(
      InvalidExtensionShapeError,
    );
    expect(() => validateExtensionMap("oops", [])).toThrowError(
      InvalidExtensionShapeError,
    );
  });

  test("error: empty object", () => {
    expect(() => validateExtensionMap({}, [])).toThrowError(
      InvalidExtensionShapeError,
    );
  });

  test("error: invalid name", () => {
    expect(() =>
      validateExtensionMap({ "Bad-Name": GoodEntity }, []),
    ).toThrowError(InvalidExtensionNameError);
    expect(() =>
      validateExtensionMap({ _hidden: GoodEntity }, []),
    ).toThrowError(InvalidExtensionNameError);
  });

  test("error: reserved name (vaultV1)", () => {
    expect(() =>
      validateExtensionMap(
        { vaultV1: GoodEntity },
        RESERVED_MORPHO_CLIENT_NAMES,
      ),
    ).toThrowError(ExtensionNameCollisionError);
  });

  test("error: collision with previously registered extension", () => {
    expect(() =>
      validateExtensionMap({ analytics: GoodEntity }, ["analytics"]),
    ).toThrowError(ExtensionNameCollisionError);
  });

  test("error: value is not a constructor", () => {
    expect(() =>
      validateExtensionMap({ myEntity: "not a class" }, []),
    ).toThrowError(InvalidEntityClassError);
  });

  test("error: class does not extend MorphoEntity", () => {
    expect(() =>
      validateExtensionMap({ myEntity: BadEntity }, []),
    ).toThrowError(InvalidEntityClassError);
  });

  test("error: passing MorphoEntity itself is rejected", () => {
    expect(() =>
      validateExtensionMap({ myEntity: MorphoEntity }, []),
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
