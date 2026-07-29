import { z } from "zod";
import { failure } from "@/server/http/responses";

export async function readJson<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<z.infer<T>> {
  return schema.parse(await request.json());
}

export function route<Arguments extends unknown[]>(
  handler: (
    request: Request,
    ...arguments_: Arguments
  ) => Promise<Response> | Response,
) {
  return async (request: Request, ...arguments_: Arguments) => {
    try {
      return await handler(request, ...arguments_);
    } catch (error) {
      return failure(error);
    }
  };
}

export function appendCookies(response: Response, values: string[]) {
  for (const value of values) response.headers.append("set-cookie", value);
  return response;
}
