import { useState, useEffect } from "react";
import { useRouter } from "next/router";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token");
    if (!t) {
      setError("Enlace inválido o expirado.");
    } else {
      setToken(t);
    }
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "token_expired") setError("El enlace ha expirado. Solicita uno nuevo.");
        else if (data.error === "invalid_token") setError("Enlace inválido. Solicita uno nuevo.");
        else if (data.error === "password_too_short") setError("La contraseña es demasiado corta.");
        else setError("Error al restablecer. Intenta de nuevo.");
        return;
      }
      setDone(true);
    } catch (err) {
      console.error(err);
      setError("Error de conexión. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  const cardStyle: React.CSSProperties = {
    position: "fixed",
    top: "50%",
    left: "50%",
    transform: "translate(-50%,-50%)",
    background: "rgba(255,255,255,0.98)",
    padding: "32px 40px",
    borderRadius: 24,
    boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
    width: 400,
    maxWidth: "calc(100vw - 64px)",
    color: "#000",
  };

  const inputWrap: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    padding: "14px 16px",
    background: "#f5f5f7",
    borderRadius: 12,
    marginBottom: 12,
  };

  const inputStyle: React.CSSProperties = {
    flex: 1,
    border: "none",
    background: "transparent",
    color: "#000",
    fontSize: 15,
    outline: "none",
    fontFamily: "inherit",
  };

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "linear-gradient(135deg,#667eea 0%,#764ba2 100%)",
      }}
    >
      <div style={cardStyle}>
        <div style={{ fontWeight: 700, fontSize: 24, textAlign: "center", marginBottom: 8 }}>
          MOVI
        </div>
        <div style={{ fontSize: 14, color: "#86868b", textAlign: "center", marginBottom: 24 }}>
          Nueva contraseña
        </div>

        {done ? (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>
              Contraseña actualizada correctamente
            </div>
            <p style={{ color: "#333", fontSize: 15, marginBottom: 24 }}>
              Ya puedes iniciar sesión con tu nueva contraseña.
            </p>
            <button
              onClick={() => router.push("/login")}
              style={{
                width: "100%",
                padding: 14,
                background: "#007AFF",
                color: "white",
                border: "none",
                borderRadius: 12,
                fontSize: 15,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Iniciar sesión
            </button>
          </div>
        ) : error && !token ? (
          <div style={{ textAlign: "center" }}>
            <p style={{ color: "#FF3B30", marginBottom: 20 }}>{error}</p>
            <button
              onClick={() => router.push("/forgot-password")}
              style={{
                width: "100%",
                padding: 14,
                background: "#007AFF",
                color: "white",
                border: "none",
                borderRadius: 12,
                fontSize: 15,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Solicitar nuevo enlace
            </button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <div style={inputWrap}>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Nueva contraseña"
                required
                minLength={6}
                style={inputStyle}
              />
            </div>
            <div style={inputWrap}>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Confirmar contraseña"
                required
                style={inputStyle}
              />
            </div>
            {error && (
              <p style={{ color: "#FF3B30", fontSize: 13, marginBottom: 12 }}>{error}</p>
            )}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                padding: 14,
                background: loading ? "#ccc" : "#007AFF",
                color: "white",
                border: "none",
                borderRadius: 12,
                fontSize: 15,
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                marginBottom: 16,
              }}
            >
              {loading ? "Guardando..." : "Cambiar contraseña"}
            </button>
            <div style={{ textAlign: "center" }}>
              <span
                onClick={() => router.push("/forgot-password")}
                style={{ color: "#007AFF", fontSize: 13, cursor: "pointer" }}
              >
                Solicitar nuevo enlace
              </span>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
