import type { Address, Hex } from "viem";
import { describe, expect, test } from "vitest";
import {
  ExtensionNameCollisionError,
  InvalidActionShapeError,
  InvalidEntityShapeError,
  InvalidExtensionNameError,
  InvalidExtensionShapeError,
  InvalidRequirementShapeError,
  InvalidTransactionShapeError,
} from "../types/index.js";
import {
  RESERVED_MORPHO_CLIENT_NAMES,
  validateExtensionMap,
  wrapExtensionFactory,
} from "./validateExtension.js";

const validTx = () => ({
  to: "0x0000000000000000000000000000000000000000" as Address,
  value: 0n,
  data: "0x" as Hex,
  action: { type: "custom", args: { foo: 1 } },
});

describe("validateExtensionMap", () => {
  test("default", () => {
    expect(() =>
      validateExtensionMap({ myEntity: () => ({}) }, []),
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
      validateExtensionMap({ "Bad-Name": () => ({}) }, []),
    ).toThrowError(InvalidExtensionNameError);
    expect(() =>
      validateExtensionMap({ _hidden: () => ({}) }, []),
    ).toThrowError(InvalidExtensionNameError);
  });

  test("error: reserved name (vaultV1)", () => {
    expect(() =>
      validateExtensionMap(
        { vaultV1: () => ({}) },
        RESERVED_MORPHO_CLIENT_NAMES,
      ),
    ).toThrowError(ExtensionNameCollisionError);
  });

  test("error: reserved name (extend)", () => {
    expect(() =>
      validateExtensionMap(
        { extend: () => ({}) },
        RESERVED_MORPHO_CLIENT_NAMES,
      ),
    ).toThrowError(ExtensionNameCollisionError);
  });

  test("error: collision with previously registered extension", () => {
    expect(() =>
      validateExtensionMap({ analytics: () => ({}) }, ["analytics"]),
    ).toThrowError(ExtensionNameCollisionError);
  });

  test("error: non-function value", () => {
    expect(() =>
      validateExtensionMap({ myEntity: "not a function" }, []),
    ).toThrowError(InvalidExtensionShapeError);
  });
});

describe("wrapExtensionFactory", () => {
  test("default: passes through valid factory", () => {
    const factory = wrapExtensionFactory("myEntity", () => ({
      doThing: () => ({ buildTx: () => validTx() }),
    }));
    const entity = factory();
    const action = entity.doThing!();
    expect(action.buildTx()).toMatchObject({ to: validTx().to });
  });

  test("default: getRequirements pass-through", async () => {
    const factory = wrapExtensionFactory("myEntity", () => ({
      doThing: () => ({
        buildTx: () => validTx(),
        getRequirements: async () => [validTx()],
      }),
    }));
    const action = factory().doThing!();
    const reqs = await action.getRequirements?.();
    expect(reqs).toHaveLength(1);
  });

  test("behavior: integrator can deep-freeze, validator does not refreeze", () => {
    const frozenTx = Object.freeze(validTx());
    const factory = wrapExtensionFactory("myEntity", () => ({
      doThing: () => ({ buildTx: () => frozenTx }),
    }));
    const tx = factory().doThing!().buildTx();
    expect(Object.isFrozen(tx)).toBe(true);
    expect(tx).toBe(frozenTx);
  });

  test("error: factory returns non-object", () => {
    const factory = wrapExtensionFactory(
      "myEntity",
      // biome-ignore lint/suspicious/noExplicitAny: deliberate misuse
      (() => "nope") as any,
    );
    expect(() => factory()).toThrowError(InvalidEntityShapeError);
  });

  test("error: entity property is not a function", () => {
    const factory = wrapExtensionFactory(
      "myEntity",
      // biome-ignore lint/suspicious/noExplicitAny: deliberate misuse
      (() => ({ doThing: 42 })) as any,
    );
    expect(() => factory()).toThrowError(InvalidEntityShapeError);
  });

  test("error: action method missing buildTx", () => {
    const factory = wrapExtensionFactory(
      "myEntity",
      // biome-ignore lint/suspicious/noExplicitAny: deliberate misuse
      (() => ({ doThing: () => ({}) })) as any,
    );
    expect(() => factory().doThing!()).toThrowError(InvalidActionShapeError);
  });

  test("error: getRequirements is present but not a function", () => {
    const factory = wrapExtensionFactory(
      "myEntity",
      // biome-ignore lint/suspicious/noExplicitAny: deliberate misuse
      (() => ({
        doThing: () => ({ buildTx: () => validTx(), getRequirements: 42 }),
      })) as any,
    );
    expect(() => factory().doThing!()).toThrowError(InvalidActionShapeError);
  });

  test("error: buildTx returns malformed tx (missing data)", () => {
    const factory = wrapExtensionFactory(
      "myEntity",
      // biome-ignore lint/suspicious/noExplicitAny: deliberate misuse
      (() => ({
        doThing: () => ({
          buildTx: () => ({
            to: "0x00",
            value: 0n,
            action: { type: "x", args: {} },
          }),
        }),
      })) as any,
    );
    expect(() => factory().doThing!().buildTx()).toThrowError(
      InvalidTransactionShapeError,
    );
  });

  test("error: buildTx returns malformed tx (action.type missing)", () => {
    const factory = wrapExtensionFactory(
      "myEntity",
      // biome-ignore lint/suspicious/noExplicitAny: deliberate misuse
      (() => ({
        doThing: () => ({
          buildTx: () => ({
            to: "0x00",
            value: 0n,
            data: "0x",
            action: { args: {} },
          }),
        }),
      })) as any,
    );
    expect(() => factory().doThing!().buildTx()).toThrowError(
      InvalidTransactionShapeError,
    );
  });

  test("error: getRequirements resolves to non-array", async () => {
    const factory = wrapExtensionFactory(
      "myEntity",
      // biome-ignore lint/suspicious/noExplicitAny: deliberate misuse
      (() => ({
        doThing: () => ({
          buildTx: () => validTx(),
          getRequirements: async () => "not an array",
        }),
      })) as any,
    );
    await expect(
      factory().doThing!().getRequirements?.(),
    ).rejects.toBeInstanceOf(InvalidRequirementShapeError);
  });

  test("error: getRequirements item neither tx nor requirement", async () => {
    const factory = wrapExtensionFactory(
      "myEntity",
      // biome-ignore lint/suspicious/noExplicitAny: deliberate misuse
      (() => ({
        doThing: () => ({
          buildTx: () => validTx(),
          getRequirements: async () => [{ random: 1 }],
        }),
      })) as any,
    );
    await expect(
      factory().doThing!().getRequirements?.(),
    ).rejects.toBeInstanceOf(InvalidRequirementShapeError);
  });

  test("default: getRequirements accepts integrator-defined Requirement shape", async () => {
    const customReq = {
      sign: async () => ({ args: {}, action: { type: "x", args: {} } }),
      action: { type: "customPermit", args: {} },
    };
    const factory = wrapExtensionFactory("myEntity", () => ({
      doThing: () => ({
        buildTx: () => validTx(),
        // biome-ignore lint/suspicious/noExplicitAny: integrator-defined shape
        getRequirements: async () => [customReq] as any,
      }),
    }));
    const reqs = await factory().doThing!().getRequirements?.();
    expect(reqs).toHaveLength(1);
  });
});
