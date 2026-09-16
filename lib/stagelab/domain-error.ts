/**
 * An input the engines can reject in terms the customer can act on.
 *
 * The distinction this type draws is the whole point: `StageInputError`
 * carries a message written FOR a user and is safe to return; anything else
 * thrown out of an engine is a defect, whose message may name a column, a
 * constraint or a host, and must be logged rather than rendered.
 *
 * Routes therefore never test `error instanceof Error` — that is true of
 * both kinds and tells them nothing.
 */
export class StageInputError extends Error {
  readonly userFacing = true

  constructor(message: string) {
    super(message)
    this.name = 'StageInputError'
  }
}

export function isStageInputError(error: unknown): error is StageInputError {
  return error instanceof StageInputError
}
