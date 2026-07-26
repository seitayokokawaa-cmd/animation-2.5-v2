# Geodata attribution

`ne_110m_world.json` is the full **Natural Earth** 1:110m Admin 0 –
Countries dataset (177 countries, properties trimmed to
`name`/`id`/`iso_a3`, coordinates rounded to 6 decimals), version 5.x,
from <https://www.naturalearthdata.com/>.

`ne_50m_world.json` is the full **Natural Earth** 1:50m Admin 0 – Countries
dataset (242 countries, same trimming, coordinates rounded to 5 decimals) —
the close-up basemap: real border detail survives a `zoom-to` on a single
country.

`ne_110m_places.json` is **Natural Earth** 1:110m Populated Places
(simple), trimmed to `name`/`id`/`lon`/`lat`/`country`/`capital` — city
markers and labels.

`ne_110m_europe.json` is a subset (CONTINENT = Europe, properties trimmed to
`name`/`id`/`iso_a3`) of **Natural Earth** 1:110m Admin 0 – Countries,
version 5.x, from <https://www.naturalearthdata.com/>.

Region ids are kebab-cased long names and agree across all files, so a
screenplay can switch source without renaming regions.

Natural Earth is in the **public domain**: free for any use, no permission
needed, credit appreciated. "Made with Natural Earth."
