"use client"

import { useRef, useState } from "react"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"

import { formatMoney } from "@/lib/finance"

// CountUp: animates a number from 0 to `value` on mount. Formatting is built in
// (so it can be used directly from Server Components — no function prop crosses
// the client boundary): set `money` for currency, otherwise it renders a
// localized integer. SSR shows the final value, then the client replays from 0.
export function CountUp({
  value,
  money = false,
  currency = "TND",
  duration = 1,
  className,
}: {
  value: number
  money?: boolean
  currency?: string
  duration?: number
  className?: string
}) {
  const fmt = (n: number) =>
    money ? formatMoney(n, currency) : Math.round(n).toLocaleString()
  const ref = useRef<HTMLSpanElement>(null)
  const [text, setText] = useState(() => fmt(value))

  useGSAP(
    () => {
      const obj = { n: 0 }
      gsap.to(obj, {
        n: value,
        duration,
        ease: "power2.out",
        onUpdate: () => setText(fmt(obj.n)),
      })
    },
    { scope: ref, dependencies: [value] }
  )

  return (
    <span ref={ref} className={className}>
      {text}
    </span>
  )
}
