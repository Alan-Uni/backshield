import jwt from 'jsonwebtoken';
import 'dotenv/config';

export const verificarToken = (req, res, next) => {
    // IMPORTANTE: El nombre del header debe ser minúsculas o tal cual lo mandas
    const token = req.header('x-auth-token'); 

    if (!token) {
        return res.status(401).json({ 
            success: false, 
            msg: "Se requiere un token para la autenticación" // Aquí sale tu error
        });
    }

    try {
        const cifrado = jwt.verify(token, process.env.JWT_SECRET);
        req.usuario = cifrado.usuario;
        next();
    } catch (error) {
        res.status(401).json({ success: false, msg: 'Token no válido' });
    }
};

// Requerimiento Forense: Control de acceso por roles
export const esAuditor = (req, res, next) => {
    if (req.user.rol !== 'Auditor') {
        return res.status(403).json({ message: "Acceso denegado: Se requieren permisos de Auditor" });
    }
    next();
};