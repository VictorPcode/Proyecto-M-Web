import { useState, useEffect } from "react";
import { useRouter } from "next/router";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  licenseType?: string;
  licenseNumber?: string;
  approved: boolean;
  documentStatus?: string;
  rejectionReason?: string;
}

export default function PerfilConductor() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<User>>({});
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const token = localStorage.getItem("movi:token");
      const res = await fetch(`${API_URL}/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setUser(data);
      setFormData(data);
    } catch (err) {
      console.error(err);
      router.push("/driver-login");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const token = localStorage.getItem("movi:token");
      const res = await fetch(`${API_URL}/users/${user.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });
      if (!res.ok) throw new Error("Failed to save");
      const updated = await res.json();
      setUser(updated);
      setEditing(false);
      alert("Perfil actualizado");
    } catch (err) {
      console.error(err);
      alert("Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{
        padding: "40px 24px",
        textAlign: "center",
        color: "#666",
      }}>
        Cargando...
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{
        padding: "40px 24px",
        textAlign: "center",
        color: "#666",
      }}>
        Error al cargar perfil
      </div>
    );
  }

  return (
    <div style={{
      maxWidth: "600px",
      margin: "0 auto",
      padding: "24px",
    }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "24px",
      }}>
        <h1 style={{ fontSize: "24px", fontWeight: "600", margin: 0 }}>
          Mi Perfil
        </h1>
        <button
          onClick={() => {
            if (editing) {
              handleSave();
            } else {
              setEditing(true);
            }
          }}
          disabled={saving}
          style={{
            padding: "8px 16px",
            background: "#667eea",
            color: "white",
            border: "none",
            borderRadius: "8px",
            cursor: "pointer",
            fontWeight: "500",
          }}
        >
          {editing ? (saving ? "Guardando..." : "Guardar") : "Editar"}
        </button>
      </div>

      {/* Status Card */}
      <div style={{
        padding: "16px",
        background: user.approved ? "#f0f9ff" : "#fff3cd",
        borderLeft: `4px solid ${user.approved ? "#10b981" : "#f59e0b"}`,
        borderRadius: "8px",
        marginBottom: "24px",
      }}>
        <div style={{ fontSize: "14px", fontWeight: "600", marginBottom: "4px" }}>
          {user.approved ? "✓ Aprobado" : "⏱ Pendiente de Aprobación"}
        </div>
        <div style={{ fontSize: "13px", color: "#666" }}>
          {user.approved
            ? "Tu cuenta está aprobada. Puedes aceptar viajes."
            : "Tu solicitud está siendo revisada por un administrador."}
        </div>
      </div>

      {/* Document Status */}
      {user.documentStatus === "REJECTED" && (
        <div style={{
          padding: "16px",
          background: "#fee2e2",
          borderLeft: "4px solid #ef4444",
          borderRadius: "8px",
          marginBottom: "24px",
        }}>
          <div style={{ fontSize: "14px", fontWeight: "600", marginBottom: "4px", color: "#991b1b" }}>
            Documentos Rechazados
          </div>
          <div style={{ fontSize: "13px", color: "#7f1d1d" }}>
            {user.rejectionReason}
          </div>
          <button
            onClick={() => router.push("/conductor/documentos")}
            style={{
              marginTop: "8px",
              padding: "6px 12px",
              background: "#ef4444",
              color: "white",
              border: "none",
              borderRadius: "6px",
              fontSize: "12px",
              cursor: "pointer",
              fontWeight: "500",
            }}
          >
            Volver a subir documentos
          </button>
        </div>
      )}

      {/* Form Fields */}
      <div style={{
        display: "flex",
        flexDirection: "column",
        gap: "16px",
      }}>
        <FormField
          label="Nombre"
          value={formData.name || ""}
          onChange={(v) => setFormData({ ...formData, name: v })}
          disabled={!editing}
        />
        <FormField
          label="Email"
          value={user.email}
          disabled
        />
        <FormField
          label="Teléfono"
          value={formData.phone || ""}
          onChange={(v) => setFormData({ ...formData, phone: v })}
          disabled={!editing}
        />
        <FormField
          label="Tipo de Licencia"
          value={formData.licenseType || ""}
          onChange={(v) => setFormData({ ...formData, licenseType: v })}
          disabled={!editing}
        />
        <FormField
          label="Número de Licencia"
          value={formData.licenseNumber || ""}
          onChange={(v) => setFormData({ ...formData, licenseNumber: v })}
          disabled={!editing}
        />
      </div>

      {/* Navigation */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "12px",
        marginTop: "24px",
      }}>
        <NavButton
          label="Documentos"
          onClick={() => router.push("/conductor/documentos")}
        />
        <NavButton
          label="Mis Viajes"
          onClick={() => router.push("/conductor/viajes")}
        />
      </div>
    </div>
  );
}

function FormField({ label, value, onChange, disabled = false }: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <label style={{ display: "block", fontSize: "13px", fontWeight: "600", marginBottom: "6px" }}>
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        disabled={disabled}
        style={{
          width: "100%",
          padding: "10px 12px",
          border: "1px solid #e5e7eb",
          borderRadius: "8px",
          fontSize: "14px",
          backgroundColor: disabled ? "#f9fafb" : "white",
          color: disabled ? "#999" : "black",
          boxSizing: "border-box",
        }}
      />
    </div>
  );
}

function NavButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "12px",
        background: "white",
        border: "1px solid #e5e7eb",
        borderRadius: "8px",
        cursor: "pointer",
        fontSize: "14px",
        fontWeight: "500",
        transition: "all 0.2s",
      }}
      onMouseEnter={(e) => {
        (e.target as HTMLElement).style.background = "#f9fafb";
      }}
      onMouseLeave={(e) => {
        (e.target as HTMLElement).style.background = "white";
      }}
    >
      {label}
    </button>
  );
}
