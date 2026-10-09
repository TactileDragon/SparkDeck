# CLAUDE.md - AI Assistant Guide for SparkDeck

**Last Updated**: 2026-02-24
**Project**: SparkDeck Flashcards Application
**Repository**: teknoflame/Flashcards-app

## Table of Contents

1. [Project Overview](#project-overview)
2. [Codebase Structure](#codebase-structure)
3. [Architecture & Design Patterns](#architecture--design-patterns)
4. [Key Features](#key-features)
5. [Development Workflows](#development-workflows)
6. [Coding Conventions](#coding-conventions)
7. [Testing & Quality Assurance](#testing--quality-assurance)
8. [Common Tasks & Patterns](#common-tasks--patterns)
9. [Accessibility Guidelines](#accessibility-guidelines)
10. [Troubleshooting](#troubleshooting)

---

## Project Overview

**SparkDeck** is a full-stack flashcard application with Firebase authentication, cloud persistence via Neon PostgreSQL, and Netlify Functions as the serverless API layer. It emphasizes accessibility, multi-device sync, and a rich study experience including quiz mode with smart question generation.

### Tech Stack

- **Frontend**: Vanilla JavaScript (ES6+), HTML5, CSS3
- **Architecture**: Class-based OOP (`SoundManager` + `SparkDeckApp`)
- **Authentication**: Firebase Authentication (email/password)
- **Database**: Neon PostgreSQL (serverless, cloud-hosted)
- **API Layer**: Netlify Functions (serverless Node.js)
- **Local Cache**: localStorage (offline fallback + fast reads)
- **External APIs**: YouTube IFrame API (video embeds), Firebase Auth SDK (CDN)
- **Deployment**: Netlify (static hosting + serverless functions)

### Core Philosophy

1. **Accessibility First**: WCAG compliant, full keyboard navigation, screen reader support, dark mode, high contrast, font sizing, reduced motion
2. **Minimal Dependencies**: No build tools or frameworks. Only `pg`, `@netlify/functions`, and `jose` on the backend
3. **Cloud-First with Offline Fallback**: Data syncs to Neon PostgreSQL, localStorage serves as local cache
4. **Simple & Maintainable**: Readable code over clever abstractions

---

## Codebase Structure

```
Flashcards-app/
├── index.html                  # SPA shell (HTML structure + inline styles + auth UI)
├── app.js                      # Core application logic (SparkDeckApp + SoundManager)
├── auth.js                     # Firebase authentication flow
├── firebase-config.js          # Firebase project configuration
├── styles.css                  # External stylesheet (theming, dark mode, high contrast)
├── server.js                   # Node.js static file server (local dev)
├── netlify.toml                # Netlify build & function configuration
├── package.json                # Node project metadata + dependencies
├── deno.lock                   # Lock file
├── netlify/
│   └── functions/
│       ├── api-data.js         # Bulk data sync endpoint (GET/PUT all user data)
│       ├── api-user.js         # User registration/login sync
│       ├── setup-database.js   # Schema migrations (admin only)
│       ├── test-connection.js  # DB connectivity test (admin only)
│       ├── check-schema.js     # Schema inspector (admin only)
│       └── utils/
│           ├── auth.js         # Firebase token verification (JWT/RSA)
│           └── db.js           # PostgreSQL connection pool
├── sounds/                     # Audio files for sound effects
│   ├── flip.mp3
│   ├── enter-study.mp3
│   ├── exit-study.mp3
│   ├── correct.mp3
│   └── wrong.mp3
├── test-db.html                # Database connectivity test page
├── test-api.html               # Full API test page (requires login)
├── CLAUDE.md                   # This file - AI assistant guide
├── README.md                   # User-facing documentation
├── MIGRATION_PLAN.md           # Architecture migration documentation
├── ACCESSIBILITY_ROADMAP.md    # Accessibility improvement roadmap
└── SparkDeck Roadmap.md        # Feature roadmap
```

### File Responsibilities

#### `app.js` (~3,567 lines)
- **Purpose**: Core application logic
- **Contents**:
  - `SoundManager` class (lines 2-76) - Audio effects system
  - `SparkDeckApp` class (lines 79-3117) - Main application
  - Global helper functions (lines 3120-3126)
  - Modal prototype methods (lines 3128-3262)
  - Import/export methods (lines 3264-3567)
- **Key Classes**: `SoundManager`, `SparkDeckApp`

#### `index.html` (~2,312 lines)
- **Purpose**: SPA shell with auth UI, inline styles, and app structure
- **Contents**:
  - Auth screen (login/signup forms)
  - App header with user email + sign out
  - Tab navigation (My Decks, Create, Settings, Stats)
  - Study mode, quiz mode, and modal containers
  - Inline CSS with dark mode, high contrast, font sizing, reduced motion themes

#### `auth.js` (349 lines)
- **Purpose**: Firebase authentication flow
- **Contents**:
  - Login/signup form handling
  - Firebase `onAuthStateChanged` observer
  - Database sync on login (`syncWithDatabase()`)
  - Token management for API calls

#### `firebase-config.js` (30 lines)
- **Purpose**: Firebase project initialization
- **Project**: `sparkdeck-8d613`

#### `styles.css` (~35,000+ lines)
- **Purpose**: All visual styling including theming
- **Major sections**: Base styles, components, dark mode, high contrast mode, font size levels, reduced motion, auth screens, quiz mode, search/filter UI

#### `server.js` (75 lines)
- **Purpose**: Lightweight HTTP server for local development
- **Port**: 8000 (configurable via `PORT` env var)
- **Features**: Static file serving, MIME types (including audio), SPA fallback, path traversal protection

#### `netlify/functions/api-data.js` (~413 lines)
- **Purpose**: Bulk data sync endpoint
- **Endpoints**:
  - `GET` - Load all user data (folders, decks, cards, settings, stats)
  - `PUT` - Save all user data (transactional full replace)
- **Security**: Firebase token verification, parameterized SQL queries

#### `netlify/functions/api-user.js` (~78 lines)
- **Purpose**: User registration (find-or-create pattern)
- **Endpoint**: `POST` - Verify token, upsert user record, create default settings

#### `netlify/functions/utils/auth.js` (~181 lines)
- **Purpose**: Firebase ID token verification
- **Method**: RSA-SHA256 signature validation against Google's public certificates
- **Validation**: Issuer, audience, expiry, subject claims

#### `netlify/functions/utils/db.js` (~35 lines)
- **Purpose**: PostgreSQL connection pooling via `pg` library
- **Connection**: `DATABASE_URL` environment variable, SSL enabled, max 3 connections

---

## Architecture & Design Patterns

### System Architecture

```
Frontend (index.html + app.js + auth.js)
    ├── Firebase Auth (email/password)
    │   └── Generates ID tokens for API calls
    │
    ├── localStorage (fast local cache)
    │   └── sparkdeck-decks, sparkdeck-folders, sparkdeck-settings, sparkdeck-stats
    │
    └── Netlify Functions API
        ├── POST /api-user  (register/sync user)
        ├── GET  /api-data  (load all data)
        └── PUT  /api-data  (save all data)

            ↓ Firebase token verification ↓

Backend (Netlify Functions + Neon PostgreSQL)
    └── Database Tables:
        ├── users           (Firebase UID ↔ DB UUID mapping)
        ├── folders          (hierarchical, with parent_folder_id)
        ├── decks            (with category, visibility)
        ├── cards            (front, back, media_url, sort_order)
        ├── user_settings    (dark_mode, font_size, high_contrast, etc.)
        └── study_sessions   (deck_name, cards_studied, timestamp)
```

### Data Flow: Login to Study

1. User logs in via Firebase Auth
2. `auth.js` calls `api-user` (POST) to register/sync user in Neon DB
3. `auth.js` calls `api-data` (GET) to load cloud data
4. Smart merge: cloud data takes precedence; if cloud is empty, local data uploads
5. User studies/creates decks — changes save to localStorage immediately
6. `syncToCloud()` debounces (2-second wait) then PUTs all data to `api-data`
7. On page reload, repeat from step 2

### Class-Based Architecture

Two classes power the application:

```javascript
class SoundManager {
    constructor()           // Initialize audio objects
    preloadSounds()         // Preload 5 sound files
    play(soundName)         // Play with error handling
    toggleMute()            // Toggle + persist to localStorage
}

class SparkDeckApp {
    constructor() {
        this.soundManager = new SoundManager();
        this.decks = this.loadDecks();
        this.folders = this.loadFolders();
        this.settings = this.loadSettings();
        this.stats = this.loadStats();
        this.currentFolderId = null;        // Folder navigation state
        this.currentDeck = null;            // Active study deck
        this.currentCardIndex = 0;
        this.showingFront = true;
        this.quizMode = null;               // 'mc' | 'written' | 'mixed'
        this.quizCards = [];
        this.quizScore = 0;
        this.searchQuery = '';
        this.categoryFilter = '';
        this.editingDeckIndex = null;
        this.editingCardIndex = null;
        this._getAuthToken = null;          // Set by auth.js after login
        // ... DOM element references cached in initializeElements()
    }
}
```

### Data Models

#### Deck Object
```javascript
{
    name: "Biology Chapter 5",
    category: "Biology",                // Custom categories supported
    visibility: "private",              // 'private' | 'public' | 'unlisted' (future)
    folderId: "f_abc123" | null,
    cards: [...],
    created: "2025-12-25T10:30:00.000Z"
}
```

#### Card Object
```javascript
{
    front: "What is photosynthesis?",
    back: "Process of converting...",
    mediaUrl: "https://youtube.com/..." // String | null (optional)
}
```

#### Folder Object (Hierarchical)
```javascript
{
    id: "f_lx3k9p_abc123",
    name: "Chemistry Notes",
    parentFolderId: null | "f_parent_id",  // Enables nested folders
    created: "2025-12-25T10:30:00.000Z"
}
```

#### Settings Object
```javascript
{
    statsEnabled: true,
    darkMode: false,
    fontSize: 'medium',      // 'small' | 'medium' | 'large' | 'extra-large'
    highContrast: false,
    reducedMotion: false
}
```

#### Stats Object
```javascript
{
    studySessions: [
        {
            timestamp: "2025-12-25T10:30:00.000Z",
            deckName: "Biology 101",
            cardsStudied: 20
        }
    ]
}
```

### State Management

- **Primary Storage**: Neon PostgreSQL (source of truth for multi-device sync)
- **Local Cache**: localStorage (fast reads, offline fallback)
  - Key `sparkdeck-decks`: JSON array of decks
  - Key `sparkdeck-folders`: JSON array of folders
  - Key `sparkdeck-settings`: JSON settings object
  - Key `sparkdeck-stats`: JSON stats object
  - Key `sparkdeck-sounds-muted`: Boolean for sound preference
- **Sync Strategy**: Debounced cloud sync (2-second delay after changes)
- **Legacy Migration**: `migrateOldLocalStorage()` migrates `studyflow-*` keys to `sparkdeck-*`

### Database Schema (Neon PostgreSQL)

| Table | Key Columns | Purpose |
|-------|-------------|---------|
| `users` | `id` (UUID), `firebase_uid`, `email` | Firebase-to-DB user mapping |
| `folders` | `id` (INT), `name`, `parent_folder_id`, `user_id` | Hierarchical folder organization |
| `decks` | `id` (INT), `name`, `category`, `visibility`, `folder_id`, `user_id` | Study decks |
| `cards` | `id` (INT), `deck_id`, `front`, `back`, `media_url`, `sort_order` | Flashcards |
| `user_settings` | `user_id`, `dark_mode`, `font_size`, `high_contrast`, `reduced_motion`, `stats_enabled` | Per-user preferences |
| `study_sessions` | `user_id`, `deck_name`, `cards_studied`, `studied_at` | Study analytics |

### Security Model

1. **Firebase Token Verification**: RSA-SHA256 signature validation against Google's public certificates
2. **Database Isolation**: All queries filtered by `user_id` — users only access their own data
3. **SQL Injection Prevention**: Parameterized queries throughout
4. **Admin Functions Protected**: `setup-database`, `test-connection`, `check-schema` require `ADMIN_SECRET` header
5. **Secrets Server-Side Only**: `DATABASE_URL` and `ADMIN_SECRET` never exposed to frontend
6. **SSL Required**: Neon enforces SSL connections

---

## Key Features

### 1. Authentication (auth.js)
- Firebase email/password authentication
- Login and signup with client-side validation
- Auth state observer controls app visibility
- Token-based API authentication
- Smart sync: cloud data preferred, local data uploaded if cloud is empty

### 2. Deck Management (app.js:1830-1910)
- Create, edit, and delete decks
- Custom categories with dropdown + manual entry
- Organize into hierarchical folders
- Move decks between folders
- Export individual decks as JSON
- Empty state handling

### 3. Card Creation & Editing (app.js:2052-2374)
**Auto-Generate Mode** (app.js:2126-2180):
- Parse plain text notes into flashcards
- Patterns recognized:
  - `Question? \n Answer`
  - `Definition: Term \n Explanation`
  - `Term: Definition`
- Minimum definition length: 10 characters

**Manual Mode** (app.js:2183-2250):
- Front/back text input
- Optional media URL (YouTube, etc.)
- Real-time card preview
- Edit existing cards inline

### 4. Study Mode (app.js:2385-2480)
- Fisher-Yates shuffle on start
- Card flipping with sound effects
- Progress tracking (visual bar + percentage)
- Session recording for stats
- Keyboard shortcuts: Space/Enter (flip), Left/Right (navigate), Escape (exit)

### 5. Quiz Mode (app.js:2481-3049)
Sophisticated exam-like quiz system with three modes:

- **Multiple Choice**: Pick from 4 options with smart distractor generation
- **Written**: Type answer with fuzzy matching (80% keyword threshold, punctuation/whitespace tolerant)
- **Mixed**: Randomly alternates between both

**Smart Question Generation** (app.js:2579):
- Abbreviation detection: `LLM (Large Language Model)` becomes "What does LLM stand for?"
- Reverse abbreviation: `Large Language Model (LLM)` becomes "Spell out: LLM"
- Contextual question framing based on card content
- Intelligent distractor selection from same-format cards

### 6. Folder Organization (app.js:1212-1704)
- **Hierarchical nested folders** with `parentFolderId`
- Drill-down navigation with breadcrumb trail
- Create, rename, and delete folders
- Duplicate name prevention (case-insensitive)
- Recursive item counting
- Orphaned decks move to root when folder deleted

### 7. Search & Filtering (app.js:564-693)
- Real-time text search on deck names and categories
- Category filter dropdown (dynamically populated)
- Combined search + filter
- Results count display
- Clear filters button

### 8. Statistics & Analytics (app.js:947-1209)
- Study session tracking (deck name, card count, timestamp)
- Period-based filtering: lifetime, monthly, weekly, daily
- Metrics: total decks, sessions completed, cards studied
- Stats tab toggle in settings
- Reset stats with confirmation

### 9. Vision & Accessibility Settings (app.js:833-944)
- **Dark Mode**: Full theme with CSS custom properties
- **Font Size**: 4 levels (small, medium, large, extra-large)
- **High Contrast**: Black/white/yellow theme (overrides dark mode)
- **Reduced Motion**: Disables animations
- All settings persist to localStorage and sync to cloud

### 10. Sound Effects (app.js:2-76)
- `SoundManager` class with 5 preloaded sounds:
  - `flip.mp3` - Card flip
  - `enter-study.mp3` - Start study/quiz
  - `exit-study.mp3` - End study/quiz
  - `correct.mp3` - Correct quiz answer
  - `wrong.mp3` - Wrong quiz answer
- Mute toggle persisted to localStorage

### 11. Import/Export (app.js:3264-3567)
- **Single Deck Export**: Download individual deck as JSON
- **Full Backup Export**: All decks + folders as JSON
- **Import**: File picker with format detection
  - Single deck import with merge/replace option
  - Full backup import with folder ID remapping
- **Security**: HTML stripping, card data sanitization, field truncation

### 12. Media Embedding
- YouTube IFrame API integration
- Error handling (153, 101, 150)
- Fallback to direct links
- Toggle show/hide on card back
- file:// protocol warning

### 13. Keyboard Shortcuts
**Global** (when not typing):
- `d` - Go to My Decks
- `h` - Navigate to home/root folder
- `c` / `n` - Create new deck
- `f` - Create folder
- `s` - Start study (first deck)
- `1-9` - Quick study by deck number
- `?` - Open help modal

**Study Mode**: Space/Enter (flip), Left/Right (navigate), Escape (exit)
**Quiz Mode**: Escape (exit)
**Modals**: Escape (close), Tab (focus trap)

---

## Development Workflows

### Environment Variables

**Local Development** (`.env.local` - gitignored):
```bash
# Neon Database (used by Netlify Functions only)
DATABASE_URL='postgresql://user:pass@your-neon-host/your-db?sslmode=require'

# Admin functions protection
ADMIN_SECRET='your-secret-for-diagnostic-tools'
```

**Production** (Netlify Dashboard > Site Settings > Environment):
- `DATABASE_URL` - Neon PostgreSQL connection string
- `ADMIN_SECRET` - Admin endpoint protection

**Firebase config** is in `firebase-config.js` (public, safe to commit).

### Git Workflow

**Branch Strategy**:
- `main`: Production-ready code
- `develop`: Integration branch
- `feature-*`: Feature branches (e.g., `feature-add-video-imbeds-on-flashcards`)
- `claude/*`: AI-assisted branches (format: `claude/<description>-<SESSION_ID>`)

**Commit Conventions**:
- Descriptive commit messages (not using conventional commits)
- Merge commits for feature integration

### Local Development

**With Netlify Functions (recommended)**:
```bash
npx netlify dev        # Serves on port 8888, loads .env.local, runs functions
```

**Static only** (no API/auth):
```bash
npm start              # Uses server.js on port 8000
```

**Testing Database Connection**:
1. Run `npx netlify dev`
2. Visit `http://localhost:8888/test-db.html`
3. Click "Test Database Connection"

**Testing API Endpoints**:
1. Run `npx netlify dev`
2. Log in via the main app
3. Visit `http://localhost:8888/test-api.html`
4. Test `api-user` and `api-data` endpoints

### File Editing Guidelines

**When modifying `app.js`**:
- This is the primary source of application logic
- Cloud sync happens automatically via `syncToCloud()` after data changes

**When modifying `styles.css`**:
- Also update inline `<style>` in `index.html` for consistency
- Theming uses CSS custom properties for dark mode and high contrast

**When modifying Netlify Functions**:
- Test locally with `npx netlify dev`
- Functions auto-reload on file changes
- Always use parameterized SQL queries (never string interpolation)

**Adding New Features**:
1. Add DOM elements to `index.html`
2. Add element references in `initializeElements()`
3. Add event listeners in `setupEventListeners()`
4. Implement feature logic as class methods
5. Update relevant render method
6. Add styles to `styles.css` (and inline styles in `index.html`)
7. If feature involves data, update `syncToCloud()` payload and `api-data.js`

---

## Coding Conventions

### JavaScript Style

**Naming Conventions**:
- Classes: PascalCase (`SparkDeckApp`, `SoundManager`)
- Methods: camelCase (`loadDecks`, `renderDecks`, `syncToCloud`)
- Private methods: Prefix with `_` (`_openModalCommon`, `_doCloudSync`, `_getAuthToken`)
- Constants: UPPER_SNAKE_CASE (rare, mostly inline values)
- DOM elements: camelCase properties (`this.deckName`, `this.cardFront`)

**Code Organization** (in app.js):
- `SoundManager` class first
- `SparkDeckApp` constructor and initialization
- Event listeners setup
- Search/filter methods
- Data persistence (localStorage + cloud)
- Settings and vision methods
- Statistics system
- Folder operations
- Deck rendering and CRUD
- Card operations
- Study mode
- Quiz mode
- Modal system (prototype methods)
- Import/export

**Error Handling**:
- Try/catch for localStorage and API operations
- Console.warn() for non-critical errors
- Graceful degradation (localStorage fallback if cloud sync fails)
- User-facing error messages via `announce()`

**Async Patterns**:
- Async/await for API calls and cloud sync
- Promises for modal interactions (user confirmation)
- Debounced sync (2-second delay) to prevent API flooding

### HTML Conventions

**Semantic HTML**: `<nav>`, `<main>`, `<section>`, `<dialog>`
**ARIA Attributes**: `role="tablist/tab/tabpanel"`, `aria-live="polite"`, `aria-modal`, `aria-hidden`, `aria-describedby`
**ID Conventions**: Kebab-case, descriptive, unique across document

### CSS Conventions

**Class Naming**: Kebab-case (`.deck-card`, `.quiz-option`)
**Theming**: CSS custom properties for dark mode and high contrast
**Accessibility**: Never `outline: none` without replacement, `.sr-only` utility class, visible keyboard focus states

---

## Testing & Quality Assurance

### Current Testing Strategy

**Manual Testing** (no automated tests yet):
1. **Feature Testing**: All CRUD operations, study mode, quiz mode
2. **Auth Testing**: Login, signup, logout, token refresh
3. **Cloud Sync Testing**: Data persistence across devices/sessions
4. **Accessibility Testing**: Keyboard navigation, screen readers, themes
5. **Cross-Browser Testing**: Chrome, Firefox, Safari, Edge

### Test Pages

- `test-db.html` - Verify Neon PostgreSQL connectivity (requires `ADMIN_SECRET`)
- `test-api.html` - Test all API endpoints after Firebase login

### Test Checklist for New Features

- [ ] Keyboard accessible (no mouse required)
- [ ] Screen reader announces state changes
- [ ] Focus management is logical
- [ ] Works with dark mode, high contrast, and font size settings
- [ ] localStorage persists correctly
- [ ] Cloud sync works (data survives page reload after login)
- [ ] Error states are handled gracefully
- [ ] Empty states are handled
- [ ] User feedback is clear (announcements + sound effects)
- [ ] API endpoints validate input and return proper errors
- [ ] SQL queries are parameterized (no injection risk)

### Known Limitations

1. **No Build Process**: No transpilation, minification, or bundling
2. **No Type Checking**: Pure JavaScript (no TypeScript)
3. **No Unit Tests**: Manual testing only
4. **No CI/CD**: Manual deployment via Netlify
5. **Full Replace Sync**: PUT endpoint replaces all data (not incremental)
6. **YouTube Embeds**: Fail on file:// protocol (error 153)

---

## Common Tasks & Patterns

### Adding a New Modal Dialog

**For Confirmation Dialogs**:
```javascript
const confirmed = await this.openConfirmModal({
    title: 'Delete deck',
    message: 'Are you sure you want to delete "Biology"?',
    confirmText: 'Delete',
});
if (!confirmed) return;
```

**For Text Input**:
```javascript
const name = await this.openTextModal({
    title: 'Create folder',
    label: 'Folder name',
    confirmText: 'Create',
});
if (!name || !name.trim()) return;
```

**For Selection**:
```javascript
const choice = await this.openSelectModal({
    title: 'Move deck',
    label: 'Select folder',
    options: [...],
    confirmText: 'Move',
});
```

**For Quiz Mode Selection**:
```javascript
const mode = await this.openQuizModeModal();
// Returns 'mc', 'written', or 'mixed'
```

### Adding a New Deck Property

1. Update deck creation in `saveDeck()`
2. Update `renderDecks()` or relevant render method
3. Update `api-data.js` GET handler to return the new field
4. Update `api-data.js` PUT handler to save the new field
5. Add database column via `setup-database.js` migration
6. Provide defaults for existing decks: `deck.newProp = deck.newProp || defaultValue`

### Adding a New User Setting

1. Add property to settings object in `loadSettings()`
2. Add toggle/control method in app.js
3. Add UI control in `index.html` Settings tab
4. Add CSS if visual (e.g., theme)
5. Update `api-data.js` to include in settings GET/PUT
6. Add column to `user_settings` table via `setup-database.js`

### Adding a Keyboard Shortcut

**Global Shortcut** (app.js:312-419):
```javascript
// In setupEventListeners() keydown handler
if (e.key === 'x' && !isTyping && !isStudying && !isQuizzing) {
    e.preventDefault();
    this.myNewFeature();
}
```

### Adding Screen Reader Announcements

```javascript
this.announce('Deck created successfully');
```
- Keep concise (< 10 words)
- Use active voice ("Deck deleted" not "The deck has been deleted")

### Cloud Sync After Data Changes

After modifying decks, folders, settings, or stats:
```javascript
this.saveDecks();      // Saves to localStorage
this.syncToCloud();    // Debounced PUT to api-data (2-second delay)
```

---

## Accessibility Guidelines

### ARIA Best Practices

1. **Live Regions**: `#announcements` div with `aria-live="polite"` for status messages
2. **Tabs**: `role="tablist/tab/tabpanel"` with `aria-selected`
3. **Modals**: `role="dialog"` + `aria-modal="true"` + focus trap
4. **Dynamic Content**: `aria-label`, `aria-controls`, `aria-expanded`

### Keyboard Navigation

**Global**: Tab/Shift+Tab (navigate), Enter/Space (activate), Escape (close/exit)
**Study Mode**: Space/Enter (flip), Left/Right (navigate), Escape (exit)
**Quiz Mode**: Escape (exit)
**Modals**: Focus trap, Escape to close, focus restoration on close

### Vision Settings

- **Dark Mode**: CSS custom properties, full theme
- **High Contrast**: Black/white/yellow, overrides dark mode
- **Font Size**: 4 levels via CSS classes on body
- **Reduced Motion**: Disables transitions/animations

### Focus Management Checklist

- [ ] Focus moves logically (left-to-right, top-to-bottom)
- [ ] Modals trap focus (can't Tab outside)
- [ ] Closing modals restores previous focus
- [ ] New content receives focus when appropriate
- [ ] Focus indicators always visible
- [ ] Interactive elements are keyboard accessible

---

## Troubleshooting

### Issue: DATABASE_URL missing from .env.local

**Cause**: `.env.local` is gitignored and only exists locally. Can be lost during OS updates, editor accidents, or directory cleanup.

**Solution**:
1. Go to [console.neon.tech](https://console.neon.tech)
2. Select your SparkDeck project
3. Copy the connection string from Dashboard/Connection Details
4. Add to `.env.local`: `DATABASE_URL='postgresql://...'`

### Issue: Claude Desktop shows "cannot access repository"

**Cause**: Repository was renamed but Claude Desktop cached the old name.

**Solution**: Remove and re-add the repository in Claude Desktop to force re-registration.

### Issue: Cloud sync failing silently

**Cause**: Invalid or expired Firebase token, missing DATABASE_URL, or network error.

**Solution**:
- Check browser console for errors
- Verify `.env.local` has `DATABASE_URL` set
- Test connection via `test-db.html`
- Try logging out and back in (refreshes token)
- Data is safe in localStorage as fallback

### Issue: YouTube videos show error 153

**Cause**: Missing or blocked Referer header (common on file:// protocol)

**Solution**:
1. Use `npx netlify dev` (serves on http://localhost:8888)
2. Check browser extensions (some strip Referer)

### Issue: Admin functions return 401

**Cause**: Missing or wrong `ADMIN_SECRET` header.

**Solution**: Ensure `ADMIN_SECRET` is set in `.env.local` and passed as header in requests.

### Issue: Screen reader not announcing

**Cause**: ARIA live region not updating or timing issues.

**Solution**:
- Verify `#announcements` element exists
- Check `aria-live="polite"` attribute
- Ensure announcement text is not empty

---

## Future Enhancement Ideas

Based on codebase and roadmap analysis:

1. **Study Features**: Spaced repetition algorithm, study streaks, card difficulty tracking
2. **Social Features**: Public deck sharing, deck discovery, collaborative editing
3. **Developer Experience**: Unit tests, E2E tests, CI/CD pipeline, TypeScript migration
4. **Performance**: Incremental sync (diff-based instead of full replace), pagination for large decks
5. **Accessibility**: Text-to-speech for cards, improved color contrast audit
6. **Mobile**: PWA support, responsive improvements

---

## Key Files Quick Reference

| File | Lines | Primary Purpose | Key Sections |
|------|-------|-----------------|--------------|
| `app.js` | ~3,567 | Core logic | SoundManager (2-76), SparkDeckApp (79-3117), Modals (3128-3262), Import/Export (3264-3567) |
| `index.html` | ~2,312 | UI structure + auth | Auth screen, tabs, study/quiz containers, inline styles with theming |
| `auth.js` | 349 | Authentication | Login/signup handlers, onAuthStateChanged, syncWithDatabase |
| `firebase-config.js` | 30 | Firebase init | Project config, auth initialization |
| `styles.css` | ~35,000+ | Styling + themes | Base, components, dark mode, high contrast, font sizes, reduced motion |
| `server.js` | 75 | Dev server | Static serving, MIME types, SPA fallback |
| `api-data.js` | ~413 | Data sync API | GET (load all), PUT (save all with transaction) |
| `api-user.js` | ~78 | User sync API | POST (find-or-create user) |
| `utils/auth.js` | ~181 | Token verification | JWT decode, RSA signature validation, claims checking |
| `utils/db.js` | ~35 | DB connection | PostgreSQL pool (max 3), SSL enabled |

---

## Contact & Contribution

- **Author**: teknoflame
- **Repository**: github.com/teknoflame/Flashcards-app
- **License**: MIT (specified in package.json)

When contributing:
1. Follow existing code style and patterns
2. Test accessibility thoroughly (keyboard, screen reader, all themes)
3. Ensure cloud sync works after data changes
4. Use parameterized SQL queries in Netlify Functions
5. Keep frontend dependencies minimal (prefer vanilla JS)
6. Update both `styles.css` and inline styles in `index.html` for CSS changes

---

**Document Version**: 2.0
**Created**: 2025-12-25
**Last Major Update**: 2026-02-24
**AI Assistant**: Claude (Anthropic)
