import { useRef, useState } from 'react'
import {
  Activity, ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, Bell, CalendarDays,
  Check, CheckCircle2, ChevronDown, ChevronRight, Clock3, FileCheck2, FileImage,
  FilePlus2, FileText, HeartPulse, Hospital, Map, MapPin, MessageCircle, Navigation,
  Paperclip, Search, Send, ShieldCheck, Sparkles, Star, Stethoscope, Upload, UserRound,
  UsersRound, X,
} from 'lucide-react'

const sampleReport = {
  id: 'RPT-2481', name: 'Annual blood panel.pdf', date: 'Today, 9:41 AM', type: 'Blood panel', size: '1.2 MB', status: 'Ready',
}
const results = [
  { label: 'Hemoglobin', value: '13.8', unit: 'g/dL', range: '12.0–16.0', state: 'In range' },
  { label: 'Vitamin D', value: '24', unit: 'ng/mL', range: '30–100', state: 'Below range' },
  { label: 'Total cholesterol', value: '186', unit: 'mg/dL', range: '< 200', state: 'In range' },
  { label: 'Fasting glucose', value: '91', unit: 'mg/dL', range: '70–99', state: 'In range' },
]
const providers = [
  { name: 'Dr. Maya Chen', title: 'Primary care · Internal medicine', place: 'Harbor Health Clinic', distance: '0.8 mi', rating: '4.9', times: 'Today, 2:30 PM', initials: 'MC', color: 'mint' },
  { name: 'Dr. Noah Patel', title: 'Family medicine', place: 'Juniper Medical Group', distance: '1.4 mi', rating: '4.8', times: 'Tomorrow, 9:15 AM', initials: 'NP', color: 'peach' },
  { name: 'Northside Community Hospital', title: 'Primary care · Urgent care', place: 'Northside Health Network', distance: '2.1 mi', rating: '4.7', times: 'Open until 8:00 PM', initials: 'NH', color: 'blue' },
]

function App() {
  const [page, setPage] = useState('Home')
  const [report, setReport] = useState(null)
  const [toast, setToast] = useState('')
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState(false)
  const [thinking, setThinking] = useState(false)
  const [selectedProvider, setSelectedProvider] = useState(null)
  const [booking, setBooking] = useState(false)
  const [booked, setBooked] = useState(false)
  const [view, setView] = useState('List')
  const [search, setSearch] = useState('')
  const fileInput = useRef(null)

  const notify = (message) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 3200)
  }
  const loadDemo = () => {
    setReport(sampleReport)
    setPage('Report Analysis')
    notify('Sample report loaded and ready to explore')
  }
  const onFile = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) {
      notify('Choose a PDF, JPG, or PNG report')
      event.target.value = ''
      return
    }
    setReport({ id: `RPT-${Math.floor(1000 + Math.random() * 8999)}`, name: file.name, date: 'Just now', type: file.type === 'application/pdf' ? 'Medical report' : 'Image report', size: `${(file.size / 1024 / 1024).toFixed(1)} MB`, status: 'Ready' })
    setPage('Report Analysis')
    notify('Report added. Demo analysis is ready.')
    event.target.value = ''
  }
  const sendQuestion = (text = question) => {
    if (!text.trim()) return
    setQuestion(text)
    setThinking(true)
    setAnswer(false)
    window.setTimeout(() => { setThinking(false); setAnswer(true) }, 1100)
  }
  const startBooking = (provider) => {
    setSelectedProvider(provider)
    setBooking(true)
    setBooked(false)
  }
  const confirmBooking = () => {
    setBooked(true)
    notify('Appointment request confirmed')
  }

  const navItems = [
    { title: 'WORKSPACE', items: [{ name: 'Home', icon: HeartPulse }, { name: 'MediAI Chat', icon: MessageCircle }, { name: 'My Reports', icon: FileText }] },
    { title: 'CARE', items: [{ name: 'Nearby Care', icon: MapPin }, { name: 'Next Steps', icon: ArrowUpRight }] },
  ]
  const pageTitle = page === 'Home' ? 'Your health, made clearer.' : page

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setPage('Home')} aria-label="MediGuide AI home"><span className="brand-mark"><HeartPulse size={20} strokeWidth={2.3} /></span><span>MediGuide<span className="brand-ai"> AI</span></span></button>
        <div className="workspace-switch"><div className="workspace-avatar">J</div><div><b>Jordan's space</b><small>Personal workspace</small></div><ChevronDown size={15} /></div>
        <nav className="side-nav">
          {navItems.map((group) => <div className="nav-group" key={group.title}><span className="nav-label">{group.title}</span>{group.items.map(({ name, icon: Icon }) => <button key={name} className={`nav-link ${page === name ? 'active' : ''}`} onClick={() => setPage(name)}><Icon size={17} strokeWidth={1.9} /><span>{name}</span>{name === 'My Reports' && report && <span className="nav-count">1</span>}</button>)}</div>)}
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-note"><ShieldCheck size={16} /><div><b>Your health stays yours</b><span>Private by design</span></div></div>
          <button className="profile-row"><span className="profile-avatar">JD</span><span className="profile-copy"><b>Jordan Davis</b><small>Personal account</small></span><ChevronDown size={15} /></button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar"><div className="breadcrumbs"><span>Workspace</span><ChevronRight size={14} /><b>{page}</b></div><div className="top-actions"><span className="demo-badge"><span className="pulse-dot" /> Demo mode</span><button className="icon-button" aria-label="Notifications" onClick={() => notify('You are all caught up')}><Bell size={18} /></button><span className="top-avatar">JD</span></div></header>
        <div className="page-content">
          {page === 'Home' && <HomePage report={report} onDemo={loadDemo} onUpload={() => fileInput.current?.click()} onNavigate={setPage} />}
          {page === 'Report Analysis' && <AnalysisPage report={report} onChat={() => setPage('MediAI Chat')} onCare={() => setPage('Next Steps')} onBack={() => setPage('Home')} />}
          {page === 'MediAI Chat' && <ChatPage report={report} question={question} setQuestion={setQuestion} answer={answer} thinking={thinking} onSend={sendQuestion} onUpload={() => fileInput.current?.click()} onDemo={loadDemo} />}
          {page === 'Next Steps' && <NextStepsPage onCare={() => setPage('Nearby Care')} />}
          {page === 'Nearby Care' && <CarePage view={view} setView={setView} search={search} setSearch={setSearch} onDetails={startBooking} />}
          {page === 'My Reports' && <ReportsPage report={report} onUpload={() => fileInput.current?.click()} onAnalyze={() => setPage('Report Analysis')} onChat={() => setPage('MediAI Chat')} onDemo={loadDemo} />}
        </div>
      </main>
      <input ref={fileInput} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" hidden onChange={onFile} />
      {toast && <div className="toast"><CheckCircle2 size={18} />{toast}<button onClick={() => setToast('')} aria-label="Dismiss"><X size={15} /></button></div>}
      {booking && <BookingModal provider={selectedProvider} booked={booked} onConfirm={confirmBooking} onClose={() => setBooking(false)} />}
    </div>
  )
}

function PageHeading({ eyebrow, title, description, action }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action}</div>
}

function HomePage({ report, onDemo, onUpload, onNavigate }) {
  return <>
    <div className="welcome-line"><span className="eyebrow">TUESDAY, OCTOBER 6</span><div className="welcome-state"><span className="tiny-check"><Check size={12} /></span> Your personal health space</div></div>
    <section className="hero-panel">
      <div className="hero-copy"><span className="hero-kicker"><Sparkles size={14} /> A clearer picture starts here</span><h1>Understand your health.<br /><em>Know your next step.</em></h1><p>Make sense of your medical reports with thoughtful AI guidance, then find the right care when you need it.</p><div className="hero-buttons"><button className="button button-dark" onClick={onUpload}><Upload size={16} /> Upload a report</button><button className="button button-light" onClick={() => onNavigate('MediAI Chat')}><MessageCircle size={16} /> Ask MediAI</button></div><button className="demo-link" onClick={onDemo}><Sparkles size={14} /> Explore with a sample report <ArrowRight size={14} /></button></div>
      <div className="hero-art" aria-label="Report guidance preview"><div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" /><div className="floating-chip chip-report"><span className="chip-icon mint-icon"><FileCheck2 size={17} /></span><span><b>Report reviewed</b><small>4 results identified</small></span><CheckCircle2 className="chip-check" size={16} /></div><div className="art-center"><div className="art-ring"><HeartPulse size={34} /></div><span>your health,<br />in context</span></div><div className="floating-chip chip-next"><span className="next-arrow"><ArrowDownRight size={17} /></span><span><b>A helpful next step</b><small>Talk it through with a doctor</small></span></div><div className="art-spark spark-a">✳</div><div className="art-spark spark-b">✦</div></div>
    </section>
    <div className="flow-strip"><span className="flow-label">A little more clarity</span><div className="flow-steps"><FlowStep icon={FileText} title="Your report" /><ArrowRight className="flow-arrow" size={15} /><FlowStep icon={Sparkles} title="AI explains" /><ArrowRight className="flow-arrow" size={15} /><FlowStep icon={ArrowUpRight} title="Next step" /><ArrowRight className="flow-arrow" size={15} /><FlowStep icon={MapPin} title="Nearby care" /></div></div>
    <div className="section-heading"><div><span className="eyebrow">MADE FOR YOUR EVERYDAY</span><h2>Support that meets you where you are</h2></div><button className="text-action" onClick={() => onNavigate('MediAI Chat')}>Explore MediAI <ArrowRight size={15} /></button></div>
    <div className="feature-grid"><Feature icon={FileText} tone="mint" title="Understand your reports" text="Turn medical terms and test results into clear, plain-language explanations." onClick={() => report ? onNavigate('Report Analysis') : onDemo()} /><Feature icon={Sparkles} tone="lilac" title="Ask without the jargon" text="Get thoughtful answers to your questions, grounded in your uploaded report." onClick={() => onNavigate('MediAI Chat')} /><Feature icon={ArrowUpRight} tone="peach" title="Know what comes next" text="Explore sensible next steps, with your wellbeing and professional care in mind." onClick={() => onNavigate('Next Steps')} /><Feature icon={MapPin} tone="blue" title="Find care nearby" text="Browse local clinics and clinicians when it feels right to talk to someone." onClick={() => onNavigate('Nearby Care')} /></div>
    <section className="bottom-callout"><div className="callout-icon"><ShieldCheck size={19} /></div><div><b>Helpful information, never a diagnosis.</b><span>MediGuide AI supports informed conversations with your healthcare professional.</span></div><button className="callout-link" onClick={() => onNavigate('Next Steps')}>How we guide <ArrowRight size={14} /></button></section>
  </>
}
function FlowStep({ icon: Icon, title }) { return <div className="flow-step"><span><Icon size={15} /></span><b>{title}</b></div> }
function Feature({ icon: Icon, tone, title, text, onClick }) { return <button className="feature-card" onClick={onClick}><span className={`feature-icon ${tone}`}><Icon size={19} /></span><span className="feature-title">{title}</span><span className="feature-text">{text}</span><span className="feature-arrow"><ArrowUpRight size={17} /></span></button> }

function AnalysisPage({ report, onChat, onCare, onBack }) {
  return <>
    <PageHeading eyebrow="REPORT ANALYSIS" title="A clearer look at your results" description="A simple, educational overview to help you prepare for a conversation with your healthcare professional." action={<button className="button button-outline" onClick={onBack}><ArrowLeft size={15} /> Back to home</button>} />
    {!report ? <div className="empty-state"><div className="empty-icon"><FilePlus2 size={23} /></div><h3>No report to review yet</h3><p>Upload a report or explore with our fictional sample.</p><button className="button button-dark" onClick={onBack}>Go to home</button></div> : <>
      <div className="report-meta-card"><div className="file-badge"><FileText size={20} /></div><div className="report-meta-main"><b>{report.name}</b><span>{report.type} · {report.size} · Added {report.date}</span></div><span className="status-pill"><span /> Analysis ready</span><button className="dots-button" aria-label="More report options">•••</button></div>
      <div className="analysis-layout"><div className="analysis-main"><section className="surface-card summary-card"><div className="card-heading"><span className="feature-icon mint"><Sparkles size={17} /></span><div><h2>Your report, in plain language</h2><span>AI-generated educational summary</span></div><span className="demo-stamp">DEMO ANALYSIS</span></div><p className="summary-intro">Your sample blood panel includes four common measurements. Three are within the reference ranges shown by the lab. One result, Vitamin D, is a little below the listed range.</p><div className="summary-callout"><span className="callout-bullet"><Activity size={16} /></span><span><b>Worth a conversation</b> Vitamin D is 24 ng/mL, compared with the lab's reference range of 30–100 ng/mL. A result by itself does not explain why it is outside a range.</span></div></section>
      <section className="surface-card results-card"><div className="results-header"><div><h2>Key results</h2><span>Values shown as they appear in this fictional sample</span></div><button className="text-action small-action">View all <ChevronRight size={15} /></button></div><div className="results-table"><div className="table-head"><span>TEST</span><span>RESULT</span><span>LAB RANGE</span><span>STATUS</span></div>{results.map((item) => <div className="result-row" key={item.label}><b>{item.label}</b><span className="result-value">{item.value} <small>{item.unit}</small></span><span className="range-value">{item.range}</span><span className={`result-status ${item.state === 'Below range' ? 'below' : ''}`}><i />{item.state}</span></div>)}</div></section>
      <section className="surface-card question-cta"><div className="chat-bubble-icon"><MessageCircle size={20} /></div><div><h3>Have a question about a result?</h3><p>Ask MediAI for a little more context, in everyday language.</p></div><button className="button button-dark" onClick={onChat}>Ask about this report <ArrowRight size={15} /></button></section></div>
      <aside className="analysis-side"><div className="side-card next-card"><div className="side-card-top"><span className="recommend-icon"><Stethoscope size={18} /></span><span className="soft-label">SUGGESTED NEXT STEP</span></div><h3>Consider a routine conversation</h3><p>You could ask a healthcare professional whether your Vitamin D result needs follow-up, based on your health history.</p><button className="button button-dark full-button" onClick={onCare}>Explore nearby care <ArrowRight size={15} /></button><div className="disclaimer-mini"><ShieldCheck size={15} /><span>This is general information, not a diagnosis or treatment plan.</span></div></div><div className="side-card learn-card"><span className="soft-label">KEEP IN MIND</span><p>Reference ranges can differ between labs. Your clinician can interpret results in the context of your overall health.</p><button className="text-action" onClick={onChat}>Ask a follow-up <ArrowUpRight size={14} /></button></div></aside></div>
    </>}
  </>
}

function ChatPage({ report, question, setQuestion, answer, thinking, onSend, onUpload, onDemo }) {
  const prompts = ['Explain my report.', 'What does this result mean?', 'What should I discuss with my doctor?']
  return <>
    <PageHeading eyebrow="MEDIGUIDE ASSISTANT" title="Let's make this make sense." description="Ask a health question or explore the details of your report." action={<span className="ai-availability"><span className="pulse-dot" /> Ready to help</span>} />
    <div className="chat-layout"><div className="chat-main surface-card"><div className="chat-topline"><span className="assistant-avatar"><Sparkles size={17} /></span><div><b>MediAI</b><small>Educational health companion</small></div><span className="privacy-tag"><ShieldCheck size={13} /> Private session</span></div><div className="chat-scroll"><div className="message-row ai-message"><span className="message-avatar"><Sparkles size={14} /></span><div className="message-content"><div className="message-meta">MediAI <span>just now</span></div><div className="message-bubble">Hi Jordan. I'm here to help you understand health information in everyday language. I can't diagnose or recommend treatment, but I can help you prepare good questions for a clinician.<br /><br />{report ? <>I can see <b>{report.name}</b> in your workspace. What would you like to understand?</> : 'Add a report or choose a suggested question to get started.'}</div></div></div>
      {question && <div className="message-row user-message"><div className="message-content"><div className="message-meta align-right">You <span>just now</span></div><div className="message-bubble">{question}</div></div><span className="user-message-avatar">JD</span></div>}
      {thinking && <div className="message-row ai-message"><span className="message-avatar"><Sparkles size={14} /></span><div className="message-content"><div className="message-meta">MediAI <span>thinking</span></div><div className="typing-bubble"><i /><i /><i /></div></div></div>}
      {answer && !thinking && <div className="message-row ai-message"><span className="message-avatar"><Sparkles size={14} /></span><div className="message-content"><div className="message-meta">MediAI <span>just now</span></div><div className="structured-answer"><div><b>Summary</b><p>{/doctor|discuss|talk/i.test(question) ? 'A clinician can put this result in context with your health history and any symptoms.' : 'In the sample report, Vitamin D is 24 ng/mL, a little below the lab range of 30–100 ng/mL. The other displayed results are within their listed ranges.'}</p></div><div><b>Explanation</b><p>Lab reference ranges are guides, not a diagnosis. Results can vary and are best understood alongside your overall health and the reason the test was ordered.</p></div><div><b>Important points</b><ul><li>This sample is fictional and is for demonstration only.</li><li>Do not start, stop, or change medicines or supplements based on this explanation.</li></ul></div><div className="answer-next"><b>Suggested next step</b><p>Consider asking your healthcare professional: “Does this result need follow-up for me?”</p></div><div className="answer-disclaimer"><ShieldCheck size={14} /> Educational information only. Not a diagnosis or medical advice.</div></div></div></div>}
      {!question && <div className="suggestion-area"><span>TRY ASKING</span><div>{prompts.map((prompt) => <button key={prompt} onClick={() => onSend(prompt)}>{prompt}<ArrowUpRight size={13} /></button>)}</div></div>}
      </div><div className="chat-compose"><div className="attached-report">{report ? <><span className="attachment-icon"><FileText size={15} /></span><span><b>{report.name}</b><small>Attached to this chat</small></span><button aria-label="Remove attachment"><X size={14} /></button></> : <button className="attach-report" onClick={onUpload}><Paperclip size={14} /> Add a report</button>}</div><form className="compose-form" onSubmit={(event) => { event.preventDefault(); onSend() }}><input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask a question about your health..." aria-label="Your question" /><button type="button" className="compose-attach" onClick={onUpload} aria-label="Upload report"><Paperclip size={17} /></button><button className="send-button" disabled={!question.trim() || thinking} aria-label="Send question"><Send size={16} /></button></form><div className="compose-disclaimer">MediAI can make mistakes. Always consult a qualified healthcare professional.</div></div></div>
      <aside className="chat-side"><div className="side-card context-card"><span className="soft-label">YOUR CONTEXT</span>{report ? <div className="context-report"><span className="context-file"><FileText size={16} /></span><span><b>{report.name}</b><small>Report ready to discuss</small></span><CheckCircle2 size={15} /></div> : <div className="context-empty"><FilePlus2 size={20} /><p>Attach a report for more relevant explanations.</p><button onClick={onDemo}>Try sample report <ArrowRight size={13} /></button></div>}<div className="context-divider" /><span className="soft-label">QUICK QUESTIONS</span>{prompts.map((prompt) => <button className="quick-question" key={prompt} onClick={() => onSend(prompt)}>{prompt}<ArrowUpRight size={14} /></button>)}</div><div className="safe-chat-note"><ShieldCheck size={17} /><p><b>Careful by design</b><br />MediAI does not diagnose, prescribe, or change treatment. Your clinician is your best source of personal medical advice.</p></div></aside></div>
  </>
}

function NextStepsPage({ onCare }) {
  return <><PageHeading eyebrow="YOUR NEXT STEP" title="Thoughtful guidance, not guesswork." description="A useful place to start after reviewing your report or a health question." />
    <div className="recommendation-banner"><div className="recommendation-symbol"><Stethoscope size={25} /></div><div><span className="soft-label">BASED ON THE SAMPLE REPORT</span><h2>Consider a routine conversation with a clinician</h2><p>The sample Vitamin D result is below the lab's reference range. A healthcare professional can tell you whether it matters for you and if follow-up is appropriate.</p><button className="button button-dark" onClick={onCare}>Find nearby care <MapPin size={15} /></button></div><span className="banner-decoration">+</span></div>
    <div className="section-heading next-section-title"><div><span className="eyebrow">A SIMPLE GUIDE</span><h2>Choose the kind of support that fits</h2></div></div><div className="guidance-grid"><div className="guidance-card"><span className="guidance-number">01</span><span className="guidance-icon guidance-green"><HeartPulse size={19} /></span><h3>General health information</h3><p>For learning about a term or understanding what a test measures. MediAI can help explain, without deciding what it means for you.</p><span className="guidance-tag">Start with a question</span></div><div className="guidance-card recommended-guidance"><span className="guidance-number">02</span><span className="guidance-icon guidance-amber"><MessageCircle size={19} /></span><h3>Consider consulting a doctor</h3><p>For personal interpretation of a result, or if you have concerns. Bring your report and questions to a qualified professional.</p><span className="guidance-tag">Suggested for this sample</span></div><div className="guidance-card"><span className="guidance-number">03</span><span className="guidance-icon guidance-coral"><Activity size={19} /></span><h3>Seek prompt professional care</h3><p>If you feel seriously unwell or symptoms are worsening, contact a medical professional promptly. For an emergency, call local emergency services.</p><span className="guidance-tag">Urgent concerns</span></div></div>
    <div className="disclaimer-panel"><ShieldCheck size={18} /><div><b>Important medical disclaimer</b><p>MediGuide AI provides educational information only. It does not diagnose conditions, prescribe medicines, recommend dosage changes, or replace professional medical advice. Always speak with a qualified healthcare professional about your health. If you may be experiencing a medical emergency, contact your local emergency services now.</p></div></div>
  </>
}

function CarePage({ view, setView, search, setSearch, onDetails }) {
  const filtered = providers.filter((provider) => `${provider.name} ${provider.title} ${provider.place}`.toLowerCase().includes(search.toLowerCase()))
  return <><PageHeading eyebrow="CARE AROUND YOU" title="Find a good place to start." description="Browse demo providers near San Francisco. Availability and profiles are fictional." action={<button className="location-chip" onClick={() => window.navigator.geolocation?.getCurrentPosition(() => {}, () => {})}><MapPin size={15} /> San Francisco, CA <ChevronDown size={14} /></button>} />
    <div className="care-toolbar"><div className="search-field"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search doctors, clinics, specialties" /><kbd>⌘ K</kbd></div><div className="segmented"><button className={view === 'List' ? 'selected' : ''} onClick={() => setView('List')}><UsersRound size={15} /> List</button><button className={view === 'Map' ? 'selected' : ''} onClick={() => setView('Map')}><Map size={15} /> Map</button></div><button className="filter-button"><Activity size={15} /> Filters <ChevronDown size={13} /></button></div>
    <div className="care-layout"><div className="provider-list"><div className="results-count">{filtered.length} nearby care options <span>· Demo locations</span></div>{filtered.map((provider) => <ProviderCard provider={provider} key={provider.name} onDetails={onDetails} />)}{filtered.length === 0 && <div className="empty-state compact-empty"><Search size={22} /><h3>No matches found</h3><p>Try a different name or specialty.</p></div>}</div>
      <div className={`map-panel ${view === 'List' ? 'map-secondary' : ''}`}><div className="map-controls"><button aria-label="Zoom in">+</button><button aria-label="Zoom out">−</button></div><div className="map-label label-top"><span className="map-dot hospital-dot" /> NORTHSIDE</div><div className="map-label label-bottom">PACIFIC HEIGHTS</div><div className="map-park"><span>Alta Plaza<br />Park</span></div><div className="map-road road-one" /><div className="map-road road-two" /><div className="map-road road-three" /><div className="map-water" /><button className="map-pin pin-one" onClick={() => onDetails(providers[0])}><MapPin size={20} fill="currentColor" /></button><button className="map-pin pin-two" onClick={() => onDetails(providers[1])}><MapPin size={20} fill="currentColor" /></button><button className="map-pin pin-three" onClick={() => onDetails(providers[2])}><Hospital size={18} /></button><div className="you-marker"><span />You</div><div className="map-attribution">Illustrative map · Fictional locations</div></div></div>
    <div className="care-footer"><ShieldCheck size={15} /> Demo provider information is fictional and for product demonstration only.</div>
  </>
}
function ProviderCard({ provider, onDetails }) { return <div className="provider-card"><div className={`provider-avatar ${provider.color}`}>{provider.initials}</div><div className="provider-details"><div className="provider-name-row"><h3>{provider.name}</h3><span className="provider-distance"><MapPin size={12} />{provider.distance}</span></div><p>{provider.title}</p><span className="provider-place">{provider.place}</span><div className="provider-meta"><span><Star size={13} fill="currentColor" /> {provider.rating} <small>(128)</small></span><span><Clock3 size={13} /> {provider.times}</span></div><div className="provider-actions"><button className="button button-dark" onClick={() => onDetails(provider)}>View details <ArrowRight size={14} /></button><button className="directions-button" onClick={() => window.open(`https://maps.google.com/?q=${encodeURIComponent(provider.place + ' San Francisco')}`, '_blank', 'noopener,noreferrer')}><Navigation size={14} /> Directions</button></div></div></div> }

function ReportsPage({ report, onUpload, onAnalyze, onChat, onDemo }) {
  return <><PageHeading eyebrow="YOUR HEALTH LIBRARY" title="My reports" description="Keep your health documents in one private, easy-to-understand place." action={<button className="button button-dark" onClick={onUpload}><Upload size={15} /> Upload report</button>} />
    <div className="reports-overview"><div><span className="overview-icon mint"><FileText size={18} /></span><div><b>{report ? '1 report saved' : 'Your timeline starts here'}</b><span>{report ? 'Your documents are ready when you are.' : 'Upload a report or explore with a fictional sample.'}</span></div></div><div className="reports-privacy"><ShieldCheck size={15} /> Private to you</div></div>
    {report ? <div className="timeline"><div className="timeline-date"><span className="timeline-dot" /> TODAY <span>OCT 6</span></div><div className="timeline-card"><div className="timeline-file-icon"><FileText size={19} /></div><div className="timeline-info"><span className="report-type-label">{report.type.toUpperCase()}</span><h3>{report.name}</h3><p>Added {report.date} <span>·</span> {report.size}</p><div className="timeline-tags"><span className="tag-ready"><CheckCircle2 size={12} /> Ready to explore</span><span className="tag-fictional"><Sparkles size={12} /> Demo analysis</span></div></div><div className="timeline-actions"><button className="button button-dark" onClick={onAnalyze}>View analysis <ArrowRight size={14} /></button><button className="button button-outline" onClick={onChat}><MessageCircle size={14} /> Ask MediAI</button></div></div></div> : <div className="empty-state reports-empty"><div className="empty-icon"><FileImage size={23} /></div><h3>No reports yet</h3><p>Your reports will show up here, with a simple timeline of your health documents.</p><div><button className="button button-dark" onClick={onUpload}><Upload size={15} /> Upload a report</button><button className="text-action" onClick={onDemo}>Explore demo <ArrowRight size={14} /></button></div></div>}
    <div className="reports-note"><ShieldCheck size={16} /><span><b>Private by design.</b> Your health information is personal. This demo stores report details only in your current browser session.</span></div>
  </>
}

function BookingModal({ provider, booked, onConfirm, onClose }) {
  const [date, setDate] = useState('Today, Oct 6')
  const [time, setTime] = useState('2:30 PM')
  if (!provider) return null
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><div className="booking-modal" role="dialog" aria-modal="true" aria-label="Provider details and appointment"><button className="modal-close" aria-label="Close" onClick={onClose}><X size={19} /></button>{booked ? <div className="booking-success"><span className="success-check"><Check size={28} /></span><span className="eyebrow">REQUEST CONFIRMED</span><h2>You're on your way.</h2><p>Your demo appointment request with {provider.name} is set for {date} at {time}.</p><div className="success-summary"><CalendarDays size={17} /><span><b>{date}</b><small>{time} · {provider.place}</small></span></div><button className="button button-dark full-button" onClick={onClose}>Done</button><small className="demo-caption">This is a demonstration. No real appointment was booked.</small></div> : <><span className="eyebrow">PROVIDER DETAILS</span><div className="modal-provider"><div className={`provider-avatar large ${provider.color}`}>{provider.initials}</div><div><h2>{provider.name}</h2><span>{provider.title}</span></div></div><div className="modal-credentials"><span><Star size={14} fill="currentColor" /> {provider.rating} <small>· 128 reviews</small></span><span><MapPin size={14} /> {provider.distance} away</span><span><CheckCircle2 size={14} /> Board certified</span></div><div className="provider-bio"><p><b>{provider.place}</b><br />Experienced, patient-centered care in a welcoming neighborhood clinic. Accepting new patients.</p><div><span>Qualifications</span><b>MD · Internal Medicine</b><span>Experience</span><b>12 years</b></div></div><div className="booking-fields"><label>Choose a day<select value={date} onChange={(event) => setDate(event.target.value)}><option>Today, Oct 6</option><option>Tomorrow, Oct 7</option><option>Thursday, Oct 8</option></select></label><label>Available time<select value={time} onChange={(event) => setTime(event.target.value)}><option>2:30 PM</option><option>3:45 PM</option><option>4:15 PM</option><option>9:15 AM</option></select></label></div><button className="button button-dark full-button" onClick={onConfirm}>Request appointment <ArrowRight size={15} /></button><div className="modal-footnote"><ShieldCheck size={14} /> Demo only. This does not contact a real provider.</div></>}</div></div>
}

export default App
