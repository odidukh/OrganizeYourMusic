# Organize Your Music

Organize your Spotify library by decade, genre, duration, and popularity. Save any filtered view as a new Spotify playlist.

**Live:** https://odidukh.github.io/OrganizeYourMusic/

## Local development

```bash
cp .env.example .env.local
# put your Spotify client_id in .env.local
npm install
npm run dev
```

The dev server runs on `http://127.0.0.1:8000/OrganizeYourMusic/`. Register that URL (with trailing slash) as a Redirect URI in the Spotify Developer Dashboard.

## Build

```bash
npm run build
```
