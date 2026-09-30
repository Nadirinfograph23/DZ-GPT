// src/components/DoctorResultsPanel.tsx — REPAIRED 2026-09-30
// Renders interactive doctor table with Google Maps links.

import React from 'react'

interface Doctor {
  name: string
  specialty: string
  city: string
  address: string
  phone?: string
  sourceUrl?: string
  googleMapsUrl: string
}

interface Dir {
  name: string
  url: string
}

interface DoctorResultsPanelProps {
  doctors: Doctor[]
  dirs?: Dir[]
  metadata?: { specialty?: string; city?: string; cache?: boolean; gps?: boolean }
}

export function DoctorResultsPanel({ doctors, dirs, metadata }: DoctorResultsPanelProps) {
  if (!doctors || doctors.length === 0) {
    return <div className="dz-doctor-results-empty">لم يتم العثور على أطباء.</div>
  }

  return (
    <div className="dz-doctor-results">
      <h3>نتائج البحث عن أطباء</h3>
      {metadata?.specialty && <p>التخصص: {metadata.specialty}</p>}
      {metadata?.city && <p>المدينة: {metadata.city}</p>}

      <ul className="dz-doctor-list">
        {doctors.map((doc, idx) => (
          <li key={idx} className="dz-doctor-card">
            <h4>{doc.name}</h4>
            <p><strong>التخصص:</strong> {doc.specialty}</p>
            <p><strong>المدينة:</strong> {doc.city}</p>
            {doc.address && (
              <p>
                <strong>العنوان:</strong>{' '}
                <a
                  href={doc.googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="dz-doctor-maps-link"
                >
                  {doc.address}
                </a>
              </p>
            )}
            {doc.phone && <p><strong>الهاتف:</strong> {doc.phone}</p>}
            {doc.sourceUrl && (
              <p>
                <strong>المصدر:</strong>{' '}
                <a href={doc.sourceUrl} target="_blank" rel="noopener noreferrer">
                  رابط الملف الشخصي
                </a>
              </p>
            )}
          </li>
        ))}
      </ul>

      {dirs && dirs.length > 0 && (
        <div className="dz-doctor-dirs">
          <h4>مصادر أخرى</h4>
          <ul>
            {dirs.map((dir, idx) => (
              <li key={idx}>
                <a href={dir.url} target="_blank" rel="noopener noreferrer">
                  {dir.name}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
