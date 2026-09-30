import { BlobServiceClient } from '@azure/storage-blob';
import { v4 as uuidv4 } from 'uuid';

const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
const containerName = process.env.AZURE_CONTAINER_NAME;
const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);

export const uploadToAzure = async (file) => {
    const containerClient = blobServiceClient.getContainerClient(containerName);
    
    // Generamos un nombre único para evitar que se sobrescriban fotos
    const fileName = `${uuidv4()}-${file.originalname}`;
    const blockBlobClient = containerClient.getBlockBlobClient(fileName);

    // Subimos el buffer de la imagen
    await blockBlobClient.uploadData(file.buffer, {
        blobHTTPHeaders: { blobContentType: file.mimetype }
    });

    // Retornamos la URL pública (la que configuraste como tipo Blob)
    return blockBlobClient.url;
};