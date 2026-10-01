import { type Address, ethAddress, isAddressEqual } from "viem";
import type { TokenBalance } from "../../result.js";
import type { Transfer } from "../../types.js";

/**
 * Map one account's `eth_getBalance` reading at the pinned block to the
 * {@link TokenBalance} shape used by `SimulationState.balances`.
 * @internal
 */
export const nativeBalance = (
  account: Address,
  assets: bigint,
): TokenBalance => ({
  account,
  token: ethAddress,
  assets,
});

/**
 * Project the `after`-phase native balances: `eth_getBalance` at the pinned
 * block plus the net native transfers `traceTransfers` reported for each
 * account. Gas is not charged (`validation: false`), so the projection is
 * exact; accounts untouched by native moves keep their before balance.
 * @internal
 */
export function projectNativeAfter(params: {
  readonly before: readonly TokenBalance[];
  readonly transfers: readonly Transfer[];
}): TokenBalance[] {
  const { before, transfers } = params;
  const net = new Map<Address, bigint>();
  for (const transfer of transfers) {
    if (!isAddressEqual(transfer.token, ethAddress)) continue;
    net.set(transfer.from, (net.get(transfer.from) ?? 0n) - transfer.amount);
    net.set(transfer.to, (net.get(transfer.to) ?? 0n) + transfer.amount);
  }
  const seen = new Set<Address>();
  const balances = before.map((balance) => {
    seen.add(balance.account);
    return {
      ...balance,
      assets: balance.assets + (net.get(balance.account) ?? 0n),
    };
  });
  for (const [account, assets] of net) {
    if (assets !== 0n && !seen.has(account))
      balances.push({ account, token: ethAddress, assets });
  }
  return balances;
}
