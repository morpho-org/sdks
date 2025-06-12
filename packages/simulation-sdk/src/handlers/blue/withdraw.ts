import { BlueErrors, MathLib, getChainAddresses } from "@morpho-org/blue-sdk";

import { BlueSimulationErrors } from "../../errors.js";
import type { BlueOperations } from "../../operations.js";
import { handleErc20Operation } from "../erc20/index.js";
import type { OperationHandler } from "../types.js";

import { maxUint256 } from "viem";
import { handleBlueAccrueInterestOperation } from "./accrueInterest.js";

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
