import { useCallback } from '@lynx-js/react'
import type { ReactNode } from '@lynx-js/react'
import { useTamerRouter } from './lynx-file-router.js'

type LinkProps = {
  to: string
  children?: ReactNode
  onClick?: (e: { preventDefault?: () => void }) => void
  style?: object
  className?: string
  replace?: boolean
  [key: string]: unknown
}

export function Link({ to, replace, onClick, children, style, className, href: _h, target: _t, ...rest }: LinkProps) {
  const { navigate: nav } = useTamerRouter()
  const handleTap = useCallback(() => {
    'background only'
    onClick?.({ preventDefault: () => {} })
    void nav(to, { replace: !!replace })
  }, [nav, to, onClick, replace])
  return (
    <view
      {...(rest as object)}
      class={className}
      style={style as object}
      bindtap={handleTap}
    >
      {typeof children === 'string' || typeof children === 'number' ? <text>{children}</text> : children}
    </view>
  )
}
