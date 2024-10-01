import { getChainAddresses } from "@morpho-org/blue-sdk";

import { Erc20Errors, UnknownContractError } from "../../errors";
import { Erc20Operations } from "../../operations";
import { OperationHandler } from "../types";

export const handleErc20Permit2Operation: OperationHandler<
  Erc20Operations["Erc20_Permit2"]
> = (
  { args: { spender, amount, expiration, nonce }, sender, address },
  data,
) => {
  const { morpho, bundler } = getChainAddresses(data.chainId);
  const contract =
    spender === morpho ? "morpho" : spender === bundler ? "bundler" : undefined;

  if (contract == null) throw new UnknownContractError(spender);

  const senderTokenData = data.getHolding(sender, address);
  const permit2Allowance = senderTokenData.permit2Allowances[contract];

  if (permit2Allowance.nonce !== nonce)
    throw new Erc20Errors.InvalidPermit2Nonce(address, sender, contract, nonce);

  permit2Allowance.amount = amount;
  permit2Allowance.expiration = expiration;
  permit2Allowance.nonce += 1n;
};
