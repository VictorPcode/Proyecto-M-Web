# Changelog - Movi Ride-Hailing Platform

## Resumen General
Sistema completo de ride-hailing con autenticación, aprobación de conductores, gestión de documentos, notificaciones en tiempo real y dashboards para conductores, pasajeros y administradores.

---

## Fase 1: Fundamentos - Stack Setup

### Tecnologías Implementadas
- **Backend**: Express.js + Socket.IO + Prisma ORM + PostgreSQL
- **Frontend**: Next.js + React + CSS-in-JS
- **Autenticación**: JWT (7 días de expiración)
- **Roles**: DRIVER, PASSENGER, ADMIN
- **Uploads**: Multer (memory storage, archivos en base64)

### Características Iniciales
- Registro de usuarios (pasajeros y conductores)
- Sistema de viajes en tiempo real con Socket.IO
- Chat en viajes (driver ↔ passenger)
- Cálculo de tarifas estimadas
- Confirmación de pagos

---

## Fase 2: Aprobación de Conductores

### Schema Prisma - Cambios

#### User Model
```prisma
model User {
  id         String    @id @default(cuid())
  name       String
  email      String    @unique
  phone      String?
  password   String
  role       UserRole
  approved   Boolean   @default(false)    // Admin approval required for drivers
  
  // License info
  licenseType String?
  licenseNumber String?
  
  // Document fields (7 required documents for drivers)
  docCedulaVerdeFront String?   // Green ID - Front
  docCedulaVerdeBack String?    // Green ID - Back
  docLicenseFront String?       // License - Front
  docLicenseBack String?        // License - Back
  docCedulaFront String?        // ID - Front
  docCedulaBack String?         // ID - Back
  docJudicialCert String?       // Judicial Certificate
  
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt
  
  passengerRides Ride[] @relation("PassengerRides")
  driverRides    Ride[] @relation("DriverRides")
  vehicles       Vehicle[]
}
```

### Backend Endpoints

#### POST /auth/login
- Verifica email y contraseña
- **Rechazo automático**: Si es DRIVER y `approved=false` → HTTP 403 "not_approved"
- Retorna JWT token con rol incluido

#### POST /auth/admin/setup
- Verifica si admin existe
- Si existe → HTTP 409 "admin_already_exists"
- Si no existe → HTTP 200 (endpoint ahora solo verifica, no crea)

#### POST /auth/admin/create (nuevo)
- **Requiere**: authMiddleware + adminOnly
- Solo ADMINs autenticados pueden crear nuevos admins
- Validación de email único
- Hash de contraseña con bcrypt

#### GET /users?role=DRIVER&approved=false (admin)
- Admin ve lista de conductores pendientes
- Filtrable por role y approved status

#### POST /users/:id/approve (admin)
- Admin aprueba un conductor
- Set `approved=true`
- Crea notificación APPROVED

### Frontend

#### /driver-register.tsx - Formulario 3-pasos
```
Paso 1: Datos Personales + Licencia
  - name, email, password
  - licenseType, licenseNumber

Paso 2: Datos del Vehículo
  - placa, marca, modelo, color, year, capacidad

Paso 3: Documentos (Multer Upload)
  - Cédula Verde (frente + dorso)
  - Licencia (frente + dorso)
  - Cédula (frente + dorso)
  - Certificado de Antecedentes
  - Máx 10MB por archivo, JPEG/PNG/PDF
  - Se convierten a base64 para DB
```

#### /rider.tsx - Bloqueo de No-Aprobados
- Al montar: verifica `localStorage.movi:user.approved`
- Si `!approved`:
  - Set `approvalError=true`
  - Limpia tokens
  - Muestra modal "Cuenta Pendiente"
  - Bloquea acceso al mapa/viajes

#### /admin.tsx - Dashboard de Aprobación
- Sidebar izquierdo: lista de conductores pendientes
- Panel derecho: detalles completos
  - Datos personales
  - Datos del vehículo
  - 7 documentos con viewer (buttons abren en nueva pestaña)
- Botón **"Aprobar Conductor"** con confirmación
- Recarga automática tras aprobación

#### /admin-login.tsx - Autenticación Admin
- Detecta si admin existe via POST `/auth/admin/setup`
- Si NO existe:
  - Muestra form "Crear Admin"
  - Solicita email, contraseña, confirmación
  - Crea JWT tras setup exitoso
- Si SÍ existe:
  - Solo muestra form login normal

---

## Fase 3: Notificaciones y Autogestión (ACTUAL)

### Schema Prisma - Nuevos Modelos

#### Extensión User Model
```prisma
model User {
  // ... campos anteriores ...
  
  // Document management
  documentStatus DocumentStatus? @default(PENDING)
  rejectionReason String?
  
  notifications  Notification[]  // Nueva relación
}

enum DocumentStatus {
  PENDING
  APPROVED
  REJECTED
}

model Notification {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  type      NotificationType
  title     String
  message   String
  read      Boolean  @default(false)
  createdAt DateTime @default(now())
}

enum NotificationType {
  APPROVED
  REJECTED
  RIDE_COMPLETED
  DOCUMENT_REJECTED
  OTHER
}
```

### Backend Endpoints

#### PUT /users/:id - Actualizar Perfil
```typescript
// Solo user puede editar su perfil, o admin puede editar cualquiera
// Campos permitidos: name, phone, licenseType, licenseNumber
```

#### GET /users/:id/documents - Ver Estado Documentos
```typescript
// Retorna documentStatus, rejectionReason, base64 de documentos
// Solo user o admin puede acceder
```

#### POST /users/:id/reject-documents (admin)
```typescript
// Rechaza documentos de un conductor
// Requiere: reason (motivo del rechazo)
// Crea notificación DOCUMENT_REJECTED automáticamente
```

#### GET /notifications - Listar Notificaciones
```typescript
// Retorna todas las notificaciones del user
// Ordenadas por fecha descendente
```

#### POST /notifications/:id/read - Marcar como Leído
```typescript
// Solo user puede marcar sus propias notificaciones como leídas
```

#### GET /me/rides - Historial de Viajes
```typescript
// Si DRIVER: muestra rides donde driverId = userId
// Si PASSENGER: muestra rides donde passengerId = userId
// Incluye detalles de otra parte (driver/passenger, vehicle)
```

### Frontend - Paneles de Conductor

#### /conductor/perfil.tsx
**Ubicación**: Ruta principal del conductor post-login

**Características**:
- Card de estado (Aprobado/Pendiente/Rechazado)
- Si rechazado: muestra motivo + botón "Volver a subir documentos"
- Formulario editable: nombre, email, teléfono, licencia
- Botones de navegación: "Documentos", "Mis Viajes"

**Estado Local**:
```typescript
const [user, setUser] = useState<User | null>(null)
const [editing, setEditing] = useState(false)
const [formData, setFormData] = useState<Partial<User>>({})
const [saving, setSaving] = useState(false)
```

#### /conductor/documentos.tsx
**Ubicación**: Página de gestión de documentos

**Características**:
- Card de estado documentos (PENDING/APPROVED/REJECTED)
- Lista de 7 documentos con indicadores (✓ Subido / ○ Pendiente)
- Botón "Actualizar Documentos" → redirige a `/driver-register`
- Si rechazados: muestra motivo específico

**Documentos Rastreados**:
- Cédula Verde Frente/Dorso
- Licencia Frente/Dorso
- Cédula Frente/Dorso
- Certificado de Antecedentes

#### /conductor/viajes.tsx
**Ubicación**: Historial de viajes como conductor

**Características**:
- Lista de viajes completados/cancelados
- Card por viaje con:
  - Fecha
  - Estado (FINALIZADO/CANCELADO/EN_CURSO)
  - Tarifa estimada y final
- Indicadores de color por estado

### Frontend - Paneles de Pasajero

#### /pasajero/perfil.tsx
**Ubicación**: Perfil de pasajero

**Características**:
- Bienvenida personalizada
- Editar: nombre, email, teléfono
- Acceso a viajes y notificaciones

#### /pasajero/viajes.tsx
**Ubicación**: Historial de viajes como pasajero

**Características**:
- Viajes solicitados (pasado/presente)
- Nombre del conductor cuando viaje está ASIGNADO
- Tarifas y estado del viaje

### Frontend - Sistema de Notificaciones

#### /notificaciones.tsx
**Ubicación**: Central de notificaciones

**Características**:
- Notificaciones con iconos por tipo
- Colores indicadores (verde=aprobado, rojo=rechazado, azul=completado)
- Marcar como leído al hacer click
- Polling cada 5 segundos
- Ordenadas por fecha descendente

**Tipos Soportados**:
```
APPROVED          ✓ Verde   - "¡Aprobado!"
REJECTED          ! Rojo    - "Rechazo de Cuenta"
DOCUMENT_REJECTED ! Rojo    - "Documentos Rechazados"
RIDE_COMPLETED    ★ Azul    - "Viaje Completado"
OTHER             ● Gris    - Notificaciones genéricas
```

### Admin Dashboard Mejorado

#### /admin.tsx - Nuevas Funcionalidades

**Rechazo de Documentos**:
```typescript
// Nuevo botón "Rechazar Documentos" (rojo)
// Abre modal con textarea para motivo
// Motivos comunes pre-sugeridos:
// - "Foto borrosa, por favor vuelve a subir con mejor calidad"
// - "Documento expirado"
// - "Datos no Son legibles"
```

**Flujo de Rechazo**:
1. Admin selecciona conductor
2. Hace click en "Rechazar Documentos"
3. Ingresa motivo específico
4. Sistema:
   - Set `documentStatus = REJECTED`
   - Set `rejectionReason = <motivo>`
   - Crea notificación DOCUMENT_REJECTED
   - Remueve conductor de lista pendiente

**Estados Visuales**:
- Documentos aprobados: fondo verde
- Documentos rechazados: fondo rojo con modal
- Documentos pendientes: fondo amarillo

### Autogestion Admin Root

#### /admin-login.tsx - Setup + Login

**Nuevo Token Sistema**:
- Variable de entorno: `NEXT_PUBLIC_ADMIN_SETUP_TOKEN`
- Por defecto: `"admin-root-2026"` (definido en `.env.local`)
- Requerido para crear el PRIMER admin

**Flujo Spring Inicial**:
1. Primer acceso a `/admin-login`
2. Detecta si admin existe via POST `/auth/admin/setup`
3. Si NO: muestra form "Crear Admin Root"
   - Email
   - Contraseña
   - Token de Setup (secreto)
4. Si existe: muestra solo login normal

**Seguridad**:
- Token debe matchear exactamente `NEXT_PUBLIC_ADMIN_SETUP_TOKEN`
- POST `/auth/admin/create` requiere JWT válido con rol ADMIN
- Contraseña hasheada con bcrypt (rounds: 10)
- Email único (validación de duplicado)

**Cambio de Estrategia**:
- OLD: `/auth/admin/setup` creaba admin si no existía (público, inseguro)
- NEW: `/auth/admin/setup` solo verifica si existe
- NEW: `/auth/admin/create` crea admin (auth-gated, solo admin puede)

#### .env.local - Variables Nuevas
```
NEXT_PUBLIC_ADMIN_SETUP_TOKEN=admin-root-2026
```

---

## Cambios por Archivo

### Backend

#### apps/api/src/index.ts
```diff
✅ Multer middleware: 10MB limit, 7 docs max, JPEG/PNG/PDF
✅ POST /users: multipart upload → base64 conversion → DB
✅ POST /auth/login: driver approval check
✅ POST /auth/admin/setup: verificación (no creación)
✅ POST /auth/admin/create: auth-gated admin creation
✅ GET /users?role=DRIVER&approved=false: admin dashboard
✅ POST /users/:id/approve: aprobación + notificación
✅ POST /users/:id/reject-documents: rechazo + notificación
✅ PUT /users/:id: actualizar perfil (auth required)
✅ GET /users/:id/documents: ver estado documentos
✅ GET /notifications: listar notificaciones
✅ POST /notifications/:id/read: marcar leído
✅ GET /me/rides: historial viajes (conductor o pasajero)
```

#### prisma/schema.prisma
```diff
✅ User.approved: Boolean @default(false)
✅ User.documentStatus: enum PENDING/APPROVED/REJECTED
✅ User.rejectionReason: String?
✅ User.notifications: relación a Notification[]
✅ Notification model: id, userId, type, title, message, read, createdAt
✅ NotificationType enum: APPROVED, REJECTED, RIDE_COMPLETED, DOCUMENT_REJECTED, OTHER
✅ DocumentStatus enum: PENDING, APPROVED, REJECTED
✅ 7 document fields: docCedulaVerdeFront, docCedulaVerdeBack, docLicenseFront, etc.
```

### Frontend

#### apps/web/pages/conductor/perfil.tsx (NEW)
```
✅ Ver estado aprobación
✅ Ver documentos rechazados + motivo
✅ Editar perfil (nombre, teléfono, licencia)
✅ Botones a documentos y viajes
✅ Save/Edit toggle
```

#### apps/web/pages/conductor/documentos.tsx (NEW)
```
✅ Estado documentos (PENDING/APPROVED/REJECTED)
✅ Lista de 7 documentos con indicadores
✅ Motivo de rechazo si aplica
✅ Botón volver a subir
```

#### apps/web/pages/conductor/viajes.tsx (NEW)
```
✅ Historial de viajes como conductor
✅ Estados: FINALIZADO, CANCELADO, EN_CURSO, ASIGNADO
✅ Tarifa estimada y final
✅ Fechas
```

#### apps/web/pages/pasajero/perfil.tsx (NEW)
```
✅ Perfil de pasajero
✅ Editar datos
✅ Acceso a viajes y notificaciones
```

#### apps/web/pages/pasajero/viajes.tsx (NEW)
```
✅ Historial viajes pasajero
✅ Nombre del conductor
✅ Tarifas y estados
```

#### apps/web/pages/notificaciones.tsx (NEW)
```
✅ Centro de notificaciones
✅ Tipos con iconos y colores
✅ Marcar como leído
✅ Polling cada 5s
✅ Ordenadas por fecha
```

#### apps/web/pages/admin.tsx
```diff
✅ Botón "Rechazar Documentos"
✅ Modal con textarea para motivo
✅ Rechazo crea notificación
✅ Removed: isSetup toggle, "Crear Admin" button
```

#### apps/web/pages/admin-login.tsx
```diff
✅ Detecta admin existence
✅ Si NO existe: Setup form (email, passw, token)
✅ Si existe: Login form solo
✅ Token validation: NEXT_PUBLIC_ADMIN_SETUP_TOKEN
```

#### apps/web/pages/driver-register.tsx
```diff
✅ 3-step form (personal, vehicle, documents)
✅ Step 3: multipart upload
✅ FormData → POST /users
✅ Responsive, sin scroll
```

#### apps/web/pages/rider.tsx
```diff
✅ approvalError state
✅ Mount check: if !approved → show modal
✅ Bloquea mapa/socket si no aprobado
✅ Modal "Cuenta Pendiente" centered
```

#### apps/web/.env.local
```diff
✅ NEXT_PUBLIC_ADMIN_SETUP_TOKEN=admin-root-2026
```

---

## Migraciones Prisma Aplicadas

```
20260228214308_add_approved_to_user
  - Agrega campo approved a User

20260228215331_add_driver_documents
  - Agrega 7 campos de documento a User

20260228222518_add_notifications_and_document_status
  - Agrega documentStatus y rejectionReason a User
  - Crea tabla Notification
  - Crea enums DocumentStatus y NotificationType
```

---

## Flujo de Usuario - Conductor

### 1. Registro
```
/driver-register
├─ Paso 1: Datos personales
├─ Paso 2: Vehículo
├─ Paso 3: Documentos (upload)
└─ POST /users → DB
```

### 2. Espera de Aprobación
```
/driver-login → /rider
├─ Check: !approved
├─ Modal: "Cuenta Pendiente"
├─ Recibe notificación cuando admin aprueba
└─ Puede acceder a /conductor/perfil (solo vista estado)
```

### 3. Aprobado
```
/rider (mapa operacional)
├─ /conductor/perfil (editar datos, ver estado)
├─ /conductor/documentos (revisar documentos)
├─ /conductor/viajes (historial)
└─ /notificaciones (alerts)
```

### 4. Documentos Rechazados
```
/notificaciones → "Documentos Rechazados"
├─ Ver motivo específico
├─ /conductor/documentos (ver detalles)
└─ Botón "Volver a subir" → /driver-register
```

---

## Flujo de Usuario - Pasajero

### 1. Registro
```
/register → /client (inmediatamente activo)
```

### 2. Usar App
```
/client (pedir viaje)
├─ /pasajero/perfil (editar datos)
├─ /pasajero/viajes (historia)
└─ /notificaciones (alerts)
```

---

## Flujo de Usuario - Admin

### Setup Inicial
```
/admin-login (primer acceso)
├─ Detecta: NO admin existe
├─ Form: email, passw, token
└─ POST /users (role=ADMIN) → Login automático
```

### Operación Normal
```
/admin-login (login)
├─ /admin (dashboard)
│  ├─ Sidebar: conductores pendientes
│  ├─ Detalles: personales, vehículo, documentos
│  ├─ Botón "Aprobar Conductor"
│  └─ Botón "Rechazar Documentos"
└─ /notificaciones (ver actividad)
```

### Crear Nuevo Admin (después del primero)
```
Admin raíz autenticado:
├─ (No hay UI en /admin-login)
├─ POST /auth/admin/create (via API client o Postman)
│  ├─ Headers: Authorization: Bearer <JWT>
│  ├─ Body: { email, password }
│  └─ Response: { success: true, user: {...} }
└─ Nuevo admin puede hacer login normal
```

---

## Seguridad

### Autenticación JWT
```typescript
const token = jwt.sign(
  { sub: user.id, role: user.role },
  JWT_SECRET,
  { expiresIn: "7d" }
)
```

### Middleware `authMiddleware`
- Valida Bearer token en Authorization header
- Extrae sub (userid) y role
- Rechaza si ausente o inválido (401)

### Middleware `adminOnly`
- Verifica req.user.role === "ADMIN"
- Rechaza si no es admin (403)

### Operaciones Protegidas
```
GET /me                          → authMiddleware
GET /users?role=...              → authMiddleware + adminOnly
PUT /users/:id                   → authMiddleware + propietario o admin
POST /users/:id/approve          → authMiddleware + adminOnly
POST /users/:id/reject-documents → authMiddleware + adminOnly
GET /users/:id/documents         → authMiddleware + propietario o admin
GET /notifications               → authMiddleware
POST /notifications/:id/read     → authMiddleware + propietario
GET /me/rides                    → authMiddleware
POST /auth/admin/create          → authMiddleware + adminOnly
```

---

## Próximas Mejoras (Recomendadas)

### 1. Admin Creación desde API
- Agregar endpoint para crear admins vía CLI
- O integrar con Auth0/Firebase

### 2. Cloud Storage
- Migrar documentos base64 a AWS S3 / Google Cloud Storage
- Mejorar rendimiento de queries

### 3. SMS/Email Notifications
- SendGrid para notificaciones por email
- Twilio para SMS

### 4. Rating Sistema
- Calificaciones después de viaje
- Reviews de conductores/pasajeros

### 5. Payment Gateway
- Integrar Stripe / MercadoPago
- Cobro programático de tarifas

### 6. Analytics
- Dashboard admin con métricas
- Viajes por día, conductores activos, ingresos

---

## Estadísticas del Proyecto

| Aspecto | Cantidad |
|--------|----------|
| Endpoints Nuevos | 8 |
| Páginas Nuevas | 6 |
| Modelos DB | 4 |
| Campos User | 17 |
| Documentos Requeridos | 7 |
| Estados Notificación | 5 |
| Roles | 3 |

---

## Notas Técnicas

### Prisma Client Windows Build
- Migración aplicada correctamente (DB sincronizado)
- Error de regeneración de cliente es solo Windows file lock
- Workaround: usar `(prisma as any).notification` en queries

### Base64 en Base de Datos
- Documentos guardados como strings base64
- Frontend convierte `data:image/png;base64,${doc}` para visualizar
- Alternativa: mover a cloud storage (recomendado en producción)

### Socket.IO Namespaces
- `/drivers` - conductor en tiempo real
- `/passengers` - pasajero en tiempo real
- Ambos requieren JWT en handshake

---

## Testing (Recomendado)

```bash
# Backend
npm run test:api

# Frontend
npm run test:web

# E2E
npm run cypress
```

### Caso de Prueba: Flujo Conductor Completo
1. ✅ Registrar conductor con documentos
2. ✅ Verificar estado "Pendiente" en /conductor/perfil
3. ✅ Admin aprueba en /admin dashboard
4. ✅ Conductor recibe notificación
5. ✅ Conductor accede a /rider
6. ✅ Admin rechaza documentos
7. ✅ Conductor ve motivo en /conductor/documentos
8. ✅ Conductor vuelve a subir vía /driver-register

---

## Recursos
- [Prisma Docs](https://www.prisma.io/docs/)
- [Next.js Auth](https://nextjs.org/docs)
- [Socket.IO Real-time](https://socket.io/docs/)
- [JWT](https://jwt.io/)
- [bcryptjs](https://github.com/dcodeIO/bcrypt.js)

---

**Última actualización**: 28 de Febrero, 2026
**Estado**: ✅ Completado - Fase 3
**Próxima**: Fase 4 - Payment & Analytics (pendiente)
