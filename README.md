# Movi Monorepo

Movi es una plataforma de ride-hailing implementada como una monorepo. Incluye una interfaz para pasajeros, otra para conductores, un panel de administración y un backend centralizado.

## Resumen

Este proyecto soporta un flujo completo de viajes:
- Los pasajeros solicitan viajes con origen y destino.
- Los conductores reciben solicitudes en tiempo real y aceptan viajes.
- Ambos lados reciben actualizaciones en vivo del estado del viaje y la ubicación del conductor.
- Los administradores revisan y aprueban registros de conductores con verificación de documentos.
- El sistema rastrea estados de viaje, razones de cancelación y tarifas finales.

## Arquitectura

- **apps/web**: Aplicación frontend en Next.js.
  - Interfaz de pasajero en `/client`.
  - Interfaz de conductor en `/rider`.
  - Panel de administración en `/admin`.
  - Páginas de autenticación, recuperación de contraseña y perfil.
- **apps/api**: Backend con Express y Socket.IO.
  - Gestiona autenticación, viajes, usuarios y eventos en tiempo real.
  - Se conecta a PostgreSQL mediante Prisma.
- **packages/types**: Tipos TypeScript compartidos para consistencia entre frontend y backend.
- **packages/ui**: Componentes UI reutilizables, helpers de mapas y estilos comunes.

## Funcionalidades principales

- **Asignación y seguimiento en tiempo real**
  - Los conductores reciben solicitudes cercanas vía Socket.IO.
  - Los pasajeros ven la ubicación del conductor en un mapa en vivo.
  - El estado del viaje se sincroniza entre pasajero y conductor.
- **Flujo de aprobación de conductores**
  - Los conductores registran datos personales, del vehículo y documentos.
  - Los administradores pueden aprobar o rechazar registros.
  - Si se rechaza, el conductor recibe el motivo y puede reenviar documentos.
- **Gestión del ciclo de viaje**
  - Los viajes pasan por estados: `PENDIENTE`, `ASIGNADO`, `EN_CURSO`, `FINALIZADO`, `CANCELADO`.
  - Los conductores pueden aceptar, iniciar y finalizar viajes.
  - Las cancelaciones capturan razones para auditoría.
- **Recuperación y persistencia**
  - El estado del viaje activo se guarda en el navegador.
  - Recargar la página restaura el contexto del viaje.
- **Panel de administrador**
  - Lista de conductores pendientes.
  - Revisión de documentos y datos del vehículo.
  - Aprobación o rechazo de conductores.

## Tecnología

- **Frontend**: Next.js, React, Leaflet, Socket.IO Client.
- **Backend**: Node.js, Express, Socket.IO, Prisma Client.
- **Base de datos**: PostgreSQL.
- **Gestor de paquetes**: pnpm (workspaces).

## Configuración y ejecución

1. Instalar dependencias:
    ```bash
    pnpm install
    ```

2. Configurar la base de datos:
    - Actualiza `apps/api/.env` con `DATABASE_URL`.
    - Asegura que `apps/web/.env.local` tenga `NEXT_PUBLIC_API_URL=http://localhost:4000`.

3. Ejecutar migraciones:
    ```bash
    pnpm --filter api exec prisma migrate deploy
    ```

4. Iniciar las aplicaciones:
    - Backend:
      ```bash
      pnpm --filter api dev
      ```
    - Frontend:
      ```bash
      pnpm --filter web dev
      ```

5. Acceder a la aplicación:
    - Frontend: http://localhost:3000
    - API: http://localhost:4000

## Notas de despliegue

- El backend escucha en el puerto `4000` por defecto.
- El frontend utiliza `NEXT_PUBLIC_API_URL` para apuntar al backend.
- El proyecto usa pnpm workspaces para compartir dependencias.

## Consideraciones de escalabilidad

- El backend es modular y puede separarse en servicios si es necesario.
- Socket.IO puede escalar con un adaptador Redis para múltiples servidores.
- Los tipos compartidos (`packages/types`) reducen duplicación y mantienen consistencia.
- `apps/web` es una aplicación Next.js estándar que puede desplegarse en plataformas de hosting estático o serverless.
- Prisma soporta escalabilidad de PostgreSQL con pool de conexiones y réplicas.

## Archivos importantes

- `apps/api/src/index.ts`: rutas API, autenticación y lógica de Socket.IO.
- `apps/web/pages/client.tsx`: solicitud de viajes y seguimiento para pasajeros.
- `apps/web/pages/rider.tsx`: aceptación de viajes y gestión para conductores.
- `apps/web/pages/admin.tsx`: revisión y aprobación de conductores.
- `apps/web/global.d.ts`: declaración de importación de CSS para Next.js.
- `prisma/schema.prisma`: definición del modelo de datos.

## Notas para revisores

- No hay código de ngrok ni túneles externos en el frontend.
- La base de código usa tipado explícito y configuración compartida del workspace.
- El objetivo actual es apoyar una configuración local de desarrollo funcional con las características descritas.
- Para un despliegue en producción sería necesario añadir pasos específicos de despliegue, configuración de variables de entorno de producción, y posiblemente ajustes de red, seguridad y escala.
