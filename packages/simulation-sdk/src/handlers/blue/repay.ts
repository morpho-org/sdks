import { BlueErrors, MathLib, getChainAddresses } from "@morpho-org/blue-sdk";
import type { BlueOperations } from "../../operations.js";
import { handleOperations } from "../dispatchers.js";
import { handleErc20Operation } from "../erc20/index.js";
import type { OperationHandler } from "../types.js";

import { maxUint256 } from "viem";
import { BlueSimulationErrors } from "../../errors.js";
import { handleBlueAccrueInterestOperation } from "./accrueInterest.js";

export const handleBlueRepayOperation: OperationHandler<
  BlueOperations["Blue_Repay"]
> = (
  {
    args: { id, assets = 0n, shares = 0n, onBehalf, callback, slippage = 0n },
    sender,
  },
  data,
) => {
  const {
    morpho,
    bundler3: { generalAdapter1 },
  } = getChainAddresses(data.chainId);

  handleBlueAccrueInterestOperation(
    {
      type: "Blue_AccrueInterest",
      sender: morpho,
      args: { id },
    },
    data,
  );

  const market = data.getMarket(id);

  // Simulate the bundler's behavior on supply.
  if (sender === generalAdapter1) {
    if (assets === maxUint256) {
      assets = data.getHolding(
        generalAdapter1,
        market.params.loanToken,
      ).balance;

      if (assets === 0n) throw new BlueSimulationErrors.ZeroAssets();
    }

    if (shares === maxUint256) {
      shares = data.getPosition(onBehalf, id).borrowShares;

      if (shares === 0n) throw new BlueSimulationErrors.ZeroShares();
    }
  }

  if ((assets === 0n && shares === 0n) || (assets !== 0n && shares !== 0n))
    throw new BlueErrors.InconsistentInput(assets, shares);

  if (shares === 0n) {
    shares = market.toBorrowShares(
      MathLib.wDivDown(assets, MathLib.WAD + slippage),
    );
  } else
    assets = MathLib.wMulUp(
      market.toBorrowAssets(shares),
      MathLib.WAD + slippage,
    );

  market.totalBorrowAssets -= assets;
  market.totalBorrowShares -= shares;

  const position = data.getPosition(onBehalf, id);

  position.borrowShares -= shares;

  if (position.borrowShares < 0n)
    throw new BlueErrors.InsufficientPosition(onBehalf, market.id);

  if (callback) handleOperations(callback(data), data);

  // Transfer debt.
  handleErc20Operation(
    {
      type: "Erc20_Transfer",
      sender: morpho,
      address: market.params.loanToken,
      args: {
        amount: assets,
        from: sender,
        to: morpho,
      },
    },
    data,
  );
};
