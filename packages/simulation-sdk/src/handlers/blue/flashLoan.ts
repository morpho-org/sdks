import { getChainAddresses } from "@morpho-org/blue-sdk";
import { BlueSimulationErrors } from "../../errors.js";
import type { BlueOperations } from "../../operations.js";
import { handleOperations } from "../dispatchers.js";
import { handleErc20Operation } from "../erc20/index.js";
import type { OperationHandler } from "../types.js";

export const handleBlueFlashLoanOperation: OperationHandler<
  BlueOperations["Blue_FlashLoan"]
> = ({ args: { token, assets, callback }, sender }, data) => {
  const { morpho } = getChainAddresses(data.chainId);

  if (assets === 0n) throw new BlueSimulationErrors.ZeroAssets();

  // Transfer loan.
  handleErc20Operation(
    {
      type: "Erc20_Transfer",
      sender: morpho,
      address: token,
      args: {
        amount: assets,
        from: morpho,
        to: sender,
      },
    },
    data,
  );

  if (callback) handleOperations(callback(data), data);

  // Repay loan.
  handleErc20Operation(
    {
      type: "Erc20_Transfer",
      sender: morpho,
      address: token,
      args: {
        amount: assets,
        from: sender,
        to: morpho,
      },
    },
    data,
  );
};
