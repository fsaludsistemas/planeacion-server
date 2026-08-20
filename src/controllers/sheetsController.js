import {sheetRanges} from '../config/sheetRanges.js';
import { config } from 'dotenv';
import { google } from 'googleapis';
import { jwtClient } from '../config/google.js';
import { sheetValuesToObject } from '../utils/utils.js';
config();


const SHEET_COLUMNS = {
  USUARIOS:{
    id: 0,
    id_dependencia: 1,
    correo: 2,
    rol: 3,
    editor: 4
  },
  PERIODO:{
    id: 0,
    anio_ini: 1,
    anio_final: 2,
    nombre_decano: 3,
    actual: 4
  },
  DEPENDENCIA:{
    id: 0,
    nombre: 1,
    abreviatura: 2,
    tipo: 3
  },
  DESAFIOS:{
    id: 0,
    titulo: 1,
  },
  ESTRATEGIA_COVERGENTE:{
    id: 0,
    id_desafio: 1,
    titulo: 2,
  },
  ESTRATEGIA_FACULTAD:{
    id: 0,
    id_convergente: 1,
    titulo: 2,
  },
  PROGRAMAS_INST:{
    id: 0,
    id_estrategia_facultad: 1,
    titulo: 2,
  },
  INDICADORES_RESULTADO:{
    id: 0,
    id_programa_inst: 1,
    nombre: 2,
  },
  INDICADORES_PRODUCTO:{
    id: 0,
    id_dependencia: 1,
    id_desafio: 2,
    id_estrategia_convergente: 3,
    id_estrategia_facultad: 4,
    id_programa_inst: 5,
    id_indicador_resultado: 6,
    id_periodo: 7,
    objetivo_escuela: 8,
    nombre: 9,
    id_responde_a: 10,
    logro: 11,
    responsable: 12,
    suma_facultad: 13,
  },
  RESPONDE_A:{
    id: 0,
    nombre: 1,
  },
  METAS:{
    id: 0,
    id_indicador_producto: 1,
    meta_2025: 2,
    meta_2026: 3,
    meta_2027: 4,
    meta_2028: 5,
    meta_2029: 6,
    meta_2030: 7,
    total_trienio: 8,
    tipo: 9,
  },
  AVANCES:{
    id: 0,
    id_indicador: 1,
    Avance2025: 2,
    Avance2026: 3,
    Avance2027: 5,
    Avance2028: 6,
    Avance2029: 7,
  },
  EVIDENCIAS:{
    id: 0,
    id_indicador_producto: 1,
    url_2025: 2,
    url_2026: 3,
    url_2027: 4,
    url_2028: 5,
    url_2029: 6,
    url_2030: 7,
  },
};


function buildRange(sheetName, range) {
  if (range.includes('!')) {
    return range;
  }

  return `${sheetName}!${range}`;
}


function columnIndexToLetter(index) {
  let result = '';
  let current = index + 1;

  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }

  return result;
}

async function getSheetRows(sheets, spreadsheetId, sheetName) {
  const range = `${sheetName}!${sheetRanges[sheetName]}`;
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  return response.data.values || [];
}


export const getAllSheetsData = async (req, res) => {
  try {
    const sheets = google.sheets({ version: 'v4', auth: jwtClient });
    const spreadsheetId = process.env.spreadsheet;

    // Promesas para cada hoja
    const dataPromises = Object.entries(sheetRanges).map(async ([sheetName, range]) => {
      const fullRange = `${sheetName}!${range}`;
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: fullRange,
      });
      return { [sheetName]: response.data.values };
    });

    // Espera a que todas las promesas se resuelvan
    const allDataArray = await Promise.all(dataPromises);

    // Unifica los resultados en un solo objeto
    const allData = Object.assign({}, ...allDataArray);
    const allDataWithObjects = {};

    for (const [sheetName, values] of Object.entries(allData)) {
      allDataWithObjects[sheetName] = sheetValuesToObject(values);
    }
    res.status(200).json({ status: true, data: allDataWithObjects }); //
  } catch (error) {
    console.error('Error obteniendo datos de todas las hojas:', error);
    console.log('Error details:', error.response ? error.response.data : error.message);
    res.status(400).json({ status: false, error });
  }
};


const updateSheetData = async (req, res) => {
  try {
    const spreadsheetId = process.env.spreadsheet;
    const sheetName = String(req.params.sheetName || '').toUpperCase();
    const { range, values, valueInputOption = 'USER_ENTERED' } = req.body;

    if (!sheetRanges[sheetName]) {
      return res.status(400).json({
        status: false,
        message: `Hoja invalida. Opciones: ${Object.keys(sheetRanges).join(', ')}`,
      });
    }

    if (!range || typeof range !== 'string') {
      return res.status(400).json({
        status: false,
        message: 'Debes enviar range en el body, por ejemplo A2:C2.',
      });
    }

    if (!Array.isArray(values) || !values.every(Array.isArray)) {
      return res.status(400).json({
        status: false,
        message: 'values debe ser una matriz bidimensional. Ej: [["dato1", "dato2"]].',
      });
    }

    const sheets = google.sheets({ version: 'v4', auth: jwtClient });
    const fullRange = buildRange(sheetName, range);

    const response = await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: fullRange,
      valueInputOption,
      requestBody: { values },
    });

    return res.status(200).json({
      status: true,
      message: 'Datos actualizados correctamente.',
      data: response.data,
    });
  } catch (error) {
    console.error('Error actualizando datos en la hoja:', error);
    return res.status(400).json({ status: false, message: error.message });
  }
};



const appendSheetRow = async (req, res) => {
  try {
    const spreadsheetId = process.env.spreadsheet;
    const sheetName = String(req.params.sheetName || '').toUpperCase();
    const { values, valueInputOption = 'USER_ENTERED' } = req.body;

    if (!sheetRanges[sheetName]) {
      return res.status(400).json({
        status: false,
        message: `Hoja invalida. Opciones: ${Object.keys(sheetRanges).join(', ')}`,
      });
    }

    if (!Array.isArray(values)) {
      return res.status(400).json({
        status: false,
        message: 'Debes enviar values como arreglo.',
      });
    }

    const normalizedValues = Array.isArray(values[0]) ? values : [values];

    const sheets = await google.sheets({ version: 'v4', auth: jwtClient });
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption,
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: normalizedValues },
    });

  
    return res.status(201).json({
      status: true,
      message: 'Fila agregada correctamente.',
      data: response.data,
    });
  } catch (error) {
    console.error('Error agregando fila en la hoja:', error);
    return res.status(400).json({ status: false, message: error.message });
  }
};

export const createRow = async (req, res) => {
  try {
    const spreadsheetId = process.env.spreadsheet;
    const sheetName = String(req.params.sheetName || '').toUpperCase();
    const { data } = req.body;

    if (!sheetRanges[sheetName]) {
      return res.status(400).json({
        status: false,
        message: `Hoja invalida. Opciones: ${Object.keys(sheetRanges).join(', ')}`,
      });
    }

    if (!data || typeof data !== 'object') {
      return res.status(400).json({
        status: false,
        message: 'Debes enviar un objeto con los datos de la fila.',
      });
    }

    const sheets = google.sheets({ version: 'v4', auth: jwtClient });
    const rows = await getSheetRows(sheets, spreadsheetId, sheetName);
    const newId = rows.length > 0 ? Math.max(...rows.slice(1).map(r => parseInt(r[0]) || 0)) + 1 : 1;

    const columns = SHEET_COLUMNS[sheetName];
    const newRow = Array(Object.keys(columns).length).fill('');
    newRow[columns.id] = newId;

    for (const key in data) {
      if (columns[key] !== undefined) {
        newRow[columns[key]] = data[key];
      }
    }

    const response = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [newRow] },
    });

    const createdRow = await sheetValuesToObject([newRow], sheetName)[0];
      const fallbackData = {};
    for (const key in columns) {
      fallbackData[key] = newRow[columns[key]];
    }

    return res.status(201).json({
      status: true,
      message: 'Fila creada correctamente.',
      data: fallbackData,
    });
    
  } catch (error) {
    console.error('Error creando fila:', error);
    return res.status(400).json({ status: false, message: error.message });
  }
};

const withFixedSheetName = (handler, sheetName) => {
  return (req, res) => {
    req.params = {
      ...req.params,
      sheetName,
    };

    return handler(req, res);
  };
};

export const updateRow = async (req, res) => {
  try {
    const spreadsheetId = process.env.spreadsheet;
    const sheetName = String(req.params.sheetName || '').toUpperCase();
    const { id } = req.params;
    const { data } = req.body;

    if (!sheetRanges[sheetName]) {
      return res.status(400).json({
        status: false,
        message: `Hoja invalida. Opcionesss: ${Object.keys(sheetRanges).join(', ')}`,
      });
    }

    if (!data || typeof data !== 'object') {
      return res.status(400).json({
        status: false,
        message: 'Debes enviar un objeto con los datos a actualizar.',
      });
    }

    const sheets = google.sheets({ version: 'v4', auth: jwtClient });
    const rows = await getSheetRows(sheets, spreadsheetId, sheetName);
    const rowIndex = rows.findIndex(row => row[0] === id);

    if (rowIndex === -1) {
      return res.status(404).json({ status: false, message: 'Fila no encontrada.' });
    }

    const columns = SHEET_COLUMNS[sheetName];
    const updatedRow = [...rows[rowIndex]];

    for (const key in data) {
      if (columns[key] !== undefined) {
        updatedRow[columns[key]] = data[key];
      }
    }

    const range = `${sheetName}!A${rowIndex + 1}`;
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [updatedRow] },
    });

    const resultRow = sheetValuesToObject([updatedRow], sheetName)[0];

    return res.status(200).json({
      status: true,
      message: 'Fila actualizada correctamente.',
      data: resultRow,
    });
  } catch (error) {
    console.error('Error actualizando fila:', error);
    return res.status(400).json({ status: false, message: error.message });
  }
};

/**
 * Funciones para guardar la url de evidencia y desde la url de la evidencia extraer la tabla
 * para hacer crear un importrange en la hoja de avances
 * 
 */
const extractSpreadsheetId = (url) => {
  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (match) return match[1];
  const paramMatch = url.match(/[?&]id=([a-zA-Z0-9-_]+)/);
  if (paramMatch) return paramMatch[1];
  return null;
};

const extractGid = (url) => {
  const match = url.match(/[#&]gid=(\d+)/);
  return match ? match[1] : '0';
};

const getSheetNameByGid = async (sheets, spreadsheetId, gid) => {
  const metadata = await sheets.spreadsheets.get({ spreadsheetId });
  const sheet = metadata.data.sheets.find(
    (s) => String(s.properties.sheetId) === String(gid)
  );
  if (!sheet) {
    throw new Error(`No se encontró una hoja con gid=${gid} en el sheet externo.`);
  }
  return sheet.properties.title;
};

const findRowIndexByColumnValue = (rows, columnIndex, value) => {
  return rows.findIndex((row, index) => {
    if (index === 0) {
      return false;
    }

    return String(row[columnIndex] || '') === String(value);
  });
};

const getAvanceFieldFromUrlField = (urlField) => {
  const suffix = String(urlField || '').replace(/^url_/, '');
  if (!suffix) {
    return null;
  }

  return `Avance${suffix}`;
};

/**
 * Controlador:
 * 1. Guarda todos los campos de data en EVIDENCIAS usando SHEET_COLUMNS
 * 2. Por cada campo cuyo nombre empiece con "url_", extrae la tabla del sheet
 *    externo y escribe un IMPORTRANGE en AVANCES apuntando a G2
 *
 * Body esperado:
 * {
 *   "data": {
 *     "url_2024": "https://docs.google.com/spreadsheets/d/ABC.../edit#gid=0",
 *     "avances_2024": "C5",   // celda de AVANCES donde va el IMPORTRANGE de url_2024
 *     "otro_campo": "valor"
 *   }
 * }
 *
 * Convención: por cada campo "url_X" se actualiza automáticamente el campo
 * "AvanceX" en la hoja AVANCES para el indicador de la ruta.
 */
export const saveEvidenciaWithImportRange = async (req, res) => {
  try {
    const spreadsheetId = process.env.spreadsheet;
    const sheetName = 'EVIDENCIAS';
    const { id } = req.params;
    const { data = {}, urlField, valueInputOption = 'USER_ENTERED' } = req.body;
    const detectedUrlField = urlField || Object.keys(data).find((key) => key.startsWith('url_')) || 'url_2025';

    if (!data || typeof data !== 'object') {
      return res.status(400).json({
        status: false,
        message: 'Debes enviar un objeto data con los campos de la evidencia.',
      });
    }

    if (!data[detectedUrlField]) {
      return res.status(400).json({
        status: false,
        message: `Debes enviar el campo "${detectedUrlField}" con el link de la evidencia.`,
      });
    }

    const sheets = google.sheets({ version: 'v4', auth: jwtClient });
    const rows = await getSheetRows(sheets, spreadsheetId, sheetName);
    const columns = SHEET_COLUMNS[sheetName];

    if (!columns) {
      return res.status(500).json({
        status: false,
        message: `No se encontró la configuración de columnas para ${sheetName}.`,
      });
    }

    const evidenceIdIndex = rows.findIndex((row, index) => index > 0 && String(row[columns.id]) === String(id));
    const indicadorIdIndex = findRowIndexByColumnValue(rows, columns.id_indicador_producto, id);
    const rowIndex = evidenceIdIndex !== -1 ? evidenceIdIndex : indicadorIdIndex;
    const evidenceUrl = data[detectedUrlField];

    let updatedRow;
    if (rowIndex !== -1) {
      updatedRow = [...rows[rowIndex]];
    } else {
      const newRowSize = Math.max(...Object.values(columns)) + 1;
      updatedRow = Array(newRowSize).fill('');
      updatedRow[columns.id] = rows.length > 1
        ? Math.max(...rows.slice(1).map((row) => parseInt(row[columns.id], 10) || 0)) + 1
        : 1;
      updatedRow[columns.id_indicador_producto] = id;
    }

    for (const [key, value] of Object.entries(data)) {
      if (columns[key] !== undefined) {
        updatedRow[columns[key]] = value;
      }
    }

    updatedRow[columns.id_indicador_producto] = id;
    updatedRow[columns[detectedUrlField]] = evidenceUrl;

    const rowRange = rowIndex !== -1 ? `${sheetName}!A${rowIndex + 1}` : `${sheetName}!A${rows.length + 1}`;
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: rowRange,
      valueInputOption,
      requestBody: { values: [updatedRow] },
    });

    const externalSpreadsheetId = extractSpreadsheetId(evidenceUrl);
    if (!externalSpreadsheetId) {
      return res.status(400).json({
        status: false,
        message: 'No se pudo extraer el ID del spreadsheet desde la URL de la evidencia.',
      });
    }

    const gid = extractGid(evidenceUrl);
    let externalSheetName;

    try {
      externalSheetName = await getSheetNameByGid(sheets, externalSpreadsheetId, gid);
    } catch (err) {
      if (err?.code === 403 || err?.status === 403) {
        return res.status(403).json({
          status: false,
          message: `Sin acceso al sheet externo. Compártelo con: ${process.env.SERVICE_ACCOUNT_EMAIL}`,
          serviceAccountEmail: process.env.SERVICE_ACCOUNT_EMAIL,
        });
      }

      if (err?.code === 404 || err?.status === 404) {
        return res.status(404).json({
          status: false,
          message: 'No se encontró el sheet externo. Verifica la URL.',
        });
      }

      throw err;
    }

    const avanceRows = await getSheetRows(sheets, spreadsheetId, 'AVANCES');
    const avanceColumns = SHEET_COLUMNS.AVANCES;
    const avanceField = getAvanceFieldFromUrlField(detectedUrlField);

    if (!avanceField || avanceColumns[avanceField] === undefined) {
      return res.status(400).json({
        status: false,
        message: `No existe una columna AVANCES para el campo "${detectedUrlField}".`,
      });
    }

    const avanceRowIndex = findRowIndexByColumnValue(avanceRows, avanceColumns.id_indicador, id);
    const importRangeFormula = `=IMPORTRANGE("${evidenceUrl}"; "${externalSheetName}!G2")`;

    let updatedAvanceRow;
    let avanceTargetRange;

    if (avanceRowIndex === -1) {
      const avanceId = avanceRows.length > 1
        ? Math.max(...avanceRows.slice(1).map((row) => parseInt(row[avanceColumns.id], 10) || 0)) + 1
        : 1;

      updatedAvanceRow = Array(Math.max(...Object.values(avanceColumns)) + 1).fill('');
      updatedAvanceRow[avanceColumns.id] = avanceId;
      updatedAvanceRow[avanceColumns.id_indicador] = id;
      updatedAvanceRow[avanceColumns[avanceField]] = importRangeFormula;
      avanceTargetRange = `AVANCES!A${avanceRows.length + 1}`;
    } else {
      updatedAvanceRow = [...avanceRows[avanceRowIndex]];
      updatedAvanceRow[avanceColumns[avanceField]] = importRangeFormula;
      avanceTargetRange = `AVANCES!A${avanceRowIndex + 1}`;
    }

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: avanceTargetRange,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [updatedAvanceRow] },
    });

    return res.status(200).json({
      status: true,
      message: 'Evidencia guardada y avance actualizado con IMPORTRANGE.',
      evidence: sheetValuesToObject([updatedRow], sheetName)[0],
      importRange: {
        hojaExterna: externalSheetName,
        idIndicador: id,
        campoEvidencia: detectedUrlField,
        campoAvance: avanceField,
        celdaAvance: avanceRowIndex === -1
          ? `AVANCES!${columnIndexToLetter(avanceColumns[avanceField])}${avanceRows.length + 1}`
          : `AVANCES!${columnIndexToLetter(avanceColumns[avanceField])}${avanceRowIndex + 1}`,
        formula: importRangeFormula,
        rowCreated: avanceRowIndex === -1,
      },
    });
  } catch (error) {
    console.error('Error en saveEvidenciaWithImportRange:', error);
    return res.status(400).json({ status: false, message: error.message });
  }
};




export const deleteRow = async (req, res) => {
  try {
    const spreadsheetId = process.env.spreadsheet;
    const sheetName = String(req.params.sheetName || '').toUpperCase();
    const { id } = req.params;

    if (!sheetRanges[sheetName]) {
      return res.status(400).json({
        status: false,
        message: `Hoja invalida. Opciones: ${Object.keys(sheetRanges).join(', ')}`,
      });
    }

    const sheets = google.sheets({ version: 'v4', auth: jwtClient });
    const rows = await getSheetRows(sheets, spreadsheetId, sheetName);
    const rowIndex = rows.findIndex(row => row[0] === id);

    if (rowIndex === -1) {
      return res.status(404).json({ status: false, message: 'Fila no encontrada.' });
    }

    const sheetId = await getSheetId(sheets, spreadsheetId, sheetName);

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId,
                dimension: 'ROWS',
                startIndex: rowIndex,
                endIndex: rowIndex + 1,
              },
            },
          },
        ],
      },
    });

    return res.status(200).json({ status: true, message: 'Fila eliminada correctamente.' });
  } catch (error) {
    console.error('Error eliminando fila:', error);
    return res.status(400).json({ status: false, message: error.message });
  }
};

async function getSheetId(sheets, spreadsheetId, sheetName) {
    const response = await sheets.spreadsheets.get({
        spreadsheetId,
    });
    const sheet = response.data.sheets.find(s => s.properties.title === sheetName);
    return sheet.properties.sheetId;
}

export const addIndicadorProducto = withFixedSheetName(createRow, 'INDICADORES_PRODUCTO');
export const updateIndicadorProducto = withFixedSheetName(updateRow, 'INDICADORES_PRODUCTO');
export const deleteIndicadorProducto = withFixedSheetName(deleteRow, 'INDICADORES_PRODUCTO');
export const addMeta = withFixedSheetName(createRow, 'METAS');
export const addAvance = withFixedSheetName(createRow, 'AVANCES');