import { getChainAddresses } from "@morpho-org/blue-sdk";

import { SimulationErrors } from "../../errors";
import { BlueOperation } from "../../operations";
import { OperationHandler } from "../types";

import { handleBlueAccrueInterestOperation } from "./accrueInterest";
import { handleBlueBorrowOperation } from "./borrow";
import { handleBlueRepayOperation } from "./repay";
import { handleBlueSetAuthorizationOperation } from "./setAuthorization";
import { handleBlueSupplyOperation } from "./supply";
import { handleBlueSupplyCollateralOperation } from "./supplyCollateral";
import { handleBlueWithdrawOperation } from "./withdraw";
import { handleBlueWithdrawCollateralOperation } from "./withdrawCollateral";

export const handleBlueOperation: OperationHandler<BlueOperation> = (
  operation,
  data,
) => {
  operation.address = getChainAddresses(data.chainId).morpho;

  if ("assets" in operation.args) {
    const { assets = 0n } = operation.args;

    if (assets < 0n) throw new SimulationErrors.InvalidInput({ assets });
  }

  if ("shares" in operation.args) {
    const { shares = 0n } = operation.args;

    if (shares < 0n) throw new SimulationErrors.InvalidInput({ shares });
  }

  switch (operation.type) {
    case "Blue_AccrueInterest":
      return handleBlueAccrueInterestOperation(operation, data);
    case "Blue_SetAuthorization":
      return handleBlueSetAuthorizationOperation(operation, data);
    case "Blue_Borrow":
      return handleBlueBorrowOperation(operation, data);
    case "Blue_Repay":
      return handleBlueRepayOperation(operation, data);
    case "Blue_Supply":
      return handleBlueSupplyOperation(operation, data);
    case "Blue_SupplyCollateral":
      return handleBlueSupplyCollateralOperation(operation, data);
    case "Blue_Withdraw":
      return handleBlueWithdrawOperation(operation, data);
    case "Blue_WithdrawCollateral":
      return handleBlueWithdrawCollateralOperation(operation, data);
  }
};
