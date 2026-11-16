import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  PermissionFlagsBits
} from 'discord.js';

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('Missing DISCORD_TOKEN. Add it as a private Hoody environment variable.');
  process.exit(1);
}

const dataFile = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data.json');
const data = loadData();
const xpCooldowns = new Map();
const spamWindows = new Map();
const finishingGiveaways = new Set();

function loadData() {
  try {
    return JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('Could not read data.json:', error.message);
    return { guilds: {} };
  }
}

function saveData() {
  const temporaryFile = dataFile + '.tmp';
  fs.writeFileSync(temporaryFile, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(temporaryFile, dataFile);
}

function guildData(guildId) {
  data.guilds ??= {};
  data.guilds[guildId] ??= {
    welcomeChannelId: null,
    automod: { enabled: false, links: true, invites: true, caps: true, spam: true },
    xp: {},
    tickets: {},
    giveaways: {}
  };
  const settings = data.guilds[guildId];
  settings.automod ??= { enabled: false, links: true, invites: true, caps: true, spam: true };
  settings.xp ??= {};
  settings.tickets ??= {};
  settings.giveaways ??= {};
  return settings;
}

function levelFor(xp) {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 100));
}

function nextLevelXP(level) {
  return 100 * (level + 1) ** 2;
}

function isModerator(member) {
  return member?.permissions?.has(PermissionFlagsBits.ManageMessages) ||
    member?.permissions?.has(PermissionFlagsBits.Administrator);
}

function welcomeEmbed(user, guild, preview = false) {
  return new EmbedBuilder()
    .setColor(0x8b6bfa)
    .setTitle(preview ? 'Welcome preview' : 'Welcome to ' + guild.name + '!')
    .setDescription(preview
      ? 'Welcome, ' + user.username + '! This is how Cody’s welcome message will look.'
      : 'Please welcome <@' + user.id + '> to **' + guild.name + '**!')
    .setThumbnail(user.displayAvatarURL({ size: 128 }));
}

function giveawayEmbed(giveaway, ended = false, winners = []) {
  const description = ended
    ? (winners.length
      ? 'Winner' + (winners.length === 1 ? '' : 's') + ': ' + winners.map(id => '<@' + id + '>').join(', ')
      : 'No valid entries this time.')
    : 'Press the button below to enter. Ends <t:' + Math.floor(giveaway.endsAt / 1000) + ':R>.';
  const embed = new EmbedBuilder()
    .setColor(ended ? 0x39d9a2 : 0x8b6bfa)
    .setTitle(ended ? 'Giveaway ended' : 'Giveaway: ' + giveaway.prize)
    .setDescription(description)
    .addFields(
      { name: 'Prize', value: giveaway.prize, inline: true },
      { name: 'Entries', value: String(giveaway.entries.length), inline: true }
    );
  if (ended) embed.setTimestamp();
  return embed;
}

function giveawayButtons(messageId) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('giveaway:join:' + messageId)
      .setLabel('Enter Giveaway')
      .setStyle(ButtonStyle.Primary)
  )];
}

function findViolation(text, rules) {
  const content = String(text ?? '');
  if (rules.invites && /(?:discord\.gg\/|discord(?:app)?\.com\/invite\/)[A-Za-z0-9-]+/i.test(content)) return 'Discord invite links';
  if (rules.links && /(?:https?:\/\/|www\.)\S+/i.test(content)) return 'web links';
  const letters = content.match(/[a-z]/gi) ?? [];
  const capitals = content.match(/[A-Z]/g) ?? [];
  if (rules.caps && letters.length >= 16 && capitals.length / letters.length >= 0.75) return 'excessive caps';
  return null;
}

function checkSpam(message) {
  const key = message.guild.id + ':' + message.author.id;
  const now = Date.now();
  const times = (spamWindows.get(key) ?? []).filter(time => now - time < 5000);
  times.push(now);
  spamWindows.set(key, times);
  return times.length > 6;
}

async function applyAutoMod(message, settings) {
  if (!settings.automod.enabled || isModerator(message.member)) return false;
  let violation = findViolation(message.content, settings.automod);
  if (!violation && settings.automod.spam && checkSpam(message)) violation = 'rapid message spam';
  if (!violation) return false;

  await message.delete().catch(error => console.warn('AutoMod could not delete a message:', error.message));
  const warning = await message.channel.send({
    content: '<@' + message.author.id + '>, your message was removed for ' + violation + '.',
    allowedMentions: { users: [message.author.id] }
  }).catch(() => null);
  if (warning) setTimeout(() => warning.delete().catch(() => {}), 6000);
  return true;
}

async function awardXP(message) {
  const key = message.guild.id + ':' + message.author.id;
  const now = Date.now();
  if (now - (xpCooldowns.get(key) ?? 0) < 60000) return;
  xpCooldowns.set(key, now);

  const settings = guildData(message.guild.id);
  const record = settings.xp[message.author.id] ??= { xp: 0, messages: 0 };
  const previousLevel = levelFor(record.xp);
  record.xp += 15 + Math.floor(Math.random() * 11);
  record.messages += 1;
  const newLevel = levelFor(record.xp);
  saveData();

  if (newLevel > previousLevel) {
    await message.channel.send({
      content: '🎉 <@' + message.author.id + '> reached **level ' + newLevel + '**!',
      allowedMentions: { users: [message.author.id] }
    }).catch(() => {});
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once(Events.ClientReady, readyClient => {
  console.log('Cody is online as ' + readyClient.user.tag + '.');
  scheduleSavedGiveaways();
});

client.on(Events.GuildMemberAdd, async member => {
  const channelId = guildData(member.guild.id).welcomeChannelId;
  if (!channelId) return;
  const channel = await member.guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased()) return;
  await channel.send({
    embeds: [welcomeEmbed(member.user, member.guild)],
    allowedMentions: { users: [member.id] }
  }).catch(error => console.warn('Welcome message failed:', error.message));
});

client.on(Events.MessageCreate, async message => {
  if (!message.guild || message.author.bot) return;
  try {
    if (await applyAutoMod(message, guildData(message.guild.id))) return;
    await awardXP(message);
  } catch (error) {
    console.error('Message handler failed:', error);
  }
});

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isButton()) {
      await handleButton(interaction);
      return;
    }
    if (!interaction.isChatInputCommand() || !interaction.guild) return;
    await handleCommand(interaction);
  } catch (error) {
    console.error('Interaction failed:', error);
    const response = {
      content: 'Cody could not complete that action. Check its permissions and try again.',
      ephemeral: true
    };
    if (interaction.replied || interaction.deferred) await interaction.followUp(response).catch(() => {});
    else await interaction.reply(response).catch(() => {});
  }
});

async function handleCommand(interaction) {
  const { commandName, options, guild, user } = interaction;
  const settings = guildData(guild.id);

  if (commandName === 'ping') {
    await interaction.reply('Pong! Discord latency: **' + Math.round(client.ws.ping) + 'ms**.');
    return;
  }
  if (commandName === 'help') {
    const embed = new EmbedBuilder().setColor(0x8b6bfa).setTitle('Cody commands')
      .setDescription('All Cody commands and setup shortcuts.')
      .addFields(
        { name: 'Getting started', value: '`/setup` — setup checklist\n`/config` — view this server’s Cody settings\n`/help` — show this list' },
        { name: 'Welcome messages', value: '`/welcome set channel:#channel`\n`/welcome preview`\n`/welcome disable`' },
        { name: 'Levels', value: '`/level [user]` — view a member’s XP and level\n`/leaderboard` — top 10 members' },
        { name: 'AutoMod (Manage Server)', value: '`/automod enable`\n`/automod disable`\n`/automod status`\n`/automod check text`' },
        { name: 'Tickets (Manage Server)', value: '`/ticket channel:#channel` — post a ticket panel\nUse the panel button to open a private ticket; ticket owner or moderator can close it.' },
        { name: 'Giveaways (Manage Server)', value: '`/giveaway start duration:<minutes> prize:<name> [winners:<number>]`\n`/giveaway end message_id:<id>`' },
        { name: 'Mini-games', value: '`/game rps choice:<rock|paper|scissors>`\n`/game trivia`' },
        { name: 'Bot & hosting', value: '`/ping` — response latency\n`/about` — bot information\n`/hosting` — Hoody 24/7 hosting guidance' }
      )
      .setFooter({ text: 'Admin setup commands require Manage Server. AutoMod is off until enabled.' });
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }
  if (commandName === 'setup') {
    const embed = new EmbedBuilder().setColor(0x8b6bfa).setTitle('Cody server setup')
      .setDescription('Run these commands as a server administrator:')
      .addFields(
        { name: '1 · Welcome', value: '`/welcome set channel:#welcome` then `/welcome preview`' },
        { name: '2 · AutoMod', value: '`/automod enable` (starts off; removes invites, links, excessive caps, and rapid spam)' },
        { name: '3 · Tickets', value: '`/ticket channel:#support` to post a panel' },
        { name: '4 · Giveaways', value: 'Use `/giveaway start` and choose duration, prize, and winner count.' },
        { name: '5 · Levels', value: 'XP tracking is automatic. Use `/level` and `/leaderboard`.' },
        { name: 'Review settings', value: 'Use `/config`. For the complete command list, use `/help`.' }
      );
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }
  if (commandName === 'config') {
    const welcome = settings.welcomeChannelId ? '<#' + settings.welcomeChannelId + '>' : 'not set';
    const activeGiveaways = Object.keys(settings.giveaways).length;
    const activeTickets = Object.keys(settings.tickets).length;
    const embed = new EmbedBuilder().setColor(0x8b6bfa).setTitle(guild.name + ' · Cody configuration')
      .addFields(
        { name: 'Welcome channel', value: welcome, inline: true },
        { name: 'AutoMod', value: settings.automod.enabled ? 'On' : 'Off', inline: true },
        { name: 'Level system', value: 'On · XP is awarded automatically', inline: true },
        { name: 'Tickets', value: activeTickets + ' open', inline: true },
        { name: 'Giveaways', value: activeGiveaways + ' active', inline: true },
        { name: 'Setup guide', value: 'Use `/setup` for setup instructions.' }
      );
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }
  if (commandName === 'hosting') {
    const embed = new EmbedBuilder().setColor(0x8b6bfa).setTitle('Cody hosting')
      .setDescription('Cody is connected to Discord while its Hoody process is running. For 24/7 uptime, run it as a Hoody Daemon with boot enabled and automatic restart enabled.')
      .addFields(
        { name: 'Hoody setup', value: 'Create a Daemon program for `npm start` in the bot folder, enable boot start and autorestart, and provide `DISCORD_TOKEN` as a private environment variable. Do not post the token in chat or commit it to GitHub.' },
        { name: 'Deploy updates', value: 'Pull the latest SB10S code in Hoody, install dependencies if needed, then restart the Daemon.' }
      );
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }
  if (commandName === 'about') {
    await interaction.reply({
      embeds: [new EmbedBuilder().setColor(0x8b6bfa).setTitle('About Cody')
        .setDescription('A community bot for welcome messages, leveling, AutoMod, tickets, giveaways, and mini-games.')
        .addFields({ name: 'Server', value: guild.name, inline: true }, { name: 'Library', value: 'discord.js', inline: true })],
      ephemeral: true
    });
    return;
  }
  if (commandName === 'welcome') {
    const subcommand = options.getSubcommand();
    if (subcommand === 'set') {
      const channel = options.getChannel('channel', true);
      settings.welcomeChannelId = channel.id;
      saveData();
      await interaction.reply({ content: 'Welcome messages will go to ' + channel.toString() + '.', ephemeral: true });
    } else if (subcommand === 'disable') {
      settings.welcomeChannelId = null;
      saveData();
      await interaction.reply({ content: 'Welcome messages are disabled for this server.', ephemeral: true });
    } else {
      const channel = settings.welcomeChannelId
        ? await guild.channels.fetch(settings.welcomeChannelId).catch(() => null)
        : interaction.channel;
      if (!channel?.isTextBased()) {
        await interaction.reply({ content: 'Set a welcome channel first with /welcome set.', ephemeral: true });
        return;
      }
      await channel.send({
        embeds: [welcomeEmbed(user, guild, true)],
        allowedMentions: { parse: [] }
      });
      await interaction.reply({ content: 'Welcome preview sent to ' + channel.toString() + '.', ephemeral: true });
    }
    return;
  }
  if (commandName === 'level') {
    const target = options.getUser('user') ?? user;
    const record = settings.xp[target.id] ?? { xp: 0, messages: 0 };
    const level = levelFor(record.xp);
    const needed = nextLevelXP(level);
    const previous = 100 * level ** 2;
    const progress = Math.max(0, record.xp - previous);
    const span = Math.max(1, needed - previous);
    const width = 12;
    const filled = Math.min(width, Math.floor((progress / span) * width));
    const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
    await interaction.reply({
      embeds: [new EmbedBuilder().setColor(0x8b6bfa).setTitle(target.username + ' — Level ' + level)
        .setDescription('' + bar + '\n**' + record.xp + ' XP** · ' + progress + '/' + span + ' XP to the next level')
        .addFields({ name: 'Messages counted', value: String(record.messages), inline: true })],
      ephemeral: true
    });
    return;
  }
  if (commandName === 'leaderboard') {
    const top = Object.entries(settings.xp).sort((a, b) => b[1].xp - a[1].xp).slice(0, 10);
    const description = top.length
      ? top.map(([id, record], index) => '**' + (index + 1) + '.** <@' + id + '> — Level ' + levelFor(record.xp) + ' · ' + record.xp + ' XP').join('\n')
      : 'No levels yet. Chat to start earning XP.';
    await interaction.reply({
      embeds: [new EmbedBuilder().setColor(0x8b6bfa).setTitle(guild.name + ' leaderboard').setDescription(description)],
      allowedMentions: { parse: [] }
    });
    return;
  }
  if (commandName === 'automod') {
    const subcommand = options.getSubcommand();
    if (subcommand === 'enable') {
      settings.automod.enabled = true;
      saveData();
      await interaction.reply({ content: 'AutoMod is on. It removes invite links, web links, excessive caps, and rapid spam. Members with Manage Messages are exempt.', ephemeral: true });
    } else if (subcommand === 'disable') {
      settings.automod.enabled = false;
      saveData();
      await interaction.reply({ content: 'AutoMod is off for this server.', ephemeral: true });
    } else if (subcommand === 'status') {
      await interaction.reply({ content: 'AutoMod is **' + (settings.automod.enabled ? 'on' : 'off') + '**. Rules: invites, links, caps, spam.', ephemeral: true });
    } else {
      const text = options.getString('text', true);
      const violation = findViolation(text, settings.automod);
      await interaction.reply({
        content: violation ? 'This text would be removed for **' + violation + '**.' : 'This text would pass the content rules.',
        ephemeral: true
      });
    }
    return;
  }
  if (commandName === 'ticket') {
    const channel = options.getChannel('channel', true);
    const panel = new EmbedBuilder().setColor(0x8b6bfa).setTitle('Need help?')
      .setDescription('Press the button below to open a private support ticket.');
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket:create').setLabel('Create a ticket').setStyle(ButtonStyle.Primary)
    );
    await channel.send({ embeds: [panel], components: [row] });
    await interaction.reply({ content: 'Ticket panel posted in ' + channel.toString() + '.', ephemeral: true });
    return;
  }
  if (commandName === 'giveaway') {
    if (options.getSubcommand() === 'start') {
      const minutes = options.getInteger('duration', true);
      const prize = options.getString('prize', true);
      const winnerCount = options.getInteger('winners') ?? 1;
      const giveaway = { prize, winnerCount, endsAt: Date.now() + minutes * 60000, entries: [], channelId: interaction.channelId };
      const message = await interaction.channel.send({ embeds: [giveawayEmbed(giveaway)] });
      giveaway.messageId = message.id;
      settings.giveaways[message.id] = giveaway;
      await message.edit({ components: giveawayButtons(message.id) });
      saveData();
      scheduleGiveaway(guild.id, message.id);
      await interaction.reply({ content: 'Giveaway started. Message ID: ' + message.id, ephemeral: true });
    } else {
      const messageId = options.getString('message_id', true);
      if (!settings.giveaways[messageId]) {
        await interaction.reply({ content: 'I could not find an active giveaway with that message ID.', ephemeral: true });
        return;
      }
      await interaction.reply({ content: 'Ending the giveaway now.', ephemeral: true });
      await finishGiveaway(guild.id, messageId);
    }
    return;
  }
  if (commandName === 'game') {
    if (options.getSubcommand() === 'rps') {
      const moves = ['rock', 'paper', 'scissors'];
      const player = options.getString('choice', true);
      const bot = moves[Math.floor(Math.random() * moves.length)];
      const playerWins = (player === 'rock' && bot === 'scissors') ||
        (player === 'paper' && bot === 'rock') || (player === 'scissors' && bot === 'paper');
      const result = player === bot ? 'It is a tie!' : playerWins ? 'You win!' : 'Cody wins!';
      await interaction.reply('You chose **' + player + '**. Cody chose **' + bot + '**. ' + result);
    } else {
      const questionIndex = Math.floor(Math.random() * trivia.length);
      const question = trivia[questionIndex];
      const row = new ActionRowBuilder().addComponents(question.options.map((answer, choiceIndex) =>
        new ButtonBuilder()
          .setCustomId('trivia:' + user.id + ':' + questionIndex + ':' + choiceIndex)
          .setLabel(answer)
          .setStyle(ButtonStyle.Secondary)
      ));
      await interaction.reply({ content: '🧠 **Trivia:** ' + question.prompt, components: [row], ephemeral: true });
    }
  }
}

async function handleButton(interaction) {
  const parts = interaction.customId.split(':');
  if (parts[0] === 'ticket' && parts[1] === 'create') {
    const settings = guildData(interaction.guildId);
    const existingId = settings.tickets[interaction.user.id];
    if (existingId && await interaction.guild.channels.fetch(existingId).catch(() => null)) {
      await interaction.reply({ content: 'You already have an open ticket: <#' + existingId + '>.', ephemeral: true });
      return;
    }
    const safeName = interaction.user.username.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 70) || 'member';
    const channel = await interaction.guild.channels.create({
      name: 'ticket-' + safeName,
      type: ChannelType.GuildText,
      topic: 'cody-ticket:' + interaction.user.id,
      permissionOverwrites: [
        { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
        { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] }
      ]
    });
    settings.tickets[interaction.user.id] = channel.id;
    saveData();
    const closeButton = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket:close:' + channel.id).setLabel('Close ticket').setStyle(ButtonStyle.Danger)
    );
    await channel.send({
      content: '<@' + interaction.user.id + '> Thanks for opening a ticket. Describe what you need help with.',
      components: [closeButton],
      allowedMentions: { users: [interaction.user.id] }
    });
    await interaction.reply({ content: 'Your private ticket is ready: ' + channel.toString(), ephemeral: true });
    return;
  }
  if (parts[0] === 'ticket' && parts[1] === 'close') {
    const channel = interaction.channel;
    const ownerId = channel?.topic?.startsWith('cody-ticket:')
      ? channel.topic.slice('cody-ticket:'.length)
      : null;
    if (ownerId !== interaction.user.id && !isModerator(interaction.member)) {
      await interaction.reply({ content: 'Only the ticket owner or a moderator can close this ticket.', ephemeral: true });
      return;
    }
    if (ownerId) delete guildData(interaction.guildId).tickets[ownerId];
    saveData();
    await interaction.reply({ content: 'Closing this ticket…', ephemeral: true });
    await channel.delete('Ticket closed by ' + interaction.user.tag);
    return;
  }
  if (parts[0] === 'giveaway' && parts[1] === 'join') {
    const messageId = parts[2];
    const giveaway = guildData(interaction.guildId).giveaways[messageId];
    if (!giveaway || giveaway.endsAt <= Date.now()) {
      await interaction.reply({ content: 'This giveaway has ended.', ephemeral: true });
      return;
    }
    if (giveaway.entries.includes(interaction.user.id)) {
      await interaction.reply({ content: 'You are already entered.', ephemeral: true });
      return;
    }
    giveaway.entries.push(interaction.user.id);
    saveData();
    await interaction.update({ embeds: [giveawayEmbed(giveaway)], components: giveawayButtons(messageId) });
    return;
  }
  if (parts[0] === 'trivia') {
    const [, playerId, questionValue, answerValue] = parts;
    if (playerId !== interaction.user.id) {
      await interaction.reply({ content: 'Start your own round with /game trivia.', ephemeral: true });
      return;
    }
    const question = trivia[Number(questionValue)];
    const answer = Number(answerValue);
    if (!question || !Number.isInteger(answer)) {
      await interaction.reply({ content: 'That trivia round is no longer valid.', ephemeral: true });
      return;
    }
    await interaction.update({
      content: answer === question.answer ? '✅ Correct!' : '❌ Not quite. The answer was **' + question.options[question.answer] + '**.',
      components: []
    });
  }
}

function scheduleGiveaway(guildId, messageId) {
  const giveaway = data.guilds[guildId]?.giveaways?.[messageId];
  if (!giveaway) return;
  const delay = Math.max(0, giveaway.endsAt - Date.now());
  setTimeout(() => finishGiveaway(guildId, messageId).catch(error => console.error('Giveaway could not finish:', error)), delay);
}

function scheduleSavedGiveaways() {
  for (const [guildId, settings] of Object.entries(data.guilds ?? {})) {
    for (const messageId of Object.keys(settings.giveaways ?? {})) scheduleGiveaway(guildId, messageId);
  }
}

async function finishGiveaway(guildId, messageId) {
  const key = guildId + ':' + messageId;
  if (finishingGiveaways.has(key)) return;
  const settings = data.guilds[guildId];
  const giveaway = settings?.giveaways?.[messageId];
  if (!giveaway) return;
  finishingGiveaways.add(key);
  try {
    const pool = [...giveaway.entries];
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const winners = pool.slice(0, giveaway.winnerCount);
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    const channel = guild ? await guild.channels.fetch(giveaway.channelId).catch(() => null) : null;
    const message = channel?.isTextBased() ? await channel.messages.fetch(messageId).catch(() => null) : null;
    if (message) {
      await message.edit({ embeds: [giveawayEmbed(giveaway, true, winners)], components: [] });
      if (winners.length) {
        await channel.send({
          content: '🎉 Congratulations ' + winners.map(id => '<@' + id + '>').join(', ') + '! You won **' + giveaway.prize + '**.',
          allowedMentions: { users: winners }
        });
      } else {
        await channel.send('The giveaway for **' + giveaway.prize + '** ended without entries.');
      }
    }
    delete settings.giveaways[messageId];
    saveData();
  } finally {
    finishingGiveaways.delete(key);
  }
}

const trivia = [
  { prompt: 'Which planet is known as the Red Planet?', options: ['Venus', 'Mars', 'Jupiter'], answer: 1 },
  { prompt: 'How many sides does a hexagon have?', options: ['Five', 'Six', 'Eight'], answer: 1 },
  { prompt: 'Which ocean is the largest?', options: ['Atlantic', 'Indian', 'Pacific'], answer: 2 },
  { prompt: 'What is the chemical symbol for gold?', options: ['Ag', 'Au', 'Gd'], answer: 1 }
];

client.on(Events.Error, error => console.error('Discord client error:', error));
process.on('unhandledRejection', error => console.error('Unhandled promise rejection:', error));
client.login(token).catch(error => {
  console.error('Discord login failed:', error.message);
  process.exitCode = 1;
});
