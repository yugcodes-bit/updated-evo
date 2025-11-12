import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth, API_BASE_URL } from '../context/AuthContext';

// History Page
const HistoryPage = () => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { token } = useAuth();

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/history`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setHistory(response.data);
    } catch (err) {
      setError('Failed to load history');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-100 flex items-center justify-center">
        <div className="text-2xl text-indigo-900">Loading history...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-1BYO px-4">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold text-indigo-900 mb-8 text-center">
          Analysis History
        </h1>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        {history.length === 0 ? (
          <div className="bg-white rounded-lg shadow-xl p-12 text-center">
            <p className="text-xl text-gray-600 mb-4">No analysis history yet</p>
            <Link
              to="/analyze"
              className="inline-block bg-indigo-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-indigo-700 transition"
            >
              Run Your First Analysis
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {history.map((item) => (
              <div key={item.id} className="bg-white rounded-lg shadow-xl p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-xl font-bold text-indigo-900">{item.filename}</h3>
                    <p className="text-sm text-gray-500">
                      {new Date(item.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="bg-green-100 px-4 py-2 rounded-lg">
                    <span className="text-green-700 font-bold">
                      R²: {(item.accuracy_score * 100).toFixed(2)}%
                    </span>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <span className="text-gray-600 font-semibold">Output Column: </span>
                    <span className="text-indigo-700 font-mono">{item.output_column}</span>
                  </div>
                  <div>
                    <span className="text-gray-600 font-semibold">Formula: </span>
                    <div className="mt-2 bg-indigo-50 p-3 rounded font-mono text-sm break-all">
                      {item.formula_string}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default HistoryPage;
