# vue-spotify-clone

A Spotify web player clone built with Vue 3, Vite, Pinia and the Spotify Web API. Front-end only, with PKCE auth, Web Playback SDK, library, search, playlists and a pixel-accurate UI.

> Educational project. Not affiliated with or endorsed by Spotify.

**Status:** work in progress. Phases 1-2 (setup, design tokens, PKCE auth, API service) are done. Layout, pages and playback are next.

## Requirements

- Node.js 18 or newer
- A Spotify account. Since February 2026, Spotify requires the **app owner to have Premium** for apps in Development Mode, and limits a Development Mode app to **5 authorized users**.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create the app in the [Spotify developer dashboard](https://developer.spotify.com/dashboard):
   - Click **Create app**, choose any name and description.
   - Under "Which API/SDKs are you planning to use?", select **Web API** and **Web Playback SDK**.
   - Add this **Redirect URI** exactly: `http://127.0.0.1:5173/callback` (Spotify rejects `localhost`).
   - Save, then open **Settings** and copy the **Client ID**. You do not need the client secret.
3. Add your account under **User Management** (Settings → User Management) with your name and the email of your Spotify account. Development Mode apps only work for listed users.
4. Create your `.env`:
   ```bash
   cp .env.example .env
   ```
   ```
   VITE_SPOTIFY_CLIENT_ID=your_client_id
   VITE_SPOTIFY_REDIRECT_URI=http://127.0.0.1:5173/callback
   ```
5. Run it and open **http://127.0.0.1:5173** (not `localhost`):
   ```bash
   npm run dev
   ```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server on 127.0.0.1:5173 |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build |

## Project structure

```
src/
  assets/styles/   tokens.css (design tokens), base.css
  components/      reusable UI
  composables/     shared logic (usePlayer, ...)
  router/          routes and auth guard
  services/        auth.js (PKCE), spotify.js (the only place that calls the API)
  stores/          Pinia stores
  views/           pages
```
