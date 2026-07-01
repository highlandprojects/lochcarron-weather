# Lochcarron Weather Planner

Lochcarron Weather Planner is a lightweight, installable weather and tide planning app for visitors, walkers, photographers, paddlers, and boat users around Lochcarron.

The app brings together live conditions, forecast weather, tide timing, daylight, moon phase, marine conditions, and recent rainfall history in one planning-focused page.

## Live Website

https://highlandprojects.github.io/lochcarron-weather/

## Run Locally

From the project folder, start a simple local server:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000/
```

Using a local server is recommended because the service worker and PWA features need an HTTP/HTTPS context.

## Publish Changes

This site is designed to work on GitHub Pages.

Typical publish flow:

```bash
git status
git add .
git commit -m "Describe the change"
git push origin main
```

After pushing, GitHub Pages will publish the latest version from the configured branch.

## Planning Note

Weather, tide, rainfall, marine, aurora, and daylight information is provided for visitor planning only. Tide and marine data are rough indicators and must not be used for navigation or safety-critical decisions.
