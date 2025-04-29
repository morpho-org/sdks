import { hexToBigInt, slice } from "viem";
import type { ParaswapOperations } from "../../operations.js";
import { handleErc20Operation } from "../erc20/index.js";
import type { OperationHandler } from "../types.js";

import { MathLib } from "@morpho-org/blue-sdk";
import { ZERO_ADDRESS } from "@morpho-org/morpho-ts";

export const handleParaswapSellOperation: OperationHandler<
  ParaswapOperations["Paraswap_Sell"]
> = (
  {
    address,
    args: {
      dstToken,
      receiver,
      sellEntireBalance = false,
      slippage = 0n,
      ...args
    },
    sender,
  },
  data,
) => {
  let amount =
    "amount" in args
      ? args.amount
      : hexToBigInt(
          slice(args.swap.data, Number(args.swap.offsets.exactAmount)),
          { size: 32 },
        );
  let quotedAmount =
    "quotedAmount" in args
      ? args.quotedAmount
      : hexToBigInt(
          slice(args.swap.data, Number(args.swap.offsets.quotedAmount)),
          { size: 32 },
        );

  if (sellEntireBalance) {
    const oldAmount = amount;

    amount = data.getHolding(sender, address).balance;
    quotedAmount = MathLib.mulDivUp(quotedAmount, amount, oldAmount);
  }

  // Burn sold tokens.
  handleErc20Operation(
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

  // Mint bought tokens.
  handleErc20Operation(
    {
      type: "Erc20_Transfer",
      sender: dstToken,
      address: dstToken,
      args: {
        amount: MathLib.wMulDown(quotedAmount, MathLib.WAD - slippage),
        from: ZERO_ADDRESS,
        to: receiver,
      },
    },
    data,
  );
};
