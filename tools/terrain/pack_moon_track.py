"""Pack the real lunar surface along the Apollo 17 descent track (chapter 7 of the Moon mission, LunarWorld.tsx).

The strip follows the descent orbit's ground track (data/lunarDescent.ts orbitPlane: over the landing site, heading
west) from about 1,350 km uprange to 100 km past the site, 240 km wide.  Coordinates: theta = angle along the track
(0 = above the site, negative = uprange / east), phi = angle across it (positive = towards the orbit normal N).

Sources (public domain, USGS Astrogeology, read remotely):
  albedo: SELENE (Kaguya) Multiband Imager 749 nm reflectance, 512 ppd (59 m), JAXA, photometrically normalised, so the
          hills and craters are not shaded in (the scene lights them itself, with the Sun of the landing day).  The LROC
          WAC morphologic mosaic (afternoon Sun, the opposite side to the landing-day Sun) is not used for that reason.
          https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/Lunar_MI_multispectral_maps/Lunar_Kaguya_MIMap_Band2_MV2_749nm_65N65S_512ppd.tif
          The gaps between its orbit strips are filled from the Clementine UVVIS 750 nm mosaic (118 m, also high Sun),
          matched to the Kaguya brightness around each gap.
          https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/Lunar_Clementine_UVVIS_750nm_Global_Mosaic_118m_v2.tif
  height: LOLA global LDEM, 118 m (March 2014), NASA/GSFC
          https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/Lunar_LRO_LOLA_Global_LDEM_118m_Mar2014.tif

Output (public/terrain/):
  moon_track_albedo.jpg  grey, ALB_W x ALB_H; brightness matched to textures/4k_moon.jpg over the same area
  moon_track_h.webp      lossless RGB, H_W x H_H: height = (R * 256 + G) * STEP - OFFSET (m, from the 1737.4 km sphere),
                         B = sunlight at landing time (255 lit, 0 in shadow), from the heights and SUN_DIR (lunarTerrain.ts)
  moon_track.json        grid and decoding

usage: pip install rasterio scipy pillow; python3 tools/terrain/pack_moon_track.py public/terrain/
"""
import json
import math
import os
import sys
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import rasterio
from PIL import Image
from rasterio.windows import Window
from scipy.ndimage import gaussian_filter, map_coordinates

os.environ.setdefault('CURL_CA_BUNDLE', '/root/.ccr/ca-bundle.crt')
os.environ.setdefault('GDAL_DISABLE_READDIR_ON_OPEN', 'EMPTY_DIR')
BASE = '/vsicurl/https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/'
MI = BASE + 'Lunar_MI_multispectral_maps/Lunar_Kaguya_MIMap_Band2_MV2_749nm_65N65S_512ppd.tif'
CLEM = BASE + 'Lunar_Clementine_UVVIS_750nm_Global_Mosaic_118m_v2.tif'
LOLA = BASE + 'Lunar_LRO_LOLA_Global_LDEM_118m_Mar2014.tif'

R_MOON = 1_737_400.0
SITE_LAT, SITE_LON = 20.18629, 30.76622
TH0, TH1 = -0.78, 0.06
PH = 0.07
ALB_W, ALB_H = 6144, 1024
H_W, H_H = 6144, 1024
STEP, OFFSET = 1.0, 9200.0
# 太陽：赤道の上、経度 107° の真上（lunarTerrain.ts の SUN_DIR と同じ）
SUN = np.array([math.cos(math.radians(107)), -0.02, -math.sin(math.radians(107))])
SUN /= np.linalg.norm(SUN)


def dir_of(lat, lon):
    lat, lon = np.radians(lat), np.radians(lon)
    return np.array([np.cos(lat) * np.cos(lon), np.sin(lat), -np.cos(lat) * np.sin(lon)])


UP = dir_of(SITE_LAT, SITE_LON)
EAST = np.cross([0, 1, 0], UP)
EAST /= np.linalg.norm(EAST)
P, Q = UP, -EAST
N = np.cross(P, Q)
N /= np.linalg.norm(N)


def grid(w, h):
    """pixel centres -> unit vectors (h, w, 3), and theta/phi"""
    th = TH0 + (np.arange(w) + 0.5) / w * (TH1 - TH0)
    ph = PH - (np.arange(h) + 0.5) / h * 2 * PH
    T, F = np.meshgrid(th, ph)
    d = np.cos(F)[..., None] * (np.cos(T)[..., None] * P + np.sin(T)[..., None] * Q) + np.sin(F)[..., None] * N
    return d, T, F


def lat_lon(d):
    return np.degrees(np.arcsin(np.clip(d[..., 1], -1, 1))), np.degrees(np.arctan2(-d[..., 2], d[..., 0]))


def read_region(src, lat, lon, margin=8):
    """the source rows/cols covering lat/lon, as a float array (NaN where there is no data), and the pixel coordinates
    of each sample. Works for simple-cylindrical maps in metres and in degrees, striped or tiled"""
    with rasterio.open(src) as ds:
        ppd = ds.width / 360.0
        scale, off, nodata = ds.scales[0], ds.offsets[0], ds.nodata
        width, height = ds.width, ds.height
        top = ds.bounds.top if ds.crs is None or ds.crs.is_geographic else ds.bounds.top / (math.pi * 1737400.0 / 180.0)
    col = (lon + 180.0) * ppd - 0.5
    row = (top - lat) * ppd - 0.5
    c0, c1 = int(col.min()) - margin, int(col.max()) + margin
    r0, r1 = max(0, int(row.min()) - margin), min(height - 1, int(row.max()) + margin)
    assert 0 <= c0 and c1 < width, 'the strip crosses the map edge'
    out = np.zeros((r1 - r0 + 1, c1 - c0 + 1), np.float32)
    band = 256

    def one(r):
        n = min(band, r1 + 1 - r)
        with rasterio.open(src) as ds:
            a = ds.read(1, window=Window(c0, r, c1 - c0 + 1, n))
        f = a.astype(np.float32) * scale + off
        if nodata is not None:
            f[a == nodata] = np.nan
        out[r - r0 : r - r0 + n] = f

    with ThreadPoolExecutor(16) as ex:
        list(ex.map(one, range(r0, r1 + 1, band)))
    print(os.path.basename(src), 'rows', r0, r1, 'cols', c0, c1, 'no data', float(np.isnan(out).mean()), flush=True)
    return out, row - r0, col - c0, ppd


def sample(region, rows, cols, out_px_m, src_px_m):
    # 縮めるぶんだけぼかしてから読む（細かい模様のちらつき防止）。データのない所は、まわりの平均で埋める
    if np.isnan(region).any():
        bad = np.isnan(region)
        fill = np.nanmean(region)
        region = np.where(bad, fill, region)
    k = out_px_m / src_px_m
    if k > 1.2:
        region = gaussian_filter(region, sigma=0.45 * k)
    return map_coordinates(region, [rows, cols], order=1, mode='nearest')


def sample_masked(src, lat, lon, out_m, erode=0, bad_below=None):
    """読んだ地図を出力の升目へ。データのない所（とそのふち erode 画素）を除いて平均し、値と、データの割合（0〜1）を返す"""
    from scipy.ndimage import binary_erosion

    region, rows, cols, ppd = read_region(src, lat, lon)
    src_m = 2 * math.pi * R_MOON / (ppd * 360)
    valid = ~np.isnan(region)
    if bad_below is not None:
        valid &= np.nan_to_num(region, nan=0) >= bad_below
    if erode:
        valid = binary_erosion(valid, iterations=erode)
    v = valid.astype(np.float32)
    region = np.where(valid, region, 0).astype(np.float32)
    k = out_m / src_m
    if k > 1.2:
        region = gaussian_filter(region, sigma=0.45 * k)
        v = gaussian_filter(v, sigma=0.45 * k)
    num = map_coordinates(region, [rows, cols], order=1, mode='nearest')
    den = map_coordinates(v, [rows, cols], order=1, mode='nearest')
    del region
    return np.where(den > 1e-3, num / np.maximum(den, 1e-3), 0), np.clip(den, 0, 1)


def shadow(h, T, F):
    """各点から太陽の向きへ高さの地図をたどり、さえぎられるか（1 日なた、0 影）。lunarTerrain.ts bakeShadow と同じ考え方"""
    hh, ww = h.shape
    px_th = (TH1 - TH0) / ww  # rad per pixel along
    px_ph = 2 * PH / hh
    d = np.cos(F)[..., None] * (np.cos(T)[..., None] * P + np.sin(T)[..., None] * Q) + np.sin(F)[..., None] * N
    e_th = -np.sin(T)[..., None] * P + np.cos(T)[..., None] * Q  # d/dtheta (length cos(phi))
    e_ph = N - np.sin(F)[..., None] * d / np.maximum(np.cos(F)[..., None], 1e-6)
    e_ph = np.cos(F)[..., None] * N - np.sin(F)[..., None] * (np.cos(T)[..., None] * P + np.sin(T)[..., None] * Q)
    su = d @ SUN
    st = (e_th @ SUN) / np.cos(F)
    sp = e_ph @ SUN
    flat = np.hypot(st, sp) + 1e-9
    tan_el = su / flat
    # 太陽の向き、1 m あたりの画素
    di = st / flat / (R_MOON * np.cos(F) * px_th)
    dj = -sp / flat / (R_MOON * px_ph)
    jj, ii = np.mgrid[0:hh, 0:ww].astype(np.float32)
    h0 = h + 1.0
    lit = np.ones_like(h)
    cell = R_MOON * px_ph
    t = cell
    while t < 45_000:
        g = map_coordinates(h, [jj + dj * t, ii + di * t], order=1, mode='nearest')
        ray = h0 + t * tan_el + t * t / (2 * R_MOON)
        k = (ray - g) / (t * 0.009) + 0.5
        lit = np.minimum(lit, k)
        t = t * 1.07 + cell * 0.3
    lit[su <= 0] = 0
    return np.clip(lit, 0, 1)


def global_albedo_mean(d):
    """textures/4k_moon.jpg を同じ点で読んだ明るさ（線形）。帯の明るさをこれにそろえる"""
    path = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'textures', '4k_moon.jpg')
    img = np.asarray(Image.open(path).convert('L'), np.float32) / 255.0
    lat, lon = lat_lon(d)
    h, w = img.shape
    # LunarWorld.tsx：uv.x = (lon + PI) / 2PI - 42/2048
    u = ((np.radians(lon) + math.pi) / (2 * math.pi) - 42 / 2048) % 1.0 * w - 0.5
    v = (90 - lat) / 180 * h - 0.5
    g = map_coordinates(img, [v, u], order=1, mode='nearest')
    return float(np.mean(g ** 2.2))


def main(out_dir):
    # 高さ
    d, T, F = grid(H_W, H_H)
    lat, lon = lat_lon(d)
    region, rows, cols, ppd = read_region(LOLA, lat, lon)
    src_m = 2 * math.pi * R_MOON / (ppd * 360)
    out_m = R_MOON * 2 * PH / H_H
    h = sample(region, rows, cols, out_m, src_m)
    del region
    sun = shadow(h, T, F)
    q = np.clip(np.round((h + OFFSET) / STEP), 0, 65535).astype(np.uint16)
    rgb = np.zeros(q.shape + (3,), np.uint8)
    rgb[..., 0] = q >> 8
    rgb[..., 1] = q & 255
    rgb[..., 2] = np.round(sun * 255).astype(np.uint8)
    Image.fromarray(rgb).save(os.path.join(out_dir, 'moon_track_h.webp'), lossless=True, method=6)
    print('height', h.min(), h.max(), 'shadow share', float((sun < 0.5).mean()), 'px', round(out_m), 'm', flush=True)

    # 色（明るさ）
    d, T, F = grid(ALB_W, ALB_H)
    lat, lon = lat_lon(d)
    out_m = R_MOON * 2 * PH / ALB_H
    a, ok = sample_masked(MI, lat, lon, out_m, erode=10)
    c, cok = sample_masked(CLEM, lat, lon, out_m, erode=2, bad_below=1)
    # かぐやの帯のすき間を、クレメンタインの明るさを、すき間のまわりのかぐやに合わせて埋める
    both = ok * cok
    sig = 24
    ratio = gaussian_filter(a * both, sig) / np.maximum(gaussian_filter(c * both, sig), 1e-6)
    cover = gaussian_filter(both, sig)
    gl = float(np.sum(a * both) / max(1e-6, np.sum(c * both)))
    ratio = np.where(cover > 0.05, ratio, gl)
    fill = c * ratio
    w = np.clip((ok - 0.2) / 0.6, 0, 1)
    a = np.maximum(a * w + fill * (1 - w), 0)
    print('albedo gaps', float((ok < 0.5).mean()), 'clementine gaps', float((cok < 0.5).mean()), flush=True)
    # 地図の明るさを、月全体の地図（同じ場所）の平均にそろえる。jpg は sRGB の 8 ビットなので、線形の値を 2.2 乗根で入れる
    want = global_albedo_mean(d)
    lin = a / max(1e-6, float(np.mean(a))) * want
    hi = float(np.percentile(lin, 99.9))
    gain = 1.0 / hi  # 0..1 に入れ、シェーダーで 1/gain を掛けて戻す
    enc = np.clip(lin * gain, 0, 1) ** (1 / 2.2)
    Image.fromarray(np.round(enc * 255).astype(np.uint8), 'L').save(os.path.join(out_dir, 'moon_track_albedo.jpg'), quality=88, optimize=True)
    print('albedo mean', want, 'scale', 1 / gain, 'px', round(out_m), 'm', flush=True)

    meta = {
        'decode': 'theta = TH0 + u * (TH1 - TH0) (u = 0 left), phi = PH - v * 2 PH (v = 0 top); d = cos(phi)(cos(theta) P + sin(theta) Q) + sin(phi) N',
        'site': [SITE_LAT, SITE_LON],
        'th0': TH0,
        'th1': TH1,
        'ph': PH,
        'height': {'w': H_W, 'h': H_H, 'step': STEP, 'offset': OFFSET, 'shadow': 'B channel'},
        'albedo': {'w': ALB_W, 'h': ALB_H, 'scale': round(1 / gain, 5), 'encoding': 'linear = (v/255)^2.2 * scale'},
        'attribution': 'JAXA/SELENE Multiband Imager 749 nm (albedo), NASA/GSFC LOLA (height), via USGS Astrogeology',
        'licence': 'public domain',
    }
    with open(os.path.join(out_dir, 'moon_track.json'), 'w') as f:
        json.dump(meta, f, indent=2)


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'public/terrain/')
