import { useEffect, useRef, useState } from 'react'

/** 確認用の #debug では自動で進めない（ブラウザの検査がカードを確かめる前に、次の章へ移ってしまわないように） */
const debugPage = () => typeof location !== 'undefined' && location.hash.includes('debug')

/**
 * 章の終わりのカード：sec 秒たったら、自動で次の章へ（go）。止めたいときは cancel()（「もう一度」などを押したとき）。
 * 残りの秒（止めたら null）を返す。毎秒、描き直す
 */
export function useAutoNext(go: () => void, sec: number, want = true) {
  const on = want && !debugPage()
  const [left, setLeft] = useState<number | null>(on ? sec : null)
  const goRef = useRef(go)
  goRef.current = go
  const cancelRef = useRef(() => {})
  useEffect(() => {
    if (!on) return
    setLeft(sec)
    let n = sec
    const id = window.setInterval(() => {
      n -= 1
      if (n <= 0) {
        window.clearInterval(id)
        setLeft(null)
        goRef.current()
      } else setLeft(n)
    }, 1000)
    cancelRef.current = () => {
      window.clearInterval(id)
      setLeft(null)
    }
    return () => window.clearInterval(id)
  }, [on, sec])
  return { left, cancel: () => cancelRef.current() }
}

/** cond が true になってから sec 秒たったら true（描き直しのきっかけがなくても、時間で出す） */
export function useAfter(cond: boolean, sec: number) {
  const [ok, setOk] = useState(false)
  useEffect(() => {
    setOk(false)
    if (!cond) return
    const id = window.setTimeout(() => setOk(true), sec * 1000)
    return () => window.clearTimeout(id)
  }, [cond, sec])
  return cond && ok
}
