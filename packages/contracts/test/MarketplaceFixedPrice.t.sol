// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {NftFactoryRegistry} from "../src/core/NftFactoryRegistry.sol";
import {MarketplaceFixedPrice} from "../src/core/MarketplaceFixedPrice.sol";
import {SharedMint721} from "../src/token/SharedMint721.sol";
import {SharedMint1155} from "../src/token/SharedMint1155.sol";
import {SubnameRegistrar} from "../src/core/SubnameRegistrar.sol";

contract MarketplaceFixedPriceTest is Test {
    NftFactoryRegistry internal registry;
    MarketplaceFixedPrice internal marketplace;
    SubnameRegistrar internal registrar;
    SharedMint721 internal nft;
    SharedMint1155 internal multi;

    address internal admin = address(0xA11CE);
    address internal treasury = address(0xBEEF);
    address internal seller = address(0xCAFE);
    address internal unapprovedSeller = address(0xC0DE);
    address internal buyer = address(0xBAAD);

    function setUp() external {
        vm.startPrank(admin);
        registry = new NftFactoryRegistry(admin, treasury);
        marketplace = new MarketplaceFixedPrice(admin, address(registry));
        registrar = new SubnameRegistrar(admin, treasury);
        nft = new SharedMint721(admin, address(registrar), "TestNFT", "TNFT");
        multi = new SharedMint1155(admin, address(registrar), "TestMulti", "TM");
        registrar.setAuthorizedMinter(address(nft), true);
        registrar.setAuthorizedMinter(address(multi), true);
        vm.stopPrank();

        vm.deal(seller, 10 ether);
        vm.deal(unapprovedSeller, 10 ether);
        vm.deal(buyer, 10 ether);

        vm.prank(seller);
        nft.setApprovalForAll(address(marketplace), true);

        vm.prank(seller);
        multi.setApprovalForAll(address(marketplace), true);
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

    function testRegistryBlockedCollectionCannotList() external {
        vm.prank(admin);
        registry.setBlocked(address(nft), true);

        vm.prank(seller);
        uint256 tokenId = nft.publish("", "ipfs://test");

        vm.prank(seller);
        vm.expectRevert(MarketplaceFixedPrice.Sanctioned.selector);
        marketplace.createListing(address(nft), tokenId, 1, "ERC721", address(0), 0.1 ether);
    }

    function testRegistryBlockedCollectionCannotBuy() external {
        vm.prank(seller);
        uint256 tokenId = nft.publish("", "ipfs://test");

        vm.prank(seller);
        marketplace.createListing(address(nft), tokenId, 1, "ERC721", address(0), 0.1 ether);

        vm.prank(admin);
        registry.setBlocked(address(nft), true);

        vm.prank(buyer);
        vm.expectRevert(MarketplaceFixedPrice.Sanctioned.selector);
        marketplace.buy{value: 0.1 ether}(0);
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

    function testCreateListingRevertsWithoutApproval() external {
        vm.prank(unapprovedSeller);
        uint256 tokenId = nft.publish("", "ipfs://test");

        vm.prank(unapprovedSeller);
        vm.expectRevert(MarketplaceFixedPrice.NotApproved.selector);
        marketplace.createListing(address(nft), tokenId, 1, "ERC721", address(0), 0.1 ether);
    }

    function testCreateListingERC1155() external {
        vm.prank(seller);
        uint256 tokenId = multi.publish("", 5, "ipfs://multi");

        vm.prank(seller);
        marketplace.createListing(address(multi), tokenId, 3, "ERC1155", address(0), 0.1 ether);

        (address s, address n, uint256 tid, uint256 amt, string memory std,, uint256 p, bool active) = marketplace.listings(0);
        assertEq(s, seller);
        assertEq(n, address(multi));
        assertEq(tid, tokenId);
        assertEq(amt, 3);
        assertEq(std, "ERC1155");
        assertEq(p, 0.1 ether);
        assertTrue(active);
    }

    function testCreateListingERC1155RevertsWithoutApproval() external {
        vm.prank(unapprovedSeller);
        uint256 tokenId = multi.publish("", 5, "ipfs://multi");

        vm.prank(unapprovedSeller);
        vm.expectRevert(MarketplaceFixedPrice.NotApproved.selector);
        marketplace.createListing(address(multi), tokenId, 3, "ERC1155", address(0), 0.1 ether);
    }

    function testCreateListingERC1155AmountMustBePositive() external {
        vm.prank(seller);
        uint256 tokenId = multi.publish("", 5, "ipfs://multi");

        vm.prank(seller);
        vm.expectRevert(MarketplaceFixedPrice.InvalidAmount.selector);
        marketplace.createListing(address(multi), tokenId, 0, "ERC1155", address(0), 0.1 ether);
    }

    function testCreateListingERC1155RevertsInsufficientBalance() external {
        vm.prank(seller);
        uint256 tokenId = multi.publish("", 2, "ipfs://multi");

        vm.prank(seller);
        vm.expectRevert(MarketplaceFixedPrice.NotSeller.selector);
        marketplace.createListing(address(multi), tokenId, 3, "ERC1155", address(0), 0.1 ether);
    }

    function testBuyERC1155WithETH() external {
        vm.prank(seller);
        uint256 tokenId = multi.publish("", 8, "ipfs://multi");

        vm.prank(seller);
        marketplace.createListing(address(multi), tokenId, 5, "ERC1155", address(0), 0.1 ether);

        uint256 sellerBalBefore = seller.balance;

        vm.prank(buyer);
        marketplace.buy{value: 0.1 ether}(0);

        assertEq(multi.balanceOf(tokenId, seller), 3);
        assertEq(multi.balanceOf(tokenId, buyer), 5);
        assertEq(seller.balance, sellerBalBefore + 0.1 ether);

        (,,,,,,, bool active) = marketplace.listings(0);
        assertFalse(active);
    }

    function testBuyRevertsWhenSellerNoLongerOwnsERC721() external {
        vm.prank(seller);
        uint256 tokenId = nft.publish("", "ipfs://test");

        vm.prank(seller);
        marketplace.createListing(address(nft), tokenId, 1, "ERC721", address(0), 0.1 ether);

        vm.prank(seller);
        nft.safeTransferFrom(seller, unapprovedSeller, tokenId);

        vm.prank(buyer);
        vm.expectRevert(MarketplaceFixedPrice.NotSeller.selector);
        marketplace.buy{value: 0.1 ether}(0);

        (,,,,,,, bool active) = marketplace.listings(0);
        assertTrue(active);
    }

    function testBuySucceedsAfterERC721OwnershipRestored() external {
        vm.prank(seller);
        uint256 tokenId = nft.publish("", "ipfs://test");

        vm.prank(seller);
        marketplace.createListing(address(nft), tokenId, 1, "ERC721", address(0), 0.1 ether);

        vm.prank(seller);
        nft.safeTransferFrom(seller, unapprovedSeller, tokenId);

        vm.prank(buyer);
        vm.expectRevert(MarketplaceFixedPrice.NotSeller.selector);
        marketplace.buy{value: 0.1 ether}(0);

        vm.prank(unapprovedSeller);
        nft.safeTransferFrom(unapprovedSeller, seller, tokenId);

        vm.prank(buyer);
        marketplace.buy{value: 0.1 ether}(0);

        assertEq(nft.ownerOf(tokenId), buyer);
        (,,,,,,, bool active) = marketplace.listings(0);
        assertFalse(active);
    }

    function testBuyRevertsWhenERC721ApprovalRevoked() external {
        vm.prank(seller);
        uint256 tokenId = nft.publish("", "ipfs://test");

        vm.prank(seller);
        marketplace.createListing(address(nft), tokenId, 1, "ERC721", address(0), 0.1 ether);

        vm.prank(seller);
        nft.setApprovalForAll(address(marketplace), false);

        vm.prank(buyer);
        vm.expectRevert(MarketplaceFixedPrice.NotApproved.selector);
        marketplace.buy{value: 0.1 ether}(0);

        (,,,,,,, bool active) = marketplace.listings(0);
        assertTrue(active);
    }

    function testBuySucceedsAfterERC721ApprovalRestored() external {
        vm.prank(seller);
        uint256 tokenId = nft.publish("", "ipfs://test");

        vm.prank(seller);
        marketplace.createListing(address(nft), tokenId, 1, "ERC721", address(0), 0.1 ether);

        vm.prank(seller);
        nft.setApprovalForAll(address(marketplace), false);

        vm.prank(buyer);
        vm.expectRevert(MarketplaceFixedPrice.NotApproved.selector);
        marketplace.buy{value: 0.1 ether}(0);

        vm.prank(seller);
        nft.setApprovalForAll(address(marketplace), true);

        vm.prank(buyer);
        marketplace.buy{value: 0.1 ether}(0);

        assertEq(nft.ownerOf(tokenId), buyer);
        (,,,,,,, bool active) = marketplace.listings(0);
        assertFalse(active);
    }

    function testBuyRevertsWhenERC1155ApprovalRevoked() external {
        vm.prank(seller);
        uint256 tokenId = multi.publish("", 8, "ipfs://multi");

        vm.prank(seller);
        marketplace.createListing(address(multi), tokenId, 5, "ERC1155", address(0), 0.1 ether);

        vm.prank(seller);
        multi.setApprovalForAll(address(marketplace), false);

        vm.prank(buyer);
        vm.expectRevert(MarketplaceFixedPrice.NotApproved.selector);
        marketplace.buy{value: 0.1 ether}(0);

        (,,,,,,, bool active) = marketplace.listings(0);
        assertTrue(active);
    }

    function testBuySucceedsAfterERC1155ApprovalRestored() external {
        vm.prank(seller);
        uint256 tokenId = multi.publish("", 8, "ipfs://multi");

        vm.prank(seller);
        marketplace.createListing(address(multi), tokenId, 5, "ERC1155", address(0), 0.1 ether);

        vm.prank(seller);
        multi.setApprovalForAll(address(marketplace), false);

        vm.prank(buyer);
        vm.expectRevert(MarketplaceFixedPrice.NotApproved.selector);
        marketplace.buy{value: 0.1 ether}(0);

        vm.prank(seller);
        multi.setApprovalForAll(address(marketplace), true);

        vm.prank(buyer);
        marketplace.buy{value: 0.1 ether}(0);

        assertEq(multi.balanceOf(tokenId, seller), 3);
        assertEq(multi.balanceOf(tokenId, buyer), 5);
        (,,,,,,, bool active) = marketplace.listings(0);
        assertFalse(active);
    }

    function testBuyRevertsWhenERC1155BalanceReducedAfterListing() external {
        vm.prank(seller);
        uint256 tokenId = multi.publish("", 8, "ipfs://multi");

        vm.prank(seller);
        marketplace.createListing(address(multi), tokenId, 5, "ERC1155", address(0), 0.1 ether);

        vm.prank(seller);
        multi.safeTransferFrom(seller, unapprovedSeller, tokenId, 4, "");

        vm.prank(buyer);
        vm.expectRevert(MarketplaceFixedPrice.NotSeller.selector);
        marketplace.buy{value: 0.1 ether}(0);

        (,,,,,,, bool active) = marketplace.listings(0);
        assertTrue(active);
    }

    function testBuySucceedsAfterERC1155BalanceRestored() external {
        vm.prank(seller);
        uint256 tokenId = multi.publish("", 8, "ipfs://multi");

        vm.prank(seller);
        marketplace.createListing(address(multi), tokenId, 5, "ERC1155", address(0), 0.1 ether);

        vm.prank(seller);
        multi.safeTransferFrom(seller, unapprovedSeller, tokenId, 4, "");

        vm.prank(buyer);
        vm.expectRevert(MarketplaceFixedPrice.NotSeller.selector);
        marketplace.buy{value: 0.1 ether}(0);

        vm.prank(unapprovedSeller);
        multi.safeTransferFrom(unapprovedSeller, seller, tokenId, 1, "");

        vm.prank(buyer);
        marketplace.buy{value: 0.1 ether}(0);

        assertEq(multi.balanceOf(tokenId, seller), 0);
        assertEq(multi.balanceOf(tokenId, buyer), 5);
        assertEq(multi.balanceOf(tokenId, unapprovedSeller), 3);
        (,,,,,,, bool active) = marketplace.listings(0);
        assertFalse(active);
    }

    function testNextListingIdIncrements() external {
        assertEq(marketplace.nextListingId(), 0);

        _publishAndList(0.1 ether);
        assertEq(marketplace.nextListingId(), 1);

        _publishAndList(0.2 ether);
        assertEq(marketplace.nextListingId(), 2);
    }
}
