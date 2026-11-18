// components/surface/RoverHud.tsx の文言（日本語）

export const roverHudJa = {
  heading: '方位',
  tilt: '傾き',
  distance: '距離',
  rock: '岩',
  done: '完了',
  air: '空中',
  rcsTip: '姿勢制御の噴射剤（空中で◀▶・▼）',
  rcs: '噴射',
  airReserve: '残りは▼だけ',
  cruise: (kmh: number) => `巡航 ${kmh} km/h`,
  cruiseTip: 'ホイールで速さを変える・▼で止める・C でもどす',
  mouseOff: '画面をクリックするとマウスで運転できます',
  mouseOn: 'マウス ハンドル・ホイール 巡航の速さ・右クリック ジャンプ（長押しで高く）・空中では右ボタンかホイール手前で降りる・左クリック 採集・Esc マウスを離す',
  showMinimap: 'ミニマップを出す',
  map: '地図',
  minimap: 'ミニマップ',
  hideMinimap: 'ミニマップをたたむ',
  near: '近く',
  all: '全体',
}
