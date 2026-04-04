// discord-ai-bot-starter.js
// Node.js 22+
// Packages needed:
//   npm install discord.js openai dotenv
//
// .env file:
// DISCORD_TOKEN=your_discord_bot_token
// DISCORD_CLIENT_ID=your_discord_app_client_id
// DISCORD_GUILD_ID=your_test_server_id
// OPENAI_API_KEY=your_openai_api_key
// OPENAI_MODEL=gpt-4o-mini
// OPENAI_SEARCH_MODEL=gpt-4o-mini
//
// What this bot does:
// 1) /ask history how did rome fall
// 2) You can mention the bot like: @LoungeLord explain black holes simply
// 3) The bot figures out the best subject if you mention it naturally
//
// Notes:
// - Slash command format here is: /ask subject:<topic> prompt:<question>
//   Example: /ask subject:history prompt:how did rome fall
// - If you really want /ask history "how did rome fall" exactly, that is closer to a prefix/message parser.
//   Slash commands are cleaner and more reliable in Discord.
// - Mention mode gives you the natural chat feel you want.

require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  Events,
  MessageFlags,
  REST,
  Routes,
  SlashCommandBuilder,
} = require('discord.js');
const OpenAI = require('openai');

const REQUIRED_ENV_VARS = [
  'DISCORD_TOKEN',
  'DISCORD_CLIENT_ID',
  'DISCORD_GUILD_ID',
  'OPENAI_API_KEY',
];

function getMissingEnvVars() {
  return REQUIRED_ENV_VARS.filter(key => !process.env[key]?.trim());
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const DEFAULT_MODEL = process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini';
const SEARCH_MODEL = process.env.OPENAI_SEARCH_MODEL?.trim() || DEFAULT_MODEL;

const SUBJECTS = ['general', 'history', 'science', 'tech', 'nutrition'];

const commands = [
  new SlashCommandBuilder()
    .setName('ask')
    .setDescription('Ask LoungeLord a question')
    .addStringOption(option =>
      option
        .setName('subject')
        .setDescription('Choose a subject area')
        .setRequired(true)
        .addChoices(
          { name: 'general', value: 'general' },
          { name: 'history', value: 'history' },
          { name: 'science', value: 'science' },
          { name: 'tech', value: 'tech' },
          { name: 'nutrition', value: 'nutrition' },
        )
    )
    .addStringOption(option =>
      option
        .setName('prompt')
        .setDescription('What do you want to ask?')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('search')
    .setDescription('Search the web for current information')
    .addStringOption(option =>
      option
        .setName('prompt')
        .setDescription('What should LoungeLord look up?')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('health')
    .setDescription('Check Discord and OpenAI connectivity'),
].map(command => command.toJSON());

function buildSystemPrompt(subject, isMentionMode = false) {
  const base = [
    'You are LoungeLord, a smart, laid-back but sharp Discord expert assistant.',
    'Answer like a knowledgeable guide, not a stiff textbook.',
    'Be clear, accurate, and direct.',
    'Start with a clean answer, then add useful nuance if needed.',
    'Do not ramble.',
    'If the user is casual, you can be casual too.',
    'If the question is ambiguous, make the best reasonable interpretation and answer it.',
    'If the topic touches medicine, diagnosis, or treatment, stay general and avoid pretending to be a doctor.',
  ];

  const subjectRules = {
    general: 'Handle any topic well. If needed, infer the likely subject and answer appropriately.',
    history: 'Act like a strong history explainer. Give timeline, context, causes, and major consequences. Mention debate when relevant.',
    science: 'Act like a strong science explainer. Be evidence-aware, explain concepts simply, and avoid hype or fake certainty.',
    tech: 'Act like a strong tech explainer. Be practical, accurate, and avoid empty buzzwords.',
    nutrition: 'Act like a strong nutrition explainer. Focus on balanced, evidence-aware guidance. Avoid extreme claims or diagnosis.',
  };

  if (isMentionMode) {
    base.push('When the user mentions you naturally, infer the best subject automatically from their message.');
  }

  base.push(subjectRules[subject] || subjectRules.general);
  return base.join(' ');
}

function chunkText(text, maxLength = 1900) {
  if (!text) return ['Response was empty.'];

  const chunks = [];
  let remaining = text.trim();

  while (remaining.length > maxLength) {
    let slice = remaining.slice(0, maxLength);
    const lastBreak = Math.max(
      slice.lastIndexOf('\n\n'),
      slice.lastIndexOf('\n'),
      slice.lastIndexOf('. '),
      slice.lastIndexOf(' ')
    );

    if (lastBreak > 200) {
      slice = slice.slice(0, lastBreak + 1);
    }

    chunks.push(slice.trim());
    remaining = remaining.slice(slice.length).trim();
  }

  if (remaining.length) chunks.push(remaining);
  return chunks;
}

function getUserFacingErrorMessage(error, context = 'request') {
  const status = error?.status ?? error?.response?.status;
  const message = error?.message || '';
  const code = error?.code || '';

  if (
    status === 429 ||
    code === 'insufficient_quota' ||
    /quota|rate limit|rate-limited|too many requests/i.test(message)
  ) {
    return 'OpenAI quota is exhausted or rate-limited right now. Check billing and usage, then try again.';
  }

  if (status === 401 || /incorrect api key|invalid api key|unauthorized/i.test(message)) {
    return 'OpenAI API key was rejected. Check OPENAI_API_KEY and try again.';
  }

  if (status === 403 || /permission|forbidden|model access/i.test(message)) {
    return 'OpenAI blocked this request. Check your project permissions and model access.';
  }

  if (/exceeded your current quota/i.test(message)) {
    return 'OpenAI quota is exhausted or rate-limited right now. Check billing and usage, then try again.';
  }

  return `Something broke while handling that ${context}. Check the bot logs for details.`;
}

async function checkOpenAIHealth() {
  try {
    await openai.responses.create({
      model: DEFAULT_MODEL,
      input: [
        {
          role: 'user',
          content: 'Reply with exactly: OK',
        },
      ],
      max_output_tokens: 16,
    });

    return { ok: true, message: 'OpenAI is reachable.' };
  } catch (error) {
    console.error('Health check error:', error);
    return { ok: false, message: getUserFacingErrorMessage(error, 'health check') };
  }
}

async function createTextResponse({ model, input, tools, maxOutputTokens = 700 }) {
  const response = await openai.responses.create({
    model,
    input,
    ...(tools ? { tools, tool_choice: 'auto' } : {}),
    max_output_tokens: maxOutputTokens,
  });

  return response.output_text?.trim() || 'No response returned.';
}

async function askAI({ prompt, subject = 'general', mentionMode = false }) {
  return createTextResponse({
    model: DEFAULT_MODEL,
    input: [
      {
        role: 'system',
        content: buildSystemPrompt(subject, mentionMode),
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
  });
}

async function searchAI(prompt) {
  return createTextResponse({
    model: SEARCH_MODEL,
    input: [
      {
        role: 'system',
        content: [
          'You are LoungeLord handling a Discord web lookup.',
          'Search the web for current information.',
          'Answer directly and briefly.',
          'When using web results, include source links inline so the user can verify the answer.',
          'If the answer is uncertain or mixed, say so plainly.',
        ].join(' '),
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    tools: [
      {
        type: 'web_search',
        user_location: {
          type: 'approximate',
          country: 'US',
          timezone: 'America/New_York',
        },
      },
    ],
    maxOutputTokens: 900,
  });
}

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(
      process.env.DISCORD_CLIENT_ID,
      process.env.DISCORD_GUILD_ID
    ),
    { body: commands }
  );

  console.log('Slash command registered in test guild.');
}

client.once(Events.ClientReady, readyClient => {
  console.log(`Logged in as ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'health') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const openaiHealth = await checkOpenAIHealth();
    const lines = [
      'Discord is connected.',
      `Default model: ${DEFAULT_MODEL}`,
      `Search model: ${SEARCH_MODEL}`,
      openaiHealth.ok ? openaiHealth.message : `OpenAI check failed: ${openaiHealth.message}`,
    ];

    await interaction.editReply(lines.join('\n'));
    return;
  }

  if (interaction.commandName === 'search') {
    const prompt = interaction.options.getString('prompt', true);

    await interaction.deferReply();

    try {
      const text = await searchAI(prompt);
      const chunks = chunkText(text);

      await interaction.editReply(chunks[0]);
      for (let i = 1; i < chunks.length; i++) {
        await interaction.followUp(chunks[i]);
      }
    } catch (error) {
      console.error('Search command error:', error);
      await interaction.editReply(getUserFacingErrorMessage(error, 'search command'));
    }
    return;
  }

  if (interaction.commandName !== 'ask') return;

  const subject = interaction.options.getString('subject', true);
  const prompt = interaction.options.getString('prompt', true);

  await interaction.deferReply();

  try {
    const text = await askAI({ prompt, subject, mentionMode: false });
    const chunks = chunkText(text);

    await interaction.editReply(chunks[0]);
    for (let i = 1; i < chunks.length; i++) {
      await interaction.followUp(chunks[i]);
    }
  } catch (error) {
    console.error('Slash command error:', error);
    await interaction.editReply(getUserFacingErrorMessage(error, 'slash command'));
  }
});

client.on(Events.MessageCreate, async message => {
  try {
    if (message.author.bot) return;
    if (!client.user) return;
    if (!message.guild) return;

    const isMentioned = message.mentions.has(client.user);
    if (!isMentioned) return;

    const botMentionRegex = new RegExp(`<@!?${client.user.id}>`, 'g');
    const cleanedPrompt = message.content.replace(botMentionRegex, '').trim();

    if (!cleanedPrompt) {
      await message.reply('Hit me with a real question. Example: @LoungeLord why did Rome fall?');
      return;
    }

    await message.channel.sendTyping();

    const text = await askAI({
      prompt: cleanedPrompt,
      subject: 'general',
      mentionMode: true,
    });

    const chunks = chunkText(text);
    await message.reply(chunks[0]);

    for (let i = 1; i < chunks.length; i++) {
      await message.channel.send(chunks[i]);
    }
  } catch (error) {
    console.error('Mention reply error:', error);
    await message.reply(getUserFacingErrorMessage(error, 'message'));
  }
});

(async () => {
  try {
    const missingEnvVars = getMissingEnvVars();
    if (missingEnvVars.length) {
      throw new Error(`Missing required env vars: ${missingEnvVars.join(', ')}`);
    }

    await registerCommands();
    await client.login(process.env.DISCORD_TOKEN);
  } catch (error) {
    if (error?.message?.includes('Used disallowed intents')) {
      console.error(
        'Startup failed: Message Content Intent is not enabled for this bot. Enable it in the Discord Developer Portal under Bot > Privileged Gateway Intents to use mention mode.'
      );
      return;
    }

    console.error('Startup failed:', error);
  }
})();
