import { isPrivateOrLocalUrl } from "./ipfsUpload";

type BackendFetchErrorOptions = {
  serviceLabel: string;
  envVarName: string;
  baseUrl?: string;
};

function extractErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || "");
}

function isLikelyFetchFailure(error: unknown): boolean {
  const message = extractErrorMessage(error).toLowerCase();
  return message.includes("fetch failed") || message.includes("failed to fetch");
}

export function normalizeBackendFetchError(error: unknown, options: BackendFetchErrorOptions): Error {
  const { serviceLabel, envVarName, baseUrl } = options;

  if (baseUrl && isPrivateOrLocalUrl(baseUrl)) {
    return new Error(
      `${serviceLabel} ${baseUrl} is not reachable from this deployment. Set ${envVarName} to a public HTTP(S) endpoint.`
    );
  }

  if (isLikelyFetchFailure(error)) {
    return new Error(
      `${serviceLabel} request failed. Verify ${envVarName} points to a reachable public HTTP(S) endpoint and the service is online.`
    );
  }

  return error instanceof Error ? error : new Error(extractErrorMessage(error) || `${serviceLabel} request failed.`);
}

export function parseJsonResponse<T>(text: string, fallbackMessage: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(fallbackMessage);
  }
}
