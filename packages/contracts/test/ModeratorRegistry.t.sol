// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ModeratorRegistry} from "../src/core/ModeratorRegistry.sol";

contract ModeratorRegistryTest is Test {
    ModeratorRegistry internal registry;

    address internal admin = address(0xA11CE);
    address internal moderator = address(0xBEEF);
    address internal otherModerator = address(0xCAFE);

    function setUp() external {
        vm.prank(admin);
        registry = new ModeratorRegistry(admin);
    }

    function testOwnerCanAddModerator() external {
        vm.prank(admin);
        registry.setModerator(moderator, "Core Mod", true);

        (address account, string memory label, bool active) = registry.moderators(moderator);
        assertEq(account, moderator);
        assertEq(label, "Core Mod");
        assertTrue(active);
        assertEq(registry.moderatorCount(), 1);
        assertTrue(registry.isModerator(moderator));
    }

    function testOwnerCanDisableModerator() external {
        vm.startPrank(admin);
        registry.setModerator(moderator, "Core Mod", true);
        registry.setModerator(moderator, "Core Mod", false);
        vm.stopPrank();

        (, , bool active) = registry.moderators(moderator);
        assertFalse(active);
        assertFalse(registry.isModerator(moderator));
        assertEq(registry.moderatorCount(), 1);
    }

    function testAllModeratorsReturnsKnownRecords() external {
        vm.startPrank(admin);
        registry.setModerator(moderator, "Core Mod", true);
        registry.setModerator(otherModerator, "Backup Mod", true);
        vm.stopPrank();

        ModeratorRegistry.ModeratorRecord[] memory records = registry.allModerators();
        assertEq(records.length, 2);
        assertEq(records[0].account, moderator);
        assertEq(records[1].account, otherModerator);
    }

    function testSetModeratorRevertsForZeroAddress() external {
        vm.prank(admin);
        vm.expectRevert(ModeratorRegistry.InvalidModerator.selector);
        registry.setModerator(address(0), "Bad", true);
    }
}
