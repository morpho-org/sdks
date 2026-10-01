import { type Address, maxUint256 } from "viem";
import type { SimulationAuthorization } from "../../authorizations.js";
import {
  AuthorizationRequestMismatchError,
  PermissionChangeMismatchError,
  UnsupportedOperationError,
} from "../../errors.js";
import type { OperationLimit } from "../../limits.js";
import type {
  AuthorizationPreparation,
  SignatureNonceChange,
  SimulationState,
  TokenAllowance,
} from "../../result.js";
import type { Transfer } from "../../types.js";
import type { ExecutedCall } from "../backends/parse-response.js";
import { type CheckContext, checkContext, eq } from "./helpers.js";

// biome-ignore lint/complexity/useMaxParams: lookup helpers read clearest with positional arguments
const findAllowance = (
  state: SimulationState,
  owner: Address,
  token: Address,
  spender: Address,
): TokenAllowance | undefined =>
  state.allowances.find(
    (a) => eq(a.owner, owner) && eq(a.token, token) && eq(a.spender, spender),
  );

// biome-ignore lint/complexity/useMaxParams: lookup helpers read clearest with positional arguments
const findNonce = (
  state: SimulationState,
  type: SignatureNonceChange["type"],
  verifyingContract: Address,
  owner: Address,
): SignatureNonceChange | undefined =>
  state.nonces.find(
    (n) =>
      n.type === type &&
      eq(n.verifyingContract, verifyingContract) &&
      eq(n.owner, owner),
  );

// biome-ignore lint/complexity/useMaxParams: lookup helpers read clearest with positional arguments
const isAuthorized = (
  state: SimulationState,
  authorizer: Address,
  authorized: Address,
): boolean | undefined =>
  state.morphoAuthorizations.find(
    (a) => eq(a.authorizer, authorizer) && eq(a.authorized, authorized),
  )?.after;

/** ERC-20 amount pulled out of `owner`'s wallet inside the user calls. */
// biome-ignore lint/complexity/useMaxParams: lookup helpers read clearest with positional arguments
const pulledAmount = (
  transfers: readonly Transfer[],
  owner: Address,
  token: Address,
): bigint =>
  transfers
    .filter((t) => eq(t.token, token) && eq(t.from, owner))
    .reduce((total, t) => total + t.amount, 0n);

const deadlineOk = (ctx: CheckContext, deadline: bigint): boolean =>
  deadline > ctx.block.blockTimestamp &&
  deadline <=
    ctx.block.stateBlockTimestamp + ctx.limits.maxSignatureLifetimeSeconds;

const prepContext = (ctx: CheckContext, authorizationIndex: number) => ({
  stage: "preparation" as const,
  chainId: ctx.chainId,
  mode: ctx.mode,
  blockNumber: ctx.block.blockNumber,
  authorizationIndex,
});

// biome-ignore lint/complexity/useMaxParams: lookup helpers read clearest with positional arguments
const mismatch = (ctx: CheckContext, message: string, field: string): never => {
  throw new PermissionChangeMismatchError(message, {
    context: checkContext(ctx, field),
  });
};

/**
 * Verify the request's pending authorizations.
 *
 * **Preview** — each authorization was prepared ahead of the user
 * transactions (preparation calls present and successful, or a
 * `stateOverride`), and the `after` state proves the grant landed:
 *
 * - `erc20Approval`: `after.allowance == max(0, before + amount − pulled)`,
 *   where `pulled` is the sum of owner→* ERC-20 transfers of the token inside
 *   the user calls (`pulled > 0` or `amount == 0` required — a pull that
 *   never fired means the approval was never needed);
 * - `erc2612Permit` / share permits: allowance granted to the permit
 *   spender, nonce unchanged (the preparation `approve` replaced the
 *   signature consumption);
 * - `permit2SignatureTransfer`: allowance granted to the permit2 contract;
 *   the unordered bitmap bit stays unset;
 * - `blueAuthorization` / `blueAuthorizationSignature`: `isAuthorized` reads
 *   `true` in `after`, nonce unchanged;
 * - deadlines satisfy `block.blockTimestamp < deadline <=
 *   stateBlockTimestamp + maxSignatureLifetimeSeconds`.
 *
 * **Final** — no preparations; the `before` state must satisfy every pull
 * the user transactions performed (allowance ≥ pulled for ERC-20 pulls,
 * `isAuthorized` for protected operations) and embedded signatures must
 * consume exactly one nonce each (erc2612 nonce +1, permit2 bitmap bit
 * unset-before/set-after, blue-authorization nonce +1 for signature
 * variants).
 *
 * @returns The {@link AuthorizationPreparation} list for
 *   `verification.authorizations`.
 * @internal
 */
export function checkAuthorizations(params: {
  readonly ctx: CheckContext;
  readonly authorizations: readonly SimulationAuthorization[];
  readonly operations: readonly OperationLimit[];
  readonly before: SimulationState;
  readonly after: SimulationState;
  readonly executedCalls: readonly ExecutedCall[];
  readonly transfers: readonly Transfer[];
}): readonly AuthorizationPreparation[] {
  const {
    ctx,
    authorizations,
    operations,
    before,
    after,
    executedCalls,
    transfers,
  } = params;
  const preview = ctx.mode === "preview";

  const preparations: AuthorizationPreparation[] = [];

  authorizations.forEach((auth, authorizationIndex) => {
    const calls = executedCalls.filter(
      (c) =>
        c.planned.type === "preparation" &&
        c.planned.authorizationIndex === authorizationIndex,
    );
    const prepared = calls.map((c) => ({
      transaction: c.planned.transaction,
      result: c.result,
    }));

    switch (auth.type) {
      case "erc20Approval": {
        const pulled = pulledAmount(transfers, auth.owner, auth.token);
        if (preview) {
          if (prepared.length === 0)
            throw new AuthorizationRequestMismatchError(
              `Authorization ${authorizationIndex} (erc20Approval ${auth.token}→${auth.spender}) produced no preparation calls and no stateOverride`,
              { context: prepContext(ctx, authorizationIndex) },
            );
          const allowanceBefore =
            findAllowance(before, auth.owner, auth.token, auth.spender)
              ?.amount ?? 0n;
          const allowanceAfter =
            findAllowance(after, auth.owner, auth.token, auth.spender)
              ?.amount ?? 0n;
          // ERC-20 `approve` replaces the allowance: the expected value is the
          // approved amount minus what the bundle pulled, independent of the
          // pre-existing allowance (a maxUint256 grant stays maxUint256).
          const expectedAfter =
            auth.amount === maxUint256
              ? maxUint256
              : auth.amount - pulled < 0n
                ? 0n
                : auth.amount - pulled;
          if (pulled <= 0n && auth.amount !== 0n)
            throw new AuthorizationRequestMismatchError(
              `Authorization ${authorizationIndex} approved "${auth.amount}" but nothing was pulled by the user transactions`,
              { context: prepContext(ctx, authorizationIndex) },
            );
          if (allowanceAfter !== expectedAfter)
            mismatch(
              ctx,
              `Allowance ${auth.owner}:${auth.token}→${auth.spender} is "${allowanceAfter}", expected "${expectedAfter}" (approved "${auth.amount}" replaces before "${allowanceBefore}" − pulled "${pulled}")`,
              "erc20Approval",
            );
        } else {
          // Final: the before allowance must have covered the pull.
          const allowanceBefore =
            findAllowance(before, auth.owner, auth.token, auth.spender)
              ?.amount ?? 0n;
          if (pulled > allowanceBefore)
            throw new AuthorizationRequestMismatchError(
              `Final-mode pull of "${pulled}" on ${auth.token} by ${auth.spender} exceeds the before-state allowance "${allowanceBefore}"`,
              { context: prepContext(ctx, authorizationIndex) },
            );
        }
        break;
      }
      case "erc2612Permit": {
        const { domain, message } = auth.typedData;
        if (!deadlineOk(ctx, message.deadline))
          throw new AuthorizationRequestMismatchError(
            `erc2612 permit deadline "${message.deadline}" is outside the acceptable window`,
            { context: prepContext(ctx, authorizationIndex) },
          );
        const nonceBefore = findNonce(
          before,
          "erc2612",
          domain.verifyingContract,
          message.owner,
        );
        const nonceAfter = findNonce(
          after,
          "erc2612",
          domain.verifyingContract,
          message.owner,
        );
        if (preview) {
          // Preparation replaced the signature; the nonce must be unchanged.
          if (
            nonceBefore != null &&
            nonceAfter != null &&
            nonceAfter.after !== nonceBefore.after
          )
            mismatch(
              ctx,
              `erc2612 nonce for ${message.owner} moved "${nonceBefore.after}" → "${nonceAfter.after}" in preview`,
              "erc2612Nonce",
            );
        } else if (
          nonceBefore != null &&
          nonceAfter != null &&
          nonceAfter.after !== nonceBefore.after + 1n
        ) {
          mismatch(
            ctx,
            `erc2612 nonce for ${message.owner} is "${nonceAfter.after}", expected "${nonceBefore.after + 1n}"`,
            "erc2612Nonce",
          );
        }
        break;
      }
      case "permit2SignatureTransfer": {
        const { message, domain } = auth.typedData;
        if (!deadlineOk(ctx, message.deadline))
          throw new AuthorizationRequestMismatchError(
            `Permit2 deadline "${message.deadline}" is outside the acceptable window`,
            { context: prepContext(ctx, authorizationIndex) },
          );
        const bitBefore = before.nonces.find(
          (n) =>
            n.type === "permit2" &&
            eq(n.verifyingContract, domain.verifyingContract) &&
            eq(n.owner, auth.owner),
        );
        const bitAfter = after.nonces.find(
          (n) =>
            n.type === "permit2" &&
            eq(n.verifyingContract, domain.verifyingContract) &&
            eq(n.owner, auth.owner),
        );
        if (preview) {
          // The bitmap must be unchanged — preparation used an allowance.
          if (
            bitBefore != null &&
            bitAfter != null &&
            bitAfter.after !== bitBefore.after
          )
            mismatch(
              ctx,
              `Permit2 bitmap for ${auth.owner} changed in preview`,
              "permit2Nonce",
            );
        } else {
          // Embedded signature: the bit must be unset before and set after.
          if (
            bitBefore != null &&
            (bitBefore.after & (1n << (message.nonce & 0xffn))) !== 0n
          )
            throw new AuthorizationRequestMismatchError(
              `Permit2 nonce "${message.nonce}" for ${auth.owner} is already spent at the before state`,
              { context: prepContext(ctx, authorizationIndex) },
            );
          if (
            bitBefore != null &&
            bitAfter != null &&
            bitAfter.type === "permit2" &&
            (bitAfter.after & (1n << (bitAfter.nonce & 0xffn))) === 0n
          )
            mismatch(
              ctx,
              `Permit2 nonce "${message.nonce}" for ${auth.owner} was not spent by the simulation`,
              "permit2Nonce",
            );
        }
        break;
      }
      case "blueAuthorization":
      case "blueAuthorizationSignature": {
        const isSignature = auth.type === "blueAuthorizationSignature";
        const authorizer = isSignature
          ? auth.typedData.message.authorizer
          : auth.authorizer;
        const authorized = isSignature
          ? auth.typedData.message.authorized
          : auth.authorized;
        const requested = isSignature
          ? auth.typedData.message.isAuthorized
          : auth.isAuthorized;
        const observed = isAuthorized(after, authorizer, authorized);
        if (observed !== requested)
          mismatch(
            ctx,
            `isAuthorized(${authorizer}, ${authorized}) reads "${observed}", expected "${requested}"`,
            "blueAuthorization",
          );
        if (isSignature) {
          if (!deadlineOk(ctx, auth.typedData.message.deadline))
            throw new AuthorizationRequestMismatchError(
              `Blue authorization deadline "${auth.typedData.message.deadline}" is outside the acceptable window`,
              { context: prepContext(ctx, authorizationIndex) },
            );
          const nonceBefore = findNonce(
            before,
            "blueAuthorization",
            ctx.addresses.blue,
            authorizer,
          );
          const nonceAfter = findNonce(
            after,
            "blueAuthorization",
            ctx.addresses.blue,
            authorizer,
          );
          if (preview) {
            if (
              nonceBefore != null &&
              nonceAfter != null &&
              nonceAfter.after !== nonceBefore.after
            )
              mismatch(
                ctx,
                `Blue nonce for ${authorizer} moved "${nonceBefore.after}" → "${nonceAfter.after}" in preview`,
                "blueNonce",
              );
          } else if (
            nonceBefore != null &&
            nonceAfter != null &&
            nonceAfter.after !== nonceBefore.after + 1n
          ) {
            mismatch(
              ctx,
              `Blue nonce for ${authorizer} is "${nonceAfter.after}", expected "${nonceBefore.after + 1n}"`,
              "blueNonce",
            );
          }
        }
        break;
      }
      default: {
        const _exhaustive: never = auth;
        throw new UnsupportedOperationError(
          `Unsupported authorization type "${JSON.stringify(_exhaustive)}"`,
          { context: prepContext(ctx, authorizationIndex) },
        );
      }
    }

    if (preview) {
      preparations.push({
        authorizationIndex,
        authorization: auth,
        calls: prepared,
      });
    }
  });

  // Final mode: every decoded pull must have been satisfiable at before.
  if (!preview) {
    for (const op of operations) {
      // Protected operations need `isAuthorized` already true at before
      // unless the bundle itself granted it during the block.
      if (requiresBundleAuthorization(op)) {
        const spender = ctx.addresses.bundles?.blueBundlesV1;
        if (spender == null) continue;
        const authorized =
          isAuthorized(before, ctx.owner, spender) === true ||
          isAuthorized(after, ctx.owner, spender) === true;
        if (!authorized)
          throw new AuthorizationRequestMismatchError(
            `Operation "${op.type}" at transaction ${op.transactionIndex} requires isAuthorized(${ctx.owner}, ${spender}) but it reads false`,
            {
              context: checkContext(ctx, "blueAuthorization", {
                account: ctx.owner,
                spender,
                failedTransactionIndex: op.transactionIndex,
              }),
            },
          );
      }
    }
  }

  return preparations;
}

const requiresBundleAuthorization = (op: OperationLimit): boolean =>
  op.type === "blueWithdraw" ||
  op.type === "blueBorrow" ||
  op.type === "blueWithdrawCollateral" ||
  op.type === "blueSupplyCollateralBorrow" ||
  op.type === "blueRepayWithdrawCollateral" ||
  op.type === "blueRefinance";
