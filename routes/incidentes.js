// routes/incidentes.js
import { Router } from 'express';
import multer from 'multer';
import * as incidentController from '../controllers/incidentController.js';
import auth from '../middleware/authMiddleware.js'; // Verifica que el nombre sea exacto

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// AQUÍ VA LA RUTA. 
// El nombre 'imagen' debe coincidir con formData.append('imagen', ...) del front.
router.post('/crear', auth, upload.single('imagen'), incidentController.crearReclamacionCompleta);

export default router;