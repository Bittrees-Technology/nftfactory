declare module "*ipfs-evm-system/src/gateway.js" {
  export function buildGatewayUrl(input: {
    gatewayBaseUrl: string;
    cid: string;
    path?: string;
  }): string;
}
