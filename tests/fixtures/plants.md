# `plants.csv` — latitude / longitude fixture for the symbol-map smoke

Twelve rows: `plant, city, fuel, lat, lon, capacity_mw`. Used by
`tests/e2e/smoke.mjs` (opened "from device" through the dataset picker) to
drive the symbol map from `latitude` / `longitude` roles with the
`power-gen` icon set on the Shape shelf. It is a test fixture, not a dataset:
it never enters `data/datasets/` or the catalog.

**Coordinates.** Decimal-degree city-centre coordinates of the Texas city in
the `city` column, rounded to four decimals, as published in the GeoHack
coordinates of each city's English Wikipedia article (which cite the US
Geological Survey's Geographic Names Information System populated-place
records). They are city centres, not plant sites. Glen Rose (Comanche Peak)
is the one row where the plant name is real; its coordinate is still the
town's, not the station's.

**Fuel, plant names and capacities** are illustrative: plant names (except
Comanche Peak) are invented, capacities are round numbers chosen to spread
the bubble sizes, and the `fuel` labels (`Gas`, `Solar`, `Wind`, `Coal`,
`Storage`, `Nuclear`) are the keywords the `power-gen` icon set matches
(`docs/ICONS.md`).
