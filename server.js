import express from 'express';
import cors from 'cors';
import 'dotenv/config';

// Importación de controladores y middleware
import { login, registrar } from './controllers/authController.js';
import { obtenerIncidentes, crearEvidencia } from './controllers/incidentController.js';
import { verificarToken } from './middleware/authMiddleware.js';
import { crearAjustador } from './controllers/ajustadorController.js';
import { getAjustadores, getClientes } from './controllers/adminController.js';

// Herramientas de Google Cloud Vertex AI
import { PredictionServiceClient } from '@google-cloud/aiplatform';
import { helpers } from '@google-cloud/aiplatform';
import { getLogs } from './controllers/authController.js';

const app = express();

// --- MIDDLEWARES ---
// Configuramos CORS para permitir el header personalizado x-auth-token
app.use(cors({
    origin: '*', 
    allowedHeaders: ['Content-Type', 'x-auth-token']
}));

// Límite de 10mb para soportar el envío de imágenes en Base64
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// --- RUTA DE ANÁLISIS IA (Vertex AI) ---
app.post('/api/ia/analizar', verificarToken, async (req, res) => {
    try {
        const { imageBase64 } = req.body;

        if (!imageBase64) {
            return res.status(400).json({ success: false, msg: "No se proporcionó imagen" });
        }

        // Configuración de Google Cloud usando el archivo JSON y variables de entorno
        const clientOptions = {
            apiEndpoint: `${process.env.GCP_LOCATION}-aiplatform.googleapis.com`,
            keyFilename: './google-credentials.json' 
        };

        const predictionServiceClient = new PredictionServiceClient(clientOptions);
        
        // Construcción de la ruta del Endpoint
        const endpoint = `projects/${process.env.GCP_PROJECT_ID}/locations/${process.env.GCP_LOCATION}/endpoints/${process.env.GCP_ENDPOINT_ID}`;

        // Preparar la instancia para Vertex AI
        const instance = helpers.toValue({ content: imageBase64 });
        const instances = [instance];
        const parameters = helpers.toValue({});

        // Llamada a la predicción
        const [response] = await predictionServiceClient.predict({
            endpoint,
            instances,
            parameters,
        });

        if (!response.predictions || response.predictions.length === 0) {
            return res.status(500).json({ success: false, msg: "El modelo no devolvió predicciones" });
        }

        // --- EXTRACCIÓN ROBUSTA DE RESULTADOS ---
        // Manejamos la estructura de respuesta de Vertex AI (puede variar según la versión del SDK)
        const prediction = response.predictions[0];
        const resultFields = prediction.structValue ? prediction.structValue.fields : prediction;
        
        if (!resultFields.displayNames || !resultFields.confidences) {
            throw new Error("Estructura de predicción no reconocida");
        }

        const etiquetas = resultFields.displayNames.listValue.values;
        const confianzas = resultFields.confidences.listValue.values;

        let mayorConfianza = 0;
        let etiquetaFinal = "";

        // Buscamos el resultado con mayor probabilidad
        etiquetas.forEach((item, index) => {
            const valor = confianzas[index].numberValue;
            if (valor > mayorConfianza) {
                mayorConfianza = valor;
                etiquetaFinal = item.stringValue;
            }
        });

        res.json({
            success: true,
            analysis: {
                etiqueta: etiquetaFinal, 
                confianza: mayorConfianza
            }
        });

    } catch (error) {
        console.error("❌ Error en Vertex AI:", error.message);
        res.status(500).json({ 
            success: false, 
            msg: "Error al conectar con el servicio de IA de Google",
            error: error.message 
        });
    }
});

// --- RUTAS DE AUTENTICACIÓN Y ADMIN ---
app.post('/api/auth/login', login);
app.post('/api/auth/register', registrar);
app.get('/api/auth/ajustadores', getAjustadores);
app.get('/api/auth/clientes', getClientes);
app.post('/api/auth/ajustadores', crearAjustador);
app.post('/api/auth/ajustadores', crearAjustador); // Ruta para crear ajustadores, también protegida en producción
app.get('/api/auth/logs', getLogs); // Nueva ruta para obtener logs forenses, protegida con JWT

// --- RUTAS DE INCIDENTES (Protegidas con verificarToken) ---
app.get('/api/incidentes', verificarToken, obtenerIncidentes);
app.post('/api/evidencia', verificarToken, crearEvidencia);

// --- ARRANQUE DEL SERVIDOR ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`\n==============================================`);
    console.log(`🚀 Servidor ShieldLens activo en puerto ${PORT}`);
    console.log(`🤖 IA Proyecto: ${process.env.GCP_PROJECT_ID}`);
    console.log(`📡 Usando Endpoint: ${process.env.GCP_ENDPOINT_ID}`);
    console.log(`🔐 Credenciales: google-credentials.json`);
    console.log(`==============================================\n`);
});