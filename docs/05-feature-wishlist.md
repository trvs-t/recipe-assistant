# Feature Wishlist

Candidate product improvements for the next planning cycle. These are intentionally
small, user-facing slices that can be prioritized and broken into implementation
tasks later.

## Prioritization Snapshot

| Feature | Suggested priority | Main value |
|---------|--------------------|------------|
| Better authentication flow | High | Makes account access reliable and understandable |
| Plain-text recipe input | Medium | Supports recipes copied from sources without a usable URL |
| Manual ingredient editing and variations | High | Lets users correct imports and adapt recipes |
| Cooking mode | High | Makes recipes easier to follow in the kitchen |
| Auto-link ingredients | Medium | Improves recipe-flow quality after imperfect parses |
| Folders | Medium | Helps users organize a growing recipe library |

## 1. Folders

### Goal

Give users a simple way to organize saved recipes into personal collections.

### Proposed first version

- Create, rename, and delete folders.
- Assign a recipe to a folder from the recipe list or detail view.
- Allow a recipe to belong to zero or more folders; show unfiled recipes separately.
- Deleting a folder removes the grouping only and never deletes its recipes.
- Show folder navigation alongside the recipe library.

### Acceptance criteria

- A user can find all of their folders and the recipes in each folder.
- Folder changes persist across refreshes and sessions.
- Recipes remain available when their folder is deleted.
- Folder data is isolated by the authenticated user through the existing RLS model.

### Later possibilities

Nested folders, drag-and-drop organization, favorites, and smart folders based on
tags or ingredients.

## 2. Better Authentication Flow

### Goal

Make authentication a complete, visible product flow instead of relying on the
development-only automatic sign-in path.

### Proposed first version

- Add a sign-in screen with clear loading, validation, and error states.
- Add sign-out to the account or application menu.
- Add social sign-in through Supabase Auth, starting with the provider(s) selected
  for production (Google is a likely first provider).
- Restore an existing session on app load and return the user to the page they
  intended to open after authentication.
- Keep local automatic sign-in limited to development and clearly separate from
  the production flow.

### Acceptance criteria

- A user can sign in, refresh the app, and remain signed in.
- A user can sign out and is no longer able to access authenticated recipe data.
- Social sign-in handles both successful callbacks and cancelled or failed attempts.
- Auth errors are actionable and do not leave the app stuck on a loading state.
- Protected routes redirect unauthenticated users to sign in and then restore the
  original destination when possible.

### Open decisions

- Which social providers should be enabled first?
- Is email sign-up and password reset part of this slice or a follow-up?

## 3. Plain-Text Recipe Input

### Goal

Allow users to create a structured recipe by pasting recipe text when a source URL
is unavailable, inconvenient, or not supported.

### Proposed first version

- Add a plain-text input option alongside URL import.
- Accept pasted recipe text containing a title, ingredients, and instructions.
- Reuse the existing parsing and validation pipeline where possible.
- Show the parsed recipe for review before saving it to the library.
- Preserve the pasted text as the source content and clearly indicate that the
  recipe was entered from text rather than a URL.
- Leave missing or uncertain fields empty or marked for review instead of inventing
  values.

### Acceptance criteria

- A user can paste a plain-text recipe and submit it without providing a URL.
- The importer extracts ingredients and ordered instructions from common pasted
  formats.
- The user can review the parsed result and recover from an incomplete parse.
- Saved text imports remain identifiable and do not require a fabricated source URL.
- Text parsing errors provide a useful next step, such as editing the text or
  retrying the parse.

### Later possibilities

File upload for text or document formats, clipboard shortcuts, and importing from
emails or shared notes.

## 4. Manual Ingredient Editing and Variations

### Goal

Let users correct an imported ingredient or create an alternative without having
to re-import the recipe.

### Proposed first version

- Edit an ingredient's name and amount directly from the recipe view.
- Add an ingredient variation from an existing ingredient.
- Pre-fill a new variation with the source ingredient's amount by default.
- Let the user change the variation's name and amount before saving.
- Preserve the original parsed text and identify user edits separately from imported
  values where practical.
- Ensure edited ingredients continue to work with serving scaling and recipe-flow
  labels.

### Acceptance criteria

- A user can edit an ingredient name and amount, save, and see the change after
  refresh.
- Adding a variation does not silently remove the original ingredient.
- A new variation starts with the original amount and can be changed independently.
- Invalid amounts are rejected with an understandable message.
- User edits are scoped to the user's recipe and remain protected by RLS.

### Later possibilities

Unit editing and conversion, notes such as preparation state, choosing one
alternative for scaling, and a complete edit history or reset-to-imported action.

## 5. Auto-Link Ingredients

### Goal

Improve the recipe flow when the initial parser returns valid ingredients and steps
but does not connect step references to ingredient records.

### Proposed first version

- Detect missing or incomplete ingredient links after the initial parse.
- Match step text to existing ingredient records using deterministic matching first,
  then an LLM-assisted pass for ambiguous references.
- Link only to ingredients already in the recipe; do not create duplicate
  ingredients as a side effect of linking.
- Store enough confidence or provenance information to distinguish automatic links
  from user-confirmed links.
- Leave low-confidence references unlinked and allow the user to review them.
- Make the linking pass idempotent so retries do not create duplicate edges.

### Acceptance criteria

- A recipe with missing links can receive links without being re-imported.
- Existing valid links are preserved.
- The fallback linear flow still renders when no reliable links are available.
- Low-confidence LLM results do not silently mislabel ingredients in the UI.
- The operation is bounded, observable, and safe to retry.

### Open decisions

- What confidence threshold requires user confirmation?
- Should linking run during import, asynchronously afterward, or on demand?
- Which model and token budget are acceptable for this quality improvement?

## 6. Cooking Mode

### Goal

Provide a focused view for following a recipe while cooking, with instructions that
are readable at a glance.

### Proposed first version

- Open cooking mode from a recipe detail page.
- Show one instruction at a time in large, high-contrast text.
- Provide clear previous, next, and step-progress controls.
- Keep the current step stable while the user navigates between steps.
- Show the ingredients relevant to the current step when links are available.
- Preserve the selected serving scale in cooking mode.

### Acceptance criteria

- A user can enter cooking mode and read the current instruction without the normal
  recipe-page navigation competing for attention.
- Next and previous navigation works with keyboard and touch input.
- Progress is visible and does not change the stored recipe.
- Missing ingredient links do not prevent the instruction from being displayed.
- The layout remains usable on a phone or tablet in portrait orientation.

### Later possibilities

Built-in timers, screen-wake support, voice navigation, split-screen ingredients,
and offline-first cooking sessions.

## Suggested Delivery Order

1. Complete the production authentication flow and sign-out.
2. Add plain-text recipe input using the existing import pipeline.
3. Add manual ingredient editing and variations.
4. Add cooking mode using the existing ordered steps and flow data.
5. Add post-parse ingredient linking to improve cooking mode context and the graph.
6. Add folders once the authenticated recipe library is the stable home for users'
   collections.

## Cross-Cutting Requirements

- All new user-owned data must have Row Level Security enabled.
- Existing source URLs and imported values should remain traceable after edits.
- Automatic processing must be bounded, retry-safe, and observable.
- New UI should support the current React web surface first; Flutter remains legacy
  reference unless explicitly brought back into scope.
