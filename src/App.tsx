import { useEffect } from 'react'
import { HashRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { Swap, Value } from './components/Swap'
import { groove } from './lib/clips'
import { missionsDone } from './lib/course'
import { loadLibrary } from './lib/library'
import { getSettings, rankOf, streak, useProgress, xpOf } from './lib/progress'
import { Course } from './pages/Course'
import { Decks } from './pages/Decks'
import { DrillPage } from './pages/DrillPage'
import { Library } from './pages/Library'
import { Profile } from './pages/Profile'
import { Today } from './pages/Today'
import { Train } from './pages/Train'

declare const __BUILD_ID__: string

// The installed app's share target and file handlers open the real path /library; the router lives in the hash.
if (location.pathname === '/library') history.replaceState(null, '', `/#/library${location.search}`)

// offline support for the installed app (public/sw.js); the query makes each build install fresh
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  addEventListener('load', () => void navigator.serviceWorker.register(`/sw.js?v=${__BUILD_ID__}`))
}

const line = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

// the phone tab bar: plain line icons, the label shows on the current tab
const TABS = [
  {
    to: '/',
    label: 'Today',
    icon: (
      <>
        <rect x="4" y="5" width="16" height="15" rx="2" />
        <path d="M4 10h16M9 3v4M15 3v4" />
      </>
    ),
  },
  { to: '/train', label: 'Train', icon: <path d="M3 12h4l2-5 4 10 2-5h6" /> },
  { to: '/course', label: 'Course', icon: <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" /> },
  {
    to: '/library',
    label: 'Library',
    icon: (
      <>
        <path d="M9 18V5l11-2v13" />
        <circle cx="6.5" cy="18" r="2.5" />
        <circle cx="17.5" cy="16" r="2.5" />
      </>
    ),
  },
  {
    to: '/decks',
    label: 'Decks',
    icon: (
      <>
        <circle cx="7" cy="12" r="4.5" />
        <circle cx="17" cy="12" r="4.5" />
      </>
    ),
  },
  {
    to: '/profile',
    label: 'Profile',
    icon: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
      </>
    ),
  },
]

function Shell({ children }: { children: React.ReactNode }) {
  const s = useProgress()
  const xp = xpOf(s, missionsDone(s))
  const rank = rankOf(xp)
  const st = streak(s)
  const { pathname } = useLocation()
  return (
    <div className="app">
      <header className="top">
        <NavLink to="/" className="brand">
          openskool
        </NavLink>
        <nav>
          <NavLink to="/" end>
            Today
          </NavLink>
          <NavLink to="/train">Train</NavLink>
          <NavLink to="/course">Course</NavLink>
          <NavLink to="/library">Library</NavLink>
          <NavLink to="/decks">Decks</NavLink>
          <NavLink to="/profile">Profile</NavLink>
        </nav>
        <div className="stats">
          <span className="rank">
            <Value v={rank.name} />
          </span>
          <span aria-hidden="true">·</span>
          <span>
            <Value v={xp.toLocaleString()} /> XP
          </span>
          {st > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span>
                <Value v={st} />
                -day streak
              </span>
            </>
          )}
        </div>
      </header>
      <main>
        <Swap k={pathname}>{children}</Swap>
      </main>
      <footer>
        Open source, MIT. Your tracks and progress never leave this browser.
      </footer>
      <nav className="tabbar" aria-label="Sections">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.to === '/'} className="tab">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" {...line}>
              {t.icon}
            </svg>
            <span className="tab-label">{t.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

export default function App() {
  const { theme, motion } = useProgress().settings
  useEffect(() => {
    // light and dark follow the setting, or the system appearance live
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const apply = () => document.documentElement.classList.toggle('dark', theme === 'dark' || (theme === 'system' && mq.matches))
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])
  useEffect(() => {
    // .reduce-motion and .full-motion on <html> override the system preference in CSS and in Swap
    const mq = matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => {
      const html = document.documentElement.classList
      html.toggle('reduce-motion', motion === 'reduced' || (motion === 'system' && mq.matches))
      html.toggle('full-motion', motion === 'full')
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [motion])
  useEffect(() => {
    void loadLibrary()
    // render the built-in grooves for your genre in the background, so the first drill starts instantly
    const id = setTimeout(() => [1, 2, 3].forEach((seed) => void groove(getSettings().genre, seed)), 1500)
    return () => clearTimeout(id)
  }, [])
  return (
    <HashRouter>
      <Shell>
        <Routes>
          <Route path="/" element={<Today />} />
          <Route path="/train" element={<Train />} />
          <Route path="/train/:id" element={<DrillPage />} />
          <Route path="/course" element={<Course />} />
          <Route path="/library" element={<Library />} />
          <Route path="/decks" element={<Decks />} />
          <Route path="/profile" element={<Profile />} />
        </Routes>
      </Shell>
    </HashRouter>
  )
}
