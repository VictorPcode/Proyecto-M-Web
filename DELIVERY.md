# Documentación de Entrega - Movi

## Resumen no técnico

Movi es una plataforma de ride-hailing para pasajeros, conductores y administradores. Permite que los pasajeros soliciten viajes, que los conductores acepten y completen trayectos, y que los administradores aprueben registros de conductores con documentos.

El sistema está diseñado para desarrollo local y revisión técnica, con actualizaciones en tiempo real durante el viaje y recuperación de sesión al recargar la página.

## Qué hace este proyecto

- Los pasajeros pueden solicitar un viaje con origen y destino.
- Los conductores reciben solicitudes cercanas en tiempo real y pueden aceptarlas.
- La ubicación del conductor se comparte continuamente durante un viaje activo.
- El estado del viaje se sincroniza entre pasajero y conductor.
- Los administradores aprueban o rechazan registros de conductores tras revisar documentos.
- La recuperación de contraseña funciona mediante un flujo seguro con token.

## Componentes principales

- `apps/web`: Aplicación frontend en Next.js.
  - `pages/client.tsx`: Flujo de usuario pasajero.
  - `pages/rider.tsx`: Flujo de conductor y navegación en el mapa.
  - `pages/admin.tsx`: Dashboard de aprobación para administración.
- `apps/api`: Servicio backend.
  - `src/index.ts`: Rutas Express, autenticación y eventos Socket.IO.
  - `src/prisma.ts`: Inicialización del cliente Prisma.
- `packages/types`: Tipos TypeScript compartidos para consistencia de datos.
- `packages/ui`: Componentes UI y helpers de mapa reutilizables.

## Escalabilidad

- El backend está estructurado como un servicio centralizado que puede separarse en múltiples servicios si es necesario.
- La comunicación en tiempo real usa Socket.IO y puede escalar con Redis para despliegues multi-servidor.
- Los tipos compartidos reducen la duplicación y facilitan el mantenimiento entre frontend y backend.
- El frontend es una aplicación Next.js estándar y se puede desplegar en hosting estático o serverless.
- La base de datos usa PostgreSQL con Prisma, lo que permite patrones de escalado como pooling de conexiones y réplicas.

## Despliegue y configuración

1. Instalar dependencias:
   ```bash
   pnpm install
   ```
2. Configurar variables de entorno:
   - `apps/api/.env`: establecer `DATABASE_URL`
   - `apps/web/.env.local`: establecer `NEXT_PUBLIC_API_URL=http://localhost:4000`
3. Ejecutar migraciones:
   ```bash
   pnpm --filter api exec prisma migrate deploy
   ```
4. Iniciar las aplicaciones:
   - Backend: `pnpm --filter api dev`
   - Frontend: `pnpm --filter web dev`

## Notas para revisores

- No quedan hooks de ngrok ni túneles externos en el código.
- El proyecto está organizado como una monorepo con dependencias compartidas.
- Las importaciones de CSS en el frontend están soportadas por `apps/web/global.d.ts`.
- El sistema preserva el estado del viaje activo en el almacenamiento del navegador para recuperación tras recarga.

## Estado de entrega final

Este entregable está preparado para revisión técnica e incluye la implementación de la aplicación y la documentación de entrega en español
