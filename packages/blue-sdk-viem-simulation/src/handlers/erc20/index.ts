import { SimulationErrors } from "../../errors";
import { Erc20Operation } from "../../operations";
import { OperationHandler } from "../types";

import { handleErc20ApproveOperation } from "./approve";
import { handleErc20PermitOperation } from "./permit";
import { handleErc20Permit2Operation } from "./permit2";
import { handleErc20TransferOperation } from "./transfer";
import { handleErc20Transfer2Operation } from "./transfer2";
import { handleErc20UnwrapOperation } from "./unwrap";
import { handleErc20WrapOperation } from "./wrap";

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
