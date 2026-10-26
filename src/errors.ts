// SPDX-License-Identifier: Apache-2.0

export class AdvisorError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export function invalid(message: string): never {
  throw new AdvisorError("invalid_request", message, 400);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
