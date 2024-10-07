import { getChainAddresses } from "@morpho-org/blue-sdk";

import { Erc20Errors, UnknownContractError } from "../../errors.js";
import type { Erc20Operations } from "../../operations.js";
import type { OperationHandler } from "../types.js";

import { handleErc20TransferOperation } from "./transfer.js";

export const handleErc20Transfer2Operation: OperationHandler<
  Erc20Operations["Erc20_Transfer2"]
> = ({ args: { amount, from, to }, sender, address }, data) => {
  const fromHolding = data.tryGetHolding(from, address);
  if (fromHolding == null)
    throw new Erc20Errors.InsufficientBalance(address, from);

  const { morpho, bundler, permit2 } = getChainAddresses(data.chainId);
  const contract =
    sender === morpho ? "morpho" : sender === bundler ? "bundler" : undefined;

  if (contract == null) throw new UnknownContractError(sender);

  const permit2Allowance = fromHolding.permit2Allowances[contract];
  if (
    permit2Allowance.expiration < data.block.timestamp ||
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
