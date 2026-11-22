# 映画のカットの確認の道具

月ミッションの打ち上げ（components/moonMission/LaunchWorld.tsx と launchFilm.ts）を、本物の写真とくらべるための道具です。CI では使いません。

1. `npm run build`（画面を変えたら毎回）
2. `SHOTS="9:refNight,30:refLiftoff" OUT=/tmp/shots node tools/film/shots.mjs`
   - 時刻は秒読みを始めてからの秒。T-8.9 で点火ボタンを押すので、点火は 11.1 秒、離昇は約 17〜20 秒。
   - 名前は `launchFilm.ts` の `Shot`。`refNight`・`refLiftoff` は手本の写真と同じ向きのカメラ（ふだんのカット割りには出ない）。
   - `QUALITY=low|medium|high`、`W`・`H` で画面の大きさ。
3. `python3 tools/film/compare.py /tmp/cmp.jpg 手本.jpg /tmp/shots/0030-refLiftoff.jpg --label 手本 アプリ`

手本の写真（NASA、パブリックドメイン）は `/mnt/project-files/moon-mission/ref/` にあります。

| 写真 | カメラ |
| --- | --- |
| S72-54813（11 月、満月とサーチライト） | `refNight` |
| S72-55070（12 月 7 日、塔を越えた直後） | `refLiftoff` |

注意：ブラウザーを使う確認（この道具・`tools/smoke`）は、同時に 2 つ走らせない（SwiftShader がとても遅くなる）。

## 「画面が変わらない時間」を測る（8 秒ルール）

- `DIST=dist OUT=/tmp/dull MAX=300 SKIP=150 node tools/film/dull.mjs && python3 tools/film/dull.py /tmp/dull`
  - おまかせの操縦で、画面の 1 秒ごとに 3D の絵を撮り、字幕・カメラ・場面・計器のカード（`data-dull`）を記録する。
  - `dull.py` は、何も変わらない秒が 8 秒（`--limit`）以上続いた所を長い順に出す。
  - `SKIP=150`：打ち上げ 150 秒後から（第1段は煙が重くて、コマ送りがとても遅い）。
- `OUT=/tmp/ascvid SKIP=150 node tools/film/ascentVideo.mjs`：上昇の後半を、画面の時間どおりに動画にする（`$OUT/ascent.mp4`）。
- コマ送り（`window.__moonFilm.step`）は R3F の時計を止めて進める。時計が動いていると、撮影にかかった本当の時間が次のコマから差し引かれ、早送りが遅く測れる。
