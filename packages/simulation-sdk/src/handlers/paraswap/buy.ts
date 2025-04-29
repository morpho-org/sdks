import type { ParaswapOperations } from "../../operations.js";
import type { OperationHandler } from "../types.js";

import { MathLib } from "@morpho-org/blue-sdk";
import { ZERO_ADDRESS } from "@morpho-org/morpho-ts";
import { hexToBigInt, slice } from "viem";
import { handleErc20Operation } from "../erc20/index.js";

export const handleParaswapBuyOperation: OperationHandler<
  ParaswapOperations["Paraswap_Buy"]
> = (
  { address, args: { srcToken, receiver, slippage = 0n, ...args }, sender },
  data,
) => {
  const amount =
    "amount" in args
      ? args.amount
      : hexToBigInt(
          slice(args.swap.data, Number(args.swap.offsets.exactAmount)),
          { size: 32 },
        );
  const quotedAmount =
    "quotedAmount" in args
      ? args.quotedAmount
      : hexToBigInt(
          slice(args.swap.data, Number(args.swap.offsets.quotedAmount)),
          { size: 32 },
        );

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
