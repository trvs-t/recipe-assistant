# System Overview

**Related Docs:** [Database Schema](./02-database-schema.md) | [Edge Functions](./03-edge-functions.md) | [Frontend Patterns](./04-frontend-patterns.md)

## Architecture Style
**Serverless/Event-Driven with Offline-First Client**

The system follows a modern serverless architecture using Supabase as the backend platform, with Flutter providing an offline-capable frontend. The design emphasizes:
- Stateless serverless functions for processing
- Event-driven workflows for async operations
- Offline-first client with optimistic UI
- Self-hostable infrastructure

## High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT (Flutter)                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Recipe List  │  │ Recipe View  │  │   Scaling    │          │
│  │    Screen    │  │    Screen    │  │   Calculator │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                  │                  │
│  ┌──────────────────────────────────────────────────────┐      │
│  │              Local Database (SQLite)                 │      │
│  │  • Recipes cache    • Offline queue   • Settings     │      │
│  └──────────────────────────────────────────────────────┘      │
│                              │                                  │
└──────────────────────────────┼──────────────────────────────────┘
                               │ HTTPS/WSS
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      SUPABASE PLATFORM                          │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐    │
│  │  PostgreSQL    │  │   Auth/RLS     │  │    Storage     │    │
│  │  • recipes     │  │  • JWT tokens  │  │  • images      │    │
│  │  • ingredients │  │  • Row security│  │  • exports     │    │
│  │  • steps       │  └────────────────┘  └────────────────┘    │
│  └───────┬────────┘                                            │
│          │                                                      │
│  ┌───────▼──────────────────────────────────────────────────┐  │
│  │              Database Triggers & Webhooks                 │  │
│  └───────┬───────────────────────────────────────────────────┘  │
└──────────┼──────────────────────────────────────────────────────┘
           │
           ▼ HTTP
┌─────────────────────────────────────────────────────────────────┐
│                    EDGE FUNCTIONS (Deno/TS)                     │
│  ┌──────────────────┐  ┌──────────────────┐                    │
│  │ URL Validator    │  │ Recipe Parser    │                    │
│  │ • Fetch URL      │  │ • Extract HTML   │                    │
│  │ • AI validation  │  │ • Structured data│                    │
│  │ • Return status  │  │ • AI extraction  │                    │
│  └──────────────────┘  └──────────────────┘                    │
│                                                                  │
│  ┌──────────────────┐  ┌──────────────────┐                    │
│  │ Site Parsers     │  │ Image Processor  │                    │
│  │ • AllRecipes     │  │ • Download       │                    │
│  │ • BBC Good Food  │  │ • Resize         │                    │
│  │ • Generic JSON-LD│  │ • Store to R2    │                    │
│  └──────────────────┘  └──────────────────┘                    │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼ API
┌─────────────────────────────────────────────────────────────────┐
│                   EXTERNAL SERVICES                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │  OpenAI/    │  │   Origin    │  │   Recipe    │             │
│  │  Anthropic  │  │   Websites  │  │   Images    │             │
│  │  (LLM)      │  │  (HTTP)     │  │   (CDN)     │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow

### Recipe Save Flow
```
User enters URL
    ↓
Client calls POST /functions/v1/validate-url
    ↓
Edge Function fetches URL, validates with AI
    ↓
Save recipe record (status: 'pending')
    ↓
Database trigger calls parse-recipe function
    ↓
Edge Function: parse-recipe
    - Try site-specific parser
    - Fallback: schema extraction
    - Fallback: AI extraction
    ↓
Update recipe (status: 'parsed')
    ↓
Client receives realtime update
    ↓
Recipe available offline
```

## Technology Stack Summary

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | Flutter 3.x | Cross-platform UI |
| **State** | Riverpod | Type-safe state management |
| **Local DB** | Drift (SQLite) | Offline-first cache |
| **Backend** | Supabase | Auth, Database, Storage |
| **Database** | PostgreSQL 15 | Structured data |
| **Serverless** | Deno Edge Functions | Async processing |
| **AI** | OpenAI GPT-3.5/4 | Recipe extraction |
| **Hosting** | Docker Compose | Self-hosted deployment |

## Component Overview

### Frontend (Flutter)
- **Location:** `apps/mobile/`
- **Key Patterns:** See [Frontend Patterns](./04-frontend-patterns.md)
- **Responsibilities:**
  - UI rendering
  - Local data cache
  - Offline queue management
  - Voice navigation
  - Recipe scaling calculations

### Database (PostgreSQL)
- **Key Tables:** See [Database Schema](./02-database-schema.md)
- **Features:**
  - Row Level Security (RLS)
  - Full-text search
  - Triggers for async processing

### Edge Functions (Deno)
- **Location:** `supabase/functions/`
- **Key Functions:** See [Edge Functions](./03-edge-functions.md)
- **Responsibilities:**
  - URL validation
  - Recipe parsing
  - Image processing

## File Structure

```
recipe-assistant/
├── apps/
│   └── mobile/              # Flutter app
│       ├── lib/
│       │   ├── data/        # Repositories, models
│       │   ├── domain/      # Use cases, business logic
│       │   └── presentation/# UI, providers
│       └── test/
├── supabase/
│   ├── functions/           # Edge Functions
│   │   ├── validate-url/
│   │   ├── parse-recipe/
│   │   └── _shared/         # Shared types, utils
│   └── migrations/          # SQL migrations
└── docker-compose.yml       # Self-hosting config
```

## Quick Links

- **Database Schema:** [02-database-schema.md](./02-database-schema.md)
- **Edge Functions:** [03-edge-functions.md](./03-edge-functions.md)
- **Frontend Patterns:** [04-frontend-patterns.md](./04-frontend-patterns.md)
- **API Contracts:** [05-api-contracts.md](./05-api-contracts.md)
- **Domain Specification:** [../01-domain-specification.md](../01-domain-specification.md)
