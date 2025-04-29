import { MathLib } from "@morpho-org/blue-sdk";
import { hexToBigInt, slice } from "viem";
import type { BlueOperations } from "../../operations.js";
import { handleParaswapOperation } from "../paraswap/index.js";
import type { OperationHandler } from "../types.js";

export const handleBlueParaswapBuyDebtOperation: OperationHandler<
  BlueOperations["Blue_Paraswap_BuyDebt"]
> = (
  {
    args: { marketId, srcToken, onBehalf, receiver, slippage, ...args },
    sender,
  },
  data,
) => {
  const market = data.getMarket(marketId);

  const debtAmount = data
    .getAccrualPosition(onBehalf, marketId)
    .accrueInterest(data.block.timestamp).borrowAssets;

  const amount =
    "priceE27" in args
      ? debtAmount
      : hexToBigInt(
          slice(args.swap.data, Number(args.swap.offsets.exactAmount)),
          { size: 32 },
        );
  const quotedAmount =
    "priceE27" in args
      ? (debtAmount * args.priceE27) / MathLib.RAY
      : hexToBigInt(
          slice(args.swap.data, Number(args.swap.offsets.quotedAmount)),
          { size: 32 },
        );

  handleParaswapOperation(
    {
      address: market.params.loanToken,
      sender,
      type: "Paraswap_Buy",
      args: {
        srcToken,
        amount,
        quotedAmount: MathLib.mulDivDown(quotedAmount, debtAmount, amount),
        receiver,
        slippage,
      },
    },
    data,
  );
};
