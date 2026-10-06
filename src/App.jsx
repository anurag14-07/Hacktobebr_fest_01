import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity, ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, Bell, Check, CheckCircle2,
  ChevronDown, ChevronRight, Clock3, FileCheck2, FileImage, FilePlus2, FileText, HeartPulse,
  LogOut, Map, MapPin, MessageCircle, Navigation, Paperclip, Phone, Search, Send, ShieldCheck,
  Sparkles, Stethoscope, Upload, UsersRound, X,
} from 'lucide-react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { api, getToken, setSession } from './api.js'

function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'ME'
}

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return ''
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatWhen(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function externalWebsite(value) {
  if (!value) return ''
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : ''
  } catch {
    return ''
  }
}

function reportType(report) {
  if (!report) return 'Medical report'
  if (report.content_type === 'application/pdf' || report.type === 'Medical report') return 'PDF report'
  return 'Image report'
}

function App() {
  const [boot, setBoot] = useState(Boolean(getToken()))
  const [user, setUser] = useState(null)
  const [page, setPage] = useState('Home')
  const [reports, setReports] = useState([])
  const [activeReport, setActiveReport] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [conversations, setConversations] = useState([])
  const [activeConversation, setActiveConversation] = useState(null)
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [thinking, setThinking] = useState(false)
  const [toast, setToast] = useState('')
  const [authError, setAuthError] = useState('')
  const [selectedProvider, setSelectedProvider] = useState(null)
  const [view, setView] = useState('List')
  const [search, setSearch] = useState('')
  const [placeQuery, setPlaceQuery] = useState('')
  const [providers, setProviders] = useState([])
  const [careLocation, setCareLocation] = useState(null)
  const [careLoading, setCareLoading] = useState(false)
  const [careError, setCareError] = useState('')
  const fileInput = useRef(null)
  const lastCareParams = useRef(null)

  const notify = (message) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 3200)
  }

  const loadWorkspace = async () => {
    const [reportList, chatList] = await Promise.all([api.reports(), api.conversations()])
    setReports(reportList)
    setConversations(chatList)
    setActiveReport((current) => current && reportList.some((item) => item.id === current.id) ? current : reportList[0] || null)
    return { reportList, chatList }
  }

  useEffect(() => {
    if (!getToken()) {
      setBoot(false)
      return
    }
    api.me()
      .then(async (profile) => {
        setUser(profile)
        await loadWorkspace()
      })
      .catch(() => {
        setSession('')
        setUser(null)
      })
      .finally(() => setBoot(false))
  }, [])

  const handleAuth = async (mode, payload) => {
    setAuthError('')
    try {
      const result = mode === 'register' ? await api.register(payload) : await api.login(payload)
      setSession(result.token)
      setUser(result.user)
      await loadWorkspace()
      setPage('Home')
    } catch (error) {
      setAuthError(error.message)
    }
  }

  const handleLogout = async () => {
    try { await api.logout() } catch {}
    setSession('')
    setUser(null)
    setReports([])
    setConversations([])
    setMessages([])
    setActiveConversation(null)
    setActiveReport(null)
    setAnalysis(null)
  }

  const onFile = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) {
      notify('Choose a PDF, JPG, or PNG report')
      return
    }
    try {
      const saved = await api.uploadReport(file)
      const next = await api.reports()
      setReports(next)
      await openAnalysis(saved)
      notify(saved.has_text ? 'Report saved. Readable text was extracted.' : 'Report saved. Ask MediAI about what you see on the document.')
    } catch (error) {
      notify(error.message)
    }
  }

  const openAnalysis = async (report) => {
    setActiveReport(report)
    setPage('Report Analysis')
    try {
      setAnalysis(await api.analyze(report.id))
    } catch (error) {
      notify(error.message)
    }
  }

  const openConversation = async (conversation) => {
    setActiveConversation(conversation)
    setPage('MediAI Chat')
    try {
      const detail = await api.conversation(conversation.id)
      setMessages(detail.messages || [])
      setActiveConversation(detail)
    } catch (error) {
      notify(error.message)
    }
  }

  const startNewChat = () => {
    setActiveConversation(null)
    setMessages([])
    setDraft('')
    setPage('MediAI Chat')
  }

  const sendQuestion = async (text = draft) => {
    const question = (text || '').trim()
    if (!question || thinking) return
    setDraft('')
    setThinking(true)
    setMessages((current) => [...current, { id: `local-${Date.now()}`, role: 'user', content: question, created_at: new Date().toISOString() }])
    try {
      const result = await api.chat({
        question,
        conversation_id: activeConversation?.id,
        report_id: activeReport?.id,
      })
      setActiveConversation(result.conversation)
      setMessages(result.conversation.messages || [])
      const list = await api.conversations()
      setConversations(list)
    } catch (error) {
      notify(error.message)
    } finally {
      setThinking(false)
    }
  }

  const loadCare = async (params) => {
    lastCareParams.current = params
    setCareLoading(true)
    setCareError('')
    try {
      const result = await api.providers(params)
      setCareLocation(result.location)
      setProviders(result.providers || [])
      if (!(result.providers || []).length) setCareError('No hospitals or clinics were found nearby. Try another city.')
    } catch (error) {
      setCareError(providers.length ? `${error.message} Showing the previous results.` : error.message)
    } finally {
      setCareLoading(false)
    }
  }

  const useMyLocation = () => {
    if (!window.navigator.geolocation) {
      setCareError('Location is not available in this browser. Search a city instead.')
      return
    }
    window.navigator.geolocation.getCurrentPosition(
      (position) => loadCare({ lat: position.coords.latitude, lon: position.coords.longitude }),
      () => setCareError('Location permission was declined. Search a city instead.'),
    )
  }

  const filteredProviders = useMemo(
    () => providers.filter((provider) => `${provider.name} ${provider.title} ${provider.place}`.toLowerCase().includes(search.toLowerCase())),
    [providers, search],
  )

  if (boot) {
    return <div className="boot-screen"><HeartPulse size={22} /> Loading your workspace…</div>
  }
  if (!user) {
    return <AuthScreen error={authError} onSubmit={handleAuth} />
  }

  const navItems = [
    { title: 'WORKSPACE', items: [{ name: 'Home', icon: HeartPulse }, { name: 'MediAI Chat', icon: MessageCircle }, { name: 'My Reports', icon: FileText }] },
    { title: 'CARE', items: [{ name: 'Nearby Care', icon: MapPin }, { name: 'Next Steps', icon: ArrowUpRight }] },
  ]

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setPage('Home')} aria-label="MediGuide AI home"><span className="brand-mark"><HeartPulse size={20} strokeWidth={2.3} /></span><span>MediGuide<span className="brand-ai"> AI</span></span></button>
        <div className="workspace-switch"><div className="workspace-avatar">{initials(user.name)}</div><div><b>{user.name.split(' ')[0]}'s space</b><small>Personal workspace</small></div></div>
        <nav className="side-nav">
          {navItems.map((group) => <div className="nav-group" key={group.title}><span className="nav-label">{group.title}</span>{group.items.map(({ name, icon: Icon }) => <button key={name} className={`nav-link ${page === name ? 'active' : ''}`} aria-label={name} title={name} onClick={() => name === 'MediAI Chat' ? (activeConversation ? openConversation(activeConversation) : startNewChat()) : setPage(name)}><Icon size={17} strokeWidth={1.9} /><span>{name}</span>
            {name === 'My Reports' && reports.length > 0 && <span className="nav-count">{reports.length}</span>}
          </button>)}</div>)}
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-note"><ShieldCheck size={16} /><div><b>Your health stays yours</b><span>Chats are saved to your account</span></div></div>
          <button className="profile-row" onClick={handleLogout} title="Sign out"><span className="profile-avatar">{initials(user.name)}</span><span className="profile-copy"><b>{user.name}</b><small>{user.email}</small></span><LogOut size={15} /></button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar"><div className="breadcrumbs"><span>Workspace</span><ChevronRight size={14} /><b>{page === 'Home' ? 'Home' : page}</b></div><div className="top-actions"><span className="demo-badge"><span className="pulse-dot" /> Signed in</span><button className="icon-button" aria-label="Notifications" onClick={() => notify('No new notifications')}><Bell size={18} /></button><span className="top-avatar">{initials(user.name)}</span></div></header>
        <div className="page-content">
          {page === 'Home' && <HomePage user={user} reports={reports} onUpload={() => fileInput.current?.click()} onNavigate={setPage} onChat={startNewChat} />}
          {page === 'Report Analysis' && <AnalysisPage report={activeReport} analysis={analysis} onChat={startNewChat} onCare={() => setPage('Nearby Care')} onBack={() => setPage('Home')} />}
          {page === 'MediAI Chat' && <ChatPage user={user} report={activeReport} conversations={conversations} activeConversation={activeConversation} messages={messages} draft={draft} setDraft={setDraft} thinking={thinking} onSend={sendQuestion} onUpload={() => fileInput.current?.click()} onOpen={openConversation} onNew={startNewChat} />}
          {page === 'Next Steps' && <NextStepsPage onCare={() => { setPage('Nearby Care'); useMyLocation() }} />}
          {page === 'Nearby Care' && <CarePage view={view} setView={setView} search={search} setSearch={setSearch} placeQuery={placeQuery} setPlaceQuery={setPlaceQuery} providers={filteredProviders} location={careLocation} loading={careLoading} error={careError} onRetry={lastCareParams.current ? () => loadCare(lastCareParams.current) : null} onLocate={useMyLocation} onSearchPlace={() => loadCare({ q: placeQuery })} onDetails={setSelectedProvider} />}
          {page === 'My Reports' && <ReportsPage reports={reports} onUpload={() => fileInput.current?.click()} onAnalyze={openAnalysis} onChat={startNewChat} />}
        </div>
      </main>
      <input ref={fileInput} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" hidden onChange={onFile} />
      {toast && <div className="toast"><CheckCircle2 size={18} />{toast}<button onClick={() => setToast('')} aria-label="Dismiss"><X size={15} /></button></div>}
      {selectedProvider && <ProviderModal provider={selectedProvider} onClose={() => setSelectedProvider(null)} />}
    </div>
  )
}

function AuthScreen({ error, onSubmit }) {
  const [mode, setMode] = useState('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    await onSubmit(mode, { email, password, ...(mode === 'register' ? { name } : {}) })
    setBusy(false)
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand"><span className="brand-mark"><HeartPulse size={20} /></span><b>MediGuide AI</b></div>
        <h1>{mode === 'login' ? 'Welcome back' : 'Create your workspace'}</h1>
        <p>Sign in to save chats and reports to your account. Educational information only — not a diagnosis.</p>
        <form onSubmit={submit} className="auth-form">
          {mode === 'register' && <label>Name<input value={name} onChange={(event) => setName(event.target.value)} required placeholder="Your name" /></label>}
          <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="you@email.com" /></label>
          <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} placeholder="At least 8 characters" /></label>
          {error && <div className="auth-error">{error}</div>}
          <button className="button button-dark full-button" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
        </form>
        <button className="demo-link" onClick={() => { setMode(mode === 'login' ? 'register' : 'login') }}>
          {mode === 'login' ? 'Need an account? Create one' : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  )
}

function PageHeading({ eyebrow, title, description, action }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action}</div>
}

function HomePage({ user, reports, onUpload, onNavigate, onChat }) {
  const weekday = new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()
  return <>
    <div className="welcome-line"><span className="eyebrow">{weekday}</span><div className="welcome-state"><span className="tiny-check"><Check size={12} /></span> Signed in as {user.name}</div></div>
    <section className="hero-panel">
      <div className="hero-copy"><span className="hero-kicker"><Sparkles size={14} /> A clearer picture starts here</span><h1>Understand Your Health.<br /><em>Know Your Next Step.</em></h1><p>Make sense of your medical reports with thoughtful AI guidance, then find real nearby care when you need it.</p><div className="hero-buttons"><button className="button button-dark" onClick={onUpload}><Upload size={16} /> Upload a report</button><button className="button button-light" onClick={onChat}><MessageCircle size={16} /> Ask MediAI</button></div></div>
      <div className="hero-art" aria-label="Report guidance preview"><div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" /><div className="floating-chip chip-report"><span className="chip-icon mint-icon"><FileCheck2 size={17} /></span><span><b>{reports.length ? `${reports.length} report${reports.length === 1 ? '' : 's'} saved` : 'Upload when ready'}</b><small>{reports.length ? 'Private to your account' : 'PDF, JPG, or PNG'}</small></span><CheckCircle2 className="chip-check" size={16} /></div><div className="art-center"><div className="art-ring"><HeartPulse size={34} /></div><span>your health,<br />in context</span></div><div className="floating-chip chip-next"><span className="next-arrow"><ArrowDownRight size={17} /></span><span><b>A helpful next step</b><small>Talk it through with a doctor</small></span></div></div>
    </section>
    <div className="flow-strip"><span className="flow-label">A little more clarity</span><div className="flow-steps"><FlowStep icon={FileText} title="Your report" /><ArrowRight className="flow-arrow" size={15} /><FlowStep icon={Sparkles} title="AI explains" /><ArrowRight className="flow-arrow" size={15} /><FlowStep icon={ArrowUpRight} title="Next step" /><ArrowRight className="flow-arrow" size={15} /><FlowStep icon={MapPin} title="Nearby care" /></div></div>
    <div className="section-heading"><div><span className="eyebrow">MADE FOR YOUR EVERYDAY</span><h2>Support that meets you where you are</h2></div><button className="text-action" onClick={onChat}>Explore MediAI <ArrowRight size={15} /></button></div>
    <div className="feature-grid"><Feature icon={FileText} tone="mint" title="Understand your reports" text="Turn medical terms and test results into clear, plain-language explanations." onClick={() => reports[0] ? onNavigate('My Reports') : onUpload()} /><Feature icon={Sparkles} tone="lilac" title="Ask without the jargon" text="Get thoughtful answers, with chat history saved to your account." onClick={onChat} /><Feature icon={ArrowUpRight} tone="peach" title="Know what comes next" text="Explore sensible next steps, with your wellbeing and professional care in mind." onClick={() => onNavigate('Next Steps')} /><Feature icon={MapPin} tone="blue" title="Find care nearby" text="Browse real hospitals and clinics near you from OpenStreetMap." onClick={() => onNavigate('Nearby Care')} /></div>
    <section className="bottom-callout"><div className="callout-icon"><ShieldCheck size={19} /></div><div><b>Helpful information, never a diagnosis.</b><span>MediGuide AI supports informed conversations with your healthcare professional.</span></div><button className="callout-link" onClick={() => onNavigate('Next Steps')}>How we guide <ArrowRight size={14} /></button></section>
  </>
}
function FlowStep({ icon: Icon, title }) { return <div className="flow-step"><span><Icon size={15} /></span><b>{title}</b></div> }
function Feature({ icon: Icon, tone, title, text, onClick }) { return <button className="feature-card" onClick={onClick}><span className={`feature-icon ${tone}`}><Icon size={19} /></span><span className="feature-title">{title}</span><span className="feature-text">{text}</span><span className="feature-arrow"><ArrowUpRight size={17} /></span></button> }

function AnalysisPage({ report, analysis, onChat, onCare, onBack }) {
  return <>
    <PageHeading eyebrow="REPORT ANALYSIS" title="A clearer look at your results" description="An educational overview to help you prepare for a conversation with your healthcare professional." action={<button className="button button-outline" onClick={onBack}><ArrowLeft size={15} /> Back to home</button>} />
    {!report ? <div className="empty-state"><div className="empty-icon"><FilePlus2 size={23} /></div><h3>No report to review yet</h3><p>Upload a PDF, JPG, or PNG from Home or My Reports.</p><button className="button button-dark" onClick={onBack}>Go to home</button></div> : <>
      <div className="report-meta-card"><div className="file-badge"><FileText size={20} /></div><div className="report-meta-main"><b>{report.name}</b><span>{reportType(report)} · {formatBytes(report.size_bytes || report.size)} · Added {formatWhen(report.created_at || report.date)}</span></div><span className="status-pill"><span /> {analysis ? 'Review ready' : 'Reading report'}</span></div>
      <div className="analysis-layout"><div className="analysis-main"><section className="surface-card summary-card"><div className="card-heading"><span className="feature-icon mint"><Sparkles size={17} /></span><div><h2>Your report, in plain language</h2><span>AI-generated educational summary</span></div></div><p className="summary-intro">{analysis?.summary || 'Reading your report…'}</p>{analysis?.explanation && <div className="summary-callout"><span className="callout-bullet"><Activity size={16} /></span><span><b>Keep in mind</b> {analysis.explanation}</span></div>}</section>
      {analysis?.values?.length > 0 && <section className="surface-card results-card"><div className="results-header"><div><h2>Key results</h2><span>Values taken from extracted report text</span></div></div><div className="results-table"><div className="table-head"><span>TEST</span><span>RESULT</span><span>LAB RANGE</span><span>STATUS</span></div>{analysis.values.map((item) => <div className="result-row" key={item.name}><b>{item.name}</b><span className="result-value">{item.value} <small>{item.unit}</small></span><span className="range-value">{item.reference_range}</span><span className={`result-status ${item.status === 'below_range' ? 'below' : ''}`}><i />{item.status?.replace('_', ' ')}</span></div>)}</div></section>}
      <section className="surface-card question-cta"><div className="chat-bubble-icon"><MessageCircle size={20} /></div><div><h3>Have a question about this report?</h3><p>Ask MediAI for a little more context, in everyday language.</p></div><button className="button button-dark" onClick={onChat}>Ask about this report <ArrowRight size={15} /></button></section></div>
      <aside className="analysis-side"><div className="side-card next-card"><div className="side-card-top"><span className="recommend-icon"><Stethoscope size={18} /></span><span className="soft-label">SUGGESTED NEXT STEP</span></div><h3>Talk with a clinician</h3><p>{analysis?.suggested_next_step || 'A healthcare professional can interpret this report in the context of your history.'}</p><button className="button button-dark full-button" onClick={onCare}>Explore nearby care <ArrowRight size={15} /></button><div className="disclaimer-mini"><ShieldCheck size={15} /><span>{analysis?.disclaimer || 'This is general information, not a diagnosis or treatment plan.'}</span></div></div></aside></div>
    </>}
  </>
}

function ChatPage({ user, report, conversations, activeConversation, messages, draft, setDraft, thinking, onSend, onUpload, onOpen, onNew }) {
  const prompts = ['Explain a lab term in plain language.', 'What should I discuss with my doctor?', 'When should I seek in-person care?']
  const scrollRef = useRef(null)
  useEffect(() => { scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight) }, [messages, thinking])
  return <>
    <PageHeading eyebrow="MEDIGUIDE ASSISTANT" title="Let's make this make sense." description="Ask a health question. Your conversation is saved to your account." action={<button className="button button-outline" onClick={onNew}>New chat</button>} />
    <div className="chat-layout"><div className="chat-main surface-card"><div className="chat-topline"><span className="assistant-avatar"><Sparkles size={17} /></span><div><b>MediAI</b><small>{activeConversation?.title || 'Educational health companion'}</small></div><span className="privacy-tag"><ShieldCheck size={13} /> Saved privately</span></div><div className="chat-scroll" ref={scrollRef}>
      <div className="message-row ai-message"><span className="message-avatar"><Sparkles size={14} /></span><div className="message-content"><div className="message-meta">MediAI</div><div className="message-bubble">Hi {user.name.split(' ')[0]}. I can help you understand health information in everyday language. I can't diagnose or recommend treatment, but I can help you prepare good questions for a clinician.{report ? <> I can use <b>{report.name}</b> as context when text was extracted.</> : ' Upload a report if you want questions grounded in a document.'}</div></div></div>
      {messages.map((message) => message.role === 'user' ? (
        <div className="message-row user-message" key={message.id}><div className="message-content"><div className="message-meta align-right">You <span>{formatWhen(message.created_at)}</span></div><div className="message-bubble">{message.content}</div></div><span className="user-message-avatar">{initials(user.name)}</span></div>
      ) : (
        <div className="message-row ai-message" key={message.id}><span className="message-avatar"><Sparkles size={14} /></span><div className="message-content"><div className="message-meta">MediAI <span>{formatWhen(message.created_at)}</span></div><StructuredAnswer sections={message.sections || { summary: message.content }} /></div></div>
      ))}
      {thinking && <div className="message-row ai-message"><span className="message-avatar"><Sparkles size={14} /></span><div className="message-content"><div className="message-meta">MediAI <span>thinking</span></div><div className="typing-bubble"><i /><i /><i /></div></div></div>}
      {!messages.length && !thinking && <div className="suggestion-area"><span>TRY ASKING</span><div>{prompts.map((prompt) => <button key={prompt} onClick={() => onSend(prompt)}>{prompt}<ArrowUpRight size={13} /></button>)}</div></div>}
      </div><div className="chat-compose"><div className="attached-report">{report ? <><span className="attachment-icon"><FileText size={15} /></span><span><b>{report.name}</b><small>Attached as context</small></span></> : <button className="attach-report" onClick={onUpload}><Paperclip size={14} /> Add a report</button>}</div><form className="compose-form" onSubmit={(event) => { event.preventDefault(); onSend() }}><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Ask a question about your health..." aria-label="Your question" /><button type="button" className="compose-attach" onClick={onUpload} aria-label="Upload report"><Paperclip size={17} /></button><button className="send-button" disabled={!draft.trim() || thinking} aria-label="Send question"><Send size={16} /></button></form><div className="compose-disclaimer">MediAI can make mistakes. Always consult a qualified healthcare professional.</div></div></div>
      <aside className="chat-side"><div className="side-card context-card"><span className="soft-label">CHAT HISTORY</span>
        {conversations.length ? conversations.map((conversation) => <button className={`quick-question ${activeConversation?.id === conversation.id ? 'active-thread' : ''}`} key={conversation.id} onClick={() => onOpen(conversation)}>{conversation.title}<ArrowUpRight size={14} /></button>) : <p className="context-empty">Your saved conversations will appear here.</p>}
        <div className="context-divider" /><span className="soft-label">QUICK QUESTIONS</span>{prompts.map((prompt) => <button className="quick-question" key={prompt} onClick={() => onSend(prompt)}>{prompt}<ArrowUpRight size={14} /></button>)}</div>
        <div className="safe-chat-note"><ShieldCheck size={17} /><p><b>Careful by design</b><br />MediAI does not diagnose, prescribe, or change treatment. Your clinician is your best source of personal medical advice.</p></div></aside></div>
  </>
}

function StructuredAnswer({ sections }) {
  const points = Array.isArray(sections.important_points) ? sections.important_points : []
  return <div className="structured-answer"><div><b>Summary</b><p>{sections.summary}</p></div>{sections.explanation && <div><b>Explanation</b><p>{sections.explanation}</p></div>}{points.length > 0 && <div><b>Important points</b><ul>{points.map((point) => <li key={point}>{point}</li>)}</ul></div>}{sections.suggested_next_step && <div className="answer-next"><b>Suggested next step</b><p>{sections.suggested_next_step}</p></div>}<div className="answer-disclaimer"><ShieldCheck size={14} /> {sections.disclaimer || 'Educational information only. Not a diagnosis or medical advice.'}</div></div>
}

function NextStepsPage({ onCare }) {
  return <><PageHeading eyebrow="YOUR NEXT STEP" title="Thoughtful guidance, not guesswork." description="A useful place to start after reviewing a report or a health question." />
    <div className="recommendation-banner"><div className="recommendation-symbol"><Stethoscope size={25} /></div><div><span className="soft-label">A PRACTICAL STARTING POINT</span><h2>Consider a conversation with a clinician</h2><p>MediAI can explain terms, but personal interpretation belongs with a qualified professional. If you feel seriously unwell, seek in-person care promptly.</p><button className="button button-dark" onClick={onCare}>Find nearby care <MapPin size={15} /></button></div></div>
    <div className="section-heading next-section-title"><div><span className="eyebrow">A SIMPLE GUIDE</span><h2>Choose the kind of support that fits</h2></div></div><div className="guidance-grid"><div className="guidance-card"><span className="guidance-number">01</span><span className="guidance-icon guidance-green"><HeartPulse size={19} /></span><h3>General health information</h3><p>For learning about a term or understanding what a test measures. MediAI can help explain, without deciding what it means for you.</p><span className="guidance-tag">Start with a question</span></div><div className="guidance-card recommended-guidance"><span className="guidance-number">02</span><span className="guidance-icon guidance-amber"><MessageCircle size={19} /></span><h3>Consider consulting a doctor</h3><p>For personal interpretation of a result, or if you have concerns. Bring your report and questions to a qualified professional.</p><span className="guidance-tag">Often the right next step</span></div><div className="guidance-card"><span className="guidance-number">03</span><span className="guidance-icon guidance-coral"><Activity size={19} /></span><h3>Seek prompt professional care</h3><p>If you feel seriously unwell or symptoms are worsening, contact a medical professional promptly. For an emergency, call local emergency services.</p><span className="guidance-tag">Urgent concerns</span></div></div>
    <div className="disclaimer-panel"><ShieldCheck size={18} /><div><b>Important medical disclaimer</b><p>MediGuide AI provides educational information only. It does not diagnose conditions, prescribe medicines, recommend dosage changes, or replace professional medical advice. Always speak with a qualified healthcare professional about your health. If you may be experiencing a medical emergency, contact your local emergency services now.</p></div></div>
  </>
}

function CarePage({ view, setView, search, setSearch, placeQuery, setPlaceQuery, providers, location, loading, error, onRetry, onLocate, onSearchPlace, onDetails }) {
  return <><PageHeading eyebrow="CARE AROUND YOU" title="Find a good place to start." description="Live results from OpenStreetMap: hospitals, clinics, and doctors near you." action={<button className="location-chip" onClick={onLocate}><MapPin size={15} /> {location?.label || 'Use my location'}</button>} />
    <form className="care-toolbar" onSubmit={(event) => { event.preventDefault(); onSearchPlace() }}><div className="search-field"><Search size={16} /><input value={placeQuery} onChange={(event) => setPlaceQuery(event.target.value)} placeholder="Search a city or postal code" /><button type="submit" className="text-action">Search</button></div><div className="search-field"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter by name or specialty" /></div><div className="segmented"><button type="button" className={view === 'List' ? 'selected' : ''} onClick={() => setView('List')}><UsersRound size={15} /> List</button><button type="button" className={view === 'Map' ? 'selected' : ''} onClick={() => setView('Map')}><Map size={15} /> Map</button></div></form>
    {error && <div className="care-error">{error}{onRetry && <button type="button" className="care-retry" onClick={onRetry} disabled={loading}>Try again</button>}</div>}
    <div className="care-layout"><div className="provider-list"><div className="results-count">{loading ? 'Looking for nearby care…' : `${providers.length} nearby care options`}{location && <span> · {location.label}</span>}</div>
      {!providers.length && !loading && <div className="empty-state compact-empty"><MapPin size={22} /><h3>No locations loaded yet</h3><p>Share your location or search a city to see real clinics and hospitals.</p><button className="button button-dark" onClick={onLocate}>Use my location</button></div>}
      {providers.map((provider) => <ProviderCard provider={provider} key={provider.id} onDetails={onDetails} />)}
    </div>
      <CareMap providers={providers} location={location} view={view} /></div>
    <div className="care-footer"><ShieldCheck size={15} /> Locations come from OpenStreetMap. Hours and contact details may be incomplete.</div>
  </>
}

function CareMap({ providers, location, view }) {
  const mapElement = useRef(null)
  const mapRef = useRef(null)
  const markerLayerRef = useRef(null)
  const points = useMemo(
    () => providers.filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lon)),
    [providers],
  )

  useEffect(() => {
    if (!mapElement.current) return undefined
    const map = L.map(mapElement.current, { scrollWheelZoom: true }).setView([20, 0], 2)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map)
    mapRef.current = map
    markerLayerRef.current = L.layerGroup().addTo(map)

    return () => {
      map.remove()
      mapRef.current = null
      markerLayerRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const markerLayer = markerLayerRef.current
    if (!map || !markerLayer) return
    markerLayer.clearLayers()

    const coordinates = points.map((provider) => [provider.lat, provider.lon])
    if (location && Number.isFinite(location.lat) && Number.isFinite(location.lon)) {
      coordinates.push([location.lat, location.lon])
      const marker = L.circleMarker([location.lat, location.lon], {
        radius: 8,
        color: '#fff',
        weight: 3,
        fillColor: '#2869a6',
        fillOpacity: 1,
      }).bindPopup('You are here')
      marker.addTo(markerLayer)
    }

    points.forEach((provider) => {
      const popup = document.createElement('div')
      const name = document.createElement('strong')
      name.textContent = provider.name
      const details = document.createElement('div')
      details.textContent = `${provider.title} · ${provider.distance} mi`
      popup.append(name, details)
      L.circleMarker([provider.lat, provider.lon], {
        radius: 8,
        color: '#fff',
        weight: 2,
        fillColor: '#287b68',
        fillOpacity: 1,
      }).bindPopup(popup).addTo(markerLayer)
    })

    if (coordinates.length === 1) {
      map.setView(coordinates[0], 14)
    } else if (coordinates.length > 1) {
      map.fitBounds(coordinates, { padding: [28, 28], maxZoom: 14 })
    }
    window.requestAnimationFrame(() => map.invalidateSize())
  }, [points, location, view])

  return <div className={`map-panel ${view === 'List' ? 'map-secondary' : ''}`}>
    <div ref={mapElement} className="care-leaflet-map" role="application" aria-label="Map of nearby hospitals and clinics" />
  </div>
}

function ProviderCard({ provider, onDetails }) {
  const website = externalWebsite(provider.website)
  const mapUrl = `https://www.openstreetmap.org/?mlat=${provider.lat}&mlon=${provider.lon}#map=16/${provider.lat}/${provider.lon}`
  return <div className="provider-card"><div className={`provider-avatar ${provider.color}`}>{provider.initials}</div><div className="provider-details"><div className="provider-name-row"><h3>{provider.name}</h3><span className="provider-distance"><MapPin size={12} />{provider.distance} mi</span></div><p>{provider.title}</p><span className="provider-place">{provider.place} · {provider.address}</span><div className="provider-meta">{provider.hours && <span><Clock3 size={13} /> {provider.hours}</span>}{provider.phone && <span><Phone size={13} /> {provider.phone}</span>}</div><div className="provider-actions"><button className="button button-dark" onClick={() => onDetails(provider)}>View details <ArrowRight size={14} /></button><a className="directions-button" href={mapUrl} target="_blank" rel="noreferrer"><Navigation size={14} /> Map</a>{website && <a className="directions-button" href={website} target="_blank" rel="noreferrer">Website</a>}</div></div></div>
}

function ReportsPage({ reports, onUpload, onAnalyze, onChat }) {
  return <><PageHeading eyebrow="YOUR HEALTH LIBRARY" title="My reports" description="Reports you upload are saved to your signed-in account." action={<button className="button button-dark" onClick={onUpload}><Upload size={15} /> Upload report</button>} />
    <div className="reports-overview"><div><span className="overview-icon mint"><FileText size={18} /></span><div><b>{reports.length ? `${reports.length} report${reports.length === 1 ? '' : 's'} saved` : 'Your timeline starts here'}</b><span>{reports.length ? 'Your documents are ready when you are.' : 'Upload a PDF, JPG, or PNG report.'}</span></div></div><div className="reports-privacy"><ShieldCheck size={15} /> Private to you</div></div>
    {reports.length ? reports.map((report) => <div className="timeline" key={report.id}><div className="timeline-date"><span className="timeline-dot" /> {formatWhen(report.created_at)}</div><div className="timeline-card"><div className="timeline-file-icon"><FileText size={19} /></div><div className="timeline-info"><span className="report-type-label">{reportType(report).toUpperCase()}</span><h3>{report.name}</h3><p>{formatBytes(report.size_bytes)} <span>·</span> {report.has_text ? 'Text extracted' : 'Image or unscanned PDF'}</p><div className="timeline-tags"><span className="tag-ready"><CheckCircle2 size={12} /> Ready to explore</span></div></div><div className="timeline-actions"><button className="button button-dark" onClick={() => onAnalyze(report)}>View analysis <ArrowRight size={14} /></button><button className="button button-outline" onClick={onChat}><MessageCircle size={14} /> Ask MediAI</button></div></div></div>) : <div className="empty-state reports-empty"><div className="empty-icon"><FileImage size={23} /></div><h3>No reports yet</h3><p>Your reports will show up here after you upload them.</p><button className="button button-dark" onClick={onUpload}><Upload size={15} /> Upload a report</button></div>}
    <div className="reports-note"><ShieldCheck size={16} /><span><b>Private by design.</b> Report text used for explanations is stored with your account on this server. Do not upload documents you are not comfortable storing locally during this MVP.</span></div>
  </>
}

function ProviderModal({ provider, onClose }) {
  const website = externalWebsite(provider.website)
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><div className="booking-modal" role="dialog" aria-modal="true" aria-label="Provider details"><button className="modal-close" aria-label="Close" onClick={onClose}><X size={19} /></button><span className="eyebrow">PROVIDER DETAILS</span><div className="modal-provider"><div className={`provider-avatar large ${provider.color}`}>{provider.initials}</div><div><h2>{provider.name}</h2><span>{provider.title}</span></div></div><div className="modal-credentials"><span><MapPin size={14} /> {provider.distance} mi</span>{provider.hours && <span><Clock3 size={14} /> {provider.hours}</span>}</div><div className="provider-bio"><p><b>{provider.place}</b><br />{provider.address}{provider.phone ? <><br />{provider.phone}</> : null}</p></div><a className="button button-dark full-button" href={`https://www.openstreetmap.org/?mlat=${provider.lat}&mlon=${provider.lon}#map=16/${provider.lat}/${provider.lon}`} target="_blank" rel="noreferrer">Open in OpenStreetMap <ArrowRight size={15} /></a>{website && <a className="demo-link" href={website} target="_blank" rel="noreferrer">Visit website</a>}<div className="modal-footnote"><ShieldCheck size={14} /> Listing data is from OpenStreetMap contributors.</div></div></div>
}

export default App
