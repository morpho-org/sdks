// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import {IERC20Permit} from "./interfaces/IERC20Permit.sol";
import {IPermit2, Permit2Allowance} from "./interfaces/IPermit2.sol";
import {IWrappedBackedToken} from "./interfaces/IWrappedBackedToken.sol";
import {IWhitelistControllerAggregator} from "./interfaces/IWhitelistControllerAggregator.sol";
import {IERC20Permissioned} from "./interfaces/IERC20Permissioned.sol";
import {ERC20Allowances, OptionalBoolean, HoldingRequest, HoldingResponse} from "./GetHolding.sol";

contract GetHoldings {
    function query(HoldingRequest[] calldata reqs, address morpho, IPermit2 permit2, address generalAdapter1)
        external
        view
        returns (HoldingResponse[] memory res)
    {
        uint256 nbReqs = reqs.length;

        res = new HoldingResponse[](nbReqs);

        for (uint256 i = 0; i < nbReqs; i++) {
            HoldingRequest memory req = reqs[i];
            HoldingResponse memory resI = res[i];

            resI.balance = req.token.balanceOf(req.user);
            resI.erc20Allowances = ERC20Allowances({
                morpho: req.token.allowance(req.user, morpho),
                permit2: req.token.allowance(req.user, address(permit2)),
                generalAdapter1: req.token.allowance(req.user, generalAdapter1)
            });
            resI.permit2BundlerAllowance = permit2.allowance(req.user, address(req.token), generalAdapter1);

            try req.token.nonces(req.user) returns (uint256 nonce) {
                resI.isErc2612 = true;
                resI.erc2612Nonce = nonce;
            } catch {}

            try IERC20Permissioned(address(req.token)).hasPermission(req.user) returns (bool hasPermission) {
                resI.canTransfer = hasPermission ? OptionalBoolean.True : OptionalBoolean.False;
            } catch {
                resI.canTransfer = req.isErc20Permissioned ? OptionalBoolean.False : OptionalBoolean.True;
            }

            if (req.isWrappedBackedToken) {
                resI.canTransfer = OptionalBoolean.Undefined;

                try IWrappedBackedToken(address(req.token)).whitelistControllerAggregator() returns (
                    IWhitelistControllerAggregator whitelistControllerAggregator
                ) {
                    try whitelistControllerAggregator.isWhitelisted(req.user) returns (bool isWhitelisted) {
                        resI.canTransfer = isWhitelisted ? OptionalBoolean.True : OptionalBoolean.False;
                    } catch {}
                } catch {}
            }
        }
    }
}
