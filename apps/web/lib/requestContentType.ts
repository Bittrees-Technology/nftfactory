export type ContentTypeValidationResult =
  | {
      error: string;
      status: 415;
    }
  | null;

function normalizeMediaType(value: string | null | undefined): string {
  return String(value || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
}

export function validateContentTypeHeader(
  value: string | null | undefined,
  expectedMediaTypes: string | string[],
  label = "Request body"
): ContentTypeValidationResult {
  const actual = normalizeMediaType(value);
  const expected = (Array.isArray(expectedMediaTypes) ? expectedMediaTypes : [expectedMediaTypes])
    .map((entry) => normalizeMediaType(entry))
    .filter(Boolean);

  if (!actual || expected.length === 0 || !expected.includes(actual)) {
    return {
      error: `${label} must use ${expected.join(" or ")} content-type.`,
      status: 415
    };
  }

  return null;
}

export function validateRequestContentType(
  request: Pick<Request, "headers">,
  expectedMediaTypes: string | string[],
  label = "Request body"
): ContentTypeValidationResult {
  return validateContentTypeHeader(request.headers.get("content-type"), expectedMediaTypes, label);
}
