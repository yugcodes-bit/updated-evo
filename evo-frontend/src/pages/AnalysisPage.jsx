import React, { useState } from 'react';
import axios from 'axios';
import { useAuth, API_BASE_URL } from '../context/AuthContext';
// Import your new CSS file
import './analyse.css'; 
import bgVideo from "../assets/newvideo.mp4"

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
    <div className="analysis-page">
       <video
                          autoPlay
                          loop
                          muted
                          className="login-bg-video" 
                        >
                          <source src={bgVideo} type="video/mp4" />
                        </video>
      <div className="analysis-page__container">
        <h1 className="analysis-page__title">
          Analyze Your Data
        </h1>

        <div className="analysis-page__card">
          <div className="analysis-page__form-group">
            <div>
              <label className="analysis-page__label">
                Upload CSV File
              </label>
              <label className="analysis-page__file-input-wrapper">
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="analysis-page__file-input-native"
                />
                <span className="analysis-page__file-input-button">
                  Choose file
                </span>
                <span className="analysis-page__file-input-label">
                  {file ? file.name : 'No file chosen...'}
                </span>
              </label>
            </div>

            {columns.length > 0 && (
              <div>
                <label className="analysis-page__label">
                   Select Output Column
                </label>
                <div className="analysis-page__select-wrapper">
                  <select
                    value={outputColumn}
                    onChange={(e) => setOutputColumn(e.target.value)}
                    className="analysis-page__select"
                  >
                    <option value="">-- Select a column --</option>
                    {columns.map((col, idx) => (
                      <option key={idx} value={col}>{col}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <button
              onClick={handleAnalyze}
              disabled={!file || !outputColumn || loading}
              className="analysis-page__button"
            >
              {loading ? 'Analyzing...' : 'Run Analysis'}
            </button>
          </div>

          {error && (
            <div className="analysis-page__alert analysis-page__alert--error">
              {error}
            </div>
          )}
        </div>

        {result && (
          <div className="analysis-page__card analysis-page__results">
            <h2 className="analysis-page__results-title">Analysis Results</h2>
            
            <div className="analysis-page__results-group">
              <div>
                <h3 className="analysis-page__results-subtitle">Discovered Formula:</h3>
                <div className="analysis-page__results-formula">
                  {result.formula}
                </div>
              </div>

              <div className="analysis-page__results-grid">
                <div className="analysis-page__metric-card">
                  <h3 className="analysis-page__results-subtitle">Accuracy Score (R²)</h3>
                  <div className="analysis-page__metric-value analysis-page__metric-value--accuracy">
                    {(result.accuracy_score * 100).toFixed(2)}%
                  </div>
                </div>

                <div className="analysis-page__metric-card">
                  <h3 className="analysis-page__results-subtitle">Output Column</h3>
                  <div className="analysis-page__metric-value analysis-page__metric-value--column">
                    {result.output_column}
                  </div>
                </div>
              </div>

              <div className="analysis-page__results-timestamp">
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