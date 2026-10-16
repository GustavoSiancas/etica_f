# Ética CAL

React, TypeScript y Vite. Gestión sin autenticación de expedientes, denunciantes y denunciados.

## Iniciar

```sh
npm install
npm run dev
```

Configura `.env.local` con `VITE_API_BASE_URL` apuntando a la URL base completa de tu backend y reinicia Vite. El navegador se conecta directamente a esa URL, así que el backend debe permitir el origen de la aplicación mediante CORS.

## Flujo

1. En **Registro de personas**, registra denunciantes o denunciados por nombre.
2. En **Expedientes**, selecciona el tipo de inicio y crea el expediente.
3. Abre un expediente, selecciona una persona registrada y pulsa **Añadir al expediente**. También puedes registrar personas desde esta vista y asociarlas a continuación.

Los registros y asociaciones se guardan mediante la API. La interfaz muestra el ID para distinguir personas con nombres repetidos y permite paginar los listados de 20 en 20. Los errores del backend, incluido un conflicto por asociación duplicada, se muestran en pantalla.

Los participantes activos se consultan mediante GET /expedientes/{id}/denunciantes y GET /expedientes/{id}/denunciados. Al agregar o quitar una persona se actualizan ambas listas. Para retirar se utiliza participant.id (ID de persona), no el ID de la asociación. El selector de retiro solo muestra participantes activos del expediente.

## Compilar

```sh
npm run build
npm run preview
```

Antes de compilar, configura `VITE_API_BASE_URL` con la URL base del backend. El backend debe permitir el origen de la aplicación mediante CORS.

Servicios HTTP: `src/services/api.ts`. Gestión: `src/components/Management.tsx`. Dashboard y navegación lateral: `src/App.tsx`.


## Escritos

La sección **Escritos** permite crear un escrito con título, tipo y número de expediente requeridos, fecha opcional, selección de denunciantes y denunciados, y archivo opcional. Los tipos disponibles son `DESCARGOS`, `INFORMACION_DENUNCIANTE` y `OTROS`; al elegir `OTROS` se especifica un tipo libre. El backend crea el escrito con estado `NUEVA`. El submenú **Ver escritos** permite paginar y filtrar por estado. Desde allí, los escritos nuevos se pueden marcar como atendidos; el estado no se puede regresar a NUEVA.

La carga usa la secuencia de firma presigned, `PUT` binario directo a R2 con los headers firmados y confirmación de `file_url`. Se aceptan PDF, DOC, DOCX, PNG, JPEG, WebP y GIF hasta 10 MiB. Para que funcione desde el navegador, el bucket R2 debe aceptar el origen local en su configuración CORS.


