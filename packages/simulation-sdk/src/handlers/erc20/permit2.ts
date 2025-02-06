import { Erc20Errors } from "../../errors.js";
import type { Erc20Operations } from "../../operations.js";
import type { OperationHandler } from "../types.js";

export const handleErc20Permit2Operation: OperationHandler<
  Erc20Operations["Erc20_Permit2"]
> = ({ args: { amount, expiration, nonce }, sender, address }, data) => {
  const { permit2BundlerAllowance } = data.getHolding(sender, address);

  if (permit2BundlerAllowance.nonce !== nonce)
    throw new Erc20Errors.InvalidPermit2Nonce(address, sender, nonce);

  permit2BundlerAllowance.amount = amount;
  permit2BundlerAllowance.expiration = expiration;
  permit2BundlerAllowance.nonce += 1n;
};
