const { google } = require('googleapis');
const { config } = require('dotenv');
const path = require('path');
const fs = require('fs');

// Cargar variables de entorno
config({ path: path.join(__dirname, '..', '.env') });

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive',
];

const normalizeText = (text) =>
  String(text ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');

const extractNumber = (text) => {
  const match = String(text ?? '').match(/\d+/);
  return match ? match[0] : '';
};

const getClient = () => {
  const clientEmail = process.env.CLIENT_EMAIL || process.env.client_email;
  const rawKey = process.env.PRIVATE_KEY || process.env.private_key || '';
  const formattedKey = rawKey
    .replace(/\\n/g, '\n')
    .replace(/\r/g, '')
    .replace(/\n+/g, '\n')
    .trim();

  if (!clientEmail || !formattedKey) {
    throw new Error('Faltan credenciales de Google Service Account (client_email / private_key)');
  }

  const jwtClient = new google.auth.JWT(
    clientEmail,
    null,
    formattedKey,
    SCOPES
  );

  return google.sheets({ version: 'v4', auth: jwtClient });
};

const findColumnIndex = (headers, candidateNames) => {
  const normalizedHeaders = headers.map(normalizeText);
  for (const candidate of candidateNames) {
    const normCandidate = normalizeText(candidate);
    const idx = normalizedHeaders.findIndex(
      (h) => h === normCandidate || h.includes(normCandidate) || normCandidate.includes(h)
    );
    if (idx !== -1) return idx;
  }
  return -1;
};

async function syncAllSheets() {
  console.log('=== Iniciando sincronización de indicadores desde Google Sheets ===');
  const centralSpreadsheetId = process.env.SPREADSHEET || process.env.spreadsheet;
  if (!centralSpreadsheetId) {
    throw new Error('Falta la variable de entorno SPREADSHEET o spreadsheet con el ID central.');
  }

  const configPath = path.join(__dirname, '..', 'config', 'dependenciasSheets.json');
  if (!fs.existsSync(configPath)) {
    throw new Error(`No se encontró el archivo de configuración en: ${configPath}`);
  }

  const dependenciasConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const activeDependencias = dependenciasConfig.filter((d) => d.enabled !== false);

  if (activeDependencias.length === 0) {
    console.log('No hay dependencias activas configuradas para sincronizar.');
    return {
      success: true,
      message: 'No hay dependencias activas configuradas para sincronizar.',
      dependencias: [],
    };
  }

  const sheets = getClient();

  // 1. Cargar catálogos centrales
  console.log('Cargando catálogos de la hoja central...');
  const [
    desafiosRes,
    ejesRes,
    convergentesRes,
    facultadRes,
    programasRes,
    resultadoRes,
    respondeARes,
    indicadoresRes,
    metasRes,
    avancesRes,
  ] = await Promise.all([
    sheets.spreadsheets.values.get({ spreadsheetId: centralSpreadsheetId, range: 'DESAFIOS!A1:B20' }),
    sheets.spreadsheets.values.get({ spreadsheetId: centralSpreadsheetId, range: 'EJES!A1:B10' }),
    sheets.spreadsheets.values.get({ spreadsheetId: centralSpreadsheetId, range: 'ESTRATEGIA_CONVERGENTE!A1:C60' }),
    sheets.spreadsheets.values.get({ spreadsheetId: centralSpreadsheetId, range: 'ESTRATEGIA_FACULTAD!A1:C60' }),
    sheets.spreadsheets.values.get({ spreadsheetId: centralSpreadsheetId, range: 'PROGRAMAS_INST!A1:C50' }),
    sheets.spreadsheets.values.get({ spreadsheetId: centralSpreadsheetId, range: 'INDICADORES_RESULTADO!A1:C350' }),
    sheets.spreadsheets.values.get({ spreadsheetId: centralSpreadsheetId, range: 'RESPONDE_A!A1:B20' }),
    sheets.spreadsheets.values.get({ spreadsheetId: centralSpreadsheetId, range: 'INDICADORES_PRODUCTO!A1:P600' }),
    sheets.spreadsheets.values.get({ spreadsheetId: centralSpreadsheetId, range: 'METAS!A1:J600' }),
    sheets.spreadsheets.values.get({ spreadsheetId: centralSpreadsheetId, range: 'AVANCES!A1:J600' }),
  ]);

  const desafiosRows = desafiosRes.data.values || [];
  const ejesRows = ejesRes.data.values || [];
  const convergentesRows = convergentesRes.data.values || [];
  const facultadRows = facultadRes.data.values || [];
  const programasRows = programasRes.data.values || [];
  const resultadoRows = resultadoRes.data.values || [];
  const respondeARows = respondeARes.data.values || [];
  const indicadoresRows = indicadoresRes.data.values || [];
  const metasRows = metasRes.data.values || [];
  const avancesRows = avancesRes.data.values || [];

  const indicadoresHeader = indicadoresRows[0] || [
    'id', 'id_dependencia', 'id_desafio', 'id_estrategia_convergente', 'id_estrategia_facultad',
    'id_programa_inst', 'id_indicador_resultado', 'id_periodo', 'objetivo_escuela', 'nombre',
    'id_responde_a', 'logro', 'responsable', 'suma_facultad', 'eje', 'numero_indicador'
  ];

  const metasHeader = metasRows[0] || [
    'id', 'id_indicador_producto', 'meta_2025', 'meta_2026', 'meta_2027', 'meta_2028', 'meta_2029', 'meta_2030', 'total_trienio', 'tipo'
  ];

  const extractCode = (text) => {
    // Busca patrones tipo 1.1.1 o 1.1
    const match = String(text ?? '').match(/\b\d+(\.\d+)+\b/);
    return match ? match[0] : '';
  };

  // Helper para buscar ID en catálogo por código (1.1, 1.1.1, 1.1.1.1), coincidencia de texto o ID numérico
  const findCatalogId = (rows, text, idCol = 0, titleCol = 1) => {
    if (!text) return '';
    const cleanText = normalizeText(text);

    // 1. Si tiene código de tipo 1.1, 1.1.1 o 1.1.1.1 (ej. "ESTRATEGÍA 1.1", "Programa 1.1.1", "1.1.2.1")
    const code = extractCode(text);
    if (code) {
      // 1.1 Coincidencia exacta de código en el título
      const matchCode = rows.slice(1).find((r) => {
        const titleCode = extractCode(r[titleCol]);
        return titleCode === code;
      });
      if (matchCode) return String(matchCode[idCol]);

      // 1.2 Si el código está delimitado en el texto del título (ej. " 1.1 " o " 1.1. ")
      const escapedCode = code.replace(/\./g, '\\.');
      const regex = new RegExp(`(^|\\s|[^0-9.])${escapedCode}(\\.|\\s|[^0-9.]|$)`);
      const matchRegex = rows.slice(1).find((r) => {
        const title = normalizeText(r[titleCol]);
        return regex.test(title);
      });
      if (matchRegex) return String(matchRegex[idCol]);
    }

    // 2. Coincidencia exacta de texto
    const exactMatch = rows.slice(1).find((r) => normalizeText(r[titleCol]) === cleanText);
    if (exactMatch) return String(exactMatch[idCol]);

    // 3. Coincidencia parcial si el texto del catálogo está contenido o viceversa
    const partialMatch = rows.slice(1).find((r) => {
      const title = normalizeText(r[titleCol]);
      return (cleanText.length > 5 && title.includes(cleanText)) || (title.length > 5 && cleanText.includes(title));
    });
    if (partialMatch) return String(partialMatch[idCol]);

    // 4. Si NO tiene código decimal y es solo un número (ej. "Desafío 1" -> "1")
    // Se condiciona a !code para evitar falsos positivos con códigos decimales (ej. "3.1" -> 3)
    if (!code) {
      const num = extractNumber(text);
      if (num) {
        const matchNum = rows.slice(1).find((r) => String(r[idCol]).trim() === num);
        if (matchNum) return String(matchNum[idCol]);
      }
    }

    return '';
  };

  // Mapear filas existentes de indicadores de producto
  const existingIndicadores = indicadoresRows.slice(1).map((r, idx) => ({
    rowIndex: idx + 2, // Fila en Google Sheets (1-based, encabezado es fila 1)
    id: String(r[0] || ''),
    id_dependencia: String(r[1] || ''),
    id_desafio: String(r[2] || ''),
    id_estrategia_convergente: String(r[3] || ''),
    id_estrategia_facultad: String(r[4] || ''),
    id_programa_inst: String(r[5] || ''),
    id_indicador_resultado: String(r[6] || ''),
    id_periodo: String(r[7] || ''),
    objetivo_escuela: String(r[8] || ''),
    nombre: String(r[9] || ''),
    id_responde_a: String(r[10] || ''),
    logro: String(r[11] || ''),
    responsable: String(r[12] || ''),
    suma_facultad: String(r[13] || ''),
    eje: String(r[14] || ''),
    numero_indicador: String(r[15] || '').trim(),
    raw: r,
  }));

  // Mapear filas de METAS
  const existingMetas = metasRows.slice(1).map((r, idx) => ({
    rowIndex: idx + 2,
    id: String(r[0] || ''),
    id_indicador_producto: String(r[1] || ''),
    meta_2025: r[2] ?? '',
    meta_2026: r[3] ?? '',
    meta_2027: r[4] ?? '',
    meta_2028: r[5] ?? '',
    meta_2029: r[6] ?? '',
    meta_2030: r[7] ?? '',
    total_trienio: r[8] ?? '',
    tipo: r[9] ?? '',
    raw: r,
  }));

  // Mapear filas de AVANCES
  const existingAvances = avancesRows.slice(1).map((r, idx) => ({
    rowIndex: idx + 2,
    id: String(r[0] || ''),
    id_indicador: String(r[1] || ''),
    avance_2025: r[2] ?? '',
    avance_2026: r[3] ?? '',
    avance_2027: r[4] ?? '',
    avance_2028: r[5] ?? '',
    avance_2029: r[6] ?? '',
    avance_2030: r[7] ?? '',
    raw: r,
  }));

  let maxIndicadorId = existingIndicadores.reduce((max, i) => Math.max(max, parseInt(i.id, 10) || 0), 0);
  let maxMetaId = existingMetas.reduce((max, m) => Math.max(max, parseInt(m.id, 10) || 0), 0);
  let maxAvanceId = existingAvances.reduce((max, a) => Math.max(max, parseInt(a.id, 10) || 0), 0);

  const newIndicadoresToAppend = [];
  const newMetasToAppend = [];
  const newAvancesToAppend = [];
  const indicadoresUpdates = [];
  const metasUpdates = [];
  const avancesUpdates = [];
  const summaryResults = [];

  // 2. Procesar cada dependencia
  for (const dep of activeDependencias) {
    console.log(`\n--- Procesando: ${dep.nombre} (ID Dep: ${dep.id_dependencia}) ---`);
    console.log(`Spreadsheet ID: ${dep.spreadsheetId}, Hoja: "${dep.sheetName}"`);

    let depData;
    let rowMetadata = [];
    let depSheetTitles = [];
    let findSheetTitle = () => null;

    try {
      // Leemos datos, metadatos de filas (para omitir filas ocultas) y títulos de pestañas
      const [res, metaRes, sheetInfoRes] = await Promise.all([
        sheets.spreadsheets.values.get({
          spreadsheetId: dep.spreadsheetId,
          range: `'${dep.sheetName}'!A2:Z300`,
        }),
        sheets.spreadsheets.get({
          spreadsheetId: dep.spreadsheetId,
          ranges: [`'${dep.sheetName}'!A1:A300`],
          fields: 'sheets(data(rowMetadata(hiddenByUser,hiddenByFilter)))',
        }),
        sheets.spreadsheets.get({
          spreadsheetId: dep.spreadsheetId,
          fields: 'sheets(properties(title))',
        }),
      ]);
      depData = res.data.values || [];
      rowMetadata = metaRes.data.sheets?.[0]?.data?.[0]?.rowMetadata || [];
      depSheetTitles = (sheetInfoRes.data.sheets || []).map((s) => s.properties.title);
      findSheetTitle = (targetName) => {
        const normTarget = String(targetName || '').replace(/\s+/g, ' ').trim().toLowerCase();
        if (!normTarget) return null;
        return depSheetTitles.find(
          (t) => t.replace(/\s+/g, ' ').trim().toLowerCase() === normTarget
        );
      };
    } catch (err) {
      console.error(`ERROR al leer la hoja de "${dep.nombre}":`, err.message);
      if (err.code === 403) {
        console.error(`👉 Asegúrate de compartir el sheet "${dep.spreadsheetId}" con: ${process.env.CLIENT_EMAIL || process.env.client_email}`);
      }
      continue;
    }

    if (depData.length < 2) {
      console.log('No se encontraron filas de datos en esta hoja.');
      continue;
    }

    // Combinar encabezados si están en dos filas (ej. fila 2 y fila 3)
    const rowA = depData[0] || [];
    const rowB = depData[1] || [];
    const maxCols = Math.max(rowA.length, rowB.length);
    const headers = [];
    for (let c = 0; c < maxCols; c++) {
      const valB = String(rowB[c] || '').trim();
      const valA = String(rowA[c] || '').trim();
      headers.push(valB || valA);
    }

    console.log(`Encabezados detectados (${headers.length} columnas)`);

    // Detección dinámica de índices de columnas
    const colNumInd = findColumnIndex(headers, ['N° de indicador', 'N° indicador', 'Numero de indicador', 'Nº de indicador', 'No de indicador', 'numero indicador']);
    const colNombre = findColumnIndex(headers, ['Indicador de producto', 'Indicador producto', 'Nombre Indicador', 'Nombre']);
    const colDesafio = findColumnIndex(headers, ['Desafío', 'Desafio']);
    const colConvergente = findColumnIndex(headers, ['Estrategías convergentes', 'Estrategia convergente', 'Estrategias convergentes']);
    const colEje = findColumnIndex(headers, ['Eje']);
    const colFacultad = findColumnIndex(headers, ['Estrategías facultad', 'Estrategia facultad', 'Estrategias facultad']);
    const colPrograma = findColumnIndex(headers, ['Programa', 'Programas inst', 'Programa institucional']);
    const colResultado = findColumnIndex(headers, ['Indicadores de resultado', 'Indicador de resultado', 'Indicador resultado']);
    const colLogro = findColumnIndex(headers, ['Logros al materializar el indicador', 'Logro', 'Logros']);
    const colRespondeA = findColumnIndex(headers, [
      'Fuente de información para:',
      'Fuente de información para',
      'Fuente de informacion para:',
      'Fuente de informacion para',
      'Fuente de información',
      'Fuente de informacion',
      'Responde a',
      'Responde A',
    ]);
    const col2026 = findColumnIndex(headers, ['2026']);
    const col2027 = findColumnIndex(headers, ['2027']);
    const col2028 = findColumnIndex(headers, ['2028']);
    const col2029 = findColumnIndex(headers, ['2029']);
    const col2030 = findColumnIndex(headers, ['2030']);
    const colTablaInfo = findColumnIndex(headers, [
      'Tabla de información',
      'Tabla de informacion',
      'Tabla de Información',
      'Tabla de Informacion',
      'Tabla información',
      'Tabla informacion',
      'Tabla info',
      'Tabla',
    ]);

    if (colNumInd === -1) {
      console.warn('⚠️ No se encontró la columna de "N° de indicador" en esta hoja. Saltando...');
      continue;
    }
    if (colNombre === -1) {
      console.warn('⚠️ No se encontró la columna de "Indicador de producto". Saltando...');
      continue;
    }

    // Determinar dónde inician los datos (si la segunda fila era parte del encabezado)
    let dataStartIndex = 1;
    if (depData.length > 2) {
      const valRowB = String(depData[1][colNumInd] || '').trim();
      if (!valRowB || isNaN(Number(valRowB))) {
        dataStartIndex = 2; // Inicia en la fila 4 (índice 2)
      }
    }

    // Pre-cargar celdas de avance (G2 del año 2026) desde las hojas referenciadas en "Tabla de información"
    const tablaRangesToFetch = [];
    const tablaTitleMap = new Map(); // normTabla -> realSheetTitle

    for (let r = dataStartIndex; r < depData.length; r++) {
      const sheetRowNum = r + 2;
      const isHidden = Boolean(
        rowMetadata[sheetRowNum - 1]?.hiddenByUser ||
        rowMetadata[sheetRowNum - 1]?.hiddenByFilter
      );
      if (isHidden) continue;

      const row = depData[r];
      if (!row || row.length === 0) continue;
      const rawTabla = colTablaInfo !== -1 ? String(row[colTablaInfo] ?? '').trim() : '';
      if (!rawTabla) continue;

      const normTabla = rawTabla.replace(/\s+/g, ' ').trim().toLowerCase();
      if (!tablaTitleMap.has(normTabla)) {
        const realTitle = findSheetTitle(rawTabla);
        if (realTitle) {
          tablaTitleMap.set(normTabla, realTitle);
          tablaRangesToFetch.push(`'${realTitle}'!G2`);
        }
      }
    }

    const avanceValueMap = new Map(); // normTabla -> valor formateado
    if (tablaRangesToFetch.length > 0) {
      try {
        const batchG2 = await sheets.spreadsheets.values.batchGet({
          spreadsheetId: dep.spreadsheetId,
          ranges: tablaRangesToFetch,
          valueRenderOption: 'FORMATTED_VALUE',
        });
        (batchG2.data.valueRanges || []).forEach((vr) => {
          const m = (vr.range || '').match(/'?([^'!]+)'?!/);
          const title = m ? m[1] : '';
          const normTitle = title.replace(/\s+/g, ' ').trim().toLowerCase();
          const val = vr.values && vr.values[0] && vr.values[0][0] !== undefined
            ? String(vr.values[0][0]).trim()
            : '';
          if (normTitle) {
            avanceValueMap.set(normTitle, val);
          }
        });
      } catch (errG2) {
        console.warn(`  ⚠️ No se pudieron leer las celdas G2 de "${dep.nombre}":`, errG2.message);
      }
    }

    let depRead = 0;
    let depUpdated = 0;
    let depInserted = 0;
    let depUnchanged = 0;
    let depHidden = 0;
    const depChangesLog = [];

    for (let r = dataStartIndex; r < depData.length; r++) {
      const sheetRowNum = r + 2; // Fila 1-indexed en Google Sheets
      const isHidden = Boolean(
        rowMetadata[sheetRowNum - 1]?.hiddenByUser ||
        rowMetadata[sheetRowNum - 1]?.hiddenByFilter
      );
      if (isHidden) {
        depHidden++;
        continue;
      }

      const row = depData[r];
      if (!row || row.length === 0) continue;

      const numInd = String(row[colNumInd] ?? '').trim();
      const nombre = String(row[colNombre] ?? '').trim();

      if (!numInd && !nombre) continue; // Fila vacía
      depRead++;

      // Mapear campos
      const rawDesafio = colDesafio !== -1 ? row[colDesafio] : '';
      const rawConvergente = colConvergente !== -1 ? row[colConvergente] : '';
      const rawEje = colEje !== -1 ? row[colEje] : '';
      const rawFacultad = colFacultad !== -1 ? row[colFacultad] : '';
      const rawPrograma = colPrograma !== -1 ? row[colPrograma] : '';
      const rawResultado = colResultado !== -1 ? row[colResultado] : '';
      const rawLogro = colLogro !== -1 ? row[colLogro] : '';
      const rawRespondeA = colRespondeA !== -1 ? row[colRespondeA] : '';

      const idDesafio = findCatalogId(desafiosRows, rawDesafio, 0, 1) || extractNumber(rawDesafio);
      const idEje = extractNumber(rawEje) || findCatalogId(ejesRows, rawEje, 0, 1);
      const idConvergente = findCatalogId(convergentesRows, rawConvergente, 0, 2);
      const idFacultad = findCatalogId(facultadRows, rawFacultad, 0, 2);
      const idPrograma = findCatalogId(programasRows, rawPrograma, 0, 2);
      const idResultado = findCatalogId(resultadoRows, rawResultado, 0, 2);
      const idRespondeA = findCatalogId(respondeARows, rawRespondeA, 0, 1);

      const meta2026 = col2026 !== -1 ? String(row[col2026] ?? '').trim() : '';
      const meta2027 = col2027 !== -1 ? String(row[col2027] ?? '').trim() : '';
      const meta2028 = col2028 !== -1 ? String(row[col2028] ?? '').trim() : '';
      const meta2029 = col2029 !== -1 ? String(row[col2029] ?? '').trim() : '';
      const meta2030 = col2030 !== -1 ? String(row[col2030] ?? '').trim() : '';

      // Buscar si existe en la BD central
      const existing = existingIndicadores.find(
        (i) =>
          String(i.id_dependencia) === String(dep.id_dependencia) &&
          String(i.numero_indicador) === String(numInd)
      );

      if (existing) {
        // DETECTAR CAMBIOS EN INDICADORES_PRODUCTO
        const indDiffs = [];
        const currentNombre = String(existing.nombre || '').trim();
        const currentLogro = String(existing.logro || '').trim();
        const currentEje = String(existing.eje || '').trim();
        const currentDesafio = String(existing.id_desafio || '').trim();
        const currentConvergente = String(existing.id_estrategia_convergente || '').trim();
        const currentFacultad = String(existing.id_estrategia_facultad || '').trim();
        const currentPrograma = String(existing.id_programa_inst || '').trim();
        const currentResultado = String(existing.id_indicador_resultado || '').trim();
        const currentRespondeA = String(existing.id_responde_a || '').trim();

        if (nombre && currentNombre !== nombre) {
          indDiffs.push(`Nombre: "${currentNombre}" -> "${nombre}"`);
        }
        if (rawLogro && currentLogro !== String(rawLogro).trim()) {
          indDiffs.push(`Logro: "${currentLogro || '(vacío)'}" -> "${String(rawLogro).trim()}"`);
        }
        if (idEje && currentEje !== idEje) {
          indDiffs.push(`Eje: "${currentEje || '(vacío)'}" -> "${idEje}"`);
        }
        if (idDesafio && currentDesafio !== idDesafio) {
          indDiffs.push(`Desafío ID: "${currentDesafio}" -> "${idDesafio}"`);
        }
        if (idConvergente && currentConvergente !== idConvergente) {
          indDiffs.push(`Estrategia Convergente ID: "${currentConvergente}" -> "${idConvergente}"`);
        }
        if (idFacultad && currentFacultad !== idFacultad) {
          indDiffs.push(`Estrategia Facultad ID: "${currentFacultad}" -> "${idFacultad}"`);
        }
        if (idPrograma && currentPrograma !== idPrograma) {
          indDiffs.push(`Programa ID: "${currentPrograma}" -> "${idPrograma}"`);
        }
        if (idResultado && currentResultado !== idResultado) {
          indDiffs.push(`Indicador Resultado ID: "${currentResultado}" -> "${idResultado}"`);
        }
        if (idRespondeA && currentRespondeA !== idRespondeA) {
          indDiffs.push(`Responde A ID: "${currentRespondeA}" -> "${idRespondeA}"`);
        }

        if (indDiffs.length > 0) {
          const updatedRow = [...(existing.raw || [])];
          while (updatedRow.length < 16) updatedRow.push('');

          updatedRow[0] = existing.id;
          updatedRow[1] = String(dep.id_dependencia);
          if (idDesafio) updatedRow[2] = idDesafio;
          if (idConvergente) updatedRow[3] = idConvergente;
          if (idFacultad) updatedRow[4] = idFacultad;
          if (idPrograma) updatedRow[5] = idPrograma;
          if (idResultado) updatedRow[6] = idResultado;
          if (nombre) updatedRow[9] = nombre;
          if (idRespondeA) updatedRow[10] = idRespondeA;
          if (rawLogro) updatedRow[11] = String(rawLogro).trim();
          if (idEje) updatedRow[14] = idEje;
          updatedRow[15] = numInd;

          indicadoresUpdates.push({
            range: `INDICADORES_PRODUCTO!A${existing.rowIndex}:P${existing.rowIndex}`,
            values: [updatedRow],
          });
        }

        // DETECTAR CAMBIOS EN METAS
        const existingMeta = existingMetas.find(
          (m) => String(m.id_indicador_producto) === String(existing.id)
        );

        const metaDiffs = [];
        if (existingMeta) {
          const cur2026 = String(existingMeta.meta_2026 ?? '').trim();
          const cur2027 = String(existingMeta.meta_2027 ?? '').trim();
          const cur2028 = String(existingMeta.meta_2028 ?? '').trim();
          const cur2029 = String(existingMeta.meta_2029 ?? '').trim();
          const cur2030 = String(existingMeta.meta_2030 ?? '').trim();

          if (meta2026 !== '' && cur2026 !== meta2026) metaDiffs.push(`2026: "${cur2026 || '-'}" -> "${meta2026}"`);
          if (meta2027 !== '' && cur2027 !== meta2027) metaDiffs.push(`2027: "${cur2027 || '-'}" -> "${meta2027}"`);
          if (meta2028 !== '' && cur2028 !== meta2028) metaDiffs.push(`2028: "${cur2028 || '-'}" -> "${meta2028}"`);
          if (meta2029 !== '' && cur2029 !== meta2029) metaDiffs.push(`2029: "${cur2029 || '-'}" -> "${meta2029}"`);
          if (meta2030 !== '' && cur2030 !== meta2030) metaDiffs.push(`2030: "${cur2030 || '-'}" -> "${meta2030}"`);

          if (metaDiffs.length > 0) {
            const metaRow = [...(existingMeta.raw || [])];
            while (metaRow.length < 10) metaRow.push('');
            metaRow[0] = existingMeta.id;
            metaRow[1] = existing.id;
            if (meta2026 !== '') metaRow[3] = meta2026;
            if (meta2027 !== '') metaRow[4] = meta2027;
            if (meta2028 !== '') metaRow[5] = meta2028;
            if (meta2029 !== '') metaRow[6] = meta2029;
            if (meta2030 !== '') metaRow[7] = meta2030;

            metasUpdates.push({
              range: `METAS!A${existingMeta.rowIndex}:J${existingMeta.rowIndex}`,
              values: [metaRow],
            });
          }
        }

        // DETECTAR CAMBIOS EN AVANCES (G2 del año 2026)
        const rawTabla = colTablaInfo !== -1 ? String(row[colTablaInfo] ?? '').trim() : '';
        const normTabla = rawTabla.replace(/\s+/g, ' ').trim().toLowerCase();
        const avance2026 = avanceValueMap.get(normTabla) ?? '';

        const existingAvance = existingAvances.find(
          (a) => String(a.id_indicador) === String(existing.id)
        );

        const avanceDiffs = [];
        if (existingAvance) {
          const cur2026Avance = String(existingAvance.avance_2026 ?? '').trim();
          if (avance2026 !== '' && cur2026Avance !== avance2026) {
            avanceDiffs.push(`Avance 2026: "${cur2026Avance || '-'}" -> "${avance2026}"`);
            const avanceRow = [...(existingAvance.raw || [])];
            while (avanceRow.length < 8) avanceRow.push('');
            avanceRow[0] = existingAvance.id;
            avanceRow[1] = existing.id;
            avanceRow[3] = avance2026;

            avancesUpdates.push({
              range: `AVANCES!A${existingAvance.rowIndex}:H${existingAvance.rowIndex}`,
              values: [avanceRow],
            });
          }
        } else if (avance2026 !== '') {
          maxAvanceId++;
          const newAvanceId = String(maxAvanceId);
          const newAvanceRow = [
            newAvanceId,
            existing.id,
            '', // avance_2025
            avance2026,
            '', // avance_2027
            '', // avance_2028
            '', // avance_2029
            '', // avance_2030
          ];
          newAvancesToAppend.push(newAvanceRow);
          avanceDiffs.push(`Avance 2026 (creado): "${avance2026}"`);
        }

        const allDiffs = [
          ...indDiffs,
          ...(metaDiffs.length > 0 ? [`Metas: [${metaDiffs.join(', ')}]`] : []),
          ...(avanceDiffs.length > 0 ? [`Avances: [${avanceDiffs.join(', ')}]`] : []),
        ];

        if (allDiffs.length > 0) {
          depChangesLog.push({
            type: 'UPDATE',
            numInd,
            id: existing.id,
            nombre: nombre || currentNombre,
            diffs: allDiffs,
          });
          depUpdated++;
        } else {
          depUnchanged++;
        }
      } else {
        // INSERTAR NUEVO INDICADOR
        maxIndicadorId++;
        const newIndId = String(maxIndicadorId);

        const newIndRow = [
          newIndId,
          String(dep.id_dependencia),
          idDesafio || '',
          idConvergente || '',
          idFacultad || '',
          idPrograma || '',
          idResultado || '',
          '1', // id_periodo por defecto
          '',  // objetivo_escuela
          nombre,
          idRespondeA || '1',
          rawLogro ? String(rawLogro).trim() : '',
          '',  // responsable
          'FALSE',
          idEje || '',
          numInd,
        ];

        newIndicadoresToAppend.push(newIndRow);

        // Crear fila de METAS
        maxMetaId++;
        const newMetaId = String(maxMetaId);
        const newMetaRow = [
          newMetaId,
          newIndId,
          '', // meta_2025
          meta2026,
          meta2027,
          meta2028,
          meta2029,
          meta2030,
          '', // total_trienio
          '', // tipo
        ];

        newMetasToAppend.push(newMetaRow);

        // Crear fila de AVANCES si hay avance disponible
        const rawTabla = colTablaInfo !== -1 ? String(row[colTablaInfo] ?? '').trim() : '';
        const normTabla = rawTabla.replace(/\s+/g, ' ').trim().toLowerCase();
        const avance2026 = avanceValueMap.get(normTabla) ?? '';

        if (avance2026 !== '') {
          maxAvanceId++;
          const newAvanceId = String(maxAvanceId);
          const newAvanceRow = [
            newAvanceId,
            newIndId,
            '', // avance_2025
            avance2026,
            '', // avance_2027
            '', // avance_2028
            '', // avance_2029
            '', // avance_2030
          ];
          newAvancesToAppend.push(newAvanceRow);
        }

        depChangesLog.push({
          type: 'INSERT',
          numInd,
          id: newIndId,
          nombre,
          diffs: [
            idEje ? `Eje: ${idEje}` : null,
            idDesafio ? `Desafío ID: ${idDesafio}` : null,
            `Metas [2026-2030]: [${[meta2026, meta2027, meta2028, meta2029, meta2030].map((v) => v || '-').join(', ')}]`,
            avance2026 ? `Avance 2026: "${avance2026}"` : null,
            rawLogro ? `Logro: "${String(rawLogro).trim()}"` : null,
          ].filter(Boolean),
        });
        depInserted++;
      }
    }

    console.log(`\nResumen para ${dep.nombre}:`);
    console.log(`  • Indicadores leídos en el sheet: ${depRead}`);
    console.log(`  • Con actualizaciones: ${depUpdated}`);
    console.log(`  • Nuevos creados: ${depInserted}`);
    console.log(`  • Sin cambios (al día): ${depUnchanged}`);
    if (depHidden > 0) {
      console.log(`  • Filas ocultas omitidas: ${depHidden}`);
    }

    if (depChangesLog.length > 0) {
      console.log('\n  Detalle de cambios aplicados:');
      depChangesLog.forEach((item) => {
        if (item.type === 'INSERT') {
          console.log(`    [+] NUEVO Indicador #${item.numInd} (ID Central: ${item.id}): "${item.nombre}"`);
          item.diffs.forEach((d) => console.log(`        ↳ ${d}`));
        } else {
          console.log(`    [~] ACTUALIZADO Indicador #${item.numInd} (ID Central: ${item.id}): "${item.nombre}"`);
          item.diffs.forEach((d) => console.log(`        ↳ ${d}`));
        }
      });
    } else {
      console.log('  (Todos los registros ya estaban sincronizados)');
    }

    summaryResults.push({
      id_dependencia: dep.id_dependencia,
      nombre: dep.nombre,
      read: depRead,
      updated: depUpdated,
      inserted: depInserted,
      unchanged: depUnchanged,
      hidden: depHidden,
      changes: depChangesLog,
    });
  }

  // 3. Aplicar actualizaciones por lote en la hoja central
  if (indicadoresUpdates.length > 0) {
    console.log(`\nAplicando ${indicadoresUpdates.length} actualizaciones en INDICADORES_PRODUCTO...`);
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: centralSpreadsheetId,
      resource: {
        valueInputOption: 'USER_ENTERED',
        data: indicadoresUpdates,
      },
    });
  }

  if (metasUpdates.length > 0) {
    console.log(`Aplicando ${metasUpdates.length} actualizaciones en METAS...`);
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: centralSpreadsheetId,
      resource: {
        valueInputOption: 'USER_ENTERED',
        data: metasUpdates,
      },
    });
  }

  if (avancesUpdates.length > 0) {
    console.log(`Aplicando ${avancesUpdates.length} actualizaciones en AVANCES...`);
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: centralSpreadsheetId,
      resource: {
        valueInputOption: 'USER_ENTERED',
        data: avancesUpdates,
      },
    });
  }

  // 4. Agregar nuevas filas si existen
  if (newIndicadoresToAppend.length > 0) {
    console.log(`Agregando ${newIndicadoresToAppend.length} nuevos registros a INDICADORES_PRODUCTO...`);
    await sheets.spreadsheets.values.append({
      spreadsheetId: centralSpreadsheetId,
      range: 'INDICADORES_PRODUCTO!A:P',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      resource: { values: newIndicadoresToAppend },
    });
  }

  if (newMetasToAppend.length > 0) {
    console.log(`Agregando ${newMetasToAppend.length} nuevos registros a METAS...`);
    await sheets.spreadsheets.values.append({
      spreadsheetId: centralSpreadsheetId,
      range: 'METAS!A:J',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      resource: { values: newMetasToAppend },
    });
  }

  if (newAvancesToAppend.length > 0) {
    console.log(`Agregando ${newAvancesToAppend.length} nuevos registros a AVANCES...`);
    await sheets.spreadsheets.values.append({
      spreadsheetId: centralSpreadsheetId,
      range: 'AVANCES!A:H',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      resource: { values: newAvancesToAppend },
    });
  }

  console.log('\n=== Sincronización completada exitosamente ===');

  return {
    success: true,
    message: 'Sincronización completada exitosamente',
    timestamp: new Date().toISOString(),
    totalIndicadoresActualizados: indicadoresUpdates.length,
    totalMetasActualizadas: metasUpdates.length,
    totalAvancesActualizados: avancesUpdates.length,
    totalNuevosIndicadores: newIndicadoresToAppend.length,
    totalNuevosAvances: newAvancesToAppend.length,
    dependencias: summaryResults,
  };
}

if (require.main === module) {
  syncAllSheets().catch((err) => {
    console.error('\n❌ ERROR durante la sincronización:', err);
    process.exit(1);
  });
}

module.exports = { syncAllSheets };
