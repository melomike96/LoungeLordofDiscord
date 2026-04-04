require('dotenv').config();
const { Client, GatewayIntentBits, Events } = require('discord.js');
const OpenAI = require('openai');

const token = process.env.DISCORD_TOKEN;
const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const allowedChannelId = process.env.ALLOWED_CHANNEL_ID || null;
const cooldownSeconds = Number(process.env.COOLDOWN_SECONDS || 15);

if (!token || !process.env.OPENAI_API_KEY) {
  console.error('Missing DISCORD_TOKEN or OPENAI_API_KEY in environment.');
  process.exit(1);
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

const userCooldowns = new Map();

function isOnCooldown(userId) {
  const now = Date.now();
  const last = userCooldowns.get(userId) || 0;
  const elapsed = (now - last) / 1000;

  if (elapsed < cooldownSeconds) {
    return Math.ceil(cooldownSeconds - elapsed);
  }

  userCooldowns.set(userId, now);
  return 0;
}

function inferSubject(inputText = '') {
  const text = inputText.toLowerCase();

  const buckets = [
    {
      subject: 'history',
      keywords: ['history', 'historical', 'war', 'empire', 'civilization', 'ancient', 'timeline'],
    },
    {
      subject: 'science',
      keywords: ['science', 'biology', 'physics', 'chemistry', 'astronomy', 'experiment', 'hypothesis'],
    },
    {
      subject: 'tech',
      keywords: ['tech', 'technology', 'programming', 'software', 'hardware', 'ai', 'computer', 'code'],
    },
    {
      subject: 'nutrition',
      keywords: ['nutrition', 'diet', 'protein', 'calorie', 'vitamin', 'food', 'macros', 'meal'],
    },
  ];

  let best = { subject: 'general', score: 0 };

  for (const bucket of buckets) {
    let score = 0;
    for (const keyword of bucket.keywords) {
      if (text.includes(keyword)) score += 1;
    }

    if (score > best.score) {
      best = { subject: bucket.subject, score };
    }
  }

  return best.subject;
}

function subjectSystemPrompt(subject) {
  const base = 'You are LoungeLord, a helpful Discord assistant. Keep responses concise, clear, and practical.';

  switch (subject) {
    case 'history':
      return `${base} Emphasize dates, context, and cause/effect in historical explanations.`;
    case 'science':
      return `${base} Explain with scientific reasoning and plain language.`;
    case 'tech':
      return `${base} Prioritize actionable technical guidance and short examples.`;
    case 'nutrition':
      return `${base} Focus on evidence-based nutrition guidance and include caution for medical edge cases.`;
    default:
      return `${base} Use balanced general-purpose guidance.`;
  }
}

async function queryLoungeLord({ subject, prompt }) {
  const completion = await openai.chat.completions.create({
    model,
    temperature: 0.5,
    messages: [
      { role: 'system', content: subjectSystemPrompt(subject) },
      { role: 'user', content: prompt },
    ],
  });

  return completion.choices?.[0]?.message?.content || 'Sorry, I could not generate a response.';
}

function channelBlocked(channelId) {
  return Boolean(allowedChannelId && channelId !== allowedChannelId);
}

client.once(Events.ClientReady, (readyClient) => {
  console.log(`LoungeLord is online as ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'ask') return;

  if (channelBlocked(interaction.channelId)) {
    await interaction.reply({ content: 'LoungeLord is not enabled in this channel.', ephemeral: true });
    return;
  }

  const waitSeconds = isOnCooldown(interaction.user.id);
  if (waitSeconds > 0) {
    await interaction.reply({
      content: `Please wait ${waitSeconds}s before asking again.`,
      ephemeral: true,
    });
    return;
  }

  const subject = interaction.options.getString('subject', true);
  const prompt = interaction.options.getString('prompt', true);

  await interaction.deferReply();

  try {
    const answer = await queryLoungeLord({ subject: inferSubject(`${subject} ${prompt}`), prompt });
    await interaction.editReply(answer);
  } catch (error) {
    console.error('Slash command failed:', error);
    await interaction.editReply('Sorry, something went wrong while generating a response.');
  }
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  if (!client.user) return;

  const isMentioned = message.mentions.has(client.user);
  if (!isMentioned) return;

  if (channelBlocked(message.channelId)) {
    await message.reply('LoungeLord is not enabled in this channel.');
    return;
  }

  const waitSeconds = isOnCooldown(message.author.id);
  if (waitSeconds > 0) {
    await message.reply(`Please wait ${waitSeconds}s before asking again.`);
    return;
  }

  const cleanedPrompt = message.content.replace(/<@!?\d+>/g, '').trim();

  if (!cleanedPrompt) {
    await message.reply('Ask me anything after mentioning me, for example: `@LoungeLord explain black holes simply`.');
    return;
  }

  try {
    await message.channel.sendTyping();
    const inferred = inferSubject(cleanedPrompt);
    const answer = await queryLoungeLord({ subject: inferred, prompt: cleanedPrompt });
    await message.reply(answer);
  } catch (error) {
    console.error('Mention handler failed:', error);
    await message.reply('Sorry, something went wrong while generating a response.');
  }
});

client.login(token);
