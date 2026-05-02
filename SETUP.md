# Guía de Configuración Inicial

Para ejecutar el proyecto localmente, sigue estos pasos:

## 1. Clonar el Repositorio

```bash
git clone https://github.com/tu-usuario/movi.git
cd movi
```

## 2. Instalar Dependencias

```bash
pnpm install
```

## 3. Configurar Variables de Entorno

### API (apps/api/.env)
1. Copia `.env.example` a `.env`:
   ```bash
   cp apps/api/.env.example apps/api/.env
   ```

2. Edita `apps/api/.env` y completa:
   - `DATABASE_URL`: Tu conexión PostgreSQL
   - `JWT_SECRET`: Una clave secreta
   - `SMTP_*`: Configuración de correo (opcional para desarrollo)

### Web (apps/web/.env.local)
1. Copia `.env.example` a `.env.local`:
   ```bash
   cp apps/web/.env.example apps/web/.env.local
   ```

2. Edita `apps/web/.env.local` y completa las claves públicas

## 4. Inicializar Base de Datos

```bash
cd apps/api
npx prisma migrate dev
npx prisma generate
```

## 5. Ejecutar el Proyecto

```bash
# Desde la raíz del monorepo
pnpm dev
```

Esto iniciará:
- API: http://localhost:4000
- Web: http://localhost:3000

## 6. Configurar Email (Recupero de Contraseña)

Para enviar correos de recuperación de contraseña:

1. Ve a https://myaccount.google.com/security
2. Activa "Verificación de dos pasos"
3. Ve a "Contraseñas de aplicación"
4. Genera contraseña para "Correo" / "Windows"
5. Copia la contraseña de 16 caracteres en `SMTP_PASS`

## ⚠️ IMPORTANTE - Seguridad

**NUNCA** hagas commit de archivos `.env`. Estos contienen:
- Contraseñas
- Claves de API
- Tokens secretos

Si accidentalmente subes un `.env`:
1. Cambia INMEDIATAMENTE la contraseña/token
2. Usa `git filter-branch` para remover del historio

## Variables de Entorno

Ver `apps/api/.env.example` y `apps/web/.env.example` para lista completa.
