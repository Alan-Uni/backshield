import sql from 'mssql';
import bcrypt from 'bcrypt';

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