"""
单位时间价格变化曲线 (Cost-per-Hour Trend Over Time)

Standalone script that reads game data from CSV and generates a chart
showing how the aggregate cost-per-hour evolves as games are purchased over time.

Rules:
- Excludes hardware (type='hardware') and dramas (type='drama')
- Free games are included (0 net cost, but their playtime counts)
- Games with zero playtime are included (cost counts toward cumulative, playtime contribution is 0)
- Net cost = purchasePrice - sellPrice (for unsold physical games, sellPrice defaults to 0)
- X axis: purchase date (chronological)
- Y axis: cumulative cost per hour = cumulative net cost / cumulative playtime
"""

import csv
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from datetime import datetime
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
OUTPUT_PATH = Path(__file__).resolve().parent / 'cost_per_hour_trend.png'


def find_latest_csv():
    csvs = sorted(PROJECT_ROOT.glob('game_cost_export*.csv'),
                  key=lambda p: p.stat().st_mtime, reverse=True)
    if not csvs:
        raise FileNotFoundError('No game_cost_export*.csv found in project root')
    return csvs[0]


def load_games(csv_path):
    games = []
    with open(csv_path, encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row['type'] in ('hardware', 'drama'):
                continue
            play_time = float(row['playTime']) if row['playTime'] else 0
            purchase_date = row['purchaseDate']
            if not purchase_date:
                continue
            purchase_price = float(row['purchasePrice']) if row['purchasePrice'] else 0
            sell_price = float(row['sellPrice']) if row['sellPrice'] else 0
            net_cost = purchase_price - sell_price
            games.append({
                'name': row['name'],
                'date': datetime.strptime(purchase_date, '%Y-%m-%d'),
                'net_cost': net_cost,
                'play_time': play_time,
                'type': row['type'],
                'sold': bool(row['sellPrice']),
            })
    games.sort(key=lambda g: g['date'])
    return games


def compute_trend(games):
    dates = []
    cph_values = []
    cum_cost = 0
    cum_time = 0
    for g in games:
        cum_cost += g['net_cost']
        cum_time += g['play_time']
        if cum_time <= 0:
            continue
        cph = cum_cost / cum_time
        dates.append(g['date'])
        cph_values.append(cph)
    return dates, cph_values


def plot(dates, cph_values, games):
    plt.rcParams['font.family'] = ['Microsoft YaHei', 'SimHei', 'sans-serif']
    fig, ax = plt.subplots(figsize=(14, 7))

    ax.plot(dates, cph_values, color='#e67e22', linewidth=2.2, marker='o',
            markersize=4, markerfacecolor='#e67e22', markeredgecolor='white',
            markeredgewidth=0.8, zorder=3)
    ax.fill_between(dates, cph_values, alpha=0.12, color='#e67e22')

    ax.set_title('单位时间价格变化曲线 (¥/小时)', fontsize=16, fontweight='bold', pad=14)
    ax.set_xlabel('购买日期', fontsize=12)
    ax.set_ylabel('累计单位时间价格 (¥/小时)', fontsize=12)

    ax.xaxis.set_major_locator(mdates.MonthLocator(interval=2))
    ax.xaxis.set_major_formatter(mdates.DateFormatter('%Y-%m'))
    fig.autofmt_xdate(rotation=35, ha='right')

    ax.axhline(y=0, color='#888', linewidth=0.6, linestyle='--', alpha=0.5)
    ax.grid(axis='y', alpha=0.3, linestyle='--')

    # Annotate final value
    final_cph = cph_values[-1]
    ax.annotate(f'{final_cph:.2f} ¥/h',
                xy=(dates[-1], final_cph),
                xytext=(15, 12), textcoords='offset points',
                fontsize=11, fontweight='bold', color='#c0392b',
                arrowprops=dict(arrowstyle='->', color='#c0392b', lw=1.2))

    # Annotate min and max
    min_cph = min(cph_values)
    max_cph = max(cph_values)
    min_idx = cph_values.index(min_cph)
    max_idx = cph_values.index(max_cph)

    if min_idx != max_idx:
        ax.annotate(f'最低 {min_cph:.2f} ¥/h',
                    xy=(dates[min_idx], min_cph),
                    xytext=(10, -20), textcoords='offset points',
                    fontsize=9, color='#27ae60',
                    arrowprops=dict(arrowstyle='->', color='#27ae60', lw=0.8))
        ax.annotate(f'最高 {max_cph:.2f} ¥/h',
                    xy=(dates[max_idx], max_cph),
                    xytext=(10, 15), textcoords='offset points',
                    fontsize=9, color='#8e44ad',
                    arrowprops=dict(arrowstyle='->', color='#8e44ad', lw=0.8))

    total_games = len(games)
    total_cost = sum(g['net_cost'] for g in games)
    total_time = sum(g['play_time'] for g in games)
    sold_count = sum(1 for g in games if g['sold'])

    stats_text = (
        f'游戏数: {total_games}  |  '
        f'总花费: ¥{total_cost:,.0f}  |  '
        f'总时长: {total_time:,.0f}h  |  '
        f'已出二手: {sold_count}款'
    )
    ax.text(0.5, -0.18, stats_text, transform=ax.transAxes,
            fontsize=10, ha='center', color='#555',
            bbox=dict(boxstyle='round,pad=0.4', facecolor='#f8f8f8', edgecolor='#ddd'))

    plt.tight_layout()
    plt.savefig(OUTPUT_PATH, dpi=180, bbox_inches='tight', facecolor='white')
    print(f'Chart saved to: {OUTPUT_PATH}')
    print('Done!')


def main():
    csv_path = find_latest_csv()
    print(f'Using CSV: {csv_path.name}')
    games = load_games(csv_path)
    print(f'Loaded {len(games)} games (excluded hardware and drama)')
    dates, cph_values = compute_trend(games)
    print(f'Final cost-per-hour: {cph_values[-1]:.2f} yuan/h')
    print(f'Date range: {dates[0].strftime("%Y-%m-%d")} ~ {dates[-1].strftime("%Y-%m-%d")}')
    plot(dates, cph_values, games)


if __name__ == '__main__':
    main()
