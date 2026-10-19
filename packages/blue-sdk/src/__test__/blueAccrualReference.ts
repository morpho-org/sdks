import { WAD } from "./adaptiveCurveIrmReference.js";
import { MAX_UINT_128, VIRTUAL_SHARES } from "./arbitraries.js";
/** @internal */
export const VIRTUAL_ASSETS = 1n;
const MAX_UINT_256 = 2n ** 256n - 1n;

/** @internal */
export type AccruedInterestState = {
  totalSupplyAssets: bigint;
  totalBorrowAssets: bigint;
  totalSupplyShares: bigint;
  totalBorrowShares: bigint;
  fee: bigint;
};

/** @internal */
export function accruedInterestRef({
  borrowRate,
  state,
  elapsed,
}: {
  borrowRate: bigint;
  state: AccruedInterestState;
  elapsed: bigint;
}) {
  const { totalSupplyAssets, totalBorrowAssets, totalSupplyShares, fee } =
    state;
  const first = borrowRate * elapsed;
  const second = (first * first) / (2n * WAD);
  const third = (second * first) / (3n * WAD);
  const interest = (totalBorrowAssets * (first + second + third)) / WAD;
  const feeAmount = (interest * fee) / WAD;
  const feeShares =
    fee === 0n
      ? 0n
      : (feeAmount * (totalSupplyShares + VIRTUAL_SHARES)) /
        (totalSupplyAssets + interest - feeAmount + VIRTUAL_ASSETS);

  return { interest, feeShares, feeAmount };
}

// morpho-blue src/Morpho.sol _accrueInterest; MathLib.wTaylorCompounded/mulDivDown; UtilsLib.toUint128
/** @internal */
export function blueAccrualRevertsRef({
  borrowRate,
  state,
  elapsed,
}: {
  borrowRate: bigint;
  state: AccruedInterestState;
  elapsed: bigint;
}): boolean {
  if (elapsed === 0n) return false;

  const first = borrowRate * elapsed;
  if (first > MAX_UINT_256) return true;

  const firstSquared = first * first;
  if (firstSquared > MAX_UINT_256) return true;
  const second = firstSquared / (2n * WAD);

  const secondTimesFirst = second * first;
  if (secondTimesFirst > MAX_UINT_256) return true;
  const third = secondTimesFirst / (3n * WAD);

  const growth = first + second + third;
  if (growth > MAX_UINT_256) return true;

  const interestProduct = state.totalBorrowAssets * growth;
  if (interestProduct > MAX_UINT_256) return true;
  const interest = interestProduct / WAD;
  if (interest > MAX_UINT_128) return true;
  if (state.totalBorrowAssets + interest > MAX_UINT_128) return true;
  if (state.totalSupplyAssets + interest > MAX_UINT_128) return true;

  if (state.fee === 0n) return false;

  const feeProduct = interest * state.fee;
  if (feeProduct > MAX_UINT_256) return true;
  const feeAmount = feeProduct / WAD;

  const feeSharesProduct =
    feeAmount * (state.totalSupplyShares + VIRTUAL_SHARES);
  if (feeSharesProduct > MAX_UINT_256) return true;
  const feeShares =
    feeSharesProduct /
    (state.totalSupplyAssets + interest - feeAmount + VIRTUAL_ASSETS);
  if (feeShares > MAX_UINT_128) return true;
  if (state.totalSupplyShares + feeShares > MAX_UINT_128) return true;

  return false;
}
