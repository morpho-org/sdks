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
        address bundler3,
        address generalAdapter1,
        bool isWrappedBackedToken,
        bool isErc20Permissioned
    ) external view returns (HoldingResponse memory res) {
        res.balance = token.balanceOf(account);
        res.erc20Allowances = ERC20Allowances({
            morpho: token.allowance(account, morpho),
            permit2: token.allowance(account, address(permit2)),
            generalAdapter1: token.allowance(account, generalAdapter1)
        });
        res.permit2BundlerAllowance = permit2.allowance(account, address(token), bundler3);

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
