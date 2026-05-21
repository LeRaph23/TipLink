'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/ambassadeur/icons';
import {
  COMMERCIAL_LEGAL_FORMS,
  COMMERCIAL_VRP_STATUSES,
} from '@/lib/commercial-tiers';

const inp: React.CSSProperties = {
  width: '100%', padding: '11px 13px', borderRadius: 8,
  background: 'var(--surface-2)', border: '1px solid var(--border)',
  color: 'var(--text)', fontSize: 14, boxSizing: 'border-box', outline: 'none',
};
const label: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: 'var(--text-3)',
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, display: 'block',
};
const sectionHeading: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: 'var(--accent)',
  textTransform: 'uppercase', letterSpacing: '0.09em',
  margin: '8px 0 14px', display: 'flex', alignItems: 'center', gap: 8,
};

const DRAFT_KEY = 'digitip_commercial_draft';
const VAT_RE = /^[A-Z]{2}[A-Z0-9]{2,12}$/;

interface Draft {
  firstName: string; lastName: string; email: string; phone: string;
  city: string; sector: string;
  companyName: string; legalForm: string; siret: string; vatNumber: string;
  vrpStatus: string; notes: string;
}

export function CommercialRecruitmentForm() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [sector, setSector] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [legalForm, setLegalForm] = useState('');
  const [siret, setSiret] = useState('');
  const [vatNumber, setVatNumber] = useState('');
  const [vrpStatus, setVrpStatus] = useState('');
  const [notes, setNotes] = useState('');
  const [pledge, setPledge] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d: Partial<Draft> = JSON.parse(raw);
      /* eslint-disable react-hooks/set-state-in-effect -- restores a saved draft
         from localStorage on mount; localStorage is unavailable during SSR. */
      if (d.firstName) setFirstName(d.firstName);
      if (d.lastName) setLastName(d.lastName);
      if (d.email) setEmail(d.email);
      if (d.phone) setPhone(d.phone);
      if (d.city) setCity(d.city);
      if (d.sector) setSector(d.sector);
      if (d.companyName) setCompanyName(d.companyName);
      if (d.legalForm) setLegalForm(d.legalForm);
      if (d.siret) setSiret(d.siret);
      if (d.vatNumber) setVatNumber(d.vatNumber);
      if (d.vrpStatus) setVrpStatus(d.vrpStatus);
      if (d.notes) setNotes(d.notes);
      /* eslint-enable react-hooks/set-state-in-effect */
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const draft: Draft = {
      firstName, lastName, email, phone, city, sector,
      companyName, legalForm, siret, vatNumber, vrpStatus, notes,
    };
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch { /* ignore */ }
  }, [firstName, lastName, email, phone, city, sector, companyName, legalForm, siret, vatNumber, vrpStatus, notes]);

  async function submit() {
    setError(null);
    if (!firstName.trim() || !lastName.trim()) { setError('Prénom et nom requis.'); return; }
    if (!email.trim() || !email.includes('@')) { setError('Email valide requis.'); return; }
    if (!phone.trim()) { setError('Téléphone requis.'); return; }
    if (!city.trim()) { setError('Ville requise.'); return; }
    if (!companyName.trim()) { setError('Raison sociale requise.'); return; }
    if (!legalForm) { setError('Forme juridique requise.'); return; }

    const siretClean = siret.replace(/\s+/g, '');
    if (!/^\d{14}$/.test(siretClean)) {
      setError('SIRET invalide — 14 chiffres requis. Le SIRET est obligatoire pour le programme Commerciaux Pros.');
      return;
    }

    const vatClean = vatNumber.replace(/\s+/g, '').toUpperCase();
    if (vatClean && !VAT_RE.test(vatClean)) {
      setError('N° TVA intracommunautaire invalide (ex : FR12345678901).');
      return;
    }

    if (!vrpStatus) { setError('Statut commercial requis.'); return; }
    if (!pledge) { setError("Vous devez accepter l'engagement de non-fraude."); return; }

    setSubmitting(true);
    try {
      const res = await fetch('/api/commercial/recruitment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          city: city.trim(),
          sector: sector.trim() || undefined,
          companyName: companyName.trim(),
          legalForm,
          siret: siretClean,
          vatNumber: vatClean || undefined,
          vrpStatus,
          notes: notes.trim() || undefined,
          noFraudPledge: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Erreur.'); return; }
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      setDone(true);
    } catch {
      setError('Erreur réseau, veuillez réessayer.');
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div style={{
        background: 'var(--success-bg)', border: '1px solid var(--success)',
        borderRadius: 12, padding: '28px 24px', textAlign: 'center',
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: '50%', background: 'var(--success)',
          color: '#fff', display: 'inline-flex', alignItems: 'center',
          justifyContent: 'center', marginBottom: 12,
        }}>
          <Icon name="check" size={24} strokeWidth={2.5} />
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--success)', marginBottom: 6 }}>
          Candidature enregistrée
        </div>
        <div style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.65 }}>
          Votre dossier est en cours d&apos;examen. Notre direction commerciale revient vers vous
          sous 48&nbsp;h ouvrées pour la signature du contrat d&apos;apporteur d&apos;affaires
          et l&apos;activation de votre code commercial.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {error && (
        <div style={{
          fontSize: 13, color: 'var(--error)', padding: '10px 14px',
          background: 'var(--error-bg)', borderRadius: 8,
        }}>{error}</div>
      )}

      {/* Identité */}
      <div style={sectionHeading}>
        <Icon name="users" size={14} strokeWidth={2} />
        Identité du commercial
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div><span style={label}>Prénom</span><input style={inp} value={firstName} onChange={e => setFirstName(e.target.value)} /></div>
        <div><span style={label}>Nom</span><input style={inp} value={lastName} onChange={e => setLastName(e.target.value)} /></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div><span style={label}>Email professionnel</span><input style={inp} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="prenom.nom@exemple.fr" /></div>
        <div><span style={label}>Téléphone</span><input style={inp} type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="06 12 34 56 78" /></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div><span style={label}>Ville de rattachement</span><input style={inp} value={city} onChange={e => setCity(e.target.value)} placeholder="Paris" /></div>
        <div>
          <span style={label}>Secteur géographique d&apos;activité</span>
          <input style={inp} value={sector} onChange={e => setSector(e.target.value)} placeholder="Île-de-France · 78, 91, 92" />
        </div>
      </div>

      {/* Société */}
      <div style={{ ...sectionHeading, marginTop: 8 }}>
        <Icon name="bank" size={14} strokeWidth={2} />
        Structure juridique
      </div>

      <div><span style={label}>Raison sociale</span><input style={inp} value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Nom de votre société" /></div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <span style={label}>Forme juridique</span>
          <select style={inp} value={legalForm} onChange={e => setLegalForm(e.target.value)}>
            <option value="">— Sélectionner —</option>
            {COMMERCIAL_LEGAL_FORMS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <span style={label}>SIRET (14 chiffres)</span>
          <input style={inp} value={siret} onChange={e => setSiret(e.target.value)} placeholder="123 456 789 00012" inputMode="numeric" />
        </div>
      </div>

      <div>
        <span style={label}>N° TVA intracommunautaire (optionnel)</span>
        <input style={inp} value={vatNumber} onChange={e => setVatNumber(e.target.value.toUpperCase())} placeholder="FR12 345678901" />
        <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 5, lineHeight: 1.4 }}>
          Laissez vide si vous êtes en franchise de TVA (auto-entrepreneur sous seuil).
        </div>
      </div>

      {/* Activité commerciale */}
      <div style={{ ...sectionHeading, marginTop: 8 }}>
        <Icon name="trophy" size={14} strokeWidth={2} />
        Profil commercial
      </div>

      <div>
        <span style={label}>Statut commercial</span>
        <select style={inp} value={vrpStatus} onChange={e => setVrpStatus(e.target.value)}>
          <option value="">— Sélectionner —</option>
          {COMMERCIAL_VRP_STATUSES.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <div>
        <span style={label}>Présentation libre (optionnel)</span>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={4}
          style={{ ...inp, resize: 'vertical', fontFamily: 'var(--font)' }}
          placeholder="Expérience, portefeuille clients, secteurs d'expertise, références…"
        />
      </div>

      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', padding: '8px 0' }}>
        <input
          type="checkbox"
          checked={pledge}
          onChange={e => setPledge(e.target.checked)}
          style={{ marginTop: 3, accentColor: 'var(--accent)', width: 16, height: 16, flexShrink: 0 }}
        />
        <span style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.55 }}>
          Je m&apos;engage à exercer cette activité dans un cadre strictement professionnel : aucune
          fausse vente, aucune auto-utilisation de mon code commercial, aucune transaction montée avec
          des proches dans le seul but de toucher des commissions. Je facturerai mes commissions sous
          le statut juridique déclaré ci-dessus.
        </span>
      </label>

      <button
        onClick={submit}
        disabled={submitting}
        style={{
          padding: '14px 24px', borderRadius: 10, border: 'none',
          background: 'var(--accent)', color: '#fff',
          fontSize: 14, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer',
          opacity: submitting ? 0.7 : 1, marginTop: 4, letterSpacing: '0.01em',
        }}
      >
        {submitting ? 'Envoi en cours…' : 'Envoyer ma candidature →'}
      </button>
    </div>
  );
}
