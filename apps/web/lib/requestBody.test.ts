import { describe, expect, it, vi } from "vitest";
import { parseFormDataRequestBody, parseJsonRequestBody } from "./requestBody";

describe("requestBody", () => {
  it("parses valid JSON request bodies", async () => {
    await expect(
      parseJsonRequestBody<{ ok: boolean }>(
        {
          json: vi.fn().mockResolvedValue({ ok: true })
        },
        "Profile payload"
      )
    ).resolves.toEqual({
      ok: true,
      value: { ok: true }
    });
  });

  it("returns 400 for invalid JSON request bodies", async () => {
    await expect(
      parseJsonRequestBody(
        {
          json: vi.fn().mockRejectedValue(new Error("bad json"))
        },
        "Profile payload"
      )
    ).resolves.toEqual({
      error: "Profile payload is not valid JSON.",
      ok: false,
      status: 400
    });
  });

  it("parses valid multipart request bodies", async () => {
    const formData = new FormData();
    formData.set("name", "NFT");

    await expect(
      parseFormDataRequestBody(
        {
          formData: vi.fn().mockResolvedValue(formData)
        },
        "Upload payload"
      )
    ).resolves.toEqual({
      ok: true,
      value: formData
    });
  });

  it("returns 400 for invalid multipart request bodies", async () => {
    await expect(
      parseFormDataRequestBody(
        {
          formData: vi.fn().mockRejectedValue(new Error("bad multipart"))
        },
        "Upload payload"
      )
    ).resolves.toEqual({
      error: "Upload payload is not valid multipart form-data.",
      ok: false,
      status: 400
    });
  });
});
