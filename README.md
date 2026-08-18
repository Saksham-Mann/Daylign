# Daylign
### Personal Learning, Habit & Activity Tracker

> A serene, lightweight, single-user productivity SPA designed for harmonizing cyclical habits, study routines, and permanent checklists under a single unified model.

---

## Key Features

- **Activity Hub**: Group routines and checklists into customizable pastel-themed categories (`Lavender`, `Mint`, `Peach`, `Butter`).
- **Configurable Reset Modes**:
  - **Daily Reset**: Tasks automatically reset at local midnight (`00:00`) with client-side transaction-guarded idempotency, preserving historical data in analytics.
  - **Permanent**: Tasks persist until manually cleared or unchecked.
- **Precision Stopwatch & Timing Engine**:
  - Live ticking stopwatch with start/pause accumulation across sessions.
  - Auto-stops and logs duration upon task completion or settings toggle.
- **Visual Analytics (Chart.js)**:
  - Dual-axis interactive charts displaying completion rate and daily time spent.
  - 7-day and 30-day range filters with client-side aggregation.
- **User-Scoped Security & Privacy**:
  - Firestore Security Rules enforce strict UID ownership and append-only immutability for `timeLogs`.
- **Zero Framework Dependencies**:
  - Built with native ES6+ modules, semantic HTML5 (`<article>`, `<section>`, `<dialog>`), Tailwind CSS, and Chart.js.

---

## Architecture & Tech Stack

| Layer | Technology |
|---|---|
| **Core Architecture** | Vanilla ES6+ Modules (Native `import`/`export`) |
| **Styling** | Tailwind CSS with custom pastel design tokens |
| **Data & Auth** | Firebase JS SDK v10+ (Modular: Auth & Cloud Firestore) |
| **Visualizations** | Chart.js via CDN |
| **Dialogs & Modals** | Native HTML5 `<dialog>` elements with built-in focus traps |
| **Hosting & Deployment**| Firebase Hosting (SPA rewrites configured) |

---

## Repository Structure

```
├── public/
│   ├── index.html               # Semantic HTML skeleton & Tailwind configuration
│   └── js/
│       ├── app.js               # SPA entry point & hash router
│       ├── auth.js              # Firebase Auth wrapper (Email/Password & Anonymous)
│       ├── db.js                # Typed Firestore CRUD & cascading deletes
│       ├── timer.js             # Stopwatch engine & duration formatting
│       ├── chartManager.js      # Chart.js analytics & data aggregation
│       ├── modals.js            # Native <dialog> modal controllers
│       ├── resetEngine.js       # Transaction-guarded midnight reset engine
│       └── views/
│           ├── hub.js           # Category Hub view (#/ or #/home)
│           ├── categoryDetail.js# Category Detail view (#/category/:id)
│           └── checklistDetail.js# Checklist Detail view (#/checklist/:id)
├── docs/                        # Architecture specs (PRD, TechSpec, Schema, Design, AppFlow)
├── firestore.rules              # User-scoped ownership & timeLogs immutability rules
├── firestore.indexes.json       # Composite query indexes
└── firebase.json                # Firebase Hosting & emulator configuration
```

---

## Getting Started

### 1. Clone the repository
```bash
git clone https://github.com/Saksham-Mann/Daylign.git
cd Daylign
```

### 2. Configure Firebase
In `public/js/auth.js`, update the `firebaseConfig` object with your Firebase project credentials from the [Firebase Console](https://console.firebase.google.com/):

```javascript
export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

### 3. Enable Authentication Providers
In **Firebase Console > Authentication > Sign-in method**:
- Enable **Email/Password**
- Enable **Anonymous** (guest sign-in)

### 4. Deploy to Firebase
```bash
# Deploy Firestore rules and composite indexes
firebase deploy --only firestore:rules,firestore:indexes

# Deploy static SPA to Firebase Hosting
firebase deploy --only hosting
```

*(Or test locally using `firebase emulators:start`)*.

---

## License
MIT License. Created for calm and focused productivity.
