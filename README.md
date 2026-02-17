# Pixel Sort

A client-side web app for **pixel sorting** — the glitch-art technique of rearranging pixels in selected image regions by brightness, hue, saturation, or individual color channels.

Everything runs in your browser. Nothing is uploaded.

## Features

| Feature | Description |
|---------|-------------|
| **7 Sort Modes** | Brightness, Hue, Saturation, Red, Green, Blue, Gamma |
| **Hot-Apply** | Sorting updates live as you drag sliders or change modes — no "Apply" button needed |
| **Region Selection** | Click-drag on the canvas to select the area to sort |
| **Iteration History** | ← Back / Forward → through every sort step, with a Flatten button to collapse |
| **Basic Filters** | Brightness, Contrast, Blur, Sharpen, Invert, Grayscale — applied via Canvas 2D |
| **Storage Management** | Tracks history memory usage, warns at 50 MB, offers Clear History and ZIP export |
| **Export** | Save the result as PNG, or export all history steps as a ZIP |
| **State Persistence** | Auto-saves to IndexedDB — reload the page and pick up where you left off |
| **Keyboard Shortcuts** | `U` upload, `E` export, `Ctrl+Z` back, `Ctrl+Y` forward, `Enter` commit, `F` apply filter |

## Usage

1. Open `index.html` in any modern browser
2. Click **Upload** (or drag-drop) to load an image
3. Draw a selection rectangle on the canvas
4. Adjust sort mode, direction, thresholds, and noise — the sort previews live
5. Press **Commit** (or `Enter`) to save the result to history
6. Use **← Back** / **Forward →** to browse iterations
7. Click **Export** to download the final image

## Tech Stack

- **HTML / CSS / JavaScript** — no build tools, no frameworks
- **Canvas 2D API** — pixel manipulation and CSS filters
- **IndexedDB** — client-side state persistence
- **JSZip** (CDN) — batch history export as ZIP

## File Structure

```
index.html      — HTML shell
style.css       — Design system and layout
app.js          — Application logic, state, UI
pixelsort.js    — Pixel sorting engine (modes, intervals, noise)
filters.js      — Image filter helpers (sharpen kernel, CSS filters)
```

## License

MIT
