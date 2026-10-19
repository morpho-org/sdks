// biome-ignore-all lint/complexity/useMaxParams: reference signatures mirror Solidity inputs.
import { fc } from "@fast-check/vitest";
import { edgeBiased, MAX_UINT_128, VIRTUAL_SHARES } from "./arbitraries.js";
import { VIRTUAL_ASSETS } from "./blueAccrualReference.js";

export { MAX_UINT_128, VIRTUAL_ASSETS, VIRTUAL_SHARES };

// morpho-blue src/libraries/ConstantsLib.sol
/** @internal */
export const ORACLE_PRICE_SCALE = 10n ** 36n;
/** @internal */
export const LIQUIDATION_CURSOR = 300_000_000_000_000_000n;
/** @internal */
export const MAX_LIQUIDATION_INCENTIVE_FACTOR = 1_150_000_000_000_000_000n;

/** @internal */
export const WAD = 10n ** 18n;
/** @internal */
export const MAX_PRICE = 1n << 128n;

/** @internal */
const enabledLltvs = [
  385_000_000_000_000_000n,
  625_000_000_000_000_000n,
  770_000_000_000_000_000n,
  860_000_000_000_000_000n,
  915_000_000_000_000_000n,
  945_000_000_000_000_000n,
  965_000_000_000_000_000n,
  980_000_000_000_000_000n,
] as const;

/** @internal */
export const uint128 = fc.oneof(
  fc.constantFrom(0n, 1n, 2n, VIRTUAL_SHARES, MAX_UINT_128),
  edgeBiased(0n, MAX_UINT_128),
);
/** @internal */
export const positiveUint128 = fc.oneof(
  fc.constantFrom(1n, 2n, VIRTUAL_SHARES, MAX_UINT_128),
  fc.bigInt({ min: 1n, max: MAX_UINT_128 }),
);
/** @internal */
export const priceArbitrary = fc.oneof(
  fc.constantFrom(1n, 2n, ORACLE_PRICE_SCALE, MAX_PRICE),
  fc.bigInt({ min: 1n, max: MAX_PRICE }),
);
/** @internal */
export const lltvArbitrary = fc.oneof(
  fc.constantFrom(0n, 1n, ...enabledLltvs, WAD - 1n),
  fc.bigInt({ min: 0n, max: WAD - 1n }),
);
/** @internal */
export const positiveLltv = fc.oneof(
  fc.constantFrom(1n, ...enabledLltvs, WAD - 1n),
  fc.bigInt({ min: 1n, max: WAD - 1n }),
);

/** @internal */
export const positionStateCase = (lltv = lltvArbitrary) =>
  fc
    .record({
      totalBorrowAssets: uint128,
      totalBorrowShares: uint128,
      price: priceArbitrary,
      collateral: uint128,
      lltv,
    })
    .chain(
      ({
        totalBorrowAssets,
        totalBorrowShares,
        price,
        collateral,
        lltv: positionLltv,
      }) =>
        fc.record({
          totalBorrowAssets: fc.constant(totalBorrowAssets),
          totalBorrowShares: fc.constant(totalBorrowShares),
          price: fc.constant(price),
          collateral: fc.constant(collateral),
          lltv: fc.constant(positionLltv),
          borrowShares: fc.bigInt({
            min: 0n,
            max: totalBorrowShares,
          }),
        }),
    );

/** @internal */
export const min = (first: bigint, second: bigint) =>
  first < second ? first : second;

/** @internal */
export const ceilDiv = (value: bigint, denominator: bigint) =>
  (value + denominator - 1n) / denominator;
/** @internal */
export const toAssetsUp = (
  shares: bigint,
  assets: bigint,
  totalShares: bigint,
) => ceilDiv(shares * (assets + VIRTUAL_ASSETS), totalShares + VIRTUAL_SHARES);
/** @internal */
export const toAssetsDown = (
  shares: bigint,
  assets: bigint,
  totalShares: bigint,
) => (shares * (assets + VIRTUAL_ASSETS)) / (totalShares + VIRTUAL_SHARES);
/** @internal */
export const toSharesUp = (
  assets: bigint,
  totalAssets: bigint,
  totalShares: bigint,
) =>
  ceilDiv(
    assets * (totalShares + VIRTUAL_SHARES),
    totalAssets + VIRTUAL_ASSETS,
  );
/** @internal */
export const toSharesDown = (
  assets: bigint,
  totalAssets: bigint,
  totalShares: bigint,
) => (assets * (totalShares + VIRTUAL_SHARES)) / (totalAssets + VIRTUAL_ASSETS);
/** @internal */
export const collateralValue = (collateral: bigint, oraclePrice: bigint) =>
  (collateral * oraclePrice) / ORACLE_PRICE_SCALE;
/** @internal */
export const maxBorrow = (
  collateral: bigint,
  oraclePrice: bigint,
  liquidationLtv: bigint,
) => (collateralValue(collateral, oraclePrice) * liquidationLtv) / WAD;
/** @internal Symmetrically returns the minimum collateral or threshold price for debt. */
export const minCollateralForDebt = (
  debt: bigint,
  priceOrCollateral: bigint,
  lltv: bigint,
) => ceilDiv(ceilDiv(debt * WAD, lltv) * ORACLE_PRICE_SCALE, priceOrCollateral);
/** @internal */
export const liquidationIncentiveFactor = (liquidationLtv: bigint) => {
  const factor =
    (WAD * WAD) / (WAD - (LIQUIDATION_CURSOR * (WAD - liquidationLtv)) / WAD);

  return factor < MAX_LIQUIDATION_INCENTIVE_FACTOR
    ? factor
    : MAX_LIQUIDATION_INCENTIVE_FACTOR;
};
/** @internal */
export const seizedCollateral = (
  repaidShares: bigint,
  totalBorrowAssets: bigint,
  totalBorrowShares: bigint,
  oraclePrice: bigint,
  liquidationLtv: bigint,
) =>
  (((toAssetsDown(repaidShares, totalBorrowAssets, totalBorrowShares) *
    liquidationIncentiveFactor(liquidationLtv)) /
    WAD) *
    ORACLE_PRICE_SCALE) /
  oraclePrice;
/** @internal */
export const isHealthy = (
  collateral: bigint,
  borrowShares: bigint,
  totalBorrowAssets: bigint,
  totalBorrowShares: bigint,
  oraclePrice: bigint,
  liquidationLtv: bigint,
) =>
  maxBorrow(collateral, oraclePrice, liquidationLtv) >=
  toAssetsUp(borrowShares, totalBorrowAssets, totalBorrowShares);
