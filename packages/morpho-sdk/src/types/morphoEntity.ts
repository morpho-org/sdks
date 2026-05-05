import type { MorphoClientType } from "./client.js";

/**
 * Base class every integrator-supplied entity registered through `MorphoClient.extend()` must
 * extend. Holds the parent client as a `protected readonly` field so subclasses access SDK-wide
 * configuration (`viemClient`, `options`, `options.metadata`, …) the same way the built-in
 * entities (`MorphoVaultV1`, `MorphoVaultV2`, `MorphoMarketV1`) do.
 *
 * Concrete subclasses declare their own constructor `(client, ...args)` and forward `client` to
 * `super(client)`. Action methods on the subclass return `{ buildTx, getRequirements? }`; the
 * SDK validates that shape lazily on each call. Methods that return non-action values (fetchers,
 * computed getters) are passed through unchanged.
 *
 * @example
 * ```ts
 * import { MorphoEntity, type MorphoClientType } from "@morpho-org/morpho-sdk";
 * import type { Address } from "viem";
 *
 * class MyLending extends MorphoEntity {
 *   constructor(
 *     client: MorphoClientType,
 *     public readonly vault: Address,
 *     public readonly chainId: number,
 *   ) {
 *     super(client);
 *   }
 *
 *   deposit({ amount, user }: { amount: bigint; user: Address }) {
 *     return {
 *       buildTx: () => ({
 *         to: this.vault,
 *         value: 0n,
 *         data: "0x",
 *         action: { type: "myLendingDeposit", args: { amount, user } },
 *       }),
 *     };
 *   }
 * }
 * ```
 */
export abstract class MorphoEntity {
  /**
   * @param client - The `MorphoClient` (or any `MorphoClientType`) the entity is bound to.
   */
  constructor(protected readonly client: MorphoClientType) {}
}
