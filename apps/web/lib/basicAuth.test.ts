import { describe, expect, it } from "vitest";
import {
  buildBasicAuthChallenge,
  isAuthorizedBasicAuth,
  parseBasicAuthHeader,
  resolveBasicAuthConfig
} from "./basicAuth";

function toHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
}

describe("basicAuth", () => {
  it("stays disabled when no password is configured", () => {
    expect(resolveBasicAuthConfig({})).toEqual({
      enabled: false,
      misconfigured: false,
      username: "viewer",
      password: ""
    });
  });

  it("enables protection when a password is set", () => {
    expect(resolveBasicAuthConfig({ SITE_BASIC_AUTH_PASSWORD: "secret" })).toEqual({
      enabled: true,
      misconfigured: false,
      username: "viewer",
      password: "secret"
    });
  });

  it("marks explicit enablement without a password as misconfigured", () => {
    expect(resolveBasicAuthConfig({ SITE_BASIC_AUTH_ENABLED: "true" })).toEqual({
      enabled: true,
      misconfigured: true,
      username: "viewer",
      password: ""
    });
  });

  it("parses a valid basic auth header", () => {
    expect(parseBasicAuthHeader(toHeader("viewer", "secret"))).toEqual({
      username: "viewer",
      password: "secret"
    });
  });

  it("rejects invalid auth headers", () => {
    expect(parseBasicAuthHeader(null)).toBeNull();
    expect(parseBasicAuthHeader("Bearer token")).toBeNull();
    expect(parseBasicAuthHeader("Basic not-base64")).toBeNull();
  });

  it("authorizes only matching credentials", () => {
    const env = {
      SITE_BASIC_AUTH_USERNAME: "robert",
      SITE_BASIC_AUTH_PASSWORD: "secret"
    };
    expect(isAuthorizedBasicAuth(toHeader("robert", "secret"), env)).toBe(true);
    expect(isAuthorizedBasicAuth(toHeader("viewer", "secret"), env)).toBe(false);
    expect(isAuthorizedBasicAuth(toHeader("robert", "wrong"), env)).toBe(false);
  });

  it("builds a standard challenge header", () => {
    expect(buildBasicAuthChallenge()).toBe('Basic realm="NFTFactory", charset="UTF-8"');
  });
});
