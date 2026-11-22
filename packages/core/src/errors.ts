/**
 * Error classes shared by every entry (`acture` and `acture/lite`).
 *
 * Kept in their own module so the lite entry can throw the same classes
 * as the full one without importing the when-clause DSL that
 * `defineCommand`'s validation pulls in.
 */

/** Thrown when a command spec violates a registration-time constraint. */
export class RegistrationError extends Error {
  constructor(message: string, public readonly commandId?: string) {
    super(message);
    this.name = 'RegistrationError';
  }
}

/** Thrown by `register` / `registerAll` on a duplicate id when
 *  `strictDuplicates` is on (the default). */
export class DuplicateCommandError extends Error {
  constructor(public readonly commandId: string) {
    super(`Command "${commandId}" is already registered`);
    this.name = 'DuplicateCommandError';
  }
}
