import { useState, useEffect } from "react";
import { useRouter } from "next/router";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface DocumentStatus {
  documentStatus?: string;
  rejectionReason?: string;
  docCedulaVerdeFront?: string;
  docCedulaVerdeBack?: string;
  docLicenseFront?: string;
  docLicenseBack?: string;
  docCedulaFront?: string;
  docCedulaBack?: string;
  docJudicialCert?: string;
}

export default function DocumentosConductor() {
  const [docs, setDocs] = useState<DocumentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    try {
      const token = localStorage.getItem("movi:token");
      const userId = JSON.parse(localStorage.getItem("movi:user") || "{}")?.id;
      
      const res = await fetch(`${API_URL}/users/${userId}/documents`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setDocs(data);
    } catch (err) {
      console.error(err);
      alert("Error al cargar documentos");
      router.push("/conductor/perfil");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: "40px 24px", textAlign: "center", color: "#666" }}>
        Cargando documentos...
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
        alignItems: "center",
        marginBottom: "24px",
        gap: "12px",
      }}>
        <button
          onClick={() => router.back()}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: "20px",
          }}
        >
          ← 
        </button>
        <h1 style={{ fontSize: "24px", fontWeight: "600", margin: 0 }}>
          Mis Documentos
        </h1>
      </div>

      {/* Status Card */}
      <StatusCard status={docs?.documentStatus} reason={docs?.rejectionReason} />

      {/* Documents */}
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <DocumentItem name="Cédula Verde - Frente" hasDoc={!!docs?.docCedulaVerdeFront} />
        <DocumentItem name="Cédula Verde - Dorso" hasDoc={!!docs?.docCedulaVerdeBack} />
        <DocumentItem name="Licencia - Frente" hasDoc={!!docs?.docLicenseFront} />
        <DocumentItem name="Licencia - Dorso" hasDoc={!!docs?.docLicenseBack} />
        <DocumentItem name="Cédula - Frente" hasDoc={!!docs?.docCedulaFront} />
        <DocumentItem name="Cédula - Dorso" hasDoc={!!docs?.docCedulaBack} />
        <DocumentItem name="Certificado de Antecedentes" hasDoc={!!docs?.docJudicialCert} />
      </div>

      <button
        onClick={() => router.push("/driver-register")}
        disabled={uploading}
        style={{
          marginTop: "24px",
          width: "100%",
          padding: "12px",
          background: "#667eea",
          color: "white",
          border: "none",
          borderRadius: "8px",
          cursor: "pointer",
          fontWeight: "600",
          fontSize: "14px",
        }}
      >
        {uploading ? "Subiendo..." : "Actualizar Documentos"}
      </button>
    </div>
  );
}

function StatusCard({ status, reason }: { status?: string; reason?: string }) {
  let bgColor = "#f0f9ff";
  let borderColor = "#10b981";
  let icon = "✓";
  let title = "Documentos Aprobados";
  let message = "Tus documentos han sido verificados correctamente.";

  if (status === "PENDING") {
    bgColor = "#fef3c7";
    borderColor = "#f59e0b";
    icon = "⏱";
    title = "Pendiente de Revisión";
    message = "Los documentos están siendo revisados por un administrador.";
  } else if (status === "REJECTED") {
    bgColor = "#fee2e2";
    borderColor = "#ef4444";
    icon = "✗";
    title = "Documentos Rechazados";
    message = reason || "Por favor, vuelve a subir los documentos.";
  }

  return (
    <div style={{
      padding: "16px",
      background: bgColor,
      borderLeft: `4px solid ${borderColor}`,
      borderRadius: "8px",
      marginBottom: "24px",
    }}>
      <div style={{ fontSize: "14px", fontWeight: "600", marginBottom: "4px" }}>
        {icon} {title}
      </div>
      <div style={{ fontSize: "13px", color: "#666" }}>
        {message}
      </div>
    </div>
  );
}

function DocumentItem({ name, hasDoc }: { name: string; hasDoc: boolean }) {
  return (
    <div style={{
      padding: "12px",
      border: "1px solid #e5e7eb",
      borderRadius: "8px",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
    }}>
      <span style={{ fontSize: "14px" }}>{name}</span>
      <span style={{
        fontSize: "12px",
        padding: "4px 8px",
        background: hasDoc ? "#d1fae5" : "#f3f4f6",
        color: hasDoc ? "#065f46" : "#6b7280",
        borderRadius: "4px",
        fontWeight: "500",
      }}>
        {hasDoc ? "✓ Subido" : "○ Pendiente"}
      </span>
    </div>
  );
}
