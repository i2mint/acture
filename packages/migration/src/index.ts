/**
 * `@acture/migration` — strangler-fig adoption primitives.
 *
 * Four functions per research-4 §A.6:
 *   - `wrapMutation` — wrap an existing handler as a command without
 *     changing its call sites.
 *   - `actureMiddleware` — Redux/RTK middleware that observes
 *     dispatched actions and emits matching command events.
 *   - `chooseImplementation` — 5-line legacy/modern router that
 *     composes with any feature-flag SDK.
 *   - `shadowCompare` — Scientist-style A/B with "modern wins" default.
 *
 * v1.2 adds the DOM half of the Event Interception pattern (research-4
 * §A.5):
 *   - `createDomInterceptor` — delegated DOM listener that routes
 *     `data-acture-command` events through the registry.
 *
 * Pair with the `.claude/skills/migration-*` skills for the recommended
 * adoption workflow.
 */

export { wrapMutation, readWrappedCommandId } from './wrap-mutation.js';
export type {
  WrapMutationOptions,
  AnyHandler,
} from './wrap-mutation.js';

export { actureMiddleware } from './middleware.js';
export type {
  ActureMiddlewareOptions,
  ReduxAction,
  ReduxMiddleware,
  ReduxStoreLike,
} from './middleware.js';

export { chooseImplementation } from './choose-implementation.js';

export { shadowCompare } from './shadow-compare.js';
export type { ShadowCompareOptions } from './shadow-compare.js';

export { createDomInterceptor } from './dom-interceptor.js';
export type {
  DomInterceptorOptions,
  DomInterceptorMount,
} from './dom-interceptor.js';

export type { Logger } from './logger.js';
