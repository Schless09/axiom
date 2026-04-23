# Axiom VLA

Next.js app for org-scoped insurance claim evidence upload, multimodal analysis (Gemini), and statute-aligned scorecards. Backend: Supabase (Postgres, Storage, Auth).

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Copy `.env.example` to `.env` and add your Supabase and Gemini keys.

## Docs

- Roadmap and phases: [`docs/mvp-to-product-checklist.md`](docs/mvp-to-product-checklist.md)
- Database: `supabase_schema.sql`, `supabase_seed.sql` (run in Supabase SQL Editor; create an `evidence` Storage bucket in the dashboard)

## Scripts

- `scripts/data_ingestion.py` — optional frame sampling / training uploads (`pip install -r scripts/requirements-ingestion.txt`)
