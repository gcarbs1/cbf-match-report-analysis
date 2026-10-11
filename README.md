# CBF Match Report Analysis

Analysis of the official Campeonato Brasileiro Série A match reports, focusing on
card justifications and VAR mentions. The data pipeline and static website are
centralized in this repository.

## Structure

- `index.html`: static website ready for GitHub Pages.
- `fonts/`: website assets.
- `notebooks/`: data collection, cleaning, classification, analysis, and website generation.
- `data/`: local raw, intermediate, and processed data (ignored by Git).
- `viz/`: charts and materials derived from the analysis.

## Pipeline

Run the notebooks in order:

1. `00-data_collection.ipynb`
2. `01-data_clean.ipynb`
3. `02-keyword_tagging.ipynb`
4. `03-var-usage.ipynb`
5. `04-build_site.ipynb`
6. `05-classification_validation.ipynb`

The `04-build_site.ipynb` notebook directly updates the four JSON blocks embedded
in the root `index.html`. It preserves the rest of the page's HTML, CSS, and
JavaScript.
