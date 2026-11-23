import type { AccrualPosition, Market, MarketId } from "@morpho-org/blue-sdk";
import { blueAbi, getAuthorizationTypedData } from "@morpho-org/blue-sdk-viem";
import { getChainAddress, isHexEqual, Time } from "@morpho-org/morpho-ts";
import type { Address, Client } from "viem";
import { isAddressEqual } from "viem";
import { readContract } from "viem/actions";
import { validateClientChainId } from "../../actions/requirements/validateClientChainId.js";
import { assertRegistryTargetsHaveCode } from "../../entities/requirements/assertContractCode.js";
import { validateMarketParamsId } from "../../helpers/validate.js";
import {
  AccrualPositionUserMismatchError,
  MarketIdMismatchError,
} from "../../types/index.js";
import { BlueSnapshotChainMismatchError } from "../error.js";
import { type IntentParams, resolveIntent } from "../intent.js";
import { validateTokenPermitRequest } from "../permit.js";
import { getTokenRequirements } from "../requirements.js";
import type { SignatureRequest, Step } from "../types.js";
import { validateMorphoAuthorizationRequest } from "./authorization.js";

/**
 * Caller-fetched Blue market with the chain it was read from.
 * @example
 * ```ts
 * import type { BlueMarketSnapshot } from "@morpho-org/morpho-sdk";
 * import type { Market } from "@morpho-org/blue-sdk";
 * const snapshot = (market: Market): BlueMarketSnapshot => ({ chainId: 1, market });
 * ```
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export interface BlueMarketSnapshot {
  readonly chainId: number;
  readonly market: Readonly<Market>;
}

/**
 * Caller-fetched Blue accrual position with the chain it was read from.
 * @example
 * ```ts
 * import type { BluePositionSnapshot } from "@morpho-org/morpho-sdk";
 * import type { AccrualPosition } from "@morpho-org/blue-sdk";
 * const snapshot = (position: AccrualPosition): BluePositionSnapshot => ({ chainId: 1, position });
 * ```
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export interface BluePositionSnapshot {
  readonly chainId: number;
  readonly position: Readonly<AccrualPosition>;
}

interface BluePrepareParams extends IntentParams {
  readonly marketId: MarketId;
  readonly marketData: BlueMarketSnapshot;
  readonly positionData?: BluePositionSnapshot;
  readonly now?: bigint;
}

/**
 * Checks that a caller-fetched Blue market snapshot belongs to the expected chain
 * and market, and that the market ID matches its parameters. Does not read RPC state.
 * @param marketData - Caller-fetched market snapshot.
 * @param expected - Expected chain ID and market ID.
 * @param expected.chainId - Chain on which the market snapshot was read.
 * @param expected.marketId - Market ID to match, regardless of hex casing.
 * @returns Nothing when the snapshot matches the expected chain and market.
 * @throws {BlueSnapshotChainMismatchError} If the snapshot belongs to a different chain.
 * @throws {MarketIdMismatchError} If the snapshot identifies a different market.
 * @example
 * ```ts
 * import { validateBlueMarketSnapshot } from "@morpho-org/morpho-sdk";
 * import { addressesRegistry } from "@morpho-org/morpho-sdk/blue/addresses";
 * import { Market, MarketParams } from "@morpho-org/morpho-sdk/blue/entities";
 * import { mainnet } from "viem/chains";
 *
 * const chainId = mainnet.id;
 * const params = MarketParams.idle(addressesRegistry[chainId].usdc);
 * const market = new Market({
 *   params,
 *   totalSupplyAssets: 0n,
 *   totalSupplyShares: 0n,
 *   totalBorrowAssets: 0n,
 *   totalBorrowShares: 0n,
 *   lastUpdate: 0n,
 *   fee: 0n,
 * });
 * const result = validateBlueMarketSnapshot(
 *   { chainId, market },
 *   { chainId, marketId: params.id },
 * );
 * // result: undefined (the snapshot matched)
 * ```
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export function validateBlueMarketSnapshot(
  marketData: BlueMarketSnapshot,
  {
    chainId,
    marketId,
  }: { readonly chainId: number; readonly marketId: MarketId },
): void {
  if (marketData.chainId !== chainId) {
    throw new BlueSnapshotChainMismatchError(marketData.chainId, chainId);
  }
  if (!isHexEqual(marketData.market.id, marketId)) {
    throw new MarketIdMismatchError(marketData.market.id, marketId);
  }
  // Validate that the reported snapshot ID is derived from the market tuple.
  validateMarketParamsId(marketData.market.params);
}

function validateSnapshots(params: BluePrepareParams): void {
  const { chainId, account, marketId, marketData, positionData } = params;
  validateBlueMarketSnapshot(marketData, { chainId, marketId });
  if (positionData === undefined) {
    return;
  }
  if (positionData.chainId !== chainId) {
    throw new BlueSnapshotChainMismatchError(positionData.chainId, chainId);
  }
  const { position } = positionData;
  if (!isHexEqual(position.marketId, marketId)) {
    throw new MarketIdMismatchError(position.marketId, marketId);
  }
  if (!isHexEqual(position.market.id, marketId)) {
    throw new MarketIdMismatchError(position.market.id, marketId);
  }
  // Validate the embedded position market before deriving any operation inputs from it.
  validateMarketParamsId(position.market.params);
  if (!isAddressEqual(position.user, account)) {
    throw new AccrualPositionUserMismatchError(position.user, account);
  }
}

/**
 * @internal Validates supplied snapshots and the registered Blue targets, then resolves only
 * the prerequisites requested by the operation. The callback derives funding from the
 * validated inputs before any RPC read.
 * An operation that receives a morphoAuthorizationRequestId must reference it
 * in its action and encode the signed authorization in the BlueBundlesV1 call.
 */
export async function prepareBlue(
  {
    client,
    params,
  }: { readonly client: Client; readonly params: BluePrepareParams },
  resolve: (intent: ReturnType<typeof resolveIntent>) => {
    readonly id: string;
    readonly tokenPull?: { readonly token: Address; readonly amount: bigint };
    readonly needsAuthorization?: boolean;
  },
) {
  // Reject mismatched snapshots before deriving operation inputs or reading chain state.
  validateSnapshots(params);
  const now = params.now ?? Time.timestamp();
  const intent = resolveIntent(params, now);
  const { id, tokenPull, needsAuthorization } = resolve(intent);
  const { chainId, account } = params;
  const { deadline, supportSignature, deployless } = intent;
  const spender = getChainAddress(chainId, "bundles.blueBundlesV1");
  const morpho = getChainAddress(chainId, "blue");
  // Reject missing targets before allowance or authorization reads can fail decoding empty data.
  await assertRegistryTargetsHaveCode(client, chainId, [
    { role: "bundles.blueBundlesV1", address: spender },
    { role: "blue", address: morpho },
  ]);
  const steps: Step[] = [];
  const signatureRequests: SignatureRequest[] = [];
  let morphoAuthorizationRequestId: string | undefined;
  if (tokenPull !== undefined) {
    await validateClientChainId(client, chainId);
    const { approvals, permit } = await getTokenRequirements(client, {
      ...tokenPull,
      spender,
      owner: account,
      chainId,
      deadline,
      now,
      supportSignature,
      deployless,
      permitId: `${id}:tokenPermit`,
      approvalId: (index) => `${id}:approval:${index + 1}`,
    });
    steps.push(...approvals);
    if (permit !== undefined) {
      // Pin permits to the same BlueBundlesV1 pull that selected the prerequisite.
      validateTokenPermitRequest(permit, {
        chainId,
        account,
        deadline,
        bundler: "bundles.blueBundlesV1",
        asset: tokenPull.token,
        amount: tokenPull.amount,
        exact: true,
      });
      signatureRequests.push(permit);
    }
  }
  if (needsAuthorization) {
    if (tokenPull === undefined) {
      await validateClientChainId(client, chainId);
    }
    const isAuthorized = await readContract(client, {
      abi: blueAbi,
      address: morpho,
      functionName: "isAuthorized",
      args: [account, spender],
    });
    if (!isAuthorized) {
      const authorizationId = `${id}:morphoAuthorization`;
      if (supportSignature) {
        const nonce = await readContract(client, {
          abi: blueAbi,
          address: morpho,
          functionName: "nonce",
          args: [account],
        });
        const request = {
          id: authorizationId,
          kind: "morphoAuthorization",
          args: { authorized: spender, owner: account, nonce, deadline },
          typedData: getAuthorizationTypedData(
            {
              authorizer: account,
              authorized: spender,
              isAuthorized: true,
              nonce,
              deadline,
            },
            chainId,
          ),
        } as const;
        // Check the request against the operation's authorization inputs before returning it.
        validateMorphoAuthorizationRequest(request, {
          chainId,
          account,
          nonce,
          deadline,
        });
        signatureRequests.push(request);
        morphoAuthorizationRequestId = authorizationId;
      } else {
        steps.push({
          id: authorizationId,
          label: "Authorize BlueBundlesV1 on Morpho",
          action: { type: "morphoAuthorization", inputs: { chainId, account } },
        });
      }
    }
  }
  return { intent, steps, signatureRequests, morphoAuthorizationRequestId };
}
