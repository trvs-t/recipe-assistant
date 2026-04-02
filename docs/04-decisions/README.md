# Architecture Decision Records

Records of significant architectural decisions.

## Format

Each ADR follows this format:

```markdown
# ADR-XXX: Title

**Status:** Proposed / Accepted / Deprecated / Superseded

**Date:** YYYY-MM-DD

**Context:**
What is the issue we're seeing?

**Decision:**
What decision was made?

**Rationale:**
Why was this decision made?

**Alternatives Considered:**
- Option 1: Why rejected
- Option 2: Why rejected

**Consequences:**
- Positive consequences
- Negative consequences

**Related:**
- Links to related docs
```

## Records

| ID | Title | Status |
|----|-------|--------|
| ADR-001 | [Consolidated Import-Recipe Endpoint](./001-consolidated-import-endpoint.md) | Accepted |

## Future Decisions to Document

- Edge Functions vs Background Workers
- Riverpod vs Bloc for state management
- Drift vs Hive for local database
- GPT-4 vs GPT-3.5 for parsing
- Self-hosting vs Cloud Supabase
