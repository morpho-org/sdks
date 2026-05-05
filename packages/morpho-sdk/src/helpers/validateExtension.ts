import {
  type ExtensionAction,
  type ExtensionEntity,
  type ExtensionEntityFactory,
  type ExtensionMap,
  ExtensionNameCollisionError,
  InvalidActionShapeError,
  InvalidEntityShapeError,
  InvalidExtensionNameError,
  InvalidExtensionShapeError,
  InvalidRequirementShapeError,
  InvalidTransactionShapeError,
} from "../types/index.js";

/**
 * Member names a `MorphoClient.extend()` call must not collide with. Covers the public surface
 * (constructor-set fields, built-in entity factories, the `extend` method itself).
 *
 * @internal
 */
export const RESERVED_MORPHO_CLIENT_NAMES: readonly string[] = [
  "viemClient",
  "options",
  "_options",
  "vaultV1",
  "vaultV2",
  "marketV1",
  "extend",
];

const VALID_NAME_REGEX = /^[a-z][a-zA-Z0-9]*$/;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/**
 * Validates the top-level shape of an extension map and rejects naming collisions before
 * anything is registered. Throws on the first failure.
 *
 * @param map - Raw record returned by the integrator's `extend(c => …)` callback.
 * @param takenNames - Names already in use on the target client (reserved + previously
 *   registered extensions).
 * @throws {InvalidExtensionShapeError} when `map` is not a non-empty plain object.
 * @throws {InvalidExtensionNameError} when a key does not match `/^[a-z][a-zA-Z0-9]*$/`.
 * @throws {ExtensionNameCollisionError} when a key collides with a reserved or already-used name.
 * @example
 * ```ts
 * validateExtensionMap({ myLending: () => ({}) }, RESERVED_MORPHO_CLIENT_NAMES);
 * ```
 */
export function validateExtensionMap(
  map: unknown,
  takenNames: readonly string[],
): asserts map is ExtensionMap {
  if (!isPlainObject(map)) {
    throw new InvalidExtensionShapeError(
      "extension callback must return a plain object",
    );
  }
  const entries = Object.entries(map);
  if (entries.length === 0) {
    throw new InvalidExtensionShapeError(
      "extension callback returned an empty object — register at least one entity factory",
    );
  }
  const taken = new Set(takenNames);
  for (const [name, value] of entries) {
    if (!VALID_NAME_REGEX.test(name)) {
      throw new InvalidExtensionNameError(name);
    }
    if (RESERVED_MORPHO_CLIENT_NAMES.includes(name)) {
      throw new ExtensionNameCollisionError(name, "reserved");
    }
    if (taken.has(name)) {
      throw new ExtensionNameCollisionError(name, "duplicate");
    }
    if (typeof value !== "function") {
      throw new InvalidExtensionShapeError(
        `value at key "${name}" is not a function (got ${typeof value})`,
      );
    }
  }
}

/**
 * Wraps an integrator-supplied entity factory so each call validates the returned entity, each
 * action method validates its returned action, and `buildTx` / `getRequirements` validate their
 * payloads. Validation is structural (not freeze-imposing) so the integrator keeps full control
 * of `deepFreeze` and `metadata` injection on the returned `Transaction`.
 *
 * @param entityName - Name the entity is registered under (used in error messages).
 * @param factory - The integrator's raw entity factory.
 * @returns A wrapped factory with the same signature.
 */
export function wrapExtensionFactory(
  entityName: string,
  factory: ExtensionEntityFactory,
): ExtensionEntityFactory {
  // biome-ignore lint/suspicious/noExplicitAny: pass-through of integrator-typed args.
  return (...args: any[]): ExtensionEntity => {
    const entity = factory(...args);
    return wrapEntity(entityName, entity);
  };
}

function wrapEntity(entityName: string, entity: unknown): ExtensionEntity {
  if (!isPlainObject(entity)) {
    throw new InvalidEntityShapeError(
      entityName,
      "entity factory must return a plain object",
    );
  }
  const wrapped: Record<
    string,
    // biome-ignore lint/suspicious/noExplicitAny: integrator-typed action method.
    (...args: any[]) => ExtensionAction
  > = {};
  for (const [methodName, method] of Object.entries(entity)) {
    if (typeof method !== "function") {
      throw new InvalidEntityShapeError(
        entityName,
        `property "${methodName}" is not a function (got ${typeof method})`,
      );
    }
    wrapped[methodName] = wrapEntityMethod(
      { entityName, methodName },
      // biome-ignore lint/suspicious/noExplicitAny: integrator-typed action method.
      method as (...args: any[]) => unknown,
    );
  }
  return wrapped;
}

function wrapEntityMethod(
  ctx: { entityName: string; methodName: string },
  // biome-ignore lint/suspicious/noExplicitAny: integrator-typed action method.
  method: (...args: any[]) => unknown,
  // biome-ignore lint/suspicious/noExplicitAny: integrator-typed action method.
): (...args: any[]) => ExtensionAction {
  // biome-ignore lint/suspicious/noExplicitAny: integrator-typed args pass-through.
  return (...args: any[]): ExtensionAction => {
    const action = method(...args);
    return wrapAction(ctx, action);
  };
}

function wrapAction(
  ctx: { entityName: string; methodName: string },
  action: unknown,
): ExtensionAction {
  if (!isPlainObject(action)) {
    throw new InvalidActionShapeError({
      ...ctx,
      reason: "action method must return a plain object",
    });
  }
  if (typeof action.buildTx !== "function") {
    throw new InvalidActionShapeError({
      ...ctx,
      reason: "missing required `buildTx` function",
    });
  }
  if (
    action.getRequirements !== undefined &&
    typeof action.getRequirements !== "function"
  ) {
    throw new InvalidActionShapeError({
      ...ctx,
      reason: "`getRequirements` must be a function when provided",
    });
  }

  const buildTx = action.buildTx as ExtensionAction["buildTx"];
  const getRequirements = action.getRequirements as
    | ExtensionAction["getRequirements"]
    | undefined;

  const wrapped: {
    // biome-ignore lint/suspicious/noExplicitAny: pass-through.
    buildTx: (...args: any[]) => ReturnType<ExtensionAction["buildTx"]>;
    getRequirements?: ExtensionAction["getRequirements"];
  } = {
    // biome-ignore lint/suspicious/noExplicitAny: pass-through.
    buildTx: (...buildArgs: any[]) => {
      const tx = buildTx(...buildArgs);
      assertValidTransactionShape(ctx, tx);
      return tx;
    },
  };
  if (getRequirements) {
    // biome-ignore lint/suspicious/noExplicitAny: pass-through.
    wrapped.getRequirements = async (...reqArgs: any[]) => {
      const requirements = await getRequirements(...reqArgs);
      assertValidRequirementsShape(ctx, requirements);
      return requirements;
    };
  }
  return wrapped;
}

function assertValidTransactionShape(
  ctx: { entityName: string; methodName: string },
  tx: unknown,
): void {
  const fail = (reason: string) => {
    throw new InvalidTransactionShapeError({ ...ctx, reason });
  };

  if (!isPlainObject(tx)) fail("buildTx() did not return an object");
  else if (typeof tx.to !== "string") fail("missing or non-string `to`");
  else if (typeof tx.value !== "bigint") fail("missing or non-bigint `value`");
  else if (typeof tx.data !== "string") fail("missing or non-string `data`");
  else if (!isPlainObject(tx.action)) fail("missing `action` object");
  else if (typeof tx.action.type !== "string")
    fail("`action.type` must be a string");
  else if (!isPlainObject(tx.action.args))
    fail("`action.args` must be an object");
}

function assertValidRequirementsShape(
  ctx: { entityName: string; methodName: string },
  requirements: unknown,
): void {
  if (!Array.isArray(requirements)) {
    throw new InvalidRequirementShapeError({
      ...ctx,
      index: -1,
      reason: "getRequirements() did not resolve to an array",
    });
  }
  for (let i = 0; i < requirements.length; i++) {
    const item = requirements[i];
    if (
      !isStructuralTransactionLike(item) &&
      !isStructuralRequirementLike(item)
    ) {
      throw new InvalidRequirementShapeError({
        ...ctx,
        index: i,
        reason:
          "item is neither a Transaction (`{ to, value, data, action }`) nor a Requirement (`{ sign, action }`)",
      });
    }
  }
}

const isStructuralTransactionLike = (value: unknown): boolean =>
  isPlainObject(value) &&
  typeof value.to === "string" &&
  typeof value.value === "bigint" &&
  typeof value.data === "string" &&
  isPlainObject(value.action) &&
  typeof (value.action as Record<string, unknown>).type === "string";

const isStructuralRequirementLike = (value: unknown): boolean =>
  isPlainObject(value) &&
  typeof value.sign === "function" &&
  isPlainObject(value.action) &&
  typeof (value.action as Record<string, unknown>).type === "string";
