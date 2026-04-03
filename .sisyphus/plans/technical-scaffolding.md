# Technical Scaffolding - Recipe Assistant

## TL;DR

> **Quick Summary**: Initialize Flutter project in `/app/` with Riverpod codegen, Drift SQLite, GoRouter routing, and Supabase Edge Functions structure. Setup folder structure, empty interfaces, and configuration files - NO implementations.

> **Deliverables**:
> - Flutter project initialized in `/app/` with pubspec.yaml (all dependencies)
> - Folder structure per architecture docs (empty shells only)
> - Repository interfaces (abstract classes with TODO comments)
> - GoRouter configuration (empty routes list)
> - Theme and constants files (minimal shells)
> - Supabase functions folder structure (type shells only)
> - Analysis options, gitignore, build.yaml

> **Estimated Effort**: Quick (2-4 hours for scaffolding)
> **Parallel Execution**: YES - Wave-based with dependencies
> **Critical Path**: Flutter init → pubspec.yaml → Folder structure → Interface files

---

## Context

### Original Request
Create technical scaffolding for a Recipe Assistant Flutter + Supabase project:
- Project path: `/app/` (not `/apps/mobile/`)
- Use Riverpod codegen pattern (mandatory)
- Research latest Flutter libraries and update docs
- NO barrel files (optional, not scaffolding scope)
- NO Effect-TS for Supabase Edge Functions (overkill)

### Interview Summary

**Key Discussions**:
- **Projectpath**: Flutter app in `/app/` at repository root
- **Riverpod**: Must use codegen pattern with `riverpod_annotation` + `riverpod_generator`
- **Barrel files**: Research confirmed they're controversial in Dart - excluded from mandatory scaffolding
- **Effect-TS**: Determined to be overkill for Edge Functions - standard async/await is sufficient
- **Flutter version**: 3.41.x (latest stable)
- **Scaffold depth**: Truly empty shells only - no implementation examples
- **Analysis**: Standard flutter_lints (not strict mode)

**Research Findings**:
- Flutter 3.41.x / Dart 3.11.0 (latest stable)
- Riverpod 3.3.0with codegen pattern (legacy providers moved to legacy.dart)
- GoRouter 17.1.0 with StatefulShellRoute for navigation
- Drift 2.32.1 + drift_flutter 0.3.0 for SQLite
- Freezed 3.3.0 for immutable data classes
- supabase_flutter 2.0.0 (immutable query builder, PKCE auth)
- speech_to_text 7.0.0, connectivity_plus 7.0.0

### Metis Review

**Identified Gaps** (addressed):
- Missing acceptance criteria → Added binary pass/fail verification commands
- Scope boundaries unclear → Added explicit "Must NOT Have" section
- Edge cases not addressed → Added build.yaml, comprehensive .gitignore, version constraints
- Testing strategy → Empty test files with folder structure
- Error handling pattern → Exceptions (simpler for scaffolding)
- Analysis options → flutter_lints (standard default)

---

## Work Objectives

### Core Objective
Initialize the Recipe Assistant project with all necessary scaffolding - project structure, dependencies, configuration files, and empty interface shells - ready for feature development.

### Concrete Deliverables
- `/app/` Flutter project initialized
- `pubspec.yaml` with all dependencies pinned to correct versions
- Folder structure: `lib/`data/domain/presentation/core/config
- Repository interfaces: `IRecipeRepository`, `IIngredientRepository`, `IStepRepository`
- GoRouter configuration file (empty routes)
- Theme configuration file (ThemeData shell)
- Constants file (API endpoints, defaults)
- Supabase folder structure: `functions/validate-url/`, `functions/parse-recipe/`, `functions/_shared/`
- `analysis_options.yaml` with flutter_lints
- `.gitignore` with generated files and secrets
- `build.yaml` for code generation coordination
- Empty test folder structure

### Definition of Done
- [x] `flutter analyze` passes with 0 errors
- [x] `dart pub get` succeeds in `/app/`
- [x] `dsupabase start` works (or documented alternative)
- [x] All folders exist per architecture docs
- [x] All interface files syntactically valid

### Must Have
- Flutter 3.41.x / Dart 3.11.0 compatibility
- Riverpod codegen pattern setup
- All dependencies from research with correct versions
- Empty shells only - NO implementations
- `analysis_options.yaml` prevents anti-patterns
- `.gitignore` excludes generated files

### Must NOT Have (Guardrails)
- NO business logic in repositories
- NO actual widget implementations beyond App shell
- NO barrel files (`index.dart` files)
- NO generated files committed (`*.g.dart`, `*.freezed.dart`)
- NO `.env` files (even examples)
- NO CI/CD configuration
- NO platform-specific native code modifications
- NO test implementations (empty files only)
- NO Supabase edge function logic (type shells only)
- NO authentication flows
- NO example/demo implementations
- NO extensive documentation (folder READMEs max5 lines)

---

## Verification Strategy (MANDATORY)

### Test Decision
- **Infrastructure exists**: NO (new project)
- **Automated tests**: NO (scaffolding only, tests are out of scope)
- **Framework**: N/A
- **Agent-Executed QA**: YES - verify structure via commands

### QA Policy
Every task includes agent-executed QA scenarios:
- **Folder structure**: `ls -la` commands to verify existence
- **File validity**: `dart analyze` to verify syntax
- **Dependencies**: `dart pub get` to verify resolution
- **Generated file exclusion**: `grep` commands on `.gitignore`

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation - sequential since Flutter init is prerequisite):
├── Task 1: Flutter project initialization [quick]
│   └── Creates /app/ directory structure
├── Task 2: pubspec.yaml with all dependencies [quick]
│   └── Depends on: Task 1
└── Task 3: Analysis options, gitignore, build.yaml [quick]
    └── Depends on: Task 1

Wave 2 (Core Structure - max parallel after Wave 1):
├── Task 4: lib/data/ folder structure [quick]
├── Task 5: lib/domain/ folder structure [quick]
├── Task 6: lib/presentation/ folder structure [quick]
├── Task 7: lib/config/ folder structure [quick]
├── Task 8: lib/core/ folder structure [quick]
└── Task 9: test/ folder structure [quick]

Wave 3 (Interface Files - parallel after Wave 2):
├── Task 10: Repository interfaces [quick]
├── Task 11: GoRouter configuration [quick]
├── Task 12: Theme configuration [quick]
├── Task 13: Constants file [quick]
├── Task 14: App entry point (main.dart, app.dart) [quick]
└── Task 15: Providers barrel (empty Riverpod setup) [quick]

Wave 4 (Supabase Structure - parallel, independent of Flutter):
├── Task 16: supabase/ folder structure [quick]
├── Task 17: validate-url function shell [quick]
├── Task 18: parse-recipe function shell [quick]
└── Task 19: _shared types shell [quick]

Wave FINAL (Verification - sequential):
├── Task F1: Flutter analyze verification [quick]
├── Task F2: Dependency resolution check [quick]
├── Task F3: Folder structure verification [quick]
└── Task F4: File validity check [quick]
-> Present results -> Get user confirmation
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|------------|--------|
| 1 | -- | 2, 3 |
| 2 | 1 | -- |
| 3 | 1 | -- |
| 4-9 | 1 | 10-15 |
| 10-15 | 4-9 | F1-F4 |
| 16-19 | -- | -- |
| F1-F4 | 2, 4-15 | -- |

### Agent Dispatch Summary

- **Wave 1**: 3 tasks — T1, T2, T3 → all `quick`
- **Wave 2**: 6 tasks — T4-T9 → all `quick`
- **Wave 3**: 6 tasks — T10-T15 → all `quick`
- **Wave 4**: 4 tasks — T16-T19 → all `quick`
- **FINAL**: 4 tasks — F1-F4 → all `quick`

---

## TODOs

- [x] 1. Initialize Flutter Project in `/app/`

  **What to do**:
  - Create `/app/` directory at project root
  - Run `flutter create app` in the project root
  - Verify Flutter 3.41.x / Dart 3.11.0 compatibility

  **Must NOT do**:
  - Do NOT create the project in `/apps/mobile/`
  - Do NOT modify platform-specific code (android/, ios/, web/)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [] (basic Flutter commands)
  - **Reason**: Simple one-command task

  **Parallelization**:
  - **Can Run In Parallel**: NO - blocks all other tasks
  - **Parallel Group**: Wave 1 (sequential foundation)
  - **Blocks**: Tasks 2-15 (allFlutter tasks)

  **References**:
  - `docs/02-architecture/01-system-overview.md:142-159` - File structure specification

  **Acceptance Criteria**:
  - [ ] `/app/` directory exists at project root
  - [ ] `app/pubspec.yaml` exists and is valid YAML
  - [ ] `app/lib/main.dart` exists

  **QA Scenarios**:
  ```
  Scenario: Flutter project initialized correctly
    Tool: Bash
    Preconditions: None
    Steps:
      1. cd /Users/travis/Desktop/my_projects/recipe-assistant
      2. test -d app && echo "EXISTS" || echo "NOT_FOUND"
      3. test -f app/pubspec.yaml && echo "VALID" || echo "INVALID"
    Expected Result: "EXISTS" and "VALID"
    Evidence: .sisyphus/evidence/task-01-flutter-init.txt
  ```

  **Commit**: YES
  - Message: `chore: initialize Flutter project in /app/`
  - Files: `app/` (entire directory)

---

- [x] 2. Configure pubspec.yaml with All Dependencies

  **What to do**:
  - Update `app/pubspec.yaml` with all dependencies from research
  - Add dev_dependencies for code generation
  - Set SDK constraints: `sdk: ">=3.11.0 <4.0.0"`
  - Set Flutter constraint: `flutter: ">=3.41.0"`

  **Dependencies to add**:
  ```yaml
  dependencies:
    flutter:
      sdk: flutter
    flutter_riverpod: ^3.3.0
    riverpod_annotation: ^2.6.0
    go_router: ^17.1.0
    drift: ^2.32.1
    drift_flutter: ^0.3.0
    freezed_annotation: ^2.4.0
    json_annotation: ^4.9.0
    supabase_flutter: ^2.0.0
    speech_to_text: ^7.0.0
    connectivity_plus: ^7.0.0
    path_provider: ^2.1.5
    path: ^1.9.1

  dev_dependencies:
    flutter_test:
      sdk: flutter
    flutter_lints: ^5.0.0
    build_runner: ^2.13.1
    riverpod_generator: ^2.6.0
    drift_dev: ^2.32.1
    freezed: ^3.3.0
    json_serializable: ^6.11.3
  ```

  **Must NOT do**:
  - Do NOT use `^` without version bounds
  - Do NOT add dependencies not in the research list

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Reason**: Simple file edit task

  **Parallelization**:
  - **Can Run In Parallel**: NO - depends on Task 1
  - **Parallel Group**: Wave 1
  - **Blocked By**: Task 1

  **References**:
  - TODO: Add reference when Task 1 is complete

  **Acceptance Criteria**:
  - [ ] All dependencies present with correct versions
  - [ ] SDK constraint `>=3.11.0 <4.0.0` specified
  - [ ] `dart pub get` succeeds in `/app/`

  **QA Scenarios**:
  ```
  Scenario: All dependencies present
    Tool: Bash
    Preconditions: Task 1 complete
    Steps:
      1. grep "flutter_riverpod: ^3.3.0" app/pubspec.yaml
      2. grep "riverpod_annotation: ^2.6.0" app/pubspec.yaml
      3. grep "go_router: ^17.1.0" app/pubspec.yaml
      4. grep "drift: ^2.32.1" app/pubspec.yaml
      5. grep "supabase_flutter: ^2.0.0" app/pubspec.yaml
    Expected Result: All commands return matching lines
    Evidence: .sisyphus/evidence/task-02-deps.txt

  Scenario: Dependencies resolve successfully
    Tool: Bash
    Preconditions: Task 1 complete
    Steps:
      1. cd app && dart pub get 2>&1
    Expected Result: Exit code 0, "Got dependencies" message
    Evidence: .sisyphus/evidence/task-02-pub-get.txt
  ```

  **Commit**: YES (groups with Task 3)
  - Message: `chore: add dependencies and configuration files`

---

- [x] 3. Create Analysis Options, gitignore, and build.yaml

  **What to do**:
  - Create `app/analysis_options.yaml` with flutter_lints
  - Create `app/.gitignore` with comprehensive exclusions
  - Create `app/build.yaml` for code generation coordination

  **analysis_options.yaml**:
  ```yaml
  include: package:flutter_lints/flutter.yaml

  linter:
    rules:
      - prefer_const_constructors
      - prefer_const_declarations
      - avoid_print
      - prefer_single_quotes
  ```

  **.gitignore additions**:
  ```
  # Generated files
  *.g.dart
  *.freezed.dart
  *.mocks.dart

  # Secrets
  .env
  .env.*
  *.env

  # IDE
  .vscode/
  .idea/
  *.iml

  # Flutter/Dart
  .dart_tool/
  build/
  .flutter-plugins
  .flutter-plugins-dependencies
  ```

  **build.yaml**:
  ```yaml
  targets:
    $default:
      builders:
        riverpod_generator:
          enabled: true
        drift_dev:
          enabled: true
        freezed:
          enabled: true
          options:
            union_key: 'type'
            explicit_to_json: true
        json_serializable:
          enabled: true
          options:
            explicit_to_json: true
            include_if_null: false
  ```

  **Must NOT do**:
  - Do NOT add strict analysis rules
  - Do NOT exclude important patterns from .gitignore

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Reason**: Simple file creation task

  **Parallelization**:
  - **Can Run In Parallel**: NO - depends on Task 1
  - **Parallel Group**: Wave 1
  - **Blocked By**: Task 1

  **References**:
  - TODO: Add reference when Task 1 is complete

  **Acceptance Criteria**:
  - [ ] `app/analysis_options.yaml` exists with flutter_lints
  - [ ] `app/.gitignore` exists with generated file exclusions
  - [ ] `app/build.yaml` exists with generator configuration
  - [ ] `flutter analyze` passes

  **QA Scenarios**:
  ```
  Scenario: Analysis options valid
    Tool: Bash
    Preconditions: Task 1 complete
    Steps:
      1. test -f app/analysis_options.yaml && echo "EXISTS" || echo "NOT_FOUND"
      2. grep "flutter_lints" app/analysis_options.yaml
    Expected Result: "EXISTS" and line contains flutter_lints
    Evidence: .sisyphus/evidence/task-03-analysis.txt

  Scenario: gitignore excludes generated files
    Tool: Bash
    Preconditions: Task 1 complete
    Steps:
      1. grep "*.g.dart" app/.gitignore
      2. grep "*.freezed.dart" app/.gitignore
      3. grep ".env" app/.gitignore
    Expected Result: All patterns present
    Evidence: .sisyphus/evidence/task-03-gitignore.txt
  ```

  **Commit**: YES (groups with Task 2)

---

- [x] 4. Create lib/data/ Folder Structure

  **What to do**:
  - Create `app/lib/data/models/` directory
  - Create `app/lib/data/repositories/` directory
  - Create `app/lib/data/services/` directory
  - Create `app/lib/data/local/` directory
  - Add minimal README.md (max 5 lines) to each subdirectory

  **Directory Structure**:
  ```
  app/lib/data/
  ├── models/
  │   └── README.md  # "Data models (Freezed classes)"
  ├── repositories/
  │   └── README.md  # "Repository interfaces and implementations"
  ├── services/
  │   └── README.md  # "External service wrappers (Supabase, Speech)"
  └── local/
      └── README.md  # "Local database (Drift) and offline storage"
  ```

  **Must NOT do**:
  - Do NOT create barrel files (`index.dart`)
  - Do NOT create model implementations
  - Do NOT create README files longer than 5 lines

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Reason**: Simple directory creation

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5-9)
  - **Blocks**: Task 10 (Repository interfaces)

  **References**:
  - `docs/02-architecture/04-frontend-patterns.md:5-45` - Project structure specification

  **Acceptance Criteria**:
  - [ ] All four directories exist
  - [ ] Each directory has a README.md (≤5 lines)
  - [ ] `flutter analyze` still passes

  **QA Scenarios**:
  ```
  Scenario: Data directories exist
    Tool: Bash
    Preconditions: Task 1 complete
    Steps:
      1. test -d app/lib/data/models && echo "EXISTS" || echo "NOT_FOUND"
      2. test -d app/lib/data/repositories && echo "EXISTS" || echo "NOT_FOUND"
      3. test -d app/lib/data/services && echo "EXISTS" || echo "NOT_FOUND"
      4. test -d app/lib/data/local && echo "EXISTS" || echo "NOT_FOUND"
    Expected Result: All "EXISTS"
    Evidence: .sisyphus/evidence/task-04-data-folders.txt
  ```

  **Commit**: NO (groups with Wave 2tasks)

---

- [x] 5. Create lib/domain/ Folder Structure

  **What to do**:
  - Create `app/lib/domain/use_cases/` directory
  - Create `app/lib/domain/entities/` directory
  - Add minimal README.md to each subdirectory

  **Directory Structure**:
  ```
  app/lib/domain/
  ├── use_cases/
  │   └── README.md  # "Business logic use cases"
  └── entities/
      └── README.md  # "Core business entities"
  ```

  **Must NOT do**:
  - Do NOT create use case implementations
  - Do NOT create entity classes

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Reason**: Simple directory creation

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 6-9)

  **References**:
  - `docs/02-architecture/04-frontend-patterns.md:25-30` - Domain layer structure

  **Acceptance Criteria**:
  - [ ] Both directories exist
  - [ ] Each has a README.md (≤5 lines)

  **QA Scenarios**:
  ```
  Scenario: Domain directories exist
    Tool: Bash
    Preconditions: Task 1 complete
    Steps:
      1. test -d app/lib/domain/use_cases && echo "EXISTS" || echo "NOT_FOUND"
      2. test -d app/lib/domain/entities && echo "EXISTS" || echo "NOT_FOUND"
    Expected Result: Both "EXISTS"
    Evidence: .sisyphus/evidence/task-05-domain-folders.txt
  ```

  **Commit**: NO (groups with Wave 2 tasks)

---

- [x] 6. Create lib/presentation/ Folder Structure

  **What to do**:
  - Create `app/lib/presentation/providers/` directory
  - Create `app/lib/presentation/pages/` directory
  - Create `app/lib/presentation/widgets/` directory
  - Add minimal README.md to each subdirectory

  **Directory Structure**:
  ```
  app/lib/presentation/
  ├── providers/
  │   └── README.md  # "Riverpod providers (StateNotifier, Provider)"
  ├── pages/
  │   └── README.md  # "Screen widgets (route destinations)"
  └── widgets/
      └── README.md  # "Reusable UI components"
  ```

  **Must NOT do**:
  - Do NOT create provider implementations
  - Do NOT create page widgets

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Reason**: Simple directory creation

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4-5, 7-9)

  **References**:
  - `docs/02-architecture/04-frontend-patterns.md:31-45` - Presentation layer structure

  **Acceptance Criteria**:
  - [ ] All three directories exist
  - [ ] Each has a README.md (≤5 lines)

  **QA Scenarios**:
  ```
  Scenario: Presentation directories exist
    Tool: Bash
    Preconditions: Task 1 complete
    Steps:
      1. test -d app/lib/presentation/providers && echo "EXISTS" || echo "NOT_FOUND"
      2. test -d app/lib/presentation/pages && echo "EXISTS" || echo "NOT_FOUND"
      3. test -d app/lib/presentation/widgets && echo "EXISTS" || echo "NOT_FOUND"
    Expected Result: All "EXISTS"
    Evidence: .sisyphus/evidence/task-06-presentation-folders.txt
  ```

  **Commit**: NO (groups with Wave 2 tasks)

---

- [x] 7. Create lib/config/ Folder Structure

  **What to do**:
  - Create `app/lib/config/` directory
  - Create placeholder files: `router.dart`, `theme.dart`, `constants.dart`
  - Each file should be a minimal shell (comment + empty declaration)

  **File Contents**:
  ```dart
  // app/lib/config/router.dart
  // GoRouter configuration - TODO: Add routes
  
  // app/lib/config/theme.dart
  // App theme configuration - TODO: Define theme
  
  // app/lib/config/constants.dart
  // App constants - TODO: Add constants
  ```

  **Must NOT do**:
  - Do NOT implement actual router logic
  - Do NOT define theme colors
  - Do NOT add constants

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Reason**: Simple file creation

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4-6, 8-9)

  **References**:
  - `docs/02-architecture/04-frontend-patterns.md:11-14` - Config structure

  **Acceptance Criteria**:
  - [ ] `app/lib/config/` directory exists
  - [ ] `router.dart`, `theme.dart`, `constants.dart` exist
  - [ ] `flutter analyze` passes (files are syntactically valid)

  **QA Scenarios**:
  ```
  Scenario: Config files exist and are valid
    Tool: Bash
    Preconditions: Task 1 complete
    Steps:
      1. test -f app/lib/config/router.dart && echo "EXISTS" || echo "NOT_FOUND"
      2. test -f app/lib/config/theme.dart && echo "EXISTS" || echo "NOT_FOUND"
      3. test -f app/lib/config/constants.dart && echo "EXISTS" || echo "NOT_FOUND"
      4. cd app && flutter analyze lib/config/
    Expected Result: All "EXISTS", analyze passes
    Evidence: .sisyphus/evidence/task-07-config.txt
  ```

  **Commit**: NO (groups with Wave 2 tasks)

---

- [x] 8. Create lib/core/ Folder Structure

  **What to do**:
  - Create `app/lib/core/utils/` directory
  - Create `app/lib/core/extensions/` directory
  - Add minimal README.md to each subdirectory

  **Directory Structure**:
  ```
  app/lib/core/
  ├── utils/
  │   └── README.md  # "Helper utilities and formatters"
  └── extensions/
      └── README.md  # "Dart extensions"
  ```

  **Must NOT do**:
  - Do NOT create utility implementations
  - Do NOT create extension implementations

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Reason**: Simple directory creation

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4-7, 9)

  **References**:
  - `docs/02-architecture/04-frontend-patterns.md:42-45` - Core layer structure

  **Acceptance Criteria**:
  - [ ] Both directories exist
  - [ ] Each has a README.md (≤5 lines)

  **QA Scenarios**:
  ```
  Scenario: Core directories exist
    Tool: Bash
    Preconditions: Task 1 complete
    Steps:
      1. test -d app/lib/core/utils && echo "EXISTS" || echo "NOT_FOUND"
      2. test -d app/lib/core/extensions && echo "EXISTS" || echo "NOT_FOUND"
    Expected Result: Both "EXISTS"
    Evidence: .sisyphus/evidence/task-08-core-folders.txt
  ```

  **Commit**: NO (groups with Wave 2 tasks)

---

- [x] 9. Create test/ Folder Structure

  **What to do**:
  - Create `app/test/` directory
  - Create `app/test/unit/` subdirectory
  - Create `app/test/integration/` subdirectory
  - Create `app/test/widget/` subdirectory
  - Add minimal README.md to each

  **Directory Structure**:
  ```
  app/test/
  ├── unit/
  │   └── README.md  # "Unit tests"
  ├── integration/
  │   └── README.md  # "Integration tests"
  └── widget/
      └── README.md  # "Widget tests"
  ```

  **Must NOT do**:
  - Do NOT create test implementations
  - Do NOT create test utilities

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Reason**: Simple directory creation

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4-8)

  **Acceptance Criteria**:
  - [ ] All three test directories exist
  - [ ] Each has a README.md (≤5 lines)

  **QA Scenarios**:
  ```
  Scenario: Test directories exist
    Tool: Bash
    Preconditions: Task 1 complete
    Steps:
      1. test -d app/test/unit && echo "EXISTS" || echo "NOT_FOUND"
      2. test -d app/test/integration && echo "EXISTS" || echo "NOT_FOUND"
      3. test -d app/test/widget && echo "EXISTS" || echo "NOT_FOUND"
    Expected Result: All "EXISTS"
    Evidence: .sisyphus/evidence/task-09-test-folders.txt
  ```

  **Commit**: YES
  - Message: `chore: create Flutter folder structure`
  - Files: `app/lib/`, `app/test/`

---

- [x] 10. Create Repository Interfaces

  **What to do**:
  - Create `app/lib/data/repositories/i_recipe_repository.dart`
  - Create `app/lib/data/repositories/i_ingredient_repository.dart`
  - Create `app/lib/data/repositories/i_step_repository.dart`
  - Each file contains abstract class with empty method signatures

  **File Contents**:
  ```dart
  // app/lib/data/repositories/i_recipe_repository.dart
  /// Repository interface for recipe operations.
  /// TODO: Implement with Supabase or local database.
  abstract class IRecipeRepository {
    // TODO: Add method signatures
  }
  
  // app/lib/data/repositories/i_ingredient_repository.dart
  /// Repository interface for ingredient operations.
  /// TODO: Implement with Supabase or local database.
  abstract class IIngredientRepository {
    // TODO: Add method signatures
  }
  
  // app/lib/data/repositories/i_step_repository.dart
  /// Repository interface for step operations.
  /// TODO: Implement with Supabase or local database.
  abstract class IStepRepository {
    // TODO: Add method signatures
  }
  ```

  **Must NOT do**:
  - Do NOT add actual method signatures
  - Do NOT create implementation classes
  - Do NOT add import statements

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Reason**: Simple file creation

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 11-15)
  - **Blocked By**: Tasks 4-9 (folder structure)

  **References**:
  - `docs/02-architecture/04-frontend-patterns.md:103-117` - Repository pattern example

  **Acceptance Criteria**:
  - [ ] All three interface files exist
  - [ ] Each contains abstract class with TODO comment
  - [ ] `flutter analyze` passes

  **QA Scenarios**:
  ```
  Scenario: Repository interfaces exist and are valid
    Tool: Bash
    Preconditions: Tasks 4-9 complete
    Steps:
      1. test -f app/lib/data/repositories/i_recipe_repository.dart
      2. test -f app/lib/data/repositories/i_ingredient_repository.dart
      3. test -f app/lib/data/repositories/i_step_repository.dart
      4. grep "abstract class" app/lib/data/repositories/i_recipe_repository.dart
      5. cd app && flutter analyze lib/data/repositories/
    Expected Result: All files exist, abstract class present, analyze passes
    Evidence: .sisyphus/evidence/task-10-repos.txt

  Scenario: No barrel file created
    Tool: Bash
    Preconditions: Task 10 complete
    Steps:
      1. find app/lib/data/repositories -name "index.dart" -o -name "repositories.dart"
    Expected Result: No files found
    Evidence: .sisyphus/evidence/task-10-no-barrel.txt
  ```

  **Commit**: NO (groups with Wave 3 tasks)

---

- [x] 11. Create GoRouter Configuration

  **What to do**:
  - Create `app/lib/config/router.dart` with GoRouter setup
  - Empty routes list with placeholder comment
  - Import go_router package

  **File Contents**:
  ```dart
  // app/lib/config/router.dart
  import 'package:go_router/go_router.dart';
  
  /// Application router configuration.
  /// TODO: Add routes for recipe list, detail, cooking mode, etc.
  final router = GoRouter(
    routes: [
      // TODO: Add routes
    ],
  );
  ```

  **Must NOT do**:
  - Do NOT add actual route definitions
  - Do NOT add route handlers or pages

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Reason**: Simple file creation with basic import

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 10, 12-15)

  **References**:
  - `docs/02-architecture/04-frontend-patterns.md:342-374` - GoRouter configuration example

  **Acceptance Criteria**:
  - [ ] `app/lib/config/router.dart` exists
  - [ ] Contains `GoRouter` import and instance
  - [ ] `flutter analyze` passes

  **QA Scenarios**:
  ```
  Scenario: Router file exists and is valid
    Tool: Bash
    Preconditions: Tasks 2,7 complete
    Steps:
      1. test -f app/lib/config/router.dart
      2. grep "import 'package:go_router/go_router.dart'" app/lib/config/router.dart
      3. grep "GoRouter" app/lib/config/router.dart
      4. cd app && flutter analyze lib/config/router.dart
    Expected Result: File exists, imports present, analyze passes
    Evidence: .sisyphus/evidence/task-11-router.txt
  ```

  **Commit**: NO (groups with Wave 3 tasks)

---

- [x] 12. Create Theme Configuration

  **What to do**:
  - Create `app/lib/config/theme.dart` with ThemeData shell
  - Define light and dark theme getters (empty)

  **File Contents**:
  ```dart
  // app/lib/config/theme.dart
  import 'package:flutter/material.dart';
  
  /// Application theme configuration.
  /// TODO: Define colors, typography, and component themes.
  class AppTheme {
    static ThemeData get lightTheme => ThemeData();
    
    static ThemeData get darkTheme => ThemeData();
  }
  ```

  **Must NOT do**:
  - Do NOT define actual colors
  - Do NOT define typography
  - Do NOT create custom themes

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Reason**: Simple file creation with basic Flutter import

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks10-11, 13-15)

  **References**:
  - `docs/02-architecture/04-frontend-patterns.md:11-13` - Theme file location

  **Acceptance Criteria**:
  - [ ] `app/lib/config/theme.dart` exists
  - [ ] Contains `ThemeData` definitions
  - [ ] `flutter analyze` passes

  **QA Scenarios**:
  ```
  Scenario: Theme file exists and is valid
    Tool: Bash
    Preconditions: Tasks 1-2 complete
    Steps:
      1. test -f app/lib/config/theme.dart
      2. grep "ThemeData" app/lib/config/theme.dart
      3. cd app && flutter analyze lib/config/theme.dart
    Expected Result: File exists, ThemeData present, analyze passes
    Evidence: .sisyphus/evidence/task-12-theme.txt
  ```

  **Commit**: NO (groups with Wave 3 tasks)

---

- [x] 13. Create Constants File

  **What to do**:
  - Create `app/lib/core/constants.dart` with constant placeholders
  - Define empty constant classes

  **File Contents**:
  ```dart
  // app/lib/core/constants.dart
  
  /// Application constants.
  /// TODO: Add API endpoints, timeouts, default values.
  class ApiConstants {
    // TODO: Add Supabase URL and anon key
  }
  
  class AppConstants {
    // TODO: Add app-level constants
  }
  ```

  **Must NOT do**:
  - Do NOT add actual API keys or URLs
  - Do NOT add environment-specific values

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Reason**: Simple file creation

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 10-12, 14-15)

  **References**:
  - `docs/00-quick-reference.md:168-176` - Environment setup

  **Acceptance Criteria**:
  - [ ] `app/lib/core/constants.dart` exists
  - [ ] Contains constant class definitions
  - [ ] `flutter analyze` passes

  **QA Scenarios**:
  ```
  Scenario: Constants file exists and is valid
    Tool: Bash
    Preconditions: Tasks 1-2 complete
    Steps:
      1. test -f app/lib/core/constants.dart
      2. grep "class.*Constants" app/lib/core/constants.dart
      3. cd app && flutter analyze lib/core/constants.dart
    Expected Result: File exists, constant classes present, analyze passes
    Evidence: .sisyphus/evidence/task-13-constants.txt
  ```

  **Commit**: NO (groups with Wave 3 tasks)

---

- [x] 14. Create App Entry Points

  **What to do**:
  - Create `app/lib/main.dart` with ProviderScope wrapper
  - Create `app/lib/app.dart` with MaterialApp shell
  - Wire up RouterProvider

  **File Contents**:
  ```dart
  // app/lib/main.dart
  import 'package:flutter/material.dart';
  import 'package:flutter_riverpod/flutter_riverpod.dart';
  import 'app.dart';
  
  void main() {
    runApp(
      const ProviderScope(
        child: MyApp(),
      ),
    );
  }
  
  // app/lib/app.dart
  import 'package:flutter/material.dart';
  import 'config/router.dart';
  import 'config/theme.dart';
  
  class MyApp extends StatelessWidget {
    const MyApp({super.key});
  
    @override
    Widget build(BuildContext context) {
      return MaterialApp.router(
        title: 'Recipe Assistant',
        theme: AppTheme.lightTheme,
        darkTheme: AppTheme.darkTheme,
        routerConfig: router,
      );
    }
  }
  ```

  **Must NOT do**:
  - Do NOT add actual pages or routes
  - Do NOT add authentication logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Reason**: Simple file creation with basic Flutter/Riverpod imports

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 10-13, 15)

  **References**:
  - `docs/02-architecture/04-frontend-patterns.md:50-83` - Provider setup example

  **Acceptance Criteria**:
  - [ ] `app/lib/main.dart` exists with ProviderScope
  - [ ] `app/lib/app.dart` exists with MaterialApp.router
  - [ ] `flutter analyze` passes

  **QA Scenarios**:
  ```
  Scenario: Main and app files exist and are valid
    Tool: Bash
    Preconditions: Tasks 2, 7, 11-12 complete
    Steps:
      1. test -f app/lib/main.dart
      2. test -f app/lib/app.dart
      3. grep "ProviderScope" app/lib/main.dart
      4. grep "MaterialApp.router" app/lib/app.dart
      5. cd app && flutter analyze lib/main.dart lib/app.dart
    Expected Result: Files exist, imports present, analyze passes
    Evidence: .sisyphus/evidence/task-14-entry.txt
  ```

  **Commit**: NO (groups with Wave 3 tasks)

---

- [x] 15. Create Empty Riverpod Provider Setup

  **What to do**:
  - Create `app/lib/presentation/providers/providers.dart` (placeholder)
  - Add TODO comments for future providers

  **File Contents**:
  ```dart
  // app/lib/presentation/providers/providers.dart
  import 'package:flutter_riverpod/flutter_riverpod.dart';
  
  /// Application providers.
  /// TODO: Add recipe list provider, detail provider, etc.
  /// 
  /// Example usage with code generation:
  /// @riverpod
  /// class RecipeList extends _$RecipeList {
  ///   @override
  ///   Future<List<Recipe>> build() async {
  ///     // TODO: Implement
  ///   }
  /// }
  
  // Placeholder for providers - will use riverpod_annotation
  ```

  **Must NOT do**:
  - Do NOT create actual provider implementations
  - Do NOT create provider files for each feature

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Reason**: Simple file creation

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 10-14)

  **References**:
  - `docs/02-architecture/04-frontend-patterns.md:49-101` - Riverpod pattern examples

  **Acceptance Criteria**:
  - [ ] `app/lib/presentation/providers/providers.dart` exists
  - [ ] Contains Riverpod import
  - [ ] `flutter analyze` passes

  **QA Scenarios**:
  ```
  Scenario: Providers file exists
    Tool: Bash
    Preconditions: Tasks 2, 6 complete
    Steps:
      1. test -f app/lib/presentation/providers/providers.dart
      2. grep "flutter_riverpod" app/lib/presentation/providers/providers.dart
      3. cd app && flutter analyze lib/presentation/providers/
    Expected Result: File exists, import present, analyze passes
    Evidence: .sisyphus/evidence/task-15-providers.txt
  ```

  **Commit**: YES
  - Message: `chore: add Flutter interface files and configuration`
  - Files: `app/lib/data/repositories/`, `app/lib/config/`, `app/lib/core/`, `app/lib/presentation/providers/`, `app/lib/main.dart`, `app/lib/app.dart`

---

- [x] 16. Create Supabase Folder Structure

  **What to do**:
  - Create `supabase/` directory at project root
  - Create `supabase/functions/` directory
  - Create `supabase/migrations/` directory
  - Create `supabase/config.toml` placeholder

  **Directory Structure**:
  ```
  supabase/
  ├── functions/
  ├── migrations/
  └── config.toml
  ```

  **config.toml placeholder**:
  ```toml
  # Supabase configuration
  # TODO: Run `supabase init` for full configuration
  
  [functions]
  verify_jwt = true
  ```

  **Must NOT do**:
  - Do NOT initialize Supabase project (requires supabase CLI)
  - Do NOT add database connection strings

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Reason**: Simple directory creation

  **Parallelization**:
  - **Can Run In Parallel**: YES (independent of Flutter tasks)
  - **Parallel Group**: Wave 4 (with Tasks 17-19)

  **References**:
  - `docs/02-architecture/01-system-overview.md:142-159` - File structure

  **Acceptance Criteria**:
  - [ ] `supabase/` directory exists
  - [ ] `supabase/functions/` directory exists
  - [ ] `supabase/migrations/` directory exists
  - [ ] `supabase/config.toml` exists

  **QA Scenarios**:
  ```
  Scenario: Supabase directories exist
    Tool: Bash
    Preconditions: None (can run in parallel with Flutter tasks)
    Steps:
      1. test -d supabase && echo "EXISTS" || echo "NOT_FOUND"
      2. test -d supabase/functions && echo "EXISTS" || echo "NOT_FOUND"
      3. test -d supabase/migrations && echo "EXISTS" || echo "NOT_FOUND"
      4. test -f supabase/config.toml && echo "EXISTS" || echo "NOT_FOUND"
    Expected Result: All "EXISTS"
    Evidence: .sisyphus/evidence/task-16-supabase-structure.txt
  ```

  **Commit**: NO (groups with Wave 4 tasks)

---

- [x] 17. Create validate-url Edge Function Shell

  **What to do**:
  - Create `supabase/functions/validate-url/` directory
  - Create `supabase/functions/validate-url/index.ts` with type signatures
  - Follow Deno Edge Function conventions

  **File Contents**:
  ```typescript
  // supabase/functions/validate-url/index.ts
  import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
  
  interface ValidateUrlRequest {
    url: string
  }
  
  interface ValidateUrlResponse {
    valid: boolean
    confidence: number
    method?: 'schema' | 'ai'
    reason?: string
  }
  
  serve(async (req) => {
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders })
    }
  
    try {
      // TODO: Implement URL validation logic
      const body: ValidateUrlRequest = await req.json()
      
      return new Response(
        JSON.stringify({ valid: false, reason: 'Not implemented' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    } catch (error) {
      return new Response(
        JSON.stringify({ valid: false, reason: error.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }
  })
  ```

  **Must NOT do**:
  - Do NOT implement actual validation logic
  - Do NOT add AI/OpenAI calls

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Reason**: Simple file creation with type definitions

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 16, 18-19)

  **References**:
  - `docs/02-architecture/03-edge-functions.md:54-125` - validate-url interface definition

  **Acceptance Criteria**:
  - [ ] `supabase/functions/validate-url/index.ts` exists
  - [ ] Contains TypeScript interfaces
  - [ ] Contains serve function with CORS headers

  **QA Scenarios**:
  ```
  Scenario: validate-url function shell exists
    Tool: Bash
    Preconditions: Task 16 complete
    Steps:
      1. test -f supabase/functions/validate-url/index.ts
      2. grep "interface ValidateUrlRequest" supabase/functions/validate-url/index.ts
      3. grep "interface ValidateUrlResponse" supabase/functions/validate-url/index.ts
      4. grep "export default" supabase/functions/validate-url/index.ts || grep "serve(async" supabase/functions/validate-url/index.ts
    Expected Result: File exists, interfaces present, serve function present
    Evidence: .sisyphus/evidence/task-17-validate-url.txt
  ```

  **Commit**: NO (groups with Wave 4 tasks)

---

- [x] 18. Create parse-recipe Edge Function Shell

  **What to do**:
  - Create `supabase/functions/parse-recipe/` directory
  - Create `supabase/functions/parse-recipe/index.ts` with type signatures
  - Create `supabase/functions/parse-recipe/parsers/` directory (for future parser plugins)

  **File Contents**:
  ```typescript
  // supabase/functions/parse-recipe/index.ts
  import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
  import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
  
  interface ParseRecipeRequest {
    recipe_id: string
    url: string
  }
  
  interface ParseRecipeResponse {
    success: boolean
    parser: 'allrecipes' | 'bbcgoodfood' | 'schema' | 'ai'
    ingredientCount: number
    stepCount: number
  }
  
  interface ParsedRecipe {
    title: string
    description?: string
    ingredients: Array<{
      original: string
      quantity?: number
      unit?: string
      name: string
      notes?: string
    }>
    steps: Array<{
      instruction: string
      timerMinutes?: number
    }>
    prepTime?: number
    cookTime?: number
    servings?: number
  }
  
  serve(async (req) => {
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders })
    }
  
    try {
      // TODO: Implement recipe parsing logic
      const body: ParseRecipeRequest = await req.json()
      
      return new Response(
        JSON.stringify({ success: false, parser: 'ai', ingredientCount: 0, stepCount: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    } catch (error) {
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }
  })
  ```

  **Must NOT do**:
  - Do NOT implement parsing logic
  - Do NOT create parser implementations

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Reason**: Simple file creation

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 16-17, 19)

  **References**:
  - `docs/02-architecture/03-edge-functions.md:126-299` - parse-recipe interface definition

  **Acceptance Criteria**:
  - [ ] `supabase/functions/parse-recipe/index.ts` exists
  - [ ] `supabase/functions/parse-recipe/parsers/` directory exists
  - [ ] Contains TypeScript interfaces
  - [ ] Contains serve function

  **QA Scenarios**:
  ```
  Scenario: parse-recipe function shell exists
    Tool: Bash
    Preconditions: Task 16 complete
    Steps:
      1. test -f supabase/functions/parse-recipe/index.ts
      2. test -d supabase/functions/parse-recipe/parsers
      3. grep "interface ParseRecipeRequest" supabase/functions/parse-recipe/index.ts
      4. grep "interface ParsedRecipe" supabase/functions/parse-recipe/index.ts
    Expected Result: File and directory exist, interfaces present
    Evidence: .sisyphus/evidence/task-18-parse-recipe.txt
  ```

  **Commit**: NO (groups with Wave 4 tasks)

---

- [x] 19. Create Shared Types for Edge Functions

  **What to do**:
  - Create `supabase/functions/_shared/` directory
  - Create `supabase/functions/_shared/types.ts` with shared type definitions

  **File Contents**:
  ```typescript
  // supabase/functions/_shared/types.ts
  
  /**
   * Shared types for Edge Functions.
   * TODO: Add more shared types as needed.
   */
  
  export interface RecipeStatus {
    id: string
    status: 'pending' | 'parsing' | 'parsed' | 'draft' | 'error'
    parseError?: string
  }
  
  export interface IngredientData {
    original: string
    quantity?: number
    unit?: string
    name: string
    notes?: string
  }
  
  export interface StepData {
    instruction: string
    timerMinutes?: number
  }
  
  export interface SupabaseConfig {
    url: string
    anonKey: string
    serviceRoleKey?: string
  }
  
  /**
   * CORS headers for Edge Functions.
   */
  export const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
  ```

  **Must NOT do**:
  - Do NOT add Supabase client implementation
  - Do NOT add secrets or keys

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Reason**: Simple file creation

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 16-18)

  **References**:
  - `docs/02-architecture/03-edge-functions.md:381-406` - Shared types definition

  **Acceptance Criteria**:
  - [ ] `supabase/functions/_shared/` directory exists
  - [ ] `supabase/functions/_shared/types.ts` exists
  - [ ] Contains exported interfaces and constants

  **QA Scenarios**:
  ```
  Scenario: Shared types file exists
    Tool: Bash
    Preconditions: Task 16 complete
    Steps:
      1. test -d supabase/functions/_shared
      2. test -f supabase/functions/_shared/types.ts
      3. grep "export interface RecipeStatus" supabase/functions/_shared/types.ts
      4. grep "export const corsHeaders" supabase/functions/_shared/types.ts
    Expected Result: Directory and file exist, interfaces present
    Evidence: .sisyphus/evidence/task-19-shared-types.txt
  ```

  **Commit**: YES
  - Message: `chore: create Supabase Edge Functions structure`
  - Files: `supabase/`

---

## Final Verification Wave (MANDATORY)

> 4 review checks run in PARALLEL. ALL must PASS. Present consolidated results to user.

- [x] F1. **Flutter Analyze Verification** — `quick`
  Run `flutter analyze` in `/app/` directory. Verify no errors or warnings. Check that all Dart files are syntactically valid.
  
  **Verification Command**:
  ```bash
  cd app && flutter analyze
  ```
  
  **Expected**: `No issues found` or equivalent success message.
  **Evidence**: `.sisyphus/evidence/final-01-analyze.txt`

- [x] F2. **Dependency Resolution Check** — `quick`
  Run `dart pub get` in `/app/` directory. Verify all dependencies resolve without conflicts.
  
  **Verification Command**:
  ```bash
  cd app && dart pub get
  ```
  
  **Expected**: Exit code 0, "Got dependencies" or similar success message.
  **Evidence**: `.sisyphus/evidence/final-02-pub-get.txt`

- [x] F3. **Folder Structure Verification** — `quick`
  Verify all expected directories and files exist per architecture documentation.
  
  **Verification Command**:
  ```bash
  # Flutter folders
  test -d app/lib/data/models
  test -d app/lib/data/repositories
  test -d app/lib/data/services
  test -d app/lib/data/local
  test -d app/lib/domain/use_cases
  test -d app/lib/domain/entities
  test -d app/lib/presentation/providers
  test -d app/lib/presentation/pages
  test -d app/lib/presentation/widgets
  test -d app/lib/config
  test -d app/lib/core/utils
  test -d app/lib/core/extensions
  test -d app/test/unit
  test -d app/test/integration
  test -d app/test/widget
  
  # Supabase folders
  test -d supabase/functions
  test -d supabase/functions/validate-url
  test -d supabase/functions/parse-recipe
  test -d supabase/functions/parse-recipe/parsers
  test -d supabase/functions/_shared
  test -d supabase/migrations
  ```
  
  **Expected**: All directories exist.
  **Evidence**: `.sisyphus/evidence/final-03-folders.txt`

- [x] F4. **File Validity Check** — `quick`
  Verify key files exist and contain expected content patterns. Verify no barrel files created. Verify no implementation code beyond shells.
  
  **Verification Commands**:
  ```bash
  # Key files exist
  test -f app/lib/main.dart
  test -f app/lib/app.dart
  test -f app/lib/config/router.dart
  test -f app/lib/config/theme.dart
  test -f app/lib/config/constants.dart
  test -f app/lib/core/constants.dart
  test -f app/lib/data/repositories/i_recipe_repository.dart
  test -f app/lib/data/repositories/i_ingredient_repository.dart
  test -f app/lib/data/repositories/i_step_repository.dart
  test -f app/lib/presentation/providers/providers.dart
  test -f app/pubspec.yaml
  test -f app/analysis_options.yaml
  test -f app/.gitignore
  test -f app/build.yaml
  test -f supabase/config.toml
  test -f supabase/functions/validate-url/index.ts
  test -f supabase/functions/parse-recipe/index.ts
  test -f supabase/functions/_shared/types.ts
  
  # No barrel files
  ! find app/lib -name "index.dart" -type f | grep -q .
  
  # No generated files committed
  ! find app/lib -name "*.g.dart" -type f | grep -q .
  ! find app/lib -name "*.freezed.dart" -type f | grep -q .
  
  # Check for Must NOT Have patterns
  ! grep -r "return" app/lib/data/repositories/*.dart 2>/dev/null | grep -v "// TODO" || echo "FAIL: Implementation found in repositories"
  ```
  
  **Expected**: All files exist, no barrel files, no generated files, no implementations.
  **Evidence**: `.sisyphus/evidence/final-04-files.txt`

---

## Commit Strategy

| Commit | Message | Files |
|--------|---------|-------|
| 1 | `chore: initialize Flutter project in /app/` | `app/` (Flutter project structure) |
| 2 | `chore: add dependencies and configuration files` | `app/pubspec.yaml`, `app/analysis_options.yaml`, `app/.gitignore`, `app/build.yaml` |
| 3 | `chore: create Flutter folder structure` | `app/lib/`, `app/test/` |
| 4 | `chore: add Flutter interface files and configuration` | `app/lib/data/repositories/`, `app/lib/config/`, `app/lib/core/`, `app/lib/presentation/providers/`, `app/lib/main.dart`, `app/lib/app.dart` |
| 5 | `chore: create Supabase Edge Functions structure` | `supabase/` |

---

## Success Criteria

### Verification Commands
```bash
# Flutter analyze passes
cd app && flutter analyze
# Expected: No issues found

# Dependencies resolve
cd app && dart pub get
# Expected: Resolved successfully

# All folders exist
ls -la app/lib/data/repositories/
ls -la app/lib/data/models/
ls -la app/lib/domain/
ls -la app/lib/presentation/
ls -la app/lib/config/
ls -la app/lib/core/
ls -la supabase/functions/validate-url/
ls -la supabase/functions/parse-recipe/
# Expected: All directories exist

# .gitignore excludes generated files
grep "*.g.dart" app/.gitignore
grep "*.freezed.dart" app/.gitignore
grep ".env" app/.gitignore
# Expected: All patterns present
```

### Final Checklist
- [x] All "Must Have" present
  - [x] Flutter project in `/app/`
  - [x] All dependencies with correct versions
  - [x] All folder structure per architecture docs
  - [x] Repository interfaces (empty shells)
  - [x] GoRouter configuration (empty routes)
  - [x] Theme configuration (ThemeData shells)
  - [x] Constants file (placeholder constants)
  - [x] Analysis options with flutter_lints
  - [x] .gitignore with generated file exclusions
  - [x] build.yaml for code generation
  - [x] Supabase functions structure

- [x] All "Must NOT Have" absent
  - [x] NO business logic in repositories
  - [x] NO actual widget implementations
  - [x] NO barrel files
  - [x] NO generated files committed
  - [x] NO .env files
  - [x] NO CI/CD configuration
  - [x] NO platform-specific native code modifications
  - [x] NO test implementations
  - [x] NO Supabase edge function logic
  - [x] NO authentication flows
  - [x] NO example implementations

- [x] `flutter analyze` passes
- [x] `dart pub get` succeeds
- [x] No barrel files created
- [x] No generated files committed
- [x] No implementation code (only shells)

---

## Final Verification Wave (MANDATORY)

(To be added via Edit commands)

---

## Commit Strategy

- **Commit 1**: `chore: initialize Flutter project structure`
- **Commit 2**: `chore: add dependencies and configuration files`
- **Commit 3**: `chore: add Supabase functions structure`

---

## Success Criteria

### Verification Commands
```bash
# Flutter analyze passes
cd app && flutter analyze
Expected: No issues found

# Dependencies resolve
cd app && dart pub get
Expected: Dependencies resolved successfully

# All folders exist
ls -la app/lib/data/repositories/
ls -la app/lib/data/models/
ls -la app/lib/domain/
ls -la app/lib/presentation/
ls -la app/lib/config/
ls -la app/lib/core/
ls -la supabase/functions/validate-url/
ls -la supabase/functions/parse-recipe/
Expected: All directories exist

# .gitignore excludes generated files
grep "*.g.dart" app/.gitignore
grep "*.freezed.dart" app/.gitignore
grep ".env" app/.gitignore
Expected: All patterns present
```

### Final Checklist
- [x] All "Must Have" present
- [x] All "Must NOT Have" absent
- [x] `flutter analyze` passes
- [x] `dart pub get` succeeds
- [x] No barrel files created
- [x] No generated files committed
- [x] No implementation code (only shells)