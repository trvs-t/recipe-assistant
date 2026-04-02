# Documentation

Recipe Saver and Viewer Assistant - Technical Documentation

## Quick Start

New to the project? Start here:
1. [Quick Reference](./00-quick-reference.md) - One-page cheat sheet
2. [Domain Specification](./01-domain-specification.md) - What we're building
3. [System Overview](./02-architecture/01-system-overview.md) - How it works

## Document Index

### Quick Reference
- **[00-quick-reference.md](./00-quick-reference.md)** - Implementation cheat sheet, templates, patterns

### Requirements
- **[01-domain-specification.md](./01-domain-specification.md)** - Functional requirements, user stories, data models, constraints

### Architecture
- **[02-architecture/01-system-overview.md](./02-architecture/01-system-overview.md)** - High-level architecture, tech stack, data flow
- **[02-architecture/02-database-schema.md](./02-architecture/02-database-schema.md)** - SQL schema, tables, RLS policies, indexes
- **[02-architecture/03-edge-functions.md](./02-architecture/03-edge-functions.md)** - Serverless function specs, parser plugin system
- **[02-architecture/04-frontend-patterns.md](./02-architecture/04-frontend-patterns.md)** - Flutter architecture, state management, offline-first
- **[02-architecture/05-api-contracts.md](./02-architecture/05-api-contracts.md)** - REST endpoints, type definitions, error handling

### Research
- **[03-research-findings.md](./03-research-findings.md)** - Technology analysis, library comparisons, patterns

### Decisions
- **[04-decisions/](./04-decisions/)** - Architecture Decision Records (ADRs)

## Document Organization

```
docs/
├── 00-quick-reference.md              # One-page cheat sheet
├── 01-domain-specification.md         # Requirements (unified, ~450 lines)
├── 02-architecture/                   # Architecture (split by topic)
│   ├── 01-system-overview.md          # High-level (~100 lines)
│   ├── 02-database-schema.md          # Database (~250 lines)
│   ├── 03-edge-functions.md           # Serverless (~300 lines)
│   ├── 04-frontend-patterns.md        # Flutter (~250 lines)
│   └── 05-api-contracts.md            # APIs (~200 lines)
├── 03-research-findings.md            # Research (unified, ~650 lines)
├── 04-decisions/                      # ADRs
│   └── 001-consolidated-import-endpoint.md
└── README.md                          # This file
```

## For AI Agents

When implementing a feature:

1. **Check Quick Reference** - Implementation templates, patterns
2. **Check Architecture** - Specific component docs (db, edge, frontend)
3. **Check Domain Spec** - Requirements, data models
4. **Check API Contracts** - Interface definitions, types

**Typical workflow by task:**

| Task | Primary Doc | Secondary Doc |
|------|-------------|---------------|
| Add DB field | [02-database-schema.md](./02-architecture/02-database-schema.md) | [01-domain-specification.md](./01-domain-specification.md) |
| Create Edge Function | [03-edge-functions.md](./02-architecture/03-edge-functions.md) | [05-api-contracts.md](./02-architecture/05-api-contracts.md) |
| Create Repository | [04-frontend-patterns.md](./02-architecture/04-frontend-patterns.md) | [05-api-contracts.md](./02-architecture/05-api-contracts.md) |
| Create Provider | [04-frontend-patterns.md](./02-architecture/04-frontend-patterns.md) | [00-quick-reference.md](./00-quick-reference.md) |
| API changes | [05-api-contracts.md](./02-architecture/05-api-contracts.md) | [03-edge-functions.md](./02-architecture/03-edge-functions.md) |

## Key Decisions

- **Self-hosted**: User owns all data, no SaaS
- **Flutter**: Cross-platform mobile + web
- **Supabase**: PostgreSQL + Auth + Storage + Edge Functions
- **Offline-first**: Local SQLite cache, background sync
- **AI parsing**: OpenRouter (free tier: `qwen/qwen3.6-plus-preview:free`)

## Project Status

- Phase: Core implementation complete
- Edge Functions: `import-recipe` consolidated endpoint (E2E tested)
- AI Integration: Working with OpenRouter free models
- Next: Flutter client integration testing

## Quick Links

- [Main Project README](../README.md)
- [Quick Reference](./00-quick-reference.md)
- [Domain Specification](./01-domain-specification.md)
- [System Overview](./02-architecture/01-system-overview.md)

---

*Last Updated: April 2026*
