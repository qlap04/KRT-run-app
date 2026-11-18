import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { currentMonthVN } from '../lib/dates';

export default function Leaderboard() {
  const [month, setMonth] = useState(currentMonthVN);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    api(`/api/leaderboard?month=${encodeURIComponent(month)}`)
      .then((data) => {
        if (!cancelled) setRows(data.rows || []);
      })
      .catch((err) => {
        if (!cancelled) {
          setRows([]);
          setError(err.message || 'Failed to load leaderboard');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [month]);

  return (
    <main className="page">
      <h1>Leaderboard</h1>
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
              <th>#</th>
              <th>Employee</th>
              <th>Km</th>
              <th>Runs</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4}>No approved runs for this month</td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr key={row.employeeCode}>
                  <td>{i + 1}</td>
                  <td>{row.employeeCode}</td>
                  <td>{row.km}</td>
                  <td>{row.runs}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      ) : null}
    </main>
  );
}
