// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import {IERC20Permit, Eip5267Domain} from "../interfaces/IERC20Permit.sol";
import {IERC20} from "../interfaces/IERC20.sol";

struct RegressionTokenResponse {
    uint256 decimals;
    bool hasSymbol;
    string symbol;
    bool hasName;
    string name;
    Eip5267Domain eip5267Domain;
    bool hasEip5267Domain;
}

contract GetTokenTryCatchRegression {
    function deployRawReturnToken(
        bytes calldata nameReturnData,
        bytes calldata symbolReturnData,
        bytes calldata decimalsReturnData,
        bytes calldata eip5267DomainReturnData,
        bool revertName,
        bool revertSymbol,
        bool revertDecimals,
        bool revertEip5267Domain
    ) external returns (address) {
        return address(
            new RawReturnToken(
                nameReturnData,
                symbolReturnData,
                decimalsReturnData,
                eip5267DomainReturnData,
                revertName,
                revertSymbol,
                revertDecimals,
                revertEip5267Domain
            )
        );
    }

    function legacyQuery(IERC20 token) external view returns (RegressionTokenResponse memory res) {
        try token.name() returns (string memory name) {
            res.hasName = true;
            res.name = name;
        } catch {}

        try token.symbol() returns (string memory symbol) {
            res.hasSymbol = true;
            res.symbol = symbol;
        } catch {}

        try token.decimals() returns (uint8 decimals) {
            res.decimals = decimals;
        } catch {}

        try IERC20Permit(address(token)).eip712Domain() returns (Eip5267Domain memory eip5267Domain) {
            res.hasEip5267Domain = true;
            res.eip5267Domain = eip5267Domain;
        } catch {}
    }
}

contract RawReturnToken {
    bytes private _nameReturnData;
    bytes private _symbolReturnData;
    bytes private _decimalsReturnData;
    bytes private _eip5267DomainReturnData;

    bool private _revertName;
    bool private _revertSymbol;
    bool private _revertDecimals;
    bool private _revertEip5267Domain;

    constructor(
        bytes memory nameReturnData,
        bytes memory symbolReturnData,
        bytes memory decimalsReturnData,
        bytes memory eip5267DomainReturnData,
        bool revertName,
        bool revertSymbol,
        bool revertDecimals,
        bool revertEip5267Domain
    ) {
        _nameReturnData = nameReturnData;
        _symbolReturnData = symbolReturnData;
        _decimalsReturnData = decimalsReturnData;
        _eip5267DomainReturnData = eip5267DomainReturnData;
        _revertName = revertName;
        _revertSymbol = revertSymbol;
        _revertDecimals = revertDecimals;
        _revertEip5267Domain = revertEip5267Domain;
    }

    function name() external view returns (string memory) {
        if (_revertName) revert();

        bytes memory data = _nameReturnData;
        assembly ("memory-safe") {
            return(add(data, 0x20), mload(data))
        }
    }

    function symbol() external view returns (string memory) {
        if (_revertSymbol) revert();

        bytes memory data = _symbolReturnData;
        assembly ("memory-safe") {
            return(add(data, 0x20), mload(data))
        }
    }

    function decimals() external view returns (uint8) {
        if (_revertDecimals) revert();

        bytes memory data = _decimalsReturnData;
        assembly ("memory-safe") {
            return(add(data, 0x20), mload(data))
        }
    }

    function eip712Domain() external view returns (Eip5267Domain memory) {
        if (_revertEip5267Domain) revert();

        bytes memory data = _eip5267DomainReturnData;
        assembly ("memory-safe") {
            return(add(data, 0x20), mload(data))
        }
    }
}
