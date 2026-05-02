require('dotenv').config();

const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMembers]
});

const CHANNEL_ID = '1499649774192689242';
const WELCOME_ID = '1499680849363206224';
const ROLE_ID = '1499671850525917184';
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

async function fetchGamesForDate(dateStr) {
  const res = await fetch('https://api.balldontlie.io/v1/games?dates[]=' + dateStr, {
    headers: { 'Authorization': process.env.API_KEY }
  });
  const data = await res.json();
  return data.data || [];
}

async function fetchNBAScores() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');

  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = yesterdayDate.getFullYear() + '-' + String(yesterdayDate.getMonth() + 1).padStart(2, '0') + '-' + String(yesterdayDate.getDate()).padStart(2, '0');

  const todayGames = await fetchGamesForDate(today);
  const yesterdayGames = await fetchGamesForDate(yesterday);

  const lateGames = yesterdayGames.filter(function(g) { return g.status !== 'Final'; });

  return lateGames.concat(todayGames);
}

function formatScores(games) {
  if (!games.length) return 'No games today!';
  const divider = '\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015';
  const lines = games.map(function(g) {
    return divider + '\n' + g.home_team.full_name + ' ' + g.home_team_score + ' - ' + g.visitor_team_score + ' ' + g.visitor_team.full_name + ' (' + g.status + ')';
  });
  return lines.join('\n') + '\n' + divider;
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
