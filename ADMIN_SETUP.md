# Configuración del Primer Administrador

Esta guía explica cómo crear la primera cuenta de administrador en el sistema Movi.

---

## Requisitos Previos

1.  Base de datos PostgreSQL configurada y en ejecución
2.  Migraciones de Prisma aplicadas (`npx prisma migrate dev`)
3.  Servidor backend ejecutándose (`npm run dev` en `/apps/api`)
4.  Aplicación frontend ejecutándose (`npm run dev` en `/apps/web`)

---

## Opción 1: Interfaz Web (Recomendado)

### Paso 1: Configurar el Token de Setup

El token de setup está definido en el archivo `.env.local` de la aplicación web:

**Ubicación**: `/apps/web/.env.local`

```bash
NEXT_PUBLIC_ADMIN_SETUP_TOKEN=admin-root-2026
```

>  **Importante**: Este token es el que deberás usar para crear el primer admin. Puedes cambiarlo a cualquier valor que prefieras antes de iniciar el proceso.

### Paso 2: Acceder a la Página de Login Admin

1. Abre tu navegador
2. Navega a: `http://localhost:3000/admin-login`

### Paso 3: Detectar Modo Setup

La aplicación detectará automáticamente si existe un administrador en el sistema:

-  **Si NO existe ningún admin**: Mostrará el formulario "Crear Admin Root"
-  **Si YA existe un admin**: Solo mostrará el formulario de login normal

### Paso 4: Completar el Formulario

Si no existe ningún admin, verás un formulario con 3 campos:

```
┌─────────────────────────────────────┐
│  Crear Admin Root                   │
├─────────────────────────────────────┤
│                                     │
│  Email: ____________________        │
│                                     │
│  Contraseña: _______________        │
│                                     │
│  Token de Setup: ___________        │
│                                     │
│  [ Crear Admin ]                    │
└─────────────────────────────────────┘
```

**Completa los campos**:
- **Email**: Tu email de administrador (ej: `admin@movi.com`)
- **Contraseña**: Una contraseña segura (mínimo 8 caracteres recomendados)
- **Token de Setup**: Ingresa el token definido en `.env.local` (por defecto: `admin-root-2026`)

### Paso 5: Crear Admin

1. Haz clic en el botón **"Crear Admin"**
2. El sistema validará el token
3. Si es correcto, creará el usuario y te redirigirá automáticamente al dashboard admin
4. Ya tendrás acceso completo al panel de administración

---

## Opción 2: Script de Prisma (Avanzado)

Si prefieres crear el admin directamente en la base de datos usando un script:

### Crear el archivo `create-admin.js`

**Ubicación**: `/apps/api/create-admin.js`

```javascript
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function createAdmin() {
  const email = process.argv[2] || "admin@movi.com";
  const password = process.argv[3] || "admin123";

  // Verificar si ya existe
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) {
    console.log(" Ya existe un usuario con este email");
    process.exit(1);
  }

  // Hash de la contraseña
  const hashed = bcrypt.hashSync(password, 10);

  // Crear admin
  const admin = await prisma.user.create({
    data: {
      name: "Administrador Root",
      email,
      password: hashed,
      role: "ADMIN",
      approved: true,
      documentStatus: "APPROVED",
    },
  });

  console.log(" Admin creado exitosamente:");
  console.log("   Email:", admin.email);
  console.log("   ID:", admin.id);
  console.log("\nAhora puedes hacer login en /admin-login");
  
  process.exit(0);
}

createAdmin()
  .catch((err) => {
    console.error(" Error:", err.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

### Ejecutar el Script

```bash
cd apps/api
node create-admin.js admin@movi.com tu_contraseña_segura
```

**Resultado esperado**:
```
   Admin creado exitosamente:
   Email: admin@movi.com
   ID: clxxxx...
   
Ahora puedes hacer login en /admin-login
```

---

## Opción 3: Prisma Studio (Visual)

### Paso 1: Abrir Prisma Studio

```bash
cd /monorepo
npx prisma studio
```

Esto abrirá una interfaz web en `http://localhost:5555`

### Paso 2: Navegar a la tabla User

1. En el menú izquierdo, haz clic en **"User"**
2. Haz clic en **"Add record"** (botón verde superior)

### Paso 3: Completar los Campos

Ingresa los siguientes valores:

| Campo | Valor |
|-------|-------|
| `id` | *(dejar vacío, se genera automáticamente)* |
| `name` | `Administrador Root` |
| `email` | `admin@movi.com` |
| `password` | Ver FAQ abajo para generar hash |
| `role` | `ADMIN` |
| `approved` | `true` ✓ |
| `documentStatus` | `APPROVED` |
| `phone` | *(opcional)* |
| `licenseType` | *(dejar vacío)* |
| `licenseNumber` | *(dejar vacío)* |
| `createdAt` | *(dejar vacío, se genera automáticamente)* |
| `updatedAt` | *(dejar vacío, se genera automáticamente)* |

### Paso 4: Guardar

Haz clic en **"Save 1 change"**

>  **Importante**: El password debe estar hasheado con bcrypt. Ver sección FAQ.

---

## Verificar que el Admin fue Creado

### Método 1: Prisma Studio
1. Abre `npx prisma studio`
2. Ve a la tabla **User**
3. Busca el usuario con `role = ADMIN`

### Método 2: Backend Logs
1. Inicia el servidor backend
2. Intenta hacer login en `/admin-login`
3. Si el admin existe, podrás iniciar sesión

### Método 3: Endpoint API
```bash
curl -X POST http://localhost:4000/auth/admin/setup \
  -H "Content-Type: application/json"
```

**Respuesta esperada**:
- Si admin existe: `409 Conflict - { "error": "admin_already_exists" }`
- Si NO existe: `200 OK - { "ready": true }`

---

## FAQ

### ¿Por qué necesito un token de setup?

El token de setup previene que cualquier persona cree administradores sin autorización. Solo quien tiene acceso al archivo `.env.local` puede crear el primer admin.

### ¿Puedo cambiar el token de setup?

Sí, edita `/apps/web/.env.local` y cambia el valor de `NEXT_PUBLIC_ADMIN_SETUP_TOKEN`:

```bash
NEXT_PUBLIC_ADMIN_SETUP_TOKEN=mi_token_super_secreto_2026
```

**Reinicia** la aplicación frontend después del cambio.

### ¿Cómo genero un hash de contraseña para Prisma Studio?

Opción A: Usar Node.js REPL:
```bash
node
> const bcrypt = require('bcryptjs');
> bcrypt.hashSync('tu_contraseña', 10);
'$2a$10$xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
```

Opción B: Usar un generador online:
- https://bcrypt-generator.com/
- Ingresa tu contraseña
- Copia el hash generado

### ¿Qué hago si olvidé el token de setup?

1. Ve a `/apps/web/.env.local`
2. Busca la línea `NEXT_PUBLIC_ADMIN_SETUP_TOKEN`
3. Ese es tu token actual

Si no existe, el valor por defecto es: `admin-root-2026`

### ¿Cómo creo más administradores después del primero?

Una vez creado el primer admin:

**Opción A**: Via endpoint API (requiere estar logueado como admin):
```bash
curl -X POST http://localhost:4000/auth/admin/create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TU_JWT_TOKEN" \
  -d '{
    "email": "nuevo-admin@movi.com",
    "password": "contraseña123"
  }'
```

**Opción B**: Crear un UI en el dashboard admin (pendiente de implementar)

### El formulario no aparece, solo veo "Login"

Esto significa que ya existe un administrador en la base de datos. Puedes:

1. **Usar las credenciales existentes** para hacer login
2. **Eliminar el admin existente** desde Prisma Studio si olvidaste las credenciales
3. **Resetear la base de datos** con `npx prisma migrate reset` ( esto borra TODOS los datos)

### ¿Cómo reseteo completamente el sistema?

```bash
cd /monorepo
npx prisma migrate reset
npx prisma migrate dev
```

Esto borrará todos los datos y aplicará las migraciones desde cero.

---

## Troubleshooting

### Error: "Token de setup inválido"

**Causa**: El token ingresado no coincide con el definido en `.env.local`

**Solución**:
1. Verifica `/apps/web/.env.local`
2. Copia exactamente el valor de `NEXT_PUBLIC_ADMIN_SETUP_TOKEN`
3. Intenta nuevamente

### Error: "Email ya existe"

**Causa**: Ya existe un usuario (admin o no) con ese email

**Solución**:
1. Usa otro email
2. O elimina el usuario existente desde Prisma Studio

### Error: "admin_already_exists"

**Causa**: Ya existe un administrador en el sistema

**Solución**:
1. Usa el formulario de login normal (no el de setup)
2. Si olvidaste las credenciales, sigue las instrucciones de "Resetear la base de datos"

### No veo el formulario "Crear Admin Root"

**Causa**: La aplicación detectó que ya existe un admin

**Solución**:
1. Verifica con Prisma Studio si existe un usuario con `role = ADMIN`
2. Si no existe pero el formulario no aparece, limpia el cache del navegador
3. Reinicia la aplicación frontend

---

## Resumen del Flujo

```
┌───────────────────────────────────────────────────┐
│  1. Configurar token en .env.local                │
│     NEXT_PUBLIC_ADMIN_SETUP_TOKEN=admin-root-2026 │
└───────────────────────────────────────────────────┘
                        ↓
┌───────────────────────────────────────────────────┐
│  2. Ir a /admin-login                             │
│     Sistema detecta: ¿Existe admin?               │
└───────────────────────────────────────────────────┘
                        ↓
            ┌───────────┴───────────┐
            │                       │
         NO │                       │ SÍ
            ↓                       ↓
  ┌─────────────────┐    ┌──────────────────┐
  │ Form de Setup   │    │ Form de Login    │
  │ • Email         │    │ • Email          │
  │ • Contraseña    │    │ • Contraseña     │
  │ • Token         │    └──────────────────┘
  └─────────────────┘              ↓
            ↓                 Login Normal
    Validar Token
            ↓
    Crear Admin en DB
            ↓
    Login Automático
            ↓
┌───────────────────────────────────────────────────┐
│  3.  Acceso al Dashboard Admin                  │
│     /admin - Panel de aprobación de conductores   │
└───────────────────────────────────────────────────┘
```

---

## Seguridad

###  Mejores Prácticas Implementadas

1. **Token de Setup**: Previene creación no autorizada
2. **Hash de Contraseñas**: bcrypt con 10 rounds
3. **JWT con Expiración**: Tokens válidos por 7 días
4. **Validación de Rol**: Middleware `adminOnly` en todos los endpoints críticos
5. **Email Único**: No se pueden duplicar emails

###  Recomendaciones Adicionales

1. **Cambiar el token por defecto** en producción
2. **Usar contraseñas fuertes** (mín. 12 caracteres, mayúsculas, minúsculas, números)
3. **Rotar tokens JWT periódicamente**
4. **Configurar HTTPS** en producción
5. **Implementar 2FA** (recomendado para futuro)

---

## Contacto y Soporte

Si tienes problemas creando el primer admin:

1. Revisa los logs del backend (`apps/api`)
2. Revisa la consola del navegador (F12)
3. Verifica la conexión a la base de datos
4. Consulta el archivo `CHANGELOG.md` para más detalles del sistema

---

**Última actualización**: 28 de Febrero, 2026  
**Versión**: 1.0.0
