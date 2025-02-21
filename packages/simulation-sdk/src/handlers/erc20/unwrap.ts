import {
  MathLib,
  erc20WrapperTokens,
  getChainAddresses,
} from "@morpho-org/blue-sdk";

import type { Erc20Operations } from "../../operations.js";
import type { OperationHandler } from "../types.js";

import { ZERO_ADDRESS } from "@morpho-org/morpho-ts";
import { handleErc20TransferOperation } from "./transfer.js";

export const handleErc20UnwrapOperation: OperationHandler<
  Erc20Operations["Erc20_Unwrap"]
> = ({ address, args: { amount, receiver, slippage = 0n }, sender }, data) => {
  const {
    bundler3: { generalAdapter1 },
  } = getChainAddresses(data.chainId);

  // Simulate the bundler's behavior on unwraps only with MaxUint256.
  if (sender === generalAdapter1 && amount === MathLib.MAX_UINT_256)
    amount = data.getHolding(sender, address).balance;

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
        to: ZERO_ADDRESS,
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
        from: ZERO_ADDRESS,
        to: receiver,
      },
    },
    data,
  );
};
