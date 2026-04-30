export type ContentLengthValidationResult =
  | {
      error: string;
      status: 400 | 413;
    }
  | null;

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 && bytes % (1024 * 1024) === 0) {
    return `${bytes / (1024 * 1024)}MB`;
  }
  if (bytes >= 1024 && bytes % 1024 === 0) {
    return `${bytes / 1024}KB`;
  }
  return `${bytes} bytes`;
}

export function validateContentLengthHeader(
  value: string | null | undefined,
  maxBytes: number,
  label = "Request body"
): ContentLengthValidationResult {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return null;
  }

  if (!/^\d+$/.test(normalized)) {
    return {
      error: `${label} content-length header is invalid.`,
      status: 400
    };
  }

  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return {
      error: `${label} content-length header is invalid.`,
      status: 400
    };
  }

  if (parsed > maxBytes) {
    return {
      error: `${label} exceeds the ${formatBytes(maxBytes)} limit.`,
      status: 413
    };
  }

  return null;
}

export function validateRequestContentLength(
  request: Pick<Request, "headers">,
  maxBytes: number,
  label = "Request body"
): ContentLengthValidationResult {
  return validateContentLengthHeader(request.headers.get("content-length"), maxBytes, label);
}
