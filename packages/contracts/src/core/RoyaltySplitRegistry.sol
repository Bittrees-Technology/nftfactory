// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Owned} from "../utils/Owned.sol";

interface ICollectionOwner {
    function owner() external view returns (address);
}

contract RoyaltySplitRegistry is Owned {
    struct Split {
        address account;
        uint96 bps;
    }

    mapping(address => Split[]) public collectionSplits;
    mapping(address => mapping(uint256 => Split[])) public tokenSplits;

    event CollectionSplitsSet(address indexed collection, uint256 count);
    event TokenSplitsSet(address indexed collection, uint256 indexed tokenId, uint256 count);

    error InvalidSplit();
    error UnauthorizedCollectionManager();

    constructor(address initialOwner) Owned(initialOwner) {}

    function setCollectionSplits(address collection, Split[] calldata splits) external {
        _requireCollectionManager(collection);
        _validateSplits(splits);
        delete collectionSplits[collection];
        for (uint256 i = 0; i < splits.length; i++) {
            collectionSplits[collection].push(splits[i]);
        }
        emit CollectionSplitsSet(collection, splits.length);
    }

    function setTokenSplits(address collection, uint256 tokenId, Split[] calldata splits) external {
        _requireCollectionManager(collection);
        _validateSplits(splits);
        delete tokenSplits[collection][tokenId];
        for (uint256 i = 0; i < splits.length; i++) {
            tokenSplits[collection][tokenId].push(splits[i]);
        }
        emit TokenSplitsSet(collection, tokenId, splits.length);
    }

    function getCollectionSplits(address collection) external view returns (Split[] memory) {
        return collectionSplits[collection];
    }

    function getTokenSplits(address collection, uint256 tokenId) external view returns (Split[] memory) {
        return tokenSplits[collection][tokenId];
    }

    function _validateSplits(Split[] calldata splits) internal pure {
        if (splits.length == 0) return;
        uint256 total;
        for (uint256 i = 0; i < splits.length; i++) {
            if (splits[i].account == address(0)) revert InvalidSplit();
            total += splits[i].bps;
        }
        if (total != 10_000) revert InvalidSplit();
    }

    function _requireCollectionManager(address collection) internal view {
        if (msg.sender == owner) return;

        try ICollectionOwner(collection).owner() returns (address collectionOwner) {
            if (collectionOwner == msg.sender) return;
        } catch {}

        revert UnauthorizedCollectionManager();
    }
}
