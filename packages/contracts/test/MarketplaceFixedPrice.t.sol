// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {NftFactoryRegistry} from "../src/core/NftFactoryRegistry.sol";
import {MarketplaceFixedPrice} from "../src/core/MarketplaceFixedPrice.sol";
import {SharedMint721} from "../src/token/SharedMint721.sol";
import {SubnameRegistrar} from "../src/core/SubnameRegistrar.sol";

contract MarketplaceFixedPriceTest is Test {
    NftFactoryRegistry internal registry;
    MarketplaceFixedPrice internal marketplace;
    SubnameRegistrar internal registrar;
    SharedMint721 internal nft;

    address internal admin = address(0xA11CE);
    address internal treasury = address(0xBEEF);
    address internal seller = address(0xCAFE);
    address internal buyer = address(0xBAAD);

    function setUp() external {
        vm.startPrank(admin);
        registry = new NftFactoryRegistry(admin, treasury);
        marketplace = new MarketplaceFixedPrice(admin, address(registry));
        registrar = new SubnameRegistrar(admin, treasury);
        nft = new SharedMint721(admin, address(registrar), "TestNFT", "TNFT");
        registrar.setAuthorizedMinter(address(nft), true);
        vm.stopPrank();

        vm.deal(seller, 10 ether);
        vm.deal(buyer, 10 ether);
    }

    function _publishAndList(uint256 price) internal returns (uint256 listingId) {
        vm.startPrank(seller);
        uint256 tokenId = nft.publish("", "ipfs://test");
        nft.safeTransferFrom(seller, seller, tokenId); // no-op to confirm ownership
        marketplace.createListing(address(nft), tokenId, 1, "ERC721", address(0), price);
        listingId = marketplace.nextListingId() - 1;
        vm.stopPrank();
    }

    function testCreateListing() external {
        vm.prank(seller);
        uint256 tokenId = nft.publish("", "ipfs://test");

        vm.prank(seller);
        marketplace.createListing(address(nft), tokenId, 1, "ERC721", address(0), 0.1 ether);

        (address s, address n, uint256 tid,, string memory std,, uint256 p, bool active) = marketplace.listings(0);
        assertEq(s, seller);
        assertEq(n, address(nft));
        assertEq(tid, tokenId);
        assertEq(std, "ERC721");
        assertEq(p, 0.1 ether);
        assertTrue(active);
    }

    function testCancelListing() external {
        uint256 listingId = _publishAndList(0.1 ether);

        vm.prank(seller);
        marketplace.cancelListing(listingId);

        (,,,,,,, bool active) = marketplace.listings(listingId);
        assertFalse(active);
    }

    function testCancelListingRevertsForNonSeller() external {
        uint256 listingId = _publishAndList(0.1 ether);

        vm.prank(buyer);
        vm.expectRevert(MarketplaceFixedPrice.NotSeller.selector);
        marketplace.cancelListing(listingId);
    }

    function testBuyWithETH() external {
        vm.prank(seller);
        uint256 tokenId = nft.publish("", "ipfs://test");

        vm.prank(seller);
        marketplace.createListing(address(nft), tokenId, 1, "ERC721", address(0), 0.1 ether);

        uint256 sellerBalBefore = seller.balance;

        vm.prank(buyer);
        marketplace.buy{value: 0.1 ether}(0);

        assertEq(nft.ownerOf(tokenId), buyer);
        assertEq(seller.balance, sellerBalBefore + 0.1 ether);

        (,,,,,,, bool active) = marketplace.listings(0);
        assertFalse(active);
    }

    function testBuyRevertsWithWrongPayment() external {
        vm.prank(seller);
        uint256 tokenId = nft.publish("", "ipfs://test");

        vm.prank(seller);
        marketplace.createListing(address(nft), tokenId, 1, "ERC721", address(0), 0.1 ether);

        vm.prank(buyer);
        vm.expectRevert(MarketplaceFixedPrice.PaymentMismatch.selector);
        marketplace.buy{value: 0.05 ether}(0);
    }

    function testBuyRevertsWhenNotActive() external {
        uint256 listingId = _publishAndList(0.1 ether);

        vm.prank(seller);
        marketplace.cancelListing(listingId);

        vm.prank(buyer);
        vm.expectRevert(MarketplaceFixedPrice.NotActive.selector);
        marketplace.buy{value: 0.1 ether}(listingId);
    }

    function testBlockedSellerCannotList() external {
        vm.prank(admin);
        registry.setBlocked(seller, true);

        vm.prank(seller);
        uint256 tokenId = nft.publish("", "ipfs://test");

        vm.prank(seller);
        vm.expectRevert(MarketplaceFixedPrice.Sanctioned.selector);
        marketplace.createListing(address(nft), tokenId, 1, "ERC721", address(0), 0.1 ether);
    }

    function testBlockedBuyerCannotBuy() external {
        vm.prank(seller);
        uint256 tokenId = nft.publish("", "ipfs://test");

        vm.prank(seller);
        marketplace.createListing(address(nft), tokenId, 1, "ERC721", address(0), 0.1 ether);

        vm.prank(admin);
        registry.setBlocked(buyer, true);

        vm.prank(buyer);
        vm.expectRevert(MarketplaceFixedPrice.Sanctioned.selector);
        marketplace.buy{value: 0.1 ether}(0);
    }

    function testBlockedCollectionCannotList() external {
        vm.prank(admin);
        marketplace.setBlockedCollection(address(nft), true);

        vm.prank(seller);
        uint256 tokenId = nft.publish("", "ipfs://test");

        vm.prank(seller);
        vm.expectRevert(MarketplaceFixedPrice.Sanctioned.selector);
        marketplace.createListing(address(nft), tokenId, 1, "ERC721", address(0), 0.1 ether);
    }

    function testUnsupportedStandardReverts() external {
        vm.prank(seller);
        uint256 tokenId = nft.publish("", "ipfs://test");

        vm.prank(seller);
        vm.expectRevert(MarketplaceFixedPrice.UnsupportedStandard.selector);
        marketplace.createListing(address(nft), tokenId, 1, "ERC999", address(0), 0.1 ether);
    }

    function testERC721AmountMustBeOne() external {
        vm.prank(seller);
        uint256 tokenId = nft.publish("", "ipfs://test");

        vm.prank(seller);
        vm.expectRevert(MarketplaceFixedPrice.InvalidAmount.selector);
        marketplace.createListing(address(nft), tokenId, 2, "ERC721", address(0), 0.1 ether);
    }

    function testNextListingIdIncrements() external {
        assertEq(marketplace.nextListingId(), 0);

        _publishAndList(0.1 ether);
        assertEq(marketplace.nextListingId(), 1);

        _publishAndList(0.2 ether);
        assertEq(marketplace.nextListingId(), 2);
    }
}
