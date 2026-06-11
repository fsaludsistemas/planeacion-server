import { Router } from "express";

import { 
    getAllSheetsData,
    createRow,
    updateRow,
    deleteRow,
    addIndicadorProducto,
    updateIndicadorProducto,
    deleteIndicadorProducto,
    addMeta,
    addAvance
} from "../controllers/sheetsController.js";

const router = Router();

router.get('/getAllSheetsData', getAllSheetsData);

// Rutas genéricas
router.post('/:sheetName', createRow);
router.put('/:sheetName/:id', updateRow);
router.delete('/:sheetName/:id', deleteRow);

// Rutas específicas para indicadores, metas y avances
router.post('/indicadores_producto', addIndicadorProducto);
router.put('/indicadores_producto/:id', updateIndicadorProducto);
router.delete('/indicadores_producto/:id', deleteIndicadorProducto);

router.post('/metas', addMeta);
router.post('/avances', addAvance);


export default router;