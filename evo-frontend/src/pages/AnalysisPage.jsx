import React, { useState } from 'react';
import axios from 'axios';
import { useAuth, API_BASE_URL } from '../context/AuthContext';

// Analysis Page
const AnalysisPage = () => {
  const [file, setFile] = useState(null);
  const [columns, setColumns] = useState([]);
  const [outputColumn, setOutputColumn] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { token } = useAuth();

  const handleFileChange = async (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setResult(null);
      setError('');

      // Read CSV to extract columns
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target.result;
        const firstLine = text.split('\n')[0];
        const cols = firstLine.split(',').map(col => col.trim().replace(/"/g, '')); // Clean column names
        setColumns(cols);
        setOutputColumn('');
      };
      reader.readAsText(selectedFile);
    }
  };

  const handleAnalyze = async () => {
    if (!file || !outputColumn) {
      setError('Please select a file and output column');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('output_column', outputColumn);

    try {
      const response = await axios.post(`${API_BASE_URL}/analyze`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });

      setResult(response.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Analysis failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-100 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-indigo-900 mb-8 text-center">
          Analyze Your Data
        </h1>

        <div className="bg-white rounded-lg shadow-xl p-8 mb-8">
          <div className="space-y-6">
            <div>
              <label className="block text-gray-700 font-semibold mb-3 text-lg">
                1. Upload CSV File
              </label>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-indigo-500 transition cursor-pointer file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
              />
              {file && (
                <p className="mt-2 text-sm text-gray-600">
                  Selected: {file.name}
                </p>
              )}
            </div>

            {columns.length > 0 && (
              <div>
                <label className="block text-gray-700 font-semibold mb-3 text-lg">
                  2. Select Output Column (Target Variable)
                </label>
                <select
                  value={outputColumn}
                  onChange={(e) => setOutputColumn(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value="">-- Select a column --</option>
                  {columns.map((col, idx) => (
                    <option key={idx} value={col}>{col}</option>
                  ))}
                </select>
              </div>
            )}

            <button
              onClick={handleAnalyze}
              disabled={!file || !outputColumn || loading}
              className="w-full bg-indigo-600 text-white py-4 rounded-lg text-lg font-semibold hover:bg-indigo-700 transition disabled:bg-gray-400"
            >
              {loading ? 'Analyzing... This may take a moment' : '3. Run Analysis'}
            </button>
          </div>

          {error && (
            <div className="mt-6 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}
        </div>

        {result && (
          <div className="bg-white rounded-lg shadow-xl p-8">
            <h2 className="text-2xl font-bold text-indigo-900 mb-6">Analysis Results</h2>
            
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-700 mb-2">Discovered Formula:</h3>
                <div className="bg-indigo-50 p-4 rounded-lg font-mono text-sm break-all">
                  {result.formula}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-700 mb-2">Accuracy Score (R²):</h3>
                  <div className="bg-green-50 p-4 rounded-lg text-2xl font-bold text-green-700">
                    {(result.accuracy_score * 100).toFixed(2)}%
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-gray-700 mb-2">Output Column:</h3>
                  <div className="bg-blue-50 p-4 rounded-lg text-lg font-semibold text-blue-700">
                    {result.output_column}
                  </div>
                </div>
              </div>

              <div className="text-sm text-gray-500 mt-4">
                Analysis completed at: {new Date(result.created_at).toLocaleString()}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AnalysisPage;
