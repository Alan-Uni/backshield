import sql from 'mssql';

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

// Obtener todos los Ajustadores
export const getAjustadores = async (req, res) => {
    try {
        let pool = await sql.connect(sqlConfig);
        const result = await pool.request()
            .query(`SELECT id_ajustador, nombre, numero_empleado, rol, is_deleted 
                    FROM ajustadores`);

        res.json(result.recordset);
    } catch (error) {
        console.error("Error en getAjustadores:", error);
        res.status(500).json({ message: "Error al obtener la lista de ajustadores" });
    }
};

// Obtener todos los Clientes (Cifrados)
export const getClientes = async (req, res) => {
    try {
        let pool = await sql.connect(sqlConfig);
        const result = await pool.request()
            .query(`SELECT id_cliente, nombre_cifrado, email_cifrado, telefono, is_deleted 
                    FROM clientes`);

        res.json(result.recordset);
    } catch (error) {
        console.error("Error en getClientes:", error);
        res.status(500).json({ message: "Error al obtener la lista de clientes" });
    }
};