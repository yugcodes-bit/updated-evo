import React, { createContext, useContext, useState } from 'react';
import bgVideo from "../assets/newvideo.mp4"
import "./landingpage.css"
import {Link} from "react-router-dom"
// --- Mock react-router-dom ---
// In a real environment, you would import 'react-router-dom'
// We mock it here to make this a single, runnable file.
import bulb from '../assets/bulb.png'
import images from '../assets/imputoutput.png'
import ans from '../assets/ans.png'


const Landing = () => {
  return (
    <div className="landing-page">
      <img className='bulb' src={bulb} alt="" />
      <video
                    autoPlay
                    loop
                    muted
                    className="login-bg-video" 
                  >
                    <source src={bgVideo} type="video/mp4" />
                  </video>
      <div className="top-bar">
        <div className="search-box">
          <span className="search-icon" role="img" aria-label="hand-raise"></span> Evosolve
        </div>
      </div>
      <div className="main-content">
        <h1>
          If you struggle<br />
          to get FORMULAS<br />
          EVOSOLVE, is here
        </h1>
      </div>
    </div>
  )
}

const useNavigate = () => {
  return (path) => {
    console.log(`Navigating to: ${path}`);
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };
};

// --- Mock AuthContext ---
// This replaces your '../context/AuthContext' import
const AuthContext = createContext(null);

const useAuth = () => {
  return useContext(AuthContext);
};

const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(null); // 'some-token' or null
  const [user, setUser] = useState(null); // { email: 'user@example.com' } or null

  const login = () => {
    setToken('some-token');
    setUser({ email: 'user@example.com' });
  };

  const logout = () => {
    setToken(null);
    setUser(null);
  };

  // Expose login/logout for the mock app to use
  return (
    <AuthContext.Provider value={{ token, user, logout, login }}>
      {children}
    </AuthContext.Provider>
  );
};

// --- CSS Styles Component ---
// This component injects all the styles for the landing page


// --- Landing Page ---
// This is your component, modified to fit the new design
const LandingPage = () => {
  const { token } = useAuth();
  const navigate = useNavigate();
  const title = "Discover Hidden Formulas";
  return (
    <div className="landing-page">
       
   <h1 className='how'>HOW IT <br />WORKS?</h1>
      
      {/* This is the blank space for you to insert an image */}
     
     <img className='inpout' src={images} alt="" />
    <img className='ans' src={ans} alt="" />

      <button
        onClick={() => navigate(token ? '/analyze' : '/login')}
        className="cta-button"
      >
        {token ? 'Start Analyzing' : 'Evo'}
      </button>
      
      {/* The features-grid has been removed as requested */}
    </div>
  );
};


// --- Main App Component ---
// This component renders everything
export default function App() {
  return (
    <AuthProvider>
      <Landing />
      <LandingPage />
    </AuthProvider>
  );
}