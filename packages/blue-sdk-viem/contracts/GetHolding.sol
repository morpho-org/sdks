// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import {IERC20Permit} from "./interfaces/IERC20Permit.sol";
import {IPermit2, Permit2Allowance} from "./interfaces/IPermit2.sol";
import {IWrappedBackedToken} from "./interfaces/IWrappedBackedToken.sol";
import {IWhitelistControllerAggregator} from "./interfaces/IWhitelistControllerAggregator.sol";
import {IERC20Permissioned} from "./interfaces/IERC20Permissioned.sol";

struct ERC20Allowances {
    uint256 morpho;
    uint256 permit2;
    uint256 generalAdapter1;
}

enum OptionalBoolean {
    Undefined,
    False,
    True
}

struct HoldingResponse {
    uint256 balance;
    ERC20Allowances erc20Allowances;
    Permit2Allowance permit2BundlerAllowance;
    bool isErc2612;
    uint256 erc2612Nonce;
    OptionalBoolean canTransfer;
}

contract GetHolding {
    function query(
        IERC20Permit token,
        address account,
        address morpho,
        IPermit2 permit2,
        address generalAdapter1,
        bool isWrappedBackedToken,
        bool isErc20Permissioned
    ) external view returns (HoldingResponse memory res) {
        res.balance = token.balanceOf(account);

        // Permit2 is not deployed on every chain; when it is absent the caller passes
        // `address(0)`. The multicall fallback returns zero for both Permit2 allowances
        // without any read in that case, so mirror it: skip the ERC20 allowance to a zero
        // spender (whose value is meaningless and could revert on some tokens) and skip the
        // Permit2 call (which would revert on an addressless contract), leaving both at their
        // zero defaults.
        bool hasPermit2 = address(permit2) != address(0);
        res.erc20Allowances = ERC20Allowances({
            morpho: token.allowance(account, morpho),
            permit2: hasPermit2 ? token.allowance(account, address(permit2)) : 0,
            generalAdapter1: token.allowance(account, generalAdapter1)
        });
        if (hasPermit2) {
            res.permit2BundlerAllowance = permit2.allowance(account, address(token), generalAdapter1);
        }

        try token.nonces(account) returns (uint256 nonce) {
            res.isErc2612 = true;
            res.erc2612Nonce = nonce;
        } catch {}

        try IERC20Permissioned(address(token)).hasPermission(account) returns (bool hasPermission) {
            res.canTransfer = hasPermission ? OptionalBoolean.True : OptionalBoolean.False;
        } catch {
            res.canTransfer = isErc20Permissioned ? OptionalBoolean.False : OptionalBoolean.True;
        }

        if (isWrappedBackedToken) {
            res.canTransfer = OptionalBoolean.Undefined;

            try IWrappedBackedToken(address(token)).whitelistControllerAggregator() returns (
                IWhitelistControllerAggregator whitelistControllerAggregator
            ) {
                try whitelistControllerAggregator.isWhitelisted(account) returns (bool isWhitelisted) {
                    res.canTransfer = isWhitelisted ? OptionalBoolean.True : OptionalBoolean.False;
                } catch {}
            } catch {}
        }
    }
}
