import { Erc20Errors, SimulationErrors } from "../../errors.js";
import type { Erc20Operations } from "../../operations.js";
import type { OperationHandler } from "../types.js";

export const handleErc20Permit2Operation: OperationHandler<
  Erc20Operations["Erc20_Permit2"]
> = (
  { args: { amount, expiration, nonce, deadline }, sender, address },
  data,
) => {
  if (deadline != null) {
    if (deadline < 0n) throw new SimulationErrors.InvalidInput({ deadline });
    if (deadline < data.block.timestamp)
      throw new Erc20Errors.ExpiredPermit2Signature(address, sender, deadline);
  }

  const { permit2BundlerAllowance } = data.getHolding(sender, address);

  if (permit2BundlerAllowance.nonce !== nonce)
    throw new Erc20Errors.InvalidPermit2Nonce(address, sender, nonce);

  permit2BundlerAllowance.amount = amount;
  permit2BundlerAllowance.expiration = expiration;
  permit2BundlerAllowance.nonce += 1n;
};
