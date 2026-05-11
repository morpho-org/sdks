import { BlueErrors, getChainAddresses, MathLib } from "@morpho-org/blue-sdk";
import { maxUint256 } from "viem";
import { BlueSimulationErrors } from "../../errors.js";
import type { BlueOperations } from "../../operations.js";
import { handleErc20Operation } from "../erc20/index.js";
import type { OperationHandler } from "../types.js";
import { handleBlueAccrueInterestOperation } from "./accrueInterest.js";

/**
 * Simulates a `Blue_Withdraw` operation on the provided draft state.
 *
 * Books the worst-case shares burned / assets received allowed by
 * `GeneralAdapter1.morphoWithdraw`'s `minSharePrice = WAD - slippage` floor
 * (asset mode: `wDivUp` shares; share mode: `wMulDown` assets) so the simulator
 * never under-debits the position.
 *
 * @throws {BlueSimulationErrors.UnauthorizedBundler} If routed through GA1 and
 *   `onBehalf` has not authorized the bundler.
 * @throws {BlueSimulationErrors.ZeroShares} If `shares === maxUint256` resolves
 *   to a zero supply position.
 * @throws {BlueErrors.InconsistentInput} If neither or both of `assets` and `shares` are set.
 * @throws {BlueErrors.InsufficientLiquidity} If the market lacks liquidity.
 * @throws {BlueErrors.InsufficientPosition} If the supply position cannot cover the withdrawal.
 */
export const handleBlueWithdrawOperation: OperationHandler<
  BlueOperations["Blue_Withdraw"]
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

    if (shares === maxUint256) {
      shares = data.getPosition(onBehalf, id).supplyShares;

      if (shares === 0n) throw new BlueSimulationErrors.ZeroShares();
    }
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

  if (shares === 0n)
    shares = MathLib.wDivUp(
      market.toSupplyShares(assets),
      MathLib.WAD - slippage,
    );
  else
    assets = market.toSupplyAssets(
      MathLib.wMulDown(shares, MathLib.WAD - slippage),
    );

  market.totalSupplyAssets -= assets;
  market.totalSupplyShares -= shares;

  if (market.totalBorrowAssets > market.totalSupplyAssets)
    throw new BlueErrors.InsufficientLiquidity(id);

  const position = data.getPosition(onBehalf, id);

  position.supplyShares -= shares;

  if (position.supplyShares < 0n)
    throw new BlueErrors.InsufficientPosition(onBehalf, id);

  // Transfer loan.
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
