"""
steam_info.py — Fetch comprehensive Steam profile and library data.

Calls multiple Steam Web API endpoints to gather:
  - Player profile (name, avatar, visibility, online state, account creation)
  - Owned games (full library with playtime)
  - Recently played games (last 2 weeks)
  - Steam account level
  - Badge collection and XP
  - Friend list (requires public profile)
  - VAC / game bans

Usage:
  python tools/steam_info/steam_info.py
  python tools/steam_info/steam_info.py --steamid 76561199530798696

API key is read from STEAM_API_KEY env var, or from .env file next to this script.

Output: one CSV per endpoint under tools/steam_info/output/
"""

import csv
import json
import os
import sys
import urllib.request
import urllib.error
from datetime import datetime, timezone
from pathlib import Path

# ── Config ──────────────────────────────────────────────────────────────────

def load_env_file():
    """Load .env file next to this script if STEAM_API_KEY is not already set."""
    if os.environ.get('STEAM_API_KEY'):
        return
    env_path = Path(__file__).resolve().parent / '.env'
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, _, value = line.partition('=')
        os.environ.setdefault(key.strip(), value.strip())

load_env_file()

STEAM_API_KEY = os.environ.get('STEAM_API_KEY', '')
DEFAULT_STEAM_ID = '76561199530798696'
BASE_URL = 'https://api.steampowered.com'
OUTPUT_DIR = Path(__file__).resolve().parent / 'output'

VISIBILITY_MAP = {1: 'Private', 2: 'Friends Only', 3: 'Friends of Friends', 4: 'Public'}
PERSONA_STATE_MAP = {
    0: 'Offline', 1: 'Online', 2: 'Busy', 3: 'Away',
    4: 'Snooze', 5: 'Looking to Trade', 6: 'Looking to Play',
}

# ── CLI args ────────────────────────────────────────────────────────────────

def get_steam_id():
    args = sys.argv[1:]
    for i, arg in enumerate(args):
        if arg == '--steamid' and i + 1 < len(args):
            return args[i + 1]
    return DEFAULT_STEAM_ID

# ── HTTP helper ─────────────────────────────────────────────────────────────

def api_get(path, params):
    """Call a Steam Web API endpoint, return parsed JSON."""
    qs = '&'.join(f'{k}={v}' for k, v in params.items())
    url = f'{BASE_URL}/{path}/?{qs}'
    try:
        with urllib.request.urlopen(url, timeout=30) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        raise RuntimeError(f'HTTP {e.code}: {e.read().decode("utf-8", errors="replace")[:200]}')
    except urllib.error.URLError as e:
        raise RuntimeError(f'Connection error: {e.reason}')

# ── Steam API callers ───────────────────────────────────────────────────────

def get_player_summaries(steam_id):
    data = api_get('ISteamUser/GetPlayerSummaries/v2', {
        'key': STEAM_API_KEY, 'steamids': steam_id, 'format': 'json',
    })
    players = data.get('response', {}).get('players', [])
    return players[0] if players else None


def get_owned_games(steam_id):
    data = api_get('IPlayerService/GetOwnedGames/v1', {
        'key': STEAM_API_KEY, 'steamid': steam_id,
        'include_appinfo': '1', 'include_played_free_games': '1', 'format': 'json',
    })
    return data.get('response')


def get_recently_played(steam_id):
    data = api_get('IPlayerService/GetRecentlyPlayedGames/v0001', {
        'key': STEAM_API_KEY, 'steamid': steam_id, 'format': 'json',
    })
    return data.get('response')


def get_steam_level(steam_id):
    data = api_get('IPlayerService/GetSteamLevel/v1', {
        'key': STEAM_API_KEY, 'steamid': steam_id, 'format': 'json',
    })
    return data.get('response')


def get_badges(steam_id):
    data = api_get('IPlayerService/GetBadges/v1', {
        'key': STEAM_API_KEY, 'steamid': steam_id, 'format': 'json',
    })
    return data.get('response')


def get_friend_list(steam_id):
    data = api_get('ISteamUser/GetFriendList/v1', {
        'key': STEAM_API_KEY, 'steamid': steam_id,
        'relationship': 'friend', 'format': 'json',
    })
    return data.get('friendslist')


def get_player_bans(steam_id):
    data = api_get('ISteamUser/GetPlayerBans/v1', {
        'key': STEAM_API_KEY, 'steamids': steam_id, 'format': 'json',
    })
    players = data.get('players', [])
    return players[0] if players else None

# ── CSV writers ─────────────────────────────────────────────────────────────

def write_csv(filepath, headers, rows):
    filepath.parent.mkdir(parents=True, exist_ok=True)
    with open(filepath, 'w', newline='', encoding='utf-8-sig') as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        writer.writerows(rows)


def save_player_summary(data, out_dir):
    if not data or data.get('error'):
        print(f'    Skipped (no data)')
        return
    headers = [
        'steamid', 'personaname', 'profileurl', 'avatar', 'avatarmedium', 'avatarfull',
        'personastate', 'personastate_str', 'communityvisibilitystate', 'visibility_str',
        'profilestate', 'lastlogoff', 'timecreated', 'gameid', 'gameextrainfo',
    ]
    row = [
        data.get('steamid', ''),
        data.get('personaname', ''),
        data.get('profileurl', ''),
        data.get('avatar', ''),
        data.get('avatarmedium', ''),
        data.get('avatarfull', ''),
        data.get('personastate', ''),
        PERSONA_STATE_MAP.get(data.get('personastate'), 'Unknown'),
        data.get('communityvisibilitystate', ''),
        VISIBILITY_MAP.get(data.get('communityvisibilitystate'), 'Unknown'),
        data.get('profilestate', ''),
        datetime.fromtimestamp(data.get('lastlogoff', 0), tz=timezone.utc).strftime('%Y-%m-%d %H:%M:%S') if data.get('lastlogoff') else '',
        datetime.fromtimestamp(data.get('timecreated', 0), tz=timezone.utc).strftime('%Y-%m-%d %H:%M:%S') if data.get('timecreated') else '',
        data.get('gameid', ''),
        data.get('gameextrainfo', ''),
    ]
    write_csv(out_dir / 'player_summary.csv', headers, [row])
    print(f'    {data.get("personaname")} ({VISIBILITY_MAP.get(data.get("communityvisibilitystate"), "?")})')


def save_owned_games(data, out_dir):
    if not data or data.get('error'):
        print(f'    Skipped (no data)')
        return
    games = data.get('games', [])
    headers = [
        'appid', 'name', 'playtime_forever_min', 'playtime_forever_hours',
        'playtime_2weeks_min', 'playtime_2weeks_hours', 'img_icon_url', 'has_community_visible_stats',
    ]
    rows = []
    for g in sorted(games, key=lambda x: x.get('playtime_forever', 0), reverse=True):
        pt = g.get('playtime_forever', 0)
        pt2 = g.get('playtime_2weeks', 0)
        rows.append([
            g.get('appid', ''),
            g.get('name', ''),
            pt,
            round(pt / 60, 1),
            pt2,
            round(pt2 / 60, 1),
            g.get('img_icon_url', ''),
            g.get('has_community_visible_stats', ''),
        ])
    write_csv(out_dir / 'owned_games.csv', headers, rows)
    total_h = sum(r[3] for r in rows)
    print(f'    {len(games)} games, {total_h:.1f}h total playtime')


def save_recent_games(data, out_dir):
    if not data or data.get('error'):
        print(f'    Skipped (no data)')
        return
    games = data.get('games', [])
    headers = [
        'appid', 'name', 'playtime_2weeks_min', 'playtime_2weeks_hours',
        'playtime_forever_min', 'playtime_forever_hours', 'img_icon_url',
    ]
    rows = []
    for g in games:
        pt = g.get('playtime_forever', 0)
        pt2 = g.get('playtime_2weeks', 0)
        rows.append([
            g.get('appid', ''),
            g.get('name', ''),
            pt2,
            round(pt2 / 60, 1),
            pt,
            round(pt / 60, 1),
            g.get('img_icon_url', ''),
        ])
    write_csv(out_dir / 'recent_games.csv', headers, rows)
    print(f'    {len(games)} games in last 2 weeks')


def save_steam_level(data, out_dir):
    if not data or data.get('error'):
        print(f'    Skipped (no data)')
        return
    headers = ['player_level']
    write_csv(out_dir / 'steam_level.csv', headers, [[data.get('player_level', '')]])
    print(f'    Level {data.get("player_level", "?")}')


def save_badges(data, out_dir):
    if not data or data.get('error'):
        print(f'    Skipped (no data)')
        return
    badges = data.get('badges', [])
    headers = ['badgeid', 'level', 'xp', 'completion_time', 'appid', 'scarcity']
    rows = []
    for b in badges:
        ct = b.get('completion_time', 0)
        rows.append([
            b.get('badgeid', ''),
            b.get('level', ''),
            b.get('xp', ''),
            datetime.fromtimestamp(ct, tz=timezone.utc).strftime('%Y-%m-%d %H:%M:%S') if ct else '',
            b.get('appid', ''),
            b.get('scarcity', ''),
        ])
    write_csv(out_dir / 'badges.csv', headers, rows)
    print(f'    {len(badges)} badges, XP: {data.get("player_xp", 0)}')


def save_friends(data, out_dir):
    if not data or data.get('error'):
        print(f'    Skipped (no data)')
        return
    friends = data.get('friends', [])
    headers = ['steamid', 'relationship', 'friend_since']
    rows = []
    for f in friends:
        fs = f.get('friend_since', 0)
        rows.append([
            f.get('steamid', ''),
            f.get('relationship', ''),
            datetime.fromtimestamp(fs, tz=timezone.utc).strftime('%Y-%m-%d %H:%M:%S') if fs else '',
        ])
    write_csv(out_dir / 'friends.csv', headers, rows)
    print(f'    {len(friends)} friends')


def save_bans(data, out_dir):
    if not data or data.get('error'):
        print(f'    Skipped (no data)')
        return
    headers = [
        'steamid', 'CommunityBanned', 'VACBanned', 'NumberOfVACBans',
        'DaysSinceLastBan', 'NumberOfGameBans', 'EconomyBan',
    ]
    row = [
        data.get('SteamId', ''),
        data.get('CommunityBanned', ''),
        data.get('VACBanned', ''),
        data.get('NumberOfVACBans', ''),
        data.get('DaysSinceLastBan', ''),
        data.get('NumberOfGameBans', ''),
        data.get('EconomyBan', ''),
    ]
    write_csv(out_dir / 'bans.csv', headers, [row])
    vac = 'YES' if data.get('VACBanned') else 'No'
    print(f'    VAC: {vac}, Game Bans: {data.get("NumberOfGameBans", 0)}, Economy: {data.get("EconomyBan", "none")}')

# ── Main ────────────────────────────────────────────────────────────────────

def main():
    if not STEAM_API_KEY:
        print('Error: STEAM_API_KEY not found.', file=sys.stderr)
        print('Set it via environment variable or in tools/steam_info/.env', file=sys.stderr)
        sys.exit(1)

    steam_id = get_steam_id()
    print(f'=== Steam Info Fetcher ===')
    print(f'Steam ID: {steam_id}\n')

    endpoints = [
        ('Player Summary',       get_player_summaries,   save_player_summary),
        ('Owned Games',          get_owned_games,         save_owned_games),
        ('Recently Played',      get_recently_played,     save_recent_games),
        ('Steam Level',          get_steam_level,         save_steam_level),
        ('Badges',               get_badges,              save_badges),
        ('Friend List',          get_friend_list,         save_friends),
        ('Player Bans',          get_player_bans,         save_bans),
    ]

    results = {}
    for label, fetcher, saver in endpoints:
        print(f'  Fetching {label}...')
        try:
            data = fetcher(steam_id)
            results[label] = data
            if data:
                saver(data, OUTPUT_DIR)
            else:
                print(f'    Skipped (empty response)')
        except Exception as e:
            print(f'    FAILED — {e}')
            results[label] = {'error': str(e)}

    # ── Summary ─────────────────────────────────────────────────────────────

    print(f'\n--- Summary ---\n')

    summary = results.get('Player Summary')
    if summary and not summary.get('error'):
        print(f'  Name:          {summary.get("personaname", "?")}')
        print(f'  Profile:       {summary.get("profileurl", "?")}')
        vis = summary.get('communityvisibilitystate', 0)
        print(f'  Visibility:    {VISIBILITY_MAP.get(vis, "Unknown")}')
        ps = summary.get('personastate', 0)
        print(f'  Online:        {PERSONA_STATE_MAP.get(ps, "Unknown")}')
        if summary.get('gameextrainfo'):
            print(f'  Now Playing:   {summary["gameextrainfo"]}')
        if summary.get('timecreated'):
            created = datetime.fromtimestamp(summary['timecreated'], tz=timezone.utc).strftime('%Y-%m-%d')
            print(f'  Created:       {created}')

    level = results.get('Steam Level')
    if level and not level.get('error'):
        print(f'  Steam Level:   {level.get("player_level", "?")}')

    bans = results.get('Player Bans')
    if bans and not bans.get('error'):
        print(f'  VAC Bans:      {"YES" if bans.get("VACBanned") else "No"}')
        print(f'  Game Bans:     {bans.get("NumberOfGameBans", 0)}')
        print(f'  Economy Ban:   {bans.get("EconomyBan", "none")}')

    owned = results.get('Owned Games')
    if owned and not owned.get('error'):
        games = owned.get('games', [])
        total_h = sum(g.get('playtime_forever', 0) for g in games) / 60
        print(f'  Total Games:   {owned.get("game_count", len(games))}')
        print(f'  Total Playtime:{total_h:.1f} hours')
        top10 = sorted(games, key=lambda g: g.get('playtime_forever', 0), reverse=True)[:10]
        if top10:
            print('\n  Top 10 Games by Playtime:')
            for i, g in enumerate(top10, 1):
                hrs = g.get('playtime_forever', 0) / 60
                print(f'    {i:2}. {g.get("name", "?")} ({hrs:.1f}h)')

    recent = results.get('Recently Played')
    if recent and not recent.get('error'):
        games = recent.get('games', [])
        if games:
            print(f'\n  Recently Played ({recent.get("total_count", len(games))} games, last 2 weeks):')
            for g in games:
                h2w = g.get('playtime_2weeks', 0) / 60
                ht = g.get('playtime_forever', 0) / 60
                print(f'    - {g.get("name", "?")}: {h2w:.1f}h (2 weeks), {ht:.1f}h (total)')

    badge_data = results.get('Badges')
    if badge_data and not badge_data.get('error'):
        badges = badge_data.get('badges', [])
        print(f'\n  Badges:        {len(badges)}')
        print(f'  Badge XP:      {badge_data.get("player_xp", 0)}')

    friends = results.get('Friend List')
    if friends and not friends.get('error'):
        print(f'  Friends:       {len(friends.get("friends", []))}')

    print(f'\nCSV files saved to: {OUTPUT_DIR}')


if __name__ == '__main__':
    main()
