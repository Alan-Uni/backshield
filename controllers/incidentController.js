import { poolPromise } from '../config/db.js';
import { registrarEvento } from '../config/logger.js';
import sql from 'mssql';

/**
 * Obtener todas las reclamaciones (Bandeja del Analista)
 */
export const obtenerIncidentes = async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .query(`
                SELECT 
                    id_reclamacion, 
                    id_poliza, 
                    fecha_reclamacion, 
                    monto_reclamado, 
                    score_confianza_ia, 
                    veredicto_ia, 
                    estado_gestion,
                    tipo_siniestro,
                    descripcion_siniestro
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
 * Obtener Mis reclamaciones (Bandeja del Cliente)
 */

export const obtenerMisReclamaciones = async (req, res) => {
    const id_cliente = req.usuario.id; // Extraído del token por el middleware

    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('clienteId', sql.UniqueIdentifier, id_cliente)
            .query(`
                SELECT 
                    r.id_reclamacion, 
                    r.tipo_siniestro, 
                    r.fecha_reclamacion, 
                    r.estado_reclamacion, 
                    r.id_poliza,
                    r.veredicto_ia
                FROM reclamaciones r
                INNER JOIN polizas p ON r.id_poliza = p.id_poliza
                WHERE p.id_cliente = @clienteId AND r.is_deleted = 0
                ORDER BY r.fecha_reclamacion DESC
            `);
        
        res.json({ success: true, data: result.recordset });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error al obtener tus reclamos" });
    }
};

export const obtenerDetalleReclamacion = async (req, res) => {
    const { id } = req.params;

    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('id', sql.UniqueIdentifier, id)
            .query(`
                SELECT 
                    id_reclamacion, 
                    tipo_siniestro, 
                    fecha_reclamacion, 
                    monto_reclamado, 
                    estado_reclamacion, 
                    veredicto_ia,
                    score_confianza_ia,
                    descripcion_siniestro
                FROM reclamaciones 
                WHERE id_reclamacion = @id AND is_deleted = 0
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ success: false, msg: "Reclamación no encontrada" });
        }

        res.json({ success: true, data: result.recordset[0] });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error al obtener el detalle" });
    }
};

/**
 * Crear una reclamación completa (Flujo Híbrido: Cliente o Ajustador)
 */
export const crearReclamacionCompleta = async (req, res) => {
    const { 
        monto_reclamado, 
        score_confianza_ia, 
        veredicto_ia,
        tipo_siniestro,       // <--- NUEVO
        descripcion_siniestro, // <--- NUEVO
        referencia_poliza 
    } = req.body;
    
    const id_usuario = req.usuario?.id; 
    const tipo_usuario = req.usuario?.tipo; 

    if (!id_usuario) {
        return res.status(401).json({ success: false, msg: "Sesión no identificada" });
    }

    try {
        const pool = await poolPromise;
        let id_poliza_final = null;

        if (tipo_usuario === 'Cliente') {
            const polizaRes = await pool.request()
                .input('clienteId', sql.UniqueIdentifier, id_usuario)
                .query(`
                    SELECT TOP 1 id_poliza 
                    FROM polizas 
                    WHERE CAST(id_cliente AS VARCHAR(50)) = CAST(@clienteId AS VARCHAR(50)) 
                    AND is_deleted = 0
                `);

            if (polizaRes.recordset.length === 0) {
                return res.status(404).json({ success: false, msg: "No se encontró una póliza activa para su cuenta" });
            }
            id_poliza_final = polizaRes.recordset[0].id_poliza;
        } else {
            id_poliza_final = referencia_poliza;
        }

        await pool.request()
            .input('poliza', sql.UniqueIdentifier, id_poliza_final)
            .input('monto', sql.Decimal(18, 2), monto_reclamado)
            .input('score', sql.Float, score_confianza_ia)
            .input('veredicto', sql.VarChar(30), veredicto_ia)
            .input('tipo', sql.VarChar(50), tipo_siniestro)           // <--- NUEVO
            .input('desc', sql.NVarChar(sql.MAX), descripcion_siniestro) // <--- NUEVO
            .query(`
                INSERT INTO reclamaciones (
                    id_reclamacion, id_poliza, fecha_reclamacion, 
                    monto_reclamado, estado_reclamacion, is_deleted, 
                    score_confianza_ia, veredicto_ia, estado_gestion,
                    tipo_siniestro, descripcion_siniestro
                ) 
                VALUES (
                    NEWID(), @poliza, SYSUTCDATETIME(), 
                    @monto, 'Pendiente', 0, @score, @veredicto, 'Pendiente',
                    @tipo, @desc
                );
            `);

        await registrarEvento({
            usuarioId: id_usuario,
            accion: `Siniestro (${tipo_siniestro}) reportado por ${tipo_usuario}`,
            resultado: 'éxito',
            modulo: 'incidentController'
        });

        res.status(201).json({ 
            success: true, 
            msg: `Reclamación de ${tipo_usuario} procesada exitosamente` 
        });

    } catch (error) {
        console.error("❌ Error en crearReclamacionCompleta:", error.message);
        res.status(500).json({ success: false, msg: "Error interno al guardar en la base de datos" });
    }
};

/* export const crearEvidencia = async (req, res) => {
    const { id_reclamacion, url_imagen } = req.body;
    const usuarioId = req.usuario?.id;

    try {
        const pool = await poolPromise;
        await pool.request()
            .input('reclamacion', sql.UniqueIdentifier, id_reclamacion)
            .input('url', sql.NVarChar, url_imagen)
            .query(`INSERT INTO evidencias_fotos (id_evidencia, id_reclamacion, url_storage) VALUES (NEWID(), @reclamacion, @url)`);

        await registrarEvento({
            usuarioId,
            accion: 'Carga de Evidencia Visual',
            resultado: 'éxito',
            modulo: 'incidentController'
        });

        res.status(201).json({ success: true, msg: "Evidencia vinculada correctamente" });
    } catch (error) {
        res.status(500).json({ success: false, msg: "Error al registrar evidencia" });
    }
}; */

export const crearEvidencia = async (req, res) => {
    try {
        // 1. Validar que venga un archivo
        if (!req.file) return res.status(400).json({ message: "No se subió ninguna imagen" });

        // 2. Subir a Azure y obtener la URL
        const urlAzure = await uploadToAzure(req.file);

        // 3. Datos del cuerpo de la petición (Asegúrate de enviarlos desde el Postman/Frontend)
        const { id_reclamacion, id_ajustador } = req.body;
        const scoreIA = 0.85; // Aquí irá la respuesta de Vertex AI después

        // 4. Insertar en SQL Server
        let pool = await sql.connect(); // Usa tu config de conexión
        await pool.request()
            .input('id_reclamacion', sql.UniqueIdentifier, id_reclamacion)
            .input('id_ajustador', sql.UniqueIdentifier, id_ajustador)
            .input('url', sql.NVarChar(sql.MAX), urlAzure) // Coincide con nvarchar(MAX)
            .input('score', sql.Float, scoreIA) // Coincide con float
            .query(`
                INSERT INTO imagenes_evidencia 
                (id_evidencia, id_reclamacion, id_ajustador, url_storage_imagen, resultado_automl_score)
                VALUES 
                (NEWID(), @id_reclamacion, @id_ajustador, @url, @score)
            `);

        res.status(201).json({
            success: true,
            message: "Evidencia guardada en Azure y SQL",
            url: urlAzure
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error en el servidor" });
    }
};

// Busca la función obtenerIncidentes2 y reemplaza la consulta SQL:
export const obtenerIncidentes2 = async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .query(`
                SELECT 
                    r.id_reclamacion, 
                    r.fecha_reclamacion, 
                    r.tipo_siniestro,
                    r.monto_reclamado, 
                    r.score_confianza_ia, 
                    r.veredicto_ia, 
                    r.estado_gestion,
                    c.nombre_cifrado AS nombre_cliente -- Usamos nombre_cifrado de la tabla clientes
                FROM reclamaciones r
                INNER JOIN polizas p ON r.id_poliza = p.id_poliza
                INNER JOIN clientes c ON p.id_cliente = c.id_cliente -- Unión correcta según tu BD
                WHERE r.is_deleted = 0
                ORDER BY r.fecha_reclamacion DESC
            `);
        
        res.json({ success: true, data: result.recordset });
    } catch (error) {
        console.error("❌ Error en obtenerIncidentes2:", error.message);
        res.status(500).json({ success: false, message: "Error al consultar incidentes en la base de datos" });
    }
};

