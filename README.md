# ClipCash

**Turn your long videos into short viral clips — automatically, with full control, and optional NFT ownership.**

ClipCash helps content creators (YouTubers, podcasters, gamers, coaches…) save many hours of work by turning one long video into dozens or hundreds of short clips ready for TikTok, Instagram Reels, YouTube Shorts, and more.

You always stay in control:
→ Preview every clip
→ Choose which ones you like
→ Delete the bad ones
→ Then post only the good ones automatically

**Bonus: you can also turn your best clips into NFTs on the Stellar network (very cheap & fast) so you truly own them and can earn royalties forever.**

## What makes ClipCash special?

- **Full preview & selection** — most tools post random clips. ClipCash lets you see and pick only the best ones.
- **Automatic posting** to 7+ platforms (TikTok, Instagram, YouTube Shorts, Facebook Reels, Snapchat Spotlight, Pinterest, LinkedIn)
- **Web2 + Web3 in one app** — normal accounts + optional Stellar NFTs with royalties
- **Simple & beautiful interface** — dark mode, clean design, easy to use

## Main Features (MVP – 2026)

- Upload long video or paste YouTube/TikTok link
- AI creates 50–200 short clips (15–60 seconds each)
- Preview screen: watch short previews, select / deselect / bulk delete
- One-click post selected clips to multiple platforms
- Earnings dashboard (shows money from all platforms)
- Optional: mint selected clips as NFTs on Stellar (Soroban smart contracts)
- Subscription plans + small revenue share (we take 5–10% only if you want)

## Tech Stack – Simple Overview

| Part           | Technology                          | Why we chose it                     |
| -------------- | ----------------------------------- | ----------------------------------- |
| Frontend       | Next.js 15 + React + Tailwind       | Fast, beautiful, mobile-friendly    |
| Backend        | NestJS (TypeScript)                 | Clean, organized, easy to grow      |
| Database       | PostgreSQL (via Supabase or Prisma) | Reliable & real-time updates        |
| Queue / Jobs   | BullMQ + Redis                      | Handles long AI & posting tasks     |
| Social Posting | Ayrshare                            | One tool posts to all platforms     |
| Blockchain     | Stellar Soroban (Rust)              | Very cheap fees, built-in royalties |
| AI             | Runway Gen-3 + Claude               | Finds the most viral moments        |

## Quick Start (Local Development)

### Requirements

- Node.js 18 or newer
- Docker (recommended for database & Redis)
- Git

### Clone & install

```bash
git clone https://github.com/your-username/clipcash.git
cd clipcash/backend
cp .env.example .env
npm install
npm run start:dev
```

Open <http://localhost:3000> in your browser.

## Environment Variables

Copy `.env.example` to `.env` and fill in the values. Key variables:

```env
DATABASE_URL=postgresql://...
REDIS_HOST=localhost

# Stellar (see section below)
STELLAR_NETWORK=testnet
MIN_STELLAR_PAYOUT=5
```

## Stellar Network Configuration

The backend supports switching between Stellar **testnet** and **mainnet** (public network) via an environment variable.

### `STELLAR_NETWORK`

| Value      | Network                | RPC URL                                  | Use when               |
| ---------- | ---------------------- | ---------------------------------------- | ---------------------- |
| `testnet`  | Stellar Testnet (SDF)  | `https://soroban-testnet.stellar.org`    | Development / staging  |
| `public`   | Stellar Mainnet        | `https://soroban-rpc.stellar.org`        | Production             |

**Default:** `testnet`

Set in your `.env`:

```env
# Development
STELLAR_NETWORK=testnet

# Production
STELLAR_NETWORK=public
```

The `StellarService` reads this variable at startup and exposes the correct `rpcUrl` and `networkPassphrase` to all services that perform Stellar operations (minting, payouts).

### `MIN_STELLAR_PAYOUT`

Minimum payout amount in USD equivalent. Requests below this threshold are rejected with a `400` error to prevent fee-wasting micro-transactions.

```env
MIN_STELLAR_PAYOUT=5   # default: 5 USD
```

## API Endpoints

### Wallets — `GET /wallets`

Wallet addresses are **partially masked** in all responses for user privacy. Only the last 6 characters of the address are shown (e.g. `******KPRQ6A`).

| Method | Endpoint        | Description                   |
| ------ | --------------- | ----------------------------- |
| GET    | `/wallets`      | List current user's wallets   |
| GET    | `/wallets/:id`  | Get a single wallet by ID     |

### Mint — `POST /clips/:id/mint`

Mint a clip as an NFT on Stellar. Clips that have already been **auto-posted** (`postStatus = "posted"`) cannot be minted and will return `400`.

| Method | Endpoint            | Description         |
| ------ | ------------------- | ------------------- |
| POST   | `/clips/:id/mint`   | Mint clip as NFT    |

### Payouts — `POST /payouts`

Initiate a Stellar payout. Returns `400` if the amount is below `MIN_STELLAR_PAYOUT`.

| Method | Endpoint    | Body                         | Description             |
| ------ | ----------- | ---------------------------- | ----------------------- |
| POST   | `/payouts`  | `{ amount, walletId? }`      | Initiate Stellar payout |

## Project Structure

```text
clips-backend/
├── src/
│   ├── auth/        # JWT, Google OAuth, magic links
│   ├── clips/       # Clip generation & management
│   ├── videos/      # Video upload & processing
│   ├── wallet/      # Wallet listing with masked addresses
│   ├── mint/        # NFT minting (Stellar Soroban)
│   ├── payout/      # Stellar payouts with minimum threshold
│   ├── stellar/     # Stellar SDK configuration (network switching)
│   ├── jobs/        # BullMQ job management
│   ├── earnings/    # Earnings dashboard
│   └── prisma/      # Database connection
├── prisma/
│   └── schema.prisma
└── .env.example
```
