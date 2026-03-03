# TimeLog — Documentación

> Aplicación web para registrar horas de trabajo en tiempo real con exportación a CSV.

---

## Tabla de contenidos

1. [Descripción general](#descripción-general)
2. [Funcionalidades](#funcionalidades)
3. [Interfaz de usuario](#interfaz-de-usuario)
4. [Cómo usar la aplicación](#cómo-usar-la-aplicación)
5. [Exportar a CSV](#exportar-a-csv)
6. [Atajos de teclado](#atajos-de-teclado)
7. [Almacenamiento de datos](#almacenamiento-de-datos)
8. [Estructura del CSV exportado](#estructura-del-csv-exportado)
9. [Instalación como PWA en iPhone](#instalación-como-pwa-en-iphone)
10. [Limitaciones conocidas](#limitaciones-conocidas)

---

## Descripción general

TimeLog es una aplicación de una sola página (HTML) que permite registrar sesiones de trabajo mediante un temporizador en tiempo real. No requiere instalación, registro ni conexión a internet para funcionar. Los datos se guardan automáticamente en el navegador.

---

## Funcionalidades

| Funcionalidad | Descripción |
|---|---|
| Timer en tiempo real | Registra la duración exacta de cada sesión con precisión de segundos |
| Notas por sesión | Campo opcional para describir en qué se trabajó |
| Estadísticas | Muestra horas acumuladas hoy, esta semana y número total de sesiones |
| Filtros | Filtra los registros por: todos, hoy, esta semana |
| Eliminar entradas | Borra sesiones individuales del historial |
| Exportar CSV | Descarga todos los registros en formato CSV con codificación UTF-8 |
| Persistencia | Los datos se guardan en `localStorage` y sobreviven al cierre del navegador |

---

## Interfaz de usuario

La app se divide en cuatro zonas principales:

### Cabecera
Muestra el nombre de la app y la fecha actual del sistema.

### Tarjeta del timer
Zona central donde se controla la sesión activa. Contiene:
- **Pantalla del timer** — muestra el tiempo transcurrido en formato `HH:MM:SS`
- **Indicador de estado** — punto parpadeante verde cuando el timer está activo
- **Campo de nota** — texto libre para describir la sesión (se bloquea mientras el timer corre)
- **Botón Iniciar / Detener**

### Barra de estadísticas
Tres tarjetas con resumen rápido:
- **Hoy** — total de horas registradas en el día actual
- **Esta semana** — total de los últimos 7 días
- **Sesiones** — número total de entradas guardadas

### Lista de registros
Historial de todas las sesiones con:
- Nota de la sesión (o `— sin nota —` si no se escribió ninguna)
- Fecha y rango horario (`HH:MM → HH:MM`)
- Duración en formato legible (`1h 23m` o `45m 12s`)
- Botón de borrado individual

---

## Cómo usar la aplicación

### Registrar una sesión

1. Escribe una nota opcional en el campo de texto (ej: `Reunión con cliente`, `Desarrollo feature X`)
2. Pulsa **▶ Iniciar** — el timer arranca y el campo de nota se bloquea
3. Cuando termines, pulsa **■ Detener**
4. La sesión queda guardada automáticamente en el historial

> Si detienes el timer antes de que pase 1 segundo, la sesión se descarta.

### Eliminar una sesión

Pulsa el botón **✕** que aparece a la derecha de cualquier entrada en el historial.

### Filtrar el historial

Usa los botones de filtro sobre la lista:
- **Todos** — muestra todas las sesiones guardadas
- **Hoy** — solo las del día actual
- **Esta semana** — las de los últimos 7 días

---

## Exportar a CSV

1. Asegúrate de tener al menos una sesión registrada
2. Pulsa el botón **↓ Exportar CSV** (arriba a la derecha del historial)
3. Se descarga automáticamente un archivo con el nombre `timelog_YYYY-MM-DD.csv`

El archivo incluye codificación UTF-8 con BOM para compatibilidad con Excel en español.

---

## Atajos de teclado

| Tecla | Acción |
|---|---|
| `Espacio` | Inicia o detiene el timer (solo si el foco no está en el campo de texto) |

---

## Almacenamiento de datos

Los datos se guardan en el `localStorage` del navegador bajo la clave `timelog_entries`, en formato JSON.

Cada entrada tiene la siguiente estructura interna:

```json
{
  "id": 1712345678901,
  "start": 1712345678901,
  "end": 1712349278901,
  "duration": 3600,
  "notes": "Desarrollo de la feature de login",
  "date": "2024-04-05"
}
```

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | número | Timestamp de creación, usado como identificador único |
| `start` | número | Timestamp Unix (ms) del inicio de la sesión |
| `end` | número | Timestamp Unix (ms) del fin de la sesión |
| `duration` | número | Duración en segundos |
| `notes` | texto | Nota escrita por el usuario (puede estar vacía) |
| `date` | texto | Fecha en formato `YYYY-MM-DD` |

> **Importante:** Los datos solo existen en el navegador donde se registraron. No se sincronizan entre dispositivos ni se envían a ningún servidor.

---

## Estructura del CSV exportado

El archivo CSV tiene las siguientes columnas:

| Columna | Ejemplo | Descripción |
|---|---|---|
| `ID` | `1712345678901` | Identificador único de la sesión |
| `Fecha` | `2024-04-05` | Fecha en formato ISO (`YYYY-MM-DD`) |
| `Hora inicio` | `09:15:32` | Hora de inicio según el reloj local |
| `Hora fin` | `10:45:10` | Hora de fin según el reloj local |
| `Duración (seg)` | `5378` | Duración exacta en segundos |
| `Duración` | `1h 29m` | Duración en formato legible |
| `Nota` | `"Revisión de código"` | Texto de la nota (entre comillas) |

### Ejemplo de archivo exportado

```
ID,Fecha,Hora inicio,Hora fin,Duración (seg),Duración,Nota
1712349278901,2024-04-05,10:45:10,12:03:22,4692,1h 18m,"Reunión de planificación"
1712345678901,2024-04-05,09:15:32,10:45:10,5378,1h 29m,"Desarrollo feature login"
1712300000000,2024-04-04,16:00:00,17:30:00,5400,1h 30m,""
```

---

## Instalación como PWA en iPhone

Puedes instalar TimeLog en la pantalla de inicio de tu iPhone sin App Store:

### Requisitos
- iPhone con iOS 11.3 o superior
- Navegador Safari
- El archivo HTML debe estar publicado en una URL web (no funciona desde archivo local)

### Pasos para publicar el archivo

La opción más rápida es **Netlify Drop**:

1. Ve a [netlify.com/drop](https://netlify.com/drop)
2. Arrastra el archivo `time-tracker.html` a la página
3. Netlify genera una URL pública en segundos (sin registro)

### Pasos para instalar en iPhone

1. Abre Safari y navega a la URL generada
2. Pulsa el botón de compartir (icono de cuadrado con flecha ↑)
3. Desplázate y selecciona **"Añadir a pantalla de inicio"**
4. Pon el nombre que quieras y confirma
5. La app aparece en tu pantalla de inicio como cualquier otra aplicación

> Para que se vea a pantalla completa (sin barra de Safari), el archivo necesita un `manifest.json` y un service worker. Pídele a Claude que actualice el archivo con soporte PWA completo.

---

## Limitaciones conocidas

- **Sin sincronización** — los datos solo existen en el dispositivo y navegador donde se registraron
- **Sin backup automático** — si se borra el historial del navegador, los datos se pierden; usa la exportación CSV regularmente como copia de seguridad
- **Una sesión activa a la vez** — no es posible tener dos timers corriendo simultáneamente
- **Sin proyectos ni categorías** — la única clasificación disponible es la nota de texto libre
- **Precisión de 1 segundo** — sesiones de menos de 1 segundo se descartan automáticamente

---

*TimeLog — Aplicación de registro de horas personal · Generado con Claude*
