# Discord Honeypot Bot

A Discord bot that automatically detects and removes **compromised accounts**.

When a Discord account is hacked, it almost always does the same thing: spam
messages across every channel it can reach. This bot turns that behavior
against the attacker. You designate one or more **honeypot channels** — channels
a real member would never post in — and any account that posts there is
automatically removed before it can spam the rest of your server.

[![Add to your server](https://img.shields.io/badge/Add%20to%20your%20server-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.com/oauth2/authorize?client_id=1509592803401924678)

## How it works

1. An admin marks a channel as a honeypot (e.g. a hidden `#do-not-post` channel,
   or a decoy that looks like a real channel).
2. The bot watches for messages in honeypot channels.
3. When a non-exempt account posts in one, the bot takes the configured action
   (ban by default), deletes the message, and logs the event.

Legitimate members never trigger it. Compromised accounts — which blindly spam
everything — walk straight into it.

## Features

- **Multiple honeypot channels** per server
- **Configurable action** per channel: ban, timeout, or kick
- **Message cleanup** — optionally delete the offender's recent messages on hit
- **Layered settings** — per-channel overrides fall back to server defaults,
  which fall back to sensible built-in defaults; zero config needed to start
- **Exemptions** — admins, bots, the server owner, and configurable bypass roles
  are never actioned
- **Audit logging** — every hit is recorded and posted to a log channel

## Tech stack

- TypeScript (ESM) on Node.js
- [discord.js](https://discord.js.org) v14
- PostgreSQL via [Kysely](https://kysely.dev)

## Setup

### Prerequisites

- Node.js 26+
- A PostgreSQL database
- A Discord application & bot token
  ([Developer Portal](https://discord.com/developers/applications))

### Install

```bash
npm install
```

### Configure

Create a `.env` file in the project root:

```
DISCORD_TOKEN=your_bot_token
CLIENT_ID=your_application_id
GUILD_ID=your_test_server_id
DATABASE_URL=postgres://user:password@localhost:5432/honeypot
```

Enable the **Server Members** and **Message Content** privileged intents in the
Developer Portal (Bot → Privileged Gateway Intents), and invite the bot with the
`bot` and `applications.commands` scopes.

### Run

```bash
npm run migrate    # set up the database schema
npm run deploy     # register slash commands with Discord
npm run dev        # start the bot
```

## Usage

```
/honeypot add <channel> [options]      Designate a honeypot
/honeypot remove <channel>             Remove one
/honeypot list                         Show all honeypots + resolved settings
/honeypot config <channel> [options]   Override settings for one honeypot
/config show                           Show server defaults + log channel
/config logchannel <channel>           Set the audit log channel
/config defaults [options]             Set server-wide defaults (with impact confirmation)
/diagnose                              Check the bot's permissions, server- and channel-wide
```

`[options]` covers `action`, `delete_messages`, `timeout`, `bypass_roles`, and
`roles`. Each scalar setting includes an **Inherit (guild default)** choice, and
the bot confirms the resolved value and where it came from.

## Deployment

Production runs on a single box with Docker Compose: the bot plus a Postgres
container. The `Dockerfile` is multi-stage (builds TypeScript, then a slim
runtime image running as a non-root user); `docker-compose.yml` wires the bot to
a `db` service with a healthcheck.

Compose reads a `.env` next to `docker-compose.yml`:

| Var | Required | Notes |
|-----|----------|-------|
| `DISCORD_TOKEN` | yes | Bot token |
| `CLIENT_ID` | yes | Application ID (for command registration) |
| `GUILD_ID` | no | set → register commands to one guild (instant); omit → register globally (all guilds, ~1h to propagate) |
| `POSTGRES_PASSWORD` | yes | Postgres password |
| `POSTGRES_USER` | no | default `honeypot` |
| `POSTGRES_DB` | no | default `honeypot` |
| `LOG_LEVEL` | no | pino level, default `info` |

Migrations run separately, never on boot. First deploy:

```bash
docker compose build                                              # build the bot image locally...
docker compose pull bot                                           # ...OR pull the CI-published image (same tag)
docker compose up -d db                                           # wait for healthy
docker compose run --rm bot node dist/scripts/migrate.js          # apply migrations
docker compose run --rm bot node dist/scripts/deploy-commands.js  # register commands
docker compose up -d bot                                          # start the bot
```

The first two commands are alternatives — `build` compiles the image locally,
`pull bot` fetches the published `irfancen/discord-honeypot` image. Run one.
