require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  ThreadAutoArchiveDuration,
} = require('discord.js');
const https = require('https');
const fs    = require('fs');

const DISCORD_TOKEN      = process.env.DISCORD_TOKEN;
const NBA_CHANNEL_ID     = process.env.NBA_CHANNEL_ID;
const SCORES_ROLE_ID     = process.env.SCORES_ROLE_ID;

const POLL_INTERVAL      = 60_000;      // How often the bot checks for game events (60s)
const UPDATE_INTERVAL    = 60_000;  // How often score updates post in threads (5 min)
const THREAD_CLOSE_DELAY = 30_000;      // Delay before thread closes after game ends (30s)
const STATE_FILE         = './games.json'; // Remembers active games if the bot restarts

if (!DISCORD_TOKEN)  { console.error('❌ Missing DISCORD_TOKEN in .env');  process.exit(1); }
if (!NBA_CHANNEL_ID) { console.error('❌ Missing NBA_CHANNEL_ID in .env'); process.exit(1); }

let games = new Map();

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      games = new Map(
        Object.entries(JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')))
      );
      console.log(`[State] Resumed ${games.size} active game(s) from disk.`);
    }
  } catch (e) {
    console.error('[State] Could not load saved state:', e.message);
  }
}

function saveState() {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(Object.fromEntries(games), null, 2));
  } catch (e) {
    console.error('[State] Could not save state:', e.message);
  }
}

function fetchScoreboard() {
  return new Promise((resolve, reject) => {
    https.get(
      'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard',
      (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try   { resolve(JSON.parse(body).events ?? []); }
          catch (e) { reject(new Error('Failed to parse ESPN response: ' + e.message)); }
        });
      }
    ).on('error', reject);
  });
}

function parseGame(ev) {
  const comp  = ev.competitions[0];
  const away  = comp.competitors.find(c => c.homeAway === 'away');
  const home  = comp.competitors.find(c => c.homeAway === 'home');
  const p     = ev.status.period;

  return {
    id:          ev.id,
    state:       ev.status.type.state,   // 'pre' | 'in' | 'post'
    awayName:    away.team.displayName,
    homeName:    home.team.displayName,
    awayScore:   away.score  ?? '0',
    homeScore:   home.score  ?? '0',
    periodLabel: p <= 4 ? `Q${p}` : `OT${p - 4}`,
    clock:       ev.status.displayClock,
    title:       `${away.team.displayName} vs ${home.team.displayName}`,
  };
}

async function getThread(channel, threadId) {
  try   { return await channel.threads.fetch(threadId); }
  catch { return null; }
}

async function handleGameStart(channel, g) {
  console.log(`[+] Game starting: ${g.title}`);

  const roleTag = SCORES_ROLE_ID ? `<@&${SCORES_ROLE_ID}>` : '`@scores`';

  const startMsg = await channel.send(
    `**${g.title}** is starting! ${roleTag}`
  );

  const thread = await startMsg.startThread({
    name: g.title,
    autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
  });

  await thread.send(
    `**${g.title}** — Live Game Thread!\n` +
    `Scores update here every 5 minutes!`
  );

  games.set(g.id, {
    threadId:       thread.id,
    lastUpdateTime: 0,
    title:          g.title,
  });
  saveState();
}

async function handleScoreUpdate(channel, g) {
  const data = games.get(g.id);
  if (!data) return;

  // Not 5 minutes yet — skip
  if (Date.now() - data.lastUpdateTime < UPDATE_INTERVAL) return;

  const thread = await getThread(channel, data.threadId);
  if (!thread) return;

  await thread.send(
    `**Score Update** | ${g.periodLabel} · ${g.clock}\n` +
    `${g.awayName}: **${g.awayScore}** — ${g.homeName}: **${g.homeScore}**`
  );

  data.lastUpdateTime = Date.now();
  saveState();
}

async function handleGameEnd(channel, g) {
  const data = games.get(g.id);
  if (!data) return;
  console.log(`[✓] Game ended: ${g.title}`);

  const finalText =
    `The game has ended! These are the final scores:\n` +
    `**${g.awayName}: ${g.awayScore} — ${g.homeName}: ${g.homeScore}**`;

  // Post in thread
  const thread = await getThread(channel, data.threadId);
  if (thread) await thread.send(finalText);

  // Post in channel
  const channelMsg = await channel.send(finalText);

  // Pin the channel message
  try {
    await channelMsg.pin();
  } catch {
    console.warn('[!] Could not pin the final score message. Does the bot have Manage Messages?');
  }

  games.delete(g.id);
  saveState();

  if (thread) {
    setTimeout(async () => {
      try {
        await thread.setLocked(true);
        await thread.setArchived(true);
        console.log(`[~] Thread closed: ${g.title}`);
      } catch (e) {
        console.error('[!] Failed to close thread:', e.message);
      }
    }, THREAD_CLOSE_DELAY);
  }
}

async function tick() {
  const channel = client.channels.cache.get(NBA_CHANNEL_ID);
  if (!channel) {
    console.error('[!] NBA channel not found. Double-check NBA_CHANNEL_ID in .env');
    return;
  }

  let events;
  try   { events = await fetchScoreboard(); }
  catch (e) { console.error('[!] ESPN fetch failed:', e.message); return; }

  for (const ev of events) {
    const g       = parseGame(ev);
    const tracked = games.has(g.id);

    if      (g.state === 'in'   && !tracked) await handleGameStart(channel, g);
    else if (g.state === 'in'   &&  tracked) await handleScoreUpdate(channel, g);
    else if (g.state === 'post' &&  tracked) await handleGameEnd(channel, g);
    // 'pre' state (game not started) is intentionally ignored
  }
}

//  BOT INIT
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

client.once('ready', async () => {
  console.log(`\n👑 LeBotJames is LIVE — logged in as ${client.user.tag}`);
  console.log(`   Watching channel ID: ${NBA_CHANNEL_ID}`);
  console.log(`   Polling every ${POLL_INTERVAL / 1000}s | Thread updates every ${UPDATE_INTERVAL / 1000 / 60} min\n`);
  loadState();
  await tick();                          // Run immediately on startup
  setInterval(tick, POLL_INTERVAL);     // Then every 60 seconds
});

client.on('error', err => console.error('[Discord Error]', err));

const http = require('http');
http.createServer((req, res) => res.end('LeBotJames is alive')).listen(3000);

client.login(DISCORD_TOKEN);
