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