import React, { useState, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { DATA, T } from './translations';
import './App.css';

const API = 'http://localhost:8000';
const HISTORY_STORAGE_KEY = 'smart-crop-advisor-history';

// ─── Small reusable components ───────────────

function SelectField({ label, value, onChange, options, icon }) {
  return (
    <div className="field">
      <label className="field-label">{icon && <span className="field-icon">{icon}</span>}{label}</label>
      <div className="select-wrap">
        <select className="field-select" value={value} onChange={e => onChange(e.target.value)}>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <span className="select-arrow">▾</span>
      </div>
    </div>
  );
}

function InputField({ label, value, onChange, placeholder, type = 'text', min, max, step, preserveNumericString = false, icon }) {
  return (
    <div className="field">
      <label className="field-label">{icon && <span className="field-icon">{icon}</span>}{label}</label>
      <input
        className="field-input"
        type={type} value={value}
        onChange={e => onChange(type === 'number' && !preserveNumericString ? Number(e.target.value) : e.target.value)}
        placeholder={placeholder} min={min} max={max} step={step}
      />
    </div>
  );
}

function SliderField({ label, value, onChange, min, max, step, unit, icon }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="field">
      <label className="field-label">
        {icon && <span className="field-icon">{icon}</span>}
        {label}
        <span className="slider-value">{value} {unit}</span>
      </label>
      <div className="slider-track-wrap" style={{ '--slider-pct': `${pct}%` }}>
        <div className="slider-fill" style={{ width: `${pct}%` }} />
        <input className="field-slider" type="range" min={min} max={max} step={step} value={value}
          onInput={e => onChange(Number(e.currentTarget.value))} />
      </div>
    </div>
  );
}

function SectionCard({ title, icon, children, delay = 0 }) {
  return (
    <div className="section-card" style={{ animationDelay: `${delay}ms` }}>
      <div className="section-header">
        <span className="section-icon">{icon}</span>
        <h3 className="section-title">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function MetricPill({ label, value }) {
  return (
    <div className="metric-pill">
      <span className="metric-label">{label}</span>
      <span className="metric-value">{value}</span>
    </div>
  );
}

function FarmVisualization({ data, tx }) {
  const rainfallPct = Math.min(100, Math.max(0, (Number(data.annual_rainfall) / 3000) * 100));
  const tempStart = Math.min(100, Math.max(0, ((Number(data.temp_min) + 10) / 70) * 100));
  const tempEnd = Math.min(100, Math.max(0, ((Number(data.temp_max) + 10) / 70) * 100));

  return (
    <section className="farm-visuals" aria-label={tx.visualTitle}>
      <div className="visuals-heading">
        <span className="visuals-kicker">{tx.visualEyebrow}</span>
        <h2>{tx.visualTitle}</h2>
      </div>
      <div className="visual-grid">
        <article className="visual-card rainfall-visual">
          <span className="visual-icon">🌧️</span>
          <span className="visual-label">{tx.metrics.rain}</span>
          <strong className="visual-value">{data.annual_rainfall}<small> mm</small></strong>
          <div className="visual-meter" role="img" aria-label={`${data.annual_rainfall} mm of 3000 mm scale`}>
            <span style={{ width: `${rainfallPct}%` }} />
          </div>
          <span className="visual-scale">{tx.rainfallScale}</span>
        </article>
        <article className="visual-card land-visual">
          <span className="visual-icon">🗺️</span>
          <span className="visual-label">{tx.metrics.land}</span>
          <strong className="visual-value">{data.land_size}<small> {data.land_unit}</small></strong>
          <div className="land-pattern" aria-hidden="true"><span /><span /><span /><span /><span /><span /><span /><span /></div>
          <span className="visual-scale">{data.location}</span>
        </article>
        <article className="visual-card temperature-visual">
          <span className="visual-icon">🌡️</span>
          <span className="visual-label">{tx.metrics.temp}</span>
          <strong className="visual-value">{data.temp_min}° <small>to</small> {data.temp_max}°<small> C</small></strong>
          <div className="temperature-track" role="img" aria-label={`${tx.metrics.temp}: ${data.temp_min} to ${data.temp_max} degrees Celsius`}>
            <span style={{ left: `${tempStart}%`, width: `${Math.max(0, tempEnd - tempStart)}%` }} />
          </div>
          <div className="temperature-scale"><span>-10°C</span><span>60°C</span></div>
        </article>
      </div>
    </section>
  );
}

function ReportHistoryModal({ entries, onClose, onSelect, onClear, tx }) {
  return (
    <div className="history-backdrop" onMouseDown={onClose}>
      <section className="history-dialog" role="dialog" aria-modal="true" aria-labelledby="history-title" onMouseDown={event => event.stopPropagation()}>
        <header className="history-dialog-header">
          <div>
            <span className="visuals-kicker">{tx.historyEyebrow}</span>
            <h2 id="history-title">{tx.historyTitle}</h2>
          </div>
          <button className="history-close" type="button" onClick={onClose} aria-label={tx.closeHistory}>×</button>
        </header>
        {entries.length ? (
          <>
            <div className="history-list">
              {entries.map(entry => (
                <button className="history-entry" type="button" key={entry.id} onClick={() => onSelect(entry)}>
                  <span className="history-entry-icon">🌾</span>
                  <span className="history-entry-copy">
                    <strong>{entry.summaryData.crop}</strong>
                    <span>{entry.summaryData.location} · {entry.summaryData.soil_type}</span>
                    <time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString()}</time>
                  </span>
                  <span className="history-entry-arrow" aria-hidden="true">↗</span>
                </button>
              ))}
            </div>
            <button className="history-clear" type="button" onClick={onClear}>{tx.clearHistory}</button>
          </>
        ) : (
          <p className="history-empty">{tx.historyEmpty}</p>
        )}
      </section>
    </div>
  );
}

// ─── Report Renderer ──────────────────────────

function ReportRenderer({ content, isStreaming }) {
  const sections = parseReport(content);

  return (
    <div className="report-body">
      {sections.map((sec, i) => (
        <ReportSection key={i} section={sec} index={i} isStreaming={isStreaming && i === sections.length - 1} />
      ))}
      {isStreaming && <span className="typing-cursor">▋</span>}
    </div>
  );
}

function parseReport(raw) {
  if (!raw) return [];
  const lines = raw.split('\n');
  const sections = [];
  let current = null;

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (current) sections.push(current);
      current = { heading: line.replace(/^##\s*/, ''), content: '', emoji: extractEmoji(line) };
    } else if (current) {
      current.content += line + '\n';
    } else {
      if (!sections.length) sections.push({ heading: '', content: line + '\n', emoji: '' });
      else sections[sections.length - 1].content += line + '\n';
    }
  }
  if (current) sections.push(current);
  return sections.filter(s => s.content.trim() || s.heading);
}

const SECTION_META = {
  'VIABILITY': { color: '#2d6a4f', bg: 'rgba(45,106,79,.08)', icon: '🌾' },
  'ECONOMIC':  { color: '#b45309', bg: 'rgba(180,83,9,.07)',  icon: '💰' },
  'PLANTING':  { color: '#0369a1', bg: 'rgba(3,105,161,.07)', icon: '📅' },
  'GROWING':   { color: '#7c3aed', bg: 'rgba(124,58,237,.07)',icon: '🌱' },
  'PEST':      { color: '#be123c', bg: 'rgba(190,18,60,.07)', icon: '🐛' },
  'RISK':      { color: '#d97706', bg: 'rgba(217,119,6,.07)', icon: '⚠️' },
  'PRO':       { color: '#0f766e', bg: 'rgba(15,118,110,.07)',icon: '💡' },
  'FINAL':     { color: '#1d4ed8', bg: 'rgba(29,78,216,.07)', icon: '🎯' },
};

function getSectionMeta(heading) {
  const up = heading.toUpperCase();
  for (const [key, val] of Object.entries(SECTION_META)) {
    if (up.includes(key)) return val;
  }
  return { color: '#2d6a4f', bg: 'rgba(45,106,79,.05)', icon: '📋' };
}

function extractEmoji(text) {
  const match = text.match(/\p{Emoji}/u);
  return match ? match[0] : '';
}

function ReportSection({ section, index, isStreaming }) {
  const meta = getSectionMeta(section.heading);
  const cleanHeading = section.heading.replace(/^\p{Emoji}\s*/u, '');

  return (
    <div className="report-section" style={{
      '--sec-color': meta.color,
      '--sec-bg': meta.bg,
      animationDelay: `${index * 80}ms`
    }}>
      {section.heading && (
        <div className="report-sec-header">
          <span className="report-sec-num">{String(index + 1).padStart(2, '0')}</span>
          <span className="report-sec-icon">{meta.icon}</span>
          <h3 className="report-sec-title">{cleanHeading}</h3>
          {isStreaming && <span className="sec-live-dot" />}
        </div>
      )}
      <div className="report-sec-content">
        <ReactMarkdown remarkPlugins={[remarkGfm]}
          components={{
            strong: ({children}) => <strong className="md-bold">{children}</strong>,
            em:     ({children}) => <em className="md-em">{children}</em>,
            li:     ({children}) => <li className="md-li">{children}</li>,
            p:      ({children}) => <p className="md-p">{children}</p>,
            h3:     ({children}) => <h3 className="md-h3">{children}</h3>,
            table:  ({children}) => <div className="md-table-wrap"><table className="md-table">{children}</table></div>,
            th:     ({children}) => <th className="md-th">{children}</th>,
            td:     ({children}) => <td className="md-td">{children}</td>,
            code:   ({children}) => <code className="md-code">{children}</code>,
          }}
        >
          {section.content}
        </ReactMarkdown>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────

export default function App() {
  const [lang, setLang] = useState('en');
  const [step, setStep] = useState('form'); // form | result
  const [formData, setFormData] = useState({
    crop: '', soil_type: '', season: '', location: '',
    temp_min: 15, temp_max: 35, annual_rainfall: 750,
    land_size: 2, land_unit: '', water_source: '',
    farming_experience: '', budget: '', extra_notes: '', language: 'English',
    manualCrop: '',
  });
  const [reportText, setReportText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [modelUsed, setModelUsed] = useState('');
  const [error, setError] = useState('');
  const [summaryData, setSummaryData] = useState(null);
  const [altText, setAltText] = useState('');
  const [altLoading, setAltLoading] = useState(false);
  const [altShown, setAltShown] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [reportHistory, setReportHistory] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) || '[]');
    } catch (_) {
      return [];
    }
  });
  const reportRef = useRef(null);
  const abortRef = useRef(null);

  const tx = T[lang];

  // Initialize defaults from translated data
  const d = DATA;
  const getDefault = useCallback((key) => {
    return formData[key] || d[key][lang][0];
  }, [formData, d, lang]);

  const set = (key) => (val) => setFormData(prev => ({ ...prev, [key]: val }));

  const soilOpts   = d.soilTypes[lang];
  const seasonOpts = d.seasons[lang];
  const cropOpts   = d.crops[lang];
  const unitOpts   = d.landUnits[lang];
  const waterOpts  = d.waterSources[lang];
  const expOpts    = d.experience[lang];
  const budgetOpts = d.budget[lang];
  const otherLabel = tx.otherOption;

  const currentCrop   = formData.crop   || cropOpts[15];  // Tomato default
  const currentSoil   = formData.soil_type   || soilOpts[0];
  const currentSeason = formData.season || seasonOpts[0];
  const currentUnit   = formData.land_unit   || unitOpts[0];
  const currentWater  = formData.water_source || waterOpts[0];
  const currentExp    = formData.farming_experience || expOpts[0];
  const currentBudget = formData.budget || budgetOpts[1];

  const isOtherCrop = currentCrop === otherLabel;
  const finalCrop = isOtherCrop ? formData.manualCrop.trim() : currentCrop;

  async function handleSubmit(e) {
    e.preventDefault();
    if (isOtherCrop && !formData.manualCrop.trim()) {
      alert(lang === 'en' ? 'Please enter crop name.' : 'कृपया पिकाचे नाव टाका.');
      return;
    }
    if (formData.temp_min >= formData.temp_max) {
      alert(lang === 'en' ? 'Min temp must be less than max temp.' : 'किमान तापमान कमाल तापमानापेक्षा कमी असावे.');
      return;
    }
    const landSize = Number(formData.land_size);
    if (!Number.isFinite(landSize) || landSize < 0.1 || landSize > 10000) {
      alert(lang === 'en' ? 'Land size must be between 0.1 and 10,000.' : 'जमिनीचे क्षेत्र ०.१ ते १०,००० दरम्यान असावे.');
      return;
    }

    const payload = {
      crop: finalCrop, soil_type: currentSoil, season: currentSeason,
      location: formData.location || (lang === 'en' ? 'India' : 'भारत'),
      temp_min: formData.temp_min, temp_max: formData.temp_max,
      annual_rainfall: formData.annual_rainfall,
      land_size: landSize, land_unit: currentUnit,
      water_source: currentWater, farming_experience: currentExp,
      budget: currentBudget, extra_notes: formData.extra_notes,
      language: lang === 'mr' ? 'Marathi' : 'English',
    };

    setSummaryData(payload);
    setReportText('');
    setModelUsed('');
    setError('');
    setAltText('');
    setAltShown(false);
    setIsStreaming(true);
    setStep('result');

    setTimeout(() => reportRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);

    try {
      const resp = await fetch(`${API}/api/advise`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        throw new Error(`Request failed (${resp.status}): ${await resp.text()}`);
      }
      if (!resp.body) {
        throw new Error('The server returned no response stream.');
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let receivedText = '';
      let receivedModel = '';
      let streamError = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;
          try {
            const obj = JSON.parse(raw);
            if (obj.type === 'model') {
              receivedModel = obj.model;
              setModelUsed(obj.model);
            }
            else if (obj.type === 'token') {
              receivedText += obj.text;
              setReportText(prev => prev + obj.text);
            }
            else if (obj.type === 'error') {
              streamError = obj.message;
              setError(obj.message);
            }
            else if (obj.type === 'done') setIsStreaming(false);
          } catch (_) {}
        }
      }
      if (!receivedText.trim() && !streamError) {
        setError('The model returned no advisory text. Please try again.');
      }
      if (receivedText.trim() && !streamError) {
        setReportHistory(previous => {
          const next = [{
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            createdAt: new Date().toISOString(),
            summaryData: payload,
            reportText: receivedText,
            modelUsed: receivedModel,
          }, ...previous].slice(0, 20);
          try {
            localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next));
          } catch (_) {}
          return next;
        });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsStreaming(false);
    }
  }

  async function loadAlternatives() {
    if (!summaryData) return;
    setAltLoading(true);
    setAltShown(true);
    try {
      const r = await fetch(`${API}/api/alternatives`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(summaryData),
      });
      const data = await r.json();
      setAltText(data.alternatives || '');
    } catch (_) {
      setAltText('Could not load alternatives.');
    } finally {
      setAltLoading(false);
    }
  }

  function downloadReport() {
    const blob = new Blob([
      `${tx.reportTitle}: ${finalCrop}\n${'='.repeat(50)}\n\n${reportText}`
    ], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `crop_advisory_${finalCrop.replace(/\s+/g, '_').toLowerCase()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function restoreReport(entry) {
    setSummaryData(entry.summaryData);
    setReportText(entry.reportText);
    setModelUsed(entry.modelUsed || '');
    setError('');
    setIsStreaming(false);
    setAltText('');
    setAltShown(false);
    setStep('result');
    setShowHistory(false);
  }

  function clearReportHistory() {
    const confirmed = window.confirm(tx.historyClearConfirm);
    if (!confirmed) return;
    setReportHistory([]);
    try {
      localStorage.removeItem(HISTORY_STORAGE_KEY);
    } catch (_) {}
  }

  function toggleLang() {
    const next = lang === 'en' ? 'mr' : 'en';
    setLang(next);
    setFormData(prev => ({
      ...prev,
      crop: '', soil_type: '', season: '', land_unit: '',
      water_source: '', farming_experience: '', budget: '',
    }));
  }

  // ── FORM VIEW ─────────────────────────────
  if (step === 'form') return (
    <div className="app">
      {/* Background orbs */}
      <div className="bg-orb orb-1" /><div className="bg-orb orb-2" /><div className="bg-orb orb-3" />

      {/* Header */}
      <header className="app-header">
        <div className="header-inner">
          <div className="logo-mark">🌾</div>
          <div className="header-text">
            <h1 className="app-title">{tx.title}</h1>
            <p className="app-subtitle">{tx.subtitle}</p>
          </div>
            <button className="history-open" type="button" onClick={() => setShowHistory(true)}>
              <span aria-hidden="true">◷</span> {tx.history} <span className="history-count">{reportHistory.length}</span>
            </button>
          <button className="lang-toggle" onClick={toggleLang}>
            <span className="lang-toggle-icon">🌐</span> {tx.langBtn}
          </button>
        </div>
      </header>

      {/* Form */}
      <main className="form-main">
        <form onSubmit={handleSubmit} className="crop-form">
          <div className="form-grid">

            {/* Left column */}
            <div className="form-col">
              <SectionCard title={tx.sections.soilClimate} icon="🌍" delay={0}>
                <SelectField label={tx.labels.soilType}   value={currentSoil}   onChange={set('soil_type')}  options={soilOpts}   icon="🪨" />
                <SelectField label={tx.labels.season}     value={currentSeason} onChange={set('season')}     options={seasonOpts} icon="📅" />
                <InputField  label={tx.labels.location}   value={formData.location} onChange={set('location')} placeholder={tx.labels.locationPh} icon="📍" />
                <div className="field-row">
                  <InputField label={tx.labels.minTemp} value={formData.temp_min} onChange={set('temp_min')} type="number" min={-10} max={50} icon="🌡️" />
                  <InputField label={tx.labels.maxTemp} value={formData.temp_max} onChange={set('temp_max')} type="number" min={0}   max={60} icon="☀️" />
                </div>
                <SliderField label={tx.labels.rainfall} value={formData.annual_rainfall} onChange={set('annual_rainfall')} min={100} max={3000} step={50} unit="mm" icon="🌧️" />
              </SectionCard>

              <SectionCard title={tx.sections.landDetails} icon="📐" delay={100}>
                <div className="field-row">
                  <InputField label={tx.labels.landSize} value={formData.land_size} onChange={set('land_size')} type="number" min={0.1} max={10000} step="any" preserveNumericString icon="🗺️" />
                  <SelectField label={tx.labels.unit} value={currentUnit} onChange={set('land_unit')} options={unitOpts} icon="📏" />
                </div>
                <SelectField label={tx.labels.waterSource} value={currentWater} onChange={set('water_source')} options={waterOpts} icon="💧" />
              </SectionCard>
            </div>

            {/* Right column */}
            <div className="form-col">
              <SectionCard title={tx.sections.cropSelect} icon="🌱" delay={50}>
                <SelectField label={tx.labels.crop} value={currentCrop} onChange={set('crop')} options={cropOpts} icon="🌾" />
                {isOtherCrop && (
                  <InputField label={tx.labels.otherCrop} value={formData.manualCrop} onChange={set('manualCrop')} placeholder={tx.labels.otherCropPh} icon="✏️" />
                )}
              </SectionCard>

              <SectionCard title={tx.sections.farmerProfile} icon="👨‍🌾" delay={150}>
                <SelectField label={tx.labels.experience} value={currentExp}    onChange={set('farming_experience')} options={expOpts}    icon="🎓" />
                <SelectField label={tx.labels.budget}     value={currentBudget} onChange={set('budget')}             options={budgetOpts} icon="💰" />
              </SectionCard>

              <SectionCard title={tx.sections.notes} icon="📝" delay={200}>
                <div className="field">
                  <label className="field-label"><span className="field-icon">💬</span>{tx.labels.notes}</label>
                  <textarea className="field-textarea" rows={5} value={formData.extra_notes}
                    onChange={e => set('extra_notes')(e.target.value)} placeholder={tx.labels.notesPh} />
                </div>
              </SectionCard>
            </div>
          </div>

          {/* Submit */}
          <div className="submit-wrap">
            <button type="submit" className="submit-btn">
              <span className="submit-leaf">🌿</span>
              {tx.submitBtn}
            </button>
          </div>
        </form>
      </main>

      <footer className="app-footer"><p>{tx.footer}</p></footer>
      {showHistory && <ReportHistoryModal entries={reportHistory} onClose={() => setShowHistory(false)} onSelect={restoreReport} onClear={clearReportHistory} tx={tx} />}
    </div>
  );

  // ── RESULT VIEW ───────────────────────────
  return (
    <div className="app result-view">
      <div className="bg-orb orb-1" /><div className="bg-orb orb-2" />

      {/* Result header */}
      <header className="result-header">
        <div className="result-header-inner">
          <button className="back-btn" onClick={() => setStep('form')}>
            {tx.newReport}
          </button>
          <button className="history-open result-history-open" type="button" onClick={() => setShowHistory(true)}>
            <span aria-hidden="true">◷</span> {tx.history} <span className="history-count">{reportHistory.length}</span>
          </button>
          <div className="result-header-title">
            <span className="result-header-icon">🌾</span>
            <h2>{tx.reportTitle}: <em>{summaryData?.crop}</em></h2>
          </div>
          <button className="lang-toggle" onClick={toggleLang}>
            <span>🌐</span> {tx.langBtn}
          </button>
        </div>
      </header>

      <main className="result-main" ref={reportRef}>

        {/* Summary pills */}
        {summaryData && (
          <div className="summary-strip">
            <span className="summary-label">{tx.summaryTitle}</span>
            <div className="summary-pills">
              <MetricPill label={tx.metrics.crop}    value={summaryData.crop} />
              <MetricPill label={tx.metrics.soil}    value={summaryData.soil_type.split(' (')[0]} />
              <MetricPill label={tx.metrics.season}  value={summaryData.season.split('—')[0].trim()} />
              <MetricPill label={tx.metrics.land}    value={`${summaryData.land_size} ${summaryData.land_unit}`} />
              <MetricPill label={tx.metrics.temp}    value={`${summaryData.temp_min}°–${summaryData.temp_max}°C`} />
              <MetricPill label={tx.metrics.rain}    value={`${summaryData.annual_rainfall}mm`} />
              <MetricPill label={tx.metrics.water}   value={summaryData.water_source.split(' (')[0]} />
              <MetricPill label={tx.metrics.budget}  value={summaryData.budget.split(' (')[0]} />
            </div>
          </div>
        )}

        {summaryData && <FarmVisualization data={summaryData} tx={tx} />}

        {/* Live generation status */}
        {isStreaming && (
          <div className="generating-bar">
            <div className="gen-spinner" />
            <span>{tx.generating}</span>
            <div className="gen-progress"><div className="gen-progress-fill" /></div>
          </div>
        )}

        {modelUsed && !isStreaming && (
          <div className="model-badge">
            <span className="model-dot" />
            {tx.generatedBy}: <strong>{modelUsed}</strong>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="error-box">
            <span className="error-icon">⚠️</span>
            <div>
              <strong>{tx.errorTitle}</strong>
              <p>{tx.errorHint}</p>
              <small>{error}</small>
            </div>
          </div>
        )}

        {/* Report content */}
        {reportText && (
          <div className="report-card">
            <ReportRenderer content={reportText} isStreaming={isStreaming} />
          </div>
        )}

        {/* Actions */}
        {reportText && !isStreaming && (
          <div className="result-actions">
            <button className="action-btn primary" onClick={downloadReport}>
              📥 {tx.download}
            </button>
            <button className="action-btn secondary" onClick={loadAlternatives} disabled={altLoading}>
              {altLoading ? tx.altLoading : `🔄 ${tx.altBtn}`}
            </button>
          </div>
        )}

        {/* Alternatives */}
        {altShown && (
          <div className="alt-card">
            <div className="alt-header">
              <span>🔄</span>
              <h3>{tx.altTitle}</h3>
            </div>
            {altLoading ? (
              <div className="alt-loading"><div className="gen-spinner" /><span>{tx.altLoading}</span></div>
            ) : (
              <div className="alt-content">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{altText}</ReactMarkdown>
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="app-footer"><p>{tx.footer}</p></footer>
      {showHistory && <ReportHistoryModal entries={reportHistory} onClose={() => setShowHistory(false)} onSelect={restoreReport} onClear={clearReportHistory} tx={tx} />}
    </div>
  );
}