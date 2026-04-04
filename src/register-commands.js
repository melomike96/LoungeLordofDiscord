require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;

if (!token || !clientId) {
  console.error('Missing DISCORD_TOKEN or DISCORD_CLIENT_ID in environment.');
  process.exit(1);
}

const commands = [
  new SlashCommandBuilder()
    .setName('ask')
    .setDescription('Ask LoungeLord a question with a subject and prompt.')
    .addStringOption((option) =>
      option
        .setName('subject')
        .setDescription('Topic area (history, science, tech, nutrition, or general)')
        .setRequired(true)
    )
    .addStringOption((option) =>
      option.setName('prompt').setDescription('Your question or prompt.').setRequired(true)
    )
    .toJSON(),
];

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { commands });
      console.log(`Registered /ask command for guild ${guildId}.`);
    } else {
      await rest.put(Routes.applicationCommands(clientId), { commands });
      console.log('Registered /ask command globally.');
    }
  } catch (error) {
    console.error('Failed to register commands:', error);
    process.exit(1);
  }
})();
