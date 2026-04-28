import { useContext, useMemo } from '@lynx-js/react'
import { useLocation, useNavigate } from 'react-router'
import { KnownRoutePathsContext } from './lynx-file-router.js'
import { sortRoutePaths } from './collect-known-route-paths.js'

const box: Record<string, string | number> = {
  flex: 1,
  minHeight: '0px',
  display: 'flex',
  flexDirection: 'column',
  padding: '32rpx',
  backgroundColor: '#12121a',
}

const title: Record<string, string | number> = {
  fontSize: '44rpx',
  fontWeight: '700',
  color: '#e8e8f0',
}

const subtitle: Record<string, string | number> = {
  fontSize: '28rpx',
  color: '#8b8b9a',
  marginTop: '16rpx',
}

const pathText: Record<string, string | number> = {
  fontSize: '30rpx',
  color: '#a0a0b8',
  marginTop: '8rpx',
}

const listHeader: Record<string, string | number> = {
  fontSize: '26rpx',
  color: '#6c6c7a',
  marginTop: '32rpx',
  marginBottom: '12rpx',
}

const row: Record<string, string | number> = {
  padding: '20rpx 0',
  borderBottomWidth: '1px',
  borderBottomColor: '#2a2a3a',
}

const linkText: Record<string, string | number> = {
  fontSize: '28rpx',
  color: '#7eb8ff',
}

const hint: Record<string, string | number> = {
  fontSize: '24rpx',
  color: '#5a5a68',
  marginTop: '24rpx',
}

const DEFAULT_PATHS = ['/', '/tabs', '/not_layout', '/m3', '/native']

/**
 * Default 404: `view` / `text` and known paths (from `FileRouter`’s `knownPaths` or a short default list).
 */
export function TamerDefaultNotFound() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const fromContext = useContext(KnownRoutePathsContext)
  const paths = useMemo(
    () => sortRoutePaths(fromContext && fromContext.length > 0 ? fromContext : DEFAULT_PATHS),
    [fromContext],
  )

  return (
    <view style={box as object}>
      <text style={title as object}>404 — Not found</text>
      <text style={subtitle as object}>No route matches this path:</text>
      <text style={pathText as object}>{pathname || '/'}</text>
      <text style={listHeader as object}>Available routes</text>
      <scroll-view
        scroll-y
        style={
          {
            flex: 1,
            minHeight: '0px',
            maxHeight: '60%',
            marginTop: '8rpx',
          } as object
        }
      >
        {paths.map((href) => (
          <view
            key={href}
            style={row as object}
            bindtap={() => {
              'background only'
              void navigate(href, { replace: true })
            }}
          >
            <text style={linkText as object}>{href}</text>
          </view>
        ))}
      </scroll-view>
      <view
        style={row as object}
        bindtap={() => {
          'background only'
          void navigate('/', { replace: true })
        }}
      >
        <text style={linkText as object}>Go home → /</text>
      </view>
      <text style={hint as object}>
        Tap a path to open it. Set `knownPaths` on `FileRouter` to customize this list.
      </text>
    </view>
  )
}
