import { vaultV2Abi } from "@morpho-org/blue-sdk-viem";
import { deepFreeze } from "@morpho-org/morpho-ts";
import { type Address, encodeFunctionData, type Hex } from "viem";
import { encodeForceDeallocateCall } from "../../helpers/encodeDeallocation.js";
import { addTransactionMetadata } from "../../helpers/index.js";
import {
  type Deallocation,
  EmptyDeallocationsError,
  type Metadata,
  NonPositiveAssetAmountError,
  type Transaction,
  type VaultV2ForceWithdrawAction,
} from "../../types/index.js";

/** Parameters for {@link vaultV2ForceWithdraw}. */
export interface VaultV2ForceWithdrawParams {
  vault: {
    address: Address;
  };
  args: {
    deallocations: readonly Deallocation[];
    withdraw: {
      amount: bigint;
      recipient: Address;
    };
    onBehalf: Address;
  };
  metadata?: Metadata;
}

/**
 * Prepares a force-withdraw transaction for a VaultV2 contract via the vault's native `multicall`.
 *
 * Encodes one or more `forceDeallocate` calls followed by a single `withdraw`, executed
 * atomically through VaultV2's `multicall`. Frees liquidity from non-liquidity adapters and
 * withdraws the resulting assets in one transaction.
 *
 * A penalty is taken from `onBehalf` for each deallocation to discourage allocation
 * manipulation. The penalty is applied as a share burn where assets are returned to the vault,
 * so the share price stays stable (except for rounding).
 *
 * @param params.vault.address - The VaultV2 address.
 * @param params.args.deallocations - The deallocations to perform before withdrawing. Must be
 *   non-empty.
 * @param params.args.withdraw.amount - Amount of underlying assets to withdraw after the
 *   deallocations complete.
 * @param params.args.withdraw.recipient - Address that receives the withdrawn assets.
 * @param params.args.onBehalf - Address whose shares are burned and from which the deallocation
 *   penalty is taken.
 * @param params.metadata - Optional analytics metadata attached to the multicall transaction.
 * @returns A deep-frozen `Transaction<VaultV2ForceWithdrawAction>` with `to`, `value`, `data`,
 *   and the typed `action` discriminator the simulation layer consumes.
 * @throws {EmptyDeallocationsError} when `deallocations` is empty.
 * @throws {NonPositiveAssetAmountError} when `withdraw.amount <= 0n`, or when any
 *   `deallocations[i].amount <= 0n` (raised by `encodeForceDeallocateCall`).
 * @example
 * ```ts
 * import { vaultV2ForceWithdraw } from "@morpho-org/morpho-sdk";
 *
 * const tx = vaultV2ForceWithdraw({
 *   vault: { address: vaultAddress },
 *   args: {
 *     deallocations: [{ adapter, marketParams, amount: 500_000n }],
 *     withdraw: { amount: 500_000n, recipient },
 *     onBehalf,
 *   },
 * });
 * // tx satisfies Readonly<Transaction<VaultV2ForceWithdrawAction>>
 * ```
 */
export const vaultV2ForceWithdraw = ({
  vault: { address: vaultAddress },
  args: { deallocations, withdraw, onBehalf },
  metadata,
}: VaultV2ForceWithdrawParams): Readonly<
  Transaction<VaultV2ForceWithdrawAction>
> => {
  if (deallocations.length === 0) {
    throw new EmptyDeallocationsError(vaultAddress);
  }

  const { amount: withdrawAmount, recipient: withdrawRecipient } = withdraw;

  if (withdrawAmount <= 0n) {
    throw new NonPositiveAssetAmountError(vaultAddress);
  }

  const calls: Hex[] = [];

  for (const deallocation of deallocations) {
    calls.push(encodeForceDeallocateCall(deallocation, onBehalf));
  }

  calls.push(
    encodeFunctionData({
      abi: vaultV2Abi,
      functionName: "withdraw",
      args: [withdrawAmount, withdrawRecipient, onBehalf],
    }),
  );

  let tx = {
    to: vaultAddress,
    data: encodeFunctionData({
      abi: vaultV2Abi,
      functionName: "multicall",
      args: [calls],
    }),
    value: 0n,
  };

  if (metadata) {
    tx = addTransactionMetadata(tx, metadata);
  }

  return deepFreeze({
    ...tx,
    action: {
      type: "vaultV2ForceWithdraw",
      args: {
        vault: vaultAddress,
        deallocations: deallocations.map((d) => ({ ...d })),
        withdraw: {
          amount: withdrawAmount,
          recipient: withdrawRecipient,
        },
        onBehalf,
      },
    },
  });
};
