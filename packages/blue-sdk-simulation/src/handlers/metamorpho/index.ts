import { SimulationErrors } from "../../errors.js";
import { MetaMorphoOperation } from "../../operations.js";
import { OperationHandler } from "../types.js";

import { handleMetaMorphoAccrueInterestOperation } from "./accrueInterest.js";
import { handleMetaMorphoDepositOperation } from "./deposit.js";
import { handleMetaMorphoPublicReallocateOperation } from "./publicReallocate.js";
import { handleMetaMorphoReallocateOperation } from "./reallocate.js";
import { handleMetaMorphoWithdrawOperation } from "./withdraw.js";

export const handleMetaMorphoOperation: OperationHandler<
  MetaMorphoOperation
> = (operation, data) => {
  if ("assets" in operation.args) {
    const { assets = 0n } = operation.args;

    if (assets < 0n) throw new SimulationErrors.InvalidInput({ assets });
  }

  if ("shares" in operation.args) {
    const { shares = 0n } = operation.args;

    if (shares < 0n) throw new SimulationErrors.InvalidInput({ shares });
  }

  switch (operation.type) {
    case "MetaMorpho_AccrueInterest":
      return handleMetaMorphoAccrueInterestOperation(operation, data);
    case "MetaMorpho_Deposit":
      return handleMetaMorphoDepositOperation(operation, data);
    case "MetaMorpho_Withdraw":
      return handleMetaMorphoWithdrawOperation(operation, data);
    case "MetaMorpho_Reallocate":
      return handleMetaMorphoReallocateOperation(operation, data);
    case "MetaMorpho_PublicReallocate":
      return handleMetaMorphoPublicReallocateOperation(operation, data);
  }
};
