# GrowEasy CSV Importer

AI-powered CSV importer that intelligently maps any CSV data to GrowEasy CRM format using Google Gemini.

![Next.js](https://img.shields.io/badge/Next.js-16-black)
![Node.js](https://img.shields.io/badge/Node.js-20+-green)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)
![Gemini](https://img.shields.io/badge/AI-Gemini-orange)

## Features

- **Intelligent Field Mapping** — AI analyzes CSV structure and semantically maps columns to CRM fields, regardless of column names
- **Any CSV Format** — Works with Facebook Lead exports, Google Ads, Real Estate CRMs, Excel exports, and manually created spreadsheets
- **4-Step Wizard** — Upload → Preview → Confirm → Results
- **Batch Processing** — Handles large CSVs in configurable batches with retry logic
- **Validation Pipeline** — 10-pass validation enforcing every business rule
- **Dark Mode** — Full light/dark theme with glassmorphism design
- **Drag & Drop** — Premium upload experience with file validation
- **Download Results** — Export extracted CRM records as CSV

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, TypeScript, Tailwind CSS, @tanstack/react-virtual |
| Backend | Node.js, Express, TypeScript |
| Database | SQLite / PostgreSQL, Prisma ORM |
| Auth | Firebase Authentication |
| AI | Google Gemini (gemini-2.0-flash) |
| Testing | Vitest |
| Deployment | Docker, Docker Compose |

## Setup Instructions

### Prerequisites

- **Node.js** 18+ installed
- **Google Gemini API Key** — Get one at [ai.google.dev](https://ai.google.dev)
- **Firebase Project** — Create one at [console.firebase.google.com](https://console.firebase.google.com)

### 1. Firebase Authentication Setup

1. **Client Setup:**
   - In the Firebase Console, go to **Build > Authentication** and enable **Google Sign-In** and **Email/Password**.
   - Create a Web App under Project Settings and copy the configuration object.
   - Paste the values into `frontend/.env.local` (see variable list below).

2. **Backend Admin SDK Setup:**
   - In Project Settings, go to **Service accounts** and click **Generate new private key**.
   - Download the JSON key file.
   - Set the `FIREBASE_SERVICE_ACCOUNT_JSON` environment variable in the backend `.env` file to either the JSON contents string or point to the file path.

### 2. Database & Prisma Setup

From the `backend/` directory, initialize the database:
```bash
npx prisma db push
npx prisma generate
```
This sets up index fields on dynamic properties (User, Import, Lead) automatically.

### 3. Quick Start Dev Servers

**Terminal 1 — Backend** (port 3001):
```bash
cd backend
npm install
cp .env.example .env
# Edit .env and fill in GEMINI_API_KEY and service account
npm run dev
```

**Terminal 2 — Frontend** (port 3000):
```bash
cd frontend
npm install
cp .env.example .env.local
# Edit .env.local and fill in NEXT_PUBLIC_FIREBASE config
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Docker Deployment

### Using Docker Compose (recommended)

```bash
# From the project root
cp .env.example .env
# Edit .env and add your variables

docker compose up --build
```

The application will be available at:
- **Frontend**: http://localhost:3000
- **Backend**: http://localhost:3001

### Environment Variables

#### Backend (`.env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `GEMINI_API_KEY` | ✅ | — | Google Gemini API key |
| `PORT` | | `3001` | Backend server port |
| `CORS_ORIGIN` | | `http://localhost:3000` | Allowed CORS origin |
| `BATCH_SIZE` | | `20` | Records per AI batch |
| `MAX_RETRIES` | | `3` | Max retry attempts per batch |
| `MAX_FILE_SIZE_MB` | | `10` | Maximum upload file size |

#### Frontend (`.env.local`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | | `http://localhost:3001/api` | Backend API URL |

## Application Workflow

```
User uploads CSV
    ↓
Client-side parsing (PapaParse)
    ↓
Preview table shown to user (TanStack Virtualized)
    ↓
User clicks "Confirm Import"
    ↓
Client opens EventSource connection (SSE) to progress endpoint
    ↓
CSV sent to POST /api/imports
    ↓
Backend streams processing progress updates to client
    ↓
AI extraction (Gemini/OpenAI) + 10-pass validation
    ↓
Final database storage + final response sent to client
```

> **Important**: No AI processing happens until the user explicitly clicks "Confirm Import".

## API Documentation

### `POST /api/imports`

Upload a CSV file for AI extraction. Returns extraction results + importId.
Optional header: `X-Progress-ID` to stream processing updates.

**Request Headers:**
- `Content-Type: multipart/form-data`
- `Authorization: Bearer <firebase_id_token>`
- `X-Progress-ID: <unique_client_generated_id>`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "importId": 42,
    "records": [
      {
        "created_at": "2026-05-13 14:20:48",
        "name": "John Doe",
        "email": "john.doe@example.com",
        "country_code": "+91",
        "mobile_without_country_code": "9876543210",
        "company": "GrowEasy",
        "city": "Mumbai",
        "state": "Maharashtra",
        "country": "India",
        "lead_owner": "test@gmail.com",
        "crm_status": "GOOD_LEAD_FOLLOW_UP",
        "crm_note": "Client is asking to reschedule demo",
        "data_source": "",
        "possession_time": "",
        "description": ""
      }
    ],
    "skipped": [
      {
        "rowIndex": 5,
        "reason": "No email or mobile number found",
        "originalData": { "...": "..." }
      }
    ],
    "statistics": {
      "totalRows": 50,
      "totalImported": 47,
      "totalSkipped": 3,
      "processingTimeMs": 12340,
      "batchesProcessed": 3
    }
  }
}
```

### `GET /api/imports/progress/:progressId`

Establishes a Server-Sent Events (SSE) connection to listen to real-time ingestion progress.

**Query Parameters:**
- `token`: Firebase ID token (Alternative to Authorization header for browser EventSource connections)

**Streamed Event Structure:**
```json
{
  "percentage": 55,
  "stage": "AI Extraction",
  "processedRows": 20,
  "totalRows": 50,
  "currentBatch": 1,
  "totalBatches": 3,
  "elapsedTimeMs": 4200,
  "estimatedRemainingTimeMs": 6300,
  "completed": false
}
```

### `GET /api/health`

Health check endpoint.

**Response (200):**
```json
{
  "status": "healthy",
  "timestamp": "2026-07-09T12:00:00.000Z",
  "version": "1.0.0",
  "uptime": 3600
}
```

## AI Extraction Rules

| # | Rule | Implementation |
|---|---|---|
| 1 | CRM Status: 4 values only | Fuzzy matching (55+ variations) |
| 2 | Data Source: 5 values or blank | Fuzzy matching + confidence check |
| 3 | Date: `new Date()` compatible | Normalization (DD/MM/YYYY, Unix, natural) |
| 4 | CRM Notes: overflow field | Aggregates extra emails, phones, invalid values |
| 5 | Multiple emails → first + crm_note | Regex scan + split in validation |
| 6 | Multiple phones → first + crm_note | Regex scan + split in validation |
| 7 | CSV row compatibility | `ensureCSVSafe()` on all 15 fields |
| 8 | Skip if no email AND no phone | Post-validation contact check |

## Running Tests

```bash
cd backend
npm test
```

## Project Structure

```
groweasy/
├── docker-compose.yml
├── .env.example
├── README.md
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example
│   ├── tests/
│   │   └── validators.test.ts
│   └── src/
│       ├── index.ts              # Server entry
│       ├── app.ts                # Express factory
│       ├── config/               # Environment config
│       ├── constants/            # Enums, error codes
│       ├── types/                # TypeScript interfaces
│       ├── prompts/              # AI prompt engineering
│       ├── services/             # Business logic
│       │   ├── aiService.ts
│       │   ├── csvService.ts
│       │   ├── validationService.ts
│       │   └── outputRepairService.ts
│       ├── utils/                # Utilities
│       │   ├── validators.ts
│       │   ├── batchProcessor.ts
│       │   ├── retry.ts
│       │   └── logger.ts
│       ├── controllers/
│       ├── routes/
│       └── middleware/
└── frontend/
    ├── Dockerfile
    ├── package.json
    ├── next.config.ts
    └── src/
        ├── app/
        │   ├── layout.tsx
        │   ├── page.tsx
        │   └── globals.css
        ├── components/
        │   ├── layout/
        │   ├── upload/
        │   ├── preview/
        │   ├── processing/
        │   ├── results/
        │   └── providers/
        ├── lib/
        │   ├── api.ts
        │   ├── csv-parser.ts
        │   └── utils.ts
        └── types/
```

## Position Applied For

Intern / Full-Time

## License

MIT
