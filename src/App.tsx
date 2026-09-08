import { lazy, Suspense } from 'react'
import { Route, Switch, Redirect } from 'wouter'
import { ErrorBoundary } from './components/cv/ErrorBoundary'

// Public routes — eager (crawled by Google, must load instantly)
import LandingPage from './pages/LandingPage'
import About from './pages/About'
import Privacy from './pages/Privacy'
import Terms from './pages/Terms'
import Blog from './pages/Blog'
import BlogPost from './pages/BlogPost'
import Opportunities from './pages/Opportunities'
import OpportunityDetail from './pages/OpportunityDetail'
import Jobs from './pages/Jobs'
import JobDetail from './pages/JobDetail'
import Contacto from './pages/Contacto'
import NotFound from './pages/NotFound'
import AuthCallback from './pages/AuthCallback'

// Market opportunity pages — lazy (geo-segmented, load on demand)
const MarketOpportunities = lazy(() => import('./pages/MarketOpportunities'))

// Heavy/private routes — lazy (not crawled, load on demand)
const Admin = lazy(() => import('./pages/Admin'))
const Cookies = lazy(() => import('./pages/Cookies'))
const Demo = lazy(() => import('./pages/Demo'))
const Recruiters = lazy(() => import('./pages/Recruiters'))
const BatchAnalysis = lazy(() => import('./pages/BatchAnalysis'))
const VacantePage = lazy(() => import('./pages/VacantePage'))
const Dashboard = lazy(() => import('./hub/Dashboard'))
const ProfileBuilder = lazy(() => import('./hub/ProfileBuilder'))
const JobMatcher = lazy(() => import('./hub/JobMatcher'))
const CVVivo = lazy(() => import('./hub/CVVivo'))
const ATSDiagnostic = lazy(() => import('./hub/ATSDiagnostic'))
const CVRewrite = lazy(() => import('./hub/CVRewrite'))
const ApplicationWorkspace = lazy(() => import('./hub/ApplicationWorkspace'))
const Alertas = lazy(() => import('./hub/Alertas'))
const Configuracion = lazy(() => import('./hub/Configuracion'))
const Assessments = lazy(() => import('./hub/Assessments'))
const LearningPlan = lazy(() => import('./hub/LearningPlan'))

function PageLoader() {
  return <div style={{ minHeight: '100vh', background: '#111111' }} />
}

export default function App() {
  return (
    <ErrorBoundary>
    <Suspense fallback={<PageLoader />}>
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/auth/callback" component={AuthCallback} />
      <Route path="/oportunidades" component={Opportunities} />
      {/* Market pages — regex with named capture; only matches the 4 known markets.
          All other /oportunidades/:slug paths fall through to OpportunityDetail below. */}
      <Route path={/^\/oportunidades\/(?<market>paraguay|peru|remoto-latam|latam)\/?$/i} component={MarketOpportunities} />
      <Route path="/oportunidades/:slug" component={OpportunityDetail} />
      <Route path="/empleos" component={Jobs} />
      <Route path="/empleos/:slug" component={JobDetail} />
      <Route path="/blog" component={Blog} />
      <Route path="/blog/:slug" component={BlogPost} />
      <Route path="/contacto" component={Contacto} />
      <Route path="/sobre-cvitae" component={About} />
      <Route path="/about"><Redirect to="/sobre-cvitae" /></Route>
      <Route path="/privacy" component={Privacy} />
      <Route path="/terminos" component={Terms} />
      <Route path="/cookies" component={Cookies} />
      <Route path="/admin" component={Admin} />
      <Route path="/demo" component={Demo} />
      {/* Canonical routes */}
      <Route path="/empresas" component={Recruiters} />
      <Route path="/empresas/masivo" component={BatchAnalysis} />
      <Route path="/vacante/:slug" component={VacantePage} />
      {/* Legacy redirects — keep for SEO */}
      <Route path="/reclutadores"><Redirect to="/empresas" /></Route>
      <Route path="/reclutadores/batch"><Redirect to="/empresas/masivo" /></Route>
      <Route path="/mi-carrera" component={Dashboard} />
      <Route path="/mi-carrera/perfil" component={ProfileBuilder} />
      <Route path="/mi-carrera/analizar" component={JobMatcher} />
      <Route path="/mi-carrera/cv" component={CVVivo} />
      <Route path="/mi-carrera/ats" component={ATSDiagnostic} />
      <Route path="/mi-carrera/mejorar" component={CVRewrite} />
      <Route path="/mi-carrera/postular/:slug" component={ApplicationWorkspace} />
      <Route path="/mi-carrera/postular" component={ApplicationWorkspace} />
      <Route path="/mi-carrera/alertas" component={Alertas} />
      <Route path="/mi-carrera/aprender" component={LearningPlan} />
      <Route path="/mi-carrera/oportunidades"><Redirect to="/oportunidades" /></Route>
      <Route path="/mi-carrera/configuracion" component={Configuracion} />
      <Route path="/mi-carrera/verificate" component={Assessments} />
      <Route component={NotFound} />
    </Switch>
    </Suspense>
    </ErrorBoundary>
  )
}
