import { Erc20Errors, UnknownEIP2612DataError } from "../../errors.js";
import type { Erc20Operations } from "../../operations.js";
import type { OperationHandler } from "../types.js";

import { handleErc20ApproveOperation } from "./approve.js";

export const handleErc20PermitOperation: OperationHandler<
  Erc20Operations["Erc20_Permit"]
> = ({ args: { spender, amount, nonce }, sender, address }, data) => {
  const senderTokenData = data.getHolding(sender, address);

  if (senderTokenData.erc2612Nonce == null)
    throw new UnknownEIP2612DataError(address, sender);

  if (senderTokenData.erc2612Nonce !== nonce)
    throw new Erc20Errors.InvalidEIP2612Nonce(address, sender, nonce);

  senderTokenData.erc2612Nonce += 1n;

  handleErc20ApproveOperation(
    {
      type: "Erc20_Approve",
      sender,
      address,
      args: {
        amount,
        spender,
      },
    },
    data,
  );
};
