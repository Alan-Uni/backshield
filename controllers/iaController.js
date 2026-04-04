import { PredictionServiceClient } from '@google-cloud/aiplatform';
import { helpers } from '@google-cloud/aiplatform';

export const analizarImagen = async (req, res) => {
    try {
        const { imageBase64 } = req.body;

        if (!imageBase64) {
            return res.status(400).json({ success: false, msg: "No se proporcionó imagen" });
        }

        // Configuración de Google Cloud desde el .env
        const clientOptions = {
            apiEndpoint: `${process.env.GCP_LOCATION}-aiplatform.googleapis.com`,
        };

        const predictionServiceClient = new PredictionServiceClient(clientOptions);
        const endpoint = `projects/${process.env.GCP_PROJECT_ID}/locations/${process.env.GCP_LOCATION}/endpoints/${process.env.GCP_ENDPOINT_ID}`;

        // Preparar la instancia para el modelo (Formato específico de Vertex AI)
        const instance = helpers.toValue({
            content: imageBase64,
        });
        const instances = [instance];
        const parameters = helpers.toValue({});

        const [response] = await predictionServiceClient.predict({
            endpoint,
            instances,
            parameters,
        });

        // Vertex AI devuelve un array de predicciones
        // Normalmente: { displayNames: ['Falsas', 'Reales'], confidences: [0.99, 0.01] }
        const prediction = response.predictions[0].structValue.fields;
        
        const etiquetas = prediction.displayNames.listValue.values;
        const confianzas = prediction.confidences.listValue.values;

        // Buscamos el resultado con mayor confianza
        let mayorConfianza = 0;
        let etiquetaFinal = "";

        etiquetas.forEach((item, index) => {
            if (confianzas[index].numberValue > mayorConfianza) {
                mayorConfianza = confianzas[index].numberValue;
                etiquetaFinal = item.stringValue;
            }
        });

        res.json({
            success: true,
            analysis: {
                etiqueta: etiquetaFinal, // "Falsas" o "Reales"
                confianza: mayorConfianza
            }
        });

    } catch (error) {
        console.error("Error en Vertex AI:", error);
        res.status(500).json({ success: false, msg: "Error al procesar la imagen con IA" });
    }
};