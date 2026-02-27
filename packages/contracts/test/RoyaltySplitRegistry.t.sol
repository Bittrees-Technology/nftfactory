// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {RoyaltySplitRegistry} from "../src/core/RoyaltySplitRegistry.sol";

contract RoyaltySplitRegistryTest is Test {
    RoyaltySplitRegistry internal splitter;

    address internal admin = address(0xA11CE);
    address internal collection = address(0xC0DE);
    address internal recipientA = address(0xAAA1);
    address internal recipientB = address(0xBBB2);

    function setUp() external {
        vm.prank(admin);
        splitter = new RoyaltySplitRegistry(admin);
    }

    function testSetCollectionSplits() external {
        RoyaltySplitRegistry.Split[] memory splits = new RoyaltySplitRegistry.Split[](2);
        splits[0] = RoyaltySplitRegistry.Split({account: recipientA, bps: 7000});
        splits[1] = RoyaltySplitRegistry.Split({account: recipientB, bps: 3000});

        vm.prank(admin);
        splitter.setCollectionSplits(collection, splits);

        RoyaltySplitRegistry.Split[] memory stored = splitter.getCollectionSplits(collection);
        assertEq(stored.length, 2);
        assertEq(stored[0].account, recipientA);
        assertEq(stored[0].bps, 7000);
        assertEq(stored[1].account, recipientB);
        assertEq(stored[1].bps, 3000);
    }

    function testSetTokenSplits() external {
        RoyaltySplitRegistry.Split[] memory splits = new RoyaltySplitRegistry.Split[](1);
        splits[0] = RoyaltySplitRegistry.Split({account: recipientA, bps: 10_000});

        vm.prank(admin);
        splitter.setTokenSplits(collection, 42, splits);

        RoyaltySplitRegistry.Split[] memory stored = splitter.getTokenSplits(collection, 42);
        assertEq(stored.length, 1);
        assertEq(stored[0].account, recipientA);
        assertEq(stored[0].bps, 10_000);
    }

    function testSplitsMustSumTo10000() external {
        RoyaltySplitRegistry.Split[] memory splits = new RoyaltySplitRegistry.Split[](1);
        splits[0] = RoyaltySplitRegistry.Split({account: recipientA, bps: 5000});

        vm.prank(admin);
        vm.expectRevert(RoyaltySplitRegistry.InvalidSplit.selector);
        splitter.setCollectionSplits(collection, splits);
    }

    function testZeroAddressSplitReverts() external {
        RoyaltySplitRegistry.Split[] memory splits = new RoyaltySplitRegistry.Split[](1);
        splits[0] = RoyaltySplitRegistry.Split({account: address(0), bps: 10_000});

        vm.prank(admin);
        vm.expectRevert(RoyaltySplitRegistry.InvalidSplit.selector);
        splitter.setCollectionSplits(collection, splits);
    }

    function testOverwriteCollectionSplits() external {
        RoyaltySplitRegistry.Split[] memory splits1 = new RoyaltySplitRegistry.Split[](2);
        splits1[0] = RoyaltySplitRegistry.Split({account: recipientA, bps: 5000});
        splits1[1] = RoyaltySplitRegistry.Split({account: recipientB, bps: 5000});
        vm.prank(admin);
        splitter.setCollectionSplits(collection, splits1);

        RoyaltySplitRegistry.Split[] memory splits2 = new RoyaltySplitRegistry.Split[](1);
        splits2[0] = RoyaltySplitRegistry.Split({account: recipientA, bps: 10_000});
        vm.prank(admin);
        splitter.setCollectionSplits(collection, splits2);

        RoyaltySplitRegistry.Split[] memory stored = splitter.getCollectionSplits(collection);
        assertEq(stored.length, 1);
    }

    function testNonOwnerCannotSetSplits() external {
        RoyaltySplitRegistry.Split[] memory splits = new RoyaltySplitRegistry.Split[](1);
        splits[0] = RoyaltySplitRegistry.Split({account: recipientA, bps: 10_000});

        vm.expectRevert();
        splitter.setCollectionSplits(collection, splits);

        vm.expectRevert();
        splitter.setTokenSplits(collection, 1, splits);
    }
}
