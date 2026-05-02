import { useState } from "react";
import { useRouter } from "next/router";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const router = useRouter();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    try {
      await fetch(`${API_URL}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } catch (err) {
      console.error(err);
      alert("Error al enviar el correo. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  const cardStyle: React.CSSProperties = {
    position: "fixed",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    zIndex: 10,
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
          Recuperar contraseña
        </div>

        {sent ? (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📧</div>
            <p style={{ color: "#333", fontSize: 15, marginBottom: 8 }}>
              Si existe una cuenta con ese correo, recibirás un enlace para restablecer tu contraseña.
            </p>
            <p style={{ color: "#86868b", fontSize: 13, marginBottom: 24 }}>
              Revisa también tu carpeta de spam.
            </p>
            <button
              onClick={() => router.push("/login")}
              style={{
                width: "100%",
                padding: "14px",
                background: "#007AFF",
                color: "white",
                border: "none",
                borderRadius: 12,
                fontSize: 15,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Volver al inicio de sesión
            </button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <p style={{ color: "#555", fontSize: 14, marginBottom: 20 }}>
              Ingresa tu correo y te enviaremos un enlace para restablecer tu contraseña.
            </p>
            <div style={inputWrap}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@correo.com"
                required
                style={inputStyle}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                padding: "14px",
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
              {loading ? "Enviando..." : "Enviar enlace"}
            </button>
            <div style={{ textAlign: "center" }}>
              <span
                onClick={() => router.push("/login")}
                style={{ color: "#007AFF", fontSize: 14, cursor: "pointer" }}
              >
                ← Volver al inicio de sesión
              </span>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
