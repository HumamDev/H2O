# Cockpit Pro Site

Static public website for Cockpit Pro at `cockpitpro.app`.

This is a standalone website project for marketing, support, pricing placeholders, legal pages, and static checkout support pages. It does not include backend services, authentication, a database, or real payment processing.

## Local Development

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

## Cloudflare Pages

Recommended settings:

- Framework preset: `Vite`
- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: `cockpit-pro-site` when connecting from the parent workspace/repository
- Node version: `20` or newer

The site includes `public/_redirects` with:

```txt
/* /index.html 200
```

This allows direct navigation to static SPA routes such as `/pricing`, `/privacy`, `/terms`, `/support`, `/checkout/success`, and `/checkout/cancel`.

## Domain Setup

After the Cloudflare Pages project is created:

1. Add `cockpitpro.app` as a custom domain in the Pages project.
2. Follow Cloudflare's generated DNS instructions.
3. Add `www.cockpitpro.app` as a second custom domain if desired.
4. Wait for Cloudflare to provision HTTPS certificates.

## Notes

- Pricing is placeholder-only: "Pricing coming soon" and "Early access pricing".
- Early access requests use `mailto:support@cockpitpro.app?subject=Early access request`.
- Support contact uses `mailto:support@cockpitpro.app`.
- Checkout success and cancel routes are static placeholders only.
