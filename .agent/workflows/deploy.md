---
description: how to deploy the application to Netlify
---

1. Ensure all changes are committed and pushed to your GitHub repository.
2. Go to the [Netlify Dashboard](https://app.netlify.com/).
3. Click the **Add new site** button.
4. Choose **Import an existing project**.
5. Connect your GitHub account and select the `Pixel_sort` repository.
6. Verify the following settings:
   - **Build command:** (leave empty)
   - **Publish directory:** `.`
7. Click **Deploy Pixel_sort**.
8. Once finished, Netlify will provide a `https://[site-name].netlify.app` URL.

// turbo
9. You can also deploy instantly via CLI if you have `netlify-cli` installed: `npx netlify deploy --prod`
