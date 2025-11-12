// import React, { createContext, useContext, useState, useEffect } from 'react';
// import { BrowserRouter as Router, Routes, Route, Link, Navigate, useNavigate } from 'react-router-dom';
// import axios from 'axios';

// // API Base URL - change this to your backend URL
// const API_BASE_URL = 'http://localhost:8000';

// // Auth Context
// const AuthContext = createContext(null);

// const AuthProvider = ({ children }) => {
//   const [token, setToken] = useState(localStorage.getItem('token'));
//   const [user, setUser] = useState(null);

//   useEffect(() => {
//     if (token) {
//       localStorage.setItem('token', token);
//       fetchUserInfo();
//     } else {
//       localStorage.removeItem('token');
//       setUser(null);
//     }
//   }, [token]);

//   const fetchUserInfo = async () => {
//     try {
//       const response = await axios.get(`${API_BASE_URL}/me`, {
//         headers: { Authorization: `Bearer ${token}` }
//       });
//       setUser(response.data);
//     } catch (error) {
//       console.error('Failed to fetch user info:', error);
//       logout();
//     }
//   };

//   const login = (newToken) => {
//     setToken(newToken);
//   };

//   const logout = () => {
//     setToken(null);
//     setUser(null);
//   };

//   return (
//     <AuthContext.Provider value={{ token, user, login, logout }}>
//       {children}
//     </AuthContext.Provider>
//   );
// };

// const useAuth = () => useContext(AuthContext);

// // Protected Route Component
// const ProtectedRoute = ({ children }) => {
//   const { token } = useAuth();
//   return token ? children : <Navigate to="/login" />;
// };

// // Navigation Component
// const Navigation = () => {
//   const { token, user, logout } = useAuth();
//   const navigate = useNavigate();

//   const handleLogout = () => {
//     logout();
//     navigate('/');
//   };

//   return (
//     <nav className="bg-indigo-600 text-white shadow-lg">
//       <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
//         <div className="flex justify-between items-center h-16">
//           <div className="flex items-center space-x-8">
//             <Link to="/" className="text-2xl font-bold">Evosolve</Link>
//             {token && (
//               <>
//                 <Link to="/analyze" className="hover:text-indigo-200 transition">Analyze</Link>
//                 <Link to="/history" className="hover:text-indigo-200 transition">History</Link>
//               </>
//             )}
//           </div>
//           <div className="flex items-center space-x-4">
//             {token ? (
//               <>
//                 <span className="text-sm">{user?.email}</span>
//                 <button
//                   onClick={handleLogout}
//                   className="bg-indigo-700 hover:bg-indigo-800 px-4 py-2 rounded transition"
//                 >
//                   Logout
//                 </button>
//               </>
//             ) : (
//               <Link
//                 to="/login"
//                 className="bg-indigo-700 hover:bg-indigo-800 px-4 py-2 rounded transition"
//               >
//                 Login
//               </Link>
//             )}
//           </div>
//         </div>
//       </div>
//     </nav>
//   );
// };

// // Landing Page
// const LandingPage = () => {
//   const { token } = useAuth();
//   const navigate = useNavigate();

//   return (
//     <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-100">
//       <div className="max-w-6xl mx-auto px-4 py-20">
//         <div className="text-center mb-16">
//           <h1 className="text-6xl font-bold text-indigo-900 mb-6">
//             Discover Hidden Formulas in Your Data
//           </h1>
//           <p className="text-2xl text-gray-700 mb-8">
//             Evosolve uses advanced symbolic regression to automatically find the mathematical relationships in your datasets
//           </p>
//           <button
//             onClick={() => navigate(token ? '/analyze' : '/login')}
//             className="bg-indigo-600 text-white px-8 py-4 rounded-lg text-xl font-semibold hover:bg-indigo-700 transition shadow-lg"
//           >
//             {token ? 'Start Analyzing' : 'Get Started'}
//           </button>
//         </div>

//         <div className="grid md:grid-cols-3 gap-8 mt-20">
//           <div className="bg-white p-8 rounded-lg shadow-md">
//             <div className="text-4xl mb-4">🔍</div>
//             <h3 className="text-xl font-bold mb-3 text-indigo-900">Interpretable</h3>
//             <p className="text-gray-600">
//               Get simple mathematical equations instead of black-box models. Understand exactly how your inputs affect outputs.
//             </p>
//           </div>

//           <div className="bg-white p-8 rounded-lg shadow-md">
//             <div className="text-4xl mb-4">⚡</div>
//             <h3 className="text-xl font-bold mb-3 text-indigo-900">Automated</h3>
//             <p className="text-gray-600">
//               No coding required. Upload your CSV, select your target variable, and let our AI discover the optimal formula.
//             </p>
//           </div>

//           <div className="bg-white p-8 rounded-lg shadow-md">
//             <div className="text-4xl mb-4">📊</div>
//             <h3 className="text-xl font-bold mb-3 text-indigo-900">Actionable</h3>
//             <p className="text-gray-600">
//               Use discovered formulas directly for forecasting, planning, and understanding your business drivers.
//             </p>
//           </div>
//         </div>
//       </div>
//     </div>
//   );
// };

// // Login/Register Page
// const LoginPage = () => {
//   const [isLogin, setIsLogin] = useState(true);
//   const [email, setEmail] = useState('');
//   const [password, setPassword] = useState('');
//   const [error, setError] = useState('');
//   const [loading, setLoading] = useState(false);
//   const { login } = useAuth();
//   const navigate = useNavigate();

//   const handleSubmit = async (e) => {
//     e.preventDefault();
//     setError('');
//     setLoading(true);

//     try {
//       const endpoint = isLogin ? '/login' : '/register';
//       const response = await axios.post(`${API_BASE_URL}${endpoint}`, {
//         email,
//         password
//       });

//       login(response.data.access_token);
//       navigate('/analyze');
//     } catch (err) {
//       setError(err.response?.data?.detail || 'An error occurred');
//     } finally {
//       setLoading(false);
//     }
//   };

//   return (
//     <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-100 flex items-center justify-center px-4">
//       <div className="bg-white p-8 rounded-lg shadow-xl max-w-md w-full">
//         <h2 className="text-3xl font-bold text-center text-indigo-900 mb-8">
//           {isLogin ? 'Login to Evosolve' : 'Create Account'}
//         </h2>

//         {error && (
//           <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
//             {error}
//           </div>
//         )}

//         <form onSubmit={handleSubmit} className="space-y-6">
//           <div>
//             <label className="block text-gray-700 font-semibold mb-2">Email</label>
//             <input
//               type="email"
//               value={email}
//               onChange={(e) => setEmail(e.target.value)}
//               className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
//               required
//             />
//           </div>

//           <div>
//             <label className="block text-gray-700 font-semibold mb-2">Password</label>
//             <input
//               type="password"
//               value={password}
//               onChange={(e) => setPassword(e.target.value)}
//               className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
//               required
//             />
//           </div>

//           <button
//             type="submit"
//             disabled={loading}
//             className="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition disabled:bg-gray-400"
//           >
//             {loading ? 'Processing...' : (isLogin ? 'Login' : 'Register')}
//           </button>
//         </form>

//         <p className="text-center mt-6 text-gray-600">
//           {isLogin ? "Don't have an account? " : "Already have an account? "}
//           <button
//             onClick={() => {
//               setIsLogin(!isLogin);
//               setError('');
//             }}
//             className="text-indigo-600 font-semibold hover:underline"
//           >
//             {isLogin ? 'Register' : 'Login'}
//           </button>
//         </p>
//       </div>
//     </div>
//   );
// };

// // Analysis Page
// const AnalysisPage = () => {
//   const [file, setFile] = useState(null);
//   const [columns, setColumns] = useState([]);
//   const [outputColumn, setOutputColumn] = useState('');
//   const [result, setResult] = useState(null);
//   const [loading, setLoading] = useState(false);
//   const [error, setError] = useState('');
//   const { token } = useAuth();

//   const handleFileChange = async (e) => {
//     const selectedFile = e.target.files[0];
//     if (selectedFile) {
//       setFile(selectedFile);
//       setResult(null);
//       setError('');

//       // Read CSV to extract columns
//       const reader = new FileReader();
//       reader.onload = (event) => {
//         const text = event.target.result;
//         const firstLine = text.split('\n')[0];
//         const cols = firstLine.split(',').map(col => col.trim());
//         setColumns(cols);
//         setOutputColumn('');
//       };
//       reader.readAsText(selectedFile);
//     }
//   };

//   const handleAnalyze = async () => {
//     if (!file || !outputColumn) {
//       setError('Please select a file and output column');
//       return;
//     }

//     setLoading(true);
//     setError('');
//     setResult(null);

//     const formData = new FormData();
//     formData.append('file', file);
//     formData.append('output_column', outputColumn);

//     try {
//       const response = await axios.post(`${API_BASE_URL}/analyze`, formData, {
//         headers: {
//           Authorization: `Bearer ${token}`,
//           'Content-Type': 'multipart/form-data'
//         }
//       });

//       setResult(response.data);
//     } catch (err) {
//       setError(err.response?.data?.detail || 'Analysis failed');
//     } finally {
//       setLoading(false);
//     }
//   };

//   return (
//     <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-100 py-12 px-4">
//       <div className="max-w-4xl mx-auto">
//         <h1 className="text-4xl font-bold text-indigo-900 mb-8 text-center">
//           Analyze Your Data
//         </h1>

//         <div className="bg-white rounded-lg shadow-xl p-8 mb-8">
//           <div className="space-y-6">
//             <div>
//               <label className="block text-gray-700 font-semibold mb-3 text-lg">
//                 Upload CSV File
//               </label>
//               <input
//                 type="file"
//                 accept=".csv"
//                 onChange={handleFileChange}
//                 className="w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-indigo-500 transition cursor-pointer"
//               />
//               {file && (
//                 <p className="mt-2 text-sm text-gray-600">
//                   Selected: {file.name}
//                 </p>
//               )}
//             </div>

//             {columns.length > 0 && (
//               <div>
//                 <label className="block text-gray-700 font-semibold mb-3 text-lg">
//                   Select Output Column (Target Variable)
//                 </label>
//                 <select
//                   value={outputColumn}
//                   onChange={(e) => setOutputColumn(e.target.value)}
//                   className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
//                 >
//                   <option value="">-- Select a column --</option>
//                   {columns.map((col, idx) => (
//                     <option key={idx} value={col}>{col}</option>
//                   ))}
//                 </select>
//               </div>
//             )}

//             <button
//               onClick={handleAnalyze}
//               disabled={!file || !outputColumn || loading}
//               className="w-full bg-indigo-600 text-white py-4 rounded-lg text-lg font-semibold hover:bg-indigo-700 transition disabled:bg-gray-400"
//             >
//               {loading ? 'Analyzing... This may take a moment' : 'Run Analysis'}
//             </button>
//           </div>

//           {error && (
//             <div className="mt-6 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
//               {error}
//             </div>
//           )}
//         </div>

//         {result && (
//           <div className="bg-white rounded-lg shadow-xl p-8">
//             <h2 className="text-2xl font-bold text-indigo-900 mb-6">Analysis Results</h2>
            
//             <div className="space-y-4">
//               <div>
//                 <h3 className="text-lg font-semibold text-gray-700 mb-2">Discovered Formula:</h3>
//                 <div className="bg-indigo-50 p-4 rounded-lg font-mono text-sm break-all">
//                   {result.formula}
//                 </div>
//               </div>

//               <div className="grid grid-cols-2 gap-4">
//                 <div>
//                   <h3 className="text-lg font-semibold text-gray-700 mb-2">Accuracy Score (R²):</h3>
//                   <div className="bg-green-50 p-4 rounded-lg text-2xl font-bold text-green-700">
//                     {(result.accuracy_score * 100).toFixed(2)}%
//                   </div>
//                 </div>

//                 <div>
//                   <h3 className="text-lg font-semibold text-gray-700 mb-2">Output Column:</h3>
//                   <div className="bg-blue-50 p-4 rounded-lg text-lg font-semibold text-blue-700">
//                     {result.output_column}
//                   </div>
//                 </div>
//               </div>

//               <div className="text-sm text-gray-500 mt-4">
//                 Analysis completed at: {new Date(result.created_at).toLocaleString()}
//               </div>
//             </div>
//           </div>
//         )}
//       </div>
//     </div>
//   );
// };

// // History Page
// const HistoryPage = () => {
//   const [history, setHistory] = useState([]);
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState('');
//   const { token } = useAuth();

//   useEffect(() => {
//     fetchHistory();
//   }, []);

//   const fetchHistory = async () => {
//     try {
//       const response = await axios.get(`${API_BASE_URL}/history`, {
//         headers: { Authorization: `Bearer ${token}` }
//       });
//       setHistory(response.data);
//     } catch (err) {
//       setError('Failed to load history');
//     } finally {
//       setLoading(false);
//     }
//   };

//   if (loading) {
//     return (
//       <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-100 flex items-center justify-center">
//         <div className="text-2xl text-indigo-900">Loading history...</div>
//       </div>
//     );
//   }

//   return (
//     <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-100 py-12 px-4">
//       <div className="max-w-6xl mx-auto">
//         <h1 className="text-4xl font-bold text-indigo-900 mb-8 text-center">
//           Analysis History
//         </h1>

//         {error && (
//           <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
//             {error}
//           </div>
//         )}

//         {history.length === 0 ? (
//           <div className="bg-white rounded-lg shadow-xl p-12 text-center">
//             <p className="text-xl text-gray-600 mb-4">No analysis history yet</p>
//             <Link
//               to="/analyze"
//               className="inline-block bg-indigo-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-indigo-700 transition"
//             >
//               Run Your First Analysis
//             </Link>
//           </div>
//         ) : (
//           <div className="space-y-6">
//             {history.map((item) => (
//               <div key={item.id} className="bg-white rounded-lg shadow-xl p-6">
//                 <div className="flex justify-between items-start mb-4">
//                   <div>
//                     <h3 className="text-xl font-bold text-indigo-900">{item.filename}</h3>
//                     <p className="text-sm text-gray-500">
//                       {new Date(item.created_at).toLocaleString()}
//                     </p>
//                   </div>
//                   <div className="bg-green-100 px-4 py-2 rounded-lg">
//                     <span className="text-green-700 font-bold">
//                       R²: {(item.accuracy_score * 100).toFixed(2)}%
//                     </span>
//                   </div>
//                 </div>

//                 <div className="space-y-3">
//                   <div>
//                     <span className="text-gray-600 font-semibold">Output Column: </span>
//                     <span className="text-indigo-700 font-mono">{item.output_column}</span>
//                   </div>
//                   <div>
//                     <span className="text-gray-600 font-semibold">Formula: </span>
//                     <div className="mt-2 bg-indigo-50 p-3 rounded font-mono text-sm break-all">
//                       {item.formula_string}
//                     </div>
//                   </div>
//                 </div>
//               </div>
//             ))}
//           </div>
//         )}
//       </div>
//     </div>
//   );
// };

// // Main App Component
// const App = () => {
//   return (
//     <Router>
//       <AuthProvider>
//         <div className="min-h-screen">
//           <Navigation />
//           <Routes>
//             <Route path="/" element={<LandingPage />} />
//             <Route path="/login" element={<LoginPage />} />
//             <Route
//               path="/analyze"
//               element={
//                 <ProtectedRoute>
//                   <AnalysisPage />
//                 </ProtectedRoute>
//               }
//             />
//             <Route
//               path="/history"
//               element={
//                 <ProtectedRoute>
//                   <HistoryPage />
//                 </ProtectedRoute>
//               }
//             />
//           </Routes>
//         </div>
//       </AuthProvider>
//     </Router>
//   );
// };

// export default App;


import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import './global.css'

// Import Context
import { AuthProvider } from './context/AuthContext.jsx';

// Import Components
import Navigation from './components/Navigation.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';

// Import Pages
import LandingPage from './pages/LandingPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import AnalysisPage from './pages/AnalysisPage.jsx';
import HistoryPage from './pages/HistoryPage.jsx';

// Main App Component
const App = () => {
  return (
    <Router>
      <AuthProvider>
        <div className="min-h-screen" style={ {backgroundColor: "#0d1b2a"}}>
          <Navigation />
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />

            {/* Protected Routes */}
            <Route
              path="/analyze"
              element={
                <ProtectedRoute>
                  <AnalysisPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/history"
              element={
                <ProtectedRoute>
                  <HistoryPage />
                </ProtectedRoute>
              }
            />
          </Routes>
        </div>
      </AuthProvider>
    </Router>
  );
};

export default App;