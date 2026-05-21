# NEXUS Lead Hunter

AI-powered B2B lead generation for high-ticket US service businesses.
Built with Next.js · Apify Google Maps Scraper · Grok xAI · DNS Email Verification

---

## Stack
- **Apify** — scrapes real Google Maps business data (bypasses bot walls)
- **Grok (xAI)** — researches owner names, emails, ICP scoring, cold email generation
- **DNS/MX verification** — server-side email confidence scoring
- **Next.js** — API keys stored securely as environment variables, never exposed to browser

---

## Deploy to Vercel (step by step)

### 1. Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/nexus-lead-hunter.git
git push -u origin main
```

### 2. Connect to Vercel
1. Go to vercel.com and sign in with GitHub
2. Click "Add New Project"
3. Import your nexus-lead-hunter repository
4. Framework will auto-detect as Next.js
5. Click "Deploy"

### 3. Add Environment Variables
After deploy, go to your project in Vercel:
1. Settings → Environment Variables
2. Add these two variables:

| Name | Value |
|------|-------|
| APIFY_API_TOKEN | Your Apify token (apify.com → Settings → Integrations) |
| GROK_API_KEY | Your xAI Grok key (starts with xai-) |

3. Save then Deployments → Redeploy

### 4. Done
Your app is live at https://nexus-lead-hunter-xxx.vercel.app

---

## Local Development
```bash
npm install
cp .env.example .env.local
# Add your real keys to .env.local
npm run dev
# Open http://localhost:3000
```

---

## Free Tier Limits
- Apify: $5 free monthly credit (~2,500 business records)
- Grok: Check x.ai/api for current pricing
- Vercel: Free hobby tier — unlimited deploys

---

## Environment Variables
```
APIFY_API_TOKEN=apify_api_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GROK_API_KEY=xai-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```
