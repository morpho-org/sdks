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

struct HoldingRequest {
    IERC20Permit token;
    address user;
    bool isWrappedBackedToken;
    bool isErc20Permissioned;
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
    function query(HoldingRequest calldata req, address morpho, IPermit2 permit2, address generalAdapter1)
        external
        view
        returns (HoldingResponse memory res)
    {
        res.balance = req.token.balanceOf(req.user);
        res.erc20Allowances = ERC20Allowances({
            morpho: req.token.allowance(req.user, morpho),
            permit2: req.token.allowance(req.user, address(permit2)),
            generalAdapter1: req.token.allowance(req.user, generalAdapter1)
        });
        res.permit2BundlerAllowance = permit2.allowance(req.user, address(req.token), generalAdapter1);

        try req.token.nonces(req.user) returns (uint256 nonce) {
            res.isErc2612 = true;
            res.erc2612Nonce = nonce;
        } catch {}

        try IERC20Permissioned(address(req.token)).hasPermission(req.user) returns (bool hasPermission) {
            res.canTransfer = hasPermission ? OptionalBoolean.True : OptionalBoolean.False;
        } catch {
            res.canTransfer = req.isErc20Permissioned ? OptionalBoolean.False : OptionalBoolean.True;
        }

        if (req.isWrappedBackedToken) {
            res.canTransfer = OptionalBoolean.Undefined;

            try IWrappedBackedToken(address(req.token)).whitelistControllerAggregator() returns (
                IWhitelistControllerAggregator whitelistControllerAggregator
            ) {
                try whitelistControllerAggregator.isWhitelisted(req.user) returns (bool isWhitelisted) {
                    res.canTransfer = isWhitelisted ? OptionalBoolean.True : OptionalBoolean.False;
                } catch {}
            } catch {}
        }
    }
}
