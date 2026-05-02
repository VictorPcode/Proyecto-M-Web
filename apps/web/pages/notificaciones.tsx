import { useState, useEffect } from "react";
import { useRouter } from "next/router";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export default function Notificaciones() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetchNotifications();
    // Poll every 5 seconds for new notifications
    const interval = setInterval(fetchNotifications, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchNotifications = async () => {
    try {
      const token = localStorage.getItem("movi:token");
      const res = await fetch(`${API_URL}/notifications`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setNotifications(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (id: string) => {
    try {
      const token = localStorage.getItem("movi:token");
      await fetch(`${API_URL}/notifications/${id}/read`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchNotifications();
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: "40px 24px", textAlign: "center", color: "#666" }}>
        Cargando notificaciones...
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
          Notificaciones
        </h1>
      </div>

      {notifications.length === 0 ? (
        <div style={{
          padding: "40px 24px",
          textAlign: "center",
          color: "#999",
        }}>
          No tienes notificaciones.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {notifications.map((notif) => (
            <NotificationCard
              key={notif.id}
              notification={notif}
              onRead={() => markAsRead(notif.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NotificationCard({
  notification,
  onRead,
}: {
  notification: Notification;
  onRead: () => void;
}) {
  const getIcon = (type: string) => {
    switch (type) {
      case "APPROVED":
        return "✓";
      case "REJECTED":
      case "DOCUMENT_REJECTED":
        return "!";
      case "RIDE_COMPLETED":
        return "★";
      default:
        return "●";
    }
  };

  const getColor = (type: string) => {
    switch (type) {
      case "APPROVED":
        return { bg: "#d1fae5", icon: "#10b981" };
      case "REJECTED":
      case "DOCUMENT_REJECTED":
        return { bg: "#fee2e2", icon: "#ef4444" };
      case "RIDE_COMPLETED":
        return { bg: "#dbeafe", icon: "#3b82f6" };
      default:
        return { bg: "#f3f4f6", icon: "#9ca3af" };
    }
  };

  const color = getColor(notification.type);
  const date = new Date(notification.createdAt).toLocaleDateString("es-PY");

  return (
    <div
      onClick={!notification.read ? onRead : undefined}
      style={{
        padding: "12px",
        border: "1px solid #e5e7eb",
        borderRadius: "8px",
        background: !notification.read ? "#f9fafb" : "white",
        cursor: !notification.read ? "pointer" : "default",
        transition: "all 0.2s",
      }}
      onMouseEnter={(e) => {
        if (!notification.read) {
          (e.currentTarget as HTMLElement).style.background = "#f3f4f6";
        }
      }}
      onMouseLeave={(e) => {
        if (!notification.read) {
          (e.currentTarget as HTMLElement).style.background = "#f9fafb";
        }
      }}
    >
      <div style={{
        display: "flex",
        gap: "12px",
        alignItems: "start",
      }}>
        <div style={{
          fontSize: "18px",
          color: color.icon,
          minWidth: "24px",
          textAlign: "center",
        }}>
          {getIcon(notification.type)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: "13px",
            fontWeight: "600",
            marginBottom: "4px",
          }}>
            {notification.title}
          </div>
          <div style={{
            fontSize: "13px",
            color: "#666",
            marginBottom: "6px",
            wordBreak: "break-word",
          }}>
            {notification.message}
          </div>
          <div style={{
            fontSize: "12px",
            color: "#999",
          }}>
            {date}
            {!notification.read && (
              <span style={{
                marginLeft: "8px",
                display: "inline-block",
                width: "8px",
                height: "8px",
                background: "#667eea",
                borderRadius: "50%",
              }} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
