import { maxUint256 } from "viem";
import {
  Erc20Errors,
  SimulationErrors,
  UnknownEIP2612DataError,
} from "../../errors.js";
import type { Erc20Operations } from "../../operations.js";
import type { OperationHandler } from "../types.js";

import { getChainAddresses } from "@morpho-org/blue-sdk";
import { handleErc20ApproveOperation } from "./approve.js";

export const handleErc20PermitOperation: OperationHandler<
  Erc20Operations["Erc20_Permit"]
> = ({ args: { spender, amount, nonce, deadline }, sender, address }, data) => {
  if (deadline != null) {
    if (deadline < 0n) throw new SimulationErrors.InvalidInput({ deadline });
    if (deadline < data.block.timestamp)
      throw new Erc20Errors.ExpiredEIP2612Signature(address, sender, deadline);
  }

  const senderTokenData = data.getHolding(sender, address);

  if (senderTokenData.erc2612Nonce == null)
    throw new UnknownEIP2612DataError(address, sender);

  if (senderTokenData.erc2612Nonce !== nonce)
    throw new Erc20Errors.InvalidEIP2612Nonce(address, sender, nonce);

  senderTokenData.erc2612Nonce += 1n;

  const { dai } = getChainAddresses(data.chainId);

  handleErc20ApproveOperation(
    {
      type: "Erc20_Approve",
      sender,
      address,
      args: {
        amount: address === dai && amount > 0n ? maxUint256 : amount,
        spender,
      },
    },
    data,
  );
};
