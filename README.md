# LabLink – Intelligent Campus Laboratory Resource Sharing Platform

### Discover · Book · Innovate

**LabLink** is a full-stack campus laboratory resource-sharing platform designed to help students discover, access, and book laboratory equipment for hackathons, mini projects, major projects, research, innovation, and prototyping.

It connects students, faculty, and administrators through a centralized platform that makes laboratory resource management more organized, transparent, and accessible.

---

## Live Website

**Live Demo:** https://lablink-4u.ai.studio/

**GitHub Repository:** https://github.com/cktanuja367-wq/linklab

---

## The Problem

Students working on technical projects often face difficulties finding available laboratory equipment, knowing where resources are located, and getting permission to use them.

At the same time, faculty members need a better way to manage equipment, review booking requests, and monitor equipment usage.

LabLink addresses these challenges through a centralized digital platform.

## Our Solution

LabLink provides a shared platform where:

- Students can discover equipment and submit booking requests.
- Faculty can review, approve, or reject requests.
- Administrators can manage equipment, laboratory locations, and access.
- Project teams can plan their technical projects and identify required resources.

---

## Key Features

### 1. Equipment Discovery
- Search and explore available laboratory equipment.
- View equipment descriptions and availability.
- Find equipment based on laboratory locations.
- Discover resources for technical projects.

### 2. Smart Booking System
- Submit equipment booking requests.
- Select preferred dates and time durations.
- View booking status.
- Prevent overlapping reservations through backend validation.
- Support pending, approved, rejected, and cancelled booking states.

### 3. Student Portal
- Simple student access.
- Discover laboratory resources.
- Submit booking requests.
- Track booking status.
- Report equipment damage.

### 4. Faculty Portal
- Review student booking requests.
- Approve or reject bookings.
- Manage equipment availability.
- Review equipment damage reports.
- Manage maintenance status.

### 5. Admin Dashboard
- Manage students and faculty access.
- Manage laboratory blocks, floors, and rooms.
- Add and manage equipment.
- Manage portal passwords.
- Monitor laboratory resource usage.

### 6. AI-Powered Project Planning
- Understand project requirements.
- Identify relevant equipment and resources.
- Generate project stages and dependencies.
- Support different technical domains such as Web Development, AI/ML, IoT, Robotics, and Electronics.

### 7. Equipment Responsibility & Damage Reporting
- Student responsibility agreement during booking.
- Report damaged equipment.
- Faculty inspection and maintenance tracking.
- Temporarily restrict damaged equipment until inspection.

### 8. Fair Resource Allocation
- Priority-based booking allocation.
- Consider project deadlines and usage fairness.
- Apply equipment safety eligibility requirements.

---

## Technology Stack

| Category | Technologies |
|---|---|
| Frontend | React, TypeScript |
| Backend | Node.js, Express |
| Database | SQLite |
| Build Tool | Vite |
| AI Integration | Google Gemini API |
| Package Management | Bun / npm |
| Deployment | Google AI Studio publishing / compatible hosting |

---

## System Architecture

```text
             STUDENTS
                 |
             FACULTY
                 |
              ADMIN
                 |
                 v
          LABLINK FRONTEND
          React + TypeScript
                 |
                 v
           EXPRESS SERVER
              Node.js
                 |
        +--------+--------+
        |                 |
        v                 v
    SQLite DB        Gemini API
        |                 |
        v                 v
  Booking System    AI Project Planner
  Equipment Data    Smart Discovery
  User Roles
  Maintenance
```

---

## Booking Rules

- Laboratory operating hours: Monday to Saturday, 9:00 AM – 5:00 PM.
- Sundays and configured college holidays are closed.
- Booking durations can be selected according to availability.
- Pending and approved bookings are considered when checking availability.
- Overlapping reservations are prevented by backend validation.
- Equipment under maintenance or marked damaged is unavailable.

All scheduling uses Indian Standard Time (IST).

---

## Project Folder Structure

```text
LabLink/
│
├── public/
│
├── server/
│
├── src/
│
├── .env.example
├── .gitignore
├── README.md
├── bun.lock
├── index.html
├── metadata.json
├── package.json
├── server.ts
├── tsconfig.json
├── vercel.json
└── vite.config.ts
```

---

## Installation and Local Setup

### Prerequisites

- Node.js
- npm
- Git
- Google Gemini API key (optional for AI features)

### Step 1: Clone the repository

```bash
git clone https://github.com/cktanuja367-wq/linklab.git
```

### Step 2: Open the project

```bash
cd linklab
```

### Step 3: Install dependencies

```bash
npm install
```

### Step 4: Configure environment variables

Create a `.env` file using `.env.example` as a template.

```env
GEMINI_API_KEY=your_gemini_api_key

FACULTY_PASSCODE=
ADMIN_PASSCODE=

APP_URL=http://localhost:3000

CORS_ORIGINS=
```

Configure the appropriate frontend and backend URLs for your local setup.

### Step 5: Run the project

Use the development command defined in `package.json`.

```bash
npm run dev
```

Open the local URL displayed in your terminal.

**Note:** Follow the actual scripts and environment requirements in the project. The backend and frontend may need separate startup commands.

---

## Security

- Faculty and Admin portals use password-protected access.
- Passwords are stored using salted password hashing.
- API credentials are configured through environment variables.
- Secret keys should never be committed to GitHub.
- Booking validation is handled by the backend.

For real campus deployment, student identity verification, database access controls, and persistent database hosting should be configured before accepting real bookings.

---

## Future Enhancements

- College identity verification.
- Email notifications for booking updates.
- QR-based equipment identification.
- Advanced equipment analytics.
- Calendar-based booking visualization.
- Improved mobile experience.
- Multi-campus support.
- Equipment usage reports.

---

## Project Objective

The main objective of LabLink is to improve access to laboratory resources, reduce equipment booking conflicts, encourage student innovation, and create a more transparent resource-sharing environment within educational institutions.

---

## Acknowledgement

Developed as a student innovation and hackathon project with the goal of making campus laboratory resources more accessible and efficiently managed.

---

**LabLink – Discover. Book. Innovate.**
