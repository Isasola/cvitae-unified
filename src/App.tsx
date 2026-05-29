import { Route, Switch } from 'wouter'
import LandingPage from './pages/LandingPage'
import About from './pages/About'
import Privacy from './pages/Privacy'
import Opportunities from './pages/Opportunities'
import OpportunityDetail from './pages/OpportunityDetail'
import Admin from './pages/Admin'
import Blog from './pages/Blog'
import BlogPost from './pages/BlogPost'
import Dashboard from './hub/Dashboard'
import ProfileBuilder from './hub/ProfileBuilder'
import JobMatcher from './hub/JobMatcher'
import NotFound from './pages/NotFound'

export default function App() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/oportunidades" component={Opportunities} />
      <Route path="/oportunidades/:slug" component={OpportunityDetail} />
      <Route path="/blog" component={Blog} />
      <Route path="/blog/:slug" component={BlogPost} />
      <Route path="/about" component={About} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/admin" component={Admin} />
      <Route path="/mi-carrera" component={Dashboard} />
      <Route path="/mi-carrera/perfil" component={ProfileBuilder} />
      <Route path="/mi-carrera/analizar" component={JobMatcher} />
      <Route component={NotFound} />
    </Switch>
  )
}
