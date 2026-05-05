# Organize Your Music

Organize your Spotify library by decade, genre, duration, and popularity. Save any filtered view as a new Spotify playlist.

**Live:** https://odidukh.github.io/OrganizeYourMusic/

## Local development

```bash
cp .env.example .env.local
# put your Spotify client_id in .env.local
# (optional) put your Last.fm api key for the "Fill missing genres" feature
npm install
npm run dev
```

The dev server runs on `http://127.0.0.1:8000/OrganizeYourMusic/`. Register that URL (with trailing slash) as a Redirect URI in the Spotify Developer Dashboard.

`VITE_LASTFM_API_KEY` is optional. When present, the organize screen exposes a **Fill missing genres** button that uses [Last.fm](https://www.last.fm/api/account/create) to infer genres for tracks Spotify left untagged. Without the key the button is disabled.

## Build

```bash
npm run build
```
