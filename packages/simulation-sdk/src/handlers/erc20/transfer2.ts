import { getChainAddresses } from "@morpho-org/blue-sdk";

import { Erc20Errors } from "../../errors.js";
import type { Erc20Operations } from "../../operations.js";
import type { OperationHandler } from "../types.js";

import { handleErc20TransferOperation } from "./transfer.js";

export const handleErc20Transfer2Operation: OperationHandler<
  Erc20Operations["Erc20_Transfer2"]
> = ({ args: { amount, from, to }, address }, data) => {
  const fromHolding = data.tryGetHolding(from, address);
  if (fromHolding == null)
    throw new Erc20Errors.InsufficientBalance(address, from);

  const { permit2 } = getChainAddresses(data.chainId);

  const { permit2BundlerAllowance } = fromHolding;
  if (
    permit2BundlerAllowance.expiration < data.block.timestamp ||
    permit2BundlerAllowance.amount < amount
  )
    throw new Erc20Errors.InsufficientPermit2Allowance(address, from);

  permit2BundlerAllowance.amount -= amount;

  handleErc20TransferOperation(
    {
      type: "Erc20_Transfer",
      sender: permit2,
      address,
      args: {
        amount,
        from,
        to,
      },
    },
    data,
  );
};
