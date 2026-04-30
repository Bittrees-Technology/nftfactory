import { describe, expect, it } from "vitest";
import { validateContentLengthHeader, validateRequestContentLength } from "./requestSize";

describe("requestSize", () => {
  it("allows requests without a content-length header", () => {
    expect(validateContentLengthHeader(null, 1024)).toBeNull();
    expect(validateRequestContentLength(new Request("https://nftfactory.org"), 1024)).toBeNull();
  });

  it("rejects invalid content-length headers", () => {
    expect(validateContentLengthHeader("abc", 1024)).toEqual({
      error: "Request body content-length header is invalid.",
      status: 400
    });
    expect(validateContentLengthHeader("-5", 1024, "Upload payload")).toEqual({
      error: "Upload payload content-length header is invalid.",
      status: 400
    });
  });

  it("rejects bodies larger than the configured limit", () => {
    expect(validateContentLengthHeader("2048", 1024)).toEqual({
      error: "Request body exceeds the 1KB limit.",
      status: 413
    });
    expect(validateContentLengthHeader(String(2 * 1024 * 1024), 1024 * 1024, "Profile payload")).toEqual({
      error: "Profile payload exceeds the 1MB limit.",
      status: 413
    });
  });

  it("accepts bodies within the configured limit", () => {
    expect(validateContentLengthHeader("1024", 1024)).toBeNull();
    expect(
      validateRequestContentLength(
        new Request("https://nftfactory.org", {
          method: "POST",
          headers: { "content-length": "512" }
        }),
        1024,
        "Verification payload"
      )
    ).toBeNull();
  });
});
