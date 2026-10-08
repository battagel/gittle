import { lazy, Suspense } from 'react'
import { HashRouter, Route, Routes } from 'react-router'
import { DesktopNotice } from './ui/components/DesktopNotice'
import { Landing } from './ui/screens/Landing'
import { LevelSelect } from './ui/screens/LevelSelect'

// The play screen pulls in the graph library; load it only when needed.
const Play = lazy(() => import('./ui/screens/Play').then((m) => ({ default: m.Play })))

export function App() {
  return (
    <HashRouter>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/levels" element={<LevelSelect />} />
          <Route path="/play/:levelId" element={<Play />} />
        </Routes>
      </Suspense>
      <DesktopNotice />
    </HashRouter>
  )
}
