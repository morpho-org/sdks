import { SimulationErrors } from "../../errors";
import { MetaMorphoOperation } from "../../operations";
import { OperationHandler } from "../types";

import { handleMetaMorphoAccrueInterestOperation } from "./accrueInterest";
import { handleMetaMorphoDepositOperation } from "./deposit";
import { handleMetaMorphoPublicReallocateOperation } from "./publicReallocate";
import { handleMetaMorphoReallocateOperation } from "./reallocate";
import { handleMetaMorphoWithdrawOperation } from "./withdraw";

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
