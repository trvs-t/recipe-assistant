# Domain Specification: Recipe Saver and Viewer Assistant

## 1. Overview

### 1.1 Problem Statement
When cooking from recipes found online, users frequently need to adjust ingredient quantities based on available ingredients or desired serving sizes. Manual calculations are error-prone and inconvenient. Additionally, managing a personal recipe collection scattered across various websites is difficult.

### 1.2 Solution Overview
A personal recipe management application that:
1. Saves recipes from URLs with intelligent parsing
2. Provides an ingredient scaling calculator for flexible portion adjustment
3. Offers an aesthetic, accessible UI optimized for cooking workflows
4. Enables search and filtering of the personal recipe collection

### 1.3 Target Users
- Home cooks managing personal recipe collections (< 100 recipes)
- Users who cook from online recipes and need portion flexibility
- Mobile-first users who cook with their phone/tablet in the kitchen
- Privacy-conscious users who want self-hosted solutions without subscription fees

---

## 2. Functional Requirements

### 2.1 Core Features

#### 2.1.1 Ingredient Scaling Calculator (Core Problem)
**Priority: Critical**

**Capabilities:**
- **Serving-based scaling**: Adjust all ingredients when changing number of servings (e.g., 4 → 6 people = 1.5x multiplier)
- **Ingredient-based scaling**: Scale entire recipe based on available quantity of a specific ingredient (e.g., have 3 eggs, recipe needs 5 → scale all to 60%)
- **Flexible ratio input**: Allow direct scaling factor entry (e.g., 0.75x, 2.5x)
- **Smart unit conversion**: Automatically convert between measurement units (cups ↔ tablespoons ↔ teaspoons, grams ↔ ounces)
- **Practical rounding**: Round to common kitchen measurements (e.g., 1.33 cups → 1⅓ cups)

**Formula:**
```
Scale Factor = Desired Value ÷ Original Value
New Quantity = Original Quantity × Scale Factor
```

**Example Scenarios:**
1. Recipe serves 4, need to serve 6: Scale factor = 1.5x
2. Recipe needs 5 eggs, have 4 eggs: Scale factor = 0.8x
3. Direct input: User enters 0.75x scale

---

#### 2.1.2 Recipe URL Saver
**Priority: Critical**

**Capabilities:**
- Accept recipe URLs via simple input form
- Validate URL points to a legitimate recipe page (AI-based validation)
- Save URL and raw content to database
- Trigger async parsing workflow
- Support text/document paste as fallback

**URL Validation Flow:**
1. User submits URL
2. AI validator analyzes page content
3. If valid recipe → proceed to parsing queue
4. If invalid → Save as "draft" status, allow manual editing

**Supported Sources:**
- Major recipe sites (AllRecipes, BBC Good Food, Serious Eats, etc.) with hardcoded optimized parsers
- Any website with recipe content via AI extraction
- Social media posts (Instagram, TikTok, Facebook)
- Direct text/document uploads

**Plugin Architecture:**
- Modular parser system for easy addition of site-specific parsers
- Priority: Hardcoded parsers for popular sites → AI extraction fallback
- New parsers can be added in code without user configuration

---

#### 2.1.3 Recipe Parser
**Priority: Critical**

**Capabilities:**
- Extract structured data from recipe URLs asynchronously
- Parse ingredients into normalized, structured format
- Extract cooking times (prep, cook, total)
- Save extracted images
- Handle extraction failures gracefully

**Parsed Data Fields:**
- Title
- Description
- Ingredients (amount, unit, name normalized)
- Instructions/steps
- Prep time, cook time, total time
- Servings/yield
- Images
- Source URL
- Cuisine type (auto-detected)
- Dietary tags (auto-detected)

**Parsing Strategy:**
1. Check for known site → use optimized parser
2. Try structured data (JSON-LD, microdata)
3. Fallback to AI LLM extraction
4. Mark confidence level for each field

**Failure Handling:**
- Low confidence → Flag for user review
- Parse errors → Save raw content, mark as "needs review"
- Always preserve original data

---

#### 2.1.4 Recipe Viewer
**Priority: High**

**View Modes:**
1. **Step-by-Step Cooking Mode**
   - Full-screen step display
   - Large, readable text optimized for kitchen viewing
   - Progress tracking (check off completed steps)
   - Integrated timers per step
   - Minimal UI, maximum content visibility

2. **Split-Screen Cooking View**
   - Ingredients list visible alongside current step
   - Quick ingredient reference without navigation
   - Step navigation controls

**Viewer Features:**
- High contrast mode support
- Adjustable font sizes
- Voice navigation (hands-free cooking):
  - "Next step" / "Previous step" / "Repeat step"
  - "Start timer" / "How much time left?"
  - "How much [ingredient]?"
  - "What temperature?"
- Cooking timers with alerts
- Offline viewing after initial load

---

#### 2.1.5 Search and Filtering
**Priority: High**

**Search Capabilities:**
- Full-text search across titles, descriptions, and steps
- Recently viewed recipes (quick access)
- Favorites/bookmarks filtering

**Filter Options:**
- Ingredient inclusion (recipes containing specific ingredients)
- Ingredient exclusion (allergy/dietary restrictions)
- Favorites only

**Search Experience:**
- Real-time search as you type
- Search history
- No results suggestions

---

#### 2.1.6 Shopping Lists
**Priority: Medium**

**Capabilities:**
- Generate shopping list from single recipe
- Aggregate shopping list from multiple recipes
- Merge duplicate ingredients (e.g., 2 cups flour + 1 cup flour = 3 cups flour)
- Simple text export/copy to clipboard

**Future Considerations:**
- Pantry integration (track what you have)
- External app sync (Reminders, Keep, Todoist)

---

### 2.2 Data Model

#### 2.2.1 Core Entities

**Recipe**
```
id: UUID (primary key)
title: String
source_url: String
description: Text
prep_time_minutes: Integer
cook_time_minutes: Integer
total_time_minutes: Integer
servings: Integer
images: Array<String> (URLs)
cuisine_type: String
dietary_tags: Array<String>
status: Enum ['pending', 'parsed', 'draft', 'error']
parse_confidence: Float (0-1)
user_id: UUID (foreign key)
created_at: Timestamp
updated_at: Timestamp
```

**Ingredient**
```
id: UUID (primary key)
recipe_id: UUID (foreign key)
original_text: String (raw text from source)
quantity: Float
unit: String (normalized: cup, tbsp, tsp, g, oz, etc.)
name: String (normalized ingredient name)
notes: String (e.g., "softened", "diced")
sort_order: Integer
```

**Step**
```
id: UUID (primary key)
recipe_id: UUID (foreign key)
instruction: Text
timer_duration_minutes: Integer (optional)
sort_order: Integer
```

**User (via Supabase Auth)**
```
id: UUID (primary key)
email: String
preferences: JSON (theme, default serving sizes, etc.)
created_at: Timestamp
```

#### 2.2.2 Ingredient Normalization

**Goal:** Standardize ingredient names for better filtering and aggregation.

**Examples:**
- "unsalted butter" → "butter"
- "all-purpose flour" → "flour"
- "1 lb ground beef" → quantity: 1, unit: "lb", name: "ground beef"

**Unit Conversion Standards:**
- Volume: tsp, tbsp, cup, pint, quart, gallon, ml, l
- Weight: oz, lb, g, kg
- Count: piece, whole, clove, etc.

---

## 3. Non-Functional Requirements

### 3.1 Architecture Requirements

**Self-Hostable**
- Complete deployment on user's own infrastructure
- No vendor lock-in
- All data owned by user
- Docker-based deployment option

**Offline Capability**
- Download recipes for offline access
- View saved recipes without internet
- Queue changes for sync when online

**Cross-Platform**
- Flutter frontend supports iOS, Android, Web from single codebase
- Consistent experience across platforms

**Mobile-First Design**
- Optimized for phone/tablet use in kitchen
- Touch-friendly interfaces
- Responsive layouts

### 3.2 Performance Requirements

- Recipe save: < 3 seconds to queue for parsing
- Recipe list load: < 1 second for 100 recipes
- Search response: < 500ms
- Scaling calculation: Instant (< 100ms)
- Image loading: Progressive loading with placeholders

### 3.3 Scalability

**Expected Scale:**
- Personal use: < 100 recipes per user
- Single user per instance (initial phase)
- No need for high-concurrency or massive scale

### 3.4 Security Requirements

- User authentication via Supabase Auth
- Row-level security on all data
- API keys stored securely (server-side only)
- No PII beyond email address

### 3.5 Accessibility

- Voice navigation for hands-free cooking (critical)
- Screen reader support
- Font size adjustment
- High contrast theme option
- Clear, readable typography

### 3.6 Data Portability

- Full export capability (JSON format)
- No vendor lock-in
- Recipe data easily transferable

---

## 4. User Stories

### 4.1 Recipe Discovery and Saving
1. As a user, I want to paste a recipe URL so that I can save it for later
2. As a user, I want the system to automatically extract recipe details so that I don't have to type them manually
3. As a user, I want to know if a URL doesn't contain a valid recipe so that I can fix it

### 4.2 Ingredient Scaling
4. As a user cooking for 3 instead of 4, I want to scale down all ingredients proportionally
5. As a user with only 3 eggs when the recipe calls for 5, I want to scale the entire recipe to use what I have
6. As a user, I want to see ingredient amounts in practical measurements (not 1.333 cups)

### 4.3 Cooking Experience
7. As a user cooking, I want to view one step at a time in large text so I can read it from across the kitchen
8. As a user with dirty hands, I want to navigate steps using voice commands
9. As a user, I want built-in timers for cooking steps so I don't need a separate timer app

### 4.4 Recipe Management
10. As a user, I want to search my saved recipes by ingredient so I can find something to cook with what I have
11. As a user, I want to mark recipes as favorites for quick access
12. As a user, I want to see my recently viewed recipes

### 4.5 Shopping
13. As a user planning to cook, I want to generate a shopping list from multiple recipes
14. As a user, I want the shopping list to combine duplicate ingredients

---

## 5. Constraints and Assumptions

### 5.1 Constraints
- Self-hosted deployment (no SaaS model)
- Mobile-first (not desktop-primary)
- Single user per instance (initial version)
- Flutter frontend (user preference)
- Supabase backend

### 5.2 Assumptions
- User has technical ability to self-host
- User provides their own AI API keys (OpenAI, etc.)
- Recipe websites use reasonable HTML structures
- User primarily cooks from online sources, not cookbooks

### 5.3 Out of Scope (Initial Version)
- Meal planning calendar
- Nutritional analysis
- Social features (sharing, ratings, comments)
- Pantry/inventory management
- Recipe creation from scratch (only import)
- Multi-user households
- Recipe versioning
- Cost estimation

---

## 6. Success Criteria

### 6.1 Functional Success
- Successfully parse 90%+ of recipes from major recipe sites
- Ingredient scaling accurate to within practical kitchen tolerance
- Voice navigation works for 95%+ of common commands
- Offline viewing of saved recipes works seamlessly

### 6.2 User Experience Success
- Save recipe workflow < 30 seconds
- Find any recipe in < 10 seconds
- Scale a recipe in < 5 seconds
- Zero data loss

### 6.3 Technical Success
- 99.9% uptime for local instance
- Parse queue processes within 60 seconds
- No vendor lock-in (full data export works)
- Build and deploy in < 30 minutes for technical users

---

## 7. Future Considerations

### 7.1 Phase 2 Features
- Meal planning calendar integration
- Pantry/inventory tracking
- Recipe sharing between users
- Nutritional information display
- Recipe ratings and notes
- Recipe collections/tags

### 7.2 Phase 3 Features
- Multi-user household support
- Shopping list external integrations
- Recipe recommendations
- Cooking history/statistics
- Grocery store integration
- Advanced dietary filtering

---

## 8. Appendix

### 8.1 Glossary
- **Scaling Factor**: Multiplier applied to all ingredient quantities
- **Normalized Ingredient**: Ingredient name standardized for filtering (e.g., "butter" instead of "unsalted butter")
- **Draft Recipe**: Recipe saved but not successfully parsed
- **Parse Confidence**: AI-assigned score (0-1) indicating extraction reliability

### 8.2 Recipe Source Examples
**Must Support:**
- allrecipes.com
- bbcgoodfood.com
- seriouseats.com
- foodnetwork.com
- Generic WordPress food blogs (via AI extraction)

**Should Support:**
- Instagram posts/descriptions
- TikTok video descriptions
- YouTube video descriptions
- Plain text paste

### 8.3 Measurement Conversion Reference

**Volume:**
- 1 cup = 16 tablespoons = 48 teaspoons
- 1 tablespoon = 3 teaspoons
- 1 cup = 240 ml
- 1 tablespoon = 15 ml
- 1 teaspoon = 5 ml

**Weight:**
- 1 lb = 16 oz = 453.6 g
- 1 oz = 28.35 g

**Common Scaling Factors:**
| Original | Desired | Factor |
|----------|---------|--------|
| 4 servings | 2 servings | 0.5x |
| 4 servings | 6 servings | 1.5x |
| 4 servings | 8 servings | 2.0x |
| 5 eggs | 3 eggs | 0.6x |
| 5 eggs | 4 eggs | 0.8x |
