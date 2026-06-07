"use client"

import { useRef } from "react"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"

// Reveal: fades + lifts its direct children in with a stagger on mount. Drop it
// around a grid/list of cards for a quick entrance. Children render normally —
// only the entrance is animated, so layout and SSR markup are unchanged.
export function Reveal({
  children,
  className,
  y = 16,
  stagger = 0.06,
  duration = 0.45,
  delay = 0,
}: {
  children: React.ReactNode
  className?: string
  y?: number
  stagger?: number
  duration?: number
  delay?: number
}) {
  const ref = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      const targets = ref.current?.children
      if (!targets || targets.length === 0) return
      gsap.from(targets, {
        autoAlpha: 0,
        y,
        duration,
        delay,
        stagger,
        ease: "power3.out",
      })
    },
    { scope: ref }
  )

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}
