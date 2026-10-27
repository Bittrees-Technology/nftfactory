import { describe, expect, it } from 'vitest';
import { W3mFrameConstants, W3mFrameSchema } from '@reown/appkit-wallet';

describe('wallet frame validation with the patched schema library', () => {
  it('accepts a supported network request and rejects an invalid chain', () => {
    const request = { type: W3mFrameConstants.APP_SWITCH_NETWORK, payload: { chainId: 1 } };
    expect(W3mFrameSchema.appEvent.safeParse(request).success).toBe(true);
    expect(W3mFrameSchema.appEvent.safeParse({ ...request, payload: { chainId: {} } }).success).toBe(false);
  });
  it('keeps email and unknown-operation validation intact', () => {
    const request = { type: W3mFrameConstants.APP_CONNECT_EMAIL, payload: { email: 'test@example.org' } };
    expect(W3mFrameSchema.appEvent.safeParse(request).success).toBe(true);
    expect(W3mFrameSchema.appEvent.safeParse({ ...request, payload: { email: 'invalid' } }).success).toBe(false);
    expect(W3mFrameSchema.appEvent.safeParse({ type: 'UNREVIEWED_OPERATION' }).success).toBe(false);
  });
});
