#!/usr/bin/env node
/**
 * bind_steam_ids.js — Bind Steam App IDs to existing Firestore game items.
 *
 * Reads a Firebase access token from ~/.config/configstore/firebase-tools.json,
 * then PATCHes each matched item in Firestore to add steam_app_id.
 *
 * Usage:
 *   node tools/bind_steam_ids/bind_steam_ids.js            # live run
 *   node tools/bind_steam_ids/bind_steam_ids.js --dry-run  # preview only, no writes
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// ── Config ──────────────────────────────────────────────────────────────────

const PROJECT_ID = 'game-data-dashboard';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const DRY_RUN = process.argv.includes('--dry-run');

// ── Token ───────────────────────────────────────────────────────────────────

function loadAccessToken() {
  const configPath = path.join(
    process.env.USERPROFILE || process.env.HOME,
    '.config', 'configstore', 'firebase-tools.json'
  );
  const raw = fs.readFileSync(configPath, 'utf8');
  const cfg = JSON.parse(raw);
  if (!cfg.tokens || !cfg.tokens.access_token) {
    throw new Error('No access_token found in firebase-tools.json');
  }
  return cfg.tokens.access_token;
}

// ── HTTP helpers ────────────────────────────────────────────────────────────

function httpsRequest(url, options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ status: res.statusCode, body: data });
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ── Firestore REST helpers ──────────────────────────────────────────────────

async function patchSteamAppId(fbId, steamAppId, accessToken) {
  const url =
    `${FIRESTORE_BASE}/items/${fbId}?updateMask.fieldPaths=steam_app_id`;

  const body = JSON.stringify({
    fields: {
      steam_app_id: { integerValue: String(steamAppId) },
    },
  });

  return httpsRequest(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  }, body);
}

// ── Bindings ────────────────────────────────────────────────────────────────
//
// Each entry: [fb_id, chinese_name, steam_app_id, english_name]
//
// Mapped by comparing Chinese names against the unmatched Steam game list
// using known game-name translations.

const BINDINGS = [
  // ── Classic / Indie ───────────────────────────────────────────────────────
  ['2odfQ9X9Ohfm7IrxUrpY', '半条命2',                      220,    'Half-Life 2'],
  ['MiFLWNPK2xIdczHApSjU', '传送门2',                      620,    'Portal 2'],
  ['5TwdFPvlcuuZj7aSpBtW', '祖玛豪华版',                   3330,   'Zuma Deluxe'],
  ['2bN1bFvefs1yEUzpbWaK', '植物大战僵尸 年度版',          3590,   'Plants vs. Zombies: Game of the Year'],
  ['iX8FOUyk0beLu3kWXhHL', '出击飞龙',                     235210, 'Strider'],
  ['glXLNiaEUfmZrho6Gn9g', '多边形造桥',                   367450, 'Poly Bridge'],
  ['FIxUPRFs5Y9WFE3GfHkl', '黑山',                         362890, 'Black Mesa'],
  ['jRMsOEf0cvBpAKEDbTcZ', '脑航员2',                      607080, 'Psychonauts 2'],
  ['DkM1u3J3NbYhcurwl00M', '心跳文学部',                   698780, 'Doki Doki Literature Club'],
  ['eQLOMYMIjWQi9AdD95gU', '不要喂食猴子',                 658850, 'Do Not Feed the Monkeys'],
  ['FJUf4aSXIzsOViTSYZkA', '安抚',                         967050, 'Pacify'],
  ['5oSoIJum17qPCWcNN8xx', '暴雨',                         960910, 'Heavy Rain'],
  ['VwtRlDACsguVAjOxegir', '真人快打 11',                  976310, 'Mortal Kombat 11'],

  // ── Simulation / Strategy ─────────────────────────────────────────────────
  ['OqVO4tYVBqDwZf5IgbOx', '监狱建筑师',                   233450, 'Prison Architect'],
  ['OClYDZ0eT5psUxvOoxP6', '欧陆风云4',                    236850, 'Europa Universalis IV'],
  ['kCiWyq76YvpwZmnDGqTA', '王国保卫战',                   246420, 'Kingdom Rush'],
  ['ZpOYuVnN2VCRa1Xy4f1M', '城市：天际线',                 255710, 'Cities: Skylines'],
  ['4NT2wZQO54PTY8mn57zI', '钢铁雄心4',                    394360, 'Hearts of Iron IV'],
  ['O88Pm5JIUJrFttFHCYk9', '冰汽时代',                     323190, 'Frostpunk'],
  ['3S29RFN0HjAe4RT5jHvS', '极乐迪斯科',                   632470, 'Disco Elysium'],

  // ── Civilization series ───────────────────────────────────────────────────
  ['OPaTKUOLVyamb72bOpDE', '席德·梅尔的文明IV',            3900,   "Sid Meier's Civilization IV"],
  ['KnP5OHkZgzpXwhoVEr6A', '席德·梅尔的文明V',            8930,   "Sid Meier's Civilization V"],
  ['JD47F7QqMmVb1U583nZn', '席德·梅尔的文明VI',           289070, "Sid Meier's Civilization VI"],

  // ── Action / AAA ──────────────────────────────────────────────────────────
  ['Ajnci6HsZaeJTZUpKFJJ', '侠盗猎车手IV：完整版',        12210,  'Grand Theft Auto IV: The Complete Edition'],
  ['0wg3Zi7HZsOXC5Ih6udK', '鬼泣5',                        601150, 'Devil May Cry 5'],
  ['7uf2ArYT4FxhbImiEZdF', '奥日与黑暗森林：终极版',      387290, 'Ori and the Blind Forest: Definitive Edition'],
  ['JZmMYhbcuBUmKqMSCbzw', '奇异人生™',                   319630, 'Life is Strange™'],

  // ── Visual Novels ─────────────────────────────────────────────────────────
  ['BpdNyPvwgv5zmCClre1s', '命运石之门：ELITE',            412830, 'STEINS;GATE'],
  ['O7HQCeQIeG5zhNiJUY5J', '夏日口袋',                     897220, 'Summer Pockets'],
  ['5KPMBBuhyCMq35DQ9vRo', '苍之彼方的四重奏',             1044620,'Aokana - Four Rhythms Across the Blue'],

  // ── Rusty Lake series ─────────────────────────────────────────────────────
  ['4OQBCOIZJWPqNNAB5893', '锈湖：天堂岛',                 744190, 'Rusty Lake Paradise'],
  ['FYjSnXzcbN5bWMaCowA2', '锈湖：起源',                   532110, 'Rusty Lake: Roots'],

  // ── Other ─────────────────────────────────────────────────────────────────
  ['bNC2glbPbVO6HPjvJkpe', '奥威尔：注视着你',             491950, 'Orwell'],
];

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Steam App ID Binding Script ===\n');

  if (DRY_RUN) {
    console.log('[DRY RUN] No Firestore writes will be made.\n');
  }

  const accessToken = loadAccessToken();
  console.log('Firebase access token loaded.\n');

  // ── Print bindings ────────────────────────────────────────────────────────

  console.log(`Confirmed bindings: ${BINDINGS.length}\n`);
  for (let i = 0; i < BINDINGS.length; i++) {
    const [fbId, cnName, appId, enName] = BINDINGS[i];
    console.log(`  ${String(i + 1).padStart(2)}. [${appId}] ${cnName}  -->  ${enName}`);
    console.log(`      fb_id: ${fbId}`);
  }

  // ── Write to Firestore ────────────────────────────────────────────────────

  console.log('\n--- Updating Firestore ---\n');

  let successCount = 0;
  let failCount = 0;

  for (const [fbId, cnName, appId, enName] of BINDINGS) {
    const label = `${cnName}  -->  ${enName} (${appId})`;

    if (DRY_RUN) {
      console.log(`  [DRY RUN] Would bind: ${fbId} | ${label}`);
      successCount++;
      continue;
    }

    try {
      await patchSteamAppId(fbId, appId, accessToken);
      console.log(`  [OK] ${fbId} | ${label}`);
      successCount++;
    } catch (err) {
      console.error(`  [FAIL] ${fbId} | ${label}`);
      console.error(`         ${err.message}`);
      failCount++;
    }
  }

  console.log(`\n--- Results ---`);
  console.log(`Bound:   ${successCount}`);
  if (failCount > 0) console.log(`Failed:  ${failCount}`);

  // ── Unmatched Steam games (no existing item in library) ────────────────────

  const UNMATCHED_STEAM = [
    [320,    'Half-Life 2: Deathmatch'],
    [360,    'Half-Life Deathmatch: Source'],
    [22380,  'Fallout: New Vegas'],
    [34440,  "Sid Meier's Civilization IV (duplicate of 3900)"],
    [49520,  'Borderlands 2'],
    [110800, 'L.A. Noire'],
    [220200, 'Kerbal Space Program'],
    [261570, 'Ori and the Blind Forest (original; not Definitive Ed.)'],
    [271590, 'Grand Theft Auto V Legacy'],
    [282800, '100% Orange Juice'],
    [435120, 'Rusty Lake Hotel'],
    [458710, 'Kingdom Rush Frontiers'],
    [557600, 'Gorogoa'],
    [718670, 'Cultist Simulator'],
    [960990, 'Beyond: Two Souls'],
    [1030840,'Mafia: Definitive Edition'],
    [1071870,'Biped'],
  ];

  console.log(`\nUnmatched Steam games (no existing item): ${UNMATCHED_STEAM.length}`);
  for (const [id, name] of UNMATCHED_STEAM) {
    console.log(`  [${id}] ${name}`);
  }

  // ── Existing items still without steam_app_id ─────────────────────────────

  const UNBOUND_ITEMS = [
    ['01EtQWgLGyjcOXYWFcXM', 'v-0074', '地铁：离去',              'Metro Exodus — not in Steam library'],
    ['4AykUaJ1Axud33lSW4Ob', 'v-0072', '群星',                     'Stellaris — not in Steam library'],
    ['8693yRl90daCpgpuIw1Y', 'v-0052', '纪念碑谷',                 'Monument Valley — mobile only, no Steam'],
    ['90Cr2JHE7Eop1py0Tfar', 'v-0033', '泰坦陨落 2',              'Titanfall 2 — not in Steam library'],
    ['JeAMVnFx1YSBdOZLuRhB', 'v-0044', '极限竞速：地平线4',       'Forza Horizon 4 — Microsoft Store only'],
    ['B4476pPcOEdjHQoMCRFW', 'v-0041', '战地 V',                   'Battlefield V — EA app only'],
    ['M5xQjxrRtA1K363yKHUJ', 'v-0081', '上古卷轴V',               'Skyrim — not in Steam library (possible EA/other)'],
    ['OjXTocZigZ48CcAdYsSw', 'v-0068', '逃出生天',                 'A Way Out — not in Steam library'],
    ['O6QeQmqN0WfFhbH1sKxF', 'v-0040', '双人成行',                 'It Takes Two — not in Steam library'],
    ['Vcjuy1xp5gmFpeaRQDNt', 'v-0075', '空洞骑士：丝之歌',         'Hollow Knight: Silksong — not in Steam library'],
    ['izWNC7x6VDDQOICJtWG3', 'v-0037', '质量效应 传奇版',          'Mass Effect Legendary Ed. — not in Steam library'],
    ['P36cgSbQEsb7TQ5RcEGF', 'v-0086', '控制：终极合集',           'Control Ultimate — not in Steam library'],
    ['XX402UHfXK1PY24TNjNI', 'v-0076', '十字军之王3',              'Crusader Kings III — not in Steam library'],
    ['aOpXH9iS7kbRsRDdeUTD', 'v-0054', '双点校园',                 'Two Point Campus — not in Steam library'],
    ['HQMW7BWFSOsy87wLgK0s', 'v-0083', '恶魔轮盘',                 'Buckshot Roulette — not in Steam library'],
    ['E2eeIROvceDzReNvfFTa', 'v-0053', '轨道连结',                 'Railbound — not in Steam library'],
    ['B0J56FkohLSblEGEgLSk', 'v-0034', '帕特里克的套箱',           "Patrick's Parabox — not in Steam library"],
    ['FJjhfxD8vVUHgVrA8GHS', 'v-0038', '暗影火炬城',               'F.I.S.T. — not in Steam library'],
    ['OptkBoEpQHKt3V2IeiW9', 'v-0032', '极品飞车：热焰',           'Need for Speed Heat — EA app only'],
    ['Ztdtf6606ItJ0tOaM6Ns', 'v-0055', '拔作岛',                   'Nukitashi — not in Steam library'],
    ['L7gqb1rmJbdmfIc5B4aR', 'v-0088', '拔作岛2',                  'Nukitashi 2 — not in Steam library'],
    ['W97qxuE8EuhS8KI3KcYf', 'v-0080', '命运石之门:比翼恋理的爱人', 'STEINS;GATE: Darling — not in Steam library'],
    ['aLDmmzjarr2nGXHzFOrl', 'v-0077', '命运石之门：0',             'STEINS;GATE 0 — not in Steam library'],
    ['cpHbS2zA8RWpjd1RSeFr', 'v-0079', '命运石之门：线形拘束的表征图','STEINS;GATE: Linear Bounded Phenogram — not in Steam library'],
    ['0ABS8LsYviyrCUcoz9jz', 'v-0051', '东方快车谋杀案',            'Murder on the Orient Express — not on Steam'],
    ['kedc3obee64rJH2exHoq', 'v-0090', '架空地图模拟器',            'No Steam equivalent found'],
    ['RQfiX5t4yBvz50fvLN1n', 'v-0028', '千恋 万花 (dup)',           'Duplicate doc — see QRfiX5t4yBvz50fvLN1n'],
    ['Std28WRBv3yQvEnvgnS1', 'u-0004', '勇敢的心：世界大战',        'type: ubi, not steam'],
  ];

  console.log(`\nExisting items still without steam_app_id: ${UNBOUND_ITEMS.length}`);
  for (const [fbId, itemId, cnName, reason] of UNBOUND_ITEMS) {
    console.log(`  ${fbId} | ${itemId} | ${cnName} | ${reason}`);
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
