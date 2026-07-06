# GitHub App Setup Guide

This guide walks you through creating the GitHub App needed to run DocFlow AI.

## Step 1: Create the GitHub App

Go to: **https://github.com/settings/apps/new**

Fill in the following:

| Field | Value |
|---|---|
| **GitHub App name** | `docflow-ai` (or your preferred name) |
| **Homepage URL** | `http://localhost:3000` (update for production) |
| **Webhook URL** | For local dev: your smee.io channel URL |
| **Webhook secret** | Generate: `openssl rand -hex 32` |

## Step 2: Set Permissions

### Repository permissions:
- **Contents**: Read & Write _(to read files and commit docs)_
- **Pull requests**: Read & Write _(to open PRs)_
- **Metadata**: Read _(required)_

### Subscribe to events:
- ☑ **Push**
- ☑ **Installation**

## Step 3: Create & Install

1. Click **Create GitHub App**
2. Note the **App ID** (shown at the top of the settings page)
3. Under **Private keys**, click **Generate a private key** and download the `.pem` file
4. Go to the **Install App** tab and install it on your test repository

## Step 4: Create OAuth App (for login)

Go to: **https://github.com/settings/developers** → OAuth Apps → **New OAuth App**

| Field | Value |
|---|---|
| **Application name** | DocFlow AI |
| **Homepage URL** | `http://localhost:3000` |
| **Authorization callback URL** | `http://localhost:3000/api/auth/callback/github` |

Note the **Client ID** and generate a **Client Secret**.

## Step 5: Configure `.env`

```bash
GITHUB_APP_ID=<your-app-id>
GITHUB_PRIVATE_KEY=<contents of .pem file, with literal \n for newlines>
GITHUB_WEBHOOK_SECRET=<the random hex you generated>
GITHUB_CLIENT_ID=<oauth client id>
GITHUB_CLIENT_SECRET=<oauth client secret>
```

## Step 6: Local Webhook Forwarding

For local development, use [smee.io](https://smee.io) to forward GitHub webhooks to your local machine:

```bash
# Create a new channel at https://smee.io
# Then run:
npx smee-client --url https://smee.io/YOUR_CHANNEL_ID --target http://localhost:4001/api/github/webhooks
```

Set your GitHub App's webhook URL to your smee.io channel URL.

## Verification

Once set up, push a commit to your installed repository. You should see:
1. A log line in the GitHub webhook receiver (`WEBHOOK_PORT=4001`)
2. A new job appear in your dashboard
3. A PR opened on the repository with updated docs
