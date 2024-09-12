import { MaxUint256 } from "ethers";

import { BlueErrors, MathLib, getChainAddresses } from "@morpho-org/blue-sdk";

import { BlueSimulationErrors } from "../../errors";
import { BlueOperations } from "../../operations";
import { handleOperations } from "../dispatchers";
import { handleErc20Operation } from "../erc20";
import { OperationHandler } from "../types";

import { handleBlueAccrueInterestOperation } from "./accrueInterest";

export const handleBlueRepayOperation: OperationHandler<
  BlueOperations["Blue_Repay"]
> = (
  {
    args: { id, assets = 0n, shares = 0n, onBehalf, callback, slippage = 0n },
    sender,
    address,
  },
  data,
) => {
  handleBlueAccrueInterestOperation(
    {
      type: "Blue_AccrueInterest",
      sender: address,
      address,
      args: { id },
    },
    data,
  );

  const market = data.getMarket(id);
  const { bundler } = getChainAddresses(data.chainId);

  // Simulate the bundler's behavior on supply.
  if (sender === bundler && assets === MaxUint256)
    assets = MathLib.min(
      assets,
      data.getHolding(bundler, market.config.loanToken).balance,
    );

  if (assets === 0n && shares === 0n) throw new BlueErrors.InconsistentInput();

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
    throw new BlueSimulationErrors.InsufficientPosition(onBehalf, market.id);

  if (callback) handleOperations(callback(data), data);

  // Transfer debt.
  handleErc20Operation(
    {
      type: "Erc20_Transfer",
      sender: address,
      address: market.config.loanToken,
      args: {
        amount: assets,
        from: sender,
        to: address,
      },
    },
    data,
  );
};
