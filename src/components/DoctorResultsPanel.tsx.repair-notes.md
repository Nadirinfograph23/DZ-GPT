# Repair notes for DoctorResultsPanel.tsx — 2026-09-30

## Doctor search (Annaba – dentist) UI fix
- Ensure each doctor card renders:
  - Name, specialty, city, address, phone (if available).
  - Clickable address link that opens Google Maps automatically:
    ```tsx
    <a href={doctor.googleMapsUrl} target="_blank" rel="noopener noreferrer">
      {doctor.address || doctor.city}
    </a>
    ```
  - Source links (sahadoc, algerie-docto, etc.) as buttons or inline links.
- Verify that the panel is triggered when `richType === 'doctor-results'` and `doctors` array is non-empty.

## Test smoke
- Query: `طبيب أسنان في عنابة`
  - Expect: interactive doctor table with ≥3 doctors, each with a Maps link opening `https://www.google.com/maps/search/?api=1&query=...`.

## Commit message
fix: DoctorResultsPanel renders Google Maps links for doctors (2026-09-30)
