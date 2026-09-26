import {
  blueAbi,
  blueAdaptiveCurveIrmAbi,
  blueOracleAbi,
  erc2612Abi,
  metaMorphoAbi,
  permit2Abi,
  vaultV2Abi,
} from "@morpho-org/morpho-sdk/abis";
import {
  type Address,
  decodeAbiParameters,
  decodeFunctionResult,
  encodeFunctionData,
  erc20Abi,
  getAddress,
  type Hex,
  numberToHex,
  zeroAddress,
} from "viem";
import type { DecodedProbeRead, ProbeRead } from "../../domain/stages.js";
import { InvalidSimulationResponseError } from "../../errors.js";
import type { SimulationTransaction } from "../../types.js";
import {
  encodeNativeBalanceProbe,
  NATIVE_BALANCE_PROBE_ADDRESS,
} from "./native-balance-probe.js";

const call = (
  to: Address,
  data: Hex,
): Required<Readonly<SimulationTransaction>> => ({
  from: zeroAddress,
  to: getAddress(to),
  data,
  value: 0n,
});

/**
 * Encode a {@link ProbeRead} into the probe call the boundary inserts between
 * user transactions. Native balances go to the injected-bytecode probe
 * contract; every other read is a plain view `eth_call`-shaped call from
 * `zeroAddress` to the real contract.
 * @param read - The read to encode.
 * @returns A fully populated transaction for the simulation call array.
 * @internal
 */
export function encodeProbeCall(
  read: ProbeRead,
): Required<Readonly<SimulationTransaction>> {
  switch (read.type) {
    case "nativeBalance":
      return call(
        NATIVE_BALANCE_PROBE_ADDRESS,
        encodeNativeBalanceProbe(read.account),
      );
    case "erc20Balance":
      return call(
        read.token,
        encodeFunctionData({
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [read.account],
        }),
      );
    case "erc20Allowance":
      return call(
        read.token,
        encodeFunctionData({
          abi: erc20Abi,
          functionName: "allowance",
          args: [read.owner, read.spender],
        }),
      );
    case "erc2612Nonce":
      return call(
        read.token,
        encodeFunctionData({
          abi: erc2612Abi,
          functionName: "nonces",
          args: [read.owner],
        }),
      );
    case "permit2NonceBitmap":
      return call(
        read.permit2,
        encodeFunctionData({
          abi: permit2Abi,
          functionName: "nonceBitmap",
          args: [read.owner, read.wordPosition],
        }),
      );
    case "blueIsAuthorized":
      return call(
        read.morpho,
        encodeFunctionData({
          abi: blueAbi,
          functionName: "isAuthorized",
          args: [read.authorizer, read.authorized],
        }),
      );
    case "blueNonce":
      return call(
        read.morpho,
        encodeFunctionData({
          abi: blueAbi,
          functionName: "nonce",
          args: [read.owner],
        }),
      );
    case "bluePosition":
      return call(
        read.morpho,
        encodeFunctionData({
          abi: blueAbi,
          functionName: "position",
          args: [read.marketId, read.owner],
        }),
      );
    case "blueMarket":
      return call(
        read.morpho,
        encodeFunctionData({
          abi: blueAbi,
          functionName: "market",
          args: [read.marketId],
        }),
      );
    case "oraclePrice":
      return call(
        read.oracle,
        encodeFunctionData({ abi: blueOracleAbi, functionName: "price" }),
      );
    case "irmBorrowRateView":
      return call(
        read.irm,
        encodeFunctionData({
          abi: blueAdaptiveCurveIrmAbi,
          functionName: "borrowRateView",
          args: [read.market, read.marketState],
        }),
      );
    case "irmRateAtTarget":
      return call(
        read.irm,
        encodeFunctionData({
          abi: blueAdaptiveCurveIrmAbi,
          functionName: "rateAtTarget",
          args: [read.marketId],
        }),
      );
    case "vaultTotalAssets":
      return call(
        read.vault,
        encodeFunctionData({
          abi: metaMorphoAbi,
          functionName: "totalAssets",
        }),
      );
    case "vaultTotalSupply":
      return call(
        read.vault,
        encodeFunctionData({
          abi: metaMorphoAbi,
          functionName: "totalSupply",
        }),
      );
    case "vaultBalanceOf":
      return call(
        read.vault,
        encodeFunctionData({
          abi: metaMorphoAbi,
          functionName: "balanceOf",
          args: [read.account],
        }),
      );
    case "vaultIdleAssets":
      // VaultV2 idle liquidity is the underlying balance of the liquidity adapter.
      return call(
        read.asset,
        encodeFunctionData({
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [read.liquidityAdapter],
        }),
      );
    case "adapterAllocation":
      return call(
        read.vault,
        encodeFunctionData({
          abi: vaultV2Abi,
          functionName: "allocation",
          args: [read.allocationId],
        }),
      );
  }
}

const failDecode = (read: ProbeRead, cause?: unknown): never => {
  throw new InvalidSimulationResponseError(
    `Probe "${probeId(read)}" returned undecodable data`,
    { stage: "evidence", location: { type: "probe", probeId: probeId(read) } },
    { cause },
  );
};

/**
 * Decode a probe call's return data into the typed value for its read.
 * @param read - The read the call was encoded from.
 * @param data - The simulated call's `returnData`.
 * @returns The read paired with its decoded `value`.
 * @throws {InvalidSimulationResponseError} when `data` cannot be decoded.
 * @internal
 */
export function decodeProbeResult(
  read: ProbeRead,
  data: Hex,
): DecodedProbeRead {
  try {
    switch (read.type) {
      case "nativeBalance":
        return {
          ...read,
          value: decodeAbiParameters([{ type: "uint256" }], data)[0],
        };
      case "erc20Balance":
        return {
          ...read,
          value: decodeFunctionResult({
            abi: erc20Abi,
            functionName: "balanceOf",
            data,
          }),
        };
      case "erc20Allowance":
        return {
          ...read,
          value: decodeFunctionResult({
            abi: erc20Abi,
            functionName: "allowance",
            data,
          }),
        };
      case "erc2612Nonce":
        return {
          ...read,
          value: decodeFunctionResult({
            abi: erc2612Abi,
            functionName: "nonces",
            data,
          }),
        };
      case "permit2NonceBitmap":
        return {
          ...read,
          value: decodeFunctionResult({
            abi: permit2Abi,
            functionName: "nonceBitmap",
            data,
          }),
        };
      case "blueIsAuthorized":
        return {
          ...read,
          value: decodeFunctionResult({
            abi: blueAbi,
            functionName: "isAuthorized",
            data,
          }),
        };
      case "blueNonce":
        return {
          ...read,
          value: decodeFunctionResult({
            abi: blueAbi,
            functionName: "nonce",
            data,
          }),
        };
      case "bluePosition": {
        const [supplyShares, borrowShares, collateral] = decodeFunctionResult({
          abi: blueAbi,
          functionName: "position",
          data,
        });
        return {
          ...read,
          value: { supplyShares, borrowShares, collateral },
        };
      }
      case "blueMarket": {
        const [
          totalSupplyAssets,
          totalSupplyShares,
          totalBorrowAssets,
          totalBorrowShares,
          lastUpdate,
          fee,
        ] = decodeFunctionResult({
          abi: blueAbi,
          functionName: "market",
          data,
        });
        return {
          ...read,
          value: {
            totalSupplyAssets,
            totalSupplyShares,
            totalBorrowAssets,
            totalBorrowShares,
            lastUpdate,
            fee,
          },
        };
      }
      case "oraclePrice":
        return {
          ...read,
          value: decodeFunctionResult({
            abi: blueOracleAbi,
            functionName: "price",
            data,
          }),
        };
      case "irmBorrowRateView":
        return {
          ...read,
          value: decodeFunctionResult({
            abi: blueAdaptiveCurveIrmAbi,
            functionName: "borrowRateView",
            data,
          }),
        };
      case "irmRateAtTarget":
        return {
          ...read,
          value: decodeFunctionResult({
            abi: blueAdaptiveCurveIrmAbi,
            functionName: "rateAtTarget",
            data,
          }),
        };
      case "vaultTotalAssets":
        return {
          ...read,
          value: decodeFunctionResult({
            abi: metaMorphoAbi,
            functionName: "totalAssets",
            data,
          }),
        };
      case "vaultTotalSupply":
        return {
          ...read,
          value: decodeFunctionResult({
            abi: metaMorphoAbi,
            functionName: "totalSupply",
            data,
          }),
        };
      case "vaultBalanceOf":
        return {
          ...read,
          value: decodeFunctionResult({
            abi: metaMorphoAbi,
            functionName: "balanceOf",
            data,
          }),
        };
      case "vaultIdleAssets":
        return {
          ...read,
          value: decodeFunctionResult({
            abi: erc20Abi,
            functionName: "balanceOf",
            data,
          }),
        };
      case "adapterAllocation":
        return {
          ...read,
          value: decodeFunctionResult({
            abi: vaultV2Abi,
            functionName: "allocation",
            data,
          }),
        };
    }
  } catch (error) {
    if (error instanceof InvalidSimulationResponseError) throw error;
    return failDecode(read, error);
  }
}

/**
 * Stable identity for a probe read: `${read.type}:${key fields}` — deduped
 * reads share one probe identity across phases.
 * @internal
 */
export function probeId(read: ProbeRead): string {
  const fields = (parts: readonly (string | bigint | undefined)[]): string =>
    parts
      .filter((part) => part !== undefined)
      .map((part) => (typeof part === "bigint" ? numberToHex(part) : part))
      .join(":");

  switch (read.type) {
    case "nativeBalance":
      return fields([read.type, read.account]);
    case "erc20Balance":
      return fields([read.type, read.token, read.account]);
    case "erc20Allowance":
      return fields([read.type, read.token, read.owner, read.spender]);
    case "erc2612Nonce":
      return fields([read.type, read.token, read.owner]);
    case "permit2NonceBitmap":
      return fields([read.type, read.permit2, read.owner, read.wordPosition]);
    case "blueIsAuthorized":
      return fields([read.type, read.morpho, read.authorizer, read.authorized]);
    case "blueNonce":
      return fields([read.type, read.morpho, read.owner]);
    case "bluePosition":
      return fields([read.type, read.morpho, read.marketId, read.owner]);
    case "blueMarket":
      return fields([read.type, read.morpho, read.marketId]);
    case "oraclePrice":
      return fields([read.type, read.oracle]);
    case "irmBorrowRateView":
      return fields([
        read.type,
        read.irm,
        read.market.loanToken,
        read.market.collateralToken,
      ]);
    case "irmRateAtTarget":
      return fields([read.type, read.irm, read.marketId]);
    case "vaultTotalAssets":
      return fields([read.type, read.vault]);
    case "vaultTotalSupply":
      return fields([read.type, read.vault]);
    case "vaultBalanceOf":
      return fields([read.type, read.vault, read.account]);
    case "vaultIdleAssets":
      return fields([read.type, read.vault]);
    case "adapterAllocation":
      return fields([read.type, read.vault, read.allocationId]);
  }
}
