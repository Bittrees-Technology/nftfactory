// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Owned} from "../utils/Owned.sol";
import {SubnameRegistrar} from "../core/SubnameRegistrar.sol";

/// @notice Minimal ERC-721 receiver interface used to validate safe transfers to contracts.
/// @dev See EIP-721 §4 and the receiver hook specification.
interface IERC721Receiver {
    function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata data)
        external
        returns (bytes4);
}

/// @title SharedMint721
/// @notice A lightweight, non-upgradeable ERC-721 contract where any caller may
///         permissionlessly mint their own token into a shared collection.
///
/// @dev Fully implements EIP-721 (Non-Fungible Token Standard) including the optional
///      ERC-721 Metadata extension and EIP-165 (Standard Interface Detection).
///
///      Key design decisions:
///      - No upgradability — what you deploy is what you get.
///      - Any address can call `publish`; ENS subname attribution is optional.
///      - Royalties are NOT included. Use CreatorCollection721 for per-collection
///        royalty support (EIP-2981).
///
///      Interface IDs returned by supportsInterface:
///        0x01ffc9a7  ERC-165
///        0x80ac58cd  ERC-721
///        0x5b5e139f  ERC-721 Metadata
contract SharedMint721 is Owned {
    // ── Metadata ──────────────────────────────────────────────────────────────

    /// @notice Human-readable name of the collection (ERC-721 Metadata).
    string public name;

    /// @notice Short ticker-style symbol for the collection (ERC-721 Metadata).
    string public symbol;

    // ── State ─────────────────────────────────────────────────────────────────

    /// @notice Total number of tokens ever minted (monotonically increasing token ID counter).
    uint256 public totalSupply;

    /// @notice The ENS subname registrar used to attribute mints to creator subnames.
    SubnameRegistrar public registrar;

    // ── ERC-721 core storage ──────────────────────────────────────────────────

    mapping(uint256 => address) private _ownerOf;
    mapping(address => uint256) public balanceOf;
    /// @dev Per-token single-address approval, cleared on every transfer.
    mapping(uint256 => address) private _approvals;
    mapping(address => mapping(address => bool)) public isApprovedForAll;
    mapping(uint256 => string) private _tokenURIs;

    // ── Events (EIP-721) ──────────────────────────────────────────────────────

    /// @dev Emitted when token ownership changes (including mint from address(0)).
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);

    /// @dev Emitted when a per-token approval is granted or revoked.
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);

    /// @dev Emitted when an operator is approved or revoked for all of an owner's tokens.
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);

    /// @dev Custom event emitted on a successful `publish` (mint).
    event Published(address indexed creator, uint256 indexed tokenId, string creatorSubname, string uri);

    // ── Errors ────────────────────────────────────────────────────────────────

    error Unauthorized();
    error InvalidRecipient();
    error NonexistentToken();

    // ── Constructor ───────────────────────────────────────────────────────────

    constructor(address initialOwner, address registrarAddress, string memory tokenName, string memory tokenSymbol)
        Owned(initialOwner)
    {
        registrar = SubnameRegistrar(registrarAddress);
        name = tokenName;
        symbol = tokenSymbol;
    }

    // ── ERC-721 view functions ────────────────────────────────────────────────

    /// @notice Returns the owner of `tokenId`. Reverts for non-existent tokens.
    /// @param tokenId The token to query.
    function ownerOf(uint256 tokenId) external view returns (address owner) {
        owner = _ownerOf[tokenId];
        if (owner == address(0)) revert NonexistentToken();
    }

    /// @notice Returns the address approved to transfer `tokenId`, or address(0) if none.
    /// @param tokenId The token to query.
    function getApproved(uint256 tokenId) external view returns (address) {
        if (_ownerOf[tokenId] == address(0)) revert NonexistentToken();
        return _approvals[tokenId];
    }

    /// @notice Returns the metadata URI for `tokenId` (ERC-721 Metadata extension).
    /// @param tokenId The token to query.
    function tokenURI(uint256 tokenId) external view returns (string memory) {
        if (_ownerOf[tokenId] == address(0)) revert NonexistentToken();
        return _tokenURIs[tokenId];
    }

    // ── ERC-721 approval functions ────────────────────────────────────────────

    /// @notice Grant or revoke `operator` as a manager of all the caller's tokens.
    /// @param operator The address to approve or revoke.
    /// @param approved  True to approve, false to revoke.
    function setApprovalForAll(address operator, bool approved) external {
        isApprovedForAll[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    /// @notice Approve `to` to transfer `tokenId`.
    /// @dev Caller must be the token owner or an approved operator.
    /// @param to      The address to approve.
    /// @param tokenId The token to approve for.
    function approve(address to, uint256 tokenId) external {
        address tokenOwner = _ownerOf[tokenId];
        if (msg.sender != tokenOwner && !isApprovedForAll[tokenOwner][msg.sender]) revert Unauthorized();
        _approvals[tokenId] = to;
        emit Approval(tokenOwner, to, tokenId);
    }

    // ── ERC-721 transfer functions ────────────────────────────────────────────

    /// @notice Transfer `tokenId` from `from` to `to` without calling the ERC-721 receiver hook.
    /// @dev Caller must be owner, per-token approved address, or approved operator.
    function transferFrom(address from, address to, uint256 tokenId) external {
        _transfer(from, to, tokenId);
    }

    /// @notice Transfer `tokenId` from `from` to `to`, reverting if `to` is a contract
    ///         that does not implement the ERC-721 receiver interface.
    function safeTransferFrom(address from, address to, uint256 tokenId) external {
        _transfer(from, to, tokenId);
        _checkOnERC721Received(from, to, tokenId, "");
    }

    /// @notice Transfer `tokenId` from `from` to `to` with extra `data`, reverting if `to`
    ///         is a contract that rejects the ERC-721 receiver hook.
    function safeTransferFrom(address from, address to, uint256 tokenId, bytes calldata data) external {
        _transfer(from, to, tokenId);
        _checkOnERC721Received(from, to, tokenId, data);
    }

    // ── Mint ──────────────────────────────────────────────────────────────────

    /// @notice Permissionlessly mint a new token into the shared collection.
    /// @dev    The caller becomes both the minter and the initial owner.
    ///         If `creatorSubname` is non-empty and registered in the SubnameRegistrar,
    ///         the mint is attributed to that subname; failures are silently ignored so
    ///         the mint always succeeds.
    /// @param creatorSubname Optional ENS subname label to attribute the mint to.
    /// @param uri            Metadata URI (e.g. ipfs://…) for the token.
    /// @return tokenId       The ID of the newly minted token.
    function publish(string calldata creatorSubname, string calldata uri) external returns (uint256 tokenId) {
        tokenId = ++totalSupply;

        _ownerOf[tokenId] = msg.sender;
        balanceOf[msg.sender] += 1;
        _tokenURIs[tokenId] = uri;

        if (bytes(creatorSubname).length != 0) {
            // Subname attribution is optional — the mint always succeeds.
            try registrar.recordMint(creatorSubname) {} catch {}
        }

        emit Transfer(address(0), msg.sender, tokenId);
        emit Published(msg.sender, tokenId, creatorSubname, uri);
    }

    // ── ERC-165 ───────────────────────────────────────────────────────────────

    /// @notice Returns true if this contract implements the interface defined by `interfaceId`.
    /// @dev Supports ERC-165, ERC-721, and ERC-721 Metadata.
    /// @param interfaceId The 4-byte EIP-165 interface selector.
    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == 0x01ffc9a7 // ERC-165
            || interfaceId == 0x80ac58cd // ERC-721
            || interfaceId == 0x5b5e139f; // ERC-721 Metadata
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    /// @dev Core transfer logic shared by transferFrom, safeTransferFrom (both overloads).
    ///      Validates caller authority, clears per-token approval, updates state, emits Transfer.
    function _transfer(address from, address to, uint256 tokenId) internal {
        address tokenOwner = _ownerOf[tokenId];
        if (tokenOwner != from) revert Unauthorized();
        if (msg.sender != from && !isApprovedForAll[from][msg.sender] && _approvals[tokenId] != msg.sender) {
            revert Unauthorized();
        }
        if (to == address(0)) revert InvalidRecipient();

        // EIP-721 §4: clear per-token approval on transfer.
        delete _approvals[tokenId];

        _ownerOf[tokenId] = to;
        balanceOf[from] -= 1;
        balanceOf[to] += 1;

        emit Transfer(from, to, tokenId);
    }

    /// @dev Calls `onERC721Received` on `to` when it is a contract.
    ///      Reverts with InvalidRecipient if the hook is absent or returns the wrong selector.
    function _checkOnERC721Received(address from, address to, uint256 tokenId, bytes memory data) internal {
        if (to.code.length > 0) {
            try IERC721Receiver(to).onERC721Received(msg.sender, from, tokenId, data) returns (bytes4 retval) {
                if (retval != IERC721Receiver.onERC721Received.selector) revert InvalidRecipient();
            } catch {
                revert InvalidRecipient();
            }
        }
    }
}
