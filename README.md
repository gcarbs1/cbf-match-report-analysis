# CBF Match Report Analysis

Análise das súmulas oficiais do Campeonato Brasileiro Série A, com foco nas
justificativas de cartões e nas menções ao VAR. O pipeline de dados e o site
estático ficam centralizados neste repositório.

## Estrutura

- `index.html`: site estático pronto para publicação pelo GitHub Pages.
- `fonts/`: assets do site.
- `notebooks/`: coleta, limpeza, classificação, análise e geração do site.
- `data/`: dados locais brutos, intermediários e processados (ignorados pelo Git).
- `viz/`: gráficos e materiais derivados da análise.

## Ambiente local

O projeto usa Python 3.12.

```bash
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

## Pipeline

Execute os notebooks em ordem:

1. `0-data_collection.ipynb`
2. `1-data_clean.ipynb`
3. `2-keyword_tagging.ipynb`
4. `3-var-usage.ipynb`
5. `4-build_site.ipynb`
6. `5-classification_validation.ipynb`

O notebook `4-build_site.ipynb` atualiza diretamente os quatro blocos JSON
embutidos no `index.html` da raiz. Ele preserva o restante do HTML, CSS e
JavaScript da página.

Antes de publicar uma atualização, revise as mudanças:

```bash
git diff --stat
git diff -- index.html
```

## GitHub Pages

Para servir o site deste mesmo repositório, configure o GitHub Pages para
publicar a branch `main` a partir da pasta raiz (`/`). Como o `index.html` está
na raiz, não é necessário copiar artefatos para outro repositório.
