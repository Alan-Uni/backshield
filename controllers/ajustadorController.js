import sql from 'mssql';
import bcrypt from 'bcrypt';
import { poolPromise } from '../config/db.js';

const sqlConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    server: process.env.DB_SERVER,
    options: {
        encrypt: true, // Necesario para Azure SQL
        trustServerCertificate: false
    }
};

export const crearAjustador = async (req, res) => {
    const { nombre, numero_empleado, rol, password } = req.body;

    try {
        // 1. Encriptar la contraseña
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        let pool = await sql.connect(sqlConfig);
        
        // 2. Insertar con el nuevo campo password_hash
        await pool.request()
            .input('nombre', sql.NVarChar, nombre)
            .input('num', sql.VarChar, numero_empleado)
            .input('rol', sql.VarChar, rol)
            .input('pass', sql.NVarChar, hashedPassword)
            .query(`INSERT INTO ajustadores (nombre, numero_empleado, rol, password_hash, is_deleted) 
                    VALUES (@nombre, @num, @rol, @pass, 0)`);

        res.status(201).json({ message: "Ajustador creado con éxito" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error al insertar ajustador" });
    }
};

/**
 * Obtener todas las reclamaciones con datos de cliente (Bandeja del Analista)
 */
export const obtenerIncidentesForense = async (req, res) => {
    // Usamos el ID del ajustador que viene en el token
    const id_ajustador = req.usuario.id; 

    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('idAjustador', sql.UniqueIdentifier, id_ajustador)
            .query(`
                SELECT DISTINCT
                    r.id_reclamacion, 
                    c.nombre_cifrado AS cliente, 
                    r.tipo_siniestro, 
                    r.score_confianza_ia, 
                    r.veredicto_ia,
                    r.estado_gestion
                FROM reclamaciones r
                INNER JOIN polizas p ON r.id_poliza = p.id_poliza
                INNER JOIN clientes c ON p.id_cliente = c.id_cliente
                LEFT JOIN imagenes_evidencia e ON r.id_reclamacion = e.id_reclamacion
                WHERE r.is_deleted = 0 
                AND (e.id_ajustador = @idAjustador OR r.estado_gestion = 'Pendiente')
                ORDER BY r.id_reclamacion DESC
            `);
        
        res.json({ success: true, data: result.recordset });
    } catch (error) {
        console.error("Error en obtenerIncidentesForense:", error);
        res.status(500).json({ success: false, message: "Error al consultar la bandeja forense" });
    }
};

export const actualizarEstadoReclamacion = async (req, res) => {
    const { id } = req.params; 
    const { decision } = req.body; 
    const id_ajustador = req.usuario.id; // El ID que viene del Token

    // 1. Mapeo de valores exactos según tus CONSTRAINTS
    let estado_reclamacion = '';
    let estado_gestion = '';

    if (decision === 'aprobar') {
        estado_reclamacion = 'Aprobado';
        estado_gestion = 'Finalizado';
    } else if (decision === 'fraude') {
        estado_reclamacion = 'Fraude';
        estado_gestion = 'Finalizado';
    } else if (decision === 'escalar') {
        estado_reclamacion = 'Pendiente';
        estado_gestion = 'En Revisión';
    } else {
        return res.status(400).json({ success: false, message: "Decisión no válida" });
    }

    try {
        const pool = await poolPromise;

        // 2. VALIDACIÓN DE IDENTIDAD: Verificar que el ajustador existe en la tabla ajustadores
        const checkUser = await pool.request()
            .input('aj_id', sql.UniqueIdentifier, id_ajustador)
            .query('SELECT id_ajustador FROM ajustadores WHERE id_ajustador = @aj_id');

        if (checkUser.recordset.length === 0) {
            return res.status(403).json({ 
                success: false, 
                message: `Acceso Denegado: El ID ${id_ajustador} no está registrado como Ajustador.` 
            });
        }

        // 3. ACTUALIZACIÓN SEGURA
        await pool.request()
            .input('id', sql.UniqueIdentifier, id)
            .input('reclamacion', sql.NVarChar(50), estado_reclamacion)
            .input('gestion', sql.NVarChar(50), estado_gestion)
            .input('ajustador', sql.UniqueIdentifier, id_ajustador)
            .query(`
                UPDATE reclamaciones 
                SET estado_reclamacion = @reclamacion, 
                    estado_gestion = @gestion,
                    id_ajustador = @ajustador
                WHERE id_reclamacion = @id
            `);

        res.json({ success: true, msg: "Dictamen ShieldLens guardado con éxito" });
    } catch (error) {
        console.error("Error en ShieldBD:", error.message);
        res.status(500).json({ success: false, message: "Error de consistencia en la base de datos." });
    }
};