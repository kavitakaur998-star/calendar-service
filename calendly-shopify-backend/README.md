# Calendly + Shopify booking backend

Express/TypeScript API for a custom Shopify appointment UI. Calendly is the scheduling engine; the Calendly token stays server-side.

## Event types
- virtual: https://calendly.com/marcela-giocanti/45min
- atelier: https://calendly.com/marcela-giocanti/60min
- fitting: https://calendly.com/marcela-giocanti/bridal-fitting-appointment
- fitting_studio: https://calendly.com/marcela-giocanti/bridal-fitting-studio-appointment

The current Shopify page will use only `virtual` and `atelier`.

## Deploy to Vercel
1. Upload this project to a GitHub repository.
2. Import the repository into Vercel.
3. Add the five `CALENDLY_*` environment variables in Vercel Project Settings > Environment Variables.
4. Deploy.
5. Open `/api/health`, then `/api/calendly-test`.

The included `api/index.ts` is the Vercel entrypoint. The Express app is exported from `src/app.ts`.

## Local
npm install
npm run dev

Do not commit `.env` or the Calendly access token.
