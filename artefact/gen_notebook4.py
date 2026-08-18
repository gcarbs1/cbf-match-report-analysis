import json
from pathlib import Path

def md(*lines):
    return {"cell_type": "markdown", "metadata": {}, "source": [l + "\n" for l in lines[:-1]] + ([lines[-1]] if lines else [])}

def code(src):
    return {"cell_type": "code", "execution_count": None, "metadata": {}, "outputs": [],
            "source": [l + "\n" for l in src.strip("\n").split("\n")][:-1] + [src.strip("\n").split("\n")[-1]]}

cells = []

cells.append(md(
"# **4. Publicar dados no site**",
"",
"Este notebook fecha o pipeline: lê as saídas já processadas pelos notebooks anteriores "
"(`0` a `3`, em especial o tagueamento do notebook `2`) e regenera os três blocos de dados "
"embutidos no `index.html` do repositório público `cbf-match-report-analysis-page` "
"(`match-data`, `site-data` e `player-data`).",
"",
"O restante do `index.html` (HTML, CSS, JavaScript de renderização) não é tocado — só os três "
"blocos `<script type=\"application/json\">` são substituídos.",
"",
"Fluxo de atualização: rode `0` → `1` → `2` → `3` para atualizar os dados processados, depois "
"rode este notebook para publicar o resultado na página. Revise o diff em "
"`cbf-match-report-analysis-page` e faça o commit/push de lá manualmente quando estiver satisfeito."
))

cells.append(code('''
from __future__ import annotations

import json
import re
from pathlib import Path

import pandas as pd

ROOT = Path.cwd().resolve()
if ROOT.name == "notebooks":
    ROOT = ROOT.parent

PAGE_REPO = ROOT.parent / "cbf-match-report-analysis-page"
PAGE_HTML = PAGE_REPO / "index.html"
assert PAGE_HTML.exists(), f"não encontrei {PAGE_HTML} — o repo da página precisa estar clonado ao lado deste"

CARD_EVENTS_PATH = ROOT / "data" / "processed" / "keyword_tags" / "card_events_tagged.csv"
RUN_MANIFEST_PATH = ROOT / "data" / "processed" / "keyword_tags" / "run_manifest.json"
PLAYER_DATA_PATH = ROOT / "data" / "processed" / "keyword_tags" / "site_player_data.json"
GAMES_PATH = ROOT / "data" / "interim" / "games.csv"
'''))

cells.append(md(
"## **1. Normalização de nomes de time**",
"",
"Os dados brutos (`games.csv`, `card_events_tagged.csv`) trazem variações do mesmo clube "
"(`\"Atlético Mineiro\"`, `\"Atlético Mineiro - MG\"`, `\"Coritiba SAF\"`...). O site usa nomes "
"curtos e únicos por clube (`\"Atlético-MG\"`, `\"Coritiba\"`...). Esta tabela faz essa canonicalização; "
"foi construída comparando os 37 nomes brutos encontrados em `games.csv` com os 30 nomes exibidos hoje "
"no site."
))

cells.append(code('''
TEAM_ALIASES = {
    "america": "América-MG",
    "américa": "América-MG",
    "athletico paranaense": "Athletico-PR",
    "atlético": "Atlético-GO",
    "atlético goianiense saf": "Atlético-GO",
    "atlético mineiro": "Atlético-MG",
    "avaí": "Avaí",
    "bahia": "Bahia",
    "esporte clube bahia": "Bahia",
    "botafogo": "Botafogo",
    "botafogo de futebol e regatas": "Botafogo",
    "ceará": "Ceará",
    "chapecoense": "Chapecoense",
    "corinthians": "Corinthians",
    "coritiba": "Coritiba",
    "coritiba saf": "Coritiba",
    "criciúma": "Criciúma",
    "cruzeiro": "Cruzeiro",
    "cuiabá": "Cuiabá",
    "flamengo": "Flamengo",
    "fluminense": "Fluminense",
    "fortaleza esporte clube": "Fortaleza",
    "fortaleza saf": "Fortaleza",
    "goiás": "Goiás",
    "grêmio": "Grêmio",
    "internacional": "Internacional",
    "juventude": "Juventude",
    "mirassol": "Mirassol",
    "palmeiras": "Palmeiras",
    "red bull bragantino": "Red Bull Bragantino",
    "remo": "Remo",
    "santos fc": "Santos",
    "sport recife": "Sport",
    "são paulo": "São Paulo",
    "vasco da gama": "Vasco",
    "vasco da gama saf": "Vasco",
    "vitória": "Vitória",
}

STATE_SUFFIX = re.compile(r" - [A-Z]{2}$")


def canon_team(raw: object) -> str:
    """Nome bruto do clube -> nome curto usado no site. Times não mapeados levantam KeyError
    de propósito: times novos na Série A precisam ser adicionados a TEAM_ALIASES antes de publicar."""
    if not isinstance(raw, str) or not raw.strip():
        return ""
    base = STATE_SUFFIX.sub("", raw).strip()
    key = base.lower()
    if key not in TEAM_ALIASES:
        raise KeyError(f"time não mapeado em TEAM_ALIASES: {raw!r} (adicione antes de publicar)")
    return TEAM_ALIASES[key]
'''))

cells.append(md("## **2. Carregar dados processados**"))

cells.append(code('''
df = pd.read_csv(CARD_EVENTS_PATH, low_memory=False)
manifest = json.loads(RUN_MANIFEST_PATH.read_text(encoding="utf-8"))
player_data = json.loads(PLAYER_DATA_PATH.read_text(encoding="utf-8"))
games_df = pd.read_csv(GAMES_PATH)

TAG_ORDER = manifest["tags"]
TAG_LABEL = {t: manifest["taxonomy"][t]["label"] for t in TAG_ORDER}
CARD_CODE = {"yellow": "A", "second_yellow": "V2", "direct_red": "VD"}
PERIOD_LABEL = {"1T": "1º tempo", "2T": "2º tempo"}

len(df), len(player_data), len(games_df)
'''))

cells.append(md(
"## **3. `match-data`: eventos por partida**",
"",
"Um registro por jogo com todos os cartões daquela súmula. O rótulo de tempo de jogo replica "
"o texto que aparece na súmula oficial: `\"1º tempo · 18'\"` para tempo normal, "
"`\"1º tempo · 45+3'\"` para acréscimos (`clock` começando com `+`), e `\"Intervalo\"` / "
"`\"Após o jogo\"` para os períodos `INT` / `PJ`."
))

cells.append(code('''
def minute_label(period: str, minute: float, clock: object) -> str:
    if period == "INT":
        return "Intervalo"
    if period == "PJ":
        return "Após o jogo"
    base = PERIOD_LABEL.get(period, period)
    m = int(minute) if pd.notna(minute) else 0
    if isinstance(clock, str) and clock.startswith("+"):
        return f"{base} · 45+{m}\\'"
    return f"{base} · {m}\\'"


def build_match_data(frame: pd.DataFrame) -> list[dict]:
    matches = []
    for game_id, grp in frame.sort_values("game_id").groupby("game_id", sort=True):
        first = grp.iloc[0]
        events = []
        for _, row in grp.iterrows():
            tags = [TAG_LABEL[t] for t in TAG_ORDER if row.get(t) is True]
            reason = row["reason_reported"] if pd.notna(row["reason_reported"]) else ""
            events.append([
                row["player"],
                canon_team(row["team"]),
                CARD_CODE[row["disciplinary_outcome"]],
                reason,
                tags,
                minute_label(row["period"], row["minute"], row["clock"]),
            ])
        matches.append({
            "id": str(game_id),
            "year": str(int(first["year"])),
            "date": str(first["match_date"]).strip(),
            "home": canon_team(first["home_team"]),
            "away": canon_team(first["away_team"]),
            "ref": first["referee"],
            "events": events,
        })
    return matches


match_data = build_match_data(df)
len(match_data)
'''))

cells.append(md(
"## **4. `site-data`: agregados (manifest, tags, por time, por árbitro)**",
"",
"`red_total` e `n_red` contam só cartão vermelho direto (`disciplinary_outcome == \"direct_red\"`); "
"o segundo amarelo (`second_yellow`) não entra nessa contagem — foi assim que validamos contra os "
"números hoje publicados. `games` (partidas) vem de `games.csv` filtrado a `match_status == "
"\"played_with_report\"`, contando todas as partidas do time/árbitro, tenha havido cartão ou não."
))

cells.append(code('''
def build_site_data(frame: pd.DataFrame, games: pd.DataFrame) -> dict:
    total_events = len(frame)
    red_total = int((frame["disciplinary_outcome"] == "direct_red").sum())

    tags = []
    for t in TAG_ORDER:
        sub = frame[frame[t] == True]  # noqa: E712
        n_eventos = len(sub)
        n_red = int((sub["disciplinary_outcome"] == "direct_red").sum())
        tags.append({
            "tag": t,
            "label": TAG_LABEL[t],
            "n_textos": int(sub["reason"].nunique()),
            "n_eventos": int(n_eventos),
            "red_share": round(n_red / n_eventos, 4) if n_eventos else 0.0,
            "n_red": n_red,
        })

    reported = games[games["match_status"] == "played_with_report"].copy()
    reported["home_c"] = reported["home_team"].map(canon_team)
    reported["away_c"] = reported["away_team"].map(canon_team)
    team_games: dict[str, int] = {}
    for _, r in reported.iterrows():
        team_games[r["home_c"]] = team_games.get(r["home_c"], 0) + 1
        team_games[r["away_c"]] = team_games.get(r["away_c"], 0) + 1
    ref_games = reported["referee"].value_counts().to_dict()

    frame = frame.copy()
    frame["team_c"] = frame["team"].map(canon_team)

    def aggregate(group_col: str, games_lookup: dict) -> dict:
        out = {}
        subset = frame[frame[group_col] != ""]
        for name, grp in subset.groupby(group_col):
            tag_counts = {t: int(grp[t].sum()) for t in TAG_ORDER if grp[t].sum() > 0}
            out[name] = {
                "total": len(grp),
                "red": int((grp["disciplinary_outcome"] == "direct_red").sum()),
                "tags": tag_counts,
                "games": int(games_lookup.get(name, 0)),
            }
        return dict(sorted(out.items(), key=lambda kv: -kv[1]["total"]))

    return {
        "manifest": {"events": total_events, "red_total": red_total},
        "tags": tags,
        "by_team": aggregate("team_c", team_games),
        "by_referee": aggregate("referee", ref_games),
    }


site_data = build_site_data(df, games_df)
site_data["manifest"], len(site_data["by_team"]), len(site_data["by_referee"])
'''))

cells.append(md(
"## **5. `player-data`**",
"",
"Já é gerado pelo notebook `2` em `data/processed/keyword_tags/site_player_data.json` "
"(cartões, presenças e tags por jogador) — aqui só reaproveitamos o arquivo."
))

cells.append(code("len(player_data), player_data[0]['name']"))

cells.append(md(
"## **6. Gravar no `index.html` da página**",
"",
"Substitui só o conteúdo dos três blocos `<script id=\"...\" type=\"application/json\">`, mantendo "
"todo o resto do arquivo (CSS, fontes, JS de renderização) intacto."
))

cells.append(code('''
def replace_block(html: str, block_id: str, payload) -> str:
    pattern = re.compile(
        r'(<script id="' + re.escape(block_id) + r'" type="application/json">)(.*?)(</script>)',
        re.DOTALL,
    )
    new_json = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    new_html, n = pattern.subn(lambda m: m.group(1) + new_json + m.group(3), html, count=1)
    assert n == 1, f"bloco {block_id!r} não encontrado em {PAGE_HTML}"
    return new_html


html = PAGE_HTML.read_text(encoding="utf-8")
html = replace_block(html, "match-data", match_data)
html = replace_block(html, "site-data", site_data)
html = replace_block(html, "player-data", player_data)
PAGE_HTML.write_text(html, encoding="utf-8")

print(f"escrito em {PAGE_HTML}")
print(f"partidas: {len(match_data)} | eventos: {site_data['manifest']['events']} | "
      f"vermelhos diretos: {site_data['manifest']['red_total']} | "
      f"times: {len(site_data['by_team'])} | árbitros: {len(site_data['by_referee'])} | "
      f"jogadores: {len(player_data)}")
'''))

cells.append(md(
"## **7. Próximo passo**",
"",
"Este notebook não faz commit nem push. Vá até `cbf-match-report-analysis-page`, confira o "
"`git diff` e publique quando estiver satisfeito:",
"",
"```bash",
"cd ../cbf-match-report-analysis-page",
"git diff --stat",
"git add index.html",
"git commit -m \"Atualiza dados do site\"",
"git push",
"```"
))

nb = {
    "cells": cells,
    "metadata": {
        "kernelspec": {"display_name": ".venv (3.12.13)", "language": "python", "name": "python3"},
        "language_info": {
            "codemirror_mode": {"name": "ipython", "version": 3},
            "file_extension": ".py",
            "mimetype": "text/x-python",
            "name": "python",
            "nbconvert_exporter": "python",
            "pygments_lexer": "ipython3",
            "version": "3.12.13",
        },
    },
    "nbformat": 4,
    "nbformat_minor": 5,
}

out = Path("/Users/gabrielcarbinatto/Documents/GitHub/cbf-match-report-analysis/notebooks/4-build_site.ipynb")
out.write_text(json.dumps(nb, ensure_ascii=False, indent=1), encoding="utf-8")
print("wrote", out)
