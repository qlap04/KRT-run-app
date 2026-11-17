import { useEffect, useState } from 'react';
import { api, clearToken, getToken } from '../../api/client';
import { currentMonthVN } from '../../lib/dates';

const base = () => import.meta.env.VITE_API_BASE_URL || '';

export default function Review() {
  const [month, setMonth] = useState(currentMonthVN);
  const [list, setList] = useState([]);
  const [notes, setNotes] = useState({});
  const [error, setError] = useState('');
  const [rowErrors, setRowErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [proofError, setProofError] = useState('');
  const [proofLoading, setProofLoading] = useState(false);

  async function loadList(targetMonth = month) {
    setLoading(true);
    setError('');
    try {
      const data = await api(`/api/admin/runs?month=${encodeURIComponent(targetMonth)}`);
      setList(data.list || []);
      setRowErrors({});
    } catch (err) {
      setList([]);
      setError(err.message || 'Failed to load review queue');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadList(month);
  }, [month]);

  useEffect(() => {
    return () => {
      if (proofUrl) URL.revokeObjectURL(proofUrl);
    };
  }, [proofUrl]);

  function setNote(runId, value) {
    setNotes((prev) => ({ ...prev, [runId]: value }));
  }

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
        `${base()}/api/runs/${encodeURIComponent(run.partitionKey)}/${encodeURIComponent(run.rowKey)}/proof`,
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

  async function decide(run, action) {
    const runId = run.rowKey;
    setBusyId(runId);
    setRowErrors((prev) => {
      const next = { ...prev };
      delete next[runId];
      return next;
    });
    try {
      await api(
        `/api/admin/runs/${encodeURIComponent(run.partitionKey)}/${encodeURIComponent(runId)}/${action}`,
        { method: 'POST', body: { note: notes[runId] || '' } },
      );
      await loadList(month);
    } catch (err) {
      setRowErrors((prev) => ({
        ...prev,
        [runId]: err.status === 409 ? 'Already reviewed' : (err.message || 'Request failed'),
      }));
    } finally {
      setBusyId('');
    }
  }

  return (
    <main className="page page-wide">
      <h1>Admin review</h1>
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
              <th>Employee</th>
              <th>Date</th>
              <th>Km</th>
              <th>Status</th>
              <th>Proof</th>
              <th>Note</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={7}>No pending runs for this month</td>
              </tr>
            ) : (
              list.map((run) => (
                <tr key={run.rowKey}>
                  <td>{run.employeeCode}</td>
                  <td>{run.runDate}</td>
                  <td>{run.km}</td>
                  <td>{run.status}</td>
                  <td>
                    <button type="button" onClick={() => viewProof(run)}>
                      View proof
                    </button>
                  </td>
                  <td>
                    <input
                      className="note-input"
                      value={notes[run.rowKey] || ''}
                      onChange={(e) => setNote(run.rowKey, e.target.value)}
                      placeholder="Note"
                    />
                    {rowErrors[run.rowKey] ? (
                      <p className="error">{rowErrors[run.rowKey]}</p>
                    ) : null}
                  </td>
                  <td className="actions">
                    <button
                      type="button"
                      disabled={busyId === run.rowKey}
                      onClick={() => decide(run, 'approve')}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={busyId === run.rowKey}
                      onClick={() => decide(run, 'reject')}
                    >
                      Reject
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
