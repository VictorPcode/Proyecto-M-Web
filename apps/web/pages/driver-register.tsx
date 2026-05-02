import { useState, useEffect } from "react";
import { useRouter } from "next/router";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export default function DriverRegisterPage() {
  const [isUpdate, setIsUpdate] = useState(false); // true si el usuario ya está logueado (actualización de docs)
  const [userId, setUserId] = useState<string | null>(null);
  const [step, setStep] = useState(1); // 1: personal, 2: vehicle, 3: documents
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [licenseType, setLicenseType] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [placa, setPlaca] = useState("");
  const [marca, setMarca] = useState("");
  const [modelo, setModelo] = useState("");
  const [color, setColor] = useState("");
  const [year, setYear] = useState("");
  const [capacidad, setCapacidad] = useState(4);
  
  // documentos
  const [docCedulaVerdeFront, setDocCedulaVerdeFront] = useState<File | null>(null);
  const [docCedulaVerdeBack, setDocCedulaVerdeBack] = useState<File | null>(null);
  const [docLicenseFront, setDocLicenseFront] = useState<File | null>(null);
  const [docLicenseBack, setDocLicenseBack] = useState<File | null>(null);
  const [docCedulaFront, setDocCedulaFront] = useState<File | null>(null);
  const [docCedulaBack, setDocCedulaBack] = useState<File | null>(null);
  const [docJudicialCert, setDocJudicialCert] = useState<File | null>(null);
  
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // Detectar si el usuario ya está logueado y pre-llenar datos
  useEffect(() => {
    const token = localStorage.getItem("movi:token");
    const userStr = localStorage.getItem("movi:user");
    
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr);
        // Si el usuario ya existe, es una actualización de documentos
        setIsUpdate(true);
        setUserId(user.id);
        setName(user.name || "");
        setEmail(user.email || "");
        setPhone(user.phone || "");
        setLicenseType(user.licenseType || "");
        setLicenseNumber(user.licenseNumber || "");
        
        // Cargar datos del vehículo si existen
        fetchUserData(user.id, token);
        
        // Si es actualización, ir directo al paso 3 (documentos)
        setStep(3);
      } catch (err) {
        console.error("Error parsing user data:", err);
      }
    }
  }, []);

  const fetchUserData = async (id: string, token: string) => {
    try {
      const res = await fetch(`${API_URL}/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.vehicle) {
          setPlaca(data.vehicle.placa || "");
          setMarca(data.vehicle.marca || "");
          setModelo(data.vehicle.modelo || "");
          setColor(data.vehicle.color || "");
          setYear(data.vehicle.year?.toString() || "");
          setCapacidad(data.vehicle.capacidad || 4);
        }
      }
    } catch (err) {
      console.error("Error fetching user data:", err);
    }
  };

  const submit = async (e?: any) => {
    e?.preventDefault();
    
    // validar que todos los documentos estén seleccionados
    if (step === 3) {
      if (!docCedulaVerdeFront || !docCedulaVerdeBack || !docLicenseFront || !docLicenseBack || !docCedulaFront || !docCedulaBack || !docJudicialCert) {
        alert("Todos los documentos son obligatorios");
        return;
      }
    }
    
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("name", name);
      formData.append("email", email);
      
      // Si es actualización, no enviar password (mantener el existente)
      // Si es registro nuevo, password es obligatorio
      if (!isUpdate) {
        if (!password) {
          alert("La contraseña es obligatoria");
          setLoading(false);
          return;
        }
        formData.append("password", password);
      } else {
        // Para actualización, agregar id del usuario
        formData.append("id", userId || "");
      }
      
      formData.append("role", "DRIVER");
      formData.append("phone", phone);
      formData.append("licenseType", licenseType);
      formData.append("licenseNumber", licenseNumber);
      formData.append("placa", placa);
      formData.append("marca", marca);
      formData.append("modelo", modelo);
      formData.append("color", color);
      formData.append("year", year);
      formData.append("capacidad", capacidad.toString());
      
      // agregar documentos
      if (docCedulaVerdeFront) formData.append("docCedulaVerdeFront", docCedulaVerdeFront);
      if (docCedulaVerdeBack) formData.append("docCedulaVerdeBack", docCedulaVerdeBack);
      if (docLicenseFront) formData.append("docLicenseFront", docLicenseFront);
      if (docLicenseBack) formData.append("docLicenseBack", docLicenseBack);
      if (docCedulaFront) formData.append("docCedulaFront", docCedulaFront);
      if (docCedulaBack) formData.append("docCedulaBack", docCedulaBack);
      if (docJudicialCert) formData.append("docJudicialCert", docJudicialCert);
      
      const res = await fetch(`${API_URL}/users`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        alert(`${isUpdate ? 'Actualización' : 'Registro'} fallido: ` + (err.error || res.statusText));
        return;
      }
      const data = await res.json();
      
      if (isUpdate) {
        alert("Documentos actualizados correctamente. Un administrador revisará los cambios.");
        router.push("/conductor/perfil");
      } else {
        // after registering we do NOT auto-login; account must be approved first
        alert("Registro enviado. Un administrador debe aprobar tu cuenta antes de poder acceder.");
        router.push("/driver-login");
      }
    } catch (err) {
      console.error(err);
      alert(`Error de ${isUpdate ? 'actualización' : 'registro'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'relative',
      width: '100vw',
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
      padding: '20px 0'
    }}>
      <div style={{
        position: 'relative',
        zIndex: 10,
        background: 'rgba(255, 255, 255, 0.98)',
        padding: '28px 32px',
        borderRadius: '24px',
        backdropFilter: 'blur(20px)',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
        width: '420px',
        maxWidth: 'calc(100vw - 40px)',
        minHeight: 'auto'
      }}>
        <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 24, color: '#000', letterSpacing: '-0.5px', textAlign: 'center' }}>
          {isUpdate ? 'Actualizar Documentos' : 'Registro Conductor'}
        </div>
        {!isUpdate && (
          <div style={{ fontSize: 12, color: '#86868b', textAlign: 'center', marginBottom: 18 }}>
            Paso {step} de 3
          </div>
        )}
        {isUpdate && (
          <div style={{ fontSize: 12, color: '#86868b', textAlign: 'center', marginBottom: 18 }}>
            Re-sube todos tus documentos para una nueva revisión
          </div>
        )}

        {step === 1 && !isUpdate ? (
          // PASO 1: Datos personales
          <form onSubmit={(e) => { e.preventDefault(); setStep(2); }} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { placeholder: 'Nombre', value: name, setter: setName, type: 'text' },
              { placeholder: 'Email', value: email, setter: setEmail, type: 'email' },
              { placeholder: 'Contraseña', value: password, setter: setPassword, type: 'password' },
              { placeholder: 'Teléfono', value: phone, setter: setPhone, type: 'text' },
              { placeholder: 'Licencia (tipo)', value: licenseType, setter: setLicenseType, type: 'text' },
              { placeholder: 'Número de licencia', value: licenseNumber, setter: setLicenseNumber, type: 'text' },
            ].map((field, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '11px 12px',
                  background: '#f5f5f7',
                  borderRadius: '10px',
                  border: '2px solid transparent',
                  transition: 'all 0.2s ease',
                }}
              >
                <input
                  required
                  placeholder={field.placeholder}
                  type={field.type}
                  value={field.value}
                  onChange={e => field.setter(e.target.value)}
                  style={{
                    flex: 1,
                    border: 'none',
                    background: 'transparent',
                    color: '#000',
                    fontSize: 13,
                    fontWeight: 500,
                    outline: 'none',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  }}
                />
              </div>
            ))}
            <button type="submit" style={{ marginTop: 4, padding: '10px', background: '#007AFF', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
              Siguiente
            </button>
          </form>
        ) : step === 2 && !isUpdate ? (
          // PASO 2: Datos del vehículo
          <form onSubmit={(e) => { e.preventDefault(); setStep(3); }} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Datos del vehículo</div>
            {[
              { placeholder: 'Placa', value: placa, setter: setPlaca, type: 'text' },
              { placeholder: 'Marca', value: marca, setter: setMarca, type: 'text' },
              { placeholder: 'Modelo', value: modelo, setter: setModelo, type: 'text' },
              { placeholder: 'Color', value: color, setter: setColor, type: 'text' },
              { placeholder: 'Capacidad', value: capacidad.toString(), setter: (v: string) => setCapacidad(Number(v)), type: 'number' },
              { placeholder: 'Año vehículo', value: year, setter: (v: string) => setYear(v), type: 'number' },
            ].map((field, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '11px 12px',
                  background: '#f5f5f7',
                  borderRadius: '10px',
                  border: '2px solid transparent',
                  transition: 'all 0.2s ease',
                }}
              >
                <input
                  required
                  placeholder={field.placeholder}
                  type={field.type}
                  value={field.value}
                  onChange={e => field.setter(e.target.value)}
                  style={{
                    flex: 1,
                    border: 'none',
                    background: 'transparent',
                    color: '#000',
                    fontSize: 13,
                    fontWeight: 500,
                    outline: 'none',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  }}
                />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              <button
                type="button"
                onClick={() => setStep(1)}
                style={{
                  flex: 1,
                  padding: '10px',
                  background: '#f5f5f7',
                  color: '#000',
                  border: 'none',
                  borderRadius: '10px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: 13
                }}
              >
                Atrás
              </button>
              <button
                type="submit"
                style={{
                  flex: 1,
                  padding: '10px',
                  background: '#007AFF',
                  color: 'white',
                  border: 'none',
                  borderRadius: '10px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: 13
                }}
              >
                Siguiente
              </button>
            </div>
          </form>
        ) : (
          // PASO 3: Documentos
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>
              Documentos requeridos (Máx 5MB cada uno)
            </div>
            
            {[
              { label: 'Cédula Verde (Frente)', setter: setDocCedulaVerdeFront },
              { label: 'Cédula Verde (Dorso)', setter: setDocCedulaVerdeBack },
              { label: 'Licencia (Frente)', setter: setDocLicenseFront },
              { label: 'Licencia (Dorso)', setter: setDocLicenseBack },
              { label: 'Cédula (Frente)', setter: setDocCedulaFront },
              { label: 'Cédula (Dorso)', setter: setDocCedulaBack },
              { label: 'Certificado de Antecedentes', setter: setDocJudicialCert },
            ].map((doc, idx) => (
              <div key={idx}>
                <label style={{ fontSize: 11, color: '#333', display: 'block', marginBottom: 4 }}>
                  {doc.label}
                </label>
                <input
                  required
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(e) => {
                    if (e.target.files?.[0]) doc.setter(e.target.files[0]);
                  }}
                  style={{
                    width: '100%',
                    padding: '8px',
                    background: '#f5f5f7',
                    border: '1px solid #ddd',
                    borderRadius: '8px',
                    fontSize: 12,
                    cursor: 'pointer'
                  }}
                />
              </div>
            ))}
            
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              <button
                type="button"
                onClick={() => isUpdate ? router.push('/conductor/perfil') : setStep(2)}
                disabled={loading}
                style={{
                  flex: 1,
                  padding: '10px',
                  background: '#f5f5f7',
                  color: '#000',
                  border: 'none',
                  borderRadius: '10px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: 13,
                  opacity: loading ? 0.5 : 1
                }}
              >
                {isUpdate ? 'Cancelar' : 'Atrás'}
              </button>
              <button
                type="submit"
                disabled={loading}
                style={{
                  flex: 1,
                  padding: '10px',
                  background: '#34C759',
                  color: 'white',
                  border: 'none',
                  borderRadius: '10px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: 13,
                  opacity: loading ? 0.5 : 1
                }}
              >
                {loading ? (isUpdate ? 'Actualizando...' : 'Registrando...') : (isUpdate ? 'Actualizar' : 'Registrar')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}