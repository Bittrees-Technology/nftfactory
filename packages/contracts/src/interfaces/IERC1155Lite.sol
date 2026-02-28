// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal ERC-1155 interface used internally by MarketplaceFixedPrice.
/// @dev Parameter order matches EIP-1155 §5.3:
///        balanceOf(address account, uint256 id)
///      Previous versions had these arguments reversed, which caused ABI incompatibility
///      with all standard ERC-1155 tokens.
interface IERC1155Lite {
    /// @notice Returns the balance of `account` for token `id`.
    /// @param account The holder address.
    /// @param id      The token ID.
    function balanceOf(address account, uint256 id) external view returns (uint256);

    /// @notice Returns whether `operator` is approved to manage all of `account`'s tokens.
    function isApprovedForAll(address account, address operator) external view returns (bool);

    /// @notice Transfers `amount` of token `id` from `from` to `to`.
    function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes calldata data) external;
}
