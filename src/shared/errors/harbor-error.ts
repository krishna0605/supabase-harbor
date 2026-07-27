export class HarborError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
    public readonly retryable = false,
    public readonly context?: { accountId?: string; projectRef?: string },
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "HarborError";
  }
}
