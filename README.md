# LoungeLord

LoungeLord is a simple, polished Discord AI bot with two natural ways to chat:

- `/ask` with a **subject** + **prompt**
- Mentioning the bot directly (for example: `@LoungeLord help me understand SQL joins`)

It keeps the code straightforward while adding practical guardrails.

## Features

- ✅ `/ask` command with required `subject` and `prompt`
- ✅ Bot mention support for natural conversation
- ✅ Better prompt routing for `history`, `science`, `tech`, `nutrition`, or `general`
- ✅ Per-user cooldown to reduce spam
- ✅ Optional single-channel restriction via environment variable

## Project structure

- `src/bot.js` – main bot runtime
- `src/register-commands.js` – registers `/ask` command with Discord
- `.env.example` – environment template

## Requirements

- Node.js 18+
- A Discord application + bot token
- An OpenAI API key

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy environment template and fill values:

   ```bash
   cp .env.example .env
   ```

3. Set required variables in `.env`:

   - `DISCORD_TOKEN`
   - `DISCORD_CLIENT_ID`
   - `OPENAI_API_KEY`

   Optional:

   - `DISCORD_GUILD_ID` (faster command updates in a single test guild)
   - `OPENAI_MODEL` (default: `gpt-4o-mini`)
   - `ALLOWED_CHANNEL_ID` (only allow bot usage in one channel)
   - `COOLDOWN_SECONDS` (default: `15`)

4. Register slash commands:

   ```bash
   npm run register
   ```

5. Start the bot:

   ```bash
   npm start
   ```

## Scripts

- `npm start` – run LoungeLord
- `npm run dev` – run in watch mode
- `npm run register` – register `/ask` command

## Usage examples

### Slash command

```text
/ask subject:science prompt:Why is the sky blue?
```

### Mention

```text
@LoungeLord compare Linux and Windows for programming
```

## Notes

- Cooldown is tracked in memory per user.
- Channel restriction is optional and disabled when `ALLOWED_CHANNEL_ID` is blank.
- Subject routing uses simple keyword scoring to keep logic readable.
