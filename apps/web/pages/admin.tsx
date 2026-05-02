import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import React from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type DriverData = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  approved?: boolean;
  licenseType?: string;
  licenseNumber?: string;
  vehicle?: { 
    placa?: string;
    marca?: string;
    modelo?: string;
    color?: string;
    year?: number;
    capacidad?: number;
  };
  docCedulaVerdeFront?: string;
  docCedulaVerdeBack?: string;
  docLicenseFront?: string;
  docLicenseBack?: string;
  docCedulaFront?: string;
  docCedulaBack?: string;
  docJudicialCert?: string;
};

function DocViewer({ title, docB64 }: { title: string; docB64?: string }) {
  const [open, setOpen] = React.useState(false);

  if (!docB64) {
    return (
      <div style={{ padding: 8, background: '#fee', borderRadius: 8, color: '#c33', fontSize: 12 }}>
        No cargado
      </div>
    );
  }

  // Detect mime type from base64 prefix
  const mime = docB64.startsWith('/9j/') ? 'image/jpeg'
    : docB64.startsWith('iVBOR') ? 'image/png'
    : docB64.startsWith('JVBE') ? 'application/pdf'
    : 'image/jpeg';
  const dataUrl = `data:${mime};base64,${docB64}`;
  const isPdf = mime === 'application/pdf';

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          padding: '6px 12px',
          background: '#007AFF',
          color: 'white',
          border: 'none',
          borderRadius: 6,
          fontSize: 12,
          cursor: 'pointer',
        }}
      >
        Ver {title}
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 2000, cursor: 'zoom-out',
          }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }}>
            <button
              onClick={() => setOpen(false)}
              style={{
                position: 'absolute', top: -36, right: 0,
                background: 'transparent', border: 'none',
                color: 'white', fontSize: 24, cursor: 'pointer', fontWeight: 700,
              }}
            >X</button>
            <div style={{ fontSize: 13, color: '#ccc', marginBottom: 8, textAlign: 'center' }}>{title}</div>
            {isPdf ? (
              <iframe
                src={dataUrl}
                style={{ width: '80vw', height: '80vh', border: 'none', borderRadius: 8 }}
                title={title}
              />
            ) : (
              <img
                src={dataUrl}
                alt={title}
                style={{ maxWidth: '85vw', maxHeight: '80vh', borderRadius: 8, display: 'block' }}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default function AdminPage() {
  const [drivers, setDrivers] = useState<DriverData[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<DriverData | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const raw = typeof window !== "undefined" ? localStorage.getItem("movi:user") : null;
    const token = typeof window !== "undefined" ? localStorage.getItem("movi:token") : null;
    if (!raw || !token) {
      router.replace("/admin-login");
      return;
    }
    const user = JSON.parse(raw);
    if (user.role !== "ADMIN") {
      router.replace("/admin-login");
      return;
    }

    async function fetchDrivers() {
      setLoading(true);
      try {
        const res = await fetch(`${API_URL}/users?role=DRIVER&documentStatus=PENDING`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setDrivers(data);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }

    fetchDrivers();
  }, [router]);

  const approve = async (id: string) => {
    const token = localStorage.getItem("movi:token") || "";
    if (!window.confirm("¿Aprobar este conductor?")) return;
    try {
      const res = await fetch(`${API_URL}/users/${id}/approve`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setDrivers((prev) => prev.filter((d) => d.id !== id));
        setSelectedDriver(null);
      } else {
        const err = await res.json();
        alert("Error: " + (err.error || res.statusText));
      }
    } catch (e) {
      console.error(e);
      alert("Error al aprobar");
    }
  };

  const reject = async (id: string) => {
    if (!rejectReason.trim()) {
      alert("Debes ingresar un motivo para rechazar");
      return;
    }

    setRejecting(true);
    const token = localStorage.getItem("movi:token") || "";
    try {
      const res = await fetch(`${API_URL}/users/${id}/reject-documents`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: rejectReason }),
      });
      if (res.ok) {
        setDrivers((prev) => prev.filter((d) => d.id !== id));
        setSelectedDriver(null);
        setShowRejectModal(false);
        setRejectReason("");
        alert("Documentos rechazados. El conductor recibirá una notificación.");
      } else {
        const err = await res.json();
        alert("Error: " + (err.error || res.statusText));
      }
    } catch (e) {
      console.error(e);
      alert("Error al rechazar documentos");
    } finally {
      setRejecting(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      background: '#f5f5f7',
      color: '#333',
    }}>
      {/* Sidebar: lista de conductores */}
      <div style={{
        width: '300px',
        background: 'white',
        borderRight: '1px solid #ddd',
        overflowY: 'auto',
        padding: '20px',
      }}>
        <h2 style={{ margin: '0 0 20px 0', fontSize: 18, fontWeight: 600 }}>Conductores por Aprobar</h2>
        {loading && <div>Cargando...</div>}
        {!loading && drivers.length === 0 && (
          <div style={{ color: '#666', fontSize: 14 }}>No hay conductores pendientes.</div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {drivers.map((d) => (
            <div
              key={d.id}
              onClick={() => setSelectedDriver(d)}
              style={{
                padding: '12px',
                background: selectedDriver?.id === d.id ? '#007AFF' : '#f5f5f7',
                color: selectedDriver?.id === d.id ? 'white' : '#000',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              <div>{d.name}</div>
              <div style={{ fontSize: 11, opacity: 0.7 }}>{d.email}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Main: detalles del conductor */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '40px' }}>
        {selectedDriver ? (
          <div>
            <h1 style={{ margin: 0, fontSize: 28, marginBottom: 20 }}>{selectedDriver.name}</h1>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 30 }}>
              {/* Datos personales */}
              <div style={{ background: 'white', padding: 20, borderRadius: 12 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Datos Personales</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
                  <div><strong>Email:</strong> {selectedDriver.email}</div>
                  <div><strong>Teléfono:</strong> {selectedDriver.phone || 'N/A'}</div>
                  <div><strong>Tipo de Licencia:</strong> {selectedDriver.licenseType || 'N/A'}</div>
                  <div><strong>Número de Licencia:</strong> {selectedDriver.licenseNumber || 'N/A'}</div>
                </div>
              </div>

              {/* Datos del vehículo */}
              <div style={{ background: 'white', padding: 20, borderRadius: 12 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Vehículo</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
                  <div><strong>Placa:</strong> {selectedDriver.vehicle?.placa || 'N/A'}</div>
                  <div><strong>Marca:</strong> {selectedDriver.vehicle?.marca || 'N/A'}</div>
                  <div><strong>Modelo:</strong> {selectedDriver.vehicle?.modelo || 'N/A'}</div>
                  <div><strong>Color:</strong> {selectedDriver.vehicle?.color || 'N/A'}</div>
                  <div><strong>Año:</strong> {selectedDriver.vehicle?.year || 'N/A'}</div>
                  <div><strong>Capacidad:</strong> {selectedDriver.vehicle?.capacidad || 'N/A'} personas</div>
                </div>
              </div>
            </div>

            {/* Documentos */}
            <div style={{ background: 'white', padding: 20, borderRadius: 12, marginBottom: 30 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Documentos Requeridos</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
                <DocViewer title="Cédula Verde (Frente)" docB64={selectedDriver.docCedulaVerdeFront} />
                <DocViewer title="Cédula Verde (Dorso)" docB64={selectedDriver.docCedulaVerdeBack} />
                <DocViewer title="Licencia (Frente)" docB64={selectedDriver.docLicenseFront} />
                <DocViewer title="Licencia (Dorso)" docB64={selectedDriver.docLicenseBack} />
                <DocViewer title="Cédula (Frente)" docB64={selectedDriver.docCedulaFront} />
                <DocViewer title="Cédula (Dorso)" docB64={selectedDriver.docCedulaBack} />
                <DocViewer title="Certificado de Antecedentes" docB64={selectedDriver.docJudicialCert} />
              </div>
            </div>

            {/* Botones de acción */}
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => approve(selectedDriver.id)}
                style={{
                  padding: '12px 24px',
                  background: '#34C759',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >
                Aprobar Conductor
              </button>
              <button
                onClick={() => setShowRejectModal(true)}
                style={{
                  padding: '12px 24px',
                  background: '#FF3B30',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >
                Rechazar Documentos
              </button>
              <button
                onClick={() => setSelectedDriver(null)}
                style={{
                  padding: '12px 24px',
                  background: '#f5f5f7',
                  color: '#000',
                  border: 'none',
                  borderRadius: 8,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >
                Cerrar
              </button>
            </div>

            {/* Modal de rechazo */}
            {showRejectModal && (
              <div style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0,0,0,0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000,
              }}>
                <div style={{
                  background: 'white',
                  borderRadius: 12,
                  padding: 24,
                  maxWidth: 400,
                  width: '90%',
                }}>
                  <h2 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 600 }}>
                    Rechazar Documentos
                  </h2>
                  <p style={{ margin: '0 0 16px', color: '#666', fontSize: 14 }}>
                    Explica al conductor por qué sus documentos fueron rechazados.
                  </p>
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Ej: La foto de la licencia está borrosa, por favor vuelve a subir con mejor calidad."
                    style={{
                      width: '100%',
                      minHeight: 100,
                      padding: 12,
                      border: '1px solid #ddd',
                      borderRadius: 8,
                      fontSize: 14,
                      fontFamily: 'inherit',
                      boxSizing: 'border-box',
                      marginBottom: 16,
                    }}
                  />
                  <div style={{ display: 'flex', gap: 12 }}>
                    <button
                      onClick={() => reject(selectedDriver.id)}
                      disabled={rejecting}
                      style={{
                        flex: 1,
                        padding: '12px',
                        background: '#FF3B30',
                        color: 'white',
                        border: 'none',
                        borderRadius: 8,
                        fontWeight: 600,
                        cursor: rejecting ? 'not-allowed' : 'pointer',
                        fontSize: 14,
                        opacity: rejecting ? 0.6 : 1,
                      }}
                    >
                      {rejecting ? 'Rechazando...' : 'Rechazar'}
                    </button>
                    <button
                      onClick={() => {
                        setShowRejectModal(false);
                        setRejectReason("");
                      }}
                      style={{
                        flex: 1,
                        padding: '12px',
                        background: '#f5f5f7',
                        color: '#000',
                        border: 'none',
                        borderRadius: 8,
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontSize: 14,
                      }}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ color: '#666', fontSize: 16, textAlign: 'center', marginTop: 40 }}>
            Selecciona un conductor para ver sus detalles
          </div>
        )}
      </div>
    </div>
  );
}
