import { BlueErrors, getChainAddresses } from "@morpho-org/blue-sdk";

import { BlueSimulationErrors } from "../../errors.js";
import type { BlueOperations } from "../../operations.js";
import { handleErc20Operation } from "../erc20/index.js";
import type { OperationHandler } from "../types.js";

import { handleBlueAccrueInterestOperation } from "./accrueInterest.js";

export const handleBlueWithdrawCollateralOperation: OperationHandler<
  BlueOperations["Blue_WithdrawCollateral"]
> = ({ args: { id, assets, onBehalf, receiver }, sender }, data) => {
  if (assets === 0n) throw new BlueSimulationErrors.ZeroAssets();

  const {
    morpho,
    bundler3: { generalAdapter1 },
  } = getChainAddresses(data.chainId);

  if (sender === generalAdapter1) {
    const userData = data.getUser(onBehalf);

    if (!userData.isBundlerAuthorized)
      throw new BlueSimulationErrors.UnauthorizedBundler(onBehalf);
  }

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

  const position = data.getPosition(onBehalf, id);

  position.collateral -= assets;

  if (position.collateral < 0n)
    throw new BlueErrors.InsufficientPosition(onBehalf, id);

  if (!market.isHealthy(position))
    throw new BlueErrors.InsufficientCollateral(onBehalf, id);

  // Transfer collateral.
  handleErc20Operation(
    {
      type: "Erc20_Transfer",
      sender: morpho,
      address: market.params.collateralToken,
      args: {
        amount: assets,
        from: morpho,
        to: receiver,
      },
    },
    data,
  );
};
