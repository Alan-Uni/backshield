import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { login } from './controllers/authController.js';
import { registrar } from './controllers/authController.js';
import { obtenerIncidentes, crearEvidencia } from './controllers/incidentController.js';
import { verificarToken } from './middleware/authMiddleware.js';
import { crearAjustador } from './controllers/ajustadorController.js';
import { getAjustadores } from './controllers/adminController.js';
import { getClientes } from './controllers/adminController.js';

const app = express();
app.use(cors());
app.use(express.json());

// Ruta Pública
app.post('/api/auth/login', login);
app.post('/api/auth/register', registrar);
app.get('/api/auth/ajustadores', getAjustadores);
app.get('/api/auth/clientes', getClientes);
app.post('/api/auth/ajustadores', crearAjustador); // Ruta para crear ajustadores, también protegida en producción

// Rutas Protegidas (Requieren JWT)
app.get('/api/incidentes', verificarToken, obtenerIncidentes);
app.post('/api/evidencia', verificarToken, crearEvidencia);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Servidor de Seguridad ShieldLens activo en puerto ${PORT}`);
});