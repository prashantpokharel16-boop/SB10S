import 'dotenv/config';
import { REST, Routes, SlashCommandBuilder, ChannelType, PermissionFlagsBits } from 'discord.js';

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;
if (!DISCORD_TOKEN || !CLIENT_ID) {
  console.error('Set DISCORD_TOKEN and CLIENT_ID as private Hoody environment variables.');
  process.exit(1);
}

const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Check whether Cody is responding.'),
  new SlashCommandBuilder().setName('help').setDescription('Show Cody’s commands.'),
  new SlashCommandBuilder().setName('about').setDescription('About Cody.'),
  new SlashCommandBuilder().setName('setup').setDescription('Show the server setup guide.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('config').setDescription('Show Cody settings for this server.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('hosting').setDescription('Show Hoody hosting and 24/7 setup guidance.'),
  new SlashCommandBuilder().setName('welcome').setDescription('Configure welcome messages.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub => sub.setName('set').setDescription('Choose a welcome channel.')
      .addChannelOption(option => option.setName('channel').setDescription('Text channel for welcomes.')
        .addChannelTypes(ChannelType.GuildText).setRequired(true)))
    .addSubcommand(sub => sub.setName('preview').setDescription('Preview the welcome message.'))
    .addSubcommand(sub => sub.setName('disable').setDescription('Turn welcome messages off.')),
  new SlashCommandBuilder().setName('level').setDescription('Show your or another member’s level.')
    .addUserOption(option => option.setName('user').setDescription('Member to look up.')),
  new SlashCommandBuilder().setName('leaderboard').setDescription('Show the server XP leaderboard.'),
  new SlashCommandBuilder().setName('automod').setDescription('Configure automatic message moderation.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub => sub.setName('enable').setDescription('Enable invite, link, caps, and spam filtering.'))
    .addSubcommand(sub => sub.setName('disable').setDescription('Disable automatic filtering.'))
    .addSubcommand(sub => sub.setName('status').setDescription('Show AutoMod status.'))
    .addSubcommand(sub => sub.setName('check').setDescription('Check text against content rules.')
      .addStringOption(option => option.setName('text').setDescription('Text to check.').setMaxLength(500).setRequired(true))),
  new SlashCommandBuilder().setName('ticket').setDescription('Post a private support ticket panel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(option => option.setName('channel').setDescription('Channel for the panel.')
      .addChannelTypes(ChannelType.GuildText).setRequired(true)),
  new SlashCommandBuilder().setName('giveaway').setDescription('Start or end a giveaway.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub => sub.setName('start').setDescription('Start a giveaway in this channel.')
      .addIntegerOption(option => option.setName('duration').setDescription('Duration in minutes.')
        .setMinValue(1).setMaxValue(10080).setRequired(true))
      .addStringOption(option => option.setName('prize').setDescription('What is the prize?')
        .setMaxLength(100).setRequired(true))
      .addIntegerOption(option => option.setName('winners').setDescription('Number of winners.')
        .setMinValue(1).setMaxValue(10)))
    .addSubcommand(sub => sub.setName('end').setDescription('End a giveaway early.')
      .addStringOption(option => option.setName('message_id').setDescription('Giveaway message ID.').setRequired(true))),
  new SlashCommandBuilder().setName('game').setDescription('Play a quick mini-game.')
    .addSubcommand(sub => sub.setName('rps').setDescription('Play rock, paper, scissors.')
      .addStringOption(option => option.setName('choice').setDescription('Choose your move.')
        .setRequired(true).addChoices(
          { name: 'Rock', value: 'rock' },
          { name: 'Paper', value: 'paper' },
          { name: 'Scissors', value: 'scissors' }
        )))
    .addSubcommand(sub => sub.setName('trivia').setDescription('Answer a quick trivia question.'))
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
const route = GUILD_ID
  ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)
  : Routes.applicationCommands(CLIENT_ID);

try {
  await rest.put(route, { body: commands });
  console.log('Registered ' + commands.length + ' slash commands ' + (GUILD_ID ? 'to the test server.' : 'globally.'));
} catch (error) {
  console.error('Command registration failed:', error.message);
  process.exitCode = 1;
}
