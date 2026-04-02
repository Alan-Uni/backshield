import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { poolPromise } from './db.js';
import { registrarLog } from './logger.js'; // Tu función de logging forense

export const login = async (req, res) => {
    const { email, password } = req.body;
    const ip = req.ip;

    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('email', email)
            .query('SELECT * FROM ajustadores WHERE email = @email AND is_deleted = 0');

        const user = result.recordset[0];

        if (user && await bcrypt.compare(password, user.password_hash)) {
            // Acción Crítica: Inicio de sesión exitoso [cite: 121]
            const token = jwt.sign(
                { id: user.id_ajustador, role: user.rol }, 
                process.env.JWT_SECRET, 
                { expiresIn: '2h' }
            );

            await registrarLog(user.id_ajustador, 'Login', 'éxito', ip);
            res.json({ token, user: { nombre: user.nombre, rol: user.rol } });
        } else {
            // Manejo correcto de excepciones: Evento de seguridad [cite: 85, 92]
            await registrarLog(null, 'Intento de Login Fallido', 'error', ip);
            res.status(401).json({ message: "Credenciales inválidas" });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error interno del servidor" });
    }
};