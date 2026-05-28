import { Route, Switch } from 'wouter'
import LandingPage from './pages/LandingPage'

export default function App() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/mi-carrera">{() => <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center"><p>Mi Carrera - Próximamente</p></div>}</Route>
      <Route path="/oportunidades">{() => <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center"><p>Oportunidades - Próximamente</p></div>}</Route>
      <Route path="/blog">{() => <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center"><p>Blog - Próximamente</p></div>}</Route>
      <Route>{() => <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center"><p>404 - Página no encontrada</p></div>}</Route>
    </Switch>
  )
}
