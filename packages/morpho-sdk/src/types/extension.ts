import type { BaseAction, Requirement, Transaction } from "./action.js";

/**
 * Shape every action returned by an integrator-provided entity method must satisfy.
 *
 * - `buildTx` is mandatory and must return a `Transaction`-shaped object (`{ to, value, data,
 *   action }`). The integrator owns whether the returned object is `deepFreeze`d or not.
 * - `getRequirements` is optional; when provided, it must return a promise resolving to an array
 *   of `Transaction` and/or `Requirement` items.
 *
 * `MorphoClient.extend()` validates these invariants at call time and throws
 * `InvalidActionShapeError` / `InvalidTransactionShapeError` / `InvalidRequirementShapeError`
 * when an integrator-supplied action drifts from the contract.
 */
// biome-ignore-all lint/suspicious/noExplicitAny: variadic generic constraints in this file require `any[]` to accept arbitrarily-typed integrator signatures (cf. viem's extend pattern).
export interface ExtensionAction<TAction extends BaseAction = BaseAction> {
  readonly buildTx: (...args: any[]) => Transaction<TAction>;
  readonly getRequirements?: (
    ...args: any[]
  ) => Promise<readonly (Transaction<BaseAction> | Requirement)[]>;
}

/**
 * Shape of an integrator entity exposed via `MorphoClient.extend()`. An entity is a record of
 * action factories — calling one returns an {@link ExtensionAction}.
 */
export interface ExtensionEntity {
  readonly [methodName: string]: (...args: any[]) => ExtensionAction;
}

/**
 * Top-level entity factory bound to a `MorphoClient`. Receives the entity's identifying args
 * (vault address, market params, etc.) and returns an {@link ExtensionEntity}.
 */
export type ExtensionEntityFactory = (...args: any[]) => ExtensionEntity;

/**
 * Map passed to `MorphoClient.extend()`. Keys become accessor properties on the extended client.
 */
export type ExtensionMap = Readonly<Record<string, ExtensionEntityFactory>>;
