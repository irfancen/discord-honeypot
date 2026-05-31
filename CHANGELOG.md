# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-05-31

Initial release. Detects compromised ("hacked") Discord accounts via honeypot
channels and actions them automatically.

### Added

- **Honeypot detection** — any non-exempt user who posts in a designated honeypot
  channel is actioned automatically (ban by default), their message is deleted,
  and the event is logged.
- **Configurable action per channel** — ban, kick, or timeout, with a configurable
  timeout duration.
- **Message cleanup** — optionally delete the offender's recent messages on a hit
  (native `deleteMessageSeconds` for bans; a best-effort guild-wide purge for
  kick/timeout, respecting Discord's 14-day bulk-delete limit).
- **Three-level settings inheritance** — per-channel override → server default →
  built-in baseline; works with zero configuration out of the box.
- **Exemptions** — admins, bots, the server owner, and configurable bypass roles
  (three-state: inherit / none / explicit list) are never actioned.
- **Audit logging** — hits are posted to a configurable log channel as
  markdown-safe embeds; a "manual review needed" alert is posted when the bot
  can't action a target (e.g. a compromised account that outranks it).
- **Commands**
  - `/honeypot add|remove|list|config|hits|stats` — manage honeypots, per-channel
    overrides, and view recent hits / activity stats.
  - `/config show|logchannel|defaults` — server-wide settings, with an
    impact-confirmation flow when changing a default that channels inherit.
  - `/diagnose` — permission self-check, server- and channel-wide.
  - `/ping` — health check.
- **Flexible command registration** — register to one guild (instant, for
  development) or globally (all guilds) via the optional `GUILD_ID`.
- **Deployment** — multi-stage `Dockerfile`, Docker Compose (bot + PostgreSQL),
  and a multi-arch image (`linux/amd64` + `linux/arm64`).
- **CI/CD** — GitHub Actions pipeline: `npm audit` + typecheck + build gate, then
  a multi-arch image published to Docker Hub on push to `main` (per-commit `:sha`
  tag) and on `v*` release tags (`:version` + `:latest`).

[1.0.0]: https://github.com/irfancen/discord-honeypot/releases/tag/v1.0.0
