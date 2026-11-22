# Textures

`npm run textures` で [Solar System Scope](https://www.solarsystemscope.com/textures/) の 2K テクスチャ（CC BY 4.0）をここに取得します。
ファイルが無い天体は単色で描画されます。

`4k_*.jpg` は同じ Solar System Scope の 8K 版を 4096×2048 に縮めたもの（雲はグレースケール）。天体に近づいたときだけ読み込みます。

`milky_way_glow.jpg` は `2k_stars_milky_way.jpg` から星の点を削った天の川の淡い光（`python3 scripts/build-milkyway-glow.py`）。星そのものは `public/stars/bsc5.bin`（エール輝星星表、`npm run stars`）の点で描きます。

## as17-148-22727.jpg

アポロ17号の「ブルー・マーブル」（AS17-148-22727、1972-12-07、NASA・パブリックドメイン）。Apollo Flight Journal が載せている JSC のスキャン（`afj/ap17fj/photos/148-nn/AS17-148-22727.jpg`）を 720×720 に縮めたもの。章4 の見くらべで使う。
