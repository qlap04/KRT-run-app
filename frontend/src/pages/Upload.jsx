import { useState } from 'react';
import { api } from '../api/client';
import { todayVN } from '../lib/dates';

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = 'image/jpeg,image/png,.jpg,.jpeg,.png';

export default function Upload() {
  const [km, setKm] = useState('');
  const [runDate, setRunDate] = useState(todayVN);
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [ok, setOk] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setOk(false);

    if (!file) {
      setError('Please choose a proof image');
      return;
    }
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setError('Proof must be a JPG or PNG image');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('Image too large (max 5MB)');
      return;
    }

    const form = new FormData();
    form.append('km', km);
    form.append('runDate', runDate);
    form.append('proof', file);

    setSubmitting(true);
    try {
      await api('/api/runs', { method: 'POST', form });
      setOk(true);
      setKm('');
      setRunDate(todayVN());
      setFile(null);
      e.target.reset();
    } catch (err) {
      setError(err.message || 'Upload failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="page">
      <h1>Upload</h1>
      <form className="stack-form" onSubmit={onSubmit}>
        <label>
          Distance (km)
          <input
            name="km"
            type="number"
            step="0.1"
            min="0.1"
            max="100"
            value={km}
            onChange={(e) => setKm(e.target.value)}
            required
          />
        </label>
        <label>
          Run date
          <input
            name="runDate"
            type="date"
            value={runDate}
            onChange={(e) => setRunDate(e.target.value)}
            required
          />
        </label>
        <label>
          Proof (JPG/PNG, max 5MB)
          <input
            name="proof"
            type="file"
            accept={ACCEPT}
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            required
          />
        </label>
        {error ? <p className="error" role="alert">{error}</p> : null}
        {ok ? <p className="ok" role="status">Upload submitted</p> : null}
        <button type="submit" disabled={submitting}>
          {submitting ? 'Uploading…' : 'Submit'}
        </button>
      </form>
    </main>
  );
}
