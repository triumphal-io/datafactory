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
};

export default function SignupPage({ onLogin }) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function redirectToWorkbook(token) {
    try {
      // New user — create a workbook
      const createRes = await apiFetch("/api/workbooks/create", { method: "POST" }, token);
      const createData = await createRes.json();
      if (createData.status === "success") {
        navigate(`/workbook/${createData.workbook_id}/sheet/${createData.sheet_id}`);
        return;
      }
    } catch {
      // ignore
    }
    navigate("/");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);

    try {
      const res = await apiFetch("/api/auth/signup", {
        method: "POST",
        body: { name, email, password, confirm_password: confirmPassword },
      });
      const data = await res.json();

      if (data.status === "success") {
        localStorage.setItem("token", data.token);
        onLogin(data.token);
        await redirectToWorkbook(data.token);
      } else {
        setError(data.message || "Signup failed");
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
        <div style={styles.title}>Create an account</div>
        <div style={styles.subtitle}>Enter your details below to create your account</div>

        <form onSubmit={handleSubmit}>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>Name</label>
            <input
              type="text"
              style={styles.input}
              placeholder="John Doe"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

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
            <label style={styles.label}>Password</label>
            <input
              type="password"
              style={styles.input}
              value={password}
              placeholder="Enter your password"
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <div style={styles.fieldGroup}>
            <label style={styles.label}>Confirm Password</label>
            <input
              type="password"
              style={styles.input}
              value={confirmPassword}
              placeholder="Re-enter your password"
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>

          {error && <div style={styles.error}>{error}</div>}

          <button type="submit" style={styles.button} disabled={loading}>
            {loading ? "Creating account..." : "Create account"}
          </button>
        </form>

        <div style={styles.footer}>
          Already have an account?{" "}
          <Link to="/login" style={styles.link}>Login</Link>
        </div>
      </div>
    </div>
  );
}
