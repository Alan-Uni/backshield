import express from 'express';
import cors from 'cors';
import { login } from './controllers/authController.js';

const app = express();
app.use(cors());
app.use(express.json());

// Endpoint para tu formulario de React
app.post('/api/auth/login', login);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Servidor ShieldLens en puerto ${PORT}`));