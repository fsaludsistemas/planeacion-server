import { Router } from "express";
import multer from "multer";

import { 
    getAllSheetsData,
    exportToGoogleDocs,
    createRow,
    updateRow,
    deleteRow,
    addIndicadorProducto,
    updateIndicadorProducto,
    deleteIndicadorProducto,
    addMeta,
    addAvance,
    saveEvidenciaWithImportRange,
    updateFileInDrive,
    deleteFileFromDrive
} from "../controllers/sheetsController.js";

const router = Router();
const uploadMiddleware = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 },
}).single('file');

router.get('/getAllSheetsData', getAllSheetsData);
router.post('/export-docs', exportToGoogleDocs);

router.post('/evidencias/:id', saveEvidenciaWithImportRange);
router.put('/upload-drive/:fileId', uploadMiddleware, updateFileInDrive);
router.delete('/upload-drive/:fileId', deleteFileFromDrive);

// Rutas específicas para indicadores, metas y avances
router.post('/indicadores_producto', addIndicadorProducto);
router.put('/indicadores_producto/:id', updateIndicadorProducto);
router.delete('/indicadores_producto/:id', deleteIndicadorProducto);

router.post('/metas', addMeta);
router.post('/avances', addAvance);

// Rutas genéricas
router.post('/:sheetName', createRow);
router.put('/:sheetName/:id', updateRow);
router.delete('/:sheetName/:id', deleteRow);


export default router;