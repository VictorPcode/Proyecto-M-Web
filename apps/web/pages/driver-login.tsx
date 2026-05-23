import { useState, useEffect } from "react";
import { useRouter } from "next/router";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const DRIVER_USER_KEY = "movi:driver:user";
const DRIVER_TOKEN_KEY = "movi:driver:token";

export default function DriverLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // ensure any non-driver stored credentials are removed
  useEffect(() => {
    const raw = typeof window !== 'undefined' ? localStorage.getItem('movi:user') : null;
    if (raw) {
      try {
        const u = JSON.parse(raw);
        if (u.role !== 'DRIVER') {
          localStorage.removeItem('movi:user');
          localStorage.removeItem('movi:token');
        }
      } catch {}
    }
  }, []);


  const submit = async (e?: any) => {
    e?.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 403 && data.error === "driver_not_approved") {
          alert(data.message || "Tu cuenta aun no ha sido aprobada por un administrador.");
          return;
        }
        if (res.status === 403 && data.error === "not_approved") {
          alert("Tu cuenta aún no ha sido aprobada por un administrador.");
          return;
        }
        alert("Login failed: " + (data.error || res.statusText));
        return;
      }
      if (data?.user?.role !== "DRIVER") {
        alert("Esta cuenta no es de conductor. Inicia sesión con una cuenta de conductor aprobada.");
        return;
      }
      localStorage.setItem("movi:token", data.token);
      localStorage.setItem("movi:user", JSON.stringify(data.user));
      localStorage.setItem(DRIVER_TOKEN_KEY, data.token);
      localStorage.setItem(DRIVER_USER_KEY, JSON.stringify(data.user));
      router.push("/rider");
    } catch (err) {
      console.error(err);
      alert("Login error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ 
      position: 'relative', 
      width: '100vw', 
      height: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #f6fb93 0%, #eb4f4f 100%)'
    }}>
      <div style={{ 
        position: 'fixed', 
        top: '50%', 
        left: '50%', 
        transform: 'translate(-50%, -50%)',
        zIndex: 10, 
        background: 'rgba(255, 255, 255, 0.98)', 
        padding: '0 40px 32px', 
        borderRadius: '24px', 
        backdropFilter: 'blur(20px)', 
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
        width: 'min(400px, calc(100vw - 32px))',
        maxWidth: 'calc(100vw - 85px)'
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
            alt="MOVI Conductor"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        </div>
        <div style={{ fontSize: 14, color: '#86868b', marginBottom: 24, textAlign: 'center' }}>
          Acceso para conductores
        </div>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 13, marginBottom: 8 }}>
            ¿No tienes cuenta? <a href="/driver-register">Regístrate como conductor</a>
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

          <button 
            className="btn" 
            onClick={submit} 
            disabled={loading}
            style={{
              background: '#FF3B30',
              color: 'white',
              padding: '14px 24px',
              borderRadius: '12px',
              fontSize: 15,
              fontWeight: 600,
              border: 'none',
              boxShadow: '0 4px 16px rgba(255, 59, 48, 0.4)',
              cursor: 'pointer',
              width: '100%',
              marginTop: 8
            }}
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
          <button
            type="button"
            onClick={() => router.push('/forgot-password')}
            style={{
              background: 'transparent',
              color: '#86868b',
              padding: '8px 24px',
              borderRadius: '12px',
              fontSize: 13,
              border: 'none',
              cursor: 'pointer',
              width: '100%',
              marginTop: 4
            }}
          >
            ¿Olvidaste tu contraseña?
          </button>
        </form>
      </div>
    </div>
  );
}
