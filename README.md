# LoungeLordofDiscord

Discord bot with slash-command and mention-mode replies powered by OpenAI.

## Setup

1. Install dependencies with `npm install`
2. Add a `.env` file with:
   - `DISCORD_TOKEN`
   - `DISCORD_CLIENT_ID`
   - `DISCORD_GUILD_ID`
   - `OPENAI_API_KEY`
3. In the Discord Developer Portal for the bot:
   - Turn on `MESSAGE CONTENT INTENT` under `Bot > Privileged Gateway Intents`
   - Make sure the bot is invited to your testing server
4. Start the bot with `npm start`

## Testing

- Slash command: `/ask subject:history prompt:how did rome fall`
- Mention mode: `@LoungeLord why did Rome fall?`
