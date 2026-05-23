import { useState, useEffect } from "react";
import { useRouter } from "next/router";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const ADMIN_SETUP_TOKEN = process.env.NEXT_PUBLIC_ADMIN_SETUP_TOKEN || "admin-root-2026";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [adminExists, setAdminExists] = useState<boolean | null>(null);
  const [isSetupMode, setIsSetupMode] = useState(false);
  const router = useRouter();

  useEffect(() => {
    checkAdminExists();
  }, []);

  const checkAdminExists = async () => {
    try {
      const res = await fetch(`${API_URL}/auth/admin/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      // Si devuelve 409, admin existe
      const exists = res.status === 409;
      setAdminExists(exists);
      setIsSetupMode(!exists);
    } catch (err) {
      console.error(err);
      setAdminExists(true); // Asumir que existe si hay error
    }
  };

  const handleSetup = async (e?: any) => {
    e?.preventDefault();
    if (!email || !password || !setupToken) {
      alert("Todos los campos son requeridos");
      return;
    }

    if (setupToken !== ADMIN_SETUP_TOKEN) {
      alert("Token de setup inválido");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      // First, try to create the admin user directly via a PUT operation or similar
      // For now, we'll use a workaround: create via registration endpoint
      const createRes = await fetch(`${API_URL}/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Administrador Root",
          email,
          password,
          role: "ADMIN",
        }),
      });

      if (!createRes.ok) {
        const err = await createRes.json();
        alert("Error: " + (err.error || createRes.statusText));
        return;
      }

      // Now login
      const loginRes = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await loginRes.json();

      if (!loginRes.ok) {
        alert("Error: " + (data.error || loginRes.statusText));
        return;
      }

      localStorage.setItem("movi:token", data.token);
      localStorage.setItem("movi:user", JSON.stringify(data.user));
      router.push("/admin");
    } catch (err) {
      console.error(err);
      alert("Error al crear admin");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e?: any) => {
    e?.preventDefault();
    if (!email || !password) {
      alert("Completa email y contraseña");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert("Error: " + (data.error || res.statusText));
        return;
      }

      localStorage.setItem("movi:token", data.token);
      localStorage.setItem("movi:user", JSON.stringify(data.user));
      router.push("/admin");
    } catch (err) {
      console.error(err);
      alert("Error de autenticación");
    } finally {
      setLoading(false);
    }
  };

  if (adminExists === null) {
    return (
      <div style={{
        position: 'relative',
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
      }}>
        <div style={{ color: 'white', fontSize: 18 }}>Cargando...</div>
      </div>
    );
  }

  return (
    <div style={{
      position: 'relative',
      width: '100vw',
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
    }}>
      <div style={{
        position: 'relative',
        zIndex: 10,
        background: 'rgba(255, 255, 255, 0.98)',
        padding: '0 40px 32px',
        borderRadius: '24px',
        backdropFilter: 'blur(20px)',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
        width: '420px',
        maxWidth: 'calc(100vw - 64px)',
      }}>
        <div
          style={{
            margin: '0 -40px 18px',
            height: 128,
            borderRadius: '24px 24px 0 0',
            overflow: 'hidden',
            background: '#0000ff',
          }}
        >
          <img
            src="/logo3_11_151913.png"
            alt={isSetupMode ? "Crear Admin Root" : "Admin Login"}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        </div>
        <div style={{
          fontSize: 14,
          color: '#86868b',
          marginBottom: 24,
          textAlign: 'center',
          minHeight: 40
        }}>
          {isSetupMode
            ? "Configura la cuenta de administrador principal"
            : "Acceso para administradores"}
        </div>

        <form onSubmit={isSetupMode ? handleSetup : handleLogin} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            padding: '14px 16px',
            background: '#f5f5f7',
            borderRadius: '12px',
            border: '2px solid transparent',
            transition: 'all 0.2s ease'
          }}>
            <input
              placeholder="Email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={{
                flex: 1,
                border: 'none',
                background: 'transparent',
                color: '#000',
                fontSize: 15,
                fontWeight: 500,
                outline: 'none',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}
            />
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            padding: '14px 16px',
            background: '#f5f5f7',
            borderRadius: '12px',
            border: '2px solid transparent',
            transition: 'all 0.2s ease'
          }}>
            <input
              placeholder="Contraseña"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={{
                flex: 1,
                border: 'none',
                background: 'transparent',
                color: '#000',
                fontSize: 15,
                fontWeight: 500,
                outline: 'none',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}
            />
          </div>

          {isSetupMode && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              padding: '14px 16px',
              background: '#f5f5f7',
              borderRadius: '12px',
              border: '2px solid transparent',
              transition: 'all 0.2s ease'
            }}>
              <input
                placeholder="Token de Setup"
                type="password"
                value={setupToken}
                onChange={e => setSetupToken(e.target.value)}
                style={{
                  flex: 1,
                  border: 'none',
                  background: 'transparent',
                  color: '#000',
                  fontSize: 15,
                  fontWeight: 500,
                  outline: 'none',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                }}
              />
            </div>
          )}

          <button
            disabled={loading}
            style={{
              background: '#667eea',
              color: 'white',
              padding: '14px 24px',
              borderRadius: '12px',
              fontSize: 15,
              fontWeight: 600,
              border: 'none',
              boxShadow: '0 4px 16px rgba(102, 126, 234, 0.4)',
              cursor: 'pointer',
              width: '100%',
              marginTop: 8,
              opacity: loading ? 0.6 : 1
            }}
          >
            {loading ? (isSetupMode ? "Creando..." : "Entrando...") : (isSetupMode ? "Crear Admin" : "Entrar")}
          </button>
        </form>

        {isSetupMode && (
          <div style={{
            marginTop: '16px',
            padding: '12px',
            background: '#fef3c7',
            borderRadius: '8px',
            fontSize: '12px',
            color: '#92400e',
            textAlign: 'center',
          }}>
            ℹ️ Necesitas el token de setup para crear el primer administrador.
          </div>
        )}
      </div>
    </div>
  );
}
