const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const multer = require('multer');
const { google } = require('googleapis');
const { sheetValuesToObject } = require('./src/utils/utils'); 
const { config } = require('dotenv');
const { jwtClient } = require('./src/config/google'); 
const { getAllSheetsData, createRow, updateRow,deleteRow, addAvance, addMeta } = require('./src/controllers/sheetsController');
config(); 


const app = express();
const router = express.Router();
const PORT = process.env.PORT || 3001;
const spreadsheetId = process.env.spreadsheet;
app.use(bodyParser.json()); 
app.use(cors());

// Ruta raíz para verificar si el servidor está funcionando
app.get('/', (req, res) => {
  res.send('El servidor está funcionando correctamente');
  
});

app.get('/getAllSheetsData', getAllSheetsData);
// Rutas genéricas
router.post('/:sheetName', createRow);
router.put('/:sheetName/:id', updateRow);
router.delete('/:sheetName/:id', deleteRow);

router.post('/metas', addMeta);
router.post('/avances', addAvance);



// Ruta para actualizar datos en Google Sheets
app.post('/updateData', async (req, res) => {
  try {
    const { updateData, id, sheetName } = req.body;
    const spreadsheetId = process.env.spreadsheet;
    const range = `${sheetName}!A1:Z1000`; 
    const sheets = google.sheets({ version: 'v4', auth: jwtClient });

    const responseSheet = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    const currentValues = responseSheet.data.values;
    const rowIndex = currentValues.findIndex(row => row[0] == id);

    if (rowIndex === -1) {
      return res.status(404).json({ error: 'ID no encontrado', status: false });
    }

    const updatedRange = `${sheetName}!A${rowIndex + 1}`;
    const sheetsResponse = await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: updatedRange,
      valueInputOption: 'RAW',
      resource: {
        values: [updateData],
      },
    });

    if (sheetsResponse.status === 200) {
      return res.status(200).json({ success: 'Se actualizó correctamente', status: true });
    } else {
      return res.status(400).json({ error: 'No se actualizó', status: false });
    }
  } catch (error) {
    console.error('Error actualizando datos en Google Sheets:', error);
    return res.status(400).json({ error: 'Error en la conexión', status: false });
  }
});

// Ruta para actualizar metas en Google Sheets
app.post('/updateMetas', async (req, res) => {
  try {
    const { updateData, id, sheetName } = req.body;
    const spreadsheetId = '1sp9G8A6-hPUtnmfK7jSpAqQfoMzKR3kmYGYzhOAC6vM'; 
    const range = `${sheetName}!A1:Z1000`; 
    const sheets = google.sheets({ version: 'v4', auth: jwtClient });

    const responseSheet = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    const currentValues = responseSheet.data.values;
    const rowIndex = currentValues.findIndex(row => row[0] == id);

    if (rowIndex === -1) {
      return res.status(404).json({ error: 'ID no encontrado', status: false });
    }

    const updatedRange = `${sheetName}!A${rowIndex + 1}:${rowIndex + 1}`;
    const updatedValues = [...currentValues[rowIndex]];

    // Buscar el índice de la columna que queremos actualizar
    const columnIndex = currentValues[0].indexOf(updateData[0]);
    if (columnIndex === -1) {
      return res.status(400).json({ error: 'Columna no encontrada', status: false });
    }

    // Actualizar el valor en la columna correspondiente
    updatedValues[columnIndex] = updateData[1];

    // Recalcular meta_trienio y total_ejec
    const meta2024 = parseFloat(updatedValues[currentValues[0].indexOf('2024')]) || 0;
    const meta2025 = parseFloat(updatedValues[currentValues[0].indexOf('2025')]) || 0;
    const meta2026 = parseFloat(updatedValues[currentValues[0].indexOf('2026')]) || 0;
    const ejec2024 = parseFloat(updatedValues[currentValues[0].indexOf('ejec_2024')]) || 0;
    const ejec2025 = parseFloat(updatedValues[currentValues[0].indexOf('ejec_2025')]) || 0;
    const ejec2026 = parseFloat(updatedValues[currentValues[0].indexOf('ejec_2026')]) || 0;

    updatedValues[currentValues[0].indexOf('meta_trienio')] = meta2024 + meta2025 + meta2026;
    updatedValues[currentValues[0].indexOf('total_ejec')] = ejec2024 + ejec2025 + ejec2026;

    const sheetsResponse = await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: updatedRange,
      valueInputOption: 'RAW',
      resource: {
        values: [updatedValues],
      },
    });

    if (sheetsResponse.status === 200) {
      return res.status(200).json({ success: 'Se actualizó correctamente', status: true });
    } else {
      return res.status(400).json({ error: 'No se actualizó', status: false });
    }
  } catch (error) {
    console.error('Error actualizando metas en Google Sheets:', error);
    return res.status(400).json({ error: 'Error en la conexión', status: false });
  }
});

router.post('/createIndicator', async (req, res) => {
  try {
    const { nombre, oficinaEscuela, responsable, coequipero, meta2024, meta2025, meta2026, tipoOficinaEscuela, id_obj_dec, plantillaId, currentAvance } = req.body;
    const year = new Date().getFullYear();
    const idEscOfi = oficinaEscuela;

    const sheets = google.sheets({ version: 'v4', auth: jwtClient });

    const escOfiResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.spreadsheet,
      range: 'ESC_OFI!A1:E1000',
    });

    const escOfiValues = escOfiResponse.data.values;
    const escOfi = escOfiValues.find(row => row[0] === idEscOfi);

    if (!escOfi) {
      return res.status(404).json({ status: false, message: 'Escuela u oficina no encontrada' });
    }

    const nombreEscuelaOficina = escOfi[1];
    const tipo = escOfi[2];

    const indicadoresResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.spreadsheet,
      range: 'INDICADORES!A1:I1000',
    });

    const indicadoresValues = indicadoresResponse.data.values;
    const indicadoresForEscOfi = indicadoresValues
      .slice(1) 
      .filter(row => row[7] === idEscOfi); 

    const currentIds = indicadoresForEscOfi.map(row => parseInt(row[8], 10));
    const newIdIndicadorDep = currentIds.length ? Math.max(...currentIds) + 1 : 1; 

    const currentGeneralIds = indicadoresValues.slice(1).map(row => parseInt(row[0], 10)); // IDs generales
    const newId = Math.max(...currentGeneralIds) + 1;

    const tipoArchivo = tipo === 'Escuela' ? 'Esc' : 'Ofi';
    const sheetName = `${year}MDE - ${tipoArchivo} ${nombreEscuelaOficina} - IndicadorNo_${newIdIndicadorDep}`;

    const drive = google.drive({ version: 'v3', auth: jwtClient });

    const plantillaResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: '1sp9G8A6-hPUtnmfK7jSpAqQfoMzKR3kmYGYzhOAC6vM',
      range: 'PLANTILLAS!A1:D1000',
    });

    const plantillas = plantillaResponse.data.values;
    const plantilla = plantillas.find(row => row[0] === plantillaId); 

    if (!plantilla) {
      return res.status(404).json({ status: false, message: 'Plantilla no encontrada' });
    }

    const plantillaFileId = plantilla[3]; 

    // Crear una copia de la plantilla seleccionada en Google Drive
    const file = await drive.files.copy({
      fileId: plantillaFileId, // Usar el ID de la plantilla
      resource: {
        name: sheetName,
        parents: ['1wBWPuy0TH3rNnQvGA9mEDgYLYxq48HgQ'],  // Carpeta donde se almacenará
      },
    });

    const spreadsheetId = file.data.id;
    const urlIndicador = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;

    const newIndicator = [newId, nombre, '', id_obj_dec, responsable, coequipero, urlIndicador, idEscOfi, newIdIndicadorDep];

    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.spreadsheet,
      range: 'INDICADORES!A1:I1',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      resource: {
        values: [newIndicator],
      },
    });

    const metaTrienio = parseFloat(meta2024) + parseFloat(meta2025) + parseFloat(meta2026);

    const newMeta = [newId, newIdIndicadorDep, meta2024, '', meta2025, '', meta2026, '', metaTrienio, ''];

    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.spreadsheet,
      range: 'METAS!A1:J1',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      resource: {
        values: [newMeta],
      },
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId: spreadsheetId,
      range: 'Hoja 1!B1', 
      valueInputOption: 'RAW',
      resource: {
        values: [[currentAvance]], 
      },
    });

    const requests = [
      {
        addProtectedRange: {
          protectedRange: {
            range: {
              sheetId: 0, 
              startRowIndex: 0,
              endRowIndex: 1,
              startColumnIndex: 0,
              endColumnIndex: 2,
            },
            description: 'Protección de A1 y B1',
            editors: {
              users: [], 
            },
          },
        },
      },
    ];

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: spreadsheetId,
      resource: {
        requests,
      },
    });

    return res.status(200).json({ status: true, message: 'Indicador y metas creados con éxito, celdas protegidas', url: urlIndicador });
  } catch (error) {
    console.error('Error creando indicador y metas:', error);
    return res.status(500).json({ status: false, message: 'Error al crear el indicador y las metas', error });
  }
});

app.use(router);  

app.listen(PORT, () => {
  console.log(`Servidor backend escuchando en el puerto ${PORT}`);
  
});
