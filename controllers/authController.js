import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { poolPromise } from '../config/db.js';
import { registrarEvento } from '../config/logger.js';
import sql from 'mssql';

// En controllers/authController.js
const sqlConfig = {
    user: process.env.DB_USER,        // Antes decía SQL_USER
    password: process.env.DB_PASSWORD, // Antes decía SQL_PASSWORD
    database: process.env.DB_DATABASE, // Antes decía SQL_DATABASE
    server: process.env.DB_SERVER,     // Antes decía SQL_SERVER
    options: {
        encrypt: true, 
        trustServerCertificate: false 
    }
};

export const login = async (req, res) => {
    const { identificador, password } = req.body;
    const ip = req.ip || req.headers['x-forwarded-for'] || '0.0.0.0';

    try {
        let pool = await sql.connect(sqlConfig);
        let user = null;
        let tipoUsuario = '';

        // 1. Intentar buscar en AJUSTADORES (usa numero_empleado o email si lo agregaste)
        // Nota: Basado en tu código previo, ajustadores usa 'numero_empleado' como identificador
        const resultAjustador = await pool.request()
            .input('identificador', sql.VarChar, identificador) 
            .query('SELECT * FROM ajustadores WHERE (numero_empleado = @identificador OR nombre = @identificador) AND is_deleted = 0');

        if (resultAjustador.recordset.length > 0) {
            user = resultAjustador.recordset[0];
            tipoUsuario = 'Ajustador';
        } else {
            // 2. Si no es ajustador, buscar en CLIENTES
            const resultCliente = await pool.request()
                .input('email', sql.NVarChar, identificador)
                .query('SELECT * FROM clientes WHERE email_cifrado = @email AND is_deleted = 0');

            if (resultCliente.recordset.length > 0) {
                user = resultCliente.recordset[0];
                tipoUsuario = 'Cliente';
            }
        }

        // 3. Verificación de contraseña con el hash almacenado
        if (user && await bcrypt.compare(password, user.password_hash)) {
            
            // Definir IDs y nombres según la tabla (evita errores de undefined)
            const userId = user.id_ajustador || user.id_cliente;
            const userName = user.nombre || user.nombre_cifrado;
            const userRol = user.rol || 'Cliente';

            const token = jwt.sign(
                { id: userId, rol: userRol, tipo: tipoUsuario }, 
                process.env.JWT_SECRET, 
                { expiresIn: '4h' }
            );

            // Registro en logs_forenses
            await registrarEvento({
                usuarioId: userId,
                accion: `Inicio de Sesión - ${tipoUsuario}`,
                resultado: 'exito',
                ip: ip,
                detalles: null // No hay error que reportar
            });

            res.json({ 
                success: true,
                token, 
                user: { 
                    id: userId,
                    nombre: userName, 
                    rol: userRol,
                    tipo: tipoUsuario
                } 
            });
        } else {
            // Registro de intento fallido en logs_forenses
            await registrarEvento({ 
                usuarioId: null,
                accion: 'Intento Login Fallido', 
                resultado: 'error', 
                ip: ip, 
                detalles: `Credenciales inválidas para: ${identificador}` 
            });
            res.status(401).json({ message: "Acceso denegado: Credenciales incorrectas" });
        }
    } catch (error) {
        console.error("Error crítico en login:", error);
        res.status(500).json({ message: "Error interno en el servidor ShieldLens" });
    }
};
export const registrar = async (req, res) => {
    const { nombre, email, telefono, password } = req.body;

    try {
        // Encriptación de seguridad
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        let pool = await sql.connect(sqlConfig);
        
        // Inserción en la tabla clientes
        await pool.request()
            .input('nom', sql.NVarChar, nombre) // Se guardará en nombre_cifrado
            .input('mail', sql.NVarChar, email)  // Se guardará en email_cifrado
            .input('tel', sql.VarChar, telefono)
            .input('pass', sql.NVarChar, hashedPassword)
            .query(`INSERT INTO clientes (nombre_cifrado, email_cifrado, telefono, password_hash, is_deleted) 
                    VALUES (@nom, @mail, @tel, @pass, 0)`);

        res.status(201).json({ message: "Cliente registrado con éxito" });
    } catch (error) {
        console.error("Error en registro de cliente:", error);
        res.status(500).json({ message: "Error al conectar con el servidor en el puerto 5000" }); // Mensaje consistente con tu alerta
    }
};

// Obtener logs de auditoría forense
export const getLogs = async (req, res) => {
    try {
        let pool = await sql.connect(sqlConfig);
        
        // Consultamos los últimos 50 logs para no saturar la red, 
        // ordenados por la fecha más reciente
        const result = await pool.request()
            .query(`
                SELECT TOP 50 
                    id_log, 
                    usuario_ejecuta, 
                    fecha_hora_utc, 
                    accion_realizada, 
                    resultado, 
                    ip_origen AS ip_origin, -- Alias para que coincida con tu interfaz de React
                    modulo_responsable 
                FROM logs_forenses 
                ORDER BY fecha_hora_utc DESC
            `);

        res.json(result.recordset);
    } catch (err) {
        console.error("Error al obtener logs forenses:", err);
        res.status(500).json({ message: "Error interno del servidor al recuperar auditoría" });
    }
};