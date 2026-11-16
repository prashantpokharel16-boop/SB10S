import 'dotenv/config';
import { Client, Events, GatewayIntentBits, EmbedBuilder } from 'discord.js';
const token = process.env.DISCORD_TOKEN;
if (!token) { console.error('Missing DISCORD_TOKEN. Set it in bot/.env.'); process.exit(1); }
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const commands = {
  ping: async interaction => interaction.reply(`Pong! Discord latency: **${Math.round(client.ws.ping)}ms**`),
  help: async interaction => interaction.reply({ content: '**Hoody VM commands**\n`/ping` — check response time\n`/help` — show this list\n`/about` — about this bot', ephemeral: true }),
  about: async interaction => interaction.reply({ embeds: [new EmbedBuilder().setColor(0x8b6bfa).setTitle('Hoody VM').setDescription('A starter Discord bot for the Hoody VM hosting project.').addFields({ name: 'Servers', value: String(client.guilds.cache.size), inline: true }, { name: 'Library', value: 'discord.js', inline: true })], ephemeral: true })
};
client.once(Events.ClientReady, readyClient => console.log(`Online as ${readyClient.user.tag}`));
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const command = commands[interaction.commandName];
  if (!command) return;
  try { await command(interaction); }
  catch (error) {
    console.error(`/${interaction.commandName} failed:`, error);
    const reply = { content: 'Something went wrong. Please try again.', ephemeral: true };
    if (interaction.replied || interaction.deferred) await interaction.followUp(reply).catch(() => {});
    else await interaction.reply(reply).catch(() => {});
  }
});
client.on(Events.Error, error => console.error('Discord client error:', error));
client.login(token).catch(error => { console.error('Login failed; check DISCORD_TOKEN:', error.message); process.exitCode = 1; });
