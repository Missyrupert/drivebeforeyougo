# DriveBeforeYouGo — Rehearse Your Drive

A mobile-first web app that helps drivers rehearse tricky junctions before they drive. Enter your start and destination, and DriveBeforeYouGo finds roundabouts, merges, lane splits, and sharp turns along your route — then shows you the driver's-eye view via Google Street View so you know exactly what to expect.

## How It Works

1. **Enter your journey** — start and destination, just like a satnav
2. **DriveBeforeYouGo analyses the route** — identifies complex junctions using the Google Directions API
3. **Review the tricky bits** — see a list of roundabouts, merges, forks, and sharp turns
4. **Watch the rehearsal** — step through each junction in Street View with playback controls

Boring motorway stretches are skipped. You only see the moments that matter.

## Quick Start

1. Clone this repo
2. Get a Google Maps API key (see below)
3. Open `index.html` in a browser
4. Enter a journey and hit "Find Tricky Junctions"

No build tools, no npm, no frameworks. Just open the HTML file.

## Google Maps API Setup

You need a Google Cloud project with a Maps API key. Here's how:

### 1. Create a Google Cloud Project
- Go to [Google Cloud Console](https://console.cloud.google.com/)
- Create a new project (or use an existing one)

### 2. Enable These APIs
In **APIs & Services > Library**, enable:
- **Directions API** — route planning
- **Street View Static API** — junction imagery
- **Maps JavaScript API** — Street View panorama and Places elements
- **Places API** — address autocomplete

### 3. Create an API Key
- Go to **APIs & Services > Credentials**
- Click **Create Credentials > API Key**
- Copy the key
- Set it as `GOOGLE_MAPS_API_KEY` in Netlify (see Deploy section)

### 4. (Recommended) Restrict the Key
- **Application restrictions**: HTTP referrers — add your domain or `localhost`
- **API restrictions**: Restrict to the four APIs above

### 5. Free Tier / Budget
Google gives you $200/month free credit for Maps Platform. For personal use and testing, this is more than enough. To stay safe:
- Set a **budget alert** in Billing
- The app only makes API calls when you search for a route — no background usage

## Project Structure

```
drivebeforeyougo/
├── index.html              # Single-page app shell
├── css/
│   └── style.css           # Mobile-first styles, light theme
├── js/
│   ├── app.js              # Main orchestration, API loading, screen management
│   ├── route-analyzer.js   # Parses Directions response, identifies complex junctions
│   └── rehearsal-player.js # Street View panorama playback with speed controls
└── README.md
```

## Features

- **Mobile-first** — designed for phones, works on desktop too
- **Junction detection** — roundabouts, merges, forks, sharp turns, U-turns, lane splits
- **Street View rehearsal** — step through each junction in the Google Street View panorama
- **Playback controls** — play/pause, next/previous, speed (slow/normal/fast/skip)
- **No accounts** — API key stored in localStorage, no backend needed
- **Light theme** — clean and readable

## Deployment

Since there's no build step, you can deploy anywhere that serves static files:

- **GitHub Pages**: Push to `main`, enable Pages in repo settings
- **Netlify / Vercel**: Point at the repo, no build command needed
- **Any web server**: Just serve the files

## Deploy to Netlify

- **Publish directory**: set to the repo root (`/`). No build command needed.
- **Environment variable**: set `GOOGLE_MAPS_API_KEY` in Netlify.
- The key is injected at the edge and never committed to source control.

## Install on phone

**iOS (Safari)**
1. Open the site in Safari.
2. Tap the Share button.
3. Tap **Add to Home Screen**.

**Android (Chrome)**
1. Open the site in Chrome.
2. Tap the menu (three dots).
3. Tap **Add to Home screen**.

## Local Development

Any local server works:

```bash
# Python
python3 -m http.server 8000

# Node
npx serve .

# PHP
php -S localhost:8000
```

Then open `http://localhost:8000`.

## Debug Mode

Append `?debug=1` to the URL to show the selected rehearsal steps, including score,
reasons, and step metadata for quick tuning.

## Browser Support

Modern browsers (Chrome, Safari, Firefox, Edge). Requires JavaScript enabled.

## API Key Security Notes

- Restrict the key by **HTTP referrers** when deploying, or **localhost** when developing.
- Only enable the APIs listed above.
- If you hit quota limits, reduce usage by rehearsing fewer routes per day.
