import { MathLib, getChainAddresses } from "@morpho-org/blue-sdk";

import type { Erc20Operations } from "../../operations.js";
import type { OperationHandler } from "../types.js";

import { ZERO_ADDRESS } from "@morpho-org/morpho-ts";
import { handleErc20TransferOperation } from "./transfer.js";

export const handleErc20WrapOperation: OperationHandler<
  Erc20Operations["Erc20_Wrap"]
> = ({ address, args: { amount, owner, slippage = 0n }, sender }, data) => {
  const {
    bundler3: { generalAdapter1 },
  } = getChainAddresses(data.chainId);

  // Simulate the bundler's behavior on wraps only with MaxUint256.
  if (sender === generalAdapter1 && amount === MathLib.MAX_UINT_256)
    amount = data.getHolding(sender, address).balance;

  const wrappedToken = data.getWrappedToken(address);
  const wrappedAmount = wrappedToken.toWrappedExactAmountIn(amount, slippage);

  // Burn unwrapped assets.
  handleErc20TransferOperation(
    {
      type: "Erc20_Transfer",
      sender: address,
      address: wrappedToken.underlying,
      args: {
        amount,
        from: sender,
        to: ZERO_ADDRESS,
      },
    },
    data,
  );

  // Mint wrapped assets.
  handleErc20TransferOperation(
    {
      type: "Erc20_Transfer",
      sender: address,
      address: wrappedToken.address,
      args: {
        amount: wrappedAmount,
        from: ZERO_ADDRESS,
        to: owner,
      },
    },
    data,
  );
};
