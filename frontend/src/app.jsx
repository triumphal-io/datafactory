import { Route, Routes, Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { TokenContext } from "./utils/token-context.jsx";
import { WebSocketProvider } from "./utils/websocket-context.jsx";
import { ToastContainer } from "react-toastify";
import WorkbookPage from "./pages/workbook.jsx";
import SettingsPage from "./pages/settings.jsx";

const toURL = "/sheet";

function Home() {
  // const navigate = useNavigate();

  // useEffect(() => {
  //   const timer = setTimeout(() => {
  //     navigate(toURL);
  //   }, 1000);

  //   return () => clearTimeout(timer);
  // }, [navigate]);

  return (
    <div style={{ padding: "2rem", textAlign: "center" }}>
      <h1>Welcome to Datafactory</h1>
      <nav style={{ margin: "2rem 0" }}>
       
        <Link
          to="/sheet"
          style={{
            margin: "0 1rem",
            padding: "0.5rem 1rem",
            backgroundColor: "#007bff",
            color: "white",
            textDecoration: "none",
            borderRadius: "4px",
          }}
        >
          Go to Data Studio
        </Link>
      </nav>
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
      console.log("Received token:", t);
    }
  }, []);

  return (
    <TokenContext.Provider value={token}>
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
        <Route path="/" element={<Home />} />
        <Route path="/workbook/:workbookId/sheet/:sheetId" element={<WebSocketProvider><WorkbookPage /></WebSocketProvider>} />
        <Route path="/workbook/:workbookId/files" element={<WebSocketProvider><WorkbookPage /></WebSocketProvider>} />
        <Route path="/settings" element={<SettingsPage />} />
        {/*<Route path="/connectors" element={<Connectors />} />
        <Route path="/connectors/:connectorId" element={<ConnectorDetail />} />
        <Route path="/workflows" element={<Workflows />} />
        <Route path="/connection/create/:connectorId" element={<AuthPop />} />
        <Route path="/connection/callback/:connectorId" element={<AuthPop />} /> */}
        {/* <Route path="/api/auth/set-token" element={<SetToken />} /> */}
        {/* <Route path="/dashboard" element={<Dashboard />} /> */}
      </Routes>
    </TokenContext.Provider>
  );
}
