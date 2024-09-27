import { SimulationErrors } from "../../errors.js";
import { Erc20Operation } from "../../operations.js";
import { OperationHandler } from "../types.js";

import { handleErc20ApproveOperation } from "./approve.js";
import { handleErc20PermitOperation } from "./permit.js";
import { handleErc20Permit2Operation } from "./permit2.js";
import { handleErc20TransferOperation } from "./transfer.js";
import { handleErc20Transfer2Operation } from "./transfer2.js";
import { handleErc20UnwrapOperation } from "./unwrap.js";
import { handleErc20WrapOperation } from "./wrap.js";

export const handleErc20Operation: OperationHandler<Erc20Operation> = (
  operation,
  data,
) => {
  if ("amount" in operation.args) {
    const { amount } = operation.args;

    if (amount < 0n) throw new SimulationErrors.InvalidInput({ amount });
  }

  switch (operation.type) {
    case "Erc20_Approve":
      return handleErc20ApproveOperation(operation, data);
    case "Erc20_Permit":
      return handleErc20PermitOperation(operation, data);
    case "Erc20_Permit2":
      return handleErc20Permit2Operation(operation, data);
    case "Erc20_Transfer":
      return handleErc20TransferOperation(operation, data);
    case "Erc20_Transfer2":
      return handleErc20Transfer2Operation(operation, data);
    case "Erc20_Wrap":
      return handleErc20WrapOperation(operation, data);
    case "Erc20_Unwrap":
      return handleErc20UnwrapOperation(operation, data);
  }
};
