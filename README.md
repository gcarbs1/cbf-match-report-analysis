# Estudo nas Súmulas da CBF

## Resumo

Coleta as súmulas oficiais do Campeonato Brasileiro Série A de 2020 a 2026, transforma cartões e justificativas disciplinares em dados estruturados e disponibiliza os resultados em `index.html`:

- **Cartões.** Classifica as justificativas em uma taxonomia reproduzível e compara equipes, árbitros e jogadores.
- **VAR.** Identifica menções ao árbitro de vídeo e acompanha sua frequência por temporada.
- **Partidas.** Permite consultar os eventos disciplinares jogo a jogo.
- **Assistente.** Responde perguntas sobre os dados por meio de ferramentas controladas em um Cloudflare Worker.

## Estrutura

- `notebooks/00-data_collection.ipynb`: coleta partidas, registros disciplinares e súmulas oficiais.
- `notebooks/01-data_clean.ipynb`: extrai os cartões dos PDFs, integra a API e limpa as justificativas.
- `notebooks/02-keyword_tagging.ipynb`: aplica a taxonomia de motivos e produz perfis analíticos.
- `notebooks/03-var-usage.ipynb`: identifica menções ao VAR e gera agregações.
- `notebooks/04-build_site.ipynb`: atualiza os dados incorporados ao dashboard.
- `notebooks/05-classification_validation.ipynb`: valida a taxonomia com classificação multilabel.
- `data/raw/`: súmulas e respostas originais da coleta.
- `data/interim/`: tabelas intermediárias e caches do processamento.
- `data/processed/`: tabelas finais, auditorias e dados do dashboard.
- `index.html` e `html/`: dashboard estático, estilos, scripts e fontes.
- `worker/`: assistente, banco D1, migrações e avaliações.
- `viz/`: gráficos produzidos pela validação.

## Saídas

| arquivo ou pasta | conteúdo |
|---|---|
| `data/interim/games.csv` | partidas e metadados das súmulas |
| `data/interim/disciplinary_records.csv` | registros disciplinares retornados pela API |
| `data/processed/card_events.csv` | um evento de cartão por linha, com justificativa limpa |
| `data/processed/keyword_tags/` | textos classificados, frequências e perfis por entidade |
| `data/processed/var_usage/` | menções ao VAR por partida, temporada, equipe e árbitro |
| `data/processed/classification_validation/` | métricas, predições e auditoria dos erros |
| `index.html` | dashboard estático pronto para publicação |
