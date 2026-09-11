import {it,expect,vi} from 'vitest';
import {prepareWalletConnection,walletConnectionError} from './walletConnection';
it('closes the native chooser before WalletConnect opens its QR modal',async()=>{const close=vi.fn();await prepareWalletConnection({id:'walletConnect',getProvider:vi.fn()},close);expect(close).toHaveBeenCalledOnce();});
it('keeps the chooser visible and explains a missing injected wallet',async()=>{const close=vi.fn();await expect(prepareWalletConnection({id:'injected',getProvider:vi.fn().mockResolvedValue(undefined)},close)).rejects.toThrow('No browser wallet');expect(close).not.toHaveBeenCalled();});
it('supports discovered injected wallets without hiding their chooser',async()=>{const close=vi.fn();await prepareWalletConnection({id:'io.rabby',type:'injected',getProvider:vi.fn().mockResolvedValue({})},close);expect(close).not.toHaveBeenCalled();});
it('distinguishes cancellation from wallet availability',()=>{expect(walletConnectionError({code:4001})).toContain('canceled');expect(walletConnectionError(new Error('No browser wallet was found. Choose WalletConnect.'))).toContain('No browser wallet');});
