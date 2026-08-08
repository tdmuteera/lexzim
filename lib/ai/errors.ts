import "server-only";

export type AiProviderErrorCode =
  | "missing_key"
  | "invalid_key"
  | "rate_limited"
  | "network_error"
  | "provider_error"
  | "not_implemented"
  | "budget_exceeded";

export class AiProviderError extends Error {
  readonly code: AiProviderErrorCode;
  readonly httpStatus?: number;

  constructor(code: AiProviderErrorCode, message: string, httpStatus?: number) {
    super(message);
    this.name = "AiProviderError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export class MissingKeyError extends AiProviderError {
  constructor(message = "AI API key is not configured on the server.") {
    super("missing_key", message, 400);
    this.name = "MissingKeyError";
  }
}

export class InvalidKeyError extends AiProviderError {
  constructor(message = "AI API key was rejected by the provider.") {
    super("invalid_key", message, 401);
    this.name = "InvalidKeyError";
  }
}

export class RateLimitedError extends AiProviderError {
  constructor(message = "AI provider rate limit exceeded.") {
    super("rate_limited", message, 429);
    this.name = "RateLimitedError";
  }
}

export class NetworkError extends AiProviderError {
  constructor(message = "Could not reach the AI provider.") {
    super("network_error", message, 503);
    this.name = "NetworkError";
  }
}

export class ProviderError extends AiProviderError {
  constructor(message = "AI provider returned an error.", httpStatus?: number) {
    super("provider_error", message, httpStatus ?? 502);
    this.name = "ProviderError";
  }
}

export class NotImplementedProviderError extends AiProviderError {
  constructor(provider: string) {
    super(
      "not_implemented",
      `${provider} provider is not available in this build.`,
      501,
    );
    this.name = "NotImplementedProviderError";
  }
}
