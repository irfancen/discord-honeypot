# Discord Honeypot Bot

A Discord bot that automatically detects and removes **compromised accounts**.

When a Discord account is hacked, it almost always does the same thing: spam
messages across every channel it can reach. This bot turns that behavior
against the attacker. You designate one or more **honeypot channels** — channels
a real member would never post in — and any account that posts there is
automatically removed before it can spam the rest of your server.

> **Status:** In active development. The data layer and command framework are
> built; the honeypot detection and configuration commands are in progress. See
> [Roadmap](#roadmap).

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

> Configuration commands are under development. Planned interface:

```
/honeypot add <channel> [action] [delete_messages]   Designate a honeypot
/honeypot remove <channel>                            Remove one
/honeypot list                                        Show all honeypots
/config logchannel <channel>                          Set the audit log channel
/config defaults [action] [delete_messages]           Set server-wide defaults
```

## Roadmap

- [x] Project scaffolding & command/event framework
- [x] Database schema, migrations, and data access
- [ ] Settings resolution (per-channel → server → defaults)
- [ ] Honeypot detection and action execution
- [ ] `/honeypot` and `/config` commands
- [ ] Audit log notifications

## License

MIT
