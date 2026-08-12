/**
 * Service-layer errors. Both front doors translate these: the HTTP API maps
 * them to status codes, and the MCP tools turn them into messages a model can
 * act on — which is why `NotFound` names the thing, not just an id.
 */
export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} not found`)
    this.name = 'NotFoundError'
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}
