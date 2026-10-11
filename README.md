# Smart Expense Tracker

Log an expense in a few seconds by typing ("petrol 200"), speaking, or uploading a receipt screenshot. Budgets with alerts, splits with friends, monthly reports (PDF and Excel), a financial health score, forecasts, and an assistant that answers questions about your spending.

Built with Next.js 16 (App Router), React 19, Tailwind CSS 4, MongoDB (Mongoose) and TanStack Query.

## Run it locally

Requirements: Node.js 20 or newer, and a MongoDB database (Atlas or local).

```bash
npm install
cp .env.example .env.local   # then set MONGODB_URI and AUTH_SECRET
npm run dev                  # http://localhost:3000
```

Open the app and click **Try the demo account** to get a user with about three months of sample data, budgets, alerts and a split group. Or create your own account.

To run MongoDB locally instead of Atlas:

```bash
docker run -d --name mongo -p 27017:27017 mongo:7
# MONGODB_URI=mongodb://localhost:27017
```

### Environment variables

| Name | Purpose |
| --- | --- |
| `MONGODB_URI` | MongoDB connection string |
| `MONGODB_DB` | Database name (default `expense_tracker`) |
| `AUTH_SECRET` | Long random string that signs session cookies |
| `ALLOW_DEMO` | `true` enables the demo account button |
| `UPLOAD_DIR` | Where receipt files are stored (default `./uploads`) |
| `DNS_SERVERS` | Optional, e.g. `8.8.8.8,1.1.1.1`. See below. |

**Atlas and DNS:** `mongodb+srv://` URIs need a DNS SRV lookup. Some machines use a local resolver that refuses those (`querySrv ECONNREFUSED`). The app retries automatically through public DNS. Set `DNS_SERVERS` to choose the servers yourself.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm test` | Unit tests (parser) |
| `npm run lint` | ESLint |

## How it works

```
Text / voice / receipt
  → parser (src/lib/parser.ts)   amount, category, merchant, date, payment, split hint
  → duplicate check              same receipt file, same merchant+amount within a day, or same entry in the last 10 min
  → review card                  confidence dots: green = sure, amber = please check
  → save (MongoDB)
  → budget check after response  80% / 100% alerts, in-app + email (email is logged until a provider is set)
  → dashboard, reports, insights, assistant
```

- **Text and voice** use the same rule-based parser. Voice uses the browser's speech recognition (Chrome, Edge, Safari). The parser runs on the client for instant preview chips, and on the server with your own categories and learned rules.
- **Receipts** are read on the server with tesseract.js (OCR); the first scan downloads the English model. PDFs are stored but not scanned.
- **Learning:** correcting a category on a known merchant creates a rule ("Shell → Fuel"), which you can manage under Settings → Categories.
- **Money** is stored as integer paise. Budget months can start on any day (e.g. salary day) and follow your timezone.
- **AI provider:** the parser and assistant are deterministic and need no API key. Both return the same shape an LLM would, so you can swap in a model by replacing `parseExpenseText` / `parseReceiptText` and `answer()` in `src/server/services/assistant.ts`.

## Project structure

```
src/
  app/
    (auth)/login, signup       sign-in pages
    welcome/                   onboarding
    (app)/                     signed-in screens: dashboard, activity, budgets, splits,
                               reports, insights, assistant, notifications, settings
    api/                       route handlers (REST API)
  components/                  UI: app shell, quick add, review form, charts, primitives
  lib/                         shared code: parser, money, periods, schemas (zod), API client
  server/
    models.ts                  Mongoose models and document types
    auth.ts, db.ts, http.ts    sessions, connection, route helpers
    services/                  expenses, budgets, analytics, groups, receipts, assistant, exports, demo
  proxy.ts                     redirects signed-out visitors to /login
```

## API

All endpoints are under `/api`. Every query is scoped to the signed-in user.

| Area | Endpoints |
| --- | --- |
| Auth | `POST auth/signup`, `auth/login`, `auth/logout`, `auth/demo` |
| Profile | `GET/PATCH/DELETE me`, `POST me/onboarding`, `GET me/export?format=json\|csv` |
| Capture | `POST parse`, `POST receipts` (multipart), `GET receipts/:id` |
| Expenses | `GET/POST expenses`, `GET/PATCH/DELETE expenses/:id`, `POST expenses/bulk`, `POST expenses/import` (CSV) |
| Categories | `GET/POST categories`, `PATCH/DELETE categories/:id`, `GET/POST rules`, `DELETE rules/:id` |
| Budgets | `GET/POST budgets`, `GET/PATCH/DELETE budgets/:id` |
| Insights | `GET dashboard`, `GET insights`, `GET reports`, `GET reports/export?format=pdf\|xlsx` |
| Splits | `GET/POST groups`, `GET/PATCH/DELETE groups/:id`, `POST groups/:id/settle` |
| Other | `GET/POST notifications`, `PATCH/DELETE notifications/:id`, `GET/POST assistant` |

## Known limits

- Split groups belong to the person who created them. Other members are names (with optional emails), not accounts, so they don't see the group.
- Email alerts are written to the server log until an email provider is configured (`src/server/services/notify.ts`).
- Receipts are stored on local disk. Swap `saveReceiptFile` / `readReceiptFile` for S3 or similar when deploying to more than one server.
- The rate limiter is in memory (per server instance).
