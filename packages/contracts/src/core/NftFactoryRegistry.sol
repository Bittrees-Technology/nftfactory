// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Owned} from "../utils/Owned.sol";

contract NftFactoryRegistry is Owned {
    struct CreatorRecord {
        address owner;
        address contractAddress;
        bool isNftFactoryCreated;
        string ensSubname;
        string standard;
    }

    uint256 public protocolFeeBps;
    address public treasury;

    mapping(address => bool) public blocked;
    mapping(address => bool) public authorizedFactory;
    mapping(address => bool) public allowedPaymentToken;
    mapping(address => CreatorRecord[]) public creators;
    mapping(address => mapping(address => bool)) public creatorContractRegistered;
    mapping(address => address) public contractCreator;

    event TreasuryUpdated(address indexed treasury);
    event ProtocolFeeUpdated(uint256 feeBps);
    event BlockedUpdated(address indexed account, bool blockedStatus);
    event FactoryAuthorizationUpdated(address indexed factory, bool authorized);
    event PaymentTokenUpdated(address indexed token, bool allowed);
    event CreatorRegistered(
        address indexed creator,
        address indexed contractAddress,
        string ensSubname,
        string standard,
        bool isNftFactoryCreated
    );

    error FeeTooHigh();
    error NotAuthorizedFactory();
    error CreatorContractAlreadyRegistered();
    error CreatorContractAssignedToDifferentCreator();
    error InvalidCreator();
    error InvalidCreatorContract();
    error InvalidStandard();
    error InvalidPaymentToken();
    error InvalidTreasury();

    constructor(address initialOwner, address initialTreasury) Owned(initialOwner) {
        if (initialTreasury == address(0)) revert InvalidTreasury();
        treasury = initialTreasury;
    }

    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert InvalidTreasury();
        treasury = newTreasury;
        emit TreasuryUpdated(newTreasury);
    }

    function setProtocolFeeBps(uint256 newFeeBps) external onlyOwner {
        if (newFeeBps > 10_000) revert FeeTooHigh();
        protocolFeeBps = newFeeBps;
        emit ProtocolFeeUpdated(newFeeBps);
    }

    function setBlocked(address account, bool status) external onlyOwner {
        blocked[account] = status;
        emit BlockedUpdated(account, status);
    }

    function setFactoryAuthorization(address factory, bool status) external onlyOwner {
        authorizedFactory[factory] = status;
        emit FactoryAuthorizationUpdated(factory, status);
    }

    function setPaymentTokenAllowed(address token, bool allowed) external onlyOwner {
        if (token == address(0)) revert InvalidPaymentToken();
        allowedPaymentToken[token] = allowed;
        emit PaymentTokenUpdated(token, allowed);
    }

    function registerCreatorContract(
        address creator,
        address contractAddress,
        string calldata ensSubname,
        string calldata standard,
        bool isFactoryCreated
    ) external {
        if (!authorizedFactory[msg.sender] && msg.sender != owner) revert NotAuthorizedFactory();
        if (creator == address(0)) revert InvalidCreator();
        if (contractAddress == address(0)) revert InvalidCreatorContract();
        _validateStandard(standard);
        address existingCreator = contractCreator[contractAddress];
        if (existingCreator != address(0) && existingCreator != creator) {
            revert CreatorContractAssignedToDifferentCreator();
        }
        if (creatorContractRegistered[creator][contractAddress]) revert CreatorContractAlreadyRegistered();

        contractCreator[contractAddress] = creator;
        creatorContractRegistered[creator][contractAddress] = true;

        creators[creator].push(
            CreatorRecord({
                owner: creator,
                contractAddress: contractAddress,
                isNftFactoryCreated: isFactoryCreated,
                ensSubname: ensSubname,
                standard: standard
            })
        );

        emit CreatorRegistered(creator, contractAddress, ensSubname, standard, isFactoryCreated);
    }

    function creatorContracts(address creator) external view returns (CreatorRecord[] memory) {
        return creators[creator];
    }

    function _validateStandard(string calldata standard) internal pure {
        bytes32 key = keccak256(bytes(standard));
        if (key != keccak256("ERC721") && key != keccak256("ERC1155")) revert InvalidStandard();
    }
}
