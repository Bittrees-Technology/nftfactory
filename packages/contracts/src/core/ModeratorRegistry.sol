// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Owned} from "../utils/Owned.sol";

contract ModeratorRegistry is Owned {
    struct ModeratorRecord {
        address account;
        string label;
        bool active;
    }

    mapping(address => ModeratorRecord) public moderators;
    mapping(address => bool) public knownModerator;
    address[] public moderatorAccounts;

    event ModeratorUpdated(address indexed account, string label, bool active);

    error InvalidModerator();

    constructor(address initialOwner) Owned(initialOwner) {}

    function setModerator(address account, string calldata label, bool active) external onlyOwner {
        if (account == address(0)) revert InvalidModerator();

        if (!knownModerator[account]) {
            knownModerator[account] = true;
            moderatorAccounts.push(account);
        }

        moderators[account] = ModeratorRecord({account: account, label: label, active: active});
        emit ModeratorUpdated(account, label, active);
    }

    function moderatorCount() external view returns (uint256) {
        return moderatorAccounts.length;
    }

    function getModeratorAt(uint256 index) external view returns (ModeratorRecord memory) {
        return moderators[moderatorAccounts[index]];
    }

    function isModerator(address account) external view returns (bool) {
        return moderators[account].active;
    }

    function allModerators() external view returns (ModeratorRecord[] memory records) {
        uint256 length = moderatorAccounts.length;
        records = new ModeratorRecord[](length);
        for (uint256 i = 0; i < length; i++) {
            records[i] = moderators[moderatorAccounts[i]];
        }
    }
}
