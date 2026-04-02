import { poolPromise } from '../config/db.js';
import { registrarEvento } from '../config/logger.js';
import sql from 'mssql';

export const obtenerIncidentes = async (req, res) => {
    try {
        const pool = await poolPromise;
        // Aplicamos borrado lógico: solo traemos lo que no esté marcado como eliminado
        const result = await pool.request()
            .query('SELECT * FROM reclamaciones WHERE is_deleted = 0');
        
        res.json(result.recordset);
    } catch (error) {
        res.status(500).json({ message: "Error al consultar incidentes" });
    }
};

export const crearEvidencia = async (req, res) => {
    const { id_reclamacion, url_imagen, hash_archivo } = req.body;
    const usuarioId = req.user.id;

    try {
        const pool = await poolPromise;
        await pool.request()
            .input('reclamacion', sql.UniqueIdentifier, id_reclamacion)
            .input('url', sql.NVarChar, url_imagen)
            .input('hash', sql.Char(64), hash_archivo) // Requerimiento: Integridad forense
            .query(`INSERT INTO imagenes_evidencia (id_evidencia, id_reclamacion, url_storage_imagen, hash_sha256) 
                    VALUES (NEWID(), @reclamacion, @url, @hash)`);

        await registrarEvento({
            usuarioId,
            accion: 'Carga de Evidencia Visual',
            resultado: 'éxito',
            ip: req.ip
        });

        res.status(201).json({ message: "Evidencia registrada con éxito" });
    } catch (error) {
        res.status(500).json({ message: "Error al registrar evidencia" });
    }
};