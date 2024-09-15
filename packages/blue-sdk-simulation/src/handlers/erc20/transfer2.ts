import { getChainAddresses } from "@morpho-org/blue-sdk";

import { Erc20Errors, UnknownContractError } from "../../errors.js";
import { Erc20Operations } from "../../operations.js";
import { OperationHandler } from "../types.js";

import { handleErc20TransferOperation } from "./transfer.js";

export const handleErc20Transfer2Operation: OperationHandler<
  Erc20Operations["Erc20_Transfer2"]
> = ({ args: { amount, from, to }, sender, address }, data) => {
  const fromTokenData = data.holdings[from]?.[address];
  if (fromTokenData == null)
    throw new Erc20Errors.InsufficientBalance(address, from);

  const { morpho, bundler, permit2 } = getChainAddresses(data.chainId);
  const contract =
    sender === morpho ? "morpho" : sender === bundler ? "bundler" : undefined;

  if (contract == null) throw new UnknownContractError(sender);

  const permit2Allowance = fromTokenData.permit2Allowances[contract];
  if (
    permit2Allowance.expiration < data.timestamp ||
    permit2Allowance.amount < amount
  )
    throw new Erc20Errors.InsufficientPermit2Allowance(address, from, contract);

  permit2Allowance.amount -= amount;

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
