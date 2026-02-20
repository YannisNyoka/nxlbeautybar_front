import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [appointmentRefreshTrigger, setAppointmentRefreshTrigger] = useState(0); // ← ADD

  useEffect(() => {
    const token = localStorage.getItem('token');
    const storedUser = localStorage.getItem('userInfo');
    if (token && storedUser) {
      setUser(JSON.parse(storedUser));
      setIsAuthenticated(true);
    }
    setLoading(false);
  }, []);

  const login = (userData) => {
    localStorage.setItem('userInfo', JSON.stringify(userData));
    setUser(userData);
    setIsAuthenticated(true);
    setLoading(false);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('userInfo');
    setUser(null);
    setIsAuthenticated(false);
  };

  const triggerAppointmentRefresh = () => {        // ← ADD
    setAppointmentRefreshTrigger(prev => prev + 1); // ← ADD
  };                                                // ← ADD

  return (
    <AuthContext.Provider value={{ 
      user, 
      isAuthenticated, 
      loading, 
      login, 
      logout,
      appointmentRefreshTrigger,    // ← ADD
      triggerAppointmentRefresh     // ← ADD
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}