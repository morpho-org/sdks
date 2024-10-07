import { maxUint256, zeroAddress } from "viem";

import {
  MathLib,
  erc20WrapperTokens,
  getChainAddresses,
} from "@morpho-org/blue-sdk";

import type { Erc20Operations } from "../../operations.js";
import type { OperationHandler } from "../types.js";

import { handleErc20TransferOperation } from "./transfer.js";

export const handleErc20UnwrapOperation: OperationHandler<
  Erc20Operations["Erc20_Unwrap"]
> = ({ address, args: { amount, receiver, slippage = 0n }, sender }, data) => {
  const { bundler } = getChainAddresses(data.chainId);

  // Simulate the bundler's behavior on unwraps only with MaxUint256.
  if (sender === bundler && amount === maxUint256)
    amount = MathLib.min(amount, data.getHolding(bundler, address).balance);

  const wrappedToken = data.getWrappedToken(address);
  const unwrappedAmount = wrappedToken.toUnwrappedExactAmountIn(
    amount,
    slippage,
  );

  if (!erc20WrapperTokens[data.chainId].has(address)) receiver = sender;

  // Burn wrapped assets.
  handleErc20TransferOperation(
    {
      type: "Erc20_Transfer",
      sender: address,
      address,
      args: {
        amount,
        from: sender,
        to: zeroAddress,
      },
    },
    data,
  );

  // Mint unwrapped assets.
  handleErc20TransferOperation(
    {
      type: "Erc20_Transfer",
      sender: address,
      address: wrappedToken.underlying,
      args: {
        amount: unwrappedAmount,
        from: zeroAddress,
        to: receiver,
      },
    },
    data,
  );
};
