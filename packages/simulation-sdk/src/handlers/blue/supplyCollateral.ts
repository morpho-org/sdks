import { MathLib, getChainAddresses } from "@morpho-org/blue-sdk";

import { BlueSimulationErrors } from "../../errors.js";
import type { BlueOperations } from "../../operations.js";
import { handleOperations } from "../dispatchers.js";
import { handleErc20Operation } from "../erc20/index.js";
import type { OperationHandler } from "../types.js";

export const handleBlueSupplyCollateralOperation: OperationHandler<
  BlueOperations["Blue_SupplyCollateral"]
> = ({ args: { id, assets, onBehalf, callback }, sender }, data) => {
  const {
    params: { collateralToken },
  } = data.getMarket(id);
  const {
    morpho,
    bundler3: { generalAdapter1 },
  } = getChainAddresses(data.chainId);

  // Simulate the bundler's behavior on supply.
  if (sender === generalAdapter1 && assets === MathLib.MAX_UINT_256)
    assets = data.getHolding(sender, collateralToken).balance;

  if (assets === 0n) throw new BlueSimulationErrors.ZeroAssets();

  const position = data.getPosition(onBehalf, id);

  position.collateral += assets;

  if (callback) handleOperations(callback(data), data);

  // Transfer collateral.
  handleErc20Operation(
    {
      type: "Erc20_Transfer",
      sender: morpho,
      address: collateralToken,
      args: {
        amount: assets,
        from: sender,
        to: morpho,
      },
    },
    data,
  );
};
