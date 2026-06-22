# Step-by-Step Telemetry and User Analytics Setup Guide

Learn how to monitor your application's installation count and active usage metrics completely free of cost.

---

## 1. Tracking Installation Counts (Via GitHub Releases)
When you host your application setup installer (`.exe`) on a public GitHub repository, GitHub automatically tracks every download of that file.

### How to host and view download stats:
1. Create a public repository on GitHub (e.g. `your-username/streamlinedl`).
2. Go to the **Releases** tab on the right side of the repository page and click **Draft a new release**.
3. Upload `StreamlineDL_Setup.exe` as a release asset, publish the release, and share the link on your website.
4. To check how many users have downloaded the installer, you can inspect the release details on GitHub, or query the GitHub API directly in your browser:
   ```text
   https://api.github.io/repos/{your-username}/{your-repo-name}/releases
   ```
   Look for the `download_count` field under the assets array in the JSON response.

---

## 2. Tracking Daily Active Users (Via Free PostHog Telemetry)
PostHog offers a generous **Free Tier (up to 1,000,000 events/month)** which is more than enough for thousands of active daily users.

### Step 1: Sign up and get your free Project API Key
1. Sign up for a free account at [PostHog](https://posthog.com/).
2. Create a new project named **StreamlineDL**.
3. Go to **Project Settings** and copy your **Project API Key** (it starts with `phc_...`).

### Step 2: Configure your Electron application
To link your app to your PostHog account, update the placeholder token in your Electron launcher script:

1. Open [main.js](file:///C:/Users/asifr/.gemini/antigravity-ide/scratch/downloader/electron/main.js).
2. Locate the `sendTelemetryPing()` function.
3. Replace the placeholder token `'placeholder_posthog_token'` with your actual API key:
   ```javascript
   // Replace this line:
   token: process.env.POSTHOG_API_KEY || 'placeholder_posthog_token',

   // With your actual key:
   token: process.env.POSTHOG_API_KEY || 'phc_your_actual_copied_key_here',
   ```
4. Recompile and package your Electron app (`npm run electron:build`).

### Step 3: Visualize your data
When users launch StreamlineDL on their PCs, it will send a secure, anonymous start event. In your PostHog dashboard:
- Create a new **Insight** to chart **Unique users** (grouped by `distinct_id`) over time.
- View user demographics under properties (such as OS platform: `win32`, architecture: `x64`, or app version).
- Build a custom **Dashboard** to view daily active users and launch metrics in real-time.
