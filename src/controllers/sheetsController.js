import {sheetRanges} from '../config/sheetRanges.js';
import { config } from 'dotenv';
import { google } from 'googleapis';
import { jwtClient } from '../config/google.js';
import { sheetValuesToObject } from '../utils/utils.js';
config();


const SHEET_COLUMNS = {
  USUARIOS:{
    id: 0,
    dependencia: 1,
    correo: 2,
    rol: 3
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

export const updateRow = async (req, res) => {
  try {
    const spreadsheetId = process.env.spreadsheet;
    const sheetName = String(req.params.sheetName || '').toUpperCase();
    const { id } = req.params;
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

export const addIndicadorProducto = createRow;
export const updateIndicadorProducto = updateRow;
export const deleteIndicadorProducto = deleteRow;
export const addMeta = createRow;
export const addAvance = createRow;