import { describe, expect, it } from "vitest";
import { validateContentTypeHeader, validateRequestContentType } from "./requestContentType";

describe("requestContentType", () => {
  it("accepts matching content types with parameters", () => {
    expect(validateContentTypeHeader("application/json; charset=utf-8", "application/json")).toBeNull();
    expect(
      validateRequestContentType(
        new Request("https://nftfactory.org", {
          method: "POST",
          headers: {
            "content-type": "multipart/form-data; boundary=abc123"
          }
        }),
        "multipart/form-data",
        "Upload payload"
      )
    ).toBeNull();
  });

  it("rejects missing content types", () => {
    expect(validateContentTypeHeader(null, "application/json")).toEqual({
      error: "Request body must use application/json content-type.",
      status: 415
    });
  });

  it("rejects mismatched content types", () => {
    expect(validateContentTypeHeader("text/plain", "application/json", "Profile payload")).toEqual({
      error: "Profile payload must use application/json content-type.",
      status: 415
    });
  });

  it("supports multiple allowed content types", () => {
    expect(
      validateContentTypeHeader("application/ld+json", ["application/json", "application/ld+json"], "Manifest payload")
    ).toBeNull();
    expect(
      validateContentTypeHeader("text/plain", ["application/json", "application/ld+json"], "Manifest payload")
    ).toEqual({
      error: "Manifest payload must use application/json or application/ld+json content-type.",
      status: 415
    });
  });
});
