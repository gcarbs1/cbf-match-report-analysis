from __future__ import annotations

import html as html_lib
import json
import re
import statistics
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PAGE_HTML = ROOT.parent / "cbf-match-report-analysis-page" / "index.html"
OUTPUT_HTML = ROOT / "viz" / "cbf_sumulas_linkedin.html"

BLUE = "#06478f"
RED = "#952119"
GOLD = "#e0a800"
INK = "#18130f"
RULE = "#cfc0a1"
GREEN = "#12764a"


def esc(value: object) -> str:
    return html_lib.escape(str(value), quote=True)


def fmt_int(value: int) -> str:
    return f"{int(value):,}".replace(",", ".")


def fmt_num(value: float, digits: int = 2) -> str:
    return f"{value:.{digits}f}".replace(".", ",")


def read_block(source: str, block_id: str):
    match = re.search(
        rf'<script id="{re.escape(block_id)}" type="application/json">(.*?)</script>',
        source,
        re.DOTALL,
    )
    if not match:
        raise ValueError(f"bloco {block_id!r} não encontrado em {PAGE_HTML}")
    return json.loads(match.group(1))


def page(number: int, body: str) -> str:
    return (
        f'<section class="page page-{number}">\n{body}\n'
        f'          <footer class="page-footer"><b>{number:02d} / 08</b></footer>\n'
        "        </section>"
    )


def padded_domain(values: list[float]) -> tuple[float, float]:
    low, high = min(values), max(values)
    pad = (high - low) * 0.1 or max(abs(high) * 0.1, 0.1)
    return low - pad, high + pad


def position(value: float, domain: tuple[float, float]) -> float:
    low, high = domain
    return 100 * (value - low) / (high - low)


def dot_table(rows: list[dict], colors: dict, *, percent: bool = False) -> str:
    values = [row["rate"] for row in rows]
    domain = padded_domain(values)
    ticks = [domain[0], (domain[0] + domain[1]) / 2, domain[1]]
    tick_text = [fmt_num(100 * tick, 1) + "%" if percent else fmt_num(tick) for tick in ticks]
    rendered = []
    for row in sorted(rows, key=lambda item: (-item["rate"], item["name"])):
        primary, secondary = colors[row["name"]]["primary"], colors[row["name"]]["secondary"]
        value = fmt_num(100 * row["rate"], 1) + "%" if percent else fmt_num(row["rate"])
        rendered.append(
            '<div class="dot-row compact">\n'
            f'              <div class="dot-name">{esc(row["name"])}</div>\n'
            f'              <div class="dot-rail"><span class="club-dot" style="left:{position(row["rate"], domain):.3f}%;background:{secondary};border-color:{primary}"></span></div>\n'
            f'              <div class="dot-value">{value}</div>\n'
            "            </div>"
        )
    return (
        '<div class="dot-table"><div class="dot-scale">'
        + "".join(f"<span>{value}</span>" for value in tick_text)
        + "</div>"
        + "".join(rendered)
        + "</div>"
    )


def swarm(rows: list[dict], *, percent: bool = False) -> str:
    rows = sorted(rows, key=lambda item: (item["rate"], item["name"]))
    values = [row["rate"] for row in rows]
    domain = padded_domain(values)
    x0, x1 = 24.0, 676.0

    def x(value: float) -> float:
        return x0 + (x1 - x0) * (value - domain[0]) / (domain[1] - domain[0])

    ticks = [domain[0] + index * (domain[1] - domain[0]) / 4 for index in range(5)]
    pieces = [f'<line x1="24" y1="126" x2="676" y2="126" class="axis-line"/>']
    for tick in ticks:
        tx = x(tick)
        label = fmt_num(100 * tick, 1) + "%" if percent else fmt_num(tick)
        pieces.append(f'<line x1="{tx:.1f}" y1="126" x2="{tx:.1f}" y2="131" class="tick-line"/>')
        pieces.append(f'<text x="{tx:.1f}" y="146" class="axis-text" text-anchor="middle">{label}</text>')

    levels = [115.0, 104.0, 126.0, 93.0, 137.0]
    placed: list[tuple[float, float]] = []
    top_names = {row["name"] for row in sorted(rows, key=lambda item: item["rate"], reverse=True)[:3]}
    coordinates: dict[str, tuple[float, float]] = {}
    for row in rows:
        cx = x(row["rate"])
        cy = next(
            (level for level in levels if all(level != py or abs(cx - px) >= 11 for px, py in placed)),
            levels[len(placed) % len(levels)],
        )
        placed.append((cx, cy))
        coordinates[row["name"]] = (cx, cy)
        radius = 6 if row["name"] in top_names else 4.5
        fill = GREEN if row["name"] in top_names else RULE
        pieces.append(f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{radius}" fill="{fill}" stroke="{INK}" stroke-width="1"/>')

    top = sorted(rows, key=lambda item: (-item["rate"], item["name"]))[:3]
    for index, row in enumerate(top):
        cx, cy = coordinates[row["name"]]
        leader_y = 22 + 24 * index
        text_y = 18 + 24 * index
        label = fmt_num(100 * row["rate"], 1) + "%" if percent else fmt_num(row["rate"])
        pieces.append(f'<path d="M {cx:.1f} {cy - 7:.1f} L {cx:.1f} {leader_y} L 292 {leader_y}" class="leader"/>')
        pieces.append(f'<text x="300" y="{text_y}" class="swarm-label">{esc(row["name"])}</text>')
        pieces.append(f'<text x="300" y="{text_y + 13}" class="swarm-label-value">{label}</text>')
    return '<svg class="swarm" viewBox="0 0 700 170" aria-label="Distribuição entre árbitros">' + "".join(pieces) + "</svg>"


def entity_rows(entities: dict) -> list[dict]:
    return [
        {"name": name, "rate": values["total"] / values["games"], **values}
        for name, values in entities.items()
        if values["games"]
    ]


def profile_rows(name: str, entities: dict, tags: list[dict], *, min_games: int = 0) -> str:
    eligible = {key: value for key, value in entities.items() if value["games"] > min_games}
    rows = []
    for tag in tags:
        key = tag["tag"]
        rates = [value["tags"].get(key, 0) / value["games"] for value in eligible.values()]
        rate = eligible[name]["tags"].get(key, 0) / eligible[name]["games"]
        std = statistics.pstdev(rates)
        z_score = (rate - statistics.mean(rates)) / std if std else 0.0
        rows.append((abs(z_score), z_score, tag["label"], rate))
    rendered = []
    for _, z_score, label, rate in sorted(rows, reverse=True)[:8]:
        direction = "above" if z_score >= 0 else "below"
        color = BLUE if z_score >= 0 else RED
        sign = "+" if z_score >= 0 else "−"
        width = min(50, abs(z_score) * 100 / 6)
        rendered.append(
            f'<div class="profile-row"><div class="profile-label">{esc(label)}</div>'
            f'<div class="profile-track"><i class="{direction}" style="width:{width:.2f}%;background:{color}"></i><span class="mean-marker"></span></div>'
            f'<div class="profile-value">{fmt_num(rate)}<small>{sign}{fmt_num(abs(z_score))} DP</small></div></div>'
        )
    return "\n".join(rendered)


def detail_card(name: str, entities: dict, tags: list[dict], *, min_games: int = 0) -> str:
    values = entities[name]
    return f'''<article class="detail-card">
              <div class="detail-title"><h2>{esc(name)}</h2><span>{fmt_int(values["total"])} cartões</span></div>
              <div class="stat-strip">
                <div><b>{fmt_int(values["games"])}</b><span>jogos</span></div>
                <div><b>{fmt_num(values["total"] / values["games"])}</b><span>cartões/jogo</span></div>
                <div><b>{fmt_int(values["yellow"])}</b><span>amarelos</span></div>
                <div><b>{fmt_int(values["red"])}</b><span>cartões vermelhos</span></div>
              </div>
              <div class="mini-head"><span>Motivos que mais se afastam da média</span><b>por jogo</b></div>
              <div class="profile-list">{profile_rows(name, entities, tags, min_games=min_games)}</div>
            </article>'''


def player_card(player: dict) -> str:
    tags = player["tags"][:6]
    largest = max((row[1] for row in tags), default=1)
    tag_rows = []
    for label, total, yellow, red in tags:
        tag_rows.append(
            '<div class="profile-row player-profile-row">\n'
            f'              <div class="profile-label">{esc(label)}</div>\n'
            f'              <div class="profile-track"><span class="player-total" style="width:{100 * total / largest:.2f}%"><i style="width:{100 * yellow / total:.2f}%;background:{GOLD}"></i><i style="width:{100 * red / total:.2f}%;background:{RED}"></i></span></div>\n'
            f'              <div class="profile-value">{fmt_int(total)}</div>\n'
            "            </div>"
        )
    return f'''<article class="detail-card player-card">
              <div class="detail-title"><div><h2>{esc(player["name"])}</h2><small>{esc(player["full_name"])}</small></div><span>{fmt_int(player["cards"])} cartões</span></div>
              <p class="club-line">{esc(" · ".join(player["teams"]))}</p>
              <div class="stat-strip player-stats">
                <div><b>{fmt_int(player["appearances"])}</b><span>aparições</span></div>
                <div><b>{fmt_num(player["cards"] / player["appearances"])}</b><span>cartões/aparição</span></div>
                <div><b>{fmt_int(player["yellow"])}</b><span>amarelos</span></div>
                <div><b>{fmt_int(player["red"])}</b><span>cartões vermelhos</span></div>
              </div>
              <div class="mini-head"><span>Motivos mais recorrentes</span><b>total</b></div>
              <div class="profile-list">{"".join(tag_rows)}</div>
            </article>'''


def match_events(match: dict, var_ids: set[str]) -> str:
    labels = {"A": "Amarelo", "V2": "2º amarelo", "VD": "Vermelho"}
    previous_period = None
    rendered = []
    for index, (player_name, team, card, reason, tags, minute) in enumerate(match["events"], 1):
        period = "Intervalo" if minute == "Intervalo" else "Após o jogo" if minute == "Após o jogo" else minute.split(" · ", 1)[0]
        if period != previous_period:
            rendered.append(f'<h4 class="match-period">{esc(period)}</h4>')
            previous_period = period
        minute_short = minute.replace("1º tempo", "1ºT").replace("2º tempo", "2ºT").replace(" · ", " · ")
        rendered.append(f'''<article class="match-event">
              <div class="event-index">{index:02d}</div>
              <div class="mini-card {"yellow" if card == "A" else "red"}"></div>
              <div class="event-copy">
                <div class="event-top"><strong>{esc(player_name)}</strong><em>{esc(team)}</em></div>
                <p>{esc(reason)}</p>
                <div class="event-bottom"><span>{labels[card]} · {esc(minute_short)}</span><div class="event-tags">{"".join(f"<span>{esc(tag)}</span>" for tag in tags)}</div></div>
              </div>
            </article>''')
    var_label = "Com menção ao VAR" if match["id"] in var_ids else "Sem menção ao VAR"
    return f'''<div class="match-headline">
            <div><h2>{esc(match["home"])} <span>×</span> {esc(match["away"])}</h2><p>{esc(match["date"])} · árbitro {esc(match["ref"])}</p></div>
            <div class="match-badges"><b>{len(match["events"])} cartões</b><span>{var_label}</span></div>
          </div>
          <div class="match-events">{"".join(rendered)}</div>'''


def var_season_chart(rows: list[dict]) -> str:
    x_values = [52 + index * 598 / (len(rows) - 1) for index in range(len(rows))]
    y = lambda rate: 300 - rate * (254 / 0.6)
    pieces = []
    for tick in (0, 0.2, 0.4, 0.6):
        ty = y(tick)
        pieces.append(f'<line x1="52" y1="{ty:.1f}" x2="650" y2="{ty:.1f}" class="grid-line"/>')
        pieces.append(f'<text x="42" y="{ty + 4:.1f}" class="axis-text" text-anchor="end">{tick:.0%}</text>')
    points = " ".join(f"{x_value:.1f},{y(row['var_games'] / row['games']):.1f}" for x_value, row in zip(x_values, rows))
    pieces.append(f'<polyline points="{points}" class="var-polyline"/>')
    for index, (x_value, row) in enumerate(zip(x_values, rows)):
        rate = row["var_games"] / row["games"]
        y_value = y(rate)
        pieces.append(f'<circle cx="{x_value:.1f}" cy="{y_value:.1f}" r="7" class="var-dot"/>')
        pieces.append(f'<text x="{x_value:.1f}" y="{y_value - 16:.1f}" class="var-value" text-anchor="middle">{fmt_num(100 * rate, 1)}%</text>')
        pieces.append(f'<text x="{x_value:.1f}" y="328" class="axis-text year" text-anchor="middle">{esc(row["entity"])}</text>')
        if index == len(rows) - 1:
            pieces.append(f'<text x="{x_value:.1f}" y="342" class="axis-text partial" text-anchor="middle">parcial</text>')
    return '<svg class="var-line" viewBox="0 0 680 355" aria-label="Menções ao VAR por temporada">' + "".join(pieces) + "</svg>"


def main() -> None:
    site_html = PAGE_HTML.read_text(encoding="utf-8")
    site = read_block(site_html, "site-data")
    players = read_block(site_html, "player-data")
    var = read_block(site_html, "var-data")
    matches = read_block(site_html, "match-data")

    tag_max = max(item["n_eventos"] for item in site["tags"])
    bars = []
    for item in site["tags"]:
        yellow = item["n_eventos"] - item["n_red"]
        bars.append(f'''<div class="bar-row">
              <div class="bar-label">{esc(item["label"])}</div>
              <div class="bar-track"><div class="bar-total" style="width:{100 * item["n_eventos"] / tag_max:.3f}%">
                <span class="bar-yellow" style="width:{100 * yellow / item["n_eventos"]:.3f}%"></span>
                <span class="bar-red" style="width:{100 * item["n_red"] / item["n_eventos"]:.3f}%"></span>
              </div></div>
              <div class="bar-value">{fmt_int(item["n_eventos"])}</div>
            </div>''')

    team_rows = entity_rows(site["by_team"])
    referee_rows = [row for row in entity_rows(site["by_referee"]) if row["games"] > 10]
    top_teams = sorted(site["by_team"], key=lambda name: (-site["by_team"][name]["total"], name))[:2]
    top_refs = sorted(site["by_referee"], key=lambda name: (-site["by_referee"][name]["total"], name))[:2]
    top_players = sorted(players, key=lambda item: (-item["cards"], item["name"]))[:2]

    selected_match = next(
        match for match in matches
        if match["date"] == "04/09/2022" and match["home"] == "Flamengo" and match["away"] == "Ceará"
    )
    var_ids = set(var["matches_with_var"])
    var_year = var["by_year"]
    var_team_rows = [
        {"name": row["entity"], "rate": row["var_games"] / row["games"]}
        for row in var["by_team"] if row["games"]
    ]
    var_ref_rows = [
        {"name": row["entity"], "rate": row["var_games"] / row["games"]}
        for row in var["by_referee"] if row["games"] > 10
    ]

    body = []
    body.append(page(1, f'''          <header class="page-head cover-head">
      <div class="cover-copy"><span class="cover-kicker">Brasileirão Série A · 2020—2026</span><h1>Súmulas da CBF.<em>Cartões e menções ao VAR, jogo a jogo.</em></h1><p>Uma leitura direta dos registros oficiais, organizada em categorias auditáveis e comparável por time, árbitro, jogador e partida.</p></div>
      <div class="cover-visual" aria-hidden="true"><div class="cover-card yellow"></div><div class="cover-card red"></div></div>
    </header>
          <div class="section-caption"><h2>Registros por categoria</h2><div class="legend"><span><i class="yellow"></i>cartões amarelos</span><span><i class="red"></i>cartões vermelhos</span></div></div>
          <div class="panel panorama-panel">{"".join(bars)}</div>'''))

    body.append(page(2, f'''          <header class="page-head">
      <h1>Cartões por jogo de times e árbitros</h1>
      <p>As taxas por jogo permitem comparar participantes com volumes diferentes de partidas. Todos os times são identificados. Entre os árbitros, os três maiores valores são listados em linhas separadas.</p>
    </header>
          <div class="chart-block team-rates">
            <div class="block-head"><h2>Cartões totais por jogo · times</h2><span>todos os clubes</span></div>
            {dot_table(team_rows, site["team_colors"])}
          </div>
          <div class="chart-block referee-rates">
            <div class="block-head"><h2>Cartões totais por jogo · árbitros</h2><span>mínimo de 11 jogos</span></div>
            {swarm(referee_rows)}
          </div>'''))

    body.append(page(3, f'''          <header class="page-head">
      <h1>Times com mais cartões</h1>
      <p>{esc(top_teams[0])} e {esc(top_teams[1])} apresentam os maiores totais no período. Os gráficos mostram as categorias cuja taxa por jogo mais se afasta da média dos times.</p>
    </header>
          <div class="detail-stack">{"".join(detail_card(name, site["by_team"], site["tags"]) for name in top_teams)}</div>
          <div class="profile-legend"><span><i class="blue"></i>acima da média</span><span><i class="crit"></i>abaixo da média</span><span><i class="tick"></i>média entre times</span></div>'''))

    body.append(page(4, f'''          <header class="page-head">
      <h1>Árbitros com mais cartões</h1>
      <p>{esc(top_refs[0])} e {esc(top_refs[1])} apresentam os maiores totais no período. As taxas por jogo permitem comparar o volume de atuação e o perfil disciplinar.</p>
    </header>
          <div class="detail-stack">{"".join(detail_card(name, site["by_referee"], site["tags"], min_games=10) for name in top_refs)}</div>
          <div class="profile-legend"><span><i class="blue"></i>acima da média</span><span><i class="crit"></i>abaixo da média</span><span><i class="tick"></i>média entre árbitros</span></div>'''))

    body.append(page(5, f'''          <header class="page-head">
      <h1>Jogadores com mais cartões</h1>
      <p>O ranking considera registros de cartão. Cartões vermelhos incluem expulsões por segundo amarelo. Um cartão pode receber mais de uma categoria.</p>
    </header>
          <div class="detail-stack player-stack">{"".join(player_card(player) for player in top_players)}</div>
          <div class="legend"><span><i class="yellow"></i>cartões amarelos</span><span><i class="red"></i>cartões vermelhos</span></div>'''))

    body.append(page(6, f'''          <header class="page-head">
      <h1>Cartões de uma partida</h1>
      <p>O exemplo apresenta todos os registros de uma partida com muitos cartões. Cada linha mantém jogador, time, minuto, justificativa e categorias atribuídas.</p>
    </header>
          {match_events(selected_match, var_ids)}'''))

    var_games = var["manifest"]["games"]
    var_count = var["manifest"]["var_games"]
    body.append(page(7, f'''          <header class="page-head">
      <h1>Menções ao VAR por temporada</h1>
      <p>A métrica identifica partidas cuja súmula contém ao menos uma evidência textual de checagem, revisão ou arbitragem de vídeo. Entre as <strong>{fmt_int(var_games)} partidas analisadas</strong>, <strong>{fmt_int(var_count)} tiveram menção ao VAR</strong>, equivalentes a <strong>{fmt_num(100 * var_count / var_games, 1)}% do período</strong>. Ela não conta intervenções e não atribui a decisão a um clube.</p>
    </header>
          <div class="panel var-panel"><div class="block-head"><h2>Menções ao VAR ao longo dos anos</h2><span>% de partidas da temporada</span></div>{var_season_chart(var_year)}</div>'''))

    body.append(page(8, f'''          <header class="page-head">
      <h1>Menções ao VAR por jogo de times e árbitros</h1>
      <p>Cada taxa representa a fração de partidas com ao menos uma menção ao VAR. Para os times, o resultado descreve a partida e não indica para qual equipe ocorreu uma decisão.</p>
    </header>
          <div class="chart-block team-rates var-team-rates">
            <div class="block-head"><h2>Ocorrências por jogo referentes ao VAR · times</h2><span>todos os clubes</span></div>
            {dot_table(var_team_rows, site["team_colors"], percent=True)}
          </div>
          <div class="chart-block referee-rates var-ref-rates">
            <div class="block-head"><h2>Ocorrências por jogo referentes ao VAR · árbitros</h2><span>mínimo de 11 jogos</span></div>
            {swarm(var_ref_rows, percent=True)}
          </div>'''))

    current = OUTPUT_HTML.read_text(encoding="utf-8")
    head = current.split("</head>", 1)[0] + "</head>\n"
    output = head + '<body><main class="document">' + "".join(body) + "</main></body>\n</html>\n"
    OUTPUT_HTML.write_text(output, encoding="utf-8")
    print(f"escrito em {OUTPUT_HTML}")
    print(f"eventos={site['manifest']['events']} | VAR={var_count}/{var_games} | última partida={site['manifest']['latest_match_date']}")


if __name__ == "__main__":
    main()
