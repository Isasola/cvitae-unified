import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, FileText, Users, Zap, Ticket, LogOut, Save, X,
  Edit, Trash2, Eye, EyeOff, CheckCircle, AlertCircle, Lock, Plus, RefreshCw,
} from 'lucide-react'
import { GlassCard, GoldButton, Badge } from '@/components/cvitae/UI-Elements'

interface ContentItem {
  id?: string
  titulo: string
  slug: string
  cuerpo: string
  categoria: string
  imagen_url: string
  fecha_vencimiento: string
  tipo: 'blog' | 'oportunidad' | 'beca' | 'foro'
  ubicacion: string
  is_active: boolean
}

interface Subscriber {
  id: string
  email: string
  full_name: string
  professional_title: string
  skills: string[]
  seniority: string
  is_subscribed: boolean
  created_at: string
  user_id: string
}

interface SkillCandidate {
  id: number
  term: string
  normalized: string
  mention_count: number
  first_seen: string
  last_seen: string
  status: 'pending' | 'approved' | 'rejected'
}

const CATEGORIES = ['Tecnología', 'Administración', 'Ventas', 'Marketing', 'Salud', 'Educación', 'Logística', 'Otros']

export default function Admin() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [password, setPassword] = useState('')
  const [activeTab, setActiveTab] = useState<'dashboard' | 'contenido' | 'suscriptores' | 'skills' | 'tokens'>('dashboard')
  const [loading, setLoading] = useState(false)
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const [items, setItems] = useState<ContentItem[]>([])
  const [subscribers, setSubscribers] = useState<Subscriber[]>([])
  const [skillCandidates, setSkillCandidates] = useState<SkillCandidate[]>([])
  const [metrics, setMetrics] = useState({ usuarios: 0, matches: 0, oportunidades: 0, suscriptores: 0 })

  const [formData, setFormData] = useState<ContentItem>({
    titulo: '', slug: '', cuerpo: '', categoria: 'Tecnología', imagen_url: '', fecha_vencimiento: new Date().toISOString().split('T')[0], tipo: 'blog', ubicacion: 'Asunción, Paraguay', is_active: true
  })
  const [isEditing, setIsEditing] = useState(false)

  // Tokens state
  const [tokens, setTokens] = useState<any[]>([])
  const [tokenEmail, setTokenEmail] = useState('')
  const [tokenBalance, setTokenBalance] = useState(10)
  const [tokenPlan, setTokenPlan] = useState('starter')

  useEffect(() => {
    if (isAuthenticated) {
      loadContent()
      loadSubscribers()
      loadSkillCandidates()
      loadMetrics()
      loadTokens()
    }
  }, [isAuthenticated, activeTab])

  const loadContent = async () => {
    const { data } = await supabase.from('content_hub').select('*').order('created_at', { ascending: false })
    if (data) setItems(data)
  }

  const loadSubscribers = async () => {
    const { data } = await supabase.from('user_master_profiles').select('*').order('created_at', { ascending: false })
    if (data) setSubscribers(data as Subscriber[])
  }

  const loadSkillCandidates = async () => {
    const { data } = await supabase.from('skill_candidates').select('*').order('mention_count', { ascending: false })
    if (data) setSkillCandidates(data as SkillCandidate[])
  }

  const loadMetrics = async () => {
    const [usersRes, oppsRes, subsRes] = await Promise.all([
      supabase.from('user_master_profiles').select('id', { count: 'exact', head: true }),
      supabase.from('content_hub').select('id', { count: 'exact', head: true }).eq('is_active', true).eq('tipo', 'oportunidad'),
      supabase.from('user_master_profiles').select('id', { count: 'exact', head: true }).eq('is_subscribed', true)
    ])
    setMetrics({
      usuarios: usersRes.count || 0,
      matches: 0,
      oportunidades: oppsRes.count || 0,
      suscriptores: subsRes.count || 0
    })
  }

  const loadTokens = async () => {
    const { data } = await supabase.from('recruiter_tokens').select('*').order('created_at', { ascending: false })
    if (data) setTokens(data)
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const response = await fetch('/.netlify/functions/admin-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const data = await response.json()
      if (response.ok && data.authenticated) {
        setIsAuthenticated(true)
        setNotification({ type: 'success', message: 'Bienvenido al panel de administración' })
      } else {
        setNotification({ type: 'error', message: data.error || 'Contraseña incorrecta' })
      }
    } catch { setNotification({ type: 'error', message: 'Error de conexión' }) }
    finally { setLoading(false) }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const dataToSave = { ...formData, fecha_vencimiento: `${formData.fecha_vencimiento}T23:59:59Z` }
      if (formData.tipo === 'blog') dataToSave.fecha_vencimiento = '2099-12-31T23:59:59Z'
      const { error } = isEditing && formData.id
        ? await supabase.from('content_hub').update(dataToSave).eq('id', formData.id)
        : await supabase.from('content_hub').insert([dataToSave])
      if (error) throw error
      setNotification({ type: 'success', message: isEditing ? 'Actualizado correctamente' : 'Creado correctamente' })
      resetForm()
      loadContent()
    } catch (err: any) { setNotification({ type: 'error', message: err.message }) }
    finally { setLoading(false) }
  }

  const toggleSubscription = async (userId: string, currentValue: boolean) => {
    await supabase.from('user_master_profiles').update({ is_subscribed: !currentValue }).eq('user_id', userId)
    loadSubscribers()
    setNotification({ type: 'success', message: \`Suscripción \${!currentValue ? 'activada' : 'desactivada'}\` })
  }

  const approveSkill = async (id: number) => {
    await supabase.from('skill_candidates').update({ status: 'approved' }).eq('id', id)
    loadSkillCandidates()
    setNotification({ type: 'success', message: 'Habilidad aprobada' })
  }

  const rejectSkill = async (id: number) => {
    await supabase.from('skill_candidates').update({ status: 'rejected' }).eq('id', id)
    loadSkillCandidates()
    setNotification({ type: 'success', message: 'Habilidad rechazada' })
  }

  const generateToken = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const newToken = \`REC-\${Math.random().toString(36).substring(2, 8).toUpperCase()}-\${new Date().getFullYear()}\`
    try {
      const { error } = await supabase.from('recruiter_tokens').insert([{
        email: tokenEmail,
        token_balance: tokenBalance,
        access_token: newToken,
        plan_type: tokenPlan,
        is_active: true
      }])
      if (error) throw error
      setNotification({ type: 'success', message: 'Token generado con éxito' })
      setTokenEmail('')
      loadTokens()
    } catch (err: any) { setNotification({ type: 'error', message: err.message }) }
    finally { setLoading(false) }
  }

  const toggleStatus = async (item: ContentItem) => {
    await supabase.from('content_hub').update({ is_active: !item.is_active }).eq('id', item.id)
    loadContent()
  }

  const deleteItem = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar este contenido?')) return
    await supabase.from('content_hub').delete().eq('id', id)
    loadContent()
  }

  const resetForm = () => {
    setFormData({ titulo: '', slug: '', cuerpo: '', categoria: 'Tecnología', imagen_url: '', fecha_vencimiento: new Date().toISOString().split('T')[0], tipo: 'blog', ubicacion: 'Asunción, Paraguay', is_active: true })
    setIsEditing(false)
  }

  const handleEdit = (item: ContentItem) => {
    setFormData({ ...item, fecha_vencimiento: item.fecha_vencimiento.split('T')[0] })
    setIsEditing(true)
    setActiveTab('contenido')
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <GlassCard className="w-full max-w-md">
          <div className="text-center mb-6">
            <Lock className="w-12 h-12 text-[#c9a84c] mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-white">Panel de Control</h1>
            <p className="text-[#888888] text-sm mt-2">Ingresá la contraseña maestra</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Contraseña"
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-[#c9a84c]/50" />
            <GoldButton type="submit" className="w-full" disabled={loading}>{loading ? 'Accediendo...' : 'Acceder'}</GoldButton>
          </form>
          {notification && (
            <div className={\`mt-4 p-3 rounded-xl text-sm \${notification.type === 'success' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}\`}>
              {notification.message}
            </div>
          )}
        </GlassCard>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black flex">
      <div className="w-64 border-r border-white/5 bg-[#0a0a0a] flex flex-col p-6 fixed h-full">
        <div className="mb-8">
          <span style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.5rem', color: '#c9a84c' }}>
            <span style={{ fontWeight: 900 }}>CV</span><span style={{ fontStyle: 'italic', fontWeight: 400 }}>itae</span>
          </span>
          <p className="text-xs text-[#888888] mt-1">Admin Panel</p>
        </div>
        <nav className="flex-grow space-y-2">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
            { id: 'contenido', label: 'Contenido', icon: FileText },
            { id: 'suscriptores', label: 'Suscriptores', icon: Users },
            { id: 'skills', label: 'Skills IA', icon: Zap },
            { id: 'tokens', label: 'Tokens B2B', icon: Ticket },
          ].map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
              className={\`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all \${activeTab === tab.id ? 'bg-[#c9a84c] text-black font-bold' : 'text-[#888888] hover:bg-white/5'}\`}>
              <tab.icon size={18} /> {tab.label}
            </button>
          ))}
        </nav>
        <button onClick={() => setIsAuthenticated(false)} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-400 hover:bg-red-500/10 transition-all mt-4">
          <LogOut size={18} /> Cerrar Sesión
        </button>
      </div>

      <div className="flex-grow ml-64 p-8">
        <AnimatePresence mode="wait">
          <motion.div key={activeTab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>

            {activeTab === 'dashboard' && (
              <div>
                <h2 className="text-2xl font-bold text-white mb-6">Dashboard</h2>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                  {[
                    { label: 'Usuarios', value: metrics.usuarios, icon: Users },
                    { label: 'Suscriptores', value: metrics.suscriptores, icon: Zap },
                    { label: 'Oportunidades', value: metrics.oportunidades, icon: FileText },
                    { label: 'Skills Candidatas', value: skillCandidates.filter(s => s.status === 'pending').length, icon: Zap },
                  ].map((m, i) => (
                    <GlassCard key={i}>
                      <m.icon className="w-8 h-8 text-[#c9a84c] mb-3" />
                      <p className="text-3xl font-bold text-white">{m.value}</p>
                      <p className="text-sm text-[#888888]">{m.label}</p>
                    </GlassCard>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'contenido' && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold text-white">Contenido ({items.length})</h2>
                  <GoldButton onClick={() => { resetForm(); setActiveTab('contenido') }}><Plus size={18} /> Nuevo</GoldButton>
                </div>
                <GlassCard className="mb-8">
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <input name="titulo" value={formData.titulo} onChange={(e) => setFormData(prev => ({ ...prev, titulo: e.target.value, slug: e.target.value.toLowerCase().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '') }))} placeholder="Título" required className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-[#c9a84c]/50" />
                      <input name="slug" value={formData.slug} onChange={(e) => setFormData(prev => ({ ...prev, slug: e.target.value }))} placeholder="Slug" required className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-[#c9a84c]/50" />
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <select name="tipo" value={formData.tipo} onChange={(e) => setFormData(prev => ({ ...prev, tipo: e.target.value as any }))} className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-[#c9a84c]/50">
                        <option value="blog">Blog</option>
                        <option value="oportunidad">Oportunidad</option>
                        <option value="beca">Beca</option>
                        <option value="foro">Foro</option>
                      </select>
                      <select name="categoria" value={formData.categoria} onChange={(e) => setFormData(prev => ({ ...prev, categoria: e.target.value }))} className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-[#c9a84c]/50">
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <input name="ubicacion" value={formData.ubicacion} onChange={(e) => setFormData(prev => ({ ...prev, ubicacion: e.target.value }))} placeholder="Ubicación" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-[#c9a84c]/50" />
                    </div>
                    <textarea name="cuerpo" value={formData.cuerpo} onChange={(e) => setFormData(prev => ({ ...prev, cuerpo: e.target.value }))} placeholder="Contenido (Markdown)" rows={8} required className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-[#c9a84c]/50 resize-none" />
                    <div className="flex justify-end gap-3">
                      {isEditing && <GoldButton variant="ghost" onClick={resetForm}>Cancelar</GoldButton>}
                      <GoldButton type="submit" disabled={loading}><Save size={18} /> {isEditing ? 'Actualizar' : 'Publicar'}</GoldButton>
                    </div>
                  </form>
                </GlassCard>
                <div className="space-y-2">
                  {items.map((item) => (
                    <GlassCard key={item.id} className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge variant={item.tipo === 'blog' ? 'gold' : 'muted'}>{item.tipo}</Badge>
                          <span className="text-white font-medium">{item.titulo}</span>
                        </div>
                        <p className="text-xs text-[#888888] mt-1">/{item.slug}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => toggleStatus(item)} className={\`p-2 rounded-lg \${item.is_active ? 'text-green-400 bg-green-400/10' : 'text-red-400 bg-red-400/10'}\`}>{item.is_active ? <Eye size={16} /> : <EyeOff size={16} />}</button>
                        <button onClick={() => handleEdit(item)} className="p-2 rounded-lg text-[#888888] hover:text-white hover:bg-white/5"><Edit size={16} /></button>
                        <button onClick={() => deleteItem(item.id!)} className="p-2 rounded-lg text-[#888888] hover:text-red-400 hover:bg-red-400/10"><Trash2 size={16} /></button>
                      </div>
                    </GlassCard>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'suscriptores' && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold text-white">Suscriptores ({subscribers.length})</h2>
                  <GoldButton variant="ghost" onClick={loadSubscribers}><RefreshCw size={16} /></GoldButton>
                </div>
                <div className="space-y-2">
                  {subscribers.map((sub) => (
                    <GlassCard key={sub.id} className="flex items-center justify-between">
                      <div>
                        <p className="text-white font-medium">{sub.full_name || 'Sin nombre'}</p>
                        <p className="text-sm text-[#888888]">{sub.email}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {sub.skills?.slice(0, 3).map(skill => <span key={skill} className="px-2 py-0.5 rounded-md bg-white/5 text-xs text-[#888888]">{skill}</span>)}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-sm text-[#888888]">{sub.seniority || 'Junior'}</span>
                        <button onClick={() => toggleSubscription(sub.user_id, sub.is_subscribed)}
                          className={\`px-3 py-1.5 rounded-lg text-xs font-bold transition-all \${sub.is_subscribed ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-white/5 text-[#888888] border border-white/10'}\`}>
                          {sub.is_subscribed ? 'Pro' : 'Free'}
                        </button>
                      </div>
                    </GlassCard>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'skills' && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold text-white">Skills Candidatas</h2>
                  <Badge variant="gold">{skillCandidates.filter(s => s.status === 'pending').length} pendientes</Badge>
                </div>
                <div className="space-y-2">
                  {skillCandidates.map((skill) => (
                    <GlassCard key={skill.id} className="flex items-center justify-between">
                      <div>
                        <p className="text-white font-medium">{skill.term} → <span className="text-[#c9a84c]">{skill.normalized}</span></p>
                        <p className="text-xs text-[#888888]">{skill.mention_count} menciones · Desde {new Date(skill.first_seen).toLocaleDateString()}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={skill.status === 'pending' ? 'warning' : skill.status === 'approved' ? 'gold' : 'muted'}>
                          {skill.status}
                        </Badge>
                        {skill.status === 'pending' && (
                          <>
                            <button onClick={() => approveSkill(skill.id)} className="p-2 rounded-lg text-green-400 bg-green-400/10 hover:bg-green-400/20"><CheckCircle size={16} /></button>
                            <button onClick={() => rejectSkill(skill.id)} className="p-2 rounded-lg text-red-400 bg-red-400/10 hover:bg-red-400/20"><X size={16} /></button>
                          </>
                        )}
                      </div>
                    </GlassCard>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'tokens' && (
              <div>
                <h2 className="text-2xl font-bold text-white mb-6">Tokens B2B</h2>
                <GlassCard className="mb-8">
                  <form onSubmit={generateToken} className="space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                      <input type="email" value={tokenEmail} onChange={(e) => setTokenEmail(e.target.value)} placeholder="Email del reclutador" required
                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-[#c9a84c]/50" />
                      <input type="number" value={tokenBalance} onChange={(e) => setTokenBalance(parseInt(e.target.value))} placeholder="Balance de tokens" required
                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-[#c9a84c]/50" />
                      <select value={tokenPlan} onChange={(e) => setTokenPlan(e.target.value)}
                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-[#c9a84c]/50">
                        <option value="starter">Starter (10)</option>
                        <option value="pro">Pro (100)</option>
                        <option value="enterprise">Enterprise (Inf)</option>
                      </select>
                    </div>
                    <GoldButton type="submit" disabled={loading}>Generar Token</GoldButton>
                  </form>
                </GlassCard>
                <div className="space-y-2">
                  {tokens.map((token) => (
                    <GlassCard key={token.id} className="flex items-center justify-between">
                      <div>
                        <p className="text-white font-medium">{token.email}</p>
                        <p className="text-sm text-[#c9a84c] font-mono">{token.access_token}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-white">{token.token_balance} tokens</p>
                        <p className="text-xs text-[#888888]">{token.plan_type}</p>
                      </div>
                    </GlassCard>
                  ))}
                </div>
              </div>
            )}

          </motion.div>
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {notification && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
            className={\`fixed bottom-8 right-8 p-4 rounded-xl flex items-center gap-3 text-sm shadow-2xl z-50 \${notification.type === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}\`}>
            {notification.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
            {notification.message}
            <button onClick={() => setNotification(null)}><X size={14} /></button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
