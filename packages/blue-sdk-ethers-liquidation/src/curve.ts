import { AbstractSigner, Provider, ethers } from "ethers";
import CurveStableSwapNGABI from "./abi/CurveStableSwapNG.json";
import { mainnetAddresses } from "./addresses";

export async function getUSD0USD0PlusPlusWitdhrawal(
  provider: AbstractSigner<Provider>,
  amount: bigint,
): Promise<bigint> {
  const contract = new ethers.Contract(
    mainnetAddresses["usd0usd0++"]!,
    CurveStableSwapNGABI,
    provider,
  );

  // Call the contract method
  // @ts-ignore
  const result = await contract.calc_withdraw_one_coin(amount, 0);
  return result;
}
