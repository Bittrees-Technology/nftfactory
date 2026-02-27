# Deploy Notes

Deploy order:
1. NftFactoryRegistry
2. RoyaltySplitRegistry
3. SubnameRegistrar
4. SharedMint721
5. SharedMint1155
6. CreatorCollection721 implementation
7. CreatorCollection1155 implementation
8. CreatorFactory
9. MarketplaceFixedPrice

Post deploy:
- authorize CreatorFactory in registry
- set treasury and protocol fee
- transfer contract ownerships to Safe
