# Guía de Deployment en Railway

## Pre-requisitos

- Cuenta en [Railway.app](https://railway.app)
- Repositorio en GitHub
- Variables de entorno configuradas

## Configuración en Railway

### 1. Crear Variables de Entorno

En Railway, por cada app (API y Web), agrega estas variables:

**API (apps/api):**
```
DATABASE_URL=postgresql://user:password@host:port/dbname
JWT_SECRET=tu-secret-key
GOOGLE_PLACES_API_KEY=tu-key
GOOGLE_GEOCODING_API_KEY=tu-key
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu-email@gmail.com
SMTP_PASS=tu-app-password
SMTP_FROM=tu-email@gmail.com
WEB_URL=https://tu-app.railway.app
```

**Web (apps/web):**
```
NEXT_PUBLIC_MAPBOX_TOKEN=tu-token
NEXT_PUBLIC_GOOGLE_PLACES_API_KEY=tu-key
NEXT_PUBLIC_GOOGLE_GEOCODING_API_KEY=tu-key
NEXT_PUBLIC_ADMIN_SETUP_TOKEN=tu-token
NEXT_PUBLIC_API_URL=https://tu-api.railway.app
```

### 2. Configurar Build & Deploy

**Configuración por defecto en Railway:**

- **Build Command:** `pnpm --filter web build`
- **Start Command:** `pnpm --filter web start`
- **Root Directory:** `/`

Para API:
- **Build Command:** `pnpm --filter api build`
- **Start Command:** `pnpm --filter api start`

### 3. Base de Datos PostgreSQL

1. Agrega un servicio PostgreSQL desde el marketplace de Railway
2. Las credenciales se asignan automáticamente a `DATABASE_URL`
3. Conecta el servicio a tu aplicación API

### 4. Run Migrations

En la pestaña "Build" de tu app API, agrega como pre-deployment command:
```bash
pnpm --filter api exec prisma migrate deploy
```

O ejecuta manualmente en Railway shell:
```bash
pnpm --filter api exec prisma migrate deploy
```

## Troubleshooting

### Error: "Could not find declaration file for module 'mapbox-gl'"
- ✓ Resuelto: `@types/mapbox-gl` está en `packages/ui/devDependencies`
- ✓ `mapbox-gl` está en `packages/ui/devDependencies`

### Error: "Unable to load schema from schemastore.org"
- ✓ Resuelto: `.vscode/settings.json` desactiva validación online
- Este es solo un warning de VS Code, no afecta builds

### Build falla en pnpm install
- Asegúrate que `pnpm-lock.yaml` está en git
- Ejecuta `pnpm install` localmente y commitea cambios

### Database connection failed
- Verifica que `DATABASE_URL` apunta al PostgreSQL correcto
- Las variables sensibles deben estar en Railway secrets, no commitearlas

## Monitoreo

Railway proporciona:
- Logs en tiempo real
- Monitoring de recursos
- Alertas automáticas

Accede desde el dashboard de Railroad para ver logs de deployment y runtime.

## Rollback

Si algo falla después de un deployment:
1. Ve a la sección "Deployments"
2. Selecciona un deployment anterior
3. Haz click en "Redeploy"

## Costo

Railway usa un modelo de créditos. Monitorea:
- Uptime de las apps
- Uso de base de datos
- Ancho de banda

Para mantener costos bajos, asegúrate que las queries de Prisma están optimizadas.
