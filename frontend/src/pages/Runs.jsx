import { useEffect, useState } from 'react';
import { api, clearToken, getToken } from '../api/client';
import { currentMonthVN } from '../lib/dates';

const base = () => import.meta.env.VITE_API_BASE_URL || '';

export default function Runs() {
  const [month, setMonth] = useState(currentMonthVN);
  const [runs, setRuns] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [proofUrl, setProofUrl] = useState('');
  const [proofError, setProofError] = useState('');
  const [proofLoading, setProofLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    api(`/api/runs?month=${encodeURIComponent(month)}`)
      .then((data) => {
        if (!cancelled) setRuns(data.runs || []);
      })
      .catch((err) => {
        if (!cancelled) {
          setRuns([]);
          setError(err.message || 'Failed to load runs');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [month]);

  useEffect(() => {
    return () => {
      if (proofUrl) URL.revokeObjectURL(proofUrl);
    };
  }, [proofUrl]);

  async function viewProof(run) {
    setProofError('');
    setProofLoading(true);
    if (proofUrl) {
      URL.revokeObjectURL(proofUrl);
      setProofUrl('');
    }
    try {
      const token = getToken();
      const res = await fetch(
        `${base()}/api/runs/${encodeURIComponent(run.month)}/${encodeURIComponent(run.runId)}/proof`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (res.status === 401) {
        clearToken();
        window.location.assign('/login');
        return;
      }
      if (!res.ok) {
        throw new Error('Could not load proof');
      }
      const blob = await res.blob();
      setProofUrl(URL.createObjectURL(blob));
    } catch (err) {
      setProofError(err.message || 'Could not load proof');
    } finally {
      setProofLoading(false);
    }
  }

  function closeProof() {
    if (proofUrl) URL.revokeObjectURL(proofUrl);
    setProofUrl('');
    setProofError('');
  }

  return (
    <main className="page">
      <h1>Runs</h1>
      <label className="month-picker">
        Month
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        />
      </label>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {loading ? <p>Loading…</p> : null}
      {!loading && !error ? (
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Km</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 ? (
              <tr>
                <td colSpan={4}>No runs for this month</td>
              </tr>
            ) : (
              runs.map((run) => (
                <tr key={run.runId}>
                  <td>{run.runDate}</td>
                  <td>{run.km}</td>
                  <td>{run.status}</td>
                  <td>
                    <button type="button" onClick={() => viewProof(run)}>
                      View proof
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      ) : null}

      {(proofUrl || proofError || proofLoading) && (
        <div className="proof-modal" role="dialog" aria-label="Proof image">
          <button type="button" className="proof-close" onClick={closeProof}>
            Close
          </button>
          {proofLoading ? <p>Loading proof…</p> : null}
          {proofError ? <p className="error">{proofError}</p> : null}
          {proofUrl ? <img src={proofUrl} alt="Run proof" /> : null}
        </div>
      )}
    </main>
  );
}
