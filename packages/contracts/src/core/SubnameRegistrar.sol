// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Owned} from "../utils/Owned.sol";

contract SubnameRegistrar is Owned {
    uint256 public constant SUBNAME_FEE = 0.001 ether;
    uint256 public constant RENEWAL_PERIOD = 365 days;

    address public treasury;
    mapping(address => bool) public authorizedMinter;

    struct SubnameRecord {
        address owner;
        uint256 expiresAt;
        uint256 mintedCount;
        bool exists;
    }

    mapping(bytes32 => SubnameRecord) public subnames;
    mapping(address => bytes32[]) public ownerSubnames;
    /// @dev O(1) lookup: ownerSubnameIndex[owner][key] stores the array index + 1 (0 = not present).
    mapping(address => mapping(bytes32 => uint256)) private _ownerSubnameIndex;

    event SubnameRegistered(string indexed label, address indexed owner, uint256 expiresAt);
    event SubnameRenewed(string indexed label, uint256 expiresAt);
    event MintCountUpdated(string indexed label, uint256 mintedCount);
    event AuthorizedMinterUpdated(address indexed minter, bool authorized);

    error WrongFee();
    error NotSubnameOwner();
    error UnknownSubname();
    error NotAuthorizedMinter();
    error SubnameActive();
    error InvalidLabel();
    error InvalidTreasury();
    error RenewalNotRequired();
    error TreasuryTransferFailed();

    constructor(address initialOwner, address initialTreasury) Owned(initialOwner) {
        if (initialTreasury == address(0)) revert InvalidTreasury();
        treasury = initialTreasury;
    }

    function registerSubname(string calldata label) external payable {
        if (msg.value != SUBNAME_FEE) revert WrongFee();
        _validateLabel(label);

        bytes32 key = keccak256(bytes(label));
        SubnameRecord storage rec = subnames[key];

        if (rec.exists && rec.owner != msg.sender && rec.expiresAt > block.timestamp) revert SubnameActive();

        if (rec.exists && rec.owner != msg.sender) {
            _removeOwnerSubname(rec.owner, key);
        }

        rec.owner = msg.sender;
        rec.expiresAt = block.timestamp + RENEWAL_PERIOD;
        if (_ownerSubnameIndex[msg.sender][key] == 0) {
            ownerSubnames[msg.sender].push(key);
            _ownerSubnameIndex[msg.sender][key] = ownerSubnames[msg.sender].length;
        }
        if (!rec.exists) {
            rec.exists = true;
        }

        (bool ok,) = treasury.call{value: msg.value}("");
        if (!ok) revert TreasuryTransferFailed();

        emit SubnameRegistered(label, msg.sender, rec.expiresAt);
    }

    function renewSubname(string calldata label) external payable {
        if (msg.value != SUBNAME_FEE) revert WrongFee();
        _validateLabel(label);

        bytes32 key = keccak256(bytes(label));
        SubnameRecord storage rec = subnames[key];
        if (!rec.exists) revert UnknownSubname();
        if (rec.owner != msg.sender) revert NotSubnameOwner();

        // Once a subname has been used for minting, there is no renewal path today.
        if (rec.mintedCount > 0) revert RenewalNotRequired();

        rec.expiresAt = block.timestamp + RENEWAL_PERIOD;

        (bool ok,) = treasury.call{value: msg.value}("");
        if (!ok) revert TreasuryTransferFailed();

        emit SubnameRenewed(label, rec.expiresAt);
    }

    function setAuthorizedMinter(address minter, bool authorized) external onlyOwner {
        authorizedMinter[minter] = authorized;
        emit AuthorizedMinterUpdated(minter, authorized);
    }

    function recordMint(string calldata label) external {
        if (!authorizedMinter[msg.sender] && msg.sender != owner) revert NotAuthorizedMinter();
        _validateLabel(label);
        bytes32 key = keccak256(bytes(label));
        SubnameRecord storage rec = subnames[key];
        if (!rec.exists) revert UnknownSubname();
        rec.mintedCount += 1;
        emit MintCountUpdated(label, rec.mintedCount);
    }

    function _removeOwnerSubname(address subnameOwner, bytes32 key) internal {
        uint256 indexPlusOne = _ownerSubnameIndex[subnameOwner][key];
        if (indexPlusOne == 0) return;

        bytes32[] storage keys = ownerSubnames[subnameOwner];
        uint256 lastIndex = keys.length - 1;
        uint256 removeIndex = indexPlusOne - 1;

        if (removeIndex != lastIndex) {
            bytes32 lastKey = keys[lastIndex];
            keys[removeIndex] = lastKey;
            _ownerSubnameIndex[subnameOwner][lastKey] = indexPlusOne;
        }
        keys.pop();
        _ownerSubnameIndex[subnameOwner][key] = 0;
    }

    function _validateLabel(string calldata label) internal pure {
        bytes calldata raw = bytes(label);
        uint256 length = raw.length;
        if (length == 0 || length > 63) revert InvalidLabel();

        for (uint256 i = 0; i < length; i++) {
            bytes1 char = raw[i];
            bool isDigit = char >= 0x30 && char <= 0x39;
            bool isLower = char >= 0x61 && char <= 0x7a;
            bool isHyphen = char == 0x2d;
            if (!isDigit && !isLower && !isHyphen) revert InvalidLabel();
            if ((i == 0 || i == length - 1) && isHyphen) revert InvalidLabel();
        }
    }
}
