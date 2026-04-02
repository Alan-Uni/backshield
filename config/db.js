import sql from 'mssql';
import 'dotenv/config';

const dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER, // e.g., shield-server.database.windows.net
    database: process.env.DB_DATABASE,
    options: {
        encrypt: true, // Necesario para Azure 
        trustServerCertificate: false
    }
};

export const poolPromise = new sql.ConnectionPool(dbConfig)
    .connect()
    .then(pool => {
        console.log('Conectado a Azure SQL');
        return pool;
    })
    .catch(err => {
        console.error('Error de conexión a la BD:', err);
        process.exit(1);
    });