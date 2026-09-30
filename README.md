# Visor SOC — IDS / MESA (versión en línea)

Versión web del visor de respuestas, ahora con:

- **Base de datos en la nube (Firebase Firestore)**: los cambios se guardan solos y se ven en tiempo real para todos los que tengan la página abierta.
- **Login con correo y contraseña** (Firebase Authentication).
- **Dos roles**: **Administrador** (puede agregar/editar/borrar pestañas, secciones y botones, y crear usuarios) y **Solo lectura** (solo puede buscar y consultar, no puede modificar nada).
- **Dos espacios de trabajo independientes**, con un botón para cambiar entre ellos:
  - **🛡️ IDS**: trae precargado todo lo que ya tenías armado (Brechas Darktrace, Comandos y Respuestas, Manuales, el buscador de IP y el registro de casos).
  - **🗒️ MESA**: arranca vacío, para que lo llenes desde cero con el contenido de mesa de dinero.

No incluye archivos adjuntos (PDF/imágenes) físicos: para esos botones tipo "enlace", usa una URL (puede ser un archivo que subas al mismo repositorio de GitHub, o un enlace externo tipo Google Drive/SharePoint).

**Flujo de pantallas:**
1. **Login** (correo y contraseña).
2. **Elegir área**: una pantalla con dos botones grandes, "🛡️ IDS" o "🗒️ MESA SOPORTE".
3. **Menús**: la pantalla principal con las pestañas de esa área. La búsqueda de IP y el registro de casos/MAC ahora son una pestaña más, llamada "🔎 Búsquedas", igual que las demás.

Para volver a elegir área usa el botón "🔄 Cambiar de área" arriba a la derecha.

---

## 1. Crear el proyecto de Firebase (una sola vez)

1. Entra a **https://console.firebase.google.com** con tu cuenta de Google.
2. **Agregar proyecto** → ponle un nombre (ej. `visor-soc`) → puedes desactivar Google Analytics, no hace falta.
3. Cuando el proyecto esté creado, entra a **Compilación → Authentication** → pestaña **Sign-in method** → habilita **Correo electrónico/contraseña**.
4. Entra a **Compilación → Firestore Database** → **Crear base de datos** → modo **producción** → elige la región más cercana (ej. `us-east1` o `southamerica-east1`).
5. Dentro de Firestore, ve a la pestaña **Reglas** y reemplaza todo el contenido por el del archivo `firestore.rules` que va en esta carpeta. Clic en **Publicar**.

### Obtener la configuración (`firebase-config.js`)

1. En el panel del proyecto (ícono de engranaje arriba a la izquierda) → **Configuración del proyecto**.
2. En "Tus apps", clic en el ícono **`</>`** (Web) → ponle un apodo (ej. `visor-web`) → **Registrar app**.
3. Copia el objeto `firebaseConfig` que te muestra y pégalo dentro del archivo **`firebase-config.js`** de esta carpeta, reemplazando los valores `PON_AQUI_...`.

> Esto **no es una contraseña secreta**: es normal que quede visible en el código del sitio. La seguridad real la dan las reglas de Firestore del paso anterior (solo un admin puede escribir, solo usuarios con rol pueden leer).

---

## 2. Crear el primer usuario administrador (manual, una sola vez)

Por seguridad, el primer administrador se crea a mano (los siguientes usuarios ya los puedes crear tú mismo desde dentro de la página).

1. **Authentication → Users → Add user** → escribe tu correo y una contraseña → **Add user**.
2. Copia el **User UID** que aparece en la lista (un código largo).
3. **Firestore Database → Datos → Start collection** (o "+ Colección") → ID de la colección: `usuarios`.
4. ID del documento: pega ahí el **mismo UID** que copiaste.
5. Agrega estos campos al documento:
   - `email` (string) → tu correo
   - `rol` (string) → `admin`
   - `fecha` (string) → la fecha de hoy, ej. `2026-09-29`
6. Guarda.

Con eso ya puedes entrar a la página con ese correo/contraseña como administrador. Desde ahí, en el panel **"👤 Gestión de usuarios"**, puedes crear el resto de cuentas (admin o solo lectura) sin volver a tocar la consola de Firebase.

---

## 3. Publicar en GitHub Pages

1. Crea un repositorio nuevo en tu cuenta de GitHub (ej. `ids-mesa`), o usa uno existente.
2. Sube **todos** los archivos de esta carpeta (`index.html`, `style.css`, `app.js`, `ip-data.js`, `seed-ids.js`, `firebase-config.js` ya con tus datos, `firestore.rules` — este último es solo referencia, no necesita estar en el sitio pero no molesta si queda).
3. En el repositorio: **Settings → Pages** → en "Source" elige la rama `main` y carpeta `/ (root)` → **Save**.
4. Espera 1-2 minutos y entra a `https://TU-USUARIO.github.io/TU-REPO/`.

---

## 4. Primer uso

1. Entra al link de GitHub Pages, inicia sesión con el correo/contraseña del administrador que creaste a mano.
2. Estarás en el espacio **IDS**, vacío. Clic en **"🌱 Cargar contenido inicial IDS"** (arriba a la derecha) para traer todo lo que ya tenías armado (pestañas, respuestas, registro de casos).
3. Cambia a **🗒️ MESA** con el botón de arriba y arma ese espacio desde cero con **"✏️ Modo edición"**.
4. Desde **"👤 Gestión de usuarios"** crea las cuentas del resto del equipo (elige `Solo lectura` para quienes solo deben consultar, `Administrador` para quienes también editan).

---

## Notas importantes

- **Evita que dos administradores editen al mismo tiempo en modo edición**: cada guardado sobrescribe el documento completo del espacio de trabajo, así que si dos personas editan a la vez, puede perderse el cambio de una de las dos (funciona igual que muchas herramientas internas simples; si esto se vuelve un problema, se puede mejorar más adelante con un modelo de guardado más fino).
- El botón **"⬇️ Exportar copia (JSON)"** (solo admin) descarga una copia de respaldo del espacio de trabajo actual, por si algún día quieres restaurar algo manualmente.
- El buscador de direccionamiento IP (el del Excel del banco) es el mismo para ambos espacios; no cambia entre IDS y MESA.
- El registro de casos/investigaciones (IP/MAC) sí es independiente por cada espacio de trabajo.
- Si un usuario de "solo lectura" intenta forzar cambios manipulando el navegador, las reglas de Firestore (`firestore.rules`) los bloquean del lado del servidor, así que está cubierto aunque alguien intente saltarse los botones ocultos.
