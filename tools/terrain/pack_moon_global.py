"""Pack the whole-Moon height map for flying the lander around the Moon (src/components/flight).

Source: LRO LOLA global LDEM 118 m (Mar 2014, NASA/GSFC, USGS Astrogeology), read remotely, one row per output row,
        columns averaged.  https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/Lunar_LRO_LOLA_Global_LDEM_118m_Mar2014.tif
Output: public/terrain/moon_global.webp, 2048 x 1024 equirectangular (lon -180..180 left to right, lat 90..-90 top to bottom),
        lossless; height = (R * 256 + G) * 4 - 9200 m, relative to the 1737.4 km sphere.

usage: python3 tools/terrain/pack_moon_global.py public/terrain/
"""
import os
import sys
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import rasterio
from PIL import Image
from rasterio.windows import Window

os.environ.setdefault('CURL_CA_BUNDLE', '/root/.ccr/ca-bundle.crt')
os.environ.setdefault('GDAL_DISABLE_READDIR_ON_OPEN', 'EMPTY_DIR')
SRC = '/vsicurl/https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/Lunar_LRO_LOLA_Global_LDEM_118m_Mar2014.tif'
W, H = 4096, 2048  # read size; written at half
STEP, OFFSET = 4.0, 9200.0


def main(out_dir):
    out = np.zeros((H, W), np.float32)

    def row(i):
        with rasterio.open(SRC) as d:
            r = int((i + 0.5) * d.height / H)
            a = d.read(1, window=Window(0, r, d.width, 1)).astype(np.float32)[0] * d.scales[0]
            out[i] = a.reshape(W, -1).mean(1)

    with ThreadPoolExecutor(16) as ex:
        list(ex.map(row, range(H)))
    half = out.reshape(H // 2, 2, W // 2, 2).mean((1, 3))
    q = np.clip(np.round((half + OFFSET) / STEP), 0, 65535).astype(np.uint16)
    rgb = np.zeros(q.shape + (3,), np.uint8)
    rgb[..., 0] = q >> 8
    rgb[..., 1] = q & 255
    Image.fromarray(rgb).save(os.path.join(out_dir, 'moon_global.webp'), lossless=True, method=6)
    print('height range', half.min(), half.max())


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'public/terrain/')
