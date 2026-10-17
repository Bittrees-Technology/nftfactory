export type OperationsConfig = { mode: 'legacy' | 'integrated'; privateKey?: string; publicKey?: string };
export function operationsConfig(env?: Record<string,string|undefined>): OperationsConfig;
export function authorizeOperation(config: OperationsConfig | undefined, chainId: number, operation: string | undefined): Promise<{ok:true}|{ok:false;error:string}>;
