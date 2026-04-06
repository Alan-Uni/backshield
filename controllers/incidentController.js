import { poolPromise } from '../config/db.js';
import { registrarEvento } from '../config/logger.js';
import sql from 'mssql';

/**
 * Obtener todas las reclamaciones (Bandeja del Analista)
 */
export const obtenerIncidentes = async (req, res) => {
    try {
        const pool = await poolPromise;
        // Solo traemos lo que no esté borrado lógicamente
        const result = await pool.request()
            .query(`
                SELECT 
                    id_reclamacion, 
                    referencia_poliza, 
                    fecha_reclamacion, 
                    monto_reclamado, 
                    score_confianza_ia, 
                    veredicto_ia, 
                    estado_gestion 
                FROM reclamaciones 
                WHERE is_deleted = 0
                ORDER BY fecha_reclamacion DESC
            `);
        
        res.json(result.recordset);
    } catch (error) {
        console.error("Error al obtener incidentes:", error);
        res.status(500).json({ success: false, message: "Error al consultar incidentes" });
    }
};

/**
 * Crear una reclamación completa (Flujo del Ajustador)
 * Esta función recibe los datos del formulario y el resultado de la IA
 */
export const crearReclamacionCompleta = async (req, res) => {
    const { 
        referencia_poliza, 
        monto_reclamado, 
        score_confianza_ia, 
        veredicto_ia 
    } = req.body;
    
    // El id_ajustador viene del token decodificado por el middleware verificarToken
    const id_ajustador = req.usuario.id; 

    try {
        const pool = await poolPromise;
        
        // 1. Insertar la reclamación principal
        const result = await pool.request()
            .input('ajustador', sql.UniqueIdentifier, id_ajustador)
            .input('poliza', sql.VarChar(50), referencia_poliza)
            .input('monto', sql.Decimal(18, 2), monto_reclamado)
            .input('score', sql.Float, score_confianza_ia)
            .input('veredicto', sql.VarChar(30), veredicto_ia)
            .query(`
                INSERT INTO reclamaciones (
                    id_reclamacion, 
                    id_ajustador, 
                    referencia_poliza, 
                    fecha_reclamacion, 
                    monto_reclamado, 
                    estado_reclamacion, 
                    is_deleted, 
                    score_confianza_ia, 
                    veredicto_ia, 
                    estado_gestion
                ) 
                VALUES (
                    NEWID(), 
                    @ajustador, 
                    @poliza, 
                    SYSUTCDATETIME(), 
                    @monto, 
                    'Pendiente', 
                    0, 
                    @score, 
                    @veredicto, 
                    'Pendiente'
                );
            `);

        // 2. Registrar el evento en los logs forenses para auditoría
        await registrarEvento({
            usuarioId: id_ajustador,
            accion: 'Creación de Reclamación Forense',
            resultado: 'éxito',
            modulo: 'incidentController'
        });

        res.status(201).json({ 
            success: true, 
            msg: "Reclamación procesada y guardada exitosamente" 
        });

    } catch (error) {
        console.error("Error en crearReclamacionCompleta:", error);
        res.status(500).json({ 
            success: false, 
            msg: "Error al guardar la reclamación en la base de datos" 
        });
    }
};

/**
 * Guardar evidencia fotográfica (Vinculada a una reclamación)
 */
export const crearEvidencia = async (req, res) => {
    const { id_reclamacion, url_imagen } = req.body;
    const usuarioId = req.usuario.id;

    try {
        const pool = await poolPromise;
        await pool.request()
            .input('reclamacion', sql.UniqueIdentifier, id_reclamacion)
            .input('url', sql.NVarChar, url_imagen)
            .query(`
                INSERT INTO evidencias_fotos (id_evidencia, id_reclamacion, url_storage) 
                VALUES (NEWID(), @reclamacion, @url)
            `);

        await registrarEvento({
            usuarioId,
            accion: 'Carga de Evidencia Visual',
            resultado: 'éxito',
            modulo: 'incidentController'
        });

        res.status(201).json({ success: true, msg: "Evidencia guardada" });
    } catch (error) {
        console.error("Error en crearEvidencia:", error);
        res.status(500).json({ success: false, msg: "Error al cargar evidencia" });
    }
};