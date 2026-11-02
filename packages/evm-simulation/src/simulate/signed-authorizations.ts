import {
  blueAbi,
  midnightEcrecoverAuthorizerAbi,
} from "@morpho-org/morpho-sdk/abis";
import {
  type Address,
  decodeEventLog,
  erc20Abi,
  type Hex,
  isAddressEqual,
} from "viem";
import type { SimulationAuthorization } from "../authorizations.js";
import {
  ApprovalCheckUnavailableError,
  UnusedAuthorizationError,
} from "../errors.js";
import type { RawLog } from "../types.js";

/**
 * Require a distinct use event for each final-mode permit or authorization signature.
 * Permit2 signature transfers revert on invalid submitted signatures; omitted transfers are not checked.
 * @param params.authorizations - Parsed caller requests.
 * @param params.logs - Logs from user transactions only, in execution order, or undefined if any transaction omitted logs.
 * @param params.morpho - Registered Morpho Blue address.
 * @param params.ecrecoverAuthorizer - Registered EcrecoverAuthorizer address.
 * @throws {UnusedAuthorizationError} When a signed request has no matching event.
 * @throws {ApprovalCheckUnavailableError} When required transaction logs are missing from the response.
 * @internal
 */
export function assertSignedAuthorizationsUsed(params: {
  readonly authorizations: readonly SimulationAuthorization[];
  readonly logs: readonly RawLog[] | undefined;
  readonly morpho: Address;
  readonly ecrecoverAuthorizer: Address;
}): void {
  const used = new Set<number>();
  for (const [
    authorizationIndex,
    authorization,
  ] of params.authorizations.entries()) {
    switch (authorization.type) {
      case "erc20Approval":
      case "blueAuthorization":
      case "permit2SignatureTransfer":
        continue;
      case "erc2612Permit":
      case "blueAuthorizationSignature":
      case "midnightAuthorizationSignature":
        break;
      default: {
        const exhaustive: never = authorization;
        throw new UnusedAuthorizationError(authorizationIndex, exhaustive);
      }
    }
    if (params.logs === undefined)
      throw new ApprovalCheckUnavailableError(
        "Simulation response omitted user-transaction logs; signature-use checks cannot run. Retry with an RPC that returns eth_simulateV1 logs.",
      );
    const { domain } = authorization.typedData;
    const logIndex = params.logs.findIndex((log, index) => {
      if (
        used.has(index) ||
        !isAddressEqual(log.address, domain.verifyingContract)
      )
        return false;
      const [topic, ...topics] = log.topics.map(
        (rawTopic) => rawTopic.toLowerCase() as Hex,
      );
      if (authorization.type === "midnightAuthorizationSignature") {
        if (
          !isAddressEqual(domain.verifyingContract, params.ecrecoverAuthorizer)
        )
          return false;
        if (topic === undefined) return false;
        try {
          const event = decodeEventLog({
            abi: midnightEcrecoverAuthorizerAbi,
            eventName: "SetIsAuthorized",
            topics: [topic, ...topics],
            data: log.data,
            strict: true,
          });
          const signed = authorization.typedData.message;
          return (
            isAddressEqual(event.args.authorizer, signed.authorizer) &&
            isAddressEqual(event.args.authorized, signed.authorized) &&
            event.args.isAuthorized === signed.isAuthorized &&
            event.args.nonce === signed.nonce
          );
        } catch {
          // A malformed or unrelated event is not proof that the request ran.
          return false;
        }
      }
      if (
        topic === undefined ||
        log.topics.length !== 3 ||
        log.data.length !== 66
      )
        return false;
      try {
        if (authorization.type === "erc2612Permit") {
          const event = decodeEventLog({
            abi: erc20Abi,
            eventName: "Approval",
            topics: [topic, ...topics],
            data: log.data,
            strict: true,
          });
          const permit = authorization.typedData.message;
          return (
            isAddressEqual(event.args.owner, permit.owner) &&
            isAddressEqual(event.args.spender, permit.spender) &&
            event.args.value === permit.value
          );
        }
        if (!isAddressEqual(log.address, params.morpho)) return false;
        const event = decodeEventLog({
          abi: blueAbi,
          eventName: "IncrementNonce",
          topics: [topic, ...topics],
          data: log.data,
          strict: true,
        });
        const signed = authorization.typedData.message;
        return (
          isAddressEqual(event.args.authorizer, signed.authorizer) &&
          event.args.usedNonce === signed.nonce
        );
      } catch {
        // A malformed or unrelated event is not proof that the request ran.
        return false;
      }
    });
    if (logIndex === -1)
      throw new UnusedAuthorizationError(authorizationIndex, authorization);
    used.add(logIndex);
  }
}
