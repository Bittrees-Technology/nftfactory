export type RequestBodyParseResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      error: string;
      ok: false;
      status: 400;
    };

export async function parseJsonRequestBody<T>(
  request: Pick<Request, "json">,
  label = "Request body"
): Promise<RequestBodyParseResult<T>> {
  try {
    return {
      ok: true,
      value: (await request.json()) as T
    };
  } catch {
    return {
      error: `${label} is not valid JSON.`,
      ok: false,
      status: 400
    };
  }
}

export async function parseFormDataRequestBody(
  request: Pick<Request, "formData">,
  label = "Request body"
): Promise<RequestBodyParseResult<FormData>> {
  try {
    return {
      ok: true,
      value: await request.formData()
    };
  } catch {
    return {
      error: `${label} is not valid multipart form-data.`,
      ok: false,
      status: 400
    };
  }
}
