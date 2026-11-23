# LabLink — Intelligent Campus Laboratory Resource Sharing Platform

**Discover · Book · Innovate**

LabLink is a full-stack TypeScript, React, Express, and SQLite application for campus laboratory discovery, real-time hourly bench scheduling (`India/Karnataka` IST), AI-powered project planning, fair allocation (`60/40` priority queue), equipment responsibility agreements, and non-punitive damage reporting.

---

## Authentication & Access Model

- **Students (Name-Only Sign In)**:
  - Students do **not** register or create passwords.
  - Enter your name on the **Student Sign In** tab to access equipment discovery, real-time availability, project planning, bookings, and damage reporting (`role = 'student'`).
- **Faculty & Administrators (Password-Protected Portals)**:
  - On first launch (when no `FACULTY_PASSCODE` or `ADMIN_PASSCODE` environment variables are set), open the **Faculty / Admin Sign In** tab to set your own Faculty and Admin portal passwords.
  - Passwords are hashed using salted `scrypt` (`crypto.scryptSync` + `crypto.timingSafeEqual`) in SQLite (`data/lablink.db`).
  - Administrators can update either portal password anytime under **Admin Dashboard → Passwords & Staff**, or you can override them via server environment variables (`FACULTY_PASSCODE` and `ADMIN_PASSCODE`).

---

## Key Features

- **SQLite Persistent Database (`data/lablink.db`)**:
  - Editable campus hierarchy: Campus Blocks → Floors → Laboratory Rooms (`Mon–Sat 09:00–17:00 IST`, Sundays & configured college holidays closed).
  - Pre-deactivation check highlights affected future bookings before deactivating a lab room.
  - Moving equipment preserves original historical location snapshots on existing bookings.
- **Real-Time Dynamic Scheduling (`India/Karnataka` IST)**:
  - Slot availability calculated transactionally from live `pending` and `approved` reservations plus equipment unit states (`available`, `maintenance`, `damaged`).
  - Selectable `1h`, `2h`, `3h`, `4h`, or custom duration windows with server-enforced overlap/overbooking prevention.
- **Equipment Responsibility Agreement & Damage Reporting**:
  - Mandatory student agreement acceptance timestamped on every booking.
  - **Report Damage** action in *My Bookings* locks affected units until Faculty inspects, records findings/responsibility, schedules maintenance rescue proposals, or clears the unit.
- **AI Natural-Language Discovery & Project Dependency Planner**:
  - Powered by `@google/genai` (with deterministic specification fallback if `GEMINI_API_KEY` is absent).

---

## Running Locally

```bash
npm install
npm run dev
```

Optional environment variables (see `.env.example`):

- `GEMINI_API_KEY`: Enables Gemini natural-language equipment discovery and multi-stage project planning.
- `FACULTY_PASSCODE` / `ADMIN_PASSCODE`: Optional server-side password overrides for Faculty and Administrator logins.
