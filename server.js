import express from 'express';
import cors from 'cors';
import 'dotenv/config';

// --- LIBRERÍA PARA LA EXPLICACIÓN ---
import { GoogleGenerativeAI } from "@google/generative-ai";

// Importación de controladores y middleware
import { login, registrar, obtenerPerfilCliente } from './controllers/authController.js';
import { obtenerIncidentes, crearEvidencia, crearReclamacionCompleta } from './controllers/incidentController.js';
import { verificarToken } from './middleware/authMiddleware.js';
import { crearAjustador } from './controllers/ajustadorController.js';
import { getAjustadores, getClientes } from './controllers/adminController.js';
import { obtenerMisReclamaciones } from './controllers/incidentController.js';
import { obtenerDetalleReclamacion } from './controllers/incidentController.js'; 
import { obtenerIncidentesForense } from './controllers/ajustadorController.js'; 
import { obtenerIncidentes2 } from './controllers/incidentController.js';  
import { obtenerDetalleForense } from './controllers/incidentController.js';
import { actualizarEstadoReclamacion } from './controllers/ajustadorController.js';

// Herramientas de Google Cloud Vertex AI
import { PredictionServiceClient } from '@google-cloud/aiplatform';
import { helpers } from '@google-cloud/aiplatform';
import { getLogs } from './controllers/authController.js';
import multer from 'multer';

const upload = multer({ storage: multer.memoryStorage() });
const app = express();

// --- CONFIGURACIÓN GEMINI (HARDCODED PARA EVITAR ERRORES DE LLAVE) ---
// Nota: Usamos la llave que generaste en AI Studio directamente
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const modelGemini = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

// --- MIDDLEWARES ---
app.use(cors({
    origin: '*', 
    allowedHeaders: ['Content-Type', 'x-auth-token']
}));

// Límites para soportar Base64 de fotos
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// --- FUNCIÓN AUXILIAR: GENERAR JUSTIFICACIÓN CON GEMINI ---
async function generarJustificacion(imageBase64, resultadoIA, confianza) {
    const prompt = `
      Actúa como un perito experto en fraudes de seguros automotrices.
      El sistema de detección ha clasificado esta imagen como: ${resultadoIA === 'Falsas' ? 'Sospecha de Fraude' : 'Siniestro Real'} con una confianza del ${confianza}%.
      
      Tu tarea es:
      1. Analizar la imagen visualmente.
      2. Si el resultado es Fraude, explica qué inconsistencias visuales hay (ej. sombras, edición, fotos de pantallas, daños irreales).
      3. Si es Real, describe brevemente los daños que validan el caso.
      
      Da una respuesta técnica, directa y sin saludos, máximo 3 líneas.
    `;

    const imagePart = {
        inlineData: {
            data: imageBase64,
            mimeType: "image/jpeg"
        }
    };

    try {
        const result = await modelGemini.generateContent([prompt, imagePart]);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error("❌ Error real en Gemini:", error);
        return "Análisis técnico de soporte no disponible por el momento.";
    }
}

// --- RUTA DE ANÁLISIS IA (Vertex AI + Gemini) ---
app.post('/api/ia/analizar', verificarToken, async (req, res) => {
    try {
        const { imageBase64 } = req.body;

        if (!imageBase64) {
            return res.status(400).json({ success: false, msg: "No se proporcionó imagen" });
        }

        // 1. CONFIGURACIÓN VERTEX AI
        const clientOptions = {
            apiEndpoint: `${process.env.GCP_LOCATION}-aiplatform.googleapis.com`,
            keyFilename: './google-credentials.json' 
        };

        const predictionServiceClient = new PredictionServiceClient(clientOptions);
        const endpoint = `projects/${process.env.GCP_PROJECT_ID}/locations/${process.env.GCP_LOCATION}/endpoints/${process.env.GCP_ENDPOINT_ID}`;

        const instance = helpers.toValue({ content: imageBase64 });
        const instances = [instance];
        const parameters = helpers.toValue({});

        // 2. LLAMADA A PREDICCIÓN (VERTEX AI)
        const [response] = await predictionServiceClient.predict({
            endpoint,
            instances,
            parameters,
        });

        if (!response.predictions || response.predictions.length === 0) {
            return res.status(500).json({ success: false, msg: "El modelo no devolvió predicciones" });
        }

        const prediction = response.predictions[0];
        const resultFields = prediction.structValue ? prediction.structValue.fields : prediction;
        
        if (!resultFields.displayNames || !resultFields.confidences) {
            throw new Error("Estructura de predicción no reconocida");
        }

        const etiquetas = resultFields.displayNames.listValue.values;
        const confianzas = resultFields.confidences.listValue.values;

        let mayorConfianza = 0;
        let etiquetaFinal = "";

        etiquetas.forEach((item, index) => {
            const valor = confianzas[index].numberValue;
            if (valor > mayorConfianza) {
                mayorConfianza = valor;
                etiquetaFinal = item.stringValue;
            }
        });

        // 3. LLAMADA A GEMINI PARA LA JUSTIFICACIÓN
        const justificacion = await generarJustificacion(
            imageBase64, 
            etiquetaFinal, 
            (mayorConfianza * 100).toFixed(1)
        );

        // 4. RESPUESTA FINAL AL FRONTEND
        res.json({
            success: true,
            analysis: {
                etiqueta: etiquetaFinal, 
                confianza: mayorConfianza,
                justificacion: justificacion 
            }
        });

    } catch (error) {
        console.error("❌ Error en el flujo de IA:", error.message);
        res.status(500).json({ 
            success: false, 
            msg: "Error al procesar la IA",
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
app.get('/api/auth/logs', getLogs); 

// --- RUTAS DE INCIDENTES ---
app.post('/api/incidentes/crear', verificarToken, upload.single('imagen'), crearReclamacionCompleta);
app.get('/api/incidentes/mis-reclamaciones', verificarToken, obtenerMisReclamaciones);
app.get('/api/incidentes/detalle/:id', verificarToken, obtenerDetalleReclamacion); 
app.get('/api/incidentes/general', verificarToken, obtenerIncidentes2); 
app.get('/api/incidentes/detalle-forense/:id', verificarToken, obtenerDetalleForense);
app.put('/api/incidentes/actualizar-estado/:id', verificarToken, actualizarEstadoReclamacion);
app.get('/api/incidentes', verificarToken, obtenerIncidentes);
app.post('/api/evidencia', verificarToken, crearEvidencia );
app.get('/api/incidentes/perfil-cliente', verificarToken, obtenerPerfilCliente);

// --- ARRANQUE DEL SERVIDOR ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`\n==============================================`);
    console.log(`🚀 Servidor ShieldLens activo en puerto ${PORT}`);
    console.log(`✨ Gemini Explicabilidad: Hardcoded Active`);
    console.log(`🔐 Credenciales Vertex: google-credentials.json`);
    console.log(`==============================================\n`);
});