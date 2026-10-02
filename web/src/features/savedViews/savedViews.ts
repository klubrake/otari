/** A view a page offers by name, before anyone has saved one: a query string under a name. */
export interface BuiltInView {
  name: string
  query: string
  /** What the view shows, where its name alone does not say. */
  description?: string
}
