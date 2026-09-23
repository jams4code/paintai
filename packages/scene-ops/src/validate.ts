import { SpecListSchema, type Spec } from '@paintai/protocol'

/**
 * Checking specs before anything touches the canvas.
 *
 * Validating after applying is useless: by then a broken diagram is already in
 * front of the user and the undo stack is dirty. Everything here runs first,
 * and a failure returns messages written for a model to act on rather than a
 * stack trace. "unknown ref 'box_3'" tells an agent exactly what to fix.
 */

export type ValidationResult = { ok: true; specs: Spec[] } | { ok: false; errors: string[] }

/** Ids an arrow may point at. Only shapes and images are bindable. */
const BINDABLE = new Set(['box', 'image'])

/**
 * @param knownIds ids already on the canvas. An arrow may bind to one of these
 *   as well as to something created in the same batch, so an agent can connect
 *   new work to what is already there without recreating it.
 */
export function validateSpecs(input: unknown, knownIds: Iterable<string> = []): ValidationResult {
  const parsed = SpecListSchema.safeParse(input)

  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => {
        const where = issue.path.length > 0 ? issue.path.join('.') : 'root'
        return `${where}: ${issue.message}`
      }),
    }
  }

  const specs = parsed.data
  const errors: string[] = []

  // Duplicate ids silently overwrite each other during hydration, producing a
  // scene that is missing elements with no error anywhere.
  const existing = new Set(knownIds)
  const seen = new Set<string>(existing)
  const declared = new Set<string>()

  for (const spec of specs) {
    if (!spec.id) continue
    if (declared.has(spec.id)) errors.push(`duplicate id '${spec.id}'`)
    declared.add(spec.id)
    seen.add(spec.id)
  }

  // Anything already on the canvas is assumed bindable. Its real type is not
  // knowable here, and the renderer refuses the bind if it turns out not to be.
  const bindable = new Set([
    ...existing,
    ...specs.filter((s) => s.id && BINDABLE.has(s.kind)).map((s) => s.id as string),
  ])

  for (const spec of specs) {
    if (spec.kind !== 'arrow') continue

    for (const [side, endpoint] of [
      ['from', spec.from],
      ['to', spec.to],
    ] as const) {
      if (!('ref' in endpoint)) continue

      if (!seen.has(endpoint.ref)) {
        errors.push(`arrow ${side} references unknown id '${endpoint.ref}'`)
      } else if (!bindable.has(endpoint.ref)) {
        // Binding to text produces an arrow that looks attached but detaches on
        // the first drag, which is worse than refusing outright.
        errors.push(`arrow ${side} references '${endpoint.ref}', which is not a bindable shape`)
      }
    }
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, specs }
}
