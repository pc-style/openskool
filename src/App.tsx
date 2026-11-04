import { useEffect } from 'react'
import { HashRouter, NavLink, Route, Routes } from 'react-router-dom'
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

function Shell({ children }: { children: React.ReactNode }) {
  const s = useProgress()
  const xp = xpOf(s, missionsDone(s))
  const rank = rankOf(xp)
  const st = streak(s)
  return (
    <div className="app">
      <header className="top">
        <NavLink to="/" className="brand">
          open<b>skool</b>
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
        <div className="stats" title={`${xp} XP`}>
          <span className="streak" title="Day streak">
            🔥 {st}
          </span>
          <span className="rank">{rank.name}</span>
          <span className="xp">{xp.toLocaleString()} XP</span>
        </div>
      </header>
      <main>{children}</main>
      <footer>
        Open source, MIT. Your tracks and progress never leave this browser.
      </footer>
    </div>
  )
}

export default function App() {
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
