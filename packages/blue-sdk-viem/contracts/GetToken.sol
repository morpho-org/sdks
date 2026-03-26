// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import {IERC20Permit, Eip5267Domain} from "./interfaces/IERC20Permit.sol";
import {IERC20} from "./interfaces/IERC20.sol";
import {IWstEth} from "./interfaces/IWstEth.sol";

struct TokenResponse {
    uint256 decimals;
    bool hasSymbol;
    string symbol;
    bool hasName;
    string name;
    uint256 stEthPerWstEth;
    Eip5267Domain eip5267Domain;
    bool hasEip5267Domain;
}

contract GetToken {
    uint256 private constant STRING_HEAD_SIZE = 0x40;
    uint256 private constant EIP5267_DOMAIN_HEAD_SIZE = 0xe0;

    function query(IERC20 token, bool isWstEth) external view returns (TokenResponse memory res) {
        (bool hasName, string memory name) = _queryString(address(token), abi.encodeCall(IERC20.name, ()));
        if (hasName) {
            res.hasName = true;
            res.name = name;
        }

        (bool hasSymbol, string memory symbol) = _queryString(address(token), abi.encodeCall(IERC20.symbol, ()));
        if (hasSymbol) {
            res.hasSymbol = true;
            res.symbol = symbol;
        }

        (bool hasDecimals, uint8 decimals) = _queryUint8(address(token), abi.encodeCall(IERC20.decimals, ()));
        if (hasDecimals) {
            res.decimals = decimals;
        }

        if (isWstEth) res.stEthPerWstEth = IWstEth(address(token)).stEthPerToken();

        (bool hasEip5267Domain, Eip5267Domain memory eip5267Domain) = _queryEip5267Domain(address(token));
        if (hasEip5267Domain) {
            res.hasEip5267Domain = true;
            res.eip5267Domain = eip5267Domain;
        }
    }

    function _queryString(
        address target,
        bytes memory callData
    ) private view returns (bool success, string memory value) {
        bytes memory returnData;
        (success, returnData) = target.staticcall(callData);
        if (!success) return (false, "");

        if (_isValidStringReturnData(returnData)) {
            value = abi.decode(returnData, (string));
            return (true, value);
        }

        if (returnData.length != 0x20) return (false, "");

        return (true, _bytes32ToString(bytes32(_loadWord(returnData, 0))));
    }

    function _queryUint8(address target, bytes memory callData) private view returns (bool success, uint8 value) {
        bytes memory returnData;
        (success, returnData) = target.staticcall(callData);
        if (!success || returnData.length != 0x20) return (false, 0);

        uint256 decoded = _loadWord(returnData, 0);
        if (decoded > type(uint8).max) return (false, 0);

        return (true, uint8(decoded));
    }

    function _queryEip5267Domain(address target) private view returns (bool success, Eip5267Domain memory value) {
        bytes memory returnData;
        (success, returnData) = target.staticcall(abi.encodeCall(IERC20Permit.eip712Domain, ()));
        if (!success || !_isValidEip5267DomainReturnData(returnData)) return (false, value);

        // Work around a Solidity via-IR decoding regression hit by valid EIP-5267 domains
        // such as Treehouse ETH (tETH) on mainnet. Decoding raw returndata locally avoids
        // the deployless helper revert while keeping optional metadata reads best-effort.
        (
            bytes1 fields,
            string memory name,
            string memory version,
            uint256 chainId,
            address verifyingContract,
            bytes32 salt,
            uint256[] memory extensions
        ) = abi.decode(returnData, (bytes1, string, string, uint256, address, bytes32, uint256[]));

        value = Eip5267Domain({
            fields: fields,
            name: name,
            version: version,
            chainId: chainId,
            verifyingContract: verifyingContract,
            salt: salt,
            extensions: extensions
        });
        success = true;
    }

    function _isValidStringReturnData(bytes memory returnData) private pure returns (bool) {
        if (returnData.length < STRING_HEAD_SIZE) return false;

        uint256 offset = _loadWord(returnData, 0);
        if (offset != 0x20) return false;

        return _isValidStringTail(returnData, offset, 0x20);
    }

    function _isValidEip5267DomainReturnData(bytes memory returnData) private pure returns (bool) {
        if (returnData.length < EIP5267_DOMAIN_HEAD_SIZE) return false;

        uint256 fieldsWord = _loadWord(returnData, 0);
        if (fieldsWord << 8 != 0) return false;

        uint256 verifyingContractWord = _loadWord(returnData, 0x80);
        if (verifyingContractWord >> 160 != 0) return false;

        uint256 nameOffset = _loadWord(returnData, 0x20);
        uint256 versionOffset = _loadWord(returnData, 0x40);
        uint256 extensionsOffset = _loadWord(returnData, 0xc0);

        if (!_isValidStringTail(returnData, nameOffset, EIP5267_DOMAIN_HEAD_SIZE)) return false;
        if (!_isValidStringTail(returnData, versionOffset, EIP5267_DOMAIN_HEAD_SIZE)) return false;
        return _isValidUintArrayTail(returnData, extensionsOffset, EIP5267_DOMAIN_HEAD_SIZE);
    }

    function _isValidStringTail(
        bytes memory returnData,
        uint256 offset,
        uint256 minimumOffset
    ) private pure returns (bool) {
        if (!_isValidDynamicOffset(returnData.length, offset, minimumOffset)) return false;

        uint256 length = _loadWord(returnData, offset);
        unchecked {
            return length <= returnData.length - offset - 0x20;
        }
    }

    function _isValidUintArrayTail(
        bytes memory returnData,
        uint256 offset,
        uint256 minimumOffset
    ) private pure returns (bool) {
        if (!_isValidDynamicOffset(returnData.length, offset, minimumOffset)) return false;

        uint256 length = _loadWord(returnData, offset);
        unchecked {
            return length <= (returnData.length - offset - 0x20) / 0x20;
        }
    }

    function _isValidDynamicOffset(
        uint256 totalLength,
        uint256 offset,
        uint256 minimumOffset
    ) private pure returns (bool) {
        if (offset < minimumOffset || offset & 0x1f != 0) return false;
        unchecked {
            return offset <= totalLength - 0x20;
        }
    }

    function _loadWord(bytes memory data, uint256 offset) private pure returns (uint256 value) {
        assembly ("memory-safe") {
            value := mload(add(add(data, 0x20), offset))
        }
    }

    function _bytes32ToString(bytes32 value) private pure returns (string memory) {
        uint256 length;
        while (length < 0x20 && value[length] != 0) {
            unchecked {
                ++length;
            }
        }

        bytes memory buffer = new bytes(length);
        for (uint256 i; i < length; ) {
            buffer[i] = value[i];
            unchecked {
                ++i;
            }
        }

        return string(buffer);
    }
}
