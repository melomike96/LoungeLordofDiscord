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
const fs = require('fs');
const path = require('path');

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
const USER_MEMORY_PATH = path.join(__dirname, 'user-memory.json');

const SUBJECTS = ['general', 'history', 'science', 'tech', 'nutrition'];
const SUBJECT_KEYWORDS = {
  history: ['history', 'rome', 'empire', 'war', 'ancient', 'historian', 'civilization'],
  science: ['science', 'physics', 'chemistry', 'biology', 'space', 'planet', 'atom'],
  tech: ['tech', 'code', 'coding', 'programming', 'computer', 'ai', 'software'],
  nutrition: ['nutrition', 'diet', 'protein', 'calorie', 'food', 'meal', 'vitamin'],
};

function loadUserMemory() {
  try {
    if (!fs.existsSync(USER_MEMORY_PATH)) return {};
    return JSON.parse(fs.readFileSync(USER_MEMORY_PATH, 'utf8'));
  } catch (error) {
    console.error('Failed to load user memory:', error);
    return {};
  }
}

function saveUserMemory(memory) {
  try {
    fs.writeFileSync(USER_MEMORY_PATH, JSON.stringify(memory, null, 2));
  } catch (error) {
    console.error('Failed to save user memory:', error);
  }
}

const userMemory = loadUserMemory();

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
    'You are LoungeLord, a friendly, casual, sharp Discord assistant.',
    'Sound warm, easygoing, and human.',
    'Be clear, accurate, and helpful without sounding stiff.',
    'Lead with the answer, then add useful nuance if it helps.',
    'Keep it concise unless the user clearly wants more detail.',
    'If the user is joking or casual, match that vibe naturally.',
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
    base.push('Mention-mode replies should feel extra conversational, like a smart friend in the server.');
  }

  base.push(subjectRules[subject] || subjectRules.general);
  return base.join(' ');
}

function inferSubjectFromPrompt(prompt = '') {
  const lower = prompt.toLowerCase();

  for (const [subject, keywords] of Object.entries(SUBJECT_KEYWORDS)) {
    if (keywords.some(keyword => lower.includes(keyword))) {
      return subject;
    }
  }

  return 'general';
}

function getDisplayName(user, member) {
  return member?.displayName || user?.globalName || user?.username || 'there';
}

function getUserProfile(userId) {
  if (!userMemory[userId]) {
    userMemory[userId] = {
      totalQuestions: 0,
      subjects: {},
    };
  }

  return userMemory[userId];
}

function recordUserTopic(userId, subject) {
  const profile = getUserProfile(userId);
  profile.totalQuestions += 1;
  profile.subjects[subject] = (profile.subjects[subject] || 0) + 1;
  saveUserMemory(userMemory);
  return profile;
}

function buildHistoryComment(subject, profile) {
  const count = profile.subjects[subject] || 0;

  if (count < 2) return '';

  const lines = {
    history: 'You really are a curious historian at this point.',
    science: 'You always come back with a good science question.',
    tech: 'You are definitely the tech one in here.',
    nutrition: 'You have been on a real nutrition streak lately.',
    general: 'You always bring in something interesting.',
  };

  return lines[subject] || lines.general;
}

function personalizeReply(text, displayName, historyComment = '') {
  const greeting = `Hey ${displayName}`;
  const trimmed = text.trim();

  if (!historyComment) {
    return `${greeting}, ${trimmed}`;
  }

  return `${greeting} - ${historyComment} ${trimmed}`;
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

function isUnknownInteractionError(error) {
  return error?.code === 10062 || /Unknown interaction/i.test(error?.message || '');
}

async function safeDeferReply(interaction, options) {
  try {
    await interaction.deferReply(options);
    return true;
  } catch (error) {
    if (isUnknownInteractionError(error)) {
      console.error('Interaction expired before deferReply:', error);
      return false;
    }

    throw error;
  }
}

async function safeEditReply(interaction, content) {
  try {
    await interaction.editReply(content);
  } catch (error) {
    if (isUnknownInteractionError(error)) {
      console.error('Interaction expired before editReply:', error);
      return;
    }

    throw error;
  }
}

async function safeFollowUp(interaction, content) {
  try {
    await interaction.followUp(content);
  } catch (error) {
    if (isUnknownInteractionError(error)) {
      console.error('Interaction expired before followUp:', error);
      return;
    }

    throw error;
  }
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
          'Answer directly, casually, and clearly.',
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

client.on('error', error => {
  console.error('Discord client error:', error);
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'health') {
    const deferred = await safeDeferReply(interaction, { flags: MessageFlags.Ephemeral });
    if (!deferred) return;

    const openaiHealth = await checkOpenAIHealth();
    const lines = [
      'Discord is connected.',
      `Default model: ${DEFAULT_MODEL}`,
      `Search model: ${SEARCH_MODEL}`,
      openaiHealth.ok ? openaiHealth.message : `OpenAI check failed: ${openaiHealth.message}`,
    ];

    await safeEditReply(interaction, lines.join('\n'));
    return;
  }

  if (interaction.commandName === 'search') {
    const prompt = interaction.options.getString('prompt', true);
    const displayName = getDisplayName(interaction.user, interaction.member);
    const profile = recordUserTopic(interaction.user.id, 'general');

    const deferred = await safeDeferReply(interaction);
    if (!deferred) return;

    try {
      const text = await searchAI(prompt);
      const chunks = chunkText(text);
      const firstChunk = personalizeReply(chunks[0], displayName, buildHistoryComment('general', profile));

      await safeEditReply(interaction, firstChunk);
      for (let i = 1; i < chunks.length; i++) {
        await safeFollowUp(interaction, chunks[i]);
      }
    } catch (error) {
      console.error('Search command error:', error);
      await safeEditReply(interaction, getUserFacingErrorMessage(error, 'search command'));
    }
    return;
  }

  if (interaction.commandName !== 'ask') return;

  const subject = interaction.options.getString('subject', true);
  const prompt = interaction.options.getString('prompt', true);
  const displayName = getDisplayName(interaction.user, interaction.member);
  const profile = recordUserTopic(interaction.user.id, subject);

  const deferred = await safeDeferReply(interaction);
  if (!deferred) return;

  try {
    const text = await askAI({ prompt, subject, mentionMode: false });
    const chunks = chunkText(text);
    const firstChunk = personalizeReply(chunks[0], displayName, buildHistoryComment(subject, profile));

    await safeEditReply(interaction, firstChunk);
    for (let i = 1; i < chunks.length; i++) {
      await safeFollowUp(interaction, chunks[i]);
    }
  } catch (error) {
    console.error('Slash command error:', error);
    await safeEditReply(interaction, getUserFacingErrorMessage(error, 'slash command'));
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
    const displayName = getDisplayName(message.author, message.member);

    if (!cleanedPrompt) {
      await message.reply(
        `Hey ${displayName}, I'm here. Ask me anything, toss me a random idea, or use \`/search\` if you want me to look something up.`
      );
      return;
    }

    await message.channel.sendTyping();
    const inferredSubject = inferSubjectFromPrompt(cleanedPrompt);
    const profile = recordUserTopic(message.author.id, inferredSubject);

    const text = await askAI({
      prompt: cleanedPrompt,
      subject: inferredSubject,
      mentionMode: true,
    });

    const chunks = chunkText(text);
    await message.reply(personalizeReply(chunks[0], displayName, buildHistoryComment(inferredSubject, profile)));

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

process.on('unhandledRejection', error => {
  console.error('Unhandled rejection:', error);
});

process.on('uncaughtException', error => {
  console.error('Uncaught exception:', error);
});
