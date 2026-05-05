// biome-ignore-all lint/suspicious/noExplicitAny: variadic generic constraints in this file require `any[]` to accept arbitrarily-typed integrator constructors and action signatures (cf. viem's extend pattern).
import type { BaseAction, Requirement, Transaction } from "./action.js";
import type { MorphoClientType } from "./client.js";
import type { MorphoEntity } from "./morphoEntity.js";

/**
 * Shape every action returned by an integrator-defined entity method must satisfy.
 *
 * - `buildTx` is mandatory and must return a `Transaction`-shaped object (`{ to, value, data,
 *   action }`). The integrator owns whether the returned object is `deepFreeze`d or not, and
 *   whether `addTransactionMetadata` is applied.
 * - `getRequirements` is optional; when provided, it must return a promise resolving to an array
 *   of `Transaction` and/or `Requirement` items.
 *
 * `MorphoClient.extend()` validates these invariants lazily on each method call and throws
 * `InvalidActionShapeError` / `InvalidTransactionShapeError` / `InvalidRequirementShapeError`
 * when an integrator-supplied action drifts from the contract.
 *
 * Methods on an extension entity that do not return an `ExtensionAction`-shaped object (for
 * example async fetchers) are passed through unchanged.
 */
export interface ExtensionAction<TAction extends BaseAction = BaseAction> {
  readonly buildTx: (...args: any[]) => Transaction<TAction>;
  readonly getRequirements?: (
    ...args: any[]
  ) => Promise<readonly (Transaction<BaseAction> | Requirement)[]>;
}

/**
 * Constructor signature an entity class registered via `MorphoClient.extend()` must satisfy.
 * The first parameter is always the `MorphoClient` the entity is bound to; subsequent parameters
 * are the entity's identifying args (vault address, chain id, market params, …) and become the
 * call signature of `client.<name>(...)`.
 */
export type EntityConstructor<
  TArgs extends readonly any[] = readonly any[],
  TInstance extends MorphoEntity = MorphoEntity,
> = new (client: MorphoClientType, ...args: TArgs) => TInstance;

/**
 * Map passed to `MorphoClient.extend()`. Keys become accessor properties on the extended client;
 * values are constructors of classes extending {@link MorphoEntity}.
 */
export type ExtensionMap = Readonly<Record<string, EntityConstructor>>;

/**
 * Resolves an `ExtensionMap` to the call-signatures it adds onto the client surface. For each
 * `EntityConstructor`, drops the leading `client` parameter and exposes the remaining args as a
 * factory returning the entity instance.
 */
export type ExtensionInstances<TExt extends ExtensionMap> = {
  readonly [K in keyof TExt]: TExt[K] extends EntityConstructor<
    infer A,
    infer I
  >
    ? (...args: A) => I
    : never;
};
