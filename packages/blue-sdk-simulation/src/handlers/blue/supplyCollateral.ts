import { MaxUint256 } from "ethers";

import { MathLib, getChainAddresses } from "@morpho-org/blue-sdk";

import { BlueSimulationErrors } from "../../errors";
import { BlueOperations } from "../../operations";
import { handleOperations } from "../dispatchers";
import { handleErc20Operation } from "../erc20";
import { OperationHandler } from "../types";

export const handleBlueSupplyCollateralOperation: OperationHandler<
  BlueOperations["Blue_SupplyCollateral"]
> = ({ args: { id, assets, onBehalf, callback }, sender, address }, data) => {
  const { collateralToken } = data.getMarketConfig(id);
  const { bundler } = getChainAddresses(data.chainId);

  // Simulate the bundler's behavior on supply.
  if (sender === bundler && assets === MaxUint256)
    assets = MathLib.min(
      assets,
      data.getHolding(bundler, collateralToken).balance,
    );

  if (assets === 0n) throw new BlueSimulationErrors.ZeroAssets();

  const position = data.getPosition(onBehalf, id);

  position.collateral += assets;

  if (callback) handleOperations(callback(data), data);

  // Transfer collateral.
  handleErc20Operation(
    {
      type: "Erc20_Transfer",
      sender: address,
      address: collateralToken,
      args: {
        amount: assets,
        from: sender,
        to: address,
      },
    },
    data,
  );
};
