/**
 * Global power plants: one GeoParquet file, read in the browser by
 * DuckDB-Wasm with the spatial extension loaded, behind a pushdown source.
 *
 * Everything downstream — the grid, the marker map, the choropleth, the
 * fuel-mix bar and the KPI tiles — reads the SAME DuckDB relation through
 * `createPushdownSource`. `fullDataset` (below) holds the whole 34,936-row
 * matching set client-side rather than a 200-row page: a marker map draws
 * from `grid.rows`, so a paged grid put 34,736 points "not on the map" —
 * every filter, the viewport bbox and the KPI/fuel-chart engine aggregates
 * still run in DuckDB per query; this only changes how many rows of the
 * *answer* the browser holds at once (F-GEODEMO-D, round 2).
 */

/** @returns {Promise<{connection:object, plants:object, countries:object}>} */
async function startDuckDB() {
    const duckdb = await import(/* webpackIgnore: true */ 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.32.0/+esm');
    const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());
    const worker = await duckdb.createWorker(bundle.mainWorker);
    const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(duckdb.LogLevel.ERROR), worker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    const connection = await db.connect();
    await connection.query('LOAD httpfs;');
    // Loaded here too (not just left to the adapter's own lazy load below)
    // because the countries join runs a raw query, straight over the
    // connection, before the grid ever asks the pushdown source for a page.
    await connection.query('INSTALL spatial; LOAD spatial;');

    const plantsUrl = new URL('./data/power-plants.parquet', location.href).href;
    const countriesUrl = new URL('./data/countries.parquet', location.href).href;

    // Both files are fetched whole and handed to DuckDB as in-memory buffers
    // rather than read over HTTP ranges. Some static hosts (GitHub Pages
    // among them) serve `.parquet` gzip-encoded and answer byte ranges over
    // the compressed body, so an HTTP filesystem that sizes the file from a
    // HEAD then reads its footer at the wrong offset. A plain fetch is
    // inflated by the browser and is exact; at 2 MB in total the whole-file
    // read is also the cheapest way to load them.
    const register = async (name, url) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
        await db.registerFileBuffer(name, new Uint8Array(await res.arrayBuffer()));
        return name;
    };
    const [plantsFile, countriesFile] = await Promise.all([
        register('power-plants.parquet', plantsUrl),
        register('countries.parquet', countriesUrl),
    ]);

    // One adapter per relation, both spatial-aware. `spatial: true` runs
    // `INSTALL spatial; LOAD spatial;` once per connection (a no-op here,
    // already loaded above) and projects the geometry column as GeoJSON so
    // the `geometry` type consumes it directly.
    const plantsAdapter = LatticeGrid.duckdbAdapter({
        connection, from: `read_parquet('${plantsFile}')`, spatial: true,
    });
    // `aggregates: { default: 'engine' }` is what actually lets the fuel-mix
    // bar's `aggregate: 'engine'` (GEO-5) push its sum into DuckDB; without
    // it the source computes every aggregate client-side regardless of what
    // an individual chart asks for, and `chart.provenance()` reports why.
    // `fullDataset.enabled` makes the whole-result fetch sticky: the entire
    // matching set (34,936 rows unfiltered) is held once per query rather
    // than paged, so the marker map and the grid agree on every row DuckDB
    // says matches. `maxRows`/`maxBytesEstimate` are generous headroom over
    // that count, not a measured requirement — the real figures (rows,
    // bytes over the wire, load time) are measured below and in the README.
    const plants = LatticeGrid.createPushdownSource({
        adapter: plantsAdapter, compute: LatticeGrid, pageSize: 200,
        aggregates: { default: 'engine' },
        fullDataset: { enabled: true, maxRows: 100000, maxBytesEstimate: 200_000_000 },
    });

    // The choropleth's own rows: capacity summed by country, joined to the
    // polygons in ONE SQL statement — a derived/aggregate query, not the
    // engine aggregate path (that is card GEO-5's `chart.provenance()`,
    // used below on the fuel-mix bar instead). 177 countries never scroll
    // or page, so this runs once and the choropleth reads plain memory rows.
    // `ST_AsGeoJSON` projects a plain GeoJSON string, the one shape every
    // JS-side arrow/wasm binding agrees on (a raw WKB blob column's exact
    // JS representation varies by binding), which the `geometry` type reads
    // directly.
    const joinRes = await connection.query(`
        SELECT c.iso_a3 AS iso_a3, c.name AS name, ST_AsGeoJSON(c.geometry) AS geometry,
               coalesce(sum(p.capacity_mw), 0) AS capacity_mw
        FROM read_parquet('${countriesFile}') c
        LEFT JOIN read_parquet('${plantsFile}') p ON p.country = c.iso_a3
        GROUP BY c.iso_a3, c.name, c.geometry
    `);
    const countryRows = joinRes.toArray().map((r) => r.toJSON());

    return {
        connection, plants, countryRows, plantsAdapter, plantsFileUrl: plantsUrl,
    };
}
