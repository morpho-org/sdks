import type { ParaswapOperations } from "../../operations.js";
import type { OperationHandler } from "../types.js";

import { MathLib } from "@morpho-org/blue-sdk";
import { ZERO_ADDRESS } from "@morpho-org/morpho-ts";
import { hexToBigInt, size, slice } from "viem";
import { ParaswapErrors } from "../../errors.js";
import { handleErc20Operation } from "../erc20/index.js";

export const handleParaswapBuyOperation: OperationHandler<
  ParaswapOperations["Paraswap_Buy"]
> = (
  { address, args: { srcToken, receiver, slippage = 0n, ...args }, sender },
  data,
) => {
  let amount: bigint;
  let quotedAmount: bigint;

  if ("swap" in args) {
    const exactAmountOffset = Number(args.swap.offsets.exactAmount);
    const quotedAmountOffset = Number(args.swap.offsets.quotedAmount);

    const dataSize = size(args.swap.data);
    if (exactAmountOffset > dataSize - 32)
      throw new ParaswapErrors.InvalidOffset(exactAmountOffset, args.swap.data);
    if (quotedAmountOffset > dataSize - 32)
      throw new ParaswapErrors.InvalidOffset(exactAmountOffset, args.swap.data);

    amount = hexToBigInt(
      slice(args.swap.data, exactAmountOffset, exactAmountOffset + 32),
    );
    quotedAmount = hexToBigInt(
      slice(args.swap.data, quotedAmountOffset, quotedAmountOffset + 32),
    );
  } else ({ amount, quotedAmount } = args);

  // Burn sold tokens.
  handleErc20Operation(
    {
      type: "Erc20_Transfer",
      sender: srcToken,
      address: srcToken,
      args: {
        amount: MathLib.wMulDown(quotedAmount, MathLib.WAD - slippage),
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
      sender: address,
      address,
      args: {
        amount,
        from: ZERO_ADDRESS,
        to: receiver,
      },
    },
    data,
  );
};
