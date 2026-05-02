import { useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const submit = async (e?: any) => {
    e?.preventDefault();
    if (!name || !email || !password) {
      alert("Por favor completa todos los campos");
      return;
    }
    setLoading(true);
    try {
      // Paso 1: Registrar usuario
      const res = await fetch(`${API_URL}/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, role: "PASSENGER" }),
      });
      
      const u = await res.json();
      
      // Verificar si hubo error en el registro
      if (!res.ok || u.error) {
        console.error("Error en registro:", u);
        if (u.error === "email_exists") {
          alert("Este email ya está registrado. ¿Quieres iniciar sesión?");
          router.push("/login");
          return;
        }
        alert(`Error al registrar: ${u.error || 'Error desconocido'}`);
        return;
      }
      
      console.log("Usuario creado exitosamente:", u);
      
      // Paso 2: Auto login
      const resLogin = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      
      if (resLogin.ok) {
        const data = await resLogin.json();
        console.log("Login exitoso:", data);
        localStorage.setItem("movi:token", data.token);
        localStorage.setItem("movi:user", JSON.stringify(data.user));
        router.push("/client");
      } else {
        const errorData = await resLogin.json();
        console.error("Error en login después de registro:", errorData);
        alert("Usuario creado pero hubo un problema al iniciar sesión. Por favor intenta iniciar sesión manualmente.");
        router.push("/login");
      }
    } catch (err) {
      console.error("Error en registro:", err);
      alert("Error de conexión. Por favor verifica que el servidor esté corriendo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ 
      width: '100vw', 
      height: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      <div style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        background: 'rgba(255, 255, 255, 0.98)',
        padding: '40px',
        borderRadius: '24px',
        backdropFilter: 'blur(20px)',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
        width: '400px',
        maxWidth: 'calc(100vw - 48px)'
      }}>
        <h1 style={{ 
          fontSize: 32, 
          fontWeight: 700, 
          marginBottom: 8, 
          color: '#000',
          letterSpacing: '-1px',
          textAlign: 'center'
        }}>MOVI</h1>
        <p style={{ 
          fontSize: 15, 
          color: '#86868b', 
          marginBottom: 32,
          textAlign: 'center'
        }}>Crea tu cuenta de pasajero</p>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <input 
            placeholder="Nombre completo" 
            value={name} 
            onChange={e => setName(e.target.value)}
            style={{
              padding: '14px 16px',
              background: '#f5f5f7',
              borderRadius: '12px',
              border: 'none',
              fontSize: 15,
              fontWeight: 500,
              outline: 'none',
              color: '#000',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            }}
          />
          <input 
            placeholder="Email" 
            type="email"
            value={email} 
            onChange={e => setEmail(e.target.value)}
            style={{
              padding: '14px 16px',
              background: '#f5f5f7',
              borderRadius: '12px',
              border: 'none',
              fontSize: 15,
              fontWeight: 500,
              outline: 'none',
              color: '#000',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            }}
          />
          <input 
            placeholder="Contraseña" 
            type="password" 
            value={password} 
            onChange={e => setPassword(e.target.value)}
            style={{
              padding: '14px 16px',
              background: '#f5f5f7',
              borderRadius: '12px',
              border: 'none',
              fontSize: 15,
              fontWeight: 500,
              outline: 'none',
              color: '#000',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            }}
          />
          <button 
            type="submit"
            disabled={loading}
            style={{
              padding: '14px 24px',
              background: '#007AFF',
              color: 'white',
              borderRadius: '12px',
              border: 'none',
              fontSize: 15,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
              boxShadow: '0 4px 16px rgba(0, 122, 255, 0.4)',
              marginTop: 8
            }}
          >
            {loading ? "Creando..." : "Crear cuenta"}
          </button>
          <p style={{
            fontSize: 12,
            color: '#666',
            textAlign: 'center',
            margin: '8px 0'
          }}>
            Al registrarte, aceptas nuestros{' '}
            <Link href="/terminos" style={{ color: '#007AFF', textDecoration: 'underline' }}>
              Términos y Condiciones
            </Link>
          </p>
          <button 
            type="button" 
            onClick={() => router.push('/login')}
            style={{
              padding: '12px',
              background: 'transparent',
              color: '#007AFF',
              border: 'none',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
              textAlign: 'center'
            }}
          >
            ¿Ya tienes cuenta? Inicia sesión
          </button>
        </form>
      </div>
    </div>
  );
}
