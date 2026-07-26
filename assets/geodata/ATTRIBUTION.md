# Geodata attribution

`ne_110m_world.json` is the full **Natural Earth** 1:110m Admin 0 –
Countries dataset (177 countries, properties trimmed to
`name`/`id`/`iso_a3`, coordinates rounded to 6 decimals), version 5.x,
from <https://www.naturalearthdata.com/>.

`ne_110m_europe.json` is a subset (CONTINENT = Europe, properties trimmed to
`name`/`id`/`iso_a3`) of **Natural Earth** 1:110m Admin 0 – Countries,
version 5.x, from <https://www.naturalearthdata.com/>.

Region ids are kebab-cased long names and agree between the two files, so a
screenplay can switch source without renaming regions.

Natural Earth is in the **public domain**: free for any use, no permission
needed, credit appreciated. "Made with Natural Earth."
