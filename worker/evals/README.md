# Avaliações da AI

`cases.json` contém 96 perguntas de regressão sobre o acervo de 2020–2026. A suíte cobre partidas, estatísticas e rankings de times, jogadores, árbitros, períodos, aliases, erros de digitação, ambiguidades, ausência de resultados e perguntas fora do escopo.

Cada caso declara somente verificações observáveis na resposta pública do `/chat`: ferramenta executada, termos obrigatórios ou proibidos, alternativas de texto e quantidade de fontes. Os casos evitam comparar a redação inteira, porque a síntese natural pode variar sem alterar o resultado.

## Uso seguro

Por padrão, o runner apenas apresenta o plano e não faz chamadas:

```sh
npm run eval -- --category players --limit 5
```

Para executar de verdade, é necessário autorizar explicitamente o consumo de Workers AI:

```sh
npm run eval -- --category players --limit 5 --confirm-live
```

O intervalo padrão é de 6,5 segundos para respeitar o rate limit atual do endpoint. Para uma execução maior, grave o relatório:

```sh
npm run eval -- --limit 20 --confirm-live --output eval-results.json
```

Filtros disponíveis:

- `--category players,aliases_typos`
- `--per-category 5` para uma amostra equilibrada
- `--filter palmeiras`
- `--offset 20 --limit 10`
- `--delay-ms 6500`
- `--timeout-ms 90000`
- `--fail-on-error`

Use `npm run eval -- --help` para a lista completa. Uma execução dos 96 casos pode consumir grande parte da franquia diária; prefira lotes e compare modelos usando exatamente os mesmos IDs.

## Métricas

O relatório inclui taxa de aprovação global e de qualidade, falhas de infraestrutura separadas, resultados por categoria, latência p50/p95/máxima, ferramenta observada, número de fontes, contagem de tokens informada pelo modelo e falhas por regra. Perguntas e respostas são limitadas no relatório; nenhuma credencial ou segredo é lido ou gravado pelo runner.

A métrica de infraestrutura inclui rate limit, falha de rede, timeout, respostas 502/504 e o código explícito de cota diária. Erros internos do Worker continuam na métrica de qualidade para não esconder regressões da aplicação.
