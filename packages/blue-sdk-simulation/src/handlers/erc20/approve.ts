import { getChainAddresses } from "@morpho-org/blue-sdk";

import { UnknownAllowanceError } from "../../errors.js";
import { Erc20Operations } from "../../operations.js";
import { OperationHandler } from "../types.js";

export const handleErc20ApproveOperation: OperationHandler<
  Erc20Operations["Erc20_Approve"]
> = ({ args: { spender, amount }, sender, address }, data) => {
  const senderTokenData = data.getHolding(sender, address);

  const { morpho, bundler, permit2 } = getChainAddresses(data.chainId);

  const contract =
    spender === morpho
      ? "morpho"
      : spender === bundler
        ? "bundler"
        : spender === permit2
          ? "permit2"
          : undefined;

  if (contract != null) senderTokenData.erc20Allowances[contract] = amount;
  else {
    const vault = data.vaults[spender];

    if (vault != null && vault.asset === address) {
      const vaultUserData = data.getVaultUser(spender, sender);

      vaultUserData.allowance = amount;
    } else throw new UnknownAllowanceError(address, sender, spender);
  }
};
