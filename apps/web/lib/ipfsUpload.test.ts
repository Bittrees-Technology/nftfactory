import { describe, expect, it } from "vitest";
import {
  buildIpfsAddUrl,
  buildIpfsAuthHeaders,
  buildIpfsReachabilityError,
  isPrivateOrLocalUrl,
  parseIpfsAddResponse
} from "./ipfsUpload";

describe("ipfsUpload", () => {
  it("builds a Kubo add URL from a base host", () => {
    expect(buildIpfsAddUrl("http://127.0.0.1:5001")).toBe(
      "http://127.0.0.1:5001/api/v0/add?pin=true&cid-version=1&wrap-with-directory=false"
    );
  });

  it("extends an api/v0 base path cleanly", () => {
    expect(buildIpfsAddUrl("http://127.0.0.1:5001/api/v0")).toBe(
      "http://127.0.0.1:5001/api/v0/add?pin=true&cid-version=1&wrap-with-directory=false"
    );
  });

  it("preserves an explicit add endpoint and existing query params", () => {
    expect(buildIpfsAddUrl("http://127.0.0.1:5001/api/v0/add?stream-channels=true")).toBe(
      "http://127.0.0.1:5001/api/v0/add?stream-channels=true&pin=true&cid-version=1&wrap-with-directory=false"
    );
  });

  it("builds bearer auth headers when a token is configured", () => {
    expect(buildIpfsAuthHeaders({ IPFS_API_BEARER_TOKEN: "token" })).toEqual({
      Authorization: "Bearer token"
    });
  });

  it("builds basic auth headers when username and password are configured", () => {
    expect(buildIpfsAuthHeaders({ IPFS_API_BASIC_AUTH_USERNAME: "admin", IPFS_API_BASIC_AUTH_PASSWORD: "secret" })).toEqual({
      Authorization: `Basic ${Buffer.from("admin:secret", "utf8").toString("base64")}`
    });
  });

  it("rejects partial basic auth configuration", () => {
    expect(() => buildIpfsAuthHeaders({ IPFS_API_BASIC_AUTH_USERNAME: "admin" })).toThrow(
      "IPFS API basic auth requires both IPFS_API_BASIC_AUTH_USERNAME and IPFS_API_BASIC_AUTH_PASSWORD."
    );
  });

  it("parses a standard Kubo add response", () => {
    expect(parseIpfsAddResponse('{"Name":"file","Hash":"bafy123","Size":"42"}\n')).toBe("bafy123");
  });

  it("parses newline-delimited add responses", () => {
    expect(
      parseIpfsAddResponse(
        '{"Name":"part-1","Hash":"bafyOld","Size":"1"}\n{"Name":"file","Hash":"bafyFinal","Size":"42"}\n'
      )
    ).toBe("bafyFinal");
  });

  it("treats localhost and private network backends as non-public", () => {
    expect(isPrivateOrLocalUrl("http://127.0.0.1:5001")).toBe(true);
    expect(isPrivateOrLocalUrl("http://192.168.1.115:5001")).toBe(true);
    expect(isPrivateOrLocalUrl("http://10.0.0.5:5001")).toBe(true);
    expect(isPrivateOrLocalUrl("http://172.20.10.2:5001")).toBe(true);
    expect(isPrivateOrLocalUrl("https://ipfs.example.com/api/v0")).toBe(false);
  });

  it("builds a clear reachability error", () => {
    expect(buildIpfsReachabilityError("http://192.168.1.115:5001")).toContain("192.168.1.115:5001");
    expect(buildIpfsReachabilityError("http://192.168.1.115:5001")).toContain("public HTTP(S) endpoint");
  });
});
