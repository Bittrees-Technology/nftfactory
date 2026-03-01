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

    constructor(address initialOwner, address initialTreasury) Owned(initialOwner) {
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
        if (!_ownerHasSubname(msg.sender, key)) {
            ownerSubnames[msg.sender].push(key);
        }
        if (!rec.exists) {
            rec.exists = true;
        }

        (bool ok,) = treasury.call{value: msg.value}("");
        require(ok, "TREASURY_TRANSFER_FAILED");

        emit SubnameRegistered(label, msg.sender, rec.expiresAt);
    }

    function renewSubname(string calldata label) external payable {
        if (msg.value != SUBNAME_FEE) revert WrongFee();
        _validateLabel(label);

        bytes32 key = keccak256(bytes(label));
        SubnameRecord storage rec = subnames[key];
        if (!rec.exists) revert UnknownSubname();
        if (rec.owner != msg.sender) revert NotSubnameOwner();

        // Renewal is required only for subnames with no minted NFTs.
        if (rec.mintedCount == 0) {
            rec.expiresAt = block.timestamp + RENEWAL_PERIOD;
        }

        (bool ok,) = treasury.call{value: msg.value}("");
        require(ok, "TREASURY_TRANSFER_FAILED");

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

    function _ownerHasSubname(address subnameOwner, bytes32 key) internal view returns (bool) {
        bytes32[] storage keys = ownerSubnames[subnameOwner];
        for (uint256 i = 0; i < keys.length; i++) {
            if (keys[i] == key) return true;
        }
        return false;
    }

    function _removeOwnerSubname(address subnameOwner, bytes32 key) internal {
        bytes32[] storage keys = ownerSubnames[subnameOwner];
        for (uint256 i = 0; i < keys.length; i++) {
            if (keys[i] == key) {
                keys[i] = keys[keys.length - 1];
                keys.pop();
                return;
            }
        }
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
