# Global power plants on a map

Every power plant in the World Resources Institute's Global Power Plant
Database, 34,936 of them, queried in the browser by DuckDB-WASM from a single
Parquet file in this repository and shown as a grid, a bubble map, a hex
density map, a choropleth by country, a bar chart by fuel and KPI tiles. The
map's viewport is a filter: drag the bubble map and every other window narrows
to the plants in view.

**[See it running](https://toclocoinc.github.io/lattice-grid-demo-geo-power/)**

| | |
| --- | --- |
| Grid on npm | [@toclocoinc/lattice-grid](https://www.npmjs.com/package/@toclocoinc/lattice-grid) |
| Grid repository | [toclocoinc/latticegrid](https://github.com/toclocoinc/latticegrid) |
| Product site | [latticegrid.dev](https://www.latticegrid.dev) |

## What it shows

- **Plants** — a grid of every plant: name, country, fuel, capacity (MW),
  commissioning year, location. Sorting and filtering are pushed down to
  DuckDB as SQL; the browser never holds the whole table as rows.
- **Bubble map** — each plant plotted at its coordinates, sized by capacity.
  Drag to pan, double-click or press `0` to reset. Panning re-queries: the
  grid, the charts and the KPIs all follow the map's viewport.
- **Density** — the same plants binned into hex cells by count, readable at
  world scale where 35,000 individual bubbles would overplot.
- **Capacity by country** — a choropleth of total MW per country, computed by
  a SQL join between the plants and the country outlines.
- **Capacity by fuel** — a bar chart from `source.aggregate()`; the chart
  never counts rows itself.
- **In view** — KPI tiles for plants in view and MW in view, refreshed as the
  viewport moves.

## Data

- `data/power-plants.parquet` (1.89 MB) — the
  [Global Power Plant Database v1.3](https://github.com/wri/global-power-plant-database)
  by World Resources Institute, converted from its CSV to Parquet with no
  change to the values. Licence: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- `data/countries.parquet` (157 KB) — country outlines from
  [Natural Earth](https://www.naturalearthdata.com/) (1:110m), public domain.

The page loads DuckDB-WASM from jsDelivr and reads both files from this
repository; nothing else is fetched.

## Grid features used

`duckdbAdapter` + `createPushdownSource` (SQL pushdown of sort, filter and
paging), `createGrid` with a `geometry` column type, `createHeadlessGrid`,
`createChart` with the `bubblemap`, `hexmap`, `choropleth` and `bar` types,
`viewportFilter` on the map, `source.aggregate()`, the `geo-world-110m`
outline pack, and the layout and KPI modules. Modules loaded:
`layout`, `charts`, `kpi`, `geometry`, `chart-bubblemap`, `chart-hexmap`,
`chart-choropleth`, `geo-world-110m`.

## Run it locally

Any static file server will do, for example:

```
npx serve .
```

or Python's built-in server:

```
python3 -m http.server
```

Open the page it prints. No licence key is needed on localhost; a key is
only required once the page is published on a real address, which is why
one appears in `index.html` for this demo's own published address.

## Licence

The code in this repository is available under the MIT licence. See
[LICENSE](LICENSE). The data licences are named above.

Lattice Grid itself is a separate commercial product with its own terms. It
is free to use on localhost, with no key and no watermark, so a copy of
this repository runs unrestricted on your own machine. This demo carries a
key for its own published address only, which is why you will find one in
the source. Keys for your own sites come from
[latticegrid.dev](https://www.latticegrid.dev).

This demo is built on Lattice Grid 1.73.0.
