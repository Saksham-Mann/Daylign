# Daylign
### Personal Learning, Habit & Activity Tracker

> A serene, lightweight productivity single-page application (SPA) designed for harmonizing cyclical habits, study routines, sticky notes, and permanent checklists under a single unified model. Built with a decoupled client-serverless architecture, real-time Firestore sync, and resilient local caching.

---

## Table of Contents

1. [Overview](#overview)
2. [Complete Feature Guide](#complete-feature-guide)
   - [Homescreen Dashboard](#1-homescreen-dashboard)
   - [Activity Categories Hub](#2-activity-categories-hub)
   - [Category Detail & Checklists](#3-category-detail--checklists)
   - [Checklist Detail, Tasks & Stopwatch Engine](#4-checklist-detail-tasks--stopwatch-engine)
   - [Visual Analytics & Progress Charts](#5-visual-analytics--progress-charts)
   - [Sticky Notes Board & Interactive Note Pad](#6-sticky-notes-board--interactive-note-pad)
   - [Authentication & User Profiles](#7-authentication--user-profiles)
   - [Data Resilience & Offline Caching](#8-data-resilience--offline-caching)
3. [Architecture & Tech Stack](#architecture--tech-stack)
4. [REST API Endpoints](#rest-api-endpoints)
5. [Repository Structure](#repository-structure)
6. [Local Development & Setup](#local-development--setup)
7. [Deployment](#deployment)
8. [License](#license)

---

## Overview

Daylign provides a distraction-free space for personal learning, habit tracking, deep-work sessions, and quick note capture. It bridges the gap between daily reset habits (like morning routines or workout regimens) and persistent checklists (like project milestones or reading lists), combining them with integrated precision timing, visual analytics, and interactive sticky notes.

---

## Complete Feature Guide

### 1. Homescreen Dashboard (`#/home` or `#`)
- **Active Timers Banner**: Displays currently running stopwatches in real time with live second-by-second duration tickers across active tasks.
- **Pinned Sticky Notes Section**: Surface your highest-priority notes directly on the main dashboard. Click any pinned note to launch the interactive note pad modal for instant typing and editing.
- **Activities Overview**: High-level card summary of your categories with direct count metrics for total checklists and pending tasks.
- **Quick Actions**: One-click shortcuts to create new categories, launch checklists, and draft sticky notes.
- **Empty State Guidance**: Clean placeholder cards that guide new users into creating their first activity category or note.

### 2. Activity Categories Hub (`#/hub`)
- **Category Organization**: Group related habits and checklists into high-level domains (e.g., Study, Health, Deep Work, Chores, Personal Projects).
- **Curated Color Palettes**: Choose from calming pastel themes including Lavender, Mint, Peach, Butter, Sky, Violet, Coral, Teal, Sage, and Slate.
- **Category Management**: Create, edit titles, update color themes, and safely delete categories with automated cascading cleanup of contained checklists and tasks.
- **Real-Time Counts**: Category cards show live indicators for total checklists and unfinished tasks.

### 3. Category Detail & Checklists (`#/category/:id`)
- **Checklist Catalog**: View all checklists belonging to a category with quick status pills indicating active reset modes (Daily Reset vs Permanent), stopwatch availability, and analytics status.
- **Checklist Creation Modal**: Create checklists with title, reset cadence, and optional stopwatch and analytics toggles.
- **Direct Navigation**: Jump directly into individual checklist detail views or return to the Category Hub.

### 4. Checklist Detail, Tasks & Stopwatch Engine (`#/checklist/:id`)
- **Task Management**:
  - Add tasks instantly with the Enter key or submit button.
  - Check/uncheck tasks with real-time UI strike-through and progress calculation.
  - Inline task renaming directly within the task item list.
  - Delete individual tasks with one click.
- **High-Contrast Reordering**:
  - Reorder tasks with accessible Up/Down arrow buttons.
  - Immediate local optimistic reordering with background batch updates.
- **Task Timestamps on Hover**:
  - Hover over any task card to inspect precise creation timestamp and completion timestamp.
- **Precision Stopwatch Engine**:
  - Start, pause, resume, and accumulate elapsed time across multiple sessions.
  - Automatically stops and writes duration logs into Firestore when a task is checked as completed.
  - Auto-pauses running timers when the timer feature is toggled off in checklist settings.
- **Configurable Reset Modes**:
  - **Daily Reset**: Tasks automatically reset at local midnight (00:00) using transaction-guarded idempotency checks while archiving historical completion logs for analytics.
  - **Permanent**: Tasks persist their completed state indefinitely until manually unchecked.
- **Checklist Settings Modal**: Customize checklist title, category assignment, reset mode, stopwatch toggle, and graph analytics toggle at any time.

### 5. Visual Analytics & Progress Charts
- **Dual-Axis Charts (Chart.js)**:
  - Visualizes daily completion percentages alongside total daily time spent.
  - 7-day and 30-day view range selectors with pre-aggregated server and client data buckets.
- **Automated Lifecycle & Refresh Guards**:
  - Periodic background auto-refresh every 60 minutes.
  - Canvas destruction and recreation lifecycle handling to prevent canvas overlap glitches.

### 6. Sticky Notes Board & Interactive Note Pad (`#/notes`)
- **Drag-and-Drop Grab Reordering**:
  - Grab any note card directly and drag it across the board to reorder notes into any custom sequence.
  - Visual drag affordances including card tilt, opacity transitions, and drop-target ring highlights.
  - Persists custom ordering to Firestore and local storage using batch sequencing.
- **Deterministic Priority Sorting**:
  - Pinned / starred notes (`isImportant: true`) are strictly sorted in front of normal notes.
  - Toggling a note's star automatically shifts it to the front (when pinned) or back (when unpinned).
- **Interactive Color-Specific Note Pad Modal**:
  - Click any note card to open a full-card writing pad styled in the note's pastel theme.
  - **Debounced Auto-Saving**: Automatically saves changes every 600ms during typing and supports Ctrl+S / Cmd+S manual saves.
  - **Palette Switcher**: Switch between 10 pastel color themes in real time (Butter, Peach, Mint, Sky, Lavender, Coral, Violet, Teal, Sage, Slate).
  - **Pinning**: Star or unstar directly inside the note pad to toggle homescreen visibility.
  - **Delete Note**: Remove sticky notes with confirmation modal protection.
- **Clean Distraction-Free Layout**: Clean header layout without search input clutter, displaying total and pinned note statistics.

### 7. Authentication & User Profiles
- **Firebase Auth v10**: Secure authentication supporting Email/Password sign-up and sign-in.
- **Anonymous Guest Mode**: One-click guest onboarding without requiring credentials.
- **Profile Modal**: View account metadata, toggle dark/light theme, sign out safely, or delete account.

### 8. Data Resilience & Offline Caching
- **Real-Time Synchronisation**: Live Firestore `onSnapshot` listeners deliver instant multi-tab and multi-device updates.
- **Local Fallback Store**: High-speed local cache (`localStorage`) ensures zero-latency UI rendering and full offline resilience.
- **Network Boundaries**: Graceful error cards (`errorStates.js`) with automatic recovery upon reconnecting to the internet.

---

## Architecture & Tech Stack

| Layer | Technology | Description |
|---|---|---|
| **Frontend UI** | Vanilla ES6+ Modules | Native modular JavaScript with client-side hash routing (`app.js`) |
| **Styling** | Tailwind CSS | Curated pastel design tokens (`lavender`, `mint`, `peach`, `butter`, etc.) |
| **Visualizations** | Chart.js via CDN | Dual-axis completion rate and time-spent visual analytics |
| **Client Auth** | Firebase Auth v10 SDK | Email/Password and Anonymous Guest authentication |
| **Database & Sync** | Cloud Firestore + Local Cache | Isolated user-scoped data model (`users/{uid}`) with optimistic cache |
| **Serverless Backend** | Firebase Cloud Functions (Node.js/Express) | Express REST API powered by `firebase-admin` |
| **Hosting & Routing** | Firebase Hosting | Static hosting with SPA rewrites |

---

## REST API Endpoints

All backend endpoints require `Authorization: Bearer <idToken>`.

| Endpoint | Method | Description |
|---|---|---|
| `/api/categories` | `GET` | Fetch all user categories ordered by `order ASC` |
| `/api/categories` | `POST` | Create a new category |
| `/api/categories/:id` | `PATCH` | Update category properties (title, color) |
| `/api/categories/:id` | `DELETE` | Cascade delete category, checklists, and subcollection tasks |
| `/api/checklists` | `GET` | Fetch user checklists (optional filter `?categoryId=...`) |
| `/api/checklists/:id` | `GET` | Fetch single checklist with category details |
| `/api/checklists` | `POST` | Create checklist with initial task batch |
| `/api/checklists/:id` | `PATCH` | Update checklist settings (auto-stops running timers if disabled) |
| `/api/checklists/:id` | `DELETE` | Cascade delete checklist and all tasks |
| `/api/checklists/:id/tasks` | `GET` | Fetch tasks for checklist ordered by `order ASC` |
| `/api/checklists/:id/tasks` | `POST` | Create new task in checklist |
| `/api/checklists/:id/tasks/:taskId` | `PATCH` | Update task (rename, start/pause timer, mark incomplete) |
| `/api/checklists/:id/tasks/:taskId` | `DELETE` | Delete single task |
| `/api/checklists/:id/tasks/reorder` | `POST` | Batch reorder task array |
| `/api/timer/complete` | `POST` | Complete task, auto-stop timer, and write immutable `timeLogs` |
| `/api/analytics` | `GET` | Pre-aggregate 7d/30d completion and time-spent buckets |
| `/api/engine/reset` | `POST` | Transaction-guarded midnight reset evaluation |

---

## Repository Structure

```
├── functions/                   # Serverless Express backend (Firebase Cloud Functions)
│   ├── package.json             # Backend dependencies (firebase-admin, express, cors)
│   └── index.js                 # Express API routes and token verification middleware
├── public/                      # Static decoupled frontend
│   ├── index.html               # Semantic HTML skeleton, modals, and Tailwind config
│   ├── 404.html                 # Custom pastel 404 error page
│   └── js/
│       ├── app.js               # SPA entry point, global auth state, and hash router
│       ├── apiClient.js         # Decoupled REST client with Bearer token injection
│       ├── auth.js              # Firebase Auth wrapper (Email/Password and Anonymous)
│       ├── db.js                # Firestore CRUD, batch reordering, resilient local caching
│       ├── timer.js             # Stopwatch engine and duration formatting utilities
│       ├── chartManager.js      # Chart.js analytics engine and data aggregation
│       ├── modals.js            # Native <dialog> modals including interactive sticky note pad
│       ├── resetEngine.js       # Midnight reset engine trigger
│       └── views/
│           ├── home.js          # Main dashboard with active trackers and pinned notes
│           ├── hub.js           # Activity categories hub view (#/ or #/hub)
│           ├── categoryDetail.js# Category checklists list view (#/category/:id)
│           ├── checklistDetail.js# Checklist tasks, stopwatch, and analytics (#/checklist/:id)
│           ├── notes.js         # Sticky notes board with drag-and-drop (#/notes)
│           └── errorStates.js   # Reusable section and full-page error boundaries
├── docs/                        # Architecture specifications (PRD, TechSpec, Schema, Design)
├── firestore.rules              # User-scoped ownership and timeLogs immutability rules
├── firestore.indexes.json       # Composite query indexes
└── firebase.json                # Firebase Hosting and Cloud Functions configuration
```

---

## Local Development & Setup

### 1. Clone the repository
```bash
git clone https://github.com/Saksham-Mann/Daylign.git
cd Daylign
```

### 2. Install Backend Dependencies
```bash
cd functions
npm install
cd ..
```

### 3. Configure Local Environment
Create a `.env` file in the root directory (based on `.env.example`):
```env
FIREBASE_API_KEY=your_api_key_here
FIREBASE_AUTH_DOMAIN=daylign-22030.firebaseapp.com
FIREBASE_PROJECT_ID=daylign-22030
FIREBASE_STORAGE_BUCKET=daylign-22030.firebasestorage.app
FIREBASE_MESSAGING_SENDER_ID=1026732202958
FIREBASE_APP_ID=1:1026732202958:web:504ca8ba6a15e7ce07a99f
FIREBASE_MEASUREMENT_ID=G-SEMDSMVSVV
```

### 4. Run Locally
Generate the local environment configuration:
```bash
node build.js
```
Serve the static frontend locally:
```bash
npx -y serve public -l 5000
```
Open `http://localhost:5000` in your browser.

Alternatively, run with Firebase Emulators:
```bash
firebase emulators:start
```

---

## Deployment

### Deploying to Cloudflare Pages

1. **Connect Repository**: Link your GitHub repository in the Cloudflare Pages dashboard.
2. **Build Settings**:
   - **Build command**: `node build.js`
   - **Build output directory**: `public`
3. **Environment Variables**: Add your Firebase configuration variables under **Settings > Environment variables**:
   - `FIREBASE_API_KEY`
   - `FIREBASE_AUTH_DOMAIN`
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_STORAGE_BUCKET`
   - `FIREBASE_MESSAGING_SENDER_ID`
   - `FIREBASE_APP_ID`
   - `FIREBASE_MEASUREMENT_ID`
4. **Authorize Domain in Firebase**:
   - Open **Firebase Console > Authentication > Settings > Authorized domains**.
   - Add your Cloudflare domain (e.g. `your-app.pages.dev` or custom domain).

### Deploying to Firebase

Deploy Cloud Functions, Firestore security rules, indexes, and static Hosting directly to Firebase:
```bash
firebase deploy
```

---

## License
MIT License. Created for calm, focused, and organized productivity.


