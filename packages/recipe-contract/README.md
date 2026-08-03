# Recipe contract

Canonical TypeScript and Zod contracts shared by the web application and the
import-v2 boundary.

The API uses camelCase. Supabase adapters are responsible for translating to the
existing snake_case persistence schema. Importers must retain `sourceUrl`; the
web app exposes it through an external “Open source” action.

`createLinearFlow` is the guaranteed visualization fallback. Enrichment may add
dependency edges and ingredient-to-step links, but a missing enrichment must
never prevent a parsed recipe from being displayed.
