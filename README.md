# The Hotspots: static site (gh-pages)

This branch holds only the built static site of The Hotspots, a NASA Space Apps Challenge 2026
entry for the challenge "Harmonization of MODIS and VIIRS Hot Spots". The source code is on the
main branch.

Live site: https://alonresearch.github.io/the-hotspots/

What is here: the minified app, the Natural Earth basemap and a cut of the real data build that
fits GitHub Pages. The whole world at the coarse map levels (H3 res 3 and 4), the world totals and
the 2027 forecast for the world. Full detail (res 5 map and res 6 place history, including the
Piedmont daily views) for Italy. Place history outside Italy is in the full build only.

The data come from NASA FIRMS active fire detections (MODIS Terra and Aqua, VIIRS S-NPP and
NOAA-20), harmonized to one VIIRS-equivalent unit per H3 cell and month.
