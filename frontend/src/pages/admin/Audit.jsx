import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { todayVN } from '../../lib/dates';

function formatTime(row) {
  if (!row.timestamp) return '';
  try {
    return new Date(row.timestamp).toISOString().slice(11, 19);
  } catch {
    return '';
  }
}

export default function Audit() {
  const [date, setDate] = useState(todayVN);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    api(`/api/admin/audit?date=${encodeURIComponent(date)}`)
      .then((data) => {
        if (!cancelled) setRows(data.rows || []);
      })
      .catch((err) => {
        if (!cancelled) {
          setRows([]);
          setError(err.message || 'Failed to load audit log');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [date]);

  return (
    <main className="page page-wide">
      <h1>Audit log</h1>
      <label className="month-picker">
        Date
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </label>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {loading ? <p>Loading…</p> : null}
      {!loading && !error ? (
        <table className="data-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Action</th>
              <th>Actor</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4}>No audit entries for this date</td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.rowKey}>
                  <td>{formatTime(row)}</td>
                  <td>{row.action}</td>
                  <td>{row.actor}</td>
                  <td>{row.detail || ''}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      ) : null}
    </main>
  );
}
