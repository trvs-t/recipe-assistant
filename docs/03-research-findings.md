# Research Findings: Recipe Saver and Viewer Assistant

## Executive Summary

This document presents research findings on recipe parsing technologies, similar applications, scaling algorithms, and technical architecture patterns. The research informs architectural decisions for building a self-hosted recipe management application with intelligent parsing and ingredient scaling capabilities.

---

## 1. Recipe Parsing Technologies

### 1.1 Current State of Recipe Parsing

#### 1.1.1 Structured Data Extraction

**Schema.org Recipe Markup**
- Most modern recipe sites use JSON-LD or microdata with Schema.org Recipe schema
- Standard fields: name, recipeIngredient, recipeInstructions, prepTime, cookTime, recipeYield
- ISO 8601 duration format (PT30M = 30 minutes)
- **Success Rate**: 70-80% on major recipe sites

**Example Schema:**
```json
{
  "@context": "https://schema.org",
  "@type": "Recipe",
  "name": "Classic Chocolate Chip Cookies",
  "recipeIngredient": [
    "2 1/4 cups all-purpose flour",
    "1 cup butter, softened"
  ],
  "recipeInstructions": [
    {"@type": "HowToStep", "text": "Preheat oven to 375°F"}
  ],
  "prepTime": "PT20M",
  "cookTime": "PT10M",
  "recipeYield": "48 cookies"
}
```

#### 1.1.2 AI-Based Extraction

**Large Language Models (LLMs)**
- **Recommended Models**: GPT-4, GPT-3.5-turbo, Claude
- **Approach**: Provide HTML/text with structured output schema (Pydantic/JSON Schema)
- **Strengths**: Handles unstructured content, social media, video descriptions
- **Weaknesses**: Cost, latency, occasional hallucinations
- **Best Practice**: Use function calling/structured output features

**LangExtract Pattern** (Google Research):
```python
from pydantic import BaseModel

class Ingredient(BaseModel):
    name: str
    quantity: float
    unit: str

class Recipe(BaseModel):
    title: str
    ingredients: list[Ingredient]
    instructions: list[str]
```

**Cost Analysis** (per recipe):
- GPT-4: ~$0.01-0.03 per extraction
- GPT-3.5-turbo: ~$0.001-0.003 per extraction
- For 100 recipes/month: ~$1-3 with GPT-3.5

#### 1.1.3 Hybrid Approaches

**CRF + LLM Pipeline** (Production Pattern):
1. **Fast Path**: Try structured data extraction first
2. **Site-Specific**: Use hardcoded parsers for known sites
3. **AI Fallback**: LLM extraction for everything else
4. **Validation**: LLM can verify low-confidence extractions

**Example from `ingredient-parser-hybrid`:**
- CRF (Conditional Random Field) parser for fast ingredient parsing
- LLM verification for low-confidence (< 0.8) results
- Embedding-based clustering for ingredient normalization

### 1.2 Ingredient Parsing

#### 1.2.1 Ingredient Structure

Standard ingredient components:
- **Quantity**: Numeric value (2, 1/2, 1.5)
- **Unit**: Standardized measurement (cup, tbsp, g, oz)
- **Name**: Normalized ingredient name (flour, butter)
- **Preparation**: Optional prep notes (softened, diced)

#### 1.2.2 Parsing Libraries

**JavaScript/TypeScript:**
- `recipe-ingredient-parser-v3`: 800+ stars, regex-based
- `parse-ingredient`: Handles common formats

**Python:**
- `ingredient-slicer`: Comprehensive regex patterns (MIT licensed)
- `ingredient-parser-nlp`: CRF-based ML approach
- `recipe-scrapers`: HTML scraping with 50+ site parsers

**Example Parsing:**
```
Input: "2 1/2 cups all-purpose flour, sifted"
Output: {
  quantity: 2.5,
  unit: "cup",
  name: "all-purpose flour",
  notes: "sifted"
}
```

### 1.3 Recipe Validation

**AI-Based Validation Approach:**
```
1. Check for Recipe schema → High confidence
2. Check for ingredient list pattern → Medium confidence  
3. AI analysis of content → Variable confidence
4. Combine signals for final decision
```

**Validation Signals:**
- Presence of "ingredients" and "instructions" sections
- Measurement units (cups, tbsp, etc.)
- Cooking verbs (bake, cook, mix)
- Time patterns (minutes, hours)

---

## 2. Similar Applications Analysis

### 2.1 Open Source Recipe Apps

#### 2.1.1 Sous Chef (github.com/gamerg21/sous-chef)
**Tech Stack:** Next.js, React 19, TypeScript, Tailwind, Supabase

**Architecture:**
- Self-hostable with Supabase-compatible stack
- PostgreSQL + Storage + Realtime
- Household-based multi-user model
- Pantry/inventory tracking
- "Cook recipe" flow with automatic inventory deduction

**Key Learnings:**
- Supabase works well for self-hosted recipe apps
- Household/sharing model is valuable
- Pantry integration is complex but desired

#### 2.1.2 Kitchen Assistant (github.com/mrjuguy/kitchen_assistant)
**Tech Stack:** Expo (React Native), Supabase, TanStack Query, NativeWind

**Features:**
- Recipe portion scaling in cooking view
- Ingredient stock status (In Stock vs Missing)
- Smart web scraper with automated tag extraction
- "Frequently Expired Insights" waste tracking

**Key Learnings:**
- Expo + Supabase is a solid mobile stack
- Recipe scaling should be prominent in cooking view
- Inventory-aware recipe viewing is powerful

#### 2.1.3 Mealie (github.com/mealie-recipes/mealie)
**Tech Stack:** Python (FastAPI), Vue.js, PostgreSQL

**Features:**
- Comprehensive recipe scraping
- Meal planning
- Shopping lists
- Multi-user support

**Parser Strategy:**
- Scraper strategies pattern (ABCScraperStrategy)
- HTML parsing with BeautifulSoup
- JSON-LD structured data extraction

#### 2.1.4 Planned Eat (github.com/Senior-Project-2026/planned-eat)
**Tech Stack:** React Native (Expo), Supabase, Spoonacular API, OpenAI GPT-4

**Features:**
- AI-powered meal planning
- Ingredient-based recipe recommendations
- Pantry management

**AI Integration:**
- GPT-4 for ingredient recognition
- Meal suggestions based on available ingredients

### 2.2 Commercial Products

**Pluck (pluckrecipes.com):**
- AI recipe extraction vs web clipping comparison
- Emphasizes AI superiority for social media/variety of sources
- Chrome extension approach

**Frigo Recipe Scraper (Apify):**
- Multi-source scraping (AllRecipes, BBC Good Food, etc.)
- Google Gemini AI for cuisine/meal type classification
- Social media optimized

### 2.3 Architecture Patterns from Research

**Common Patterns:**
1. **Recipe Scraping Pipeline**: URL → Fetch → Parse → Store → Display
2. **Offline-First**: Local cache + background sync
3. **Plugin Parser System**: Modular parsers for specific sites
4. **Scaling Calculator**: Core utility used across views

**Database Schema Patterns:**
- Recipe table (title, url, metadata, status)
- Ingredient table (recipe_id, quantity, unit, name, order)
- Step table (recipe_id, instruction, timer, order)
- Favorites/Collections junction tables

---

## 3. Ingredient Scaling Algorithms

### 3.1 Basic Scaling Formula

```
Scale Factor = Desired Servings / Original Servings
New Quantity = Original Quantity × Scale Factor
```

**Example:**
- Original: 4 servings, 2 cups flour
- Desired: 6 servings
- Scale Factor: 6/4 = 1.5
- New Quantity: 2 × 1.5 = 3 cups flour

### 3.2 Advanced Considerations

#### 3.2.1 Practical Rounding

**Fraction Conversion:**
```
1.333 cups → 1 1/3 cups
0.75 cups → 3/4 cup
0.66 tsp → 2/3 tsp ≈ 1/2 + 1/8 tsp
```

**Kitchen-Friendly Units:**
- If < 1/4 cup → Convert to tablespoons (1 cup = 16 tbsp)
- If < 1 tablespoon → Keep as teaspoons or milliliters
- Round to common measuring increments

#### 3.2.2 Unit Conversion

**Volume:**
```
1 cup = 16 tablespoons = 48 teaspoons = 240 ml
1 tablespoon = 3 teaspoons = 15 ml
1 teaspoon = 5 ml
```

**Weight:**
```
1 lb = 16 oz = 453.6 g
1 oz = 28.35 g
```

#### 3.2.3 Edge Cases

**Non-Scalable Items:**
- Salt/spices (often don't scale linearly)
- Baking powder/soda (chemistry-dependent)
- Pan size (may need adjustment, not just scaling)
- Cooking time (doesn't always scale linearly)

**Recommendations:**
- Add warning for small-quantity ingredients (< 1/4 tsp)
- Note that cooking times may vary
- For baking, recommend not scaling beyond 2x

### 3.3 Implementation Approaches

**Decimal to Fraction Conversion:**
```typescript
function decimalToFraction(decimal: number): string {
  const tolerance = 0.01;
  const commonFractions = [
    { decimal: 0.125, fraction: '1/8' },
    { decimal: 0.25, fraction: '1/4' },
    { decimal: 0.333, fraction: '1/3' },
    { decimal: 0.5, fraction: '1/2' },
    { decimal: 0.667, fraction: '2/3' },
    { decimal: 0.75, fraction: '3/4' },
  ];
  
  // Find closest common fraction
  // Or use GCD algorithm for exact conversion
}
```

---

## 4. Technology Stack Analysis

### 4.1 Frontend Framework Comparison

| Framework | Pros | Cons | Best For |
|-----------|------|------|----------|
| **Flutter** | Single codebase (iOS/Android/Web), native performance, offline capable | Larger bundle size, web not as mature | Mobile-first, offline-required |
| **React Native** | Native feel, large ecosystem | Two codebases (mobile + web), complex setup | Pure mobile focus |
| **Next.js** | Excellent web, PWA capable, SEO | Not native mobile, offline more complex | Web-primary |
| **Expo** | Easier React Native, web support | Limited native module access | Rapid mobile dev |

**Recommendation**: Flutter aligns with requirements:
- Cross-platform (mobile + web)
- Offline-first architecture support
- User preference confirmed
- Self-hostable web deployment

### 4.2 Backend Platform Comparison

| Platform | Pros | Cons | Cost |
|----------|------|------|------|
| **Supabase** | Open source, self-hostable, PostgreSQL, realtime | Newer ecosystem | Free tier, $25/mo Pro |
| **Firebase** | Mature, extensive features | Vendor lock-in, not self-hostable | Usage-based |
| **Appwrite** | Open source, simpler than Supabase | Smaller community | Self-hosted free |
| **Custom Node/Python** | Full control | More development work | Infrastructure cost |

**Recommendation**: Supabase:
- Self-hostable (requirement)
- PostgreSQL (robust, standard)
- Built-in auth and storage
- Edge functions for serverless
- Flutter SDK support

### 4.3 State Management for Flutter

| Solution | Learning Curve | Performance | Offline Support |
|----------|---------------|-------------|-----------------|
| **Riverpod** | Medium | Excellent | Good |
| **Bloc** | Steep | Excellent | Good |
| **Provider** | Easy | Good | Manual |
| **GetX** | Easy | Good | Manual |

**Recommendation**: Riverpod:
- Compile-time safety
- Excellent caching capabilities
- Built-in support for async operations
- Good testing support

### 4.4 Local Database for Flutter

| Database | Type | Sync | Best For |
|----------|------|------|----------|
| **Drift (SQLite)** | SQL | Manual | Complex queries, offline-first |
| **Hive** | NoSQL | Manual | Simple data, speed |
| **Isar** | NoSQL | Manual | Large datasets, speed |
| **WatermelonDB** | SQL | Built-in | Sync-heavy apps |

**Recommendation**: Drift (SQLite):
- SQL power for complex queries
- Good Flutter integration
- Supabase offline sync examples
- Type-safe with code generation

### 4.5 AI/LLM Options

| Provider | Model | Cost/1K tokens | Structured Output |
|----------|-------|----------------|-------------------|
| **OpenAI** | GPT-4 | $0.03/$0.06 | Yes (JSON mode) |
| **OpenAI** | GPT-3.5 | $0.0005/$0.0015 | Yes |
| **Anthropic** | Claude 3 | Similar to GPT-4 | Via prompting |
| **Local** | Llama 2/3 | Free (hardware) | Via prompting |

**Recommendation**: OpenRouter API (unified access to multiple models):
- **Primary Model:** `qwen/qwen3.6-plus-preview:free` - works out of box, no dashboard config needed
- **Alternative:** `google/gemma-3-4b-it:free` - requires "Developer instruction" setting
- **Benefits:** Single API key, fallback to different models, free tier available

**Why OpenRouter over direct OpenAI:**
- Free models available (no API cost)
- Model flexibility/fallback options
- Unified API interface

**Cost Projection (with free tier):**
- 100 recipes/month × ~2K tokens × $0 = $0/month
- Very reasonable for personal use

---

## 5. Voice Navigation Research

### 5.1 Flutter Speech Recognition

**Packages:**
- `speech_to_text`: 3.5K+ likes, active maintenance
- Supports continuous listening mode
- Platform: iOS (Speech framework), Android (SpeechRecognizer)

**Implementation Pattern:**
```dart
// Continuous listening in cooking mode
speech.listen(
  onResult: (result) => processCommand(result.recognizedWords),
  listenMode: ListenMode.dictation, // Continuous
  cancelOnError: false,
  partialResults: true,
);
```

### 5.2 Command Recognition

**Approach:**
1. Keyword spotting ("next", "previous", "repeat")
2. Intent classification (can use simple keyword matching)
3. Context-aware (only accept certain commands on certain screens)

**Command Categories:**
- Navigation: "next step", "go back", "repeat"
- Timer: "start timer", "how much time", "stop"
- Information: "how much [ingredient]", "what temperature"

### 5.3 Limitations

- Requires internet for most speech recognition
- Background noise in kitchen can affect accuracy
- Battery consumption during continuous listening
- Platform differences (iOS generally better)

**Mitigation:**
- Push-to-talk button as alternative
- Large manual controls as backup
- Visual feedback for command recognition

---

## 6. Security Best Practices

### 6.1 Self-Hosting Security

**Database:**
- Use strong PostgreSQL passwords
- Enable SSL connections
- Regular backups (automated)
- Firewall: only expose necessary ports

**Supabase:**
- Keep service_role_key secret (server-side only)
- Use Row Level Security (RLS) on all tables
- JWT secret rotation capability

**Edge Functions:**
- API keys in environment variables only
- Input validation on all endpoints
- Rate limiting (build into Deno)

### 6.2 API Key Management

**Pattern:**
```
Client (Anon Key) → Supabase Auth → RLS-enforced queries
Server (Service Key) → Edge Functions → External APIs
```

**Never:**
- Expose OpenAI keys in client code
- Commit keys to version control
- Use service key in client app

---

## 7. Deployment Patterns

### 7.1 Self-Hosting Options

**Docker Compose (Recommended):**
- Complete control
- Single server sufficient
- Easy backups
- Version pinning for stability

**Cloud VPS:**
- DigitalOcean, Hetzner, AWS Lightsail
- 2GB RAM minimum for Supabase
- 20GB storage minimum

**Home Server:**
- Raspberry Pi 4 (4GB+) possible with optimization
- Good for personal use
- Consider dynamic DNS if no static IP

### 7.2 Backup Strategy

**Database:**
```bash
# Automated daily backup
pg_dump -h localhost -U postgres postgres > backup_$(date +%Y%m%d).sql
```

**Images:**
- Storage bucket sync to secondary location
- Or use S3-compatible storage with versioning

**Configuration:**
- Version control for docker-compose.yml
- Environment variables in secure vault

---

## 8. Development Recommendations

### 8.1 MVP Priorities

**Phase 1 (Core):**
1. Recipe URL save with basic parsing
2. Simple list and detail views
3. Basic ingredient scaling (no fancy rounding)
4. Self-hosted deployment

**Phase 2 (Enhanced):**
1. Improved parsing with AI fallback
2. Cooking mode with step-by-step view
3. Voice navigation
4. Offline support

**Phase 3 (Polish):**
1. Advanced scaling with unit conversion
2. Shopping lists
3. Parser plugins for popular sites
4. Import/export

### 8.2 Testing Strategy

**Parser Testing:**
- Fixture-based tests with real HTML
- Test top 20 recipe sites
- Measure extraction accuracy

**Scaling Testing:**
- Property-based testing for calculations
- Edge cases: fractions, very small numbers
- UI tests for display formatting

**Integration Testing:**
- End-to-end recipe save flow
- Offline sync behavior
- Voice command recognition

### 8.3 Monitoring

**Metrics to Track:**
- Parse success rate by source
- Parse latency (time to extract)
- AI API costs
- User engagement (if telemetry enabled)

**Health Checks:**
- Database connectivity
- Storage accessibility
- AI API availability
- Edge function execution

---

## 9. Open Source Libraries to Consider

### 9.1 Flutter/Dart

| Package | Purpose | Popularity |
|---------|---------|------------|
| `supabase_flutter` | Supabase client | 1.5K+ likes |
| `riverpod` | State management | 4K+ likes |
| `drift` | SQLite ORM | 1K+ likes |
| `speech_to_text` | Voice recognition | 3.5K+ likes |
| `go_router` | Navigation | 2K+ likes |
| `freezed` | Code generation | 3K+ likes |
| `json_serializable` | JSON parsing | Core package |

### 9.2 Deno/Edge Functions

| Module | Purpose |
|--------|---------|
| `deno.land/std/http` | HTTP server |
| `@supabase/supabase-js` | Supabase client |
| `cheerio` (npm) | HTML parsing |

### 9.3 Python (Alternative Parser Service)

| Library | Purpose | License |
|---------|---------|---------|
| `recipe-scrapers` | Recipe extraction | MIT |
| `beautifulsoup4` | HTML parsing | MIT |
| `ingredient-parser-nlp` | Ingredient parsing | MIT |

---

## 10. Risk Assessment

### 10.1 Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| AI API cost increase | Medium | Medium | Local LLM fallback option |
| Recipe site blocks scraping | Medium | Low | User agent rotation, rate limiting |
| Flutter web limitations | Low | Medium | Test thoroughly, PWA fallback |
| Parse accuracy issues | High | Medium | Confidence scores, user review |
| Offline sync conflicts | Low | High | Last-write-wins, conflict UI |

### 10.2 Dependency Risks

- **Supabase**: Open source, can fork if needed
- **OpenAI**: Multiple providers available (Anthropic, local)
- **Flutter**: Google-backed, stable

---

## 11. Conclusion and Recommendations

### 11.1 Architecture Decision Summary

**Chosen Stack:**
- **Frontend**: Flutter 3.x with Riverpod
- **Backend**: Self-hosted Supabase
- **Database**: PostgreSQL with RLS
- **Serverless**: Deno Edge Functions
- **AI**: OpenAI GPT-3.5-turbo with GPT-4 fallback
- **Local Storage**: Drift (SQLite)

**Rationale:**
1. Meets all non-functional requirements (self-hosted, offline, mobile-first)
2. Cost-effective for personal use scale
3. Strong Flutter/Supabase integration
4. Flexible parser architecture
5. Community support and documentation

### 11.2 Critical Success Factors

1. **Parser Accuracy**: Invest in comprehensive parser testing
2. **Scaling UX**: Make scaling effortless and intuitive
3. **Offline Experience**: Ensure cooking mode works offline
4. **Deployment Simplicity**: One-command setup for self-hosting

### 11.3 Next Steps

1. Set up development environment (Flutter + Supabase CLI)
2. Create database schema migrations
3. Build basic CRUD for recipes
4. Implement simple URL fetch and display
5. Add ingredient parsing
6. Build scaling calculator
7. Implement cooking mode
8. Add voice navigation
9. Polish and optimize
10. Document deployment process

---

## References

1. Schema.org Recipe Specification: https://schema.org/Recipe
2. LangExtract Demo: https://github.com/aswincsekar/langextract-demo
3. Sous Chef Architecture: https://github.com/gamerg21/sous-chef
4. Mealie Recipe Manager: https://github.com/mealie-recipes/mealie
5. ingredient-parser-hybrid: https://github.com/FlorinPopaCodes/ingredient-parser-hybrid
6. ingredient-slicer: https://github.com/anguswg-ucsb/ingredient-slicer
7. Supabase Documentation: https://supabase.com/docs
8. Flutter Documentation: https://docs.flutter.dev
9. Recipe Scaling Calculator Patterns: Various online calculators analyzed
10. RiCoRecA: Rich Cooking Recipe Annotation Schema (Frontiers in AI, 2025)

---

*Document Version: 1.0*
*Last Updated: March 2026*
