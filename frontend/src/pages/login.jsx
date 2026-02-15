import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../utils/api.js";

const styles = {
  page: {
    minHeight: "100vh",
    background: "#222222",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "'Inter', sans-serif",
  },
  card: {
    background: "#2b2b2b",
    // border: "3px solid #3a3a3a",
    borderRadius: "0",
    padding: "32px",
    width: "400px",
    maxWidth: "90vw",
  },
  title: {
    fontSize: "20px",
    fontWeight: 600,
    color: "#ffffff",
    marginBottom: "6px",
  },
  subtitle: {
    fontSize: "14px",
    color: "#888888",
    marginBottom: "28px",
  },
  label: {
    fontSize: "13px",
    fontWeight: 500,
    color: "#ffffff",
    display: "block",
    marginBottom: "8px",
  },
  input: {
    width: "100%",
    padding: "12px 14px",
    fontSize: "14px",
    fontFamily: "'Inter', sans-serif",
    background: "#242424",
    border: "0px solid #444444",
    borderRadius: "0",
    color: "#ffffff",
    outline: "none",
    boxSizing: "border-box",
  },
  fieldGroup: {
    marginBottom: "20px",
  },
  button: {
    width: "100%",
    padding: "12px",
    fontSize: "14px",
    fontWeight: 500,
    fontFamily: "'Inter', sans-serif",
    background: "#e0e0e0",
    color: "#111111",
    border: "none",
    borderRadius: "0",
    cursor: "pointer",
    marginBottom: "12px",
  },
  error: {
    fontSize: "13px",
    color: "#ef4444",
    marginBottom: "16px",
  },
  footer: {
    textAlign: "center",
    fontSize: "13px",
    color: "#888888",
    marginTop: "8px",
  },
  link: {
    color: "#ffffff",
    textDecoration: "underline",
  },
  forgotRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "8px",
  },
};

export default function LoginPage({ onLogin }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function redirectToWorkbook(token) {
    try {
      const res = await apiFetch("/api/workbooks/list", {}, token);
      const data = await res.json();
      if (data.status === "success" && data.workbooks && data.workbooks.length > 0) {
        const sorted = data.workbooks.sort((a, b) => new Date(b.last_modified) - new Date(a.last_modified));
        const wb = sorted[0];
        // Need to get sheets for this workbook
        const wbRes = await apiFetch(`/api/workbooks/${wb.id}`, {}, token);
        const wbData = await wbRes.json();
        if (wbData.sheets && wbData.sheets.length > 0) {
          navigate(`/workbook/${wb.id}/sheet/${wbData.sheets[0].id}`);
          return;
        }
      }
      // No workbooks — create one
      const createRes = await apiFetch("/api/workbooks/create", { method: "POST" }, token);
      const createData = await createRes.json();
      if (createData.status === "success") {
        navigate(`/workbook/${createData.workbook_id}/sheet/${createData.sheet_id}`);
      }
    } catch {
      navigate("/");
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await apiFetch("/api/auth/login", {
        method: "POST",
        body: { email, password },
      });
      const data = await res.json();

      if (data.status === "success") {
        localStorage.setItem("token", data.token);
        onLogin(data.token);
        await redirectToWorkbook(data.token);
      } else {
        setError(data.message || "Login failed");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.title}>Login to your account</div>
        <div style={styles.subtitle}>Enter your email below to login to your account</div>

        <form onSubmit={handleSubmit}>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>Email</label>
            <input
              type="email"
              style={styles.input}
              placeholder="m@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div style={styles.fieldGroup}>
            <div style={styles.forgotRow}>
              <label style={styles.label}>Password</label>
            </div>
            <input
              type="password"
              style={styles.input}
              value={password}
              placeholder="Enter your password"
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && <div style={styles.error}>{error}</div>}

          <button type="submit" style={styles.button} disabled={loading}>
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>

        <div style={styles.footer}>
          Don't have an account?{" "}
          <Link to="/signup" style={styles.link}>Sign up</Link>
        </div>
      </div>
    </div>
  );
}
