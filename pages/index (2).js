// pages/index.js
import { useState, useRef } from 'react';
import Head from 'next/head';
import styles from '../styles/Home.module.css';
import DebugPanel from '../components/DebugPanel';

const NICHES = [
  { value: 'HVAC contractor', label: 'HVAC' },
  { value: 'roofing contractor', label: 'Roofing' },
  { value: 'water damage restoration', label: 'Water & Fire Restoration' },
  { value: 'pool installation company', label: 'Pool & Spa' },
  { value: 'foundation repair', label: 'Foundation & Waterproofing' },
  { value: 'generator installation', label: 'Generator Installation' },
  { value: 'plumbing contractor', label: 'Plumbing' },
  { value: 'garage door repair', label: 'Garage Door' },
];

const PIPE_STEPS = [
  { id: 'apify', icon: '📍', label: 'Apify Scraper', sub: 'Google Maps data' },
  { id: 'filter', icon: '🔍', label: 'ICP Filter', sub: 'Review range + signals' },
  { id: 'grok', icon: '🤖', label: 'Grok AI', sub: 'Owner + email research' },
  { id: 'verify', icon: '✉️', label: 'Email Verify', sub: 'DNS + MX check' },
];

export default function Home() {
  const [city, setCity] = useState('Dallas, TX');
  const [niche, setNiche] = useState('HVAC contractor');
  const [minRev, setMinRev] = useState(20);
  const [maxRev, setMaxRev] = useState(500);
  const [maxResults, setMaxResults] = useState(20);
  const [leads, setLeads] = useState([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [logs, setLogs] = useState([]);
  const [pipeStatus, setPipeStatus] = useState({});
  const [expandedId, setExpandedId] = useState(null);
  const [tableTitle, setTableTitle] = useState('Configure your hunt and press the button');
  const [copyState, setCopyState] = useState({});
  const logRef = useRef(null);

  function addLog(msg, type = '') {
    setLogs(prev => [...prev, { msg, type, id: Date.now() + Math.random() }]);
    setTimeout(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, 50);
  }

  function setPipe(id, state) {
    setPipeStatus(prev => ({ ...prev, [id]: state }));
  }

  function updateProg(pct, label) {
    setProgress(pct);
    setProgressLabel(label);
  }

  async function startHunt() {
    if (running) return;
    setRunning(true);
    setLeads([]);
    setLogs([]);
    setPipeStatus({});
    setExpandedId(null);
    setTableTitle('Hunting...');
    updateProg(0, 'Starting...');

    try {
      // STEP 1: Apify search
      setPipe('apify', 'active');
      updateProg(5, `Searching Google Maps for ${niche} in ${city}...`);
      addLog(`Launching Apify scraper for "${niche}" in ${city}`, 'info');
      addLog('This takes 30–60 seconds while Apify scrapes Google Maps...', '');

      const searchRes = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: niche, city, minReviews: minRev, maxReviews: maxRev, maxResults })
      });

      const searchData = await searchRes.json();
      if (!searchRes.ok) throw new Error(searchData.error || 'Search failed');

      const places = searchData.results || [];
      setPipe('apify', 'done');
      addLog(`Found ${places.length} businesses with ${minRev}–${maxRev} reviews (scraped ${searchData.scraped || '?'} total)${searchData.partial ? ' — partial results' : ''}`, places.length > 0 ? 'ok' : 'warn');
      if (searchData.debug) addLog(searchData.debug, '');

      if (places.length === 0) {
        addLog('No businesses found. Try broader city or adjust review range.', 'err');
        setTableTitle('No results — adjust filters and retry');
        setRunning(false);
        return;
      }

      // STEP 2: Filter
      setPipe('filter', 'active');
      updateProg(22, 'Filtering by ICP signals...');
      addLog(`${places.length} businesses passed review filter`, 'ok');
      setPipe('filter', 'done');

      // STEP 3: Grok enrichment per lead
      setPipe('grok', 'active');
      addLog('Starting Grok AI enrichment — researching each business...', 'info');

      const enrichedLeads = [];
      for (let i = 0; i < places.length; i++) {
        const place = places[i];
        const pct = 25 + Math.round((i / places.length) * 50);
        updateProg(pct, `Grok researching ${i + 1}/${places.length}: ${place.name}`);
        addLog(`Researching: ${place.name}`);

        try {
          const enrichRes = await fetch('/api/enrich', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ business: place, niche, city })
          });
          const enriched = await enrichRes.json();
          if (!enrichRes.ok) throw new Error(enriched.error);

          const lead = {
            id: i,
            ...place,
            ...enriched,
            emailVerif: null,
            emailVerifReason: '',
            emailVerifColor: 'gray',
          };
          enrichedLeads.push(lead);
          setLeads([...enrichedLeads]);
        } catch (e) {
          addLog(`Grok error on ${place.name}: ${e.message}`, 'err');
          enrichedLeads.push({ id: i, ...place, icpScore: 'WARM', ownerName: 'Unknown', email: '', coldEmail: '' });
          setLeads([...enrichedLeads]);
        }

        await sleep(600);
      }

      setPipe('grok', 'done');
      addLog('Grok enrichment complete', 'ok');

      // STEP 4: Email verification
      setPipe('verify', 'active');
      updateProg(80, 'Verifying emails via DNS/MX...');
      addLog('Running DNS verification on all emails...', 'info');

      const verifiedLeads = [...enrichedLeads];
      for (let i = 0; i < verifiedLeads.length; i++) {
        const lead = verifiedLeads[i];
        if (lead.email) {
          try {
            const vRes = await fetch('/api/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: lead.email })
            });
            const vData = await vRes.json();
            verifiedLeads[i] = { ...lead, emailVerif: vData.conf, emailVerifReason: vData.reason, emailVerifColor: vData.color };
            addLog(`${lead.business}: ${lead.email} → ${vData.conf}`);
          } catch (e) {
            verifiedLeads[i] = { ...lead, emailVerif: 'UNKNOWN', emailVerifReason: 'Verification failed', emailVerifColor: 'gray' };
          }
        }
        setLeads([...verifiedLeads]);
        await sleep(200);
      }

      setPipe('verify', 'done');
      updateProg(100, 'Hunt complete!');
      addLog(`Done — ${verifiedLeads.length} leads ready`, 'ok');

      const hotCount = verifiedLeads.filter(l => l.icpScore === 'HOT').length;
      setTableTitle(`${verifiedLeads.length} leads found in ${city} — ${hotCount} HOT`);

    } catch (e) {
      addLog(`Error: ${e.message}`, 'err');
      setTableTitle('Hunt failed — check logs');
    }

    setRunning(false);
  }

  function toggleExpand(id) {
    setExpandedId(prev => prev === id ? null : id);
  }

  async function copyEmail(i, text) {
    await navigator.clipboard.writeText(text);
    setCopyState(prev => ({ ...prev, [i]: true }));
    setTimeout(() => setCopyState(prev => ({ ...prev, [i]: false })), 2000);
  }

  async function rewriteEmail(i) {
    const lead = leads[i];
    if (!lead) return;
    setLeads(prev => prev.map((l, idx) => idx === i ? { ...l, rewriting: true } : l));
    try {
      const res = await fetch('/api/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business: lead,
          niche: `${niche} — rewrite this cold email to be punchier, more direct, 4 sentences max. Current email: ${lead.coldEmail}`,
          city
        })
      });
      const data = await res.json();
      if (data.coldEmail) {
        setLeads(prev => prev.map((l, idx) => idx === i ? { ...l, coldEmail: data.coldEmail, rewriting: false } : l));
      }
    } catch (e) {
      setLeads(prev => prev.map((l, idx) => idx === i ? { ...l, rewriting: false } : l));
    }
  }

  function exportCSV() {
    if (!leads.length) return;
    const headers = ['#','Business','Owner','Phone','Email','Email Conf','Email Reason','Email Source','Website','Address','Reviews','Rating','ICP Score','ICP Reason','Angi Listed','Active Ads','Team Size','Pain Hook','Cold Email'];
    const rows = leads.map((l, i) => [
      i+1, l.name, l.ownerName, l.phone, l.email, l.emailVerif, l.emailVerifReason, l.emailSource,
      l.website, l.address, l.reviewCount, l.rating, l.icpScore, l.icpReason,
      l.angiListed, l.activeAds, l.teamSize, l.painHook, l.coldEmail
    ].map(v => `"${String(v||'').replace(/"/g,'""')}"`).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `nexus-leads-${city.replace(/[^a-z0-9]/gi,'-').toLowerCase()}.csv`;
    a.click();
  }

  const hotCount = leads.filter(l => l.icpScore === 'HOT').length;
  const emailCount = leads.filter(l => l.email).length;
  const readyCount = leads.filter(l => l.icpScore === 'HOT' && l.emailVerif === 'HIGH').length;

  return (
    <>
      <Head>
        <title>NEXUS Lead Hunter</title>
        <meta name="description" content="AI-powered B2B lead generation for high-ticket service businesses" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className={styles.app}>
        {/* HEADER */}
        <header className={styles.header}>
          <div className={styles.brand}>
            <div className={styles.brandIcon}>NX</div>
            <div>
              <div className={styles.brandName}>NEXUS Lead Hunter</div>
              <div className={styles.brandSub}>Apify · Grok AI · DNS Verification</div>
            </div>
          </div>
          <div className={styles.headerRight}>
            <span className={styles.headerTag}>🔒 Keys secured via environment variables</span>
          </div>
        </header>

        {/* CONFIG */}
        <div className={styles.config}>
          <div className={styles.configGrid}>
            <div className={styles.field}>
              <label>City / Metro</label>
              <input type="text" value={city} onChange={e => setCity(e.target.value)} placeholder="e.g. Dallas, TX" />
            </div>
            <div className={styles.field}>
              <label>Niche</label>
              <select value={niche} onChange={e => setNiche(e.target.value)}>
                {NICHES.map(n => <option key={n.value} value={n.value}>{n.label}</option>)}
              </select>
            </div>
            <div className={styles.field}>
              <label>Min reviews</label>
              <input type="number" value={minRev} onChange={e => setMinRev(e.target.value)} min="0" />
            </div>
            <div className={styles.field}>
              <label>Max reviews</label>
              <input type="number" value={maxRev} onChange={e => setMaxRev(e.target.value)} min="1" />
            </div>
            <div className={styles.field}>
              <label>Leads to find</label>
              <select value={maxResults} onChange={e => setMaxResults(e.target.value)}>
                <option value={5}>5 — quick test</option>
                <option value={10}>10 leads</option>
                <option value={20}>20 leads</option>
              </select>
            </div>
            <button className={styles.runBtn} onClick={startHunt} disabled={running}>
              {running ? '⏳ Hunting...' : '⚡ Hunt leads'}
            </button>
          </div>
        </div>

        {/* DEBUG PANEL */}
        <DebugPanel />

        {/* PIPELINE */}
        <div className={styles.pipeline}>
          {PIPE_STEPS.map(step => (
            <div key={step.id} className={`${styles.pipeStep} ${pipeStatus[step.id] ? styles['pipe_' + pipeStatus[step.id]] : ''}`}>
              <div className={styles.pipeIcon}>{step.icon}</div>
              <div>
                <div className={styles.pipeLabel}>{step.label}</div>
                <div className={styles.pipeSub}>{step.sub}</div>
              </div>
            </div>
          ))}
        </div>

        {/* PROGRESS */}
        {(running || logs.length > 0) && (
          <div className={styles.progressWrap}>
            <div className={styles.progressTop}>
              <span className={styles.progressLabel}>{progressLabel}</span>
              <span className={styles.progressPct}>{progress}%</span>
            </div>
            <div className={styles.barBg}><div className={styles.barFill} style={{ width: progress + '%' }} /></div>
            <div className={styles.logArea} ref={logRef}>
              {logs.map(l => (
                <span key={l.id} className={`${styles.ll} ${l.type ? styles['ll_' + l.type] : ''}`}>› {l.msg}</span>
              ))}
            </div>
          </div>
        )}

        {/* STATS */}
        <div className={styles.stats}>
          <div className={styles.stat}><div className={styles.statN}>{leads.length}</div><div className={styles.statL}>Leads found</div></div>
          <div className={styles.stat}><div className={`${styles.statN} ${styles.green}`}>{hotCount}</div><div className={styles.statL}>HOT leads</div></div>
          <div className={styles.stat}><div className={`${styles.statN} ${styles.amber}`}>{emailCount}</div><div className={styles.statL}>Emails sourced</div></div>
          <div className={styles.stat}><div className={`${styles.statN} ${styles.accent}`}>{readyCount}</div><div className={styles.statL}>Ready to send</div></div>
        </div>

        {/* TABLE */}
        <div className={styles.tableWrap}>
          <div className={styles.tableHead}>
            <span className={styles.tableTitle}>{tableTitle}</span>
            {leads.length > 0 && (
              <button className={styles.expBtn} onClick={exportCSV}>⬇ Export CSV</button>
            )}
          </div>

          {leads.length > 0 && (
            <div className={styles.colLabels}>
              <span>#</span><span>Business</span><span>Niche</span><span>ICP Score</span><span>Email Verified</span><span></span>
            </div>
          )}

          <div>
            {leads.length === 0 && !running && (
              <div className={styles.empty}>
                <div className={styles.emptyIcon}>🎯</div>
                <div className={styles.emptyMsg}>Leads will appear here as the agent works through each business</div>
              </div>
            )}

            {leads.map((lead, i) => {
              const isOpen = expandedId === lead.id;
              const nicheLower = (lead.category || niche).toLowerCase();
              const nicheCls = nicheLower.includes('hvac') ? styles.bHvac :
                nicheLower.includes('roof') ? styles.bRoof :
                nicheLower.includes('restor') || nicheLower.includes('water') ? styles.bResto :
                nicheLower.includes('pool') ? styles.bPool : styles.bOther;
              const scoreCls = lead.icpScore === 'HOT' ? styles.sHot :
                lead.icpScore === 'WARM' ? styles.sWarm : styles.sCold;
              const vdotCls = lead.emailVerifColor === 'green' ? styles.vdGreen :
                lead.emailVerifColor === 'amber' ? styles.vdAmber :
                lead.emailVerifColor === 'red' ? styles.vdRed : styles.vdGray;
              const nicheLabel = NICHES.find(n => n.value === niche)?.label || niche;

              return (
                <div key={lead.id} className={styles.leadWrap}>
                  <div className={styles.leadMain} onClick={() => toggleExpand(lead.id)}>
                    <span className={styles.leadNum}>{String(i + 1).padStart(2, '0')}</span>
                    <div className={styles.leadInfo}>
                      <div className={styles.leadName}>{lead.name || '—'}</div>
                      <div className={styles.leadOwner}>{lead.ownerName || 'Owner researching...'}{lead.teamSize ? ` · ${lead.teamSize}` : ''}</div>
                    </div>
                    <span className={`${styles.badge} ${nicheCls}`}>{nicheLabel}</span>
                    <span className={`${styles.score} ${scoreCls}`}>{lead.icpScore || '—'}</span>
                    <div className={styles.vconf}>
                      <span className={`${styles.vdot} ${vdotCls}`}></span>
                      {lead.emailVerif || (lead.email ? 'Verifying...' : '—')}
                    </div>
                    <span className={`${styles.expandIcon} ${isOpen ? styles.open : ''}`}>›</span>
                  </div>

                  {isOpen && (
                    <div className={styles.leadDetail}>
                      <div className={styles.detailGrid}>
                        {/* LEFT */}
                        <div>
                          <div className={styles.sectionLabel}>Contact info</div>
                          {lead.phone && <div className={styles.infoRow}><span>📞</span><span>{lead.phone}</span></div>}
                          {lead.email && (
                            <div className={styles.infoRow}>
                              <span>✉️</span>
                              <div>
                                <div>{lead.email}</div>
                                <div className={styles.infoSub}>{lead.emailSource}</div>
                                {lead.emailVerif && (
                                  <div className={styles.verifBadge}>
                                    <span className={`${styles.vdot} ${vdotCls}`}></span>
                                    {lead.emailVerif} — {lead.emailVerifReason}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                          {lead.website && (
                            <div className={styles.infoRow}>
                              <span>🌐</span>
                              <a href={lead.website} target="_blank" rel="noreferrer">{lead.website.replace(/https?:\/\//,'').split('/')[0]}</a>
                            </div>
                          )}
                          {lead.mapsUrl && (
                            <div className={styles.infoRow}>
                              <span>📍</span>
                              <span><a href={lead.mapsUrl} target="_blank" rel="noreferrer">Google Maps</a> · {lead.reviewCount} reviews · ⭐ {lead.rating}</span>
                            </div>
                          )}

                          <div className={styles.sectionLabel} style={{ marginTop: '1.25rem' }}>ICP signals</div>
                          <div className={styles.sigItem}>
                            <span className={`${styles.sigBox} ${lead.angiListed ? styles.sigY : styles.sigN}`}>{lead.angiListed ? '✓' : '✗'}</span>
                            Angi / HomeAdvisor listed
                          </div>
                          <div className={styles.sigItem}>
                            <span className={`${styles.sigBox} ${lead.activeAds ? styles.sigY : styles.sigN}`}>{lead.activeAds ? '✓' : '✗'}</span>
                            Running paid ads
                          </div>
                          <div className={styles.sigItem}>
                            <span className={`${styles.sigBox} ${styles.sigY}`}>~</span>
                            {lead.reviewCount} reviews
                          </div>
                          {lead.icpReason && <div className={styles.icpReason}>{lead.icpReason}</div>}
                          {lead.painHook && <div className={styles.painCard}>{lead.painHook}</div>}
                        </div>

                        {/* RIGHT */}
                        <div>
                          <div className={styles.sectionLabel}>Cold email — ready to send</div>
                          <div className={styles.emailArea}>
                            {lead.rewriting ? 'Rewriting...' : (lead.coldEmail || 'Generating...')}
                          </div>
                          <div className={styles.actionRow}>
                            <button
                              className={`${styles.actBtn} ${copyState[i] ? styles.success : ''}`}
                              onClick={() => copyEmail(i, lead.coldEmail)}
                            >
                              {copyState[i] ? '✓ Copied!' : '⎘ Copy email'}
                            </button>
                            <button className={styles.actBtn} onClick={() => rewriteEmail(i)}>
                              ✦ Rewrite with Grok
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
