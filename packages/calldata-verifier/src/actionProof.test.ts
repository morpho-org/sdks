import { Buffer } from "node:buffer";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { runInNewContext } from "node:vm";
import * as viem from "viem";
import { describe, expect, test, vi } from "vitest";
import {
  type ActionProofInput,
  CalldataAmountError,
  type CalldataCall,
  type CalldataIntent,
  CalldataProofError,
  verifyCalldata,
} from "./index.js";
import jwks from "./test/action-proof-jwks.json" with { type: "json" };
import vectors from "./test/action-proof-vectors.json" with { type: "json" };

type Vector = (typeof vectors.proof_vectors)[number];

vi.mock("viem", { spy: true });

const intent = {
  action: "vault_v2.deposit",
  account: "0x545b6Cc751F0C47C202694cf835db2E3C071400A",
  asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  vault: "0xbeef0e0834849aCC03f0089F01f4F1Eeb06873C9",
  chain_id: 8453,
  max_fee_bps: 0,
  amount: { unit: "assets", value: "1000000" },
  funding: { type: "erc20" },
  slippage_bps: 50,
} as const satisfies CalldataIntent;

function exchange(vector: Vector): ActionProofInput {
  const { request, response } = vector;
  const headers: Record<string, string | undefined> = response.headers;
  function header(name: string): string {
    return (
      Object.entries(headers).find(
        ([key]) => key.toLowerCase() === name,
      )?.[1] ?? ""
    );
  }
  return {
    header: header("morpho-action-proof"),
    jwks: vector.jwks ?? jwks,
    now: vector.now,
    request: {
      method: request.method,
      path: request.path,
      contentType: request.content_type,
      body: Buffer.from(request.body_base64, "base64"),
    },
    response: {
      status: response.status,
      contentType: header("content-type"),
      requestId: header("x-request-id"),
      body: Buffer.from(response.body_base64, "base64"),
    },
  };
}

function responseCalls(proof: ActionProofInput): readonly CalldataCall[] {
  const { data } = JSON.parse(
    new TextDecoder().decode(proof.response.body),
  ) as {
    data: { calls?: readonly CalldataCall[] };
  };
  return data.calls ?? [];
}

function approvedProof(): ActionProofInput {
  const vector = vectors.proof_vectors.find(
    ({ name }) => name === "approved_prepared_success",
  );
  if (!vector) throw new Error("Missing approved Actions API vector");
  return exchange(vector);
}

const signingKey = generateKeyPairSync("ec", { namedCurve: "prime256v1" });

function reissue(
  proof: ActionProofInput,
  {
    protectedHeader = {},
    claims = {},
    responseBody = proof.response.body,
    serializeClaims = JSON.stringify,
  }: {
    protectedHeader?: Record<string, unknown>;
    claims?: Record<string, unknown>;
    responseBody?: Uint8Array;
    serializeClaims?: (claims: Record<string, unknown>) => string;
  } = {},
) {
  const [header, payload] = proof.header.split(".");
  if (header === undefined || payload === undefined) {
    throw new Error("Missing compact JWS parts");
  }
  const read = (part: string) =>
    JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  const originalHeader = read(header);
  const originalClaims = read(payload);
  const nextHeader = { ...originalHeader, ...protectedHeader };
  const nextClaims = {
    ...originalClaims,
    response: {
      ...originalClaims.response,
      body_sha256: createHash("sha256")
        .update(responseBody)
        .digest("base64url"),
    },
    ...claims,
  };
  const compact = (part: unknown) =>
    Buffer.from(JSON.stringify(part)).toString("base64url");
  const payloadPart = Buffer.from(serializeClaims(nextClaims)).toString(
    "base64url",
  );
  const message = `${compact(nextHeader)}.${payloadPart}`;
  const signature = sign("sha256", Buffer.from(message), {
    key: signingKey.privateKey,
    dsaEncoding: "ieee-p1363",
  });
  return {
    ...proof,
    header: `${message}.${signature.toString("base64url")}`,
    jwks: {
      keys: [
        {
          ...signingKey.publicKey.export({ format: "jwk" }),
          kid: originalHeader.kid,
        },
      ],
    },
    response: { ...proof.response, body: responseBody },
  };
}

function expectProofError(
  proof: ActionProofInput,
  { calls, field }: { calls: readonly CalldataCall[]; field: string },
) {
  expect(() => verifyCalldata(intent, calls, { proof })).toThrow(
    expect.objectContaining({ constructor: CalldataProofError, field }),
  );
}

test.each([false, null, "true"])("rejects b64=%j without crit", (b64) => {
  const base = approvedProof();
  const calls = responseCalls(base);
  const protectedHeader = { crit: undefined, b64: true };
  expect(
    verifyCalldata(intent, calls, {
      proof: reissue(base, { protectedHeader }),
    }),
  ).toHaveLength(2);
  expectProofError(
    reissue(base, { protectedHeader: { ...protectedHeader, b64 } }),
    { calls, field: "proof.header" },
  );
});

test.each([
  { field: "kty", value: "RSA" },
  { field: "crv", value: "P-384" },
  { field: "x", value: "" },
  { field: "y", value: "" },
  { field: "key_ops shape", value: "verify", key: "key_ops" },
  {
    field: "array-like key_ops",
    value: { 0: "verify", length: 1 },
    key: "key_ops",
  },
  { field: "key_ops length", value: ["verify", "sign"], key: "key_ops" },
  { field: "key_ops operation", value: ["sign"], key: "key_ops" },
])("rejects invalid proof JWK $field", ({ field, key, value }) => {
  const proof = reissue(approvedProof());
  const calls = responseCalls(proof);
  const { keys } = proof.jwks;
  const valid = keys[0];
  expect(verifyCalldata(intent, calls, { proof })).toHaveLength(2);
  expectProofError(
    { ...proof, jwks: { keys: [{ ...valid, [key ?? field]: value }] } },
    { calls, field: "proof.jwks" },
  );
});

test.each(["x", "y"] as const)("rejects a string-coercible JWK %s", (field) => {
  const proof = reissue(approvedProof());
  const [key] = proof.jwks.keys;
  if (!key || typeof key !== "object" || !(field in key))
    throw new Error("Expected JWK coordinates");
  expectProofError(
    { ...proof, jwks: { keys: [{ ...key, [field]: [key[field]] }] } },
    { calls: responseCalls(proof), field: "proof.jwks" },
  );
});

test.each([
  { field: "kid type", change: { kid: 1 } },
  { field: "empty kid", change: { kid: "" } },
  { field: "crit shape", change: { crit: "b64" } },
  { field: "array-like crit", change: { crit: { 0: "b64", length: 1 } } },
  { field: "crit length", change: { crit: ["b64", "other"] } },
  { field: "crit entry", change: { crit: ["other"] } },
  { field: "b64", change: { b64: false } },
])("rejects invalid proof header $field", ({ change }) => {
  const base = approvedProof();
  const validHeader = { crit: ["b64"], b64: true };
  const calls = responseCalls(base);
  expect(
    verifyCalldata(intent, calls, {
      proof: reissue(base, { protectedHeader: validHeader }),
    }),
  ).toHaveLength(2);
  expectProofError(
    reissue(base, { protectedHeader: { ...validHeader, ...change } }),
    { calls, field: "proof.header" },
  );
});

test.each([
  {
    field: "expiration precision",
    claims: (now: number) => ({ exp: now + 10.5 }),
  },
  { field: "not-before type", claims: () => ({ nbf: "0" }) },
  { field: "not-before time", claims: (now: number) => ({ nbf: now + 6 }) },
  {
    field: "action id",
    claims: () => ({ action_id: "different-action-id" }),
    error: "proof.response",
  },
  {
    field: "action",
    claims: () => ({ action: "vault_v1.deposit" }),
    error: "proof.response",
  },
])(
  "rejects an independently signed invalid $field claim",
  ({ claims, error }) => {
    const proof = approvedProof();
    expectProofError(reissue(proof, { claims: claims(proof.now) }), {
      calls: responseCalls(proof),
      field: error ?? "proof.claims",
    });
  },
);

test.each([
  { field: "an empty protected header", index: 0, value: "" },
  { field: "an empty payload", index: 1, value: "" },
  { field: "an empty signature", index: 2, value: "" },
  { field: "an extra compact segment", index: 3, value: "extra" },
  {
    field: "padded protected encoding",
    index: 0,
    value: "=",
    append: true,
    error: "proof.encoding",
  },
  { field: "a non-object protected header", index: 0, value: "W10" },
  {
    field: "a short signature",
    index: 2,
    value: "AA",
    error: "proof.signature",
  },
])("rejects $field", ({ index, value, append, error }) => {
  const proof = approvedProof();
  const parts = proof.header.split(".");
  parts[index] = append ? `${parts[index]}${value}` : value;
  expectProofError(
    { ...proof, header: parts.join(".") },
    { calls: responseCalls(proof), field: error ?? "proof.header" },
  );
});

test("rejects a correctly signed response whose data is not an object", () => {
  const proof = approvedProof();
  const changed = reissue(proof, {
    claims: { action: undefined, action_id: undefined, decision: "rejected" },
    responseBody: Buffer.from('{"data":[]}'),
  });
  expectProofError(changed, {
    calls: responseCalls(proof),
    field: "proof.response",
  });
});

test.each([
  { field: "method", change: "GET" },
  { field: "empty body", change: new Uint8Array() },
  { field: "response request id", change: 123 },
])(
  "rejects the signed exchange with an invalid $field",
  ({ field, change }) => {
    const proof = approvedProof();
    const payload = proof.header.split(".")[1];
    if (!payload) throw new Error("Expected signed payload");
    const claims = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    );
    const call = responseCalls(proof);
    const invalid =
      field === "method"
        ? {
            ...reissue(proof, {
              claims: { request: { ...claims.request, method: change } },
            }),
            request: { ...proof.request, method: change },
          }
        : field === "empty body"
          ? {
              ...reissue(proof, {
                claims: {
                  request: {
                    ...claims.request,
                    body_sha256: createHash("sha256").digest("base64url"),
                  },
                },
              }),
              request: { ...proof.request, body: change },
            }
          : {
              ...reissue(proof, { claims: { request_id: change } }),
              response: { ...proof.response, requestId: change },
            };
    expectProofError(invalid as ActionProofInput, {
      calls: call,
      field: "proof.exchange",
    });
  },
);

test.each([
  { claim: "request", field: "proof.exchange" },
  { claim: "response", field: "proof.exchange" },
])("rejects a signed null $claim", ({ claim, field }) => {
  const proof = approvedProof();
  expectProofError(reissue(proof, { claims: { [claim]: null } }), {
    calls: responseCalls(proof),
    field,
  });
});

test("rejects a caller-supplied infinite verification time", () => {
  const proof = approvedProof();
  expectProofError(
    { ...proof, now: Number.POSITIVE_INFINITY },
    {
      calls: responseCalls(proof),
      field: "proof.now",
    },
  );
});

test("rejects a finite verification time outside the supported date range", () => {
  const proof = approvedProof();
  expectProofError(
    { ...proof, now: 8_640_000_000_001 },
    {
      calls: responseCalls(proof),
      field: "proof.claims",
    },
  );
});

test("rejects a signed negative not-before date outside the numeric range", () => {
  const proof = approvedProof();
  const serializeClaims = (claims: Record<string, unknown>) =>
    JSON.stringify(claims).replace('"nbf":"overflow"', '"nbf":-1e400');
  expectProofError(
    reissue(proof, { claims: { nbf: "overflow" }, serializeClaims }),
    {
      calls: responseCalls(proof),
      field: "proof.claims",
    },
  );
});

test("rejects a mismatch in the signed request method alone", () => {
  const proof = approvedProof();
  const [, payload] = proof.header.split(".");
  if (!payload) throw new Error("Expected signed payload");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  expectProofError(
    reissue(proof, {
      claims: { request: { ...claims.request, method: "GET" } },
    }),
    { calls: responseCalls(proof), field: "proof.exchange" },
  );
});

test.each(["request", "response"] as const)(
  "requires %s body bytes, not an array",
  (side) => {
    const proof = approvedProof();
    const content = proof[side];
    expectProofError(
      {
        ...proof,
        [side]: { ...content, body: [...content.body] },
      } as ActionProofInput,
      { calls: responseCalls(proof), field: "proof.exchange" },
    );
  },
);

test.each(["request", "response"] as const)(
  "accepts a cross-realm Uint8Array as the %s body",
  (side) => {
    const proof = approvedProof();
    const content = proof[side];
    const body = runInNewContext("new Uint8Array(bytes)", {
      bytes: [...content.body],
    }) as Uint8Array;
    expect(body).not.toBeInstanceOf(Uint8Array);
    const calls = responseCalls(proof);
    expect(
      verifyCalldata(intent, calls, {
        proof: { ...proof, [side]: { ...content, body } },
      }).map(({ call }) => call),
    ).toEqual(calls);
  },
);

test.each([
  ["request", DataView],
  ["response", DataView],
  ["request", Uint16Array],
  ["response", Uint16Array],
] as const)("rejects a %s body with the wrong byte view (%p)", (side, View) => {
  const proof = approvedProof();
  const content = proof[side];
  const bytes = Uint8Array.from(content.body);
  const body =
    View === DataView
      ? Object.assign(new DataView(bytes.buffer), [...bytes], {
          length: bytes.length,
        })
      : Uint16Array.from(bytes);
  Object.defineProperty(body, Symbol.toStringTag, { value: "Uint8Array" });
  expect(Object.prototype.toString.call(body)).toBe("[object Uint8Array]");
  expect(new Uint8Array(body)).toEqual(bytes);
  expectProofError(
    { ...proof, [side]: { ...content, body } } as ActionProofInput,
    { calls: responseCalls(proof), field: "proof.exchange" },
  );
});

test("rejects caller-provided array-like calls even when all fields match", () => {
  const proof = approvedProof();
  const calls = responseCalls(proof);
  expectProofError(proof, {
    calls: { ...calls, length: calls.length },
    field: "proof.calls",
  });
});

test("rejects signed array-like calls even when all fields match", () => {
  const proof = approvedProof();
  const calls = responseCalls(proof);
  const response = JSON.parse(new TextDecoder().decode(proof.response.body));
  response.data.calls = { ...calls, length: calls.length };
  expectProofError(
    reissue(proof, { responseBody: Buffer.from(JSON.stringify(response)) }),
    {
      calls,
      field: "proof.calls",
    },
  );
});

test("wraps a malformed base64url quantum in a typed proof error", () => {
  const proof = approvedProof();
  const [, payload, signature] = proof.header.split(".");
  expectProofError(
    { ...proof, header: `A.${payload}.${signature}` },
    { calls: responseCalls(proof), field: "proof" },
  );
});

test("rejects extra unsigned calls even when every signed call matches", () => {
  const proof = approvedProof();
  const calls = responseCalls(proof);
  expectProofError(proof, {
    calls: [...calls, ...calls.slice(0, 1)],
    field: "proof.calls",
  });
});

describe("Actions API proof recipe vectors", () => {
  test.each(vectors.proof_vectors)("$name", (vector) => {
    const proof = exchange(vector);
    // Rejected vectors need not have parseable response bodies.
    const calls = vector.expected.accepted ? responseCalls(proof) : [];
    const verify = () => verifyCalldata(intent, calls, { proof });
    if (vector.expected.execute_calls) {
      expect(verify().map(({ call }) => call)).toEqual(calls);
    } else if (vector.expected.accepted) {
      expect(verify).toThrow(
        expect.objectContaining({
          name: "CalldataProofError",
          field: "proof.decision",
        }),
      );
    } else {
      expect(verify).toThrow(CalldataProofError);
      expect(verify).not.toThrow(
        expect.objectContaining({ field: "proof.calls" }),
      );
      expect(verify).not.toThrow(
        expect.objectContaining({ field: "proof.decision" }),
      );
    }
  });

  test("rejects a proof with a different expected issuer", () => {
    const proof = approvedProof();
    expect(() =>
      verifyCalldata(intent, responseCalls(proof), {
        proof: { ...proof, issuer: "https://api.dev.morpho.dev/v0/actions" },
      }),
    ).toThrow(CalldataProofError);
  });

  test("only prepared successful approvals allow calls to execute", () => {
    for (const vector of vectors.proof_vectors.filter(
      ({ expected }) => expected.accepted,
    )) {
      const proof = exchange(vector);
      const verify = () =>
        verifyCalldata(intent, responseCalls(proof), { proof });
      if (vector.expected.decision === "approved") {
        expect(verify).not.toThrow();
      } else {
        expect(verify).toThrow(CalldataProofError);
      }
    }
  });
});

describe("binding an approved proof to static calldata verification", () => {
  test("rejects a proof without a caller-supplied verification time", () => {
    const proof = approvedProof();
    Reflect.deleteProperty(proof, "now");
    expect(() =>
      verifyCalldata(intent, responseCalls(proof), { proof }),
    ).toThrow(
      expect.objectContaining({
        name: "CalldataProofError",
        field: "proof.now",
      }),
    );
  });

  test("returns the same decoded calls as the synchronous two-argument path", () => {
    const proof = approvedProof();
    const calls = responseCalls(proof);
    const decoded = verifyCalldata(intent, calls, { proof });
    expect(decoded).toHaveLength(2);
    expect(decoded).toEqual(verifyCalldata(intent, calls));
  });

  test("still checks calls statically after authenticating them", () => {
    const proof = approvedProof();
    expect(() =>
      verifyCalldata(
        { ...intent, amount: { unit: "assets", value: "1000001" } },
        responseCalls(proof),
        { proof },
      ),
    ).toThrow(CalldataAmountError);
  });

  test("rejects a byte change that leaves the parsed response identical", () => {
    const proof = approvedProof();
    const body = Buffer.concat([proof.response.body, Buffer.from(" ")]);
    expect(() =>
      verifyCalldata(intent, responseCalls(proof), {
        proof: { ...proof, response: { ...proof.response, body } },
      }),
    ).toThrow(
      expect.objectContaining({
        name: "CalldataProofError",
        field: "proof.exchange",
      }),
    );
  });

  test.each([
    { field: "status", change: { status: 201 } },
    { field: "contentType", change: { contentType: "text/plain" } },
  ])("rejects a change to only response.$field", ({ change }) => {
    const proof = approvedProof();
    expect(() =>
      verifyCalldata(intent, responseCalls(proof), {
        proof: { ...proof, response: { ...proof.response, ...change } },
      }),
    ).toThrow(
      expect.objectContaining({
        constructor: CalldataProofError,
        field: "proof.exchange",
      }),
    );
  });

  test("rejects a change to only request.contentType", () => {
    const proof = approvedProof();
    expect(() =>
      verifyCalldata(intent, responseCalls(proof), {
        proof: {
          ...proof,
          request: { ...proof.request, contentType: "text/plain" },
        },
      }),
    ).toThrow(
      expect.objectContaining({
        constructor: CalldataProofError,
        field: "proof.exchange",
      }),
    );
  });

  test("hashes and parses a single response body snapshot", () => {
    const proof = approvedProof();
    const calls = responseCalls(proof);
    const { body } = proof.response;
    let reads = 0;
    const response = {
      ...proof.response,
      get body() {
        return ++reads === 1 ? body : Buffer.from("{}");
      },
    };
    expect(
      verifyCalldata(intent, calls, { proof: { ...proof, response } }),
    ).toHaveLength(2);
    expect(reads).toBe(1);
  });

  test("parses the authenticated copy after the original response buffer changes", async () => {
    const proof = approvedProof();
    const calls = responseCalls(proof);
    const { body } = proof.response;
    const { sha256 } = await vi.importActual<typeof viem>("viem");
    const digest = vi.mocked(viem.sha256);
    digest
      .mockClear()
      .mockImplementationOnce((input, to) => sha256(input, to))
      .mockImplementationOnce((input, to) => {
        const hash = sha256(input, to);
        body.fill(0);
        return hash;
      });
    try {
      expect(
        verifyCalldata(intent, calls, { proof }).map(({ call }) => call),
      ).toEqual(calls);
      expect(digest).toHaveBeenCalledTimes(2);
      expect(body.every((byte) => byte === 0)).toBe(true);
    } finally {
      digest.mockReset();
    }
  });

  test.each(["id", "kind", "to", "data", "value"] as const)(
    "rejects a call with a different %s",
    (field) => {
      const proof = approvedProof();
      const calls = responseCalls(proof).map((call, index) =>
        index === 0 ? { ...call, [field]: `${call[field]}0` } : call,
      );
      expect(() => verifyCalldata(intent, calls, { proof })).toThrow(
        expect.objectContaining({
          name: "CalldataProofError",
          field: "proof.calls",
        }),
      );
    },
  );

  test("rejects reordered or missing calls", () => {
    const proof = approvedProof();
    const calls = responseCalls(proof);
    for (const different of [[...calls].reverse(), calls.slice(1)]) {
      expect(() => verifyCalldata(intent, different, { proof })).toThrow(
        expect.objectContaining({
          name: "CalldataProofError",
          field: "proof.calls",
        }),
      );
    }
  });

  test("rejects a different chain", () => {
    const proof = approvedProof();
    expect(() =>
      verifyCalldata({ ...intent, chain_id: 1 }, responseCalls(proof), {
        proof,
      }),
    ).toThrow(
      expect.objectContaining({
        name: "CalldataProofError",
        field: "proof.chain_id",
      }),
    );
  });

  test("rejects a correctly signed prepared response without a chain ID", () => {
    const proof = approvedProof();
    const response = JSON.parse(
      Buffer.from(proof.response.body).toString("utf8"),
    ) as {
      data: { chain_id?: number };
    };
    delete response.data.chain_id;
    const body = Buffer.from(JSON.stringify(response));
    const [header, encodedClaims] = proof.header.split(".");
    if (!header || !encodedClaims) {
      throw new Error("Malformed approved Actions API vector");
    }
    const claims = JSON.parse(
      Buffer.from(encodedClaims, "base64url").toString("utf8"),
    ) as {
      response: { body_sha256: string };
    };
    claims.response.body_sha256 = createHash("sha256")
      .update(body)
      .digest("base64url");
    const message = `${header}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}`;
    const { privateKey, publicKey } = generateKeyPairSync("ec", {
      namedCurve: "prime256v1",
    });
    const signature = sign("sha256", Buffer.from(message), {
      key: privateKey,
      dsaEncoding: "ieee-p1363",
    });
    const { kid } = JSON.parse(
      Buffer.from(header, "base64url").toString("utf8"),
    ) as { kid: string };
    expect(() =>
      verifyCalldata(intent, responseCalls(proof), {
        proof: {
          ...proof,
          header: `${message}.${signature.toString("base64url")}`,
          jwks: { keys: [{ ...publicKey.export({ format: "jwk" }), kid }] },
          response: { ...proof.response, body },
        },
      }),
    ).toThrow(
      expect.objectContaining({
        name: "CalldataProofError",
        field: "proof.chain_id",
      }),
    );
  });
});
