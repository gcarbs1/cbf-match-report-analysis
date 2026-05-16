---
name: project-cbf-nlp
description: Contexto geral do projeto CBF NLP — pipeline de súmulas, estrutura de dados, notebooks
metadata:
  type: project
---

Pipeline de súmulas do Campeonato Brasileiro para análise de sobrevivência de árbitros.

- **2427 PDFs** de súmulas (Série A, 2020–2026), baixados no notebook 0
- Índice principal: `data/raw/match-reports/match_reports_index.csv`
- PDFs em: `data/raw/match-reports/<year>/round-<rr>/`
- Os `file_path` no CSV são relativos ao diretório `notebooks/` (começam com `../data/...`)

**Notebook 0** — `notebooks/0-data_collection.ipynb`: coleta e download dos PDFs via API CBF

**Notebook 1** — `notebooks/1-data_clean.ipynb`: extração e limpeza, salva em `data/processed/sumulas_clean.csv`
- Saída: 2 linhas por partida (uma por `focal_team` — home e away)
- Colunas: `year`, `match_date` (YYYY-MM-DD), `home_team`, `away_team`, `focal_team`, `arbitro`, `yellow_reason_1..N`, `red_reason_1..M`
- Parsing via pdfplumber + regex; motivos têm código (`A1.4.`, `V1.`) removido do início

**Why:** análise de sobrevivência de árbitros (lifelines KM), com 22 tags NLP de eventos.

**How to apply:** ao sugerir features ou modelos, considerar que a unidade de análise é (jogo, time focal) e que os motivos de cartão são texto livre pós-limpeza.
