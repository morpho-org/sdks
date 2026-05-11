import { BlueErrors, getChainAddresses, MathLib } from "@morpho-org/blue-sdk";

import { BlueSimulationErrors } from "../../errors.js";
import type { BlueOperations } from "../../operations.js";
import { handleErc20Operation } from "../erc20/index.js";
import type { OperationHandler } from "../types.js";

import { handleBlueAccrueInterestOperation } from "./accrueInterest.js";

/**
 * Simulates a `Blue_Borrow` operation on the provided draft state.
 *
 * Books the worst-case shares/assets allowed by `GeneralAdapter1.morphoBorrow`'s
 * `minSharePrice = WAD - slippage` floor (asset mode: `wDivUp` shares; share mode:
 * `wMulDown` assets) so the simulator never under-credits the resulting debt.
 *
 * @throws {BlueSimulationErrors.UnauthorizedBundler} If routed through GA1 and
 *   `onBehalf` has not authorized the bundler.
 * @throws {BlueErrors.InconsistentInput} If neither or both of `assets` and `shares` are set.
 * @throws {BlueErrors.UnknownOraclePrice} If the market oracle price is unknown.
 * @throws {BlueErrors.InsufficientLiquidity} If the market lacks liquidity.
 * @throws {BlueErrors.InsufficientCollateral} If the resulting position is unhealthy.
 */
export const handleBlueBorrowOperation: OperationHandler<
  BlueOperations["Blue_Borrow"]
> = (
  {
    args: { id, assets = 0n, shares = 0n, onBehalf, receiver, slippage = 0n },
    sender,
  },
  data,
) => {
  const {
    morpho,
    bundler3: { generalAdapter1 },
  } = getChainAddresses(data.chainId);

  if (sender === generalAdapter1) {
    const userData = data.getUser(onBehalf);

    if (!userData.isBundlerAuthorized)
      throw new BlueSimulationErrors.UnauthorizedBundler(onBehalf);
  }

  if ((assets === 0n) === (shares === 0n))
    throw new BlueErrors.InconsistentInput(assets, shares);

  handleBlueAccrueInterestOperation(
    {
      type: "Blue_AccrueInterest",
      sender: morpho,
      args: { id },
    },
    data,
  );

  const market = data.getMarket(id);
  if (market.price == null) throw new BlueErrors.UnknownOraclePrice(id);

  if (shares === 0n)
    shares = MathLib.wDivUp(
      market.toBorrowShares(assets, "Up"),
      MathLib.WAD - slippage,
    );
  else
    assets = market.toBorrowAssets(
      MathLib.wMulDown(shares, MathLib.WAD - slippage),
      "Down",
    );

  market.totalBorrowAssets += assets;
  market.totalBorrowShares += shares;

  if (market.totalBorrowAssets > market.totalSupplyAssets)
    throw new BlueErrors.InsufficientLiquidity(id);

  const position = data.getPosition(onBehalf, id);

  position.borrowShares += shares;

  if (!market.isHealthy(position))
    throw new BlueErrors.InsufficientCollateral(onBehalf, id);

  handleErc20Operation(
    {
      type: "Erc20_Transfer",
      sender: morpho,
      address: market.params.loanToken,
      args: {
        amount: assets,
        from: morpho,
        to: receiver,
      },
    },
    data,
  );
};
