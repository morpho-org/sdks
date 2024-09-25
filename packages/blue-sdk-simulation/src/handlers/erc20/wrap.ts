import { maxUint256, zeroAddress } from "viem";

import { MathLib, getChainAddresses } from "@morpho-org/blue-sdk";

import { Erc20Operations } from "../../operations.js";
import { OperationHandler } from "../types.js";

import { handleErc20TransferOperation } from "./transfer.js";

export const handleErc20WrapOperation: OperationHandler<
  Erc20Operations["Erc20_Wrap"]
> = ({ address, args: { amount, owner, slippage = 0n }, sender }, data) => {
  const { bundler } = getChainAddresses(data.chainId);

  // Simulate the bundler's behavior on wraps only with MaxUint256.
  if (sender === bundler && amount === maxUint256)
    amount = MathLib.min(amount, data.getHolding(bundler, address).balance);

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
        to: zeroAddress,
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
        from: zeroAddress,
        to: owner,
      },
    },
    data,
  );
};
