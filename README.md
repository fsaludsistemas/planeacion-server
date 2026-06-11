# planeacion-server

API backend en Node.js (Express) para consultar y actualizar informacion de planeacion en Google Sheets, y para crear indicadores a partir de plantillas en Google Drive.

## Que hace este proyecto

- Expone endpoints HTTP para leer todos los datos de las hojas de cálculo.
- Permite crear nuevas filas en cualquier hoja configurada.
- Permite actualizar filas existentes parcialmente (solo los campos que envíes).
- Permite eliminar filas por su `id`.
- Gestiona la estructura completa de indicadores, metas y avances con relaciones entre dependencias, desafíos y estrategias.

## Como funciona (resumen tecnico)

- El servidor corre con Express en el puerto definido por `PORT` (por defecto `3001`).
- Usa `googleapis` con autenticacion de Service Account (`google.auth.JWT`).
- Todas las operaciones trabajan sobre un spreadsheet maestro fijo en código (variable de entorno `spreadsheet`).
- Los endpoints son genéricos: puedes crear, actualizar o eliminar filas en cualquier hoja simplemente cambiando el `sheetName`.
- El `id` es autoincremental: cada nueva fila recibe un `id` calculado automáticamente.

IDs actualmente configurados en `.env`:

- `spreadsheet`: ID del spreadsheet maestro de Google Sheets

## Requisitos

- Node.js 18+ (recomendado LTS).
- npm 9+.
- Cuenta de Google Cloud con API de Google Sheets y Google Drive habilitadas.
- Service Account con permisos sobre:
  - El spreadsheet maestro.
  - La carpeta de Drive donde se crean copias.

## Instalacion

1. Clonar el repositorio.
2. Entrar a la carpeta del proyecto.
3. Instalar dependencias.

```bash
npm install
```

4. Crear archivo `.env` en la raiz del proyecto.
5. Iniciar el servidor.

```bash
npm start
```

Si todo esta bien, deberias ver:

```text
Servidor backend escuchando en el puerto 3001
Successfully connected!
```

## Variables de entorno

El codigo usa principalmente estas variables:

- `PORT`
- `client_id`
- `client_secret`
- `redirect_uris`
- `api_key`
- `client_email`
- `private_key`

Ejemplo minimo de `.env`:

```env
PORT=3001
client_id=TU_CLIENT_ID
client_secret=TU_CLIENT_SECRET
redirect_uris=TU_REDIRECT_URI
api_key=TU_ACCESS_TOKEN_O_API_KEY
client_email=service-account@tu-proyecto.iam.gserviceaccount.com
private_key="-----BEGIN PRIVATE KEY-----\nMII...\n-----END PRIVATE KEY-----\n"
```

Importante sobre `private_key`:

- Debe estar en formato `BEGIN PRIVATE KEY` (PKCS#8).
- Si va en una sola linea dentro de `.env`, usa `\\n` para saltos de linea.

## Estructura esperada en Google Sheets

El backend espera las siguientes hojas en el spreadsheet maestro (definidas en `src/config/sheetRanges.js`):

- `USUARIOS`: Gestión de usuarios por dependencia
- `PERIODO`: Período académico actual y decano
- `DEPENDENCIAS`: Catálogo de dependencias
- `DESAFIOS`: Desafíos estratégicos
- `ESTRATEGIA_COVERGENTE`: Estrategias convergentes vinculadas a desafíos
- `ESTRATEGIA_FACULTAD`: Estrategias de facultad vinculadas a estrategias convergentes
- `PROGRAMAS_INST`: Programas institucionales
- `INDICADORES_RESULTADO`: Indicadores de resultado
- `INDICADORES_PRODUCTO`: Indicadores de producto (con relaciones con todas las dimensiones anteriores)
- `METAS`: Metas trienales asociadas a indicadores
- `AVANCES`: Avances registrados para indicadores

**Convenciones clave:**

- En cualquier hoja, la columna `A` contiene el `id` (autoincremental).
- Las relaciones se mantienen a través de campos como `id_dependencia`, `id_desafio`, etc.
- `INDICADORES_PRODUCTO` es la hoja central que vincula todas las dimensiones (dependencia, desafíos, estrategias, programas, indicadores de resultado, período).

## Endpoints

Base URL local:

```text
http://localhost:3001/api/sheets
```

### GET /getAllSheetsData

Obtiene todos los datos de todas las hojas configuradas en `sheetRanges.js`, devolviendo cada hoja como un array de objetos.

**Método:** `GET`

**URL:** `/api/sheets/getAllSheetsData`

**Body:** No requiere body

**Respuesta exitosa (200 OK):**

```json
{
  "status": true,
  "data": {
    "USUARIOS": [
      {
        "id": "1",
        "dependencia": "TI",
        "correo": "user@example.com",
        "rol": "admin"
      }
    ],
    "PERIODO": [
      {
        "id": "1",
        "anio_ini": "2024",
        "anio_final": "2026",
        "nombre_decano": "Juan Pérez",
        "actual": "1"
      }
    ],
    "INDICADORES_PRODUCTO": [
      {
        "id": "1",
        "id_dependencia": "1",
        "id_desafio": "2",
        "nombre": "Indicador Producto Test",
        ...
      }
    ],
    "METAS": [...],
    "AVANCES": [...]
  }
}
```

---

### POST /:sheetName

Crea una nueva fila en la hoja especificada. El `id` se asigna automáticamente incrementando el máximo id existente.

**Método:** `POST`

**URL:** `/api/sheets/:sheetName`

**Parámetros de URL:**
- `sheetName`: Nombre de la hoja (ej: `INDICADORES_PRODUCTO`, `METAS`, `AVANCES`)

**Body (JSON):**

```json
{
  "data": {
    "nombre": "Indicador Producto ABC",
    "id_dependencia": "1",
    "id_desafio": "2",
    "id_periodo": "1",
    "objetivo_escuela": "Mejorar procesos"
  }
}
```

**Respuesta exitosa (201 Created):**

```json
{
  "status": true,
  "message": "Fila creada correctamente.",
  "data": {
    "id": "5",
    "id_dependencia": "1",
    "id_desafio": "2",
    "id_periodo": "1",
    "nombre": "Indicador Producto ABC",
    "objetivo_escuela": "Mejorar procesos"
  }
}
```

**Respuesta de error (400 Bad Request):**

```json
{
  "status": false,
  "message": "Hoja invalida. Opciones: USUARIOS, PERIODO, DEPENDENCIA, ..."
}
```

---

### PUT /:sheetName/:id

Actualiza una fila existente en la hoja especificada, buscándola por su `id`.

**Método:** `PUT`

**URL:** `/api/sheets/:sheetName/:id`

**Parámetros de URL:**
- `sheetName`: Nombre de la hoja
- `id`: ID de la fila a actualizar

**Body (JSON):**

```json
{
  "data": {
    "nombre": "Nombre Actualizado",
    "objetivo_escuela": "Nuevo objetivo"
  }
}
```

**Respuesta exitosa (200 OK):**

```json
{
  "status": true,
  "message": "Fila actualizada correctamente.",
  "data": {
    "id": "5",
    "id_dependencia": "1",
    "id_desafio": "2",
    "nombre": "Nombre Actualizado",
    "objetivo_escuela": "Nuevo objetivo"
  }
}
```

**Respuesta de error (404 Not Found):**

```json
{
  "status": false,
  "message": "Fila no encontrada."
}
```

---

### DELETE /:sheetName/:id

Elimina una fila de la hoja especificada por su `id`.

**Método:** `DELETE`

**URL:** `/api/sheets/:sheetName/:id`

**Parámetros de URL:**
- `sheetName`: Nombre de la hoja
- `id`: ID de la fila a eliminar

**Body:** No requiere body

**Respuesta exitosa (200 OK):**

```json
{
  "status": true,
  "message": "Fila eliminada correctamente."
}
```

**Respuesta de error (404 Not Found):**

```json
{
  "status": false,
  "message": "Fila no encontrada."
}
```

---

## Rutas Específicas (Aliases)

Para mayor claridad en el desarrollo frontend, existen rutas alias para las operaciones más comunes:

### Indicadores de Producto

#### POST /indicadores_producto

Crea un nuevo indicador de producto.

**Body de ejemplo:**

```json
{
  "data": {
    "id_dependencia": "1",
    "id_desafio": "2",
    "id_estrategia_convergente": "1",
    "id_estrategia_facultad": "1",
    "id_programa_inst": "1",
    "id_indicador_resultado": "1",
    "id_periodo": "1",
    "objetivo_escuela": "Mejorar indicadores de gestión",
    "nombre": "Indicador de Gestión Operativa"
  }
}
```

#### PUT /indicadores_producto/:id

Actualiza un indicador de producto existente.

**URL:** `/api/sheets/indicadores_producto/5`

**Body de ejemplo:**

```json
{
  "data": {
    "nombre": "Indicador Actualizado",
    "objetivo_escuela": "Nuevo objetivo"
  }
}
```

#### DELETE /indicadores_producto/:id

Elimina un indicador de producto.

**URL:** `/api/sheets/indicadores_producto/5`

---

### Metas

#### POST /metas

Crea una nueva meta asociada a un indicador.

**Body de ejemplo:**

```json
{
  "data": {
    "id_indicador": "5",
    "meta_2024": 100,
    "meta_2025": 150,
    "meta_2026": 200,
    "total_trienio": 450,
    "tipo": "PRODUCTO"
  }
}
```

**Respuesta exitosa:**

```json
{
  "status": true,
  "message": "Fila creada correctamente.",
  "data": {
    "id": "12",
    "id_indicador": "5",
    "meta_2024": 100,
    "meta_2025": 150,
    "meta_2026": 200,
    "total_trienio": 450,
    "tipo": "PRODUCTO"
  }
}
```

---

### Avances

#### POST /avances

Crea un nuevo registro de avance para un indicador.

**Body de ejemplo:**

```json
{
  "data": {
    "id_indicador": "5",
    "Avance2024": 50,
    "Avance2025": 120,
    "Avance2026": 180
  }
}
```

**Respuesta exitosa:**

```json
{
  "status": true,
  "message": "Fila creada correctamente.",
  "data": {
    "id": "8",
    "id_indicador": "5",
    "Avance2024": 50,
    "Avance2025": 120,
    "Avance2026": 180
  }
}
```

---

## Ejemplos rápidos con curl

### Obtener todos los datos

```bash
curl -X GET http://localhost:3001/api/sheets/getAllSheetsData
```

### Crear un indicador de producto

```bash
curl -X POST http://localhost:3001/api/sheets/INDICADORES_PRODUCTO \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "id_dependencia": "1",
      "id_desafio": "2",
      "nombre": "Nuevo Indicador"
    }
  }'
```

### Actualizar un indicador

```bash
curl -X PUT http://localhost:3001/api/sheets/INDICADORES_PRODUCTO/5 \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "nombre": "Indicador Actualizado"
    }
  }'
```

### Crear una meta

```bash
curl -X POST http://localhost:3001/api/sheets/metas \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "id_indicador": "5",
      "meta_2024": 100,
      "meta_2025": 150,
      "meta_2026": 200,
      "total_trienio": 450,
      "tipo": "PRODUCTO"
    }
  }'
```

### Crear un avance

```bash
curl -X POST http://localhost:3001/api/sheets/avances \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "id_indicador": "5",
      "Avance2024": 50,
      "Avance2025": 120,
      "Avance2026": 180
    }
  }'
```

### Eliminar un indicador

```bash
curl -X DELETE http://localhost:3001/api/sheets/INDICADORES_PRODUCTO/5
```

## Despliegue

Existe configuracion para Vercel en `vercel.json` usando `@vercel/node` con entrada `index.js`.

Antes de desplegar, configura en Vercel todas las variables de entorno necesarias.

## Problemas comunes

### Error: `ERR_OSSL_UNSUPPORTED` / `DECODER routines::unsupported`

Suele deberse a formato incompatible de `private_key` con OpenSSL/Node.

Soluciones:

- Verifica que la clave sea `-----BEGIN PRIVATE KEY-----` (PKCS#8).
- Asegura escapes `\\n` correctos en `.env` si esta en una sola linea.
- Prueba temporalmente:

```bash
set NODE_OPTIONS=--openssl-legacy-provider
npm start
```

Nota: `--openssl-legacy-provider` es workaround temporal, no solucion final de produccion.

### Error de permisos en Google APIs

- Comparte el spreadsheet y la carpeta de Drive con el `client_email` de la Service Account.
- Verifica que las APIs de Sheets y Drive esten habilitadas en Google Cloud.

## Seguridad recomendada

- No subir `.env` al repositorio.
- Rotar credenciales si se exponen accidentalmente.
- Limitar permisos de la Service Account al minimo necesario.

## Scripts disponibles

- `npm start`: inicia el servidor.
- `npm test`: script placeholder (actualmente no hay pruebas implementadas).
