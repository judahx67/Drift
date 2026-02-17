# Pixel Sort

A client-side web app for **pixel sorting** — the glitch-art technique of rearranging pixels in selected image regions by brightness, hue, saturation, or individual color channels.

Everything runs in your browser. Nothing is uploaded.

## Features

| Feature | Description |
|---------|-------------|
| **7 Sort Modes** | Brightness, Hue, Saturation, Red, Green, Blue, Gamma |
| **Hot-Apply** | Sorting updates live as you drag sliders or change modes — no "Apply" button needed |
| **Region Selection** | Click-drag on the canvas (even from outside) or click **Select All** for full image |
| **Iteration History** | ← Back / Forward → through every sort step, with a Flatten button to collapse |
| **Basic Filters** | Brightness, Contrast, Blur, Sharpen, Invert, Grayscale — applied via Canvas 2D |
| **Storage Management** | Tracks history memory usage, warns at 50 MB, offers Clear History and ZIP export |
| **Export** | Save the result as PNG, or export all history steps as a ZIP |
| **State Persistence** | Auto-saves to IndexedDB — reload the page and pick up where you left off |
| **Keyboard Shortcuts** | `U` upload, `E` export, `Ctrl+Z` back, `Ctrl+Y` forward, `Enter` commit, `F` apply filter |

## Usage

1. **Development**: Run `npm run dev` to start the local server.
2. **Production**: Run `npm run build` to generate the `dist` folder.
3. **App**:
   - Click **Upload** (or drag-drop) to load an image.
   - Draw a selection rectangle on the canvas or click **Select All**.
   - Adjust sort mode, direction, thresholds, and noise — the sort previews live.
   - Press **Commit** (or `Enter`) to save the result.
   - Use **← Back** / **Forward →** to browse iterations.
   - Click **Export** to download the final image.

## Deployment

You can host this application for free on services like **Netlify** or **Vercel** with automatic deployment from GitHub:

1. Push this repository to your GitHub account.
2. Sign in to [Netlify](https://www.netlify.com/).
3. Click **Add new site** > **Import an existing project**.
4. Select your **GitHub** repository.
5. Netlify will automatically detect the settings (thanks to `netlify.toml`).
6. Click **Deploy**. Any future commits to `main` will automatically trigger a new build.

## Tech Stack

- **HTML / CSS / JavaScript** — ES Modules
- **Vite** — Build tool and dev server
- **Canvas 2D API** — pixel manipulation and CSS filters
- **IndexedDB** — client-side state persistence
- **JSZip** — batch history export as ZIP

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
