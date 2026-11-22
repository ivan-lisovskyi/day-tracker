/**
 * An error the app can show as is: an HTTP status, a stable code and a Russian message.
 * Anything else that is thrown becomes a generic 500.
 */
export class PlanError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'PlanError';
    this.status = status;
    this.code = code;
  }
}
