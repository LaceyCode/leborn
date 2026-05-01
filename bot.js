require('dotenv').config();

const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMembers]
});

const CHANNEL_ID = '1499649774192689242';
const WELCOME_ID = '1499680849363206224';
const ROLE_ID = '1499671850525917184';
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

async function fetchNBAScores() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  const res = await fetch('https://api.balldontlie.io/v1/games?dates[]=' + today, {
    headers: { 'Authorization': process.env.API_KEY }
  });
  const data = await res.json();
  return data.data || [];
}

function formatScores(games) {
  if (!games.length) return 'No games today!';
  return games.map(function(g) {
    return g.home_team.abbreviation + ' ' + g.home_team_score + ' - ' + g.visitor_team_score + ' ' + g.visitor_team.abbreviation + ' (' + g.status + ')';
  }).join('\n');
}

async function postScores() {
  const channel = await client.channels.fetch(CHANNEL_ID);
  const games = await fetchNBAScores();
  if (!games.length) return;
  const liveGames = games.filter(function(g) { return g.status !== 'Final' && g.period > 0; });
  if (liveGames.length === 0) {
    channel.send(formatScores(games));
  } else {
    channel.send('<@&' + ROLE_ID + '>\n' + formatScores(games));
  }
}

client.on('guildMemberAdd', function(member) {
  const channel = client.channels.cache.get(WELCOME_ID);
  channel.send('thanks for joining the leborn club, <@' + member.id + '>. please read the rules');
});

client.on('guildMemberRemove', function(member) {
  const channel = client.channels.cache.get(WELCOME_ID);
  channel.send('<@' + member.id + '> left the leborn club');
});

client.once('ready', function() {
  console.log('Logged in as ' + client.user.tag);
  postScores();
  setInterval(postScores, CHECK_INTERVAL_MS);
});

const http = require('http');
http.createServer(function(req, res) {
  res.write('bot is alive');
  res.end();
}).listen(3000);

client.login(process.env.BOT_TOKEN);
