import 'dotenv/config';
import { REST, Routes, SlashCommandBuilder } from 'discord.js';
const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;
if (!DISCORD_TOKEN || !CLIENT_ID) {
  console.error('Set DISCORD_TOKEN and CLIENT_ID in bot/.env');
  process.exit(1);
}
const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Check whether Hoody VM is responding.'),
  new SlashCommandBuilder().setName('help').setDescription('Show the available bot commands.'),
  new SlashCommandBuilder().setName('about').setDescription('About the Hoody VM bot.')
].map(command => command.toJSON());
const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
const route = GUILD_ID
  ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)
  : Routes.applicationCommands(CLIENT_ID);
try {
  await rest.put(route, { body: commands });
  console.log(`Registered ${commands.length} slash commands${GUILD_ID ? ' to test server' : ' globally'}.`);
} catch (error) {
  console.error('Command registration failed:', error.message);
  process.exitCode = 1;
}
