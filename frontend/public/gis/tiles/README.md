# Local Georeferenced Satellite Raster Tiles (QGIS Export)

This directory is reserved for locally hosted satellite imagery tiles generated from QGIS.

## Structure
Tiles are expected in standard XYZ / Slippy map format:
`public/gis/tiles/{z}/{x}/{y}.png`

For example:
- `public/gis/tiles/16/55198/29218.png`
- `public/gis/tiles/17/110396/58436.png`
- `public/gis/tiles/18/220792/116872.png`

## How to Export from QGIS:
1. Load your georeferenced satellite raster / GeoTIFF into QGIS.
2. Open **Processing Toolbox** > **Raster tools** > **Generate XYZ tiles (Directory)**.
3. Set the Extent to the Villa Karangahan Boundary layer extent.
4. Set Minimum Zoom (e.g. 15) and Maximum Zoom (e.g. 19).
5. Output directory: `public/gis/tiles`.
6. Run the tool. The tiles will automatically be served by Next.js at `/gis/tiles/{z}/{x}/{y}.png`.

