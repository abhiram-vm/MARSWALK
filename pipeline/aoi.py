"""The MARSWALK planning area, shared by every pipeline script. AI-assisted (Claude Code).

A 3 km square (about 0.0506 degrees on the Mars sphere) centred on the boxwork
unit, where Curiosity worked from mid 2025. Every route is computed inside it.
The first version used a 1.4 by 1.5 km area with the same centre.
"""
CENTER = (137.384, -4.803)          # lon, lat in degrees
HALF_DEG = 0.0253                   # half side; 1500 m at radius 3396190 m
AOI = {"west": CENTER[0] - HALF_DEG, "south": CENTER[1] - HALF_DEG,
       "east": CENTER[0] + HALF_DEG, "north": CENTER[1] + HALF_DEG}
