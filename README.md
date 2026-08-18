# Daylign
### Personal Learning, Habit & Activity Tracker

> A serene, lightweight productivity SPA designed for harmonizing cyclical habits, study routines, and permanent checklists under a single unified model. Built with a decoupled client-serverless architecture.

---

## Key Features

- **Activity Hub**: Group routines and checklists into customizable pastel-themed categories (`Lavender`, `Mint`, `Peach`, `Butter`).
- **Configurable Reset Modes**:
  - **Daily Reset**: Tasks automatically reset at local midnight (`00:00`) with server-side transaction-guarded idempotency, preserving historical data in analytics.
  - **Permanent**: Tasks persist until manually cleared or unchecked.
- **Precision Stopwatch & Timing Engine**:
  - Live ticking stopwatch with start/pause accumulation across sessions.
  - Auto-stops and logs duration upon task completion or settings toggle.
- **Visual Analytics (Chart.js)**:
  - Dual-axis interactive charts displaying completion rate and daily time spent.
  - 7-day and 30-day range filters with server-side pre-aggregation.
- **Decoupled Client-Serverless Architecture**:
  - **Zero database queries on the client**: All Firestore CRUD, cascade deletions, time logging, and reset operations execute strictly on the backend via Firebase Cloud Functions.
  - **JWT Bearer Token Authentication**: All `/api/*` endpoints verify Firebase Auth ID Tokens.
- **Zero Frontend Framework Dependencies**:
  - Built with native ES6+ modules, semantic HTML5 (`<article>`, `<section>`, `<dialog>`), Tailwind CSS, and Chart.js.
- **Custom Pastel 404 Page**:
  - Dedicated `404.html` error page matching the application design tokens with direct return navigation.

---

## Architecture & Tech Stack

| Layer | Technology | Description |
|---|---|---|
| **Frontend UI** | Vanilla ES6+ Modules | Native modules with hash routing (`apiClient.js`) |
| **Styling** | Tailwind CSS | Custom pastel tokens (`lavender`, `mint`, `peach`, `butter`) |
| **Visualizations** | Chart.js via CDN | Dual-axis completion & time-spent visual analytics |
| **Client Auth** | Firebase Auth v10 SDK | Email/Password & Guest Anonymous sign-in |
| **Serverless Backend** | Firebase Cloud Functions (Node.js/Express) | Express REST API powered by `firebase-admin` |
| **Database** | Cloud Firestore | Isolated user-scoped hierarchy (`users/{uid}`) |
| **Hosting & Routing** | Firebase Hosting | SPA hash routing + `/api/**` Cloud Function rewrites |

---

## REST API Endpoints (`/api/*`)

All backend endpoints require `Authorization: Bearer <idToken>`.

| Endpoint | Method | Description |
|---|---|---|
| `/api/categories` | `GET` | Fetch all user categories ordered by `order ASC` |
| `/api/categories` | `POST` | Create a new category |
| `/api/categories/:id` | `PATCH` | Update category properties |
| `/api/categories/:id` | `DELETE` | Cascade delete category, checklists, and subcollection tasks |
| `/api/checklists` | `GET` | Fetch user checklists (optional `?categoryId=...`) |
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
├── functions/                   # Serverless Express backend (Firebase Functions)
│   ├── package.json             # Backend dependencies (firebase-admin, express, cors)
│   └── index.js                 # Express API routes & token verification middleware
├── public/                      # Static decoupled frontend
│   ├── index.html               # Semantic HTML skeleton & Tailwind config
│   ├── 404.html                 # Custom pastel 404 error page
│   └── js/
│       ├── app.js               # SPA entry point & hash router
│       ├── apiClient.js         # Decoupled REST client with Bearer token injection
│       ├── auth.js              # Firebase Auth wrapper (Email/Password & Anonymous)
│       ├── db.js                # Frontend data adapter delegating to apiClient.js
│       ├── timer.js             # Stopwatch engine & duration formatting
│       ├── chartManager.js      # Chart.js analytics & data aggregation
│       ├── modals.js            # Native <dialog> modal controllers
│       ├── resetEngine.js       # Midnight reset engine trigger
│       └── views/
│           ├── hub.js           # Category Hub view (#/ or #/home)
│           ├── categoryDetail.js# Category Detail view (#/category/:id)
│           └── checklistDetail.js# Checklist Detail view (#/checklist/:id)
├── docs/                        # Architecture specs (PRD, TechSpec, Schema, Design, AppFlow)
├── firestore.rules              # User-scoped ownership & timeLogs immutability rules
├── firestore.indexes.json       # Composite query indexes
└── firebase.json                # Firebase Hosting & Cloud Functions configuration
```

---

## Getting Started

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

### 4. Run Locally with Firebase Emulators
```bash
firebase emulators:start
```

### 5. Deploy Live to Firebase
```bash
# Deploy Functions, Firestore rules, indexes, and static Hosting
firebase deploy
```

---

## License
MIT License. Created for calm and focused productivity.
