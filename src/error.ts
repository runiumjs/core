/**
 * Runium error class
 */
export class RuniumError extends Error {
  code: string;

  payload: unknown;

  constructor(message: string, code: string, payload: unknown = null) {
    super(message);
    this.code = code;
    this.payload = payload;
  }
}

/**
 * Checks if the given error is a RuniumError
 * @param error
 */
export function isRuniumError(error: unknown): boolean {
  return !!error && error instanceof RuniumError;
}
