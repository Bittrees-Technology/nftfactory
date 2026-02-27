const WORD_HEX_LEN = 64;

function padToWord(hexNoPrefix: string): string {
  return hexNoPrefix.padStart(WORD_HEX_LEN, "0");
}

function strip0x(value: string): string {
  return value.startsWith("0x") ? value.slice(2) : value;
}

function utf8ToHex(value: string): string {
  const bytes = new TextEncoder().encode(value);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function encodeUint256(value: bigint): string {
  if (value < 0n) {
    throw new Error("uint256 cannot be negative");
  }
  return padToWord(value.toString(16));
}

function encodeStringData(value: string): string {
  const raw = utf8ToHex(value);
  const lenWord = encodeUint256(BigInt(raw.length / 2));
  const paddedLength = Math.ceil(raw.length / WORD_HEX_LEN) * WORD_HEX_LEN;
  const padded = raw.padEnd(paddedLength, "0");
  return `${lenWord}${padded}`;
}

function wordFromBytes(bytes: number): string {
  return encodeUint256(BigInt(bytes));
}

function encodeBool(value: boolean): string {
  return padToWord(value ? "1" : "0");
}

function encodeAddress(value: `0x${string}`): string {
  const clean = strip0x(value);
  if (!/^[a-fA-F0-9]{40}$/.test(clean)) {
    throw new Error(`Invalid address: ${value}`);
  }
  return padToWord(clean.toLowerCase());
}

export function encodeRegisterSubname(label: string): string {
  const selector = "8e78d578";
  const head = wordFromBytes(32);
  const body = encodeStringData(label);
  return `0x${selector}${head}${body}`;
}

export function encodePublish721(subname: string, uri: string): string {
  const selector = "c163bba7";
  const subnameBody = encodeStringData(subname);
  const uriBody = encodeStringData(uri);

  const head1 = wordFromBytes(64);
  const head2 = wordFromBytes(64 + subnameBody.length / 2);

  return `0x${selector}${head1}${head2}${subnameBody}${uriBody}`;
}

export function encodePublish1155(subname: string, amount: bigint, uri: string): string {
  const selector = "be2d8430";
  const subnameBody = encodeStringData(subname);
  const uriBody = encodeStringData(uri);

  const head1 = wordFromBytes(96);
  const head2 = encodeUint256(amount);
  const head3 = wordFromBytes(96 + subnameBody.length / 2);

  return `0x${selector}${head1}${head2}${head3}${subnameBody}${uriBody}`;
}

export function encodeCreatorPublish721(to: `0x${string}`, uri: string, lockMetadata: boolean): string {
  const selector = "b5ec6550";
  const uriBody = encodeStringData(uri);
  const head1 = encodeAddress(to);
  const head2 = wordFromBytes(96);
  const head3 = encodeBool(lockMetadata);
  return `0x${selector}${head1}${head2}${head3}${uriBody}`;
}

export function encodeCreatorPublish1155(
  to: `0x${string}`,
  tokenId: bigint,
  amount: bigint,
  uri: string,
  lockMetadata: boolean
): string {
  const selector = "000f9e5f";
  const uriBody = encodeStringData(uri);
  const head1 = encodeAddress(to);
  const head2 = encodeUint256(tokenId);
  const head3 = encodeUint256(amount);
  const head4 = wordFromBytes(160);
  const head5 = encodeBool(lockMetadata);
  return `0x${selector}${head1}${head2}${head3}${head4}${head5}${uriBody}`;
}

export function encodeSetApprovalForAll(operator: `0x${string}`, approved: boolean): string {
  const selector = "a22cb465";
  return `0x${selector}${encodeAddress(operator)}${encodeBool(approved)}`;
}

export function encodeErc20Approve(spender: `0x${string}`, amount: bigint): string {
  const selector = "095ea7b3";
  return `0x${selector}${encodeAddress(spender)}${encodeUint256(amount)}`;
}

export function encodeCreateListing(
  nft: `0x${string}`,
  tokenId: bigint,
  amount: bigint,
  standard: "ERC721" | "ERC1155",
  paymentToken: `0x${string}`,
  priceWei: bigint
): string {
  const selector = "d6a2afae";
  const standardBody = encodeStringData(standard);
  const head1 = encodeAddress(nft);
  const head2 = encodeUint256(tokenId);
  const head3 = encodeUint256(amount);
  const head4 = wordFromBytes(192);
  const head5 = encodeAddress(paymentToken);
  const head6 = encodeUint256(priceWei);
  return `0x${selector}${head1}${head2}${head3}${head4}${head5}${head6}${standardBody}`;
}

export function encodeCancelListing(listingId: bigint): string {
  const selector = "305a67a8";
  const arg = encodeUint256(listingId);
  return `0x${selector}${arg}`;
}

export function encodeBuyListing(listingId: bigint): string {
  const selector = "d96a094a";
  const arg = encodeUint256(listingId);
  return `0x${selector}${arg}`;
}

export function toHexWei(ethAmount: string): string {
  const [wholeRaw, fracRaw = ""] = ethAmount.trim().split(".");
  const whole = wholeRaw === "" ? "0" : wholeRaw;
  if (!/^\d+$/.test(whole) || !/^\d*$/.test(fracRaw)) {
    throw new Error("Invalid ETH amount");
  }

  const frac = (fracRaw + "000000000000000000").slice(0, 18);
  const wei = BigInt(whole) * 10n ** 18n + BigInt(frac || "0");
  return `0x${wei.toString(16)}`;
}

export function toWeiBigInt(ethAmount: string): bigint {
  const [wholeRaw, fracRaw = ""] = ethAmount.trim().split(".");
  const whole = wholeRaw === "" ? "0" : wholeRaw;
  if (!/^\d+$/.test(whole) || !/^\d*$/.test(fracRaw)) {
    throw new Error("Invalid ETH amount");
  }
  const frac = (fracRaw + "000000000000000000").slice(0, 18);
  return BigInt(whole) * 10n ** 18n + BigInt(frac || "0");
}

export function hexToBigInt(hexValue: string): bigint {
  const normalized = hexValue.startsWith("0x") ? hexValue : `0x${hexValue}`;
  return BigInt(normalized);
}

export function truncateHash(hash: string): string {
  if (hash.length < 14) return hash;
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
}
