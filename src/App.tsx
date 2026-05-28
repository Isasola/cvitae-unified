import { Route, Switch } from 'wouter'
import LandingPage from './pages/LandingPage'
import Dashboard from './hub/Dashboard'
import ProfileBuilder from './hub/ProfileBuilder'
import JobMatcher from './hub/JobMatcher'

export default function App() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/mi-carrera" component={Dashboard} />
      <Route path="/mi-carrera/perfil" component={ProfileBuilder} />
      <Route path="/mi-carrera/analizar" component={JobMatcher} />
      <Route path="/oportunidades">{() => <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center"><p>Oportunidades - Próximamente</p></div>}</Route>
      <Route path="/blog">{() => <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center"><p>Blog - Próximamente</p></div>}</Route>
      <Route>{() => <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center"><p>404 - Página no encontrada</p></div>}</Route>
    </Switch>
  )
}
