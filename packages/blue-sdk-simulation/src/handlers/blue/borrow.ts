import { BlueErrors, MathLib, getChainAddresses } from "@morpho-org/blue-sdk";

import { BlueSimulationErrors } from "../../errors";
import { BlueOperations } from "../../operations";
import { handleErc20Operation } from "../erc20";
import { OperationHandler } from "../types";

import { handleBlueAccrueInterestOperation } from "./accrueInterest";

export const handleBlueBorrowOperation: OperationHandler<
  BlueOperations["Blue_Borrow"]
> = (
  {
    args: { id, assets = 0n, shares = 0n, onBehalf, receiver, slippage = 0n },
    sender,
    address,
  },
  data,
) => {
  const { bundler } = getChainAddresses(data.chainId);

  if (sender === bundler) {
    const userData = data.getUser(onBehalf);

    if (!userData.isBundlerAuthorized)
      throw new BlueSimulationErrors.UnauthorizedBundler(onBehalf);
  }

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

  if (shares === 0n)
    shares = MathLib.wMulUp(
      market.toBorrowShares(assets, "Up"),
      MathLib.WAD + slippage,
    );
  else
    assets = market.toBorrowAssets(
      MathLib.wDivDown(shares, MathLib.WAD + slippage),
      "Down",
    );

  market.totalBorrowAssets += assets;
  market.totalBorrowShares += shares;

  if (market.totalBorrowAssets > market.totalSupplyAssets)
    throw new BlueErrors.InsufficientLiquidity(id);

  const position = data.getPosition(onBehalf, id);

  position.borrowShares += shares;

  if (!market.isHealthy(position))
    throw new BlueSimulationErrors.InsufficientCollateral(onBehalf, id);

  handleErc20Operation(
    {
      type: "Erc20_Transfer",
      sender: address,
      address: market.config.loanToken,
      args: {
        amount: assets,
        from: address,
        to: receiver,
      },
    },
    data,
  );
};
