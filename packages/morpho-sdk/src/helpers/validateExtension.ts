// biome-ignore-all lint/suspicious/noExplicitAny: integrator-supplied entity methods are arbitrarily typed; the runtime Proxy pass-through accepts any args.
import {
  type ExtensionAction,
  type ExtensionMap,
  ExtensionNameCollisionError,
  InvalidActionShapeError,
  InvalidEntityClassError,
  InvalidExtensionNameError,
  InvalidExtensionShapeError,
  InvalidRequirementShapeError,
  InvalidTransactionShapeError,
  isRequirementShape,
  isTransactionShape,
  MorphoEntity,
} from "../types/index.js";
import { isPlainObject } from "./typeGuards.js";

/**
 * Names that would hijack the JavaScript Promise/thenable protocol if registered as an extension.
 *
 * Only `then` matters: any object exposing a `.then` function is treated as a thenable by
 * `Promise.resolve`, `await`, returning from `async` functions, etc. — the runtime would call
 * `client.then(resolve, reject)` and silently invoke the integrator factory with promise
 * callbacks as constructor args. `catch` / `finally` are NOT part of the thenable protocol and
 * pose no automatic-invocation risk.
 *
 * @internal
 */
const PROMISE_TRAP_NAMES: ReadonlySet<string> = new Set(["then"]);

const VALID_NAME_REGEX = /^[a-z][a-zA-Z0-9]*$/;

/**
 * Validates the top-level shape of an extension map and rejects naming collisions before
 * anything is registered. Collision detection is delegated to the live client instance via the
 * `name in client` operator, so any field/method declared on `MorphoClient` (built-in or
 * previously registered via `.extend()`) — plus everything inherited from `Object.prototype`
 * (`constructor`, `toString`, `valueOf`, …) — is rejected without a hardcoded reserved list.
 * The `then` thenable trap is reserved separately because it is not on any standard prototype.
 *
 * @param map - Raw record passed to `MorphoClient.extend()`.
 * @param client - The live client instance the extension would attach to.
 * @throws {InvalidExtensionShapeError} when `map` is not a non-empty plain object.
 * @throws {InvalidExtensionNameError} when a key does not match `/^[a-z][a-zA-Z0-9]*$/`.
 * @throws {ExtensionNameCollisionError} when a key already exists on `client` (built-in or
 *   previously registered) or matches a Promise-protocol trap name (`then`).
 * @throws {InvalidEntityClassError} when a value is not a class extending `MorphoEntity`.
 * @internal
 */
export function validateExtensionMap(
  map: unknown,
  client: object,
): asserts map is ExtensionMap {
  if (!isPlainObject(map)) {
    throw new InvalidExtensionShapeError(
      "extensions argument must be a plain object",
    );
  }
  const entries = Object.entries(map);
  if (entries.length === 0) {
    throw new InvalidExtensionShapeError(
      "extensions object is empty — register at least one entity class",
    );
  }
  for (const [name, value] of entries) {
    if (!VALID_NAME_REGEX.test(name)) {
      throw new InvalidExtensionNameError(name);
    }
    if (PROMISE_TRAP_NAMES.has(name) || name in client) {
      throw new ExtensionNameCollisionError(name);
    }
    if (typeof value !== "function") {
      throw new InvalidEntityClassError(
        name,
        `value is ${typeof value}, expected a class constructor`,
      );
    }
    if (
      !value.prototype ||
      !(value.prototype instanceof MorphoEntity) ||
      value === MorphoEntity
    ) {
      throw new InvalidEntityClassError(
        name,
        "constructor does not extend MorphoEntity",
      );
    }
  }
}

/**
 * Wraps an entity instance with a Proxy that lazily validates the shape of every action method
 * call. Methods returning an `ExtensionAction`-shaped object (`{ buildTx, getRequirements? }`)
 * have their `buildTx()` and `getRequirements()` payloads structurally checked against the
 * `Transaction` / `Requirement` contracts; methods returning anything else (fetchers, getters)
 * are passed through unchanged.
 *
 * The Proxy preserves `instanceof` against the integrator's class. Validation is non-destructive:
 * extra fields the integrator placed on the action object are preserved alongside the
 * standard-contract `buildTx` / `getRequirements`, and the integrator's freeze and metadata
 * choices on the returned `Transaction` are preserved.
 *
 * Trade-offs to be aware of:
 * - **Symbol-keyed reads bypass validation.** `Symbol.iterator`, `Symbol.toPrimitive`, etc. are
 *   meta-protocol; intercepting them would break iteration / coercion. An entity exposing an
 *   action via a Symbol key gets no shape check.
 * - **Method `this` binding uses the raw target, not the Proxy receiver.** Nested calls like
 *   `this.deposit(...)` from inside another method bypass the validating Proxy on the inner call.
 *   Validation always runs at the outer public-method boundary.
 * - **Async actions are rejected.** A method returning `Promise<{ buildTx, … }>` cannot be
 *   structurally validated synchronously; `InvalidActionShapeError` is raised instead, mirroring
 *   the SDK's "actions are sync" rule (root `AGENTS.md` §1).
 *
 * @param entityName - Name the entity is registered under (used in error messages).
 * @param instance - Freshly constructed entity instance.
 * @returns A Proxy over `instance`.
 * @internal
 */
export function wrapEntityInstance<T extends MorphoEntity>(
  entityName: string,
  instance: T,
): T {
  return new Proxy(instance, {
    // biome-ignore lint/complexity/useMaxParams: Proxy `get` trap signature is fixed by the JS spec.
    get(target, prop, receiver) {
      if (prop === "constructor" || typeof prop === "symbol") {
        return Reflect.get(target, prop, receiver);
      }
      const value = Reflect.get(target, prop, receiver);
      const methodName = String(prop);
      if (typeof value === "function") {
        return (...args: any[]) => {
          const result = (value as (...a: any[]) => unknown).apply(
            target,
            args,
          );
          if (isThenable(result)) {
            throw new InvalidActionShapeError(
              entityName,
              methodName,
              "action methods must be synchronous (returned a Promise / thenable)",
            );
          }
          if (looksLikeActionAttempt(result)) {
            return wrapAction(entityName, methodName, result);
          }
          return result;
        };
      }
      // Non-function read (data field, getter result). If it looks like an action attempt
      // (`{ buildTx, … }`), wrap-and-validate so getter-based actions get the same treatment as
      // method-based ones. Plain data passes through.
      if (looksLikeActionAttempt(value)) {
        return wrapAction(entityName, methodName, value);
      }
      return value;
    },
  });
}

/**
 * "Looks like an action attempt" = the integrator put a `buildTx` key on the returned object.
 * Whether the value is callable is checked by `wrapAction`, which raises
 * `InvalidActionShapeError` when `buildTx` is not a function. This separation gives the
 * integrator a typed error for `{ buildTx: 42 }` instead of a confusing native `TypeError`.
 */
const looksLikeActionAttempt = (
  value: unknown,
): value is { buildTx: unknown; getRequirements?: unknown } & Record<
  string,
  unknown
> => isPlainObject(value) && "buildTx" in value;

const isThenable = (value: unknown): boolean =>
  isPlainObject(value) &&
  typeof (value as { then?: unknown }).then === "function";

// biome-ignore lint/complexity/useMaxParams: error-context (entityName, methodName) + payload — splitting would obscure the call site.
function wrapAction(
  entityName: string,
  methodName: string,
  action: { buildTx: unknown; getRequirements?: unknown } & Record<
    string,
    unknown
  >,
): ExtensionAction {
  if (typeof action.buildTx !== "function") {
    throw new InvalidActionShapeError(
      entityName,
      methodName,
      `\`buildTx\` must be a function (got ${typeof action.buildTx})`,
    );
  }
  if (
    action.getRequirements !== undefined &&
    typeof action.getRequirements !== "function"
  ) {
    throw new InvalidActionShapeError(
      entityName,
      methodName,
      "`getRequirements` must be a function when provided",
    );
  }

  const buildTx = action.buildTx as ExtensionAction["buildTx"];
  const getRequirements = action.getRequirements as
    | ExtensionAction["getRequirements"]
    | undefined;

  // Spread to preserve any extra fields the integrator put on the action (description, version,
  // helper sub-fields, …) alongside the validated contract methods.
  const wrappedBuildTx = (...buildArgs: any[]) => {
    const tx = buildTx(...buildArgs);
    assertValidTransactionShape(entityName, methodName, tx);
    return tx;
  };
  const wrappedGetRequirements = getRequirements
    ? async (...reqArgs: any[]) => {
        const requirements = await getRequirements(...reqArgs);
        assertValidRequirementsShape(entityName, methodName, requirements);
        return requirements;
      }
    : undefined;
  return {
    ...action,
    buildTx: wrappedBuildTx,
    ...(wrappedGetRequirements && { getRequirements: wrappedGetRequirements }),
  } as ExtensionAction & Record<string, unknown>;
}

// biome-ignore lint/complexity/useMaxParams: error-context (entityName, methodName) + payload.
function assertValidTransactionShape(
  entityName: string,
  methodName: string,
  tx: unknown,
): void {
  if (!isPlainObject(tx)) {
    throw new InvalidTransactionShapeError(
      entityName,
      methodName,
      "buildTx() did not return an object",
    );
  }
  if (typeof tx.to !== "string") {
    throw new InvalidTransactionShapeError(
      entityName,
      methodName,
      "missing or non-string `to`",
    );
  }
  if (typeof tx.value !== "bigint") {
    throw new InvalidTransactionShapeError(
      entityName,
      methodName,
      "missing or non-bigint `value`",
    );
  }
  if (typeof tx.data !== "string") {
    throw new InvalidTransactionShapeError(
      entityName,
      methodName,
      "missing or non-string `data`",
    );
  }
  if (!isPlainObject(tx.action)) {
    throw new InvalidTransactionShapeError(
      entityName,
      methodName,
      "missing `action` object",
    );
  }
  if (typeof tx.action.type !== "string") {
    throw new InvalidTransactionShapeError(
      entityName,
      methodName,
      "`action.type` must be a string",
    );
  }
  if (!isPlainObject(tx.action.args)) {
    throw new InvalidTransactionShapeError(
      entityName,
      methodName,
      "`action.args` must be an object",
    );
  }
}

// biome-ignore lint/complexity/useMaxParams: error-context (entityName, methodName) + payload.
function assertValidRequirementsShape(
  entityName: string,
  methodName: string,
  requirements: unknown,
): void {
  if (!Array.isArray(requirements)) {
    throw new InvalidRequirementShapeError(
      entityName,
      methodName,
      -1,
      "getRequirements() did not resolve to an array",
    );
  }
  for (let i = 0; i < requirements.length; i++) {
    const item = requirements[i];
    if (!isTransactionShape(item) && !isRequirementShape(item)) {
      throw new InvalidRequirementShapeError(
        entityName,
        methodName,
        i,
        "item is neither a Transaction (`{ to, value, data, action }`) nor a Requirement (`{ sign, action }`)",
      );
    }
  }
}
