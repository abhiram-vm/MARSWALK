"""Global Mars colour image for the story's opening globe. AI-assisted (Claude Code).

Viking MDIM 2.1 colour mosaic (NASA/USGS), from NASA Mars Trek, level 2:
4 by 8 tiles of 256 px, an equirectangular 2048 by 1024 image of the whole planet.
Writes web/src/data/globe.jpg (about 300 KB).
"""
import io
import pathlib
import urllib.request

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
URL = "https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/default/default028mm/{z}/{r}/{c}.jpg"


def main(z=2):
    rows, cols = 2 ** z, 2 ** (z + 1)
    out = Image.new("RGB", (cols * 256, rows * 256))
    for r in range(rows):
        for c in range(cols):
            req = urllib.request.Request(URL.format(z=z, r=r, c=c), headers={"User-Agent": "marswalk"})
            out.paste(Image.open(io.BytesIO(urllib.request.urlopen(req, timeout=60).read())).convert("RGB"), (c * 256, r * 256))
    dest = ROOT / "web" / "src" / "data" / "globe.jpg"
    out.save(dest, quality=80, optimize=True)
    print(dest, out.size, round(dest.stat().st_size / 1024), "KB")


if __name__ == "__main__":
    main()
