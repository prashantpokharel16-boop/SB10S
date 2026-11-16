# Cody Discord Bot

Cody includes welcome messages, XP levels and a leaderboard, configurable AutoMod, private support tickets, giveaways, and mini-games.

## Commands

- Setup/config: /setup, /config
- Welcome: /welcome set, /welcome preview, /welcome disable
- Levels: /level, /leaderboard
- AutoMod: /automod enable, /automod disable, /automod status, /automod check
- Tickets: /ticket with a text channel option
- Giveaways: /giveaway start, /giveaway end
- Mini-games: /game rps, /game trivia
- Hosting and info: /hosting, /help, /ping, /about

Setup commands require Manage Server. AutoMod starts off and an admin must enable it. It removes invite links, web links, excessive caps, and rapid spam. Members with Manage Messages are exempt. XP is awarded once per member per minute. Server data is saved to data.json, which is excluded from Git.

## Hoody settings

- Install command: npm install
- Start command: npm start
- Register slash commands: npm run commands:register
- Set DISCORD_TOKEN and CLIENT_ID as private environment variables. Set GUILD_ID for a test server to make slash commands appear quickly; leave it blank for global registration.

## Keep Cody online on Hoody

Run Cody as a Hoody Daemon program with `npm start` as the foreground command, `boot` enabled, and `autorestart` set to `true`. Add `DISCORD_TOKEN` in the daemon's private environment settings. Do not use `nohup` or a command that backgrounds the Node process; the daemon must supervise the foreground process. After registering the daemon, enable and start it, then check its status and logs in Hoody.

Cody needs the Guild Members and Message Content privileged intents for welcome messages, leveling, and AutoMod. Enable them in the Discord Developer Portal. For tickets and AutoMod, invite Cody with View Channels, Send Messages, Embed Links, Read Message History, Manage Channels, and Manage Messages. Do not grant Administrator.

Never commit .env or a Discord token.
