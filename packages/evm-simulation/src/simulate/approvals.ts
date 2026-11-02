import {
  blueAbi,
  midnightEventsAbi,
  permit2Abi,
} from "@morpho-org/morpho-sdk/abis";
import {
  type Abi,
  type Address,
  decodeEventLog,
  erc20Abi,
  erc721Abi,
  getAbiItem,
  isAddressEqual,
  toEventSelector,
  zeroAddress,
} from "viem";
import type { SimulationAuthorization } from "../authorizations.js";
import {
  ApprovalCheckUnavailableError,
  UnexpectedMidnightAuthorizationError,
  UnexpectedMorphoAuthorizationError,
  UnexpectedTokenApprovalError,
} from "../errors.js";
import type { ApprovalLimit } from "../limits.js";
import type { RawLog } from "../types.js";

const ERC20_APPROVAL_TOPIC = toEventSelector(
  getAbiItem({ abi: erc20Abi, name: "Approval" }),
);
const ERC721_APPROVAL_FOR_ALL_TOPIC = toEventSelector(
  getAbiItem({ abi: erc721Abi, name: "ApprovalForAll" }),
);
const PERMIT2_APPROVAL_TOPIC = toEventSelector(
  getAbiItem({ abi: permit2Abi, name: "Approval" }),
);
const PERMIT2_PERMIT_TOPIC = toEventSelector(
  getAbiItem({ abi: permit2Abi, name: "Permit" }),
);
const MORPHO_AUTHORIZATION_TOPIC = toEventSelector(
  getAbiItem({ abi: blueAbi, name: "SetAuthorization" }),
);
const MIDNIGHT_AUTHORIZATION_TOPIC = toEventSelector(
  getAbiItem({ abi: midnightEventsAbi, name: "SetIsAuthorized" }),
);

/** Addresses used to attribute Permit2, Morpho and Midnight events to the chain registry. @internal */
export interface ApprovalEventAddresses {
  readonly permit2?: Address;
  readonly morpho: Address;
  readonly midnight?: Address;
  readonly ecrecoverAuthorizer?: Address;
}

const tokenApprovalAllowed = (params: {
  readonly allowed: readonly ApprovalLimit[];
  readonly token: Address;
  readonly owner: Address;
  readonly spender: Address;
}): boolean =>
  params.allowed.some(
    (limit) =>
      limit.type === "token" &&
      isAddressEqual(limit.token, params.token) &&
      isAddressEqual(limit.owner, params.owner) &&
      isAddressEqual(limit.spender, params.spender),
  );

const morphoAuthorizationAllowed = (params: {
  readonly allowed: readonly ApprovalLimit[];
  readonly authorizer: Address;
  readonly authorized: Address;
}): boolean =>
  params.allowed.some(
    (limit) =>
      limit.type === "morphoAuthorization" &&
      isAddressEqual(limit.authorizer, params.authorizer) &&
      isAddressEqual(limit.authorized, params.authorized),
  );

const decode = <TAbi extends Abi>(params: {
  readonly abi: TAbi;
  readonly log: RawLog;
  readonly eventDescription: string;
}) => {
  const { abi, log, eventDescription } = params;
  const [firstTopic, ...remainingTopics] = log.topics;
  if (firstTopic === undefined)
    throw new ApprovalCheckUnavailableError(
      `Event from "${log.address}" has no topics and cannot be decoded as ${eventDescription}. Remove the call that emits it.`,
    );
  try {
    return decodeEventLog({
      abi,
      data: log.data,
      topics: [firstTopic, ...remainingTopics],
      strict: true,
    });
  } catch (cause) {
    throw new ApprovalCheckUnavailableError(
      `Event from "${log.address}" could not be decoded as ${eventDescription}. Remove the call that emits it.`,
      { cause },
    );
  }
};

/**
 * Reject pending signatures or approval requests that are not in the allowed set.
 * @param params.authorizations - Parsed wallet requests from preview mode.
 * @param params.allowed - Operation-derived and caller-supplied limits.
 * @param params.addresses - Registered Morpho and optional Permit2 verifying contracts.
 * @internal
 */
export function assertPendingApprovals(params: {
  readonly authorizations: readonly SimulationAuthorization[];
  readonly allowed: readonly ApprovalLimit[];
  readonly addresses: ApprovalEventAddresses;
}): void {
  const { authorizations, allowed, addresses } = params;
  for (const authorization of authorizations) {
    switch (authorization.type) {
      case "erc20Approval":
        if (
          authorization.amount > 0n &&
          !tokenApprovalAllowed({
            allowed,
            token: authorization.token,
            owner: authorization.owner,
            spender: authorization.spender,
          })
        )
          throw new UnexpectedTokenApprovalError({
            token: authorization.token,
            owner: authorization.owner,
            spender: authorization.spender,
            source: "authorization",
          });
        break;
      case "erc2612Permit": {
        const { domain, message } = authorization.typedData;
        if (
          message.value > 0n &&
          !tokenApprovalAllowed({
            allowed,
            token: domain.verifyingContract,
            owner: message.owner,
            spender: message.spender,
          })
        )
          throw new UnexpectedTokenApprovalError({
            token: domain.verifyingContract,
            owner: message.owner,
            spender: message.spender,
            source: "authorization",
          });
        break;
      }
      case "permit2SignatureTransfer": {
        const { owner, typedData } = authorization;
        const { permitted, spender } = typedData.message;
        if (
          addresses.permit2 === undefined ||
          !isAddressEqual(typedData.domain.verifyingContract, addresses.permit2)
        )
          throw new UnexpectedTokenApprovalError({
            token: permitted.token,
            owner,
            spender,
            source: "authorization",
            allowlistable: false,
          });
        if (
          permitted.amount > 0n &&
          !tokenApprovalAllowed({
            allowed,
            token: permitted.token,
            owner,
            spender,
          })
        )
          throw new UnexpectedTokenApprovalError({
            token: permitted.token,
            owner,
            spender,
            source: "authorization",
          });
        break;
      }
      case "blueAuthorization":
        if (
          authorization.isAuthorized &&
          !morphoAuthorizationAllowed({
            allowed,
            authorizer: authorization.authorizer,
            authorized: authorization.authorized,
          })
        )
          throw new UnexpectedMorphoAuthorizationError({
            authorizer: authorization.authorizer,
            authorized: authorization.authorized,
            source: "authorization",
          });
        break;
      case "blueAuthorizationSignature": {
        if (
          !isAddressEqual(
            authorization.typedData.domain.verifyingContract,
            addresses.morpho,
          )
        )
          throw new UnexpectedMorphoAuthorizationError({
            authorizer: authorization.typedData.message.authorizer,
            authorized: authorization.typedData.message.authorized,
            source: "authorization",
            allowlistable: false,
          });
        const { authorizer, authorized, isAuthorized } =
          authorization.typedData.message;
        if (
          isAuthorized &&
          !morphoAuthorizationAllowed({ allowed, authorizer, authorized })
        )
          throw new UnexpectedMorphoAuthorizationError({
            authorizer,
            authorized,
            source: "authorization",
          });
        break;
      }
      case "midnightAuthorizationSignature": {
        const { authorizer, authorized, isAuthorized } =
          authorization.typedData.message;
        if (
          addresses.ecrecoverAuthorizer === undefined ||
          !isAddressEqual(
            authorization.typedData.domain.verifyingContract,
            addresses.ecrecoverAuthorizer,
          )
        )
          throw new UnexpectedMidnightAuthorizationError({
            onBehalf: authorizer,
            authorized,
            allowlistable: false,
          });
        if (
          isAuthorized &&
          !allowed.some(
            (limit) =>
              limit.type === "midnightAuthorization" &&
              isAddressEqual(limit.onBehalf, authorizer) &&
              isAddressEqual(limit.authorized, authorized),
          )
        )
          throw new UnexpectedMidnightAuthorizationError({
            onBehalf: authorizer,
            authorized,
          });
        break;
      }
      default: {
        const _exhaustive: never = authorization;
        void _exhaustive;
        throw new ApprovalCheckUnavailableError(
          `Unsupported authorization type "${(authorization as { type: string }).type}"; approval checks cannot run.`,
        );
      }
    }
  }
}

/**
 * Reject sender-granted approvals and authorizations found in simulated logs.
 * @param logs - Logs from every preparation and transaction call.
 * @param owner - The simulation sender.
 * @param allowed - Operation-derived and caller-supplied limits.
 * @param addresses - Registered Permit2 and Morpho contracts for the chain.
 * @internal
 */
export function assertApprovalEvents(params: {
  readonly logs: readonly RawLog[];
  readonly owner: Address;
  readonly allowed: readonly ApprovalLimit[];
  readonly addresses: ApprovalEventAddresses;
}): void {
  const { logs, owner, allowed, addresses } = params;
  for (const log of logs) {
    const topic = log.topics[0]?.toLowerCase();
    if (topic === ERC20_APPROVAL_TOPIC) {
      if (log.topics.length === 3) {
        const decoded = decode({
          abi: erc20Abi,
          log,
          eventDescription: "ERC-20 Approval event",
        });
        if (decoded.eventName !== "Approval")
          throw new ApprovalCheckUnavailableError(
            `Approval event from "${log.address}" could not be identified as ERC-20 Approval. Remove the call that emits it.`,
          );
        const { owner: eventOwner, spender, value } = decoded.args;
        if (
          isAddressEqual(eventOwner, owner) &&
          value > 0n &&
          !tokenApprovalAllowed({
            allowed,
            token: log.address,
            owner: eventOwner,
            spender,
          })
        )
          throw new UnexpectedTokenApprovalError({
            token: log.address,
            owner: eventOwner,
            spender,
            source: "event",
          });
        continue;
      }
      if (log.topics.length === 4) {
        const decoded = decode({
          abi: erc721Abi,
          log,
          eventDescription: "ERC-721 Approval event",
        });
        if (decoded.eventName !== "Approval")
          throw new ApprovalCheckUnavailableError(
            `Approval event from "${log.address}" could not be identified as ERC-721 Approval. Remove the call that emits it.`,
          );
        const { owner: eventOwner, spender: approved } = decoded.args;
        if (
          isAddressEqual(eventOwner, owner) &&
          !isAddressEqual(approved, zeroAddress)
        )
          throw new UnexpectedTokenApprovalError({
            token: log.address,
            owner: eventOwner,
            spender: approved,
            source: "event",
            allowlistable: false,
          });
        continue;
      }
      throw new ApprovalCheckUnavailableError(
        `Approval event from "${log.address}" has ${log.topics.length} topics; approval checks cannot classify it. Remove the call that emits it.`,
      );
    }

    if (topic === ERC721_APPROVAL_FOR_ALL_TOPIC) {
      const decoded = decode({
        abi: erc721Abi,
        log,
        eventDescription: "ERC-721 ApprovalForAll event",
      });
      if (decoded.eventName !== "ApprovalForAll")
        throw new ApprovalCheckUnavailableError(
          `Approval event from "${log.address}" could not be identified as ERC-721 ApprovalForAll. Remove the call that emits it.`,
        );
      const { owner: eventOwner, operator, approved } = decoded.args;
      if (isAddressEqual(eventOwner, owner) && approved)
        throw new UnexpectedTokenApprovalError({
          token: log.address,
          owner: eventOwner,
          spender: operator,
          source: "event",
          allowlistable: false,
        });
      continue;
    }

    if (
      (addresses.permit2 === undefined ||
        isAddressEqual(log.address, addresses.permit2)) &&
      (topic === PERMIT2_APPROVAL_TOPIC || topic === PERMIT2_PERMIT_TOPIC)
    ) {
      const decoded = decode({
        abi: permit2Abi,
        log,
        eventDescription: "Permit2 approval event",
      });
      if (decoded.eventName !== "Approval" && decoded.eventName !== "Permit")
        throw new ApprovalCheckUnavailableError(
          `Approval event from "${log.address}" could not be identified as a Permit2 approval. Remove the call that emits it.`,
        );
      const { owner: eventOwner, token, spender, amount } = decoded.args;
      if (
        isAddressEqual(eventOwner, owner) &&
        amount > 0n &&
        !tokenApprovalAllowed({
          allowed,
          token,
          owner: eventOwner,
          spender,
        })
      )
        throw new UnexpectedTokenApprovalError({
          token,
          owner: eventOwner,
          spender,
          source: "event",
        });
      continue;
    }

    if (
      isAddressEqual(log.address, addresses.morpho) &&
      topic === MORPHO_AUTHORIZATION_TOPIC
    ) {
      const decoded = decode({
        abi: blueAbi,
        log,
        eventDescription: "Morpho SetAuthorization event",
      });
      if (decoded.eventName !== "SetAuthorization")
        throw new ApprovalCheckUnavailableError(
          `Morpho authorization event from "${log.address}" could not be identified as SetAuthorization. Remove the call that emits it.`,
        );
      const { authorizer, authorized, newIsAuthorized } = decoded.args;
      if (
        isAddressEqual(authorizer, owner) &&
        newIsAuthorized &&
        !morphoAuthorizationAllowed({ allowed, authorizer, authorized })
      )
        throw new UnexpectedMorphoAuthorizationError({
          authorizer,
          authorized,
          source: "event",
        });
      continue;
    }

    if (
      addresses.midnight !== undefined &&
      isAddressEqual(log.address, addresses.midnight) &&
      topic === MIDNIGHT_AUTHORIZATION_TOPIC.toLowerCase()
    ) {
      const decoded = decode({
        abi: midnightEventsAbi,
        log,
        eventDescription: "Midnight SetIsAuthorized event",
      });
      if (decoded.eventName !== "SetIsAuthorized")
        throw new ApprovalCheckUnavailableError(
          `Midnight authorization event from "${log.address}" could not be identified as SetIsAuthorized. Remove the call that emits it.`,
        );
      const { caller, onBehalf, authorized, newIsAuthorized } = decoded.args;
      if (
        newIsAuthorized &&
        (isAddressEqual(onBehalf, owner) || isAddressEqual(caller, owner)) &&
        !allowed.some(
          (limit) =>
            limit.type === "midnightAuthorization" &&
            isAddressEqual(limit.onBehalf, onBehalf) &&
            isAddressEqual(limit.authorized, authorized),
        )
      )
        throw new UnexpectedMidnightAuthorizationError({
          onBehalf,
          authorized,
        });
    }
  }
}
