import { SimulationErrors } from "../../errors.js";
import type { ParaswapOperation } from "../../operations.js";
import type { OperationHandler } from "../types.js";

import { handleParaswapBuyOperation } from "./buy.js";
import { handleParaswapSellOperation } from "./sell.js";

export const handleParaswapOperation: OperationHandler<ParaswapOperation> = (
  operation,
  data,
) => {
  if ("amount" in operation.args) {
    const { amount, quotedAmount } = operation.args;

    if (amount < 0n) throw new SimulationErrors.InvalidInput({ amount });
    if (quotedAmount < 0n)
      throw new SimulationErrors.InvalidInput({ quotedAmount });
  }

  switch (operation.type) {
    case "Paraswap_Buy":
      return handleParaswapBuyOperation(operation, data);
    case "Paraswap_Sell":
      return handleParaswapSellOperation(operation, data);
  }
};
