import { z } from "zod";
import { failure } from "@/server/http/responses";

export async function readJson<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<z.infer<T>> {
  return schema.parse(await request.json());
}

export function route(
  handler: (request: Request) => Promise<Response> | Response,
) {
  return async (request: Request) => {
    try {
      return await handler(request);
    } catch (error) {
      return failure(error);
    }
  };
}

export function appendCookies(response: Response, values: string[]) {
  for (const value of values) response.headers.append("set-cookie", value);
  return response;
}
