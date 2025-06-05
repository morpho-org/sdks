import { MathLib } from "@morpho-org/blue-sdk";
import { hexToBigInt, size, slice } from "viem";
import { ParaswapErrors } from "../../errors.js";
import type { BlueOperations } from "../../operations.js";
import { handleParaswapOperation } from "../paraswap/index.js";
import type { OperationHandler } from "../types.js";

export const handleBlueParaswapBuyDebtOperation: OperationHandler<
  BlueOperations["Blue_Paraswap_BuyDebt"]
> = (
  { args: { id, srcToken, onBehalf, receiver, slippage, ...args }, sender },
  data,
) => {
  const market = data.getMarket(id);

  const debtAmount = data
    .getAccrualPosition(onBehalf, id)
    .accrueInterest(data.block.timestamp).borrowAssets;

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
  } else {
    amount = debtAmount;
    quotedAmount = MathLib.mulDivDown(debtAmount, args.priceE27, MathLib.RAY);
  }

  handleParaswapOperation(
    {
      address: market.params.loanToken,
      sender,
      type: "Paraswap_Buy",
      args: {
        srcToken,
        amount: debtAmount,
        quotedAmount: MathLib.mulDivDown(quotedAmount, debtAmount, amount),
        receiver,
        slippage,
      },
    },
    data,
  );
};
