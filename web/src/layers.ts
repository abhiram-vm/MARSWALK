// Written with AI assistance (Claude Code). See docs/DATA_SOURCES.md for the
// provenance of every layer listed here.

export const TREK = 'https://trek.nasa.gov/tiles/Mars/EQ'

export type TrekLayer = {
  id: string
  label: string
  product: string
  mission: string
  instrument: string
  dataType: 'Optical' | 'Topographic' | 'Thermal'
  resolution: string
  credit: string
  maxNativeZoom: number
  opacity: number
  base: boolean
}

// maxNativeZoom is the deepest tile level each product's WMTSCapabilities.xml
// lists, confirmed by tile requests: deeper levels return 404.
export const TREK_LAYERS: TrekLayer[] = [
  {
    id: 'hirise',
    label: 'HiRISE orbital image',
    product: 'curiosity_hirise_mosaic',
    mission: 'Mars Reconnaissance Orbiter',
    instrument: 'HiRISE',
    dataType: 'Optical',
    resolution: 'served at about 0.6 m per pixel',
    credit: 'NASA/JPL-Caltech/University of Arizona',
    maxNativeZoom: 16,
    opacity: 1,
    base: true,
  },
  {
    id: 'ctx',
    label: 'CTX context image',
    product: 'Gale_CTX_BlockAdj_dd',
    mission: 'Mars Reconnaissance Orbiter',
    instrument: 'CTX',
    dataType: 'Optical',
    resolution: 'served at about 10 m per pixel',
    credit: 'NASA/JPL-Caltech/MSSS',
    maxNativeZoom: 12,
    opacity: 1,
    base: true,
  },
  {
    id: 'dem',
    label: 'Terrain model (picture of the 1 m DEM)',
    product: 'Gale_DEM_SMG_1m',
    mission: 'Mars Reconnaissance Orbiter',
    instrument: 'HiRISE stereo',
    dataType: 'Topographic',
    resolution: '1 m grid, shown as 8-bit grey',
    credit: 'NASA/JPL-Caltech/University of Arizona/USGS',
    maxNativeZoom: 14,
    opacity: 0.55,
    base: false,
  },
  {
    id: 'themis-night',
    label: 'Night-time thermal (context only)',
    product: 'THEMIS_NightIR_ControlledMosaics_100m_v2_oct2018',
    mission: 'Mars Odyssey',
    instrument: 'THEMIS',
    dataType: 'Thermal',
    resolution: '100 m per pixel',
    credit: 'NASA/JPL-Caltech/Arizona State University',
    maxNativeZoom: 9,
    opacity: 0.5,
    base: false,
  },
]

export const trekUrl = (product: string) =>
  `${TREK}/${product}/1.0.0/default/default028mm/{z}/{y}/{x}.png`

// Area of interest: boxwork unit, lower Mount Sharp, Gale crater.
export const AOI = {
  south: -4.816,
  west: 137.372,
  north: -4.79,
  east: 137.396,
}
