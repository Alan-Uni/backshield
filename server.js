import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { login } from './controllers/authController.js';
import { obtenerIncidentes, crearEvidencia } from './controllers/incidentController.js';
import { verificarToken } from './middleware/authMiddleware.js';

const app = express();
app.use(cors());
app.use(express.json());

// Ruta Pública
app.post('/api/auth/login', login);

// Rutas Protegidas (Requieren JWT)
app.get('/api/incidentes', verificarToken, obtenerIncidentes);
app.post('/api/evidencia', verificarToken, crearEvidencia);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Servidor de Seguridad ShieldLens activo en puerto ${PORT}`);
});