import type { OperationLimit } from "../../limits.js";

type OperationType = OperationLimit["type"];

/**
 * The limit interface declaring `type: T` — the parent union spreads one
 * interface across sibling discriminants (e.g. `VaultDepositLimit` covers both
 * `vaultV1Deposit` and `vaultV2Deposit`), so lookup filters by membership of
 * `T` in each member's `type` union rather than `Extract`.
 * @internal
 */
export type LimitOf<T extends OperationType> = OperationLimit extends infer U
  ? U extends OperationLimit
    ? T extends U["type"]
      ? U
      : never
    : never
  : never;

/**
 * Per-operation limit fields keyed by operation type; the binding table in
 * `enforce-limits.ts` is typed against this mapped view.
 * @internal
 */
export type OperationLimitFields = {
  readonly [T in OperationType]: Omit<LimitOf<T>, "type" | "transactionIndex">;
};

export type { OperationLimit } from "../../limits.js";
