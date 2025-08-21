import { MathLib } from "@morpho-org/blue-sdk";
import { SimulationErrors } from "../../errors.js";
import type { VaultV2Operation } from "../../operations.js";
import type { OperationHandler } from "../types.js";

import { handleVaultV2AccrueInterestOperation } from "./accrueInterest.js";
import { handleVaultV2DepositOperation } from "./deposit.js";
import { handleVaultV2WithdrawOperation } from "./withdraw.js";

export const handleVaultV2Operation: OperationHandler<VaultV2Operation> = (
  operation,
  data,
) => {
  if ("assets" in operation.args) {
    const { assets = 0n } = operation.args;

    if (assets < 0n) throw new SimulationErrors.InvalidInput({ assets });
  }

  if ("shares" in operation.args) {
    const { shares = 0n } = operation.args;

    if (shares < 0n) throw new SimulationErrors.InvalidInput({ shares });
  }

  if ("slippage" in operation.args) {
    const { slippage = 0n } = operation.args;

    if (slippage < 0n || slippage > MathLib.WAD)
      throw new SimulationErrors.InvalidInput({ slippage });
  }

  switch (operation.type) {
    case "VaultV2_AccrueInterest":
      return handleVaultV2AccrueInterestOperation(operation, data);
    case "VaultV2_Deposit":
      return handleVaultV2DepositOperation(operation, data);
    case "VaultV2_Withdraw":
      return handleVaultV2WithdrawOperation(operation, data);
  }
};
