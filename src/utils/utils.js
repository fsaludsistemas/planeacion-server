
  
  const normalizeString = (value) => {
    return String(value || '')
      .trim()
      .toLowerCase();
  }
  

function sheetValuesToObject(values = []) {
  // 1. Validación de seguridad inicial
  if (!values || !values.length) {
    return [];
  }

  // Separar la primera fila (encabezados) del resto (filas con datos)
  const [headers, ...rows] = values;
  if (!headers || !headers.length) {
    return [];
  }

  // 2. Procesar las filas y filtrar las que estén totalmente vacías
  return rows
    .filter(row => row.some(cell => cell !== '' && cell !== null && cell !== undefined)) // Elimina filas vacías
    .map((row) => {
      return headers.reduce((rowObject, header, index) => {
        // Ignorar si el encabezado de la columna está en blanco
        if (!header || header.toString().trim() === '') {
          return rowObject;
        }

        // Obtener el valor actual de la celda
        const valorCelda = row[index];

        // 3. Control de vacíos: Si la celda está vacía, puedes elegir:
        // Opción A (Por defecto): Guardar un texto personalizado o mantenerlo limpio
        rowObject[header] = (valorCelda !== undefined && valorCelda !== null && valorCelda !== '') 
          ? valorCelda 
          : 'No aplica'; // <- Cambia 'No aplica' por '' si prefieres que quede en blanco, pero controlado.

        /* 
        Opción B (Alternativa): Si prefieres que la propiedad directamente NO exista 
        en el objeto cuando esté vacía, descomenta las siguientes líneas y borra la Opción A:
        
        if (valorCelda !== undefined && valorCelda !== null && valorCelda !== '') {
          rowObject[header] = valorCelda;
        }
        */

        return rowObject;
      }, {});
    });
}

  
  module.exports = {
    normalizeString,
    sheetValuesToObject
  }
  