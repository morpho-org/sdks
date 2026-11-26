import { p256 } from "@noble/curves/p256";
import { sha256 } from "viem";
import { CalldataProofError } from "./errors.js";
import type { ActionProofInput, CalldataCall } from "./types.js";

const algorithm = "ES256";
const proofType = "morpho-action-proof+jwt";
const productionIssuer = "https://api.morpho.org/v0/actions";
const audience = "morpho-actions-client";
const jwkFields = ["kty", "crv", "x", "y", "alg", "kid", "key_ops", "use"];
const callFields = ["id", "kind", "to", "data", "value"] as const;
const clockTolerance = 5;
const maxTokenAge = 60;
const maxLifetime = 300;
const typedArrayPrototype: object = Object.getPrototypeOf(Uint8Array.prototype);

function isObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function isUint8Array(value: unknown): value is Uint8Array {
  return (
    Reflect.get(typedArrayPrototype, Symbol.toStringTag, value) === "Uint8Array"
  );
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function decodeBase64url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new CalldataProofError("proof.encoding");
  }
  return Uint8Array.from(
    atob(value.replaceAll("-", "+").replaceAll("_", "/")),
    (character) => character.charCodeAt(0),
  );
}

function parseObject(
  bytes: Uint8Array,
  field: string,
): Record<string, unknown> {
  const value: unknown = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(bytes),
  );
  if (!isObject(value)) {
    throw new CalldataProofError(field);
  }
  return value;
}

function publicKey(jwks: unknown, kid: string): Uint8Array {
  const keys =
    isObject(jwks) && Array.isArray(jwks.keys)
      ? (jwks.keys as unknown[]).filter(
          (entry) => isObject(entry) && entry.kid === kid,
        )
      : [];
  const [key] = keys;
  if (
    keys.length !== 1 ||
    !isObject(key) ||
    Object.keys(key).some((field) => !jwkFields.includes(field)) ||
    key.kty !== "EC" ||
    key.crv !== "P-256" ||
    typeof key.x !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/.test(key.x) ||
    typeof key.y !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/.test(key.y) ||
    (key.alg !== undefined && key.alg !== algorithm) ||
    (key.use !== undefined && key.use !== "sig") ||
    (key.key_ops !== undefined &&
      (!Array.isArray(key.key_ops) ||
        key.key_ops.length !== 1 ||
        key.key_ops[0] !== "verify"))
  ) {
    throw new CalldataProofError("proof.jwks");
  }
  const point = new Uint8Array(65);
  point[0] = 4;
  point.set(decodeBase64url(key.x), 1);
  point.set(decodeBase64url(key.y), 33);
  return point;
}

function verifyClaims(
  claims: Record<string, unknown>,
  { issuer, now }: { issuer: string; now: number },
) {
  const { iat, exp, nbf, aud } = claims;
  if (
    claims.iss !== issuer ||
    claims.sub !== "action-response" ||
    !(aud === audience || (Array.isArray(aud) && aud.includes(audience))) ||
    !Number.isSafeInteger(now) ||
    typeof iat !== "number" ||
    !Number.isSafeInteger(iat) ||
    typeof exp !== "number" ||
    !Number.isSafeInteger(exp) ||
    exp <= iat ||
    exp - iat > maxLifetime ||
    iat > now + clockTolerance ||
    now - iat > maxTokenAge + clockTolerance ||
    exp <= now - clockTolerance ||
    (nbf !== undefined &&
      (typeof nbf !== "number" ||
        !Number.isFinite(nbf) ||
        nbf > now + clockTolerance))
  ) {
    throw new CalldataProofError("proof.claims");
  }
}

function responseDecision(data: Record<string, unknown>) {
  const simulation = isObject(data.simulation)
    ? data.simulation.status
    : undefined;
  if (data.status === "signature_required") {
    return "signature_required";
  }
  if (data.status === "prepared" && simulation === "success") {
    return "approved";
  }
  if (
    data.status === "simulation_unavailable" &&
    simulation === "unavailable"
  ) {
    return "unsimulated";
  }
  return "rejected";
}

function verifyExchange({
  header,
  jwks,
  request,
  response,
  issuer = productionIssuer,
  now,
}: ActionProofInput) {
  if (typeof now !== "number" || !Number.isFinite(now)) {
    throw new CalldataProofError("proof.now");
  }
  const [protectedPart, payloadPart, signaturePart, ...rest] =
    header.split(".");
  if (!protectedPart || !payloadPart || !signaturePart || rest.length !== 0) {
    throw new CalldataProofError("proof.header");
  }
  const { alg, typ, kid, crit, b64 } = parseObject(
    decodeBase64url(protectedPart),
    "proof.header",
  );
  if (
    alg !== algorithm ||
    typ !== proofType ||
    typeof kid !== "string" ||
    kid.length === 0 ||
    (b64 !== undefined && b64 !== true) ||
    (crit !== undefined &&
      (!Array.isArray(crit) ||
        crit.length !== 1 ||
        crit[0] !== "b64" ||
        b64 !== true))
  ) {
    throw new CalldataProofError("proof.header");
  }
  const signature = decodeBase64url(signaturePart);
  const message = new TextEncoder().encode(`${protectedPart}.${payloadPart}`);
  if (
    signature.length !== 64 ||
    !p256.verify(signature, message, publicKey(jwks, kid), {
      format: "compact",
      lowS: false,
      prehash: true,
    })
  ) {
    throw new CalldataProofError("proof.signature");
  }
  const claims = parseObject(decodeBase64url(payloadPart), "proof.claims");
  verifyClaims(claims, {
    issuer,
    now: Math.floor(new Date(now * 1000).getTime() / 1000),
  });
  const { request: signedRequest, response: signedResponse } = claims;
  const receivedRequestBody = request.body;
  const receivedResponseBody = response.body;
  if (
    request.method !== "POST" ||
    !request.path.startsWith("/v0/actions/") ||
    !isUint8Array(receivedRequestBody) ||
    !isUint8Array(receivedResponseBody) ||
    typeof response.requestId !== "string" ||
    claims.request_id !== response.requestId ||
    !isObject(signedRequest) ||
    signedRequest.method !== request.method ||
    signedRequest.target !== request.path ||
    signedRequest.content_type !== request.contentType ||
    !isObject(signedResponse) ||
    signedResponse.status !== response.status ||
    signedResponse.content_type !== response.contentType
  ) {
    throw new CalldataProofError("proof.exchange");
  }
  const requestBody = new Uint8Array(receivedRequestBody);
  const responseBody = new Uint8Array(receivedResponseBody);
  if (
    requestBody.length === 0 ||
    signedRequest.body_sha256 !== base64url(sha256(requestBody, "bytes")) ||
    signedResponse.body_sha256 !== base64url(sha256(responseBody, "bytes"))
  ) {
    throw new CalldataProofError("proof.exchange");
  }
  const { data } = parseObject(responseBody, "proof.response");
  if (!isObject(data)) {
    throw new CalldataProofError("proof.response");
  }
  const decision = responseDecision(data);
  if (
    claims.action_id !== data.action_id ||
    claims.action !== data.action ||
    claims.decision !== decision
  ) {
    throw new CalldataProofError("proof.response");
  }
  return { data, decision };
}

function isCall(value: unknown): value is CalldataCall {
  return (
    isObject(value) &&
    callFields.every((field) => typeof value[field] === "string")
  );
}

/** @internal */
export function authenticateCalls(
  proof: ActionProofInput,
  { calls, chainId }: { calls: readonly CalldataCall[]; chainId: number },
): readonly CalldataCall[] {
  try {
    const { data, decision } = verifyExchange(proof);
    if (decision !== "approved") {
      throw new CalldataProofError("proof.decision");
    }
    if (!Number.isSafeInteger(data.chain_id) || data.chain_id !== chainId) {
      throw new CalldataProofError("proof.chain_id");
    }
    const signedCalls: unknown = data.calls;
    if (
      !Array.isArray(signedCalls) ||
      !signedCalls.every(isCall) ||
      !Array.isArray(calls) ||
      signedCalls.length !== calls.length ||
      signedCalls.some((signed, index) => {
        const call = calls[index];
        return (
          !isCall(call) ||
          callFields.some((field) => call[field] !== signed[field])
        );
      })
    ) {
      throw new CalldataProofError("proof.calls");
    }
    return signedCalls;
  } catch (cause) {
    if (cause instanceof CalldataProofError) {
      throw cause;
    }
    throw new CalldataProofError("proof", { cause });
  }
}
