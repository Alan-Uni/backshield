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
    const adminId = req.usuario?.id || null; // ID del admin que crea al ajustador
    const ip = req.ip || req.headers['x-forwarded-for'] || '0.0.0.0';
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
        
        await registrarEvento({
            usuarioId: adminId, // Si esto llega undefined, el log fallará
            accion: 'Registro de Cliente',
            resultado: 'exito',
            ip: ip,
            detalles: `Cliente registrado: ${email}`
        });
        res.status(201).json({ message: "Cliente registrado con éxito" });
    } catch (error) {
        await registrarEvento({
            usuarioId: adminId,
            accion: 'Registro de Cliente',
            resultado: 'error',
            ip: ip,
            detalles: `Error al registrar cliente: ${error.message}`
        });
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

export const obtenerPerfilCliente = async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('id_cliente', sql.UniqueIdentifier, req.usuario.id)
            .query(`
                SELECT TOP 1 
                    c.nombre_cifrado as nombre,
                    p.id_poliza,
                    p.tipo_seguro as [plan], -- Se agregan corchetes aquí
                    p.monto_cobertura
                FROM clientes c
                INNER JOIN polizas p ON c.id_cliente = p.id_cliente
                WHERE c.id_cliente = @id_cliente AND c.is_deleted = 0
            `);

        if (result.recordset.length > 0) {
            res.json({ success: true, data: result.recordset[0] });
        } else {
            // Fallback si no tiene póliza
            const soloNombre = await pool.request()
                .input('id', sql.UniqueIdentifier, req.usuario.id)
                .query('SELECT nombre_cifrado as nombre FROM clientes WHERE id_cliente = @id');
            
            if(soloNombre.recordset.length > 0) {
                return res.json({ 
                    success: true, 
                    data: { 
                        nombre: soloNombre.recordset[0].nombre, 
                        id_poliza: 'PENDIENTE', 
                        plan: 'S/N', 
                        monto_cobertura: 0 
                    } 
                });
            }
            res.status(404).json({ success: false, msg: "Perfil no encontrado" });
        }
    } catch (error) {
        console.error("❌ Error en obtenerPerfilCliente:", error.message);
        res.status(500).json({ success: false, msg: "Error de servidor" });
    }
};

// controladores/polizaController.js o similar
export const asignarPoliza = async (req, res) => {
    const { id_cliente, tipo_seguro} = req.body;
    const adminId = req.usuario?.id || null;
    const ip = req.ip || req.headers['x-forwarded-for'] || '0.0.0.0';

    try {
        const montosConfig = {
            'Premium': 50000,
            'Seguro de Auto Premium': 50000, // Por si acaso recibes el nombre largo
            'Cobertura Amplia': 75000,
            'Seguro de Auto Cobertura Amplia': 75000,
            'Deluxe': 100000,
            'Seguro de Auto Deluxe': 100000
        };

        // Asignamos el monto basado en el tipo o 0 si no existe
        const montoCalculado = montosConfig[tipo_seguro] || 0;

        if (montoCalculado === 0) {
            return res.status(400).json({ message: "Tipo de póliza no válido" });
        }


        let pool = await sql.connect(sqlConfig);
        
        // Inserción en la tabla polizas
        await pool.request()
            .input('idCliente', sql.UniqueIdentifier, id_cliente)
            .input('tipo', sql.VarChar(50), tipo_seguro)
            .input('monto', sql.Decimal(18, 2), montoCalculado) // Usamos el monto calculado
            .query(`
                INSERT INTO polizas (id_poliza, id_cliente, tipo_seguro, monto_cobertura, is_deleted)
                VALUES (NEWID(), @idCliente, @tipo, @monto, 0)
            `);

        // Registro en Auditoría Forense
        await registrarEvento({
            usuarioId: adminId,
            accion: 'Asignación de Póliza',
            resultado: 'exito',
            ip: ip,
            detalles: `Póliza asignada al cliente ${id_cliente}`
        });

        res.json({ success: true, message: "Póliza asignada correctamente" });
    } catch (error) {
        console.error("Error al asignar póliza:", error);
        res.status(500).json({ message: "Error al procesar la póliza" });
    }
};