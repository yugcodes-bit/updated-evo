import React, { createContext, useContext, useState } from 'react';
import {Link} from'react-router-dom'

const useNavigate = () => {
  return (path) => {
    console.log(`Navigating to: ${path}`);
  };
};

// --- Mock AuthContext ---
// This replaces your '../context/AuthContext' import
const AuthContext = createContext(null);

const useAuth = () => {
  return useContext(AuthContext);
};

const AuthProvider = ({ children }) => {
  // Set default state to logged out (null)
  const [token, setToken] = useState(null); // 'some-token' or null
  const [user, setUser] = useState(null); // { email: '...' } or null

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
// This component injects all the styles for the new sidebar
const NavigationStyles = () => {
  return (
    <style>{`
      * {
        box-sizing: border-box;
      }
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        margin: 0;
        /* Dark gradient background to see glass effect */
        background: linear-gradient(135deg, #1a1a2e 0%, #2a2a4e 100%);
        min-height: 100vh;
        color: #ffffff; /* Set default text color to white for dark bg */
      }
      
      a, button {
        text-decoration: none;
        color: inherit;
        transition-property: all;
        transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        transition-duration: 300ms;
        border: none;
        cursor: pointer;
        font: inherit;
        background-color: transparent;
        width: 100%; /* Make links/buttons fill the space */
      }

      /* --- Expandable Sidebar (Glassmorphism) --- */
      .sidebar-nav {
        position: fixed;
        top: 0;
        left: 0; /* Moved to the left */
        height: 100vh;
        width: 70px; /* Collapsed width */
        
        /* Glassmorphism styles */
        background-color: rgba(255, 255, 255, 0.1); /* Transparent glass */
        backdrop-filter: blur(10px);
        border-right: 1px solid rgba(255, 255, 255, 0.2);
        
        color: #ffffff; /* text-white */
        box-shadow: 5px 0 15px -3px rgba(0, 0, 0, 0.2); /* Shadow on the right */
        
        transition: width 0.3s cubic-bezier(0.4, 0.2, 1);
        overflow: hidden; /* Hide text when collapsed */
        z-index: 100;
        transition: all 0.5s;
      }

      .sidebar-nav:hover {
        width: 210px; /* Expanded width */
      }

      /* --- Sidebar Content Layout --- */
      .nav-content {
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        height: 100%;
        padding: 1rem 0;
      }

      .nav-links-top,
      .nav-links-bottom {
        display: flex;
        flex-direction: column;
        /* Fixed width to match expanded sidebar */
        width: 220px; 
      }

      /* --- Sidebar Links & Buttons --- */
      .nav-link,
      .nav-logo,
      .nav-auth-button,
      .nav-user-info {
        display: flex;
        align-items: center;
        padding: 0.75rem 1rem;
        border-radius: 1.375rem;
        white-space: nowrap; /* Prevent text wrapping */
        transition: background-color 0.2s ease;
        margin:  0.5rem; /* Spacing for items */
      }

      .nav-link:hover,
      .nav-auth-button:hover,
      .nav-logo:hover {
        background-color: rgba(255, 255, 255, 0.2); /* Lighter transparent hover */
      }
      
      .nav-logo {
        font-weight: 700;
        font-size: 1.125rem;
      }
      
      .nav-user-info {
        font-size: 0.875rem;
      }
      
      .nav-auth-button {
        text-align: left;
      }

      /* --- Icon and Text Styling --- */
      .nav-icon {
        font-size: 1.25rem;
        /* Center the icon in the collapsed view */
        min-width: 38px; /* (70px sidebar) - (2 * 1rem padding) + adjustment */
        display: inline-block;
        text-align: center;
        margin-right: 0.75rem;
      }
      
      .nav-logo .nav-icon {
         font-size: 1.5rem; /* Make logo icon bigger */
      }

      .nav-text {
        opacity: 0;
        visibility: hidden;
        transition: opacity 0.2s ease, visibility 0.2s ease;
        font-weight: 500;
      }

      .sidebar-nav:hover .nav-text {
        opacity: 1;
        visibility: visible;
        transition-delay: 0.1s; /* Wait for expand before showing text */
      }
      
      /* Removed the .mock-content styles */
      
    `}</style>
  );
};


// --- Navigation Component ---
// Based on your original component, but adapted for the new sidebar
const Navigation = () => {
  const { token, user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <nav className="sidebar-nav">
      <div className="nav-content">
        
        {/* Top Links */}
        <div className="nav-links-top">
          <Link to="/" className="nav-logo">
            <span className="nav-icon">Evo</span>
            <span className="nav-text">solve</span>
          </Link>
          {token && (
            <>
              <Link to="/analyze" className="nav-link">
                <span className="nav-icon">🔍</span>
                <span className="nav-text">Analyze</span>
              </Link>
              <Link to="/history" className="nav-link">
                <span className="nav-icon">📜</span>
                <span className="nav-text">History</span>
              </Link>
            </>
          )}
        </div>

        {/* Bottom Auth Links */}
        <div className="nav-links-bottom">
          {token ? (
            <>
              <div className="nav-user-info">
                <span className="nav-icon">👤</span>
                <span className="nav-text">{user?.email}</span>
              </div>
              <button
                onClick={handleLogout}
                className="nav-auth-button"
              >
                <span className="nav-icon">X</span>
                <span className="nav-text">Logout</span>
              </button>
            </>
          ) : (
            <Link
              to="/login"
              className="nav-auth-button"
            >
              <span className="nav-icon">O</span>
              <span className="nav-text">Login</span>
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
};


// --- Main App Component ---
// This component renders everything
export default function App() {
  return (
    <AuthProvider>
      <NavigationStyles />
      <Navigation />
      
      {/* The mock content has been removed.
        You can render your other components here.
        Remember to add a 'margin-left: 70px;' to your
        main content container so it doesn't hide
        behind the collapsed sidebar.
      */}
      
    </AuthProvider>
  );
}