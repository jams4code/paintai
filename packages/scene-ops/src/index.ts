/**
 * scene-ops: the domain core.
 *
 * Pure functions over scene data. No React, no Tauri, no MCP, no DOM. Both the
 * UI and the agent surface depend inward on this, and neither knows the other
 * exists. If an import here ever reaches outward, the architecture has broken.
 */

export { validateSpecs, type ValidationResult } from './validate'
export { hydrate, type HydrateOptions } from './hydrate'
export { toSceneElements, describeScene } from './query'
export { arrange } from './layout'
export { boundsOf, type RawElement, type Skeleton, type Move, type Rect } from './types'
