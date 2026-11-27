import type { ChainAddresses } from "@morpho-org/morpho-ts";
import { getChainAddresses } from "@morpho-org/morpho-ts";
import { zeroAddress } from "viem";
import { authenticateCalls } from "./actionProof.js";
import { blueRules } from "./blue.js";
import { isCallAddress, sameAddress } from "./checks.js";
import {
  CalldataCallError,
  CalldataChainError,
  CalldataFeeError,
  CalldataRecipientError,
  CalldataTargetError,
} from "./errors.js";
import { midnightRules } from "./midnight.js";
import { midnightMakerRules } from "./midnightMakers.js";
import { midnightOfferRules } from "./midnightOffers.js";
import type {
  ActionProofInput,
  CalldataCall,
  CalldataIntent,
  DecodedCalldataCall,
} from "./types.js";
import { vaultRules } from "./vault.js";

type Rule = (
  intent: CalldataIntent,
  context: { calls: readonly CalldataCall[]; chain: ChainAddresses },
) => readonly DecodedCalldataCall[];
const rules: Readonly<Partial<Record<string, Rule>>> = {
  ...vaultRules,
  ...blueRules,
  ...midnightRules,
  ...midnightOfferRules,
  ...midnightMakerRules,
} as Readonly<Partial<Record<string, Rule>>>;

/**
 * Statically checks Actions API calldata against the original request before signing; does not simulate execution.
 *
 * To use proof verification, fetch JWKS from `/.well-known/morpho-actions-jwks.json`
 * on the trusted Actions origin and supply the exact exchange bytes and current
 * time. A proof authenticates origin, not transaction safety or current chain
 * state. Static checks still run; independently simulate before signing.
 *
 * @param intent - Original request plus action, target, chain and fee limit.
 * @param calls - Calls returned by the API, in transaction order.
 * @param options - Optionally authenticate the exact Actions API exchange before running the static checks.
 * @param options.proof.header - The `Morpho-Action-Proof` response header.
 * @param options.proof.jwks - Independently trusted Actions API JWKS.
 * @param options.proof.request.method - The HTTP method as sent.
 * @param options.proof.request.path - The exact request path as sent.
 * @param options.proof.request.contentType - The request's `Content-Type` header.
 * @param options.proof.request.body - The exact request body bytes as sent.
 * @param options.proof.response.status - The HTTP response status code.
 * @param options.proof.response.contentType - The response's `Content-Type` header.
 * @param options.proof.response.requestId - The response's `X-Request-Id` header.
 * @param options.proof.response.body - The exact response body bytes after HTTP decompression, before parsing.
 * @param options.proof.issuer - Optional trusted issuer; defaults to `https://api.morpho.org/v0/actions`.
 * @param options.proof.now - Caller-supplied current time in Unix seconds.
 * @returns Immutable decoded calls. Submit them from the intended account and chain.
 * @throws {CalldataChainError} If there is no registry for the intended chain.
 * @throws {CalldataTargetError} If a call targets an unexpected contract or market.
 * @throws {CalldataDecodeError} If a call cannot be decoded with the contract ABI.
 * @throws {CalldataCallError} If the action is unrecognized (field `action`) or a call entry is malformed, missing or unexpected.
 * @throws {CalldataAmountError} If a call amount exceeds or differs from the intended amount.
 * @throws {CalldataRecipientError} If the encoded owner or recipient is not authorized.
 * @throws {CalldataFeeError} If a fee exceeds the limit or goes to an unauthorized recipient.
 * @throws {CalldataProofError} If the supplied proof does not authenticate an approved response for these calls.
 * @throws {CalldataUnsupportedError} If a recognized Midnight action or request is unsupported by this version, for example when it uses an unsupported guard.
 * @example
 * Given the original intent, sent request, received response, and trusted JWKS:
 * ```ts
 * import {
 *   verifyCalldata,
 *   type ActionProofInput,
 *   type CalldataCall,
 *   type CalldataIntent,
 *   type DecodedCalldataCall,
 * } from "@morpho-org/calldata-verifier";
 *
 * async function verifyActionResponse({ intent, request, response, jwks }: {
 *   intent: CalldataIntent;
 *   request: ActionProofInput["request"];
 *   response: Response;
 *   jwks: unknown;
 * }) {
 *   const body = new Uint8Array(await response.arrayBuffer());
 *   const { data } = JSON.parse(new TextDecoder().decode(body)) as {
 *     data: { calls: CalldataCall[] };
 *   };
 *   const verified: readonly DecodedCalldataCall[] = verifyCalldata(intent, data.calls, {
 *     proof: {
 *       header: response.headers.get("Morpho-Action-Proof") ?? "",
 *       jwks,
 *       now: Math.floor(Date.now() / 1000),
 *       request,
 *       response: {
 *         status: response.status,
 *         contentType: response.headers.get("Content-Type") ?? "",
 *         requestId: response.headers.get("X-Request-Id") ?? "",
 *         body,
 *       },
 *     },
 *   });
 *   return verified;
 * }
 * ```
 */
// biome-ignore lint/complexity/useMaxParams: Keep the existing two-argument API and add optional proof verification.
export function verifyCalldata(
  intent: CalldataIntent,
  calls: readonly CalldataCall[],
  options?: { readonly proof?: ActionProofInput },
): readonly DecodedCalldataCall[] {
  return verifyCalls(
    intent,
    options?.proof === undefined
      ? calls
      : authenticateCalls(options.proof, { calls, chainId: intent.chain_id }),
  );
}

function verifyCalls(
  intent: CalldataIntent,
  calls: readonly CalldataCall[],
): readonly DecodedCalldataCall[] {
  if (!Array.isArray(calls)) {
    throw new CalldataCallError("calls");
  }
  for (const call of calls) {
    if (call == null || typeof call !== "object") {
      throw new CalldataCallError("calls");
    }
    if (typeof call.id !== "string") {
      throw new CalldataCallError("id");
    }
    if (typeof call.kind !== "string") {
      throw new CalldataCallError("kind", call.id);
    }
  }
  const first = calls[0]?.id;
  let chain: ChainAddresses;
  try {
    if (!Number.isSafeInteger(intent.chain_id) || intent.chain_id <= 0) {
      throw new CalldataChainError("chain_id", first);
    }
    chain = getChainAddresses(intent.chain_id);
  } catch (cause) {
    if (cause instanceof CalldataChainError) {
      throw cause;
    }
    throw new CalldataChainError("chain_id", { callId: first, cause });
  }
  if (
    !isCallAddress(intent.account) ||
    sameAddress(intent.account, zeroAddress)
  ) {
    throw new CalldataRecipientError("account", first);
  }
  if (
    "vault" in intent &&
    (!isCallAddress(intent.vault) || sameAddress(intent.vault, zeroAddress))
  ) {
    throw new CalldataTargetError("vault", first);
  }
  if (
    !Number.isInteger(intent.max_fee_bps) ||
    intent.max_fee_bps < 0 ||
    intent.max_fee_bps > 10_000
  ) {
    throw new CalldataFeeError("max_fee_bps", first);
  }
  for (const call of calls) {
    if (!isCallAddress(call.to) || sameAddress(call.to, zeroAddress)) {
      throw new CalldataTargetError("to", call.id);
    }
  }
  const { action } = intent;
  const rule =
    typeof action === "string" && Object.hasOwn(rules, action)
      ? rules[action]
      : undefined;
  if (rule == null) {
    throw new CalldataCallError("action", first);
  }
  return Object.freeze(rule(intent, { calls, chain }));
}
