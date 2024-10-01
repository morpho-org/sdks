import { Address } from "@morpho-org/blue-sdk";
import { AbstractSigner, Provider, ethers } from "ethers";
import { LiquidationEncoder } from "../LiquidationEncoder";
import CurveStableSwapNGABI from "../abi/CurveStableSwapNG.json";

export async function getCurveWithdrawalAmount(
  provider: AbstractSigner<Provider>,
  amount: bigint,
  tokenIndex: number,
  curvePool: Address,
): Promise<bigint> {
  const contract = new ethers.Contract(
    curvePool,
    CurveStableSwapNGABI,
    provider,
  );

  /**
   * @notice Calculate the amount received when withdrawing a single coin
   * @param _burn_amount Amount of LP tokens to burn in the withdrawal
   * @param i Index value of the coin to withdraw
   * @return Amount of coin received
   */
  // @ts-ignore
  const result = await contract.calc_withdraw_one_coin(amount, tokenIndex);
  return result;
}

export async function getCurveSwapOutputAmountFromInput(
  provider: AbstractSigner<Provider>,
  amount: bigint,
  inputTokenIndex: number,
  outputTokenIndex: number,
  curvePool: Address,
): Promise<bigint> {
  const contract = new ethers.Contract(
    curvePool,
    CurveStableSwapNGABI,
    provider,
  );

  /**
   * @notice Calculate the current output dy given input dx
   * @dev Index values can be found via the `coins` public getter method
   * @param i Index value for the coin to send
   * @param j Index value of the coin to receive
   * @param dx Amount of `i` being exchanged
   * @return Amount of `j` predicted
   */
  // @ts-ignore
  const result = await contract.get_dy(
    inputTokenIndex,
    outputTokenIndex,
    amount,
  );
  return result;
}

export async function getCurveSwapInputAmountFromOutput(
  provider: AbstractSigner<Provider>,
  destAmount: bigint,
  inputTokenIndex: number,
  outputTokenIndex: number,
  curvePool: Address,
): Promise<bigint> {
  const contract = new ethers.Contract(
    curvePool,
    CurveStableSwapNGABI,
    provider,
  );

  /**
   * @notice Calculate the current input dx given output dy
   * @dev Index values can be found via the `coins` public getter method
   * @param i Index value for the coin to send
   * @param j Index value of the coin to receive
   * @param dy Amount of `j` being received after exchange
   * @return Amount of `i` predicted
   */
  // @ts-ignore
  const result = await contract.get_dx(
    inputTokenIndex,
    outputTokenIndex,
    destAmount,
  );
  return result;
}

export async function encodeRemoveLiquidityFromCurvePool(
  amount: bigint,
  curvePool: Address,
  withdrawnTokenIndex: number,
  minReceived: bigint,
  receiver: string,
  encoder: LiquidationEncoder,
) {
  const iface = new ethers.Interface(CurveStableSwapNGABI);

  /**
   * @notice Withdraw a single coin from the pool
   * @param _burn_amount Amount of LP tokens to burn in the withdrawal
   * @param i Index value of the coin to withdraw
   * @param _min_received Minimum amount of coin to receive
   * @param _receiver Address that receives the withdrawn coins
   * @return Amount of coin received
   */
  // @ts-ignore
  encoder.pushCall(
    curvePool,
    0n,
    iface.encodeFunctionData(
      "remove_liquidity_one_coin(uint256,int128,uint256,address)",
      [amount, withdrawnTokenIndex, minReceived, receiver],
    ),
  );
}

export async function encodeCurveSwap(
  amount: bigint,
  curvePool: Address,
  inputTokenIndex: number,
  outputTokenIndex: number,
  minDestAmount: bigint,
  receiver: string,
  encoder: LiquidationEncoder,
) {
  const iface = new ethers.Interface(CurveStableSwapNGABI);

  /**
   * @notice Perform an exchange between two coins
   * @dev Index values can be found via the `coins` public getter method
   * @param i Index value for the coin to send
   * @param j Index value of the coin to receive
   * @param _dx Amount of `i` being exchanged
   * @param _min_dy Minimum amount of `j` to receive
   * @param _receiver Address that receives `j`
   * @return Actual amount of `j` received
   */
  // @ts-ignore
  encoder.pushCall(
    curvePool,
    0n,
    iface.encodeFunctionData(
      "exchange(int128,int128,uint256,uint256,address)",
      [inputTokenIndex, outputTokenIndex, amount, minDestAmount, receiver],
    ),
  );
}
