# Architecture Documentation

System architecture, database schema, API contracts, and implementation patterns.

## Documents

### 01-system-overview.md
High-level system architecture, technology stack, and component overview.

**Read this first** to understand:
- Overall system design
- Data flow between components
- Technology choices
- File structure

### 02-database-schema.md
PostgreSQL schema, tables, relationships, RLS policies, and indexes.

**For:** Database migrations, SQL queries, understanding data model

### 03-edge-functions.md
Serverless function specifications, parser plugin system, and external integrations.

**For:** Implementing URL validation, recipe parsing, image processing

### 04-frontend-patterns.md
Flutter architecture, state management with Riverpod, offline-first patterns, voice navigation.

**For:** Repository classes, providers, UI components, offline sync

### 05-api-contracts.md
REST endpoints, type definitions (TypeScript & Dart), error handling standards.

**For:** API integration, type definitions, error handling

## Relationships

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  System Overview │────▶│  Database Schema │────▶│ Edge Functions  │
│  (Start here)    │     │  (Data layer)    │     │  (Backend)      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
         │                                               │
         │                       ┌───────────────────────┘
         │                       │
         ▼                       ▼
┌─────────────────┐     ┌─────────────────┐
│  Frontend       │◀────│  API Contracts  │
│  Patterns       │     │  (Interface)    │
└─────────────────┘     └─────────────────┘
```

## Common Tasks

**Adding a new database table:**
1. Update [02-database-schema.md](./02-database-schema.md)
2. Create migration in `supabase/migrations/`
3. Update API types in [05-api-contracts.md](./05-api-contracts.md)
4. Add Dart model

**Creating a new Edge Function:**
1. Define interface in [05-api-contracts.md](./05-api-contracts.md)
2. Implement in `supabase/functions/{name}/`
3. Document in [03-edge-functions.md](./03-edge-functions.md)

**Creating a Repository:**
1. Define interface
2. Implement following patterns in [04-frontend-patterns.md](./04-frontend-patterns.md)
3. Create corresponding provider

## Quick Reference

See [../00-quick-reference.md](../00-quick-reference.md) for implementation templates and cheat sheets.
