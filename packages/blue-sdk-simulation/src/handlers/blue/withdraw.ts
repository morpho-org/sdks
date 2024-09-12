import { BlueErrors, MathLib, getChainAddresses } from "@morpho-org/blue-sdk";

import { BlueSimulationErrors } from "../../errors";
import { BlueOperations } from "../../operations";
import { handleErc20Operation } from "../erc20";
import { OperationHandler } from "../types";

import { handleBlueAccrueInterestOperation } from "./accrueInterest";

export const handleBlueWithdrawOperation: OperationHandler<
  BlueOperations["Blue_Withdraw"]
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
      market.toSupplyShares(assets),
      MathLib.WAD + slippage,
    );
  else
    assets = market.toSupplyAssets(
      MathLib.wDivDown(shares, MathLib.WAD + slippage),
    );

  market.totalSupplyAssets -= assets;
  market.totalSupplyShares -= shares;

  if (market.totalBorrowAssets > market.totalSupplyAssets)
    throw new BlueErrors.InsufficientLiquidity(id);

  const position = data.getPosition(onBehalf, id);

  position.supplyShares -= shares;

  if (position.supplyShares < 0n)
    throw new BlueSimulationErrors.InsufficientPosition(onBehalf, id);

  // Transfer loan.
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
