/**
 * LeBotJames — Manual Test Script
 *
 * Since the NBA season is over, run this to simulate a full game cycle
 * in your actual Discord channel WITHOUT needing a live game.
 *
 * Usage:
 *   node test.js
 *
 * It will:
 *   1. Post a game-start announcement + create a thread  (immediately)
 *   2. Post a score update in the thread                 (10 seconds later)
 *   3. Post final scores + pin + close thread            (20 seconds later)
 */

require('dotenv').config();
const { Client, GatewayIntentBits, ThreadAutoArchiveDuration } = require('discord.js');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

const FAKE_GAME = {
  awayName:  'Los Angeles Lakers',
  homeName:  'Boston Celtics',
  title:     'Los Angeles Lakers vs Boston Celtics',
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

client.once('ready', async () => {
  console.log(`\n👑 Test mode — logged in as ${client.user.tag}`);

  const channel = client.channels.cache.get(process.env.NBA_CHANNEL_ID);
  if (!channel) {
    console.error('❌ Channel not found. Check NBA_CHANNEL_ID in .env');
    process.exit(1);
  }

  const roleTag = process.env.SCORES_ROLE_ID
    ? `<@&${process.env.SCORES_ROLE_ID}>`
    : '`@scores`';

  // ── Step 1: Game start ──────────────────────────────────────────
  console.log('[1/3] Posting game start...');
  const startMsg = await channel.send(
    `**${FAKE_GAME.title}** is starting! ${roleTag}`
  );

  const thread = await startMsg.startThread({
    name: FAKE_GAME.title,
    autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
  });

  await thread.send(
    `**${FAKE_GAME.title}** — Live Game Thread!\n` +
    `Scores will update here every 5 minutes!`
  );
  console.log('    ✅ Announcement posted, thread created.');

  // ── Step 2: Score update (10s later) ───────────────────────────
  await sleep(10_000);
  console.log('[2/3] Posting score update...');
  await thread.send(
    `**Score Update** | Q3 · 4:22\n` +
    `${FAKE_GAME.awayName}: **87** — ${FAKE_GAME.homeName}: **91**`
  );
  console.log('    ✅ Score update posted.');

  // ── Step 3: Game end (20s after that) ──────────────────────────
  await sleep(10_000);
  console.log('[3/3] Posting final scores...');

  const finalText =
    `🏁 The game has ended! These are the final scores:\n` +
    `**${FAKE_GAME.awayName}: 112 — ${FAKE_GAME.homeName}: 108**`;

  await thread.send(finalText);

  const channelMsg = await channel.send(finalText);
  try {
    await channelMsg.pin();
    console.log('    ✅ Final score posted and pinned.');
  } catch {
    console.warn('    ⚠️  Could not pin (missing Manage Messages permission).');
  }

  // Close thread after 30s
  console.log('    Closing thread in 30 seconds...');
  await sleep(30_000);
  await thread.setLocked(true);
  await thread.setArchived(true);
  console.log('    ✅ Thread closed.\n');
  console.log('✅ Test complete! Check your Discord channel.');
  process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
