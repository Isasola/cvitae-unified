import { Route, Switch } from 'wouter'
import LandingPage from './pages/LandingPage'
import About from './pages/About'
import Privacy from './pages/Privacy'
import Opportunities from './pages/Opportunities'
import OpportunityDetail from './pages/OpportunityDetail'
import Admin from './pages/Admin'
import Blog from './pages/Blog'
import BlogPost from './pages/BlogPost'
import Terms from './pages/Terms'
import Cookies from './pages/Cookies'
import AuthCallback from './pages/AuthCallback'
import Dashboard from './hub/Dashboard'
import ProfileBuilder from './hub/ProfileBuilder'
import JobMatcher from './hub/JobMatcher'
import CVVivo from './hub/CVVivo'
import Alertas from './hub/Alertas'
import Configuracion from './hub/Configuracion'
import Recruiters from './pages/Recruiters'
import NotFound from './pages/NotFound'

export default function App() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/auth/callback" component={AuthCallback} />
      <Route path="/oportunidades" component={Opportunities} />
      <Route path="/oportunidades/:slug" component={OpportunityDetail} />
      <Route path="/blog" component={Blog} />
      <Route path="/blog/:slug" component={BlogPost} />
      <Route path="/about" component={About} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/terminos" component={Terms} />
      <Route path="/cookies" component={Cookies} />
      <Route path="/admin" component={Admin} />
      <Route path="/reclutadores" component={Recruiters} />
      <Route path="/mi-carrera" component={Dashboard} />
      <Route path="/mi-carrera/perfil" component={ProfileBuilder} />
      <Route path="/mi-carrera/analizar" component={JobMatcher} />
      <Route path="/mi-carrera/cv" component={CVVivo} />
      <Route path="/mi-carrera/alertas" component={Alertas} />
      <Route path="/mi-carrera/oportunidades" component={Dashboard} />
      <Route path="/mi-carrera/configuracion" component={Configuracion} />
      <Route component={NotFound} />
    </Switch>
  )
}
