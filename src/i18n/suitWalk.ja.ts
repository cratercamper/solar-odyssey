// 宇宙服で地表を歩く（components/surface/SuitWalk.tsx・SuitWalkPanel.tsx）の文言（日本語）

export const suitWalkJa = {
  button: '👨‍🚀 宇宙服で外へ',
  buttonTip: '着陸船から出て、自分の足で歩いてみよう',
  back: '着陸船に戻る',
  /** 与圧ローバーのそばで出るボタン（PC は E キーでも） */
  boardCrew: '🚐 ミチカケに乗る',
  boardCrewKey: 'E キーでも乗れます',
  run: '走る',
  jump: '跳ぶ',
  hintPc: 'WASD で歩く・Shift で走る・Space で跳ぶ・ドラッグで見回す',
  hintTouch: '左のスティックで歩く・ドラッグで見回す',
  /** 重力ごとの歩き方（外へ出たとき、少しだけ出す） */
  gait: {
    walk: (g: string) => `重力 ${g} G。地球と同じように歩けます`,
    hop: (g: string) => `重力 ${g} G。アポロの宇宙飛行士のように、片足ずつ弾むように歩こう`,
    float: (g: string) => `重力 ${g} G。地面をけるだけで、ふわっと浮いてしまいます`,
  },
  edge: 'ここから先は、着陸船から離れすぎです',
  steps: (n: number) => `足あと ${n}`,
}
