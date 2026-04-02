import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { poolPromise } from '../config/db.js';
import { registrarEvento } from '../config/logger.js';

export const login = async (req, res) => {
    const { email, password } = req.body;
    const ip = req.ip;

    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('email', email)
            .query('SELECT * FROM ajustadores WHERE email = @email AND is_deleted = 0');

        const user = result.recordset[0];

        // Verificación con hash de contraseña 
        if (user && await bcrypt.compare(password, user.password_hash)) {
            const token = jwt.sign(
                { id: user.id_ajustador, rol: user.rol }, 
                process.env.JWT_SECRET, 
                { expiresIn: '4h' }
            );

            await registrarEvento({
                usuarioId: user.id_ajustador,
                accion: 'Inicio de Sesión',
                resultado: 'éxito',
                ip
            });

            res.json({ token, user: { nombre: user.nombre, rol: user.rol } });
        } else {
            await registrarEvento({ accion: 'Intento Login Fallido', resultado: 'error', ip, detalles: `Email: ${email}` });
            res.status(401).json({ message: "Acceso denegado" });
        }
    } catch (error) {
        // Manejo correcto de excepciones [cite: 85, 88]
        res.status(500).json({ message: "Error en el servidor central" });
    }
};