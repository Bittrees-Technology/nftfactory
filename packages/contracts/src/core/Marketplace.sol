// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Owned} from "../utils/Owned.sol";
import {IERC20} from "../interfaces/IERC20.sol";
import {IERC721Lite} from "../interfaces/IERC721Lite.sol";
import {IERC1155Lite} from "../interfaces/IERC1155Lite.sol";
import {NftFactoryRegistry} from "./NftFactoryRegistry.sol";

contract Marketplace is Owned {
    uint256 public constant MAX_LISTING_DURATION_DAYS = 365;

    struct Listing {
        address seller;
        address nft;
        uint256 tokenId;
        uint256 amount;
        string standard; // ERC721 | ERC1155
        address paymentToken; // address(0) = ETH
        uint256 price;
        uint256 expiresAt;
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
        uint256 price,
        uint256 expiresAt
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
    error InvalidPrice();
    error InvalidDuration();
    error Expired();
    error NotApproved();
    error Reentrancy();

    uint256 private _entered;

    constructor(address initialOwner, address registryAddress) Owned(initialOwner) {
        registry = NftFactoryRegistry(registryAddress);
    }

    modifier nonReentrant() {
        if (_entered == 1) revert Reentrancy();
        _entered = 1;
        _;
        _entered = 0;
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
        uint256 price,
        uint256 durationDays
    ) external {
        if (registry.blocked(msg.sender) || registry.blocked(nft) || blockedCollection[nft]) revert Sanctioned();
        if (price == 0) revert InvalidPrice();
        if (durationDays == 0 || durationDays > MAX_LISTING_DURATION_DAYS) revert InvalidDuration();

        bytes32 key = _standardKey(standard);
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

        uint256 expiresAt = block.timestamp + (durationDays * 1 days);
        listings[nextListingId] = Listing({
            seller: msg.sender,
            nft: nft,
            tokenId: tokenId,
            amount: amount,
            standard: key == keccak256("ERC721") ? "ERC721" : "ERC1155",
            paymentToken: paymentToken,
            price: price,
            expiresAt: expiresAt,
            active: true
        });

        emit Listed(nextListingId, msg.sender, nft, tokenId, amount, standard, paymentToken, price, expiresAt);
        nextListingId++;
    }

    function cancelListing(uint256 listingId) external {
        Listing storage listing = listings[listingId];
        if (listing.seller != msg.sender) revert NotSeller();
        if (!listing.active) revert NotActive();
        listing.active = false;
        emit Cancelled(listingId);
    }

    function buy(uint256 listingId) external payable nonReentrant {
        Listing storage listing = listings[listingId];
        if (!listing.active) revert NotActive();
        if (block.timestamp > listing.expiresAt) revert Expired();
        if (
            registry.blocked(msg.sender) || registry.blocked(listing.seller) || registry.blocked(listing.nft)
                || blockedCollection[listing.nft]
        ) revert Sanctioned();

        bytes32 key = _standardKey(listing.standard);
        if (key == keccak256("ERC721")) {
            if (!IERC721Lite(listing.nft).isApprovedForAll(listing.seller, address(this))) revert NotApproved();
        } else {
            if (!IERC1155Lite(listing.nft).isApprovedForAll(listing.seller, address(this))) revert NotApproved();
        }

        listing.active = false;

        uint256 protocolFee = _protocolFee(listing.price);
        uint256 sellerProceeds = listing.price - protocolFee;
        address feeTreasury = registry.treasury();

        if (listing.paymentToken == address(0)) {
            if (msg.value != listing.price) revert PaymentMismatch();
            if (protocolFee > 0) {
                (bool feeOk,) = feeTreasury.call{value: protocolFee}("");
                require(feeOk, "FEE_TRANSFER_FAILED");
            }
            (bool ok,) = listing.seller.call{value: sellerProceeds}("");
            require(ok, "ETH_TRANSFER_FAILED");
        } else {
            if (msg.value != 0) revert PaymentMismatch();
            if (protocolFee > 0) {
                bool feeOk = IERC20(listing.paymentToken).transferFrom(msg.sender, feeTreasury, protocolFee);
                require(feeOk, "ERC20_FEE_TRANSFER_FAILED");
            }
            bool ok = IERC20(listing.paymentToken).transferFrom(msg.sender, listing.seller, sellerProceeds);
            require(ok, "ERC20_TRANSFER_FAILED");
        }

        if (key == keccak256("ERC721")) {
            IERC721Lite(listing.nft).safeTransferFrom(listing.seller, msg.sender, listing.tokenId);
        } else {
            IERC1155Lite(listing.nft).safeTransferFrom(listing.seller, msg.sender, listing.tokenId, listing.amount, "");
        }

        emit Sale(listingId, msg.sender, listing.price, listing.paymentToken);
    }

    function _standardKey(string memory standard) internal pure returns (bytes32 key) {
        key = keccak256(bytes(standard));
        if (key != keccak256("ERC721") && key != keccak256("ERC1155")) revert UnsupportedStandard();
    }

    function _protocolFee(uint256 price) internal view returns (uint256) {
        uint256 feeBps = registry.protocolFeeBps();
        if (feeBps == 0) return 0;
        return (price * feeBps) / 10_000;
    }
}
