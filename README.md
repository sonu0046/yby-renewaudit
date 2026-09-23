# YBY RenewAudit

**Audit the renewal before you approve it.**

This repository implements the G8.1 → G8.5 approved technical path:

- G8.1: technical architecture / dual workers / privacy invariant
- G8.2: repository boundaries and module ownership
- G8.3: TDD scaffolding and fail-closed contracts
- G8.4: deterministic core engine and G1–G5 gates
- G8.5: implementation/TDD integration with bounded worker chunks and lightweight evidence output

## Privacy invariant

Raw contract/usage files are processed locally in browser memory. The optional clause API accepts only minimized sanitized text snippets. Raw binary files are not sent to the backend by this codebase.

## Run

```bash
npm install
npm test
npm run build
npm run dev
```

## Important V1 boundaries

- No OCR
- No inbox scraping
- No payment-card processing
- No silent FX conversion
- Ambiguous dates/currency/billing cycles block calculation
- AI suggestions cannot bypass Human Lock
- No `moment.js`
- Evidence requires source trace + formula
