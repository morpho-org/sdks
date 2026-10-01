import { type Address, isAddressEqual } from "viem";
import type { SimulationState, SimulationStateChange } from "../../result.js";

const eq = (a: Address, b: Address) => isAddressEqual(a, b);

/**
 * Signed per-subject difference between two states sharing one subject
 * template. Only changed subjects appear; equal states produce an empty
 * {@link SimulationStateChange}. `before`/`after` may be any state view —
 * raw parsed phases or an accrued projection.
 * @internal
 */
export function diffState(
  before: SimulationState,
  after: SimulationState,
): SimulationStateChange {
  const balances = after.balances
    .map((balance) => {
      const prior = before.balances.find(
        (w) => eq(w.account, balance.account) && eq(w.token, balance.token),
      );
      const diff = balance.assets - (prior?.assets ?? 0n);
      return diff === 0n ? null : { ...balance, assets: diff };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry != null);

  const allowances = after.allowances
    .map((allowance) => {
      const prior = before.allowances.find(
        (p) =>
          eq(p.token, allowance.token) &&
          eq(p.owner, allowance.owner) &&
          eq(p.spender, allowance.spender),
      );
      const diff = allowance.amount - (prior?.amount ?? 0n);
      return diff === 0n ? null : { ...allowance, amount: diff };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry != null);

  const positions = after.positions
    .map((position) => {
      const prior = before.positions.find(
        (p) => p.marketId === position.marketId && eq(p.user, position.user),
      );
      const diffs = {
        supplyAssets: position.supplyAssets - (prior?.supplyAssets ?? 0n),
        supplyShares: position.supplyShares - (prior?.supplyShares ?? 0n),
        borrowAssets: position.borrowAssets - (prior?.borrowAssets ?? 0n),
        borrowShares: position.borrowShares - (prior?.borrowShares ?? 0n),
        collateral: position.collateral - (prior?.collateral ?? 0n),
      };
      if (Object.values(diffs).every((d) => d === 0n)) return null;
      return {
        marketId: position.marketId,
        user: position.user,
        ...diffs,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry != null);

  const markets = after.markets
    .map((market) => {
      const prior = before.markets.find((m) => m.marketId === market.marketId);
      const diffs = {
        totalSupplyAssets:
          market.totalSupplyAssets - (prior?.totalSupplyAssets ?? 0n),
        totalSupplyShares:
          market.totalSupplyShares - (prior?.totalSupplyShares ?? 0n),
        totalBorrowAssets:
          market.totalBorrowAssets - (prior?.totalBorrowAssets ?? 0n),
        totalBorrowShares:
          market.totalBorrowShares - (prior?.totalBorrowShares ?? 0n),
        liquidityAssets:
          market.liquidityAssets - (prior?.liquidityAssets ?? 0n),
      };
      if (Object.values(diffs).every((d) => d === 0n)) return null;
      return { marketId: market.marketId, ...diffs };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry != null);

  const vaults = after.vaults
    .map((vault) => {
      const prior = before.vaults.find((v) => eq(v.vault, vault.vault));
      const diffs = {
        totalAssets: vault.totalAssets - (prior?.totalAssets ?? 0n),
        totalShares: vault.totalShares - (prior?.totalShares ?? 0n),
        userShares: vault.userShares - (prior?.userShares ?? 0n),
        idleAssets: vault.idleAssets - (prior?.idleAssets ?? 0n),
      };
      if (Object.values(diffs).every((d) => d === 0n)) return null;
      return { vault: vault.vault, ...diffs };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry != null);

  const morphoAuthorizations = after.morphoAuthorizations
    .map((auth) => {
      const prior = before.morphoAuthorizations.find(
        (p) =>
          eq(p.authorizer, auth.authorizer) &&
          eq(p.authorized, auth.authorized),
      );
      const priorValue = prior?.after ?? false;
      return auth.after === priorValue ? null : { ...auth, before: priorValue };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry != null);

  const nonces = after.nonces
    .map((nonce) => {
      const prior = before.nonces.find(
        (p) =>
          p.type === nonce.type &&
          eq(p.verifyingContract, nonce.verifyingContract) &&
          eq(p.owner, nonce.owner) &&
          (p.type !== "permit2" ||
            nonce.type !== "permit2" ||
            p.nonce === nonce.nonce),
      );
      const priorValue = prior?.after ?? 0n;
      return nonce.after === priorValue
        ? null
        : { ...nonce, before: priorValue };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry != null);

  return {
    balances,
    allowances,
    morphoAuthorizations,
    nonces,
    positions,
    markets,
    vaults,
  };
}
