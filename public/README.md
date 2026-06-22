# Publishing Your StreamlineDL Download Website (Free of Cost)

Here are the step-by-step instructions to host your download page and store your installer file (`.exe`) 100% free of charge.

## Step 1: Add Your Installer File
1. Copy the compiled installer file from `C:\Users\asifr\.gemini\antigravity-ide\scratch\downloader\dist-electron\StreamlineDL Setup 0.0.0.exe` (or rename it to `StreamlineDL_Setup.exe`).
2. Paste this `.exe` file into this `landing-page` folder alongside `index.html`.

## Step 2: Choose a Free Hosting Platform

### Option A: GitHub Pages (Recommended)
1. Create a free account on [GitHub](https://github.com/) (if you don't have one).
2. Create a new repository named `streamlinedl`.
3. Upload all the files inside this `landing-page` directory (including `index.html` and `StreamlineDL_Setup.exe`) into the repository.
4. Go to **Settings** -> **Pages** in your GitHub repository.
5. Under **Build and deployment**, set the source to **Deploy from a branch** and select your main branch. Click **Save**.
6. Your website will be live in a few minutes at `https://your-username.github.io/streamlinedl/`!

### Option B: Netlify
1. Go to [Netlify](https://www.netlify.com/) and log in/sign up.
2. Drag and drop this entire `landing-page` folder onto the deployment drop zone on Netlify's dashboard.
3. Netlify will publish your site instantly and provide a free subdomain (e.g. `streamlinedl.netlify.app`).

### Option C: Vercel
1. Install the Vercel CLI or link your GitHub repository to [Vercel](https://vercel.com/).
2. Deploy the static directory for free.
