import type { ExtensionEntityFactory } from "../types/index.js";

/**
 * Identity helper used to attach the {@link ExtensionEntityFactory} contract to a standalone
 * entity factory, so TypeScript surfaces shape errors at the definition site rather than at
 * the `MorphoClient.extend()` call site.
 *
 * Inline definitions inside `.extend((c) => ({ ... }))` already get full contextual typing —
 * `defineEntity` is for factories declared in their own variable or file.
 *
 * @param factory - The integrator's entity factory.
 * @returns The same factory, narrowed to its inferred type.
 * @example
 * ```ts
 * import { defineEntity, MorphoClient } from "@morpho-org/morpho-sdk";
 *
 * const myLending = defineEntity((vault: Address, chainId: number) => ({
 *   depositAndBoost: ({ amount }: { amount: bigint }) => ({
 *     buildTx: () => encode({ vault, chainId, amount }),
 *   }),
 * }));
 *
 * new MorphoClient(viemClient).extend(() => ({ myLending }));
 * ```
 */
export const defineEntity = <T extends ExtensionEntityFactory>(factory: T): T =>
  factory;
