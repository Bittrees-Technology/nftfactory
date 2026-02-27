// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Owned} from "../utils/Owned.sol";
import {IERC20} from "../interfaces/IERC20.sol";
import {IERC721Lite} from "../interfaces/IERC721Lite.sol";
import {IERC1155Lite} from "../interfaces/IERC1155Lite.sol";
import {NftFactoryRegistry} from "./NftFactoryRegistry.sol";

contract MarketplaceFixedPrice is Owned {
    struct Listing {
        address seller;
        address nft;
        uint256 tokenId;
        uint256 amount;
        string standard; // ERC721 | ERC1155
        address paymentToken; // address(0) = ETH
        uint256 price;
        bool active;
    }

    uint256 public nextListingId;
    NftFactoryRegistry public registry;

    mapping(uint256 => Listing) public listings;
    mapping(address => bool) public blockedCollection;

    event Listed(
        uint256 indexed listingId,
        address indexed seller,
        address indexed nft,
        uint256 tokenId,
        uint256 amount,
        string standard,
        address paymentToken,
        uint256 price
    );
    event Sale(uint256 indexed listingId, address indexed buyer, uint256 price, address paymentToken);
    event Cancelled(uint256 indexed listingId);
    event BlockedCollectionUpdated(address indexed collection, bool blocked);

    error NotSeller();
    error NotActive();
    error PaymentMismatch();
    error Sanctioned();
    error UnsupportedStandard();
    error InvalidAmount();
    error NotApproved();

    constructor(address initialOwner, address registryAddress) Owned(initialOwner) {
        registry = NftFactoryRegistry(registryAddress);
    }

    function setBlockedCollection(address collection, bool isBlocked) external onlyOwner {
        blockedCollection[collection] = isBlocked;
        emit BlockedCollectionUpdated(collection, isBlocked);
    }

    function createListing(
        address nft,
        uint256 tokenId,
        uint256 amount,
        string calldata standard,
        address paymentToken,
        uint256 price
    ) external {
        if (registry.blocked(msg.sender) || registry.blocked(nft) || blockedCollection[nft]) revert Sanctioned();

        bytes32 key = keccak256(bytes(standard));
        if (key == keccak256("ERC721")) {
            if (amount != 1) revert InvalidAmount();
            if (IERC721Lite(nft).ownerOf(tokenId) != msg.sender) revert NotSeller();
            if (!IERC721Lite(nft).isApprovedForAll(msg.sender, address(this))) revert NotApproved();
        } else if (key == keccak256("ERC1155")) {
            if (amount == 0) revert InvalidAmount();
            if (IERC1155Lite(nft).balanceOf(msg.sender, tokenId) < amount) revert NotSeller();
            if (!IERC1155Lite(nft).isApprovedForAll(msg.sender, address(this))) revert NotApproved();
        } else {
            revert UnsupportedStandard();
        }

        listings[nextListingId] = Listing({
            seller: msg.sender,
            nft: nft,
            tokenId: tokenId,
            amount: amount,
            standard: standard,
            paymentToken: paymentToken,
            price: price,
            active: true
        });

        emit Listed(nextListingId, msg.sender, nft, tokenId, amount, standard, paymentToken, price);
        nextListingId++;
    }

    function cancelListing(uint256 listingId) external {
        Listing storage listing = listings[listingId];
        if (listing.seller != msg.sender) revert NotSeller();
        if (!listing.active) revert NotActive();
        listing.active = false;
        emit Cancelled(listingId);
    }

    function buy(uint256 listingId) external payable {
        Listing storage listing = listings[listingId];
        if (!listing.active) revert NotActive();
        if (
            registry.blocked(msg.sender) || registry.blocked(listing.seller) || registry.blocked(listing.nft)
                || blockedCollection[listing.nft]
        ) revert Sanctioned();

        bytes32 key = keccak256(bytes(listing.standard));
        if (key == keccak256("ERC721")) {
            if (IERC721Lite(listing.nft).ownerOf(listing.tokenId) != listing.seller) revert NotSeller();
            if (!IERC721Lite(listing.nft).isApprovedForAll(listing.seller, address(this))) revert NotApproved();
        } else if (key == keccak256("ERC1155")) {
            if (IERC1155Lite(listing.nft).balanceOf(listing.seller, listing.tokenId) < listing.amount) revert NotSeller();
            if (!IERC1155Lite(listing.nft).isApprovedForAll(listing.seller, address(this))) revert NotApproved();
        } else {
            revert UnsupportedStandard();
        }

        listing.active = false;

        if (listing.paymentToken == address(0)) {
            if (msg.value != listing.price) revert PaymentMismatch();
            (bool ok,) = listing.seller.call{value: listing.price}("");
            require(ok, "ETH_TRANSFER_FAILED");
        } else {
            if (msg.value != 0) revert PaymentMismatch();
            bool ok = IERC20(listing.paymentToken).transferFrom(msg.sender, listing.seller, listing.price);
            require(ok, "ERC20_TRANSFER_FAILED");
        }

        if (key == keccak256("ERC721")) {
            IERC721Lite(listing.nft).safeTransferFrom(listing.seller, msg.sender, listing.tokenId);
        } else if (key == keccak256("ERC1155")) {
            IERC1155Lite(listing.nft).safeTransferFrom(listing.seller, msg.sender, listing.tokenId, listing.amount, "");
        } else {
            revert UnsupportedStandard();
        }

        emit Sale(listingId, msg.sender, listing.price, listing.paymentToken);
    }
}
