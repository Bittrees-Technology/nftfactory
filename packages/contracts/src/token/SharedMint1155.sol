// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Owned} from "../utils/Owned.sol";
import {SubnameRegistrar} from "../core/SubnameRegistrar.sol";

/// @notice Minimal ERC-1155 receiver interface used to validate safe transfers to contracts.
/// @dev See EIP-1155 §4 and the receiver hook specification.
interface IERC1155Receiver {
    function onERC1155Received(address operator, address from, uint256 id, uint256 value, bytes calldata data)
        external
        returns (bytes4);

    function onERC1155BatchReceived(
        address operator,
        address from,
        uint256[] calldata ids,
        uint256[] calldata values,
        bytes calldata data
    ) external returns (bytes4);
}

/// @title SharedMint1155
/// @notice A lightweight, non-upgradeable ERC-1155 contract where any caller may
///         permissionlessly mint their own token type into a shared collection.
///
/// @dev Fully implements EIP-1155 (Multi Token Standard) including the optional
///      ERC-1155 Metadata URI extension and EIP-165 (Standard Interface Detection).
///
///      Key design decisions:
///      - No upgradability — what you deploy is what you get.
///      - Any address can call `publish`; ENS subname attribution is optional.
///      - Royalties are NOT included. Use CreatorCollection1155 for per-collection
///        royalty support (EIP-2981).
///      - `name` and `symbol` are not part of EIP-1155 core but are widely expected
///        by wallets and block explorers.
///
///      Interface IDs returned by supportsInterface:
///        0x01ffc9a7  ERC-165
///        0xd9b67a26  ERC-1155
///        0x0e89341c  ERC-1155 Metadata URI
contract SharedMint1155 is Owned {
    // ── Metadata ──────────────────────────────────────────────────────────────

    /// @notice Human-readable name of the collection (not in EIP-1155 core, widely expected by tooling).
    string public name;

    /// @notice Short ticker-style symbol for the collection.
    string public symbol;

    // ── State ─────────────────────────────────────────────────────────────────

    /// @notice The next token ID that will be assigned on the next `publish` call.
    ///         After the first publish this equals the most recently minted token ID.
    uint256 public nextTokenId;

    /// @notice The ENS subname registrar used to attribute mints to creator subnames.
    SubnameRegistrar public registrar;

    // ── ERC-1155 core storage ─────────────────────────────────────────────────

    /// @dev balanceOf[account][id] — outer key is account per EIP-1155 §5.3.
    ///      WARNING: previous deployments of this contract used the reversed layout
    ///      (id → account); those contracts must be redeployed to gain compliance.
    mapping(address => mapping(uint256 => uint256)) private _balances;
    mapping(address => mapping(address => bool)) public isApprovedForAll;
    mapping(uint256 => string) private _uris;

    // ── Events (EIP-1155) ─────────────────────────────────────────────────────

    /// @dev Emitted on single-token transfers (including mint from address(0)).
    event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value);

    /// @dev Emitted on batch transfers.
    event TransferBatch(
        address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values
    );

    /// @dev Emitted when an operator approval is set or revoked.
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);

    /// @dev Emitted when the URI for a token ID is set or updated. Required by EIP-1155.
    event URI(string value, uint256 indexed id);

    /// @dev Custom event emitted on a successful `publish` (mint).
    event Published(address indexed creator, uint256 indexed tokenId, string creatorSubname, uint256 amount, string uri);

    // ── Errors ────────────────────────────────────────────────────────────────

    error Unauthorized();
    error InvalidRecipient();
    error InsufficientBalance();
    error ArrayLengthMismatch();
    error InvalidOwner();
    error InvalidAmount();

    // ── Constructor ───────────────────────────────────────────────────────────

    constructor(address initialOwner, address registrarAddress, string memory tokenName, string memory tokenSymbol)
        Owned(initialOwner)
    {
        registrar = SubnameRegistrar(registrarAddress);
        name = tokenName;
        symbol = tokenSymbol;
    }

    // ── ERC-1155 view functions ───────────────────────────────────────────────

    /// @notice Returns the metadata URI for `tokenId` (ERC-1155 Metadata URI extension).
    /// @param tokenId The token ID to query.
    function uri(uint256 tokenId) public view returns (string memory) {
        return _uris[tokenId];
    }

    /// @notice Returns the balance of `account` for token `id`.
    /// @param account The token holder to query.
    /// @param id      The token ID to query.
    function balanceOf(address account, uint256 id) public view returns (uint256) {
        if (account == address(0)) revert InvalidOwner();
        return _balances[account][id];
    }

    /// @notice Returns the balances of multiple (account, id) pairs in a single call.
    /// @param accounts Array of holder addresses.
    /// @param ids      Array of token IDs (must be the same length as `accounts`).
    /// @return balances Array of balances, one per (account, id) pair.
    function balanceOfBatch(address[] calldata accounts, uint256[] calldata ids)
        external
        view
        returns (uint256[] memory balances)
    {
        if (accounts.length != ids.length) revert ArrayLengthMismatch();
        balances = new uint256[](accounts.length);
        for (uint256 i = 0; i < accounts.length; i++) {
            if (accounts[i] == address(0)) revert InvalidOwner();
            balances[i] = _balances[accounts[i]][ids[i]];
        }
    }

    // ── ERC-1155 approval functions ───────────────────────────────────────────

    /// @notice Grant or revoke `operator` as a manager of all the caller's tokens.
    /// @param operator The address to approve or revoke.
    /// @param approved  True to approve, false to revoke.
    function setApprovalForAll(address operator, bool approved) external {
        isApprovedForAll[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    // ── ERC-1155 transfer functions ───────────────────────────────────────────

    /// @notice Transfer `amount` of token `id` from `from` to `to`.
    /// @dev    Caller must be `from` or an approved operator.
    ///         If `to` is a contract, `onERC1155Received` is called on it.
    function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes calldata data) external {
        if (msg.sender != from && !isApprovedForAll[from][msg.sender]) revert Unauthorized();
        if (to == address(0)) revert InvalidRecipient();

        uint256 fromBal = _balances[from][id];
        if (fromBal < amount) revert InsufficientBalance();

        _balances[from][id] = fromBal - amount;
        _balances[to][id] += amount;

        emit TransferSingle(msg.sender, from, to, id, amount);
        _checkOnERC1155Received(from, to, id, amount, data);
    }

    /// @notice Transfer multiple token types from `from` to `to` in a single call.
    /// @dev    Caller must be `from` or an approved operator.
    ///         If `to` is a contract, `onERC1155BatchReceived` is called on it.
    /// @param from    Source address.
    /// @param to      Destination address.
    /// @param ids     Array of token IDs to transfer.
    /// @param amounts Amounts for each token ID (must be the same length as `ids`).
    /// @param data    Additional data forwarded to the receiver hook.
    function safeBatchTransferFrom(
        address from,
        address to,
        uint256[] calldata ids,
        uint256[] calldata amounts,
        bytes calldata data
    ) external {
        if (msg.sender != from && !isApprovedForAll[from][msg.sender]) revert Unauthorized();
        if (to == address(0)) revert InvalidRecipient();
        if (ids.length != amounts.length) revert ArrayLengthMismatch();

        for (uint256 i = 0; i < ids.length; i++) {
            uint256 fromBal = _balances[from][ids[i]];
            if (fromBal < amounts[i]) revert InsufficientBalance();
            _balances[from][ids[i]] = fromBal - amounts[i];
            _balances[to][ids[i]] += amounts[i];
        }

        emit TransferBatch(msg.sender, from, to, ids, amounts);
        _checkOnERC1155BatchReceived(from, to, ids, amounts, data);
    }

    // ── Mint ──────────────────────────────────────────────────────────────────

    /// @notice Permissionlessly mint a new token type into the shared collection.
    /// @dev    The caller becomes both the minter and the initial holder.
    ///         If `creatorSubname` is non-empty and registered in the SubnameRegistrar,
    ///         the mint is attributed to that subname; failures are silently ignored so
    ///         the mint always succeeds.
    /// @param creatorSubname Optional ENS subname label to attribute the mint to.
    /// @param amount         Number of tokens to mint for this token ID.
    /// @param newUri         Metadata URI (e.g. ipfs://…) for the token.
    /// @return tokenId       The ID of the newly minted token type.
    function publish(string calldata creatorSubname, uint256 amount, string calldata newUri)
        external
        returns (uint256 tokenId)
    {
        if (amount == 0) revert InvalidAmount();
        tokenId = ++nextTokenId;
        _balances[msg.sender][tokenId] += amount;
        _uris[tokenId] = newUri;

        if (bytes(creatorSubname).length != 0) {
            // Subname attribution is optional — the mint always succeeds.
            try registrar.recordMint(creatorSubname) {} catch {}
        }

        emit TransferSingle(msg.sender, address(0), msg.sender, tokenId, amount);
        emit URI(newUri, tokenId);
        emit Published(msg.sender, tokenId, creatorSubname, amount, newUri);
    }

    // ── ERC-165 ───────────────────────────────────────────────────────────────

    /// @notice Returns true if this contract implements the interface defined by `interfaceId`.
    /// @dev Supports ERC-165, ERC-1155, and ERC-1155 Metadata URI.
    /// @param interfaceId The 4-byte EIP-165 interface selector.
    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == 0x01ffc9a7 // ERC-165
            || interfaceId == 0xd9b67a26 // ERC-1155
            || interfaceId == 0x0e89341c; // ERC-1155 Metadata URI
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    /// @dev Calls `onERC1155Received` on `to` when it is a contract.
    ///      Reverts with InvalidRecipient if the hook is absent or returns the wrong selector.
    function _checkOnERC1155Received(address from, address to, uint256 id, uint256 amount, bytes memory data)
        internal
    {
        if (to.code.length > 0) {
            try IERC1155Receiver(to).onERC1155Received(msg.sender, from, id, amount, data) returns (bytes4 retval) {
                if (retval != IERC1155Receiver.onERC1155Received.selector) revert InvalidRecipient();
            } catch {
                revert InvalidRecipient();
            }
        }
    }

    /// @dev Calls `onERC1155BatchReceived` on `to` when it is a contract.
    ///      Reverts with InvalidRecipient if the hook is absent or returns the wrong selector.
    function _checkOnERC1155BatchReceived(
        address from,
        address to,
        uint256[] calldata ids,
        uint256[] calldata amounts,
        bytes memory data
    ) internal {
        if (to.code.length > 0) {
            try IERC1155Receiver(to).onERC1155BatchReceived(msg.sender, from, ids, amounts, data) returns (
                bytes4 retval
            ) {
                if (retval != IERC1155Receiver.onERC1155BatchReceived.selector) revert InvalidRecipient();
            } catch {
                revert InvalidRecipient();
            }
        }
    }
}
