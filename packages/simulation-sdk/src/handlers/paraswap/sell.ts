import { hexToBigInt, size, slice } from "viem";
import type { ParaswapOperations } from "../../operations.js";
import { handleErc20Operation } from "../erc20/index.js";
import type { OperationHandler } from "../types.js";

import { MathLib } from "@morpho-org/blue-sdk";
import { ZERO_ADDRESS } from "@morpho-org/morpho-ts";
import { ParaswapErrors } from "../../errors.js";

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
  let amount: bigint;
  let quotedAmount: bigint;

  if ("swap" in args) {
    const { offsets } = args.swap;
    const exactAmountOffset = Number(offsets.exactAmount);
    const quotedAmountOffset = Number(offsets.quotedAmount);

    const dataSize = size(args.swap.data);
    if (exactAmountOffset > dataSize - 32)
      throw new ParaswapErrors.InvalidOffset(exactAmountOffset, args.swap.data);
    if (quotedAmountOffset > dataSize - 32)
      throw new ParaswapErrors.InvalidOffset(
        quotedAmountOffset,
        args.swap.data,
      );

    amount = hexToBigInt(
      slice(args.swap.data, exactAmountOffset, exactAmountOffset + 32),
    );
    quotedAmount = hexToBigInt(
      slice(args.swap.data, quotedAmountOffset, quotedAmountOffset + 32),
    );
  } else ({ amount, quotedAmount } = args);

  if (sellEntireBalance) {
    if (amount === 0n) throw new ParaswapErrors.ZeroAmount();

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
