# LoungeLordofDiscord

Discord bot with slash-command and mention-mode replies powered by OpenAI.

## Setup

1. Install dependencies with `npm install`
2. Copy `.env.example` to `.env`
3. Fill in `.env`:
   - `DISCORD_TOKEN`
   - `DISCORD_CLIENT_ID`
   - `DISCORD_GUILD_ID`
   - `OPENAI_API_KEY`
   - `OPENAI_MODEL` defaults to `gpt-4o-mini`
   - `OPENAI_SEARCH_MODEL` defaults to `gpt-4o-mini`
4. In the Discord Developer Portal for the bot:
   - Turn on `MESSAGE CONTENT INTENT` under `Bot > Privileged Gateway Intents`
   - Make sure the bot is invited to your testing server
5. Add API billing or prepaid credits to the OpenAI project tied to `OPENAI_API_KEY`
6. Start the bot with `npm start`

## Recommended Models

- Default chat: `gpt-4o-mini`
- Web lookup: `gpt-4o-mini`
- Upgrade path if you want better quality later: `gpt-5-mini`

## Testing

- Slash command: `/ask subject:history prompt:how did rome fall`
- Web lookup: `/search prompt:what happened in the latest space launch`
- Mention mode: `@LoungeLord why did Rome fall?`
- Health check: `/health`

## Notes

- `/ask` and mention replies use your normal chat model.
- `/search` uses OpenAI web search and is the one to use for current events, recent facts, or "google this" arguments.
- If OpenAI billing is empty, `/health`, `/ask`, `/search`, and mention replies will fail until credits are added.
