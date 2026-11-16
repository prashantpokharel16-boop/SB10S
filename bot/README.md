# Hoody VM bot
A starter Discord bot with `/ping`, `/help`, and `/about` slash commands.
## Requirements
- Node.js 20 or newer
- A Discord application and bot token from the Discord Developer Portal
## Setup
1. In this folder, copy `.env.example` to `.env`.
2. Put your bot token and application ID in `.env`. Set `GUILD_ID` to your test server ID for quick command updates.
3. Run `npm install`.
4. Run `npm run commands:register`.
5. Run `npm start`.
On Hoody, set the install command to `npm install`, start command to `npm start`, and add `DISCORD_TOKEN` and `CLIENT_ID` as private environment variables. Set `GUILD_ID` if you want test-server commands.
Invite the bot with the `bot` and `applications.commands` scopes. It only uses the `Guilds` intent and does not read message content. Never commit `.env` or share your token.
