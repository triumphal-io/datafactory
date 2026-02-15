import { Route, Routes, Navigate, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { TokenContext } from "./utils/token-context.jsx";
import { WebSocketProvider } from "./utils/websocket-context.jsx";
import { ToastContainer } from "react-toastify";
import { apiFetch } from "./utils/api.js";
import WorkbookPage from "./pages/workbook.jsx";
import SettingsPage from "./pages/settings.jsx";
import LoginPage from "./pages/login.jsx";
import SignupPage from "./pages/signup.jsx";

function ProtectedRoute({ token, children }) {
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function HomeRedirect({ token }) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!token) {
      navigate("/login", { replace: true });
      return;
    }

    async function redirect() {
      try {
        const res = await apiFetch("/api/workbooks/list", {}, token);
        const data = await res.json();
        if (data.status === "success" && data.workbooks && data.workbooks.length > 0) {
          const sorted = data.workbooks.sort((a, b) => new Date(b.last_modified) - new Date(a.last_modified));
          const wb = sorted[0];
          const wbRes = await apiFetch(`/api/workbooks/${wb.id}`, {}, token);
          const wbData = await wbRes.json();
          if (wbData.sheets && wbData.sheets.length > 0) {
            navigate(`/workbook/${wb.id}/sheet/${wbData.sheets[0].id}`, { replace: true });
            return;
          }
        }
        // No workbooks — create one
        const createRes = await apiFetch("/api/workbooks/create", { method: "POST" }, token);
        const createData = await createRes.json();
        if (createData.status === "success") {
          navigate(`/workbook/${createData.workbook_id}/sheet/${createData.sheet_id}`, { replace: true });
        }
      } catch {
        navigate("/login", { replace: true });
      }
    }

    redirect();
  }, [token, navigate]);

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center", color: "#888", fontFamily: "'Inter', sans-serif" }}>
      Loading...
    </div>
  );
}

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("token"));

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const t = urlParams.get("token");
    if (t) {
      setToken(t);
      localStorage.setItem("token", t);
    }
  }, []);

  function handleLogin(newToken) {
    setToken(newToken);
    localStorage.setItem("token", newToken);
  }

  function handleLogout() {
    setToken(null);
    localStorage.removeItem("token");
  }

  return (
    <TokenContext.Provider value={{ token, setToken: handleLogin, logout: handleLogout }}>
      <ToastContainer
        theme="dark"
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick={false}
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        position="bottom-center"
      />
      <Routes>
        <Route path="/login" element={token ? <Navigate to="/" replace /> : <LoginPage onLogin={handleLogin} />} />
        <Route path="/signup" element={token ? <Navigate to="/" replace /> : <SignupPage onLogin={handleLogin} />} />
        <Route path="/" element={<HomeRedirect token={token} />} />
        <Route path="/workbook/:workbookId/sheet/:sheetId" element={
          <ProtectedRoute token={token}>
            <WebSocketProvider><WorkbookPage /></WebSocketProvider>
          </ProtectedRoute>
        } />
        <Route path="/workbook/:workbookId/files" element={
          <ProtectedRoute token={token}>
            <WebSocketProvider><WorkbookPage /></WebSocketProvider>
          </ProtectedRoute>
        } />
        <Route path="/settings" element={<Navigate to="/settings/general" replace />} />
        <Route path="/settings/:tab" element={
          <ProtectedRoute token={token}>
            <SettingsPage />
          </ProtectedRoute>
        } />
      </Routes>
    </TokenContext.Provider>
  );
}
